import { OpenApiBuilder } from 'openapi3-ts/oas31';

import {
  CreateOpenApiExpressMiddlewareOptions,
  CreateOpenApiFastifyPluginOptions,
  CreateOpenApiFetchHandlerOptions,
  CreateOpenApiHttpHandlerOptions,
  CreateOpenApiNextHandlerOptions,
  CreateOpenApiNuxtHandlerOptions,
  createOpenApiExpressMiddleware,
  createOpenApiFetchHandler,
  createOpenApiHttpHandler,
  createOpenApiNextHandler,
  createOpenApiNuxtHandler,
  fastifyTRPCOpenApiPlugin,
} from './adapters';
import { GenerateOpenApiDocumentOptions, generateOpenApiDocument } from './generator';
import {
  errorResponseFromMessage,
  errorResponseFromStatusCode,
  errorResponseObject,
} from './generator/schema';
import {
  OpenApiErrorResponse,
  OpenApiMeta,
  OpenApiMethod,
  OpenApiResponse,
  OpenApiRouter,
  OpenApiSuccessResponse,
} from './types';
import { ZodTypeLikeString, ZodTypeLikeVoid } from './utils/zod';

export {
  CreateOpenApiExpressMiddlewareOptions,
  CreateOpenApiHttpHandlerOptions,
  CreateOpenApiNextHandlerOptions,
  CreateOpenApiFastifyPluginOptions,
  CreateOpenApiFetchHandlerOptions,
  CreateOpenApiNuxtHandlerOptions,
  createOpenApiExpressMiddleware,
  createOpenApiFetchHandler,
  createOpenApiHttpHandler,
  createOpenApiNextHandler,
  createOpenApiNuxtHandler,
  fastifyTRPCOpenApiPlugin,
  generateOpenApiDocument,
  errorResponseObject,
  errorResponseFromStatusCode,
  errorResponseFromMessage,
  GenerateOpenApiDocumentOptions,
  OpenApiBuilder,
  OpenApiRouter,
  OpenApiMeta,
  OpenApiMethod,
  OpenApiResponse,
  OpenApiSuccessResponse,
  OpenApiErrorResponse,
  ZodTypeLikeString,
  ZodTypeLikeVoid,
};
