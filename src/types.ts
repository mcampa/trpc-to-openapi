import { TRPC_ERROR_CODE_KEY } from '@trpc/server/dist/rpc';
import type {
  CreateRootTypes,
  Procedure,
  ProcedureType,
  Router,
} from '@trpc/server/unstable-core-do-not-import';
import type { AnyZodObject, ZodIssue } from 'zod';

export { type OpenAPIObject, type SecuritySchemeObject } from 'openapi3-ts/dist/oas31';

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
    summary?: string;
    description?: string;
    protect?: boolean;
    tags?: string[];
    contentTypes?: OpenApiContentType[];
    deprecated?: boolean;
    requestHeaders?: AnyZodObject;
    responseHeaders?: AnyZodObject;
    successDescription?: string;
    errorResponses?: number[] | { [key: number]: string };
  };
};

export type OpenApiProcedure = Procedure<
  ProcedureType,
  {
    input: any; // AnyZodObject[] | Parser[] | undefined;
    output: any; // Parser | undefined;
  }
>;

// export type OpenApiProcedureRecord = Record<string, OpenApiProcedure>;
export interface OpenApiProcedureRecord {
  [key: string]: OpenApiProcedure | OpenApiProcedureRecord;
}

export type OpenApiRouter = Router<
  CreateRootTypes<{
    ctx: any;
    meta: TRPCMeta;
    errorShape: any;
    transformer: any;
  }>,
  OpenApiProcedureRecord
>;

export type OpenApiSuccessResponse<D = any> = D;

export type OpenApiErrorResponse = {
  message: string;
  code: TRPC_ERROR_CODE_KEY;
  issues?: ZodIssue[];
};

export type OpenApiResponse<D = any> = OpenApiSuccessResponse<D> | OpenApiErrorResponse;
