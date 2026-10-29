import "dotenv/config";
import express from "express";
import multer from "multer";
import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { addManualJob, discoverJobs } from "./jobs.js";
import { readJobs, readProfile, writeJobs, writeProfile } from "./store.js";
import { tailorApplication } from "./tailor.js";
import type { Job, Profile } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 3030);
const timezone = process.env.TIMEZONE || "Asia/Dhaka";
const schedule = process.env.DAILY_SCHEDULE || "0 9 * * *";
const upload = multer({ dest: "uploads/", limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "2mb" }));

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · QA Job Agent</title><style>
  :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033;background:#f5f7fb}body{margin:0}header{background:#172033;color:white;padding:18px max(18px,calc((100% - 1100px)/2));display:flex;gap:18px;align-items:center;flex-wrap:wrap}header a{color:white;text-decoration:none;font-weight:600}main{max-width:1100px;margin:26px auto;padding:0 16px}.card{background:white;border:1px solid #e0e5ef;border-radius:14px;padding:18px;margin:14px 0;box-shadow:0 2px 8px #17203308}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.muted{color:#5d687c;font-size:14px}.pill{display:inline-block;border-radius:20px;background:#edf2ff;padding:4px 9px;font-size:12px;margin-right:5px}.score{font-weight:800}.btn,button{display:inline-block;border:0;border-radius:8px;padding:10px 13px;background:#2457d6;color:white;text-decoration:none;cursor:pointer;font:inherit;font-weight:600}.secondary{background:#e9edf5;color:#172033}.danger{background:#a22a35}input,textarea,select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd3e1;border-radius:8px;font:inherit;margin:5px 0 12px}label{font-weight:600;font-size:14px}textarea{min-height:140px}h1{font-size:27px}h2{font-size:19px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.notice{padding:12px;border-radius:8px;background:#fff4d7;margin:12px 0}.ok{background:#e4f7eb}.error{background:#ffe5e5}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f8fb;padding:12px;border-radius:8px}.smallform{display:inline}footer{color:#69758a;text-align:center;padding:30px;font-size:13px}a{color:#2457d6} @media(max-width:600px){main{margin:12px auto}header{gap:12px}}</style></head><body><header><strong>QA Job Agent</strong><a href="/">Dashboard</a><a href="/profile">Profile & CV</a><a href="/add-job">Add job</a><a href="/about">How it works</a></header><main>${body}</main><footer>Local-first prototype · Review before submitting · No applications are sent automatically</footer></body></html>`;
}
function page(title: string, body: string) { return layout(title, body); }
function findJob(id: string): Job {
  const job = readJobs().find(j => j.id === id);
  if (!job) throw new Error("Job not found");
  return job;
}
function updateJob(id: string, patch: Partial<Job>) {
  const jobs = readJobs();
  const index = jobs.findIndex(j => j.id === id);
  if (index < 0) throw new Error("Job not found");
  jobs[index] = { ...jobs[index]!, ...patch };
  writeJobs(jobs);
  return jobs[index]!;
}

app.get("/", (_req, res) => {
  const jobs = readJobs();
  const profile = readProfile();
  const counts = ["review", "approved", "applied", "rejected"].map(status => ({ status, count: jobs.filter(j => j.status === status).length }));
  const cards = jobs.slice(0, 100).map(j => `<article class="card"><div class="row"><span class="pill">${esc(j.source)}</span><span class="pill">${esc(j.status)}</span><span class="score">${j.matchScore}% match</span></div><h2><a href="/job/${esc(j.id)}">${esc(j.title)}</a></h2><div>${esc(j.company)} · ${esc(j.location)}</div><p class="muted">${esc(j.description.slice(0, 260))}${j.description.length > 260 ? "…" : ""}</p><div class="muted">${esc(j.matchReasons.join(" · "))}</div><p><a class="btn" href="/job/${esc(j.id)}">Review job</a> <a target="_blank" rel="noopener noreferrer" href="${esc(j.url)}">Open original listing ↗</a></p></article>`).join("");
  res.send(page("Dashboard", `<h1>QA Job Application Dashboard</h1><p class="muted">Daily discovery is scheduled for 09:00 (${esc(timezone)}). Current CV: ${profile.cvText ? "added" : "not added yet"}.</p><div class="grid">${counts.map(c => `<div class="card"><div class="muted">${esc(c.status.toUpperCase())}</div><h1>${c.count}</h1></div>`).join("")}<div class="card"><div class="muted">TOTAL JOBS</div><h1>${jobs.length}</h1></div></div><div class="row"><form method="post" action="/discover"><button>Run job search now</button></form><a class="btn secondary" href="/profile">Set up profile & CV</a></div>${jobs.length ? cards : `<div class="card"><h2>No jobs yet</h2><p>Run job search or add a job URL and description manually. Public feeds may return no relevant junior QA jobs on a given day.</p><a class="btn" href="/add-job">Add first job</a></div>`}`));
});

app.get("/profile", (_req, res) => {
  const p = readProfile();
  res.send(page("Profile", `<h1>Profile & current CV</h1><div class="notice">Paste your existing CV as text first. This prototype does not parse PDF/DOCX files yet. Your profile is stored locally in the project’s <code>data/profile.json</code>.</div><form method="post" action="/profile">
  <label>Full name</label><input name="fullName" required value="${esc(p.fullName)}">
  <label>Email</label><input name="email" type="email" value="${esc(p.email)}">
  <label>Phone</label><input name="phone" value="${esc(p.phone)}">
  <label>Location</label><input name="location" value="${esc(p.location)}">
  <label>LinkedIn URL</label><input name="linkedin" value="${esc(p.linkedin)}">
  <label>GitHub / Portfolio URL</label><input name="github" value="${esc(p.github)}">
  <label>Preferred roles (comma-separated)</label><input name="preferredRoles" value="${esc(p.preferredRoles.join(", "))}">
  <label>Keywords/skills (comma-separated; only skills you actually have)</label><input name="keywords" value="${esc(p.keywords.join(", "))}">
  <label>Minimum match score: <span id="score">${p.minimumMatchScore}</span>%</label><input name="minimumMatchScore" type="range" min="0" max="100" value="${p.minimumMatchScore}" oninput="document.getElementById('score').textContent=this.value">
  <label>Current CV text</label><textarea name="cvText" required placeholder="Paste the text from your existing CV here">${esc(p.cvText)}</textarea>
  <button>Save profile</button></form>`));
});
app.post("/profile", (req, res) => {
  const schema = z.object({
    fullName: z.string().min(1), email: z.string(), phone: z.string(), location: z.string(),
    linkedin: z.string(), github: z.string(), cvText: z.string().min(20),
    preferredRoles: z.string(), keywords: z.string(), minimumMatchScore: z.coerce.number().min(0).max(100)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(page("Invalid profile", `<div class="card error">Please enter your name and at least 20 characters of CV text.</div><a href="/profile">Go back</a>`));
  const v = parsed.data;
  const profile: Profile = { ...v, preferredRoles: v.preferredRoles.split(",").map(s => s.trim()).filter(Boolean), keywords: v.keywords.split(",").map(s => s.trim()).filter(Boolean) };
  writeProfile(profile);
  res.redirect("/");
});

app.get("/add-job", (_req, res) => res.send(page("Add job", `<h1>Add a job manually</h1><p class="muted">Use for Bangladesh company career pages, Bdjobs listings, or any URL not available in the public feeds. Paste the job description so matching can work.</p><form method="post" action="/add-job"><label>Job title</label><input name="title" required><label>Company</label><input name="company" required><label>Location / remote status</label><input name="location" value="Bangladesh / Remote"><label>Job URL</label><input name="url" type="url" required placeholder="https://..."><label>Full job description</label><textarea name="description" required></textarea><button>Add to review queue</button></form>`)));
app.post("/add-job", (req, res) => {
  try {
    addManualJob({ title: String(req.body.title), company: String(req.body.company), location: String(req.body.location), url: String(req.body.url), description: String(req.body.description) }, readProfile());
    res.redirect("/");
  } catch (e) {
    res.status(400).send(page("Could not add job", `<div class="card error">${esc(e instanceof Error ? e.message : String(e))}</div><a href="/add-job">Go back</a>`));
  }
});

app.get("/job/:id", (req, res) => {
  try {
    const j = findJob(req.params.id);
    const p = readProfile();
    const docSection = j.coverLetter ? `<div class="card"><h2>Cover letter draft</h2><pre>${esc(j.coverLetter)}</pre><button class="secondary" onclick="navigator.clipboard.writeText(document.getElementById('cover').innerText)">Copy cover letter</button><div id="cover" hidden>${esc(j.coverLetter)}</div></div><div class="card"><h2>CV draft wrapper</h2><pre>${esc(j.cvText)}</pre><button class="secondary" onclick="navigator.clipboard.writeText(document.getElementById('cv').innerText)">Copy CV draft</button><div id="cv" hidden>${esc(j.cvText)}</div></div>` : "";
    res.send(page(j.title, `<p><a href="/">← Dashboard</a></p><div class="card"><div class="row"><span class="pill">${esc(j.status)}</span><span class="score">${j.matchScore}% match</span></div><h1>${esc(j.title)}</h1><h2>${esc(j.company)}</h2><p>${esc(j.location)} · ${esc(j.jobType)}</p><p><a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">Open original job listing ↗</a></p><h2>Match reasons</h2><ul>${j.matchReasons.map(r => `<li>${esc(r)}</li>`).join("") || "<li>No keyword match reasons recorded</li>"}</ul><h2>Description (source text)</h2><pre>${esc(j.description)}</pre></div>
    <div class="card"><h2>Generate tailored draft</h2><p class="muted">Uses the current CV text and the job description. Review every fact; this version does not use an external AI model or invent experience.</p><form method="post" action="/job/${esc(j.id)}/tailor"><button ${p.cvText.length < 20 ? "disabled" : ""}>Generate CV & cover letter draft</button></form>${p.cvText.length < 20 ? `<p class="muted">First add your CV in <a href="/profile">Profile</a>.</p>` : ""}</div>
    ${docSection}
    <div class="card"><h2>Approval workflow</h2><p>Approval means you have reviewed the job and documents. It does not send the application. Open the official listing and submit there yourself in this MVP.</p><div class="row">
    <form method="post" action="/job/${esc(j.id)}/approve"><button ${!j.coverLetter ? "disabled" : ""}>Approve documents</button></form>
    <form method="post" action="/job/${esc(j.id)}/reject"><button class="danger">Reject job</button></form>
    <form method="post" action="/job/${esc(j.id)}/applied"><button class="secondary">Mark as applied</button></form></div><form method="post" action="/job/${esc(j.id)}/notes"><label>Notes</label><textarea name="notes">${esc(j.notes || "")}</textarea><button class="secondary">Save notes</button></form></div>`));
  } catch (e) { res.status(404).send(page("Not found", `<p>${esc(e instanceof Error ? e.message : String(e))}</p><a href="/">Dashboard</a>`)); }
});
app.post("/job/:id/tailor", (req, res) => {
  try { const j = findJob(req.params.id); const draft = tailorApplication(j, readProfile()); updateJob(j.id, draft); res.redirect(`/job/${j.id}`); }
  catch (e) { res.status(400).send(page("Draft error", `<div class="card error">${esc(e instanceof Error ? e.message : String(e))}</div><a href="/profile">Update profile/CV</a>`)); }
});
app.post("/job/:id/approve", (req, res) => {
  const j = findJob(req.params.id);
  if (!j.coverLetter || !j.cvText) return res.status(400).send(page("Draft required", `<p>Generate documents before approval.</p><a href="/job/${esc(j.id)}">Back</a>`));
  updateJob(j.id, { status: "approved" }); res.redirect(`/job/${j.id}`);
});
app.post("/job/:id/reject", (req, res) => { updateJob(req.params.id, { status: "rejected" }); res.redirect("/"); });
app.post("/job/:id/applied", (req, res) => { updateJob(req.params.id, { status: "applied" }); res.redirect(`/job/${req.params.id}`); });
app.post("/job/:id/notes", (req, res) => { updateJob(req.params.id, { notes: String(req.body.notes || "").slice(0, 5000) }); res.redirect(`/job/${req.params.id}`); });

app.post("/discover", async (_req, res) => {
  const result = await discoverJobs(readProfile());
  const errorNotice = result.errors.length ? `<div class="notice">Some sources failed: ${esc(result.errors.join(" | "))}</div>` : "";
  res.send(page("Search finished", `<div class="card ok"><h1>Job search finished</h1><p>Added ${result.added} new matching jobs.</p>${errorNotice}<a class="btn" href="/">Return to dashboard</a></div>`));
});

app.get("/about", (_req, res) => res.send(page("About", `<h1>How this prototype works</h1><div class="card"><h2>Included now</h2><ul><li>Public remote job discovery from Remotive and Arbeitnow APIs</li><li>Keyword-based QA relevance scoring and URL duplicate detection</li><li>Manual job intake for Bangladesh-specific listings</li><li>Local CV profile, tailored cover-letter draft, CV review wrapper</li><li>Review/approve/reject/status tracking</li><li>Daily 09:00 Asia/Dhaka scheduler</li></ul><h2>Not included yet</h2><ul><li>Direct integration/API for Bdjobs or LinkedIn</li><li>PDF/DOCX CV parsing and export</li><li>AI API-based semantic matching or full CV rewriting</li><li>Automated login, browser form submission, CAPTCHA handling, or email sending</li></ul><div class="notice">This prototype deliberately never submits applications. Approval only changes local status. Submit on the employer's official page yourself, then mark as applied. Later we can add site-specific integrations only where allowed, with an explicit confirmation step before final submission.</div></div>`)));

async function scheduledDiscovery() {
  console.log(`[scheduler] Starting discovery at ${new Date().toISOString()} (${timezone})`);
  try {
    const result = await discoverJobs(readProfile());
    console.log(`[scheduler] Added ${result.added} jobs. ${result.errors.join(" | ")}`);
  } catch (e) { console.error("[scheduler] Discovery failed:", e); }
}
if (cron.validate(schedule)) {
  cron.schedule(schedule, () => { void scheduledDiscovery(); }, { timezone });
  console.log(`[scheduler] Daily job discovery scheduled: "${schedule}" in ${timezone}`);
} else {
  console.error(`Invalid DAILY_SCHEDULE cron expression: ${schedule}`);
}

app.listen(port, () => console.log(`QA Job Agent running at http://localhost:${port}`));
