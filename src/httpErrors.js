const PUBLIC_500 = new Set([
  "MONGODB_URI is not set",
  "SESSION_SECRET is not set",
  "Admin bootstrap configuration is incomplete",
]);

/**
 * Hide unexpected 500 messages. The three configuration sentences stay raw.
 *
 * @param status HTTP status
 * @param message Error text
 * @return Client-facing message
 */
export function clientErrorMessage(status, message) {
  if (status === 500 && !PUBLIC_500.has(message)) {
    return "Request failed";
  }
  return message;
}
