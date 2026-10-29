// Backward-compatibility wrapper delegating to SQLite repositories
import { getJobs, getProfile, updateProfile, insertJob, updateJob } from "./db/repositories.js";
import type { Job, Profile } from "./types.js";

export function readJobs(): Job[] {
  return getJobs();
}

export function writeJobs(jobs: Job[]): void {
  // When legacy code passes an array of jobs, ensure each job is inserted or updated in SQLite
  for (const job of jobs) {
    try {
      insertJob(job);
    } catch {
      updateJob(job.id, job);
    }
  }
}

export function readProfile(): Profile {
  return getProfile();
}

export function writeProfile(profile: Profile): void {
  updateProfile(profile);
}
