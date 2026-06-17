export function canManageUserStatus(role: string | null | undefined): boolean {
	return role === "admin";
}

/**
 * Paths restricted from staff role — only accessible by admin.
 * Includes: AI providers, Audit logs, Billing.
 */
const ADMIN_ONLY_PATHS = [
	"/admin/ai-providers",
	"/admin/audit",
	"/admin/billing",
];

/**
 * Determines whether a user with the given role can access a specific admin path.
 * Staff users are restricted from AI providers, Audit logs, and Billing pages.
 */
export function canAccessPath(
	role: string | null | undefined,
	path: string,
): boolean {
	if (!role) return false;
	if (role === "admin") return true;
	if (role === "staff") {
		return !ADMIN_ONLY_PATHS.some(
			(restricted) =>
				path === restricted || path.startsWith(`${restricted}/`),
		);
	}
	return false;
}
