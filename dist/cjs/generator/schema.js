"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResponsesObject = exports.errorResponseFromMessage = exports.errorResponseFromStatusCode = exports.errorResponseObject = exports.hasInputs = exports.getRequestBodyObject = exports.getParameterObjects = void 0;
const server_1 = require("@trpc/server");
const zod_1 = require("zod");
const adapters_1 = require("../adapters");
const utils_1 = require("../utils");
const paths_1 = require("./paths");
const getParameterObjects = (schema, required, pathParameters, headersSchema, inType) => {
    const shape = schema.shape;
    const shapeKeys = Object.keys(shape);
    for (const pathParameter of pathParameters) {
        if (!shapeKeys.includes(pathParameter)) {
            throw new server_1.TRPCError({
                message: `Input parser expects key from path: "${pathParameter}"`,
                code: 'INTERNAL_SERVER_ERROR',
            });
        }
    }
    // @ts-expect-error fix later
    const { path, query } = shapeKeys
        .filter((shapeKey) => {
        const isPathParameter = pathParameters.includes(shapeKey);
        if (inType === 'path') {
            return isPathParameter;
        }
        else if (inType === 'query') {
            return !isPathParameter;
        }
        return true;
    })
        .map((shapeKey) => {
        let shapeSchema = shape[shapeKey];
        const isShapeRequired = !shapeSchema.safeParse(undefined).success;
        const isPathParameter = pathParameters.includes(shapeKey);
        if (!(0, utils_1.instanceofZodTypeLikeString)(shapeSchema)) {
            if (utils_1.zodSupportsCoerce) {
                if (!(0, utils_1.instanceofZodTypeCoercible)(shapeSchema)) {
                    throw new server_1.TRPCError({
                        message: `Input parser key: "${shapeKey}" must be ZodString, ZodNumber, ZodBoolean, ZodBigInt or ZodDate`,
                        code: 'INTERNAL_SERVER_ERROR',
                    });
                }
            }
            else {
                throw new server_1.TRPCError({
                    message: `Input parser key: "${shapeKey}" must be ZodString`,
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
        }
        if ((0, utils_1.instanceofZodTypeOptional)(shapeSchema)) {
            if (isPathParameter) {
                throw new server_1.TRPCError({
                    message: `Path parameter: "${shapeKey}" must not be optional`,
                    code: 'INTERNAL_SERVER_ERROR',
                });
            }
            shapeSchema = shapeSchema.unwrap();
        }
        return {
            name: shapeKey,
            paramType: isPathParameter ? 'path' : 'query',
            required: isPathParameter || (required && isShapeRequired),
            schema: shapeSchema,
        };
    })
        .reduce(({ path, query }, { name, paramType, schema, required }) => 
    // @ts-expect-error fix later
    paramType === 'path'
        ? {
            path: Object.assign(Object.assign({}, path), { [name]: required ? schema : schema.optional() }),
            query,
        }
        : {
            path,
            query: Object.assign(Object.assign({}, query), { [name]: required ? schema : schema.optional() }),
        }, { path: {}, query: {} });
    let res = {};
    if (headersSchema) {
        res.header = headersSchema;
    }
    res = Object.assign(Object.assign({}, res), { path: zod_1.z.object(path), query: zod_1.z.object(query) });
    return res;
};
exports.getParameterObjects = getParameterObjects;
const getRequestBodyObject = (schema, required, pathParameters, contentTypes) => {
    var _a;
    // remove path parameters
    const mask = {};
    pathParameters.forEach((pathParameter) => {
        mask[pathParameter] = true;
    });
    const o = schema.meta();
    const dedupedSchema = schema.omit(mask).meta(Object.assign(Object.assign(Object.assign({}, ((o === null || o === void 0 ? void 0 : o.title) ? { title: o === null || o === void 0 ? void 0 : o.title } : {})), ((o === null || o === void 0 ? void 0 : o.description) ? { description: o === null || o === void 0 ? void 0 : o.description } : {})), ((o === null || o === void 0 ? void 0 : o.examples) ? { examples: o === null || o === void 0 ? void 0 : o.examples } : {})));
    // if all keys are path parameters
    if (pathParameters.length > 0 && Object.keys(dedupedSchema.shape).length === 0) {
        return undefined;
    }
    const content = {};
    const schemaExamples = (_a = dedupedSchema.meta()) === null || _a === void 0 ? void 0 : _a.examples;
    for (const contentType of contentTypes) {
        content[contentType] = Object.assign({ schema: dedupedSchema }, (schemaExamples ? { examples: schemaExamples } : {}));
    }
    return {
        required,
        content,
    };
};
exports.getRequestBodyObject = getRequestBodyObject;
const hasInputs = (schema) => (0, utils_1.instanceofZodType)(schema) && !(0, utils_1.instanceofZodTypeLikeVoid)((0, utils_1.unwrapZodType)(schema, true));
exports.hasInputs = hasInputs;
const errorResponseObjectByCode = {};
const errorResponseObject = (code = 'INTERNAL_SERVER_ERROR', message, issues) => {
    var _a;
    if (!errorResponseObjectByCode[code]) {
        errorResponseObjectByCode[code] = {
            description: message !== null && message !== void 0 ? message : 'An error response',
            content: {
                'application/json': {
                    schema: zod_1.z
                        .object({
                        message: zod_1.z.string().meta({
                            description: 'The error message',
                            example: message !== null && message !== void 0 ? message : 'Internal server error',
                        }),
                        code: zod_1.z.string().meta({
                            description: 'The error code',
                            example: code !== null && code !== void 0 ? code : 'INTERNAL_SERVER_ERROR',
                        }),
                        issues: zod_1.z
                            .array(zod_1.z.object({ message: zod_1.z.string() }))
                            .optional()
                            .meta({
                            description: 'An array of issues that were responsible for the error',
                            example: issues !== null && issues !== void 0 ? issues : [],
                        }),
                    })
                        .meta({
                        title: `${message !== null && message !== void 0 ? message : 'Internal server'} error (${(_a = adapters_1.TRPC_ERROR_CODE_HTTP_STATUS[code]) !== null && _a !== void 0 ? _a : 500})`,
                        description: 'The error information',
                        example: {
                            code: code !== null && code !== void 0 ? code : 'INTERNAL_SERVER_ERROR',
                            message: message !== null && message !== void 0 ? message : 'Internal server error',
                            issues: issues !== null && issues !== void 0 ? issues : [],
                        },
                        id: `error.${code}`,
                    }),
                },
            },
        };
    }
    return errorResponseObjectByCode[code];
};
exports.errorResponseObject = errorResponseObject;
const errorResponseFromStatusCode = (status) => {
    const code = adapters_1.HTTP_STATUS_TRPC_ERROR_CODE[status];
    const message = code && adapters_1.TRPC_ERROR_CODE_MESSAGE[code];
    return (0, exports.errorResponseObject)(code, message !== null && message !== void 0 ? message : 'Unknown error');
};
exports.errorResponseFromStatusCode = errorResponseFromStatusCode;
const errorResponseFromMessage = (status, message) => (0, exports.errorResponseObject)(adapters_1.HTTP_STATUS_TRPC_ERROR_CODE[status], message);
exports.errorResponseFromMessage = errorResponseFromMessage;
const getResponsesObject = (schema, httpMethod, headers, isProtected, hasInputs, successDescription, errorResponses) => (Object.assign({ 200: {
        description: successDescription !== null && successDescription !== void 0 ? successDescription : 'Successful response',
        headers: headers,
        content: {
            'application/json': {
                schema: (0, utils_1.instanceofZodTypeKind)(schema, 'void')
                    ? {}
                    : (0, utils_1.instanceofZodTypeKind)(schema, 'never') || (0, utils_1.instanceofZodTypeKind)(schema, 'undefined')
                        ? { not: {} }
                        : schema,
            },
        },
    } }, (errorResponses !== undefined
    ? Object.fromEntries(Array.isArray(errorResponses)
        ? errorResponses.map((x) => [x, (0, exports.errorResponseFromStatusCode)(x)])
        : Object.entries(errorResponses).map(([k, v]) => [
            k,
            (0, exports.errorResponseFromMessage)(Number(k), v),
        ]))
    : Object.assign(Object.assign(Object.assign({}, (isProtected
        ? {
            401: (0, exports.errorResponseObject)('UNAUTHORIZED', 'Authorization not provided'),
            403: (0, exports.errorResponseObject)('FORBIDDEN', 'Insufficient access'),
        }
        : {})), (hasInputs
        ? Object.assign({ 400: (0, exports.errorResponseObject)('BAD_REQUEST', 'Invalid input data') }, (httpMethod !== paths_1.HttpMethods.POST
            ? {
                404: (0, exports.errorResponseObject)('NOT_FOUND', 'Not found'),
            }
            : {})) : {})), { 500: (0, exports.errorResponseObject)('INTERNAL_SERVER_ERROR', 'Internal server error') }))));
exports.getResponsesObject = getResponsesObject;
//# sourceMappingURL=schema.js.map