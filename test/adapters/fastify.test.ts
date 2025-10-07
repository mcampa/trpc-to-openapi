import { initTRPC } from '@trpc/server';
import fastify from 'fastify';
import fetch from 'node-fetch';
import { z } from 'zod';

import {
  CreateOpenApiFastifyPluginOptions,
  OpenApiMeta,
  OpenApiRouter,
  fastifyTRPCOpenApiPlugin,
} from '../../src';

const createContextMock = jest.fn();
const responseMetaMock = jest.fn();
const onErrorMock = jest.fn();

const clearMocks = () => {
  createContextMock.mockClear();
  responseMetaMock.mockClear();
  onErrorMock.mockClear();
};

const createFastifyServerWithRouter = async <TRouter extends OpenApiRouter>(
  handler: CreateOpenApiFastifyPluginOptions<TRouter>,
  opts?: {
    serverOpts?: { basePath?: `/${string}` };
    prefix?: string;
  },
) => {
  const server = fastify();

  const openApiFastifyPluginOptions: any = {
    router: handler.router,
    createContext: handler.createContext ?? createContextMock,
    responseMeta: handler.responseMeta ?? responseMetaMock,
    onError: handler.onError ?? onErrorMock,
    maxBodySize: handler.maxBodySize,
    basePath: opts?.serverOpts?.basePath,
  };

  await server.register(
    async (server) => {
      await server.register(fastifyTRPCOpenApiPlugin, openApiFastifyPluginOptions);
    },
    { prefix: opts?.prefix ?? '' },
  );

  const port = 0;
  const url = await server.listen({ port });

  return {
    url,
    close: () => server.close(),
  };
};

const t = initTRPC.meta<OpenApiMeta>().context<any>().create();

describe('fastify adapter', () => {
  afterEach(() => {
    clearMocks();
  });

  test('with valid routes', async () => {
    const appRouter = t.router({
      sayHelloQuery: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say-hello' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
      sayHelloMutation: t.procedure
        .meta({ openapi: { method: 'POST', path: '/say-hello' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .mutation(({ input }) => ({ greeting: `Hello ${input.name}!` })),
      sayHelloSlash: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say/hello' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
    });

    const { url, close } = await createFastifyServerWithRouter({ router: appRouter });

    {
      const res = await fetch(`${url}/say-hello?name=Lily`, { method: 'GET' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const res = await fetch(`${url}/say-hello`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Lily' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const res = await fetch(`${url}/say/hello?name=Lily`, { method: 'GET' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }

    await close();
  });

  test('with basePath', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
    });

    const { url, close } = await createFastifyServerWithRouter(
      { router: appRouter },
      { serverOpts: { basePath: '/open-api' } },
    );

    const res = await fetch(`${url}/open-api/echo?payload=mcampa`, { method: 'GET' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      payload: 'mcampa',
    });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    await close();
  });

  test('with prefix', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
    });

    const { url, close } = await createFastifyServerWithRouter(
      { router: appRouter },
      {
        prefix: '/api-prefix',
      },
    );

    const res = await fetch(`${url}/api-prefix/echo?payload=mcampa`, {
      method: 'GET',
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      payload: 'mcampa',
    });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    await close();
  });

  test('with single value for optional array field in query params', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ tags: z.array(z.string()).optional() }))
        .output(z.object({ tags: z.array(z.string()).optional() }))
        .query(({ input }) => ({ tags: input.tags })),
    });

    const { url, close } = await createFastifyServerWithRouter({ router: appRouter });

    // Test with single value - this should work by wrapping the single value in an array
    {
      const res = await fetch(`${url}/echo?tags=single`, { method: 'GET' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        tags: ['single'],
      });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }

    // Test with multiple values - this should already work
    {
      const res = await fetch(`${url}/echo?tags=first&tags=second`, { method: 'GET' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        tags: ['first', 'second'],
      });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }

    // Test with no value - should work as optional
    {
      const res = await fetch(`${url}/echo`, { method: 'GET' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        tags: undefined,
      });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }

    await close();
  });
});
