import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { fastifyTRPCOpenApiPlugin } from 'trpc-to-openapi';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { openApiDocument } from './openapi';
import { appRouter, createContext } from './router';

const app = Fastify({
  logger: true,
});

async function main() {
  // Setup CORS

  await app.register(cors, {});

  // Handle incoming tRPC requests

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    useWss: false,
    trpcOptions: { router: appRouter, createContext },
  });

  // Handle incoming OpenAPI requests

  await app.register(fastifyTRPCOpenApiPlugin, {
    basePath: '/api',
    router: appRouter,
    createContext,
  });

  // Serve the OpenAPI document
  app.get('/openapi.json', () => openApiDocument);

  // Server Swagger UI

  await app.register(fastifySwagger, {
    mode: 'static',
    specification: { document: openApiDocument },
  });

  await app.register(fastifySwaggerUi as any, {
    routePrefix: '/docs',
  });

  await app
    .listen({ port: 3000 })
    .then((address) => {
      console.log(`Server started on ${address}\nSwagger UI: http://localhost:3000/docs`);
    })
    .catch((e) => {
      throw e;
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
