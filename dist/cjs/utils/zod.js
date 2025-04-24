"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coerceSchema = exports.instanceofZodTypeCoercible = exports.zodSupportsCoerce = exports.instanceofZodTypeLikeString = exports.unwrapZodType = exports.instanceofZodTypeLikeVoid = exports.instanceofZodTypeObject = exports.instanceofZodTypeOptional = exports.instanceofZodTypeKind = exports.instanceofZodType = void 0;
const zod_1 = require("zod");
const instanceofZodType = (type) => {
    var _a;
    return !!((_a = type === null || type === void 0 ? void 0 : type._def) === null || _a === void 0 ? void 0 : _a.typeName);
};
exports.instanceofZodType = instanceofZodType;
const instanceofZodTypeKind = (type, zodTypeKind) => {
    var _a;
    return ((_a = type === null || type === void 0 ? void 0 : type._def) === null || _a === void 0 ? void 0 : _a.typeName) === zodTypeKind;
};
exports.instanceofZodTypeKind = instanceofZodTypeKind;
const instanceofZodTypeOptional = (type) => {
    return (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodOptional);
};
exports.instanceofZodTypeOptional = instanceofZodTypeOptional;
const instanceofZodTypeObject = (type) => {
    return (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodObject);
};
exports.instanceofZodTypeObject = instanceofZodTypeObject;
const instanceofZodTypeLikeVoid = (type) => {
    return ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodVoid) ||
        (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodUndefined) ||
        (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodNever));
};
exports.instanceofZodTypeLikeVoid = instanceofZodTypeLikeVoid;
const unwrapZodType = (type, unwrapPreprocess) => {
    // TODO: Allow parsing array query params
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodArray)) {
        return (0, exports.unwrapZodType)(type.element, unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodEnum)) {
        return (0, exports.unwrapZodType)(zod_1.z.string(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodNullable)) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodBranded)) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodOptional)) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodDefault)) {
        return (0, exports.unwrapZodType)(type.removeDefault(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodLazy)) {
        return (0, exports.unwrapZodType)(type._def.getter(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodEffects)) {
        if (type._def.effect.type === 'refinement') {
            return (0, exports.unwrapZodType)(type._def.schema, unwrapPreprocess);
        }
        if (type._def.effect.type === 'transform') {
            return (0, exports.unwrapZodType)(type._def.schema, unwrapPreprocess);
        }
        if (unwrapPreprocess && type._def.effect.type === 'preprocess') {
            return (0, exports.unwrapZodType)(type._def.schema, unwrapPreprocess);
        }
    }
    return type;
};
exports.unwrapZodType = unwrapZodType;
const instanceofZodTypeLikeString = (_type) => {
    const type = (0, exports.unwrapZodType)(_type, false);
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodEffects)) {
        if (type._def.effect.type === 'preprocess') {
            return true;
        }
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodUnion)) {
        return !type._def.options.some((option) => !(0, exports.instanceofZodTypeLikeString)(option));
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodIntersection)) {
        return ((0, exports.instanceofZodTypeLikeString)(type._def.left) && (0, exports.instanceofZodTypeLikeString)(type._def.right));
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodLiteral)) {
        return typeof type._def.value === 'string';
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodEnum)) {
        return true;
    }
    if ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodNativeEnum)) {
        return !Object.values(type._def.values).some((value) => typeof value === 'number');
    }
    return (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodString);
};
exports.instanceofZodTypeLikeString = instanceofZodTypeLikeString;
exports.zodSupportsCoerce = 'coerce' in zod_1.z;
const instanceofZodTypeCoercible = (_type) => {
    const type = (0, exports.unwrapZodType)(_type, false);
    return ((0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodNumber) ||
        (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodBoolean) ||
        (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodBigInt) ||
        (0, exports.instanceofZodTypeKind)(type, zod_1.z.ZodFirstPartyTypeKind.ZodDate));
};
exports.instanceofZodTypeCoercible = instanceofZodTypeCoercible;
const coerceSchema = (schema) => {
    Object.values(schema.shape).forEach((shapeSchema) => {
        const unwrappedShapeSchema = (0, exports.unwrapZodType)(shapeSchema, false);
        if ((0, exports.instanceofZodTypeCoercible)(unwrappedShapeSchema))
            unwrappedShapeSchema._def.coerce = true;
        else if ((0, exports.instanceofZodTypeObject)(unwrappedShapeSchema))
            (0, exports.coerceSchema)(unwrappedShapeSchema);
    });
};
exports.coerceSchema = coerceSchema;
//# sourceMappingURL=zod.js.map