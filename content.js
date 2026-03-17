// ============================================================
// CourseWeb Assistant - content.js  v3.0
// Real-time countdown + progress bars.
// ============================================================

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────

  // Navbar selector (used by renderDropdown)
  const NAVBAR_SELECTOR = ".navbar-nav";

  // Each strategy is tried in priority order.
  // First one that finds AND accepts at least one item wins.
  const STRATEGIES = [
    // ── Standard Moodle course page (most common) ────────────
    {
      name: "li.activity.assign",
      container: "li.activity.assign",
      label: ".instancename, .activityname",
      date: ".text-info, .duedate, .activity-dates .text-info",
    },
    {
      name: "li.modtype_assign",
      container: "li.modtype_assign",
      label: ".instancename",
      date: ".text-info, .duedate",
    },
    // ── Boost theme / Moodle 4.x course index ───────────────
    {
      name: "data-region=activity-item (Moodle 4)",
      container: "[data-region='activity-item']",
      label: "[data-region='activity-name'], .activityname",
      date: "[data-region='activity-dates'] .text-info, .activity-altcontent",
    },
    {
      name: "data-activityname attribute",
      container: "[data-activityname]",
      label: ".activityname, .instancename, [data-activityname]",
      date: ".text-info, .duedate, .activity-dates",
    },
    // ── Upcoming events / Timeline block ────────────────────
    {
      name: "timeline event items",
      container: "[data-region='event-list-item'], .event-list-item",
      label: "[data-region='event-name'] a, .eventname a",
      date: "[data-region='event-date'], .date, time[datetime]",
    },
    {
      name: "calendar .event blocks",
      container: ".event[data-event-activitytype='assign']",
      label: ".referer a, .eventname a, h3.name a",
      date: ".date, time",
    },
    // ── My Overview / Dashboard cards ───────────────────────
    {
      name: "overview-course-list items",
      container: "[data-region='course-content'] [data-region='event-list-item']",
      label: "[data-region='event-name'] a",
      date: "[data-region='event-date']",
    },
    {
      name: ".card-body.courseinfo rows",
      container: ".card-body .courseinfo",
      label: ".fullname, h4",
      date: ".text-truncate .fa-clock-o + span, .fa-clock-o + span",
    },
    // ── Assignment submission / grading tables ───────────────
    {
      name: "generaltable tbody rows",
      container: "table.generaltable tbody tr",
      label: "td:nth-child(1)",
      date: "td:nth-child(2), td:nth-child(3)",
    },
    // ── Broad generic Moodle activity list ───────────────────
    {
      name: "#region-main li.activity",
      container: "#region-main li.activity",
      label: ".activityname, .instancename",
      date: ".text-info, .duedate, time",
    },
    {
      name: ".course-content .activity",
      container: ".course-content .activity",
      label: ".activityname, .instancename",
      date: ".text-info, .duedate",
    },
    // ── Last-resort fallback ─────────────────────────────────
    {
      name: "any .activity-item / .assignment-card",
      container: ".activity-item, .assignment-card",
      label: ".activityname, .instancename, .activity-name",
      date: ".deadline-date, .due-date, .duedate, .text-info",
    },
  ];

  // ── Diagnostic helper (call from DevTools console) ────────
  // Usage: cwaDiagnose()
  window.cwaDiagnose = function () {
    console.group("[CWA] cwaDiagnose() — testing all strategies on this page");
    STRATEGIES.forEach((s) => {
      const hits = document.querySelectorAll(s.container);
      console.log(
        `%c${hits.length > 0 ? "✔" : "✘"} [${s.name}]%c  container='${s.container}'  → ${hits.length} element(s)`,
        hits.length > 0 ? "color:green;font-weight:bold" : "color:red;font-weight:bold",
        "color:inherit"
      );
      if (hits.length > 0 && hits.length < 5) {
        hits.forEach((el, i) => console.log(`  #${i}:`, el));
      }
    });
    console.groupEnd();
    console.info("[CWA] Tip: call cwaDiagnose() on ANY courseweb.sliit.lk page to see which strategies match.");
  };


  // Exact text strings that confirm an assignment is ALREADY submitted.
  // Any element whose text contains one of these is skipped entirely.
  const SKIP_PHRASES = [
    "edit submission",
    "remove submission",
    "submitted for grading",
    "submission received",
  ];

  /**
   * Returns true if the container element shows any sign that
   * the user has already submitted this assignment.
   */
  function isAlreadySubmitted(element) {
    const text = element.textContent.toLowerCase();
    return SKIP_PHRASES.some((phrase) => text.includes(phrase));
  }

  /**
   * Returns true ONLY if the container contains a button/link/div
   * whose trimmed text is exactly "Add submission" (case-insensitive).
   * This is the definitive signal that the assignment is still pending.
   */
  function hasPendingSubmissionButton(element) {
    // Cast a wide net: buttons, anchor tags, input buttons, and any div/span
    const candidates = element.querySelectorAll(
      'button, a, input[type="button"], input[type="submit"], [role="button"], .btn'
    );
    for (const el of candidates) {
      const label = el.textContent.trim().toLowerCase();
      if (label === "add submission") return true;
    }
    return false;
  }

  // How long each deadline "window" is (used to calculate progress %).
  // Default: 7 days. Adjust as needed.
  const DEADLINE_WINDOW_DAYS = 7;

  // Holds the live setInterval ID so we can clear it if needed.
  let countdownInterval = null;

  // ─────────────────────────────────────────────────────────
  // 1.  DATA SCRAPING
  // ─────────────────────────────────────────────────────────
  function scrapeDeadlines() {
    console.group("[CWA] scrapeDeadlines() — CourseWeb exact-structure scraper");
    console.log("[CWA] Page:", location.href);

    const deadlines = [];
    const now = new Date();
    console.log("[CWA] Current time:", now.toISOString());

    // ───────────────────────────────────────────────────────────────────────
    // HELPER: Parse Moodle date → JS Date
    //   "Sunday, 22 March 2026, 11:30 PM" → Date object
    // ───────────────────────────────────────────────────────────────────────
    function parseMoodleDate(str) {
      if (!str) return null;
      // Strip leading day-name: "Sunday, 22 March..." → "22 March..."
      const cleaned = str.replace(/^[a-z]+,\s*/i, "").trim();
      const d = new Date(cleaned);
      return isNaN(d.getTime()) ? null : d;
    }

    // ───────────────────────────────────────────────────────────────────────
    // 1. MODULE NAME — from the breadcrumb <ol class="breadcrumb">
    //    Real DOM:
    //    <ol class="breadcrumb">
    //      <li class="breadcrumb-item"><a>Home</a></li>
    //      <li class="breadcrumb-item"><a>My courses</a></li>
    //      <li class="breadcrumb-item">
    //        <a href="..." title="IT2130 - Operating Systems...">
    //          IT2130 - ...
    //        </a>
    //      </li>
    //      <li class="breadcrumb-item"><span>Practical sheet 7...</span></li>
    //    </ol>
    //    Strategy: Walk the breadcrumb <a> tags backwards, skip generic
    //    names like Home/Dashboard, take the first course-code match.
    // ───────────────────────────────────────────────────────────────────────
    let moduleName = null;

    const crumbLinks = document.querySelectorAll(
      ".breadcrumb .breadcrumb-item a, .breadcrumb li a, #page-navbar .breadcrumb a"
    );
    console.log(`[CWA] Breadcrumb <a> tags found: ${crumbLinks.length}`);

    // Walk backwards — the course link is typically 2nd or 3rd from the end
    const skipNames = /^(home|dashboard|my courses|site home|participants|grades|course)$/i;
    for (let i = crumbLinks.length - 1; i >= 0; i--) {
      const link = crumbLinks[i];
      // Prefer the title attribute (it usually has the full course name)
      const fullTitle = (link.getAttribute("title") || "").trim();
      const linkText = link.textContent.trim();
      const candidate = fullTitle || linkText;

      if (!skipNames.test(linkText) && candidate.length > 3) {
        // Check if it looks like a course code (e.g. "IT2130", "SE1020")
        if (/^[A-Z]{2,4}\d{3,4}/i.test(candidate)) {
          moduleName = candidate;
          console.log(`[CWA] Module name via breadcrumb (crumb #${i}): "${moduleName}"`);
          break;
        }
      }
    }

    // Fallback: if no course-code pattern found, take the last non-generic crumb
    if (!moduleName) {
      for (let i = crumbLinks.length - 1; i >= 0; i--) {
        const text = crumbLinks[i].textContent.trim();
        if (!skipNames.test(text) && text.length > 3) {
          moduleName = text;
          console.log(`[CWA] Module name via breadcrumb fallback (crumb #${i}): "${moduleName}"`);
          break;
        }
      }
    }

    console.log("[CWA] Final module name:", moduleName || "NOT FOUND");

    // ───────────────────────────────────────────────────────────────────────
    // 2. TASK NAME — from <h1 class="h2 mb-0">
    //    Real DOM:
    //    <h1 class="h2 mb-0">Practical sheet 7answer - Submission link...</h1>
    //    Fallback: #region-main h2, [data-activityname], or any h1
    // ───────────────────────────────────────────────────────────────────────
    let taskName = null;

    // Primary: the exact class from the user's HTML
    const h1El = document.querySelector("h1.h2.mb-0");
    if (h1El) {
      taskName = h1El.textContent.trim().replace(/\s+/g, " ");
      console.log(`[CWA] Task name via h1.h2.mb-0: "${taskName}"`);
    }

    // Fallback 1: the <h2> inside #region-main
    if (!taskName) {
      const h2El = document.querySelector("#region-main > span + h2, #region-main h2");
      if (h2El) {
        taskName = h2El.textContent.trim().replace(/\s+/g, " ");
        console.log(`[CWA] Task name via #region-main h2: "${taskName}"`);
      }
    }

    // Fallback 2: data-activityname attribute
    if (!taskName) {
      const infoEl = document.querySelector("[data-activityname]");
      if (infoEl) {
        taskName = infoEl.getAttribute("data-activityname").trim();
        console.log(`[CWA] Task name via data-activityname: "${taskName}"`);
      }
    }

    console.log("[CWA] Final task name:", taskName || "NOT FOUND");

    // ───────────────────────────────────────────────────────────────────────
    // 3. DUE DATE — from the submission status table
    //    Real DOM (standard Moodle submission table):
    //    <table class="generaltable">
    //      <tr>
    //        <th>Due date</th>
    //        <td>Sunday, 22 March 2026, 11:30 PM</td>
    //      </tr>
    //    </table>
    //    Fallback A: [data-region="activity-dates"] div containing "Due:"
    //    Fallback B: .timeremaining cell
    // ───────────────────────────────────────────────────────────────────────
    let dueDate = null;

    // Primary: scan all table rows for a <th> containing "Due date"
    const tableRows = document.querySelectorAll("table.generaltable tr, .submissionsummarytable tr, .generaltable tr");
    console.log(`[CWA] Table rows found: ${tableRows.length}`);

    tableRows.forEach((tr) => {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (th && td) {
        const header = th.textContent.trim().toLowerCase();
        if (header.includes("due date") || header === "due") {
          dueDate = td.textContent.trim();
          console.log(`[CWA] Due date via submission table: "${dueDate}"`);
        }
      }
    });

    // Fallback A: [data-region="activity-dates"] div with "Due:"
    if (!dueDate) {
      const activityDates = document.querySelector('[data-region="activity-dates"]');
      if (activityDates) {
        activityDates.querySelectorAll("div").forEach((div) => {
          const match = div.textContent.trim().match(/^Due:\s*(.+)$/i);
          if (match) {
            dueDate = match[1].trim();
            console.log(`[CWA] Due date via activity-dates: "${dueDate}"`);
          }
        });
      }
    }

    // Fallback B: .timeremaining cell
    if (!dueDate) {
      const trCell = document.querySelector(".timeremaining");
      if (trCell) {
        dueDate = trCell.textContent.trim();
        console.log(`[CWA] Due date via .timeremaining: "${dueDate}"`);
      }
    }

    console.log("[CWA] Final due date:", dueDate || "NOT FOUND");

    // ───────────────────────────────────────────────────────────────────────
    // 4. GATE: "Add submission" = pending, skip if already submitted
    // ───────────────────────────────────────────────────────────────────────
    const allBtns = document.querySelectorAll("button, a, .btn");
    const hasAddSubmission = Array.from(allBtns).some(
      (el) => el.textContent.trim().toLowerCase() === "add submission"
    );
    console.log("[CWA] 'Add submission' button:", hasAddSubmission ? "FOUND" : "NOT FOUND");

    const pageText = document.body.textContent.toLowerCase();
    const isSubmitted =
      pageText.includes("edit submission") ||
      pageText.includes("remove submission") ||
      pageText.includes("submitted for grading");

    // ───────────────────────────────────────────────────────────────────────
    // 5. COLLECT — only if we have all three fields
    // ───────────────────────────────────────────────────────────────────────
    try {
      if (!taskName || !dueDate) {
        console.warn("[CWA] SKIPPED — missing task name or due date.");
      } else if (isSubmitted) {
        console.warn("[CWA] SKIPPED — assignment already submitted.");
      } else if (!hasAddSubmission) {
        console.warn("[CWA] SKIPPED — no 'Add submission' button found (not pending).");
      } else {
        // ── Date comparison: only keep future deadlines ─────────────────
        const parsedDate = parseMoodleDate(dueDate);
        if (parsedDate && parsedDate < now) {
          console.warn(`[CWA] SKIPPED — deadline has passed (${parsedDate.toLocaleDateString()}).`);
        } else {
          // ── Build the data object ────────────────────────────────────
          const item = {
            moduleName: moduleName || "Unknown Module",
            taskName: taskName,
            dueDate: dueDate,
          };
          deadlines.push(item);
          console.log("[CWA] ACCEPTED:", item);
        }
      }
    } catch (err) {
      console.error("[CWA] Error during collection:", err);
    }

    // ───────────────────────────────────────────────────────────────────────
    // 6. SUMMARY
    // ───────────────────────────────────────────────────────────────────────
    if (deadlines.length === 0) {
      console.warn("[CWA] No upcoming pending deadlines found on this page.");
    } else {
      console.info(`[CWA] Scrape complete — ${deadlines.length} upcoming deadline(s).`);
    }

    console.log("Scraped Deadlines:", deadlines);
    console.groupEnd();
    return deadlines;
  }

  // ─────────────────────────────────────────────────────────
  // 2.  CHROME STORAGE
  // ─────────────────────────────────────────────────────────
  function saveDeadlines(deadlines) {
    chrome.storage.local.set({ cwa_deadlines: deadlines }, () => {
      console.info(`[CWA] Saved ${deadlines.length} deadline(s).`);
    });
  }

  function loadDeadlines(callback) {
    chrome.storage.local.get(["cwa_deadlines"], (result) => {
      callback(result.cwa_deadlines || []);
    });
  }


  // ─────────────────────────────────────────────────────────
  // 3.  COUNTDOWN + PROGRESS HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Parse a due-date string into a Date object.
   * Tries native Date.parse first; falls back to keyword heuristics.
   */
  function parseDeadlineDate(dueStr) {
    const lower = dueStr.toLowerCase().trim();

    // Keyword shortcuts
    const now = new Date();
    if (lower === "today") { now.setHours(23, 59, 59, 0); return now; }
    if (lower === "tomorrow") { now.setDate(now.getDate() + 1); now.setHours(23, 59, 59, 0); return now; }
    if (lower === "overdue") return new Date(now - 1);   // 1ms in the past

    // Try native parse (handles "Mar 20", "2026-03-20", "20 March 2026", etc.)
    const parsed = new Date(dueStr);
    if (!isNaN(parsed)) return parsed;

    // Give up — return null to show "Unknown"
    return null;
  }

  /**
   * Build a "Xd Xh Xm Xs" string from a positive millisecond delta.
   */
  function formatCountdown(msLeft) {
    if (msLeft <= 0) return "Overdue";

    const totalSec = Math.floor(msLeft / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(" ") + " left";
  }

  /**
   * Returns Bootstrap progress-bar colour class based on days remaining.
   *   < 2 days  → bg-danger  (red)
   *   2–5 days  → bg-warning (yellow)
   *   > 5 days  → bg-success (green)
   */
  function progressBarClass(msLeft) {
    const days = msLeft / (1000 * 60 * 60 * 24);
    if (days < 2) return "bg-danger";
    if (days <= 5) return "bg-warning";
    return "bg-success";
  }

  /**
   * Compute how much of the deadline "window" has elapsed (0–100%).
   * 100% = deadline has passed.
   */
  function progressPercent(targetDate) {
    const windowMs = DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const startMs = targetDate.getTime() - windowMs;
    const now = Date.now();
    const elapsed = now - startMs;
    return Math.min(100, Math.max(0, Math.round((elapsed / windowMs) * 100)));
  }

  // ─────────────────────────────────────────────────────────
  // 4.  BUILD ONE DEADLINE ROW
  // ─────────────────────────────────────────────────────────
  /**
   * Creates a rich <li> card for a single deadline.
   * Data attributes store the ISO target date so the interval
   * can update the DOM without rebuilding elements.
   */
  function createDeadlineCard(moduleName, taskName, dueDate) {
    const targetDate = parseDeadlineDate(dueDate);
    const targetISO = targetDate ? targetDate.toISOString() : null;

    const li = document.createElement("li");
    li.style.cssText = "padding: 8px 16px; border-bottom: 1px solid #f0f0f0;";

    // ── Module name row ──────────────────────────────────
    const moduleRow = document.createElement("div");
    moduleRow.className = "d-flex align-items-center";
    moduleRow.style.marginBottom = "2px";

    const modIcon = document.createElement("i");
    modIcon.className = "fa fa-graduation-cap";
    modIcon.setAttribute("aria-hidden", "true");
    modIcon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.8rem;";

    const modSpan = document.createElement("span");
    modSpan.style.cssText = "font-size:.78rem; color:#6c757d; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;";
    modSpan.title = moduleName;
    modSpan.textContent = moduleName;

    moduleRow.appendChild(modIcon);
    moduleRow.appendChild(modSpan);

    // ── Task name row ────────────────────────────────────
    const nameRow = document.createElement("div");
    nameRow.className = "d-flex align-items-center";
    nameRow.style.marginBottom = "4px";

    const icon = document.createElement("i");
    icon.className = "fa fa-book";
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.85rem;";

    const nameSpan = document.createElement("span");
    nameSpan.style.cssText = "font-weight:600; font-size:.88rem; color:#212529; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;";
    nameSpan.title = taskName;
    nameSpan.textContent = taskName;

    nameRow.appendChild(icon);
    nameRow.appendChild(nameSpan);

    li.appendChild(moduleRow);

    // ── Countdown row ────────────────────────────────────
    const countdownRow = document.createElement("div");
    countdownRow.className = "d-flex align-items-center";
    countdownRow.style.marginBottom = "6px";

    const clockIcon = document.createElement("i");
    clockIcon.className = "fa fa-clock-o";
    clockIcon.setAttribute("aria-hidden", "true");
    clockIcon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.8rem;";

    const countdownSpan = document.createElement("span");
    countdownSpan.className = "cwa-countdown";
    countdownSpan.style.cssText = "font-size:.80rem; color:#495057;";

    if (targetDate) {
      countdownSpan.dataset.target = targetISO;
      const msLeft = targetDate - Date.now();
      countdownSpan.textContent = formatCountdown(msLeft);
    } else {
      countdownSpan.textContent = "Due: " + dueDate;
    }

    countdownRow.appendChild(clockIcon);
    countdownRow.appendChild(countdownSpan);

    // ── Progress bar ─────────────────────────────────────
    const progressWrap = document.createElement("div");
    progressWrap.className = "progress";
    progressWrap.style.cssText = "height:6px; border-radius:4px; background:#e9ecef;";

    const bar = document.createElement("div");
    bar.className = "cwa-bar progress-bar";
    bar.setAttribute("role", "progressbar");
    bar.style.cssText = "border-radius:4px; transition: width .8s ease, background-color .8s ease;";

    if (targetDate) {
      bar.dataset.target = targetISO;
      const pct = progressPercent(targetDate);
      const msLeft = targetDate - Date.now();
      const barClass = progressBarClass(msLeft);
      bar.style.width = pct + "%";
      bar.classList.add(barClass);
    } else {
      bar.style.width = "0%";
      bar.classList.add("bg-secondary");
    }

    progressWrap.appendChild(bar);

    li.appendChild(nameRow);
    li.appendChild(countdownRow);
    li.appendChild(progressWrap);

    return li;
  }

  // ─────────────────────────────────────────────────────────
  // 5.  LIVE TICKER — updates all countdown/bar elements
  // ─────────────────────────────────────────────────────────
  function startCountdownTicker() {
    // Clear any previous interval
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
      const now = Date.now();

      // Update every countdown span
      document.querySelectorAll(".cwa-countdown[data-target]").forEach((span) => {
        const target = new Date(span.dataset.target);
        span.textContent = formatCountdown(target - now);
      });

      // Update every progress bar
      document.querySelectorAll(".cwa-bar[data-target]").forEach((bar) => {
        const target = new Date(bar.dataset.target);
        const msLeft = target - now;
        const pct = progressPercent(target);
        const newClass = progressBarClass(msLeft);

        bar.style.width = pct + "%";

        // Swap colour class if urgency has changed
        ["bg-danger", "bg-warning", "bg-success", "bg-secondary"].forEach(
          (cls) => bar.classList.remove(cls)
        );
        bar.classList.add(newClass);
      });
    }, 1000);   // fires every second
  }

  // ─────────────────────────────────────────────────────────
  // 6.  BUILD FULL DROPDOWN
  // ─────────────────────────────────────────────────────────
  function buildDropdown(deadlines) {
    const navItem = document.createElement("li");
    navItem.className = "nav-item dropdown";
    navItem.id = "cwa-deadlines-menu";

    // Toggle button
    const toggle = document.createElement("a");
    toggle.className = "nav-link dropdown-toggle";
    toggle.href = "#";
    toggle.setAttribute("role", "button");
    toggle.setAttribute("data-bs-toggle", "dropdown");   // Bootstrap 5
    toggle.setAttribute("data-toggle", "dropdown");      // Bootstrap 4
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<i class="fa fa-calendar-check-o" aria-hidden="true" style="margin-right:5px;"></i>My Deadlines';
    toggle.style.cssText = "font-weight:600; color:rgba(255,255,255,.9) !important; cursor:pointer; transition:color .15s ease;";

    // Dropdown panel — wider to accommodate progress bars
    const menu = document.createElement("ul");
    menu.className = "dropdown-menu dropdown-menu-end shadow";
    menu.style.cssText = [
      "min-width: 360px",
      "background: #ffffff",
      "border: 1px solid rgba(0,0,0,.1)",
      "border-radius: 8px",
      "padding: 6px 0",
    ].join("; ");

    // Header
    const header = document.createElement("li");
    header.innerHTML = `
      <div style="padding:8px 16px 6px; border-bottom:1px solid #e9ecef;">
        <span style="font-size:.75rem; font-weight:700; letter-spacing:.07em; color:#6c757d; text-transform:uppercase;">
          <i class="fa fa-calendar" aria-hidden="true" style="margin-right:6px;"></i>Upcoming Deadlines
        </span>
      </div>`;
    menu.appendChild(header);

    // Deadline cards
    if (deadlines.length === 0) {
      const empty = document.createElement("li");
      empty.innerHTML = `
        <div style="padding:14px 16px; text-align:center; color:#6c757d; font-size:.87rem; font-style:italic;">
          <i class="fa fa-inbox" aria-hidden="true" style="margin-right:6px;"></i>No deadlines saved.
        </div>`;
      menu.appendChild(empty);
    } else {
      deadlines.forEach((item) => {
        // Support both old {label, due} and new {moduleName, taskName, dueDate} formats
        const mod = item.moduleName || "Unknown Module";
        const task = item.taskName || item.label || "Unknown Task";
        const due = item.dueDate || item.due || "Unknown";
        menu.appendChild(createDeadlineCard(mod, task, due));
      });
    }

    // Footer — re-scan button
    const footer = document.createElement("li");
    footer.innerHTML = `<div style="border-top:1px solid #e9ecef;"></div>`;
    const rescanLink = document.createElement("a");
    rescanLink.className = "dropdown-item text-center text-primary";
    rescanLink.href = "#";
    rescanLink.style.cssText = "font-size:.84rem; padding:8px 0;";
    rescanLink.innerHTML = '<i class="fa fa-refresh" aria-hidden="true" style="margin-right:5px;"></i>Re-scan Deadlines';

    rescanLink.addEventListener("click", (e) => {
      e.preventDefault();
      const fresh = scrapeDeadlines();
      if (fresh.length > 0) saveDeadlines(fresh);
      renderDropdown(fresh);
    });

    const footerLi = document.createElement("li");
    footerLi.appendChild(rescanLink);
    menu.appendChild(footer);
    menu.appendChild(footerLi);

    navItem.appendChild(toggle);
    navItem.appendChild(menu);
    return navItem;
  }

  // ─────────────────────────────────────────────────────────
  // 7.  RENDER
  // ─────────────────────────────────────────────────────────
  function renderDropdown(deadlines) {
    const existing = document.getElementById("cwa-deadlines-menu");
    const newMenu = buildDropdown(deadlines);

    if (existing) {
      existing.replaceWith(newMenu);
    } else {
      const navBar = document.querySelector(NAVBAR_SELECTOR);
      if (!navBar) {
        console.warn("[CWA] Navbar not found. Update NAVBAR_SELECTOR.");
        return;
      }
      navBar.appendChild(newMenu);
    }

    // Start / restart the live 1-second ticker
    startCountdownTicker();
    console.info("[CWA] Dropdown rendered with real-time countdowns.");
  }

  // ─────────────────────────────────────────────────────────
  // 8.  ENTRY POINT
  // ─────────────────────────────────────────────────────────
  function init() {
    const scraped = scrapeDeadlines();
    if (scraped.length > 0) saveDeadlines(scraped);

    loadDeadlines((saved) => {
      renderDropdown(saved.length > 0 ? saved : scraped);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
