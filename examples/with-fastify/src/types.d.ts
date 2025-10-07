declare module '@fastify/cors' {
  import type { FastifyPluginCallback } from 'fastify';
  const cors: FastifyPluginCallback<Record<string, unknown>>;
  export default cors;
}

declare module '@fastify/swagger' {
  import type { FastifyPluginCallback } from 'fastify';
  const swagger: FastifyPluginCallback<Record<string, unknown>>;
  export default swagger;
}

declare module '@trpc/server/adapters/fastify' {
  import type { FastifyPluginCallback } from 'fastify';
  export * from '@trpc/server/dist/adapters/fastify/index.cjs';
  export const fastifyTRPCPlugin: FastifyPluginCallback<Record<string, unknown>>;
}

declare module 'trpc-to-openapi' {
  import type { FastifyPluginCallback } from 'fastify';
  import type {
    OpenApiMeta as OriginalOpenApiMeta,
    generateOpenApiDocument as originalGenerateOpenApiDocument,
  } from 'trpc-to-openapi/dist/index.js';

  export * from 'trpc-to-openapi/dist/index.js';
  export const fastifyTRPCOpenApiPlugin: FastifyPluginCallback<Record<string, unknown>>;
  export type OpenApiMeta = OriginalOpenApiMeta;
  export const generateOpenApiDocument: typeof originalGenerateOpenApiDocument;
}

declare module '@fastify/swagger-ui' {
  import type { FastifyPluginCallback } from 'fastify';
  const swaggerUi: FastifyPluginCallback<Record<string, unknown>>;
  export default swaggerUi;
}
