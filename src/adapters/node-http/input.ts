import { TRPCError } from '@trpc/server';
import parse from 'co-body';
import { OpenApiHTTPRequest } from '../../types';
import { isJsonMediaType } from '../../utils/method';
import { createNullPrototypeRecord } from '../../utils/object';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Query values are raw framework input: strings from `URLSearchParams`, and
 * whatever the framework's parser supplies (`string | string[]`, nested
 * objects, ...). Values are validated by zod after the adapter merges them.
 */
export const getQuery = (req: OpenApiHTTPRequest, url: URL): Record<string, unknown> => {
  // Null-prototype accumulators keep keys such as "__proto__" as own
  // properties instead of triggering the prototype setter.
  const query = createNullPrototypeRecord<unknown>();

  if (!req.query) {
    const parsedQs = createNullPrototypeRecord<string[]>();
    url.searchParams.forEach((value, key) => {
      if (!parsedQs[key]) {
        parsedQs[key] = [];
      }
      parsedQs[key].push(value);
    });
    req.query = parsedQs;
  }

  const reqQuery = isRecord(req.query) ? req.query : {};

  // Normalize single-value arrays to their first value.
  for (const key of Object.keys(reqQuery)) {
    const value = reqQuery[key];
    if (value !== undefined) {
      query[key] = Array.isArray(value) && value.length === 1 ? value[0] : value;
    }
  }

  return query;
};

/**
 * Default maximum request body size in bytes (100kb), shared by the node HTTP
 * and fetch adapters.
 */
export const DEFAULT_MAX_BODY_SIZE = 100_000;

export const payloadTooLargeError = (cause?: unknown) =>
  new TRPCError({
    message: 'Request body too large',
    code: 'PAYLOAD_TOO_LARGE',
    cause,
  });

const parseStreamBody = async (body: ReadableStream): Promise<unknown> => {
  try {
    const parsed: unknown = await new Response(body).json();
    return parsed;
  } catch (cause) {
    // The body stream itself reports size limits as TRPCErrors; keep those.
    if (cause instanceof TRPCError) {
      throw cause;
    }

    throw new TRPCError({
      message: 'Failed to parse request body',
      code: 'PARSE_ERROR',
      cause: cause instanceof Error ? cause : undefined,
    });
  }
};

export const getBody = async (
  req: OpenApiHTTPRequest,
  maxBodySize = DEFAULT_MAX_BODY_SIZE,
): Promise<unknown> => {
  if (req instanceof Request) {
    return req.body instanceof ReadableStream ? parseStreamBody(req.body) : req.body;
  }

  if ('body' in req) {
    return req.body instanceof ReadableStream ? parseStreamBody(req.body) : req.body;
  }

  req.body = undefined;

  const contentType = req.headers['content-type'];
  if (isJsonMediaType(contentType)) {
    try {
      const { raw, parsed } = (await parse(req, {
        limit: maxBodySize,
        strict: false,
        returnRawBody: true,
      })) as { raw: string | undefined; parsed: unknown };
      req.body = raw ? parsed : undefined;
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'PayloadTooLargeError') {
        throw payloadTooLargeError(cause);
      }

      let errorCause: Error | undefined = undefined;
      if (cause instanceof Error) {
        errorCause = cause;
      }

      throw new TRPCError({
        message: 'Failed to parse request body',
        code: 'PARSE_ERROR',
        cause: errorCause,
      });
    }
  }

  return req.body;
};
