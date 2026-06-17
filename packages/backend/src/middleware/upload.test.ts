import assert from "node:assert/strict";
import test from "node:test";

import {
	ALLOWED_IMAGE_EXTENSIONS,
	ALLOWED_IMAGE_MIME_TYPES,
	isAllowedImageExtension,
	isAllowedImageMimeType,
	isAllowedImageUpload,
} from "./upload";

test("solver/avatar upload image extension allow-list is explicit and case-insensitive", () => {
	assert.deepEqual(ALLOWED_IMAGE_EXTENSIONS, [
		".jpg",
		".jpeg",
		".png",
		".gif",
		".webp",
	]);

	for (const filename of [
		"problem.jpg",
		"problem.JPEG",
		"problem.PNG",
		"problem.gif",
		"problem.webp",
	]) {
		assert.equal(isAllowedImageExtension(filename), true, filename);
	}
});

test("solver/avatar upload image extension helper rejects non-image and svg files", () => {
	for (const filename of [
		"problem.pdf",
		"problem.txt",
		"problem.svg",
		"problem",
		".png.exe",
	]) {
		assert.equal(isAllowedImageExtension(filename), false, filename);
	}
});

test("solver/avatar upload MIME allow-list matches supported image formats", () => {
	assert.deepEqual(ALLOWED_IMAGE_MIME_TYPES, [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
	]);

	for (const mimeType of [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
	]) {
		assert.equal(isAllowedImageMimeType(mimeType), true, mimeType);
	}
});

test("solver/avatar upload helper requires matching safe extension and MIME type", () => {
	assert.equal(isAllowedImageUpload("problem.png", "image/png"), true);
	assert.equal(isAllowedImageUpload("problem.jpg", "image/jpeg"), true);
	assert.equal(isAllowedImageUpload("problem.png", "application/pdf"), false);
	assert.equal(isAllowedImageUpload("problem.pdf", "image/png"), false);
	assert.equal(isAllowedImageUpload("problem.svg", "image/svg+xml"), false);
	assert.equal(isAllowedImageUpload("problem.PNG", "IMAGE/PNG"), true);
});
