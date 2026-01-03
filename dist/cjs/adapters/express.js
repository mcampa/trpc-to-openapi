"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenApiExpressMiddleware = void 0;
const node_http_1 = require("./node-http");
const createOpenApiExpressMiddleware = (opts) => {
    const openApiHttpHandler = (0, node_http_1.createOpenApiNodeHttpHandler)(opts);
    return async (req, res) => {
        await openApiHttpHandler(req, res);
    };
};
exports.createOpenApiExpressMiddleware = createOpenApiExpressMiddleware;
//# sourceMappingURL=express.js.map