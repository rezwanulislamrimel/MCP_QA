export type JobSource = "Remotive" | "Arbeitnow" | "Manual";
export type ApplicationStatus = "discovered" | "review" | "approved" | "applied" | "rejected";

export interface Job {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  jobType: string;
  discoveredAt: string;
  matchScore: number;
  matchReasons: string[];
  status: ApplicationStatus;
  tailoredSummary?: string;
  coverLetter?: string;
  cvText?: string;
  notes?: string;
}

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  cvText: string;
  preferredRoles: string[];
  keywords: string[];
  minimumMatchScore: number;
}
