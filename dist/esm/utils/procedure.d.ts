import { TRPCProcedureType } from '@trpc/server';
import { AnyZodObject } from 'zod';
import { OpenApiMeta, OpenApiProcedure, OpenApiProcedureRecord } from '../types';
export declare const getInputOutputParsers: (procedure: OpenApiProcedure) => {
    inputParser: AnyZodObject | undefined;
    outputParser: AnyZodObject | undefined;
};
export declare const forEachOpenApiProcedure: (procedureRecord: OpenApiProcedureRecord, callback: (values: {
    path: string;
    type: TRPCProcedureType;
    procedure: OpenApiProcedure;
    openapi: NonNullable<OpenApiMeta["openapi"]>;
}) => void) => void;
//# sourceMappingURL=procedure.d.ts.map