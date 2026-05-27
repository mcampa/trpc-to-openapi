import { initTRPC } from '@trpc/server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod/v4';

import {
  OpenApiMeta,
  OpenApiRouter,
  createOpenApiHonoHandler,
} from '../../src';

const t = initTRPC.meta<OpenApiMeta>().context().create();

const createApp = (router: OpenApiRouter, endpoint: `/${string}`) => {
  const app = new Hono();
  app.use(`${endpoint === '/' ? '' : endpoint}/*`, createOpenApiHonoHandler({ router, endpoint }));
  return app;
};

describe('hono adapter', () => {
  test('with valid GET query', async () => {
    const appRouter = t.router({
      sayHello: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say-hello' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
    });

    const app = createApp(appRouter, '/');
    const res = await app.request('/say-hello?name=Lily', { method: 'GET' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ greeting: 'Hello Lily!' });
  });

  test('with valid POST mutation (JSON body)', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const app = createApp(appRouter, '/');
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'hi' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ payload: 'hi' });
  });

  test('createContext receives the Hono Context as second arg', async () => {
    const appRouter = t.router({
      whoami: t.procedure
        .meta({ openapi: { method: 'GET', path: '/whoami' } })
        .input(z.void())
        .output(z.object({ token: z.string() }))
        .query(({ ctx }) => ({ token: (ctx as { token: string }).token })),
    });

    const app = new Hono();
    const createContext = jest.fn((_opts: unknown, c: Context) => ({
      token: c.req.header('Authorization') ?? 'anon',
    }));
    app.use('/*', createOpenApiHonoHandler({ router: appRouter, endpoint: '/', createContext }));

    const res = await app.request('/whoami', {
      method: 'GET',
      headers: { Authorization: 'Bearer abc123' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: 'Bearer abc123' });
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(typeof createContext.mock.calls[0]![1].req.header).toBe('function');
  });

  test('strips the endpoint prefix when mounted under a sub-path', async () => {
    const appRouter = t.router({
      sayHello: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say-hello' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
    });

    const app = createApp(appRouter, '/api');
    const res = await app.request('/api/say-hello?name=Sam', { method: 'GET' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ greeting: 'Hello Sam!' });
  });
});
