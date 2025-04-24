import { ZodOpenApiPathsObject } from 'zod-openapi';
import { OpenApiRouter } from '../types';
export declare enum HttpMethods {
    GET = "get",
    POST = "post",
    PATCH = "patch",
    PUT = "put",
    DELETE = "delete"
}
export declare const getOpenApiPathsObject: (appRouter: OpenApiRouter, securitySchemeNames: string[]) => ZodOpenApiPathsObject;
export declare const mergePaths: (x?: ZodOpenApiPathsObject, y?: ZodOpenApiPathsObject) => ZodOpenApiPathsObject | undefined;
//# sourceMappingURL=paths.d.ts.map