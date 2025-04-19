import { initTRPC } from '@trpc/server';
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { NextApiRequestCookies, NextApiRequestQuery } from 'next/dist/server/api-utils';
import { Socket } from 'net';
import { z } from 'zod';

import {
  CreateOpenApiNextHandlerOptions,
  OpenApiMeta,
  OpenApiResponse,
  OpenApiRouter,
  createOpenApiNextHandler,
} from '../../src';

type NextApiRequestOptions = Partial<NextApiRequestMock>;
class NextApiRequestMock extends IncomingMessage implements NextApiRequest {
  public query: NextApiRequestQuery = {};
  public cookies: NextApiRequestCookies = {};
  public headers: IncomingHttpHeaders = {};
  public env = {};
  public body: unknown;

  constructor(options: NextApiRequestOptions) {
    super(new Socket());

    this.method = options.method;
    this.body = options.body;
    this.query = options.query ?? {};
    this.headers = options.headers ?? {};
    this.env = options.env ?? {};
  }
}

const createContextMock = jest.fn();
const responseMetaMock = jest.fn();
const onErrorMock = jest.fn();

const clearMocks = () => {
  createContextMock.mockClear();
  responseMetaMock.mockClear();
  onErrorMock.mockClear();
};

const createOpenApiNextHandlerCaller = <TRouter extends OpenApiRouter>(
  handlerOpts: CreateOpenApiNextHandlerOptions<TRouter>,
) => {
  const openApiNextHandler = createOpenApiNextHandler({
    router: handlerOpts.router,
    createContext: handlerOpts.createContext ?? createContextMock,
    responseMeta: handlerOpts.responseMeta ?? responseMetaMock,
    onError: handlerOpts.onError ?? onErrorMock,
  } as any);

  return (req: {
    method: string;
    query: Record<string, any>;
    body?: any;
    headers?: Record<string, any>;
  }) => {
    return new Promise<{
      statusCode: number;
      headers: Record<string, any>;
      body: OpenApiResponse;
    }>(async (resolve, reject) => {
      const headers = new Headers();
      let body: any;
      const nextResponse = {
        statusCode: undefined,
        setHeader: (key: string, value: any) => headers.set(key, value),
        getHeaders: () => Object.fromEntries(headers.entries()),
        end: (data: string) => {
          body = JSON.parse(data);
        },
      } as unknown as NextApiResponse;

      const nextRequest = new NextApiRequestMock({
        method: req.method,
        query: req.query,
        body: req.body,
        headers: req.headers,
      });

      try {
        await openApiNextHandler(nextRequest, nextResponse);
        resolve({
          statusCode: nextResponse.statusCode,
          headers: nextResponse.getHeaders(),
          body,
        });
      } catch (error) {
        reject(error);
      }
    });
  };
};

const t = initTRPC.meta<OpenApiMeta>().context().create();

describe('next adapter', () => {
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

    const openApiNextHandlerCaller = createOpenApiNextHandlerCaller({
      router: appRouter,
    });

    {
      const res = await openApiNextHandlerCaller({
        method: 'GET',
        query: { trpc: 'say-hello', name: 'Lily' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const res = await openApiNextHandlerCaller({
        method: 'POST',
        query: { trpc: 'say-hello' },
        body: { name: 'Lily' },
        headers: { 'content-type': 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);

      clearMocks();
    }
    {
      const res = await openApiNextHandlerCaller({
        method: 'GET',
        query: { trpc: ['say', 'hello'], name: 'Lily' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ greeting: 'Hello Lily!' });
      expect(createContextMock).toHaveBeenCalledTimes(1);
      expect(responseMetaMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(0);
    }
  });

  test('with invalid path', async () => {
    const appRouter = t.router({});

    const openApiNextHandlerCaller = createOpenApiNextHandlerCaller({
      router: appRouter,
    });

    const res = await openApiNextHandlerCaller({
      method: 'GET',
      query: {},
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      message: 'Query "trpc" not found - is the `trpc-to-openapi` file named `[...trpc].ts`?',
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(createContextMock).toHaveBeenCalledTimes(0);
    expect(responseMetaMock).toHaveBeenCalledTimes(0);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });
});
