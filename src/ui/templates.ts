import type {
  Job,
  Profile,
  CVFile,
  EmailAccount,
  EmailLog,
  AuditLog,
  ApplicationStatus,
  EmailProvider
} from "../types.js";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStatusBadgeClass(status: ApplicationStatus): string {
  switch (status) {
    case "New Job": return "badge-new";
    case "Match Analysis Complete": return "badge-info";
    case "CV Draft Ready": return "badge-purple";
    case "Cover Letter Ready": return "badge-purple";
    case "Awaiting Review": return "badge-warning";
    case "Approved": return "badge-success";
    case "Email Ready to Send": return "badge-cyan";
    case "Email Sent": return "badge-success-dark";
    case "Applied Manually": return "badge-blue";
    case "Rejected": return "badge-danger";
    case "Failed": return "badge-danger-dark";
    default: return "badge-neutral";
  }
}

export function baseLayout(title: string, content: string, activeTab: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · AI QA Job Application Assistant</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --border-focus: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --sidebar-w: 240px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      min-height: 100vh;
    }
    /* Sidebar */
    aside {
      width: var(--sidebar-w);
      background: #0f172a;
      color: #cbd5e1;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      border-right: 1px solid #1e293b;
    }
    .brand {
      padding: 24px 20px;
      font-size: 17px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #1e293b;
    }
    .brand-icon {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 14px;
    }
    .nav-links {
      padding: 16px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      color: #94a3b8;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.15s;
    }
    .nav-item:hover {
      background: #1e293b;
      color: #ffffff;
    }
    .nav-item.active {
      background: var(--primary);
      color: #ffffff;
    }
    .nav-footer {
      padding: 16px 20px;
      border-top: 1px solid #1e293b;
      font-size: 12px;
      color: #64748b;
    }
    /* Main Content Area */
    .app-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    header.topbar {
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      padding: 14px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .topbar-title {
      font-size: 18px;
      font-weight: 700;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .content-container {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 28px 32px;
    }
    /* Components */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .card-title {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .stat-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .stat-label { font-size: 13px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-val { font-size: 28px; font-weight: 800; margin-top: 6px; color: var(--text); }
    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: capitalize;
    }
    .badge-new { background: #e0f2fe; color: #0369a1; }
    .badge-info { background: #dbeafe; color: #1d4ed8; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-success-dark { background: #065f46; color: #ecfdf5; }
    .badge-cyan { background: #cffafe; color: #0e7490; }
    .badge-blue { background: #eff6ff; color: #2563eb; }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .badge-danger-dark { background: #7f1d1d; color: #fef2f2; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      border: 1px solid transparent;
      transition: all 0.15s;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary { background: white; border-color: var(--border); color: var(--text); }
    .btn-secondary:hover { background: #f1f5f9; }
    .btn-success { background: #10b981; color: white; }
    .btn-success:hover { background: #059669; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-sm { padding: 6px 12px; font-size: 13px; }
    /* Form controls */
    .form-group { margin-bottom: 16px; }
    label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #334155; }
    input[type="text"], input[type="email"], input[type="url"], input[type="number"], select, textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      color: var(--text);
      background: white;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    textarea { min-height: 120px; line-height: 1.5; }
    .muted { color: var(--text-muted); font-size: 13px; }
    /* Table */
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 12px 14px; font-size: 12px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; border-bottom: 2px solid var(--border); }
    td { padding: 14px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
    tr:hover td { background: #f8fafc; }
    /* Alert / Notice */
    .alert { padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; display: flex; align-items: center; justify-content: space-between; }
    .alert-success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .alert-warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .alert-danger { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .alert-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    /* Code/Pre */
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .score-badge {
      font-weight: 800;
      color: #2563eb;
      background: #eff6ff;
      border: 1px solid #dbeafe;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 13px;
    }
    @media (max-width: 860px) {
      body { flex-direction: column; }
      aside { width: 100%; }
      .grid-2 { grid-template-columns: 1fr; }
      .content-container { padding: 16px; }
    }
  </style>
</head>
<body>
  <aside>
    <div class="brand">
      <div class="brand-icon">QA</div>
      <div>QA Job Agent</div>
    </div>
    <nav class="nav-links">
      <a class="nav-item ${activeTab === "overview" ? "active" : ""}" href="/">
        <span>📊</span> Overview
      </a>
      <a class="nav-item ${activeTab === "jobs" ? "active" : ""}" href="/jobs">
        <span>💼</span> Job Matches
      </a>
      <a class="nav-item ${activeTab === "profile" ? "active" : ""}" href="/profile">
        <span>👤</span> My Profile
      </a>
      <a class="nav-item ${activeTab === "cv-library" ? "active" : ""}" href="/cv-library">
        <span>📄</span> CV Library
      </a>
      <a class="nav-item ${activeTab === "drafts" ? "active" : ""}" href="/drafts">
        <span>✍️</span> Application Drafts
      </a>
      <a class="nav-item ${activeTab === "accounts" ? "active" : ""}" href="/accounts">
        <span>📫</span> Email Accounts
      </a>
      <a class="nav-item ${activeTab === "history" ? "active" : ""}" href="/history">
        <span>📜</span> Application History
      </a>
      <a class="nav-item ${activeTab === "settings" ? "active" : ""}" href="/settings">
        <span>⚙️</span> Settings &amp; Scheduler
      </a>
    </nav>
    <div class="nav-footer">
      <div>Timezone: <strong>Asia/Dhaka</strong></div>
      <div>Scheduled Daily at 09:00</div>
    </div>
  </aside>

  <div class="app-main">
    <header class="topbar">
      <div class="topbar-title">${esc(title)}</div>
      <div class="topbar-actions">
        <a class="btn btn-secondary btn-sm" href="/add-job">+ Add Job Manually</a>
        <form method="post" action="/discover" style="display:inline">
          <button class="btn btn-primary btn-sm">⚡ Run Discovery</button>
        </form>
      </div>
    </header>
    <main class="content-container">
      ${content}
    </main>
  </div>
</body>
</html>`;
}

// ==================== OVERVIEW PAGE ====================

export function renderOverviewPage(
  counts: Record<ApplicationStatus | "total", number>,
  recentJobs: Job[],
  profile: Profile,
  emailAccounts: EmailAccount[],
  notice?: { type: "success" | "warning" | "danger" | "info"; message: string }
): string {
  const alertHtml = notice
    ? `<div class="alert alert-${notice.type}"><span>${esc(notice.message)}</span></div>`
    : "";

  const gmail = emailAccounts.find(a => a.provider === "gmail");
  const outlook = emailAccounts.find(a => a.provider === "outlook");

  const gmailStatus = gmail && gmail.status === "connected"
    ? `<span class="badge badge-success">Connected: ${esc(gmail.emailAddress)}</span>`
    : `<span class="badge badge-warning">Not Connected</span>`;

  const outlookStatus = outlook && outlook.status === "connected"
    ? `<span class="badge badge-success">Connected: ${esc(outlook.emailAddress)}</span>`
    : `<span class="badge badge-warning">Not Connected</span>`;

  return baseLayout("Overview", `
    ${alertHtml}

    <div class="grid-4">
      <div class="stat-card">
        <div class="stat-label">Total QA Jobs</div>
        <div class="stat-val">${counts.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Awaiting Review</div>
        <div class="stat-val" style="color: #f59e0b">${counts["Awaiting Review"] + counts["CV Draft Ready"] + counts["New Job"]}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Approved to Apply</div>
        <div class="stat-val" style="color: #10b981">${counts["Approved"] + counts["Email Ready to Send"]}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Applications Sent</div>
        <div class="stat-val" style="color: #2563eb">${counts["Email Sent"] + counts["Applied Manually"]}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Connected Email Accounts <a href="/accounts" class="muted">Manage ↗</a></div>
        <p class="muted" style="margin-bottom: 14px;">OAuth 2.0 integration for Gmail and Microsoft Outlook. No email is sent without your explicit click.</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px;">
            <div><strong>Google Gmail</strong></div>
            <div>${gmailStatus}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px;">
            <div><strong>Microsoft Outlook</strong></div>
            <div>${outlookStatus}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Candidate Profile &amp; CV <a href="/profile" class="muted">Edit Profile ↗</a></div>
        <p class="muted" style="margin-bottom: 12px;">Candidate: <strong>${esc(profile.fullName)}</strong> (${esc(profile.location)})</p>
        <p class="muted" style="margin-bottom: 8px;">Preferred Roles: ${profile.preferredRoles.map(r => `<span class="badge badge-info">${esc(r)}</span>`).join(" ")}</p>
        <p class="muted">Verified Skills: ${profile.keywords.slice(0, 8).map(k => `<span class="badge badge-neutral">${esc(k)}</span>`).join(" ")}</p>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Recent High-Match QA Opportunities <a href="/jobs" class="muted">View All (${counts.total}) ↗</a></div>
      ${recentJobs.length === 0
        ? `<p class="muted">No QA jobs found yet. Click <strong>Run Discovery</strong> or add a job manually.</p>`
        : `
        <table>
          <thead>
            <tr>
              <th>Role &amp; Company</th>
              <th>Location</th>
              <th>Source</th>
              <th>Match</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${recentJobs.slice(0, 8).map(j => `
              <tr>
                <td>
                  <strong><a href="/job/${esc(j.id)}">${esc(j.title)}</a></strong>
                  <div class="muted">${esc(j.company)}</div>
                </td>
                <td>${esc(j.location)} <span class="muted">(${esc(j.remoteStatus)})</span></td>
                <td><span class="badge badge-neutral">${esc(j.source)}</span></td>
                <td><span class="score-badge">${j.matchScore}%</span></td>
                <td><span class="badge ${getStatusBadgeClass(j.status)}">${esc(j.status)}</span></td>
                <td>
                  <a class="btn btn-secondary btn-sm" href="/job/${esc(j.id)}">Review</a>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        `}
    </div>
  `, "overview");
}

// ==================== JOB MATCHES PAGE ====================

export function renderJobMatchesPage(
  jobs: Job[],
  currentFilter: { status?: string; source?: string; search?: string; remoteOnly?: boolean }
): string {
  const statuses: ApplicationStatus[] = [
    "New Job", "Match Analysis Complete", "CV Draft Ready", "Cover Letter Ready",
    "Awaiting Review", "Approved", "Email Ready to Send", "Email Sent", "Applied Manually", "Rejected", "Failed"
  ];

  return baseLayout("Job Matches", `
    <div class="card">
      <form method="get" action="/jobs" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
        <div style="flex: 2; min-width: 200px;">
          <label>Search Keyword / Company / Title</label>
          <input type="text" name="search" placeholder="e.g. SQA, Postman, Manual, Dhaka..." value="${esc(currentFilter.search || "")}">
        </div>
        <div style="flex: 1; min-width: 150px;">
          <label>Status Filter</label>
          <select name="status">
            <option value="all">All Statuses</option>
            ${statuses.map(s => `<option value="${esc(s)}" ${currentFilter.status === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label>Source</label>
          <select name="source">
            <option value="all">All Sources</option>
            <option value="Remotive" ${currentFilter.source === "Remotive" ? "selected" : ""}>Remotive</option>
            <option value="Arbeitnow" ${currentFilter.source === "Arbeitnow" ? "selected" : ""}>Arbeitnow</option>
            <option value="Manual" ${currentFilter.source === "Manual" ? "selected" : ""}>Manual (Bdjobs/LinkedIn)</option>
          </select>
        </div>
        <div>
          <button class="btn btn-primary" type="submit">Filter Jobs</button>
          <a class="btn btn-secondary" href="/jobs">Reset</a>
        </div>
      </form>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
      <div class="muted">Showing <strong>${jobs.length}</strong> matching QA positions</div>
      <a class="btn btn-secondary btn-sm" href="/add-job">+ Add Job Manually</a>
    </div>

    ${jobs.length === 0 ? `
      <div class="card" style="text-align: center; padding: 40px;">
        <h3>No matching jobs found</h3>
        <p class="muted" style="margin: 10px 0 20px;">Try adjusting your filters, run discovery, or add a job from Bdjobs / LinkedIn.</p>
        <a class="btn btn-primary" href="/add-job">Add Job Manually</a>
      </div>
    ` : jobs.map(j => `
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="badge ${getStatusBadgeClass(j.status)}">${esc(j.status)}</span>
              <span class="badge badge-neutral">${esc(j.source)}</span>
              <span class="score-badge">${j.matchScore}% Match</span>
              ${j.applicationEmail ? `<span class="badge badge-cyan">✉ ${esc(j.applicationEmail)}</span>` : ""}
            </div>
            <h2 style="font-size: 19px; margin-bottom: 4px;">
              <a href="/job/${esc(j.id)}" style="color: var(--text); text-decoration: none;">${esc(j.title)}</a>
            </h2>
            <div class="muted"><strong>${esc(j.company)}</strong> · ${esc(j.location)} (${esc(j.remoteStatus)})</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a class="btn btn-secondary btn-sm" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">Original Listing ↗</a>
            <a class="btn btn-primary btn-sm" href="/job/${esc(j.id)}">Review &amp; Tailor</a>
          </div>
        </div>

        <p class="muted" style="margin: 12px 0;">${esc(j.description.slice(0, 240))}${j.description.length > 240 ? "..." : ""}</p>

        <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
          <span style="font-size: 12px; font-weight: 700; color: #475569;">Match Reasons:</span>
          ${j.matchReasons.map(r => `<span class="badge badge-info" style="font-size: 11px;">✓ ${esc(r)}</span>`).join(" ")}
          ${j.missingQualifications && j.missingQualifications.length > 0 ? `
            <span style="font-size: 12px; font-weight: 700; color: #991b1b; margin-left: 8px;">Honest Missing Requirements:</span>
            ${j.missingQualifications.slice(0, 4).map(m => `<span class="badge badge-warning" style="font-size: 11px;">⚠ ${esc(m)}</span>`).join(" ")}
          ` : ""}
        </div>
      </div>
    `).join("")}
  `, "jobs");
}

// ==================== PROFILE PAGE ====================

export function renderProfilePage(profile: Profile, message?: string): string {
  return baseLayout("My Profile", `
    ${message ? `<div class="alert alert-success"><span>${esc(message)}</span></div>` : ""}

    <div class="card">
      <div class="card-title">Authentic Candidate Profile</div>
      <p class="muted" style="margin-bottom: 20px;">
        This profile is the <strong>sole source of truth</strong> for all tailored applications.
        Strict integrity rule: <strong>Never invent experience, degrees, projects, or skills</strong>.
        You can also <a href="/cv-library">upload a CV in PDF/DOCX format</a> to automatically extract these fields.
      </p>

      <form method="post" action="/profile">
        <div class="grid-2">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" name="fullName" required value="${esc(profile.fullName)}">
          </div>
          <div class="form-group">
            <label>Email Address *</label>
            <input type="email" name="email" required value="${esc(profile.email)}">
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Phone Number (Bangladesh / International)</label>
            <input type="text" name="phone" placeholder="+880 1700 000000" value="${esc(profile.phone)}">
          </div>
          <div class="form-group">
            <label>Location</label>
            <input type="text" name="location" placeholder="Dhaka, Bangladesh" value="${esc(profile.location)}">
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>LinkedIn Profile URL</label>
            <input type="url" name="linkedin" placeholder="https://linkedin.com/in/username" value="${esc(profile.linkedin)}">
          </div>
          <div class="form-group">
            <label>GitHub / Portfolio URL</label>
            <input type="url" name="github" placeholder="https://github.com/username" value="${esc(profile.github)}">
          </div>
        </div>

        <div class="form-group">
          <label>Target QA Roles (Comma separated)</label>
          <input type="text" name="preferredRoles" value="${esc(profile.preferredRoles.join(", "))}">
          <span class="muted">Examples: Manual QA Engineer, Junior SQA Engineer, Software QA Engineer, QA Analyst, Software Tester, API Tester</span>
        </div>

        <div class="form-group">
          <label>Verified Skills &amp; Tools (Comma separated — Only skills you actually possess)</label>
          <input type="text" name="keywords" value="${esc(profile.keywords.join(", "))}">
          <span class="muted">Examples: Manual Testing, Test Cases, Bug Reporting, Jira, Postman, API Testing, Regression Testing, Smoke Testing, SQL, SDLC, STLC</span>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Preferred Locations</label>
            <input type="text" name="targetLocations" value="${esc(profile.targetLocations.join(", "))}">
          </div>
          <div class="form-group">
            <label>Salary Expectations</label>
            <input type="text" name="salaryExpectation" placeholder="e.g. 35,000 - 50,000 BDT or Negotiable" value="${esc(profile.salaryExpectation || "")}">
          </div>
        </div>

        <div class="form-group">
          <label>Minimum Match Score Filter (0 - 100%)</label>
          <input type="number" name="minimumMatchScore" min="0" max="100" value="${profile.minimumMatchScore}">
        </div>

        <div class="form-group">
          <label>Complete CV Text (Source of Truth)</label>
          <textarea name="cvText" rows="12" required placeholder="Paste your complete CV text here, or upload a PDF/DOCX file in CV Library">${esc(profile.cvText)}</textarea>
        </div>

        <button class="btn btn-primary" type="submit">Save Verified Profile</button>
      </form>
    </div>
  `, "profile");
}

// ==================== CV LIBRARY PAGE ====================

export function renderCvLibraryPage(files: CVFile[], previewData?: any): string {
  const previewSection = previewData ? `
    <div class="card" style="border: 2px solid #3b82f6; background: #f8fafc;">
      <div class="card-title" style="color: #1d4ed8;">Review Extracted CV Data Before Saving</div>
      <p class="muted" style="margin-bottom: 16px;">
        We parsed the following information from <strong>${esc(previewData.originalName)}</strong>.
        Please review and confirm below. No information will be invented or modified without your review.
      </p>

      <form method="post" action="/cv-library/confirm">
        <input type="hidden" name="fileId" value="${esc(previewData.id)}">
        <div class="grid-2">
          <div class="form-group">
            <label>Candidate Name</label>
            <input type="text" name="fullName" value="${esc(previewData.extracted.fullName || "")}">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" value="${esc(previewData.extracted.email || "")}">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>Phone</label>
            <input type="text" name="phone" value="${esc(previewData.extracted.phone || "")}">
          </div>
          <div class="form-group">
            <label>Location</label>
            <input type="text" name="location" value="${esc(previewData.extracted.location || "")}">
          </div>
        </div>
        <div class="form-group">
          <label>Extracted Skills (Review and edit)</label>
          <input type="text" name="keywords" value="${esc((previewData.extracted.keywords || []).join(", "))}">
        </div>
        <div class="form-group">
          <label>Extracted Full Text</label>
          <textarea name="cvText" rows="8">${esc(previewData.extracted.cvText || "")}</textarea>
        </div>
        <button class="btn btn-primary" type="submit">Confirm &amp; Update Profile with Extracted Data</button>
      </form>
    </div>
  ` : "";

  return baseLayout("CV Library", `
    ${previewSection}

    <div class="card">
      <div class="card-title">Upload Existing CV (PDF or DOCX)</div>
      <p class="muted" style="margin-bottom: 16px;">
        Upload your authentic CV in <strong>PDF (.pdf)</strong> or <strong>Word (.docx)</strong> format.
        Our system will extract your actual experience, education, skills, and contact details for your review before saving.
      </p>
      <form method="post" action="/cv-library/upload" enctype="multipart/form-data" style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        <input type="file" name="cvFile" accept=".pdf,.docx,.txt" required style="max-width: 380px;">
        <button class="btn btn-primary" type="submit">Extract &amp; Review CV</button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">Uploaded CV Files</div>
      ${files.length === 0 ? `<p class="muted">No CV files uploaded yet.</p>` : `
        <table>
          <thead>
            <tr>
              <th>File Name</th>
              <th>Format</th>
              <th>Size</th>
              <th>Uploaded At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(f => `
              <tr>
                <td><strong>${esc(f.originalName)}</strong></td>
                <td><span class="badge badge-neutral">${esc(f.mimeType.split("/")[1] || "doc")}</span></td>
                <td>${(f.size / 1024).toFixed(1)} KB</td>
                <td>${new Date(f.uploadedAt).toLocaleString()}</td>
                <td>
                  <form method="post" action="/cv-library/${esc(f.id)}/delete" style="display:inline">
                    <button class="btn btn-danger btn-sm" onclick="return confirm('Delete this CV file?')">Delete</button>
                  </form>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>
  `, "cv-library");
}

// ==================== APPLICATION DRAFTS PAGE ====================

export function renderDraftsPage(draftJobs: Job[]): string {
  return baseLayout("Application Drafts", `
    <div class="card">
      <div class="card-title">Prepared CV &amp; Cover Letter Drafts</div>
      <p class="muted">
        Tailored documents ready for review and application submission.
        Click <strong>Review Job</strong> to inspect the tailored materials, export PDF/DOCX, or prepare an application email.
      </p>
    </div>

    ${draftJobs.length === 0 ? `
      <div class="card" style="text-align: center; padding: 40px;">
        <h3>No drafts prepared yet</h3>
        <p class="muted" style="margin-top: 8px;">Open any job match from <a href="/jobs">Job Matches</a> and click <strong>Generate Tailored Draft</strong>.</p>
      </div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>Target Role &amp; Company</th>
            <th>Match Score</th>
            <th>Application Email</th>
            <th>Generated Attachments</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${draftJobs.map(j => `
            <tr>
              <td>
                <strong><a href="/job/${esc(j.id)}">${esc(j.title)}</a></strong>
                <div class="muted">${esc(j.company)} · ${esc(j.location)}</div>
              </td>
              <td><span class="score-badge">${j.matchScore}%</span></td>
              <td>${j.applicationEmail ? `✉ ${esc(j.applicationEmail)}` : `<span class="muted">Online Form / Portal</span>`}</td>
              <td>
                ${j.tailoredCvPdfPath ? `<a class="btn btn-secondary btn-sm" href="/download/${esc(j.id)}/cv-pdf">CV PDF</a> ` : ""}
                ${j.coverLetterPdfPath ? `<a class="btn btn-secondary btn-sm" href="/download/${esc(j.id)}/letter-pdf">Letter PDF</a>` : ""}
              </td>
              <td>
                <a class="btn btn-primary btn-sm" href="/job/${esc(j.id)}">Review &amp; Send</a>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `}
  `, "drafts");
}

// ==================== EMAIL ACCOUNTS PAGE ====================

export function renderEmailAccountsPage(accounts: EmailAccount[], notice?: string): string {
  const gmail = accounts.find(a => a.provider === "gmail");
  const outlook = accounts.find(a => a.provider === "outlook");

  return baseLayout("Email Accounts", `
    ${notice ? `<div class="alert alert-info"><span>${esc(notice)}</span></div>` : ""}

    <div class="card">
      <div class="card-title">Official OAuth 2.0 Email Integrations</div>
      <p class="muted" style="margin-bottom: 16px;">
        Connect your Gmail or Microsoft Outlook account to send reviewed job applications.
        <strong>Security Guarantee:</strong> Passwords are never requested or stored. OAuth tokens are encrypted with AES-256-GCM.
        <strong>No email is ever sent automatically without your explicit approval click.</strong>
      </p>
    </div>

    <div class="grid-2">
      <!-- Gmail Card -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>Google Gmail</h3>
          ${gmail && gmail.status === "connected"
            ? `<span class="badge badge-success">Connected</span>`
            : `<span class="badge badge-warning">Not Connected</span>`}
        </div>
        <p class="muted" style="margin-bottom: 16px;">
          Uses the official Gmail API (scopes: <code>gmail.send</code>, <code>userinfo.email</code>).
        </p>
        ${gmail && gmail.status === "connected" ? `
          <div style="background: #f8fafc; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <div>Signed in as: <strong>${esc(gmail.emailAddress)}</strong></div>
            <div class="muted" style="font-size: 12px; margin-top: 4px;">Connected at: ${new Date(gmail.lastConnectedAt || "").toLocaleString()}</div>
          </div>
          <form method="post" action="/oauth/gmail/disconnect">
            <button class="btn btn-danger btn-sm" onclick="return confirm('Disconnect Gmail account?')">Disconnect Gmail</button>
          </form>
        ` : `
          <a class="btn btn-primary" href="/oauth/gmail/connect">Connect Gmail with Google OAuth</a>
        `}
      </div>

      <!-- Outlook Card -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3>Microsoft Outlook</h3>
          ${outlook && outlook.status === "connected"
            ? `<span class="badge badge-success">Connected</span>`
            : `<span class="badge badge-warning">Not Connected</span>`}
        </div>
        <p class="muted" style="margin-bottom: 16px;">
          Uses Microsoft Graph API (scopes: <code>Mail.Send</code>, <code>User.Read</code>, <code>offline_access</code>).
        </p>
        ${outlook && outlook.status === "connected" ? `
          <div style="background: #f8fafc; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <div>Signed in as: <strong>${esc(outlook.emailAddress)}</strong></div>
            <div class="muted" style="font-size: 12px; margin-top: 4px;">Connected at: ${new Date(outlook.lastConnectedAt || "").toLocaleString()}</div>
          </div>
          <form method="post" action="/oauth/outlook/disconnect">
            <button class="btn btn-danger btn-sm" onclick="return confirm('Disconnect Outlook account?')">Disconnect Outlook</button>
          </form>
        ` : `
          <a class="btn btn-primary" href="/oauth/outlook/connect">Connect Outlook with Microsoft OAuth</a>
        `}
      </div>
    </div>

    <div class="card">
      <div class="card-title">OAuth Configuration &amp; Credentials Setup</div>
      <p class="muted" style="margin-bottom: 12px;">
        To enable Google or Microsoft OAuth, configure your credentials in the project's <code>.env</code> file:
      </p>
      <pre># Google Cloud Console OAuth 2.0 Credentials:
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3030/oauth/gmail/callback

# Microsoft Entra ID (Azure) App Registration Credentials:
MICROSOFT_CLIENT_ID=your-microsoft-app-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=http://localhost:3030/oauth/outlook/callback</pre>
    </div>
  `, "accounts");
}

// ==================== APPLICATION HISTORY PAGE ====================

export function renderHistoryPage(logs: EmailLog[], auditLogs: AuditLog[]): string {
  return baseLayout("Application History", `
    <div class="card">
      <div class="card-title">Sent Application Emails</div>
      ${logs.length === 0 ? `<p class="muted">No emails have been sent yet.</p>` : `
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Message ID</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${new Date(l.sentAt).toLocaleString()}</td>
                <td><strong>${esc(l.recipientEmail)}</strong></td>
                <td>${esc(l.subject)}</td>
                <td><span class="badge badge-neutral">${esc(l.provider)}</span></td>
                <td>
                  <span class="badge ${l.status === "sent" ? "badge-success" : "badge-danger"}">${esc(l.status)}</span>
                  ${l.errorMessage ? `<div class="muted" style="color: #ef4444; font-size: 11px;">${esc(l.errorMessage)}</div>` : ""}
                </td>
                <td><code>${esc(l.messageId || "N/A")}</code></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>

    <div class="card">
      <div class="card-title">Security &amp; Workflow Audit Trail</div>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${auditLogs.slice(0, 20).map(a => `
            <tr>
              <td>${new Date(a.timestamp).toLocaleString()}</td>
              <td><code>${esc(a.action)}</code></td>
              <td>${esc(a.entityType)} ${a.entityId ? `(${esc(a.entityId)})` : ""}</td>
              <td class="muted">${esc(a.details || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `, "history");
}

// ==================== SETTINGS PAGE ====================

export function renderSettingsPage(schedulerStatus: any): string {
  return baseLayout("Settings & Automation", `
    <div class="card">
      <div class="card-title">Daily Automation Status</div>
      <p class="muted" style="margin-bottom: 16px;">
        Scheduled to discover QA positions daily at <strong>09:00 Bangladesh time (Asia/Dhaka)</strong>.
        Discovered jobs are scored, deduplicated, and prepared for your review.
        <strong>Daily automation never sends an email without human approval.</strong>
      </p>
      <div style="background: #f8fafc; padding: 18px; border-radius: 8px; margin-bottom: 18px;">
        <div>Scheduler Status: <strong>${schedulerStatus.isActive ? "🟢 Active & Running" : "🔴 Inactive"}</strong></div>
        <div style="margin-top: 6px;">Cron Schedule: <code>${esc(schedulerStatus.schedule)}</code> (${esc(schedulerStatus.timezone)})</div>
        <div style="margin-top: 6px;">Last Run: ${schedulerStatus.lastRunAt ? new Date(schedulerStatus.lastRunAt).toLocaleString() : "Not triggered yet today"}</div>
        <div style="margin-top: 6px;">Last Result: ${esc(schedulerStatus.lastResultSummary || "No runs yet")}</div>
      </div>
      <form method="post" action="/discover">
        <button class="btn btn-primary">Run Discovery Right Now</button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">Windows Task Scheduler Auto-Start Guide</div>
      <p class="muted" style="margin-bottom: 14px;">
        To ensure the QA Job Agent automatically starts whenever your Windows computer boots or logs in,
        run this PowerShell command as Administrator:
      </p>
      <pre>$Action = New-ScheduledTaskAction -Execute "node.exe" -Argument "dist/server.js" -WorkingDirectory "C:\\PROJECTS\\qa-job-agent"
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "QAJobAgent" -Action $Action -Trigger $Trigger -Settings $Settings -Description "AI QA Job Application Agent Auto-Start"</pre>
    </div>
  `, "settings");
}

// ==================== JOB DETAIL & REVIEW PAGE ====================

export function renderJobDetailPage(
  job: Job,
  profile: Profile,
  emailAccounts: EmailAccount[],
  error?: string
): string {
  const hasDocuments = Boolean(job.tailoredCvText && job.coverLetter);

  return baseLayout(job.title, `
    <div style="margin-bottom: 16px;">
      <a href="/jobs" class="muted">← Back to Job Matches</a>
    </div>

    ${error ? `<div class="alert alert-danger"><span>${esc(error)}</span></div>` : ""}

    <!-- Job Header Card -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span class="badge ${getStatusBadgeClass(job.status)}">${esc(job.status)}</span>
            <span class="badge badge-neutral">${esc(job.source)}</span>
            <span class="score-badge">${job.matchScore}% Match Score</span>
            ${job.applicationEmail ? `<span class="badge badge-cyan">✉ ${esc(job.applicationEmail)}</span>` : ""}
          </div>
          <h1 style="font-size: 24px; margin-bottom: 4px;">${esc(job.title)}</h1>
          <h3 style="color: var(--text-muted); font-weight: 600; font-size: 16px;">
            ${esc(job.company)} · ${esc(job.location)} · <span class="badge badge-info">${esc(job.remoteStatus)}</span>
          </h3>
          <div class="muted" style="margin-top: 6px;">Discovered: ${new Date(job.discoveredAt).toLocaleString()}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <a class="btn btn-secondary" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">Open Original Posting ↗</a>
        </div>
      </div>
    </div>

    <!-- Match Analysis Card -->
    <div class="card">
      <div class="card-title">Profile Match Analysis &amp; Honest Requirements Breakdown</div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <strong style="color: #15803d;">Verified Match Reasons:</strong>
          <ul style="margin: 6px 0 0 20px;">
            ${job.matchReasons.map(r => `<li>${esc(r)}</li>`).join("") || "<li>No specific keywords matched.</li>"}
          </ul>
        </div>

        <div>
          <strong style="color: #b91c1c;">Honest Missing Requirements / Gaps:</strong>
          ${job.missingQualifications && job.missingQualifications.length > 0 ? `
            <ul style="margin: 6px 0 0 20px; color: #7f1d1d;">
              ${job.missingQualifications.map(m => `<li>⚠ ${esc(m)}</li>`).join("")}
            </ul>
          ` : `<p class="muted" style="margin-top: 4px;">No significant gaps detected between your profile and job description.</p>`}
        </div>
      </div>
    </div>

    <!-- Application Email Section -->
    <div class="card" style="border: 2px solid ${job.applicationEmail ? "#3b82f6" : "#cbd5e1"};">
      <div class="card-title">Application Email Details</div>
      ${job.applicationEmail ? `
        <div style="background: #eff6ff; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
          <div>Application Recipient: <strong>${esc(job.applicationEmail)}</strong></div>
          <div class="muted" style="font-size: 12px; margin-top: 4px;">Source: ${esc(job.applicationEmailSource || "Listing")}</div>
        </div>
      ` : `
        <p class="muted" style="margin-bottom: 12px;">
          No public application email was automatically detected in the job listing.
          If the employer accepts applications via email, enter it below:
        </p>
      `}
      <form method="post" action="/job/${esc(job.id)}/update-email" style="display: flex; gap: 10px; align-items: center; max-width: 500px;">
        <input type="email" name="applicationEmail" placeholder="e.g. hr@company.com" value="${esc(job.applicationEmail || "")}" required>
        <button class="btn btn-secondary btn-sm" type="submit">Update Recipient Email</button>
      </form>
    </div>

    <!-- Generate Tailored Documents Card -->
    <div class="card">
      <div class="card-title">AI-Assisted CV &amp; Cover Letter Tailoring</div>
      <p class="muted" style="margin-bottom: 16px;">
        Generates an ATS-friendly CV and targeted cover letter highlighting your real QA competencies.
        <strong>Zero fact fabrication:</strong> Only verified skills and experience from your profile are included.
      </p>
      <form method="post" action="/job/${esc(job.id)}/tailor">
        <button class="btn btn-primary" type="submit">⚡ ${hasDocuments ? "Regenerate Tailored Drafts" : "Generate Tailored CV &amp; Cover Letter"}</button>
      </form>
    </div>

    ${hasDocuments ? `
      <!-- Tailored Documents Inspection -->
      <div class="card">
        <div class="card-title">
          <span>Tailored ATS CV Draft</span>
          <div>
            ${job.tailoredCvPdfPath ? `<a class="btn btn-secondary btn-sm" href="/download/${esc(job.id)}/cv-pdf">Download PDF</a>` : ""}
            ${job.tailoredCvDocxPath ? `<a class="btn btn-secondary btn-sm" href="/download/${esc(job.id)}/cv-docx">Download Word DOCX</a>` : ""}
          </div>
        </div>
        <pre>${esc(job.tailoredCvText)}</pre>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Tailored Cover Letter</span>
          <div>
            ${job.coverLetterPdfPath ? `<a class="btn btn-secondary btn-sm" href="/download/${esc(job.id)}/letter-pdf">Download PDF</a>` : ""}
            ${job.coverLetterDocxPath ? `<a class="btn btn-secondary btn-sm" href="/download/${esc(job.id)}/letter-docx">Download Word DOCX</a>` : ""}
          </div>
        </div>
        <pre>${esc(job.coverLetter)}</pre>
      </div>

      <div class="card">
        <div class="card-title">Tailoring Changes &amp; Integrity Explanation</div>
        <pre style="background: #f8fafc; color: #0f172a; border: 1px solid var(--border);">${esc(job.changesExplanation || "Tailored using candidate profile.")}</pre>
      </div>

      <!-- Send Email Section (Only when application email is available) -->
      ${job.applicationEmail ? `
        <div class="card" style="border: 2px solid #10b981; background: #ffffff;">
          <div class="card-title" style="color: #065f46;">Job Application Email Review &amp; Approval</div>
          <p class="muted" style="margin-bottom: 16px;">
            Review and edit the recipient, subject, email body, and attachments.
            <strong>Security Guard:</strong> The email is sent <em>only</em> when you explicitly check the confirmation box and click <strong>Approve &amp; Send Email</strong>.
          </p>

          <form method="post" action="/job/${esc(job.id)}/send-email">
            <div class="grid-2">
              <div class="form-group">
                <label>Send From Connected Account *</label>
                <select name="provider" required>
                  ${emailAccounts.filter(a => a.status === "connected").map(a => `
                    <option value="${esc(a.provider)}">${esc(a.displayName || a.emailAddress)} (${a.provider.toUpperCase()})</option>
                  `).join("")}
                  ${emailAccounts.filter(a => a.status === "connected").length === 0 ? `
                    <option value="" disabled selected>No email accounts connected! Connect in Email Accounts first.</option>
                  ` : ""}
                </select>
              </div>
              <div class="form-group">
                <label>Recipient Email *</label>
                <input type="email" name="recipient" required value="${esc(job.applicationEmail)}">
              </div>
            </div>

            <div class="form-group">
              <label>Email Subject *</label>
              <input type="text" name="subject" required value="Job Application: ${esc(job.title)} — ${esc(profile.fullName)}">
            </div>

            <div class="form-group">
              <label>Email Body *</label>
              <textarea name="body" rows="9" required>Dear Hiring Team at ${esc(job.company)},

I am writing to formally submit my application for the ${esc(job.title)} position.

With hands-on experience in QA test case design, manual testing execution, and systematic defect tracking, I am eager to contribute to your engineering team's product quality goals.

Please find attached my tailored CV and Cover Letter detailing my practical testing background, technical competencies, and project portfolio.

Thank you for your consideration, and I look forward to the possibility of discussing this role.

Sincerely,
${esc(profile.fullName)}
${esc(profile.email)}
${esc(profile.phone)}
${esc(profile.location)}</textarea>
            </div>

            <div class="form-group" style="background: #f8fafc; padding: 14px; border-radius: 8px;">
              <label>Attachments to Include:</label>
              <div>
                ${job.tailoredCvPdfPath ? `
                  <label style="font-weight: normal; display: inline-flex; align-items: center; gap: 8px; margin-right: 18px;">
                    <input type="checkbox" name="attachCvPdf" value="1" checked> Tailored CV (PDF)
                  </label>
                ` : ""}
                ${job.coverLetterPdfPath ? `
                  <label style="font-weight: normal; display: inline-flex; align-items: center; gap: 8px;">
                    <input type="checkbox" name="attachLetterPdf" value="1" checked> Cover Letter (PDF)
                  </label>
                ` : ""}
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 14px; border-radius: 8px; margin: 18px 0;">
              <label style="color: #065f46; display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" name="approvedByUser" value="true" required style="width: 18px; height: 18px;">
                <span><strong>I have reviewed these materials and explicitly approve sending this application email now.</strong></span>
              </label>
            </div>

            <button class="btn btn-success" type="submit" ${emailAccounts.filter(a => a.status === "connected").length === 0 ? "disabled" : ""}>
              🚀 Approve &amp; Send Email
            </button>
          </form>
        </div>
      ` : ""}
    ` : ""}

    <!-- Workflow Status Actions Card -->
    <div class="card">
      <div class="card-title">Application Status Actions</div>
      <p class="muted" style="margin-bottom: 14px;">Update workflow status according to your application progress.</p>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <form method="post" action="/job/${esc(job.id)}/status">
          <input type="hidden" name="status" value="Approved">
          <button class="btn btn-success btn-sm" type="submit">Mark as Approved</button>
        </form>

        <form method="post" action="/job/${esc(job.id)}/status">
          <input type="hidden" name="status" value="Applied Manually">
          <button class="btn btn-primary btn-sm" type="submit">Mark as Applied Manually</button>
        </form>

        <form method="post" action="/job/${esc(job.id)}/status">
          <input type="hidden" name="status" value="Rejected">
          <button class="btn btn-danger btn-sm" type="submit">Reject Job</button>
        </form>
      </div>
    </div>

    <!-- Job Description (Full Source Text) -->
    <div class="card">
      <div class="card-title">Full Job Description (Original Source Text)</div>
      <pre style="background: #f8fafc; color: #0f172a; border: 1px solid var(--border); max-height: 400px; overflow-y: auto;">${esc(job.description)}</pre>
    </div>
  `, "jobs");
}

// ==================== ADD JOB MANUALLY PAGE ====================

export function renderAddJobPage(error?: string): string {
  return baseLayout("Add Job Manually", `
    ${error ? `<div class="alert alert-danger"><span>${esc(error)}</span></div>` : ""}

    <div class="card">
      <div class="card-title">Add Job Manually (Bdjobs, LinkedIn, Company Careers)</div>
      <p class="muted" style="margin-bottom: 18px;">
        Use this form to add positions found on Bangladesh job portals (Bdjobs, LinkedIn, Chakri, etc.) or company career sites.
        Paste the full description so the system can match qualifications and extract any application email.
      </p>

      <form method="post" action="/add-job">
        <div class="grid-2">
          <div class="form-group">
            <label>Job Title *</label>
            <input type="text" name="title" required placeholder="e.g. Junior SQA Engineer / Manual QA">
          </div>
          <div class="form-group">
            <label>Company Name *</label>
            <input type="text" name="company" required placeholder="e.g. Enosis Solutions, Brain Station 23, Optimizely...">
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Location *</label>
            <input type="text" name="location" required placeholder="e.g. Dhaka, Bangladesh / Remote" value="Dhaka, Bangladesh">
          </div>
          <div class="form-group">
            <label>Remote Status</label>
            <select name="remoteStatus">
              <option value="Not specified">Not specified</option>
              <option value="On-site" selected>On-site</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Remote">Remote</option>
            </select>
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Official Job URL *</label>
            <input type="url" name="url" required placeholder="https://bdjobs.com/... or https://linkedin.com/jobs/...">
          </div>
          <div class="form-group">
            <label>Application Email (If mentioned in job posting)</label>
            <input type="email" name="applicationEmail" placeholder="e.g. hr@company.com">
          </div>
        </div>

        <div class="form-group">
          <label>Full Job Description &amp; Requirements *</label>
          <textarea name="description" rows="10" required placeholder="Paste the complete job description, responsibilities, and requirements here..."></textarea>
        </div>

        <button class="btn btn-primary" type="submit">Add to Job Review Queue</button>
      </form>
    </div>
  `, "jobs");
}
