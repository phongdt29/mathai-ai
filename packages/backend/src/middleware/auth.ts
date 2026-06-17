import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';
import { UserRole } from '../types';

export const isDemoAuthTokenEnabled = (
  nodeEnv = process.env.NODE_ENV,
  enableDemoAuthTokens = process.env.ENABLE_DEMO_AUTH_TOKENS
): boolean => enableDemoAuthTokens === 'true' && nodeEnv !== 'production';

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token không được cung cấp');
    }

    const token = authHeader.split(' ')[1];

    if (isDemoAuthTokenEnabled()) {
      // Demo tokens are only accepted with an explicit non-production env flag.
      const demoUsers: Record<string, { id: string; email: string; role: UserRole }> = {
        'demo-token-admin': { id: '000000000000000000000001', email: 'admin@mathai.vn', role: 'admin' as UserRole },
        'demo-token-teacher': { id: '000000000000000000000002', email: 'teacher@mathai.vn', role: 'teacher' as UserRole },
        'demo-token-student': { id: '000000000000000000000003', email: 'student@mathai.vn', role: 'student' as UserRole },
        'demo-token-parent': { id: '000000000000000000000004', email: 'parent@mathai.vn', role: 'parent' as UserRole },
        'demo-token-staff': { id: '000000000000000000000005', email: 'staff@mathai.vn', role: 'staff' as UserRole },
      };

      const demoUser = demoUsers[token];
      if (demoUser) {
        req.user = demoUser;
        next();
        return;
      }
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      id: string;
      email: string;
      role: UserRole;
    };

    req.user = decoded;
    next();
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      next(error);
      return;
    }

    next(new UnauthorizedError('Token không hợp lệ hoặc đã hết hạn'));
  }
};

