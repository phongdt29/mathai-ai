export const DEFAULT_DEMO_LOGIN_PASSWORD = "MathAI@Demo123";

export function getDemoLoginPassword(): string {
	return DEFAULT_DEMO_LOGIN_PASSWORD;
}

export function isDemoLoginEnabled(
	options: {
		nodeEnv?: string;
		enableDemoLogin?: string;
	} = {},
): boolean {
	const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
	const enableDemoLogin = options.enableDemoLogin ?? process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN;

	return nodeEnv === "development" || enableDemoLogin === "true";
}
