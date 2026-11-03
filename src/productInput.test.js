import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMAGE_BASE64_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_URL_LENGTH,
  MAX_JSON_BODY_BYTES,
  parsePublished,
  resolveProductImage,
  uploadImagePath,
} from "./productInput.js";

/**
 * Encode bytes as standard base64.
 *
 * @param bytes Raw bytes
 * @return Base64 text
 */
function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Assert a resolver call fails with a status and message.
 *
 * @param fn Call to run
 * @param message Expected message
 */
function assertHttp(fn, message) {
  assert.throws(fn, (error) => error.status === 400 && error.message === message);
}

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff]);
const gif89a = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const gif87a = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

test("size constants match the upload and body caps", () => {
  assert.equal(MAX_IMAGE_BYTES, 1048576);
  assert.equal(MAX_IMAGE_URL_LENGTH, 2048);
  assert.equal(MAX_JSON_BODY_BYTES, 2097152);
  assert.equal(MAX_IMAGE_BASE64_LENGTH, 1398104);
  assert.equal(uploadImagePath("a b"), "/api/products/a%20b/image");
});

test("PNG, JPEG, WebP, and GIF signatures upload", () => {
  const cases = [
    ["image/png", png],
    ["image/jpeg", jpeg],
    ["image/webp", webp],
    ["image/gif", gif89a],
    ["image/gif", gif87a],
  ];
  for (const [contentType, bytes] of cases) {
    const resolved = resolveProductImage({
      imageUrl: "",
      imageFile: { contentType, dataBase64: b64(bytes) },
    }, { id: "pic 1" });
    assert.equal(resolved.kind, "upload");
    assert.equal(resolved.contentType, contentType);
    assert.equal(resolved.imageUrl, "/api/products/pic%201/image");
    assert.deepEqual(resolved.bytes, bytes);
  }
});

test("SVG and a mismatched content type are rejected", () => {
  const svg = b64(Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"));
  assertHttp(
    () => resolveProductImage({
      imageFile: { contentType: "image/svg+xml", dataBase64: svg },
    }, { id: "p1" }),
    "Image file must be PNG, JPEG, WebP, or GIF",
  );
  assertHttp(
    () => resolveProductImage({
      imageFile: { contentType: "image/jpeg", dataBase64: b64(png) },
    }, { id: "p1" }),
    "Image file must be PNG, JPEG, WebP, or GIF",
  );
});

test("an empty decode is rejected", () => {
  assertHttp(
    () => resolveProductImage({
      imageFile: { contentType: "image/png", dataBase64: "" },
    }, { id: "p1" }),
    "Image file is empty",
  );
});

test("invalid base64 and a data: prefix are rejected", () => {
  assertHttp(
    () => resolveProductImage({
      imageFile: { contentType: "image/png", dataBase64: "****" },
    }, { id: "p1" }),
    "Image file is invalid",
  );
  assertHttp(
    () => resolveProductImage({
      imageFile: { contentType: "image/png", dataBase64: `data:image/png;base64,${b64(png)}` },
    }, { id: "p1" }),
    "Image file is invalid",
  );
});

test("base64 longer than 1398104 characters is rejected before decode", () => {
  assertHttp(
    () => resolveProductImage({
      imageFile: { contentType: "image/png", dataBase64: "A".repeat(MAX_IMAGE_BASE64_LENGTH + 1) },
    }, { id: "p1" }),
    "Image file must be 1 MB or smaller",
  );
});

test("a file together with a non-empty URL is rejected", () => {
  assertHttp(
    () => resolveProductImage({
      imageUrl: "https://example.com/a.png",
      imageFile: { contentType: "image/png", dataBase64: b64(png) },
    }, { id: "p1" }),
    "Choose an image file or an image URL, not both",
  );
});

test("external URLs are trimmed and a 2049-character URL is rejected", () => {
  const resolved = resolveProductImage({
    imageUrl: "  https://example.com/a.png  ",
  }, { id: "p1" });
  assert.equal(resolved.kind, "external");
  assert.equal(resolved.imageUrl, "https://example.com/a.png");
  assert.equal(resolved.bytes, undefined);

  const prefix = "https://example.com/";
  const tooLong = prefix + "a".repeat(2049 - prefix.length);
  assert.equal(tooLong.length, 2049);
  assertHttp(
    () => resolveProductImage({ imageUrl: tooLong }, { id: "p1" }),
    "Image URL is too long",
  );
});

test("a non-http URL is rejected", () => {
  assertHttp(
    () => resolveProductImage({ imageUrl: "ftp://example.com/a.png" }, { id: "p1" }),
    "Image must be an http or https URL",
  );
});

test("create rejects an upload path", () => {
  const id = "p1";
  assertHttp(
    () => resolveProductImage({ imageUrl: uploadImagePath(id) }, { id }),
    "Image must be an http or https URL",
  );
});

test("update keep is accepted only when the current image is that upload path", () => {
  const id = "p1";
  const path = uploadImagePath(id);
  const kept = resolveProductImage({ imageUrl: path }, { id, currentImageUrl: path });
  assert.equal(kept.kind, "keep");
  assert.equal(kept.imageUrl, path);
  assert.equal(kept.bytes, undefined);

  assertHttp(
    () => resolveProductImage({
      imageUrl: path,
    }, { id, currentImageUrl: "https://example.com/a.png" }),
    "Image must be an http or https URL",
  );
});

test("omitted published defaults to true, explicit false is kept, and null or the string false is rejected", () => {
  assert.equal(parsePublished(undefined, { omitted: "default-true" }), true);
  assert.equal(parsePublished(false, { omitted: "default-true" }), false);
  assert.equal(parsePublished(true, { omitted: "keep" }), true);
  assert.equal(parsePublished(undefined, { omitted: "keep" }), undefined);
  assertHttp(() => parsePublished(null, { omitted: "default-true" }), "Published must be true or false");
  assertHttp(() => parsePublished("false", { omitted: "keep" }), "Published must be true or false");
});
