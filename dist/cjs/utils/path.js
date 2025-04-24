"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPathRegExp = exports.getPathParameters = exports.normalizePath = void 0;
const normalizePath = (path) => {
    return `/${path.replace(/^\/|\/$/g, '')}`;
};
exports.normalizePath = normalizePath;
const getPathParameters = (path) => {
    return Array.from(path.matchAll(/\{(.+?)\}/g)).map(([, key]) => key);
};
exports.getPathParameters = getPathParameters;
const getPathRegExp = (path) => {
    const groupedExp = path.replace(/\{(.+?)\}/g, (_, key) => `(?<${key}>[^/]+)`);
    return new RegExp(`^${groupedExp}$`, 'i');
};
exports.getPathRegExp = getPathRegExp;
//# sourceMappingURL=path.js.map