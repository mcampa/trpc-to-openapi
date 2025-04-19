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
