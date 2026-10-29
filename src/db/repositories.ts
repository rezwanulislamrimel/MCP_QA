import crypto from "node:crypto";
import { getDatabase } from "./sqlite.js";
import type {
  Job,
  Profile,
  CVFile,
  TailoredDocuments,
  EmailAccount,
  EmailLog,
  AuditLog,
  ApplicationStatus,
  EmailProvider,
  JobSource
} from "../types.js";

// Helper to safely parse JSON strings from SQLite
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ==================== PROFILE ====================

export function getProfile(): Profile {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM profile WHERE id = 1").get() as any;
  if (!row) {
    throw new Error("Profile not initialized");
  }
  return {
    fullName: row.full_name,
    email: row.email || "",
    phone: row.phone || "",
    location: row.location || "",
    linkedin: row.linkedin || "",
    github: row.github || "",
    preferredRoles: parseJson<string[]>(row.preferred_roles, []),
    keywords: parseJson<string[]>(row.keywords, []),
    targetLocations: parseJson<string[]>(row.target_locations, []),
    salaryExpectation: row.salary_expectation || "",
    jobPreferences: row.job_preferences || "",
    cvText: row.cv_text || "",
    experiences: parseJson(row.experiences, []),
    education: parseJson(row.education, []),
    projects: parseJson(row.projects, []),
    minimumMatchScore: Number(row.minimum_match_score) || 35,
    updatedAt: row.updated_at
  };
}

export function updateProfile(p: Partial<Profile>): Profile {
  const db = getDatabase();
  const current = getProfile();
  const updated: Profile = {
    ...current,
    ...p,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE profile SET
      full_name = ?,
      email = ?,
      phone = ?,
      location = ?,
      linkedin = ?,
      github = ?,
      preferred_roles = ?,
      keywords = ?,
      target_locations = ?,
      salary_expectation = ?,
      job_preferences = ?,
      cv_text = ?,
      experiences = ?,
      education = ?,
      projects = ?,
      minimum_match_score = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    updated.fullName,
    updated.email,
    updated.phone,
    updated.location,
    updated.linkedin,
    updated.github,
    JSON.stringify(updated.preferredRoles),
    JSON.stringify(updated.keywords),
    JSON.stringify(updated.targetLocations),
    updated.salaryExpectation || "",
    updated.jobPreferences || "",
    updated.cvText,
    JSON.stringify(updated.experiences),
    JSON.stringify(updated.education),
    JSON.stringify(updated.projects),
    updated.minimumMatchScore,
    updated.updatedAt || new Date().toISOString()
  );

  addAuditLog("profile_update", "profile", "1", `Profile updated for ${updated.fullName}`);
  return updated;
}

// ==================== CV FILES ====================

export function insertCVFile(file: Omit<CVFile, "id" | "uploadedAt" | "isActive">): CVFile {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const cvFile: CVFile = {
    ...file,
    id,
    uploadedAt,
    isActive: true
  };

  db.prepare(`
    INSERT INTO cv_files (id, filename, original_name, mime_type, size, parsed_text, uploaded_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cvFile.id,
    cvFile.filename,
    cvFile.originalName,
    cvFile.mimeType,
    cvFile.size,
    cvFile.parsedText,
    cvFile.uploadedAt,
    cvFile.isActive ? 1 : 0
  );

  addAuditLog("cv_file_uploaded", "cv_file", id, `Uploaded ${cvFile.originalName} (${cvFile.size} bytes)`);
  return cvFile;
}

export function getCVFiles(): CVFile[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM cv_files ORDER BY uploaded_at DESC").all() as any[];
  return rows.map(r => ({
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    mimeType: r.mime_type,
    size: r.size,
    parsedText: r.parsed_text,
    uploadedAt: r.uploaded_at,
    isActive: Boolean(r.is_active)
  }));
}

export function getCVFileById(id: string): CVFile | null {
  const db = getDatabase();
  const r = db.prepare("SELECT * FROM cv_files WHERE id = ?").get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    mimeType: r.mime_type,
    size: r.size,
    parsedText: r.parsed_text,
    uploadedAt: r.uploaded_at,
    isActive: Boolean(r.is_active)
  };
}

export function deleteCVFile(id: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM cv_files WHERE id = ?").run(id);
  addAuditLog("cv_file_deleted", "cv_file", id, "CV file deleted");
}

// ==================== JOBS ====================

function mapJobRow(r: any): Job {
  return {
    id: r.id,
    source: r.source as JobSource,
    title: r.title,
    company: r.company,
    location: r.location,
    remoteStatus: r.remote_status,
    url: r.url,
    description: r.description,
    requirements: r.requirements || "",
    applicationUrl: r.application_url,
    applicationEmail: r.application_email || undefined,
    applicationEmailSource: r.application_email_source || undefined,
    jobType: r.job_type,
    discoveredAt: r.discovered_at,
    matchScore: r.match_score,
    matchReasons: parseJson<string[]>(r.match_reasons, []),
    missingQualifications: parseJson<string[]>(r.missing_qualifications, []),
    status: r.status as ApplicationStatus,
    tailoredSummary: r.tailored_summary || undefined,
    coverLetter: r.cover_letter || undefined,
    tailoredCvText: r.tailored_cv_text || undefined,
    tailoredCvPdfPath: r.tailored_cv_pdf_path || undefined,
    tailoredCvDocxPath: r.tailored_cv_docx_path || undefined,
    coverLetterPdfPath: r.cover_letter_pdf_path || undefined,
    coverLetterDocxPath: r.cover_letter_docx_path || undefined,
    changesExplanation: r.changes_explanation || undefined,
    notes: r.notes || undefined,
    appliedAt: r.applied_at || undefined,
    updatedAt: r.updated_at
  };
}

export interface JobFilter {
  status?: ApplicationStatus | "all";
  source?: JobSource | "all";
  minScore?: number;
  search?: string;
  remoteOnly?: boolean;
}

export function getJobs(filter?: JobFilter): Job[] {
  const db = getDatabase();
  let sql = "SELECT * FROM jobs WHERE 1=1";
  const params: any[] = [];

  if (filter?.status && filter.status !== "all") {
    sql += " AND status = ?";
    params.push(filter.status);
  }
  if (filter?.source && filter.source !== "all") {
    sql += " AND source = ?";
    params.push(filter.source);
  }
  if (typeof filter?.minScore === "number") {
    sql += " AND match_score >= ?";
    params.push(filter.minScore);
  }
  if (filter?.remoteOnly) {
    sql += " AND (remote_status = 'Remote' OR location LIKE '%Remote%')";
  }
  if (filter?.search?.trim()) {
    const term = `%${filter.search.trim().toLowerCase()}%`;
    sql += " AND (LOWER(title) LIKE ? OR LOWER(company) LIKE ? OR LOWER(location) LIKE ? OR LOWER(description) LIKE ?)";
    params.push(term, term, term, term);
  }

  sql += " ORDER BY match_score DESC, discovered_at DESC";
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(mapJobRow);
}

export function getJobById(id: string): Job | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any;
  return row ? mapJobRow(row) : null;
}

export function getJobByUrl(url: string): Job | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM jobs WHERE url = ?").get(url) as any;
  return row ? mapJobRow(row) : null;
}

export function insertJob(job: Job): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO jobs (
      id, source, title, company, location, remote_status, url, description,
      requirements, application_url, application_email, application_email_source,
      job_type, discovered_at, match_score, match_reasons, missing_qualifications,
      status, tailored_summary, cover_letter, tailored_cv_text, tailored_cv_pdf_path,
      tailored_cv_docx_path, cover_letter_pdf_path, cover_letter_docx_path,
      changes_explanation, notes, applied_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    job.id,
    job.source,
    job.title,
    job.company,
    job.location,
    job.remoteStatus,
    job.url,
    job.description,
    job.requirements || "",
    job.applicationUrl,
    job.applicationEmail || null,
    job.applicationEmailSource || null,
    job.jobType,
    job.discoveredAt,
    job.matchScore,
    JSON.stringify(job.matchReasons),
    JSON.stringify(job.missingQualifications),
    job.status,
    job.tailoredSummary || null,
    job.coverLetter || null,
    job.tailoredCvText || null,
    job.tailoredCvPdfPath || null,
    job.tailoredCvDocxPath || null,
    job.coverLetterPdfPath || null,
    job.coverLetterDocxPath || null,
    job.changesExplanation || null,
    job.notes || null,
    job.appliedAt || null,
    job.updatedAt
  );

  addAuditLog("job_created", "job", job.id, `Discovered/added ${job.title} at ${job.company}`);
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const db = getDatabase();
  const current = getJobById(id);
  if (!current) throw new Error(`Job not found: ${id}`);

  const updated: Job = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE jobs SET
      source = ?,
      title = ?,
      company = ?,
      location = ?,
      remote_status = ?,
      url = ?,
      description = ?,
      requirements = ?,
      application_url = ?,
      application_email = ?,
      application_email_source = ?,
      job_type = ?,
      match_score = ?,
      match_reasons = ?,
      missing_qualifications = ?,
      status = ?,
      tailored_summary = ?,
      cover_letter = ?,
      tailored_cv_text = ?,
      tailored_cv_pdf_path = ?,
      tailored_cv_docx_path = ?,
      cover_letter_pdf_path = ?,
      cover_letter_docx_path = ?,
      changes_explanation = ?,
      notes = ?,
      applied_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    updated.source,
    updated.title,
    updated.company,
    updated.location,
    updated.remoteStatus,
    updated.url,
    updated.description,
    updated.requirements || "",
    updated.applicationUrl,
    updated.applicationEmail || null,
    updated.applicationEmailSource || null,
    updated.jobType,
    updated.matchScore,
    JSON.stringify(updated.matchReasons),
    JSON.stringify(updated.missingQualifications),
    updated.status,
    updated.tailoredSummary || null,
    updated.coverLetter || null,
    updated.tailoredCvText || null,
    updated.tailoredCvPdfPath || null,
    updated.tailoredCvDocxPath || null,
    updated.coverLetterPdfPath || null,
    updated.coverLetterDocxPath || null,
    updated.changesExplanation || null,
    updated.notes || null,
    updated.appliedAt || null,
    updated.updatedAt,
    id
  );

  if (patch.status && patch.status !== current.status) {
    addAuditLog("job_status_change", "job", id, `Status changed from ${current.status} to ${patch.status}`);
  }

  return updated;
}

export function deleteJob(id: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  addAuditLog("job_deleted", "job", id, `Job ${id} deleted`);
}

export function getJobCounts(): Record<ApplicationStatus | "total", number> {
  const db = getDatabase();
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM jobs GROUP BY status").all() as any[];
  const counts: Record<string, number> = {
    "New Job": 0,
    "Match Analysis Complete": 0,
    "CV Draft Ready": 0,
    "Cover Letter Ready": 0,
    "Awaiting Review": 0,
    "Approved": 0,
    "Email Ready to Send": 0,
    "Email Sent": 0,
    "Applied Manually": 0,
    "Rejected": 0,
    "Failed": 0,
    total: 0
  };

  let total = 0;
  for (const r of rows) {
    counts[r.status] = r.count;
    total += r.count;
  }
  counts.total = total;
  return counts as Record<ApplicationStatus | "total", number>;
}

// ==================== TAILORED DOCUMENTS ====================

export function saveTailoredDocuments(docs: Omit<TailoredDocuments, "id" | "createdAt" | "updatedAt">): TailoredDocuments {
  const db = getDatabase();
  const existing = db.prepare("SELECT id FROM tailored_documents WHERE job_id = ?").get(docs.jobId) as any;
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE tailored_documents SET
        tailored_summary = ?,
        cover_letter = ?,
        tailored_cv_text = ?,
        tailored_cv_pdf_path = ?,
        tailored_cv_docx_path = ?,
        cover_letter_pdf_path = ?,
        cover_letter_docx_path = ?,
        changes_explanation = ?,
        missing_qualifications = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      docs.tailoredSummary,
      docs.coverLetter,
      docs.tailoredCvText,
      docs.tailoredCvPdfPath || null,
      docs.tailoredCvDocxPath || null,
      docs.coverLetterPdfPath || null,
      docs.coverLetterDocxPath || null,
      docs.changesExplanation,
      JSON.stringify(docs.missingQualifications),
      now,
      existing.id
    );

    return {
      id: existing.id,
      ...docs,
      createdAt: now,
      updatedAt: now
    };
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO tailored_documents (
        id, job_id, tailored_summary, cover_letter, tailored_cv_text,
        tailored_cv_pdf_path, tailored_cv_docx_path, cover_letter_pdf_path,
        cover_letter_docx_path, changes_explanation, missing_qualifications,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `).run(
      id,
      docs.jobId,
      docs.tailoredSummary,
      docs.coverLetter,
      docs.tailoredCvText,
      docs.tailoredCvPdfPath || null,
      docs.tailoredCvDocxPath || null,
      docs.coverLetterPdfPath || null,
      docs.coverLetterDocxPath || null,
      docs.changesExplanation,
      JSON.stringify(docs.missingQualifications),
      now,
      now
    );

    addAuditLog("tailored_docs_created", "tailored_documents", id, `Created tailored documents for job ${docs.jobId}`);

    return {
      id,
      ...docs,
      createdAt: now,
      updatedAt: now
    };
  }
}

export function getTailoredDocuments(jobId: string): TailoredDocuments | null {
  const db = getDatabase();
  const r = db.prepare("SELECT * FROM tailored_documents WHERE job_id = ?").get(jobId) as any;
  if (!r) return null;
  return {
    id: r.id,
    jobId: r.job_id,
    tailoredSummary: r.tailored_summary,
    coverLetter: r.cover_letter,
    tailoredCvText: r.tailored_cv_text,
    tailoredCvPdfPath: r.tailored_cv_pdf_path || undefined,
    tailoredCvDocxPath: r.tailored_cv_docx_path || undefined,
    coverLetterPdfPath: r.cover_letter_pdf_path || undefined,
    coverLetterDocxPath: r.cover_letter_docx_path || undefined,
    changesExplanation: r.changes_explanation,
    missingQualifications: parseJson<string[]>(r.missing_qualifications, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// ==================== EMAIL ACCOUNTS ====================

export function getEmailAccount(provider: EmailProvider): EmailAccount | null {
  const db = getDatabase();
  const r = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(provider) as any;
  if (!r) return null;
  return {
    id: r.id as EmailProvider,
    provider: r.provider as EmailProvider,
    emailAddress: r.email_address,
    displayName: r.display_name || undefined,
    encryptedTokens: r.encrypted_tokens,
    status: r.status,
    lastConnectedAt: r.last_connected_at || undefined,
    lastError: r.last_error || undefined
  };
}

export function getAllEmailAccounts(): EmailAccount[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM email_accounts").all() as any[];
  return rows.map(r => ({
    id: r.id as EmailProvider,
    provider: r.provider as EmailProvider,
    emailAddress: r.email_address,
    displayName: r.display_name || undefined,
    encryptedTokens: r.encrypted_tokens,
    status: r.status,
    lastConnectedAt: r.last_connected_at || undefined,
    lastError: r.last_error || undefined
  }));
}

export function saveEmailAccount(acc: EmailAccount): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO email_accounts (id, provider, email_address, display_name, encrypted_tokens, status, last_connected_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email_address = excluded.email_address,
      display_name = excluded.display_name,
      encrypted_tokens = excluded.encrypted_tokens,
      status = excluded.status,
      last_connected_at = excluded.last_connected_at,
      last_error = excluded.last_error
  `).run(
    acc.id,
    acc.provider,
    acc.emailAddress,
    acc.displayName || null,
    acc.encryptedTokens,
    acc.status,
    acc.lastConnectedAt || new Date().toISOString(),
    acc.lastError || null
  );

  addAuditLog("email_account_connected", "email_account", acc.provider, `Connected ${acc.provider} account (${acc.emailAddress})`);
}

export function deleteEmailAccount(provider: EmailProvider): void {
  const db = getDatabase();
  db.prepare("DELETE FROM email_accounts WHERE id = ?").run(provider);
  addAuditLog("email_account_disconnected", "email_account", provider, `Disconnected ${provider} account`);
}

// ==================== EMAIL LOGS & OAUTH STATES ====================

export function insertEmailLog(log: Omit<EmailLog, "id" | "sentAt">): EmailLog {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  const fullLog: EmailLog = {
    ...log,
    id,
    sentAt
  };

  db.prepare(`
    INSERT INTO email_logs (id, job_id, provider, sender_email, recipient_email, subject, body, attachments, message_id, status, error_message, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fullLog.id,
    fullLog.jobId,
    fullLog.provider,
    fullLog.senderEmail,
    fullLog.recipientEmail,
    fullLog.subject,
    fullLog.body,
    JSON.stringify(fullLog.attachments),
    fullLog.messageId || null,
    fullLog.status,
    fullLog.errorMessage || null,
    fullLog.sentAt
  );

  addAuditLog(
    fullLog.status === "sent" ? "email_sent" : "email_failed",
    "email_log",
    id,
    `Email to ${fullLog.recipientEmail} via ${fullLog.provider}: ${fullLog.status}${fullLog.errorMessage ? ` (${fullLog.errorMessage})` : ""}`
  );

  return fullLog;
}

export function getEmailLogs(limit = 100): EmailLog[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT ?").all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    jobId: r.job_id,
    provider: r.provider as EmailProvider,
    senderEmail: r.sender_email,
    recipientEmail: r.recipient_email,
    subject: r.subject,
    body: r.body,
    attachments: parseJson(r.attachments, []),
    messageId: r.message_id || undefined,
    status: r.status,
    errorMessage: r.error_message || undefined,
    sentAt: r.sent_at
  }));
}

export function getEmailLogsForJob(jobId: string): EmailLog[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM email_logs WHERE job_id = ? ORDER BY sent_at DESC").all(jobId) as any[];
  return rows.map(r => ({
    id: r.id,
    jobId: r.job_id,
    provider: r.provider as EmailProvider,
    senderEmail: r.sender_email,
    recipientEmail: r.recipient_email,
    subject: r.subject,
    body: r.body,
    attachments: parseJson(r.attachments, []),
    messageId: r.message_id || undefined,
    status: r.status,
    errorMessage: r.error_message || undefined,
    sentAt: r.sent_at
  }));
}

// OAuth State verification
export function saveOAuthState(state: string, provider: EmailProvider): void {
  const db = getDatabase();
  db.prepare("INSERT INTO oauth_states (state, provider, created_at) VALUES (?, ?, ?)").run(
    state,
    provider,
    Date.now()
  );
}

export function verifyAndConsumeOAuthState(state: string, provider: EmailProvider): boolean {
  const db = getDatabase();
  // Delete expired states (>15 minutes old)
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
  db.prepare("DELETE FROM oauth_states WHERE created_at < ?").run(fifteenMinutesAgo);

  const row = db.prepare("SELECT * FROM oauth_states WHERE state = ? AND provider = ?").get(state, provider) as any;
  if (!row) return false;

  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  return true;
}

// ==================== AUDIT LOGS ====================

export function addAuditLog(action: string, entityType: string, entityId?: string, details?: string): void {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      action,
      entityType,
      entityId || null,
      details || null,
      new Date().toISOString()
    );
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

export function getAuditLogs(limit = 100): AuditLog[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?").all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id || undefined,
    details: r.details || undefined,
    timestamp: r.timestamp
  }));
}
