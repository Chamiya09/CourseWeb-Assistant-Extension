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
    console.group("[CWA] scrapeDeadlines() — CourseWeb exact-match strategy");
    console.log("[CWA] Page:", location.href);

    const deadlines = [];

    // ───────────────────────────────────────────────────────────────────────
    // GATE: Only scrape if an "Add submission" button exists on this page.
    // This confirms the assignment is pending (not yet submitted).
    // Real DOM: <button class="btn btn-primary">Add submission</button>
    // ───────────────────────────────────────────────────────────────────────
    const allButtons = document.querySelectorAll("button, a, .btn");
    const addBtn = Array.from(allButtons).find(
      (el) => el.textContent.trim().toLowerCase() === "add submission"
    );

    console.log("[CWA] 'Add submission' button:", addBtn ? "FOUND" : "NOT FOUND");

    if (!addBtn) {
      // No pending assignment on this page — load previously saved data instead
      console.log("[CWA] This page has no pending submission. Skipping scrape.");
      console.groupEnd();
      return deadlines;
    }

    // ───────────────────────────────────────────────────────────────────────
    // 1. ASSIGNMENT NAME
    //    Real DOM:  <h2>Practical sheet 8 answer - Submission link ...</h2>
    //              inside #region-main
    //    Fallback:  data-activityname attribute on .activity-information
    // ───────────────────────────────────────────────────────────────────────
    let label = null;

    // Primary: the <h2> directly inside #region-main (before the activity-header)
    const h2El = document.querySelector("#region-main > span + h2, #region-main h2");
    if (h2El) {
      label = h2El.textContent.trim().replace(/\s+/g, " ");
      console.log(`[CWA] Name via #region-main h2: "${label}"`);
    }

    // Fallback 1: data-activityname attribute
    if (!label) {
      const infoEl = document.querySelector("[data-activityname]");
      if (infoEl) {
        label = infoEl.getAttribute("data-activityname").trim();
        console.log(`[CWA] Name via data-activityname: "${label}"`);
      }
    }

    // Fallback 2: page heading
    if (!label) {
      const pageH = document.querySelector(".page-header-headings h1, h1");
      if (pageH) {
        label = pageH.textContent.trim().replace(/\s+/g, " ");
        console.log(`[CWA] Name via page <h1>: "${label}"`);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2. DUE DATE
    //    Real DOM:  Inside [data-region="activity-dates"], there are <div>s:
    //      <div><strong>Opened:</strong> Monday, 16 March 2026, 12:00 AM</div>
    //      <div><strong>Due:</strong> Sunday, 22 March 2026, 11:30 PM</div>
    //    We specifically want the one starting with "Due:".
    // ───────────────────────────────────────────────────────────────────────
    let due = null;

    const activityDates = document.querySelector('[data-region="activity-dates"]');
    if (activityDates) {
      // Scan each child <div> inside the activity-dates container
      const dateDivs = activityDates.querySelectorAll("div");
      dateDivs.forEach((div) => {
        const rawText = div.textContent.trim();
        // Match the "Due:" prefix and extract the date after it
        const match = rawText.match(/^Due:\s*(.+)$/i);
        if (match) {
          due = match[1].trim();
          console.log(`[CWA] Due date via [data-region="activity-dates"]: "${due}"`);
        }
      });
    }

    // Fallback: "Time remaining" row in the submission status table
    if (!due) {
      const timeRemainingCell = document.querySelector(".timeremaining");
      if (timeRemainingCell) {
        due = timeRemainingCell.textContent.trim();
        console.log(`[CWA] Due date via .timeremaining fallback: "${due}"`);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // 3. COLLECT
    // ───────────────────────────────────────────────────────────────────────
    console.log(`[CWA] Resolved → label: ${label ? `"${label}"` : "NOT FOUND"}`);
    console.log(`[CWA] Resolved → due  : ${due ? `"${due}"` : "NOT FOUND"}`);

    if (label && due) {
      deadlines.push({ label, due });
      console.log("[CWA] ACCEPTED:", { label, due });
    } else {
      console.warn(
        "[CWA] Could not extract name and/or due date.\n" +
        "Name source: #region-main h2, [data-activityname], or h1\n" +
        'Date source: [data-region="activity-dates"] div containing "Due:"'
      );
    }

    // ── Final log for easy console verification ──────────────────────────
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
  function createDeadlineCard(label, due) {
    const targetDate = parseDeadlineDate(due);
    const targetISO = targetDate ? targetDate.toISOString() : null;

    const li = document.createElement("li");
    li.style.cssText = "padding: 8px 16px; border-bottom: 1px solid #f0f0f0;";

    // ── Module name row ──────────────────────────────────
    const nameRow = document.createElement("div");
    nameRow.className = "d-flex align-items-center";
    nameRow.style.marginBottom = "4px";

    const icon = document.createElement("i");
    icon.className = "fa fa-book";
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.85rem;";

    const nameSpan = document.createElement("span");
    nameSpan.style.cssText = "font-weight:600; font-size:.88rem; color:#212529; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:230px;";
    nameSpan.title = label;
    nameSpan.textContent = label;

    nameRow.appendChild(icon);
    nameRow.appendChild(nameSpan);

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
      countdownSpan.textContent = "Due: " + due;
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
      deadlines.forEach(({ label, due }) => {
        menu.appendChild(createDeadlineCard(label, due));
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
