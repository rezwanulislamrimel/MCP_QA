import type { Job, Profile } from "./types.js";

// Deterministic local tailoring. It does not invent qualifications and clearly flags missing facts.
// An AI-provider integration can be added later, but the base app remains usable without API keys.
export function tailorApplication(job: Job, profile: Profile): Pick<Job, "tailoredSummary" | "coverLetter" | "cvText"> {
  const cv = profile.cvText.trim();
  if (!cv) throw new Error("Please add your current CV text in Profile before generating tailored documents.");
  const description = job.description.toLowerCase();
  const relevant = profile.keywords.filter(k => k && description.includes(k.toLowerCase()));
  const skills = relevant.length ? relevant.slice(0, 8).join(", ") : "manual testing, test case design, defect reporting, and quality assurance";
  const name = profile.fullName || "Applicant";
  const summary = `${name} is applying for ${job.title} at ${job.company}. Focus the application on verified experience relevant to ${skills}. Review the original CV before sending; this summary is a draft, not a claim of qualifications beyond the supplied CV.`;
  const letter = `Dear Hiring Team,

I am writing to apply for the ${job.title} position at ${job.company}. I am interested in contributing to product quality through careful test design, structured execution, clear defect reporting, and collaboration with developers.

Based on the role description, the areas most relevant to highlight from my current CV are ${skills}. I would welcome the opportunity to discuss how my actual experience and current QA skills match your team's needs.

Thank you for your time and consideration.

Sincerely,
${name}
${profile.email || ""}
${profile.phone || ""}`;
  const tailoredCv = `JOB-TARGETED CV DRAFT — ${job.title} | ${job.company}

IMPORTANT: This is a safe draft wrapper, not a rewritten/verified CV. Edit the sections below to reflect only true information before applying.

Candidate: ${name}
Location: ${profile.location}
Email: ${profile.email || "[add email]"}
Phone: ${profile.phone || "[add phone]"}
LinkedIn: ${profile.linkedin || "[add LinkedIn if available]"}
GitHub/Portfolio: ${profile.github || "[add GitHub/portfolio if available]"}

TARGET ROLE
${job.title} — ${job.company}

ROLE-RELEVANT KEYWORDS TO REVIEW
${skills}

CURRENT CV (source of truth)
${cv}

FINAL REVIEW CHECKLIST
- Confirm all dates, employers, education, tools, and achievements are accurate.
- Move only relevant existing experience and skills higher in the CV.
- Do not add skills or experience that you cannot demonstrate.
- Save a final ATS-friendly PDF before submitting.
`;
  return { tailoredSummary: summary, coverLetter: letter, cvText: tailoredCv };
}
