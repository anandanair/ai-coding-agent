const analyzeProjectMemory = require("./analyzeProjectMemory");
const assessCodeChangeDetail = require("./assessCodeChangeDetail");
const { detectIntent } = require("./intentDetection");
const generateCode = require("./generateCode");

const utilities = {
  assessCodeChangeDetail: (projectName, conversationMessages, onChunk) =>
    assessCodeChangeDetail(projectName, conversationMessages, onChunk),
  analyzeProjectMemory: (projectPath) => analyzeProjectMemory(projectPath),
  detectIntent: (userMessage) => detectIntent(userMessage),
  generateCode: (projectName, conversationMessages) =>
    generateCode(projectName, conversationMessages),
};

module.exports = utilities;
