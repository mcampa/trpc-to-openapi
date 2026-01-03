"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coerceSchema = exports.instanceofZodTypeCoercible = exports.zodSupportsCoerce = exports.instanceofZodTypeLikeString = exports.unwrapZodType = exports.instanceofZodTypeLikeVoid = exports.instanceofZodTypeObject = exports.instanceofZodTypeOptional = exports.instanceofZodTypeKind = exports.instanceofZodType = void 0;
const zod_1 = require("zod");
const instanceofZodType = (type) => {
    var _a, _b;
    return !!((_b = (_a = type === null || type === void 0 ? void 0 : type._zod) === null || _a === void 0 ? void 0 : _a.def) === null || _b === void 0 ? void 0 : _b.type);
};
exports.instanceofZodType = instanceofZodType;
const instanceofZodTypeKind = (type, zodTypeKind) => {
    var _a, _b;
    return ((_b = (_a = type === null || type === void 0 ? void 0 : type._zod) === null || _a === void 0 ? void 0 : _a.def) === null || _b === void 0 ? void 0 : _b.type) === zodTypeKind;
};
exports.instanceofZodTypeKind = instanceofZodTypeKind;
const instanceofZodTypeOptional = (type) => {
    return (0, exports.instanceofZodTypeKind)(type, 'optional');
};
exports.instanceofZodTypeOptional = instanceofZodTypeOptional;
const instanceofZodTypeObject = (type) => {
    return (0, exports.instanceofZodTypeKind)(type, 'object');
};
exports.instanceofZodTypeObject = instanceofZodTypeObject;
const instanceofZodTypeLikeVoid = (type) => {
    return ((0, exports.instanceofZodTypeKind)(type, 'void') ||
        (0, exports.instanceofZodTypeKind)(type, 'undefined') ||
        (0, exports.instanceofZodTypeKind)(type, 'never'));
};
exports.instanceofZodTypeLikeVoid = instanceofZodTypeLikeVoid;
const unwrapZodType = (type, unwrapPreprocess) => {
    // TODO: Allow parsing array query params
    if ((0, exports.instanceofZodTypeKind)(type, 'array')) {
        return (0, exports.unwrapZodType)(type.element, unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'enum')) {
        return (0, exports.unwrapZodType)(zod_1.z.string(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'nullable')) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'optional')) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'default')) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'prefault')) {
        return (0, exports.unwrapZodType)(type.unwrap(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'lazy')) {
        return (0, exports.unwrapZodType)(type.def.getter(), unwrapPreprocess);
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'pipe') && unwrapPreprocess) {
        return (0, exports.unwrapZodType)(type.def.out, unwrapPreprocess);
    }
    return type;
};
exports.unwrapZodType = unwrapZodType;
const instanceofZodTypeLikeString = (_type) => {
    const type = (0, exports.unwrapZodType)(_type, false);
    if ((0, exports.instanceofZodTypeKind)(type, 'pipe')) {
        return true;
    }
    // TODO improve this
    if ((0, exports.instanceofZodTypeKind)(type, 'union')) {
        return !type._def.options.some((option) => !(0, exports.instanceofZodTypeLikeString)(option));
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'intersection')) {
        return ((0, exports.instanceofZodTypeLikeString)(type.def.left) &&
            (0, exports.instanceofZodTypeLikeString)(type.def.right));
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'literal')) {
        return typeof type.value === 'string';
    }
    if ((0, exports.instanceofZodTypeKind)(type, 'enum')) {
        return !Object.values(type.enum).some((value) => typeof value === 'number');
    }
    return (0, exports.instanceofZodTypeKind)(type, 'string');
};
exports.instanceofZodTypeLikeString = instanceofZodTypeLikeString;
exports.zodSupportsCoerce = 'coerce' in zod_1.z;
const instanceofZodTypeCoercible = (_type) => {
    const type = (0, exports.unwrapZodType)(_type, false);
    return ((0, exports.instanceofZodTypeKind)(type, 'number') ||
        (0, exports.instanceofZodTypeKind)(type, 'boolean') ||
        (0, exports.instanceofZodTypeKind)(type, 'bigint') ||
        (0, exports.instanceofZodTypeKind)(type, 'date'));
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