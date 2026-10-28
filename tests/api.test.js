"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("../src/database");
const { createApp } = require("../src/app");

let tempDir;
let db;
let server;
let baseUrl;
const students = {};

async function request(pathname, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };
  if (options.body && typeof options.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl}${pathname}`, config);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body, headers: response.headers };
}

function makeAttendance(date, statusFor) {
  const records = [];
  for (const student of Object.values(students)) {
    for (let period = 1; period <= 7; period += 1) {
      records.push({
        student_id: student.id,
        period,
        status: statusFor(student.roll_number, period),
      });
    }
  }
  return { date, working_periods: [1, 2, 3, 4, 5, 6, 7], attendance: records };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attendly-api-"));
  db = openDatabase(path.join(tempDir, "test.db"));
  const app = createApp({ db });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (db) db.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test("health endpoint reports the application is running", async () => {
  const response = await request("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "OK");
  assert.ok(response.body.version);
});

test("frontend shell is served", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.body, /Attendly/);
  assert.match(response.body, /Class attendance/);
});

test("unknown API endpoints return JSON 404", async () => {
  const response = await request("/api/does-not-exist");
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "API endpoint not found.");
});

test("students can be created and validated", async () => {
  const invalid = await request("/api/students", {
    method: "POST",
    body: { roll_number: "", name: "", department: "" },
  });
  assert.equal(invalid.status, 400);

  const alice = await request("/api/students", {
    method: "POST",
    body: {
      roll_number: "23CS001",
      name: "Alice Johnson",
      department: "Computer Science",
    },
  });
  assert.equal(alice.status, 201);
  students.alice = alice.body.student;

  const bob = await request("/api/students", {
    method: "POST",
    body: {
      roll_number: "23CS002",
      name: "Bob Kumar",
      department: "Computer Science",
    },
  });
  assert.equal(bob.status, 201);
  students.bob = bob.body.student;

  const charlie = await request("/api/students", {
    method: "POST",
    body: {
      roll_number: "23IT003",
      name: "Charlie Rao",
      department: "Information Technology",
    },
  });
  assert.equal(charlie.status, 201);
  students.charlie = charlie.body.student;

  const duplicate = await request("/api/students", {
    method: "POST",
    body: {
      roll_number: "23cs001",
      name: "Duplicate Roll",
      department: "Computer Science",
    },
  });
  assert.equal(duplicate.status, 409);

  const list = await request("/api/students");
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 3);

  const search = await request("/api/students?search=alice");
  assert.equal(search.status, 200);
  assert.equal(search.body.length, 1);
  assert.equal(search.body[0].name, "Alice Johnson");
});

test("students can be edited", async () => {
  const response = await request(`/api/students/${students.charlie.id}`, {
    method: "PUT",
    body: {
      roll_number: "23IT003",
      name: "Charlie R. Rao",
      department: "Information Technology",
    },
  });
  assert.equal(response.status, 200);

  const list = await request("/api/students?search=Charlie");
  assert.equal(list.body[0].name, "Charlie R. Rao");

  const missing = await request("/api/students/99999", {
    method: "PUT",
    body: {
      roll_number: "X",
      name: "Missing",
      department: "None",
    },
  });
  assert.equal(missing.status, 404);
});

test("student ids must be plain positive integers", async () => {
  for (const id of ["0", "-1", "1.5", "1e3", "abc"]) {
    const response = await request(`/api/students/${id}`, { method: "DELETE" });
    assert.equal(response.status, 400, `Expected id ${id} to be rejected`);
  }
});

test("malformed and oversized JSON bodies return JSON errors", async () => {
  const malformed = await fetch(`${baseUrl}/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid json",
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /invalid json/i);

  const oversized = await fetch(`${baseUrl}/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roll_number: "HUGE001",
      name: "x".repeat(2 * 1024 * 1024),
      department: "Computer Science",
    }),
  });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /too large/i);
});

test("attendance defaults to seven working periods and validates dates", async () => {
  const response = await request("/api/attendance?date=2026-03-02");
  assert.equal(response.status, 200);
  assert.equal(response.body.saved, false);
  assert.deepEqual(response.body.working_periods, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(response.body.students.length, 3);
  assert.deepEqual(response.body.students[0].attendance, {});

  const invalid = await request("/api/attendance?date=2026-02-30");
  assert.equal(invalid.status, 400);
});

test("incomplete attendance is rejected", async () => {
  const response = await request("/api/attendance", {
    method: "POST",
    body: {
      date: "2026-03-02",
      working_periods: [1, 2, 3, 4, 5, 6, 7],
      attendance: [],
    },
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /incomplete/i);
});

test("attendance can be saved for all students and all seven periods", async () => {
  const dayOne = makeAttendance("2026-03-02", (roll, period) => {
    if (roll === "23CS001") return "Present";
    if (roll === "23CS002") return period <= 5 ? "Present" : "Absent";
    return period <= 3 ? "Present" : "Absent";
  });

  const response = await request("/api/attendance", {
    method: "POST",
    body: dayOne,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.working_periods, 7);
  assert.equal(response.body.present, 15);
  assert.equal(response.body.absent, 6);

  const saved = await request("/api/attendance?date=2026-03-02");
  assert.equal(saved.status, 200);
  assert.equal(saved.body.saved, true);
  assert.equal(saved.body.students[0].attendance["1"], "Present");
  assert.equal(saved.body.students[1].attendance["7"], "Absent");

  const dayTwo = makeAttendance("2026-03-03", (roll, period) => {
    if (roll === "23CS001") return "Present";
    if (roll === "23CS002") return period <= 4 ? "Present" : "Absent";
    return period <= 2 ? "Present" : "Absent";
  });
  const second = await request("/api/attendance", {
    method: "POST",
    body: dayTwo,
  });
  assert.equal(second.status, 200);
});

test("duplicate attendance entries are rejected", async () => {
  const payload = makeAttendance("2026-03-04", () => "Present");
  payload.attendance.push({ ...payload.attendance[0] });

  const response = await request("/api/attendance", {
    method: "POST",
    body: payload,
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /duplicate/i);
});

test("monthly report calculates totals, percentages and low attendance", async () => {
  const response = await request("/api/reports/monthly?month=2026-03");
  assert.equal(response.status, 200);
  assert.equal(response.body.class_working_periods, 14);
  assert.equal(response.body.student_count, 3);
  assert.equal(response.body.total_present, 28);
  assert.equal(response.body.total_absent, 14);
  assert.equal(response.body.average_percentage, 66.67);
  assert.equal(response.body.low_attendance_count, 2);

  const alice = response.body.students.find((student) => student.id === students.alice.id);
  assert.equal(alice.present, 14);
  assert.equal(alice.absent, 0);
  assert.equal(alice.attendance_percentage, 100);
  assert.equal(alice.low_attendance, false);

  const bob = response.body.students.find((student) => student.id === students.bob.id);
  assert.equal(bob.present, 9);
  assert.equal(bob.absent, 5);
  assert.equal(bob.attendance_percentage, 64.29);
  assert.equal(bob.low_attendance, true);

  const invalid = await request("/api/reports/monthly?month=2026-13");
  assert.equal(invalid.status, 400);
});

test("individual reports include daily breakdowns", async () => {
  const response = await request(
    `/api/reports/student/${students.bob.id}?month=2026-03`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.name, "Bob Kumar");
  assert.equal(response.body.present, 9);
  assert.equal(response.body.daily.length, 2);
  assert.equal(response.body.daily[0].periods.length, 7);

  const missing = await request("/api/reports/student/99999?month=2026-03");
  assert.equal(missing.status, 404);
});

test("daily history lists saved registers", async () => {
  const response = await request("/api/attendance/history?month=2026-03");
  assert.equal(response.status, 200);
  assert.equal(response.body.days.length, 2);
  assert.equal(response.body.days[0].date, "2026-03-03");
  assert.equal(response.body.days[0].working_periods, 7);
  assert.equal(response.body.days[0].students_marked, 3);
});

test("existing attendance can be corrected", async () => {
  const payload = makeAttendance("2026-03-03", (roll, period) => {
    if (roll === "23CS001") return period === 1 ? "Absent" : "Present";
    if (roll === "23CS002") return period <= 4 ? "Present" : "Absent";
    return period <= 2 ? "Present" : "Absent";
  });

  const response = await request("/api/attendance", {
    method: "POST",
    body: payload,
  });
  assert.equal(response.status, 200);

  const report = await request("/api/reports/monthly?month=2026-03");
  const alice = report.body.students.find((student) => student.id === students.alice.id);
  assert.equal(alice.present, 13);
  assert.equal(alice.absent, 1);
  assert.equal(alice.attendance_percentage, 92.86);
});

test("threshold settings are validated and applied", async () => {
  for (const invalidValue of [101, -1, 75.5, null, true, "", "abc"]) {
    const invalid = await request("/api/settings", {
      method: "PUT",
      body: { attendance_threshold: invalidValue },
    });
    assert.equal(
      invalid.status,
      400,
      `Expected threshold ${JSON.stringify(invalidValue)} to be rejected`,
    );
  }

  const missing = await request("/api/settings", {
    method: "PUT",
    body: {},
  });
  assert.equal(missing.status, 400);

  const response = await request("/api/settings", {
    method: "PUT",
    body: { attendance_threshold: 90 },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.attendance_threshold, 90);

  const report = await request("/api/reports/monthly?month=2026-03");
  assert.equal(report.body.threshold, 90);
  assert.equal(report.body.low_attendance_count, 2);

  const reset = await request("/api/settings", {
    method: "PUT",
    body: { attendance_threshold: 75 },
  });
  assert.equal(reset.status, 200);
});

test("monthly CSV export includes headers, values and BOM", async () => {
  const response = await fetch(`${baseUrl}/api/reports/monthly.csv?month=2026-03`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.match(response.headers.get("content-disposition"), /attendance-2026-03\.csv/);

  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);

  const csv = bytes.toString("utf8").replace(/^\uFEFF/, "");
  assert.match(csv, /"Roll Number","Name","Department"/);
  assert.match(csv, /Alice Johnson/);
  assert.match(csv, /"92\.86%"/);
  assert.match(csv, /"Yes"/);
});

test("CSV export neutralizes spreadsheet formulas", async () => {
  const created = await request("/api/students", {
    method: "POST",
    body: {
      roll_number: "CSV001",
      name: '=HYPERLINK("http://example.invalid")',
      department: "+cmd",
    },
  });
  assert.equal(created.status, 201);

  try {
    const response = await fetch(
      `${baseUrl}/api/reports/monthly.csv?month=2026-03`,
    );
    const csv = await response.text();
    assert.ok(csv.includes(`"'=HYPERLINK(""http://example.invalid"")"`));
    assert.ok(csv.includes(`"'+cmd"`));
  } finally {
    await request(`/api/students/${created.body.student.id}`, {
      method: "DELETE",
    });
  }
});

test("dashboard endpoint combines class, daily and low-attendance data", async () => {
  const response = await request(
    "/api/dashboard?month=2026-03&date=2026-03-03",
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.total_students, 3);
  assert.equal(response.body.month_report.class_working_periods, 14);
  assert.equal(response.body.today.saved, true);
  assert.equal(response.body.today.working_periods, 7);
  assert.equal(response.body.low_students.length, 2);
});

test("working period changes remove records for removed periods", async () => {
  const records = [];
  for (const student of Object.values(students)) {
    for (let period = 1; period <= 5; period += 1) {
      records.push({ student_id: student.id, period, status: "Present" });
    }
  }

  const response = await request("/api/attendance", {
    method: "POST",
    body: {
      date: "2026-03-02",
      working_periods: [1, 2, 3, 4, 5],
      attendance: records,
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.working_periods, 5);

  const saved = await request("/api/attendance?date=2026-03-02");
  assert.deepEqual(saved.body.working_periods, [1, 2, 3, 4, 5]);
  assert.equal(saved.body.students[0].attendance["6"], undefined);
});

test("deleting a student cascades their attendance records", async () => {
  const response = await request(`/api/students/${students.charlie.id}`, {
    method: "DELETE",
  });
  assert.equal(response.status, 200);

  const list = await request("/api/students");
  assert.equal(list.body.length, 2);

  const missing = await request(`/api/students/${students.charlie.id}`, {
    method: "DELETE",
  });
  assert.equal(missing.status, 404);
});

test("attendance survives a database restart", async () => {
  const persistenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "attendly-persist-"));
  const databasePath = path.join(persistenceDir, "persist.db");

  let firstDb;
  let firstServer;
  try {
    firstDb = openDatabase(databasePath);
    const firstApp = createApp({ db: firstDb });
    firstServer = firstApp.listen(0, "127.0.0.1");
    await new Promise((resolve) => firstServer.once("listening", resolve));
    const firstBase = `http://127.0.0.1:${firstServer.address().port}`;

    const created = await fetch(`${firstBase}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roll_number: "P001",
        name: "Persistence Test",
        department: "Computer Science",
      }),
    }).then((response) => response.json());

    await fetch(`${firstBase}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-04-01",
        working_periods: [1, 2, 3, 4, 5, 6, 7],
        attendance: Array.from({ length: 7 }, (_, index) => ({
          student_id: created.student.id,
          period: index + 1,
          status: "Present",
        })),
      }),
    });

    await new Promise((resolve) => firstServer.close(resolve));
    firstDb.close();
    firstServer = null;
    firstDb = null;

    const secondDb = openDatabase(databasePath);
    const secondApp = createApp({ db: secondDb });
    const secondServer = secondApp.listen(0, "127.0.0.1");
    await new Promise((resolve) => secondServer.once("listening", resolve));
    const secondBase = `http://127.0.0.1:${secondServer.address().port}`;

    const attendance = await fetch(
      `${secondBase}/api/attendance?date=2026-04-01`,
    ).then((response) => response.json());

    assert.equal(attendance.saved, true);
    assert.equal(attendance.students.length, 1);
    assert.equal(attendance.students[0].attendance["7"], "Present");

    await new Promise((resolve) => secondServer.close(resolve));
    secondDb.close();
  } finally {
    if (firstServer) await new Promise((resolve) => firstServer.close(resolve));
    if (firstDb) firstDb.close();
    fs.rmSync(persistenceDir, { recursive: true, force: true });
  }
});
