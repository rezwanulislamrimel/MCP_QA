import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  getProfile,
  updateProfile,
  getJobs,
  getJobById,
  updateJob,
  getJobCounts,
  getCVFiles,
  getCVFileById,
  insertCVFile,
  deleteCVFile,
  getAllEmailAccounts,
  getEmailAccount,
  getEmailLogs,
  getAuditLogs
} from "./db/repositories.js";

import { discoverJobs, addManualJob } from "./services/job-discovery.js";
import { tailorApplication } from "./services/tailor.js";
import { extractTextFromFile, parseCvTextToProfile } from "./services/cv-parser.js";
import { initScheduler, getSchedulerStatus, runDailyDiscoveryAutomation } from "./services/scheduler.js";
import {
  getGmailAuthUrl,
  handleGmailCallback,
  disconnectGmail
} from "./services/email/gmail.js";
import {
  getOutlookAuthUrl,
  handleOutlookCallback,
  disconnectOutlook
} from "./services/email/outlook.js";
import {
  sendApplicationEmail,
  prepareEmailDraft
} from "./services/email/sender.js";

import {
  renderOverviewPage,
  renderJobMatchesPage,
  renderProfilePage,
  renderCvLibraryPage,
  renderCvViewPage,
  renderDraftsPage,
  renderEmailAccountsPage,
  renderHistoryPage,
  renderSettingsPage,
  renderJobDetailPage,
  renderAddJobPage
} from "./ui/templates.js";
import type { ApplicationStatus, EmailProvider, JobSource } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 3030);

// Middleware
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

// Configure Multer for CV file uploads (10MB limit, disk storage)
const uploadsDir = path.resolve("uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ==================== OVERVIEW ROUTE ====================

app.get("/", (_req, res) => {
  const counts = getJobCounts();
  const recentJobs = getJobs({ status: "all" });
  const profile = getProfile();
  const accounts = getAllEmailAccounts();
  const noticeMessage = _req.query.notice ? String(_req.query.notice) : undefined;
  const noticeType = _req.query.noticeType === "error" ? "danger" : "success";

  res.send(renderOverviewPage(
    counts,
    recentJobs,
    profile,
    accounts,
    noticeMessage ? { type: noticeType, message: noticeMessage } : undefined
  ));
});

// ==================== JOB MATCHES ROUTES ====================

app.get("/jobs", (req, res) => {
  const statusParam = req.query.status ? String(req.query.status) : "all";
  const sourceParam = req.query.source ? String(req.query.source) : "all";
  const searchParam = req.query.search ? String(req.query.search) : undefined;
  const remoteOnly = req.query.remote === "true";

  const jobs = getJobs({
    status: statusParam === "all" ? undefined : (statusParam as ApplicationStatus),
    source: sourceParam === "all" ? undefined : (sourceParam as JobSource),
    search: searchParam,
    remoteOnly
  });

  res.send(renderJobMatchesPage(jobs, {
    status: statusParam,
    source: sourceParam,
    search: searchParam,
    remoteOnly
  }));
});

app.get("/job/:id", (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) {
    return res.status(404).send("Job listing not found.");
  }

  const profile = getProfile();
  const emailAccounts = getAllEmailAccounts();
  const errorMsg = req.query.error ? String(req.query.error) : undefined;

  res.send(renderJobDetailPage(job, profile, emailAccounts, errorMsg));
});

app.post("/job/:id/tailor", async (req, res) => {
  try {
    const job = getJobById(req.params.id);
    if (!job) return res.status(404).send("Job not found");

    const profile = getProfile();
    await tailorApplication(job, profile);
    res.redirect(`/job/${job.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/job/${req.params.id}?error=${encodeURIComponent(msg)}`);
  }
});

app.post("/job/:id/status", (req, res) => {
  try {
    const status = String(req.body.status) as ApplicationStatus;
    updateJob(req.params.id, { status });
    res.redirect(`/job/${req.params.id}`);
  } catch (err) {
    res.redirect(`/job/${req.params.id}?error=${encodeURIComponent(String(err))}`);
  }
});

app.post("/job/:id/update-email", (req, res) => {
  try {
    const email = String(req.body.applicationEmail || "").trim();
    if (!email) throw new Error("Please enter a valid email address.");

    updateJob(req.params.id, {
      applicationEmail: email,
      applicationEmailSource: "User specified"
    });

    res.redirect(`/job/${req.params.id}`);
  } catch (err) {
    res.redirect(`/job/${req.params.id}?error=${encodeURIComponent(String(err))}`);
  }
});

// ==================== EMAIL SENDING WORKFLOW ROUTE ====================

app.post("/job/:id/send-email", async (req, res) => {
  try {
    const job = getJobById(req.params.id);
    if (!job) throw new Error("Job not found.");

    const provider = String(req.body.provider) as EmailProvider;
    const recipient = String(req.body.recipient || "").trim();
    const subject = String(req.body.subject || "").trim();
    const body = String(req.body.body || "").trim();
    const approvedByUser = req.body.approvedByUser === "true";

    if (!approvedByUser) {
      throw new Error("You must explicitly check the approval box to confirm sending this email.");
    }

    // Assemble requested attachments
    const attachments: Array<{ name: string; path: string; mimeType: string }> = [];
    const profile = getProfile();
    const safeCandidateName = (profile.fullName || "Candidate").replace(/\s+/g, "_");
    const safeCompanyName = job.company.replace(/\s+/g, "_");

    if (req.body.attachCvPdf === "1" && job.tailoredCvPdfPath && fs.existsSync(job.tailoredCvPdfPath)) {
      attachments.push({
        name: `${safeCandidateName}_CV_${safeCompanyName}.pdf`,
        path: job.tailoredCvPdfPath,
        mimeType: "application/pdf"
      });
    }

    if (req.body.attachLetterPdf === "1" && job.coverLetterPdfPath && fs.existsSync(job.coverLetterPdfPath)) {
      attachments.push({
        name: `${safeCandidateName}_CoverLetter_${safeCompanyName}.pdf`,
        path: job.coverLetterPdfPath,
        mimeType: "application/pdf"
      });
    }

    const sendResult = await sendApplicationEmail({
      job,
      provider,
      recipient,
      subject,
      body,
      attachments,
      approvedByUser: true,
      allowDuplicateSend: req.body.allowDuplicateSend === "true"
    });

    if (!sendResult.success) {
      return res.redirect(`/job/${job.id}?error=${encodeURIComponent(sendResult.error || "Failed to send email.")}`);
    }

    res.redirect(`/?notice=${encodeURIComponent(`Application email successfully sent to ${recipient} via ${provider.toUpperCase()}!`)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/job/${req.params.id}?error=${encodeURIComponent(msg)}`);
  }
});

// ==================== DOCUMENT DOWNLOAD ROUTES ====================

app.get("/download/:id/:fileType", (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) return res.status(404).send("Job not found");

  const { fileType } = req.params;
  let targetPath: string | undefined;
  let downloadName = "document";

  if (fileType === "cv-pdf") {
    targetPath = job.tailoredCvPdfPath;
    downloadName = `${job.company}-Tailored-CV.pdf`;
  } else if (fileType === "cv-docx") {
    targetPath = job.tailoredCvDocxPath;
    downloadName = `${job.company}-Tailored-CV.docx`;
  } else if (fileType === "letter-pdf") {
    targetPath = job.coverLetterPdfPath;
    downloadName = `${job.company}-Cover-Letter.pdf`;
  } else if (fileType === "letter-docx") {
    targetPath = job.coverLetterDocxPath;
    downloadName = `${job.company}-Cover-Letter.docx`;
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(404).send("Requested document has not been generated yet or was removed.");
  }

  res.download(targetPath, downloadName);
});

// ==================== CANDIDATE PROFILE ROUTES ====================

app.get("/profile", (_req, res) => {
  res.send(renderProfilePage(getProfile()));
});

app.post("/profile", (req, res) => {
  try {
    const schema = z.object({
      fullName: z.string().min(1, "Full name is required"),
      email: z.string().email("Valid email is required"),
      phone: z.string().optional().default(""),
      location: z.string().optional().default(""),
      linkedin: z.string().optional().default(""),
      github: z.string().optional().default(""),
      preferredRoles: z.string().default(""),
      keywords: z.string().default(""),
      targetLocations: z.string().optional().default(""),
      salaryExpectation: z.string().optional().default(""),
      minimumMatchScore: z.coerce.number().min(0).max(100).default(35),
      cvText: z.string().min(10, "CV text must contain at least 10 characters")
    });

    const parsed = schema.parse(req.body);

    updateProfile({
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone,
      location: parsed.location,
      linkedin: parsed.linkedin,
      github: parsed.github,
      preferredRoles: parsed.preferredRoles.split(",").map(s => s.trim()).filter(Boolean),
      keywords: parsed.keywords.split(",").map(s => s.trim()).filter(Boolean),
      targetLocations: parsed.targetLocations.split(",").map(s => s.trim()).filter(Boolean),
      salaryExpectation: parsed.salaryExpectation,
      minimumMatchScore: parsed.minimumMatchScore,
      cvText: parsed.cvText
    });

    res.redirect("/profile");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).send(`Invalid profile data: ${msg}`);
  }
});

// ==================== CV LIBRARY & EXTRACTION ROUTES ====================

app.get("/cv-library", (req, res) => {
  const files = getCVFiles();
  const notice = req.query.notice ? String(req.query.notice) : undefined;
  res.send(renderCvLibraryPage(files, undefined, notice));
});

app.post("/cv-library/upload", upload.single("cvFile"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Please select a file to upload.");

    const buffer = fs.readFileSync(req.file.path);
    const extractedText = await extractTextFromFile(buffer, req.file.originalname, req.file.mimetype);
    const parsedResult = parseCvTextToProfile(extractedText);

    const savedFile = insertCVFile({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      parsedText: extractedText
    });

    const allFiles = getCVFiles();
    res.send(renderCvLibraryPage(allFiles, {
      id: savedFile.id,
      originalName: req.file.originalname,
      extracted: parsedResult.extractedProfile
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).send(`CV Upload & Extraction Error: ${msg} <br><br><a href="/cv-library">Return to CV Library</a>`);
  }
});

app.post("/cv-library/confirm", (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim();
    const phone = String(req.body.phone || "").trim();
    const location = String(req.body.location || "").trim();
    const linkedin = String(req.body.linkedin || "").trim();
    const github = String(req.body.github || "").trim();
    const preferredRoles = String(req.body.preferredRoles || "").split(",").map(s => s.trim()).filter(Boolean);
    const keywords = String(req.body.keywords || "").split(",").map(s => s.trim()).filter(Boolean);
    const cvText = String(req.body.cvText || "").trim();

    // Re-parse structured sections from confirmed cvText so experiences/education/projects are saved
    const parsed = parseCvTextToProfile(cvText);

    updateProfile({
      fullName: fullName || undefined,
      email: email || undefined,
      phone: phone || undefined,
      location: location || undefined,
      linkedin: linkedin || undefined,
      github: github || undefined,
      preferredRoles: preferredRoles.length > 0 ? preferredRoles : undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      cvText: cvText || undefined,
      experiences: parsed.extractedProfile.experiences?.length ? parsed.extractedProfile.experiences : undefined,
      education: parsed.extractedProfile.education?.length ? parsed.extractedProfile.education : undefined,
      projects: parsed.extractedProfile.projects?.length ? parsed.extractedProfile.projects : undefined
    });

    res.redirect("/profile");
  } catch (err) {
    res.status(400).send(`Error updating profile: ${String(err)}`);
  }
});

app.post("/cv-library/:id/activate", (req, res) => {
  try {
    const file = getCVFileById(req.params.id);
    if (!file) return res.status(404).send("CV file not found");

    const parsed = parseCvTextToProfile(file.parsedText);
    const p = parsed.extractedProfile;

    updateProfile({
      fullName: p.fullName || undefined,
      email: p.email || undefined,
      phone: p.phone || undefined,
      location: p.location || undefined,
      linkedin: p.linkedin || undefined,
      github: p.github || undefined,
      preferredRoles: p.preferredRoles?.length ? p.preferredRoles : undefined,
      keywords: p.keywords?.length ? p.keywords : undefined,
      cvText: file.parsedText,
      experiences: p.experiences,
      education: p.education,
      projects: p.projects
    });

    res.redirect(`/cv-library?notice=${encodeURIComponent(`Active profile successfully populated from ${file.originalName}!`)}`);
  } catch (err) {
    res.status(400).send(`Error activating CV: ${String(err)}`);
  }
});

app.get("/cv-library/:id/view", (req, res) => {
  const file = getCVFileById(req.params.id);
  if (!file) return res.status(404).send("CV file not found");
  res.send(renderCvViewPage(file));
});

app.post("/cv-library/:id/delete", (req, res) => {
  deleteCVFile(req.params.id);
  res.redirect("/cv-library");
});

// ==================== DRAFTS ROUTE ====================

app.get("/drafts", (_req, res) => {
  const allJobs = getJobs();
  const draftJobs = allJobs.filter(j => j.tailoredCvText || j.coverLetter);
  res.send(renderDraftsPage(draftJobs));
});

// ==================== EMAIL ACCOUNTS & OAUTH ROUTES ====================

app.get("/accounts", (req, res) => {
  const accounts = getAllEmailAccounts();
  const notice = req.query.notice ? String(req.query.notice) : undefined;
  res.send(renderEmailAccountsPage(accounts, notice));
});

// Gmail OAuth routes
app.get("/oauth/gmail/connect", (_req, res) => {
  try {
    const authUrl = getGmailAuthUrl();
    res.redirect(authUrl);
  } catch (err) {
    res.status(400).send(`Gmail OAuth Error: ${String(err)} <br><br><a href="/accounts">Back</a>`);
  }
});

app.get("/oauth/gmail/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) throw new Error("Authorization code or state missing from Google callback.");

    const { email } = await handleGmailCallback(code, state);
    res.redirect(`/accounts?notice=${encodeURIComponent(`Gmail account (${email}) connected successfully!`)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/accounts?notice=${encodeURIComponent(`Gmail authentication error: ${msg}`)}`);
  }
});

app.post("/oauth/gmail/disconnect", async (_req, res) => {
  await disconnectGmail();
  res.redirect("/accounts?notice=Gmail+account+disconnected.");
});

// Microsoft Outlook OAuth routes
app.get("/oauth/outlook/connect", (_req, res) => {
  try {
    const authUrl = getOutlookAuthUrl();
    res.redirect(authUrl);
  } catch (err) {
    res.status(400).send(`Outlook OAuth Error: ${String(err)} <br><br><a href="/accounts">Back</a>`);
  }
});

app.get("/oauth/outlook/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) throw new Error("Authorization code or state missing from Microsoft callback.");

    const { email } = await handleOutlookCallback(code, state);
    res.redirect(`/accounts?notice=${encodeURIComponent(`Outlook account (${email}) connected successfully!`)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/accounts?notice=${encodeURIComponent(`Outlook authentication error: ${msg}`)}`);
  }
});

app.post("/oauth/outlook/disconnect", (_req, res) => {
  disconnectOutlook();
  res.redirect("/accounts?notice=Outlook+account+disconnected.");
});

// ==================== APPLICATION HISTORY & AUDIT ====================

app.get("/history", (_req, res) => {
  const emailLogs = getEmailLogs(100);
  const auditLogs = getAuditLogs(100);
  res.send(renderHistoryPage(emailLogs, auditLogs));
});

// ==================== SETTINGS & SCHEDULER ====================

app.get("/settings", (_req, res) => {
  const status = getSchedulerStatus();
  res.send(renderSettingsPage(status));
});

// ==================== DISCOVERY & MANUAL JOB ROUTES ====================

app.post("/discover", async (_req, res) => {
  try {
    const result = await discoverJobs();
    const notice = `Discovery complete: Added ${result.added} new jobs. Skipped ${result.skippedDuplicates} duplicates.${result.errors.length ? ` (${result.errors.length} source warning)` : ""}`;
    res.redirect(`/?notice=${encodeURIComponent(notice)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/?notice=${encodeURIComponent(`Discovery error: ${msg}`)}&noticeType=error`);
  }
});

app.get("/add-job", (req, res) => {
  const errorMsg = req.query.error ? String(req.query.error) : undefined;
  res.send(renderAddJobPage(errorMsg));
});

app.post("/add-job", (req, res) => {
  try {
    const job = addManualJob({
      title: String(req.body.title),
      company: String(req.body.company),
      location: String(req.body.location || "Dhaka, Bangladesh"),
      remoteStatus: req.body.remoteStatus ? String(req.body.remoteStatus) as any : undefined,
      url: String(req.body.url),
      description: String(req.body.description),
      applicationEmail: req.body.applicationEmail ? String(req.body.applicationEmail) : undefined
    });

    res.redirect(`/job/${job.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/add-job?error=${encodeURIComponent(msg)}`);
  }
});

const isTestMode = Boolean(
  process.env.NODE_ENV === "test" ||
  process.env.NODE_TEST_CONTEXT ||
  process.execArgv.includes("--test") ||
  process.argv.some(a => a.includes(".test.") || a === "--test")
);

if (!isTestMode) {
  // Start scheduler (09:00 Asia/Dhaka)
  initScheduler();

  // Start HTTP server
  app.listen(port, () => {
    console.log(`AI QA Job Application Agent running at http://localhost:${port}`);
    console.log(`Daily scheduler configured for 09:00 Asia/Dhaka`);
  });
}

export { app };
