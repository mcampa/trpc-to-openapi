import { TRPCError } from '@trpc/server';
import { NextApiRequest, NextApiResponse } from 'next';

import { OpenApiErrorResponse, OpenApiRouter } from '../types';
import { encodePathSegments, normalizePath } from '../utils';
import { CreateOpenApiNodeHttpHandlerOptions, createOpenApiNodeHttpHandler } from './node-http';

export type CreateOpenApiNextHandlerOptions<TRouter extends OpenApiRouter> =
  CreateOpenApiNodeHttpHandlerOptions<TRouter, NextApiRequest, NextApiResponse>;

export const createOpenApiNextHandler = <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiNextHandlerOptions<TRouter>,
) => {
  const openApiHttpHandler = createOpenApiNodeHttpHandler(opts);

  return async (req: NextApiRequest, res: NextApiResponse) => {
    let pathSegments: string[] | null = null;
    if (typeof req.query.trpc === 'string') {
      pathSegments = req.query.trpc.split('/');
    } else if (Array.isArray(req.query.trpc)) {
      pathSegments = req.query.trpc;
    }

    if (pathSegments === null) {
      const error = new TRPCError({
        message: 'Query "trpc" not found - is the `trpc-to-openapi` file named `[...trpc].ts`?',
        code: 'INTERNAL_SERVER_ERROR',
      });

      opts.onError?.({
        error,
        type: 'unknown',
        path: undefined,
        input: undefined,
        ctx: undefined,
        req,
      });

      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      const body: OpenApiErrorResponse = {
        message: error.message,
        code: error.code,
      };
      res.end(JSON.stringify(body));

      return;
    }

    if (!('once' in res)) {
      Object.assign(res, {
        once: () => undefined,
      });
    }

    // Next has already decoded each catch-all segment, so re-encode them and
    // let the shared handler decode exactly once.
    req.url = normalizePath(encodePathSegments(pathSegments));
    await openApiHttpHandler(req, res);
  };
};
