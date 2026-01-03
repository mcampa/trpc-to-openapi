import { createDocument } from 'zod-openapi';
import { getOpenApiPathsObject, mergePaths } from './paths.mjs';
export const generateOpenApiDocument = (appRouter, opts) => {
    const securitySchemes = opts.securitySchemes ?? {
        Authorization: {
            type: 'http',
            scheme: 'bearer',
        },
    };
    return createDocument({
        openapi: opts.openApiVersion ?? '3.1.0',
        info: {
            title: opts.title,
            description: opts.description,
            version: opts.version,
        },
        servers: [
            {
                url: opts.baseUrl,
            },
        ],
        paths: mergePaths(getOpenApiPathsObject(appRouter, Object.keys(securitySchemes), opts.filter), opts.paths),
        components: {
            securitySchemes,
            ...(opts.defs && { schemas: opts.defs }),
        },
        tags: opts.tags?.map((tag) => ({ name: tag })),
        externalDocs: opts.docsUrl ? { url: opts.docsUrl } : undefined,
    });
};
//# sourceMappingURL=index.js.map