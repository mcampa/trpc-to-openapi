"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenApiNodeHttpHandler = void 0;
const server_1 = require("@trpc/server");
const unstable_core_do_not_import_1 = require("@trpc/server/unstable-core-do-not-import");
const zod_1 = require("zod");
const generator_1 = require("../../generator");
const utils_1 = require("../../utils");
const errors_1 = require("./errors");
const input_1 = require("./input");
const procedures_1 = require("./procedures");
const createOpenApiNodeHttpHandler = (opts) => {
    const router = Object.assign({}, opts.router);
    // Validate router
    if (process.env.NODE_ENV !== 'production') {
        (0, generator_1.generateOpenApiDocument)(router, { title: '', version: '', baseUrl: '' });
    }
    const { createContext, responseMeta, onError, maxBodySize } = opts;
    const getProcedure = (0, procedures_1.createProcedureCache)(router);
    return async (req, res, next) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
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
        const path = (0, utils_1.normalizePath)(url.pathname);
        let input = undefined;
        let ctx = undefined;
        let info = undefined;
        let data = undefined;
        const { procedure, pathInput } = (_a = getProcedure(method, path)) !== null && _a !== void 0 ? _a : {};
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
                throw new server_1.TRPCError({
                    message: 'Not found',
                    code: 'NOT_FOUND',
                });
            }
            const contentType = (0, utils_1.getContentType)(req);
            const useBody = (0, utils_1.acceptsRequestBody)(method);
            if (useBody && !(contentType === null || contentType === void 0 ? void 0 : contentType.startsWith('application/json'))) {
                throw new server_1.TRPCError({
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    message: contentType
                        ? `Unsupported content-type "${contentType}`
                        : 'Missing content-type header',
                });
            }
            const inputParser = (0, utils_1.getInputOutputParsers)(procedure.procedure).inputParser;
            const unwrappedSchema = (0, utils_1.unwrapZodType)(inputParser, true);
            // input should stay undefined if z.void()
            if (!(0, utils_1.instanceofZodTypeLikeVoid)(unwrappedSchema)) {
                input = Object.assign(Object.assign({}, (useBody ? await (0, input_1.getBody)(req, maxBodySize) : (0, input_1.getQuery)(req, url))), pathInput);
            }
            // if supported, coerce all string values to correct types
            if (utils_1.zodSupportsCoerce && (0, utils_1.instanceofZodTypeObject)(unwrappedSchema)) {
                if (!useBody) {
                    for (const [key, shape] of Object.entries(unwrappedSchema.shape)) {
                        if (shape instanceof zod_1.ZodArray && !Array.isArray(input[key])) {
                            input[key] = [input[key]];
                        }
                    }
                }
                (0, utils_1.coerceSchema)(unwrappedSchema);
            }
            info = {
                isBatchCall: false,
                accept: null,
                calls: [],
                type: procedure.type,
                connectionParams: null,
                signal: (0, utils_1.getRequestSignal)(req, res, maxBodySize),
                url,
            };
            ctx = await (createContext === null || createContext === void 0 ? void 0 : createContext({ req, res, info }));
            const caller = router.createCaller(ctx);
            const segments = procedure.path.split('.');
            const procedureFn = segments.reduce((acc, curr) => acc[curr], caller);
            data = await procedureFn(input);
            const meta = responseMeta === null || responseMeta === void 0 ? void 0 : responseMeta({
                type: procedure.type,
                paths: [procedure.path],
                ctx,
                data: [data],
                errors: [],
                info,
                eagerGeneration: true,
            });
            const statusCode = (_b = meta === null || meta === void 0 ? void 0 : meta.status) !== null && _b !== void 0 ? _b : 200;
            const headers = (_c = meta === null || meta === void 0 ? void 0 : meta.headers) !== null && _c !== void 0 ? _c : {};
            const body = data;
            sendResponse(statusCode, headers, body);
        }
        catch (cause) {
            const error = (0, errors_1.getErrorFromUnknown)(cause);
            onError === null || onError === void 0 ? void 0 : onError({
                error,
                type: (_d = procedure === null || procedure === void 0 ? void 0 : procedure.type) !== null && _d !== void 0 ? _d : 'unknown',
                path: procedure === null || procedure === void 0 ? void 0 : procedure.path,
                input,
                ctx,
                req,
            });
            const meta = responseMeta === null || responseMeta === void 0 ? void 0 : responseMeta({
                type: (_e = procedure === null || procedure === void 0 ? void 0 : procedure.type) !== null && _e !== void 0 ? _e : 'unknown',
                paths: (procedure === null || procedure === void 0 ? void 0 : procedure.path) ? [procedure === null || procedure === void 0 ? void 0 : procedure.path] : undefined,
                ctx,
                data: [data],
                errors: [error],
                info,
                eagerGeneration: true,
            });
            const errorShape = (0, unstable_core_do_not_import_1.getErrorShape)({
                config: router._def._config,
                error,
                type: (_f = procedure === null || procedure === void 0 ? void 0 : procedure.type) !== null && _f !== void 0 ? _f : 'unknown',
                path: procedure === null || procedure === void 0 ? void 0 : procedure.path,
                input,
                ctx,
            });
            const isInputValidationError = error.code === 'BAD_REQUEST' &&
                error.cause instanceof Error &&
                error.cause.name === 'ZodError';
            const statusCode = (_h = (_g = meta === null || meta === void 0 ? void 0 : meta.status) !== null && _g !== void 0 ? _g : errors_1.TRPC_ERROR_CODE_HTTP_STATUS[error.code]) !== null && _h !== void 0 ? _h : 500;
            const headers = (_j = meta === null || meta === void 0 ? void 0 : meta.headers) !== null && _j !== void 0 ? _j : {};
            const body = Object.assign(Object.assign({}, errorShape), { message: isInputValidationError
                    ? 'Input validation failed'
                    : ((_l = (_k = errorShape === null || errorShape === void 0 ? void 0 : errorShape.message) !== null && _k !== void 0 ? _k : error.message) !== null && _l !== void 0 ? _l : 'An error occurred'), code: error.code, issues: isInputValidationError ? error.cause.errors : undefined });
            sendResponse(statusCode, headers, body);
        }
    };
};
exports.createOpenApiNodeHttpHandler = createOpenApiNodeHttpHandler;
//# sourceMappingURL=core.js.map