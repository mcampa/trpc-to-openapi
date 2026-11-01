import { incomingMessageToRequest } from '@trpc/server/adapters/node-http';
import { IncomingMessage, ServerResponse } from 'http';

import { OpenApiRouter } from '../types';
import {
  CreateOpenApiNodeHttpHandlerOptions,
  createOpenApiNodeHttpHandler,
} from './node-http/core';

export type CreateOpenApiHttpHandlerOptions<TRouter extends OpenApiRouter> =
  CreateOpenApiNodeHttpHandlerOptions<TRouter, Request, ServerResponse>;

export const createOpenApiHttpHandler = <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiHttpHandlerOptions<TRouter>,
) => {
  const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);

  return async (req: IncomingMessage, res: ServerResponse) => {
    await openApiHttpHandler(
      incomingMessageToRequest(req, res, {
        maxBodySize: opts.maxBodySize ?? null,
      }),
      res,
    );
  };
};
