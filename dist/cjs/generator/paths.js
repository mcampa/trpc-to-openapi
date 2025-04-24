"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergePaths = exports.getOpenApiPathsObject = exports.HttpMethods = void 0;
const server_1 = require("@trpc/server");
const zod_1 = require("zod");
const zod_openapi_1 = require("zod-openapi");
const utils_1 = require("../utils");
const schema_1 = require("./schema");
(0, zod_openapi_1.extendZodWithOpenApi)(zod_1.z);
var HttpMethods;
(function (HttpMethods) {
    HttpMethods["GET"] = "get";
    HttpMethods["POST"] = "post";
    HttpMethods["PATCH"] = "patch";
    HttpMethods["PUT"] = "put";
    HttpMethods["DELETE"] = "delete";
})(HttpMethods || (exports.HttpMethods = HttpMethods = {}));
const getOpenApiPathsObject = (appRouter, securitySchemeNames) => {
    const pathsObject = {};
    const procedures = Object.assign({}, appRouter._def.procedures);
    (0, utils_1.forEachOpenApiProcedure)(procedures, ({ path: procedurePath, type, procedure, openapi }) => {
        var _a, _b, _c, _d, _e;
        const procedureName = `${type}.${procedurePath}`;
        try {
            if (type === 'subscription') {
                throw new server_1.TRPCError({
                    message: 'Subscriptions are not supported by OpenAPI v3',
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            const { method, summary, description, tags, requestHeaders, responseHeaders, successDescription, errorResponses, protect = true, } = openapi;
            const path = (0, utils_1.normalizePath)(openapi.path);
            const pathParameters = (0, utils_1.getPathParameters)(path);
            const httpMethod = HttpMethods[method];
            if (!httpMethod) {
                throw new server_1.TRPCError({
                    message: 'Method must be GET, POST, PATCH, PUT or DELETE',
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            if ((_a = pathsObject[path]) === null || _a === void 0 ? void 0 : _a[httpMethod]) {
                throw new server_1.TRPCError({
                    message: `Duplicate procedure defined for route ${method} ${path}`,
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            const contentTypes = (_b = openapi.contentTypes) !== null && _b !== void 0 ? _b : ['application/json'];
            if (contentTypes.length === 0) {
                throw new server_1.TRPCError({
                    message: 'At least one content type must be specified',
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            const { inputParser, outputParser } = (0, utils_1.getInputOutputParsers)(procedure);
            if (!(0, utils_1.instanceofZodType)(inputParser)) {
                throw new server_1.TRPCError({
                    message: 'Input parser expects a Zod validator',
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            if (!(0, utils_1.instanceofZodType)(outputParser)) {
                throw new server_1.TRPCError({
                    message: 'Output parser expects a Zod validator',
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            const isInputRequired = !inputParser.isOptional();
            const o = (_c = inputParser === null || inputParser === void 0 ? void 0 : inputParser._def.zodOpenApi) === null || _c === void 0 ? void 0 : _c.openapi;
            const inputSchema = (0, utils_1.unwrapZodType)(inputParser, true).openapi(Object.assign(Object.assign({}, ((o === null || o === void 0 ? void 0 : o.title) ? { title: o === null || o === void 0 ? void 0 : o.title } : {})), ((o === null || o === void 0 ? void 0 : o.description) ? { description: o === null || o === void 0 ? void 0 : o.description } : {})));
            const requestData = {};
            if (!(pathParameters.length === 0 && (0, utils_1.instanceofZodTypeLikeVoid)(inputSchema))) {
                if (!(0, utils_1.instanceofZodTypeObject)(inputSchema)) {
                    throw new server_1.TRPCError({
                        message: 'Input parser must be a ZodObject',
                        code: 'INTERNAL_SERVER_ERROR',
                    });
                }
                if ((0, utils_1.acceptsRequestBody)(method)) {
                    requestData.requestBody = (0, schema_1.getRequestBodyObject)(inputSchema, isInputRequired, pathParameters, contentTypes);
                    requestData.requestParams =
                        (_d = (0, schema_1.getParameterObjects)(inputSchema, isInputRequired, pathParameters, requestHeaders, 'path')) !== null && _d !== void 0 ? _d : {};
                }
                else {
                    requestData.requestParams =
                        (_e = (0, schema_1.getParameterObjects)(inputSchema, isInputRequired, pathParameters, requestHeaders, 'all')) !== null && _e !== void 0 ? _e : {};
                }
            }
            const responses = (0, schema_1.getResponsesObject)(outputParser, httpMethod, responseHeaders, protect, (0, schema_1.hasInputs)(inputParser), successDescription, errorResponses);
            const security = protect ? securitySchemeNames.map((name) => ({ [name]: [] })) : undefined;
            pathsObject[path] = Object.assign(Object.assign({}, pathsObject[path]), { [httpMethod]: Object.assign(Object.assign(Object.assign({ operationId: procedurePath.replace(/\./g, '-'), summary,
                    description,
                    tags,
                    security }, requestData), { responses }), (openapi.deprecated ? { deprecated: openapi.deprecated } : {})) });
        }
        catch (error) {
            if (error instanceof server_1.TRPCError) {
                error.message = `[${procedureName}] - ${error.message}`;
            }
            throw error;
        }
    });
    return pathsObject;
};
exports.getOpenApiPathsObject = getOpenApiPathsObject;
const mergePaths = (x, y) => {
    if (x === undefined)
        return y;
    if (y === undefined)
        return x;
    const obj = x;
    for (const [k, v] of Object.entries(y)) {
        if (k in obj)
            obj[k] = Object.assign(Object.assign({}, obj[k]), v);
        else
            obj[k] = v;
    }
    return obj;
};
exports.mergePaths = mergePaths;
//# sourceMappingURL=paths.js.map