import { Request, Response } from 'express';
import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions } from './node-http';
export type CreateOpenApiExpressMiddlewareOptions<TRouter extends OpenApiRouter> = CreateOpenApiNodeHttpHandlerOptions<TRouter, Request, Response>;
export declare const createOpenApiExpressMiddleware: <TRouter extends OpenApiRouter>(opts: CreateOpenApiExpressMiddlewareOptions<TRouter>) => (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=express.d.ts.map