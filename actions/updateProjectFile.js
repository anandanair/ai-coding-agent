const fs = require("fs");
const path = require("path");

function updateProjectFile(projectName, filePath, content) {
  const projectDir = path.join(__dirname, "../projects", projectName);
  const fullFilePath = path.join(projectDir, filePath);

  if (!fs.existsSync(projectDir)) {
    return { error: "Project does not exist" };
  }

  // Ensure directory exists before writing the file
  fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });

  // Write content to file
  fs.writeFileSync(fullFilePath, content, "utf8");

  return { success: `File updated: ${filePath}` };
}

module.exports = updateProjectFile;
