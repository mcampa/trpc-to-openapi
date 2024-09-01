import { OpenApiMethod } from '../types';

export const acceptsRequestBody = (method: OpenApiMethod | 'HEAD') => {
  if (method === 'GET' || method === 'DELETE') {
    return false;
  }
  return true;
};
