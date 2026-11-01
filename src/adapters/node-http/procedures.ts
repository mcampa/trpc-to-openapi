import { TRPCError } from '@trpc/server';
import { OpenApiMethod, OpenApiProcedure, OpenApiRouter } from '../../types';
import {
  decodePathParameter,
  decodeUnreservedPathEscapes,
  forEachOpenApiProcedure,
  getPathRegExp,
  normalizePath,
  tokenizePath,
} from '../../utils';

export interface ProcedureCacheEntry {
  type: 'query' | 'mutation';
  path: string;
  procedure: OpenApiProcedure;
  openApiPath: string;
  regexp: ReturnType<typeof getPathRegExp>;
  paramNames: string[];
  segments: string[];
  order: number;
  paramCount: number;
  literalCharCount: number;
}

export interface ResolvedProcedure {
  procedure: ProcedureCacheEntry;
  pathInput: Record<string, string>;
}

export type ProcedureMatcher = (
  method: OpenApiMethod | 'HEAD',
  path: string,
) => ResolvedProcedure | undefined;

const getPathSegments = (path: string): string[] => path.split('/').filter((segment) => segment);

// Any segment containing a parameter marker can collide with another
// parameterized segment, including mixed ones such as `{name}.{ext}`.
const isParameterSegment = (segment: string): boolean => segment.includes('{');

const getPathSpecificity = (path: string) => {
  const segments = getPathSegments(path);
  let literalCharCount = 0;

  for (const token of tokenizePath(path)) {
    if (token.type === 'literal') {
      literalCharCount += token.value.length;
    }
  }

  return { segments, literalCharCount };
};

const pathsOverlap = (aSegments: string[], bSegments: string[]): boolean => {
  if (aSegments.length !== bSegments.length) {
    return false;
  }

  return aSegments.every((segment, index) => {
    const otherSegment = bSegments[index] ?? '';
    return (
      segment.toLowerCase() === otherSegment.toLowerCase() ||
      isParameterSegment(segment) ||
      isParameterSegment(otherSegment)
    );
  });
};

const compareSpecificity = (a: ProcedureCacheEntry, b: ProcedureCacheEntry): number => {
  // Routes with more literal characters are more constrained, so they win.
  if (a.literalCharCount !== b.literalCharCount) {
    return b.literalCharCount - a.literalCharCount;
  }
  // Among equally constrained routes, prefer the one with fewer parameters.
  if (a.paramCount !== b.paramCount) {
    return a.paramCount - b.paramCount;
  }
  // Registration order is the stable tie-break.
  return a.order - b.order;
};

const warnAboutOverlappingPaths = (
  method: OpenApiMethod | 'HEAD',
  entries: ProcedureCacheEntry[],
): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const current = entries[i]!;
      const other = entries[j]!;
      if (pathsOverlap(current.segments, other.segments)) {
        console.warn(
          `[trpc-to-openapi] Overlapping ${method} route patterns "${current.openApiPath}" and "${other.openApiPath}" were registered. Requests may match either procedure.`,
        );
      }
    }
  }
};

const procedureCacheByRouter = new WeakMap<OpenApiRouter, ProcedureMatcher>();

export const createProcedureCache = (router: OpenApiRouter): ProcedureMatcher => {
  const cached = procedureCacheByRouter.get(router);
  if (cached) {
    return cached;
  }

  const procedureCache = new Map<OpenApiMethod | 'HEAD', ProcedureCacheEntry[]>();

  forEachOpenApiProcedure(
    router._def.procedures,
    ({ path: queryPath, procedure, meta: { openapi } }) => {
      if (procedure._def.type === 'subscription') {
        return;
      }
      const { method } = openapi;
      const entries = procedureCache.get(method) ?? [];
      const path = normalizePath(openapi.path);
      const regexp = getPathRegExp(path);
      const { segments, literalCharCount } = getPathSpecificity(path);

      entries.push({
        type: procedure._def.type,
        path: queryPath,
        procedure,
        openApiPath: path,
        regexp,
        paramNames: regexp.paramNames,
        segments,
        order: entries.length,
        paramCount: regexp.paramNames.length,
        literalCharCount,
      });
      procedureCache.set(method, entries);
    },
  );

  for (const [method, entries] of procedureCache) {
    entries.sort(compareSpecificity);
    warnAboutOverlappingPaths(method, entries);
  }

  const getProcedure: ProcedureMatcher = (method, path) => {
    const procedureMethodCache = procedureCache.get(method);
    if (!procedureMethodCache) {
      return undefined;
    }

    // Decode unreserved escapes before matching so an encoded static route
    // (for example `/users/%6De`) cannot fall through to a parameter route.
    const matchablePath = decodeUnreservedPathEscapes(path);

    for (const entry of procedureMethodCache) {
      const match = entry.regexp.exec(matchablePath);
      if (!match) {
        continue;
      }

      // Matching happened on the raw pathname, so encoded slashes stay inside
      // a single segment and are decoded only after routing. A null prototype
      // preserves arbitrary parameter names such as `__proto__`.
      const pathInput: Record<string, string> = Object.create(null) as Record<string, string>;
      entry.paramNames.forEach((name, index) => {
        try {
          pathInput[name] = decodePathParameter(match[index + 1] ?? '');
        } catch {
          throw new TRPCError({
            message: `Invalid URL encoding in path parameter "${name}"`,
            code: 'BAD_REQUEST',
          });
        }
      });

      return { procedure: entry, pathInput };
    }

    return undefined;
  };

  // Memoized per router: the fetch adapter constructs a handler on every
  // request, so sorting and overlap warnings must not run per request.
  procedureCacheByRouter.set(router, getProcedure);
  return getProcedure;
};
