import { type HTTPHeaders } from '@trpc/client';
import { TRPCError } from '@trpc/server';
import {
  type NodeHTTPHandlerOptions,
  type NodeHTTPResponse,
} from '@trpc/server/adapters/node-http';
import type { CreateDocumentOptions } from 'zod-openapi';
import { getErrorShape, TRPCRequestInfo } from '@trpc/server/unstable-core-do-not-import';
import { ZodArray } from 'zod/v4';
import type { ZodError } from 'zod/v4';
import { NodeHTTPRequest } from '../../types';
import { generateOpenApiDocument } from '../../generator';
import {
  OpenApiErrorResponse,
  OpenApiMethod,
  OpenApiProcedure,
  OpenApiResponse,
  OpenApiRouter,
  OpenApiSuccessResponse,
} from '../../types';
import {
  acceptsRequestBody,
  normalizePath,
  getInputOutputParsers,
  coerceInput,
  unwrapZodInputSide,
  instanceofZodTypeLikeVoid,
  instanceofZodTypeObject,
  instanceofZodTypeOptional,
  unwrapZodType,
  zodSupportsCoerce,
  getContentType,
  getRequestSignal,
  isJsonMediaType,
  sanitizeInput,
} from '../../utils';
import { TRPC_ERROR_CODE_HTTP_STATUS, getErrorFromUnknown } from './errors';
import { getBody, getQuery } from './input';
import { createProcedureCache, type ProcedureCacheEntry } from './procedures';

export type CreateOpenApiNodeHttpHandlerOptions<
  TRouter extends OpenApiRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = Pick<
  NodeHTTPHandlerOptions<TRouter, TRequest, TResponse>,
  'router' | 'createContext' | 'responseMeta' | 'onError' | 'maxBodySize'
> & {
  /**
   * Options forwarded to the non-production document validation, such as
   * `override` for custom scalar schemas.
   */
  options?: CreateDocumentOptions;
};

export type OpenApiNextFunction = () => void;

const jsonStringify = (body: unknown): string => {
  try {
    // Fast path: most responses contain no bigint, so avoid the replacer cost.
    // Note that `JSON.stringify(undefined)` returns undefined at runtime,
    // which `res.end(undefined)` treats as a bodyless response.
    return JSON.stringify(body);
  } catch (cause) {
    if (!(cause instanceof TypeError)) {
      throw cause;
    }
    // `JSON.stringify` throws a TypeError for a bigint. Serialize those as
    // decimal strings.
    return JSON.stringify(body, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  }
};

export const createOpenApiNodeHttpHandler = <
  TRouter extends OpenApiRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(
  opts: CreateOpenApiNodeHttpHandlerOptions<TRouter, TRequest, TResponse>,
) => {
  const router = Object.assign({}, opts.router);

  // Validate router
  if (process.env.NODE_ENV !== 'production') {
    generateOpenApiDocument(router, {
      title: '',
      version: '',
      baseUrl: '',
      options: opts.options,
    });
  }

  const { createContext, responseMeta, onError, maxBodySize } = opts;
  // The cache is memoized on the original router so creating a handler per
  // request (as the fetch adapter does) does not rebuild it.
  const getProcedure = createProcedureCache(opts.router);

  return async (req: TRequest, res: TResponse, next?: OpenApiNextFunction) => {
    const sendResponse = (
      statusCode: number,
      headers: HTTPHeaders | Headers,
      body: OpenApiResponse,
    ) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      if (headers instanceof Headers) {
        // `Object.entries(new Headers(...))` is empty, so iterate `Headers` with `forEach`.
        headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
      } else {
        for (const [key, value] of Object.entries(headers)) {
          if (typeof value !== 'undefined') {
            res.setHeader(key, value as string);
          }
        }
      }
      res.end(jsonStringify(body));
    };

    const method = req.method as OpenApiMethod | 'HEAD';
    const reqUrl = req.url!;
    const url = new URL(reqUrl.startsWith('/') ? `http://127.0.0.1${reqUrl}` : reqUrl);
    const path = normalizePath(url.pathname);
    let input: any = undefined;
    let ctx: any = undefined;
    let info: TRPCRequestInfo | undefined = undefined;
    let data: any = undefined;

    let procedure: ProcedureCacheEntry | undefined;

    try {
      const resolved = getProcedure(method, path);
      procedure = resolved?.procedure;
      const pathInput = resolved?.pathInput ?? {};

      if (!procedure) {
        if (next) {
          return next();
        }

        // Can be used for warmup
        if (method === 'HEAD') {
          sendResponse(204, {}, undefined);
          return;
        }

        throw new TRPCError({
          message: 'Not found',
          code: 'NOT_FOUND',
        });
      }

      const contentType = getContentType(req);
      const useBody = acceptsRequestBody(method);

      if (useBody && !isJsonMediaType(contentType)) {
        throw new TRPCError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: contentType
            ? `Unsupported content-type "${contentType}`
            : 'Missing content-type header',
        });
      }

      const { inputParser } = getInputOutputParsers(procedure.procedure);
      const unwrappedSchema = unwrapZodType(inputParser, true);

      // input should stay undefined if z.void()
      if (!instanceofZodTypeLikeVoid(unwrappedSchema)) {
        // Merge into a null-prototype object so a "__proto__" key coming from
        // a pre-parsed body or query string stays an own property, then
        // sanitize into the normal-prototype object user code expects.
        input = sanitizeInput(
          Object.assign(
            Object.create(null),
            useBody ? await getBody(req, maxBodySize) : getQuery(req, url),
            pathInput,
          ),
        );
      }

      // if supported, coerce all string values to correct types
      let procedureInput = input;
      if (zodSupportsCoerce && instanceofZodTypeObject(unwrappedSchema)) {
        // The fields of the schema that first receives the input, which `coerceInput` reads too.
        const inputSide = unwrapZodInputSide(inputParser);
        const inputShape = instanceofZodTypeObject(inputSide)
          ? inputSide.shape
          : unwrappedSchema.shape;
        if (!useBody) {
          for (const [key, shape] of Object.entries(inputShape)) {
            let isArray = false;

            // Check if it's a direct array
            if (shape instanceof ZodArray) {
              isArray = true;
            }
            // Check if it's an optional array
            else if (instanceofZodTypeOptional(shape)) {
              const innerType = (shape as any).unwrap();
              if (innerType instanceof ZodArray) {
                isArray = true;
              }
            }

            if (
              isArray &&
              Object.prototype.hasOwnProperty.call(input, key) &&
              input[key] !== undefined &&
              !Array.isArray(input[key])
            ) {
              input[key] = [input[key]];
            }
          }
        }
        // A copy, so `onError` and the error shape still get the input before conversion.
        procedureInput = coerceInput(inputParser, input, useBody ? 'body' : 'query');
      }

      info = {
        isBatchCall: false,
        accept: null,
        calls: [],
        type: procedure.type,
        connectionParams: null,
        signal: getRequestSignal(req, res, maxBodySize),
        url,
      };

      ctx = await createContext?.({ req, res, info });
      const caller = router.createCaller(ctx);

      const segments = procedure.path.split('.');
      const procedureFn = segments.reduce(
        (acc, curr) => acc[curr],
        caller as any,
      ) as OpenApiProcedure;

      data = await procedureFn(procedureInput);

      const meta = responseMeta?.({
        type: procedure.type,
        paths: [procedure.path],
        ctx,
        data: [data],
        errors: [],
        info,
        eagerGeneration: true,
      });

      const statusCode = meta?.status ?? 200;
      const headers = meta?.headers ?? {};
      const body: OpenApiSuccessResponse<typeof data> = data;
      sendResponse(statusCode, headers, body);
    } catch (cause) {
      const error = getErrorFromUnknown(cause);

      onError?.({
        error,
        type: procedure?.type ?? 'unknown',
        path: procedure?.path,
        input,
        ctx,
        req,
      });

      const meta = responseMeta?.({
        type: procedure?.type ?? 'unknown',
        paths: procedure?.path ? [procedure?.path] : undefined,
        ctx,
        data: [data],
        errors: [error],
        info,
        eagerGeneration: true,
      });

      const errorShape = getErrorShape({
        config: router._def._config,
        error,
        type: procedure?.type ?? 'unknown',
        path: procedure?.path,
        input,
        ctx,
      });

      const isInputValidationError =
        error.code === 'BAD_REQUEST' &&
        error.cause instanceof Error &&
        error.cause.name === 'ZodError';

      const statusCode = meta?.status ?? TRPC_ERROR_CODE_HTTP_STATUS[error.code] ?? 500;
      const headers = meta?.headers ?? {};
      const body: OpenApiErrorResponse = {
        ...errorShape, // Pass the error through
        message: isInputValidationError
          ? 'Input validation failed'
          : (errorShape?.message ?? error.message ?? 'An error occurred'),
        code: error.code,
        issues: isInputValidationError ? (error.cause as ZodError).issues : undefined,
      };
      sendResponse(statusCode, headers, body);
    }
  };
};
