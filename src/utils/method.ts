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
