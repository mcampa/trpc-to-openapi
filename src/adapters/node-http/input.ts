import { TRPCError } from '@trpc/server';
import parse from 'co-body';
import { NodeHTTPRequest } from '../../types';
import { isJsonMediaType } from '../../utils/method';

export const getQuery = (req: NodeHTTPRequest, url: URL): Record<string, string | string[]> => {
  // Null-prototype accumulators keep keys such as "__proto__" as own
  // properties instead of triggering the prototype setter.
  const query: Record<string, string | string[]> = Object.create(null);

  if (!req.query) {
    const parsedQs: Record<string, string[]> = Object.create(null);
    url.searchParams.forEach((value, key) => {
      if (!parsedQs[key]) {
        parsedQs[key] = [];
      }
      parsedQs[key].push(value);
    });
    req.query = parsedQs;
  }

  const reqQuery = req.query as typeof query;

  // normalize first value in array
  Object.keys(reqQuery).forEach((key) => {
    const value = reqQuery[key];
    if (value !== undefined) {
      query[key] = Array.isArray(value) && value.length === 1 ? value[0]! : value;
    }
  });

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

export const getBody = async (
  req: NodeHTTPRequest,
  maxBodySize = DEFAULT_MAX_BODY_SIZE,
): Promise<any> => {
  if ('body' in req) {
    if (req.body instanceof ReadableStream) {
      try {
        return await new Response(
          req.body as ReadableStream<Buffer | Uint8Array | string | null>,
        ).json();
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
    }
    return req.body;
  }

  req.body = undefined;

  const contentType = req.headers['content-type'];
  if (isJsonMediaType(contentType)) {
    try {
      const { raw, parsed } = await parse(req, {
        limit: maxBodySize,
        strict: false,
        returnRawBody: true,
      });
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
