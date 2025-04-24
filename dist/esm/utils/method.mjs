import { incomingMessageToRequest } from '@trpc/server/adapters/node-http';
export const acceptsRequestBody = (method) => {
    if (method === 'GET' || method === 'DELETE') {
        return false;
    }
    return true;
};
export const getContentType = (req) => {
    if (req instanceof Request) {
        return req.headers.get('content-type') ?? undefined;
    }
    return req.headers['content-type'] ?? undefined;
};
export const getRequestSignal = (req, res, maxBodySize) => {
    if (req instanceof Request) {
        return req.signal;
    }
    return incomingMessageToRequest(req, res, {
        maxBodySize: maxBodySize ?? null,
    }).signal;
};
//# sourceMappingURL=method.js.map