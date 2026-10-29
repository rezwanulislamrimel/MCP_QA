import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { encryptText, decryptText, generateSecureState } from "../crypto.js";
import {
  saveEmailAccount,
  getEmailAccount,
  deleteEmailAccount,
  saveOAuthState,
  verifyAndConsumeOAuthState
} from "../../db/repositories.js";

const GMAIL_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email"
];

function getGmailCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:3030/oauth/gmail/callback";

  return { clientId, clientSecret, redirectUri };
}

export function isGmailConfigured(): boolean {
  const { clientId, clientSecret } = getGmailCredentials();
  return Boolean(clientId && clientSecret);
}

/**
 * Generates Google OAuth2 authorization URL with state CSRF protection.
 */
export function getGmailAuthUrl(): string {
  const { clientId, redirectUri } = getGmailCredentials();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured in .env. Please see setup instructions.");
  }

  const state = generateSecureState();
  saveOAuthState(state, "gmail");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });

  return `${GMAIL_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Handles callback from Google OAuth2 redirect.
 */
export async function handleGmailCallback(code: string, state: string): Promise<{ email: string }> {
  const isValidState = verifyAndConsumeOAuthState(state, "gmail");
  if (!isValidState) {
    throw new Error("Invalid or expired OAuth state parameter. Please try connecting your account again.");
  }

  const { clientId, clientSecret, redirectUri } = getGmailCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials missing in server environment.");
  }

  const tokenResponse = await fetch(GMAIL_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(`Google token exchange failed: ${tokenData.error_description || tokenData.error || "Unknown error"}`);
  }

  // Get user profile email
  const profileResponse = await fetch(GMAIL_PROFILE_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profileData = await profileResponse.json();
  if (!profileResponse.ok || !profileData.emailAddress) {
    throw new Error("Failed to fetch Gmail user profile.");
  }

  const emailAddress = profileData.emailAddress;
  const tokenPayload = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000
  };

  saveEmailAccount({
    id: "gmail",
    provider: "gmail",
    emailAddress,
    displayName: `Gmail (${emailAddress})`,
    encryptedTokens: encryptText(JSON.stringify(tokenPayload)),
    status: "connected",
    lastConnectedAt: new Date().toISOString()
  });

  return { email: emailAddress };
}

/**
 * Retrieves valid access token, automatically refreshing if expired.
 */
export async function getValidGmailAccessToken(): Promise<string> {
  const account = getEmailAccount("gmail");
  if (!account || account.status !== "connected") {
    throw new Error("Gmail account is not connected.");
  }

  const tokenPayload = JSON.parse(decryptText(account.encryptedTokens));
  // Check if token expires within 2 minutes
  if (Date.now() < tokenPayload.expiresAt - 120 * 1000) {
    return tokenPayload.accessToken;
  }

  if (!tokenPayload.refreshToken) {
    throw new Error("No refresh token available for Gmail. Please reconnect your account.");
  }

  const { clientId, clientSecret } = getGmailCredentials();
  const refreshResponse = await fetch(GMAIL_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId || "",
      client_secret: clientSecret || "",
      refresh_token: tokenPayload.refreshToken,
      grant_type: "refresh_token"
    })
  });

  const refreshData = await refreshResponse.json();
  if (!refreshResponse.ok || !refreshData.access_token) {
    saveEmailAccount({
      ...account,
      status: "error",
      lastError: `Token refresh failed: ${refreshData.error_description || refreshData.error}`
    });
    throw new Error(`Failed to refresh Gmail access token: ${refreshData.error_description || refreshData.error}`);
  }

  const updatedPayload = {
    accessToken: refreshData.access_token,
    refreshToken: refreshData.refresh_token || tokenPayload.refreshToken,
    expiresAt: Date.now() + (refreshData.expires_in || 3600) * 1000
  };

  saveEmailAccount({
    ...account,
    encryptedTokens: encryptText(JSON.stringify(updatedPayload)),
    status: "connected"
  });

  return updatedPayload.accessToken;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ name: string; path: string; mimeType: string }>;
}

/**
 * Sends an email via official Gmail API using RFC 2822 MIME format.
 */
export async function sendGmail(options: SendMailOptions): Promise<{ messageId: string }> {
  const account = getEmailAccount("gmail");
  if (!account) throw new Error("Gmail account not found.");

  const accessToken = await getValidGmailAccessToken();
  const boundary = `====boundary_${crypto.randomBytes(12).toString("hex")}====`;

  let mime = "";
  mime += `From: ${account.emailAddress}\r\n`;
  mime += `To: ${options.to}\r\n`;
  mime += `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString("base64")}?=\r\n`;
  mime += `Date: ${new Date().toUTCString()}\r\n`;
  mime += `Message-ID: <${crypto.randomUUID()}@qa-job-agent.local>\r\n`;
  mime += `MIME-Version: 1.0\r\n`;
  mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  // Body part
  mime += `--${boundary}\r\n`;
  mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
  mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
  mime += `${options.body}\r\n\r\n`;

  // Attachments
  if (options.attachments && options.attachments.length > 0) {
    for (const att of options.attachments) {
      if (!fs.existsSync(att.path)) {
        throw new Error(`Attachment file not found: ${att.path}`);
      }
      const fileBytes = fs.readFileSync(att.path);
      const base64Content = fileBytes.toString("base64");

      mime += `--${boundary}\r\n`;
      mime += `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${att.name}"\r\n`;
      mime += `Content-Disposition: attachment; filename="${att.name}"\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
      mime += `${base64Content.match(/.{1,76}/g)?.join("\r\n") || base64Content}\r\n\r\n`;
    }
  }

  mime += `--${boundary}--\r\n`;

  // Base64url encoding required by Gmail API
  const rawBase64Url = Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: rawBase64Url })
  });

  const data = await response.json();
  if (!response.ok || !data.id) {
    throw new Error(`Gmail API send failed (HTTP ${response.status}): ${data.error?.message || JSON.stringify(data)}`);
  }

  return { messageId: data.id };
}

/**
 * Disconnects Gmail account and attempts token revocation.
 */
export async function disconnectGmail(): Promise<void> {
  const account = getEmailAccount("gmail");
  if (account) {
    try {
      const tokenPayload = JSON.parse(decryptText(account.encryptedTokens));
      if (tokenPayload.accessToken) {
        await fetch(`${GMAIL_REVOKE_ENDPOINT}?token=${tokenPayload.accessToken}`, { method: "POST" });
      }
    } catch (e) {
      console.warn("[gmail] Revoke error during disconnect (ignored):", e);
    }
    deleteEmailAccount("gmail");
  }
}
