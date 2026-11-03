import { useEffect, useState } from "react";

/**
 * Show a product image, or the placeholder when the URL is empty or the image fails.
 * The placeholder is decorative and does not include the product name.
 *
 * @param props.imageUrl Display URL
 * @param props.className Class for a loaded image
 * @param props.placeholderClassName Class for the placeholder
 * @return Image or placeholder
 */
export default function ProductImage({
  imageUrl,
  className = "product-photo",
  placeholderClassName = "product-placeholder",
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (!imageUrl || failed) {
    return (
      <svg className={placeholderClassName} viewBox="0 0 80 80" aria-hidden="true">
        <rect x="16" y="24" width="48" height="36" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16 36h48" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M30 24l10-10 10 10" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
