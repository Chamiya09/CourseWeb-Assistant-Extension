// ============================================================
// CourseWeb Assistant - content.js
// Injects a "My Deadlines" dropdown into the CourseWeb navbar.
// ============================================================

(function () {
  "use strict";

  // --- Configuration ---
  // Dummy deadline data (will be replaced with dynamic data later)
  const DEADLINES = [
    { label: "SE Lab 03",          due: "Tomorrow" },
    { label: "Web Tech Assignment", due: "Mar 20" },
    { label: "DS Quiz 02",         due: "Mar 22" },
  ];

  // --- Helper: Build one <li> deadline item ---
  function createDeadlineItem(label, due) {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.className = "dropdown-item d-flex justify-content-between align-items-center";
    a.href = "#";

    const span = document.createElement("span");
    span.textContent = label;

    const badge = document.createElement("span");
    badge.className = "badge bg-warning text-dark ms-2";
    badge.textContent = due;

    a.appendChild(span);
    a.appendChild(badge);
    li.appendChild(a);

    return li;
  }

  // --- Helper: Build the full dropdown <li> ---
  function buildDropdown() {
    // Outer <li> wrapper
    const navItem = document.createElement("li");
    navItem.className = "nav-item dropdown";
    navItem.id = "cwa-deadlines-menu";

    // Toggle <a> button
    const toggle = document.createElement("a");
    toggle.className = "nav-link dropdown-toggle";
    toggle.href = "#";
    toggle.setAttribute("role", "button");
    toggle.setAttribute("data-bs-toggle", "dropdown");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "&#x1F4CB; My Deadlines"; // 📋 icon

    // Apply a subtle highlight so it stands out in the navbar
    toggle.style.cssText = "font-weight: 600; color: #f0ad4e !important;";

    // Dropdown menu <ul>
    const dropdownMenu = document.createElement("ul");
    dropdownMenu.className = "dropdown-menu dropdown-menu-end";
    dropdownMenu.style.cssText = "min-width: 260px;";

    // Header item
    const header = document.createElement("li");
    header.innerHTML = `<h6 class="dropdown-header">📅 Upcoming Deadlines</h6>`;
    dropdownMenu.appendChild(header);

    const divider = document.createElement("li");
    divider.innerHTML = `<hr class="dropdown-divider">`;
    dropdownMenu.appendChild(divider);

    // Deadline items
    if (DEADLINES.length === 0) {
      const empty = document.createElement("li");
      empty.innerHTML = `<span class="dropdown-item text-muted">No deadlines saved yet.</span>`;
      dropdownMenu.appendChild(empty);
    } else {
      DEADLINES.forEach(({ label, due }) => {
        dropdownMenu.appendChild(createDeadlineItem(label, due));
      });
    }

    // Footer divider + manage link
    const divider2 = document.createElement("li");
    divider2.innerHTML = `<hr class="dropdown-divider">`;
    dropdownMenu.appendChild(divider2);

    const footerItem = document.createElement("li");
    const footerLink = document.createElement("a");
    footerLink.className = "dropdown-item text-center text-primary";
    footerLink.href = "#";
    footerLink.textContent = "⚙ Manage Deadlines";
    footerItem.appendChild(footerLink);
    dropdownMenu.appendChild(footerItem);

    navItem.appendChild(toggle);
    navItem.appendChild(dropdownMenu);

    return navItem;
  }

  // --- Main: Find the navbar and inject the dropdown ---
  function injectDeadlinesMenu() {
    // PLACEHOLDER selector — update this to match CourseWeb's real navbar
    const navBar = document.querySelector(".navbar-nav");

    if (!navBar) {
      console.warn("[CourseWeb Assistant] Navbar not found. Check the selector.");
      return;
    }

    // Prevent duplicate injection (e.g., on SPA navigation)
    if (document.getElementById("cwa-deadlines-menu")) {
      return;
    }

    const dropdown = buildDropdown();
    navBar.appendChild(dropdown);

    console.info("[CourseWeb Assistant] ✅ Deadlines menu injected successfully.");
  }

  // --- Entry Point ---
  // Run after the DOM is fully loaded (document_idle is the default in manifest.json)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectDeadlinesMenu);
  } else {
    // DOM already ready (readyState = "interactive" or "complete")
    injectDeadlinesMenu();
  }
})();
