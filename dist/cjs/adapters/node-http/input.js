"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBody = exports.getQuery = void 0;
const server_1 = require("@trpc/server");
const co_body_1 = __importDefault(require("co-body"));
const getQuery = (req, url) => {
    const query = {};
    if (!req.query) {
        const parsedQs = {};
        url.searchParams.forEach((value, key) => {
            if (!parsedQs[key]) {
                parsedQs[key] = [];
            }
            parsedQs[key].push(value);
        });
        req.query = parsedQs;
    }
    const reqQuery = req.query;
    // normalize first value in array
    Object.keys(reqQuery).forEach((key) => {
        const value = reqQuery[key];
        if (value) {
            query[key] = Array.isArray(value) && value.length === 1 ? value[0] : value;
        }
    });
    return query;
};
exports.getQuery = getQuery;
const BODY_100_KB = 100000;
const getBody = async (req, maxBodySize = BODY_100_KB) => {
    if ('body' in req) {
        if (req.body instanceof ReadableStream) {
            return new Response(req.body).json();
        }
        return req.body;
    }
    req.body = undefined;
    const contentType = req.headers['content-type'];
    if (contentType === 'application/json' || contentType === 'application/x-www-form-urlencoded') {
        try {
            const { raw, parsed } = await (0, co_body_1.default)(req, {
                limit: maxBodySize,
                strict: false,
                returnRawBody: true,
            });
            req.body = raw ? parsed : undefined;
        }
        catch (cause) {
            if (cause instanceof Error && cause.name === 'PayloadTooLargeError') {
                throw new server_1.TRPCError({
                    message: 'Request body too large',
                    code: 'PAYLOAD_TOO_LARGE',
                    cause: cause,
                });
            }
            let errorCause = undefined;
            if (cause instanceof Error) {
                errorCause = cause;
            }
            throw new server_1.TRPCError({
                message: 'Failed to parse request body',
                code: 'PARSE_ERROR',
                cause: errorCause,
            });
        }
    }
    return req.body;
};
exports.getBody = getBody;
//# sourceMappingURL=input.js.map