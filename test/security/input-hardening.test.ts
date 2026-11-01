import { initTRPC } from '@trpc/server';
import express from 'express';
import { Server } from 'http';
import fetch from 'node-fetch';
import { z } from 'zod/v4';

import {
  OpenApiMeta,
  OpenApiRouter,
  createOpenApiExpressMiddleware,
  createOpenApiHttpHandler,
} from '../../src';
import { getQuery } from '../../src/adapters/node-http/input';
import { unwrapZodType } from '../../src/utils/zod';

// @ts-expect-error - global fetch
global.fetch = fetch;

const t = initTRPC.meta<OpenApiMeta>().context<any>().create();

const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

const getServerUrl = (server: Server) => {
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening');
  }
  return `http://localhost:${address.port}`;
};

const createStandaloneServer = <TRouter extends OpenApiRouter>(router: TRouter) => {
  const openApiHttpHandler = createOpenApiHttpHandler<TRouter>({ router } as any);
  const server = new Server((req, res) => {
    void openApiHttpHandler(req, res);
  });
  server.listen(0);
  return getServerUrl(server);
};

const createExpressServer = <TRouter extends OpenApiRouter>(
  router: TRouter,
  opts?: { json?: boolean },
) => {
  const openApiExpressMiddleware = createOpenApiExpressMiddleware<TRouter>({ router } as any);
  const app = express();
  if (opts?.json) {
    app.use(express.json());
  }
  app.use(openApiExpressMiddleware);
  return getServerUrl(app.listen(0));
};

describe('input hardening', () => {
  describe('V1: boolean coercion', () => {
    const booleanRouter = () =>
      t.router({
        flags: t.procedure
          .meta({ openapi: { method: 'GET', path: '/flags' } })
          .input(z.object({ includeDeleted: z.boolean(), admin: z.boolean() }))
          .output(z.object({ includeDeleted: z.boolean(), admin: z.boolean() }))
          .query(({ input }) => input),
      });

    test('coerces only "true" and "false" query values', async () => {
      const url = createStandaloneServer(booleanRouter());

      for (const [value, expected] of [
        ['true', true],
        ['false', false],
      ] as [string, boolean][]) {
        const res = await fetch(`${url}/flags?includeDeleted=${value}&admin=${value}`, {
          method: 'GET',
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ includeDeleted: expected, admin: expected });
      }
    });

    test('rejects all other boolean query strings instead of coercing them', async () => {
      const appRouter = t.router({
        flag: t.procedure
          .meta({ openapi: { method: 'GET', path: '/flag' } })
          .input(z.object({ flag: z.boolean() }))
          .output(z.object({ flag: z.boolean() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      for (const value of [
        'True',
        'TRUE',
        'False',
        'FALSE',
        '1',
        '0',
        'yes',
        'no',
        'on',
        'off',
        '',
        'maybe',
        '2',
        'truthy',
        ' ',
      ]) {
        const res = await fetch(`${url}/flag?flag=${encodeURIComponent(value)}`, {
          method: 'GET',
        });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(
          expect.objectContaining({ code: 'BAD_REQUEST', message: 'Input validation failed' }),
        );
      }
    });

    test('coerces boolean path parameters', async () => {
      const appRouter = t.router({
        flag: t.procedure
          .meta({ openapi: { method: 'GET', path: '/flags/{flag}' } })
          .input(z.object({ flag: z.boolean() }))
          .output(z.object({ flag: z.boolean() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const falseRes = await fetch(`${url}/flags/false`, { method: 'GET' });
      expect(falseRes.status).toBe(200);
      expect(await falseRes.json()).toEqual({ flag: false });

      const trueRes = await fetch(`${url}/flags/true`, { method: 'GET' });
      expect(trueRes.status).toBe(200);
      expect(await trueRes.json()).toEqual({ flag: true });

      const rejectedRes = await fetch(`${url}/flags/TRUE`, { method: 'GET' });
      expect(rejectedRes.status).toBe(400);
    });
  });

  describe('V2: recursive schemas', () => {
    test('recursive z.lazy input schema does not overflow the stack on GET', async () => {
      interface Category {
        name: string;
        sub?: Category;
      }
      const Category: z.ZodType<Category> = z.lazy(() =>
        z.object({ name: z.string(), sub: Category.optional() }),
      );

      const appRouter = t.router({
        category: t.procedure
          .meta({ openapi: { method: 'GET', path: '/categories' } })
          .input(Category)
          .output(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
      });
      // The non-production document validation does not support nested
      // objects as query parameters, so create the handler as production
      // would and exercise the runtime path only.
      const env = process.env as Record<string, string | undefined>;
      const nodeEnv = env.NODE_ENV;
      env.NODE_ENV = 'production';
      let url: string;
      try {
        url = createStandaloneServer(appRouter);
      } finally {
        if (nodeEnv === undefined) {
          delete env.NODE_ENV;
        } else {
          env.NODE_ENV = nodeEnv;
        }
      }

      const res = await fetch(`${url}/categories?name=Tom`, { method: 'GET' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Tom' });
    });

    test('sibling reuse of the same lazy schema coerces both fields', async () => {
      const CoercedNumber = z.lazy(() => z.number());
      const appRouter = t.router({
        numbers: t.procedure
          .meta({ openapi: { method: 'GET', path: '/numbers' } })
          .input(z.object({ a: CoercedNumber, b: CoercedNumber }))
          .output(z.object({ a: z.number(), b: z.number() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/numbers?a=1&b=2`, { method: 'GET' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ a: 1, b: 2 });
    });

    test('unwrapZodType terminates on a self-referential lazy schema', () => {
      const Self: z.ZodLazy<any> = z.lazy(() => Self);

      expect(() => unwrapZodType(Self, false)).not.toThrow();
      expect(unwrapZodType(Self, false)).toBe(Self);
    });
  });

  describe('V6: prototype pollution', () => {
    test('pre-parsed JSON body with __proto__ keeps defaults and does not mutate prototypes', async () => {
      const appRouter = t.router({
        users: t.procedure
          .meta({ openapi: { method: 'POST', path: '/users' } })
          .input(z.object({ name: z.string(), role: z.string().default('user') }))
          .output(z.object({ name: z.string(), role: z.string() }))
          .mutation(({ input }) => input),
      });
      const url = createExpressServer(appRouter, { json: true });

      const res = await fetch(`${url}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":"n","__proto__":{"role":"admin"}}',
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'n', role: 'user' });
      expect((Object.prototype as any).role).toBeUndefined();
      expect(({} as any).role).toBeUndefined();
    });

    test('getQuery builds a null-prototype accumulator without prototype pollution', () => {
      const req = {
        query: JSON.parse('{"__proto__":{"role":"admin"},"name":"n"}'),
      } as any;

      const query = getQuery(req, new URL('http://localhost/'));

      expect(Object.getPrototypeOf(query)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(query, '__proto__')).toBe(true);
      expect((query as any).role).toBeUndefined();
      expect(({} as any).role).toBeUndefined();
    });

    test('query __proto__ key does not pollute through the HTTP handler', async () => {
      const appRouter = t.router({
        users: t.procedure
          .meta({ openapi: { method: 'GET', path: '/users' } })
          .input(z.object({ name: z.string(), role: z.string().default('user') }))
          .output(z.object({ name: z.string(), role: z.string() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/users?name=n&__proto__=admin`, { method: 'GET' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'n', role: 'user' });
      expect(({} as any).role).toBeUndefined();
    });
  });

  describe('V9: Object.prototype-named optional fields', () => {
    test('GET query with omitted Object.prototype-named optional fields succeeds', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(
            z.object({
              q: z.string(),
              toString: z.string().optional(),
              constructor: z.string().optional(),
              valueOf: z.string().optional(),
              hasOwnProperty: z.string().optional(),
            }),
          )
          .output(z.object({ q: z.string() }))
          .query(({ input }) => ({ q: input.q })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo?q=hi`, { method: 'GET' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ q: 'hi' });
    });

    test('POST body with omitted Object.prototype-named optional fields succeeds', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(
            z.object({
              q: z.string(),
              toString: z.string().optional(),
              constructor: z.string().optional(),
              valueOf: z.string().optional(),
            }),
          )
          .output(z.object({ q: z.string() }))
          .mutation(({ input }) => ({ q: input.q })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'hi' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ q: 'hi' });
    });
  });

  describe('V10: strict numeric coercion', () => {
    test('number coercion only accepts strict decimal strings', async () => {
      const appRouter = t.router({
        number: t.procedure
          .meta({ openapi: { method: 'GET', path: '/number' } })
          .input(z.object({ n: z.number() }))
          .output(z.object({ n: z.number() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const invalid = ['%20', '0x10', 'Infinity', '-Infinity', 'NaN', '', ' ', '10px', '1_000'];
      for (const value of invalid) {
        const res = await fetch(`${url}/number?n=${value}`, { method: 'GET' });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(
          expect.objectContaining({ code: 'BAD_REQUEST', message: 'Input validation failed' }),
        );
      }

      const valid: [string, number][] = [
        ['1e3', 1000],
        ['.5', 0.5],
        ['5.', 5],
        ['-2.5e-1', -0.25],
        ['%2B7', 7],
        ['0', 0],
      ];
      for (const [value, expected] of valid) {
        const res = await fetch(`${url}/number?n=${value}`, { method: 'GET' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ n: expected });
      }
    });

    test('bigint coercion only accepts strict integer strings', async () => {
      const appRouter = t.router({
        bigint: t.procedure
          .meta({ openapi: { method: 'GET', path: '/big-int' } })
          .input(z.object({ n: z.bigint() }))
          .output(z.object({ n: z.string() }))
          .query(({ input }) => ({ n: input.n.toString() })),
      });
      const url = createStandaloneServer(appRouter);

      for (const value of ['0x10', '1.5', '', '1e3', '%205']) {
        const res = await fetch(`${url}/big-int?n=${value}`, { method: 'GET' });
        expect(res.status).toBe(400);
      }

      for (const [value, expected] of [
        ['123', '123'],
        ['-42', '-42'],
        ['%2B9', '9'],
      ] as [string, string][]) {
        const res = await fetch(`${url}/big-int?n=${value}`, { method: 'GET' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ n: expected });
      }
    });

    test('date coercion only accepts valid dates', async () => {
      const appRouter = t.router({
        date: t.procedure
          .meta({ openapi: { method: 'GET', path: '/date' } })
          .input(z.object({ d: z.date() }))
          .output(z.object({ isDate: z.boolean() }))
          .query(({ input }) => ({ isDate: input.d instanceof Date })),
      });
      const url = createStandaloneServer(appRouter);

      {
        const res = await fetch(`${url}/date?d=2020-01-01T00%3A00%3A00.000Z`, { method: 'GET' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ isDate: true });
      }
      for (const value of ['not-a-date', '2020-13-45', '']) {
        const res = await fetch(`${url}/date?d=${value}`, { method: 'GET' });
        expect(res.status).toBe(400);
      }
    });
  });

  describe('V10: coercion does not mutate schemas', () => {
    test('router schema stays strict after a request', async () => {
      const schema = z.object({ n: z.number(), b: z.boolean() });
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(schema)
          .output(z.object({ n: z.number(), b: z.boolean() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo?n=5&b=false`, { method: 'GET' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ n: 5, b: false });

      expect(schema.safeParse({ n: 5, b: false }).success).toBe(true);
      expect(schema.safeParse({ n: '5', b: false }).success).toBe(false);
      expect(schema.safeParse({ n: 5, b: 'false' }).success).toBe(false);
    });
  });

  describe('V10: content type matching', () => {
    test('accepts case-insensitive JSON content types with parameters', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      for (const contentType of ['Application/JSON', 'application/json; charset=utf-8']) {
        const res = await fetch(`${url}/echo`, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ payload: 'hi' }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ payload: 'hi' });
      }
    });
  });

  describe('V10: BigInt output', () => {
    test('serializes bigint output as a decimal string', async () => {
      const appRouter = t.router({
        bigint: t.procedure
          .meta({ openapi: { method: 'GET', path: '/big-int-out' } })
          .input(z.void())
          .output(z.object({ n: z.bigint() }))
          .query(() => ({ n: BigInt(123) })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/big-int-out`, { method: 'GET' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ n: '123' });
    });
  });
});
