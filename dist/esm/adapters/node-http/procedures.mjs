import { getPathRegExp, normalizePath, forEachOpenApiProcedure } from '../../utils/index.mjs';
export const createProcedureCache = (router) => {
    const procedureCache = new Map();
    forEachOpenApiProcedure(router._def.procedures, ({ path: queryPath, procedure, meta: { openapi } }) => {
        if (procedure._def.type === 'subscription') {
            return;
        }
        const { method } = openapi;
        if (!procedureCache.has(method)) {
            procedureCache.set(method, new Map());
        }
        const path = normalizePath(openapi.path);
        const pathRegExp = getPathRegExp(path);
        procedureCache.get(method)?.set(pathRegExp, {
            type: procedure._def.type,
            path: queryPath,
            procedure,
        });
    });
    return (method, path) => {
        const procedureMethodCache = procedureCache.get(method);
        if (!procedureMethodCache) {
            return undefined;
        }
        const procedureRegExp = Array.from(procedureMethodCache.keys()).find((re) => re.test(path));
        if (!procedureRegExp) {
            return undefined;
        }
        const procedure = procedureMethodCache.get(procedureRegExp);
        const pathInput = procedureRegExp.exec(path)?.groups ?? {};
        return { procedure, pathInput };
    };
};
//# sourceMappingURL=procedures.js.map