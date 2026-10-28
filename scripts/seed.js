"use strict";

/**
 * Seed a realistic demo class and attendance history.
 *
 * Usage:
 *   npm run seed
 *   npm run seed -- --reset
 *
 * The script refuses to touch a database that already contains students
 * unless --reset is supplied, so it is safe to run accidentally.
 */

const path = require("node:path");
const { openDatabase, resolveDatabasePath } = require("../src/database");
const { PERIODS_PER_DAY } = require("../src/validation");

const databasePath = resolveDatabasePath(
  process.env.DB_PATH || path.join(__dirname, "..", "data", "attendance.db"),
);
const reset = process.argv.includes("--reset");

const demoStudents = [
  ["23CS001", "Ananya Rao", "Computer Science"],
  ["23CS002", "Arjun Mehta", "Computer Science"],
  ["23CS003", "Diya Sharma", "Computer Science"],
  ["23CS004", "Kabir Nair", "Computer Science"],
  ["23CS005", "Meera Iyer", "Computer Science"],
  ["23CS006", "Rohan Gupta", "Computer Science"],
  ["23IT007", "Ishita Verma", "Information Technology"],
  ["23IT008", "Vivaan Patel", "Information Technology"],
  ["23IT009", "Saanvi Joshi", "Information Technology"],
  ["23EC010", "Aditya Kulkarni", "Electronics and Communication"],
  ["23EC011", "Kiara Reddy", "Electronics and Communication"],
  ["23ME012", "Nikhil Desai", "Mechanical Engineering"],
];

const db = openDatabase(databasePath);

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdaysThisMonth() {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dates = [];

  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), day);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) {
      dates.push(isoDate(date));
    }
  }

  return dates;
}

try {
  const existing = db.prepare("SELECT COUNT(*) AS total FROM students").get().total;

  if (existing > 0 && !reset) {
    console.log(`Database already contains ${existing} student(s).`);
    console.log("Run `npm run seed -- --reset` to replace the demo data.");
    process.exit(0);
  }

  const seed = db.transaction(() => {
    if (reset) {
      db.prepare("DELETE FROM attendance").run();
      db.prepare("DELETE FROM working_periods").run();
      db.prepare("DELETE FROM students").run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('students', 'attendance')").run();
    }

    const insertStudent = db.prepare(`
      INSERT INTO students (roll_number, name, department) VALUES (?, ?, ?)
    `);
    const studentIds = demoStudents.map(([roll, name, department]) => ({
      id: Number(insertStudent.run(roll, name, department).lastInsertRowid),
      index: 0,
    }));

    studentIds.forEach((student, index) => {
      student.index = index;
    });

    const dates = weekdaysThisMonth();
    const insertPeriod = db.prepare(`
      INSERT INTO working_periods (attendance_date, period) VALUES (?, ?)
    `);
    const insertAttendance = db.prepare(`
      INSERT INTO attendance (student_id, attendance_date, period, status)
      VALUES (?, ?, ?, ?)
    `);

    for (const [dateIndex, date] of dates.entries()) {
      for (let period = 1; period <= PERIODS_PER_DAY; period += 1) {
        insertPeriod.run(date, period);
      }

      for (const student of studentIds) {
        // The final two students intentionally fall below 75% attendance.
        const lowAttendanceStudent = student.index >= demoStudents.length - 2;
        for (let period = 1; period <= PERIODS_PER_DAY; period += 1) {
          const absent = lowAttendanceStudent
            ? (student.index + period + dateIndex) % 3 === 0
            : (student.index * 7 + period * 3 + dateIndex) % 17 === 0;

          insertAttendance.run(
            student.id,
            date,
            period,
            absent ? "Absent" : "Present",
          );
        }
      }
    }

    return { dates: dates.length, students: studentIds.length };
  });

  const result = seed();
  console.log(`Demo data created in ${databasePath}`);
  console.log(
    `${result.students} students, ${result.dates} working days, ${result.dates * 7} working periods.`,
  );
  console.log("Open the app and visit Reports to see the monthly summary.");
} finally {
  db.close();
}
