export const normalizePath = (path: string) => {
  return `/${path.replace(/^\/|\/$/g, '')}`;
};

export type PathToken = { type: 'literal'; value: string } | { type: 'parameter'; name: string };

/**
 * Splits a path template into literal and `{name}` parameter tokens.
 *
 * This is the single parser shared by OpenAPI document generation and runtime
 * routing, so both reject the same invalid templates.
 */
export const tokenizePath = (path: string): PathToken[] => {
  const tokens: PathToken[] = [];
  const parameterRegExp = /\{([^}]*)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = parameterRegExp.exec(path)) !== null) {
    const name = match[1] ?? '';
    if (!name) {
      throw new Error(`Invalid path "${path}": empty parameter name`);
    }

    if (match.index > lastIndex) {
      tokens.push({ type: 'literal', value: path.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'parameter', name });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < path.length) {
    tokens.push({ type: 'literal', value: path.slice(lastIndex) });
  }

  return tokens;
};

export const getPathParameters = (path: string): string[] => {
  return tokenizePath(path).flatMap((token) => (token.type === 'parameter' ? [token.name] : []));
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * A `RegExp` with the parameter names attached. Keeping the return value a
 * real `RegExp` preserves the package-root `getPathRegExp` API.
 */
export type PathRegExp = RegExp & { paramNames: string[] };

export const getPathRegExp = (path: string): PathRegExp => {
  const paramNames: string[] = [];
  let regexpSource = '';

  for (const token of tokenizePath(path)) {
    if (token.type === 'literal') {
      regexpSource += escapeRegExp(token.value);
      continue;
    }

    // Named groups would reject names such as `user-id`, so positional groups
    // are mapped back to their names through `paramNames`.
    if (paramNames.includes(token.name)) {
      throw new Error(`Invalid path "${path}": duplicate parameter name "${token.name}"`);
    }
    paramNames.push(token.name);
    // Greedy on purpose: `/posts/{slug}-{id}` must split `hello-world-123`
    // into `hello-world` and `123`, matching the pre-existing behavior.
    regexpSource += '([^/]+)';
  }

  const regexp = new RegExp(`^${regexpSource}$`, 'i') as PathRegExp;
  regexp.paramNames = paramNames;
  return regexp;
};

const UNRESERVED_CHARACTER = /^[A-Za-z0-9\-._~]$/;

/**
 * Decodes percent-escapes of RFC 3986 unreserved characters only. Reserved
 * characters stay encoded so matching cannot be bypassed with a non-canonical
 * encoding of a static route (for example `/users/%6De`).
 */
export const decodeUnreservedPathEscapes = (path: string): string => {
  return path.replace(/%([0-9A-Fa-f]{2})/g, (escape, hex: string) => {
    const character = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED_CHARACTER.test(character) ? character : escape;
  });
};

const isProtectedEscape = (hex: string): boolean => {
  const code = parseInt(hex, 16);
  return code === 0x2f || code === 0x5c; // `/` and `\`
};

const HEX_ESCAPE_PATTERN = /^[0-9A-Fa-f]{2}$/;

/**
 * Decodes a captured path parameter, keeping `%2F` and `%5C` percent-encoded so
 * a parameter can never smuggle a path separator. Malformed escapes throw, and
 * the caller turns that into `400 BAD_REQUEST`.
 */
export const decodePathParameter = (value: string): string => {
  let result = '';
  let index = 0;

  while (index < value.length) {
    if (value.charAt(index) !== '%') {
      result += value.charAt(index);
      index += 1;
      continue;
    }

    // Decode maximal runs of adjacent escapes together so multi-byte UTF-8
    // sequences stay intact. Protected escapes act as run boundaries.
    let run = '';
    let runEnd = index;
    while (value.charAt(runEnd) === '%') {
      const hex = value.slice(runEnd + 1, runEnd + 3);
      if (!HEX_ESCAPE_PATTERN.test(hex) || isProtectedEscape(hex)) {
        break;
      }
      run += value.slice(runEnd, runEnd + 3);
      runEnd += 3;
    }

    if (runEnd === index) {
      const hex = value.slice(index + 1, index + 3);
      if (HEX_ESCAPE_PATTERN.test(hex)) {
        result += `%${hex.toUpperCase()}`;
        index += 3;
        continue;
      }
      // Let `decodeURIComponent` raise the canonical error for malformed input.
      decodeURIComponent(value.slice(index));
      index += 1;
      continue;
    }

    result += decodeURIComponent(run);
    index = runEnd;
  }

  return result;
};

/**
 * Re-encodes a path whose segments an adapter has already decoded, so the
 * shared handler decodes it exactly once. Accepts a path string or the decoded
 * segment array frameworks such as Next.js provide for catch-all routes.
 */
export const encodePathSegments = (path: string | readonly string[]): string => {
  const segments = typeof path === 'string' ? path.split('/') : path;
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
};
