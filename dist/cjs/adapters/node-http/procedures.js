"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProcedureCache = void 0;
const utils_1 = require("../../utils");
const createProcedureCache = (router) => {
    const procedureCache = new Map();
    (0, utils_1.forEachOpenApiProcedure)(router._def.procedures, ({ path: queryPath, procedure, meta: { openapi } }) => {
        var _a;
        if (procedure._def.type === 'subscription') {
            return;
        }
        const { method } = openapi;
        if (!procedureCache.has(method)) {
            procedureCache.set(method, new Map());
        }
        const path = (0, utils_1.normalizePath)(openapi.path);
        const pathRegExp = (0, utils_1.getPathRegExp)(path);
        (_a = procedureCache.get(method)) === null || _a === void 0 ? void 0 : _a.set(pathRegExp, {
            type: procedure._def.type,
            path: queryPath,
            procedure,
        });
    });
    return (method, path) => {
        var _a, _b;
        const procedureMethodCache = procedureCache.get(method);
        if (!procedureMethodCache) {
            return undefined;
        }
        const procedureRegExp = Array.from(procedureMethodCache.keys()).find((re) => re.test(path));
        if (!procedureRegExp) {
            return undefined;
        }
        const procedure = procedureMethodCache.get(procedureRegExp);
        const pathInput = (_b = (_a = procedureRegExp.exec(path)) === null || _a === void 0 ? void 0 : _a.groups) !== null && _b !== void 0 ? _b : {};
        return { procedure, pathInput };
    };
};
exports.createProcedureCache = createProcedureCache;
//# sourceMappingURL=procedures.js.map