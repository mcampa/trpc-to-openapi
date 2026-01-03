import { TRPCError } from '@trpc/server';
import { ZodObject, z } from 'zod';
import { ZodOpenApiParameters, ZodOpenApiRequestBodyObject, ZodOpenApiResponseObject, ZodOpenApiResponsesObject } from 'zod-openapi';
import { OpenApiContentType } from '../types';
import { HttpMethods } from './paths';
export declare const getParameterObjects: (schema: z.ZodObject<z.ZodRawShape>, required: boolean, pathParameters: string[], headersSchema: ZodObject | undefined, inType: "all" | "path" | "query") => ZodOpenApiParameters | undefined;
export declare const getRequestBodyObject: (schema: z.ZodObject<z.ZodRawShape>, required: boolean, pathParameters: string[], contentTypes: OpenApiContentType[]) => ZodOpenApiRequestBodyObject | undefined;
export declare const hasInputs: (schema: unknown) => boolean;
export declare const errorResponseObject: (code?: TRPCError["code"], message?: string, issues?: {
    message: string;
}[]) => ZodOpenApiResponseObject;
export declare const errorResponseFromStatusCode: (status: number) => ZodOpenApiResponseObject;
export declare const errorResponseFromMessage: (status: number, message: string) => ZodOpenApiResponseObject;
export declare const getResponsesObject: (schema: ZodObject, httpMethod: HttpMethods, headers: ZodObject | undefined, isProtected: boolean, hasInputs: boolean, successDescription?: string, errorResponses?: number[] | Record<number, string>) => ZodOpenApiResponsesObject;
//# sourceMappingURL=schema.d.ts.map