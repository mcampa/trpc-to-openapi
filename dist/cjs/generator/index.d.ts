import { ZodOpenApiObject, ZodOpenApiPathsObject } from 'zod-openapi';
import { type OpenAPIObject, OpenApiRouter, type SecuritySchemeObject } from '../types';
export interface GenerateOpenApiDocumentOptions {
    title: string;
    description?: string;
    version: string;
    openApiVersion?: ZodOpenApiObject['openapi'];
    baseUrl: string;
    docsUrl?: string;
    tags?: string[];
    securitySchemes?: Record<string, SecuritySchemeObject>;
    paths?: ZodOpenApiPathsObject;
}
export declare const generateOpenApiDocument: (appRouter: OpenApiRouter, opts: GenerateOpenApiDocumentOptions) => OpenAPIObject;
//# sourceMappingURL=index.d.ts.map