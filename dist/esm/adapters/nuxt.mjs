import { TRPCError } from '@trpc/server';
import { defineEventHandler, getQuery } from 'h3';
import { normalizePath } from '../utils/index.mjs';
import { createOpenApiNodeHttpHandler } from './node-http/index.mjs';
export const createOpenApiNuxtHandler = (opts) => {
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    return defineEventHandler(async (event) => {
        let pathname = null;
        const params = event.context.params;
        if (params?.trpc) {
            if (!params.trpc.includes('/')) {
                pathname = params.trpc;
            }
            else {
                pathname = params.trpc;
            }
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
                req: event.node.req,
            });
            event.node.res.statusCode = 500;
            event.node.res.setHeader('Content-Type', 'application/json');
            const body = {
                message: error.message,
                code: error.code,
            };
            event.node.res.end(JSON.stringify(body));
            return;
        }
        event.node.req.query = getQuery(event);
        event.node.req.url = normalizePath(pathname);
        await openApiHttpHandler(event.node.req, event.node.res);
    });
};
//# sourceMappingURL=nuxt.js.map