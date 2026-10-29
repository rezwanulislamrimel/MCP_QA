// Backward-compatibility wrapper delegating to modern job discovery service
export {
  discoverJobs,
  addManualJob,
  normalizeUrl,
  extractApplicationEmail,
  normalizeJobListing
} from "./services/job-discovery.js";
