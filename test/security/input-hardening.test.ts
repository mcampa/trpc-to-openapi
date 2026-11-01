import { TRPCError, initTRPC } from '@trpc/server';
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
import { sanitizeInput } from '../../src/utils/object';
import {
  coerceSchema,
  instanceofZodTypeLikeString,
  unwrapZodInputSide,
  unwrapZodType,
} from '../../src/utils/zod';

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

const createStandaloneServer = <TRouter extends OpenApiRouter>(
  router: TRouter,
  opts: { onError?: (...args: any[]) => void } = {},
) => {
  const openApiHttpHandler = createOpenApiHttpHandler<TRouter>({ router, ...opts } as any);
  const server = new Server((req, res) => {
    void openApiHttpHandler(req, res);
  });
  server.listen(0);
  return getServerUrl(server);
};

// Router validation in non-production rejects top-level non-object parsers,
// so create the handler as production would.
const createStandaloneServerWithoutValidation = <TRouter extends OpenApiRouter>(
  router: TRouter,
) => {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    return createStandaloneServer(router);
  } finally {
    if (nodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = nodeEnv;
    }
  }
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

  describe('prototype-safe user surfaces', () => {
    test('sanitizeInput drops __proto__, copies deeply and preserves cycles', () => {
      // JSON.parse creates an own `__proto__` key, unlike an object literal.
      const cyclic: any = { nested: JSON.parse('{"__proto__":{"role":"admin"},"keep":1}') };
      cyclic.self = cyclic;

      const copy = sanitizeInput(cyclic) as any;

      expect(copy).not.toBe(cyclic);
      expect(copy.self).toBe(copy);
      expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(copy.nested)).toBe(Object.prototype);
      expect(copy.nested.keep).toBe(1);
      expect(copy.nested.role).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(copy.nested, '__proto__')).toBe(false);
    });

    test('passthrough, loose and catchall schemas drop __proto__', async () => {
      const schemas: z.ZodType<any>[] = [
        z.object({ name: z.string() }).passthrough(),
        z.looseObject({ name: z.string() }),
        z.object({ name: z.string() }).catchall(z.unknown()),
      ];

      for (const schema of schemas) {
        const appRouter = t.router({
          echo: t.procedure
            .meta({ openapi: { method: 'POST', path: '/echo' } })
            .input(schema)
            .output(
              z.object({
                name: z.string(),
                roleIsUndefined: z.boolean(),
                hasRole: z.boolean(),
                prototypeIsObject: z.boolean(),
                hasOwnPropertyIsFunction: z.boolean(),
              }),
            )
            .mutation(({ input }: any) => ({
              name: input.name,
              roleIsUndefined: input.role === undefined,
              hasRole: 'role' in input,
              prototypeIsObject: Object.getPrototypeOf(input) === Object.prototype,
              hasOwnPropertyIsFunction: typeof input.hasOwnProperty === 'function',
            })),
        });
        const url = createStandaloneServer(appRouter);

        const res = await fetch(`${url}/echo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"name":"n","__proto__":{"role":"admin"}}',
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
          name: 'n',
          roleIsUndefined: true,
          hasRole: false,
          prototypeIsObject: true,
          hasOwnPropertyIsFunction: true,
        });
        expect(({} as any).role).toBeUndefined();
      }
    });

    test('z.any() receives a normal-prototype object', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(z.any())
          .output(
            z.object({
              prototypeIsObject: z.boolean(),
              hasOwnPropertyIsFunction: z.boolean(),
              ownHasOwnProperty: z.boolean(),
              hasQ: z.boolean(),
              q: z.string(),
              toStringIsFunction: z.boolean(),
              nestedRoleIsUndefined: z.boolean(),
              nestedHasRole: z.boolean(),
            }),
          )
          .mutation(({ input }: any) => ({
            prototypeIsObject: Object.getPrototypeOf(input) === Object.prototype,
            hasOwnPropertyIsFunction: typeof input.hasOwnProperty === 'function',
            ownHasOwnProperty: Object.prototype.hasOwnProperty.call(input, 'hasOwnProperty'),
            hasQ: Object.prototype.hasOwnProperty.call(input, 'q'),
            q: input.q,
            toStringIsFunction: typeof input.toString === 'function',
            nestedRoleIsUndefined: input.nested.role === undefined,
            nestedHasRole: 'role' in input.nested,
          })),
      });
      const url = createStandaloneServerWithoutValidation(appRouter);

      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"q":"hi","nested":{"__proto__":{"role":"admin"}}}',
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        prototypeIsObject: true,
        hasOwnPropertyIsFunction: true,
        ownHasOwnProperty: false,
        hasQ: true,
        q: 'hi',
        toStringIsFunction: true,
        nestedRoleIsUndefined: true,
        nestedHasRole: false,
      });
    });

    test('z.preprocess callbacks receive a normal-prototype object', async () => {
      let observed = false;
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(
            z.preprocess(
              (value: any) => {
                observed =
                  value !== null &&
                  typeof value === 'object' &&
                  typeof value.hasOwnProperty === 'function' &&
                  value.hasOwnProperty('q');
                return value;
              },
              z.object({ q: z.string(), toString: z.string().optional() }),
            ),
          )
          .output(z.object({ q: z.string(), observed: z.boolean() }))
          .query(({ input }) => ({ q: input.q, observed })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo?q=hi`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ q: 'hi', observed: true });
    });

    test('onError receives a normal-prototype input object', async () => {
      let observed = false;
      const appRouter = t.router({
        fail: t.procedure
          .meta({ openapi: { method: 'GET', path: '/fail' } })
          .input(z.object({ q: z.string() }))
          .output(z.object({}))
          .query(() => {
            throw new TRPCError({ code: 'CONFLICT' });
          }),
      });
      const url = createStandaloneServer(appRouter, {
        onError: ({ input }: any) => {
          observed = typeof input.hasOwnProperty === 'function' && input.hasOwnProperty('q');
        },
      });

      const res = await fetch(`${url}/fail?q=hi`);

      expect(res.status).toBe(409);
      expect(observed).toBe(true);
    });
  });

  describe('nested container coercion', () => {
    test('coerces record values', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(
            z.object({
              scores: z.record(z.string(), z.number()),
              items: z.record(
                z.string(),
                z.object({ n: z.number(), toString: z.string().optional() }),
              ),
            }),
          )
          .output(
            z.object({
              scores: z.record(z.string(), z.number()),
              itemN: z.number(),
              itemToString: z.string(),
            }),
          )
          .mutation(({ input }: any) => ({
            scores: input.scores,
            itemN: input.items.a.n,
            itemToString: typeof input.items.a.toString,
          })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: { a: '5', b: '6' }, items: { a: { n: '7' } } }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        scores: { a: 5, b: 6 },
        itemN: 7,
        itemToString: 'undefined',
      });
    });

    test('coerces union, intersection and tuple values and shadows Object.prototype names', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(
            z.object({
              union: z.union([
                z.object({ q: z.string(), toString: z.string().optional() }),
                z.string(),
              ]),
              intersection: z.intersection(
                z.object({ q: z.string(), toString: z.string().optional() }),
                z.object({ n: z.number(), constructor: z.string().optional() }),
              ),
              tuple: z.tuple([
                z.object({ q: z.string(), toString: z.string().optional() }),
                z.number(),
              ]),
              unionNumber: z.union([z.number(), z.boolean()]),
            }),
          )
          .output(
            z.object({
              unionQ: z.string(),
              unionToString: z.string(),
              intersectionN: z.number(),
              intersectionConstructor: z.string(),
              tupleQ: z.string(),
              tupleN: z.number(),
              tupleToString: z.string(),
              unionNumber: z.number(),
            }),
          )
          .mutation(({ input }: any) => ({
            unionQ: input.union.q,
            unionToString: typeof input.union.toString,
            intersectionN: input.intersection.n,
            intersectionConstructor: typeof input.intersection.constructor,
            tupleQ: input.tuple[0].q,
            tupleN: input.tuple[1],
            tupleToString: typeof input.tuple[0].toString,
            unionNumber: input.unionNumber,
          })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          union: { q: 'u' },
          intersection: { q: 'i', n: '5' },
          tuple: [{ q: 't' }, '7'],
          unionNumber: '5',
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        unionQ: 'u',
        unionToString: 'undefined',
        intersectionN: 5,
        intersectionConstructor: 'undefined',
        tupleQ: 't',
        tupleN: 7,
        tupleToString: 'undefined',
        unionNumber: 5,
      });
    });

    test('coerces the option selected by a discriminated union discriminator', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(
            z.object({
              payload: z.discriminatedUnion('kind', [
                z.object({ kind: z.literal('str'), s: z.string() }),
                z.object({ kind: z.literal('num'), n: z.number() }),
              ]),
            }),
          )
          .output(z.object({ kind: z.string(), n: z.number() }))
          .mutation(({ input }: any) => ({ kind: input.payload.kind, n: input.payload.n })),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { kind: 'num', n: '5' } }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ kind: 'num', n: 5 });
    });
  });

  describe('wrapper coercion', () => {
    test('coerces through catch, readonly and nonoptional wrappers', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(
            z.object({
              caught: z.number().catch(0),
              readonly: z.number().readonly(),
              nonoptional: z.number().nonoptional(),
            }),
          )
          .output(
            z.object({
              caught: z.number(),
              readonly: z.number(),
              nonoptional: z.number(),
            }),
          )
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo?caught=5&readonly=6&nonoptional=7`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ caught: 5, readonly: 6, nonoptional: 7 });
    });
  });

  describe('cycle guards', () => {
    test('unwrapZodInputSide terminates on a pipe reached through a lazy', () => {
      const S: any = z.lazy(() => S.pipe(z.object({ x: z.string() })));

      expect(() => unwrapZodInputSide(S)).not.toThrow();
    });

    test('instanceofZodTypeLikeString terminates on a recursive union', () => {
      const Json: z.ZodType<any> = z.lazy(() => z.union([z.string(), z.array(Json)]));

      expect(() => instanceofZodTypeLikeString(Json)).not.toThrow();
      expect(instanceofZodTypeLikeString(Json)).toBe(false);
    });

    test('coerceSchema terminates on a recursive object shape', () => {
      const Category: z.ZodType<any> = z.lazy(() =>
        z.object({ name: z.string(), sub: Category.optional() }),
      );
      const schema = z.object({ category: Category });

      expect(() => coerceSchema(schema)).not.toThrow();
    });
  });

  describe('numeric precision', () => {
    test('rejects query integers outside the safe integer range', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(z.object({ id: z.number() }))
          .output(z.object({ id: z.number() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const safe = await fetch(`${url}/echo?id=9007199254740991`);
      expect(safe.status).toBe(200);
      expect(await safe.json()).toEqual({ id: 9007199254740991 });

      const unsafe = await fetch(`${url}/echo?id=9007199254740993`);
      expect(unsafe.status).toBe(400);
      expect(await unsafe.json()).toEqual(
        expect.objectContaining({ code: 'BAD_REQUEST', message: 'Input validation failed' }),
      );
    });
  });

  describe('query and JSON body coercion modes', () => {
    test('JSON body strings keep numeric, bigint and date compatibility', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(z.object({ n: z.number(), b: z.bigint(), d: z.date() }))
          .output(z.object({ n: z.number(), b: z.string(), d: z.string() }))
          .mutation(({ input }) => ({
            n: input.n,
            b: input.b.toString(),
            d: input.d.toISOString(),
          })),
      });
      const url = createStandaloneServer(appRouter);

      for (const [n, expected] of [
        ['0x10', 16],
        [' 5 ', 5],
      ] as [string, number][]) {
        const res = await fetch(`${url}/echo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ n, b: '0x10', d: '2020-01-01' }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
          n: expected,
          b: '16',
          d: '2020-01-01T00:00:00.000Z',
        });
      }
    });

    test('query parameters use the strict grammar', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(z.object({ n: z.number() }))
          .output(z.object({ n: z.number() }))
          .query(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      for (const query of ['n=0x10', 'n=%205']) {
        const res = await fetch(`${url}/echo?${query}`);

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(
          expect.objectContaining({ code: 'BAD_REQUEST', message: 'Input validation failed' }),
        );
      }
    });
  });

  describe('strict ISO date parsing', () => {
    const appRouter = () =>
      t.router({
        date: t.procedure
          .meta({ openapi: { method: 'GET', path: '/date' } })
          .input(z.object({ d: z.date() }))
          .output(z.object({ ok: z.boolean(), time: z.number() }))
          .query(({ input }) => ({ ok: true, time: input.d.getTime() })),
      });

    test('accepts ISO date-only and RFC 3339 date-time values', async () => {
      const url = createStandaloneServer(appRouter());

      for (const [value, expected] of [
        ['2020-01-01', Date.UTC(2020, 0, 1)],
        ['2020-02-29', Date.UTC(2020, 1, 29)],
        ['2020-01-01T00:00:00Z', Date.UTC(2020, 0, 1)],
        ['2020-01-01t00:00:00z', Date.UTC(2020, 0, 1)],
        ['2020-01-01T12:30Z', Date.UTC(2020, 0, 1, 12, 30)],
        ['2020-01-01T12:30:45.123+05:30', Date.UTC(2020, 0, 1, 7, 0, 45, 123)],
      ] as [string, number][]) {
        const res = await fetch(`${url}/date?d=${encodeURIComponent(value)}`);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, time: expected });
      }
    });

    test('rejects loose, impossible and offset-less date values', async () => {
      const url = createStandaloneServer(appRouter());

      for (const value of [
        '0',
        '1/1/2020',
        '2020-02-30',
        '2020-01-01T00:00:00',
        '2020-13-01T00:00:00Z',
        '2020-01-01T24:00:00Z',
      ]) {
        const res = await fetch(`${url}/date?d=${encodeURIComponent(value)}`);

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(
          expect.objectContaining({ code: 'BAD_REQUEST', message: 'Input validation failed' }),
        );
      }
    });
  });

  describe('Request body parsing errors', () => {
    test('malformed JSON returns PARSE_ERROR from a Request-backed handler', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      for (const contentType of ['application/json', 'Application/JSON']) {
        const res = await fetch(`${url}/echo`, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: 'not-json',
        });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(
          expect.objectContaining({
            message: 'Failed to parse request body',
            code: 'PARSE_ERROR',
          }),
        );
      }
    });
  });

  describe('structured JSON media types', () => {
    test('accepts application/json-patch+json', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'POST', path: '/echo' } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .mutation(({ input }) => input),
      });
      const url = createStandaloneServer(appRouter);

      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify({ payload: 'hi' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ payload: 'hi' });
    });
  });
});
