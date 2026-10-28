"use strict";

/**
 * End-to-end API smoke verification.
 * Runs against a temporary SQLite database and an ephemeral HTTP port.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("../src/database");
const { createApp } = require("../src/app");

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attendly-verify-"));
  const db = openDatabase(path.join(tempDir, "verify.db"));
  const app = createApp({ db });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = async (url, options = {}) => {
    const response = await fetch(base + url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  };

  const checks = [];
  const check = (name, condition) => {
    assert.ok(condition, name);
    checks.push(name);
    console.log(`  ✓ ${name}`);
  };

  try {
    console.log("Attendly verification\n");

    const health = await request("/api/health");
    check("Health endpoint responds", health.status === 200 && health.body.status === "OK");

    const page = await request("/");
    check("Frontend is served", page.status === 200 && page.body.includes("Attendly"));

    const alice = await request("/api/students", {
      method: "POST",
      body: {
        roll_number: "VERIFY001",
        name: "Verification Student",
        department: "Computer Science",
      },
    });
    check("Student can be added", alice.status === 201);

    const duplicate = await request("/api/students", {
      method: "POST",
      body: {
        roll_number: "verify001",
        name: "Duplicate",
        department: "Computer Science",
      },
    });
    check("Duplicate roll numbers are rejected", duplicate.status === 409);

    const bob = await request("/api/students", {
      method: "POST",
      body: {
        roll_number: "VERIFY002",
        name: "Second Student",
        department: "Information Technology",
      },
    });
    check("Second student can be added", bob.status === 201);

    const records = [];
    for (const student of [alice.body.student, bob.body.student]) {
      for (let period = 1; period <= 7; period += 1) {
        records.push({
          student_id: student.id,
          period,
          status: student.id === alice.body.student.id ? "Present" : "Absent",
        });
      }
    }

    const saved = await request("/api/attendance", {
      method: "POST",
      body: {
        date: "2026-05-04",
        working_periods: [1, 2, 3, 4, 5, 6, 7],
        attendance: records,
      },
    });
    check("Attendance saves for seven periods", saved.status === 200);

    const loaded = await request("/api/attendance?date=2026-05-04");
    check(
      "Saved attendance can be retrieved",
      loaded.status === 200 &&
        loaded.body.saved === true &&
        loaded.body.students[0].attendance["7"] === "Present",
    );

    const report = await request("/api/reports/monthly?month=2026-05");
    const aliceReport = report.body.students.find(
      (student) => student.roll_number === "VERIFY001",
    );
    const bobReport = report.body.students.find(
      (student) => student.roll_number === "VERIFY002",
    );
    check(
      "Monthly percentage is calculated correctly",
      aliceReport.attendance_percentage === 100 &&
        bobReport.attendance_percentage === 0,
    );
    check(
      "Low-attendance students are identified",
      report.body.low_attendance_count === 1 && bobReport.low_attendance === true,
    );

    const csv = await request("/api/reports/monthly.csv?month=2026-05");
    check(
      "CSV export includes the class report",
      csv.status === 200 &&
        csv.headers.get("content-type").includes("text/csv") &&
        csv.body.includes("Verification Student"),
    );

    const individual = await request(
      `/api/reports/student/${alice.body.student.id}?month=2026-05`,
    );
    check(
      "Individual student report is available",
      individual.status === 200 && individual.body.daily.length === 1,
    );

    const settings = await request("/api/settings", {
      method: "PUT",
      body: { attendance_threshold: 80 },
    });
    check("Threshold setting can be updated", settings.body.attendance_threshold === 80);

    console.log(`\n${checks.length} checks passed.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("\nVerification failed:", error.message);
  process.exit(1);
});
