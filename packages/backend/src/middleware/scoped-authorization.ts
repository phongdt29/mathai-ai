import type { NextFunction, Request, Response } from "express";
import { auditService } from "../services/audit.service";
import { scopedAuthorizationService, getScopedValue, type ScopeSource, type ScopedAction, type ScopedResourceType } from "../services/scoped-authorization.service";
import { ForbiddenError } from "../utils/errors";

export interface RequireScopedAccessOptions {
	resourceType: ScopedResourceType;
	action: ScopedAction;
	permission?: string;
	resourceId?: {
		source: ScopeSource;
		field: string;
	};
	scope?: {
		source: ScopeSource;
		field: string;
	};
}

export const requireScopedAccess = (options: RequireScopedAccessOptions) => {
	return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
		try {
			const actor = req.user;
			const resourceId = options.resourceId
				? getScopedValue(req, options.resourceId.source, options.resourceId.field)
				: null;
			const scope = options.scope ? getScopedValue(req, options.scope.source, options.scope.field) : null;

			const decision = await scopedAuthorizationService.canAccess({
				actor,
				resourceType: options.resourceType,
				resourceId,
				action: options.action,
				permission: options.permission,
				scope,
			});

			if (!decision.allowed) {
				void auditService.recordFromRequest(req, {
					action: `scoped_access_denied:${options.action}`,
					resourceType: options.resourceType,
					resourceId,
					scopeType: scope ? "scope" : null,
					scopeId: scope,
					result: "denied",
					errorCode: decision.reason,
					metadata: {
						permission: options.permission ?? null,
					},
				});
				next(new ForbiddenError("Bạn không có quyền truy cập tài nguyên này"));
				return;
			}

			next();
		} catch (error) {
			next(error);
		}
	};
};
