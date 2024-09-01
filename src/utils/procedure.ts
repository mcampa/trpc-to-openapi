import { TRPCProcedureType } from '@trpc/server';
import { AnyZodObject, z } from 'zod';

import { OpenApiMeta, OpenApiProcedure, OpenApiProcedureRecord } from '../types';

const mergeInputs = (inputParsers: AnyZodObject[]): AnyZodObject => {
  return inputParsers.reduce((acc, inputParser) => {
    return acc.merge(inputParser);
  }, z.object({}));
};

// `inputParser` & `outputParser` are private so this is a hack to access it
export const getInputOutputParsers = (
  procedure: OpenApiProcedure,
): {
  inputParser: AnyZodObject | undefined;
  outputParser: AnyZodObject | undefined;
} => {
  // @ts-expect-error The types seems to be incorrect
  const inputs = procedure._def.inputs as AnyZodObject[];
  // @ts-expect-error The types seems to be incorrect
  const output = procedure._def.output as AnyZodObject;

  return {
    inputParser: inputs.length >= 2 ? mergeInputs(inputs) : inputs[0],
    outputParser: output,
  };
};

const getProcedureType = (procedure: OpenApiProcedure): TRPCProcedureType => {
  if (!procedure._def.type) {
    throw new Error('Unknown procedure type');
  }
  return procedure._def.type;
};

export const forEachOpenApiProcedure = (
  procedureRecord: OpenApiProcedureRecord,
  callback: (values: {
    path: string;
    type: TRPCProcedureType;
    procedure: OpenApiProcedure;
    openapi: NonNullable<OpenApiMeta['openapi']>;
  }) => void,
) => {
  for (const [path, procedure] of Object.entries(procedureRecord)) {
    // @ts-expect-error FIXME
    const meta = procedure._def.meta as unknown as OpenApiMeta;
    const { openapi } = meta;
    if (openapi && openapi.enabled !== false) {
      const type = getProcedureType(procedure as OpenApiProcedure);
      callback({ path, type, procedure: procedure as OpenApiProcedure, openapi });
    }
  }
};
