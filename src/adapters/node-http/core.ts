import { type HTTPHeaders } from '@trpc/client';
import { TRPCError } from '@trpc/server';
import {
  type NodeHTTPHandlerOptions,
  type NodeHTTPRequest,
  type NodeHTTPResponse,
  incomingMessageToRequest,
} from '@trpc/server/adapters/node-http';
import { getErrorShape, getRequestInfo } from '@trpc/server/unstable-core-do-not-import';
import cloneDeep from 'lodash.clonedeep';
import { ZodError, ZodTypeAny } from 'zod';

import { generateOpenApiDocument } from '../../generator';
import {
  OpenApiErrorResponse,
  OpenApiMethod,
  OpenApiProcedure,
  OpenApiResponse,
  OpenApiRouter,
  OpenApiSuccessResponse,
} from '../../types';
import { acceptsRequestBody } from '../../utils/method';
import { normalizePath } from '../../utils/path';
import { getInputOutputParsers } from '../../utils/procedure';
import {
  coerceSchema,
  instanceofZodTypeLikeVoid,
  instanceofZodTypeObject,
  unwrapZodType,
  zodSupportsCoerce,
} from '../../utils/zod';
import { TRPC_ERROR_CODE_HTTP_STATUS, getErrorFromUnknown } from './errors';
import { getBody, getQuery } from './input';
import { createProcedureCache } from './procedures';

export type CreateOpenApiNodeHttpHandlerOptions<
  TRouter extends OpenApiRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = Pick<
  NodeHTTPHandlerOptions<TRouter, TRequest, TResponse>,
  'router' | 'createContext' | 'responseMeta' | 'onError' | 'maxBodySize'
>;

export type OpenApiNextFunction = () => void;

export const createOpenApiNodeHttpHandler = <
  TRouter extends OpenApiRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(
  opts: CreateOpenApiNodeHttpHandlerOptions<TRouter, TRequest, TResponse>,
) => {
  const router = cloneDeep(opts.router);

  // Validate router
  if (process.env.NODE_ENV !== 'production') {
    generateOpenApiDocument(router, { title: '', version: '', baseUrl: '' });
  }

  const { createContext, responseMeta, onError, maxBodySize } = opts;
  const getProcedure = createProcedureCache(router);

  return async (req: TRequest, res: TResponse, next?: OpenApiNextFunction) => {
    const sendResponse = (statusCode: number, headers: HTTPHeaders, body: OpenApiResponse) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value !== 'undefined') {
          res.setHeader(key, value as string);
        }
      }
      res.end(JSON.stringify(body));
    };

    const method = req.method as OpenApiMethod | 'HEAD';
    const reqUrl = req.url!;
    const url = new URL(reqUrl.startsWith('/') ? `http://127.0.0.1${reqUrl}` : reqUrl);
    const path = normalizePath(url.pathname);
    let input: any = undefined;
    let ctx: any = undefined;
    let data: any = undefined;
    let info: any = undefined;

    const { procedure, pathInput } = getProcedure(method, path) ?? {};

    try {
      if (!procedure) {
        if (next) {
          return next();
        }

        // Can be used for warmup
        if (method === 'HEAD') {
          sendResponse(204, {}, undefined);
          return;
        }

        throw new TRPCError({
          message: 'Not found',
          code: 'NOT_FOUND',
        });
      }

      info = getRequestInfo({
        req:
          req instanceof Request
            ? req
            : incomingMessageToRequest(req, {
                maxBodySize: maxBodySize ?? null,
              }),
        path: decodeURIComponent(path),
        router,
        searchParams: url.searchParams,
        headers: req.headers as unknown as Headers,
      });

      const useBody = acceptsRequestBody(method);
      const inputParser = getInputOutputParsers(procedure.procedure).inputParser as ZodTypeAny;
      const unwrappedSchema = unwrapZodType(inputParser, true);

      // input should stay undefined if z.void()
      if (!instanceofZodTypeLikeVoid(unwrappedSchema)) {
        input = {
          ...(useBody ? await getBody(req, maxBodySize) : getQuery(req, url)),
          ...pathInput,
        };
      }

      // if supported, coerce all string values to correct types
      if (zodSupportsCoerce && instanceofZodTypeObject(unwrappedSchema)) {
        coerceSchema(unwrappedSchema);
      }

      ctx = await createContext?.({ req, res, info });
      const caller = router.createCaller(ctx);

      const segments = procedure.path.split('.');
      const procedureFn = segments.reduce(
        (acc, curr) => acc[curr],
        caller as any,
      ) as OpenApiProcedure;

      data = await procedureFn(input);

      const meta = responseMeta?.({
        type: procedure.type,
        paths: [procedure.path],
        ctx,
        data: [data],
        errors: [],
        info,
        eagerGeneration: true,
      });

      const statusCode = meta?.status ?? 200;
      const headers = meta?.headers ?? {};
      const body: OpenApiSuccessResponse<typeof data> = data;
      sendResponse(statusCode, headers, body);
    } catch (cause) {
      const error = getErrorFromUnknown(cause);

      onError?.({
        error,
        type: procedure?.type ?? 'unknown',
        path: procedure?.path,
        input,
        ctx,
        req,
      });

      const meta = responseMeta?.({
        type: procedure?.type ?? 'unknown',
        paths: procedure?.path ? [procedure?.path] : undefined,
        ctx,
        data: [data],
        errors: [error],
        info,
        eagerGeneration: true,
      });

      const errorShape = getErrorShape({
        config: router._def._config,
        error,
        type: procedure?.type ?? 'unknown',
        path: procedure?.path,
        input,
        ctx,
      });

      const isInputValidationError =
        error.code === 'BAD_REQUEST' &&
        error.cause instanceof Error &&
        error.cause.name === 'ZodError';

      const statusCode = meta?.status ?? TRPC_ERROR_CODE_HTTP_STATUS[error.code] ?? 500;
      const headers = meta?.headers ?? {};
      const body: OpenApiErrorResponse = {
        ...errorShape, // Pass the error through
        message: isInputValidationError
          ? 'Input validation failed'
          : (errorShape?.message ?? error.message ?? 'An error occurred'),
        code: error.code,
        issues: isInputValidationError ? (error.cause as ZodError).errors : undefined,
      };
      sendResponse(statusCode, headers, body);
    }
  };
};
