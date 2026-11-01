## Changelog

- v3.4.0

  - fix: harden query/path input coercion and prototype safety ([#177](https://github.com/mcampa/trpc-to-openapi/pull/177), building on [#173](https://github.com/mcampa/trpc-to-openapi/pull/173) by [@akremer68](https://github.com/akremer68)). Boolean query/path parameters now accept only `"true"` and `"false"` (`"false"`, `"0"`, `"no"` and `"off"` previously became `true`), and number, bigint and date coercion follows strict query/path rules; JSON body strings keep their previous numeric/date coercion. Coercion no longer mutates the router's schemas, recursive schemas no longer overflow the stack, `__proto__` input keys are dropped instead of changing a prototype, optional fields named `toString`/`constructor` work again, and malformed JSON bodies return 400 instead of 500. BigInt responses serialize as decimal strings and the generated schema describes them as strings.
  - fix: harden route matching and path parameters ([#175](https://github.com/mcampa/trpc-to-openapi/pull/175); supersedes the path-decoding part of [#166](https://github.com/mcampa/trpc-to-openapi/pull/166) by [@Sam152](https://github.com/Sam152)). Static routes are matched before parameter routes, path literals are escaped before regex compilation, names such as `user-id` work, duplicate and empty parameter names are rejected, and captured values are URL-decoded while `%2F`/`%5C` stay encoded; malformed escapes return a clean 400. The Next.js adapter re-encodes already-decoded segments, and the route cache is memoized per router.
  - fix: harden the fetch adapter and share URL/content-type handling across adapters ([#176](https://github.com/mcampa/trpc-to-openapi/pull/176)). Endpoint stripping only removes leading path segments (fixes 404s when the host starts with the endpoint), `maxBodySize` is enforced while streaming (including void-input and `DELETE` routes) and validated at startup, opaque-origin requests no longer throw, an `onError` that reads `req.body` no longer hangs the request, and Fastify strips its prefix and `basePath` on segment boundaries.
  - fix: emit `requestHeaders` for procedures without input, support `Headers` instances in `responseMeta`, pass `resHeaders` to the fetch adapter's `createContext`, and document `responseHeaders` as applying to the success response only ([#178](https://github.com/mcampa/trpc-to-openapi/pull/178)).
  - docs: clarify that `meta.openapi.requestHeaders` and `responseHeaders` are documentation-only and are not validated or enforced at runtime ([#174](https://github.com/mcampa/trpc-to-openapi/pull/174)).
  - refactor: replace unsafe `any` types and casts across the adapters, generator and zod helpers with precise types and runtime checks ([#180](https://github.com/mcampa/trpc-to-openapi/pull/180)). Adapter callback types (`createContext`, `onError`, `responseMeta`), `OpenApiRouter` and `OpenApiProcedure` are now accurate; the standalone adapter types `createContext` with the `Request` it actually receives, and literal schemas are read through their `values` array, so multi-value literals work.

- v3.3.3

  - fix: add `options` to `CreateOpenApiFetchHandlerOptions`. The fetch adapter already forwarded its options object to the node-http handler; only the type was missing, so a router with a custom scalar schema failed to typecheck when passing `options.override`.

- v3.3.2

  - fix: forward `options` to `zod-openapi`'s `createDocument`. The field was dropped from `GenerateOpenApiDocumentOptions` in 3.3.0, so `options.override` (for example, a custom Decimal-to-number schema) was silently ignored and document generation threw on custom schemas. Restores the field and adds a regression test.
  - fix: accept the same `options` in the Node HTTP adapters (standalone, express, fastify, koa, next) and forward them to the non-production router validation, so a router with a custom scalar schema can build the handler.

- v3.3.1

  - fix: raise the `h3` floor to `^1.15.11`, the first release that closes all five current advisories: request smuggling `GHSA-mp2g-9vg9-f4cg`, SSE injection `GHSA-22cc-p3c6-wpvm` and `GHSA-4hxc-9384-m385`, and the two `serveStatic` traversals `GHSA-wr4h-v87w-p3r7` / `GHSA-72gr-qfp7-vwhw`. The previous `^1.15.5` range allowed 1.15.11, but an existing lockfile stayed on the vulnerable releases; the raised floor forces the patched one.
  - fix: upgrade `openapi3-ts` to 4.6.2, which raises its `yaml` floor to `^2.9.1` (`GHSA-48c2-rrv3-qjmp`).
  - chore: pin `qs` 6.16.1 and `yaml` 2.9.1 in the workspace so the remaining transitive advisories in the examples are patched too.

- v3.3.0

  - feat: add `contact` and `license` fields to `GenerateOpenApiDocumentOptions` [#157](https://github.com/mcampa/trpc-to-openapi/pull/157) by [@liorp](https://github.com/liorp)
  - feat: support zod v3 (≥3.25) alongside v4 via the `zod/v4` permalink import; widens the `zod` peer dep to `^3.25.0 || ^4.0.0` [#161](https://github.com/mcampa/trpc-to-openapi/pull/161) (supersedes [#158](https://github.com/mcampa/trpc-to-openapi/pull/158) by [@Sam152](https://github.com/Sam152))
  - fix: bump `zod-openapi` to 5.4.6 and raise its peer dep minimum to `^5.4.4` to avoid the discriminated-union crash on zod ≥4.1.13 [#162](https://github.com/mcampa/trpc-to-openapi/pull/162) (supersedes [#151](https://github.com/mcampa/trpc-to-openapi/pull/151) by [@gaetansenn](https://github.com/gaetansenn))
  - fix: add OpenAPI extension index signature to contact/license types so they satisfy `zod-openapi`'s `InfoObject` [#160](https://github.com/mcampa/trpc-to-openapi/pull/160)
  - chore: bump `h3` to `^1.15.5` [#159](https://github.com/mcampa/trpc-to-openapi/pull/159) by [@cpimhoff](https://github.com/cpimhoff)

- v3.2.0

  - fix: Zod 4 compatibility for `prefault`, transform pipes, and refined-schema `.omit()` [#155](https://github.com/mcampa/trpc-to-openapi/pull/155) by [@MendyLanda](https://github.com/MendyLanda) (fixes [#153](https://github.com/mcampa/trpc-to-openapi/issues/153))

- v3.1.0

  - feat: Add API to override default generated operationId [#107](https://github.com/mcampa/trpc-to-openapi/pull/107) by [@agrippa1994](https://github.com/agrippa1994)
  - feat: enhance input handling for optional arrays in OpenAPI handler [#116](https://github.com/mcampa/trpc-to-openapi/pull/116) by [@alexkh13](https://github.com/alexkh13)
  - feat: Allows passing complex examples to objects [#121](https://github.com/mcampa/trpc-to-openapi/pull/121) by [@ntgussoni](https://github.com/ntgussoni)
  - feat: add support for schema definitions as components [#127](https://github.com/mcampa/trpc-to-openapi/pull/127) by [@bucko13](https://github.com/bucko13)
  - feat: Allow tRPC procedures without input validation [#131](https://github.com/mcampa/trpc-to-openapi/pull/131) by [@gaetansenn](https://github.com/gaetansenn)

- v3.0.1

  - fix: bug in replace reply.raw with reply https://github.com/mcampa/trpc-to-openapi/pull/104/files

- v3.0.0

  - Zod v4 and zod-openapi v5. Thanks to [edcaron](https://github.com/edcaron) for the change in https://github.com/mcampa/trpc-to-openapi/pull/98

- v2.4.0

  - fix: replace `reply.raw` with reply for fastify adapter https://github.com/mcampa/trpc-to-openapi/pull/99

- v2.3.1

  - fix: meta can be undefined

- v2.3.0

  - feat(generator): add filter option to selectively include procedures in OpenAPI output

- v2.2.0

  - Upgrade to tRPC 11.1.0

- v2.1.5

  - fix(fastify): send raw request in http handler https://github.com/mcampa/trpc-to-openapi/pull/63. Contribution by [@meriadec](https://github.com/meriadec)

- v2.1.4

  - Koa adapter https://github.com/mcampa/trpc-to-openapi/pull/47. Contribution by [@danperkins](https://github.com/danperkins)
  - Fix for Fastify adapter https://github.com/mcampa/trpc-to-openapi/pull/56. Contribution by [@natejohnson05](https://github.com/natejohnson05)

- v2.1.3

  - Export all internals https://github.com/mcampa/trpc-to-openapi/pull/44. Contribution by [@bkniffler](https://github.com/bkniffler)
  - CVE fixes by running npm audit fix.

- v2.1.2

  - bug fix: remove lodash.cloneDeep from the build output

- v2.1.1 (bad build, do not use)

  - chore: remove lodash.cloneDeep and update some dependencies

- v2.1.0

  - Updated the minimum version of `zod-openapi` to 4.1.0.
  - Changed `zod-openapi` to a peer dependency.
  - The `protect` option now defaults to `true`.
  - Improved Error schema titles

- v2.0.4

  - Upgraded to tRPC 11.0.0-rc.648.

- v2.0.3

  - Added support for array inputs in GET requests.
