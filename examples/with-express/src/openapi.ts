import { generateOpenApiDocument } from 'trpc-to-openapi';
import { z } from 'zod';

import { appRouter } from './router';

// Define reusable schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  published: z.boolean(),
  createdAt: z.string().datetime(),
});

const ErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
  details: z.record(z.string(), z.string()).optional(),
});

// Generate OpenAPI schema document
export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'Example CRUD API',
  description: 'OpenAPI compliant REST API built using tRPC with Express',
  version: '1.0.0',
  baseUrl: 'http://localhost:3000/api',
  docsUrl: 'https://github.com/mcampa/trpc-to-openapi',
  tags: ['auth', 'users', 'posts'],
  defs: {
    UserSchema,
    PostSchema,
    ErrorSchema,
  },
});
