import { z } from 'zod/v4';
import type { ZodObject, ZodRawShape, ZodType } from 'zod/v4';
import type {
  $ZodArray,
  $ZodBigInt,
  $ZodBoolean,
  $ZodCatch,
  $ZodDate,
  $ZodDefault,
  $ZodEnum,
  $ZodIntersection,
  $ZodLazy,
  $ZodLiteral,
  $ZodNever,
  $ZodNonOptional,
  $ZodNullable,
  $ZodNumber,
  $ZodObject,
  $ZodOptional,
  $ZodPipe,
  $ZodPrefault,
  $ZodReadonly,
  $ZodRecord,
  $ZodString,
  $ZodTransform,
  $ZodTuple,
  $ZodType,
  $ZodTypes,
  $ZodUndefined,
  $ZodUnion,
  $ZodVoid,
} from 'zod/v4/core';
import { isPlainObject, sanitizeInput, setOwn } from './object';

/**
 * Maps each schema kind to the concrete zod type carrying its definition.
 * `instanceofZodTypeKind` narrows with this map, so `_zod.def` can be read
 * without casting to `any`.
 */
interface ZodKindMap {
  array: $ZodArray;
  bigint: $ZodBigInt;
  boolean: $ZodBoolean;
  catch: $ZodCatch;
  date: $ZodDate;
  default: $ZodDefault;
  enum: $ZodEnum;
  intersection: $ZodIntersection;
  lazy: $ZodLazy;
  literal: $ZodLiteral;
  never: $ZodNever;
  nonoptional: $ZodNonOptional;
  nullable: $ZodNullable;
  number: $ZodNumber;
  object: $ZodObject;
  optional: $ZodOptional;
  pipe: $ZodPipe;
  prefault: $ZodPrefault;
  readonly: $ZodReadonly;
  record: $ZodRecord;
  string: $ZodString;
  transform: $ZodTransform;
  tuple: $ZodTuple;
  undefined: $ZodUndefined;
  union: $ZodUnion;
  void: $ZodVoid;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Whether `type` is a zod schema. The library consumes classic zod schemas,
 * which is what `zod/v4` exports; the check inspects the shared core marker.
 */
export const instanceofZodType = (type: unknown): type is ZodType => {
  if (!isObject(type)) {
    return false;
  }

  const zod = type._zod;
  if (!isObject(zod)) {
    return false;
  }

  const def = zod.def;
  return isObject(def) && typeof def.type === 'string';
};

export const instanceofZodTypeKind = <K extends keyof ZodKindMap>(
  type: $ZodType,
  zodTypeKind: K,
): type is ZodKindMap[K] => {
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

/**
 * Recursion state shared by one traversal of a schema. The sets are
 * path-scoped: an entry is removed once that branch is done, so a schema that
 * is reused by siblings is traversed again.
 */
interface ZodTraversalState {
  lazies: Set<$ZodType>;
  pipes: Set<$ZodType>;
}

const createTraversalState = (): ZodTraversalState => ({
  lazies: new Set(),
  pipes: new Set(),
});

/**
 * Resolves a lazy schema's getter while that lazy schema is on the current
 * path. Lazy getters may return a new instance on every call, so the lazy
 * schema itself is tracked, and a cycle returns `onCycle()`.
 */
const withLazyResolution = <T>(
  type: $ZodLazy,
  state: ZodTraversalState,
  onCycle: () => T,
  resolve: (inner: $ZodType) => T,
): T => {
  if (state.lazies.has(type)) {
    return onCycle();
  }
  state.lazies.add(type);
  try {
    return resolve(type._zod.def.getter());
  } finally {
    state.lazies.delete(type);
  }
};

const unwrapZodTypeInternal = (
  type: $ZodType,
  unwrapPreprocess: boolean,
  state: ZodTraversalState,
): $ZodType => {
  // TODO: Allow parsing array query params
  if (instanceofZodTypeKind(type, 'array')) {
    return unwrapZodTypeInternal(type._zod.def.element, unwrapPreprocess, state);
  }
  if (instanceofZodTypeKind(type, 'enum')) {
    return unwrapZodTypeInternal(z.string(), unwrapPreprocess, state);
  }
  if (instanceofZodTypeKind(type, 'nullable')) {
    return unwrapZodTypeInternal(type._zod.def.innerType, unwrapPreprocess, state);
  }

  if (instanceofZodTypeKind(type, 'optional')) {
    return unwrapZodTypeInternal(type._zod.def.innerType, unwrapPreprocess, state);
  }
  if (instanceofZodTypeKind(type, 'default')) {
    return unwrapZodTypeInternal(type._zod.def.innerType, unwrapPreprocess, state);
  }
  if (instanceofZodTypeKind(type, 'prefault')) {
    return unwrapZodTypeInternal(type._zod.def.innerType, unwrapPreprocess, state);
  }
  if (instanceofZodTypeKind(type, 'lazy')) {
    return withLazyResolution(
      type,
      state,
      () => type,
      (inner) => unwrapZodTypeInternal(inner, unwrapPreprocess, state),
    );
  }
  if (instanceofZodTypeKind(type, 'pipe') && unwrapPreprocess) {
    // For .transform() pipes in Zod 4, def.out is a 'transform' type -
    // use def.in (the input schema shape) instead
    if (instanceofZodTypeKind(type._zod.def.out, 'transform')) {
      return unwrapZodTypeInternal(type._zod.def.in, unwrapPreprocess, state);
    }
    return unwrapZodTypeInternal(type._zod.def.out, unwrapPreprocess, state);
  }
  return type;
};

/**
 * Returns the classic `ZodType` view of an unwrapped schema. The library only
 * accepts classic zod schemas (the imports come from `zod/v4`), so this is a
 * boundary cast; internally the walker stays on the core `$ZodType` types.
 */
export const unwrapZodType = (type: $ZodType, unwrapPreprocess: boolean): ZodType => {
  return unwrapZodTypeInternal(type, unwrapPreprocess, createTraversalState()) as ZodType;
};

const instanceofZodTypeLikeStringInternal = (
  type: $ZodType,
  state: ZodTraversalState,
): boolean /* : type is ZodTypeLikeString  */ => {
  // Resolve lazy schemas here, keeping the lazy on the traversal path for the
  // whole recursive descent. `unwrapZodType` cannot be used: a getter that
  // builds a new union on every call would never be detected as a cycle.
  if (instanceofZodTypeKind(type, 'lazy')) {
    if (state.lazies.has(type)) {
      return false;
    }
    state.lazies.add(type);
    try {
      return instanceofZodTypeLikeStringInternal(type._zod.def.getter(), state);
    } finally {
      state.lazies.delete(type);
    }
  }

  if (
    instanceofZodTypeKind(type, 'optional') ||
    instanceofZodTypeKind(type, 'nullable') ||
    instanceofZodTypeKind(type, 'default') ||
    instanceofZodTypeKind(type, 'prefault')
  ) {
    return instanceofZodTypeLikeStringInternal(type._zod.def.innerType, state);
  }

  if (instanceofZodTypeKind(type, 'array')) {
    return instanceofZodTypeLikeStringInternal(type._zod.def.element, state);
  }

  if (instanceofZodTypeKind(type, 'pipe')) {
    return true;
  }

  // TODO improve this
  if (instanceofZodTypeKind(type, 'union')) {
    return !type._zod.def.options.some(
      (option) => !instanceofZodTypeLikeStringInternal(option, state),
    );
  }

  if (instanceofZodTypeKind(type, 'intersection')) {
    return (
      instanceofZodTypeLikeStringInternal(type._zod.def.left, state) &&
      instanceofZodTypeLikeStringInternal(type._zod.def.right, state)
    );
  }

  if (instanceofZodTypeKind(type, 'literal')) {
    return type._zod.def.values.every((value) => typeof value === 'string');
  }

  if (instanceofZodTypeKind(type, 'enum')) {
    return !Object.values(type._zod.def.entries).some((value) => typeof value === 'number');
  }

  return instanceofZodTypeKind(type, 'string');
};

export const instanceofZodTypeLikeString = (
  _type: $ZodType,
): boolean /* : _type is ZodTypeLikeString  */ => {
  return instanceofZodTypeLikeStringInternal(_type, createTraversalState());
};

export const zodSupportsCoerce = 'coerce' in z;

export type ZodTypeCoercible = z.ZodNumber | z.ZodBoolean | z.ZodBigInt | z.ZodDate;

export const instanceofZodTypeCoercible = (_type: $ZodType): _type is ZodTypeCoercible => {
  const type = unwrapZodWrappersInternal(_type, createTraversalState());
  return isCoercibleType(type);
};

/**
 * @deprecated The adapters call `coerceInput` instead. This sets zod's `coerce` flag on the schema,
 * which changes it for every later parse, and zod's coercion also converts values that are not
 * strings, such as `null` to `0`.
 */
export const coerceSchema = (schema: ZodObject<ZodRawShape>) => {
  coerceSchemaInternal(schema, createTraversalState());
};

const coerceSchemaInternal = (schema: $ZodType, state: ZodTraversalState): void => {
  // Handle lazy schemas here rather than through `unwrapZodType`: the lazy must
  // stay on the traversal path for the whole recursive descent, otherwise a
  // getter that returns a new instance on every call never terminates.
  if (instanceofZodTypeKind(schema, 'lazy')) {
    if (state.lazies.has(schema)) {
      return;
    }
    state.lazies.add(schema);
    try {
      coerceSchemaInternal(schema._zod.def.getter(), state);
    } finally {
      state.lazies.delete(schema);
    }
    return;
  }

  if (
    instanceofZodTypeKind(schema, 'optional') ||
    instanceofZodTypeKind(schema, 'nullable') ||
    instanceofZodTypeKind(schema, 'default') ||
    instanceofZodTypeKind(schema, 'prefault')
  ) {
    coerceSchemaInternal(schema._zod.def.innerType, state);
    return;
  }

  if (
    instanceofZodTypeKind(schema, 'catch') ||
    instanceofZodTypeKind(schema, 'readonly') ||
    instanceofZodTypeKind(schema, 'nonoptional')
  ) {
    coerceSchemaInternal(schema._zod.def.innerType, state);
    return;
  }

  if (instanceofZodTypeKind(schema, 'array')) {
    coerceSchemaInternal(schema._zod.def.element, state);
    return;
  }

  if (instanceofZodTypeKind(schema, 'pipe')) {
    coerceSchemaInternal(schema._zod.def.in, state);
    return;
  }

  if (instanceofZodTypeCoercible(schema)) {
    schema._zod.def.coerce = true;
    return;
  }

  if (instanceofZodTypeObject(schema)) {
    for (const shapeSchema of Object.values(schema.shape)) {
      coerceSchemaInternal(shapeSchema, state);
    }
  }
};

// Strict decimal only: optional sign, digits with optional fraction (".5" and
// "5." included) and an optional exponent. Rejects hex, whitespace,
// "Infinity", "NaN" and the empty string.
const DECIMAL_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const INTEGER_STRING = /^[+-]?\d+$/;

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Unwraps common zod wrappers so coercion reaches the schema that receives the
 * value. Pipes use their input side when it is an object, as in
 * `z.object(...).transform(...)`, and their output side otherwise.
 */
const unwrapZodWrappersInternal = (type: $ZodType, state: ZodTraversalState): $ZodType => {
  if (
    instanceofZodTypeKind(type, 'optional') ||
    instanceofZodTypeKind(type, 'nullable') ||
    instanceofZodTypeKind(type, 'default') ||
    instanceofZodTypeKind(type, 'prefault')
  ) {
    return unwrapZodWrappersInternal(type._zod.def.innerType, state);
  }
  if (
    instanceofZodTypeKind(type, 'catch') ||
    instanceofZodTypeKind(type, 'readonly') ||
    instanceofZodTypeKind(type, 'nonoptional')
  ) {
    return unwrapZodWrappersInternal(type._zod.def.innerType, state);
  }
  if (instanceofZodTypeKind(type, 'lazy')) {
    return withLazyResolution(
      type,
      state,
      () => type,
      (inner) => unwrapZodWrappersInternal(inner, state),
    );
  }
  if (instanceofZodTypeKind(type, 'pipe')) {
    const { in: inSchema, out: outSchema } = type._zod.def;
    const inputSide = unwrapZodWrappersInternal(inSchema, state);
    if (instanceofZodTypeObject(inputSide)) {
      return inputSide;
    }
    return unwrapZodWrappersInternal(outSchema, state);
  }
  return type;
};

const unwrapPipeInputSide = (type: $ZodPipe, state: ZodTraversalState): $ZodType => {
  if (state.pipes.has(type)) {
    return type;
  }
  state.pipes.add(type);
  try {
    const { in: inSchema, out: outSchema } = type._zod.def;
    const inputSide = unwrapZodInputSideInternal(inSchema, state);
    if (instanceofZodTypeObject(inputSide)) return inputSide;
    return unwrapZodInputSideInternal(outSchema, state);
  } finally {
    state.pipes.delete(type);
  }
};

const unwrapZodInputSideInternal = (schema: $ZodType, state: ZodTraversalState): $ZodType => {
  if (instanceofZodTypeKind(schema, 'pipe')) {
    return unwrapPipeInputSide(schema, state);
  }
  const type = unwrapZodWrappersInternal(schema, state);
  if (instanceofZodTypeKind(type, 'pipe')) {
    return unwrapPipeInputSide(type, state);
  }
  return type;
};

/**
 * The schema that first receives a procedure's input: through `optional` and similar wrappers, and
 * through a pipe to its input side when that is an object, as for `z.object(...).transform(...)`.
 * For `z.preprocess`, whose input side is a function, it is the schema after the function.
 */
export const unwrapZodInputSide = (schema: $ZodType): $ZodType => {
  return unwrapZodInputSideInternal(schema, createTraversalState());
};

export type CoercionMode = 'query' | 'body';

const createUtcDate = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): Date | undefined => {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  // A calendar round-trip rejects impossible dates such as 2020-02-30 and
  // out-of-range times such as 24:00, which the Date constructor would roll
  // over silently.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return undefined;
  }
  return date;
};

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// Date-time per RFC 3339: the offset is required. Seconds and fractions are
// optional but may only appear together when the fraction follows seconds.
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

const parseStrictIsoDate = (value: string): Date | undefined => {
  const dateOnly = ISO_DATE_ONLY.exec(value);
  if (dateOnly) {
    return createUtcDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), 0, 0, 0, 0);
  }

  const dateTime = ISO_DATE_TIME.exec(value);
  if (!dateTime) {
    return undefined;
  }

  const fraction = dateTime[7];
  const date = createUtcDate(
    Number(dateTime[1]),
    Number(dateTime[2]),
    Number(dateTime[3]),
    Number(dateTime[4]),
    Number(dateTime[5]),
    dateTime[6] === undefined ? 0 : Number(dateTime[6]),
    fraction === undefined ? 0 : Number((fraction + '000').slice(0, 3)),
  );
  if (!date) {
    return undefined;
  }

  const sign = dateTime[8];
  if (sign !== undefined) {
    const offsetHours = Number(dateTime[9]);
    const offsetMinutes = Number(dateTime[10]);
    if (offsetHours > 23 || offsetMinutes > 59) {
      return undefined;
    }
    const offset = (offsetHours * 60 + offsetMinutes) * (sign === '-' ? -1 : 1);
    date.setTime(date.getTime() - offset * 60_000);
  }
  return date;
};

const coerceString = (type: $ZodType, value: string, mode: CoercionMode): unknown => {
  // Number('') and BigInt('') are 0, but an empty parameter is not a zero.
  if (value.trim() === '') return value;

  if (instanceofZodTypeKind(type, 'number')) {
    if (mode === 'body') {
      return Number(value);
    }
    if (!DECIMAL_STRING.test(value)) return value;
    // Leave integers outside the safe range as strings so zod rejects them
    // instead of silently rounding to a different number.
    if (INTEGER_STRING.test(value) && !Number.isSafeInteger(Number(value))) return value;
    return Number(value);
  }

  if (instanceofZodTypeKind(type, 'date')) {
    if (mode === 'body') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date;
    }
    return parseStrictIsoDate(value) ?? value;
  }

  if (instanceofZodTypeKind(type, 'bigint')) {
    if (mode === 'body') {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
    return INTEGER_STRING.test(value) ? BigInt(value) : value;
  }

  // Boolean('false') is true, so only these two strings are converted.
  if (instanceofZodTypeKind(type, 'boolean')) {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
};

const inputJavascriptKind = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value;
};

const zodSchemaKind = (schema: $ZodType, state: ZodTraversalState): string | undefined => {
  const unwrapped = unwrapZodWrappersInternal(schema, state);

  // A literal with several values matches when every value has the same
  // JavaScript kind; mixed literals match any input kind.
  if (instanceofZodTypeKind(unwrapped, 'literal')) {
    const kinds = new Set(unwrapped._zod.def.values.map((value) => inputJavascriptKind(value)));
    return kinds.size === 1 ? kinds.values().next().value : undefined;
  }

  switch (unwrapped._zod.def.type) {
    case 'object':
    case 'record':
    case 'intersection':
      return 'object';
    case 'array':
    case 'tuple':
      return 'array';
    case 'string':
    case 'enum':
    case 'template_literal':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'bigint':
      return 'bigint';
    case 'date':
      return 'date';
    case 'null':
      return 'null';
    case 'void':
    case 'undefined':
    case 'never':
      return 'undefined';
    default:
      // Unions and unknown kinds match any input kind.
      return undefined;
  }
};

const zodSchemaMatchesInput = (
  schema: $ZodType,
  input: unknown,
  state: ZodTraversalState,
): boolean => {
  const unwrapped = unwrapZodWrappersInternal(schema, state);
  if (instanceofZodTypeKind(unwrapped, 'union')) {
    return unwrapped._zod.def.options.some((option) => zodSchemaMatchesInput(option, input, state));
  }
  const kind = zodSchemaKind(unwrapped, state);
  return kind === undefined || kind === inputJavascriptKind(input);
};

const findDiscriminatedUnionOption = (
  options: readonly $ZodType[],
  discriminator: string,
  value: unknown,
  state: ZodTraversalState,
): $ZodType | undefined => {
  for (const option of options) {
    const unwrapped = unwrapZodWrappersInternal(option, state);
    if (!instanceofZodTypeObject(unwrapped)) continue;
    if (!hasOwn(unwrapped.shape, discriminator)) continue;
    const discriminatorSchema = unwrapZodWrappersInternal(unwrapped.shape[discriminator]!, state);
    if (
      instanceofZodTypeKind(discriminatorSchema, 'literal') &&
      discriminatorSchema._zod.def.values.some((candidate) => candidate === value)
    ) {
      return option;
    }
  }
  return undefined;
};

/** Copies an object's own enumerable keys into a normal-prototype object. */
const copyObjectForCoercion = (input: Record<string, unknown>): Record<string, unknown> => {
  if (isPlainObject(input)) {
    return sanitizeInput(input);
  }

  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (key === '__proto__') continue;
    setOwn(copy, key, Reflect.get(input, key));
  }
  return copy;
};

type ZodCoercibleCore = $ZodNumber | $ZodBoolean | $ZodBigInt | $ZodDate;

const isCoercibleType = (type: $ZodType): type is ZodCoercibleCore =>
  instanceofZodTypeKind(type, 'number') ||
  instanceofZodTypeKind(type, 'boolean') ||
  instanceofZodTypeKind(type, 'bigint') ||
  instanceofZodTypeKind(type, 'date');

const coerceValue = (
  schema: $ZodType,
  input: unknown,
  mode: CoercionMode,
  state: ZodTraversalState,
): unknown => {
  const type = unwrapZodWrappersInternal(schema, state);

  if (instanceofZodTypeKind(type, 'array')) {
    if (!Array.isArray(input)) return input;
    const items: unknown[] = input;
    return items.map((item) => coerceValue(type._zod.def.element, item, mode, state));
  }

  if (instanceofZodTypeKind(type, 'tuple')) {
    if (!Array.isArray(input)) return input;
    const values: unknown[] = input;
    const { items, rest } = type._zod.def;
    return values.map((item, index) => {
      const itemSchema = index < items.length ? items[index] : rest;
      return itemSchema ? coerceValue(itemSchema, item, mode, state) : item;
    });
  }

  if (instanceofZodTypeKind(type, 'record')) {
    if (!isRecord(input)) return input;
    const coerced = copyObjectForCoercion(input);
    for (const key of Object.keys(coerced)) {
      setOwn(coerced, key, coerceValue(type._zod.def.valueType, coerced[key], mode, state));
    }
    return coerced;
  }

  if (instanceofZodTypeObject(type)) {
    if (!isRecord(input)) return input;
    const coerced = copyObjectForCoercion(input);
    for (const [key, shapeSchema] of Object.entries(type.shape)) {
      // Define own `undefined` for absent keys. The input has a normal
      // prototype, so inherited names such as `toString`, `constructor`,
      // `valueOf` and `hasOwnProperty` would otherwise resolve to members of
      // `Object.prototype` when zod reads the input.
      const value = hasOwn(coerced, key)
        ? coerceValue(shapeSchema, coerced[key], mode, state)
        : undefined;
      setOwn(coerced, key, value);
    }
    return coerced;
  }

  if (instanceofZodTypeKind(type, 'union')) {
    // Discriminated unions share the `union` kind; their def adds the
    // discriminator key.
    const def: typeof type._zod.def & { discriminator?: string } = type._zod.def;
    if (def.discriminator !== undefined && isRecord(input) && hasOwn(input, def.discriminator)) {
      const selected = findDiscriminatedUnionOption(
        def.options,
        def.discriminator,
        input[def.discriminator],
        state,
      );
      if (selected) {
        return coerceValue(selected, input, mode, state);
      }
    }

    // Pick the option that matches the input's JavaScript kind so the value is
    // coerced with the same rules as a standalone field of that type.
    const selected =
      def.options.find((option) => zodSchemaMatchesInput(option, input, state)) ?? def.options[0];
    return selected ? coerceValue(selected, input, mode, state) : input;
  }

  if (instanceofZodTypeKind(type, 'intersection')) {
    const { left, right } = type._zod.def;
    return coerceValue(right, coerceValue(left, input, mode, state), mode, state);
  }

  // A `z.coerce` field converts the value itself, by zod's rules.
  if (isCoercibleType(type) && type._zod.def.coerce) return input;
  if (typeof input === 'string') return coerceString(type, input, mode);
  // JSON has no bigint, and bigint responses are serialized as decimal strings. `JSON.parse` may
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

/**
 * Converts each string in a procedure's `input` that `schema` expects to be a number, boolean,
 * bigint or date, because query and path parameters always arrive as strings, and each safe integer
 * that it expects to be a bigint. Any other value, such as `null` or `true` in a JSON body, is left
 * for the schema to validate, and so is a field declared with `z.coerce`. Objects and arrays are
 * copied rather than changed, and the schema is not changed.
 *
 * `mode` selects the URL-parameter grammar (`query`, the default) or the looser JSON-body grammar,
 * which keeps the conversions JSON clients had before the strict rules were introduced.
 */
export const coerceInput = (
  schema: $ZodType,
  input: unknown,
  mode: CoercionMode = 'query',
): unknown => {
  const state = createTraversalState();
  return coerceValue(unwrapZodInputSideInternal(schema, state), input, mode, state);
};
