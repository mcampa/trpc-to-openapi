"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenApiKoaMiddleware = void 0;
const node_http_1 = require("./node-http");
const createOpenApiKoaMiddleware = (opts) => {
    const openApiHttpHandler = (0, node_http_1.createOpenApiNodeHttpHandler)(opts);
    return async (ctx, next) => {
        await openApiHttpHandler(ctx.req, ctx.res, next);
    };
};
exports.createOpenApiKoaMiddleware = createOpenApiKoaMiddleware;
//# sourceMappingURL=koa.js.map