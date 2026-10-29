import fs from "node:fs";
import path from "node:path";
import type { Job, Profile } from "./types.js";

const dataDir = path.resolve("data");
const jobsPath = path.join(dataDir, "jobs.json");
const profilePath = path.join(dataDir, "profile.json");

function ensure() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(jobsPath)) fs.writeFileSync(jobsPath, "[]", "utf8");
  if (!fs.existsSync(profilePath)) {
    const starter: Profile = {
      fullName: "Your Full Name",
      email: "",
      phone: "",
      location: "Bangladesh",
      linkedin: "",
      github: "",
      cvText: "",
      preferredRoles: ["Manual QA", "Junior SQA Engineer", "Software Tester", "QA Analyst"],
      keywords: ["manual testing", "test cases", "bug reporting", "Jira", "API testing", "Postman", "regression testing", "smoke testing"],
      minimumMatchScore: 35
    };
    fs.writeFileSync(profilePath, JSON.stringify(starter, null, 2), "utf8");
  }
}
export function readJobs(): Job[] { ensure(); return JSON.parse(fs.readFileSync(jobsPath, "utf8")) as Job[]; }
export function writeJobs(jobs: Job[]) { ensure(); fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2), "utf8"); }
export function readProfile(): Profile { ensure(); return JSON.parse(fs.readFileSync(profilePath, "utf8")) as Profile; }
export function writeProfile(profile: Profile) { ensure(); fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf8"); }
