import { TRPCError } from '@trpc/server';
import { normalizePath } from '../utils/index.mjs';
import { createOpenApiNodeHttpHandler } from './node-http/index.mjs';
export const createOpenApiNextHandler = (opts) => {
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    return async (req, res) => {
        let pathname = null;
        if (typeof req.query.trpc === 'string') {
            pathname = req.query.trpc;
        }
        else if (Array.isArray(req.query.trpc)) {
            pathname = req.query.trpc.join('/');
        }
        if (pathname === null) {
            const error = new TRPCError({
                message: 'Query "trpc" not found - is the `trpc-to-openapi` file named `[...trpc].ts`?',
                code: 'INTERNAL_SERVER_ERROR',
            });
            opts.onError?.({
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
        req.url = normalizePath(pathname);
        await openApiHttpHandler(req, res);
    };
};
//# sourceMappingURL=next.js.map