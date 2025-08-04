## Changelog

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
