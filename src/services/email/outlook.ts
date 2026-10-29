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

export const OUTLOOK_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Send"
];

function getOutlookCredentials() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI?.trim() || "http://localhost:3030/oauth/outlook/callback";

  return { clientId, clientSecret, tenant, redirectUri };
}

export function isOutlookConfigured(): boolean {
  const { clientId, clientSecret } = getOutlookCredentials();
  return Boolean(clientId && clientSecret);
}

/**
 * Generates Microsoft Entra ID OAuth 2.0 authorization URL.
 */
export function getOutlookAuthUrl(): string {
  const { clientId, tenant, redirectUri } = getOutlookCredentials();
  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID is not configured in .env. Please see setup instructions.");
  }

  const state = generateSecureState();
  saveOAuthState(state, "outlook");

  const authEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
    prompt: "select_account"
  });

  return `${authEndpoint}?${params.toString()}`;
}

/**
 * Handles callback from Microsoft Entra redirect.
 */
export async function handleOutlookCallback(code: string, state: string): Promise<{ email: string }> {
  const isValidState = verifyAndConsumeOAuthState(state, "outlook");
  if (!isValidState) {
    throw new Error("Invalid or expired OAuth state parameter. Please try connecting your account again.");
  }

  const { clientId, clientSecret, tenant, redirectUri } = getOutlookCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials missing in server environment.");
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const tokenResponse = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: OUTLOOK_SCOPES.join(" ")
    })
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(`Microsoft token exchange failed: ${tokenData.error_description || tokenData.error || "Unknown error"}`);
  }

  // Fetch Microsoft Graph user profile
  const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    throw new Error(`Failed to fetch Outlook profile: ${profileData.error?.message || "Unknown error"}`);
  }

  const emailAddress = profileData.mail || profileData.userPrincipalName;
  if (!emailAddress) {
    throw new Error("Could not find an email address on the authenticated Microsoft account.");
  }

  const tokenPayload = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000
  };

  saveEmailAccount({
    id: "outlook",
    provider: "outlook",
    emailAddress,
    displayName: profileData.displayName ? `${profileData.displayName} (${emailAddress})` : `Outlook (${emailAddress})`,
    encryptedTokens: encryptText(JSON.stringify(tokenPayload)),
    status: "connected",
    lastConnectedAt: new Date().toISOString()
  });

  return { email: emailAddress };
}

/**
 * Retrieves valid Microsoft Graph access token, refreshing if necessary.
 */
export async function getValidOutlookAccessToken(): Promise<string> {
  const account = getEmailAccount("outlook");
  if (!account || account.status !== "connected") {
    throw new Error("Outlook account is not connected.");
  }

  const tokenPayload = JSON.parse(decryptText(account.encryptedTokens));
  if (Date.now() < tokenPayload.expiresAt - 120 * 1000) {
    return tokenPayload.accessToken;
  }

  if (!tokenPayload.refreshToken) {
    throw new Error("No refresh token available for Outlook. Please reconnect your account.");
  }

  const { clientId, clientSecret, tenant, redirectUri } = getOutlookCredentials();
  const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const refreshResponse = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId || "",
      client_secret: clientSecret || "",
      refresh_token: tokenPayload.refreshToken,
      redirect_uri: redirectUri,
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPES.join(" ")
    })
  });

  const refreshData = await refreshResponse.json();
  if (!refreshResponse.ok || !refreshData.access_token) {
    saveEmailAccount({
      ...account,
      status: "error",
      lastError: `Token refresh failed: ${refreshData.error_description || refreshData.error}`
    });
    throw new Error(`Failed to refresh Outlook access token: ${refreshData.error_description || refreshData.error}`);
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

export interface SendOutlookMailOptions {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ name: string; path: string; mimeType: string }>;
}

/**
 * Sends an email via official Microsoft Graph API /me/sendMail.
 */
export async function sendOutlook(options: SendOutlookMailOptions): Promise<{ messageId: string }> {
  const account = getEmailAccount("outlook");
  if (!account) throw new Error("Outlook account not found.");

  const accessToken = await getValidOutlookAccessToken();

  const formattedAttachments: any[] = [];
  if (options.attachments && options.attachments.length > 0) {
    for (const att of options.attachments) {
      if (!fs.existsSync(att.path)) {
        throw new Error(`Attachment file not found: ${att.path}`);
      }
      const fileBytes = fs.readFileSync(att.path);
      formattedAttachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name,
        contentType: att.mimeType || "application/octet-stream",
        contentBytes: fileBytes.toString("base64")
      });
    }
  }

  const payload = {
    message: {
      subject: options.subject,
      body: {
        contentType: "Text",
        content: options.body
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to
          }
        }
      ],
      attachments: formattedAttachments
    },
    saveToSentItems: true
  };

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(`Microsoft Graph sendMail failed (HTTP ${response.status}): ${errorDetail}`);
  }

  const generatedId = `outlook_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  return { messageId: generatedId };
}

/**
 * Disconnects Outlook account from local database.
 */
export function disconnectOutlook(): void {
  deleteEmailAccount("outlook");
}
