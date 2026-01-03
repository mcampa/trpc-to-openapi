import { createOpenApiNodeHttpHandler } from './node-http/index.mjs';
export const createOpenApiKoaMiddleware = (opts) => {
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    return async (ctx, next) => {
        await openApiHttpHandler(ctx.req, ctx.res, next);
    };
};
//# sourceMappingURL=koa.js.map