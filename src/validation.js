"use strict";

const PERIODS_PER_DAY = 7;
const DEFAULT_THRESHOLD = 75;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 2200;
}

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const end = next.toISOString().slice(0, 10);
  return { start, end };
}

function isValidPeriod(value) {
  return Number.isInteger(value) && value >= 1 && value <= PERIODS_PER_DAY;
}

function isValidId(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return false;
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return false;
  }

  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0;
}

function isValidStatus(value) {
  return value === "Present" || value === "Absent";
}

function parseThreshold(value) {
  let threshold;

  if (typeof value === "number") {
    threshold = value;
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    threshold = Number(value.trim());
  } else {
    return null;
  }

  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    return null;
  }

  return threshold;
}

module.exports = {
  PERIODS_PER_DAY,
  DEFAULT_THRESHOLD,
  normalizeText,
  isValidDate,
  isValidMonth,
  monthBounds,
  isValidPeriod,
  isValidId,
  isValidStatus,
  parseThreshold,
};
