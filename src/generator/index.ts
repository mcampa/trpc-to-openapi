import {
  ZodOpenApiObject,
  ZodOpenApiPathsObject,
  createDocument,
  type CreateDocumentOptions,
} from 'zod-openapi';
import type { ContactObject, LicenseObject } from 'openapi3-ts/oas31';
import type { ZodSchema } from 'zod/v4';

import {
  OpenApiMeta,
  type OpenAPIObject,
  OpenApiRouter,
  type SecuritySchemeObject,
} from '../types';
import { getOpenApiPathsObject, mergePaths } from './paths';

export type OpenApiContactObject = ContactObject;

export type OpenApiLicenseObject = LicenseObject;

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
  /**
   * Options forwarded to `zod-openapi`'s `createDocument`, such as `override`
   * for custom scalar schemas. Optional: when omitted, the previous behavior
   * is unchanged.
   */
  options?: CreateDocumentOptions;
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

  // JSON has no bigint: the response serializer writes bigints as decimal
  // strings, so document them as strings too. The caller's override runs
  // after this one and can change the result further.
  const options: CreateDocumentOptions = {
    ...opts.options,
    override: (ctx) => {
      if (ctx.zodSchema?._zod?.def?.type === 'bigint') {
        ctx.jsonSchema.type = 'string';
        ctx.jsonSchema.format = 'int64';
      }
      opts.options?.override?.(ctx);
    },
  };

  return createDocument(
    {
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
    },
    options,
  );
};
