import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveAliasSpecifier } from "./alias-resolver.mjs";

const srcUrl = new URL("../src/", import.meta.url);
const hrefFor = (relativePath) => new URL(relativePath, srcUrl).href;

describe("frontend test alias resolver", () => {
	test("resolves extensionless aliases to tsx files", () => {
		const resolved = resolveAliasSpecifier("@/app/page", srcUrl);

		assert.equal(resolved.href, hrefFor("app/page.tsx"));
	});

	test("resolves aliases to index files", () => {
		const resolved = resolveAliasSpecifier("@/types", srcUrl);

		assert.equal(resolved.href, hrefFor("types/index.ts"));
	});

	test("rejects aliases that escape src", () => {
		assert.throws(
			() => resolveAliasSpecifier("@/../package.json", srcUrl),
			/escapes frontend src/i,
		);
	});

	test("throws a clear error for unresolved aliases", () => {
		assert.throws(
			() => resolveAliasSpecifier("@/missing/module", srcUrl),
			/Could not resolve frontend alias/i,
		);
	});
});
