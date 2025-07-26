import type { OpenApiMethod, OpenApiProcedure, OpenApiRouter } from "../../types";
import { forEachOpenApiProcedure, getPathRegExp, normalizePath } from "../../utils";

export const createProcedureCache = (router: OpenApiRouter) => {
  // Cache for exact paths (non-parameterized)
  const exactPathCache = new Map<
    OpenApiMethod | "HEAD",
    Map<
      string,
      {
        type: "query" | "mutation";
        path: string;
        procedure: OpenApiProcedure;
      }
    >
  >();

  // Cache for parameterized paths (with regex patterns)
  const parameterizedPathCache = new Map<
    OpenApiMethod | "HEAD",
    Map<
      RegExp,
      {
        type: "query" | "mutation";
        path: string;
        procedure: OpenApiProcedure;
      }
    >
  >();

  forEachOpenApiProcedure(router._def.procedures, ({ path: queryPath, procedure, meta: { openapi } }) => {
    if (procedure._def.type === "subscription") {
      return;
    }
    const { method } = openapi;
    const normalizedPath = normalizePath(openapi.path);

    // Check if the path contains parameters (curly braces)
    const hasParameters = /\{.+?\}/.test(normalizedPath);

    if (hasParameters) {
      // Parameterized path - use regex cache
      if (!parameterizedPathCache.has(method)) {
        parameterizedPathCache.set(method, new Map());
      }
      const pathRegExp = getPathRegExp(normalizedPath);
      parameterizedPathCache.get(method)?.set(pathRegExp, {
        type: procedure._def.type,
        path: queryPath,
        procedure,
      });
    } else {
      // Exact path - use string cache
      if (!exactPathCache.has(method)) {
        exactPathCache.set(method, new Map());
      }
      exactPathCache.get(method)?.set(normalizedPath, {
        type: procedure._def.type,
        path: queryPath,
        procedure,
      });
    }
  });

  return (method: OpenApiMethod | "HEAD", path: string) => {
    // First, try to find an exact match
    const exactMethodCache = exactPathCache.get(method);
    if (exactMethodCache?.has(path)) {
      const procedure = exactMethodCache.get(path);
      return { procedure, pathInput: {} };
    }

    // If no exact match, try parameterized paths
    const parameterizedMethodCache = parameterizedPathCache.get(method);
    if (!parameterizedMethodCache) {
      return undefined;
    }

    const procedureRegExp = Array.from(parameterizedMethodCache.keys()).find((re) => re.test(path));
    if (!procedureRegExp) {
      return undefined;
    }

    const procedure = parameterizedMethodCache.get(procedureRegExp);
    const pathInput = procedureRegExp.exec(path)?.groups ?? {};

    return { procedure, pathInput };
  };
};
