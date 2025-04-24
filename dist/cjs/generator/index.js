"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOpenApiDocument = void 0;
const zod_openapi_1 = require("zod-openapi");
const paths_1 = require("./paths");
const generateOpenApiDocument = (appRouter, opts) => {
    var _a, _b, _c;
    const securitySchemes = (_a = opts.securitySchemes) !== null && _a !== void 0 ? _a : {
        Authorization: {
            type: 'http',
            scheme: 'bearer',
        },
    };
    return (0, zod_openapi_1.createDocument)({
        openapi: (_b = opts.openApiVersion) !== null && _b !== void 0 ? _b : '3.0.3',
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
        paths: (0, paths_1.mergePaths)((0, paths_1.getOpenApiPathsObject)(appRouter, Object.keys(securitySchemes)), opts.paths),
        components: {
            securitySchemes,
        },
        tags: (_c = opts.tags) === null || _c === void 0 ? void 0 : _c.map((tag) => ({ name: tag })),
        externalDocs: opts.docsUrl ? { url: opts.docsUrl } : undefined,
    });
};
exports.generateOpenApiDocument = generateOpenApiDocument;
//# sourceMappingURL=index.js.map