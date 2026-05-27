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
});
