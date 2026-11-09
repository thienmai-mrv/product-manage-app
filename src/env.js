import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Read .env into process.env when the shell did not set those variables.
 * Existing process environment values stay in place.
 */
export function loadLocalEnv() {
  const file = path.join(rootDir, ".env");
  if (!fs.existsSync(file)) {
    return;
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Read the Mongo and auth settings used by the local Express server.
 * Secret values stay empty when the process environment does not set them.
 *
 * @return Worker-shaped environment
 */
export function localEnv() {
  return {
    MONGODB_URI: process.env.MONGODB_URI || "",
    MONGODB_DB: process.env.MONGODB_DB || "productmanage",
    SESSION_SECRET: process.env.SESSION_SECRET || "",
    AUTH_BOOTSTRAP_USERNAME: process.env.AUTH_BOOTSTRAP_USERNAME || "",
    AUTH_BOOTSTRAP_EMAIL: process.env.AUTH_BOOTSTRAP_EMAIL || "",
    AUTH_BOOTSTRAP_PASSWORD: process.env.AUTH_BOOTSTRAP_PASSWORD || "",
  };
}
