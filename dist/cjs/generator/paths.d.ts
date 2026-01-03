import { ZodOpenApiPathsObject } from 'zod-openapi';
import { OpenApiMeta, OpenApiRouter } from '../types';
export declare enum HttpMethods {
    GET = "get",
    POST = "post",
    PATCH = "patch",
    PUT = "put",
    DELETE = "delete"
}
export declare const getOpenApiPathsObject: <TMeta = Record<string, unknown>>(appRouter: OpenApiRouter, securitySchemeNames: string[], filter?: (ctx: {
    metadata: {
        openapi: NonNullable<OpenApiMeta["openapi"]>;
    } & TMeta;
}) => boolean) => ZodOpenApiPathsObject;
export declare const mergePaths: (x?: ZodOpenApiPathsObject, y?: ZodOpenApiPathsObject) => ZodOpenApiPathsObject | undefined;
//# sourceMappingURL=paths.d.ts.map