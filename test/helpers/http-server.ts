import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { Server } from 'http';

import {
  CreateOpenApiHttpHandlerOptions,
  OpenApiRouter,
  createOpenApiHttpHandler,
} from '../../src';

export interface TestHttpServer {
  url: string;
  close: () => void;
}

/**
 * Starts a standalone Node server exposing the OpenAPI handler.
 *
 * Requests under `/trpc` are routed to the regular tRPC standalone handler so
 * adapter tests can also assert that the OpenAPI handler does not break the
 * router itself.
 */
export const createHttpServerWithRouter = <TRouter extends OpenApiRouter>(
  handlerOpts: CreateOpenApiHttpHandlerOptions<TRouter>,
): TestHttpServer => {
  const openApiHttpHandler = createOpenApiHttpHandler<TRouter>({
    router: handlerOpts.router,
    createContext: handlerOpts.createContext,
    responseMeta: handlerOpts.responseMeta,
    onError: handlerOpts.onError,
    maxBodySize: handlerOpts.maxBodySize,
    options: handlerOpts.options,
  } as any);
  const httpHandler = createHTTPHandler<TRouter>({
    router: handlerOpts.router,
    createContext: handlerOpts.createContext,
    responseMeta: handlerOpts.responseMeta,
    onError: handlerOpts.onError,
    maxBodySize: handlerOpts.maxBodySize,
  } as any);

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const server = new Server((req, res) => {
    if (req.url!.startsWith('/trpc')) {
      req.url = req.url!.replace('/trpc', '');
      return httpHandler(req, res);
    }
    return openApiHttpHandler(req, res);
  });

  server.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://localhost:${port}`,
    close: () => server.close(),
  };
};
