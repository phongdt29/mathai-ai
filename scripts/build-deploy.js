const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const deployDir = path.join(rootDir, "deploy");
const backendDir = path.join(rootDir, "packages", "backend");
const frontendDir = path.join(rootDir, "packages", "frontend");

const rootDeployEnvExample = `# MathAI deployment environment example
# Use this as a checklist for staging/production secret/config managers.
# Active runtime is MongoDB/Mongoose. SQL/MySQL keys are legacy reference-only and are not required.
# Do not commit real secrets.

NODE_ENV=production

# Backend
BACKEND_PORT=3001
BACKEND_URL=https://api.your-domain.example
CORS_ORIGIN=https://app.your-domain.example
APP_BASE_URL=https://app.your-domain.example

# MongoDB runtime - production must be explicit and non-localhost.
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
DB_NAME=mathai

# JWT - production requires explicit, long, random, distinct values.
JWT_SECRET=<set-in-secret-manager>
JWT_REFRESH_SECRET=<set-in-secret-manager>
JWT_EXPIRES_IN=7d

# Password reset email provider. Use console only for dry-run/staging checks; production should use http.
EMAIL_PROVIDER=http
EMAIL_FROM="MathAI <no-reply@your-domain.example>"
EMAIL_API_URL=https://email-provider.your-domain.example/send
EMAIL_API_KEY=<set-in-secret-manager>

# Demo auth safety gates. Keep disabled in production.
NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false
ENABLE_DEMO_AUTH_TOKENS=false

# OpenAI / AI tutor integration.
OPENAI_API_KEY=<set-in-secret-manager-if-ai-features-enabled>
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini

# Frontend production build requires an absolute non-localhost http(s) API URL.
NEXT_PUBLIC_API_URL=https://api.your-domain.example/api
# Optional server rewrite target for non-production Next.js dev/staging rewrites.
# BACKEND_API_URL is normally unnecessary in production because production rewrites are disabled;
# set only when an intentional deploy platform rewrite needs an absolute non-localhost target.
BACKEND_API_URL=

# Phase 6 deployment verification feature flags.
FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT=true
FEATURE_AUDIT_LOGGING=true
FEATURE_AI_SAFETY_GUARD=true
FEATURE_ANTI_FRAUD_SIGNAL_GENERATION=true
FEATURE_GRADEBOOK_SUMMARIES=true
FEATURE_DEPLOYMENT_CHECKPOINTS=false
`;

const backendDeployEnvExample = `# Backend deployment environment example
# Active runtime: MongoDB via Mongoose. SQL/MySQL keys are legacy reference-only and are not required.
# Do not commit real secrets.

NODE_ENV=production
BACKEND_PORT=3001
CORS_ORIGIN=https://app.your-domain.example
APP_BASE_URL=https://app.your-domain.example

# MongoDB runtime - production must be explicit and non-localhost.
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
DB_NAME=mathai

# JWT - production requires explicit, long, random, distinct values.
JWT_SECRET=<set-in-secret-manager>
JWT_REFRESH_SECRET=<set-in-secret-manager>
JWT_EXPIRES_IN=7d

# Password reset email provider. Use console only for dry-run/staging checks; production should use http.
EMAIL_PROVIDER=http
EMAIL_FROM="MathAI <no-reply@your-domain.example>"
EMAIL_API_URL=https://email-provider.your-domain.example/send
EMAIL_API_KEY=<set-in-secret-manager>

# Demo auth bypass remains disabled in production.
ENABLE_DEMO_AUTH_TOKENS=false

# OpenAI / AI tutor integration.
OPENAI_API_KEY=<set-in-secret-manager-if-ai-features-enabled>
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini

# Phase 6 deployment verification feature flags.
FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT=true
FEATURE_AUDIT_LOGGING=true
FEATURE_AI_SAFETY_GUARD=true
FEATURE_ANTI_FRAUD_SIGNAL_GENERATION=true
FEATURE_GRADEBOOK_SUMMARIES=true
FEATURE_DEPLOYMENT_CHECKPOINTS=false
`;

const frontendDeployEnvExample = `# Frontend deployment environment example
# Production build requires NEXT_PUBLIC_API_URL to be an explicit absolute http(s) URL
# that does not point to localhost. Do not commit production secrets.

NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.your-domain.example/api
NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false

# Optional server rewrite target for non-production Next.js dev/staging rewrites;
# BACKEND_API_URL is normally unnecessary in production because production rewrites are disabled;
# set only when an intentional deploy platform rewrite needs an absolute non-localhost target.
BACKEND_API_URL=
`;

function writeText(filePath, content) {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, content, "utf8");
}

function run(command, cwd = rootDir) {
	console.log(`\n> ${command}`);
	execSync(command, { cwd, stdio: "inherit", shell: true });
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function removeIfExists(target) {
	if (fs.existsSync(target)) {
		fs.rmSync(target, { recursive: true, force: true });
	}
}

function copyIfExists(source, target) {
	if (!fs.existsSync(source)) {
		console.warn(`Skipping missing path: ${path.relative(rootDir, source)}`);
		return false;
	}
	ensureDir(path.dirname(target));
	fs.cpSync(source, target, { recursive: true, force: true });
	return true;
}

function writeFrontendStartWrapper(targetFrontendDir) {
	writeText(
		path.join(targetFrontendDir, "start-frontend.js"),
		[
			"const fs = require('fs');",
			"const path = require('path');",
			"",
			"const directServer = path.join(__dirname, 'server.js');",
			"const nestedServer = path.join(__dirname, 'packages', 'frontend', 'server.js');",
			"const serverPath = fs.existsSync(directServer) ? directServer : nestedServer;",
			"",
			"if (!fs.existsSync(serverPath)) {",
			"\tthrow new Error('Unable to find Next.js standalone server.js in frontend deploy artifact.');",
			"}",
			"",
			"require(serverPath);",
			"",
		].join("\n"),
	);
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeDeployEnvExamples(targetDeployDir = deployDir) {
	writeText(path.join(targetDeployDir, ".env.example"), rootDeployEnvExample);
	writeText(
		path.join(targetDeployDir, "backend", ".env.example"),
		backendDeployEnvExample,
	);
	writeText(
		path.join(targetDeployDir, "frontend", ".env.example"),
		frontendDeployEnvExample,
	);
}

function buildDeployArtifact() {
	run("npm run build");

	removeIfExists(deployDir);
	ensureDir(deployDir);

	const backendDeployDir = path.join(deployDir, "backend");
	copyIfExists(
		path.join(backendDir, "dist"),
		path.join(backendDeployDir, "dist"),
	);
	copyIfExists(
		path.join(backendDir, "package.json"),
		path.join(backendDeployDir, "package.json"),
	);

	const frontendDeployDir = path.join(deployDir, "frontend");
	const standaloneDir = path.join(frontendDir, ".next", "standalone");

	if (fs.existsSync(standaloneDir)) {
		copyIfExists(standaloneDir, frontendDeployDir);
		copyIfExists(
			path.join(frontendDir, ".next", "static"),
			path.join(frontendDeployDir, "packages", "frontend", ".next", "static"),
		);
		copyIfExists(
			path.join(frontendDir, "public"),
			path.join(frontendDeployDir, "packages", "frontend", "public"),
		);
		writeFrontendStartWrapper(frontendDeployDir);
	} else {
		writeFrontendStartWrapper(frontendDeployDir);
		copyIfExists(
			path.join(frontendDir, ".next"),
			path.join(frontendDeployDir, ".next"),
		);
		copyIfExists(
			path.join(frontendDir, "public"),
			path.join(frontendDeployDir, "public"),
		);
		copyIfExists(
			path.join(frontendDir, "package.json"),
			path.join(frontendDeployDir, "package.json"),
		);
	}

	writeDeployEnvExamples(deployDir);
	copyIfExists(
		path.join(rootDir, "package-lock.json"),
		path.join(deployDir, "package-lock.json"),
	);
	copyIfExists(
		path.join(rootDir, "database"),
		path.join(deployDir, "database"),
	);

	writeJson(path.join(deployDir, "package.json"), {
		name: "mathai-deploy",
		version: "0.1.0",
		private: true,
		scripts: {
			"start:backend": "node backend/dist/src/index.js",
			"start:worker": "node backend/dist/src/worker.js",
			"start:frontend": "node frontend/start-frontend.js",
		},
	});

	writeText(
		path.join(deployDir, "README.md"),
		[
			"# MathAI deploy artifact",
			"",
			"- Backend API: `backend/dist/src/index.js` (via `npm run start:backend`).",
			"- Backend worker/cron: `backend/dist/src/worker.js` (via `npm run start:worker`).",
			"- Frontend build: `frontend/start-frontend.js` starts the Next.js standalone server on every supported platform.",
			"- `npm run start:frontend` runs the cross-platform Node wrapper instead of shell conditionals.",
			"- Active runtime is MongoDB/Mongoose; SQL files in `database/` are reference material only.",
			"- Configure production with the redacted placeholders in `.env.example`, `backend/.env.example`, and `frontend/.env.example`.",
			"- Default ports configured by the app are frontend `3444` and backend `3001`.",
			"",
			"Run from this directory after configuring environment variables:",
			"",
			"```cmd",
			"npm run start:backend",
			"npm run start:frontend",
			"# Equivalent frontend command:",
			"node frontend/start-frontend.js",
			"```",
			"",
		].join("\n"),
	);

	console.log(`\nDeploy artifact written to: ${deployDir}`);
}

if (require.main === module) {
	buildDeployArtifact();
}

module.exports = {
	backendDeployEnvExample,
	buildDeployArtifact,
	frontendDeployEnvExample,
	rootDeployEnvExample,
	writeDeployEnvExamples,
	writeFrontendStartWrapper,
};
