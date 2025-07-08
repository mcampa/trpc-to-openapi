import { AnyRouter } from '@trpc/server';
import { FastifyInstance } from 'fastify';

import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions, createOpenApiNodeHttpHandler } from './node-http';

export type CreateOpenApiFastifyPluginOptions<TRouter extends OpenApiRouter> =
  CreateOpenApiNodeHttpHandlerOptions<TRouter, any, any> & {
    basePath?: `/${string}`;
  };

export function fastifyTRPCOpenApiPlugin<TRouter extends AnyRouter>(
  fastify: FastifyInstance,
  opts: CreateOpenApiFastifyPluginOptions<TRouter>,
  done: (err?: Error) => void,
) {
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

      // assign the body already parsed by Fastify to raw request
      // this way, raw request can be properly passed to openApiHttpHandler
      // without breaking body parsing (because setEncoding will have already been called)
      Object.assign(request.raw, { body: request.body });

      // passing raw request (& reply) to openApiHttpHandler so they properly have
      // their native Node.js properties kept (e.g: req.off). this is not the case if
      // we pass the Fastify request directly
      return await openApiHttpHandler(request.raw, reply.raw);
    },
  });

  done();
}
