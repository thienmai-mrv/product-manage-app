/**
 * Shared loading spinner and label.
 *
 * @param props.label Text read with the icon
 * @return Loading status
 */
export default function LoadingState({ label }) {
  return (
    <p className="message loading-state" role="status">
      <span className="loading-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 9 9" />
        </svg>
      </span>
      {label}
    </p>
  );
}
