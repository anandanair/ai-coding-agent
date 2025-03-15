const axios = require("axios");
const {
  searchProjectMetadata,
  qdrantClient,
} = require("../actions/ragActions");
const fs = require("fs");
const ollama = require("ollama").default;
const pathModule = require("path");

async function generateCode(projectName, conversationMessages) {
  try {
    const files = await getWorkingFiles(projectName, conversationMessages);
    console.log("Files to process:", files);

    // Loop through each file entry
    for (const fileEntry of files) {
      const { action, path: filePath } = fileEntry;

      // 1. Retrieve file-specific context from Qdrant
      const embedding = await getQueryEmbedding(
        `Context for file: ${filePath}`
      );
      const fileContext = await searchProjectVectorsForFile(
        projectName,
        filePath,
        embedding
      );

      // 2. Build the system prompt for the code generation model
      const systemPrompt = buildCodeGenerationPrompt(
        action,
        filePath,
        fileContext
      );

      // Build the messages array including the system prompt and conversation messages
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationMessages,
      ];

      // 3. Call the code generation model to produce the code changes
      const response = await ollama.chat({
        model: "qwen2.5-coder",
        messages: messages,
        stream: false,
      });

      // 4. Process the response to get the generated code
      const generatedCode = response.message.content.trim();
      console.log(`Generated code for ${filePath}:`, generatedCode);

      // 5. Execute the appropriate tool based on action (edit or create)
      if (action === "edit") {
        await editFile(projectName, filePath, generatedCode);
      } else if (action === "create") {
        await createFile(projectName, filePath, generatedCode);
      }
    }
  } catch (error) {
    console.error("Error generating code:", error);
  }
}

// Helper functions
async function getQueryEmbedding(query) {
  const response = await axios.post("http://localhost:8000/embedding", {
    text: query,
  });
  return response.data.embedding;
}

// Helper function: Build a system prompt for code generation
function buildCodeGenerationPrompt(action, filePath, fileContext) {
  return `<|begin_of_text|>
<|start_header_id|>system<|end_header_id|>
You are an AI assistant tasked with generating code changes for a Vite + React project.
ACTION: ${action.toUpperCase()}
TARGET FILE: ${filePath}
FILE CONTEXT:
${fileContext}

Based on the developer conversation and the file context provided, generate the code modifications or new code needed.
Provide ONLY the code changes required, and do not include any extra text or explanations.
<|eot_id|>`;
}

async function getWorkingFiles(projectName, conversationMessages) {
  try {
    // 1. Define the base query for retrieving project context
    const baseQuery = "Project structure:";

    // 2. Get an embedding for the base query only
    const embedding = await getQueryEmbedding(baseQuery);

    // 3. Search for relevant project context using the embedding
    const metadata = await searchProjectMetadata(projectName, embedding);
    const projectStructure =
      metadata && metadata.structure
        ? JSON.stringify(metadata.structure, null, 2)
        : "";

    console.log(projectStructure);

    // 4. Append a new user message instructing the model to decide on file changes
    const fileDecisionMessage = {
      role: "user",
      content:
        "Based on the conversation and the project structure above, list ONLY the file(s) that should be edited or created. Do not include any additional text or explanations.",
    };

    const systemPrompt = `<|begin_of_text|>
    <|start_header_id|>system<|end_header_id|>
    You are a file path analyzer for Vite+React projects. Your task is to identify EXACTLY which files need creation or modification based on developer conversations and project context. Output MUST be machine-parsable.
      
    PROJECT STRUCTURE:
    ${projectStructure}
      
    RULES:
    1. REQUIRED FORMAT: [create|edit]: path/to/file.js (one per line)
    2. Decision logic:
       - Use 'create' if file doesn't exist in project structure
       - Use 'edit' if file exists in project structure
       - Verify existence against project structure
    3. Never include:
       - Comments or explanations
       - Code snippets
       - Markdown formatting
       - Duplicate entries
      
    DECISION CRITERIA:
    • Cross-reference project structure for file existence
    • Explicit "Files:" mentions are likely edits
    • New features/components imply creation
    • Configuration updates are edits
      
    OUTPUT EXAMPLES:
    edit: src/components/ExistingComponent.js
    create: src/hooks/useNewFeature.js
    edit: vite.config.js
    create: public/data/config.json
    
    <|eot_id|>`;

    // 5. Build the messages array with the system prompt, existing conversation, and the new instruction
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...conversationMessages,
      fileDecisionMessage,
    ];

    // 7. Call the model (via Ollama) to generate the file decision
    const response = await ollama.chat({
      model: "qwen2.5-coder",
      messages: messages,
      stream: false,
    });

    // 8. Process the response into structured format
    const fileContent = response.message.content.trim();
    const files = [];

    // Split into lines and process each line
    const fileLines = fileContent.split("\n");
    for (const line of fileLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Use regex to extract action and path
      const match = trimmedLine.match(/^(create|edit):\s*(.+)$/);
      if (match) {
        files.push({
          action: match[1], // 'create' or 'edit'
          path: match[2].trim(), // file path
        });
      }
    }

    return files;
  } catch (error) {
    // Handle errors appropriately
    console.error("Error getting working files:", error);
    return [];
  }
}

// Helper function: Retrieve file-specific context from Qdrant by filtering on filePath
async function searchProjectVectorsForFile(projectName, filePath, embedding) {
  try {
    // Example: Search in the project's code collection with a filter for the given file path
    const results = await qdrantClient.search(`project_${projectName}`, {
      vector: embedding,
      limit: 1,
      filter: {
        must: [{ key: "filePath", match: { value: filePath } }],
      },
      with_payload: true,
    });
    if (results && results.length > 0) {
      // Return the snippet or other context from the first result
      return results[0].payload.snippet || "";
    }
    return "";
  } catch (error) {
    console.error("Error retrieving file context for", filePath, ":", error);
    return "";
  }
}

// Tool function: Edit an existing file with the generated code
async function editFile(projectName, filePath, newCode) {
  try {
    const projectDir = getProjectDirectory(projectName);
    const fullPath = pathModule.join(projectDir, filePath);
    // Optionally, read the current file content and merge changes
    fs.writeFileSync(fullPath, newCode, "utf-8");
    console.log(`File ${filePath} edited successfully.`);
  } catch (error) {
    console.error(`Error editing file ${filePath}:`, error);
  }
}

// Tool function: Create a new file with the generated code
async function createFile(projectName, filePath, newCode) {
  try {
    const projectDir = getProjectDirectory(projectName);
    const fullPath = pathModule.join(projectDir, filePath);
    // Create directories if they do not exist
    fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, newCode, "utf-8");
    console.log(`File ${filePath} created successfully.`);
  } catch (error) {
    console.error(`Error creating file ${filePath}:`, error);
  }
}

function getProjectDirectory(projectName) {
  return pathModule.join(process.cwd(), "projects", projectName);
}

module.exports = generateCode;
