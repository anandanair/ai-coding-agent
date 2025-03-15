const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new Database(dbPath);

try {
  // Create projects table with projectId and projectName
  db.prepare(
    `CREATE TABLE IF NOT EXISTS projects (
      projectId INTEGER PRIMARY KEY AUTOINCREMENT,
      projectName TEXT UNIQUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS conversations (
      conversationId TEXT PRIMARY KEY,
      projectId INTEGER,
      createdOn DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
      clarification_pending INTEGER DEFAULT 0,
      FOREIGN KEY(projectId) REFERENCES projects(projectId)
    )`
  ).run();

  // Create messages table to store each individual message linked to a conversation
  db.prepare(
    `CREATE TABLE IF NOT EXISTS messages (
      messageId INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationId TEXT,
      sender TEXT,
      content TEXT,
      createdOn DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversationId) REFERENCES conversations(conversationId)
    )`
  ).run();

  console.log("Connected to SQLite database and tables are ready.");
} catch (err) {
  console.error("Error setting up database:", err);
}

module.exports = db;
