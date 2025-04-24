"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenApiNextHandler = void 0;
const server_1 = require("@trpc/server");
const utils_1 = require("../utils");
const node_http_1 = require("./node-http");
const createOpenApiNextHandler = (opts) => {
    const openApiHttpHandler = (0, node_http_1.createOpenApiNodeHttpHandler)(opts);
    return async (req, res) => {
        var _a;
        let pathname = null;
        if (typeof req.query.trpc === 'string') {
            pathname = req.query.trpc;
        }
        else if (Array.isArray(req.query.trpc)) {
            pathname = req.query.trpc.join('/');
        }
        if (pathname === null) {
            const error = new server_1.TRPCError({
                message: 'Query "trpc" not found - is the `trpc-to-openapi` file named `[...trpc].ts`?',
                code: 'INTERNAL_SERVER_ERROR',
            });
            (_a = opts.onError) === null || _a === void 0 ? void 0 : _a.call(opts, {
                error,
                type: 'unknown',
                path: undefined,
                input: undefined,
                ctx: undefined,
                req,
            });
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            const body = {
                message: error.message,
                code: error.code,
            };
            res.end(JSON.stringify(body));
            return;
        }
        if (!('once' in res)) {
            Object.assign(res, {
                once: () => undefined,
            });
        }
        req.url = (0, utils_1.normalizePath)(pathname);
        await openApiHttpHandler(req, res);
    };
};
exports.createOpenApiNextHandler = createOpenApiNextHandler;
//# sourceMappingURL=next.js.map