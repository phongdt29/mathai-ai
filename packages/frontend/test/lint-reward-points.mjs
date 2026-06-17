import { ESLint } from "eslint";

const rewardPointFiles = [
	"src/lib/api.ts",
	"src/types/index.ts",
	"src/app/(dashboard)/layout.tsx",
	"src/app/(dashboard)/dashboard/points/page.tsx",
	"src/app/(admin)/admin/students/[id]/points/page.tsx",
	"src/app/(admin)/admin/classes/[id]/page.tsx",
	"src/app/(admin)/admin/students/[id]/points/point-history-details.ts",
	"src/app/(admin)/admin/students/[id]/points/point-history-details.test.ts",
	"test/alias-resolver.mjs",
	"test/alias-resolver.test.mjs",
];

const eslint = new ESLint();
const results = await eslint.lintFiles(rewardPointFiles);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);

if (output) {
	console.log(output);
}

const errorCount = results.reduce((count, result) => count + result.errorCount, 0);
const fatalErrorCount = results.reduce((count, result) => count + result.fatalErrorCount, 0);
const warningCount = results.reduce((count, result) => count + result.warningCount, 0);

if (errorCount > 0 || fatalErrorCount > 0) {
	process.exitCode = 1;
} else if (warningCount > 0) {
	console.log(`Reward-points scoped lint completed with ${warningCount} warning(s).`);
} else {
	console.log("Reward-points scoped lint passed.");
}
