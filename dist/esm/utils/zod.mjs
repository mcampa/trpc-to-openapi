import { z } from 'zod';
export const instanceofZodType = (type) => {
    return !!type?._def?.typeName;
};
export const instanceofZodTypeKind = (type, zodTypeKind) => {
    return type?._def?.typeName === zodTypeKind;
};
export const instanceofZodTypeOptional = (type) => {
    return instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodOptional);
};
export const instanceofZodTypeObject = (type) => {
    return instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodObject);
};
export const instanceofZodTypeLikeVoid = (type) => {
    return (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodVoid) ||
        instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodUndefined) ||
        instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodNever));
};
export const unwrapZodType = (type, unwrapPreprocess) => {
    // TODO: Allow parsing array query params
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodArray)) {
        return unwrapZodType(type.element, unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodEnum)) {
        return unwrapZodType(z.string(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodNullable)) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodBranded)) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodOptional)) {
        return unwrapZodType(type.unwrap(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodDefault)) {
        return unwrapZodType(type.removeDefault(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodLazy)) {
        return unwrapZodType(type._def.getter(), unwrapPreprocess);
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodEffects)) {
        if (type._def.effect.type === 'refinement') {
            return unwrapZodType(type._def.schema, unwrapPreprocess);
        }
        if (type._def.effect.type === 'transform') {
            return unwrapZodType(type._def.schema, unwrapPreprocess);
        }
        if (unwrapPreprocess && type._def.effect.type === 'preprocess') {
            return unwrapZodType(type._def.schema, unwrapPreprocess);
        }
    }
    return type;
};
export const instanceofZodTypeLikeString = (_type) => {
    const type = unwrapZodType(_type, false);
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodEffects)) {
        if (type._def.effect.type === 'preprocess') {
            return true;
        }
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodUnion)) {
        return !type._def.options.some((option) => !instanceofZodTypeLikeString(option));
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodIntersection)) {
        return (instanceofZodTypeLikeString(type._def.left) && instanceofZodTypeLikeString(type._def.right));
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodLiteral)) {
        return typeof type._def.value === 'string';
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodEnum)) {
        return true;
    }
    if (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodNativeEnum)) {
        return !Object.values(type._def.values).some((value) => typeof value === 'number');
    }
    return instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodString);
};
export const zodSupportsCoerce = 'coerce' in z;
export const instanceofZodTypeCoercible = (_type) => {
    const type = unwrapZodType(_type, false);
    return (instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodNumber) ||
        instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodBoolean) ||
        instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodBigInt) ||
        instanceofZodTypeKind(type, z.ZodFirstPartyTypeKind.ZodDate));
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