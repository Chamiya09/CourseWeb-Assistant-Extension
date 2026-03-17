// ============================================================
// CourseWeb Assistant - content.js  v2.0
// Scrapes deadlines, saves to chrome.storage, injects UI.
// ============================================================

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────
  // 1.  DATA SCRAPING
  //     Selectors below are PLACEHOLDERS — inspect CourseWeb's
  //     real DOM and replace them with the actual class names.
  // ─────────────────────────────────────────────────────────
  const SELECTORS = {
    activityItem: ".activity-item, .assignment-card",  // wrapper for each task
    moduleName: ".instancename, .activity-name",     // element holding the title
    dueDate: ".deadline-date, .due-date",         // element holding the date
  };

  /**
   * scrapeDeadlines()
   * Walks the page DOM, extracts module names + due dates,
   * and returns an array of { label, due } objects.
   */
  function scrapeDeadlines() {
    const items = document.querySelectorAll(SELECTORS.activityItem);
    const deadlines = [];

    items.forEach((item) => {
      const nameEl = item.querySelector(SELECTORS.moduleName);
      const dateEl = item.querySelector(SELECTORS.dueDate);

      if (nameEl && dateEl) {
        const label = nameEl.textContent.trim();
        const due = dateEl.textContent.trim();

        if (label && due) {
          deadlines.push({ label, due });
        }
      }
    });

    return deadlines;
  }

  // ─────────────────────────────────────────────────────────
  // 2.  CHROME STORAGE  — Save & Load
  // ─────────────────────────────────────────────────────────

  /**
   * saveDeadlines(deadlines)
   * Persists the scraped array to chrome.storage.local.
   */
  function saveDeadlines(deadlines) {
    chrome.storage.local.set({ cwa_deadlines: deadlines }, () => {
      console.info(`[CourseWeb Assistant] 💾 Saved ${deadlines.length} deadline(s).`);
    });
  }

  /**
   * loadDeadlines(callback)
   * Reads saved deadlines back from chrome.storage.local,
   * then calls callback(deadlines).
   */
  function loadDeadlines(callback) {
    chrome.storage.local.get(["cwa_deadlines"], (result) => {
      const saved = result.cwa_deadlines || [];
      callback(saved);
    });
  }

  // ─────────────────────────────────────────────────────────
  // 3.  UI HELPERS — Build dropdown items
  // ─────────────────────────────────────────────────────────

  /**
   * Applies a Bootstrap badge colour based on how soon
   * the deadline is relative to today.
   */
  function getBadgeClass(dueText) {
    const lower = dueText.toLowerCase();
    if (lower.includes("today") || lower.includes("overdue")) return "bg-danger";
    if (lower.includes("tomorrow")) return "bg-warning text-dark";
    return "bg-secondary";
  }

  /** Builds one <li> row for the dropdown list. */
  function createDeadlineItem(label, due) {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.className = "dropdown-item d-flex justify-content-between align-items-center py-2";
    a.href = "#";

    // Module name
    const nameSpan = document.createElement("span");
    nameSpan.className = "cwa-item-label";
    nameSpan.style.cssText = "max-width:170px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    nameSpan.textContent = label;

    // Due-date badge
    const badge = document.createElement("span");
    badge.className = `badge ${getBadgeClass(due)} ms-2 flex-shrink-0`;
    badge.style.fontSize = "0.72rem";
    badge.textContent = due;

    a.appendChild(nameSpan);
    a.appendChild(badge);
    li.appendChild(a);
    return li;
  }

  // ─────────────────────────────────────────────────────────
  // 4.  UI BUILD — Assemble the full dropdown <li>
  // ─────────────────────────────────────────────────────────
  function buildDropdown(deadlines) {
    // ── Outer nav-item wrapper ──────────────────────────────
    const navItem = document.createElement("li");
    navItem.className = "nav-item dropdown";
    navItem.id = "cwa-deadlines-menu";

    // ── Toggle link (matches Moodle/Bootstrap navbar style) ─
    const toggle = document.createElement("a");
    toggle.className = "nav-link dropdown-toggle";
    toggle.href = "#";
    toggle.setAttribute("role", "button");
    toggle.setAttribute("data-bs-toggle", "dropdown");   // Bootstrap 5
    toggle.setAttribute("data-toggle", "dropdown");      // Bootstrap 4 fallback
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "&#x1F4CB;&nbsp;My Deadlines";

    // Subtle inline style overrides so we blend with the native navbar
    toggle.style.cssText = [
      "font-weight: 600",
      "color: rgba(255,255,255,.9) !important",           // Moodle default nav text
      "cursor: pointer",
      "transition: color .15s ease",
    ].join("; ");

    toggle.addEventListener("mouseenter", () => {
      toggle.style.color = "#ffffff !important";
      toggle.style.textDecoration = "none";
    });

    // ── Dropdown menu panel ─────────────────────────────────
    const menu = document.createElement("ul");
    menu.className = "dropdown-menu dropdown-menu-end shadow-sm";
    menu.style.cssText = [
      "min-width: 290px",
      "background: #ffffff",
      "border: 1px solid rgba(0,0,0,.1)",
      "border-radius: 8px",
      "padding: 4px 0",
    ].join("; ");

    // Header
    const header = document.createElement("li");
    header.innerHTML = `
      <h6 class="dropdown-header d-flex align-items-center gap-1" style="font-size:.8rem; letter-spacing:.04em;">
        <span>📅</span><span>UPCOMING DEADLINES</span>
      </h6>`;
    menu.appendChild(header);

    const hr1 = document.createElement("li");
    hr1.innerHTML = `<hr class="dropdown-divider my-1">`;
    menu.appendChild(hr1);

    // Deadline rows  (fallback message if none found)
    if (deadlines.length === 0) {
      const empty = document.createElement("li");
      empty.innerHTML = `
        <span class="dropdown-item text-muted fst-italic" style="font-size:.88rem;">
          No deadlines found on this page.
        </span>`;
      menu.appendChild(empty);
    } else {
      deadlines.forEach(({ label, due }) => {
        menu.appendChild(createDeadlineItem(label, due));
      });
    }

    // Footer
    const hr2 = document.createElement("li");
    hr2.innerHTML = `<hr class="dropdown-divider my-1">`;
    menu.appendChild(hr2);

    const footer = document.createElement("li");
    const refreshLink = document.createElement("a");
    refreshLink.className = "dropdown-item text-center text-primary";
    refreshLink.href = "#";
    refreshLink.style.fontSize = ".85rem";
    refreshLink.textContent = "🔄 Re-scan Deadlines";

    // Re-scan: scrape → save → rebuild the menu
    refreshLink.addEventListener("click", (e) => {
      e.preventDefault();
      const fresh = scrapeDeadlines();
      saveDeadlines(fresh);
      renderDropdown(fresh);   // re-render in place
    });

    footer.appendChild(refreshLink);
    menu.appendChild(footer);

    navItem.appendChild(toggle);
    navItem.appendChild(menu);

    return navItem;
  }

  // ─────────────────────────────────────────────────────────
  // 5.  RENDER — Insert / replace dropdown in the navbar
  // ─────────────────────────────────────────────────────────
  function renderDropdown(deadlines) {
    const existing = document.getElementById("cwa-deadlines-menu");
    const newMenu = buildDropdown(deadlines);

    if (existing) {
      // Replace in-place so the position in the navbar is preserved
      existing.replaceWith(newMenu);
    } else {
      // PLACEHOLDER selector — update after inspecting CourseWeb's real DOM
      const navBar = document.querySelector(".navbar-nav");
      if (!navBar) {
        console.warn("[CourseWeb Assistant] ⚠️ Navbar not found. Update the selector.");
        return;
      }
      navBar.appendChild(newMenu);
    }

    console.info("[CourseWeb Assistant] ✅ Dropdown rendered.");
  }

  // ─────────────────────────────────────────────────────────
  // 6.  ENTRY POINT
  //     • Scrape the page → save fresh data
  //     • Load from storage → inject the UI
  // ─────────────────────────────────────────────────────────
  function init() {
    // Scrape immediately and persist
    const scraped = scrapeDeadlines();
    if (scraped.length > 0) {
      saveDeadlines(scraped);
    }

    // Always load from storage so previously saved deadlines
    // show up even on pages that have no activity listings.
    loadDeadlines((saved) => {
      const toDisplay = saved.length > 0 ? saved : scraped;
      renderDropdown(toDisplay);
    });
  }

  // Wait for full DOM before running
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
