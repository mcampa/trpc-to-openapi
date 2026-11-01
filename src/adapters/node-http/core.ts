import { type HTTPHeaders } from '@trpc/client';
import { TRPCError, type inferRouterContext } from '@trpc/server';
import { type NodeHTTPResponse } from '@trpc/server/adapters/node-http';
import type { CreateDocumentOptions } from 'zod-openapi';
import {
  getErrorShape,
  TRPCRequestInfo,
  type MaybePromise,
  type ProcedureType,
} from '@trpc/server/unstable-core-do-not-import';
import type { ZodError } from 'zod/v4';
import { OpenApiHTTPRequest } from '../../types';
import { generateOpenApiDocument } from '../../generator';
import {
  OpenApiErrorResponse,
  OpenApiMethod,
  OpenApiResponse,
  OpenApiRouter,
  OpenApiSuccessResponse,
} from '../../types';
import {
  acceptsRequestBody,
  normalizePath,
  getInputOutputParsers,
  coerceInput,
  unwrapZodInputSide,
  instanceofZodTypeKind,
  instanceofZodTypeLikeVoid,
  instanceofZodTypeObject,
  instanceofZodTypeOptional,
  unwrapZodType,
  zodSupportsCoerce,
  getContentType,
  getRequestSignal,
  isJsonMediaType,
  createNullPrototypeRecord,
  sanitizeInput,
} from '../../utils';
import { TRPC_ERROR_CODE_HTTP_STATUS, getErrorFromUnknown } from './errors';
import { getBody, getQuery } from './input';
import { createProcedureCache, type ProcedureCacheEntry } from './procedures';

export interface OpenApiResponseMeta {
  status?: number;
  headers?: HTTPHeaders | Headers;
}

/**
 * The metadata callback receives the procedure result itself, matching the
 * data the adapter serializes, rather than tRPC's wrapped response envelope.
 */
export type OpenApiResponseMetaFn<TRouter extends OpenApiRouter> = (opts: {
  type: ProcedureType | 'unknown';
  paths: readonly string[] | undefined;
  ctx: inferRouterContext<TRouter> | undefined;
  data: unknown[];
  errors: TRPCError[];
  info: TRPCRequestInfo | undefined;
  eagerGeneration: boolean;
}) => OpenApiResponseMeta;

export type OpenApiCreateContextFn<TRouter extends OpenApiRouter, TRequest, TResponse> = (opts: {
  req: TRequest;
  res: TResponse;
  info: TRPCRequestInfo;
}) => MaybePromise<inferRouterContext<TRouter>>;

export type OpenApiErrorHandler<TRouter extends OpenApiRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: inferRouterContext<TRouter> | undefined;
  req: TRequest;
}) => void;

export interface CreateOpenApiNodeHttpHandlerOptions<
  TRouter extends OpenApiRouter,
  TRequest extends OpenApiHTTPRequest,
  TResponse extends NodeHTTPResponse,
> {
  router: TRouter;
  createContext?: OpenApiCreateContextFn<TRouter, TRequest, TResponse>;
  responseMeta?: OpenApiResponseMetaFn<TRouter>;
  onError?: OpenApiErrorHandler<TRouter, TRequest>;
  maxBodySize?: number;
  /**
   * Options forwarded to the non-production document validation, such as
   * `override` for custom scalar schemas.
   */
  options?: CreateDocumentOptions;
}

export type OpenApiNextFunction = () => void;

const jsonStringify = (body: unknown): string => {
  try {
    // Fast path: most responses contain no bigint, so avoid the replacer cost.
    // Note that `JSON.stringify(undefined)` returns undefined at runtime,
    // which `res.end(undefined)` treats as a bodyless response.
    return JSON.stringify(body);
  } catch (cause) {
    if (!(cause instanceof TypeError)) {
      throw cause;
    }
    // `JSON.stringify` throws a TypeError for a bigint. Serialize those as
    // decimal strings.
    return JSON.stringify(body, (_key: string, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  }
};

const OPEN_API_METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

const isOpenApiMethod = (method: string): method is OpenApiMethod => OPEN_API_METHODS.has(method);

/** Matches `ZodError` across separate zod installs (the parser is a peer). */
const isZodError = (cause: unknown): cause is ZodError =>
  cause instanceof Error && cause.name === 'ZodError';

type CallerProcedure = (input: unknown) => unknown;

/**
 * Resolves a dotted procedure path on tRPC's caller proxy. The proxy type is a
 * deeply nested record that cannot be indexed by a runtime path, so walk it
 * with validation and return a callable that forwards the input.
 */
const getCallerProcedure = (caller: unknown, path: string): CallerProcedure => {
  let current: unknown = caller;

  for (const segment of path.split('.')) {
    // tRPC's caller is a chain of callable proxies, so intermediate values are
    // functions as well as objects.
    if ((typeof current !== 'object' && typeof current !== 'function') || current === null) {
      throw new TRPCError({
        message: `Procedure "${path}" not found`,
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
    current = Reflect.get(current, segment);
  }

  if (typeof current !== 'function') {
    throw new TRPCError({
      message: `Procedure "${path}" not found`,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  const procedureFn = current;
  return (input: unknown): unknown => {
    const result: unknown = Reflect.apply(procedureFn, undefined, [input]);
    return result;
  };
};

export const createOpenApiNodeHttpHandler = <
  TRouter extends OpenApiRouter,
  TRequest extends OpenApiHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(
  opts: CreateOpenApiNodeHttpHandlerOptions<TRouter, TRequest, TResponse>,
) => {
  const router = Object.assign({}, opts.router);

  // Validate router
  if (process.env.NODE_ENV !== 'production') {
    generateOpenApiDocument(router, {
      title: '',
      version: '',
      baseUrl: '',
      options: opts.options,
    });
  }

  const { createContext, responseMeta, onError, maxBodySize } = opts;
  // The cache is memoized on the original router so creating a handler per
  // request (as the fetch adapter does) does not rebuild it.
  const getProcedure = createProcedureCache(opts.router);

  return async (req: TRequest, res: TResponse, next?: OpenApiNextFunction) => {
    const sendResponse = (
      statusCode: number,
      headers: HTTPHeaders | Headers,
      body: OpenApiResponse,
    ) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      if (headers instanceof Headers) {
        // `Object.entries(new Headers(...))` is empty, so iterate `Headers` with `forEach`.
        headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
      } else {
        // In this branch `headers` is tRPC's plain header record.
        const headerRecord = headers as Record<string, string | string[] | undefined>;
        for (const [key, value] of Object.entries(headerRecord)) {
          if (typeof value !== 'undefined') {
            res.setHeader(key, value);
          }
        }
      }
      res.end(jsonStringify(body));
    };

    const rawMethod = req.method;
    const method: OpenApiMethod | 'HEAD' | undefined =
      rawMethod === 'HEAD'
        ? 'HEAD'
        : rawMethod !== undefined && isOpenApiMethod(rawMethod)
          ? rawMethod
          : undefined;
    const reqUrl = req.url ?? '';
    const url = new URL(reqUrl.startsWith('/') ? `http://127.0.0.1${reqUrl}` : reqUrl);
    const path = normalizePath(url.pathname);
    let input: Record<string, unknown> | undefined = undefined;
    let ctx: inferRouterContext<TRouter> | undefined = undefined;
    let info: TRPCRequestInfo | undefined = undefined;
    let data: unknown = undefined;

    let procedure: ProcedureCacheEntry | undefined;

    try {
      const resolved = method ? getProcedure(method, path) : undefined;
      procedure = resolved?.procedure;
      const pathInput = resolved?.pathInput ?? {};

      if (!procedure || !method) {
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

      const contentType = getContentType(req);
      const useBody = acceptsRequestBody(method);

      if (useBody && !isJsonMediaType(contentType)) {
        throw new TRPCError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: contentType
            ? `Unsupported content-type "${contentType}`
            : 'Missing content-type header',
        });
      }

      const { inputParser } = getInputOutputParsers(procedure.procedure);
      if (!inputParser) {
        throw new TRPCError({
          message: 'Input parser expects a Zod validator',
          code: 'INTERNAL_SERVER_ERROR',
        });
      }
      const unwrappedSchema = unwrapZodType(inputParser, true);

      // input should stay undefined if z.void()
      if (!instanceofZodTypeLikeVoid(unwrappedSchema)) {
        const source = useBody ? await getBody(req, maxBodySize) : getQuery(req, url);
        // Merge into a null-prototype object so a "__proto__" key coming from
        // a pre-parsed body or query string stays an own property, then
        // sanitize into the normal-prototype object user code expects.
        const rawInput = createNullPrototypeRecord<unknown>();
        if (typeof source === 'object' && source !== null) {
          Object.assign(rawInput, source);
        }
        Object.assign(rawInput, pathInput);
        input = sanitizeInput(rawInput);
      }

      // if supported, coerce all string values to correct types
      let procedureInput: unknown = input;
      if (input && zodSupportsCoerce && instanceofZodTypeObject(unwrappedSchema)) {
        // The fields of the schema that first receives the input, which `coerceInput` reads too.
        const inputSide = unwrapZodInputSide(inputParser);
        const inputShape = instanceofZodTypeObject(inputSide)
          ? inputSide.shape
          : unwrappedSchema.shape;
        if (!useBody) {
          for (const [key, shape] of Object.entries(inputShape)) {
            let isArray = false;

            // Check if it's a direct array
            if (instanceofZodTypeKind(shape, 'array')) {
              isArray = true;
            }
            // Check if it's an optional array
            else if (instanceofZodTypeOptional(shape)) {
              if (instanceofZodTypeKind(shape._zod.def.innerType, 'array')) {
                isArray = true;
              }
            }

            if (
              isArray &&
              Object.prototype.hasOwnProperty.call(input, key) &&
              input[key] !== undefined &&
              !Array.isArray(input[key])
            ) {
              input[key] = [input[key]];
            }
          }
        }
        // A copy, so `onError` and the error shape still get the input before conversion.
        procedureInput = coerceInput(inputParser, input, useBody ? 'body' : 'query');
      }

      info = {
        isBatchCall: false,
        accept: null,
        calls: [],
        type: procedure.type,
        connectionParams: null,
        signal: getRequestSignal(req, res, maxBodySize),
        url,
      };

      ctx = await createContext?.({ req, res, info });
      const caller = router.createCaller(ctx);
      const procedureFn = getCallerProcedure(caller, procedure.path);

      data = await procedureFn(procedureInput);

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
      }) as { message?: string } & Record<string, unknown>;

      const zodError = isZodError(error.cause) ? error.cause : undefined;
      const isInputValidationError = error.code === 'BAD_REQUEST' && zodError !== undefined;

      const statusCode = meta?.status ?? TRPC_ERROR_CODE_HTTP_STATUS[error.code] ?? 500;
      const headers = meta?.headers ?? {};
      const body: OpenApiErrorResponse = {
        ...errorShape, // Pass the error through
        message: isInputValidationError
          ? 'Input validation failed'
          : (errorShape?.message ?? error.message ?? 'An error occurred'),
        code: error.code,
        issues: isInputValidationError ? zodError?.issues : undefined,
      };
      sendResponse(statusCode, headers, body);
    }
  };
};
