import { ParameterizedContext, Next, Middleware } from 'koa';
import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions, createOpenApiNodeHttpHandler } from './node-http';

type Request = ParameterizedContext['req'];
type Response = ParameterizedContext['res'];

export type CreateOpenApiKoaMiddlewareOptions<TRouter extends OpenApiRouter> =
  CreateOpenApiNodeHttpHandlerOptions<TRouter, Request, Response>;

export const createOpenApiKoaMiddleware = <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiKoaMiddlewareOptions<TRouter>,
): Middleware => {
  const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);

  return async (ctx: ParameterizedContext, next: Next) => {
    await openApiHttpHandler(ctx.req, ctx.res, next);
  };
};
