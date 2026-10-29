import fs from "node:fs";
import path from "node:path";
import { sendGmail } from "./gmail.js";
import { sendOutlook } from "./outlook.js";
import {
  getEmailAccount,
  insertEmailLog,
  updateJob,
  getEmailLogsForJob,
  addAuditLog
} from "../../db/repositories.js";
import type { Job, Profile, EmailProvider, ApplicationStatus } from "../../types.js";

const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

export interface PreparedDraftEmail {
  jobId: string;
  recipient: string;
  recipientSource?: string;
  subject: string;
  body: string;
  suggestedAttachments: Array<{
    name: string;
    path: string;
    size: number;
    mimeType: string;
  }>;
}

/**
 * Prepares default email content and attachment references for a job application.
 */
export function prepareEmailDraft(job: Job, profile: Profile): PreparedDraftEmail {
  const recipient = job.applicationEmail || "";
  const applicantName = profile.fullName || "Applicant";
  const subject = `Job Application: ${job.title} — ${applicantName}`;

  const body = `Dear Hiring Team at ${job.company},

I am writing to formally submit my application for the ${job.title} position.

With verified experience in software quality assurance, test case execution, and defect lifecycle tracking, I am confident in my ability to contribute effectively to your quality engineering goals.

Please find attached my tailored CV and Cover Letter detailing my testing competencies, technical background, and relevant project experience.

Thank you for your consideration, and I look forward to the possibility of discussing this role with you.

Sincerely,

${applicantName}
${profile.email || ""}
${profile.phone || ""}
${profile.location || "Bangladesh"}
${profile.linkedin ? `LinkedIn: ${profile.linkedin}` : ""}
${profile.github ? `GitHub: ${profile.github}` : ""}
`.trim();

  const suggestedAttachments: Array<{ name: string; path: string; size: number; mimeType: string }> = [];

  // Suggest tailored PDF CV if generated, else DOCX
  if (job.tailoredCvPdfPath && fs.existsSync(job.tailoredCvPdfPath)) {
    const stat = fs.statSync(job.tailoredCvPdfPath);
    suggestedAttachments.push({
      name: `${applicantName.replace(/\s+/g, "_")}_CV_${job.company.replace(/\s+/g, "_")}.pdf`,
      path: job.tailoredCvPdfPath,
      size: stat.size,
      mimeType: "application/pdf"
    });
  }

  // Suggest Cover Letter PDF if generated
  if (job.coverLetterPdfPath && fs.existsSync(job.coverLetterPdfPath)) {
    const stat = fs.statSync(job.coverLetterPdfPath);
    suggestedAttachments.push({
      name: `${applicantName.replace(/\s+/g, "_")}_CoverLetter_${job.company.replace(/\s+/g, "_")}.pdf`,
      path: job.coverLetterPdfPath,
      size: stat.size,
      mimeType: "application/pdf"
    });
  }

  return {
    jobId: job.id,
    recipient,
    recipientSource: job.applicationEmailSource,
    subject,
    body,
    suggestedAttachments
  };
}

export interface SendApplicationEmailParams {
  job: Job;
  provider: EmailProvider;
  recipient: string;
  subject: string;
  body: string;
  attachments?: Array<{ name: string; path: string; mimeType: string }>;
  approvedByUser: boolean;
  allowDuplicateSend?: boolean;
}

/**
 * Validates, guards, and sends an application email using the chosen provider.
 * CRITICAL RULE: Requires explicit approvedByUser === true.
 */
export async function sendApplicationEmail(
  params: SendApplicationEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { job, provider, recipient, subject, body, attachments = [], approvedByUser, allowDuplicateSend } = params;

  // 1. Explicit Approval Guard
  if (!approvedByUser) {
    throw new Error("Explicit candidate approval is required before sending any application email. Sending aborted.");
  }

  // 2. Validate Recipient Email
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
    throw new Error("A valid recipient email address is required.");
  }

  // 3. Validate Attachments & File Formats/Sizes
  let totalBytes = 0;
  const verifiedAttachments: Array<{ name: string; path: string; size: number; mimeType: string }> = [];

  for (const att of attachments) {
    if (!fs.existsSync(att.path)) {
      throw new Error(`Attachment file does not exist on disk: ${att.path}`);
    }

    const ext = path.extname(att.name || att.path).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Invalid attachment format (${ext}). Only PDF (.pdf) and Word (.docx) files are supported for job applications.`);
    }

    const stat = fs.statSync(att.path);
    totalBytes += stat.size;
    verifiedAttachments.push({
      name: att.name || path.basename(att.path),
      path: att.path,
      size: stat.size,
      mimeType: att.mimeType || (ext === ".pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    });
  }

  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(`Total attachment size (${(totalBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum permitted email size (25MB).`);
  }

  // 4. Check Account Connection
  const account = getEmailAccount(provider);
  if (!account || account.status !== "connected") {
    throw new Error(`Your ${provider === "gmail" ? "Gmail" : "Outlook"} account is not connected. Please connect it first under Email Accounts.`);
  }

  // 5. Prevent Accidental Duplicate Sends
  const previousSends = getEmailLogsForJob(job.id);
  const alreadySentToRecipient = previousSends.find(l => l.status === "sent" && l.recipientEmail.toLowerCase() === recipient.trim().toLowerCase());

  if (alreadySentToRecipient && !allowDuplicateSend) {
    throw new Error(`An application email was already sent to ${recipient} on ${new Date(alreadySentToRecipient.sentAt).toLocaleString()}. To send again, confirm re-sending.`);
  }

  // 6. Execute Send via Provider
  try {
    let result: { messageId: string };

    if (provider === "gmail") {
      result = await sendGmail({
        to: recipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
        attachments: verifiedAttachments
      });
    } else if (provider === "outlook") {
      result = await sendOutlook({
        to: recipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
        attachments: verifiedAttachments
      });
    } else {
      throw new Error(`Unsupported email provider: ${provider}`);
    }

    // 7. Log Success
    insertEmailLog({
      jobId: job.id,
      provider,
      senderEmail: account.emailAddress,
      recipientEmail: recipient.trim(),
      subject: subject.trim(),
      body: body.trim(),
      attachments: verifiedAttachments,
      messageId: result.messageId,
      status: "sent"
    });

    // 8. Update Job Status to "Email Sent"
    updateJob(job.id, {
      status: "Email Sent",
      appliedAt: new Date().toISOString()
    });

    addAuditLog(
      "application_email_sent",
      "job",
      job.id,
      `Application email sent to ${recipient} via ${provider}. Message ID: ${result.messageId}`
    );

    return { success: true, messageId: result.messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Log failure
    insertEmailLog({
      jobId: job.id,
      provider,
      senderEmail: account.emailAddress,
      recipientEmail: recipient.trim(),
      subject: subject.trim(),
      body: body.trim(),
      attachments: verifiedAttachments,
      status: "failed",
      errorMessage: errorMsg
    });

    updateJob(job.id, {
      status: "Failed"
    });

    addAuditLog(
      "application_email_failed",
      "job",
      job.id,
      `Failed to send email to ${recipient} via ${provider}: ${errorMsg}`
    );

    return { success: false, error: errorMsg };
  }
}
