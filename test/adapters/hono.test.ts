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
});
