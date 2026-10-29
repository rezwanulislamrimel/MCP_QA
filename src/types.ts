export type JobSource = "Remotive" | "Arbeitnow" | "Manual" | "CustomFeed";

export type ApplicationStatus =
  | "New Job"
  | "Match Analysis Complete"
  | "CV Draft Ready"
  | "Cover Letter Ready"
  | "Awaiting Review"
  | "Approved"
  | "Email Ready to Send"
  | "Email Sent"
  | "Applied Manually"
  | "Rejected"
  | "Failed";

export type EmailProvider = "gmail" | "outlook";

export interface ExperienceEntry {
  company: string;
  role: string;
  location?: string;
  startDate: string;
  endDate: string;
  current?: boolean;
  description: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: string;
  grade?: string;
}

export interface ProjectEntry {
  name: string;
  description: string;
  tools?: string;
  url?: string;
}

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  preferredRoles: string[];
  keywords: string[];
  targetLocations: string[];
  salaryExpectation?: string;
  jobPreferences?: string;
  cvText: string;
  experiences: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  minimumMatchScore: number;
  updatedAt?: string;
}

export interface CVFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  parsedText: string;
  uploadedAt: string;
  isActive: boolean;
}

export interface Job {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  remoteStatus: "Remote" | "On-site" | "Hybrid" | "Not specified";
  url: string;
  description: string;
  requirements?: string;
  applicationUrl: string;
  applicationEmail?: string;
  applicationEmailSource?: string;
  jobType: string;
  discoveredAt: string;
  matchScore: number;
  matchReasons: string[];
  missingQualifications: string[];
  status: ApplicationStatus;
  tailoredSummary?: string;
  coverLetter?: string;
  tailoredCvText?: string;
  tailoredCvPdfPath?: string;
  tailoredCvDocxPath?: string;
  coverLetterPdfPath?: string;
  coverLetterDocxPath?: string;
  changesExplanation?: string;
  notes?: string;
  appliedAt?: string;
  updatedAt: string;
}

export interface TailoredDocuments {
  id: string;
  jobId: string;
  tailoredSummary: string;
  coverLetter: string;
  tailoredCvText: string;
  tailoredCvPdfPath?: string;
  tailoredCvDocxPath?: string;
  coverLetterPdfPath?: string;
  coverLetterDocxPath?: string;
  changesExplanation: string;
  missingQualifications: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailAccount {
  id: EmailProvider;
  provider: EmailProvider;
  emailAddress: string;
  displayName?: string;
  encryptedTokens: string; // JSON with accessToken, refreshToken, expiresAt encrypted
  status: "connected" | "disconnected" | "error";
  lastConnectedAt?: string;
  lastError?: string;
}

export interface EmailLog {
  id: string;
  jobId: string;
  provider: EmailProvider;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attachments: Array<{
    name: string;
    path: string;
    size: number;
    mimeType: string;
  }>;
  messageId?: string;
  status: "sent" | "failed";
  errorMessage?: string;
  sentAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  timestamp: string;
}
