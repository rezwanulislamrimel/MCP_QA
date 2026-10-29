import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tailorApplication } from "../src/services/tailor.js";
import { insertJob, getJobById } from "../src/db/repositories.js";
import type { Job, Profile } from "../src/types.js";

const sampleProfile: Profile = {
  fullName: "Nafis Fuad",
  email: "nafis.qa@example.com",
  phone: "+8801912345678",
  location: "Dhaka, Bangladesh",
  linkedin: "https://linkedin.com/in/nafisfuad",
  github: "https://github.com/nafisfuad",
  preferredRoles: ["Manual QA Engineer", "Junior SQA Engineer"],
  keywords: ["Manual Testing", "Test Cases", "Jira", "Postman", "API Testing", "Regression Testing", "SQL"],
  targetLocations: ["Bangladesh", "Remote"],
  salaryExpectation: "40,000 BDT",
  cvText: "Authentic QA CV for Nafis Fuad with 1 year experience.",
  experiences: [
    {
      company: "Apex Tech Ltd",
      role: "Junior QA Tester",
      location: "Dhaka",
      startDate: "2023",
      endDate: "Present",
      description: "Designed test cases, reported defects in Jira, verified API endpoints with Postman."
    }
  ],
  education: [
    {
      degree: "B.Sc. in Software Engineering",
      institution: "Daffodil International University",
      year: "2023"
    }
  ],
  projects: [
    {
      name: "BugTracker Test Suite",
      description: "Manual test plan and 50+ test cases covering auth, billing, and checkout flows.",
      tools: "Jira, Postman"
    }
  ],
  minimumMatchScore: 35
};

const sampleJob: Job = {
  id: "testjob123",
  source: "Manual",
  title: "Junior SQA Engineer",
  company: "Brain Station 23",
  location: "Dhaka, Bangladesh",
  remoteStatus: "On-site",
  url: "https://example.com/jobs/123",
  description: "Looking for a Junior SQA Engineer to execute manual testing and API testing with Postman. Knowledge of Docker is a plus.",
  applicationUrl: "https://example.com/jobs/123",
  jobType: "Full-time",
  discoveredAt: new Date().toISOString(),
  matchScore: 80,
  matchReasons: ["Preferred role match"],
  missingQualifications: ["docker"],
  status: "New Job",
  updatedAt: new Date().toISOString()
};

test("Tailoring & Export - generates ATS CV, cover letter, and exports PDF & DOCX without inventing facts", async () => {
  if (!getJobById(sampleJob.id)) {
    insertJob(sampleJob);
  }
  const result = await tailorApplication(sampleJob, sampleProfile);

  // 1. Check ATS CV text
  assert.ok(result.tailoredCvText.includes("NAFIS FUAD"));
  assert.ok(result.tailoredCvText.includes("TARGET ROLE: JUNIOR SQA ENGINEER | BRAIN STATION 23"));
  assert.ok(result.tailoredCvText.includes("Apex Tech Ltd"));
  assert.ok(result.tailoredCvText.includes("Daffodil International University"));
  assert.ok(result.tailoredCvText.includes("ATS Integrity Verification"));

  // 2. Check Cover letter
  assert.ok(result.coverLetter.includes("Brain Station 23"));
  assert.ok(result.coverLetter.includes("Junior SQA Engineer"));
  assert.ok(result.coverLetter.includes("Nafis Fuad"));

  // 3. Check Changes explanation
  assert.ok(result.changesExplanation.includes("Role Focus"));
  assert.ok(result.changesExplanation.includes("Fact Integrity"));

  // 4. Check generated file exports on disk
  assert.ok(fs.existsSync(result.tailoredCvPdfPath), "Tailored CV PDF should exist on disk");
  assert.ok(fs.existsSync(result.tailoredCvDocxPath), "Tailored CV DOCX should exist on disk");
  assert.ok(fs.existsSync(result.coverLetterPdfPath), "Cover Letter PDF should exist on disk");
  assert.ok(fs.existsSync(result.coverLetterDocxPath), "Cover Letter DOCX should exist on disk");

  const pdfStat = fs.statSync(result.tailoredCvPdfPath);
  const docxStat = fs.statSync(result.tailoredCvDocxPath);
  assert.ok(pdfStat.size > 1000, `PDF size should be > 1KB, got ${pdfStat.size}`);
  assert.ok(docxStat.size > 1000, `DOCX size should be > 1KB, got ${docxStat.size}`);

  // Verify PDF header magic bytes (%PDF)
  const pdfHeader = Buffer.alloc(4);
  const fd = fs.openSync(result.tailoredCvPdfPath, "r");
  fs.readSync(fd, pdfHeader, 0, 4, 0);
  fs.closeSync(fd);
  assert.equal(pdfHeader.toString(), "%PDF");
});
