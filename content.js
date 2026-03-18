// ============================================================
// CourseWeb Assistant - content.js  v5.0
// URL-aware deadlines with To Do/Overdue + center filtering.
// ============================================================

(function () {
  "use strict";

  const NAVBAR_SELECTOR = ".navbar-nav";
  const DEADLINE_WINDOW_DAYS = 7;
  const STORAGE_KEY = "cwa_deadlines";
  const CAMPUS_STORAGE_KEY = "selectedCampus";
  const DEFAULT_CAMPUS = "All Centers (Show All)";
  const CAMPUS_OPTIONS = [
    "All Centers (Show All)",
    "Malabe",
    "Northern Uni",
    "Kandy Uni",
    "Matara Center",
    "Prorata",
  ];
  const CENTER_KEYWORDS = ["malabe", "northern", "kandy", "matara", "prorata"];
  const moduleNameCache = {};

  let countdownInterval = null;
  let activeFilter = "todo"; // "todo" | "overdue"
  let selectedCampus = DEFAULT_CAMPUS;

  function injectModernFilterStyles() {
    if (document.getElementById("cwa-modern-filter-styles")) return;

    const style = document.createElement("style");
    style.id = "cwa-modern-filter-styles";
    style.textContent = [
      ".cwa-segmented-control {",
      "  position: relative;",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 4px;",
      "  padding: 4px;",
      "  border-radius: 50px;",
      "  background: rgba(233, 236, 239, 0.7);",
      "  backdrop-filter: blur(6px);",
      "  -webkit-backdrop-filter: blur(6px);",
      "  border: 1px solid rgba(0, 0, 0, 0.05);",
      "  overflow: hidden;",
      "}",
      ".cwa-segmented-control::before {",
      "  content: '';",
      "  position: absolute;",
      "  top: 4px;",
      "  left: 4px;",
      "  width: calc(50% - 4px);",
      "  height: calc(100% - 8px);",
      "  border-radius: 999px;",
      "  background: #ffffff;",
      "  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);",
      "  transform: translateX(0);",
      "  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;",
      "}",
      ".cwa-segmented-control[data-active='overdue']::before {",
      "  transform: translateX(calc(100% + 4px));",
      "}",
      ".cwa-segment-btn {",
      "  position: relative;",
      "  z-index: 1;",
      "  flex: 1;",
      "  border: 0;",
      "  background: transparent;",
      "  border-radius: 999px;",
      "  padding: 6px 10px;",
      "  font-size: 0.76rem;",
      "  font-weight: 700;",
      "  letter-spacing: 0.01em;",
      "  color: #6c757d;",
      "  transition: color 220ms ease, transform 220ms ease;",
      "}",
      ".cwa-segment-btn:hover {",
      "  color: #495057;",
      "}",
      ".cwa-segment-btn:focus {",
      "  outline: none;",
      "}",
      ".cwa-segment-btn.active {",
      "  color: #0f172a;",
      "  transform: translateY(-1px);",
      "}",
      ".cwa-segment-btn i {",
      "  margin-right: 5px;",
      "}",
      ".cwa-campus-select-wrap {",
      "  margin-top: 8px;",
      "}",
      ".cwa-campus-select {",
      "  border-radius: 12px;",
      "  font-size: 0.76rem;",
      "  font-weight: 600;",
      "  border: 1px solid rgba(15, 23, 42, 0.12);",
      "  background-color: rgba(255, 255, 255, 0.92);",
      "  color: #334155;",
      "  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);",
      "  transition: border-color 180ms ease, box-shadow 180ms ease;",
      "}",
      ".cwa-campus-select:focus {",
      "  border-color: rgba(13, 110, 253, 0.55);",
      "  box-shadow: 0 0 0 0.15rem rgba(13, 110, 253, 0.15);",
      "}",
    ].join("\n");

    document.head.appendChild(style);
  }

  function applyTimePart(baseDate, timeStr) {
    if (!timeStr) {
      baseDate.setHours(23, 59, 59, 0);
      return baseDate;
    }

    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const ampm = (match[3] || "").toUpperCase();

      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      baseDate.setHours(hours, mins, 0, 0);
      return baseDate;
    }

    baseDate.setHours(23, 59, 59, 0);
    return baseDate;
  }

  function parseDeadlineDate(dueStr) {
    if (!dueStr) return null;

    const raw = String(dueStr).trim();
    const lower = raw.toLowerCase();

    if (lower.startsWith("today")) {
      const timePart = raw.replace(/^today[,\s]*/i, "").trim();
      return applyTimePart(new Date(), timePart);
    }

    if (lower.startsWith("tomorrow")) {
      const base = new Date();
      const timePart = raw.replace(/^tomorrow[,\s]*/i, "").trim();
      base.setDate(base.getDate() + 1);
      return applyTimePart(base, timePart);
    }

    if (lower.startsWith("yesterday")) {
      const base = new Date();
      const timePart = raw.replace(/^yesterday[,\s]*/i, "").trim();
      base.setDate(base.getDate() - 1);
      return applyTimePart(base, timePart);
    }

    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const firstWord = lower.split(/[,\s]/)[0];
    const dayIdx = dayNames.indexOf(firstWord);
    if (dayIdx !== -1) {
      const base = new Date();
      const timePart = raw.replace(/^[a-z]+[,\s]*/i, "").trim();
      let diff = dayIdx - base.getDay();
      if (diff <= 0) diff += 7;
      base.setDate(base.getDate() + diff);
      return applyTimePart(base, timePart);
    }

    const cleaned = raw.replace(/^[a-z]+,\s*/i, "").trim();
    const parsedClean = new Date(cleaned);
    if (!isNaN(parsedClean.getTime())) return parsedClean;

    const parsedRaw = new Date(raw);
    if (!isNaN(parsedRaw.getTime())) return parsedRaw;

    return null;
  }

  function formatCountdown(msLeft) {
    if (msLeft <= 0) return "Overdue";

    const totalSec = Math.floor(msLeft / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const parts = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0) parts.push(h + "h");
    if (m > 0) parts.push(m + "m");
    parts.push(s + "s");

    return parts.join(" ") + " left";
  }

  function progressBarClass(msLeft) {
    const days = msLeft / (1000 * 60 * 60 * 24);
    if (days < 2) return "bg-danger";
    if (days <= 5) return "bg-warning";
    return "bg-success";
  }

  function progressPercent(targetDate) {
    const windowMs = DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const startMs = targetDate.getTime() - windowMs;
    const now = Date.now();
    const elapsed = now - startMs;
    return Math.min(100, Math.max(0, Math.round((elapsed / windowMs) * 100)));
  }

  async function scrapeDeadlines() {
    const deadlines = [];

    const eventItems = document.querySelectorAll(
      '.event[data-eventtype-course="1"]'
    );

    async function resolveModuleAcronym(url) {
      if (!url) return "GEN";
      if (moduleNameCache[url]) return moduleNameCache[url];

      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          moduleNameCache[url] = "GEN";
          return "GEN";
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        const courseLink = doc.querySelector('.breadcrumb a[href*="/course/view.php?id="]');
        const fullCourseName = courseLink ? courseLink.textContent.trim() : "";

        const acronym = generateAcronym(fullCourseName);
        moduleNameCache[url] = acronym;
        return acronym;
      } catch (_error) {
        moduleNameCache[url] = "GEN";
        return "GEN";
      }
    }

    const processedItems = await Promise.all(Array.from(eventItems).map(async function (event) {
      const isCourseEvent = event.getAttribute("data-eventtype-course") === "1";
      const isSiteEvent = event.getAttribute("data-eventtype-site") === "1";
      if (!isCourseEvent || isSiteEvent) return null;

      const taskLink = event.querySelector("h4 a, [data-region='event-name'] a, .eventname a, a[href*='assign']");
      const taskNameRaw = taskLink
        ? (taskLink.getAttribute("title") || taskLink.textContent || "")
        : ((event.querySelector("h4") || {}).textContent || "");

      const taskName = taskNameRaw
        .replace(/\s+is\s+due$/i, "")
        .trim()
        .replace(/\s+/g, " ");

      const dateNode = event.querySelector(".date.small, .date, [data-region='event-date'], time[datetime]");
      const dueDate = dateNode ? dateNode.textContent.trim().replace(/\s+/g, " ") : "";

      let url = "";
      if (taskLink && taskLink.getAttribute("href")) {
        try {
          url = new URL(taskLink.getAttribute("href"), window.location.origin).href;
        } catch (e) {
          url = taskLink.getAttribute("href");
        }
      }

      if (!taskName || !dueDate) return null;

      const moduleAcronym = await resolveModuleAcronym(url);

      return {
        taskName: taskName,
        dueDate: dueDate,
        url: url,
        moduleAcronym: moduleAcronym,
      };
    }));

    processedItems.forEach(function (item) {
      if (!item) return;
      const duplicate = deadlines.some(function (existing) {
        return existing.taskName === item.taskName && existing.dueDate === item.dueDate && existing.url === item.url;
      });
      if (!duplicate) deadlines.push(item);
    });

    console.info("[CWA] Scraped deadlines:", deadlines.length);
    return deadlines;
  }

  function saveDeadlines(deadlines) {
    chrome.storage.local.set({
      [STORAGE_KEY]: deadlines,
    }, function () {
      console.info("[CWA] Saved deadlines:", deadlines.length);
    });
  }

  function loadDeadlines(callback) {
    chrome.storage.local.get([STORAGE_KEY], function (result) {
      callback(result[STORAGE_KEY] || []);
    });
  }

  function saveSelectedCampus(campusValue) {
    chrome.storage.local.set({
      [CAMPUS_STORAGE_KEY]: campusValue,
    });
  }

  function loadSelectedCampus(callback) {
    chrome.storage.local.get([CAMPUS_STORAGE_KEY], function (result) {
      const stored = result[CAMPUS_STORAGE_KEY];
      if (!stored || CAMPUS_OPTIONS.indexOf(stored) === -1) {
        callback(DEFAULT_CAMPUS);
        return;
      }
      callback(stored);
    });
  }

  function extractCampusScope(taskName) {
    const rawTitle = String(taskName || "");
    const parenthesized = [];

    rawTitle.replace(/\(([^)]*)\)/g, function (_match, group) {
      if (group) parenthesized.push(group);
      return _match;
    });

    // Capture ALL-CAPS chunks that often carry center hints.
    const uppercaseChunks = rawTitle.match(/\b[A-Z][A-Z\s]{2,}\b/g) || [];

    return parenthesized.concat(uppercaseChunks).join(" ").toLowerCase().trim();
  }

  function detectMentionedCampuses(scopeText) {
    const scope = String(scopeText || "").toLowerCase().trim();
    return CENTER_KEYWORDS.filter(function (center) {
      return scope.includes(center);
    });
  }

  function normalizeSelectedCampus(campusLabel) {
    if (!campusLabel || campusLabel === DEFAULT_CAMPUS) return "all";
    const lower = campusLabel.toLowerCase();
    if (lower.indexOf("malabe") !== -1) return "malabe";
    if (lower.indexOf("northern") !== -1) return "northern";
    if (lower.indexOf("kandy") !== -1) return "kandy";
    if (lower.indexOf("matara") !== -1) return "matara";
    if (lower.indexOf("prorata") !== -1 || lower.indexOf("pro rata") !== -1) return "prorata";
    return lower;
  }

  function generateAcronym(fullCourseName) {
    if (!fullCourseName) return "GEN";

    const stopWords = ["and", "of", "the", "for", "in", "to", "a", "&"];
    const raw = String(fullCourseName).trim();

    // Primary extraction: text between first hyphen and opening bracket.
    const match = raw.match(/-\s*(.+?)\s*\[/);

    let coreName = "";
    if (match && match[1]) {
      coreName = match[1].trim();
    } else {
      // Fallback: split by '-' and use second segment if available.
      const parts = raw.split("-");
      coreName = parts.length > 1 ? parts.slice(1).join("-").trim() : raw;
    }

    if (!coreName) return "GEN";

    const words = coreName
      .split(/\s+/)
      .map(function (word) {
        return word.replace(/[^A-Za-z0-9&]/g, "").trim();
      })
      .filter(function (word) {
        return word && stopWords.indexOf(word.toLowerCase()) === -1;
      });

    if (words.length === 0) return "GEN";

    return words
      .map(function (word) {
        return word.charAt(0).toUpperCase();
      })
      .join("");
  }

  function filterByCampus(deadlines, campusLabel) {
    const allModifiers = ["MALABE", "KANDY", "MATARA", "NORTHERN", "PRORATA", "ALL CENTERS"];
    const selectedKey = normalizeSelectedCampus(campusLabel);
    const selectedCampusUpper = String(campusLabel || "").toUpperCase().trim();
    const selectedKeyUpper = String(selectedKey || "").toUpperCase().trim();

    return deadlines.filter(function (item) {
      const titleUpper = String(item.taskName || "").toUpperCase().trim();

      // Rule 1 (Show All)
      if (campusLabel === DEFAULT_CAMPUS || selectedKey === "all") return true;

      // Rule 2 (Exact Match)
      if (selectedCampusUpper && titleUpper.includes(selectedCampusUpper)) return true;
      if (selectedKeyUpper && selectedKeyUpper !== "ALL" && titleUpper.includes(selectedKeyUpper)) return true;

      // Rule 3 (Strict Exclusion)
      for (let i = 0; i < allModifiers.length; i += 1) {
        const modifier = allModifiers[i];
        if (!titleUpper.includes(modifier)) continue;

        const isSelectedModifier = modifier === selectedCampusUpper || modifier === selectedKeyUpper;
        if (!isSelectedModifier) return false;
      }

      // Rule 4 (Generic Allowed)
      return true;
    });
  }

  function createTodoCard(item) {
    const targetDate = parseDeadlineDate(item.dueDate);
    const targetISO = targetDate ? targetDate.toISOString() : "";

    const li = document.createElement("li");
    li.style.cssText = "padding: 10px 16px; border-bottom: 1px solid #f0f0f0;";

    const nameRow = document.createElement("div");
    nameRow.className = "d-flex align-items-center mb-1";

    const icon = document.createElement("i");
    icon.className = "fa fa-book";
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.86rem;";

    const badge = document.createElement("span");
    badge.className = "badge rounded-pill bg-primary me-2";
    badge.style.cssText = "font-size: 0.75em;";
    badge.textContent = item.moduleAcronym || "GEN";

    const link = document.createElement("a");
    link.href = item.url || "#";
    link.className = "text-decoration-none";
    link.style.cssText = "font-weight:600; font-size:.88rem; color:#0d6efd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px; display:inline-block;";
    link.title = item.taskName;
    link.textContent = item.taskName;

    nameRow.appendChild(icon);
    nameRow.appendChild(badge);
    nameRow.appendChild(link);

    const dueRow = document.createElement("div");
    dueRow.className = "d-flex align-items-center mb-2";

    const dueIcon = document.createElement("i");
    dueIcon.className = "fa fa-calendar";
    dueIcon.setAttribute("aria-hidden", "true");
    dueIcon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.8rem;";

    const dueText = document.createElement("span");
    dueText.style.cssText = "font-size:.79rem; color:#6c757d;";
    dueText.textContent = item.dueDate;

    dueRow.appendChild(dueIcon);
    dueRow.appendChild(dueText);

    const countdownRow = document.createElement("div");
    countdownRow.className = "d-flex align-items-center mb-2";

    const clockIcon = document.createElement("i");
    clockIcon.className = "fa fa-clock-o";
    clockIcon.setAttribute("aria-hidden", "true");
    clockIcon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.8rem;";

    const countdownSpan = document.createElement("span");
    countdownSpan.className = "cwa-countdown";
    countdownSpan.style.cssText = "font-size:.8rem; color:#495057;";

    if (targetDate) {
      countdownSpan.dataset.target = targetISO;
      countdownSpan.textContent = formatCountdown(targetDate.getTime() - Date.now());
    } else {
      countdownSpan.textContent = "Due: " + item.dueDate;
    }

    countdownRow.appendChild(clockIcon);
    countdownRow.appendChild(countdownSpan);

    const progressWrap = document.createElement("div");
    progressWrap.className = "progress";
    progressWrap.style.cssText = "height:6px; border-radius:4px; background:#e9ecef;";

    const bar = document.createElement("div");
    bar.className = "cwa-bar progress-bar";
    bar.setAttribute("role", "progressbar");
    bar.style.cssText = "border-radius:4px; transition:width .8s ease, background-color .8s ease;";

    if (targetDate) {
      const msLeft = targetDate.getTime() - Date.now();
      bar.dataset.target = targetISO;
      bar.style.width = progressPercent(targetDate) + "%";
      bar.classList.add(progressBarClass(msLeft));
    } else {
      bar.style.width = "0%";
      bar.classList.add("bg-secondary");
    }

    progressWrap.appendChild(bar);

    li.appendChild(nameRow);
    li.appendChild(dueRow);
    li.appendChild(countdownRow);
    li.appendChild(progressWrap);

    return li;
  }

  function createOverdueCard(item) {
    const li = document.createElement("li");
    li.style.cssText = "padding: 10px 16px; border-bottom: 1px solid #f0f0f0;";

    const topRow = document.createElement("div");
    topRow.className = "d-flex justify-content-between align-items-start mb-1";

    const titleWrap = document.createElement("div");
    titleWrap.className = "d-flex align-items-center";
    titleWrap.style.cssText = "min-width:0;";

    const icon = document.createElement("i");
    icon.className = "fa fa-book";
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.86rem;";

    const acronymBadge = document.createElement("span");
    acronymBadge.className = "badge rounded-pill bg-primary me-2";
    acronymBadge.style.cssText = "font-size: 0.75em;";
    acronymBadge.textContent = item.moduleAcronym || "GEN";

    const link = document.createElement("a");
    link.href = item.url || "#";
    link.className = "text-decoration-none";
    link.style.cssText = "font-weight:600; font-size:.88rem; color:#0d6efd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; display:inline-block;";
    link.title = item.taskName;
    link.textContent = item.taskName;

    titleWrap.appendChild(icon);
    titleWrap.appendChild(acronymBadge);
    titleWrap.appendChild(link);

    const overdueBadge = document.createElement("span");
    overdueBadge.className = "badge bg-danger";
    overdueBadge.innerHTML = '<i class="fa fa-exclamation-circle" aria-hidden="true" style="margin-right:4px;"></i>Missing/Overdue';

    topRow.appendChild(titleWrap);
    topRow.appendChild(overdueBadge);

    const dueRow = document.createElement("div");
    dueRow.className = "d-flex align-items-center";

    const dueIcon = document.createElement("i");
    dueIcon.className = "fa fa-calendar";
    dueIcon.setAttribute("aria-hidden", "true");
    dueIcon.style.cssText = "color:#6c757d; margin-right:7px; font-size:.8rem;";

    const dueText = document.createElement("span");
    dueText.style.cssText = "font-size:.79rem; color:#6c757d;";
    dueText.textContent = item.dueDate;

    dueRow.appendChild(dueIcon);
    dueRow.appendChild(dueText);

    li.appendChild(topRow);
    li.appendChild(dueRow);
    return li;
  }

  function filterDeadlines(deadlines, filter) {
    const now = new Date();

    return deadlines.filter(function (item) {
      const parsed = parseDeadlineDate(item.dueDate);
      if (!parsed) return false;

      if (filter === "todo") return parsed >= now;
      return parsed < now;
    });
  }

  function renderDeadlines(listRoot, deadlines, filter) {
    while (listRoot.firstChild) {
      listRoot.removeChild(listRoot.firstChild);
    }

    const campusFiltered = filterByCampus(deadlines, selectedCampus);
    const filtered = filterDeadlines(campusFiltered, filter)
      .sort(function (a, b) {
        return parseDeadlineDate(a.dueDate) - parseDeadlineDate(b.dueDate);
      });

    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.innerHTML =
        '<div style="padding:14px 16px; text-align:center; color:#6c757d; font-size:.87rem; font-style:italic;">'
        + '<i class="fa fa-inbox" aria-hidden="true" style="margin-right:6px;"></i>'
        + (filter === "todo" ? "No upcoming deadlines." : "No overdue deadlines.")
        + "</div>";
      listRoot.appendChild(empty);
      return;
    }

    filtered.forEach(function (item) {
      if (filter === "todo") {
        listRoot.appendChild(createTodoCard(item));
      } else {
        listRoot.appendChild(createOverdueCard(item));
      }
    });
  }

  function startCountdownTicker() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(function () {
      const now = Date.now();

      document.querySelectorAll(".cwa-countdown[data-target]").forEach(function (span) {
        const target = new Date(span.dataset.target);
        span.textContent = formatCountdown(target.getTime() - now);
      });

      document.querySelectorAll(".cwa-bar[data-target]").forEach(function (bar) {
        const target = new Date(bar.dataset.target);
        const msLeft = target.getTime() - now;
        const daysLeft = msLeft / (1000 * 60 * 60 * 24);

        let urgencyClass = "bg-danger";
        if (daysLeft > 4) {
          urgencyClass = "bg-success";
        } else if (daysLeft >= 1 && daysLeft <= 4) {
          urgencyClass = "bg-warning";
        }

        bar.style.width = progressPercent(target) + "%";
        ["bg-danger", "bg-warning", "bg-success", "bg-secondary"].forEach(function (cls) {
          bar.classList.remove(cls);
        });
        bar.classList.add(urgencyClass);
      });
    }, 1000);
  }

  function updateTabButtons(todoBtn, overdueBtn) {
    const control = todoBtn.closest(".cwa-segmented-control");

    if (activeFilter === "todo") {
      todoBtn.classList.add("active");
      overdueBtn.classList.remove("active");
      if (control) control.setAttribute("data-active", "todo");
    } else {
      todoBtn.classList.remove("active");
      overdueBtn.classList.add("active");
      if (control) control.setAttribute("data-active", "overdue");
    }
  }

  function buildDropdown(deadlines) {
    const navItem = document.createElement("li");
    navItem.className = "nav-item dropdown";
    navItem.id = "cwa-deadlines-menu";

    const toggle = document.createElement("a");
    toggle.className = "nav-link dropdown-toggle";
    toggle.href = "#";
    toggle.setAttribute("role", "button");
    toggle.setAttribute("data-bs-toggle", "dropdown");
    toggle.setAttribute("data-toggle", "dropdown");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<i class="fa fa-calendar-check-o" aria-hidden="true" style="margin-right:5px;"></i>My Deadlines';
    toggle.style.cssText = "font-weight:600; color:rgba(255,255,255,.9) !important; cursor:pointer; transition:color .15s ease;";

    const menu = document.createElement("ul");
    menu.className = "dropdown-menu dropdown-menu-end shadow";
    menu.style.cssText = [
      "min-width: 380px",
      "max-width: 380px",
      "background: #ffffff",
      "border: 1px solid rgba(0,0,0,.1)",
      "border-radius: 8px",
      "padding: 6px 0",
    ].join("; ");

    const header = document.createElement("li");
    header.innerHTML =
      '<div style="padding:8px 16px 6px; border-bottom:1px solid #e9ecef;">'
      + '<div style="font-size:.75rem; font-weight:700; letter-spacing:.07em; color:#6c757d; text-transform:uppercase; margin-bottom:8px;">'
      + '<i class="fa fa-calendar" aria-hidden="true" style="margin-right:6px;"></i>Assignment Deadlines'
      + "</div>"
      + '<div class="cwa-segmented-control" data-active="todo" role="tablist" aria-label="Deadline filters">'
      + '<button type="button" class="cwa-segment-btn active" data-filter="todo" role="tab" aria-selected="true">'
      + '<i class="fa fa-hourglass-half" aria-hidden="true"></i>To Do'
      + "</button>"
      + '<button type="button" class="cwa-segment-btn" data-filter="overdue" role="tab" aria-selected="false">'
      + '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>Overdue'
      + "</button>"
      + "</div>"
      + '<div class="cwa-campus-select-wrap">'
      + '<select class="form-select form-select-sm cwa-campus-select" id="cwa-campus-select" aria-label="Select center"></select>'
      + "</div>"
      + "</div>";
    menu.appendChild(header);

    const listHost = document.createElement("div");
    listHost.style.cssText = "max-height: 380px; overflow-y: auto;";
    menu.appendChild(listHost);

    const footerDivider = document.createElement("li");
    footerDivider.innerHTML = '<div style="border-top:1px solid #e9ecef;"></div>';
    menu.appendChild(footerDivider);

    const rescanLi = document.createElement("li");
    const rescanLink = document.createElement("a");
    rescanLink.className = "dropdown-item text-center text-primary";
    rescanLink.href = "#";
    rescanLink.style.cssText = "font-size:.84rem; padding:8px 0;";
    rescanLink.innerHTML = '<i class="fa fa-refresh" aria-hidden="true" style="margin-right:5px;"></i>Re-scan Deadlines';

    rescanLink.addEventListener("click", async function (e) {
      e.preventDefault();
      const fresh = await scrapeDeadlines();
      saveDeadlines(fresh);
      renderDropdown(fresh);
    });

    rescanLi.appendChild(rescanLink);
    menu.appendChild(rescanLi);

    navItem.appendChild(toggle);
    navItem.appendChild(menu);

    const todoBtn = header.querySelector('button[data-filter="todo"]');
    const overdueBtn = header.querySelector('button[data-filter="overdue"]');
    const campusSelect = header.querySelector("#cwa-campus-select");

    CAMPUS_OPTIONS.forEach(function (optionLabel) {
      const option = document.createElement("option");
      option.value = optionLabel;
      option.textContent = optionLabel;
      campusSelect.appendChild(option);
    });
    campusSelect.value = selectedCampus;

    function rerenderFilteredList() {
      updateTabButtons(todoBtn, overdueBtn);
      todoBtn.setAttribute("aria-selected", String(activeFilter === "todo"));
      overdueBtn.setAttribute("aria-selected", String(activeFilter === "overdue"));
      renderDeadlines(listHost, deadlines, activeFilter);
    }

    todoBtn.addEventListener("click", function () {
      activeFilter = "todo";
      rerenderFilteredList();
    });

    overdueBtn.addEventListener("click", function () {
      activeFilter = "overdue";
      rerenderFilteredList();
    });

    campusSelect.addEventListener("change", function () {
      selectedCampus = campusSelect.value || DEFAULT_CAMPUS;
      saveSelectedCampus(selectedCampus);
      rerenderFilteredList();
    });

    rerenderFilteredList();
    return navItem;
  }

  function renderDropdown(deadlines) {
    const existing = document.getElementById("cwa-deadlines-menu");
    const next = buildDropdown(deadlines);

    if (existing) {
      existing.replaceWith(next);
    } else {
      const nav = document.querySelector(NAVBAR_SELECTOR);
      if (!nav) {
        console.warn("[CWA] Navbar not found.");
        return;
      }
      nav.appendChild(next);
    }

    startCountdownTicker();
  }

  function normalizeStoredItem(item) {
    if (!item) return null;

    const moduleAcronym = item.moduleAcronym || generateAcronym(item.moduleName || "");
    const taskName = item.taskName || item.label || "";
    const dueDate = item.dueDate || item.due || "";
    const url = item.url || "";

    if (!taskName || !dueDate) return null;
    return { moduleAcronym: moduleAcronym, taskName: taskName, dueDate: dueDate, url: url };
  }

  function init() {
    injectModernFilterStyles();

    loadSelectedCampus(async function (savedCampus) {
      selectedCampus = savedCampus || DEFAULT_CAMPUS;

      const scraped = await scrapeDeadlines();
      saveDeadlines(scraped);

      loadDeadlines(function (saved) {
        const normalized = saved
          .map(normalizeStoredItem)
          .filter(function (item) {
            return !!item;
          });

        renderDropdown(normalized.length > 0 ? normalized : scraped);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
