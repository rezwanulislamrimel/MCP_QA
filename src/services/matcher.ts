import type { Profile } from "../types.js";

export const TARGET_QA_ROLES = [
  "Manual QA Engineer",
  "Junior SQA Engineer",
  "Software QA Engineer",
  "QA Analyst",
  "Software Tester",
  "API Tester",
  "Junior Test Engineer",
  "QA Engineer",
  "SQA Engineer",
  "Test Engineer"
];

const SENIOR_RESTRICTED_TERMS = [
  "senior",
  "sr.",
  "staff qa",
  "principal",
  "qa manager",
  "lead qa",
  "head of qa",
  "director",
  "architect"
];

const JUNIOR_TERMS = [
  "junior",
  "jr.",
  "entry level",
  "entry-level",
  "associate",
  "intern",
  "trainee",
  "0-1 year",
  "0-2 years",
  "1-2 years",
  "1-3 years",
  "graduate"
];

const KNOWN_TECH_KEYWORDS = [
  "manual testing", "test cases", "test scenarios", "test plans",
  "bug reporting", "defect tracking", "jira", "postman", "api testing",
  "regression testing", "smoke testing", "sanity testing", "black box testing",
  "functional testing", "integration testing", "user acceptance testing", "uat",
  "sql", "database testing", "selenium", "cypress", "playwright",
  "automation testing", "git", "github", "sdlc", "stlc", "agile", "scrum",
  "rest api", "json", "python", "javascript", "jmeter", "performance testing",
  "security testing", "ci/cd", "jenkins", "docker", "kubernetes", "aws", "appium", "testrail", "postman collection"
];

export interface MatchAnalysis {
  score: number;
  reasons: string[];
  missingQualifications: string[];
  matchedSkills: string[];
  isEntryLevel: boolean;
  isSeniorDisallowed: boolean;
}

export function analyzeJobMatch(
  title: string,
  description: string,
  location: string,
  profile: Profile
): MatchAnalysis {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const fullText = `${titleLower} ${descLower}`;

  const reasons: string[] = [];
  const missingQualifications: string[] = [];
  let score = 0;

  // 1. Title & Role Alignment (0 - 35 points)
  const userPreferred = profile.preferredRoles.map(r => r.toLowerCase().trim()).filter(Boolean);
  const matchedUserRole = userPreferred.find(role => titleLower.includes(role));

  if (matchedUserRole) {
    score += 35;
    reasons.push(`Role title matches your preferred target: "${title}"`);
  } else if (TARGET_QA_ROLES.some(role => titleLower.includes(role.toLowerCase()))) {
    score += 25;
    reasons.push(`Title aligns with QA / Software Testing positions: "${title}"`);
  } else if (/\b(qa|sqa|tester|testing|quality assurance)\b/i.test(titleLower)) {
    score += 20;
    reasons.push("Title contains core QA/Testing terminology");
  }

  // 2. Profile Skills Match (0 - 40 points)
  const candidateKeywords = profile.keywords.map(k => k.toLowerCase().trim()).filter(Boolean);
  const matchedSkills: string[] = [];

  for (const kw of candidateKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(fullText)) {
      matchedSkills.push(kw);
    }
  }

  const skillScore = Math.min(40, matchedSkills.length * 6);
  score += skillScore;
  if (matchedSkills.length > 0) {
    reasons.push(`Matched ${matchedSkills.length} verified skill(s) from your profile: ${matchedSkills.slice(0, 7).join(", ")}`);
  }

  // 3. Experience Level Alignment (+15 for junior/entry, -35 for senior)
  const isEntryLevel = JUNIOR_TERMS.some(term => fullText.includes(term));
  if (isEntryLevel) {
    score += 15;
    reasons.push("Explicitly mentions junior, entry-level, or 0-2 years experience");
  }

  const isSeniorDisallowed = SENIOR_RESTRICTED_TERMS.some(term => titleLower.includes(term));
  if (isSeniorDisallowed) {
    score -= 35;
    reasons.push("Role title indicates Senior/Lead/Staff level (score reduced for junior profile)");
  }

  // 4. Location & Remote Compatibility (+10 points)
  const locLower = `${location} ${descLower}`.toLowerCase();
  const isRemote = locLower.includes("remote") || locLower.includes("anywhere") || locLower.includes("work from home");
  const isBangladesh = locLower.includes("bangladesh") || locLower.includes("dhaka");

  if (isBangladesh) {
    score += 10;
    reasons.push("Location is based in Bangladesh");
  } else if (isRemote) {
    score += 10;
    reasons.push("International remote position matching your remote job preferences");
  }

  // 5. Honest Missing Qualifications Detection
  // We scan the job text for common technical keywords that the candidate DOES NOT have in profile.keywords
  for (const tech of KNOWN_TECH_KEYWORDS) {
    if (new RegExp(`\\b${tech}\\b`, "i").test(fullText)) {
      const candidateHasIt = candidateKeywords.some(k => k === tech || k.includes(tech) || tech.includes(k));
      if (!candidateHasIt) {
        // Only include prominent ones
        if (!missingQualifications.includes(tech) && missingQualifications.length < 8) {
          missingQualifications.push(tech);
        }
      }
    }
  }

  // Check for multi-year experience requirements in text
  const expMatch = fullText.match(/\b([3-9]|10)\+?\s*years?\s+(?:of\s+)?experience\b/i);
  if (expMatch && !isEntryLevel) {
    missingQualifications.unshift(`Requires ${expMatch[0]} (you are targeting entry/junior level)`);
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: normalizedScore,
    reasons,
    missingQualifications,
    matchedSkills,
    isEntryLevel,
    isSeniorDisallowed
  };
}
