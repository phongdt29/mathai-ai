import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((issue) => issue.message).join(', ');

        next(
          new ValidationError(messages || 'Dữ liệu không hợp lệ',
            error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            }))
          )
        );
        return;
      }

      next(error);
    }
  };
};
