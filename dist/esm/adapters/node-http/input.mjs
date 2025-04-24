import { TRPCError } from '@trpc/server';
import parse from 'co-body';
export const getQuery = (req, url) => {
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
const BODY_100_KB = 100000;
export const getBody = async (req, maxBodySize = BODY_100_KB) => {
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
            const { raw, parsed } = await parse(req, {
                limit: maxBodySize,
                strict: false,
                returnRawBody: true,
            });
            req.body = raw ? parsed : undefined;
        }
        catch (cause) {
            if (cause instanceof Error && cause.name === 'PayloadTooLargeError') {
                throw new TRPCError({
                    message: 'Request body too large',
                    code: 'PAYLOAD_TOO_LARGE',
                    cause: cause,
                });
            }
            let errorCause = undefined;
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
//# sourceMappingURL=input.js.map