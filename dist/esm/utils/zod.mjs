import { z } from 'zod';
export const instanceofZodType = (type) => {
    return !!type?._zod?.def?.type;
};
export const instanceofZodTypeKind = (type, zodTypeKind) => {
    return type?._zod?.def?.type === zodTypeKind;
};
export const instanceofZodTypeOptional = (type) => {
    return instanceofZodTypeKind(type, 'optional');
};
export const instanceofZodTypeObject = (type) => {
    return instanceofZodTypeKind(type, 'object');
};
export const instanceofZodTypeLikeVoid = (type) => {
    return (instanceofZodTypeKind(type, 'void') ||
        instanceofZodTypeKind(type, 'undefined') ||
        instanceofZodTypeKind(type, 'never'));
};
export const unwrapZodType = (type, unwrapPreprocess) => {
    // TODO: Allow parsing array query params
    if (instanceofZodTypeKind(type, 'array')) {
        return unwrapZodType(type.element, unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'enum')) {
        return unwrapZodType(z.string(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'nullable')) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'optional')) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'default')) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'prefault')) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'lazy')) {
        return unwrapZodType(type.def.getter(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, 'pipe') && unwrapPreprocess) {
        return unwrapZodType(type.def.out, unwrapPreprocess);
    }
    return type;
};
export const instanceofZodTypeLikeString = (_type) => {
    const type = unwrapZodType(_type, false);
    if (instanceofZodTypeKind(type, 'pipe')) {
        return true;
    }
    // TODO improve this
    if (instanceofZodTypeKind(type, 'union')) {
        return !type._def.options.some((option) => !instanceofZodTypeLikeString(option));
    }
    if (instanceofZodTypeKind(type, 'intersection')) {
        return (instanceofZodTypeLikeString(type.def.left) &&
            instanceofZodTypeLikeString(type.def.right));
    }
    if (instanceofZodTypeKind(type, 'literal')) {
        return typeof type.value === 'string';
    }
    if (instanceofZodTypeKind(type, 'enum')) {
        return !Object.values(type.enum).some((value) => typeof value === 'number');
    }
    return instanceofZodTypeKind(type, 'string');
};
export const zodSupportsCoerce = 'coerce' in z;
export const instanceofZodTypeCoercible = (_type) => {
    const type = unwrapZodType(_type, false);
    return (instanceofZodTypeKind(type, 'number') ||
        instanceofZodTypeKind(type, 'boolean') ||
        instanceofZodTypeKind(type, 'bigint') ||
        instanceofZodTypeKind(type, 'date'));
};
export const coerceSchema = (schema) => {
    Object.values(schema.shape).forEach((shapeSchema) => {
        const unwrappedShapeSchema = unwrapZodType(shapeSchema, false);
        if (instanceofZodTypeCoercible(unwrappedShapeSchema))
            unwrappedShapeSchema._def.coerce = true;
        else if (instanceofZodTypeObject(unwrappedShapeSchema))
            coerceSchema(unwrappedShapeSchema);
    });
};
//# sourceMappingURL=zod.js.map