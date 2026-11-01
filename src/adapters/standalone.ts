import { incomingMessageToRequest } from '@trpc/server/adapters/node-http';
import { IncomingMessage, ServerResponse } from 'http';

import { OpenApiRouter } from '../types';
import {
  CreateOpenApiNodeHttpHandlerOptions,
  createOpenApiNodeHttpHandler,
} from './node-http/core';

/**
 * Options for the standalone Node.js HTTP handler.
 *
 * Note: the `req` passed to `createContext` is a Fetch
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Request `Request`},
 * not an `IncomingMessage`. Read headers with
 * `req.headers.get('authorization')`; `req.headers.authorization` is
 * `undefined` at runtime.
 */
export type CreateOpenApiHttpHandlerOptions<TRouter extends OpenApiRouter> =
  CreateOpenApiNodeHttpHandlerOptions<TRouter, IncomingMessage, ServerResponse>;

export const createOpenApiHttpHandler = <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiHttpHandlerOptions<TRouter>,
) => {
  const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);
  return async (req: IncomingMessage, res: ServerResponse) => {
    await openApiHttpHandler(
      incomingMessageToRequest(req, res, {
        maxBodySize: opts.maxBodySize ?? null,
      }) as unknown as IncomingMessage,
      res,
    );
  };
};
