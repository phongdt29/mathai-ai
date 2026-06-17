import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { errorResponse } from '../utils/response';
import {
  AppError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { captureException } from '../config/sentry';


export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  let normalizedError: AppError;

  if (error instanceof AppError) {
    normalizedError = error;
  } else if (error instanceof ZodError) {
    normalizedError = new ValidationError(
      'Dữ liệu không hợp lệ',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }))
    );
  } else if (error instanceof Error && error.name === 'MongoServerError' && (error as any).code === 11000) {
    const field = Object.keys((error as any).keyValue || {})[0] || 'field';
    return errorResponse(res, 409, `${field} already exists`, { field });
  } else if (error instanceof mongoose.Error.ValidationError) {
    const fields = Object.keys(error.errors).map(key => ({
      field: key,
      message: error.errors[key].message,
    }));
    normalizedError = new ValidationError('Invalid data provided', fields);
  } else if (error instanceof Error && error.name === 'CastError') {
    normalizedError = new AppError('The provided ID format is invalid', 400, undefined, true);
  } else if (error instanceof Error) {
    normalizedError = new AppError(error.message || 'Internal Server Error', 500, undefined, false);
  } else {
    normalizedError = new AppError('Internal Server Error', 500, undefined, false);
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error('[ERROR]', {
      name: normalizedError.name,
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      errors: normalizedError.errors,
      stack: process.env.NODE_ENV !== 'production' ? normalizedError.stack : undefined,
    });
  }

  // Capture unhandled errors (5xx) with Sentry
  // Validates: Requirements 13.5
  if (normalizedError.statusCode >= 500) {
    captureException(error);
  }

  const isDev = process.env.NODE_ENV === 'development';

  const responseErrors = isDev
      ? {
          details: normalizedError.errors,
          stack: normalizedError.stack,
        }
      : normalizedError.errors;

  const responseMessage =
    process.env.NODE_ENV === 'production' && !normalizedError.isOperational
      ? 'Internal Server Error'
      : normalizedError.message;

  return errorResponse(res, normalizedError.statusCode, responseMessage, responseErrors);
};
