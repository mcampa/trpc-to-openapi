import { initTRPC } from '@trpc/server';
import { Headers as NodeFetchHeaders, Request as NodeFetchRequest } from 'node-fetch';
import { z } from 'zod/v4';

import {
  CreateOpenApiFetchHandlerOptions,
  OpenApiMeta,
  OpenApiRouter,
  createOpenApiFetchHandler,
} from '../../src';

const createFetchHandlerCaller = <TRouter extends OpenApiRouter>(
  handlerOpts: CreateOpenApiFetchHandlerOptions<TRouter>,
) => createOpenApiFetchHandler<TRouter>(handlerOpts);

const t = initTRPC.meta<OpenApiMeta>().context().create();

const createEchoRouter = () =>
  t.router({
    echo: t.procedure
      .meta({ openapi: { method: 'POST', path: '/echo' } })
      .input(z.object({ payload: z.string() }))
      .output(z.object({ payload: z.string() }))
      .mutation(({ input }) => ({ payload: input.payload })),
  });

const createUserRouter = () =>
  t.router({
    getUser: t.procedure
      .meta({ openapi: { method: 'GET', path: '/users/{id}' } })
      .input(z.object({ id: z.string() }))
      .output(z.object({ id: z.string() }))
      .query(({ input }) => ({ id: input.id })),
  });

const createStreamRequest = (body: ReadableStream<Uint8Array>, headers: Record<string, string>) =>
  new Request('https://example.com/echo', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit);

const emptyStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

const oversizedStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(500)));
      controller.close();
    },
  });

describe('fetch adapter security hardening', () => {
  describe('V3: endpoint stripping', () => {
    test('strips the endpoint when it also appears in the hostname', async () => {
      const res = await createFetchHandlerCaller({
        router: createUserRouter(),
        endpoint: '/api',
        req: new Request('https://api.example.com/api/users/42', { method: 'GET' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: '42' });
    });

    test('does not strip an endpoint that is only a prefix of another path segment', async () => {
      const appRouter = t.router({
        apiDocs: t.procedure
          .meta({ openapi: { method: 'POST', path: '/api-docs/x' } })
          .input(z.void())
          .output(z.literal('ok'))
          .mutation(() => 'ok' as const),
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/api',
        req: new Request('https://example.com/api-docs/x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual('ok');
    });

    test('keeps working with the root endpoint', async () => {
      const res = await createFetchHandlerCaller({
        router: createUserRouter(),
        endpoint: '/',
        req: new Request('https://example.com/users/42', { method: 'GET' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: '42' });
    });

    test('handles an endpoint with a trailing slash', async () => {
      const res = await createFetchHandlerCaller({
        router: createUserRouter(),
        endpoint: '/api/',
        req: new Request('https://example.com/api/users/42', { method: 'GET' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: '42' });
    });

    test('preserves the query string after stripping the endpoint', async () => {
      const appRouter = t.router({
        echo: t.procedure
          .meta({ openapi: { method: 'GET', path: '/echo' } })
          .input(z.object({ name: z.string() }))
          .output(z.object({ name: z.string() }))
          .query(({ input }) => ({ name: input.name })),
      });

      const res = await createFetchHandlerCaller({
        router: appRouter,
        endpoint: '/api',
        req: new Request('https://example.com/api/echo?name=Lily', { method: 'GET' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Lily' });
    });

    test('leaves paths that do not start with the endpoint unchanged', async () => {
      const res = await createFetchHandlerCaller({
        router: createUserRouter(),
        endpoint: '/api',
        req: new Request('https://example.com/users/42', { method: 'GET' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: '42' });
    });

    test('returns a 404 Response for an opaque-origin request URL', async () => {
      const res = await createFetchHandlerCaller({
        router: createUserRouter(),
        endpoint: '/',
        req: new Request('file:///tmp/x'),
      });

      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
    });
  });

  describe('V5: maxBodySize enforcement', () => {
    test('returns 413 when a JSON body exceeds maxBodySize', async () => {
      const requestBody = JSON.stringify({ payload: 'x'.repeat(500) });

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        maxBodySize: 10,
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        }),
      });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    });

    test('accepts a body that is exactly at the byte limit', async () => {
      const requestBody = JSON.stringify({ payload: 'Lilyé' });
      const byteLength = Buffer.byteLength(requestBody, 'utf8');

      // Non-ASCII: the character length is smaller than the byte length, so a
      // `String.length` limit would wrongly accept a body over the limit.
      expect(byteLength).toBeGreaterThan(requestBody.length);

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        maxBodySize: byteLength,
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ payload: 'Lilyé' });
    });

    test('returns 413 for chunked bodies without Content-Length that exceed the limit', async () => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"payload":"'));
          controller.enqueue(encoder.encode('x'.repeat(100)));
          controller.enqueue(encoder.encode('"}'));
          controller.close();
        },
      });

      const req = createStreamRequest(body, { 'Content-Type': 'application/json' });
      expect(req.headers.get('content-length')).toBeNull();

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        maxBodySize: 10,
        req,
      });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    });

    test('returns 413 from an explicit Content-Length above the limit without reading the body', async () => {
      // The stream is empty, so a counting-only implementation would parse an
      // empty body (400 PARSE_ERROR) instead of honouring Content-Length.
      const req = createStreamRequest(emptyStream(), {
        'Content-Type': 'application/json',
        'Content-Length': '500',
      });

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        maxBodySize: 10,
        req,
      });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    });

    test('returns 413 for duplicate Content-Length values above the limit', async () => {
      const req = createStreamRequest(emptyStream(), {
        'Content-Type': 'application/json',
        'Content-Length': '500, 500',
      });

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        maxBodySize: 10,
        req,
      });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    });

    test('defaults maxBodySize to 100kb', async () => {
      const requestBody = JSON.stringify({ payload: 'x'.repeat(150_000) });
      expect(requestBody.length).toBeGreaterThan(100_000);

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        }),
      });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    });

    test('returns 413 for a 150KB body with a valid small limit', async () => {
      const requestBody = JSON.stringify({ payload: 'x'.repeat(150_000) });

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        maxBodySize: 1_000,
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        }),
      });

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    });

    test.each([NaN, -1, Infinity])('throws a TypeError for maxBodySize %p', async (maxBodySize) => {
      await expect(
        createFetchHandlerCaller({
          router: createEchoRouter(),
          endpoint: '/',
          maxBodySize,
          req: new Request('https://example.com/echo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: 'Lily' }),
          }),
        }),
      ).rejects.toThrow(TypeError);
    });

    describe('when the route does not read the body', () => {
      const createVoidPostRouter = () =>
        t.router({
          ping: t.procedure
            .meta({ openapi: { method: 'POST', path: '/ping' } })
            .input(z.void())
            .output(z.literal('pong'))
            .mutation(() => 'pong' as const),
        });

      const createDeleteRouter = () =>
        t.router({
          remove: t.procedure
            .meta({ openapi: { method: 'DELETE', path: '/remove' } })
            .input(z.void())
            .output(z.literal('removed'))
            .mutation(() => 'removed' as const),
        });

      const cases = [
        {
          name: 'void-input POST with a declared Content-Length',
          method: 'POST',
          path: '/ping',
          router: createVoidPostRouter,
          requestBody: () =>
            new Request('https://example.com/ping', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': '500' },
              body: emptyStream(),
              duplex: 'half',
            } as RequestInit),
        },
        {
          name: 'void-input POST with a chunked body',
          method: 'POST',
          path: '/ping',
          router: createVoidPostRouter,
          requestBody: () =>
            new Request('https://example.com/ping', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: oversizedStream(),
              duplex: 'half',
            } as RequestInit),
        },
        {
          name: 'DELETE with a declared Content-Length',
          method: 'DELETE',
          path: '/remove',
          router: createDeleteRouter,
          requestBody: () =>
            new Request('https://example.com/remove', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'Content-Length': '500' },
              body: emptyStream(),
              duplex: 'half',
            } as RequestInit),
        },
        {
          name: 'DELETE with a chunked body',
          method: 'DELETE',
          path: '/remove',
          router: createDeleteRouter,
          requestBody: () =>
            new Request('https://example.com/remove', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: oversizedStream(),
              duplex: 'half',
            } as RequestInit),
        },
      ];

      test.each(cases)('returns 413 for a $name', async ({ router, requestBody }) => {
        const res = await createFetchHandlerCaller({
          router: router(),
          endpoint: '/',
          maxBodySize: 10,
          req: requestBody(),
        });

        expect(res.status).toBe(413);
        expect(res.headers.get('content-type')).toBe('application/json');
        expect(await res.json()).toEqual({
          message: 'Request body too large',
          code: 'PAYLOAD_TOO_LARGE',
        });
      });
    });
  });

  describe('V10: content-type handling', () => {
    test.each([
      'Application/JSON',
      'Application/JSON; Charset=UTF-8',
      'application/json; charset=utf-8',
      'application/json-patch+json',
    ])('accepts the JSON media type %s', async (contentType) => {
      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ payload: 'Lily' }),
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ payload: 'Lily' });
    });

    test('accepts a JSON body with an exact JSON media type', async () => {
      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: 'Lily' }),
        }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ payload: 'Lily' });
    });

    test('rejects a media type that only contains application/json as a substring', async () => {
      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'text/application/json' },
          body: JSON.stringify({ payload: 'Lily' }),
        }),
      });

      expect(res.status).toBe(415);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
    });

    test('does not parse a form body when the Content-Type also contains JSON', async () => {
      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        req: new Request('https://example.com/echo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json, application/x-www-form-urlencoded',
          },
          body: 'payload=Hello&payload=World',
        }),
      });

      expect(res.status).toBe(415);
      expect(await res.json()).toEqual(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
    });

    test('exposes raw headers to callbacks and forwards mutations to the request', async () => {
      let observedContentType: string | null = null;

      const req = new Request('https://example.com/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'Application/JSON; Charset=UTF-8' },
        body: JSON.stringify({ payload: 'Lily' }),
      });

      const res = await createFetchHandlerCaller({
        router: createEchoRouter(),
        endpoint: '/',
        req,
        createContext: ({ req: contextReq }) => {
          observedContentType = contextReq.headers.get('content-type');
          contextReq.headers.set('x-tenant', 'acme');
          return {};
        },
      });

      expect(res.status).toBe(200);
      expect(observedContentType).toBe('Application/JSON; Charset=UTF-8');
      expect(req.headers.get('x-tenant')).toBe('acme');
    });

    test('accepts requests whose body is not a WHATWG ReadableStream', async () => {
      const nativeRequest = globalThis.Request;
      const nativeHeaders = globalThis.Headers;

      try {
        globalThis.Request = NodeFetchRequest as unknown as typeof Request;
        globalThis.Headers = NodeFetchHeaders as unknown as typeof Headers;

        const req = new NodeFetchRequest('https://example.com/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: 'Lily' }),
        });

        const res = await createFetchHandlerCaller({
          router: createEchoRouter(),
          endpoint: '/',
          req: req as unknown as Request,
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ payload: 'Lily' });
      } finally {
        globalThis.Request = nativeRequest;
        globalThis.Headers = nativeHeaders;
      }
    });
  });

  describe('onError', () => {
    test('settles with an error Response when onError reads the request body', async () => {
      const unhandledRejection = jest.fn();
      process.on('unhandledRejection', unhandledRejection);

      try {
        const res = await createFetchHandlerCaller({
          router: createEchoRouter(),
          endpoint: '/',
          req: new Request('https://example.com/echo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{not json',
          }),
          onError: ({ req }) => {
            // The proxy's `body` getter throws for the parse error; this must
            // not leave the handler promise pending.
            void req.body;
          },
        });

        expect(res).toBeInstanceOf(Response);
        expect([400, 500]).toContain(res.status);
        expect(await res.json()).toEqual(
          expect.objectContaining({
            code: res.status === 500 ? 'INTERNAL_SERVER_ERROR' : 'PARSE_ERROR',
          }),
        );

        await new Promise((resolve) => setImmediate(resolve));
        expect(unhandledRejection).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandledRejection);
      }
    });
  });
});
