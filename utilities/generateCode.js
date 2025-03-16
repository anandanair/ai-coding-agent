const axios = require("axios");
const {
  searchProjectMetadata,
  qdrantClient,
} = require("../actions/ragActions");
const installPackages = require("../actions/installPackages");
const fs = require("fs");
const ollama = require("ollama").default;
const pathModule = require("path");

async function generateCode(projectName, conversationMessages) {
  try {
    console.log("Getting files to work on");
    const files = await getWorkingFiles(projectName, conversationMessages);

    console.log(files);

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

      console.log(fileContext);

      // 2. Build the system prompt for the code generation model
      const systemPrompt = buildCodeGenerationPrompt(filePath, fileContext);

      // Build the messages array including the system prompt and conversation messages
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationMessages,
        {
          role: "user",
          content:
            "Please generate the necessary code changes based on the above context and instructions.",
        },
      ];

      // 3. Call the code generation model to produce the code changes
      // let fullResponse = "";

      const response = await ollama.chat({
        // model: "deepseek-coder:33b-instruct-q4_0",
        // model: "deepseek-coder:6.7b",
        model: "deepseek-coder:6.7b-instruct-q8_0",
        // model: "phind-codellama",
        // model: "phind-codellama",
        // model: "phind-codellama",
        // model: "phind-codellama",
        messages: messages,
        stream: false,
      });

      // // Iterate over the stream and update the output live
      // for await (const chunk of response) {
      //   if (chunk.message && typeof chunk.message.content === "string") {
      //     fullResponse += chunk.message.content;
      //     // Clear the current line and move the cursor to the start
      //     process.stdout.clearLine();
      //     process.stdout.cursorTo(0);
      //     process.stdout.write(fullResponse);
      //   }

      //   if (chunk.done) {
      //     break;
      //   }
      // }

      // 4. Process and sanitize the response to get the generated code
      const rawGeneratedCode = response.message.content.trim();
      console.log("\nFinal Generated Code:\n", rawGeneratedCode);
      const generatedCode = sanitizeGeneratedCode(rawGeneratedCode);
      await installPackages(projectName, generateCode);
      // console.log(`Generated code for ${filePath}:`, generatedCode);

      // 5. Execute the appropriate tool based on action (edit or create)
      if (action === "edit") {
        await editFile(projectName, filePath, generatedCode);
        return {
          success: true,
          message: `Code changes have been made on file: ${filePath}`,
        };
      } else if (action === "create") {
        await createFile(projectName, filePath, generatedCode);
        return {
          success: true,
          message: `New file has been created: ${filePath}`,
        };
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

function buildCodeGenerationPrompt(filePath, fileContext) {
  return `You are a highly experienced AI coding assistant specializing in Vite + React projects using Tailwind CSS.
PROJECT CONTEXT:
- Vite + React project
- Exclusive Tailwind CSS styling
- Follow React & Tailwind best practices
- STRICT CODE-ONLY RESPONSE REQUIRED

TARGET FILE: ${filePath}
FILE CONTEXT:
${fileContext}

INSTRUCTIONS:
1. Generate ONLY valid, production-ready code for the specified file
2. ABSOLUTELY NO explanations, comments, or non-code text
3. No markdown formatting (no \`\`\`, no code blocks)
4. Output must be directly applicable code changes only
5. Use Tailwind CSS classes exclusively for styling
6. Maintain existing code structure where appropriate

WARNING: Your response must contain ONLY code. Any non-code text will break the build process. 

Respond with pure code changes for ${filePath}:`;
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

async function searchProjectVectorsForFile(
  projectName,
  relativeFilePath,
  embedding
) {
  // Convert relative path (e.g., "src/App.jsx") to absolute path
  const fullFilePath = pathModule.join(
    getProjectDirectory(projectName),
    relativeFilePath
  );
  try {
    const results = await qdrantClient.search(`project_${projectName}`, {
      vector: embedding,
      limit: 1,
      filter: {
        must: [{ key: "filePath", match: { value: fullFilePath } }],
      },
      with_payload: true,
    });
    if (results && results.length > 0) {
      return results[0].payload.snippet || "";
    }
    return "";
  } catch (error) {
    console.error(
      "Error retrieving file context for",
      fullFilePath,
      ":",
      error
    );
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

function sanitizeGeneratedCode(code) {
  code = code.trim();

  // Try to extract code from the first markdown code fence block.
  const codeFenceRegex = /```(?:\w+)?\s*([\s\S]*?)\s*```/;
  const match = code.match(codeFenceRegex);
  if (match && match[1]) {
    code = match[1].trim();
  }

  // Remove wrapping double or single quotes if they exist.
  if (
    (code.startsWith('"') && code.endsWith('"')) ||
    (code.startsWith("'") && code.endsWith("'"))
  ) {
    code = code.slice(1, -1).trim();
  }

  return code;
}

module.exports = generateCode;
