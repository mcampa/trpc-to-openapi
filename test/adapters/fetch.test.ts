import { TRPCError, initTRPC } from '@trpc/server';
import fetch from 'node-fetch';
import superjson from 'superjson';
import { z } from 'zod';

import {
  CreateOpenApiFetchHandlerOptions,
  OpenApiErrorResponse,
  OpenApiMeta,
  OpenApiRouter,
  createOpenApiFetchHandler,
} from '../../src';
import * as zodUtils from '../../src/utils/zod';

// @ts-expect-error - global fetch
global.fetch = fetch;

const createContextMock = jest.fn();
const responseMetaMock = jest.fn();
const onErrorMock = jest.fn();

const clearMocks = () => {
  createContextMock.mockClear();
  responseMetaMock.mockClear();
  onErrorMock.mockClear();
};

const createFetchHandlerCaller = <TRouter extends OpenApiRouter>(
  handlerOpts: CreateOpenApiFetchHandlerOptions<TRouter>,
) => {
  const openApiHttpHandler = createOpenApiFetchHandler<TRouter>({
    router: handlerOpts.router,
    createContext: handlerOpts.createContext ?? createContextMock,
    responseMeta: handlerOpts.responseMeta ?? responseMetaMock,
    onError: handlerOpts.onError ?? onErrorMock,
    req: handlerOpts.req,
  } as any);
  return openApiHttpHandler;
};

const t = initTRPC.meta<OpenApiMeta>().context<any>().create();

describe('fetch adapter', () => {
  afterEach(() => {
    clearMocks();
  });

  // Please note: validating router does not happen in `production`.
  test('with invalid router', async () => {
    const appRouter = t.router({
      invalidRoute: t.procedure
        .meta({ openapi: { method: 'GET', path: '/invalid-route' } })
        .input(z.void())
        .query(({ input }) => input),
    });

    const req = new Request('https://localhost:3000/invalid-route', {
      method: 'GET',
    });
    try {
      await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
    } catch (err) {
      const error = err as TRPCError;
      expect(error).toBeInstanceOf(TRPCError);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.message).toBe('[query.invalidRoute] - Output parser expects a Zod validator');
    }
  });

  test('with not found path', async () => {
    const appRouter = t.router({
      ping: t.procedure
        .meta({ openapi: { method: 'POST', path: '/ping' } })
        .input(z.void())
        .output(z.literal('pong'))
        .mutation(() => 'pong' as const),
    });

    const req = new Request('https://localhost:3000/pingg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(404);
    expect(body).toEqual(expect.objectContaining({ message: 'Not found', code: 'NOT_FOUND' }));
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with not found method', async () => {
    const appRouter = t.router({
      ping: t.procedure
        .meta({ openapi: { method: 'POST', path: '/ping' } })
        .input(z.void())
        .output(z.literal('pong'))
        .mutation(() => 'pong' as const),
    });

    const req = new Request('https://localhost:3000/ping', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(404);
    expect(body).toEqual(expect.objectContaining({ message: 'Not found', code: 'NOT_FOUND' }));
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with missing content-type header', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo', {
      method: 'POST',
      body: JSON.stringify('Lily'),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });
    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Input validation failed',
        code: 'BAD_REQUEST',
        issues: [
          {
            code: 'invalid_type',
            expected: 'string',
            message: 'Required',
            path: ['payload'],
            received: 'undefined',
          },
        ],
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with invalid content-type', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo', {
      method: 'POST',
      body: 'non-json-string',
      headers: { 'Content-Type': 'text/plain' },
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(415);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Unsupported content-type "text/plain',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with missing input', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo', {
      method: 'GET',
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Input validation failed',
        code: 'BAD_REQUEST',
        issues: [
          {
            code: 'invalid_type',
            expected: 'string',
            message: 'Required',
            path: ['payload'],
            received: 'undefined',
          },
        ],
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with wrong input type', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 123 }),
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Input validation failed',
        code: 'BAD_REQUEST',
        issues: [
          {
            code: 'invalid_type',
            expected: 'string',
            message: 'Expected string, received number',
            path: ['payload'],
            received: 'number',
          },
        ],
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with bad output', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        // @ts-expect-error - fail on purpose
        .mutation(() => 'fail'),
    });

    const req = new Request('https://localhost:3000/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: '@mcampa' }),
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(500);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Output validation failed',
        code: 'INTERNAL_SERVER_ERROR',
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
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
    });

    {
      const url = new URL('https://localhost:3000/say-hello');
      url.searchParams.set('name', 'Lily');
      const req = new Request(url, {
        method: 'GET',
      });
      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
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
      const req = new Request('https://localhost:3000/say-hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Lily' }),
      });
      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with void input', async () => {
    const appRouter = t.router({
      pingQuery: t.procedure
        .meta({ openapi: { method: 'GET', path: '/ping' } })
        .input(z.void())
        .output(z.literal('pong'))
        .query(() => 'pong' as const),
      pingMutation: t.procedure
        .meta({ openapi: { method: 'POST', path: '/ping' } })
        .input(z.void())
        .output(z.literal('pong'))
        .mutation(() => 'pong' as const),
    });

    {
      const req = new Request('https://localhost:3000/ping', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual('pong');
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const req = new Request('https://localhost:3000/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual('pong');
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with void output', async () => {
    const appRouter = t.router({
      ping: t.procedure
        .meta({ openapi: { method: 'GET', path: '/ping' } })
        .input(z.object({ ping: z.string() }))
        .output(z.void())
        .query(() => undefined),
    });

    const req = new Request('https://localhost:3000/ping?ping=ping', {
      method: 'GET',
    });
    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    let body;
    try {
      body = await res.json();
    } catch (e) {
      // do nothing
    }

    expect(res.status).toBe(200);
    expect(body).toEqual(undefined);
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with createContext', async () => {
    interface Context {
      id: 1234567890;
    }

    const t2 = initTRPC.meta<OpenApiMeta>().context<Context>().create();

    const appRouter = t2.router({
      echo: t2.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string(), context: z.object({ id: z.number() }) }))
        .query(({ input, ctx }) => ({ payload: input.payload, context: ctx })),
    });

    const req = new Request('https://localhost:3000/echo?payload=mcampa', {
      method: 'GET',
    });
    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
      createContext: (): Context => ({ id: 1234567890 }),
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      payload: 'mcampa',
      context: { id: 1234567890 },
    });
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with responseMeta', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo?payload=mcampa', {
      method: 'GET',
    });
    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
      responseMeta: () => ({ status: 202, headers: { 'x-custom': 'custom header' } }),
    });

    const body = await res.json();

    expect(res.status).toBe(202);
    expect(res.headers.get('x-custom')).toBe('custom header');
    expect(body).toEqual({
      payload: 'mcampa',
      context: undefined,
    });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with skipped transformer', async () => {
    const t2 = initTRPC.meta<OpenApiMeta>().context<any>().create({
      transformer: superjson,
    });

    const appRouter = t2.router({
      echo: t2.procedure
        .meta({ openapi: { method: 'GET', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo?payload=mcampa', {
      method: 'GET',
    });
    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      payload: 'mcampa',
    });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with warmup request', async () => {
    const appRouter = t.router({});

    const req = new Request('https://localhost:3000/any-endpoint', {
      method: 'HEAD',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    expect(res.status).toBe(204);
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(0);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with invalid json', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => ({ payload: input.payload })),
    });

    const req = new Request('https://localhost:3000/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // @ts-expect-error - not JSON.stringified
      body: { payload: 'Lily' },
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });
    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Failed to parse request body',
        code: 'PARSE_ERROR',
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with multiple input query string params', async () => {
    const appRouter = t.router({
      sayHello: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say-hello' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
    });

    {
      const req = new Request('https://localhost:3000/say-hello?name=Lily&name=mcampa', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with case insensitivity', async () => {
    const appRouter = t.router({
      allLowerPath: t.procedure
        .meta({ openapi: { method: 'GET', path: '/lower' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
      allUpperPath: t.procedure
        .meta({ openapi: { method: 'GET', path: '/UPPER' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
    });

    {
      const req = new Request('https://localhost:3000/LOWER?name=Lily', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
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
      const req = new Request('https://localhost:3000/upper?name=Lily', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with path parameters', async () => {
    const appRouter = t.router({
      sayHelloQuery: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say-hello/{name}' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({ greeting: `Hello ${input.name}!` })),
      sayHelloMutation: t.procedure
        .meta({ openapi: { method: 'POST', path: '/say-hello/{name}' } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .mutation(({ input }) => ({ greeting: `Hello ${input.name}!` })),
      sayHelloComplex: t.procedure
        .meta({ openapi: { method: 'GET', path: '/say-hello/{first}/{last}' } })
        .input(
          z.object({
            first: z.string(),
            last: z.string(),
            greeting: z.string(),
          }),
        )
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => ({
          greeting: `${input.greeting} ${input.first} ${input.last}!`,
        })),
    });

    {
      const req = new Request('https://localhost:3000/say-hello/Lily', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
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
      const req = new Request('https://localhost:3000/say-hello/Lily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'mcampa' }),
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
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
      const req = new Request(
        'https://localhost:3000/say-hello/Lily/Rose?greeting=Hello&first=mcampa',
        {
          method: 'GET',
        },
      );

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });

      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ greeting: 'Hello Lily Rose!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with bad output', async () => {
    const appRouter = t.router({
      badOutput: t.procedure
        .meta({ openapi: { method: 'GET', path: '/bad-output' } })
        .input(z.void())
        .output(z.string())
        // @ts-expect-error - intentional bad output
        .query(() => ({})),
    });

    const req = new Request('https://localhost:3000/bad-output', {
      method: 'GET',
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });
    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(500);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Output validation failed',
        code: 'INTERNAL_SERVER_ERROR',
      }),
    );
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with DELETE mutation', async () => {
    const appRouter = t.router({
      echoDelete: t.procedure
        .meta({ openapi: { method: 'DELETE', path: '/echo-delete' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .mutation(({ input }) => input),
    });

    const req = new Request('https://localhost:3000/echo-delete?payload=mcampa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ payload: 'mcampa' });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with POST query', async () => {
    const appRouter = t.router({
      echoPost: t.procedure
        .meta({ openapi: { method: 'POST', path: '/echo-post' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => input),
    });

    const req = new Request('https://localhost:3000/echo-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'mcampa' }),
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ payload: 'mcampa' });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with thrown error', async () => {
    const appRouter = t.router({
      customError: t.procedure
        .meta({ openapi: { method: 'POST', path: '/custom-error' } })
        .input(z.void())
        .output(z.void())
        .mutation(() => {
          throw new Error('Custom error message');
        }),
      customTRPCError: t.procedure
        .meta({ openapi: { method: 'POST', path: '/custom-trpc-error' } })
        .input(z.void())
        .output(z.void())
        .mutation(() => {
          throw new TRPCError({
            message: 'Custom TRPCError message',
            code: 'CLIENT_CLOSED_REQUEST',
          });
        }),
    });

    {
      const req = new Request('https://localhost:3000/custom-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });

      const body = (await res.json()) as OpenApiErrorResponse;

      expect(res.status).toBe(500);
      expect(body).toEqual(
        expect.objectContaining({
          message: 'Custom error message',
          code: 'INTERNAL_SERVER_ERROR',
        }),
      );
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(1);

      clearMocks();
    }
    {
      const req = new Request('https://localhost:3000/custom-trpc-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = (await res.json()) as OpenApiErrorResponse;

      expect(res.status).toBe(499);
      expect(body).toEqual(
        expect.objectContaining({
          message: 'Custom TRPCError message',
          code: 'CLIENT_CLOSED_REQUEST',
        }),
      );
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(1);
    }
  });

  test('with error formatter', async () => {
    const errorFormatterMock = jest.fn();

    const t2 = initTRPC
      .meta<OpenApiMeta>()
      .context<any>()
      .create({
        errorFormatter: ({ error, shape }) => {
          errorFormatterMock();
          if (error.code === 'INTERNAL_SERVER_ERROR') {
            return { ...shape, message: 'Custom formatted error message' };
          }
          return shape;
        },
      });

    const appRouter = t2.router({
      customFormattedError: t2.procedure
        .meta({ openapi: { method: 'POST', path: '/custom-formatted-error' } })
        .input(z.void())
        .output(z.void())
        .mutation(() => {
          throw new Error('Custom error message');
        }),
    });

    const req = new Request('https://localhost:3000/custom-formatted-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = (await res.json()) as OpenApiErrorResponse;

    expect(res.status).toBe(500);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Custom formatted error message',
        code: 'INTERNAL_SERVER_ERROR',
      }),
    );
    expect(errorFormatterMock).toHaveBeenCalledTimes(1);
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  test('with nested routers', async () => {
    const appRouter = t.router({
      procedure: t.procedure
        .meta({ openapi: { method: 'GET', path: '/procedure' } })
        .input(z.object({ payload: z.string() }))
        .output(z.object({ payload: z.string() }))
        .query(({ input }) => ({ payload: input.payload })),
      router: t.router({
        procedure: t.procedure
          .meta({ openapi: { method: 'GET', path: '/router/procedure' } })
          .input(z.object({ payload: z.string() }))
          .output(z.object({ payload: z.string() }))
          .query(({ input }) => ({ payload: input.payload })),
        router: t.router({
          procedure: t.procedure
            .meta({ openapi: { method: 'GET', path: '/router/router/procedure' } })
            .input(z.object({ payload: z.string() }))
            .output(z.object({ payload: z.string() }))
            .query(({ input }) => ({ payload: input.payload })),
        }),
      }),
    });

    {
      const req = new Request('https://localhost:3000/procedure?payload=one', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ payload: 'one' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const req = new Request('https://localhost:3000/router/procedure?payload=two', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ payload: 'two' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const req = new Request('https://localhost:3000/router/router/procedure?payload=three', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ payload: 'three' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with multiple inputs', async () => {
    const appRouter = t.router({
      multiInput: t.procedure
        .meta({ openapi: { method: 'GET', path: '/multi-input' } })
        .input(z.object({ firstName: z.string() }))
        .input(z.object({ lastName: z.string() }))
        .output(z.object({ fullName: z.string() }))
        .query(({ input }) => ({ fullName: `${input.firstName} ${input.lastName}` })),
    });

    const req = new Request('https://localhost:3000/multi-input?firstName=Lily&lastName=Rose', {
      method: 'GET',
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ fullName: 'Lily Rose' });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with preprocess', async () => {
    const appRouter = t.router({
      preprocess: t.procedure
        .meta({ openapi: { method: 'GET', path: '/preprocess' } })
        .input(
          z.object({
            value: z.preprocess((arg) => [arg, arg], z.array(z.string())),
          }),
        )
        .output(z.object({ result: z.string() }))
        .query(({ input }) => ({ result: input.value.join('XXX') })),
    });

    const req = new Request('https://localhost:3000/preprocess?value=lol', {
      method: 'GET',
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ result: 'lolXXXlol' });
    expect(createContextMock).toHaveBeenCalledTimes(1);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
  });

  test('with non-coerce preprocess', async () => {
    // only applies when zod does not support (below version v3.20.0)

    // @ts-expect-error - hack to disable zodSupportsCoerce
    zodUtils.zodSupportsCoerce = false;
    {
      const appRouter = t.router({
        plusOne: t.procedure
          .meta({ openapi: { method: 'GET', path: '/plus-one' } })
          .input(
            z.object({
              number: z.preprocess(
                (arg) => (typeof arg === 'string' ? parseInt(arg) : arg),
                z.number(),
              ),
            }),
          )
          .output(z.object({ result: z.number() }))
          .query(({ input }) => ({ result: input.number + 1 })),
      });

      const req = new Request('https://localhost:3000/plus-one?number=9', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });

      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ result: 10 });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
    // @ts-expect-error - hack to re-enable zodSupportsCoerce
    zodUtils.zodSupportsCoerce = true;
  });

  test('with coerce', async () => {
    const appRouter = t.router({
      getPlusOne: t.procedure
        .meta({ openapi: { method: 'GET', path: '/plus-one' } })
        .input(z.object({ number: z.number() }))
        .output(z.object({ result: z.number() }))
        .query(({ input }) => ({ result: input.number + 1 })),
      postPlusOne: t.procedure
        .meta({ openapi: { method: 'POST', path: '/plus-one' } })
        .input(z.object({ date: z.date() }))
        .output(z.object({ result: z.number() }))
        .mutation(({ input }) => ({ result: input.date.getTime() + 1 })),
      pathPlusOne: t.procedure
        .meta({ openapi: { method: 'GET', path: '/plus-one/{number}' } })
        .input(z.object({ number: z.number() }))
        .output(z.object({ result: z.number() }))
        .query(({ input }) => ({ result: input.number + 1 })),
    });

    {
      const req = new Request('https://localhost:3000/plus-one?number=9', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });

      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ result: 10 });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const date = new Date();
      const req = new Request('https://localhost:3000/plus-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });

      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ result: date.getTime() + 1 });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }

    {
      const req = new Request('https://localhost:3000/plus-one/9', {
        method: 'GET',
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/',
        req,
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ result: 10 });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with x-www-form-urlencoded', async () => {
    const appRouter = t.router({
      echo: t.procedure
        .meta({
          openapi: {
            method: 'POST',
            path: '/echo',
            contentTypes: ['application/x-www-form-urlencoded'],
          },
        })
        .input(z.object({ payload: z.array(z.string()) }))
        .output(z.object({ result: z.string() }))
        .query(({ input }) => ({ result: input.payload.join(' ') })),
    });

    const data = new URLSearchParams();

    data.append('payload', 'Hello');
    data.append('payload', 'World');

    const req = new Request('https://localhost:3000/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data.toString(),
    });

    const res = await createFetchHandlerCaller({
      router: appRouter,
      endpoint: '/',
      req,
    });

    const body = await res.json();

    expect(res.status).toBe(415);
    expect(body).toEqual(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });
});
