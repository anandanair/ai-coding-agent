const axios = require("axios");
const { searchProjectVectors } = require("../actions/ragActions");
const { searchProjectMetadata } = require("../actions/ragActions");
const ollama = require("ollama").default;

async function assessCodeChangeDetail(
  projectName,
  conversationMessages,
  onChunk
) {
  try {
    // 1. Get the latest user message
    const userMessage =
      conversationMessages.filter((m) => m.role === "user").slice(-1)[0]
        ?.content || "";

    const baseQuery = "Project structure and UI elements context:";
    const combinedQuery = `${baseQuery} ${userMessage}`;

    // 2. Get embedding for the user's query
    const embedding = await getQueryEmbedding(combinedQuery);

    // 3. Retrieve both code context and metadata from Qdrant
    const codeContext = await searchProjectVectors(projectName, embedding);
    const metadataContext = await searchProjectMetadata(projectName, embedding);

    // Combine both contexts into a single string
    const ragContext = `Project Metadata:\n${metadataContext}\n\nProject Code Context:\n${codeContext}`;

    // 4. Construct system prompt
    const systemPrompt = buildSystemPrompt(ragContext);

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...conversationMessages,
    ];

    let fullResponse = "";

    // Call the LLM (via Ollama) with the prompt as a user message
    const stream = await ollama.chat({
      model: "qwen2.5-coder",
      // model: "gemma",
      // model: "deepseek-r1",
      // model: "llama3.1:8b-instruct-q6_K",
      messages: messages,
      stream: true,
    });

    // Iterate over the stream of JSON objects
    for await (const chunk of stream) {
      if (chunk.message && typeof chunk.message.content === "string") {
        fullResponse += chunk.message.content;
        onChunk(chunk.message.content);
      }
      if (chunk.done) {
        break;
      }
    }

    return {
      isSufficient: fullResponse.trim() === "Sufficient",
      response: fullResponse.trim(),
    };
  } catch (error) {
    console.error("Assessment error:", error);
    throw error;
  }
}

// Helper functions
async function getQueryEmbedding(query) {
  const response = await axios.post("http://localhost:8000/embedding", {
    text: query,
  });
  return response.data.embedding;
}

function buildSystemPrompt(ragContext) {
  return `<|begin_of_text|>
    <|start_header_id|>system<|end_header_id|>
    You are an AI assistant evaluating whether a user request contains sufficient details to implement code changes in a Vite + React project.

    PROJECT CONTEXT:
    ${ragContext}

    NOTE: The user message includes both the description of the changes and an appended "Files:" section.
    - If the "Files:" section lists files, the request is for editing existing files.
    - If the "Files:" section is empty, the request is for a new feature or creating a new file.

    ASSESSMENT CRITERIA:
    1. Component details: Does the request specify what component(s) to create or modify?
    2. Functionality requirements: Are the specific behaviors and interactions clearly defined?
    3. UI elements: Are the visual elements and their layout sufficiently described?
    4. Data requirements: Is it clear what data needs to be managed or displayed?
    5. Integration: If this adds to existing functionality, is the integration point clear?

    REQUIRED RESPONSE FORMAT:
    - If ALL necessary details are provided, respond ONLY with the word "Sufficient".
    - If ANY details are missing, respond ONLY with the missing details, and format your response in markdown.
    - Do NOT include any additional text, explanations or suggestions.
    <|eot_id|>`;
}

module.exports = assessCodeChangeDetail;
