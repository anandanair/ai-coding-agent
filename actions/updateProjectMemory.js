const fs = require("fs");
const path = require("path");
const utilities = require("../utilities");

async function updateProjectMemory(projectPath, data) {
  const memoryDir = path.join(projectPath, "memory");
  const memoryFilePath = path.join(memoryDir, "project-memory.json");

  // Ensure memory folder exists
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  // Load existing memory or initialize new memory
  let memory = {};
  if (fs.existsSync(memoryFilePath)) {
    memory = JSON.parse(fs.readFileSync(memoryFilePath, "utf8"));
  } else {
    memory = {
      projectStructure: { lastUpdated: null, files: [] },
      features: {},
      components: {},
      functions: {},
      history: [],
      nextSteps: [],
      lastUpdated: null,
      lastChange: null,
    };
  }

  // Add timestamp and last change description
  memory.lastUpdated = new Date().toISOString();
  memory.lastChange = data.lastChange || "No description provided";

  // Merge new data into memory
  Object.assign(memory, data);

  // Save updated memory
  fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), "utf8");

  // // Add AI analysis to memory
  // try {
  //   memory.aiProjectStructureAnalysis = await utilities.analyzeProjectMemory(
  //     projectPath
  //   );
  // } catch (error) {
  //   memory.aiProjectStructureAnalysis = "Analysis failed: " + error.message;
  // }

  // // Save updated memory with AI analysis
  // fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), "utf8");
}

module.exports = updateProjectMemory;
