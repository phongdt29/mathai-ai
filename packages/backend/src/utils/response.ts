import { Response } from 'express';
import { ApiResponse, PaginatedResponse } from '../types';

export const successResponse = <T>(
  res: Response,
  data: T,
  message: string = 'Thành công',
  meta?: Record<string, unknown>,
  statusCode: number = 200
): Response<ApiResponse<T>> => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });
};

export const paginatedResponse = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message: string = 'Thành công',
  meta?: Record<string, unknown>
): Response<PaginatedResponse<T>> => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      ...meta,
    },
  });
};

export const errorResponse = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: unknown
): Response<ApiResponse<null>> => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    ...(errors !== undefined ? { meta: { errors } } : {}),
  });
};
