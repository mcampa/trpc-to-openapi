import { TRPCError } from '@trpc/server';
import { getErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { ZodArray } from 'zod';
import { generateOpenApiDocument } from '../../generator/index.mjs';
import { acceptsRequestBody, normalizePath, getInputOutputParsers, coerceSchema, instanceofZodTypeLikeVoid, instanceofZodTypeObject, unwrapZodType, zodSupportsCoerce, getContentType, getRequestSignal, } from '../../utils/index.mjs';
import { TRPC_ERROR_CODE_HTTP_STATUS, getErrorFromUnknown } from './errors.mjs';
import { getBody, getQuery } from './input.mjs';
import { createProcedureCache } from './procedures.mjs';
export const createOpenApiNodeHttpHandler = (opts) => {
    const router = Object.assign({}, opts.router);
    // Validate router
    if (process.env.NODE_ENV !== 'production') {
        generateOpenApiDocument(router, { title: '', version: '', baseUrl: '' });
    }
    const { createContext, responseMeta, onError, maxBodySize } = opts;
    const getProcedure = createProcedureCache(router);
    return async (req, res, next) => {
        const sendResponse = (statusCode, headers, body) => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            for (const [key, value] of Object.entries(headers)) {
                if (typeof value !== 'undefined') {
                    res.setHeader(key, value);
                }
            }
            res.end(JSON.stringify(body));
        };
        const method = req.method;
        const reqUrl = req.url;
        const url = new URL(reqUrl.startsWith('/') ? `http://127.0.0.1${reqUrl}` : reqUrl);
        const path = normalizePath(url.pathname);
        let input = undefined;
        let ctx = undefined;
        let info = undefined;
        let data = undefined;
        const { procedure, pathInput } = getProcedure(method, path) ?? {};
        try {
            if (!procedure) {
                if (next) {
                    return next();
                }
                // Can be used for warmup
                if (method === 'HEAD') {
                    sendResponse(204, {}, undefined);
                    return;
                }
                throw new TRPCError({
                    message: 'Not found',
                    code: 'NOT_FOUND',
                });
            }
            const contentType = getContentType(req);
            const useBody = acceptsRequestBody(method);
            if (useBody && !contentType?.startsWith('application/json')) {
                throw new TRPCError({
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    message: contentType
                        ? `Unsupported content-type "${contentType}`
                        : 'Missing content-type header',
                });
            }
            const inputParser = getInputOutputParsers(procedure.procedure).inputParser;
            const unwrappedSchema = unwrapZodType(inputParser, true);
            // input should stay undefined if z.void()
            if (!instanceofZodTypeLikeVoid(unwrappedSchema)) {
                input = {
                    ...(useBody ? await getBody(req, maxBodySize) : getQuery(req, url)),
                    ...pathInput,
                };
            }
            // if supported, coerce all string values to correct types
            if (zodSupportsCoerce && instanceofZodTypeObject(unwrappedSchema)) {
                if (!useBody) {
                    for (const [key, shape] of Object.entries(unwrappedSchema.shape)) {
                        if (shape instanceof ZodArray && !Array.isArray(input[key])) {
                            input[key] = [input[key]];
                        }
                    }
                }
                coerceSchema(unwrappedSchema);
            }
            info = {
                isBatchCall: false,
                accept: null,
                calls: [],
                type: procedure.type,
                connectionParams: null,
                signal: getRequestSignal(req, res, maxBodySize),
                url,
            };
            ctx = await createContext?.({ req, res, info });
            const caller = router.createCaller(ctx);
            const segments = procedure.path.split('.');
            const procedureFn = segments.reduce((acc, curr) => acc[curr], caller);
            data = await procedureFn(input);
            const meta = responseMeta?.({
                type: procedure.type,
                paths: [procedure.path],
                ctx,
                data: [data],
                errors: [],
                info,
                eagerGeneration: true,
            });
            const statusCode = meta?.status ?? 200;
            const headers = meta?.headers ?? {};
            const body = data;
            sendResponse(statusCode, headers, body);
        }
        catch (cause) {
            const error = getErrorFromUnknown(cause);
            onError?.({
                error,
                type: procedure?.type ?? 'unknown',
                path: procedure?.path,
                input,
                ctx,
                req,
            });
            const meta = responseMeta?.({
                type: procedure?.type ?? 'unknown',
                paths: procedure?.path ? [procedure?.path] : undefined,
                ctx,
                data: [data],
                errors: [error],
                info,
                eagerGeneration: true,
            });
            const errorShape = getErrorShape({
                config: router._def._config,
                error,
                type: procedure?.type ?? 'unknown',
                path: procedure?.path,
                input,
                ctx,
            });
            const isInputValidationError = error.code === 'BAD_REQUEST' &&
                error.cause instanceof Error &&
                error.cause.name === 'ZodError';
            const statusCode = meta?.status ?? TRPC_ERROR_CODE_HTTP_STATUS[error.code] ?? 500;
            const headers = meta?.headers ?? {};
            const body = {
                ...errorShape, // Pass the error through
                message: isInputValidationError
                    ? 'Input validation failed'
                    : (errorShape?.message ?? error.message ?? 'An error occurred'),
                code: error.code,
                issues: isInputValidationError ? error.cause.errors : undefined,
            };
            sendResponse(statusCode, headers, body);
        }
    };
};
//# sourceMappingURL=core.js.map