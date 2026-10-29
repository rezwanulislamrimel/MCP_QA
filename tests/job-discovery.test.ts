import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrl,
  extractApplicationEmail,
  addManualJob,
  normalizeJobListing
} from "../src/services/job-discovery.js";
import type { Profile } from "../src/types.js";

const testProfile: Profile = {
  fullName: "Tester",
  email: "test@domain.com",
  phone: "123",
  location: "Bangladesh",
  linkedin: "",
  github: "",
  preferredRoles: ["Manual QA", "Software Tester"],
  keywords: ["manual testing", "jira", "postman"],
  targetLocations: ["Bangladesh"],
  salaryExpectation: "",
  cvText: "Tester CV",
  experiences: [],
  education: [],
  projects: [],
  minimumMatchScore: 20
};

test("Discovery - normalizeUrl strips tracking parameters, anchors, and trailing slashes", () => {
  const dirtyUrl = "https://example.com/jobs/qa-engineer/?utm_source=linkedin&utm_medium=feed&ref=job_board#apply";
  const clean = normalizeUrl(dirtyUrl);
  assert.equal(clean, "https://example.com/jobs/qa-engineer");
});

test("Discovery - extractApplicationEmail extracts mailto and explicit apply emails", () => {
  const text1 = "Please send your resume to mailto:careers@company.com before Friday.";
  const res1 = extractApplicationEmail(text1);
  assert.equal(res1.email, "careers@company.com");

  const text2 = "Apply to: hr.jobs@dhakatech.com with your portfolio and CV.";
  const res2 = extractApplicationEmail(text2);
  assert.equal(res2.email, "hr.jobs@dhakatech.com");
});

test("Discovery - normalizeJobListing filters out non-QA positions", () => {
  const devJob = {
    title: "Senior Java Backend Architect",
    company: "Core Systems",
    url: "https://example.com/jobs/java-lead",
    description: "Write microservices and Spring Boot code. No testing mentioned."
  };

  const normalized = normalizeJobListing(devJob, "Manual", testProfile);
  assert.equal(normalized, null, "Should return null for non-QA roles");
});

test("Discovery - manual job addition prevents duplicate URL entries", () => {
  const uniqueUrl = `https://bdjobs.com/test-job-${Date.now()}`;

  const job1 = addManualJob({
    title: "Software Tester",
    company: "Chakri Tech",
    location: "Dhaka, Bangladesh",
    url: uniqueUrl,
    description: "Manual testing and bug reporting with Jira."
  }, testProfile);

  assert.ok(job1.id);
  assert.equal(job1.title, "Software Tester");

  // Attempting to add the same URL again should throw duplicate error
  assert.throws(() => {
    addManualJob({
      title: "Duplicate Job",
      company: "Other",
      location: "Dhaka",
      url: uniqueUrl,
      description: "Testing again"
    }, testProfile);
  }, /already tracked in your database/i);
});
