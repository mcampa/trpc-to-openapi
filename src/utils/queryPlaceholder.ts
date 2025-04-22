import {
  z,
  ZodTypeAny,
  ZodObject,
  ZodOptional,
  ZodNullable,
  ZodDefault,
  ZodArray,
  ZodUnion,
  ZodEffects,
  ZodLiteral,
  ZodEnum,
  ZodNativeEnum,
  ZodRecord
} from 'zod';

export function queryPlaceholder(schema: ZodTypeAny): any {
  const baseSchema = schema instanceof ZodEffects ? schema._def.schema : schema;

  if (baseSchema instanceof ZodDefault) {
    return baseSchema._def.defaultValue();
  }

  if (
    baseSchema instanceof ZodOptional ||
    baseSchema instanceof ZodNullable
  ) {
    return queryPlaceholder(baseSchema._def.innerType);
  }

  if (baseSchema instanceof ZodObject) {
    const shape = baseSchema.shape;
    const result: Record<string, any> = {};
    for (const key in shape) {
      result[key] = queryPlaceholder(shape[key]);
    }
    return result;
  }

  if (baseSchema instanceof ZodArray) {
    return [queryPlaceholder(baseSchema.element)];
  }

  if (baseSchema instanceof ZodUnion) {
    return queryPlaceholder(baseSchema._def.options[0]);
  }

  if (baseSchema instanceof ZodLiteral) {
    return baseSchema._def.value;
  }

  if (baseSchema instanceof ZodEnum) {
    return baseSchema._def.values[0];
  }

  if (baseSchema instanceof ZodNativeEnum) {
    const enumValues = Object.values(baseSchema._def.values).filter(v => typeof v === 'string' || typeof v === 'number');
    return enumValues[0];
  }

  if (baseSchema instanceof ZodRecord) {
    return { '<key>': queryPlaceholder(baseSchema._def.valueType) };
  }

  const constructorName = baseSchema.constructor.name.replace('Zod', '').toLowerCase();
  return `<${constructorName}>`;
}
