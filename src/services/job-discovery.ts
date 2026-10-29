import crypto from "node:crypto";
import { analyzeJobMatch, TARGET_QA_ROLES } from "./matcher.js";
import { getJobs, getJobByUrl, insertJob, getProfile, addAuditLog } from "../db/repositories.js";
import type { Job, JobSource, Profile, ApplicationStatus } from "../types.js";

const QA_FILTER_TERMS = [
  "qa", "quality assurance", "software tester", "software testing",
  "manual tester", "sqa", "test analyst", "junior tester", "test engineer",
  "manual testing", "automation tester", "api tester", "test automation",
  "quality analyst", "test lead"
];

/**
 * Normalizes a URL by stripping tracking parameters, trailing slashes, and anchors.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = "";
    // Remove analytics query params
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "source", "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"
    ];
    for (const p of trackingParams) {
      searchParams.delete(p);
    }
    parsed.search = searchParams.toString();
    let clean = parsed.toString();
    if (clean.endsWith("/") && parsed.pathname !== "/") {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Extracts any publicly visible application email address from text.
 */
export function extractApplicationEmail(text: string): { email?: string; source?: string } {
  // Check for explicit "Apply to" or "Send CV to" or mailto:
  const mailtoMatch = text.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (mailtoMatch) {
    return { email: mailtoMatch[1], source: "Extracted from mailto link in description" };
  }

  const applyToMatch = text.match(/(?:apply|send\s*(?:your)?\s*(?:cv|resume)|email\s*(?:your)?\s*(?:cv|resume)|submit\s*(?:to)?)\s*(?:at|to|:)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (applyToMatch) {
    return { email: applyToMatch[1], source: "Extracted from application instructions in description" };
  }

  // General email fallback (excluding typical vendor/example domains)
  const generalMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i);
  if (generalMatch) {
    const candidateEmail = generalMatch[1].toLowerCase();
    const isExcluded = ["example.com", "w3.org", "domain.com", "yourcompany.com", "sentry.io"].some(d => candidateEmail.endsWith(d));
    if (!isExcluded) {
      return { email: generalMatch[1], source: "Extracted from job description text" };
    }
  }

  return {};
}

/**
 * Normalizes raw job data from an API or manual input into a validated Job object.
 */
export function normalizeJobListing(raw: any, source: JobSource, profile: Profile): Job | null {
  const title = String(raw.title ?? raw.position ?? "").trim();
  const company = String(raw.company_name ?? raw.company ?? raw.companyName ?? "Company Not Listed").trim();
  const rawUrl = String(raw.url ?? raw.job_url ?? raw.apply_url ?? "").trim();
  const description = String(raw.description ?? raw.description_text ?? raw.summary ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title || !rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return null;
  }

  const cleanUrl = normalizeUrl(rawUrl);
  const textToCheck = `${title} ${description}`.toLowerCase();

  // Must match at least one QA term
  const isQaRelated = QA_FILTER_TERMS.some(term => textToCheck.includes(term));
  if (!isQaRelated) {
    return null;
  }

  const rawLocation = String(raw.candidate_required_location ?? raw.location ?? raw.job_location ?? "Not specified");
  let remoteStatus: "Remote" | "On-site" | "Hybrid" | "Not specified" = "Not specified";
  const locLower = `${rawLocation} ${description}`.toLowerCase();
  if (locLower.includes("remote") || locLower.includes("work from anywhere")) {
    remoteStatus = "Remote";
  } else if (locLower.includes("hybrid")) {
    remoteStatus = "Hybrid";
  } else if (locLower.includes("on-site") || locLower.includes("onsite")) {
    remoteStatus = "On-site";
  }

  // Extract application email if publicly listed
  const emailInfo = extractApplicationEmail(`${rawUrl} ${description}`);

  // Match analysis against profile
  const analysis = analyzeJobMatch(title, description, rawLocation, profile);

  // Deterministic ID derived from normalized URL
  const id = crypto.createHash("sha256").update(cleanUrl).digest("hex").slice(0, 16);
  const now = new Date().toISOString();

  return {
    id,
    source,
    title,
    company,
    location: rawLocation,
    remoteStatus,
    url: cleanUrl,
    description: description.slice(0, 15000),
    requirements: String(raw.requirements || "").slice(0, 5000),
    applicationUrl: cleanUrl,
    applicationEmail: emailInfo.email || (raw.applicationEmail ? String(raw.applicationEmail).trim() : undefined),
    applicationEmailSource: emailInfo.source || (raw.applicationEmail ? "User specified" : undefined),
    jobType: String(raw.job_type ?? raw.jobType ?? "Full-time"),
    discoveredAt: now,
    matchScore: analysis.score,
    matchReasons: analysis.reasons,
    missingQualifications: analysis.missingQualifications,
    status: "New Job",
    updatedAt: now
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "QA-Job-Agent/1.0 (QA Discovery Assistant; +https://github.com)",
      "Accept": "application/json, text/plain, */*"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

export interface DiscoveryResult {
  added: number;
  skippedDuplicates: number;
  totalFound: number;
  errors: string[];
}

/**
 * Discovers jobs from Remotive, Arbeitnow, and any configured custom feeds.
 */
export async function discoverJobs(customProfile?: Profile): Promise<DiscoveryResult> {
  const profile = customProfile || getProfile();
  const errors: string[] = [];
  let added = 0;
  let skippedDuplicates = 0;
  let totalFound = 0;

  const sources: Array<{ name: JobSource; url: string; extract: (data: any) => any[] }> = [
    {
      name: "Remotive",
      url: "https://remotive.com/api/remote-jobs?category=qa",
      extract: d => d?.jobs || []
    },
    {
      name: "Remotive",
      url: "https://remotive.com/api/remote-jobs?category=software-dev&limit=60",
      extract: d => d?.jobs || []
    },
    {
      name: "Arbeitnow",
      url: "https://www.arbeitnow.com/api/job-board-api",
      extract: d => d?.data || []
    }
  ];

  // Optional custom feed
  const customFeedUrl = process.env.CUSTOM_JOB_FEED_URL?.trim();
  if (customFeedUrl) {
    sources.push({
      name: "CustomFeed",
      url: customFeedUrl,
      extract: d => Array.isArray(d) ? d : (d?.jobs || d?.data || [])
    });
  }

  for (const src of sources) {
    try {
      const data = await fetchWithTimeout(src.url);
      const items = src.extract(data);
      totalFound += items.length;

      for (const raw of items) {
        const job = normalizeJobListing(raw, src.name, profile);
        if (!job) continue;

        // Score filter
        if (job.matchScore < profile.minimumMatchScore) continue;

        // Deduplication check
        const existing = getJobByUrl(job.url);
        if (existing) {
          skippedDuplicates++;
          continue;
        }

        insertJob(job);
        added++;
      }
    } catch (err) {
      const msg = `${src.name} (${src.url}): ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[discovery] Warning: ${msg}`);
      errors.push(msg);
    }
  }

  addAuditLog(
    "job_discovery_run",
    "discovery",
    undefined,
    `Discovery completed: added ${added}, skipped duplicates ${skippedDuplicates}, errors: ${errors.length}`
  );

  return { added, skippedDuplicates, totalFound, errors };
}

/**
 * Manually add a job listing (e.g. from Bdjobs, LinkedIn, or company careers page).
 */
export function addManualJob(input: {
  title: string;
  company: string;
  location: string;
  remoteStatus?: "Remote" | "On-site" | "Hybrid" | "Not specified";
  url: string;
  description: string;
  requirements?: string;
  applicationEmail?: string;
}, customProfile?: Profile): Job {
  const profile = customProfile || getProfile();

  if (!input.title?.trim() || !input.company?.trim() || !input.url?.trim() || !input.description?.trim()) {
    throw new Error("Job title, company, valid URL, and job description are required.");
  }

  const cleanUrl = normalizeUrl(input.url);
  const existing = getJobByUrl(cleanUrl);
  if (existing) {
    throw new Error(`This job URL is already tracked in your database: "${existing.title}" at ${existing.company}`);
  }

  const job = normalizeJobListing({
    ...input,
    url: cleanUrl
  }, "Manual", profile);

  if (!job) {
    throw new Error("Could not parse job listing. Please ensure the URL is valid (http/https) and the description includes QA/testing responsibilities.");
  }

  if (input.remoteStatus) {
    job.remoteStatus = input.remoteStatus;
  }
  if (input.requirements) {
    job.requirements = input.requirements;
  }
  if (input.applicationEmail) {
    job.applicationEmail = input.applicationEmail.trim();
    job.applicationEmailSource = "User specified";
  }

  insertJob(job);
  return job;
}
