import { createOpenApiNodeHttpHandler } from './node-http/index.mjs';
export function fastifyTRPCOpenApiPlugin(fastify, opts, done) {
    let prefix = opts.basePath ?? '';
    // if prefix ends with a slash, remove it
    if (prefix.endsWith('/')) {
        prefix = prefix.slice(0, -1);
    }
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    fastify.all(`${prefix}/*`, async (request, reply) => {
        const prefixRemovedFromUrl = request.url.replace(fastify.prefix, '').replace(prefix, '');
        request.raw.url = prefixRemovedFromUrl;
        return await openApiHttpHandler(request, reply.raw);
    });
    done();
}
//# sourceMappingURL=fastify.js.map