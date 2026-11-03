/**
 * Pure product image and publish rules.
 * This module does not import mongodb or the store. Both runtimes call it from the store.
 */

export const MAX_IMAGE_BYTES = 1048576;
export const MAX_IMAGE_URL_LENGTH = 2048;
export const MAX_JSON_BODY_BYTES = 2097152;
export const MAX_IMAGE_BASE64_LENGTH = 1398104;

const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const CANONICAL_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Create an HTTP-style error the API layer can turn into a status code.
 *
 * @param status HTTP status
 * @param message Error text
 * @return Error with a status
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Build the stored path for an uploaded product image.
 *
 * @param id Product id
 * @return Upload path
 */
export function uploadImagePath(id) {
  return `/api/products/${encodeURIComponent(id)}/image`;
}

/**
 * Read a publish flag.
 * An omitted value follows `omitted`. A present non-boolean is rejected.
 *
 * @param value Raw published value
 * @param options.omitted `default-true` on create, or `keep` on update
 * @return Boolean to store, or undefined when an update should keep the current value
 */
export function parsePublished(value, { omitted } = {}) {
  if (value === undefined) {
    if (omitted === "default-true") {
      return true;
    }
    if (omitted === "keep") {
      return undefined;
    }
    throw httpError(400, "Published must be true or false");
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw httpError(400, "Published must be true or false");
}

/**
 * Read a stock flag.
 * An omitted value follows `omitted`. A present non-boolean is rejected.
 *
 * @param value Raw inStock value
 * @param options.omitted `default-true` on create, or `keep` on update
 * @return Boolean to store, or undefined when an update should keep the current value
 */
export function parseInStock(value, { omitted } = {}) {
  if (value === undefined) {
    if (omitted === "default-true") {
      return true;
    }
    if (omitted === "keep") {
      return undefined;
    }
    throw httpError(400, "Stock status must be true or false");
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw httpError(400, "Stock status must be true or false");
}

/**
 * Return true when the bytes match the canonical image type.
 * The check stops at the signature. It does not decode the rest of the file.
 *
 * @param contentType Canonical type
 * @param bytes Decoded bytes
 * @return True when the signature matches
 */
function signatureMatches(contentType, bytes) {
  if (contentType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/gif") {
    return bytes.length >= 6
      && bytes[0] === 0x47
      && bytes[1] === 0x49
      && bytes[2] === 0x46
      && bytes[3] === 0x38
      && (bytes[4] === 0x37 || bytes[4] === 0x39)
      && bytes[5] === 0x61;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && bytes[0] === 0x52
      && bytes[1] === 0x49
      && bytes[2] === 0x46
      && bytes[3] === 0x46
      && bytes[8] === 0x57
      && bytes[9] === 0x45
      && bytes[10] === 0x42
      && bytes[11] === 0x50;
  }
  return false;
}

/**
 * Decode a standard base64 image payload.
 *
 * @param imageFile File object from the JSON body
 * @return Bytes and canonical content type
 */
function readImageFile(imageFile) {
  if (!imageFile || typeof imageFile !== "object" || Array.isArray(imageFile)) {
    throw httpError(400, "Image file is invalid");
  }
  const { contentType, dataBase64 } = imageFile;
  if (typeof contentType !== "string" || typeof dataBase64 !== "string") {
    throw httpError(400, "Image file is invalid");
  }
  if (dataBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    throw httpError(400, "Image file must be 1 MB or smaller");
  }
  if (!STANDARD_BASE64.test(dataBase64)) {
    throw httpError(400, "Image file is invalid");
  }
  const decoded = Buffer.from(dataBase64, "base64");
  if (decoded.length === 0) {
    throw httpError(400, "Image file is empty");
  }
  if (decoded.length > MAX_IMAGE_BYTES) {
    throw httpError(400, "Image file must be 1 MB or smaller");
  }
  const canonical = contentType.trim();
  if (!CANONICAL_TYPES.includes(canonical) || !signatureMatches(canonical, decoded)) {
    throw httpError(400, "Image file must be PNG, JPEG, WebP, or GIF");
  }
  return {
    bytes: Uint8Array.from(decoded),
    contentType: canonical,
  };
}

/**
 * Read an external image URL.
 *
 * @param value Trimmed URL
 * @return Trimmed http or https URL
 */
function externalImageUrl(value) {
  if (value.length > MAX_IMAGE_URL_LENGTH) {
    throw httpError(400, "Image URL is too long");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(400, "Image must be an http or https URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw httpError(400, "Image must be an http or https URL");
  }
  return value;
}

/**
 * Resolve a create or update image into empty, external, upload, or keep.
 * Create must not pass `currentImageUrl`, so it cannot return keep.
 *
 * @param input Product body
 * @param context.id Product id
 * @param context.currentImageUrl Stored image URL on update
 * @return Image decision
 */
export function resolveProductImage(input, context) {
  const filePresent = input?.imageFile !== undefined && input?.imageFile !== null;
  const imageUrl = String(input?.imageUrl ?? "").trim();
  if (filePresent && imageUrl) {
    throw httpError(400, "Choose an image file or an image URL, not both");
  }
  if (filePresent) {
    const file = readImageFile(input.imageFile);
    return {
      kind: "upload",
      imageUrl: uploadImagePath(context.id),
      bytes: file.bytes,
      contentType: file.contentType,
    };
  }
  if (!imageUrl) {
    return { kind: "empty", imageUrl: "" };
  }
  const uploadPath = uploadImagePath(context.id);
  if (imageUrl === uploadPath && context.currentImageUrl === uploadPath) {
    return { kind: "keep", imageUrl: uploadPath };
  }
  return { kind: "external", imageUrl: externalImageUrl(imageUrl) };
}
