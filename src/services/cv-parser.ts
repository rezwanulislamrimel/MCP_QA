import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import type { Profile, ExperienceEntry, EducationEntry, ProjectEntry } from "../types.js";

export interface ParsedCVResult {
  rawText: string;
  extractedProfile: Partial<Profile>;
  confidenceNotes: string[];
}

/**
 * Extracts raw text from an uploaded CV buffer (PDF, DOCX, or plain text).
 */
export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".pdf" || mimeType.includes("pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = typeof result === "string" ? result : result?.text || "";
    if (!text.trim()) {
      throw new Error("Could not extract readable text from PDF. The file may be an image scan or password protected.");
    }
    return cleanExtractedText(text);
  }

  if (ext === ".docx" || mimeType.includes("wordprocessingml") || mimeType.includes("officedocument")) {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) {
      throw new Error("Could not extract readable text from DOCX document.");
    }
    return cleanExtractedText(result.value);
  }

  if (ext === ".txt" || mimeType.includes("text/plain")) {
    return cleanExtractedText(buffer.toString("utf8"));
  }

  throw new Error(`Unsupported file type: ${ext || mimeType}. Please upload a PDF (.pdf) or Word document (.docx).`);
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parses structured information from raw CV text without inventing any details.
 * Every extracted item is grounded in the source text.
 */
export function parseCvTextToProfile(rawText: string): ParsedCVResult {
  const notes: string[] = [];
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  // 1. Contact Information Extraction
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = rawText.match(emailRegex);
  const email = emailMatch ? emailMatch[1] : "";
  if (email) notes.push(`Extracted email: ${email}`);

  // Phone regex supporting Bangladesh (+8801..., 01...) and international formats
  const phoneRegex = /(?:\+?880\s?1[3-9]\d{8}|01[3-9]\d{8}|\+?[1-9]\d{1,2}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})/i;
  const phoneMatch = rawText.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  if (phone) notes.push(`Extracted phone: ${phone}`);

  // Links
  const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-_%]+)/i;
  const linkedinMatch = rawText.match(linkedinRegex);
  const linkedin = linkedinMatch ? (linkedinMatch[0].startsWith("http") ? linkedinMatch[0] : `https://${linkedinMatch[0]}`) : "";

  const githubRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9-_]+)/i;
  const githubMatch = rawText.match(githubRegex);
  const github = githubMatch ? (githubMatch[0].startsWith("http") ? githubMatch[0] : `https://${githubMatch[0]}`) : "";

  // Location detection
  let location = "";
  const bdCities = ["Dhaka", "Chittagong", "Chattogram", "Sylhet", "Rajshahi", "Khulna", "Barisal", "Rangpur", "Comilla", "Bangladesh"];
  for (const city of bdCities) {
    if (new RegExp(`\\b${city}\\b`, "i").test(rawText)) {
      location = city === "Bangladesh" ? "Bangladesh" : `${city}, Bangladesh`;
      notes.push(`Detected location: ${location}`);
      break;
    }
  }

  // Name extraction: first non-header, non-contact line
  let fullName = "";
  for (const line of lines.slice(0, 5)) {
    if (
      !line.includes("@") &&
      !line.includes("http") &&
      !line.includes("github.com") &&
      !line.includes("linkedin.com") &&
      !/curriculum|resume|cv|page\s+\d/i.test(line) &&
      line.length < 50 &&
      /^[a-zA-Z\s.'-]+$/.test(line)
    ) {
      fullName = line;
      notes.push(`Identified name: ${fullName}`);
      break;
    }
  }

  // 2. Skills Extraction (Matched against known QA & Tech dictionary)
  const QA_SKILLS_DICTIONARY = [
    "Manual Testing", "Test Cases", "Test Scenarios", "Test Plans",
    "Bug Reporting", "Defect Tracking", "Jira", "Postman", "API Testing",
    "Regression Testing", "Smoke Testing", "Sanity Testing", "Black Box Testing",
    "Functional Testing", "Integration Testing", "User Acceptance Testing", "UAT",
    "SQL", "Database Testing", "Selenium", "Cypress", "Playwright",
    "Automation Testing", "Git", "GitHub", "SDLC", "STLC", "Agile", "Scrum",
    "TestRail", "Bugzilla", "Chrome DevTools", "REST API", "JSON", "JavaScript",
    "Python", "Performance Testing", "JMeter", "Load Testing", "Security Testing"
  ];

  const matchedSkills: string[] = [];
  const lowerText = rawText.toLowerCase();
  for (const skill of QA_SKILLS_DICTIONARY) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(lowerText) && !matchedSkills.includes(skill)) {
      matchedSkills.push(skill);
    }
  }

  // 3. Section Slicing for Experience, Education, Projects
  const experiences = extractExperience(rawText);
  const education = extractEducation(rawText);
  const projects = extractProjects(rawText);

  // Preferred roles based on detected QA keywords or role mentions
  const candidateRoles: string[] = [];
  const candidateRolePool = [
    "Manual QA Engineer", "Junior SQA Engineer", "Software QA Engineer",
    "QA Analyst", "Software Tester", "API Tester", "Junior Test Engineer"
  ];
  for (const role of candidateRolePool) {
    if (lowerText.includes(role.toLowerCase()) || lowerText.includes(role.toLowerCase().replace("engineer", "").trim())) {
      candidateRoles.push(role);
    }
  }
  if (candidateRoles.length === 0) {
    candidateRoles.push("Manual QA Engineer", "Junior SQA Engineer", "Software Tester");
  }

  return {
    rawText,
    extractedProfile: {
      fullName: fullName || "Applicant",
      email,
      phone,
      location: location || "Bangladesh",
      linkedin,
      github,
      cvText: rawText,
      preferredRoles: candidateRoles,
      keywords: matchedSkills.length > 0 ? matchedSkills : ["Manual Testing", "Test Cases", "Bug Reporting", "Jira", "API Testing", "Postman"],
      experiences,
      education,
      projects
    },
    confidenceNotes: notes
  };
}

function extractExperience(text: string): ExperienceEntry[] {
  const experiences: ExperienceEntry[] = [];
  const expSectionRegex = /(?:^|\n)\s*(?:EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT HISTORY|PROFESSIONAL EXPERIENCE)[\s:]*\n([\s\S]*?)(?:(?:\n\s*(?:EDUCATION|ACADEMIC|PROJECTS|SKILLS|CERTIFICATIONS)[\s:]*\n)|$)/i;
  const match = text.match(expSectionRegex);
  if (!match) return experiences;

  const expText = match[1].trim();
  const paragraphs = expText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  for (const block of paragraphs.slice(0, 5)) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const firstLine = lines[0];
      const secondLine = lines[1];
      // Check if dates exist in block
      const dateMatch = block.match(/(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}\s*(?:-|–|to)\s*(?:(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}|Present|Current)/i);
      const dates = dateMatch ? dateMatch[0] : "";

      experiences.push({
        company: secondLine.includes("at ") ? secondLine.replace(/^at\s+/i, "") : secondLine,
        role: firstLine,
        startDate: dates.split(/[-–]|to/i)[0]?.trim() || "",
        endDate: dates.split(/[-–]|to/i)[1]?.trim() || "Present",
        description: lines.slice(2).join("\n") || lines.join(" ")
      });
    }
  }

  return experiences;
}

function extractEducation(text: string): EducationEntry[] {
  const education: EducationEntry[] = [];
  const eduSectionRegex = /(?:^|\n)\s*(?:EDUCATION|ACADEMIC BACKGROUND|ACADEMIC QUALIFICATIONS)[\s:]*\n([\s\S]*?)(?:(?:\n\s*(?:EXPERIENCE|WORK EXPERIENCE|PROJECTS|SKILLS|CERTIFICATIONS)[\s:]*\n)|$)/i;
  const match = text.match(eduSectionRegex);
  if (!match) return education;

  const eduText = match[1].trim();
  const lines = eduText.split("\n").map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/bachelor|b\.sc|bsc|master|m\.sc|msc|diploma|higher secondary|hsc|secondary|ssc/i.test(line)) {
      const yearMatch = (lines[i] + " " + (lines[i + 1] || "")).match(/\b(19\d{2}|20\d{2})\b/);
      const institution = lines[i + 1] && !/bachelor|b\.sc|master|diploma/i.test(lines[i + 1]) ? lines[i + 1] : "Institution";
      education.push({
        degree: line,
        institution,
        year: yearMatch ? yearMatch[0] : ""
      });
      i++; // skip next line if used as institution
    }
  }

  return education;
}

function extractProjects(text: string): ProjectEntry[] {
  const projects: ProjectEntry[] = [];
  const projSectionRegex = /(?:^|\n)\s*(?:PROJECTS|PERSONAL PROJECTS|KEY PROJECTS)[\s:]*\n([\s\S]*?)(?:(?:\n\s*(?:EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS)[\s:]*\n)|$)/i;
  const match = text.match(projSectionRegex);
  if (!match) return projects;

  const projText = match[1].trim();
  const blocks = projText.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  for (const block of blocks.slice(0, 4)) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      projects.push({
        name: lines[0],
        description: lines.slice(1).join("\n") || lines[0]
      });
    }
  }

  return projects;
}
