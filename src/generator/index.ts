import { ZodOpenApiObject, ZodOpenApiPathsObject, createDocument } from 'zod-openapi';

import {
  OpenApiMeta,
  type OpenAPIObject,
  OpenApiRouter,
  type SecuritySchemeObject,
} from '../types';
import { getOpenApiPathsObject, mergePaths } from './paths';

export interface GenerateOpenApiDocumentOptions<TMeta = Record<string, unknown>> {
  title: string;
  description?: string;
  version: string;
  openApiVersion?: ZodOpenApiObject['openapi'];
  baseUrl: string;
  docsUrl?: string;
  tags?: string[];
  securitySchemes?: Record<string, SecuritySchemeObject>;
  paths?: ZodOpenApiPathsObject;
  /**
   * Optional filter function to include/exclude procedures from the generated OpenAPI document.
   *
   * The function receives a context object with the procedure's metadata as `ctx.metadata`.
   * Return `true` to include the procedure, or `false` to exclude it from the OpenAPI output.
   *
   * @example
   *   filter: ({ metadata }) => metadata.isPublic === true
   */
  filter?: (ctx: { metadata: { openapi: NonNullable<OpenApiMeta['openapi']> } & TMeta }) => boolean;
}

export const generateOpenApiDocument = <TMeta = Record<string, unknown>>(
  appRouter: OpenApiRouter,
  opts: GenerateOpenApiDocumentOptions<TMeta>,
): OpenAPIObject => {
  const securitySchemes = opts.securitySchemes ?? {
    Authorization: {
      type: 'http',
      scheme: 'bearer',
    },
  };
  return createDocument({
    openapi: opts.openApiVersion ?? '3.0.3',
    info: {
      title: opts.title,
      description: opts.description,
      version: opts.version,
    },
    servers: [
      {
        url: opts.baseUrl,
      },
    ],
    paths: mergePaths(
      getOpenApiPathsObject(appRouter, Object.keys(securitySchemes), opts.filter),
      opts.paths,
    ),
    components: {
      securitySchemes,
    },
    tags: opts.tags?.map((tag) => ({ name: tag })),
    externalDocs: opts.docsUrl ? { url: opts.docsUrl } : undefined,
  });
};
