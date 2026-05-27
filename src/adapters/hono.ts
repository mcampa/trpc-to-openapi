import type { FetchCreateContextFnOptions, FetchCreateContextFn } from '@trpc/server/adapters/fetch';
import type { Context } from 'hono';

import { OpenApiRouter } from '../types';
import {
  CreateOpenApiFetchHandlerOptions,
  createOpenApiFetchHandler,
} from './fetch';

export type CreateOpenApiHonoHandlerOptions<TRouter extends OpenApiRouter> = Omit<
  CreateOpenApiFetchHandlerOptions<TRouter>,
  'req' | 'endpoint' | 'createContext'
> & {
  endpoint?: `/${string}`;
  createContext?: (
    opts: FetchCreateContextFnOptions,
    c: Context,
  ) => ReturnType<FetchCreateContextFn<TRouter>>;
};

export const createOpenApiHonoHandler = <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiHonoHandlerOptions<TRouter>,
) => {
  const { createContext, endpoint, ...rest } = opts;

  return (c: Context): Promise<Response> =>
    createOpenApiFetchHandler({
      ...rest,
      req: c.req.raw,
      endpoint: endpoint ?? '/',
      createContext: createContext
        ? (fetchOpts) => createContext(fetchOpts, c)
        : undefined,
    } as CreateOpenApiFetchHandlerOptions<TRouter>);
};
