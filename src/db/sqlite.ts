import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Job, Profile, ApplicationStatus } from "../types.js";

const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "agent.db");

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  dbInstance = db;

  // Enable WAL mode and 5s busy timeout for reliability and multi-process safety
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  initSchema(db);
  migrateExistingJsonData(db);

  return db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      full_name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      location TEXT DEFAULT '',
      linkedin TEXT DEFAULT '',
      github TEXT DEFAULT '',
      preferred_roles TEXT DEFAULT '[]',
      keywords TEXT DEFAULT '[]',
      target_locations TEXT DEFAULT '[]',
      salary_expectation TEXT DEFAULT '',
      job_preferences TEXT DEFAULT '',
      cv_text TEXT NOT NULL DEFAULT '',
      experiences TEXT DEFAULT '[]',
      education TEXT DEFAULT '[]',
      projects TEXT DEFAULT '[]',
      minimum_match_score INTEGER DEFAULT 35,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cv_files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      parsed_text TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      remote_status TEXT NOT NULL DEFAULT 'Not specified',
      url TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      requirements TEXT DEFAULT '',
      application_url TEXT NOT NULL,
      application_email TEXT,
      application_email_source TEXT,
      job_type TEXT DEFAULT 'Not specified',
      discovered_at TEXT NOT NULL,
      match_score INTEGER NOT NULL DEFAULT 0,
      match_reasons TEXT DEFAULT '[]',
      missing_qualifications TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'New Job',
      tailored_summary TEXT,
      cover_letter TEXT,
      tailored_cv_text TEXT,
      tailored_cv_pdf_path TEXT,
      tailored_cv_docx_path TEXT,
      cover_letter_pdf_path TEXT,
      cover_letter_docx_path TEXT,
      changes_explanation TEXT,
      notes TEXT,
      applied_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tailored_documents (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      tailored_summary TEXT NOT NULL,
      cover_letter TEXT NOT NULL,
      tailored_cv_text TEXT NOT NULL,
      tailored_cv_pdf_path TEXT,
      tailored_cv_docx_path TEXT,
      cover_letter_pdf_path TEXT,
      cover_letter_docx_path TEXT,
      changes_explanation TEXT NOT NULL,
      missing_qualifications TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      email_address TEXT NOT NULL,
      display_name TEXT,
      encrypted_tokens TEXT NOT NULL,
      status TEXT NOT NULL,
      last_connected_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments TEXT NOT NULL DEFAULT '[]',
      message_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );
  `);
}

function migrateExistingJsonData(db: DatabaseSync): void {
  // Check profile table
  const profileRow = db.prepare("SELECT COUNT(*) as count FROM profile").get() as { count: number };
  if (profileRow.count === 0) {
    const profileJsonPath = path.join(dataDir, "profile.json");
    let initialProfile: Profile = {
      fullName: "Your Full Name",
      email: "",
      phone: "",
      location: "Bangladesh",
      linkedin: "",
      github: "",
      cvText: "",
      preferredRoles: ["Manual QA", "Junior SQA Engineer", "Software QA Engineer", "QA Analyst", "Software Tester", "API Tester"],
      keywords: ["manual testing", "test cases", "bug reporting", "Jira", "API testing", "Postman", "regression testing", "smoke testing", "SQL"],
      targetLocations: ["Bangladesh", "Remote"],
      salaryExpectation: "",
      jobPreferences: "Full-time, Remote or Hybrid",
      experiences: [],
      education: [],
      projects: [],
      minimumMatchScore: 35
    };

    if (fs.existsSync(profileJsonPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(profileJsonPath, "utf8"));
        initialProfile = {
          ...initialProfile,
          fullName: raw.fullName || initialProfile.fullName,
          email: raw.email || "",
          phone: raw.phone || "",
          location: raw.location || initialProfile.location,
          linkedin: raw.linkedin || "",
          github: raw.github || "",
          cvText: raw.cvText || "",
          preferredRoles: Array.isArray(raw.preferredRoles) ? raw.preferredRoles : initialProfile.preferredRoles,
          keywords: Array.isArray(raw.keywords) ? raw.keywords : initialProfile.keywords,
          minimumMatchScore: typeof raw.minimumMatchScore === "number" ? raw.minimumMatchScore : 35
        };
      } catch (err) {
        console.warn("[sqlite] Could not parse legacy profile.json:", err);
      }
    }

    const insertProfileStmt = db.prepare(`
      INSERT OR IGNORE INTO profile (
        id, full_name, email, phone, location, linkedin, github,
        preferred_roles, keywords, target_locations, salary_expectation, job_preferences,
        cv_text, experiences, education, projects, minimum_match_score, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    insertProfileStmt.run(
      initialProfile.fullName,
      initialProfile.email,
      initialProfile.phone,
      initialProfile.location,
      initialProfile.linkedin,
      initialProfile.github,
      JSON.stringify(initialProfile.preferredRoles),
      JSON.stringify(initialProfile.keywords),
      JSON.stringify(initialProfile.targetLocations),
      initialProfile.salaryExpectation || "",
      initialProfile.jobPreferences || "",
      initialProfile.cvText,
      JSON.stringify(initialProfile.experiences),
      JSON.stringify(initialProfile.education),
      JSON.stringify(initialProfile.projects),
      initialProfile.minimumMatchScore,
      new Date().toISOString()
    );
  }

  // Check jobs table
  const jobsRow = db.prepare("SELECT COUNT(*) as count FROM jobs").get() as { count: number };
  if (jobsRow.count === 0) {
    const jobsJsonPath = path.join(dataDir, "jobs.json");
    if (fs.existsSync(jobsJsonPath)) {
      try {
        const legacyJobs = JSON.parse(fs.readFileSync(jobsJsonPath, "utf8"));
        if (Array.isArray(legacyJobs) && legacyJobs.length > 0) {
          const insertJobStmt = db.prepare(`
            INSERT OR IGNORE INTO jobs (
              id, source, title, company, location, remote_status, url, description,
              requirements, application_url, application_email, application_email_source,
              job_type, discovered_at, match_score, match_reasons, missing_qualifications,
              status, tailored_summary, cover_letter, tailored_cv_text, notes, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?
            )
          `);

          for (const j of legacyJobs) {
            const statusMap: Record<string, ApplicationStatus> = {
              discovered: "New Job",
              review: "Awaiting Review",
              approved: "Approved",
              applied: "Applied Manually",
              rejected: "Rejected"
            };
            const mappedStatus = statusMap[j.status] || "New Job";
            insertJobStmt.run(
              j.id,
              j.source || "Manual",
              j.title,
              j.company,
              j.location,
              j.location?.toLowerCase().includes("remote") ? "Remote" : "Not specified",
              j.url,
              j.description || "",
              "",
              j.url,
              null,
              null,
              j.jobType || "Not specified",
              j.discoveredAt || new Date().toISOString(),
              j.matchScore || 0,
              JSON.stringify(j.matchReasons || []),
              JSON.stringify([]),
              mappedStatus,
              j.tailoredSummary || null,
              j.coverLetter || null,
              j.cvText || null,
              j.notes || null,
              new Date().toISOString()
            );
          }
        }
      } catch (err) {
        console.warn("[sqlite] Could not parse legacy jobs.json:", err);
      }
    }
  }
}
