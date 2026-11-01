import { TRPCError } from '@trpc/server';
import { OpenApiMethod, OpenApiProcedure, OpenApiRouter } from '../../types';
import { getPathRegExp, normalizePath, forEachOpenApiProcedure } from '../../utils';

interface ProcedureCacheEntry {
  type: 'query' | 'mutation';
  path: string;
  procedure: OpenApiProcedure;
  openApiPath: string;
  regexp: RegExp;
  paramNames: string[];
  segments: string[];
  order: number;
  paramCount: number;
  staticSegmentCount: number;
}

const getPathSegments = (path: string): string[] => path.split('/').filter((segment) => segment);

const isParameterSegment = (segment: string): boolean => /^\{[^{}]+\}$/.test(segment);

const getPathSpecificity = (path: string) => {
  const segments = getPathSegments(path);
  let paramCount = 0;
  let staticSegmentCount = 0;

  for (const segment of segments) {
    const params = segment.match(/\{[^{}]*\}/g);
    if (params) {
      paramCount += params.length;
    } else {
      staticSegmentCount += 1;
    }
  }

  return { segments, paramCount, staticSegmentCount };
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
  // Static routes (no parameters) win over parameterized routes.
  if (a.paramCount !== b.paramCount) {
    return a.paramCount - b.paramCount;
  }
  // Among equally parameterized routes, prefer more static segments.
  if (a.staticSegmentCount !== b.staticSegmentCount) {
    return b.staticSegmentCount - a.staticSegmentCount;
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

export const createProcedureCache = (router: OpenApiRouter) => {
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
      const { regexp, paramNames } = getPathRegExp(path);
      const { segments, paramCount, staticSegmentCount } = getPathSpecificity(path);

      entries.push({
        type: procedure._def.type,
        path: queryPath,
        procedure,
        openApiPath: path,
        regexp,
        paramNames,
        segments,
        order: entries.length,
        paramCount,
        staticSegmentCount,
      });
      procedureCache.set(method, entries);
    },
  );

  for (const [method, entries] of procedureCache) {
    entries.sort(compareSpecificity);
    warnAboutOverlappingPaths(method, entries);
  }

  return (method: OpenApiMethod | 'HEAD', path: string) => {
    const procedureMethodCache = procedureCache.get(method);
    if (!procedureMethodCache) {
      return undefined;
    }

    for (const entry of procedureMethodCache) {
      const match = entry.regexp.exec(path);
      if (!match) {
        continue;
      }

      const pathInput: Record<string, string> = {};
      entry.paramNames.forEach((name, index) => {
        // Matching happened on the raw pathname, so encoded slashes stay
        // inside a single segment and are decoded only after routing.
        try {
          pathInput[name] = decodeURIComponent(match[index + 1] ?? '');
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
};
