import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeJobMatch } from "../src/services/matcher.js";
import type { Profile } from "../src/types.js";

const mockProfile: Profile = {
  fullName: "Test Applicant",
  email: "test@example.com",
  phone: "+8801700000000",
  location: "Dhaka, Bangladesh",
  linkedin: "https://linkedin.com/in/test",
  github: "https://github.com/test",
  preferredRoles: ["Manual QA Engineer", "Junior SQA Engineer", "Software Tester"],
  keywords: ["manual testing", "test cases", "jira", "postman", "api testing", "regression testing", "sql"],
  targetLocations: ["Bangladesh", "Remote"],
  salaryExpectation: "",
  cvText: "Test CV",
  experiences: [],
  education: [],
  projects: [],
  minimumMatchScore: 35
};

test("Matcher - awards high score for preferred QA title, verified skills, and junior level", () => {
  const title = "Junior SQA Engineer";
  const desc = "We are seeking a Junior SQA Engineer to execute manual testing and create test cases. Tools: Jira, Postman, SQL. 0-1 year experience.";
  const loc = "Dhaka, Bangladesh";

  const result = analyzeJobMatch(title, desc, loc, mockProfile);

  assert.ok(result.score >= 70, `Expected score >= 70, got ${result.score}`);
  assert.ok(result.reasons.some(r => r.includes("preferred target")));
  assert.ok(result.reasons.some(r => r.includes("junior, entry-level")));
  assert.ok(result.matchedSkills.includes("manual testing"));
  assert.ok(result.matchedSkills.includes("postman"));
  assert.ok(result.matchedSkills.includes("jira"));
});

test("Matcher - penalizes senior roles for junior candidate profile", () => {
  const title = "Senior Lead QA Architect";
  const desc = "Seeking a Senior QA Lead with 8+ years experience leading teams in automation.";
  const loc = "Remote";

  const result = analyzeJobMatch(title, desc, loc, mockProfile);

  assert.ok(result.isSeniorDisallowed);
  assert.ok(result.reasons.some(r => r.includes("Senior/Lead/Staff")));
  // Should honestly flag missing 8+ years experience
  assert.ok(result.missingQualifications.some(m => m.includes("years experience")));
});

test("Matcher - identifies honest missing requirements without hallucinating", () => {
  const title = "QA Analyst";
  const desc = "Looking for a QA Analyst with manual testing, Postman, Docker, Kubernetes, and Cypress experience.";
  const loc = "Remote";

  const result = analyzeJobMatch(title, desc, loc, mockProfile);

  // Profile does NOT have Docker, Kubernetes, or Cypress
  assert.ok(result.missingQualifications.includes("docker"));
  assert.ok(result.missingQualifications.includes("kubernetes"));
  assert.ok(result.missingQualifications.includes("cypress"));

  // Profile DOES have Postman and Manual Testing, so they should NOT be in missingQualifications
  assert.ok(!result.missingQualifications.includes("postman"));
  assert.ok(!result.missingQualifications.includes("manual testing"));
});
