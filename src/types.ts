import { TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc';
import type {
  CreateRootTypes,
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
     * This schema is documentation-only: it is emitted into the generated
     * OpenAPI document to describe the expected headers. It is not read,
     * validated, or enforced at runtime, and it does not make headers
     * available to the procedure. Use `createContext` or framework middleware
     * to validate headers and expose them to your procedures, and an OpenAPI
     * security scheme for authentication/authorization.
     */
    requestHeaders?: ZodObject;
    /**
     * A zod object schema describing headers returned by this endpoint.
     *
     * This schema is documentation-only: it is emitted into the generated
     * OpenAPI document to describe the expected headers. It is not read,
     * validated, or enforced at runtime. Set response headers yourself (e.g.
     * via `responseMeta` or framework middleware), and use an OpenAPI
     * security scheme for authentication/authorization.
     */
    responseHeaders?: ZodObject;
    successDescription?: string;
    errorResponses?: number[] | Record<number, string>;
  };
};

export type OpenApiProcedure = Procedure<
  ProcedureType,
  {
    input: any;
    output: any;
    meta: TRPCMeta;
  }
>;

export type OpenApiProcedureRecord = Record<string, OpenApiProcedure | RouterRecord>;

export type OpenApiRouter = Router<
  CreateRootTypes<{
    ctx: any;
    meta: TRPCMeta;
    errorShape: any;
    transformer: any;
  }>,
  RouterRecord
>;

export type OpenApiSuccessResponse<D = any> = D;

export interface OpenApiErrorResponse {
  message: string;
  code: TRPC_ERROR_CODE_KEY;
  issues?: $ZodIssue[];
}

export type OpenApiResponse<D = any> = OpenApiSuccessResponse<D> | OpenApiErrorResponse;

export type NodeHTTPRequest = IncomingMessage & {
  body?: unknown;
  query?: unknown;
};
