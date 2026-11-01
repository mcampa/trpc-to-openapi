<p align="center">
  <img src="assets/trpc-openapi.svg">
</p>
<div align="center">
  <h1>trpc-to-openapi</h1>
  <a href="https://www.npmjs.com/package/trpc-to-openapi"><img src="https://img.shields.io/npm/v/trpc-to-openapi.svg?style=flat&color=brightgreen" target="_blank" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-black" /></a>
  <br />
  <hr />
</div>

## **[OpenAPI](https://swagger.io/specification/) support for [tRPC](https://trpc.io/)** 🧩

- Support for tRPC ^11.1.0
- Easy REST endpoints for your tRPC procedures.
- Perfect for incremental adoption.
- Supports all OpenAPI versions.

Note: This project is a fork of a fork, with full credit to the original authors. It appears that the original author has abandoned the project, so I plan to add new features in the near future.

## Usage

**1. Install `trpc-to-openapi`.**

```bash
# pnpm
pnpm add trpc-to-openapi
# npm
npm install trpc-to-openapi
# yarn
yarn add trpc-to-openapi
```

**2. Add `OpenApiMeta` to your tRPC instance.**

```typescript
import { initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-to-openapi';

const t = initTRPC.meta<OpenApiMeta>().create(); /* 👈 */
```

**3. Enable `openapi` support for a procedure.**

```typescript
export const appRouter = t.router({
  sayHello: t.procedure
    .meta({ /* 👉 */ openapi: { method: 'GET', path: '/say-hello' } })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello ${input.name}!` };
    }),

  getStatus: t.procedure
    .meta({ /* 👉 */ openapi: { method: 'GET', path: '/status' } })
    .output(z.object({ status: z.string() }))
    .query(() => {
      return { status: 'healthy' };
    });
});
```

**4. Generate an OpenAPI document.**

```typescript
import { generateOpenApiDocument } from 'trpc-to-openapi';

import { appRouter } from '../appRouter';
import { UserSchema, ProductSchema } from '../schemas';

/* 👇 */
export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'tRPC OpenAPI',
  version: '1.0.0',
  baseUrl: 'http://localhost:3000',
  defs: {
    UserSchema,
    ProductSchema,
  },
});
```

**5. Add an `trpc-to-openapi` handler to your app.**

We currently support adapters for [`Express`](http://expressjs.com/), [`Next.js`](https://nextjs.org/), [`Fastify`](https://www.fastify.io/), [`Nuxt`](https://nuxtjs.org/) & [`Node:HTTP`](https://nodejs.org/api/http.html).

[`Fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), [`Cloudflare Workers`](https://workers.cloudflare.com/) & more soon™, PRs are welcomed 🙌.

No support for AWS lambdas

```typescript
import http from 'http';
import { createOpenApiHttpHandler } from 'trpc-to-openapi';

import { appRouter } from '../appRouter';

const server = http.createServer(createOpenApiHttpHandler({ router: appRouter })); /* 👈 */

server.listen(3000);
```

**6. Profit 🤑**

```typescript
// client.ts
const res = await fetch('http://localhost:3000/say-hello?name=OpenAPI', { method: 'GET' });
const body = await res.json(); /* { greeting: 'Hello OpenAPI!' } */

const statusRes = await fetch('http://localhost:3000/status', { method: 'GET' });
const statusBody = await statusRes.json(); /* { status: 'healthy' } */
```

## Requirements

Peer dependencies:

- [`tRPC`](https://github.com/trpc/trpc) Server v11 (`@trpc/server`) must be installed.
- [`Zod`](https://github.com/colinhacks/zod) v4 (`zod@^4.0.0`) must be installed.

For a procedure to support OpenAPI the following _must_ be true:

- An `output` parser is present AND uses `Zod` validation.
- If an `input` parser is present, it must use `Zod` validation.
- Query `input` parsers (when present) extend `Object<{ [string]: String | Number | BigInt | Date }>` or `Void`.
- Mutation `input` parsers (when present) extend `Object<{ [string]: AnyType }>` or `Void`.
- `meta.openapi.method` is `GET`, `POST`, `PATCH`, `PUT` or `DELETE`.
- `meta.openapi.path` is a string starting with `/`.
- `meta.openapi.path` parameters (when present) exist in `input` parser as `String | Number | BigInt | Date`

Please note:

- Data [`transformers`](https://trpc.io/docs/data-transformers) (such as `superjson`) are ignored.
- Trailing slashes are ignored.
- Routing is case-insensitive.

## HTTP Requests

Procedures with a `GET`/`DELETE` method will accept inputs via URL `query parameters`. Procedures with a `POST`/`PATCH`/`PUT` method will accept inputs via the `request body` with a `application/json` content type.

### Path parameters

A procedure can accept a set of inputs via URL path parameters. You can add a path parameter to any OpenAPI procedure by using curly brackets around an input name as a path segment in the `meta.openapi.path` field.

### Query parameters

Query & path parameter inputs are always accepted as a `string`. This library converts string values to the following primitive types out of the box: `number`, `boolean` (from `"true"` or `"false"` only), `bigint` and `date`. Conversion for query and path parameters is strict: a value that does not match the rules below is left as a string, so zod rejects it with a `400` response instead of silently coercing it.

- `number`: strict decimal strings only — an optional sign, digits with an optional fraction (`.5` and `5.` are valid) and an optional exponent (`1e3`). Hexadecimal (`0x10`), whitespace-only, `Infinity`, `NaN` and empty strings are rejected. Integers outside the safe integer range are rejected instead of being rounded.
- `bigint`: strict integer strings (an optional sign followed by digits). A JSON integer is converted when it is a safe integer. BigInt responses are serialized as decimal strings and the generated OpenAPI document describes them as `type: string, format: int64`.
- `date`: ISO-8601/RFC 3339 only — `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm[:ss[.sss]]` followed by `Z` or a `±HH:MM` offset. Impossible dates (`2020-02-30`), `0`, `1/1/2020` and date-times without an offset are rejected.

Strings in a JSON request body keep the permissive coercion JSON clients had before the strict rules: `z.number()` uses `Number()` (so `"0x10"` becomes `16` and `" 5 "` becomes `5`), `z.bigint()` uses `BigInt()` and `z.date()` uses `new Date()`. Booleans and empty strings follow the same rules as query parameters.

Empty strings, and values like `null` or `true` in a JSON body, are left for your schema to validate; use [`z.coerce`](https://github.com/colinhacks/zod#coercion-for-primitives) if you want zod's own coercion instead. If you wish to support others such as `object`, `array` etc. please use [`z.preprocess()`](https://github.com/colinhacks/zod#preprocess).

Conversion happens before your input schema runs, so in a top-level `.pipe()` or `z.preprocess()`, a later step that needs a string converted should use `z.coerce`.

```typescript
// Router
export const appRouter = t.router({
  sayHello: t.procedure
    .meta({ openapi: { method: 'GET', path: '/say-hello/{name}' /* 👈 */ } })
    .input(z.object({ name: z.string() /* 👈 */, greeting: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      return { greeting: `${input.greeting} ${input.name}!` };
    });
});

// Client
const res = await fetch('http://localhost:3000/say-hello/Lily?greeting=Hello' /* 👈 */, {
  method: 'GET',
});
const body = await res.json(); /* { greeting: 'Hello Lily!' } */
```

### Request body

```typescript
// Router
export const appRouter = t.router({
  sayHello: t.procedure
    .meta({ openapi: { method: 'POST', path: '/say-hello/{name}' /* 👈 */ } })
    .input(z.object({ name: z.string() /* 👈 */, greeting: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .mutation(({ input }) => {
      return { greeting: `${input.greeting} ${input.name}!` };
    });
});

// Client
const res = await fetch('http://localhost:3000/say-hello/Lily' /* 👈 */, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ greeting: 'Hello' }),
});
const body = await res.json(); /* { greeting: 'Hello Lily!' } */
```

### Custom headers

Any custom headers can be specified in the `meta.openapi.requestHeaders` and `meta.openapi.responseHeaders` zod object schemas. These schemas are **documentation-only**: they are emitted into the OpenAPI document, but they are not read, validated, or enforced at runtime, and they do not make request headers available to the procedure. `responseHeaders` documents the success (`200`) response only — error responses and custom `errorResponses` do not receive these headers.

To validate headers or make them available to your procedures, use `createContext` or framework middleware. For authentication and authorization, see [Authorization](#authorization) for first-class OpenAPI security support.

## HTTP Responses

Status codes will be `200` by default for any successful requests. In the case of an error, the status code will be derived from the thrown `TRPCError` or fallback to `500`.

You can modify the status code or headers for any response using the `responseMeta` function.

Please see [error status codes here](src/adapters/node-http/errors.ts).

## Authorization

To create protected endpoints, add `protect: true` to the `meta.openapi` object of each tRPC procedure. By default, you can then authenticate each request with the `createContext` function using the `Authorization` header with the `Bearer` scheme. If you wish to authenticate requests using a different/additional methods (such as custom headers, or cookies) this can be overwritten by specifying `securitySchemes` object.

> **Adapter-specific request types:** the `createContext` example below receives the framework request, so headers are read with `req.headers['authorization']` (Express, Koa, Fastify, Next.js). With the standalone (`createOpenApiHttpHandler`) and fetch (`createOpenApiFetchHandler`) adapters, `req` is a Fetch [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request): use `req.headers.get('authorization')` instead, because `req.headers.authorization` is `undefined` at runtime.

Explore a [complete example here](examples/with-nextjs/src/server/router.ts).

#### Server

```typescript
import { TRPCError, initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-to-openapi';

type User = { id: string; name: string };

const users: User[] = [
  {
    id: 'usr_123',
    name: 'Lily',
  },
];

export type Context = { user: User | null };

export const createContext = async ({ req, res }): Promise<Context> => {
  let user: User | null = null;
  if (req.headers.authorization) {
    const userId = req.headers.authorization.split(' ')[1];
    user = users.find((_user) => _user.id === userId);
  }
  return { user };
};

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const appRouter = t.router({
  sayHello: t.procedure
    .meta({ openapi: { method: 'GET', path: '/say-hello', protect: true /* 👈 */ } })
    .input(z.void()) // no input expected
    .output(z.object({ greeting: z.string() }))
    .query(({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ message: 'User not found', code: 'UNAUTHORIZED' });
      }
      return { greeting: `Hello ${ctx.user.name}!` };
    }),
});
```

#### Client

```typescript
const res = await fetch('http://localhost:3000/say-hello', {
  method: 'GET',
  headers: { Authorization: 'Bearer usr_123' } /* 👈 */,
});
const body = await res.json(); /* { greeting: 'Hello Lily!' } */
```

## Examples

_For advanced use-cases, please find examples in our [complete test suite](test)._

#### With Express

Please see [full example here](examples/with-express).

```typescript
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express from 'express';
import { createOpenApiExpressMiddleware } from 'trpc-to-openapi';

import { appRouter } from '../appRouter';

const app = express();

app.use('/api/trpc', createExpressMiddleware({ router: appRouter }));
app.use('/api', createOpenApiExpressMiddleware({ router: appRouter })); /* 👈 */

app.listen(3000);
```

#### With Next.js app router

Please see [full example here](examples/with-nextjs-appdir).

```typescript
// src/app/[...trpc]/route.ts
import { appRouter } from '~/server/api/root';
import { createContext } from '~/server/api/trpc';
import { type NextRequest } from 'next/server';
import { createOpenApiFetchHandler } from 'trpc-to-openapi';

export const dynamic = 'force-dynamic';

const handler = (req: NextRequest) => {
  // Handle incoming OpenAPI requests
  return createOpenApiFetchHandler({
    endpoint: '/',
    router: appRouter,
    createContext: () => createContext(req),
    req,
  });
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
```

#### With Next.js pages router

Please see [full example here](examples/with-nextjs).

```typescript
// pages/api/[...trpc].ts
import { createOpenApiNextHandler } from 'trpc-to-openapi';

import { appRouter } from '../../server/appRouter';

export default createOpenApiNextHandler({ router: appRouter });
```

#### With Fastify

Please see [full example here](examples/with-fastify).

```typescript
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { fastifyTRPCOpenApiPlugin } from 'trpc-to-openapi';

import { appRouter } from './router';

const fastify = Fastify();

async function main() {
  await fastify.register(fastifyTRPCPlugin, { router: appRouter });
  await fastify.register(fastifyTRPCOpenApiPlugin, { router: appRouter }); /* 👈 */

  await fastify.listen({ port: 3000 });
}

main();
```

## Types

#### GenerateOpenApiDocumentOptions

Please see [full typings here](src/generator/index.ts).

| Property          | Type                                                                                       | Description                                                                                 | Required |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------- |
| `title`           | `string`                                                                                   | The title of the API.                                                                       | `true`   |
| `description`     | `string`                                                                                   | A short description of the API.                                                             | `false`  |
| `version`         | `string`                                                                                   | The version of the OpenAPI document.                                                        | `true`   |
| `baseUrl`         | `string`                                                                                   | The base URL of the target server.                                                          | `true`   |
| `docsUrl`         | `string`                                                                                   | A URL to any external documentation.                                                        | `false`  |
| `tags`            | `string[]`                                                                                 | A list for ordering endpoint groups.                                                        | `false`  |
| `securitySchemes` | `Record<string, SecuritySchemeObject>`                                                     | Defaults to `Authorization` header with `Bearer` scheme                                     | `false`  |
| `filter`          | `(ctx: { metadata: { openapi: NonNullable<OpenApiMeta['openapi']> } & TMeta }) => boolean` | Optional filter function to include/exclude procedures from the generated OpenAPI document. | `false`  |

#### OpenApiMeta

Please see [full typings here](src/types.ts).

| Property             | Type                                    | Description                                                                                                                                                                                                         | Required | Default                 |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- |
| `enabled`            | `boolean`                               | Exposes this procedure to `trpc-to-openapi` adapters and on the OpenAPI document.                                                                                                                                   | `false`  | `true`                  |
| `method`             | `HttpMethod`                            | HTTP method this endpoint is exposed on. Value can be `GET`, `POST`, `PATCH`, `PUT` or `DELETE`.                                                                                                                    | `true`   | `undefined`             |
| `path`               | `string`                                | Pathname this endpoint is exposed on. Value must start with `/`, specify path parameters using `{}`.                                                                                                                | `true`   | `undefined`             |
| `protect`            | `boolean`                               | Requires this endpoint to use a security scheme.                                                                                                                                                                    | `false`  | `true`                  |
| `summary`            | `string`                                | A short summary of the endpoint included in the OpenAPI document.                                                                                                                                                   | `false`  | `undefined`             |
| `description`        | `string`                                | A verbose description of the endpoint included in the OpenAPI document.                                                                                                                                             | `false`  | `undefined`             |
| `tags`               | `string[]`                              | A list of tags used for logical grouping of endpoints in the OpenAPI document.                                                                                                                                      | `false`  | `undefined`             |
| `requestHeaders`     | `ZodObject`                             | A zod object schema describing custom request headers. Documentation-only: emitted into the OpenAPI document; not read, validated, or enforced at runtime (see [Custom headers](#custom-headers)).                  | `false`  | `undefined`             |
| `responseHeaders`    | `ZodObject`                             | A zod object schema describing custom response headers. Documentation-only: emitted into the OpenAPI document; not read at runtime, and applies to the `200` response only (see [Custom headers](#custom-headers)). | `false`  | `undefined`             |
| `successDescription` | `string`                                | A string to use as the description for a successful response.                                                                                                                                                       | `false`  | `'Successful response'` |
| `errorResponses`     | `number[] \| { [key: number]: string }` | A list of error response codes or an object of response codes and their description to add to the responses for this endpoint.                                                                                      | `false`  | `undefined`             |
| `contentTypes`       | `OpenApiContentType[]`                  | A set of content types specified as accepted in the OpenAPI document.                                                                                                                                               | `false`  | `['application/json']`  |
| `deprecated`         | `boolean`                               | Whether or not to mark an endpoint as deprecated                                                                                                                                                                    | `false`  | `false`                 |

#### CreateOpenApiNodeHttpHandlerOptions

Please see [full typings here](src/adapters/node-http/core.ts).

| Property        | Type       | Description                                            | Required |
| --------------- | ---------- | ------------------------------------------------------ | -------- |
| `router`        | `Router`   | Your application tRPC router.                          | `true`   |
| `createContext` | `Function` | Passes contextual (`ctx`) data to procedure resolvers. | `false`  |
| `responseMeta`  | `Function` | Returns any modifications to statusCode & headers.     | `false`  |
| `onError`       | `Function` | Called if error occurs inside handler.                 | `false`  |
| `maxBodySize`   | `number`   | Maximum request body size in bytes (default: 100kb).   | `false`  |

---

## License

Distributed under the MIT License. See LICENSE for more information.

**Filtering Procedures in OpenAPI Output**

You can use the `filter` option to selectively include or exclude procedures from the generated OpenAPI document. The filter function receives a context object with the procedure's metadata. Return `true` to include the procedure, or `false` to exclude it.

**Example:**

```typescript
const appRouter = t.router({
  publicProc: t.procedure
    .meta({ openapi: { method: 'GET', path: '/public' }, isPublic: true })
    .input(z.object({}))
    .output(z.object({ result: z.string() }))
    .query(() => ({ result: 'public' })),
  privateProc: t.procedure
    .meta({ openapi: { method: 'GET', path: '/private' }, isPublic: false })
    .input(z.object({}))
    .output(z.object({ result: z.string() }))
    .query(() => ({ result: 'private' })),
});

// Only include procedures where isPublic is true
const openApiDocument = generateOpenApiDocument(appRouter, {
  ...defaultDocOpts,
  filter: ({ metadata }) => metadata.isPublic === true,
});

// openApiDocument.paths will only include '/public'
```

You can also pass a metadata generic to `generateOpenApiDocument` to get proper types for your custom metadata in the filter function:

```typescript
// Define your custom metadata type
interface MyMeta {
  isPublic: boolean;
}

const openApiDocument = generateOpenApiDocument<MyMeta>(appRouter, {
  ...defaultDocOpts,
  filter: ({ metadata }) => metadata.isPublic === true,
});
```
