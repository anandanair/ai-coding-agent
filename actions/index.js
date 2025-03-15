const getProjectStructure = require("./getProjectStructure");
const getProjectMemory = require("./getProjectMemory");
const updateProjectFile = require("./updateProjectFile");
const updateProjectMemory = require("./updateProjectMemory");
const ragActions = require("./ragActions");

const actions = {
  getProjectStructure: (projectName) => getProjectStructure(projectName),
  getProjectMemory: (projectName) => getProjectMemory(projectName),
  updateProjectFile: (projectName, filePath, content) =>
    updateProjectFile(projectName, filePath, content),
  updateProjectMemory: (projectPath, data) =>
    updateProjectMemory(projectPath, data),
  initializeProjectRAG: ragActions.initializeProjectRAG,
  deleteQdrantCollection: ragActions.deleteQdrantCollection,
  searchProjectVectors: ragActions.searchProjectVectors,
};

module.exports = actions;
