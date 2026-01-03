import { NextApiRequest, NextApiResponse } from 'next';
import { OpenApiRouter } from '../types';
import { CreateOpenApiNodeHttpHandlerOptions } from './node-http';
export type CreateOpenApiNextHandlerOptions<TRouter extends OpenApiRouter> = CreateOpenApiNodeHttpHandlerOptions<TRouter, NextApiRequest, NextApiResponse>;
export declare const createOpenApiNextHandler: <TRouter extends OpenApiRouter>(opts: CreateOpenApiNextHandlerOptions<TRouter>) => (req: NextApiRequest, res: NextApiResponse) => Promise<void>;
//# sourceMappingURL=next.d.ts.map