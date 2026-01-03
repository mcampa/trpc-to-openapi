import { createOpenApiNodeHttpHandler } from './node-http/index.mjs';
export function fastifyTRPCOpenApiPlugin(fastify, opts, done) {
    let prefix = opts.basePath ?? '';
    // if prefix ends with a slash, remove it
    if (prefix.endsWith('/')) {
        prefix = prefix.slice(0, -1);
    }
    const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
    fastify.route({
        method: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        url: `${prefix}/*`,
        handler: async (request, reply) => {
            const prefixRemovedFromUrl = request.url.replace(fastify.prefix, '').replace(prefix, '');
            request.raw.url = prefixRemovedFromUrl;
            // Add Node.js request methods to Fastify request
            const requestWithNodeMethods = request;
            // Add event emitter methods
            requestWithNodeMethods.once = request.raw.once.bind(request.raw);
            requestWithNodeMethods.on = request.raw.on.bind(request.raw);
            requestWithNodeMethods.off = request.raw.off.bind(request.raw);
            requestWithNodeMethods.destroy = request.raw.destroy.bind(request.raw);
            // Add Node.js response methods to Fastify reply
            const replyWithNodeMethods = reply;
            // Add statusCode property
            void Object.defineProperty(replyWithNodeMethods, 'statusCode', {
                set(value) {
                    void reply.code(value);
                },
                get() {
                    return reply.raw.statusCode;
                },
                enumerable: true,
                configurable: true,
            });
            // Add setHeader method
            replyWithNodeMethods.setHeader = (key, value) => {
                void reply.header(key, value);
            };
            // Add end method
            replyWithNodeMethods.end = (data) => {
                if (!reply.sent) {
                    void reply.send(data);
                }
            };
            // Add properties and methods needed by incomingMessageToRequest
            replyWithNodeMethods.socket = reply.raw.socket;
            replyWithNodeMethods.connection = reply.raw.connection;
            replyWithNodeMethods.finished = reply.raw.finished;
            replyWithNodeMethods.headersSent = reply.raw.headersSent;
            // Add event emitter methods
            replyWithNodeMethods.once = reply.raw.once.bind(reply.raw);
            replyWithNodeMethods.on = reply.raw.on.bind(reply.raw);
            replyWithNodeMethods.off = reply.raw.off.bind(reply.raw);
            replyWithNodeMethods.emit = reply.raw.emit.bind(reply.raw);
            replyWithNodeMethods.removeListener = reply.raw.removeListener.bind(reply.raw);
            return await openApiHttpHandler(requestWithNodeMethods, replyWithNodeMethods);
        },
    });
    done();
}
//# sourceMappingURL=fastify.js.map