import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types";
import { ForbiddenError } from "../utils/errors";

export const requireRole = (...allowedRoles: UserRole[]) => {
	return (req: Request, _res: Response, next: NextFunction): void => {
		const role = req.user?.role;

		if (!role || !allowedRoles.includes(role)) {
			next(new ForbiddenError("Bạn không có quyền truy cập tài nguyên này"));
			return;
		}

		next();
	};
};
