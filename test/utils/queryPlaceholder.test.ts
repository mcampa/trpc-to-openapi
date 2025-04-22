import { z } from 'zod';
import { queryPlaceholder } from '../../src';

enum MyEnum {
  Red = 'RED',
  Blue = 'BLUE'
}

describe('queryPlaceholder', () => {
  test('handles primitive types', () => {
    expect(queryPlaceholder(z.string())).toBe('<string>');
    expect(queryPlaceholder(z.number())).toBe('<number>');
    expect(queryPlaceholder(z.boolean())).toBe('<boolean>');
  });

  test('handles optional and nullable', () => {
    expect(queryPlaceholder(z.string().optional())).toBe('<string>');
    expect(queryPlaceholder(z.string().nullable())).toBe('<string>');
  });

  test('uses literal default values', () => {
    expect(queryPlaceholder(z.string().default('defaultVal'))).toBe('defaultVal');
    expect(queryPlaceholder(z.number().default(100))).toBe(100);
  });

  test('handles arrays', () => {
    expect(queryPlaceholder(z.array(z.string()))).toEqual(['<string>']);
    expect(queryPlaceholder(z.array(z.number().default(5)))).toEqual([5]);
  });

  test('handles unions', () => {
    expect(queryPlaceholder(z.union([z.string(), z.number()]))).toBe('<string>');
    expect(queryPlaceholder(z.union([z.literal('a'), z.literal('b')]))).toBe('a');
  });

  test('handles nested objects', () => {
    const schema = z.object({
      a: z.string(),
      b: z.number().optional(),
      c: z.object({
        d: z.boolean(),
        e: z.string().default('foo')
      })
    });

    expect(queryPlaceholder(schema)).toEqual({
      a: '<string>',
      b: '<number>',
      c: {
        d: '<boolean>',
        e: 'foo'
      }
    });
  });

  test('handles literals', () => {
    expect(queryPlaceholder(z.literal('fixed'))).toBe('fixed');
    expect(queryPlaceholder(z.literal(123))).toBe(123);
  });

  test('handles enums', () => {
    expect(queryPlaceholder(z.enum(['A', 'B', 'C']))).toBe('A');
  });

  test('handles native enums', () => {
    expect(queryPlaceholder(z.nativeEnum(MyEnum))).toBe('RED');
  });

  test('handles records', () => {
    const schema = z.record(z.boolean());
    expect(queryPlaceholder(schema)).toEqual({ '<key>': '<boolean>' });
  });
});
