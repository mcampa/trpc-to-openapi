"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenApiHttpHandler = void 0;
const node_http_1 = require("@trpc/server/adapters/node-http");
const core_1 = require("./node-http/core");
const createOpenApiHttpHandler = (opts) => {
    const openApiHttpHandler = (0, core_1.createOpenApiNodeHttpHandler)(opts);
    return async (req, res) => {
        var _a;
        await openApiHttpHandler((0, node_http_1.incomingMessageToRequest)(req, res, {
            maxBodySize: (_a = opts.maxBodySize) !== null && _a !== void 0 ? _a : null,
        }), res);
    };
};
exports.createOpenApiHttpHandler = createOpenApiHttpHandler;
//# sourceMappingURL=standalone.js.map