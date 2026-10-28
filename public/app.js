"use strict";

/* ==========================================================================
   Attendly frontend controller
   ========================================================================== */

const state = {
  view: "dashboard",
  students: [],
  studentSearch: "",
  editingStudentId: null,
  attendanceDate: "",
  attendance: null,
  reportMonth: "",
  report: null,
  history: [],
  settings: {
    attendance_threshold: 75,
    periods_per_day: 7,
  },
  confirmResolve: null,
};

const VIEW_META = {
  dashboard: {
    eyebrow: "Overview",
    title: "Dashboard",
    description: "A clear view of your class attendance.",
  },
  attendance: {
    eyebrow: "Daily register",
    title: "Attendance",
    description: "Mark seven-period attendance for the whole class.",
  },
  students: {
    eyebrow: "Class roster",
    title: "Students",
    description: "Manage the students in your class.",
  },
  reports: {
    eyebrow: "Insights",
    title: "Reports",
    description: "Monthly attendance summaries and exports.",
  },
  settings: {
    eyebrow: "Configuration",
    title: "Settings",
    description: "Attendance policy and system information.",
  },
};

const PERIODS = [1, 2, 3, 4, 5, 6, 7];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

function init() {
  state.attendanceDate = todayISO();
  state.reportMonth = currentMonth();

  $("#attendance-date").value = state.attendanceDate;
  $("#attendance-date").max = todayISO();
  $("#report-month").value = state.reportMonth;
  $("#today-label").textContent = formatLongDate(todayISO());
  $("#dashboard-greeting").textContent = greeting();

  bindEvents();
  loadSettings().finally(() => {
    const requestedView = location.hash.replace("#", "") || "dashboard";
    const view = VIEW_META[requestedView] ? requestedView : "dashboard";
    if (location.hash !== `#${view}`) {
      history.replaceState(null, "", `#${view}`);
    }
    showView(view);
  });
}

/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonth() {
  return todayISO().slice(0, 7);
}

function parseLocalDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
}

function formatLongDate(isoDate) {
  return parseLocalDate(isoDate).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(isoDate) {
  return parseLocalDate(isoDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMonth(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function formatMonthShort(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatPercentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  const rounded = Math.round(number * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function setPill(element, text, type = "neutral") {
  if (!element) return;
  element.className = `pill pill-${type}`;
  element.textContent = text;
}

function showToast(message, type = "success") {
  const stack = $("#toast-stack");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const toastIcon = type === "error" ? "alert" : type === "info" ? "spark" : "check";
  toast.innerHTML = `
    <span class="toast-icon">${icon(toastIcon)}</span>
    <span>${escapeHtml(message)}</span>
  `;
  stack.append(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-out");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function setBusy(button, busy) {
  if (!button) return;
  button.classList.toggle("is-loading", busy);
  button.disabled = busy;
}

function setFormError(element, message = "") {
  if (!element) return;
  if (message) {
    element.textContent = message;
    element.hidden = false;
  } else {
    element.textContent = "";
    element.hidden = true;
  }
}

async function api(path, options = {}) {
  const config = {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  };

  if (options.body && typeof options.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, config);
  } catch {
    throw new Error("Could not reach the server. Is the application running?");
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function emptyState({ iconName = "book", title, message, action = "" }) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon">${icon(iconName)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${action}
    </div>
  `;
}

function setLoading(container, message = "Loading…") {
  if (container) {
    container.innerHTML = `<div class="loading-state">${escapeHtml(message)}</div>`;
  }
}

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */

function showView(view) {
  if (!VIEW_META[view]) view = "dashboard";
  state.view = view;

  $$(".view").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });

  $$(".nav-link").forEach((link) => {
    const active = link.dataset.nav === view;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const meta = VIEW_META[view];
  $("#page-eyebrow").textContent = meta.eyebrow;
  $("#page-title").textContent = meta.title;
  document.title = `${meta.title} · Attendly`;

  closeNav();
  loadView(view);
}

function loadView(view) {
  switch (view) {
    case "dashboard":
      loadDashboard();
      break;
    case "attendance":
      loadAttendance();
      break;
    case "students":
      loadStudents();
      break;
    case "reports":
      loadReports();
      break;
    case "settings":
      loadSettingsView();
      break;
    default:
      break;
  }
}

function openNav() {
  document.body.classList.add("nav-open");
  $("#sidebar-scrim").hidden = false;
  $("#menu-toggle").setAttribute("aria-expanded", "true");
}

function closeNav() {
  document.body.classList.remove("nav-open");
  $("#sidebar-scrim").hidden = true;
  $("#menu-toggle").setAttribute("aria-expanded", "false");
}

/* --------------------------------------------------------------------------
   Event bindings
   -------------------------------------------------------------------------- */

function bindEvents() {
  window.addEventListener("hashchange", () => {
    const view = location.hash.replace("#", "") || "dashboard";
    showView(VIEW_META[view] ? view : "dashboard");
  });

  $("#menu-toggle").addEventListener("click", () => {
    if (document.body.classList.contains("nav-open")) {
      closeNav();
    } else {
      openNav();
    }
  });

  $("#sidebar-scrim").addEventListener("click", closeNav);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeNav();
  });

  // Students -----------------------------------------------------------------
  $("#add-student-form").addEventListener("submit", handleAddStudent);
  $("#student-search").addEventListener("input", (event) => {
    state.studentSearch = event.target.value;
    renderStudentList();
  });
  $("#students-list").addEventListener("click", handleStudentListClick);

  // Edit dialog --------------------------------------------------------------
  $("#edit-dialog-close").addEventListener("click", () => $("#edit-student-dialog").close());
  $("#edit-cancel").addEventListener("click", () => $("#edit-student-dialog").close());
  $("#edit-student-form").addEventListener("submit", handleEditStudent);

  // Attendance ---------------------------------------------------------------
  $("#attendance-date").addEventListener("change", handleAttendanceDateChange);
  $("#refresh-attendance").addEventListener("click", () => {
    if (state.attendance?.dirty && !window.confirm("Discard unsaved attendance changes?")) {
      return;
    }
    loadAttendance();
  });
  $("#period-toggles").addEventListener("change", handlePeriodToggle);
  $("#period-all").addEventListener("click", selectAllPeriods);
  $("#bulk-present").addEventListener("click", () => markAll("Present"));
  $("#bulk-absent").addEventListener("click", () => markAll("Absent"));
  $("#save-attendance").addEventListener("click", saveAttendance);
  $("#attendance-table-wrap").addEventListener("click", handleAttendanceCellClick);

  // Reports ------------------------------------------------------------------
  $("#report-month").addEventListener("change", (event) => {
    state.reportMonth = event.target.value || currentMonth();
    loadReports();
  });
  $("#load-report").addEventListener("click", loadReports);
  $("#report-table").addEventListener("click", handleReportTableClick);
  $("#report-dialog-close").addEventListener("click", () => $("#report-dialog").close());

  // Settings -----------------------------------------------------------------
  $("#settings-form").addEventListener("submit", handleSaveSettings);

  // Confirmation dialog ------------------------------------------------------
  $("#confirm-cancel").addEventListener("click", () => finishConfirm(false));
  $("#confirm-ok").addEventListener("click", () => finishConfirm(true));
  $("#confirm-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    finishConfirm(false);
  });
  $("#confirm-dialog").addEventListener("close", () => {
    if (state.confirmResolve) finishConfirm(false);
  });

  // Close modals by clicking the backdrop ------------------------------------
  $$(".modal").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

/* --------------------------------------------------------------------------
   Settings & system status
   -------------------------------------------------------------------------- */

async function loadSettings() {
  try {
    const settings = await api("/api/settings");
    state.settings = settings;
    $("#threshold-input").value = settings.attendance_threshold;
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function loadSettingsView() {
  $("#threshold-input").value = state.settings.attendance_threshold;
  $("#system-version").textContent = "—";
  setPill($("#system-status"), "Checking…", "neutral");

  try {
    const health = await api("/api/health");
    $("#system-version").textContent = health.version || "1.0.0";
    $("#system-health").textContent = `OK · ${formatNumber(health.uptime_seconds)}s uptime`;
    setPill($("#system-status"), "Online", "success");
  } catch (error) {
    $("#system-health").textContent = "Unavailable";
    setPill($("#system-status"), "Offline", "danger");
    showToast(error.message, "error");
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();
  const errorElement = $("#settings-form-error");
  const button = $("#save-settings");
  const value = $("#threshold-input").value.trim();
  const threshold = Number(value);

  setFormError(errorElement);

  if (!value || !Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    setFormError(errorElement, "Enter a whole number between 0 and 100.");
    $("#threshold-input").focus();
    return;
  }

  setBusy(button, true);
  try {
    const result = await api("/api/settings", {
      method: "PUT",
      body: { attendance_threshold: threshold },
    });
    state.settings.attendance_threshold = result.attendance_threshold;
    setPill($("#report-threshold"), `Threshold: ${result.attendance_threshold}%`, "neutral");
    showToast("Attendance threshold updated.");
  } catch (error) {
    setFormError(errorElement, error.message);
    showToast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

/* --------------------------------------------------------------------------
   Dashboard
   -------------------------------------------------------------------------- */

async function loadDashboard() {
  const month = currentMonth();
  const date = todayISO();
  $("#dashboard-month-label").textContent = formatMonth(month);
  $("#dashboard-greeting").textContent = greeting();

  try {
    const data = await api(
      `/api/dashboard?month=${encodeURIComponent(month)}&date=${encodeURIComponent(date)}`,
    );
    renderDashboard(data);
  } catch (error) {
    showToast(error.message, "error");
    renderDashboardError(error.message);
  }
}

function renderDashboard(data) {
  const report = data.month_report;
  const percentageValue = report.average_percentage || 0;

  $("#dashboard-ring").style.setProperty("--value", Math.min(100, Math.max(0, percentageValue)));
  $("#dashboard-ring-value").textContent = formatPercentage(percentageValue);
  $("#dashboard-month-label").textContent = formatMonth(data.month);

  const stats = [
    {
      icon: "users",
      tone: "",
      label: "Total students",
      value: formatNumber(data.total_students),
      meta: "in the class roster",
    },
    {
      icon: "chart",
      tone: "blue",
      label: "Monthly attendance",
      value: formatPercentage(report.average_percentage),
      meta: `${formatNumber(report.total_present)} present · ${formatNumber(report.total_absent)} absent`,
    },
    {
      icon: "calendar",
      tone: "amber",
      label: "Working periods",
      value: formatNumber(report.class_working_periods),
      meta: `${pluralize(data.history.length, "day")} with saved registers`,
    },
    {
      icon: "alert",
      tone: "rose",
      label: "Low attendance",
      value: formatNumber(report.low_attendance_count),
      meta: `below the ${data.threshold}% threshold`,
    },
  ];

  $("#dashboard-stats").innerHTML = stats
    .map(
      (stat) => `
        <article class="stat-card">
          <span class="stat-icon ${stat.tone}">${icon(stat.icon)}</span>
          <div class="stat-content">
            <span class="stat-label">${escapeHtml(stat.label)}</span>
            <div class="stat-value">${escapeHtml(stat.value)}</div>
            <span class="stat-meta">${escapeHtml(stat.meta)}</span>
          </div>
        </article>
      `,
    )
    .join("");

  renderTrend(data.history);
  renderToday(data.today);
  renderLowStudents(
    data.low_students,
    data.threshold,
    report.low_attendance_count,
  );
}

function renderDashboardError(message) {
  $("#dashboard-stats").innerHTML = `
    <div class="empty-inline" style="grid-column: 1 / -1;">
      ${escapeHtml(message)}
    </div>
  `;
  $("#dashboard-trend").innerHTML = `<div class="empty-inline">Trend data is unavailable.</div>`;
  $("#dashboard-today").innerHTML = `
    <div class="card-heading"><div><span class="eyebrow">Today</span><h2>Today’s register</h2></div></div>
    <div class="empty-inline">${escapeHtml(message)}</div>
  `;
  $("#dashboard-low").innerHTML = `<div class="empty-inline">Low-attendance data is unavailable.</div>`;
}

function renderTrend(history) {
  const recent = [...history].slice(0, 7).reverse();
  const pill = $("#trend-pill");

  if (recent.length === 0) {
    setPill(pill, "No records", "neutral");
    $("#dashboard-trend").innerHTML =
      '<div class="empty-inline">Save a daily register to start the monthly trend.</div>';
    return;
  }

  setPill(pill, `Last ${pluralize(recent.length, "day")}`, "neutral");
  const average = recent.reduce((sum, day) => sum + day.percentage, 0) / recent.length;

  $("#dashboard-trend").innerHTML = `
    <div class="trend-chart" aria-label="Attendance percentage for recent saved days">
      ${recent
        .map((day) => {
          const label = parseLocalDate(day.date).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
          });
          const barHeight = Math.max(3, Math.min(100, day.percentage));
          return `
            <div class="trend-item ${day.percentage < average ? "low" : ""}" title="${escapeHtml(formatShortDate(day.date))}: ${formatPercentage(day.percentage)}">
              <span class="trend-value">${escapeHtml(formatPercentage(day.percentage))}</span>
              <div class="trend-bar-track">
                <div class="trend-bar" style="--bar: ${barHeight}%"></div>
              </div>
              <span class="trend-label">${escapeHtml(label)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderToday(today) {
  const container = $("#dashboard-today");
  const pill = $("#today-status-pill");
  const saved = today.saved;

  setPill(pill, saved ? "Saved" : "Not saved", saved ? "success" : "warning");

  container.innerHTML = `
    <div class="card-heading">
      <div>
        <span class="eyebrow">Today</span>
        <h2>Today’s register</h2>
      </div>
      <span class="pill ${saved ? "pill-success" : "pill-warning"}" id="today-status-pill">${saved ? "Saved" : "Not saved"}</span>
    </div>
    <div class="today-body">
      <div class="today-main">
        <div class="today-number">
          <strong>${escapeHtml(formatPercentage(today.percentage))}</strong>
          <span>${saved ? "present" : "no data"}</span>
        </div>
        <div class="today-copy">
          <strong>${saved ? `${pluralize(today.students_marked, "student")} marked` : "Register not started"}</strong>
          <p>${
            saved
              ? `${pluralize(today.present, "present period")} · ${pluralize(today.absent, "absent period")} across ${pluralize(today.working_periods, "working period")}.`
              : "No attendance has been saved for today yet. Open the register and mark all seven periods."
          }</p>
        </div>
      </div>
      <div class="today-actions">
        <a class="btn btn-secondary btn-small" href="#attendance">${saved ? "Review register" : "Start register"} ${icon("arrow")}</a>
        <a class="btn btn-ghost btn-small" href="#reports">View report</a>
      </div>
    </div>
  `;
}

function renderLowStudents(students, threshold, totalLow = students.length) {
  const container = $("#dashboard-low");
  setPill(
    $("#low-count-pill"),
    pluralize(totalLow, "student"),
    totalLow ? "warning" : "success",
  );

  if (!students.length) {
    container.innerHTML = `
      <div class="empty-state" style="min-height: 150px;">
        <span class="empty-state-icon">${icon("check")}</span>
        <h3>Everyone is on track</h3>
        <p>No student is below the ${threshold}% threshold for this month.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="low-list">
      ${students
        .map(
          (student) => `
            <div class="low-item">
              <span class="low-avatar">${escapeHtml(initials(student.name))}</span>
              <div class="low-info">
                <strong>${escapeHtml(student.name)}</strong>
                <small>${escapeHtml(student.roll_number)} · ${escapeHtml(student.department)}</small>
              </div>
              <span class="low-percent">${escapeHtml(formatPercentage(student.attendance_percentage))}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

/* --------------------------------------------------------------------------
   Students
   -------------------------------------------------------------------------- */

async function loadStudents() {
  setLoading($("#students-list"), "Loading students…");
  try {
    state.students = await api("/api/students");
    renderStudentList();
  } catch (error) {
    $("#students-list").innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`;
    showToast(error.message, "error");
  }
}

function renderStudentList() {
  const container = $("#students-list");
  const badge = $("#student-count-badge");
  badge.textContent = formatNumber(state.students.length);

  const query = state.studentSearch.trim().toLowerCase();
  const filtered = query
    ? state.students.filter((student) =>
        [student.name, student.roll_number, student.department]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : state.students;

  if (state.students.length === 0) {
    container.innerHTML = emptyState({
      iconName: "users",
      title: "Your roster is empty",
      message: "Add your first student using the form to begin marking attendance.",
      action: '<button class="btn btn-secondary btn-small" type="button" data-focus-add>Add a student</button>',
    });
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = emptyState({
      iconName: "search",
      title: "No matches found",
      message: `No student matches “${state.studentSearch.trim()}”. Try a different roll number, name, or department.`,
    });
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table roster-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Roll number</th>
            <th>Department</th>
            <th class="table-actions-head">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (student) => `
                <tr>
                  <td>
                    <div class="student-identity">
                      <span class="student-avatar">${escapeHtml(initials(student.name))}</span>
                      <div class="student-identity-copy">
                        <strong>${escapeHtml(student.name)}</strong>
                        <small>${escapeHtml(student.department)}</small>
                      </div>
                    </div>
                  </td>
                  <td class="num">${escapeHtml(student.roll_number)}</td>
                  <td>${escapeHtml(student.department)}</td>
                  <td>
                    <div class="row-actions">
                      <button class="action-button" type="button" data-edit-student="${student.id}" aria-label="Edit ${escapeHtml(student.name)}">
                        ${icon("edit")}
                      </button>
                      <button class="action-button danger" type="button" data-delete-student="${student.id}" aria-label="Delete ${escapeHtml(student.name)}">
                        ${icon("trash")}
                      </button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function handleAddStudent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#add-student-button");
  const errorElement = $("#student-form-error");

  const rollNumber = form.elements.roll_number.value.trim();
  const name = form.elements.name.value.trim();
  const department = form.elements.department.value.trim();

  setFormError(errorElement);

  if (!rollNumber || !name || !department) {
    setFormError(errorElement, "Roll number, name and department are required.");
    return;
  }

  setBusy(button, true);
  try {
    await api("/api/students", {
      method: "POST",
      body: {
        roll_number: rollNumber,
        name,
        department,
      },
    });
    form.reset();
    showToast(`${name} was added to the roster.`);
    await loadStudents();
    form.elements.roll_number.focus();
  } catch (error) {
    setFormError(errorElement, error.message);
    showToast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function handleStudentListClick(event) {
  const focusAdd = event.target.closest("[data-focus-add]");
  if (focusAdd) {
    $("#student-roll").focus();
    return;
  }

  const editButton = event.target.closest("[data-edit-student]");
  if (editButton) {
    openEditStudent(Number(editButton.dataset.editStudent));
    return;
  }

  const deleteButton = event.target.closest("[data-delete-student]");
  if (deleteButton) {
    deleteStudent(Number(deleteButton.dataset.deleteStudent));
  }
}

function openEditStudent(id) {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;

  state.editingStudentId = id;
  $("#edit-roll").value = student.roll_number;
  $("#edit-name").value = student.name;
  $("#edit-department").value = student.department;
  setFormError($("#edit-student-error"));
  $("#edit-student-dialog").showModal();
  $("#edit-name").focus();
}

async function handleEditStudent(event) {
  event.preventDefault();
  const errorElement = $("#edit-student-error");
  const button = $("#edit-save");
  const rollNumber = $("#edit-roll").value.trim();
  const name = $("#edit-name").value.trim();
  const department = $("#edit-department").value.trim();

  setFormError(errorElement);

  if (!rollNumber || !name || !department) {
    setFormError(errorElement, "Roll number, name and department are required.");
    return;
  }

  if (!state.editingStudentId) return;

  setBusy(button, true);
  try {
    await api(`/api/students/${state.editingStudentId}`, {
      method: "PUT",
      body: {
        roll_number: rollNumber,
        name,
        department,
      },
    });
    $("#edit-student-dialog").close();
    showToast("Student details updated.");
    await loadStudents();
  } catch (error) {
    setFormError(errorElement, error.message);
    showToast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function deleteStudent(id) {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;

  const confirmed = await confirmDialog({
    title: "Remove this student?",
    message: `${student.name} (${student.roll_number}) and all of their attendance records will be permanently deleted.`,
    confirmLabel: "Delete student",
  });

  if (!confirmed) return;

  try {
    await api(`/api/students/${id}`, { method: "DELETE" });
    showToast(`${student.name} was removed from the roster.`);
    await loadStudents();
  } catch (error) {
    showToast(error.message, "error");
  }
}

/* --------------------------------------------------------------------------
   Confirmation dialog
   -------------------------------------------------------------------------- */

function confirmDialog({ title, message, confirmLabel = "Confirm" }) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  $("#confirm-ok").textContent = confirmLabel;

  return new Promise((resolve) => {
    state.confirmResolve = resolve;
    dialog.showModal();
    $("#confirm-cancel").focus();
  });
}

function finishConfirm(value) {
  const dialog = $("#confirm-dialog");
  if (dialog.open) dialog.close();
  if (state.confirmResolve) {
    const resolve = state.confirmResolve;
    state.confirmResolve = null;
    resolve(value);
  }
}

/* --------------------------------------------------------------------------
   Attendance
   -------------------------------------------------------------------------- */

async function loadAttendance() {
  const date = state.attendanceDate || todayISO();
  state.attendanceDate = date;
  $("#attendance-date").value = date;
  $("#save-attendance").disabled = true;
  setLoading($("#attendance-table-wrap"), "Loading the class register…");
  setPill($("#attendance-save-status"), "Loading", "neutral");

  try {
    const data = await api(`/api/attendance?date=${encodeURIComponent(date)}`);
    const statuses = new Map();
    for (const student of data.students) {
      for (const [period, status] of Object.entries(student.attendance || {})) {
        statuses.set(`${student.id}:${period}`, status);
      }
    }

    state.attendance = {
      ...data,
      statuses,
      workingPeriods: new Set(data.working_periods),
      dirty: false,
    };

    renderPeriodToggles();
    renderAttendanceTable();
    renderAttendanceMeta();
    updateAttendanceDirtyUI();
  } catch (error) {
    $("#attendance-table-wrap").innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`;
    setPill($("#attendance-save-status"), "Unavailable", "danger");
    showToast(error.message, "error");
  }
}

function handleAttendanceDateChange(event) {
  const nextDate = event.target.value;
  if (!nextDate) return;

  if (state.attendance?.dirty && !window.confirm("Discard unsaved attendance changes?")) {
    event.target.value = state.attendance.date;
    return;
  }

  state.attendanceDate = nextDate;
  loadAttendance();
}

function renderPeriodToggles() {
  const container = $("#period-toggles");
  const working = state.attendance?.workingPeriods || new Set(PERIODS);

  container.innerHTML = PERIODS.map(
    (period) => `
      <label class="period-toggle">
        <input type="checkbox" value="${period}" ${working.has(period) ? "checked" : ""} aria-label="Period ${period} is a working period" />
        <span>P${period}</span>
      </label>
    `,
  ).join("");
}

function handlePeriodToggle(event) {
  const input = event.target.closest("input[type=checkbox]");
  if (!input || !state.attendance) return;

  const period = Number(input.value);
  const working = state.attendance.workingPeriods;

  if (!input.checked && working.size === 1) {
    input.checked = true;
    showToast("At least one working period is required.", "info");
    return;
  }

  if (input.checked) {
    working.add(period);
  } else {
    working.delete(period);
  }

  state.attendance.dirty = true;
  renderAttendanceTable();
  renderAttendanceMeta();
  updateAttendanceDirtyUI();
}

function selectAllPeriods() {
  if (!state.attendance) return;
  state.attendance.workingPeriods = new Set(PERIODS);
  state.attendance.dirty = true;
  renderPeriodToggles();
  renderAttendanceTable();
  renderAttendanceMeta();
  updateAttendanceDirtyUI();
}

function markAll(status) {
  if (!state.attendance) return;
  for (const student of state.attendance.students) {
    for (const period of state.attendance.workingPeriods) {
      state.attendance.statuses.set(`${student.id}:${period}`, status);
    }
  }
  state.attendance.dirty = true;
  renderAttendanceTable();
  renderAttendanceMeta();
  updateAttendanceDirtyUI();
  showToast(`All working periods marked ${status.toLowerCase()}.`, "info");
}

function renderAttendanceTable() {
  const container = $("#attendance-table-wrap");
  const attendance = state.attendance;

  if (!attendance) {
    container.innerHTML = '<div class="empty-inline">Choose a date to load the register.</div>';
    return;
  }

  if (attendance.students.length === 0) {
    container.innerHTML = emptyState({
      iconName: "users",
      title: "No students to mark",
      message: "Add students to your class roster before taking attendance.",
      action: '<a class="btn btn-secondary btn-small" href="#students">Go to students</a>',
    });
    $("#save-attendance").disabled = true;
    return;
  }

  const working = attendance.workingPeriods;
  const rows = attendance.students
    .map((student) => {
      const periodCells = PERIODS.map((period) => {
        if (!working.has(period)) {
          return '<td class="period-cell"><span class="period-off" aria-label="Not a working period">—</span></td>';
        }

        const status = attendance.statuses.get(`${student.id}:${period}`) || "";
        const label = status || "Unmarked";
        const text = status === "Present" ? "P" : status === "Absent" ? "A" : "–";
        return `
          <td class="period-cell">
            <button
              class="status-button ${status.toLowerCase()}"
              type="button"
              data-student-id="${student.id}"
              data-period="${period}"
              data-status="${status}"
              aria-label="${escapeHtml(student.name)}, period ${period}, ${label}. Click to change."
              title="Click to cycle: Present → Absent → clear"
            >${text}</button>
          </td>
        `;
      }).join("");

      const presentCount = Array.from(working).filter(
        (period) => attendance.statuses.get(`${student.id}:${period}`) === "Present",
      ).length;

      return `
        <tr data-row-student="${student.id}">
          <td>
            <div class="student-identity">
              <span class="student-avatar">${escapeHtml(initials(student.name))}</span>
              <div class="student-identity-copy">
                <strong>${escapeHtml(student.name)}</strong>
                <small>${escapeHtml(student.department)}</small>
              </div>
            </div>
          </td>
          <td class="num">${escapeHtml(student.roll_number)}</td>
          ${periodCells}
          <td class="summary-cell">
            <span class="day-summary"><strong data-present-count>${presentCount}</strong><span class="slash">/</span>${working.size}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table class="data-table attendance-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Roll number</th>
          ${PERIODS.map((period) => `<th class="period-head">P${period}</th>`).join("")}
          <th class="summary-head">Present</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  $("#save-attendance").disabled = attendance.students.length === 0;
}

function renderAttendanceMeta() {
  const attendance = state.attendance;
  if (!attendance) return;

  const dateText = formatLongDate(attendance.date);
  const studentCount = attendance.students.length;
  const periodCount = attendance.workingPeriods.size;
  $("#attendance-context").textContent = `${dateText} · ${pluralize(studentCount, "student")} · ${pluralize(periodCount, "working period")}`;

  const counts = countAttendanceStatuses();
  $("#attendance-counts").innerHTML = `
    <span class="count-item"><span class="count-dot present"></span>${formatNumber(counts.present)} present</span>
    <span class="count-item"><span class="count-dot absent"></span>${formatNumber(counts.absent)} absent</span>
    <span class="count-item"><span class="count-dot blank"></span>${formatNumber(counts.blank)} unmarked</span>
  `;

  const hint = $("#attendance-hint");
  if (counts.blank > 0) {
    hint.textContent = `${pluralize(counts.blank, "cell")} still unmarked. Mark every student for each working period, then save.`;
  } else {
    hint.textContent = "All working periods are marked. Save to update the register.";
  }
}

function countAttendanceStatuses() {
  const counts = { present: 0, absent: 0, blank: 0 };
  const attendance = state.attendance;
  if (!attendance) return counts;

  for (const student of attendance.students) {
    for (const period of attendance.workingPeriods) {
      const status = attendance.statuses.get(`${student.id}:${period}`);
      if (status === "Present") counts.present += 1;
      else if (status === "Absent") counts.absent += 1;
      else counts.blank += 1;
    }
  }

  return counts;
}

function updateAttendanceDirtyUI() {
  const attendance = state.attendance;
  if (!attendance) return;
  const pill = $("#attendance-save-status");

  if (attendance.dirty) {
    setPill(pill, "Unsaved changes", "warning");
  } else if (attendance.saved) {
    setPill(pill, "Saved", "success");
  } else {
    setPill(pill, "Not saved", "neutral");
  }
}

function handleAttendanceCellClick(event) {
  const button = event.target.closest(".status-button");
  if (!button || button.disabled || !state.attendance) return;

  const studentId = Number(button.dataset.studentId);
  const period = Number(button.dataset.period);
  const key = `${studentId}:${period}`;
  const current = state.attendance.statuses.get(key) || "";
  const next = current === "Present" ? "Absent" : current === "Absent" ? "" : "Present";

  if (next) {
    state.attendance.statuses.set(key, next);
  } else {
    state.attendance.statuses.delete(key);
  }

  state.attendance.dirty = true;
  updateStatusButton(button, next, studentId, period);
  updateRowSummary(studentId);
  renderAttendanceMeta();
  updateAttendanceDirtyUI();
}

function updateStatusButton(button, status, studentId, period) {
  const student = state.attendance.students.find((item) => item.id === studentId);
  const label = status || "Unmarked";
  button.dataset.status = status;
  button.classList.remove("present", "absent", "missing");
  if (status === "Present") button.classList.add("present");
  if (status === "Absent") button.classList.add("absent");
  button.textContent = status === "Present" ? "P" : status === "Absent" ? "A" : "–";
  button.setAttribute(
    "aria-label",
    `${student?.name || "Student"}, period ${period}, ${label}. Click to change.`,
  );
}

function updateRowSummary(studentId) {
  const row = $(`tr[data-row-student="${studentId}"]`);
  if (!row) return;
  const presentCount = Array.from(state.attendance.workingPeriods).filter(
    (period) => state.attendance.statuses.get(`${studentId}:${period}`) === "Present",
  ).length;
  const value = $("[data-present-count]", row);
  if (value) value.textContent = presentCount;
}

async function saveAttendance() {
  if (!state.attendance) return;
  const button = $("#save-attendance");
  const attendance = state.attendance;

  if (attendance.students.length === 0) {
    showToast("Add students before saving attendance.", "error");
    return;
  }

  const missingButtons = [];
  for (const student of attendance.students) {
    for (const period of attendance.workingPeriods) {
      if (!attendance.statuses.get(`${student.id}:${period}`)) {
        const selector = `.status-button[data-student-id="${student.id}"][data-period="${period}"]`;
        const cell = $(selector);
        if (cell) {
          cell.classList.add("missing");
          missingButtons.push(cell);
        }
      }
    }
  }

  if (missingButtons.length > 0) {
    showToast(
      `Mark every cell before saving. ${pluralize(missingButtons.length, "cell")} still unmarked.`,
      "error",
    );
    missingButtons[0].scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => missingButtons[0]?.focus(), 350);
    return;
  }

  const records = [];
  for (const student of attendance.students) {
    for (const period of attendance.workingPeriods) {
      records.push({
        student_id: student.id,
        period,
        status: attendance.statuses.get(`${student.id}:${period}`),
      });
    }
  }

  setBusy(button, true);
  try {
    await api("/api/attendance", {
      method: "POST",
      body: {
        date: attendance.date,
        working_periods: Array.from(attendance.workingPeriods).sort((a, b) => a - b),
        attendance: records,
      },
    });
    showToast("Attendance saved successfully.");
    await loadAttendance();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

/* --------------------------------------------------------------------------
   Reports
   -------------------------------------------------------------------------- */

async function loadReports() {
  const month = state.reportMonth || currentMonth();
  state.reportMonth = month;
  $("#report-month").value = month;
  $("#download-csv").href = `/api/reports/monthly.csv?month=${encodeURIComponent(month)}`;

  setLoading($("#report-table"), "Loading monthly report…");
  setLoading($("#report-history"), "Loading daily history…");

  try {
    const [report, history] = await Promise.all([
      api(`/api/reports/monthly?month=${encodeURIComponent(month)}`),
      api(`/api/attendance/history?month=${encodeURIComponent(month)}`),
    ]);

    state.report = report;
    state.history = history.days;
    renderReportSummary(report);
    renderReportTable(report);
    renderReportHistory(history.days);
  } catch (error) {
    $("#report-table").innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`;
    $("#report-history").innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`;
    showToast(error.message, "error");
  }
}

function renderReportSummary(report) {
  const stats = [
    {
      icon: "chart",
      tone: "blue",
      label: "Average attendance",
      value: formatPercentage(report.average_percentage),
      meta: `${formatNumber(report.total_present)} present · ${formatNumber(report.total_absent)} absent`,
    },
    {
      icon: "calendar",
      tone: "",
      label: "Working periods",
      value: formatNumber(report.class_working_periods),
      meta: "saved across the month",
    },
    {
      icon: "users",
      tone: "amber",
      label: "Students",
      value: formatNumber(report.student_count),
      meta: "included in the report",
    },
    {
      icon: "alert",
      tone: "rose",
      label: "Low attendance",
      value: formatNumber(report.low_attendance_count),
      meta: `below ${report.threshold}%`,
    },
  ];

  $("#report-summary").innerHTML = stats
    .map(
      (stat) => `
        <article class="stat-card">
          <span class="stat-icon ${stat.tone}">${icon(stat.icon)}</span>
          <div class="stat-content">
            <span class="stat-label">${escapeHtml(stat.label)}</span>
            <div class="stat-value">${escapeHtml(stat.value)}</div>
            <span class="stat-meta">${escapeHtml(stat.meta)}</span>
          </div>
        </article>
      `,
    )
    .join("");

  $("#report-context").textContent = `${formatMonth(report.month)} · ${pluralize(report.class_working_periods, "working period")} · ${pluralize(report.student_count, "student")}`;
  setPill($("#report-threshold"), `Threshold: ${report.threshold}%`, "neutral");
  $("#download-csv").href = `/api/reports/monthly.csv?month=${encodeURIComponent(report.month)}`;
}

function renderReportTable(report) {
  const container = $("#report-table");

  if (report.students.length === 0) {
    container.innerHTML = emptyState({
      iconName: "users",
      title: "No students in the report",
      message: "Add students to the class roster and save attendance to see monthly figures.",
      action: '<a class="btn btn-secondary btn-small" href="#students">Go to students</a>',
    });
    return;
  }

  container.innerHTML = `
    <table class="data-table report-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Roll number</th>
          <th>Department</th>
          <th>Working periods</th>
          <th>Present</th>
          <th>Absent</th>
          <th>Attendance</th>
          <th>Status</th>
          <th class="table-actions-head">Report</th>
        </tr>
      </thead>
      <tbody>
        ${report.students
          .map((student) => {
            const hasData = student.working_periods > 0;
            const progressClass = student.low_attendance ? "warning" : "";
            return `
              <tr class="${student.low_attendance ? "low-row" : ""}">
                <td>
                  <div class="student-identity">
                    <span class="student-avatar">${escapeHtml(initials(student.name))}</span>
                    <div class="student-identity-copy">
                      <strong>${escapeHtml(student.name)}</strong>
                      <small>${escapeHtml(student.department)}</small>
                    </div>
                  </div>
                </td>
                <td class="num">${escapeHtml(student.roll_number)}</td>
                <td>${escapeHtml(student.department)}</td>
                <td class="num">${formatNumber(student.working_periods)}</td>
                <td class="num">${formatNumber(student.present)}</td>
                <td class="num">${formatNumber(student.absent)}</td>
                <td>
                  <div class="progress-cell">
                    <div class="progress-track">
                      <div class="progress-fill ${progressClass}" style="--progress: ${Math.min(100, student.attendance_percentage)}%"></div>
                    </div>
                    <span class="progress-value">${hasData ? escapeHtml(formatPercentage(student.attendance_percentage)) : "No data"}</span>
                  </div>
                </td>
                <td>
                  ${
                    !hasData
                      ? '<span class="pill pill-neutral">No data</span>'
                      : student.low_attendance
                        ? '<span class="pill pill-warning">Needs attention</span>'
                        : '<span class="pill pill-success">On track</span>'
                  }
                </td>
                <td>
                  <div class="row-actions">
                    <button class="action-button" type="button" data-report-student="${student.id}" aria-label="View report for ${escapeHtml(student.name)}">
                      ${icon("chevron")}
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderReportHistory(days) {
  const container = $("#report-history");

  if (days.length === 0) {
    container.innerHTML = emptyState({
      iconName: "calendar",
      title: "No saved registers",
      message: "Daily attendance history will appear here after you save a register for this month.",
      action: '<a class="btn btn-secondary btn-small" href="#attendance">Take attendance</a>',
    });
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Working periods</th>
          <th>Students marked</th>
          <th>Present</th>
          <th>Absent</th>
          <th>Attendance</th>
        </tr>
      </thead>
      <tbody>
        ${days
          .map(
            (day) => `
              <tr>
                <td>
                  <div class="history-date">
                    <span class="history-date-icon">${icon("calendar")}</span>
                    <div>
                      <strong>${escapeHtml(formatShortDate(day.date))}</strong>
                      <small>${escapeHtml(parseLocalDate(day.date).toLocaleDateString(undefined, { weekday: "long" }))}</small>
                    </div>
                  </div>
                </td>
                <td class="num">${formatNumber(day.working_periods)}</td>
                <td class="num">${formatNumber(day.students_marked)}</td>
                <td class="num">${formatNumber(day.present)}</td>
                <td class="num">${formatNumber(day.absent)}</td>
                <td>
                  <div class="progress-cell">
                    <div class="progress-track">
                      <div class="progress-fill ${day.percentage < state.settings.attendance_threshold ? "warning" : ""}" style="--progress: ${Math.min(100, day.percentage)}%"></div>
                    </div>
                    <span class="progress-value">${escapeHtml(formatPercentage(day.percentage))}</span>
                  </div>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function handleReportTableClick(event) {
  const button = event.target.closest("[data-report-student]");
  if (!button) return;
  openStudentReport(Number(button.dataset.reportStudent));
}

async function openStudentReport(studentId) {
  const dialog = $("#report-dialog");
  $("#report-dialog-title").textContent = "Student report";
  $("#report-dialog-content").innerHTML = '<div class="loading-state">Loading report…</div>';
  dialog.showModal();

  try {
    const report = await api(
      `/api/reports/student/${studentId}?month=${encodeURIComponent(state.reportMonth)}`,
    );
    $("#report-dialog-title").textContent = report.name;
    renderStudentReport(report);
  } catch (error) {
    $("#report-dialog-content").innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`;
    showToast(error.message, "error");
  }
}

function renderStudentReport(report) {
  const hasData = report.working_periods > 0;
  const statusPill = !hasData
    ? '<span class="pill pill-neutral">No data</span>'
    : report.low_attendance
      ? '<span class="pill pill-warning">Needs attention</span>'
      : '<span class="pill pill-success">On track</span>';

  const daily = report.daily.length
    ? report.daily
        .map(
          (day) => `
            <div class="daily-item">
              <div>
                <strong>${escapeHtml(formatShortDate(day.date))}</strong>
                <small>${pluralize(day.present, "present")} · ${pluralize(day.absent, "absent")} · ${escapeHtml(formatPercentage(day.percentage))}</small>
              </div>
              <div class="period-mini-list" aria-label="Periods for ${escapeHtml(formatShortDate(day.date))}">
                ${day.periods
                  .map(
                    (period) => `
                      <span class="period-mini ${period.status.toLowerCase()}" title="Period ${period.period}: ${escapeHtml(period.status)}">P${period.period}</span>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          `,
        )
        .join("")
    : '<div class="empty-inline">No attendance recorded for this month.</div>';

  $("#report-dialog-content").innerHTML = `
    <div class="report-student-heading" style="display:flex;align-items:center;gap:13px;flex-wrap:wrap;margin-bottom:18px;">
      <span class="student-avatar" style="width:46px;height:46px;font-size:13px;">${escapeHtml(initials(report.name))}</span>
      <div style="min-width:0;flex:1;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:16px;letter-spacing:-.02em;">${escapeHtml(report.name)}</strong>
          ${statusPill}
        </div>
        <p style="margin-top:2px;color:var(--muted);font-size:11px;">${escapeHtml(report.roll_number)} · ${escapeHtml(report.department)} · ${escapeHtml(formatMonth(report.month))}</p>
      </div>
    </div>
    <div class="report-detail-grid">
      <div class="report-detail"><span>Attendance</span><strong>${hasData ? escapeHtml(formatPercentage(report.attendance_percentage)) : "No data"}</strong></div>
      <div class="report-detail"><span>Present</span><strong>${formatNumber(report.present)} <small>periods</small></strong></div>
      <div class="report-detail"><span>Absent</span><strong>${formatNumber(report.absent)} <small>periods</small></strong></div>
      <div class="report-detail"><span>Working periods</span><strong>${formatNumber(report.working_periods)}</strong></div>
    </div>
    <div class="card-heading" style="margin-bottom:10px;">
      <div><span class="eyebrow">Daily breakdown</span><h2 style="font-size:15px;">Saved days</h2></div>
      <span class="pill pill-neutral">${pluralize(report.daily.length, "day")}</span>
    </div>
    <div class="daily-list">${daily}</div>
  `;
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */
