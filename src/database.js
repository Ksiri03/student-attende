"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { DEFAULT_THRESHOLD } = require("./validation");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 7),
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, attendance_date, period),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS working_periods (
    attendance_date TEXT NOT NULL,
    period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 7),
    PRIMARY KEY (attendance_date, period)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_date
    ON attendance (attendance_date);

  CREATE INDEX IF NOT EXISTS idx_attendance_student_date
    ON attendance (student_id, attendance_date);

  CREATE INDEX IF NOT EXISTS idx_working_periods_date
    ON working_periods (attendance_date);

  INSERT OR IGNORE INTO settings (key, value)
    VALUES ('attendance_threshold', '${DEFAULT_THRESHOLD}');
`;

function resolveDatabasePath(databasePath) {
  if (databasePath === ":memory:") {
    return databasePath;
  }

  return path.resolve(databasePath);
}

function openDatabase(databasePath) {
  const resolvedPath = resolveDatabasePath(databasePath);

  if (resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  if (resolvedPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
  }

  db.exec(SCHEMA);

  return db;
}

function getSetting(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function getThreshold(db) {
  const raw = Number(getSetting(db, "attendance_threshold", DEFAULT_THRESHOLD));
  return Number.isInteger(raw) && raw >= 0 && raw <= 100
    ? raw
    : DEFAULT_THRESHOLD;
}

module.exports = {
  openDatabase,
  resolveDatabasePath,
  getSetting,
  setSetting,
  getThreshold,
};
