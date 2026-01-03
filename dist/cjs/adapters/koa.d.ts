import { ParameterizedContext, Middleware } from 'koa';
import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions } from './node-http';
type Request = ParameterizedContext['req'];
type Response = ParameterizedContext['res'];
export type CreateOpenApiKoaMiddlewareOptions<TRouter extends OpenApiRouter> = CreateOpenApiNodeHttpHandlerOptions<TRouter, Request, Response>;
export declare const createOpenApiKoaMiddleware: <TRouter extends OpenApiRouter>(opts: CreateOpenApiKoaMiddlewareOptions<TRouter>) => Middleware;
export {};
//# sourceMappingURL=koa.d.ts.map