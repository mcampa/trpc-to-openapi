import { initTRPC } from '@trpc/server';
import fetch from 'node-fetch';
import { z } from 'zod/v4';

import {
  OpenApiMeta,
  OpenApiRouter,
  createOpenApiHttpHandler,
  createProcedureCache,
  getPathParameters,
  getPathRegExp,
} from '../../src';
import { createHttpServerWithRouter, TestHttpServer } from '../helpers/http-server';

// @ts-expect-error - global fetch
global.fetch = fetch;

const t = initTRPC.meta<OpenApiMeta>().context<any>().create();

let server: TestHttpServer | undefined;

const startServer = <TRouter extends OpenApiRouter>(router: TRouter): string => {
  server = createHttpServerWithRouter<TRouter>({
    router,
    createContext: () => ({}),
  } as any);
  return server.url;
};

afterEach(() => {
  server?.close();
  server = undefined;
  jest.restoreAllMocks();
});

describe('V4 - static routes must not be shadowed by parameter routes', () => {
  const userId = 'd3b07384-d9a0-4c9b-8a1e-2f1a4b7c9d01';

  const createUsersRouter = () =>
    t.router({
      getUserById: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/{id}' } })
        .input(z.object({ id: z.string().uuid() }))
        .output(z.object({ id: z.string() }))
        .query(({ input }) => ({ id: input.id })),
      getMe: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/me' } })
        .input(z.void())
        .output(z.object({ me: z.literal(true) }))
        .query(() => ({ me: true as const })),
    });

  test('an earlier parameter route does not shadow a static route', async () => {
    const url = startServer(createUsersRouter());

    const res = await fetch(`${url}/users/me`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ me: true });
  });

  test('a percent-encoded static route still resolves to the static route', async () => {
    const url = startServer(createUsersRouter());

    // `%6D` is the unreserved character `m`.
    const res = await fetch(`${url}/users/%6De`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ me: true });
  });

  test('a valid parameter value still resolves to the parameter route', async () => {
    const url = startServer(createUsersRouter());

    const res = await fetch(`${url}/users/${userId}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: userId });
  });

  test('prefers the parameter route with more literal characters', () => {
    const appRouter = t.router({
      generic: t.procedure
        .meta({ openapi: { method: 'GET', path: '/{section}/{slug}' } })
        .input(z.object({ section: z.string(), slug: z.string() }))
        .output(z.object({ route: z.string() }))
        .query(() => ({ route: 'generic' })),
      specific: t.procedure
        .meta({ openapi: { method: 'GET', path: '/files/{name}-{part}' } })
        .input(z.object({ name: z.string(), part: z.string() }))
        .output(z.object({ route: z.string() }))
        .query(() => ({ route: 'specific' })),
    });

    const cache = createProcedureCache(appRouter);
    const resolved = cache('GET', '/files/report-final');

    expect(resolved?.procedure?.path).toBe('specific');
    expect(resolved?.pathInput).toEqual({ name: 'report', part: 'final' });
  });

  test.each([
    ['mixed route registered first', true],
    ['mixed route registered last', false],
  ])('a mixed-segment route beats a catch-all route (%s)', (_label, mixedFirst) => {
    const mixed = t.procedure
      .meta({ openapi: { method: 'GET', path: '/files/{name}.{ext}' } })
      .input(z.object({ name: z.string(), ext: z.string() }))
      .output(z.object({ name: z.string(), ext: z.string() }))
      .query(({ input }) => input);
    const catchAll = t.procedure
      .meta({ openapi: { method: 'GET', path: '/files/{path}' } })
      .input(z.object({ path: z.string() }))
      .output(z.object({ path: z.string() }))
      .query(({ input }) => input);

    const appRouter = t.router(mixedFirst ? { mixed, catchAll } : { catchAll, mixed });
    const cache = createProcedureCache(appRouter);

    expect(cache('GET', '/files/report.pdf')).toEqual(
      expect.objectContaining({
        procedure: expect.objectContaining({ path: 'mixed' }),
        pathInput: { name: 'report', ext: 'pdf' },
      }),
    );
    expect(cache('GET', '/files/readme')).toEqual(
      expect.objectContaining({
        procedure: expect.objectContaining({ path: 'catchAll' }),
        pathInput: { path: 'readme' },
      }),
    );
  });

  test('warns about overlapping patterns of the same method in non-production', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    createProcedureCache(createUsersRouter());

    const warnings = warnSpy.mock.calls.flat().join(' ');
    expect(warnings).toContain('/users/{id}');
    expect(warnings).toContain('/users/me');
  });

  test('warns about overlapping mixed-segment patterns', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const appRouter = t.router({
      first: t.procedure
        .meta({ openapi: { method: 'GET', path: '/mix/{a}.json' } })
        .input(z.object({ a: z.string() }))
        .output(z.object({ a: z.string() }))
        .query(({ input }) => input),
      second: t.procedure
        .meta({ openapi: { method: 'GET', path: '/mix/{b}.json' } })
        .input(z.object({ b: z.string() }))
        .output(z.object({ b: z.string() }))
        .query(({ input }) => input),
    });

    createProcedureCache(appRouter);

    const warnings = warnSpy.mock.calls.flat().join(' ');
    expect(warnings).toContain('/mix/{a}.json');
    expect(warnings).toContain('/mix/{b}.json');
  });

  test('warns only once per router across repeated handler creations', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const appRouter = createUsersRouter();

    createOpenApiHttpHandler({ router: appRouter });
    createOpenApiHttpHandler({ router: appRouter });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('does not warn about overlapping patterns in production', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const previousEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    try {
      createProcedureCache(createUsersRouter());
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousEnv;
    }

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('V7 - path patterns must be escaped before compiling', () => {
  test('escapes regex metacharacters in static segments', () => {
    const regexp = getPathRegExp('/c++');

    expect(regexp.paramNames).toEqual([]);
    expect(regexp.test('/c++')).toBe(true);
    expect(regexp.test('/cpp')).toBe(false);
  });

  test('does not interpret dots or brackets as regex syntax', () => {
    const dotted = getPathRegExp('/v1.0/users');
    expect(dotted.test('/v1.0/users')).toBe(true);
    expect(dotted.test('/v1X0/users')).toBe(false);

    const bracketed = getPathRegExp('/users/[id]');
    expect(bracketed.test('/users/[id]')).toBe(true);
    expect(bracketed.test('/users/i')).toBe(false);
  });

  test('supports parameter names that are not valid capture group names', () => {
    const regexp = getPathRegExp('/users/{user-id}');

    expect(regexp.paramNames).toEqual(['user-id']);
    expect(regexp.exec('/users/abc-123')?.[1]).toBe('abc-123');
  });

  test('maps positional capture groups to parameter names by index', () => {
    const regexp = getPathRegExp('/users/{userId}/posts/{postId}');

    expect(regexp.paramNames).toEqual(['userId', 'postId']);
    const match = regexp.exec('/users/42/posts/99');
    expect(match?.[1]).toBe('42');
    expect(match?.[2]).toBe('99');
  });

  test('captures a parameter followed by a literal suffix', () => {
    const regexp = getPathRegExp('/files/{name}.json');

    expect(regexp.paramNames).toEqual(['name']);
    expect(regexp.exec('/files/report.json')?.[1]).toBe('report');
    expect(regexp.test('/files/report.json.bak')).toBe(false);
  });

  test('uses greedy matching so multi-parameter segments split at the last delimiter', () => {
    const regexp = getPathRegExp('/x/{first}-{second}');

    const match = regexp.exec('/x/a-b-c');
    expect(match?.[1]).toBe('a-b');
    expect(match?.[2]).toBe('c');
  });

  test('splits /posts/{slug}-{id} like the pre-existing named-group implementation', () => {
    const regexp = getPathRegExp('/posts/{slug}-{id}');

    const match = regexp.exec('/posts/hello-world-123');
    expect(match?.[1]).toBe('hello-world');
    expect(match?.[2]).toBe('123');
  });

  test('rejects empty parameter names', () => {
    expect(() => getPathRegExp('/users/{}')).toThrow(/empty parameter name/i);
  });

  test('rejects duplicate parameter names', () => {
    expect(() => getPathRegExp('/users/{id}/posts/{id}')).toThrow(/duplicate parameter name/i);
  });

  test('rejects duplicate parameter names when creating a handler', () => {
    const appRouter = t.router({
      duplicate: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/{id}/posts/{id}' } })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string() }))
        .query(({ input }) => input),
    });

    expect(() => createOpenApiHttpHandler({ router: appRouter })).toThrow(
      /duplicate parameter name/i,
    );
  });

  test('uses the shared tokenizer for generator path parameters', () => {
    expect(getPathParameters('/files/{name}.{ext}')).toEqual(['name', 'ext']);
    expect(() => getPathParameters('/users/{}')).toThrow(/empty parameter name/i);
  });

  test('rejects empty parameter names when creating a handler', () => {
    const appRouter = t.router({
      empty: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/{}' } })
        .input(z.object({}))
        .output(z.object({}))
        .query(() => ({})),
    });

    expect(() => createOpenApiHttpHandler({ router: appRouter })).toThrow(/empty parameter name/i);
  });

  test('creates a handler for literal paths containing regex metacharacters', async () => {
    const appRouter = t.router({
      plus: t.procedure
        .meta({ openapi: { method: 'GET', path: '/c++' } })
        .input(z.void())
        .output(z.literal('plus'))
        .query(() => 'plus' as const),
    });

    expect(() => createOpenApiHttpHandler({ router: appRouter })).not.toThrow();

    const url = startServer(appRouter);
    const res = await fetch(`${url}/c++`);

    expect(res.status).toBe(200);
    expect(await res.json()).toBe('plus');
  });

  test('creates a handler for parameter names that are not valid capture group names', async () => {
    const appRouter = t.router({
      getUser: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/{user-id}' } })
        .input(z.object({ 'user-id': z.string() }))
        .output(z.object({ id: z.string() }))
        .query(({ input }) => ({ id: input['user-id'] })),
    });

    expect(() => createOpenApiHttpHandler({ router: appRouter })).not.toThrow();

    const url = startServer(appRouter);
    const res = await fetch(`${url}/users/abc-123`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'abc-123' });
  });

  test('does not match a literal path at regex-equivalent paths', async () => {
    const appRouter = t.router({
      versioned: t.procedure
        .meta({ openapi: { method: 'GET', path: '/v1.0/users' } })
        .input(z.void())
        .output(z.literal('v1'))
        .query(() => 'v1' as const),
    });

    const url = startServer(appRouter);

    const hit = await fetch(`${url}/v1.0/users`);
    expect(hit.status).toBe(200);

    const miss = await fetch(`${url}/v1X0/users`);
    expect(miss.status).toBe(404);
  });

  test('matches bracketed path segments literally only', async () => {
    const appRouter = t.router({
      bracketed: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/[id]' } })
        .input(z.void())
        .output(z.literal('bracketed'))
        .query(() => 'bracketed' as const),
    });

    const url = startServer(appRouter);

    const hit = await fetch(`${url}/users/[id]`);
    expect(hit.status).toBe(200);

    const miss = await fetch(`${url}/users/i`);
    expect(miss.status).toBe(404);
  });
});

describe('V8 - path parameters must be URL-decoded', () => {
  const createUserRouter = () =>
    t.router({
      updateUser: t.procedure
        .meta({ openapi: { method: 'POST', path: '/users/{id}' } })
        .input(z.object({ id: z.string() }))
        .output(z.object({ id: z.string() }))
        .mutation(({ input }) => ({ id: input.id })),
      getUser: t.procedure
        .meta({ openapi: { method: 'GET', path: '/users/{name}' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ name: z.string() }))
        .query(({ input }) => ({ name: input.name })),
    });

  test('keeps encoded slashes encoded after matching on the raw path', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/..%2F..`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: '..%2F..' });
  });

  test('keeps encoded backslashes encoded', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/..%5C..`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ name: '..%5C..' });
  });

  test('decodes percent-encoded spaces', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/john%20doe`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ name: 'john doe' });
  });

  test('decodes a doubly encoded space only once', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/foo%2520bar`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ name: 'foo%20bar' });
  });

  test('returns a clean 400 for malformed percent-encoding', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/%E0%A4%A`);
    const body = (await res.json()) as { code: string; message: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
  });
});

describe('V9 - path parameter names must be preserved', () => {
  test('preserves a parameter named __proto__ in the resolved path input', () => {
    const appRouter = t.router({
      proto: t.procedure
        .meta({ openapi: { method: 'GET', path: '/proto/{__proto__}' } })
        .input(z.object({}))
        .output(z.object({}))
        .query(() => ({})),
    });

    const resolved = createProcedureCache(appRouter)('GET', '/proto/value');

    expect(resolved?.procedure.path).toBe('proto');
    expect(Object.prototype.hasOwnProperty.call(resolved?.pathInput, '__proto__')).toBe(true);
    expect(Reflect.get(resolved!.pathInput, '__proto__')).toBe('value');
  });
});
