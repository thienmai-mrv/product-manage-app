import assert from "node:assert/strict";
import test from "node:test";
import { displayImageSrc } from "./productImage.js";

test("an upload path gains an encoded version query", () => {
  assert.equal(
    displayImageSrc("/api/products/abc/image", "2026-01-01T00:00:00.000Z"),
    "/api/products/abc/image?v=2026-01-01T00%3A00%3A00.000Z",
  );
});

test("an external URL is unchanged", () => {
  assert.equal(
    displayImageSrc("https://cdn.example/a.png?sig=1", "2026-01-01T00:00:00.000Z"),
    "https://cdn.example/a.png?sig=1",
  );
});

test("an empty string is unchanged", () => {
  assert.equal(displayImageSrc("", "2026-01-01T00:00:00.000Z"), "");
});

test("a version that needs encoding is escaped", () => {
  assert.equal(
    displayImageSrc("/api/products/a%20b/image", "a b&c"),
    "/api/products/a%20b/image?v=a%20b%26c",
  );
});
