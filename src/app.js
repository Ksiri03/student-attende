"use strict";

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const { getThreshold, setSetting } = require("./database");
const {
  getMonthlyReport,
  getDailyHistory,
  getDateSummary,
  getIndividualReport,
} = require("./reports");
const {
  PERIODS_PER_DAY,
  normalizeText,
  isValidDate,
  isValidMonth,
  isValidId,
  isValidPeriod,
  isValidStatus,
  parseThreshold,
} = require("./validation");
const packageJson = require("../package.json");

function createApp({ db, publicDir = path.join(__dirname, "..", "public") }) {
  if (!db) {
    throw new Error("A database instance is required.");
  }

  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.set("Cache-Control", "no-store");
    }
    next();
  });

  function apiError(res, status, message) {
    return res.status(status).json({ error: message });
  }

  function parseStudentPayload(body = {}) {
    const rollNumber = normalizeText(body.roll_number);
    const name = normalizeText(body.name);
    const department = normalizeText(body.department);

    if (!rollNumber || !name || !department) {
      return {
        error: "Roll number, name and department are required.",
      };
    }

    if (rollNumber.length > 30) {
      return { error: "Roll number must be 30 characters or fewer." };
    }

    if (name.length > 100) {
      return { error: "Student name must be 100 characters or fewer." };
    }

    if (department.length > 80) {
      return { error: "Department must be 80 characters or fewer." };
    }

    return { rollNumber, name, department };
  }

  function csvCell(value) {
    let text = String(value ?? "");
    // Prevent spreadsheet formula injection while keeping values readable.
    if (/^[=+\-@\t\r]/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  // ---------------------------------------------------------------------------
  // Health and settings
  // ---------------------------------------------------------------------------

  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      message: "Student Attendance API is running.",
      version: packageJson.version,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/settings", (req, res) => {
    res.json({
      attendance_threshold: getThreshold(db),
      periods_per_day: PERIODS_PER_DAY,
    });
  });

  app.put("/api/settings", (req, res) => {
    const threshold = parseThreshold(req.body?.attendance_threshold);

    if (threshold === null) {
      return apiError(
        res,
        400,
        "Attendance threshold must be a whole number between 0 and 100.",
      );
    }

    setSetting(db, "attendance_threshold", threshold);

    return res.json({
      message: "Settings saved successfully.",
      attendance_threshold: threshold,
      periods_per_day: PERIODS_PER_DAY,
    });
  });

  // ---------------------------------------------------------------------------
  // Students
  // ---------------------------------------------------------------------------

  app.get("/api/students", (req, res) => {
    const search = normalizeText(req.query.search);

    let students;
    if (search) {
      const pattern = `%${search}%`;
      students = db.prepare(`
        SELECT id, roll_number, name, department, created_at, updated_at
        FROM students
        WHERE roll_number LIKE ? OR name LIKE ? OR department LIKE ?
        ORDER BY roll_number COLLATE NOCASE, name COLLATE NOCASE
      `).all(pattern, pattern, pattern);
    } else {
      students = db.prepare(`
        SELECT id, roll_number, name, department, created_at, updated_at
        FROM students
        ORDER BY roll_number COLLATE NOCASE, name COLLATE NOCASE
      `).all();
    }

    res.json(students);
  });

  app.post("/api/students", (req, res) => {
    const payload = parseStudentPayload(req.body);

    if (payload.error) {
      return apiError(res, 400, payload.error);
    }

    try {
      const result = db.prepare(`
        INSERT INTO students (roll_number, name, department)
        VALUES (?, ?, ?)
      `).run(payload.rollNumber, payload.name, payload.department);

      return res.status(201).json({
        message: "Student added successfully.",
        student: {
          id: Number(result.lastInsertRowid),
          roll_number: payload.rollNumber,
          name: payload.name,
          department: payload.department,
        },
      });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return apiError(res, 409, "This roll number already exists.");
      }
      throw error;
    }
  });

  app.put("/api/students/:id", (req, res) => {
    if (!isValidId(req.params.id)) {
      return apiError(res, 400, "Invalid student id.");
    }

    const payload = parseStudentPayload(req.body);

    if (payload.error) {
      return apiError(res, 400, payload.error);
    }

    try {
      const result = db.prepare(`
        UPDATE students
        SET roll_number = ?, name = ?, department = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        payload.rollNumber,
        payload.name,
        payload.department,
        Number(req.params.id),
      );

      if (!result.changes) {
        return apiError(res, 404, "Student not found.");
      }

      return res.json({
        message: "Student updated successfully.",
        student: {
          id: Number(req.params.id),
          roll_number: payload.rollNumber,
          name: payload.name,
          department: payload.department,
        },
      });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return apiError(res, 409, "This roll number already exists.");
      }
      throw error;
    }
  });

  app.delete("/api/students/:id", (req, res) => {
    if (!isValidId(req.params.id)) {
      return apiError(res, 400, "Invalid student id.");
    }

    const result = db.prepare("DELETE FROM students WHERE id = ?").run(
      Number(req.params.id),
    );

    if (!result.changes) {
      return apiError(res, 404, "Student not found.");
    }

    return res.json({ message: "Student deleted successfully." });
  });

  // ---------------------------------------------------------------------------
  // Daily attendance
  // ---------------------------------------------------------------------------

  app.get("/api/attendance", (req, res) => {
    const date = req.query.date;

    if (!isValidDate(date)) {
      return apiError(res, 400, "Provide a valid date in YYYY-MM-DD format.");
    }

    const students = db.prepare(`
      SELECT id, roll_number, name, department
      FROM students
      ORDER BY roll_number COLLATE NOCASE, name COLLATE NOCASE
    `).all();

    const records = db.prepare(`
      SELECT student_id, period, status
      FROM attendance
      WHERE attendance_date = ?
      ORDER BY student_id, period
    `).all(date);

    const savedPeriods = db.prepare(`
      SELECT period
      FROM working_periods
      WHERE attendance_date = ?
      ORDER BY period
    `).all(date).map((row) => row.period);

    const attendanceByStudent = new Map();
    for (const record of records) {
      if (!attendanceByStudent.has(record.student_id)) {
        attendanceByStudent.set(record.student_id, {});
      }
      attendanceByStudent.get(record.student_id)[record.period] = record.status;
    }

    res.json({
      date,
      saved: savedPeriods.length > 0,
      working_periods:
        savedPeriods.length > 0
          ? savedPeriods
          : Array.from({ length: PERIODS_PER_DAY }, (_, index) => index + 1),
      threshold: getThreshold(db),
      students: students.map((student) => ({
        ...student,
        attendance: attendanceByStudent.get(student.id) || {},
      })),
    });
  });

  app.post("/api/attendance", (req, res) => {
    const { date } = req.body || {};

    if (!isValidDate(date)) {
      return apiError(res, 400, "Provide a valid date in YYYY-MM-DD format.");
    }

    if (!Array.isArray(req.body.working_periods)) {
      return apiError(res, 400, "Working periods must be an array.");
    }

    const workingPeriods = req.body.working_periods.map(Number);

    if (
      workingPeriods.length < 1 ||
      workingPeriods.length > PERIODS_PER_DAY ||
      workingPeriods.some((period) => !isValidPeriod(period)) ||
      new Set(workingPeriods).size !== workingPeriods.length
    ) {
      return apiError(
        res,
        400,
        "Choose between 1 and 7 unique working periods.",
      );
    }

    if (!Array.isArray(req.body.attendance)) {
      return apiError(res, 400, "Attendance records must be an array.");
    }

    const students = db.prepare("SELECT id FROM students").all();
    if (students.length === 0) {
      return apiError(
        res,
        400,
        "Add at least one student before saving attendance.",
      );
    }

    const validStudentIds = new Set(students.map((student) => student.id));
    const validPeriods = new Set(workingPeriods);
    const seen = new Set();
    const records = [];

    for (const item of req.body.attendance) {
      const studentId = Number(item?.student_id);
      const period = Number(item?.period);
      const status = item?.status;

      if (!validStudentIds.has(studentId)) {
        return apiError(res, 400, "Attendance contains an unknown student.");
      }

      if (!validPeriods.has(period)) {
        return apiError(
          res,
          400,
          "Attendance contains a period that is not a working period.",
        );
      }

      if (!isValidStatus(status)) {
        return apiError(
          res,
          400,
          "Attendance status must be Present or Absent.",
        );
      }

      const key = `${studentId}:${period}`;
      if (seen.has(key)) {
        return apiError(
          res,
          400,
          "Duplicate attendance entries are not allowed.",
        );
      }

      seen.add(key);
      records.push({ studentId, period, status });
    }

    if (records.length !== students.length * workingPeriods.length) {
      return apiError(
        res,
        400,
        "Attendance is incomplete. Mark every student for every working period.",
      );
    }

    const saveAttendance = db.transaction(() => {
      db.prepare("DELETE FROM working_periods WHERE attendance_date = ?").run(
        date,
      );

      const addWorkingPeriod = db.prepare(`
        INSERT INTO working_periods (attendance_date, period) VALUES (?, ?)
      `);
      for (const period of workingPeriods) {
        addWorkingPeriod.run(date, period);
      }

      const placeholders = workingPeriods.map(() => "?").join(",");
      db.prepare(`
        DELETE FROM attendance
        WHERE attendance_date = ? AND period NOT IN (${placeholders})
      `).run(date, ...workingPeriods);

      const upsert = db.prepare(`
        INSERT INTO attendance
          (student_id, attendance_date, period, status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(student_id, attendance_date, period)
        DO UPDATE SET
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const record of records) {
        upsert.run(record.studentId, date, record.period, record.status);
      }
    });

    saveAttendance();

    const summary = getDateSummary(db, date);
    return res.json({
      message: "Attendance saved successfully.",
      ...summary,
      threshold: getThreshold(db),
    });
  });

  app.get("/api/attendance/history", (req, res) => {
    const { month } = req.query;

    if (!isValidMonth(month)) {
      return apiError(
        res,
        400,
        "Provide a valid month in YYYY-MM format.",
      );
    }

    res.json({
      month,
      days: getDailyHistory(db, month),
    });
  });

  // ---------------------------------------------------------------------------
  // Reports and dashboard
  // ---------------------------------------------------------------------------

  app.get("/api/reports/monthly", (req, res) => {
    const { month } = req.query;

    if (!isValidMonth(month)) {
      return apiError(
        res,
        400,
        "Provide a valid month in YYYY-MM format.",
      );
    }

    res.json(getMonthlyReport(db, month));
  });

  app.get("/api/reports/student/:id", (req, res) => {
    const { month } = req.query;

    if (!isValidMonth(month)) {
      return apiError(
        res,
        400,
        "Provide a valid month in YYYY-MM format.",
      );
    }

    if (!isValidId(req.params.id)) {
      return apiError(res, 400, "Invalid student id.");
    }

    const report = getIndividualReport(db, month, Number(req.params.id));

    if (!report) {
      return apiError(res, 404, "Student not found.");
    }

    res.json(report);
  });

  app.get("/api/reports/monthly.csv", (req, res) => {
    const { month } = req.query;

    if (!isValidMonth(month)) {
      return apiError(
        res,
        400,
        "Provide a valid month in YYYY-MM format.",
      );
    }

    const report = getMonthlyReport(db, month);
    const header = [
      "Roll Number",
      "Name",
      "Department",
      "Working Periods",
      "Present",
      "Absent",
      "Attendance Percentage",
      "Low Attendance",
    ];

    const lines = [
      header.map(csvCell).join(","),
      ...report.students.map((row) =>
        [
          row.roll_number,
          row.name,
          row.department,
          row.working_periods,
          row.present,
          row.absent,
          `${row.attendance_percentage.toFixed(2)}%`,
          row.low_attendance ? "Yes" : "No",
        ]
          .map(csvCell)
          .join(","),
      ),
    ];

    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance-${month}.csv"`,
    );
    res.send(csv);
  });

  app.get("/api/dashboard", (req, res) => {
    const { month, date } = req.query;

    if (!isValidMonth(month)) {
      return apiError(
        res,
        400,
        "Provide a valid month in YYYY-MM format.",
      );
    }

    if (!isValidDate(date)) {
      return apiError(res, 400, "Provide a valid date in YYYY-MM-DD format.");
    }

    const report = getMonthlyReport(db, month);
    const history = getDailyHistory(db, month);
    const today = getDateSummary(db, date);
    const totalStudents = db.prepare(
      "SELECT COUNT(*) AS total FROM students",
    ).get().total;

    res.json({
      month,
      date,
      total_students: Number(totalStudents || 0),
      threshold: report.threshold,
      month_report: report,
      today,
      history,
      low_students: report.students
        .filter((student) => student.low_attendance)
        .slice(0, 6),
    });
  });

  // ---------------------------------------------------------------------------
  // Static frontend
  // ---------------------------------------------------------------------------

  app.use(
    express.static(publicDir, {
      index: false,
      etag: true,
      maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    }),
  );

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
  });

  app.use((req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    res.set("Cache-Control", "no-cache");
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON request body." });
    }

    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };
