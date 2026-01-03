import { TRPCProcedureType } from '@trpc/server';
import { ZodObject } from 'zod';
import { OpenApiMeta, OpenApiProcedure, OpenApiProcedureRecord } from '../types';
export declare const getInputOutputParsers: (procedure: OpenApiProcedure) => {
    inputParser: ZodObject;
    outputParser: ZodObject | undefined;
    hasInputsDefined: boolean;
};
export declare const forEachOpenApiProcedure: <TMeta = Record<string, unknown>>(procedureRecord: OpenApiProcedureRecord, callback: (values: {
    path: string;
    type: TRPCProcedureType;
    procedure: OpenApiProcedure;
    meta: {
        openapi: NonNullable<OpenApiMeta["openapi"]>;
    } & TMeta;
}) => void) => void;
//# sourceMappingURL=procedure.d.ts.map