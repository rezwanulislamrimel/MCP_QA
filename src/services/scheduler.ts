import cron from "node-cron";
import { discoverJobs } from "./job-discovery.js";
import { tailorApplication } from "./tailor.js";
import { getProfile, getJobs, addAuditLog } from "../db/repositories.js";
import type { DiscoveryResult } from "./job-discovery.js";

const DEFAULT_SCHEDULE = "0 9 * * *"; // Daily at 09:00
const DEFAULT_TIMEZONE = "Asia/Dhaka";

let scheduledTask: cron.ScheduledTask | null = null;
let lastRunAt: string | null = null;
let lastResultSummary: string | null = null;
let lastAddedCount = 0;
let isRunning = false;

export function initScheduler(): void {
  const cronExpression = process.env.DAILY_SCHEDULE || DEFAULT_SCHEDULE;
  const timezone = process.env.TIMEZONE || DEFAULT_TIMEZONE;

  if (!cron.validate(cronExpression)) {
    console.error(`[scheduler] Invalid cron expression: "${cronExpression}". Scheduler disabled.`);
    return;
  }

  // Cancel any existing task
  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(
    cronExpression,
    async () => {
      console.log(`[scheduler] Triggered daily job discovery at ${new Date().toISOString()} (${timezone})`);
      await runDailyDiscoveryAutomation();
    },
    {
      timezone
    }
  );

  console.log(`[scheduler] Daily QA Job Discovery scheduled for "${cronExpression}" in ${timezone}.`);
  addAuditLog("scheduler_initialized", "scheduler", undefined, `Scheduled at ${cronExpression} (${timezone})`);
}

/**
 * Executes full discovery, scoring, and draft preparation.
 * Strictly adheres to the requirement: NEVER automatically sends an email.
 */
export async function runDailyDiscoveryAutomation(): Promise<DiscoveryResult> {
  if (isRunning) {
    console.warn("[scheduler] Discovery is already running. Skipping concurrent trigger.");
    return { added: 0, skippedDuplicates: 0, totalFound: 0, errors: ["Discovery already in progress"] };
  }

  isRunning = true;
  lastRunAt = new Date().toISOString();

  try {
    const profile = getProfile();
    const result = await discoverJobs(profile);
    lastAddedCount = result.added;

    // For newly discovered jobs that strongly match (score >= 60),
    // pre-generate tailored drafts so they are immediately waiting for candidate review
    if (result.added > 0 && profile.cvText) {
      const newJobs = getJobs({ status: "New Job", minScore: 60 });
      for (const job of newJobs.slice(0, 5)) {
        try {
          await tailorApplication(job, profile);
          console.log(`[scheduler] Pre-generated tailored draft for high-match job: ${job.title} at ${job.company}`);
        } catch (err) {
          console.warn(`[scheduler] Could not pre-generate draft for job ${job.id}:`, err);
        }
      }
    }

    lastResultSummary = `Added ${result.added} new jobs, skipped ${result.skippedDuplicates} duplicates, ${result.errors.length} source warning(s).`;
    console.log(`[scheduler] Finished: ${lastResultSummary}`);

    addAuditLog(
      "daily_automation_completed",
      "scheduler",
      undefined,
      lastResultSummary
    );

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastResultSummary = `Failed: ${errorMsg}`;
    console.error("[scheduler] Daily discovery failed:", err);
    addAuditLog("daily_automation_failed", "scheduler", undefined, errorMsg);
    return { added: 0, skippedDuplicates: 0, totalFound: 0, errors: [errorMsg] };
  } finally {
    isRunning = false;
  }
}

export function getSchedulerStatus() {
  const cronExpression = process.env.DAILY_SCHEDULE || DEFAULT_SCHEDULE;
  const timezone = process.env.TIMEZONE || DEFAULT_TIMEZONE;

  return {
    isActive: Boolean(scheduledTask),
    schedule: cronExpression,
    timezone,
    lastRunAt,
    lastResultSummary,
    lastAddedCount,
    isRunning
  };
}
