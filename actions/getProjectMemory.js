const fs = require("fs");
const path = require("path");

const PROJECTS_DIR = path.join(__dirname, "..", "projects");

function getProjectMemory(projectName) {
  const memoryFilePath = path.join(
    PROJECTS_DIR,
    projectName,
    "memory",
    "project-memory.json"
  );
  try {
    const data = fs.readFileSync(memoryFilePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error(
      "Error reading project memory for project:",
      projectName,
      err
    );
    return null;
  }
}

module.exports = getProjectMemory;
