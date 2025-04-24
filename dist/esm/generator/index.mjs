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
        openapi: opts.openApiVersion ?? '3.0.3',
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
        paths: mergePaths(getOpenApiPathsObject(appRouter, Object.keys(securitySchemes)), opts.paths),
        components: {
            securitySchemes,
        },
        tags: opts.tags?.map((tag) => ({ name: tag })),
        externalDocs: opts.docsUrl ? { url: opts.docsUrl } : undefined,
    });
};
//# sourceMappingURL=index.js.map