"use strict";

/**
 * Render the report's terminal evidence and diagrams as PNG images.
 *
 * Usage:
 *   node docs/report/tools/render-assets.js
 *
 * Requires Chrome and the project's selenium-webdriver dev dependency.
 * Raw command output is read from docs/report/assets/raw/.
 */

const fs = require("node:fs");
const path = require("node:path");
const { Builder } = require(path.join(__dirname, "..", "..", "..", "node_modules", "selenium-webdriver"));
const chrome = require(path.join(__dirname, "..", "..", "..", "node_modules", "selenium-webdriver", "chrome"));

const reportDir = path.join(__dirname, "..");
const rawDir = path.join(reportDir, "assets", "raw");
const outDir = path.join(reportDir, "assets");
const tempDir = path.join(__dirname, ".render-tmp");

fs.mkdirSync(tempDir, { recursive: true });

function readRaw(name) {
  return fs.readFileSync(path.join(rawDir, name), "utf8").replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function terminalHtml({ title, lines, fontSize = 13, width = 0 }) {
  const body = lines
    .map((line) => {
      if (typeof line === "string") {
        return `<div class="line">${escapeHtml(line) || "&nbsp;"}</div>`;
      }
      if (line.type === "cmd") {
        return `<div class="line"><span class="prompt">PS E:\\devOps project\\student_attende&gt;</span> <span class="cmd">${escapeHtml(line.text)}</span></div>`;
      }
      if (line.type === "ok") {
        return `<div class="line ok">${escapeHtml(line.text)}</div>`;
      }
      if (line.type === "fail") {
        return `<div class="line fail">${escapeHtml(line.text)}</div>`;
      }
      if (line.type === "dim") {
        return `<div class="line dim">${escapeHtml(line.text)}</div>`;
      }
      return `<div class="line">${escapeHtml(line.text)}</div>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #dfe7f1; }
  #capture {
    display: inline-block;
    background: #0c0c0c;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 18px 44px rgba(13, 33, 58, .22);
    font-family: "Cascadia Mono", "Consolas", "Courier New", monospace;
  }
  .bar {
    height: 38px; background: #1f1f1f; display: flex; align-items: center;
    gap: 8px; padding: 0 15px; border-bottom: 1px solid #2c2c2c;
  }
  .dot { width: 11px; height: 11px; border-radius: 50%; }
  .red { background: #ff5f56; } .yellow { background: #ffbd2e; } .green { background: #27c93f; }
  .title { color: #9d9d9d; font-size: 12px; margin-left: 10px; font-family: "Segoe UI", sans-serif; }
  .body { padding: 17px 22px 20px; ${width ? `width: ${width}px;` : ""} }
  .line {
    white-space: pre; font-size: ${fontSize}px; line-height: 1.55; color: #d4d4d4;
  }
  .prompt { color: #16c60c; } .cmd { color: #ffffff; }
  .ok { color: #4ec9b0; } .fail { color: #f48771; } .dim { color: #8f8f8f; }
</style></head><body>
  <div id="capture">
    <div class="bar"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span><span class="title">${escapeHtml(title)}</span></div>
    <div class="body">${body}</div>
  </div>
</body></html>`;
}

function diagramHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #ffffff; }
  #capture {
    width: 1240px; box-sizing: border-box; padding: 34px 38px 30px;
    background: #f7f9fc; border: 1px solid #c9d6e6; border-radius: 10px;
    font-family: "Segoe UI", Arial, sans-serif; color: #17365d;
  }
  .row { display: flex; align-items: stretch; justify-content: center; gap: 0; }
  .node {
    flex: 1; background: #ffffff; border: 1.5px solid #2e5c8a; border-radius: 8px;
    padding: 13px 12px; text-align: center; box-shadow: 0 3px 10px rgba(23, 54, 93, .07);
  }
  .node strong { display: block; font-size: 15px; letter-spacing: .01em; }
  .node small { display: block; margin-top: 4px; font-size: 11.5px; color: #5a6b80; }
  .arrow {
    width: 34px; display: flex; align-items: center; justify-content: center;
    color: #2e5c8a; font-size: 20px; font-weight: 700; flex: 0 0 34px;
  }
  .down {
    height: 34px; display: flex; align-items: center; justify-content: center;
    color: #2e5c8a; font-size: 20px; font-weight: 700;
  }
  .label {
    font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: #6b7f96; margin: 0 0 9px 2px;
  }
  .band {
    margin-top: 16px; padding-top: 16px; border-top: 1px dashed #b9c9db;
  }
  .note {
    margin-top: 18px; padding: 12px 15px; background: #eaf1f9; border-left: 4px solid #2e5c8a;
    font-size: 12.5px; color: #33475f; line-height: 1.5;
  }
  .pill {
    display: inline-block; background: #17365d; color: #fff; border-radius: 999px;
    padding: 3px 10px; font-size: 11px; font-weight: 700; margin-right: 6px;
  }
</style></head><body>
  <div id="capture">
    <div class="label">Request path</div>
    <div class="row">
      <div class="node"><strong>Faculty / Browser</strong><small>http://localhost:3000</small></div>
      <div class="arrow">&#8594;</div>
      <div class="node"><strong>HTML + CSS + JavaScript</strong><small>Vanilla SPA frontend</small></div>
      <div class="arrow">&#8594;</div>
      <div class="node"><strong>Node.js 22 + Express</strong><small>REST API + validation</small></div>
      <div class="arrow">&#8594;</div>
      <div class="node"><strong>SQLite</strong><small>students · attendance · working_periods</small></div>
    </div>

    <div class="band">
      <div class="label">Delivery pipeline</div>
      <div class="row">
        <div class="node"><strong>Git repository</strong><small>main branch · commit history</small></div>
        <div class="arrow">&#8594;</div>
        <div class="node"><strong>Jenkins Pipeline</strong><small>checkout · npm ci · checks · 22 API tests</small></div>
        <div class="arrow">&#8594;</div>
        <div class="node"><strong>Docker image</strong><small>student-attendance:latest</small></div>
        <div class="arrow">&#8594;</div>
        <div class="node"><strong>Kubernetes</strong><small>Deployment + NodePort 30080</small></div>
      </div>
    </div>

    <div class="band">
      <div class="label">Automated verification</div>
      <div class="row">
        <div class="node"><strong>Selenium WebDriver + Chrome</strong><small>7 end-to-end browser tests</small></div>
        <div class="arrow">&#8594;</div>
        <div class="node"><strong>API + UI checks</strong><small>dashboard · students · attendance · reports · CSV · settings</small></div>
        <div class="arrow">&#8594;</div>
        <div class="node"><strong>Evidence</strong><small>test output · screenshots · Jenkins logs</small></div>
      </div>
    </div>

    <div class="note">
      <span class="pill">Deployed</span>
      Compose serves the app at <strong>http://localhost:3000</strong>; the kind cluster serves the same image through
      <strong>http://localhost:30080</strong>. Jenkins runs at <strong>http://localhost:8080</strong>.
    </div>
  </div>
</body></html>`;
}

function githubPlaceholderHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #ffffff; }
  #capture {
    width: 1240px; box-sizing: border-box; padding: 30px 34px;
    background: #ffffff; border: 2px dashed #9fb3c8; border-radius: 10px;
    font-family: "Segoe UI", Arial, sans-serif; color: #17365d;
  }
  .top { display: flex; align-items: center; gap: 14px; }
  .mark {
    width: 46px; height: 46px; border-radius: 50%; background: #17365d; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;
  }
  h2 { margin: 0; font-size: 20px; }
  p { margin: 6px 0 0; color: #51657d; font-size: 13.5px; line-height: 1.55; }
  .url {
    margin-top: 18px; padding: 13px 16px; background: #eef3f9; border: 1px solid #c9d6e6;
    border-radius: 7px; font-family: "Consolas", monospace; font-size: 14px; color: #17365d;
  }
  .hint { margin-top: 14px; font-size: 12.5px; color: #6b7f96; }
  .tag {
    display: inline-block; margin-top: 12px; padding: 4px 11px; border-radius: 999px;
    background: #fff4d6; color: #7a5a00; font-size: 11.5px; font-weight: 700;
  }
</style></head><body>
  <div id="capture">
    <div class="top">
      <div class="mark">GH</div>
      <div>
        <h2>GitHub repository page</h2>
        <p>Replace this panel with a screenshot of the pushed repository after the first <code>git push</code>.</p>
      </div>
    </div>
    <div class="url">https://github.com/sirivennela/student-attendance-devops</div>
    <div class="tag">PLACEHOLDER — capture the real repository page after pushing</div>
    <div class="hint">Suggested capture: repository home page showing the README, commit count, and the green Code button.</div>
  </div>
</body></html>`;
}

async function capture(driver, html, name, selector = "#capture") {
  const file = path.join(tempDir, `${name}.html`);
  fs.writeFileSync(file, html, "utf8");
  await driver.get(`file:///${file.replaceAll("\\", "/")}`);
  await driver.executeScript("return document.fonts.ready.then(() => true);");
  const element = await driver.findElement({ css: selector });
  const png = await element.takeScreenshot();
  const out = path.join(outDir, `${name}.png`);
  fs.writeFileSync(out, png, "base64");
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

function dockerLines() {
  const keep = new Map([
    ["student-attendance|latest", 0],
    ["student-attendance|ci-8", 1],
    ["student-attendance|ci-7", 2],
    ["student-attendance|ci-6", 3],
    ["student-attendance-jenkins|latest", 4],
    ["kindest/node|<none>", 5],
  ]);

  const rows = readRaw("docker-images.txt")
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length === 5)
    .filter(([repo, tag]) => keep.has(`${repo}|${tag}`))
    .sort((a, b) => keep.get(`${a[0]}|${a[1]}`) - keep.get(`${b[0]}|${b[1]}`));

  const header = ["REPOSITORY", "TAG", "IMAGE ID", "SIZE", "CREATED"];
  const widths = [30, 10, 14, 9, 0];
  const format = (parts) =>
    parts.map((part, index) => (index === 4 ? part : part.padEnd(widths[index]))).join("  ");

  return [
    { type: "cmd", text: "docker images" },
    format(header),
    ...rows.map(format),
  ];
}

function seleniumLines() {
  const lines = readRaw("selenium.txt")
    .split("\n")
    .filter((line, index, all) => !(index === all.length - 1 && line === ""));

  while (lines.length && lines[0].trim() === "") {
    lines.shift();
  }

  return [
    { type: "cmd", text: "npm run test:e2e" },
    ...lines.map((line) => {
      if (line.startsWith("✔")) return { type: "ok", text: line };
      if (line.startsWith("✖")) return { type: "fail", text: line };
      if (line.startsWith("ℹ")) return { type: "dim", text: `info ${line.slice(1).trimStart()}` };
      if (line.startsWith(">")) return { type: "dim", text: line };
      return line;
    }),
  ];
}

async function main() {
  const options = new chrome.Options();
  options.addArguments(
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=2",
    "--window-size=1600,1400",
    "--hide-scrollbars",
  );

  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  try {
    await driver.manage().window().setRect({ width: 1600, height: 1400 });

    await capture(
      driver,
      terminalHtml({ title: "Windows PowerShell — Docker", lines: dockerLines(), fontSize: 13, width: 1020 }),
      "docker-images",
    );

    await capture(
      driver,
      terminalHtml({
        title: "Windows PowerShell — Kubernetes",
        lines: [
          { type: "cmd", text: "kubectl get pods -n student-attendance" },
          ...readRaw("kubectl-pods.txt").split("\n"),
          "",
          { type: "cmd", text: "kubectl get svc -n student-attendance" },
          ...readRaw("kubectl-svc-pvc.txt").split("\n").slice(0, 3),
        ],
        fontSize: 12.5,
      }),
      "kubectl-workload",
    );

    await capture(
      driver,
      terminalHtml({
        title: "Windows PowerShell — Kubernetes",
        lines: [
          { type: "cmd", text: "kubectl get pvc -n student-attendance" },
          ...readRaw("kubectl-svc-pvc.txt").split("\n").slice(3),
          "",
          { type: "cmd", text: "kubectl rollout status deployment/student-attendance" },
          'deployment "student-attendance" successfully rolled out',
        ],
        fontSize: 12,
      }),
      "kubectl-storage",
    );

    await capture(
      driver,
      terminalHtml({ title: "Windows PowerShell — Selenium", lines: seleniumLines(), fontSize: 12.5 }),
      "selenium",
    );

    await capture(
      driver,
      terminalHtml({
        title: "Windows PowerShell — Git",
        lines: [
          { type: "cmd", text: "git log --oneline --graph -6" },
          ...readRaw("git-log.txt").split("\n"),
        ],
        fontSize: 13,
      }),
      "git-log",
    );

    await capture(driver, diagramHtml(), "architecture");
    await capture(driver, githubPlaceholderHtml(), "github-placeholder");
  } finally {
    await driver.quit();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
