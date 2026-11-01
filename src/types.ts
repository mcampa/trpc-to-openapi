import { TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc';
import type {
  AnyRootTypes,
  Procedure,
  ProcedureType,
  Router,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import { IncomingMessage } from 'http';
import type { ZodObject } from 'zod/v4';
import type { $ZodIssue } from 'zod/v4/core';

export { type OpenAPIObject, type SecuritySchemeObject } from 'openapi3-ts/oas31';

export type OpenApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type TRPCMeta = Record<string, unknown>;

export type OpenApiContentType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type OpenApiMeta<TMeta = TRPCMeta> = TMeta & {
  openapi?: {
    enabled?: boolean;
    method: OpenApiMethod;
    path: `/${string}`;
    operationId?: string;
    summary?: string;
    description?: string;
    protect?: boolean;
    tags?: string[];
    contentTypes?: OpenApiContentType[];
    deprecated?: boolean;
    /**
     * A zod object schema describing headers expected on requests to this
     * endpoint.
     *
     * Documentation-only: emitted into the OpenAPI document; not read,
     * validated, or enforced at runtime; not made available to procedures.
     * Use `createContext` or framework middleware to validate headers and
     * expose them to procedures, and an OpenAPI security scheme for
     * authentication/authorization.
     *
     * See [Custom headers](https://github.com/mcampa/trpc-to-openapi#custom-headers).
     */
    requestHeaders?: ZodObject;
    /**
     * A zod object schema describing headers returned by this endpoint.
     *
     * Documentation-only: emitted into the OpenAPI document; not read at
     * runtime. Documents the success (200) response only — error responses
     * and custom `errorResponses` do not receive these headers. Set response
     * headers yourself (e.g. via `responseMeta` or framework middleware).
     *
     * See [Custom headers](https://github.com/mcampa/trpc-to-openapi#custom-headers).
     */
    responseHeaders?: ZodObject;
    successDescription?: string;
    errorResponses?: number[] | Record<number, string>;
  };
};

export type OpenApiProcedure = Procedure<
  ProcedureType,
  {
    input: unknown;
    output: unknown;
    meta: TRPCMeta;
  }
>;

export type OpenApiProcedureRecord = Record<string, OpenApiProcedure | RouterRecord>;

/**
 * The router shape this library accepts: any tRPC router. Its actual context,
 * metadata and error shape are inferred from `TRouter` at each adapter.
 */
export type OpenApiRouter = Router<AnyRootTypes, RouterRecord>;

export type OpenApiSuccessResponse<D = unknown> = D;

export interface OpenApiErrorResponse {
  message: string;
  code: TRPC_ERROR_CODE_KEY;
  issues?: $ZodIssue[];
}

export type OpenApiResponse<D = unknown> = OpenApiSuccessResponse<D> | OpenApiErrorResponse;

export type NodeHTTPRequest = IncomingMessage & {
  body?: unknown;
  query?: unknown;
};

/**
 * Requests accepted by the shared handler: Node's `IncomingMessage` for the
 * framework adapters, and a WHATWG `Request` for the standalone and fetch
 * adapters.
 */
export type OpenApiHTTPRequest = NodeHTTPRequest | (Request & { query?: unknown });
