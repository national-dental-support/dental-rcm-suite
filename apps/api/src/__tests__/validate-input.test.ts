/**
 * Unit Tests - validate-input.ts (Express body validation middleware)
 *
 * Run: npm test -- --testPathPattern=validate-input
 */
import { describe, it, expect } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { validateBody, ValidationSchema } from '../middleware/validate-input';

function mockReq(body: any): Partial<Request> {
  return { body };
}

function mockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

function runValidation(schema: ValidationSchema, body: any): { called: boolean; statusCode: number; errors: string[] } {
  const middleware = validateBody(schema);
  const req = mockReq(body) as Request;
  const res = mockRes();
  let called = false;
  const next: NextFunction = () => { called = true; };

  middleware(req, res as any as Response, next);

  return {
    called,
    statusCode: res.statusCode,
    errors: res.body?.errors ?? [],
  };
}

describe('validateBody middleware', () => {
  // -- required ------------------------------------------------------------

  describe('required field validation', () => {
    it('rejects missing required field', () => {
      const result = runValidation({ name: { required: true } }, {});
      expect(result.called).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.errors).toContain('name is required');
    });

    it('rejects null required field', () => {
      const result = runValidation({ name: { required: true } }, { name: null });
      expect(result.called).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.errors).toContain('name is required');
    });

    it('rejects empty string required field', () => {
      const result = runValidation({ name: { required: true } }, { name: '' });
      expect(result.called).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    it('passes when required field is present', () => {
      const result = runValidation({ name: { required: true } }, { name: 'John' });
      expect(result.called).toBe(true);
    });
  });

  // -- maxLength -----------------------------------------------------------

  describe('maxLength validation', () => {
    it('rejects string exceeding maxLength', () => {
      const result = runValidation({ code: { maxLength: 5 } }, { code: 'ABCDEF' });
      expect(result.called).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.errors[0]).toContain('at most 5 characters');
    });

    it('passes string at exact maxLength', () => {
      const result = runValidation({ code: { maxLength: 5 } }, { code: 'ABCDE' });
      expect(result.called).toBe(true);
    });

    it('passes when field is not provided and not required', () => {
      const result = runValidation({ code: { maxLength: 5 } }, {});
      expect(result.called).toBe(true);
    });
  });

  // -- type: string --------------------------------------------------------

  describe('type: string validation', () => {
    it('rejects non-string value', () => {
      const result = runValidation({ name: { type: 'string' } }, { name: 123 });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('must be a string');
    });

    it('passes string value', () => {
      const result = runValidation({ name: { type: 'string' } }, { name: 'hello' });
      expect(result.called).toBe(true);
    });
  });

  // -- type: number --------------------------------------------------------

  describe('type: number validation', () => {
    it('rejects non-number value', () => {
      const result = runValidation({ age: { type: 'number' } }, { age: 'twenty' });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('must be a number');
    });

    it('rejects NaN', () => {
      const result = runValidation({ age: { type: 'number' } }, { age: NaN });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('must be a number');
    });

    it('passes number value', () => {
      const result = runValidation({ age: { type: 'number' } }, { age: 25 });
      expect(result.called).toBe(true);
    });
  });

  // -- type: boolean -------------------------------------------------------

  describe('type: boolean validation', () => {
    it('rejects non-boolean value', () => {
      const result = runValidation({ active: { type: 'boolean' } }, { active: 'yes' });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('must be a boolean');
    });

    it('passes boolean value', () => {
      const result = runValidation({ active: { type: 'boolean' } }, { active: true });
      expect(result.called).toBe(true);
    });
  });

  // -- type: email ---------------------------------------------------------

  describe('type: email validation', () => {
    it('rejects invalid email', () => {
      const result = runValidation({ email: { type: 'email' } }, { email: 'not-an-email' });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('must be a valid email');
    });

    it('rejects non-string email', () => {
      const result = runValidation({ email: { type: 'email' } }, { email: 123 });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('must be a valid email');
    });

    it('passes valid email', () => {
      const result = runValidation({ email: { type: 'email' } }, { email: 'user@example.com' });
      expect(result.called).toBe(true);
    });
  });

  // -- min / max range -----------------------------------------------------

  describe('min/max range validation', () => {
    it('rejects number below min', () => {
      const result = runValidation({ quantity: { type: 'number', min: 1 } }, { quantity: 0 });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('at least 1');
    });

    it('rejects number above max', () => {
      const result = runValidation({ quantity: { type: 'number', max: 100 } }, { quantity: 101 });
      expect(result.called).toBe(false);
      expect(result.errors[0]).toContain('at most 100');
    });

    it('passes number at exact min', () => {
      const result = runValidation({ quantity: { type: 'number', min: 1 } }, { quantity: 1 });
      expect(result.called).toBe(true);
    });

    it('passes number at exact max', () => {
      const result = runValidation({ quantity: { type: 'number', max: 100 } }, { quantity: 100 });
      expect(result.called).toBe(true);
    });

    it('passes number within range', () => {
      const result = runValidation({ quantity: { type: 'number', min: 1, max: 100 } }, { quantity: 50 });
      expect(result.called).toBe(true);
    });
  });

  // -- complex schema ------------------------------------------------------

  describe('complex schema with multiple fields', () => {
    const schema: ValidationSchema = {
      name: { required: true, type: 'string', maxLength: 100 },
      email: { required: true, type: 'email' },
      age: { type: 'number', min: 0, max: 150 },
      is_active: { type: 'boolean' },
    };

    it('passes valid input', () => {
      const result = runValidation(schema, {
        name: 'John Doe', email: 'john@example.com', age: 30, is_active: true,
      });
      expect(result.called).toBe(true);
    });

    it('collects multiple errors', () => {
      const result = runValidation(schema, { name: '', email: 'bad' });
      expect(result.called).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('skips optional fields when not provided', () => {
      const result = runValidation(schema, { name: 'Jane', email: 'jane@e.com' });
      expect(result.called).toBe(true);
    });
  });

  // -- edge cases ----------------------------------------------------------

  describe('edge cases', () => {
    it('handles undefined body gracefully', () => {
      const middleware = validateBody({ name: { required: true } });
      const req = { body: undefined } as unknown as Request;
      const res = mockRes();
      let called = false;
      middleware(req, res as any as Response, () => { called = true; });
      expect(called).toBe(false);
      expect(res.statusCode).toBe(400);
    });

    it('handles empty schema \u2014 always passes', () => {
      const result = runValidation({}, { anything: 'goes' });
      expect(result.called).toBe(true);
    });
  });
});
