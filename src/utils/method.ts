import { incomingMessageToRequest, NodeHTTPResponse } from '@trpc/server/adapters/node-http';
import { NodeHTTPRequest, OpenApiMethod } from '../types';

export const acceptsRequestBody = (method: OpenApiMethod | 'HEAD') => {
  if (method === 'GET' || method === 'DELETE') {
    return false;
  }
  return true;
};

export const getContentType = (req: NodeHTTPRequest | Request): string | undefined => {
  if (req instanceof Request) {
    return req.headers.get('content-type') ?? undefined;
  }

  return req.headers['content-type'] ?? undefined;
};

/**
 * Normalizes a content-type header to its media type: lowercased, without
 * parameters and surrounding whitespace. `Application/JSON; charset=utf-8`
 * becomes `application/json`.
 */
export const normalizeMediaType = (
  contentType: string | string[] | undefined,
): string | undefined => {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!value) {
    return undefined;
  }

  return value.split(';')[0]!.trim().toLowerCase();
};

/**
 * Whether a normalized media type is JSON: `application/json` or a structured
 * suffix type such as `application/json-patch+json`.
 */
export const isJsonMediaType = (mediaType: string | undefined): boolean => {
  return mediaType === 'application/json' || !!mediaType?.endsWith('+json');
};

export const getRequestSignal = (
  req: NodeHTTPRequest | Request,
  res: NodeHTTPResponse,
  maxBodySize?: number,
) => {
  if (req instanceof Request) {
    return req.signal;
  }

  return incomingMessageToRequest(req, res, {
    maxBodySize: maxBodySize ?? null,
  }).signal;
};
