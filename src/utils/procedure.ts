import { TRPCProcedureType } from '@trpc/server';
import { ZodObject, z } from 'zod';

import { OpenApiMeta, OpenApiProcedure, OpenApiProcedureRecord } from '../types';

const mergeInputs = (inputParsers: ZodObject[]): ZodObject => {
  return inputParsers.reduce((acc, inputParser) => {
    return acc.merge(inputParser);
  }, z.object({}));
};

// `inputParser` & `outputParser` are private so this is a hack to access it
export const getInputOutputParsers = (
  procedure: OpenApiProcedure,
): {
  inputParser: ZodObject;
  outputParser: ZodObject | undefined;
  hasInputsDefined: boolean;
} => {
  // @ts-expect-error The types seems to be incorrect
  const inputs = procedure._def.inputs as ZodObject[];
  // @ts-expect-error The types seems to be incorrect
  const output = procedure._def.output as ZodObject | undefined;

  let inputParser: ZodObject;
  if (inputs.length >= 2) {
    inputParser = mergeInputs(inputs);
  } else if (inputs.length === 1) {
    inputParser = inputs[0]!;
  } else {
    inputParser = z.object({});
  }

  return {
    inputParser,
    outputParser: output,
    hasInputsDefined: inputs.length > 0,
  };
};

const getProcedureType = (procedure: OpenApiProcedure): TRPCProcedureType => {
  if (!procedure._def.type) {
    throw new Error('Unknown procedure type');
  }
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
  for (const [path, procedure] of Object.entries(procedureRecord)) {
    // @ts-expect-error FIXME
    const meta = procedure._def.meta as unknown as OpenApiMeta | undefined;
    if (meta?.openapi && meta.openapi.enabled !== false) {
      const type = getProcedureType(procedure as OpenApiProcedure);

      callback({
        path,
        type,
        procedure: procedure as OpenApiProcedure,
        meta: {
          openapi: meta.openapi,
          ...(meta as TMeta),
        },
      });
    }
  }
};
