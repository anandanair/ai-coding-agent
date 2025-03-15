const ollama = require("ollama").default;
const path = require("path");
const fs = require("fs-extra");

async function analyzeProjectMemory(projectPath) {
  const memoryFilePath = path.join(
    projectPath,
    "memory",
    "project-memory.json"
  );
  const memoryData = await fs.readFile(memoryFilePath, "utf8");
  const memory = JSON.parse(memoryData);

  const analysisPrompt = `
  You are an AI assistant tasked with analyzing the project structure provided in JSON format.
  This project is always a Vite + React project. Do not assume or add any files, technologies, or configurations not present in the JSON.
  Generate a concise, clear, and detailed summary that strictly describes the hierarchy, organization, and key components of the project structure in natural language.
  **Only provide the summary without any extra commentary, introductory statements, or explanations.**
  Here is the project structure JSON:
  ${JSON.stringify(memory.projectStructure, null, 2)}
  `;

  const response = await ollama.chat({
    model: "deepseek-r1",
    messages: [{ role: "system", content: analysisPrompt }],
    options: {
      temperature: 0,
    },
  });

  const rawAnalysis = response.message.content;
  const cleanAnalysis = rawAnalysis
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // console.log(cleanAnalysis);

  return cleanAnalysis;
}

module.exports = analyzeProjectMemory;
