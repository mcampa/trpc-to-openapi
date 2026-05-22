import { ZodOpenApiObject, ZodOpenApiPathsObject, createDocument } from 'zod-openapi';
import { ZodSchema } from 'zod';

import {
  OpenApiMeta,
  type OpenAPIObject,
  OpenApiRouter,
  type SecuritySchemeObject,
} from '../types';
import { getOpenApiPathsObject, mergePaths } from './paths';

export interface OpenApiContactObject {
  name?: string;
  url?: string;
  email?: string;
}

export interface OpenApiLicenseObject {
  name: string;
  identifier?: string;
  url?: string;
}

export interface GenerateOpenApiDocumentOptions<TMeta = Record<string, unknown>> {
  title: string;
  description?: string;
  version: string;
  contact?: OpenApiContactObject;
  license?: OpenApiLicenseObject;
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
  /**
   * Optional object containing Zod schemas to be included in the OpenAPI document's components/schemas section.
   *
   * @example
   *   defs: {
   *     UserSchema: z.object({ id: z.string(), name: z.string() }),
   *     ProductSchema: z.object({ id: z.string(), price: z.number() })
   *   }
   */
  defs?: Record<string, ZodSchema>;
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
    openapi: opts.openApiVersion ?? '3.1.0',
    info: {
      title: opts.title,
      description: opts.description,
      version: opts.version,
      ...(opts.contact && { contact: opts.contact }),
      ...(opts.license && { license: opts.license }),
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
      ...(opts.defs && { schemas: opts.defs }),
    },
    tags: opts.tags?.map((tag) => ({ name: tag })),
    externalDocs: opts.docsUrl ? { url: opts.docsUrl } : undefined,
  });
};
