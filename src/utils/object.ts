/** Creates a record with no prototype for request-derived accumulator objects. */
export const createNullPrototypeRecord = <T>(): Record<string, T> =>
  Object.create(null) as Record<string, T>;

/**
 * Assigns `key` on `target` without invoking the `__proto__` setter inherited
 * from `Object.prototype`. Every other assignment is a normal one.
 */
export const setOwn = (target: object, key: string, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
    return;
  }

  Reflect.set(target, key, value);
};

/** An object with `Object.prototype` or no prototype. */
export const isPlainObject = (value: object): boolean => {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Copies plain objects and arrays recursively, dropping own `__proto__` keys
 * and giving every copied object a normal prototype. Date, Buffer and other
 * non-plain objects pass through unchanged. Cycles are preserved instead of
 * recursing forever.
 */
export const sanitizeInput = <T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(sanitizeInput(item, seen));
    }
    return copy as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  // `Object.assign({}, value)` and object spread would invoke the `__proto__`
  // setter when the source has that key, so copy key by key.
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    if (key === '__proto__') {
      continue;
    }
    setOwn(copy, key, sanitizeInput(Reflect.get(value, key), seen));
  }
  return copy as T;
};
