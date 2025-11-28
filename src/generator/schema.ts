import { TRPCError } from '@trpc/server';
import { ZodObject, ZodAny, z } from 'zod';
import type { $ZodType } from 'zod/v4/core';
import {
  ZodOpenApiContentObject,
  ZodOpenApiParameters,
  ZodOpenApiRequestBodyObject,
  ZodOpenApiResponseObject,
  ZodOpenApiResponsesObject,
} from 'zod-openapi';

import {
  HTTP_STATUS_TRPC_ERROR_CODE,
  TRPC_ERROR_CODE_HTTP_STATUS,
  TRPC_ERROR_CODE_MESSAGE,
} from '../adapters';
import { OpenApiContentType } from '../types';
import {
  instanceofZodType,
  instanceofZodTypeCoercible,
  instanceofZodTypeKind,
  instanceofZodTypeLikeString,
  instanceofZodTypeLikeVoid,
  instanceofZodTypeObject,
  instanceofZodTypeOptional,
  unwrapZodType,
  zodSupportsCoerce,
} from '../utils';
import { HttpMethods } from './paths';

/**
 * Flattens a nested Zod object schema into a flat structure with dot notation keys.
 * For example: { filters: { type: z.string() } } becomes { 'filters.type': z.string() }
 */
const flattenObjectSchema = (
  schema: $ZodType,
  prefix = '',
): Record<string, { schema: $ZodType; required: boolean }> => {
  const result: Record<string, { schema: $ZodType; required: boolean }> = {};

  let unwrappedSchema: $ZodType = schema;
  let isOptional = false;

  if (instanceofZodTypeOptional(unwrappedSchema)) {
    isOptional = true;
    unwrappedSchema = (unwrappedSchema as z.ZodOptional<$ZodType>).unwrap();
  }

  if (instanceofZodTypeKind(unwrappedSchema, 'default')) {
    isOptional = true;
    unwrappedSchema = (unwrappedSchema as z.ZodDefault<$ZodType>).unwrap();
  }

  if (instanceofZodTypeObject(unwrappedSchema)) {
    const objectSchema = unwrappedSchema;
    const shape = objectSchema.shape;

    for (const [key, value] of Object.entries(shape)) {
      const nestedPrefix = prefix ? `${prefix}.${key}` : key;
      const flattened = flattenObjectSchema(value as $ZodType, nestedPrefix);
      Object.assign(result, flattened);
    }

    if (isOptional && Object.keys(result).length === 0) {
      result[prefix] = { schema: unwrappedSchema, required: false };
    }
  } else {
    result[prefix] = { schema: unwrappedSchema, required: !isOptional };
  }

  return result;
};

export const getParameterObjects = (
  schema: z.ZodObject<z.ZodRawShape>,
  required: boolean,
  pathParameters: string[],
  headersSchema: ZodObject | undefined,
  inType: 'all' | 'path' | 'query',
): ZodOpenApiParameters | undefined => {
  const shape = schema.shape;
  const shapeKeys = Object.keys(shape);

  for (const pathParameter of pathParameters) {
    if (!shapeKeys.includes(pathParameter)) {
      throw new TRPCError({
        message: `Input parser expects key from path: "${pathParameter}"`,
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  }

  const { path, query } = shapeKeys
    .filter((shapeKey) => {
      const isPathParameter = pathParameters.includes(shapeKey);
      if (inType === 'path') {
        return isPathParameter;
      } else if (inType === 'query') {
        return !isPathParameter;
      }
      return true;
    })
    .flatMap((shapeKey) => {
      let shapeSchema = shape[shapeKey]!;
      const isShapeRequired = !(shapeSchema as z.ZodType).safeParse(undefined).success;
      const isPathParameter = pathParameters.includes(shapeKey);

      let unwrappedForCheck: $ZodType = shapeSchema as $ZodType;
      if (instanceofZodTypeOptional(unwrappedForCheck)) {
        unwrappedForCheck = (unwrappedForCheck as z.ZodOptional<$ZodType>).unwrap();
      }
      if (instanceofZodTypeKind(unwrappedForCheck, 'default')) {
        unwrappedForCheck = (unwrappedForCheck as z.ZodDefault<$ZodType>).unwrap();
      }

      if (instanceofZodTypeObject(unwrappedForCheck)) {
        const flattened = flattenObjectSchema(shapeSchema, shapeKey);
        return Object.entries(flattened).map(
          ([flatKey, { schema: flatSchema, required: flatRequired }]) => {
            let leafSchema: $ZodType = flatSchema;
            if (instanceofZodTypeOptional(leafSchema)) {
              leafSchema = (leafSchema as z.ZodOptional<$ZodType>).unwrap();
            }
            if (instanceofZodTypeKind(leafSchema, 'default')) {
              leafSchema = (leafSchema as z.ZodDefault<$ZodType>).unwrap();
            }

            if (!instanceofZodTypeLikeString(leafSchema)) {
              if (zodSupportsCoerce) {
                if (!instanceofZodTypeCoercible(leafSchema)) {
                  throw new TRPCError({
                    message: `Input parser key: "${flatKey}" must be ZodString, ZodNumber, ZodBoolean, ZodBigInt or ZodDate`,
                    code: 'INTERNAL_SERVER_ERROR',
                  });
                }
              } else {
                throw new TRPCError({
                  message: `Input parser key: "${flatKey}" must be ZodString`,
                  code: 'INTERNAL_SERVER_ERROR',
                });
              }
            }

            return {
              name: flatKey,
              paramType: isPathParameter ? 'path' : 'query',
              required: isPathParameter || (required && flatRequired),
              schema: flatSchema,
            };
          },
        );
      }

      if (!instanceofZodTypeLikeString(shapeSchema)) {
        if (zodSupportsCoerce) {
          if (!instanceofZodTypeCoercible(shapeSchema)) {
            throw new TRPCError({
              message: `Input parser key: "${shapeKey}" must be ZodString, ZodNumber, ZodBoolean, ZodBigInt or ZodDate`,
              code: 'INTERNAL_SERVER_ERROR',
            });
          }
        } else {
          throw new TRPCError({
            message: `Input parser key: "${shapeKey}" must be ZodString`,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }
      }

      if (instanceofZodTypeOptional(shapeSchema)) {
        if (isPathParameter) {
          throw new TRPCError({
            message: `Path parameter: "${shapeKey}" must not be optional`,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }
        shapeSchema = shapeSchema.unwrap();
      }

      return [
        {
          name: shapeKey,
          paramType: isPathParameter ? 'path' : 'query',
          required: isPathParameter || (required && isShapeRequired),
          schema: shapeSchema,
        },
      ];
    })
    .reduce(
      ({ path, query }, { name, paramType, schema, required }) => {
        if (paramType === 'path') {
          return {
            path: {
              ...path,
              [name]: (required ? schema : (schema as z.ZodType).optional()) as ZodAny,
            },
            query,
          };
        } else {
          return {
            path,
            query: {
              ...query,
              [name]: (required ? schema : (schema as z.ZodType).optional()) as ZodAny,
            },
          };
        }
      },
      { path: {} as Record<string, ZodAny>, query: {} as Record<string, ZodAny> },
    );

  let res: ZodOpenApiParameters = {};

  if (headersSchema) {
    res.header = headersSchema;
  }

  res = {
    ...res,
    path: z.object(path),
    query: z.object(query),
  };

  return res;
};

export const getRequestBodyObject = (
  schema: z.ZodObject<z.ZodRawShape>,
  required: boolean,
  pathParameters: string[],
  contentTypes: OpenApiContentType[],
): ZodOpenApiRequestBodyObject | undefined => {
  // remove path parameters
  const mask: Record<string, true> = {};
  pathParameters.forEach((pathParameter) => {
    mask[pathParameter] = true;
  });
  const o = schema.meta();
  const dedupedSchema = schema.omit(mask).meta({
    ...(o?.title ? { title: o?.title } : {}),
    ...(o?.description ? { description: o?.description } : {}),
    ...(o?.examples ? { examples: o?.examples } : {}),
  });
  // if all keys are path parameters
  if (pathParameters.length > 0 && Object.keys(dedupedSchema.shape).length === 0) {
    return undefined;
  }

  const content: ZodOpenApiContentObject = {};
  for (const contentType of contentTypes) {
    content[contentType] = {
      schema: dedupedSchema,
    };
  }
  return {
    required,
    content,
  };
};

export const hasInputs = (schema: unknown) =>
  instanceofZodType(schema) && !instanceofZodTypeLikeVoid(unwrapZodType(schema, true));

const errorResponseObjectByCode: Record<string, ZodOpenApiResponseObject> = {};

export const errorResponseObject = (
  code: TRPCError['code'] = 'INTERNAL_SERVER_ERROR',
  message?: string,
  issues?: { message: string }[],
): ZodOpenApiResponseObject => {
  if (!errorResponseObjectByCode[code]) {
    errorResponseObjectByCode[code] = {
      description: message ?? 'An error response',
      content: {
        'application/json': {
          schema: z
            .object({
              message: z.string().meta({
                description: 'The error message',
                example: message ?? 'Internal server error',
              }),
              code: z.string().meta({
                description: 'The error code',
                example: code ?? 'INTERNAL_SERVER_ERROR',
              }),
              issues: z
                .array(z.object({ message: z.string() }))
                .optional()
                .meta({
                  description: 'An array of issues that were responsible for the error',
                  example: issues ?? [],
                }),
            })
            .meta({
              title: `${message ?? 'Internal server'} error (${
                TRPC_ERROR_CODE_HTTP_STATUS[code] ?? 500
              })`,
              description: 'The error information',
              example: {
                code: code ?? 'INTERNAL_SERVER_ERROR',
                message: message ?? 'Internal server error',
                issues: issues ?? [],
              },
              id: `error.${code}`,
            }),
        },
      },
    };
  }
  return errorResponseObjectByCode[code];
};

export const errorResponseFromStatusCode = (status: number) => {
  const code = HTTP_STATUS_TRPC_ERROR_CODE[status];
  const message = code && TRPC_ERROR_CODE_MESSAGE[code];
  return errorResponseObject(code, message ?? 'Unknown error');
};

export const errorResponseFromMessage = (status: number, message: string) =>
  errorResponseObject(HTTP_STATUS_TRPC_ERROR_CODE[status], message);

export const getResponsesObject = (
  schema: ZodObject,
  httpMethod: HttpMethods,
  headers: ZodObject | undefined,
  isProtected: boolean,
  hasInputs: boolean,
  successDescription?: string,
  errorResponses?: number[] | Record<number, string>,
): ZodOpenApiResponsesObject => ({
  200: {
    description: successDescription ?? 'Successful response',
    headers: headers,
    content: {
      'application/json': {
        schema: instanceofZodTypeKind(schema, 'void')
          ? {}
          : instanceofZodTypeKind(schema, 'never') || instanceofZodTypeKind(schema, 'undefined')
            ? { not: {} }
            : schema,
      },
    },
  },
  ...(errorResponses !== undefined
    ? Object.fromEntries(
        Array.isArray(errorResponses)
          ? errorResponses.map((x) => [x, errorResponseFromStatusCode(x)])
          : Object.entries(errorResponses).map(([k, v]) => [
              k,
              errorResponseFromMessage(Number(k), v),
            ]),
      )
    : {
        ...(isProtected
          ? {
              401: errorResponseObject('UNAUTHORIZED', 'Authorization not provided'),
              403: errorResponseObject('FORBIDDEN', 'Insufficient access'),
            }
          : {}),
        ...(hasInputs
          ? {
              400: errorResponseObject('BAD_REQUEST', 'Invalid input data'),
              ...(httpMethod !== HttpMethods.POST
                ? {
                    404: errorResponseObject('NOT_FOUND', 'Not found'),
                  }
                : {}),
            }
          : {}),
        500: errorResponseObject('INTERNAL_SERVER_ERROR', 'Internal server error'),
      }),
});
