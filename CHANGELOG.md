## Changelog

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
