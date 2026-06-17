import { existsSync, statSync } from "node:fs";

const srcPath = new URL("../src/", import.meta.url);
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function isUnderSrc(url, srcRootUrl) {
	return url.href.startsWith(srcRootUrl.href);
}

function existingFile(url) {
	return existsSync(url) && statSync(url).isFile();
}

function candidateUrls(aliasPath, srcRootUrl) {
	const baseUrl = new URL(aliasPath, srcRootUrl);
	const candidates = [baseUrl];

	if (!extensions.some((extension) => baseUrl.pathname.endsWith(extension))) {
		for (const extension of extensions) {
			candidates.push(new URL(`${aliasPath}${extension}`, srcRootUrl));
		}
	}

	for (const extension of extensions) {
		candidates.push(new URL(`${aliasPath.replace(/\/$/, "")}/index${extension}`, srcRootUrl));
	}

	return candidates;
}

export function resolveAliasSpecifier(specifier, srcRootUrl = srcPath) {
	if (!specifier.startsWith("@/")) {
		return null;
	}

	const aliasPath = specifier.slice(2);
	const candidates = candidateUrls(aliasPath, srcRootUrl);

	for (const candidate of candidates) {
		if (!isUnderSrc(candidate, srcRootUrl)) {
			throw new Error(
				`Frontend alias "${specifier}" escapes frontend src directory: ${candidate.href}`,
			);
		}

		if (existingFile(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		`Could not resolve frontend alias "${specifier}" under ${srcRootUrl.href}. Tried: ${candidates
			.map((candidate) => candidate.href)
			.join(", ")}`,
	);
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith("@/")) {
		return nextResolve(resolveAliasSpecifier(specifier).href, context);
	}

	return nextResolve(specifier, context);
}
