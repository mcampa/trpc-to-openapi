import { OpenApiMethod, OpenApiProcedure, OpenApiRouter } from '../../types';
export declare const createProcedureCache: (router: OpenApiRouter) => (method: OpenApiMethod | "HEAD", path: string) => {
    procedure: {
        type: "query" | "mutation";
        path: string;
        procedure: OpenApiProcedure;
    } | undefined;
    pathInput: {
        [key: string]: string;
    };
} | undefined;
//# sourceMappingURL=procedures.d.ts.map