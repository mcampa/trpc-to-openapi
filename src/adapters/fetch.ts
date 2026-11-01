import { TRPCError } from '@trpc/server';
import { FetchHandlerOptions } from '@trpc/server/adapters/fetch';
import { ServerResponse } from 'http';
import type { CreateDocumentOptions } from 'zod-openapi';

import { OpenApiRouter } from '../types';
import { isJsonMediaType } from '../utils/method';
import { stripPathPrefix } from '../utils/path';
import { type OpenApiResponseMetaFn, createOpenApiNodeHttpHandler } from './node-http';
import { DEFAULT_MAX_BODY_SIZE, payloadTooLargeError } from './node-http/input';

export type CreateOpenApiFetchHandlerOptions<TRouter extends OpenApiRouter> = Omit<
  FetchHandlerOptions<TRouter>,
  'batching' | 'responseMeta'
> & {
  responseMeta?: OpenApiResponseMetaFn<TRouter>;
  req: Request;
  endpoint: `/${string}`;
  /**
   * Maximum request body size in bytes. Defaults to `DEFAULT_MAX_BODY_SIZE`
   * (100kb), which the node HTTP adapters use too.
   *
   * tRPC's `FetchHandlerOptions` does not expose this option, so the fetch
   * adapter declares and enforces it itself.
   */
  maxBodySize?: number;
  /**
   * Options forwarded to the non-production document validation, such as
   * `override` for custom scalar schemas.
   */
  options?: CreateDocumentOptions;
};

const cancelRequestBody = async (req: Request) => {
  try {
    // Release the unread stream instead of buffering the rest of the body.
    await req.body?.cancel();
  } catch {
    // The body may already be locked or consumed; there is nothing to release.
  }
};

type BodyReadResult = { ok: true; text: string } | { ok: false; cause: unknown };

const isPayloadTooLargeError = (cause: unknown): boolean =>
  cause instanceof TRPCError && cause.code === 'PAYLOAD_TOO_LARGE';

/**
 * `Headers` combines duplicate header values with commas, so parse every
 * declared value instead of relying on a single `Number()` conversion.
 */
const parseDeclaredLengths = (contentLength: string | null): number[] => {
  if (contentLength === null) {
    return [];
  }

  return contentLength.split(',').map((value) => Number(value.trim()));
};

const readBodyText = async (req: Request, maxBodySize: number): Promise<BodyReadResult> => {
  const declaredLengths = parseDeclaredLengths(req.headers.get('content-length'));

  // Reject before consuming the stream when any declared size is too large.
  // Invalid or conflicting values fall through to counting the actual bytes.
  if (declaredLengths.some((length) => Number.isFinite(length) && length > maxBodySize)) {
    await cancelRequestBody(req);
    return { ok: false, cause: payloadTooLargeError() };
  }

  if (!req.body) {
    return { ok: true, text: '' };
  }

  // Request polyfills (e.g. node-fetch used as the global `Request`) expose a
  // Node stream that has no `getReader`; read those through `req.text()`.
  if (typeof req.body.getReader !== 'function') {
    let text: string;

    try {
      text = await req.text();
    } catch (cause) {
      return { ok: false, cause };
    }

    if (Buffer.byteLength(text, 'utf8') > maxBodySize) {
      return { ok: false, cause: payloadTooLargeError() };
    }

    return { ok: true, text };
  }

  const decoder = new TextDecoder();
  let text = '';
  let received = 0;

  try {
    const reader = req.body.getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;

      // Cap chunked/unknown-length bodies too, not just Content-Length.
      if (received > maxBodySize) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, cause: payloadTooLargeError() };
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
  } catch (cause) {
    return { ok: false, cause };
  }

  return { ok: true, text };
};

type RequestBodyResult = { isValid: true; data: unknown } | { isValid: false; cause: unknown };

// co-body does not parse Request body correctly
const getRequestBody = async (req: Request, maxBodySize: number): Promise<RequestBodyResult> => {
  // Only JSON bodies are parsed. Every other media type is left untouched and
  // the node handler rejects it with a 415 before the body is used.
  if (!isJsonMediaType(req.headers.get('content-type') ?? undefined)) {
    return { isValid: true, data: req.body };
  }

  const body = await readBodyText(req, maxBodySize);

  if (!body.ok) {
    return { isValid: false, cause: body.cause };
  }

  try {
    return {
      isValid: true,
      // use JSON.parse instead of req.json() because req.json() does not throw on invalid JSON
      data: JSON.parse(body.text),
    };
  } catch (cause) {
    return { isValid: false, cause };
  }
};

const getRequestUrl = (req: Request, endpoint?: string): URL => {
  const requestUrl = new URL(req.url);
  const pathname = stripPathPrefix(requestUrl.pathname, endpoint);

  // Mutate the already-parsed URL instead of rebuilding it from `origin`:
  // opaque-origin URLs (`file:`, `data:`, `about:`) have the origin string
  // `'null'`, which `new URL(origin)` rejects.
  requestUrl.pathname = pathname === '' ? '/' : pathname;

  return requestUrl;
};

interface RequestProxyResult {
  req: Request;
  payloadTooLarge: boolean;
}

const createRequestProxy = async (
  req: Request,
  url: string,
  maxBodySize: number,
): Promise<RequestProxyResult> => {
  const body = await getRequestBody(req, maxBodySize);

  const proxy = new Proxy(req, {
    get: (target, prop) => {
      if (prop === 'url') {
        return url;
      }

      if (prop === 'body') {
        if (!body.isValid) {
          if (body.cause instanceof TRPCError) {
            throw body.cause;
          }

          throw new TRPCError({
            code: 'PARSE_ERROR',
            message: 'Failed to parse request body',
            cause: body.cause,
          });
        }

        return body.data;
      }

      // Headers are exposed as-is: callbacks see the raw values and mutations
      // reach the original `Request`. Media types are normalized by the
      // content-type checks instead.
      const value = Reflect.get(target, prop, target) as unknown;
      return value;
    },
  });

  return {
    req: proxy,
    payloadTooLarge: !body.isValid && isPayloadTooLargeError(body.cause),
  };
};

interface FetchResponseAdapter {
  setHeader(key: string, value: string | readonly string[]): void;
  statusCode: number;
  end(body?: string): void;
}

/**
 * The core handler's response type is Node's `ServerResponse`, but the fetch
 * adapter resolves a WHATWG `Response` from `end`. Keep that boundary cast in
 * one place.
 */
const asNodeResponse = (res: FetchResponseAdapter): ServerResponse =>
  res as unknown as ServerResponse;

export const createOpenApiFetchHandler = async <TRouter extends OpenApiRouter>(
  opts: CreateOpenApiFetchHandlerOptions<TRouter>,
): Promise<Response> => {
  const maxBodySize = opts.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  if (!Number.isFinite(maxBodySize) || maxBodySize < 0) {
    throw new TypeError(
      `Invalid maxBodySize: expected a finite number greater than or equal to 0, received ${String(
        opts.maxBodySize,
      )}`,
    );
  }

  const resHeaders = new Headers();
  const url = getRequestUrl(opts.req, opts.endpoint);
  const { req, payloadTooLarge } = await createRequestProxy(opts.req, url.toString(), maxBodySize);

  // The body was already read and rejected, so surface the deferred 413 here:
  // void-input routes and methods that do not accept a body never touch the
  // proxy's `body` getter and would otherwise let the request through.
  if (payloadTooLarge) {
    return new Response(
      JSON.stringify({ message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' }),
      {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const { router, createContext, responseMeta, onError, options } = opts;

  const openApiHttpHandler = createOpenApiNodeHttpHandler<TRouter, Request, ServerResponse>({
    router,
    responseMeta,
    options,
    onError,
    // The core handler calls `createContext` with `{ req, res, info }`, while
    // the fetch contract provides the response headers as well.
    createContext: createContext
      ? (ctxOpts) => {
          const result: unknown = createContext({
            req: ctxOpts.req,
            resHeaders,
            info: ctxOpts.info,
          });
          return result;
        }
      : undefined,
  });

  return new Promise<Response>((resolve) => {
    let settled = false;
    let statusCode: number;

    const settle = (response: Response) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(response);
    };

    const internalServerError = () =>
      settle(
        new Response(
          JSON.stringify({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const res: FetchResponseAdapter = {
      setHeader: (key: string, value: string | readonly string[]) => {
        if (typeof value === 'string') {
          resHeaders.set(key, value);
        } else {
          for (const v of value) {
            resHeaders.append(key, v);
          }
        }
      },
      get statusCode() {
        return statusCode;
      },
      set statusCode(code: number) {
        statusCode = code;
      },
      end: (body?: string) => {
        settle(
          new Response(body, {
            headers: resHeaders,
            status: statusCode,
          }),
        );
      },
    };

    try {
      // The handler promise must be observed: a throw from a callback such as
      // `onError` (e.g. accessing the proxy's `body` getter) rejects it instead
      // of calling `res.end`, and would otherwise leave this promise pending.
      void Promise.resolve(openApiHttpHandler(req, asNodeResponse(res))).catch(internalServerError);
    } catch {
      internalServerError();
    }
  });
};
