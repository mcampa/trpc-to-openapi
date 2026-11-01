import { TRPCError } from '@trpc/server';
import parse from 'co-body';
import { NodeHTTPRequest } from '../../types';
import { normalizeMediaType } from '../../utils/method';

export const getQuery = (req: NodeHTTPRequest, url: URL): Record<string, string | string[]> => {
  // Null-prototype accumulators keep keys such as "__proto__" as own
  // properties instead of triggering the prototype setter.
  const query: Record<string, string | string[]> = Object.create(null);

  if (!req.query) {
    const parsedQs: Record<string, string[]> = Object.create(null);
    url.searchParams.forEach((value, key) => {
      if (!Object.prototype.hasOwnProperty.call(parsedQs, key)) {
        parsedQs[key] = [];
      }
      parsedQs[key]!.push(value);
    });
    req.query = parsedQs;
  }

  const reqQuery = req.query as typeof query;

  // normalize first value in array
  Object.keys(reqQuery).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(reqQuery, key)) {
      return;
    }

    const value = reqQuery[key];
    if (value !== undefined) {
      query[key] = Array.isArray(value) && value.length === 1 ? value[0]! : value;
    }
  });

  return query;
};

const BODY_100_KB = 100_000;
export const getBody = async (req: NodeHTTPRequest, maxBodySize = BODY_100_KB): Promise<any> => {
  if ('body' in req) {
    if (req.body instanceof ReadableStream) {
      return new Response(req.body as ReadableStream<Buffer | Uint8Array | string | null>).json();
    }
    return req.body;
  }

  req.body = undefined;

  const mediaType = normalizeMediaType(req.headers['content-type']);
  if (mediaType === 'application/json' || mediaType === 'application/x-www-form-urlencoded') {
    try {
      const { raw, parsed } = await parse(req, {
        limit: maxBodySize,
        strict: false,
        returnRawBody: true,
      });
      req.body = raw ? parsed : undefined;
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'PayloadTooLargeError') {
        throw new TRPCError({
          message: 'Request body too large',
          code: 'PAYLOAD_TOO_LARGE',
          cause: cause,
        });
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
