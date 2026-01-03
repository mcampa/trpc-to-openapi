import type { NodeIncomingMessage, NodeServerResponse } from 'h3';
import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions } from './node-http';
export type CreateOpenApiNuxtHandlerOptions<TRouter extends OpenApiRouter> = Omit<CreateOpenApiNodeHttpHandlerOptions<TRouter, NodeIncomingMessage, NodeServerResponse>, 'maxBodySize'>;
export declare const createOpenApiNuxtHandler: <TRouter extends OpenApiRouter>(opts: CreateOpenApiNuxtHandlerOptions<TRouter>) => import("h3").EventHandler<import("h3").EventHandlerRequest, Promise<void>>;
//# sourceMappingURL=nuxt.d.ts.map