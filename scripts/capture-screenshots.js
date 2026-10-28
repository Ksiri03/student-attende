"use strict";

/**
 * Capture clean documentation screenshots from a running Attendly instance.
 *
 * Usage:
 *   npm start                       # in one terminal (seeded database)
 *   node scripts/capture-screenshots.js
 *
 * Environment:
 *   APP_URL     default http://127.0.0.1:3000
 *   CHROME_BIN  optional explicit Chrome binary
 */

const fs = require("node:fs");
const path = require("node:path");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const baseUrl = process.env.APP_URL || "http://127.0.0.1:3000";
const outputDir = path.join(__dirname, "..", "screenshots");

async function waitForVisible(driver, selector, timeout = 15000) {
  await driver.wait(until.elementLocated(By.css(selector)), timeout);
  const element = await driver.findElement(By.css(selector));
  await driver.wait(until.elementIsVisible(element), timeout);
  return element;
}

async function settle(driver, milliseconds = 900) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function openView(driver, view) {
  await driver.get(`${baseUrl}/#${view}`);
  await waitForVisible(driver, `#view-${view}:not([hidden])`);
  await settle(driver, 1200);
}

async function saveScreenshot(driver, name) {
  const image = await driver.takeScreenshot();
  const file = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(file, image, "base64");
  console.log(`Captured ${path.relative(process.cwd(), file)}`);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const options = new chrome.Options();
  options.addArguments(
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1600,1200",
    "--disable-search-engine-choice-screen",
  );
  if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  try {
    await driver.manage().window().setRect({ width: 1600, height: 1200 });
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 30000 });

    await driver.manage().window().setRect({ width: 1600, height: 1600 });
    await driver.get(baseUrl);
    await driver.wait(until.titleContains("Attendly"), 15000);
    await waitForVisible(driver, "#dashboard-stats .stat-card:not(.skeleton-card)");
    await waitForVisible(driver, "#dashboard-trend .trend-chart");
    await settle(driver, 1400);
    await saveScreenshot(driver, "01-dashboard");

    await driver.manage().window().setRect({ width: 1600, height: 1500 });
    await openView(driver, "attendance");
    await waitForVisible(driver, ".attendance-table tbody tr");
    await settle(driver, 600);
    await saveScreenshot(driver, "02-attendance");

    await driver.manage().window().setRect({ width: 1600, height: 1200 });
    await openView(driver, "students");
    await waitForVisible(driver, "#students-list tbody tr");
    await settle(driver, 600);
    await saveScreenshot(driver, "03-students");

    await driver.manage().window().setRect({ width: 1600, height: 1500 });
    await openView(driver, "reports");
    await waitForVisible(driver, "#report-table tbody tr");
    await waitForVisible(driver, "#report-history tbody tr");
    await settle(driver, 1000);
    await saveScreenshot(driver, "04-reports");

    const lowRow = await driver.findElement(
      By.xpath("//*[@id='report-table']//tr[contains(., 'Kiara Reddy')]"),
    );
    const reportButton = await lowRow.findElement(By.css("[data-report-student]"));
    await driver.executeScript("arguments[0].scrollIntoView({ block: 'center' });", reportButton);
    await settle(driver, 400);
    await driver.executeScript("arguments[0].click();", reportButton);
    const dialog = await waitForVisible(driver, "#report-dialog[open]");
    await driver.wait(async () => {
      const text = await driver.findElement(By.id("report-dialog-content")).getText();
      return /Daily breakdown/i.test(text);
    }, 15000);
    await settle(driver, 800);
    await driver.executeScript(`
      const list = document.querySelector("#report-dialog .daily-list");
      if (list) {
        [...list.children].forEach((row, index) => {
          if (index >= 5) row.style.display = "none";
        });
        list.style.maxHeight = "none";
      }
    `);
    await settle(driver, 300);
    const dialogShot = await dialog.takeScreenshot();
    fs.writeFileSync(path.join(outputDir, "05-student-report.png"), dialogShot, "base64");
    console.log(`Captured ${path.relative(process.cwd(), path.join(outputDir, "05-student-report.png"))}`);
    await driver.executeScript("arguments[0].close();", dialog);

    await driver.manage().window().setRect({ width: 1600, height: 900 });
    await openView(driver, "settings");
    await waitForVisible(driver, "#view-settings:not([hidden])");
    await settle(driver, 800);
    await saveScreenshot(driver, "06-settings");
  } finally {
    await driver.quit();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
