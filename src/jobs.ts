import crypto from "node:crypto";
import type { Job, JobSource, Profile } from "./types.js";
import { readJobs, writeJobs } from "./store.js";

const QA_TERMS = ["qa", "quality assurance", "software tester", "software testing", "manual tester", "sqa", "test analyst", "junior tester"];
const DISALLOWED_SENIOR_TERMS = ["senior", "staff qa", "principal", "qa manager", "lead qa", "director"];
const INCLUDE_TERMS = ["manual", "qa", "quality assurance", "tester", "testing", "sqa", "test case", "bug", "jira", "postman", "regression", "smoke"];

function scoreJob(title: string, description: string, profile: Profile): { score: number; reasons: string[] } {
  const text = `${title} ${description}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  const titleLower = title.toLowerCase();
  if (profile.preferredRoles.some(role => titleLower.includes(role.toLowerCase()))) {
    score += 35; reasons.push("Title matches a preferred role");
  } else if (QA_TERMS.some(term => titleLower.includes(term))) {
    score += 25; reasons.push("Title is QA/testing-related");
  }
  const matched = profile.keywords.filter(k => k.trim() && text.includes(k.toLowerCase()));
  score += Math.min(45, matched.length * 7);
  if (matched.length) reasons.push(`Matched skills/keywords: ${matched.slice(0, 6).join(", ")}`);
  if (/junior|entry.level|entry level|associate|intern|trainee|0.?1 year|1.?2 years/.test(text)) {
    score += 15; reasons.push("May suit junior/entry-level experience");
  }
  if (DISALLOWED_SENIOR_TERMS.some(term => titleLower.includes(term))) {
    score -= 35; reasons.push("Likely senior/lead role — score reduced");
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function normalize(raw: any, source: JobSource, profile: Profile): Job | null {
  const title = String(raw.title ?? raw.position ?? "").trim();
  const company = String(raw.company_name ?? raw.company ?? raw.companyName ?? "Company not listed").trim();
  const url = String(raw.url ?? raw.job_url ?? raw.apply_url ?? "").trim();
  const description = String(raw.description ?? raw.description_text ?? raw.summary ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!title || !url || !/^https?:\/\//i.test(url)) return null;
  const text = `${title} ${description}`.toLowerCase();
  if (!QA_TERMS.some(term => text.includes(term))) return null;
  const scored = scoreJob(title, description, profile);
  return {
    id: crypto.createHash("sha256").update(url).digest("hex").slice(0, 16),
    source, title, company,
    location: String(raw.candidate_required_location ?? raw.location ?? raw.job_location ?? "Not specified"),
    url, description: description.slice(0, 12000),
    jobType: String(raw.job_type ?? raw.jobType ?? "Not specified"),
    discoveredAt: new Date().toISOString(),
    matchScore: scored.score,
    matchReasons: scored.reasons,
    status: "review"
  };
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { "User-Agent": "QA-Job-Agent/0.1 (personal job discovery)" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Job source returned HTTP ${response.status}: ${url}`);
  return response.json();
}

export async function discoverJobs(profile: Profile): Promise<{ added: number; errors: string[] }> {
  const existing = readJobs();
  const seen = new Set(existing.map(j => j.url));
  const incoming: Job[] = [];
  const errors: string[] = [];

  // Public job-board endpoints. Results are filtered to QA/testing-related titles/descriptions.
  const sources: Array<{ name: JobSource; url: string; parse: (d: any) => any[] }> = [
    { name: "Remotive", url: "https://remotive.com/api/remote-jobs?category=software-dev&limit=100", parse: d => d.jobs ?? [] },
    { name: "Arbeitnow", url: "https://www.arbeitnow.com/api/job-board-api", parse: d => d.data ?? [] }
  ];
  for (const source of sources) {
    try {
      const data = await fetchJson(source.url);
      for (const raw of source.parse(data)) {
        const job = normalize(raw, source.name, profile);
        if (job && !seen.has(job.url) && job.matchScore >= profile.minimumMatchScore) {
          seen.add(job.url); incoming.push(job);
        }
      }
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const customUrl = process.env.CUSTOM_JOB_FEED_URL?.trim();
  if (customUrl) {
    try {
      const data = await fetchJson(customUrl);
      const items = Array.isArray(data) ? data : (data.jobs ?? data.data ?? []);
      for (const raw of items) {
        const job = normalize(raw, "Manual", profile);
        if (job && !seen.has(job.url) && job.matchScore >= profile.minimumMatchScore) {
          seen.add(job.url); incoming.push(job);
        }
      }
    } catch (error) {
      errors.push(`Custom feed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  writeJobs([...incoming, ...existing]);
  return { added: incoming.length, errors };
}

export function addManualJob(input: { title: string; company: string; location: string; url: string; description: string }, profile: Profile): Job {
  const job = normalize(input, "Manual", profile);
  if (!job) throw new Error("Could not parse job. Provide a title, a valid http(s) URL, and a QA/testing-related description.");
  const existing = readJobs();
  if (existing.some(j => j.url === job.url)) throw new Error("This job URL is already in your list.");
  writeJobs([job, ...existing]);
  return job;
}
