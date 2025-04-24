import { TRPCError } from '@trpc/server';
export declare const TRPC_ERROR_CODE_HTTP_STATUS: Record<TRPCError['code'], number>;
export declare const HTTP_STATUS_TRPC_ERROR_CODE: Record<number, TRPCError['code']>;
export declare const TRPC_ERROR_CODE_MESSAGE: Record<TRPCError['code'], string>;
export declare function getErrorFromUnknown(cause: unknown): TRPCError;
//# sourceMappingURL=errors.d.ts.map