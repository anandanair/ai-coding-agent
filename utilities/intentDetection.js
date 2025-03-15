const ollama = require("ollama").default;

async function detectIntent(userMessage) {
  try {
    const response = await ollama.chat({
      model: "llama3.1:8b-instruct-q6_K",
      messages: [
        {
          role: "system",
          content: `
                    You are an intent classifier for a Vite + React project. Analyze the user's message and call the classify_intent tool with:

                    - intent: One of [code_change, general_chat, out_of_scope]

                    Rules:
                    1. code_change REQUIRES:
                      - Technical specifics: Component/file names ("Update Header.jsx")
                      - Any request to change, update, or modify the project.
                      - Clear implementation: "Add a button with hover state using CSS"

                    2. general_chat: ONLY casual conversation (greetings, jokes, "how are you").

                    3. out_of_scope:
                      - Non-React/Vite tech: "Deploy to AWS", "Train a model"
                      - Non-technical tasks: "Summarize this text"

                    Respond ONLY with the tool call. No extra text.
          `,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      options: {
        temperature: 0,
      },
      tools: [
        {
          type: "function",
          function: {
            name: "classify_intent",
            description:
              "Classify user messages into intents for a Vite + React project",
            parameters: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: ["code_change", "general_chat", "out_of_scope"],
                  description:
                    "REQUIRED - Must match one of the 3 categories exactly",
                },
              },
              required: ["intent"],
            },
          },
        },
      ],
    });

    if (
      !response.message.tool_calls ||
      response.message.tool_calls.length === 0
    ) {
      throw new Error("No tool call detected.");
    }

    let classifiedIntent = null;

    for (const tool of response.message.tool_calls) {
      if (tool.function.name === "classify_intent") {
        classifiedIntent = tool.function.arguments.intent;
      }
    }

    if (!classifiedIntent) {
      throw new Error("No valid classify_intent tool call found.");
    }

    // Handle non-code_change intents internally
    switch (classifiedIntent) {
      case "general_chat":
        return {
          message:
            "I can only assist with React development. How can I help with your project?",
        };

      case "out_of_scope":
        return {
          message: "That request is outside the scope of this React assistant.",
        };

      case "code_change":
        return { intent: "code_change" };

      default:
        return { message: "Unknown intent classification." };
    }
  } catch (error) {
    console.error("Error in intent detection:", error);
    return { message: "Failed to process message." };
  }
}

module.exports = { detectIntent };
