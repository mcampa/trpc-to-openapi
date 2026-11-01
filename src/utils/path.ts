export const normalizePath = (path: string) => {
  return `/${path.replace(/^\/|\/$/g, '')}`;
};

export const getPathParameters = (path: string): string[] => {
  return Array.from(path.matchAll(/\{(.+?)\}/g)).map(([, key]) => key!);
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const getPathRegExp = (path: string) => {
  const paramNames: string[] = [];
  const parameterRegExp = /\{([^}]*)\}/g;
  let regexpSource = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = parameterRegExp.exec(path)) !== null) {
    const name = match[1] ?? '';
    if (!name) {
      throw new Error(`Invalid path "${path}": empty parameter name`);
    }

    regexpSource += escapeRegExp(path.slice(lastIndex, match.index));
    // Positional capture groups keep names such as `user-id` valid and are
    // mapped back to their names through the returned `paramNames` array.
    // Matching is non-greedy so a trailing literal suffix is preferred.
    regexpSource += '([^/]+?)';
    paramNames.push(name);
    lastIndex = match.index + match[0].length;
  }

  regexpSource += escapeRegExp(path.slice(lastIndex));

  return {
    regexp: new RegExp(`^${regexpSource}$`, 'i'),
    paramNames,
  };
};
