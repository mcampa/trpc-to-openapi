import { AnyRouter } from '@trpc/server';
import { FastifyInstance } from 'fastify';
import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions } from './node-http';
export type CreateOpenApiFastifyPluginOptions<TRouter extends OpenApiRouter> = CreateOpenApiNodeHttpHandlerOptions<TRouter, any, any> & {
    basePath?: `/${string}`;
};
export declare function fastifyTRPCOpenApiPlugin<TRouter extends AnyRouter>(fastify: FastifyInstance, opts: CreateOpenApiFastifyPluginOptions<TRouter>, done: (err?: Error) => void): void;
//# sourceMappingURL=fastify.d.ts.map