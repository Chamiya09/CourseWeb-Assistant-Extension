// ============================================================
// CourseWeb Assistant - content.js  v6.0
// Upcoming-only deadlines with campus filtering.
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

  const moduleNameCache = {};
  let countdownInterval = null;
  let selectedCampus = DEFAULT_CAMPUS;

  function injectStyles() {
    if (document.getElementById("cwa-styles")) return;

    const style = document.createElement("style");
    style.id = "cwa-styles";
    style.textContent = [
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

  function generateAcronym(fullCourseName) {
    if (!fullCourseName) return "GEN";

    const stopWords = ["and", "of", "the", "for", "in", "to", "a", "&"];
    const raw = String(fullCourseName).trim();
    const match = raw.match(/-\s*(.+?)\s*\[/);

    let coreName = "";
    if (match && match[1]) {
      coreName = match[1].trim();
    } else {
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

    return words.map(function (word) {
      return word.charAt(0).toUpperCase();
    }).join("");
  }

  function extractCampusScope(taskName) {
    const rawTitle = String(taskName || "");
    const parenthesized = [];

    rawTitle.replace(/\(([^)]*)\)/g, function (_m, group) {
      if (group) parenthesized.push(group);
      return _m;
    });

    const uppercaseChunks = rawTitle.match(/\b[A-Z][A-Z\s]{2,}\b/g) || [];
    return parenthesized.concat(uppercaseChunks).join(" ").toUpperCase().trim();
  }

  function normalizeSelectedCampus(campusLabel) {
    if (!campusLabel || campusLabel === DEFAULT_CAMPUS) return "ALL";
    const lower = campusLabel.toLowerCase();
    if (lower.indexOf("malabe") !== -1) return "MALABE";
    if (lower.indexOf("northern") !== -1) return "NORTHERN";
    if (lower.indexOf("kandy") !== -1) return "KANDY";
    if (lower.indexOf("matara") !== -1) return "MATARA";
    if (lower.indexOf("prorata") !== -1 || lower.indexOf("pro rata") !== -1) return "PRORATA";
    return String(campusLabel).toUpperCase().trim();
  }

  function filterByCampus(deadlines, campusLabel) {
    const allModifiers = ["MALABE", "KANDY", "MATARA", "NORTHERN", "PRORATA", "ALL CENTERS"];
    const selectedUpper = normalizeSelectedCampus(campusLabel);

    return deadlines.filter(function (item) {
      const scope = extractCampusScope(item.taskName);

      if (campusLabel === DEFAULT_CAMPUS || selectedUpper === "ALL") return true;
      if (!scope) return true;
      if (scope.includes(selectedUpper)) return true;

      for (let i = 0; i < allModifiers.length; i += 1) {
        const modifier = allModifiers[i];
        if (!scope.includes(modifier)) continue;
        if (modifier !== selectedUpper) return false;
      }

      return true;
    });
  }

  async function scrapeDeadlines() {
    const deadlines = [];
    const now = new Date();

    const eventItems = document.querySelectorAll('.event[data-eventtype-course="1"]');

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
      const parsedDate = parseDeadlineDate(dueDate);

      let url = "";
      if (taskLink && taskLink.getAttribute("href")) {
        try {
          url = new URL(taskLink.getAttribute("href"), window.location.origin).href;
        } catch (_e) {
          url = taskLink.getAttribute("href");
        }
      }

      // Future-only persistence: drop overdue/past items at scrape level.
      if (!taskName || !dueDate || !parsedDate || parsedDate <= now) return null;

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

    return deadlines;
  }

  function saveDeadlines(deadlines) {
    chrome.storage.local.set({ [STORAGE_KEY]: deadlines || [] });
  }

  function loadDeadlines(callback) {
    chrome.storage.local.get([STORAGE_KEY], function (result) {
      callback(result[STORAGE_KEY] || []);
    });
  }

  function saveSelectedCampus(campusValue) {
    chrome.storage.local.set({ [CAMPUS_STORAGE_KEY]: campusValue });
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

  function progressPercent(targetDate) {
    const windowMs = DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const startMs = targetDate.getTime() - windowMs;
    const now = Date.now();
    const elapsed = now - startMs;
    return Math.min(100, Math.max(0, Math.round((elapsed / windowMs) * 100)));
  }

  function createDeadlineCard(item) {
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
      const daysLeft = msLeft / (1000 * 60 * 60 * 24);
      let urgencyClass = "bg-danger";
      if (daysLeft > 4) {
        urgencyClass = "bg-success";
      } else if (daysLeft >= 1 && daysLeft <= 4) {
        urgencyClass = "bg-warning";
      }

      bar.dataset.target = targetISO;
      bar.style.width = progressPercent(targetDate) + "%";
      bar.classList.add(urgencyClass);
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

  function renderDeadlines(listRoot, deadlines) {
    while (listRoot.firstChild) {
      listRoot.removeChild(listRoot.firstChild);
    }

    const now = new Date();
    const campusFiltered = filterByCampus(deadlines || [], selectedCampus)
      .filter(function (item) {
        const parsed = parseDeadlineDate(item.dueDate);
        return parsed && parsed > now;
      })
      .sort(function (a, b) {
        return parseDeadlineDate(a.dueDate) - parseDeadlineDate(b.dueDate);
      });

    if (campusFiltered.length === 0) {
      const empty = document.createElement("li");
      empty.innerHTML =
        '<div style="padding:14px 16px; text-align:center; color:#6c757d; font-size:.87rem; font-style:italic;">'
        + '<i class="fa fa-inbox" aria-hidden="true" style="margin-right:6px;"></i>'
        + "No upcoming deadlines."
        + "</div>";
      listRoot.appendChild(empty);
      return;
    }

    campusFiltered.forEach(function (item) {
      listRoot.appendChild(createDeadlineCard(item));
    });
  }

  function updateNotificationBadge(deadlines) {
    const toggle = document.querySelector("#cwa-deadlines-menu .nav-link.dropdown-toggle");
    if (!toggle) return;

    const nowMs = Date.now();
    const urgentWindowMs = 2 * 24 * 60 * 60 * 1000; // 48 hours

    const urgentCount = (deadlines || []).reduce(function (count, item) {
      const parsed = parseDeadlineDate(item.dueDate);
      if (!parsed) return count;

      const msLeft = parsed.getTime() - nowMs;
      const isUrgent = msLeft >= 0 && msLeft <= urgentWindowMs;
      return isUrgent ? count + 1 : count;
    }, 0);

    let badge = toggle.querySelector("#cwa-nav-urgent-badge");

    if (urgentCount > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "cwa-nav-urgent-badge";
        badge.className = "badge bg-danger rounded-pill ms-2";
        toggle.appendChild(badge);
      }
      badge.textContent = String(urgentCount);
    } else if (badge) {
      badge.remove();
    }
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
      + '<i class="fa fa-calendar" aria-hidden="true" style="margin-right:6px;"></i>Upcoming Deadlines'
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

    const campusSelect = header.querySelector("#cwa-campus-select");
    CAMPUS_OPTIONS.forEach(function (optionLabel) {
      const option = document.createElement("option");
      option.value = optionLabel;
      option.textContent = optionLabel;
      campusSelect.appendChild(option);
    });
    campusSelect.value = selectedCampus;

    function rerenderList() {
      renderDeadlines(listHost, deadlines);
      updateNotificationBadge(deadlines);
    }

    campusSelect.addEventListener("change", function () {
      selectedCampus = campusSelect.value || DEFAULT_CAMPUS;
      saveSelectedCampus(selectedCampus);
      rerenderList();
    });

    rerenderList();
    return navItem;
  }

  function renderDropdown(deadlines) {
    const existing = document.getElementById("cwa-deadlines-menu");
    const next = buildDropdown(deadlines);

    if (existing) {
      existing.replaceWith(next);
    } else {
      const nav = document.querySelector(NAVBAR_SELECTOR);
      if (!nav) return;
      nav.appendChild(next);
    }

    startCountdownTicker();
    updateNotificationBadge(deadlines);
  }

  function normalizeStoredItem(item) {
    if (!item) return null;

    const taskName = item.taskName || item.label || "";
    const dueDate = item.dueDate || item.due || "";
    const url = item.url || "";
    const moduleAcronym = item.moduleAcronym || generateAcronym(item.moduleName || "");

    const parsed = parseDeadlineDate(dueDate);
    if (!taskName || !dueDate || !parsed || parsed <= new Date()) return null;

    return {
      taskName: taskName,
      dueDate: dueDate,
      url: url,
      moduleAcronym: moduleAcronym,
    };
  }

  function init() {
    const loggedInMarker = document.querySelector(".usermenu, .userpicture, [data-region='user-menu']");
    if (!loggedInMarker) return;

    injectStyles();

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
