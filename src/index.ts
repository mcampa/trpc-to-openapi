import { OpenApiBuilder } from 'openapi3-ts/oas31';

import {
  // CreateOpenApiAwsLambdaHandlerOptions,
  CreateOpenApiExpressMiddlewareOptions,
  CreateOpenApiFastifyPluginOptions,
  CreateOpenApiFetchHandlerOptions,
  CreateOpenApiHttpHandlerOptions,
  CreateOpenApiNextHandlerOptions,
  CreateOpenApiNuxtHandlerOptions, // createOpenApiAwsLambdaHandler,
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
  // CreateOpenApiAwsLambdaHandlerOptions,
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
  // createOpenApiAwsLambdaHandler,
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
