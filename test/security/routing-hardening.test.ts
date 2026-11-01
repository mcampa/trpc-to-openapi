import { Server } from 'http';
import { initTRPC } from '@trpc/server';
import fetch from 'node-fetch';
import { z } from 'zod/v4';

import {
  OpenApiMeta,
  OpenApiRouter,
  createOpenApiHttpHandler,
  createProcedureCache,
  getPathRegExp,
} from '../../src';

// @ts-expect-error - global fetch
global.fetch = fetch;

const t = initTRPC.meta<OpenApiMeta>().context<any>().create();

let server: Server | undefined;

const startServer = <TRouter extends OpenApiRouter>(router: TRouter): string => {
  const handler = createOpenApiHttpHandler<TRouter>({
    router,
    createContext: () => ({}),
  } as any);

  server = new Server((req, res) => {
    void handler(req, res);
  });
  server.listen(0);

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
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

  test('a valid parameter value still resolves to the parameter route', async () => {
    const url = startServer(createUsersRouter());

    const res = await fetch(`${url}/users/${userId}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: userId });
  });

  test('prefers the parameter route with more static segments', () => {
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

  test('warns about overlapping patterns of the same method in non-production', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    createProcedureCache(createUsersRouter());

    const warnings = warnSpy.mock.calls.flat().join(' ');
    expect(warnings).toContain('/users/{id}');
    expect(warnings).toContain('/users/me');
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
    const { regexp, paramNames } = getPathRegExp('/c++');

    expect(paramNames).toEqual([]);
    expect(regexp.test('/c++')).toBe(true);
    expect(regexp.test('/cpp')).toBe(false);
  });

  test('does not interpret dots or brackets as regex syntax', () => {
    const dotted = getPathRegExp('/v1.0/users').regexp;
    expect(dotted.test('/v1.0/users')).toBe(true);
    expect(dotted.test('/v1X0/users')).toBe(false);

    const bracketed = getPathRegExp('/users/[id]').regexp;
    expect(bracketed.test('/users/[id]')).toBe(true);
    expect(bracketed.test('/users/i')).toBe(false);
  });

  test('supports parameter names that are not valid capture group names', () => {
    const { regexp, paramNames } = getPathRegExp('/users/{user-id}');

    expect(paramNames).toEqual(['user-id']);
    expect(regexp.exec('/users/abc-123')?.[1]).toBe('abc-123');
  });

  test('maps positional capture groups to parameter names by index', () => {
    const { regexp, paramNames } = getPathRegExp('/users/{userId}/posts/{postId}');

    expect(paramNames).toEqual(['userId', 'postId']);
    const match = regexp.exec('/users/42/posts/99');
    expect(match?.[1]).toBe('42');
    expect(match?.[2]).toBe('99');
  });

  test('captures a parameter followed by a literal suffix', () => {
    const { regexp, paramNames } = getPathRegExp('/files/{name}.json');

    expect(paramNames).toEqual(['name']);
    expect(regexp.exec('/files/report.json')?.[1]).toBe('report');
    expect(regexp.test('/files/report.json.bak')).toBe(false);
  });

  test('uses non-greedy matching to prefer the earliest literal suffix', () => {
    const { regexp } = getPathRegExp('/x/{first}-{second}');

    const match = regexp.exec('/x/a-b-c');
    expect(match?.[1]).toBe('a');
    expect(match?.[2]).toBe('b-c');
  });

  test('rejects empty parameter names', () => {
    expect(() => getPathRegExp('/users/{}')).toThrow(/empty parameter name/i);
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

  test('decodes encoded slashes after matching on the raw path', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/..%2F..`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: '../..' });
  });

  test('decodes percent-encoded spaces', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/john%20doe`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ name: 'john doe' });
  });

  test('returns a clean 400 for malformed percent-encoding', async () => {
    const url = startServer(createUserRouter());

    const res = await fetch(`${url}/users/%E0%A4%A`);
    const body = (await res.json()) as { code: string; message: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
  });
});
