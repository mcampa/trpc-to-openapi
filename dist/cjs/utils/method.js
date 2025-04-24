"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestSignal = exports.getContentType = exports.acceptsRequestBody = void 0;
const node_http_1 = require("@trpc/server/adapters/node-http");
const acceptsRequestBody = (method) => {
    if (method === 'GET' || method === 'DELETE') {
        return false;
    }
    return true;
};
exports.acceptsRequestBody = acceptsRequestBody;
const getContentType = (req) => {
    var _a, _b;
    if (req instanceof Request) {
        return (_a = req.headers.get('content-type')) !== null && _a !== void 0 ? _a : undefined;
    }
    return (_b = req.headers['content-type']) !== null && _b !== void 0 ? _b : undefined;
};
exports.getContentType = getContentType;
const getRequestSignal = (req, res, maxBodySize) => {
    if (req instanceof Request) {
        return req.signal;
    }
    return (0, node_http_1.incomingMessageToRequest)(req, res, {
        maxBodySize: maxBodySize !== null && maxBodySize !== void 0 ? maxBodySize : null,
    }).signal;
};
exports.getRequestSignal = getRequestSignal;
//# sourceMappingURL=method.js.map