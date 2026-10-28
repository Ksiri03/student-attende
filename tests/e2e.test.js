"use strict";

const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Builder, By, until, Key } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const { openDatabase } = require("../src/database");
const { createApp } = require("../src/app");

let tempDir;
let db;
let server;
let driver;
let baseUrl;
let today;
let month;

function localISO(date = new Date()) {
  const year = date.getFullYear();
  const monthValue = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${monthValue}-${day}`;
}

async function request(pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, {
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
  return { status: response.status, body };
}

async function waitForText(text, timeout = 12000) {
  await driver.wait(
    until.elementLocated(By.xpath(`//*[contains(normalize-space(.), '${text}')]`)),
    timeout,
  );
}

async function waitForToast(text, timeout = 12000) {
  await driver.wait(
    until.elementLocated(
      By.xpath(`//div[contains(@class,'toast') and contains(., '${text}')]`),
    ),
    timeout,
  );
}

async function navigate(view) {
  await driver.findElement(By.css(`a[href="#${view}"]`)).click();
  await driver.wait(
    until.elementLocated(By.css(`#view-${view}:not([hidden])`)),
    10000,
  );
}

before(async () => {
  today = localISO();
  month = today.slice(0, 7);
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attendly-e2e-"));
  db = openDatabase(path.join(tempDir, "e2e.db"));
  const app = createApp({ db });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const students = [];
  for (const [rollNumber, name, department] of [
    ["E2E001", "Aarav Sharma", "Computer Science"],
    ["E2E002", "Isha Patel", "Information Technology"],
    ["E2E003", "Reyansh Gupta", "Electronics"],
  ]) {
    const created = await request("/api/students", {
      method: "POST",
      body: { roll_number: rollNumber, name, department },
    });
    assert.equal(created.status, 201);
    students.push(created.body.student);
  }

  const attendance = [];
  for (const student of students) {
    for (let period = 1; period <= 7; period += 1) {
      attendance.push({
        student_id: student.id,
        period,
        status: "Present",
      });
    }
  }

  const saved = await request("/api/attendance", {
    method: "POST",
    body: {
      date: today,
      working_periods: [1, 2, 3, 4, 5, 6, 7],
      attendance,
    },
  });
  assert.equal(saved.status, 200);

  const options = new chrome.Options();
  options.addArguments(
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--window-size=1440,1000",
    "--disable-search-engine-choice-screen",
  );

  if (process.env.CHROME_BIN) {
    options.setChromeBinaryPath(process.env.CHROME_BIN);
  }

  driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();
  await driver.manage().setTimeouts({
    implicit: 0,
    pageLoad: 30000,
    script: 30000,
  });
  await driver.manage().window().setRect({ width: 1440, height: 1000 });
});

afterEach(async () => {
  if (!driver) return;
  const openDialogs = await driver.findElements(By.css("dialog[open]"));
  for (const dialog of openDialogs) {
    await driver.executeScript("arguments[0].close();", dialog);
  }
});

after(async () => {
  if (driver) {
    await driver.quit();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (db) db.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test("dashboard loads with live class statistics", async () => {
  await driver.get(baseUrl);
  await driver.wait(until.titleContains("Attendly"), 10000);
  await waitForText("Total students");

  const stats = await driver.findElements(By.css("#dashboard-stats .stat-card"));
  assert.equal(stats.length, 4);

  const body = await driver.findElement(By.css("#view-dashboard")).getText();
  assert.match(body, /Total students/i);
  assert.match(body, /3 students/i);
  assert.match(body, /Monthly attendance/i);
  assert.match(body, /100%/);
});

test("a student can be added through the interface", async () => {
  await navigate("students");
  await driver.findElement(By.id("student-roll")).sendKeys("SEL001");
  await driver.findElement(By.id("student-name")).sendKeys("Selenium Student");
  await driver.findElement(By.id("student-department")).sendKeys("Computer Science");
  await driver.findElement(By.id("add-student-button")).click();

  await waitForToast("was added to the roster");
  await driver.wait(
    until.elementLocated(By.xpath("//*[contains(text(), 'Selenium Student')]")),
    10000,
  );

  const rows = await driver.findElements(By.css("#students-list tbody tr"));
  assert.equal(rows.length, 4);
});

test("attendance can be marked for all periods, saved and reloaded", async () => {
  await navigate("attendance");
  await driver.wait(
    until.elementLocated(By.css(".attendance-table tbody tr")),
    10000,
  );

  const rows = await driver.findElements(By.css(".attendance-table tbody tr"));
  assert.equal(rows.length, 4);

  await driver.findElement(By.id("bulk-present")).click();
  await driver.findElement(By.id("save-attendance")).click();
  await waitForToast("Attendance saved successfully");

  await driver.wait(async () => {
    const text = await driver.findElement(By.id("attendance-save-status")).getText();
    return text.trim() === "Saved";
  }, 10000);

  await driver.navigate().refresh();
  await driver.wait(
    until.elementLocated(By.css(".attendance-table tbody tr")),
    10000,
  );
  const firstStatus = await driver
    .findElement(By.css(".attendance-table tbody tr .status-button"))
    .getAttribute("data-status");
  assert.equal(firstStatus, "Present");

  await driver.wait(async () => {
    const text = await driver.findElement(By.id("attendance-counts")).getText();
    return /28 present/.test(text);
  }, 10000);
  const counts = await driver.findElement(By.id("attendance-counts")).getText();
  assert.match(counts, /28 present/);
  assert.match(counts, /0 absent/);
  assert.match(counts, /0 unmarked/);
});

test("monthly report, daily history and individual report are rendered", async () => {
  await navigate("reports");
  await driver.wait(
    until.elementLocated(By.css("#report-table tbody tr")),
    10000,
  );

  await driver.wait(async () => {
    const text = await driver.findElement(By.id("report-table")).getText();
    return text.includes("Selenium Student");
  }, 10000);

  const rows = await driver.findElements(By.css("#report-table tbody tr"));
  assert.equal(rows.length, 4);

  const reportTable = await driver.findElement(By.id("report-table")).getText();
  assert.match(reportTable, /Selenium Student/);
  assert.match(reportTable, /100%/);

  await driver.wait(async () => {
    const text = await driver.findElement(By.id("report-history")).getText();
    return text.includes("Oct") || /working periods/i.test(text);
  }, 10000);

  const history = await driver.findElement(By.id("report-history")).getText();
  assert.match(history, /Working periods/i);
  assert.match(history, /7/);

  const studentRow = await driver.findElement(
    By.xpath("//*[@id='report-table']//tr[contains(., 'Selenium Student')]"),
  );
  const reportButton = await studentRow.findElement(By.css("[data-report-student]"));
  await driver.executeScript(
    "arguments[0].scrollIntoView({ block: 'center' });",
    reportButton,
  );
  await driver.executeScript("arguments[0].click();", reportButton);
  await driver.wait(
    until.elementLocated(By.css("#report-dialog[open]")),
    10000,
  );
  await driver.wait(async () => {
    const text = await driver.findElement(By.id("report-dialog-content")).getText();
    return /daily breakdown/i.test(text);
  }, 10000);
  const dialogText = await driver.findElement(By.id("report-dialog-content")).getText();
  assert.match(dialogText, /Attendance/i);
  assert.match(dialogText, /100%/);
  assert.match(dialogText, /Daily breakdown/i);
  await driver.findElement(By.id("report-dialog-close")).click();
  await driver.wait(async () => {
    const open = await driver.findElement(By.id("report-dialog")).getAttribute("open");
    return open === null;
  }, 5000);
});

test("CSV export contains the report for the selected month", async () => {
  const response = await fetch(
    `${baseUrl}/api/reports/monthly.csv?month=${encodeURIComponent(month)}`,
  );
  assert.equal(response.status, 200);
  const csv = await response.text();
  assert.match(csv, /Selenium Student/);
  assert.match(csv, /100\.00%/);
});

test("the attendance threshold can be changed in settings", async () => {
  await navigate("settings");
  await driver.wait(
    until.elementLocated(By.css("#view-settings:not([hidden])")),
    10000,
  );

  const threshold = await driver.findElement(By.id("threshold-input"));
  await threshold.clear();
  await threshold.sendKeys("80");
  await driver.findElement(By.id("save-settings")).click();
  await waitForToast("Attendance threshold updated");

  const response = await request("/api/settings");
  assert.equal(response.body.attendance_threshold, 80);

  await navigate("reports");
  await driver.wait(
    until.elementLocated(By.css("#report-table tbody tr")),
    10000,
  );
  await driver.wait(async () => {
    const text = await driver.findElement(By.id("report-threshold")).getText();
    return text.includes("80%");
  }, 10000);
  const thresholdPill = await driver.findElement(By.id("report-threshold")).getText();
  assert.match(thresholdPill, /80%/);
});
