const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const deployPackage = require("../deploy/package.json");
const test = require("node:test");

const {
	backendDeployEnvExample,
	frontendDeployEnvExample,
	rootDeployEnvExample,
	writeDeployEnvExamples,
} = require("./build-deploy");

test("deploy env examples are production-safe and MongoDB-first", () => {
	const combined = [
		rootDeployEnvExample,
		backendDeployEnvExample,
		frontendDeployEnvExample,
	].join("\n");

	assert.match(combined, /NODE_ENV=production/);
	assert.match(combined, /MONGODB_URI=mongodb\+srv:\/\//);
	assert.match(combined, /JWT_REFRESH_SECRET=<set-in-secret-manager>/);
	assert.match(combined, /APP_BASE_URL=https:\/\/app\.your-domain\.example/);
	assert.match(combined, /EMAIL_PROVIDER=http/);
	assert.match(combined, /EMAIL_FROM="MathAI <no-reply@your-domain\.example>"/);
	assert.match(
		combined,
		/EMAIL_API_URL=https:\/\/email-provider\.your-domain\.example\/send/,
	);
	assert.match(combined, /EMAIL_API_KEY=<set-in-secret-manager>/);
	assert.match(
		combined,
		/NEXT_PUBLIC_API_URL=https:\/\/api\.your-domain\.example\/api/,
	);
	assert.match(combined, /BACKEND_API_URL=\n/);
	assert.match(combined, /ENABLE_DEMO_AUTH_TOKENS=false/);
	assert.doesNotMatch(combined, /DB_HOST=/);
	assert.doesNotMatch(combined, /DB_PASSWORD=/);
	assert.doesNotMatch(combined, /your-secret-key-here/);
	assert.doesNotMatch(combined, /localhost:3001/);
});

test("writeDeployEnvExamples writes deploy-safe templates after artifact cleanup", () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mathai-deploy-env-"));
	try {
		writeDeployEnvExamples(tempDir);

		const rootEnv = fs.readFileSync(path.join(tempDir, ".env.example"), "utf8");
		const backendEnv = fs.readFileSync(
			path.join(tempDir, "backend", ".env.example"),
			"utf8",
		);
		const frontendEnv = fs.readFileSync(
			path.join(tempDir, "frontend", ".env.example"),
			"utf8",
		);

		assert.equal(rootEnv, rootDeployEnvExample);
		assert.equal(backendEnv, backendDeployEnvExample);
		assert.equal(frontendEnv, frontendDeployEnvExample);
		assert.match(rootEnv, /SQL\/MySQL keys are legacy reference-only/);
		assert.match(backendEnv, /Active runtime: MongoDB via Mongoose/);
		assert.match(
			frontendEnv,
			/BACKEND_API_URL is normally unnecessary in production/,
		);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("checked-in deploy artifact start script uses cross-platform frontend start wrapper", () => {
	const checkedInReadme = fs.readFileSync(
		path.join(__dirname, "..", "deploy", "README.md"),
		"utf8",
	);

	assert.equal(
		deployPackage.scripts["start:frontend"],
		"node frontend/start-frontend.js",
	);
	assert.doesNotMatch(deployPackage.scripts["start:frontend"], /test -f|&&|\|\|/);
	assert.match(checkedInReadme, /node frontend\/start-frontend\.js/);
	assert.doesNotMatch(checkedInReadme, /test -f|&&|\|\|/);
	assert.ok(
		fs.existsSync(path.join(__dirname, "..", "deploy", "frontend", "start-frontend.js")),
	);

	const generatorSource = fs.readFileSync(
		path.join(__dirname, "build-deploy.js"),
		"utf8",
	);
	assert.match(
		generatorSource,
		/"start:frontend":\s*"node frontend\/start-frontend\.js"/,
	);
	assert.match(generatorSource, /writeFrontendStartWrapper/);
	assert.doesNotMatch(generatorSource, /test -f frontend\/server\.js/);
});
