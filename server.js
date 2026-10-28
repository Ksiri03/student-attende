"use strict";

const path = require("node:path");
const { openDatabase, resolveDatabasePath } = require("./src/database");
const { createApp } = require("./src/app");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATABASE_PATH = resolveDatabasePath(
  process.env.DB_PATH || path.join(__dirname, "data", "attendance.db"),
);

const db = openDatabase(DATABASE_PATH);
const app = createApp({ db });

const server = app.listen(PORT, HOST, () => {
  console.log(`Student Attendance app running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${DATABASE_PATH}`);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error("Could not close the database cleanly:", error);
    }
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown("uncaughtException");
});

module.exports = { server, db };
