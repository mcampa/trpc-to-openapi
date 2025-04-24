"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryPlaceholder = queryPlaceholder;
const zod_1 = require("zod");
function queryPlaceholder(schema) {
    const baseSchema = schema instanceof zod_1.ZodEffects ? schema._def.schema : schema;
    if (baseSchema instanceof zod_1.ZodDefault) {
        return baseSchema._def.defaultValue();
    }
    if (baseSchema instanceof zod_1.ZodOptional ||
        baseSchema instanceof zod_1.ZodNullable) {
        return queryPlaceholder(baseSchema._def.innerType);
    }
    if (baseSchema instanceof zod_1.ZodObject) {
        const shape = baseSchema.shape;
        const result = {};
        for (const key in shape) {
            result[key] = queryPlaceholder(shape[key]);
        }
        return result;
    }
    if (baseSchema instanceof zod_1.ZodArray) {
        return [queryPlaceholder(baseSchema.element)];
    }
    if (baseSchema instanceof zod_1.ZodUnion) {
        return queryPlaceholder(baseSchema._def.options[0]);
    }
    if (baseSchema instanceof zod_1.ZodLiteral) {
        return baseSchema._def.value;
    }
    if (baseSchema instanceof zod_1.ZodEnum) {
        return baseSchema._def.values[0];
    }
    if (baseSchema instanceof zod_1.ZodNativeEnum) {
        const enumValues = Object.values(baseSchema._def.values).filter(v => typeof v === 'string' || typeof v === 'number');
        return enumValues[0];
    }
    if (baseSchema instanceof zod_1.ZodRecord) {
        return { '<key>': queryPlaceholder(baseSchema._def.valueType) };
    }
    const constructorName = baseSchema.constructor.name.replace('Zod', '').toLowerCase();
    return `<${constructorName}>`;
}
//# sourceMappingURL=queryPlaceholder.js.map