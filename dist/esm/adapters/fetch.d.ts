import { FetchHandlerOptions } from '@trpc/server/adapters/fetch';
import { OpenApiRouter } from '../types';
export type CreateOpenApiFetchHandlerOptions<TRouter extends OpenApiRouter> = Omit<FetchHandlerOptions<TRouter>, 'batching'> & {
    req: Request;
    endpoint: `/${string}`;
};
export declare const createOpenApiFetchHandler: <TRouter extends OpenApiRouter>(opts: CreateOpenApiFetchHandlerOptions<TRouter>) => Promise<Response>;
//# sourceMappingURL=fetch.d.ts.map