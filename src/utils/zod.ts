import { z } from 'zod/v4';
import type { ZodObject, ZodRawShape, ZodType } from 'zod/v4';
import type { $ZodType, $ZodTypes } from 'zod/v4/core';
import type { $ZodTypeDef } from 'zod/v4/core/schemas';

export const instanceofZodType = (type: any): type is $ZodTypes => {
  return !!type?._zod?.def?.type;
};

export const instanceofZodTypeKind = <Z extends $ZodTypeDef['type']>(
  type: $ZodType,
  zodTypeKind: Z,
): type is $ZodTypes => {
  return type?._zod?.def?.type === zodTypeKind;
};

export const instanceofZodTypeOptional = (type: $ZodType): type is z.ZodOptional<$ZodTypes> => {
  return instanceofZodTypeKind(type, 'optional');
};

export const instanceofZodTypeObject = (type: $ZodType): type is z.ZodObject<z.ZodRawShape> => {
  return instanceofZodTypeKind(type, 'object');
};

export type ZodTypeLikeVoid = z.ZodVoid | z.ZodUndefined | z.ZodNever;

export const instanceofZodTypeLikeVoid = (type: $ZodType): type is ZodTypeLikeVoid => {
  return (
    instanceofZodTypeKind(type, 'void') ||
    instanceofZodTypeKind(type, 'undefined') ||
    instanceofZodTypeKind(type, 'never')
  );
};

export const unwrapZodType = (type: $ZodType, unwrapPreprocess: boolean): ZodType => {
  // TODO: Allow parsing array query params
  if (instanceofZodTypeKind(type, 'array')) {
    return unwrapZodType((type as z.ZodArray<$ZodTypes>).element, unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'enum')) {
    return unwrapZodType(z.string(), unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'nullable')) {
    return unwrapZodType((type as z.ZodNullable<$ZodTypes>).unwrap(), unwrapPreprocess);
  }

  if (instanceofZodTypeKind(type, 'optional')) {
    return unwrapZodType((type as z.ZodOptional<$ZodTypes>).unwrap(), unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'default')) {
    return unwrapZodType((type as z.ZodDefault<$ZodTypes>).unwrap(), unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'prefault')) {
    return unwrapZodType((type as z.ZodDefault<$ZodTypes>).unwrap(), unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'lazy')) {
    return unwrapZodType((type as z.ZodLazy<$ZodTypes>).def.getter(), unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'pipe') && unwrapPreprocess) {
    // For .transform() pipes in Zod 4, def.out is a 'transform' type -
    // use def.in (the input schema shape) instead
    if (instanceofZodTypeKind((type as z.ZodPipe<$ZodTypes>)._zod.def.out, 'transform')) {
      return unwrapZodType((type as z.ZodPipe<$ZodTypes>)._zod.def.in, unwrapPreprocess);
    }
    return unwrapZodType((type as z.ZodPipe<$ZodTypes>).def.out, unwrapPreprocess);
  }
  return type as ZodType;
};

export const instanceofZodTypeLikeString = (
  _type: $ZodType,
): boolean /* : _type is ZodTypeLikeString  */ => {
  const type = unwrapZodType(_type, false);

  if (instanceofZodTypeKind(type, 'pipe')) {
    return true;
  }

  // TODO improve this
  if (instanceofZodTypeKind(type, 'union')) {
    return !(type as any)._def.options.some((option: any) => !instanceofZodTypeLikeString(option));
  }

  if (instanceofZodTypeKind(type, 'intersection')) {
    return (
      instanceofZodTypeLikeString((type as z.ZodIntersection<$ZodTypes, $ZodTypes>).def.left) &&
      instanceofZodTypeLikeString((type as z.ZodIntersection<$ZodTypes, $ZodTypes>).def.right)
    );
  }

  if (instanceofZodTypeKind(type, 'literal')) {
    return typeof (type as z.ZodLiteral<any>).value === 'string';
  }

  if (instanceofZodTypeKind(type, 'enum')) {
    return !Object.values((type as z.ZodEnum<any>).enum).some((value) => typeof value === 'number');
  }

  return instanceofZodTypeKind(type, 'string');
};

export const zodSupportsCoerce = 'coerce' in z;

export type ZodTypeCoercible = z.ZodNumber | z.ZodBoolean | z.ZodBigInt | z.ZodDate;

export const instanceofZodTypeCoercible = (_type: $ZodType): _type is ZodTypeCoercible => {
  const type = unwrapZodType(_type, false);
  return (
    instanceofZodTypeKind(type, 'number') ||
    instanceofZodTypeKind(type, 'boolean') ||
    instanceofZodTypeKind(type, 'bigint') ||
    instanceofZodTypeKind(type, 'date')
  );
};

/**
 * @deprecated The adapters call `coerceInput` instead. This sets zod's `coerce` flag on the schema,
 * which changes it for every later parse, and zod's coercion also converts values that are not
 * strings, such as `null` to `0`.
 */
export const coerceSchema = (schema: ZodObject<ZodRawShape>) => {
  Object.values(schema.shape).forEach((shapeSchema) => {
    const unwrappedShapeSchema = unwrapZodType(shapeSchema, false);
    if (instanceofZodTypeCoercible(unwrappedShapeSchema)) unwrappedShapeSchema._def.coerce = true;
    else if (instanceofZodTypeObject(unwrappedShapeSchema)) coerceSchema(unwrappedShapeSchema);
  });
};

/**
 * Converts each string in a procedure's `input` that `schema` expects to be a number, boolean,
 * bigint or date, because query and path parameters always arrive as strings, and each safe integer
 * that it expects to be a bigint. Any other value, such as `null` or `true` in a JSON body, is left
 * for the schema to validate, and so is a field declared with `z.coerce`. Objects and arrays are
 * copied rather than changed, and the schema is not changed.
 */
export const coerceInput = (schema: $ZodType, input: unknown): unknown => {
  return coerceValue(unwrapZodInputSide(schema), input);
};

/**
 * The schema that first receives a procedure's input: through `optional` and similar wrappers, and
 * through a pipe to its input side when that is an object, as for `z.object(...).transform(...)`.
 * For `z.preprocess`, whose input side is a function, it is the schema after the function.
 */
export const unwrapZodInputSide = (schema: $ZodType): $ZodType => {
  const type = unwrapZodWrappers(schema);
  if (!instanceofZodTypeKind(type, 'pipe')) return type;
  const { in: inSchema, out: outSchema } = (type as z.ZodPipe<$ZodTypes, $ZodTypes>)._zod.def;
  const inputSide = unwrapZodInputSide(inSchema);
  if (instanceofZodTypeObject(inputSide)) return inputSide;
  return unwrapZodInputSide(outSchema);
};

const coerceValue = (schema: $ZodType, input: unknown): unknown => {
  const type = unwrapZodWrappers(schema);

  if (instanceofZodTypeKind(type, 'array')) {
    if (!Array.isArray(input)) return input;
    const element = (type as z.ZodArray<$ZodTypes>).element;
    return input.map((item) => coerceValue(element, item));
  }

  if (instanceofZodTypeObject(type)) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
    // Not a spread: the CommonJS build compiles it to `Object.assign`, which would let a
    // `__proto__` key in the JSON set the copy's prototype.
    const coerced: Record<string, unknown> = Object.fromEntries(Object.entries(input));
    for (const [key, shapeSchema] of Object.entries(type.shape)) {
      // Not `in`, which would also match inherited names such as `constructor`.
      if (Object.prototype.hasOwnProperty.call(coerced, key)) {
        coerced[key] = coerceValue(shapeSchema, coerced[key]);
      }
    }
    return coerced;
  }

  // A `z.coerce` field converts the value itself, by zod's rules.
  if (instanceofZodTypeCoercible(type) && type._zod.def.coerce) return input;
  if (typeof input === 'string') return coerceString(type, input);
  // JSON has no bigint, and the OpenAPI document describes one as an integer. `JSON.parse` may
  // have rounded a number outside the safe integer range, so that is left for zod to refuse.
  if (
    instanceofZodTypeKind(type, 'bigint') &&
    typeof input === 'number' &&
    Number.isSafeInteger(input)
  ) {
    return BigInt(input);
  }
  return input;
};

const unwrapZodWrappers = (type: $ZodType): $ZodType => {
  if (
    instanceofZodTypeKind(type, 'optional') ||
    instanceofZodTypeKind(type, 'nullable') ||
    instanceofZodTypeKind(type, 'default') ||
    instanceofZodTypeKind(type, 'prefault')
  ) {
    return unwrapZodWrappers((type as z.ZodOptional<$ZodTypes>).unwrap());
  }
  if (instanceofZodTypeKind(type, 'lazy')) {
    return unwrapZodWrappers((type as z.ZodLazy<$ZodTypes>).def.getter());
  }
  return type;
};

const coerceString = (type: $ZodType, value: string): unknown => {
  // Number('') and BigInt('') are 0, but an empty parameter is not a zero.
  if (value.trim() === '') return value;
  if (instanceofZodTypeKind(type, 'number')) return Number(value);
  if (instanceofZodTypeKind(type, 'date')) return new Date(value);
  if (instanceofZodTypeKind(type, 'bigint')) {
    try {
      return BigInt(value);
    } catch {
      return value;
    }
  }
  // Boolean('false') is true, so only these two strings are converted.
  if (instanceofZodTypeKind(type, 'boolean')) {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
};
