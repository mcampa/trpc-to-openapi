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
 * Parse a `Content-Type` header into a lowercase media type without its
 * parameters. Multiple header values are joined with a comma so a header that
 * contains several media types is never mistaken for a single one.
 */
export const normalizeMediaType = (
  contentType: string | string[] | undefined,
): string | undefined => {
  const value = Array.isArray(contentType) ? contentType.join(',') : contentType;
  if (!value) {
    return undefined;
  }

  const [mediaType] = value.split(';');
  const normalized = mediaType?.trim().toLowerCase();

  return normalized ? normalized : undefined;
};

/**
 * Whether the header describes JSON: the media type is exactly
 * `application/json` or uses a `+json` structured suffix.
 */
export const isJsonMediaType = (contentType: string | string[] | undefined): boolean => {
  const mediaType = normalizeMediaType(contentType);

  return mediaType === 'application/json' || mediaType?.endsWith('+json') === true;
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
