/**
 * Draw one table action icon.
 *
 * @param props.name publish, unpublish, edit, delete, in-stock, or out-of-stock
 * @return Decorative SVG
 */
export default function ActionIcon({ name }) {
  const common = {
    className: "action-icon",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  if (name === "publish") {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "unpublish") {
    return (
      <svg {...common}>
        <path d="M4 4l16 16" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.9 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.1 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6.2 7.4C3.7 9.2 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "edit") {
    return (
      <svg {...common}>
        <path d="M4 20h4L18 10l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12.5 7.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "in-stock") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12.5l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "out-of-stock") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 7V5h6v2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 7l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
