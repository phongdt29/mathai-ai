export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errors?: unknown,
    isOperational: boolean = true
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Dữ liệu không hợp lệ', errors?: unknown) {
    super(message, 400, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Không được phép truy cập', errors?: unknown) {
    super(message, 401, errors);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Bạn không có quyền thực hiện thao tác này', errors?: unknown) {
    super(message, 403, errors);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Không tìm thấy dữ liệu', errors?: unknown) {
    super(message, 404, errors);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Dữ liệu đã tồn tại hoặc bị xung đột', errors?: unknown) {
    super(message, 409, errors);
  }
}
