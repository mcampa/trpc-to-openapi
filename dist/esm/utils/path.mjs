export const normalizePath = (path) => {
    return `/${path.replace(/^\/|\/$/g, '')}`;
};
export const getPathParameters = (path) => {
    return Array.from(path.matchAll(/\{(.+?)\}/g)).map(([, key]) => key);
};
export const getPathRegExp = (path) => {
    const groupedExp = path.replace(/\{(.+?)\}/g, (_, key) => `(?<${key}>[^/]+)`);
    return new RegExp(`^${groupedExp}$`, 'i');
};
//# sourceMappingURL=path.js.map