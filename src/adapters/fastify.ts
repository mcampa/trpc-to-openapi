import { AnyRouter } from '@trpc/server';
import { FastifyInstance, FastifyReply } from 'fastify';
import type { ServerResponse } from 'http';
import type { Socket } from 'net';

import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions, createOpenApiNodeHttpHandler } from './node-http';

// Type for Fastify reply with Node.js response methods added
interface FastifyReplyWithNodeMethods extends FastifyReply {
  statusCode: number;
  setHeader: (key: string, value: string) => void;
  end: (data: string) => void;
  socket: Socket | null;
  connection: Socket | null;
  finished: boolean;
  headersSent: boolean;
  once: ServerResponse['once'];
  on: ServerResponse['on'];
  off: ServerResponse['off'];
  emit: ServerResponse['emit'];
  removeListener: ServerResponse['removeListener'];
}

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

      // Add Node.js response methods to Fastify reply
      const replyWithNodeMethods = reply as FastifyReplyWithNodeMethods;

      // Add statusCode property
      void Object.defineProperty(replyWithNodeMethods, 'statusCode', {
        set(value: number) {
          void reply.code(value);
        },
        get() {
          return reply.statusCode;
        },
        enumerable: true,
        configurable: true,
      });

      // Add setHeader method
      replyWithNodeMethods.setHeader = (key: string, value: string) => {
        void reply.header(key, value);
      };

      // Add end method
      replyWithNodeMethods.end = (data: string) => {
        void reply.send(data);
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

      return await openApiHttpHandler(request, replyWithNodeMethods);
    },
  });

  done();
}
