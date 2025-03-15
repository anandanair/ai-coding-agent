const fs = require("fs");
const path = require("path");

function getProjectStructure(projectName) {
  const projectPath = path.join(__dirname, "../projects", projectName);

  if (!fs.existsSync(projectPath)) {
    return { error: "Project does not exist" };
  }

  // Define which files and folders to ignore
  const ignoredFiles = new Set([
    ".gitignore",
    "package-lock.json",
    "yarn.lock",
    ".env",
    ".env.local",
    ".DS_Store",
  ]);
  const ignoredFolders = new Set([
    "node_modules",
    "memory",
    "dist",
    "build",
    "coverage",
    ".git",
  ]);

  function scanDir(dir) {
    const items = fs.readdirSync(dir);
    return items.reduce((acc, item) => {
      const fullPath = path.join(dir, item);
      const isDirectory = fs.statSync(fullPath).isDirectory();

      if (isDirectory) {
        // Skip ignored folders
        if (ignoredFolders.has(item)) {
          return acc;
        }
        // Recursively scan directories
        acc.push({ [item]: scanDir(fullPath) });
      } else {
        // Skip ignored files
        if (ignoredFiles.has(item)) {
          return acc;
        }
        acc.push(item);
      }
      return acc;
    }, []);
  }

  return { projectName, structure: scanDir(projectPath) };
}

module.exports = getProjectStructure;
