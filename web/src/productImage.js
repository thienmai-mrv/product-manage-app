const UPLOAD_IMAGE_PATH = /^\/api\/products\/[^/]+\/image$/;

/**
 * Build the DOM image URL.
 * Upload paths gain a display-only version query. External URLs and empty strings stay unchanged.
 *
 * @param url Stored image URL
 * @param version `updatedAt`, or `createdAt` when the product has not been updated
 * @return URL for an img src
 */
export function displayImageSrc(url, version) {
  if (typeof url !== "string" || !UPLOAD_IMAGE_PATH.test(url)) {
    return url;
  }
  return `${url}?v=${encodeURIComponent(version ?? "")}`;
}
