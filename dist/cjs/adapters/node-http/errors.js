"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRPC_ERROR_CODE_MESSAGE = exports.HTTP_STATUS_TRPC_ERROR_CODE = exports.TRPC_ERROR_CODE_HTTP_STATUS = void 0;
exports.getErrorFromUnknown = getErrorFromUnknown;
const server_1 = require("@trpc/server");
exports.TRPC_ERROR_CODE_HTTP_STATUS = {
    PARSE_ERROR: 400,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    TIMEOUT: 408,
    CONFLICT: 409,
    CLIENT_CLOSED_REQUEST: 499,
    PRECONDITION_FAILED: 412,
    PAYLOAD_TOO_LARGE: 413,
    METHOD_NOT_SUPPORTED: 405,
    UNSUPPORTED_MEDIA_TYPE: 415,
    TOO_MANY_REQUESTS: 429,
    UNPROCESSABLE_CONTENT: 422,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
};
exports.HTTP_STATUS_TRPC_ERROR_CODE = {
    400: 'BAD_REQUEST',
    404: 'NOT_FOUND',
    500: 'INTERNAL_SERVER_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    408: 'TIMEOUT',
    409: 'CONFLICT',
    499: 'CLIENT_CLOSED_REQUEST',
    412: 'PRECONDITION_FAILED',
    413: 'PAYLOAD_TOO_LARGE',
    405: 'METHOD_NOT_SUPPORTED',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'TOO_MANY_REQUESTS',
    422: 'UNPROCESSABLE_CONTENT',
    501: 'NOT_IMPLEMENTED',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
};
exports.TRPC_ERROR_CODE_MESSAGE = {
    PARSE_ERROR: 'Parse error',
    BAD_REQUEST: 'Bad request',
    NOT_FOUND: 'Not found',
    INTERNAL_SERVER_ERROR: 'Internal server error',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    TIMEOUT: 'Timeout',
    CONFLICT: 'Conflict',
    CLIENT_CLOSED_REQUEST: 'Client closed request',
    PRECONDITION_FAILED: 'Precondition failed',
    PAYLOAD_TOO_LARGE: 'Payload too large',
    METHOD_NOT_SUPPORTED: 'Method not supported',
    TOO_MANY_REQUESTS: 'Too many requests',
    UNPROCESSABLE_CONTENT: 'Unprocessable content',
    NOT_IMPLEMENTED: 'Not implemented',
    BAD_GATEWAY: 'Bad gateway',
    SERVICE_UNAVAILABLE: 'Service unavailable',
    GATEWAY_TIMEOUT: 'Gateway timeout',
    UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
};
function getErrorFromUnknown(cause) {
    if (cause instanceof Error && cause.name === 'TRPCError') {
        return cause;
    }
    let errorCause = undefined;
    let stack = undefined;
    if (cause instanceof Error) {
        errorCause = cause;
        stack = cause.stack;
    }
    const error = new server_1.TRPCError({
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        cause: errorCause,
    });
    if (stack) {
        error.stack = stack;
    }
    return error;
}
//# sourceMappingURL=errors.js.map