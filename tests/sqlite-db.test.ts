import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getProfile,
  updateProfile,
  getJobs,
  getJobById,
  insertJob,
  updateJob,
  getJobCounts,
  addAuditLog,
  getAuditLogs
} from "../src/db/repositories.js";
import { encryptText, decryptText } from "../src/services/crypto.js";
import type { Job } from "../src/types.js";

test("SQLite DB - profile update and retrieval persist in database", () => {
  const current = getProfile();
  const testName = `Verified QA Engineer ${Date.now()}`;

  const updated = updateProfile({
    fullName: testName,
    location: "Chittagong, Bangladesh"
  });

  assert.equal(updated.fullName, testName);

  // Retrieve fresh from DB
  const fetched = getProfile();
  assert.equal(fetched.fullName, testName);
  assert.equal(fetched.location, "Chittagong, Bangladesh");

  // Restore current profile
  updateProfile(current);
});

test("SQLite DB - job workflow state transitions update counts correctly", () => {
  const jobId = `job_test_${Date.now()}`;
  const job: Job = {
    id: jobId,
    source: "Manual",
    title: "API Tester",
    company: "Test Automation Co",
    location: "Remote",
    remoteStatus: "Remote",
    url: `https://example.com/jobs/${jobId}`,
    description: "API testing with Postman and Swagger.",
    applicationUrl: `https://example.com/jobs/${jobId}`,
    jobType: "Full-time",
    discoveredAt: new Date().toISOString(),
    matchScore: 90,
    matchReasons: ["API test match"],
    missingQualifications: [],
    status: "New Job",
    updatedAt: new Date().toISOString()
  };

  insertJob(job);
  let fetched = getJobById(jobId);
  assert.ok(fetched);
  assert.equal(fetched?.status, "New Job");

  // Transition to Approved
  updateJob(jobId, { status: "Approved" });
  fetched = getJobById(jobId);
  assert.equal(fetched?.status, "Approved");

  // Check counts
  const counts = getJobCounts();
  assert.ok(counts["Approved"] >= 1);
});

test("Crypto Service - AES-256-GCM encryption and decryption roundtrip", () => {
  const sampleTokenPayload = JSON.stringify({
    accessToken: "ya29.sample_google_access_token_xyz123",
    refreshToken: "1//04_sample_refresh_token_abc789",
    expiresAt: Date.now() + 3600000
  });

  const encrypted = encryptText(sampleTokenPayload);
  assert.notEqual(encrypted, sampleTokenPayload);
  assert.ok(encrypted.includes(":"), "Format should be iv:tag:data");

  const decrypted = decryptText(encrypted);
  assert.equal(decrypted, sampleTokenPayload);

  const parsed = JSON.parse(decrypted);
  assert.equal(parsed.accessToken, "ya29.sample_google_access_token_xyz123");
});

test("Audit Log - records and retrieves workflow security logs", () => {
  const testAction = `action_test_${Date.now()}`;
  addAuditLog(testAction, "test_entity", "123", "Audit log test execution");

  const logs = getAuditLogs(20);
  assert.ok(logs.some(l => l.action === testAction));
});
