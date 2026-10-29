import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sendApplicationEmail } from "../src/services/email/sender.js";
import { saveOAuthState, verifyAndConsumeOAuthState, saveEmailAccount } from "../src/db/repositories.js";
import { encryptText } from "../src/services/crypto.js";
import type { Job } from "../src/types.js";

const mockJob: Job = {
  id: "job_email_guard_test",
  source: "Manual",
  title: "Software QA Engineer",
  company: "Safe Send Corp",
  location: "Dhaka",
  remoteStatus: "On-site",
  url: "https://example.com/jobs/safe-send",
  description: "QA role description",
  applicationUrl: "https://example.com/jobs/safe-send",
  jobType: "Full-time",
  discoveredAt: new Date().toISOString(),
  matchScore: 85,
  matchReasons: ["QA match"],
  missingQualifications: [],
  status: "Approved",
  updatedAt: new Date().toISOString()
};

test("Email Guard - blocks sending when approvedByUser is false", async () => {
  await assert.rejects(
    async () => {
      await sendApplicationEmail({
        job: mockJob,
        provider: "gmail",
        recipient: "hr@safesend.com",
        subject: "QA Application",
        body: "Cover letter text",
        approvedByUser: false // Explicit approval NOT granted
      });
    },
    /Explicit candidate approval is required/i
  );
});

test("Email Guard - rejects invalid attachment extensions", async () => {
  // Create dummy malicious or unsupported file
  const tempScriptPath = path.resolve("uploads", "script.sh");
  fs.writeFileSync(tempScriptPath, "echo 'test'");

  await assert.rejects(
    async () => {
      await sendApplicationEmail({
        job: mockJob,
        provider: "gmail",
        recipient: "hr@safesend.com",
        subject: "QA Application",
        body: "Body",
        attachments: [
          { name: "script.sh", path: tempScriptPath, mimeType: "text/x-shellscript" }
        ],
        approvedByUser: true
      });
    },
    /Only PDF \(\.pdf\) and Word \(\.docx\) files are supported/i
  );

  if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
});

test("OAuth State - protects against CSRF with one-time validation", () => {
  const testState = `state_${Date.now()}`;
  saveOAuthState(testState, "gmail");

  // First verification should pass and consume the state
  const firstCheck = verifyAndConsumeOAuthState(testState, "gmail");
  assert.equal(firstCheck, true, "First verification should succeed");

  // Second verification with the same state should fail (one-time use)
  const secondCheck = verifyAndConsumeOAuthState(testState, "gmail");
  assert.equal(secondCheck, false, "Second verification should fail (already consumed)");

  // Checking mismatched provider should fail
  const testState2 = `state2_${Date.now()}`;
  saveOAuthState(testState2, "gmail");
  const wrongProviderCheck = verifyAndConsumeOAuthState(testState2, "outlook");
  assert.equal(wrongProviderCheck, false, "Mismatched provider should fail");
});
