import { createOpenApiNodeHttpHandler } from './node-http/index.mjs';
export const createOpenApiExpressMiddleware = (opts) => {
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    return async (req, res) => {
        await openApiHttpHandler(req, res);
    };
};
//# sourceMappingURL=express.js.map