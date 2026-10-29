import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { getJobByUrl, getProfile } from "../src/db/repositories.js";

test("Integration - App server responds to health and core UI routes", async () => {
  // Test server routes using mock request / supertest style or direct invocation
  // We can start listening on an ephemeral port or test routes with fetch if listening
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start ephemeral test server");
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // 1. Overview page
    const r1 = await fetch(`${baseUrl}/`);
    assert.equal(r1.status, 200);
    const t1 = await r1.text();
    assert.ok(t1.includes("QA Job Agent"));
    assert.ok(t1.includes("Overview"));

    // 2. Jobs page
    const r2 = await fetch(`${baseUrl}/jobs`);
    assert.equal(r2.status, 200);
    const t2 = await r2.text();
    assert.ok(t2.includes("Job Matches"));

    // 3. Profile page
    const r3 = await fetch(`${baseUrl}/profile`);
    assert.equal(r3.status, 200);
    const t3 = await r3.text();
    assert.ok(t3.includes("Authentic Candidate Profile"));

    // 4. CV Library
    const r4 = await fetch(`${baseUrl}/cv-library`);
    assert.equal(r4.status, 200);

    // 5. Email Accounts
    const r5 = await fetch(`${baseUrl}/accounts`);
    assert.equal(r5.status, 200);
    const t5 = await r5.text();
    assert.ok(t5.includes("Google Gmail"));
    assert.ok(t5.includes("Microsoft Outlook"));

    // 6. Application History
    const r6 = await fetch(`${baseUrl}/history`);
    assert.equal(r6.status, 200);

    // 7. Settings
    const r7 = await fetch(`${baseUrl}/settings`);
    assert.equal(r7.status, 200);
    const t7 = await r7.text();
    assert.ok(t7.includes("Asia/Dhaka"));
  } finally {
    server.close();
  }
});
