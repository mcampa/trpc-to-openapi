import { ZodObject, ZodRawShape, ZodType, z } from 'zod';
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
  if (instanceofZodTypeKind(type, 'lazy')) {
    return unwrapZodType((type as z.ZodLazy<$ZodTypes>).def.getter(), unwrapPreprocess);
  }
  if (instanceofZodTypeKind(type, 'pipe') && unwrapPreprocess) {
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

export const coerceSchema = (schema: ZodObject<ZodRawShape>) => {
  Object.values(schema.shape).forEach((shapeSchema) => {
    const unwrappedShapeSchema = unwrapZodType(shapeSchema, false);
    if (instanceofZodTypeCoercible(unwrappedShapeSchema)) unwrappedShapeSchema._def.coerce = true;
    else if (instanceofZodTypeObject(unwrappedShapeSchema)) coerceSchema(unwrappedShapeSchema);
  });
};
