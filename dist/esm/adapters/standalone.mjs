import { incomingMessageToRequest } from '@trpc/server/adapters/node-http';
import { createOpenApiNodeHttpHandler, } from './node-http/core.mjs';
export const createOpenApiHttpHandler = (opts) => {
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    return async (req, res) => {
        await openApiHttpHandler(incomingMessageToRequest(req, res, {
            maxBodySize: opts.maxBodySize ?? null,
        }), res);
    };
};
//# sourceMappingURL=standalone.js.map