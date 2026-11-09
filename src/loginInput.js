const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Create an HTTP-style error.
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
 * Read a trimmed string field. Any other type counts as empty.
 *
 * @param value Raw field
 * @return Trimmed text
 */
function trimmedField(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Username rule shared by login and bootstrap.
 *
 * @param value Trimmed username
 * @return True when the username is accepted
 */
export function isValidUsername(value) {
  return USERNAME_PATTERN.test(value);
}

/**
 * Email rule shared by login and bootstrap.
 * Trimmed, at most 254 characters, no whitespace, one @, and both sides non-empty.
 *
 * @param value Email text
 * @return True when the email shape is accepted
 */
export function isValidEmail(value) {
  if (typeof value !== "string") {
    return false;
  }
  const email = value.trim();
  if (!email || email.length > 254 || /\s/.test(email)) {
    return false;
  }
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1) {
    return false;
  }
  return true;
}

/**
 * Parse a login JSON body into one username or email lookup plus a trimmed password.
 *
 * @param body Parsed JSON value
 * @return Lookup kind, identifier, and password
 */
export function parseLoginBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "Body must be a JSON object");
  }
  const username = trimmedField(body.username);
  const email = trimmedField(body.email);
  const account = trimmedField(body.account);
  const provided = [username, email, account].filter((value) => value.length > 0);
  if (provided.length === 0) {
    throw httpError(400, "Username or email is required");
  }
  if (provided.length > 1) {
    throw httpError(400, "Provide one username or email");
  }

  let lookup = "username";
  let value = username;
  if (email) {
    lookup = "email";
    value = email;
  } else if (account) {
    if (account.includes("@")) {
      lookup = "email";
      value = account;
    } else {
      lookup = "username";
      value = account;
    }
  }

  if (lookup === "username" && !isValidUsername(value)) {
    throw httpError(400, "Username is invalid");
  }
  if (lookup === "email" && !isValidEmail(value)) {
    throw httpError(400, "Email is invalid");
  }
  if (typeof body.password !== "string" || body.password.trim() === "") {
    throw httpError(400, "Password is required");
  }
  return { lookup, value, password: body.password.trim() };
}
