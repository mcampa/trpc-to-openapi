import { TRPCProcedureType } from '@trpc/server';
import type { Parser } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod/v4';
import type { ZodObject, ZodType } from 'zod/v4';

import { OpenApiMeta, OpenApiProcedure, OpenApiProcedureRecord } from '../types';
import { instanceofZodType } from './zod';

const mergeInputs = (inputParsers: readonly ZodObject[]): ZodObject => {
  return inputParsers.reduce((acc, inputParser) => {
    return acc.merge(inputParser);
  }, z.object({}));
};

/**
 * tRPC's public `Procedure` type omits the parser fields that its builder
 * stores on `_def`. Declare the one field this library reads instead of
 * suppressing the type error.
 */
type OpenApiProcedureDef = OpenApiProcedure['_def'] & { output?: Parser };

/**
 * Routers built with zod store classic zod schemas here. tRPC's wider `Parser`
 * union also covers other validators; the callers validate the returned
 * schemas and report an error for unsupported parsers.
 */
const toZodType = (parser: Parser | undefined): ZodType | undefined => {
  return instanceofZodType(parser) ? parser : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A tRPC procedure is a function whose `_def` carries its type. */
const isOpenApiProcedure = (value: unknown): value is OpenApiProcedure => {
  if (typeof value !== 'function') {
    return false;
  }

  const def: unknown = Reflect.get(value, '_def');
  return isRecord(def) && def.procedure === true && typeof def.type === 'string';
};

// `inputParser` & `outputParser` are private so this is a hack to access it
export const getInputOutputParsers = (
  procedure: OpenApiProcedure,
): {
  inputParser: ZodType | undefined;
  outputParser: ZodType | undefined;
  hasInputsDefined: boolean;
} => {
  const def = procedure._def as OpenApiProcedureDef;
  const inputs = def.inputs;

  let inputParser: ZodType | undefined;
  if (inputs.length >= 2) {
    // Multiple `.input()` calls are merged, so every parser must be an object.
    const objectParsers = inputs.filter(
      (input): input is ZodObject => input instanceof z.ZodObject,
    );
    inputParser = objectParsers.length === inputs.length ? mergeInputs(objectParsers) : undefined;
  } else if (inputs.length === 1) {
    inputParser = toZodType(inputs[0]);
  } else {
    inputParser = z.object({});
  }

  return {
    inputParser,
    outputParser: toZodType(def.output),
    hasInputsDefined: inputs.length > 0,
  };
};

const getProcedureType = (procedure: OpenApiProcedure): TRPCProcedureType => {
  return procedure._def.type;
};

export const forEachOpenApiProcedure = <TMeta = Record<string, unknown>>(
  procedureRecord: OpenApiProcedureRecord,
  callback: (values: {
    path: string;
    type: TRPCProcedureType;
    procedure: OpenApiProcedure;
    meta: {
      openapi: NonNullable<OpenApiMeta['openapi']>;
    } & TMeta;
  }) => void,
) => {
  for (const [path, value] of Object.entries(procedureRecord)) {
    if (!isOpenApiProcedure(value)) {
      continue;
    }

    const meta = isRecord(value._def.meta) ? (value._def.meta as OpenApiMeta & TMeta) : undefined;
    if (meta?.openapi && meta.openapi.enabled !== false) {
      const type = getProcedureType(value);

      callback({
        path,
        type,
        procedure: value,
        meta: {
          ...meta,
          openapi: meta.openapi,
        },
      });
    }
  }
};
