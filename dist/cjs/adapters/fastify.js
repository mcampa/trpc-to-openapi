"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastifyTRPCOpenApiPlugin = fastifyTRPCOpenApiPlugin;
const node_http_1 = require("./node-http");
function fastifyTRPCOpenApiPlugin(fastify, opts, done) {
    var _a;
    let prefix = (_a = opts.basePath) !== null && _a !== void 0 ? _a : '';
    // if prefix ends with a slash, remove it
    if (prefix.endsWith('/')) {
        prefix = prefix.slice(0, -1);
    }
    const openApiHttpHandler = (0, node_http_1.createOpenApiNodeHttpHandler)(opts);
    fastify.all(`${prefix}/*`, async (request, reply) => {
        const prefixRemovedFromUrl = request.url.replace(fastify.prefix, '').replace(prefix, '');
        request.raw.url = prefixRemovedFromUrl;
        return await openApiHttpHandler(request, reply.raw);
    });
    done();
}
//# sourceMappingURL=fastify.js.map