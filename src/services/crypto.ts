import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const envSecret = process.env.APP_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return crypto.createHash("sha256").update(envSecret).digest();
  }

  // Fallback to local persistent machine-secret file in data/.secret
  const dataDir = path.resolve("data");
  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, ".secret");

  if (!fs.existsSync(secretPath)) {
    const randomSecret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretPath, randomSecret, { encoding: "utf8", mode: 0o600 });
    return crypto.createHash("sha256").update(randomSecret).digest();
  }

  const fileSecret = fs.readFileSync(secretPath, "utf8").trim();
  return crypto.createHash("sha256").update(fileSecret).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output format: iv:authTag:encryptedData (hex encoded)
 */
export function encryptText(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string produced by encryptText.
 */
export function decryptText(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Generate a cryptographically secure random state parameter for OAuth 2.0 flows.
 */
export function generateSecureState(): string {
  return crypto.randomBytes(24).toString("base64url");
}
