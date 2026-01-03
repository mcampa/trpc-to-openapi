import { NodeHTTPResponse } from '@trpc/server/adapters/node-http';
import { NodeHTTPRequest, OpenApiMethod } from '../types';
export declare const acceptsRequestBody: (method: OpenApiMethod | "HEAD") => boolean;
export declare const getContentType: (req: NodeHTTPRequest | Request) => string | undefined;
export declare const getRequestSignal: (req: NodeHTTPRequest | Request, res: NodeHTTPResponse, maxBodySize?: number) => AbortSignal;
//# sourceMappingURL=method.d.ts.map