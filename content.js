// ============================================================
// CourseWeb Assistant - content.js  v8.0
// Upcoming-only deadlines with inline persistent settings.
// ============================================================

(function () {
  "use strict";

  const NAVBAR_SELECTOR = ".navbar-nav";
  const DEADLINE_WINDOW_DAYS = 7;
  const STORAGE_KEY = "cwa_deadlines";
  const SETTINGS_STORAGE_KEY = "cwa_user_settings";
  const ACRONYM_CACHE_STORAGE_KEY = "cwa_acronym_cache";

  const CAMPUS_OPTIONS = [
    { value: "ALL", label: "All Centers" },
    { value: "MALABE", label: "Malabe" },
    { value: "KANDY", label: "Kandy Uni" },
    { value: "NORTHERN", label: "Northern Uni" },
    { value: "MATARA", label: "Matara Center" },
    { value: "PRORATA", label: "Prorata" },
  ];

  const BATCH_OPTIONS = [
    { value: "ALL", label: "All" },
    { value: "Weekday", label: "Weekday" },
    { value: "Weekend", label: "Weekend" },
  ];

  const moduleNameCache = {};
  const acronymCache = {};
  const pendingAcronymFetches = new Set();

  let acronymCachePersistTimer = null;

  let countdownInterval = null;
  let currentDeadlines = [];
  let currentListHost = null;
  let userSettings = { campus: "ALL", batch: "ALL" };

  function injectStyles() {
    if (document.getElementById("cwa-styles")) return;

    const style = document.createElement("style");
    style.id = "cwa-styles";
    style.textContent = [
      ".cwa-header-block {",
      "  position: relative;",
      "  padding: 8px 40px 10px 16px;",
      "  border-bottom: 1px solid #e9ecef;",
      "}",
      ".cwa-settings-gear {",
      "  position: absolute;",
      "  top: 8px;",
      "  right: 10px;",
      "  border: 0;",
      "  background: transparent;",
      "  color: #64748b;",
      "  font-size: .95rem;",
      "  line-height: 1;",
      "  padding: 4px;",
      "  transition: color .15s ease, transform .15s ease;",
      "}",
      ".cwa-settings-gear:hover {",
      "  color: #0d6efd;",
      "  transform: rotate(20deg);",
      "}",
      ".cwa-inline-settings-panel {",
      "  display: none;",
      "  padding: 12px 16px;",
      "  border-bottom: 1px solid #e9ecef;",
      "  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);",
      "}",
      ".cwa-inline-settings-panel.is-open {",
      "  display: block;",
      "}",
      ".cwa-inline-settings-title {",
      "  font-size: .78rem;",
      "  font-weight: 700;",
      "  text-transform: uppercase;",
      "  letter-spacing: .06em;",
      "  color: #475569;",
      "  margin-bottom: 10px;",
      "}",
      ".cwa-inline-field {",
      "  margin-bottom: 10px;",
      "}",
      ".cwa-inline-field label {",
      "  display: block;",
      "  font-size: .75rem;",
      "  font-weight: 700;",
      "  color: #64748b;",
      "  margin-bottom: 5px;",
      "}",
      ".cwa-inline-field select {",
      "  width: 100%;",
      "  border-radius: 10px;",
      "  border: 1px solid rgba(15, 23, 42, .16);",
      "  padding: 8px 10px;",
      "  font-size: .85rem;",
      "  font-weight: 600;",
      "  color: #1e293b;",
      "  background: #ffffff;",
      "}",
      ".cwa-inline-actions {",
      "  display: flex;",
      "  justify-content: flex-end;",
      "  gap: 8px;",
      "  margin-top: 4px;",
      "}",
      ".cwa-settings-summary {",
      "  font-size: .74rem;",
      "  color: #64748b;",
      "  margin-top: 4px;",
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

    let coreName = String(fullCourseName).trim();

    const hyphenIndex = coreName.indexOf("-");
    if (hyphenIndex !== -1) {
      coreName = coreName.substring(hyphenIndex + 1).trim();
    }

    const bracketIndex = coreName.indexOf("[");
    if (bracketIndex !== -1) {
      coreName = coreName.substring(0, bracketIndex).trim();
    }

    if (!coreName) return "GEN";

    const stopWords = ["and", "of", "the", "for", "in", "to", "a", "&", "introduction"];
    const words = coreName.split(/\s+/);
    let acronym = "";

    words.forEach(function (word) {
      const cleanWord = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (cleanWord && stopWords.indexOf(cleanWord) === -1) {
        acronym += cleanWord.charAt(0).toUpperCase();
      }
    });

    return acronym || "GEN";
  }

  function getCleanModuleName(fullCourseName) {
    if (!fullCourseName) return "General";

    let clean = String(fullCourseName).trim();

    clean = clean.replace(/^\s*[A-Za-z]{2,}\d+[A-Za-z0-9]*\s*-\s*/, "");
    clean = clean.replace(/\s*\[[^\]]*\]\s*$/, "");
    clean = clean.trim();

    return clean || "General";
  }

  function getCachedModuleData(url) {
    if (!url) {
      return {
        moduleAcronym: "",
        cleanModuleName: "",
      };
    }

    const cached = acronymCache[url];
    if (!cached) {
      return {
        moduleAcronym: "",
        cleanModuleName: "",
      };
    }

    if (typeof cached === "string") {
      return {
        moduleAcronym: cached,
        cleanModuleName: "",
      };
    }

    return {
      moduleAcronym: cached.moduleAcronym || "",
      cleanModuleName: cached.cleanModuleName || "",
    };
  }

  function setCachedModuleData(url, moduleAcronym, cleanModuleName) {
    if (!url) return;
    acronymCache[url] = {
      moduleAcronym: moduleAcronym || "GEN",
      cleanModuleName: cleanModuleName || "General",
    };
  }

  function normalizeCampusValue(campusValue) {
    const upper = String(campusValue || "ALL").toUpperCase().trim();
    if (upper === "KANDY UNI") return "KANDY";
    if (upper === "NORTHERN UNI") return "NORTHERN";
    if (upper === "MATARA CENTER") return "MATARA";
    if (upper === "ALL CENTERS") return "ALL";
    return upper;
  }

  function normalizeBatchValue(batchValue) {
    const value = String(batchValue || "ALL").trim();
    if (value !== "Weekday" && value !== "Weekend") return "ALL";
    return value;
  }

  function saveUserSettings(settings) {
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
  }

  function loadAcronymCache(callback) {
    chrome.storage.local.get([ACRONYM_CACHE_STORAGE_KEY], function (result) {
      const stored = result[ACRONYM_CACHE_STORAGE_KEY];
      const map = (stored && typeof stored === "object") ? stored : {};

      Object.keys(acronymCache).forEach(function (key) {
        delete acronymCache[key];
      });

      Object.keys(map).forEach(function (key) {
        acronymCache[key] = map[key];
      });

      callback(acronymCache);
    });
  }

  function persistAcronymCache() {
    chrome.storage.local.set({ [ACRONYM_CACHE_STORAGE_KEY]: acronymCache });
  }

  function queueAcronymCachePersist() {
    if (acronymCachePersistTimer) return;
    acronymCachePersistTimer = setTimeout(function () {
      acronymCachePersistTimer = null;
      persistAcronymCache();
    }, 200);
  }

  function loadUserSettings(callback) {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], function (result) {
      const stored = result[SETTINGS_STORAGE_KEY] || {};
      callback({
        campus: normalizeCampusValue(stored.campus || "ALL"),
        batch: normalizeBatchValue(stored.batch || "ALL"),
      });
    });
  }

  function getSafeUrlSelector(url) {
    if (!url) return "";
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(url);
    }

    return String(url).replace(/(["\\])/g, "\\$1");
  }

  function getStrictlyFilteredDeadlines(deadlines) {
    const now = new Date();
    const filtered = [];

    const batch = normalizeBatchValue(userSettings.batch);
    const campus = normalizeCampusValue(userSettings.campus);
    const campusModifiers = ["MALABE", "KANDY", "MATARA", "NORTHERN", "PRORATA", "ALL CENTERS", "ALL CENTER"];
    const otherCampuses = campusModifiers.filter(function (c) {
      return c !== campus.toUpperCase();
    });

    const items = deadlines || [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const parsed = parseDeadlineDate(item.dueDate);
      if (!parsed || parsed <= now) continue;

      const titleUpper = String(item.taskName || "").toUpperCase();

      if (batch === "Weekday" && titleUpper.indexOf("WEEKEND") !== -1) continue;
      if (batch === "Weekend" && titleUpper.indexOf("WEEKDAY") !== -1) continue;

      if (campus !== "ALL") {
        const hasCampusLabel = campusModifiers.some(function (modifier) {
          return titleUpper.indexOf(modifier) !== -1;
        });

        let containsOtherCampus = false;
        for (let j = 0; j < otherCampuses.length; j += 1) {
          if (titleUpper.indexOf(otherCampuses[j]) !== -1) {
            containsOtherCampus = true;
            break;
          }
        }

        if (containsOtherCampus) continue;

        // Keep unlabeled generic tasks visible for specific campus selections.
        if (hasCampusLabel && titleUpper.indexOf(campus) === -1) continue;
      }

      filtered.push(item);
    }

    filtered.sort(function (a, b) {
      return parseDeadlineDate(a.dueDate) - parseDeadlineDate(b.dueDate);
    });

    return filtered;
  }

  async function scrapeDeadlines() {
    const isDashboardUrl = window.location.href.indexOf("/my/") !== -1;
    const hasTimelineContainer = !!document.querySelector(
      '[data-region="timeline-view"], .block_calendar_upcoming, .block_calendar_month, .eventlist'
    );

    if (!isDashboardUrl && !hasTimelineContainer) {
      // Strict page guard: skip scraping outside dashboard/timeline context.
      return;
    }

    const deadlines = [];
    const now = new Date();

    const eventItems = document.querySelectorAll('.event[data-eventtype-course="1"]');
    if (!eventItems || eventItems.length === 0) {
      // Non-dashboard pages often have no timeline events; keep existing storage as-is.
      return;
    }

    function extractCourseNameFromEvent(eventItem) {
      if (!eventItem) return "";

      const smallTag = eventItem.querySelector("small.mb-0");
      if (!smallTag || !smallTag.textContent) return "";

      const text = smallTag.textContent.trim();
      if (text.indexOf("·") === -1) return "";

      const pieces = text.split("·");
      if (pieces.length < 2) return "";

      return pieces[1].trim();
    }

    const processedItems = Array.from(eventItems).map(function (event) {
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

      if (!taskName || !dueDate || !parsedDate || parsedDate <= now) return null;

      const fallbackTitle = extractCourseNameFromEvent(event);
      const fallbackCleanModuleName = getCleanModuleName(fallbackTitle);
      const cachedData = getCachedModuleData(url);
      const moduleAcronym = cachedData.moduleAcronym || generateAcronym(fallbackTitle);
      const cleanModuleName = cachedData.cleanModuleName || fallbackCleanModuleName;
      const moduleTitle = fallbackTitle;

      const details = {
        moduleAcronym: moduleAcronym,
        cleanModuleName: cleanModuleName,
        moduleTitle: moduleTitle,
        resolvedUrl: url,
      };

      if (url) {
        moduleNameCache[url] = details;
      }

      return {
        taskName: taskName,
        dueDate: dueDate,
        url: details.resolvedUrl || url,
        moduleAcronym: details.moduleAcronym,
        cleanModuleName: details.cleanModuleName,
        moduleTitle: details.moduleTitle,
      };
    });

    processedItems.forEach(function (item) {
      if (!item) return;
      const duplicate = deadlines.some(function (existing) {
        return existing.taskName === item.taskName && existing.dueDate === item.dueDate && existing.url === item.url;
      });
      if (!duplicate) deadlines.push(item);
    });

    return deadlines;
  }

  async function fetchExactModuleDetails(url, fallbackTitle) {
    if (!url) {
      return {
        moduleTitle: fallbackTitle || "",
        moduleAcronym: generateAcronym(fallbackTitle),
        cleanModuleName: getCleanModuleName(fallbackTitle),
        resolvedUrl: url,
      };
    }

    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        return {
          moduleTitle: fallbackTitle || "",
          moduleAcronym: generateAcronym(fallbackTitle),
          cleanModuleName: getCleanModuleName(fallbackTitle),
          resolvedUrl: url,
        };
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      const courseLink = doc.querySelector('.breadcrumb-item a[href*="course/view.php?id="]');
      let fullCourseName = courseLink
        ? ((courseLink.getAttribute("title") || courseLink.textContent || "").trim())
        : "";

      const directLinkNode = doc.querySelector('a[href*="/mod/assign/view.php"], a[href*="/mod/quiz/view.php"], a[href*="/mod/url/view.php"]');
      let resolvedUrl = url;
      if (directLinkNode && directLinkNode.getAttribute("href")) {
        try {
          resolvedUrl = new URL(directLinkNode.getAttribute("href"), window.location.origin).href;
        } catch (_e) {
          resolvedUrl = directLinkNode.getAttribute("href");
        }
      }

      if (!fullCourseName) {
        fullCourseName = fallbackTitle || "";
      }

      return {
        moduleTitle: fullCourseName,
        moduleAcronym: generateAcronym(fullCourseName),
        cleanModuleName: getCleanModuleName(fullCourseName),
        resolvedUrl: resolvedUrl,
      };
    } catch (_error) {
      return {
        moduleTitle: fallbackTitle || "",
        moduleAcronym: generateAcronym(fallbackTitle),
        cleanModuleName: getCleanModuleName(fallbackTitle),
        resolvedUrl: url,
      };
    }
  }

  function updateBadgeAcronym(url, acronym) {
    if (!url || !acronym) return;

    const safe = getSafeUrlSelector(url);
    if (!safe) return;

    const badge = document.querySelector('.cwa-module-acronym-badge[data-acronym-url="' + safe + '"]');
    if (badge) {
      badge.textContent = acronym;
    }

    document.querySelectorAll('.cwa-module-acronym-badge[data-acronym-url="' + safe + '"]').forEach(function (node) {
      node.textContent = acronym;
    });
  }

  function updateModuleNameText(url, cleanModuleName) {
    if (!url || !cleanModuleName) return;

    const safe = getSafeUrlSelector(url);
    if (!safe) return;

    document.querySelectorAll('.cwa-module-name-line[data-module-url="' + safe + '"]').forEach(function (node) {
      node.textContent = cleanModuleName;
      node.setAttribute("title", cleanModuleName);
    });
  }

  function updateDeadlinesWithResolvedUrl(oldUrl, newUrl) {
    if (!oldUrl || !newUrl || oldUrl === newUrl) return;

    currentDeadlines = (currentDeadlines || []).map(function (item) {
      if (!item || item.url !== oldUrl) return item;
      return Object.assign({}, item, { url: newUrl });
    });

    loadDeadlines(function (saved) {
      const list = Array.isArray(saved) ? saved : [];
      const updated = list.map(function (item) {
        if (!item || item.url !== oldUrl) return item;
        return Object.assign({}, item, { url: newUrl });
      });
      saveDeadlines(updated);
    });

    const safeOld = getSafeUrlSelector(oldUrl);
    const safeNew = getSafeUrlSelector(newUrl);
    if (!safeOld || !safeNew) return;

    document.querySelectorAll('.cwa-module-acronym-badge[data-acronym-url="' + safeOld + '"]').forEach(function (badge) {
      badge.setAttribute("data-acronym-url", newUrl);
    });

    document.querySelectorAll('.cwa-module-name-line[data-module-url="' + safeOld + '"]').forEach(function (line) {
      line.setAttribute("data-module-url", newUrl);
    });

    document.querySelectorAll('[data-module-url="' + safeOld + '"]').forEach(function (node) {
      node.setAttribute("data-module-url", newUrl);
    });
  }

  function applyAcronymToState(url, acronym, moduleTitle, cleanModuleName) {
    if (!url || !acronym) return;

    currentDeadlines = (currentDeadlines || []).map(function (item) {
      if (!item || item.url !== url) return item;
      return Object.assign({}, item, {
        moduleAcronym: acronym,
        moduleTitle: moduleTitle || item.moduleTitle || "",
        cleanModuleName: cleanModuleName || item.cleanModuleName || getCleanModuleName(moduleTitle || item.moduleTitle || ""),
      });
    });

    saveDeadlines(currentDeadlines);
  }

  async function updateMissingAcronymsInBackground(items) {
    async function resolveUniversalDirectUrl(candidateUrl) {
      if (!candidateUrl) return "";
      try {
        const urlObj = new URL(candidateUrl, window.location.origin);
        const eventHash = urlObj.hash || "";
        const eventIdMatch = eventHash.match(/\d+/);
        const eventId = eventIdMatch ? eventIdMatch[0] : null;

        const response = await fetch(urlObj.href, { credentials: "include" });
        if (!response.ok) return "";

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        let eventWrapper = null;
        if (eventId) {
          eventWrapper = doc.querySelector('[data-event-id="' + eventId + '"]') || doc.getElementById('event_' + eventId);
        }

        let directLinkNode = null;
        if (eventWrapper) {
          directLinkNode = eventWrapper.querySelector('a[href*="/mod/"][href*="view.php"]');
        } else {
          // Fallback when Moodle markup differs; can be ambiguous for same-day pages.
          directLinkNode = doc.querySelector('a[href*="/mod/"][href*="view.php"]');
        }

        if (!directLinkNode || !directLinkNode.getAttribute("href")) return "";

        try {
          return new URL(directLinkNode.getAttribute("href"), window.location.origin).href;
        } catch (_e) {
          return directLinkNode.getAttribute("href") || "";
        }
      } catch (_error) {
        return "";
      }
    }

    function updateLiveDeadlineAnchor(oldUrl, newUrl) {
      if (!oldUrl || !newUrl || oldUrl === newUrl) return;

      const safeOld = getSafeUrlSelector(oldUrl);
      if (!safeOld) return;

      document.querySelectorAll('#cwa-deadlines-menu a.list-group-item-action[href="' + safeOld + '"]').forEach(function (anchor) {
        anchor.setAttribute("href", newUrl);
      });

      document.querySelectorAll('.cwa-module-acronym-badge[data-acronym-url="' + safeOld + '"]').forEach(function (badge) {
        const anchor = badge.closest("a.list-group-item-action");
        if (anchor) {
          anchor.setAttribute("href", newUrl);
        }
      });

      document.querySelectorAll('.cwa-module-name-line[data-module-url="' + safeOld + '"]').forEach(function (line) {
        const anchor = line.closest("a.list-group-item-action");
        if (anchor) {
          anchor.setAttribute("href", newUrl);
        }
      });
    }

    function isCalendarEventUrl(url) {
      return /\/calendar\/view\.php/i.test(String(url || ""));
    }

    const queue = Array.isArray(items) ? items : [];
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      if (!item || !item.url) continue;

      const cachedData = getCachedModuleData(item.url);
      const hasFullCachedModuleData = !!(cachedData.moduleAcronym && cachedData.cleanModuleName);
      const shouldForceDirectResolution = isCalendarEventUrl(item.url);

      if (hasFullCachedModuleData && !shouldForceDirectResolution) continue;
      if (pendingAcronymFetches.has(item.url)) continue;

      pendingAcronymFetches.add(item.url);

      fetchExactModuleDetails(item.url, item.moduleTitle || "")
        .then(async function (details) {
          let resolvedUrl = details.resolvedUrl || item.url;
          if (resolvedUrl === item.url) {
            const universalDirectUrl = await resolveUniversalDirectUrl(item.url);
            if (universalDirectUrl) {
              resolvedUrl = universalDirectUrl;
            }
          }

          const exactAcronym = details.moduleAcronym || generateAcronym(item.moduleTitle || "");
          const cleanModuleName = details.cleanModuleName || getCleanModuleName(details.moduleTitle || item.moduleTitle || "");
          const hasDirectUrl = resolvedUrl && resolvedUrl !== item.url;

          setCachedModuleData(item.url, exactAcronym, cleanModuleName);
          if (hasDirectUrl) {
            setCachedModuleData(resolvedUrl, exactAcronym, cleanModuleName);
            updateDeadlinesWithResolvedUrl(item.url, resolvedUrl);
            updateLiveDeadlineAnchor(item.url, resolvedUrl);

            currentDeadlines = (currentDeadlines || []).map(function (deadline) {
              if (!deadline || deadline.url !== item.url) return deadline;
              return Object.assign({}, deadline, {
                url: resolvedUrl,
                cleanModuleName: cleanModuleName,
              });
            });
            saveDeadlines(currentDeadlines);

            loadDeadlines(function (saved) {
              const list = Array.isArray(saved) ? saved : [];
              const updated = list.map(function (deadline) {
                if (!deadline || deadline.url !== item.url) return deadline;
                return Object.assign({}, deadline, {
                  url: resolvedUrl,
                  cleanModuleName: cleanModuleName,
                });
              });
              saveDeadlines(updated);
            });
          }

          queueAcronymCachePersist();

          updateBadgeAcronym(item.url, exactAcronym);
          updateModuleNameText(item.url, cleanModuleName);
          if (hasDirectUrl) {
            updateBadgeAcronym(resolvedUrl, exactAcronym);
            updateModuleNameText(resolvedUrl, cleanModuleName);
          }

          applyAcronymToState(item.url, exactAcronym, details.moduleTitle, cleanModuleName);
          if (hasDirectUrl) {
            applyAcronymToState(resolvedUrl, exactAcronym, details.moduleTitle, cleanModuleName);
          }

          moduleNameCache[item.url] = {
            moduleAcronym: exactAcronym,
            cleanModuleName: cleanModuleName,
            moduleTitle: details.moduleTitle || item.moduleTitle || "",
            resolvedUrl: resolvedUrl,
          };

          if (hasDirectUrl) {
            moduleNameCache[resolvedUrl] = moduleNameCache[item.url];
          }
        })
        .catch(function () {
          // Keep fallback acronym if background fetch fails.
        })
        .finally(function () {
          pendingAcronymFetches.delete(item.url);
        });
    }
  }

  function saveDeadlines(deadlines) {
    if (!Array.isArray(deadlines)) return;
    chrome.storage.local.set({ [STORAGE_KEY]: deadlines });
  }

  function loadDeadlines(callback) {
    chrome.storage.local.get([STORAGE_KEY], function (result) {
      callback(result[STORAGE_KEY] || []);
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

    const card = document.createElement("a");
    card.href = item.url || "#";
    card.className = "list-group-item list-group-item-action";
    card.style.cssText = "display:block; padding:10px 16px; border:0; border-bottom:1px solid #f0f0f0; text-decoration:none; background:#fff;";
    if (item.url) {
      card.title = "Open submission";
    }

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
    badge.classList.add("cwa-module-acronym-badge");
    if (item.url) {
      badge.setAttribute("data-acronym-url", item.url);
    }

    const title = document.createElement("span");
    title.style.cssText = "font-weight:600; font-size:.88rem; color:#0d6efd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px; display:inline-block;";
    title.title = item.taskName;
    title.textContent = item.taskName;

    nameRow.appendChild(icon);
    nameRow.appendChild(badge);
    nameRow.appendChild(title);

    const moduleRow = document.createElement("div");
    moduleRow.className = "text-muted mt-1";
    moduleRow.style.cssText = "font-size: 0.8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
    if (item.url) {
      moduleRow.setAttribute("data-module-url", item.url);
    }
    moduleRow.title = item.cleanModuleName || getCleanModuleName(item.moduleTitle || "");

    const moduleIcon = document.createElement("i");
    moduleIcon.className = "fa fa-book me-1";
    moduleIcon.setAttribute("aria-hidden", "true");

    const moduleText = document.createElement("span");
    moduleText.className = "cwa-module-name-line";
    if (item.url) {
      moduleText.setAttribute("data-module-url", item.url);
    }
    moduleText.textContent = item.cleanModuleName || getCleanModuleName(item.moduleTitle || "");

    moduleRow.appendChild(moduleIcon);
    moduleRow.appendChild(moduleText);

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

    card.appendChild(nameRow);
    card.appendChild(moduleRow);
    card.appendChild(dueRow);
    card.appendChild(countdownRow);
    card.appendChild(progressWrap);

    return card;
  }

  function renderDeadlines(listRoot, deadlines) {
    listRoot.innerHTML = "";

    const filteredDeadlines = getStrictlyFilteredDeadlines(deadlines || []);

    if (filteredDeadlines.length === 0) {
      const empty = document.createElement("li");
      empty.innerHTML =
        '<div style="padding:14px 16px; text-align:center; color:#6c757d; font-size:.87rem; font-style:italic;">'
        + '<i class="fa fa-inbox" aria-hidden="true" style="margin-right:6px;"></i>'
        + "No upcoming deadlines for the selected settings."
        + "</div>";
      listRoot.appendChild(empty);
      return;
    }

    filteredDeadlines.forEach(function (item) {
      listRoot.appendChild(createDeadlineCard(item));
    });
  }

  function updateNotificationBadge(deadlines) {
    const toggle = document.querySelector("#cwa-deadlines-menu .nav-link.dropdown-toggle");
    if (!toggle) return;

    const nowMs = Date.now();
    const urgentWindowMs = 2 * 24 * 60 * 60 * 1000;
    const filtered = getStrictlyFilteredDeadlines(deadlines || []);

    const urgentCount = filtered.reduce(function (count, item) {
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
    navItem.setAttribute("data-bs-auto-close", "outside");
    navItem.setAttribute("data-auto-close", "outside");

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
      "padding: 0",
      "overflow: hidden",
    ].join("; ");

    const header = document.createElement("li");
    header.innerHTML =
      '<div class="cwa-header-block">'
      + '<div style="font-size:.75rem; font-weight:700; letter-spacing:.07em; color:#6c757d; text-transform:uppercase; margin-bottom:4px;">'
      + '<i class="fa fa-calendar" aria-hidden="true" style="margin-right:6px;"></i>Upcoming Deadlines'
      + "</div>"
      + '<div style="font-size:.76rem; color:#6c757d;">Filtered by your saved settings profile.</div>'
      + '<button type="button" class="cwa-settings-gear" id="cwa-inline-settings-toggle" aria-label="Open settings" title="Settings">'
      + '<i class="fa fa-cog" aria-hidden="true"></i>'
      + "</button>"
      + "</div>";
    menu.appendChild(header);

    const settingsPanelLi = document.createElement("li");
    settingsPanelLi.innerHTML =
      '<div class="cwa-inline-settings-panel" id="cwa-inline-settings-panel">'
      + '<div class="cwa-inline-settings-title">Extension Settings</div>'
      + '<div class="cwa-inline-field">'
      + '<label for="cwa-settings-campus">Center</label>'
      + '<select id="cwa-settings-campus"></select>'
      + "</div>"
      + '<div class="cwa-inline-field">'
      + '<label for="cwa-settings-batch">Batch Type</label>'
      + '<select id="cwa-settings-batch"></select>'
      + '<div class="cwa-settings-summary" id="cwa-settings-summary"></div>'
      + "</div>"
      + '<div class="cwa-inline-actions">'
      + '<button type="button" class="btn btn-light btn-sm" id="cwa-settings-cancel">Cancel</button>'
      + '<button type="button" class="btn btn-primary btn-sm" id="cwa-settings-save">Save & Apply</button>'
      + "</div>"
      + "</div>";
    menu.appendChild(settingsPanelLi);

    const listHost = document.createElement("div");
    listHost.style.cssText = "max-height: 380px; overflow-y: auto;";
    menu.appendChild(listHost);
    currentListHost = listHost;

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

      if (Array.isArray(fresh)) {
        saveDeadlines(fresh);
      }

      loadDeadlines(function (saved) {
        const normalized = (saved || [])
          .map(normalizeStoredItem)
          .filter(function (item) {
            return !!item;
          });

        renderDropdown(normalized);
      });
    });

    rescanLi.appendChild(rescanLink);
    menu.appendChild(rescanLi);

    navItem.appendChild(toggle);
    navItem.appendChild(menu);

    const inlinePanel = settingsPanelLi.querySelector("#cwa-inline-settings-panel");
    const campusSelect = settingsPanelLi.querySelector("#cwa-settings-campus");
    const batchSelect = settingsPanelLi.querySelector("#cwa-settings-batch");
    const summary = settingsPanelLi.querySelector("#cwa-settings-summary");
    const settingsToggle = header.querySelector("#cwa-inline-settings-toggle");
    const cancelBtn = settingsPanelLi.querySelector("#cwa-settings-cancel");
    const saveBtn = settingsPanelLi.querySelector("#cwa-settings-save");

    CAMPUS_OPTIONS.forEach(function (optionDef) {
      const option = document.createElement("option");
      option.value = optionDef.value;
      option.textContent = optionDef.label;
      campusSelect.appendChild(option);
    });

    BATCH_OPTIONS.forEach(function (optionDef) {
      const option = document.createElement("option");
      option.value = optionDef.value;
      option.textContent = optionDef.label;
      batchSelect.appendChild(option);
    });

    function setSettingsOpen(isOpen) {
      if (isOpen) {
        inlinePanel.classList.add("is-open");
        listHost.style.display = "none";
        footerDivider.style.display = "none";
        rescanLi.style.display = "none";
      } else {
        inlinePanel.classList.remove("is-open");
        listHost.style.display = "block";
        footerDivider.style.display = "block";
        rescanLi.style.display = "block";
      }
    }

    function updateSummary() {
      const campusLabel = (CAMPUS_OPTIONS.find(function (opt) {
        return opt.value === campusSelect.value;
      }) || {}).label || "All Centers";

      const batchLabel = (BATCH_OPTIONS.find(function (opt) {
        return opt.value === batchSelect.value;
      }) || {}).label || "All";

      summary.textContent = "Profile: " + campusLabel + " / " + batchLabel;
    }

    function loadPanelFromSettings() {
      campusSelect.value = normalizeCampusValue(userSettings.campus);
      batchSelect.value = normalizeBatchValue(userSettings.batch);
      updateSummary();
    }

    [campusSelect, batchSelect].forEach(function (selectEl) {
      selectEl.addEventListener("change", updateSummary);
      selectEl.addEventListener("click", function (event) {
        event.stopPropagation();
      });
    });

    settingsToggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      loadPanelFromSettings();
      setSettingsOpen(!inlinePanel.classList.contains("is-open"));
    });

    inlinePanel.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    cancelBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(false);
    });

    saveBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      userSettings = {
        campus: normalizeCampusValue(campusSelect.value),
        batch: normalizeBatchValue(batchSelect.value),
      };

      saveUserSettings(userSettings);
      setSettingsOpen(false);
      renderDeadlines(currentListHost || listHost, currentDeadlines);
      updateNotificationBadge(currentDeadlines);
    });

    setSettingsOpen(false);
    renderDeadlines(listHost, deadlines);
    return navItem;
  }

  function renderDropdown(deadlines) {
    currentDeadlines = deadlines || [];

    const existing = document.getElementById("cwa-deadlines-menu");
    const next = buildDropdown(currentDeadlines);

    if (existing) {
      existing.replaceWith(next);
    } else {
      const nav = document.querySelector(NAVBAR_SELECTOR);
      if (!nav) return;
      nav.appendChild(next);
    }

    startCountdownTicker();
    updateNotificationBadge(currentDeadlines);

    updateMissingAcronymsInBackground(currentDeadlines);
  }

  function normalizeStoredItem(item) {
    if (!item) return null;

    const taskName = item.taskName || item.label || "";
    const dueDate = item.dueDate || item.due || "";
    const url = item.url || "";
    const moduleTitle = item.moduleTitle || item.moduleName || "";
    const moduleAcronym = item.moduleAcronym || generateAcronym(moduleTitle);
    const cleanModuleName = item.cleanModuleName || getCleanModuleName(moduleTitle);

    const parsed = parseDeadlineDate(dueDate);
    if (!taskName || !dueDate || !parsed || parsed <= new Date()) return null;

    return {
      taskName: taskName,
      dueDate: dueDate,
      url: url,
      moduleAcronym: moduleAcronym,
      cleanModuleName: cleanModuleName,
      moduleTitle: moduleTitle,
    };
  }

  function init() {
    const loggedInMarker = document.querySelector(".usermenu, .userpicture, [data-region='user-menu']");
    if (!loggedInMarker) return;

    injectStyles();

    loadAcronymCache(function () {
      loadUserSettings(async function (storedSettings) {
        userSettings = storedSettings;

        loadDeadlines(function (saved) {
          const normalizedCached = (saved || [])
            .map(normalizeStoredItem)
            .filter(function (item) {
              return !!item;
            });

          renderDropdown(normalizedCached);
        });

        const scraped = await scrapeDeadlines();
        if (Array.isArray(scraped)) {
          saveDeadlines(scraped);
          const normalizedScraped = scraped
            .map(normalizeStoredItem)
            .filter(function (item) {
              return !!item;
            });

          renderDropdown(normalizedScraped);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
