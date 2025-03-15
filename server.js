const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const actions = require("./actions");
const killPort = require("kill-port");
const utilities = require("./utilities");
const { v4: uuidv4 } = require("uuid");
const {
  createProject,
  getProjectByName,
  getAllProjects,
  deleteProjectCascade,
} = require("./repositories/projectRepository");
const {
  addMessage,
  getMessages,
  getFormattedMessages,
  deleteMessagesByConversationId,
} = require("./repositories/messageRepository");
const {
  createConversation,
  updateConversationLastUpdated,
  getConversationByProjectId,
  getClarificationState,
  setClarificationState,
} = require("./repositories/conversationRepository");

const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }, // Adjust this as needed
});

const runningProjects = {}; // Store running projects with assigned ports
const PROJECTS_DIR = path.join(__dirname, "projects");

// Ensure the projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR);
}

// Project Endpoints
app.post("/create-project", async (req, res) => {
  const { projectName, socketId } = req.body;
  if (!projectName) {
    return res.status(400).json({ error: "Project name is required" });
  }

  const projectPath = path.join(PROJECTS_DIR, projectName);

  if (fs.existsSync(projectPath)) {
    return res.status(400).json({ error: "Project already exists" });
  }

  // Retrieve the io instance from the app
  const io = req.app.get("io");

  try {
    // Step 1: Create the Vite project
    io.to(socketId).emit("projectUpdate", { message: "Creating project..." });
    exec(
      `cd ${PROJECTS_DIR} && npm create vite@latest ${projectName} -- --template react`,
      (error) => {
        if (error) {
          console.error("Error creating project:", error);
          io.to(socketId).emit("projectUpdate", {
            message: "Error creating project.",
          });
          return res.status(500).json({ error: "Failed to create project" });
        }

        io.to(socketId).emit("projectUpdate", {
          message: `Project "${projectName}" created successfully!`,
        });
        console.log(`✅ Project "${projectName}" created successfully!`);

        io.to(socketId).emit("projectUpdate", {
          message: "Installing dependencies...",
        });
        // Step 2: Install dependencies inside the created project
        exec(`cd ${projectPath} && npm install`, async (installError) => {
          if (installError) {
            console.error("Error installing dependencies:", installError);
            io.to(socketId).emit("projectUpdate", {
              message: "Error installing dependencies.",
            });
            return res
              .status(500)
              .json({ error: "Failed to install dependencies" });
          }

          io.to(socketId).emit("projectUpdate", {
            message: "Dependencies installed.",
          });
          console.log(`📦 Dependencies installed for "${projectName}"`);

          try {
            let project = getProjectByName(projectName);
            let projectId;
            if (!project) {
              projectId = createProject(projectName);
              io.to(socketId).emit("projectUpdate", {
                message: `Inserted project with ID: ${projectId}`,
              });
              console.log(`Inserted project with ID: ${projectId}`);
            } else {
              projectId = project.projectId;
            }

            // Create a conversation for this project (single persistent conversation)
            const conversationId = uuidv4();
            createConversation(conversationId, projectId);

            // Retrieve project structure
            const structure = actions.getProjectStructure(projectName);

            io.to(socketId).emit("projectUpdate", {
              message: "Initializing project Memory.",
            });
            // Initialize project memory
            await actions.updateProjectMemory(projectPath, {
              projectStructure: {
                lastUpdated: new Date().toISOString(),
                files: structure.structure,
              },
              features: {},
              components: {},
              functions: {},
              history: [],
              nextSteps: [],
            });

            io.to(socketId).emit("projectUpdate", {
              message: "Project memory initialized.",
            });

            // Initialize project RAG
            io.to(socketId).emit("projectUpdate", {
              message: "Initializing project context with RAG.",
            });

            await actions.initializeProjectRAG(projectName, projectPath);

            io.to(socketId).emit("projectUpdate", {
              message: "Project context initialized with RAG.",
            });

            res.json({
              message: `Project "${projectName}" is ready to use!`,
              projectPath,
            });
          } catch (dbErr) {
            io.to(socketId).emit("projectUpdate", {
              message: "Database error encountered.",
            });
            console.error("Database error inserting project:", dbErr);
            // Optionally handle the error (cleanup the created project) or proceed.
          }
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/delete-project", async (req, res) => {
  const { projectName } = req.body;

  if (!projectName) {
    return res.status(400).json({ error: "Project name is required" });
  }

  const projectPath = path.join(PROJECTS_DIR, projectName);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    // Rename the directory first to avoid potential locks on Windows
    const tempPath = projectPath + "_to_delete";
    fs.renameSync(projectPath, tempPath);
    fs.rmSync(tempPath, { recursive: true, force: true });
    console.log(`🗑️ Project "${projectName}" deleted successfully!`);

    // Cascade delete the project record, its conversations, and their messages
    const changes = deleteProjectCascade(projectName);
    if (changes === 0) {
      console.warn(`No database record found for project "${projectName}".`);
    }

    await actions.deleteQdrantCollection(`project_${projectName}`);

    res.json({ message: `Project "${projectName}" deleted successfully.` });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

app.get("/projects", (req, res) => {
  try {
    const projects = getAllProjects();
    res.json({ projects });
  } catch (error) {
    console.error("Error retrieving projects:", error);
    res.status(500).json({ error: "Failed to retrieve projects" });
  }
});

app.post("/start-project", async (req, res) => {
  const { projectName } = req.body;
  if (!projectName) {
    return res.status(400).json({ error: "Project name is required" });
  }

  const projectPath = path.join(PROJECTS_DIR, projectName);

  // Check if project is already running
  if (runningProjects[projectName]) {
    const structure = actions.getProjectStructure(projectName);
    return res.json({
      message: "Project is already running!",
      port: runningProjects[projectName],
      projectStructure: structure,
    });
  }

  // Start assigning ports from 4000 instead of 5173
  const basePort = 4000;
  const usedPorts = Object.values(runningProjects);
  let port = basePort;

  // Find an available port
  while (usedPorts.includes(port)) {
    port++; // Increment if the port is already in use
  }

  try {
    // Start the Vite server in the project directory
    const child = exec(`cd ${projectPath} && npm run dev -- --port ${port}`, {
      detached: true,
      stdio: "ignore",
    });

    runningProjects[projectName] = port; // Store assigned port

    // Retrieve the project structure
    const structure = actions.getProjectStructure(projectName);

    res.json({
      message: "Project started successfully!",
      port,
      projectStructure: structure,
    });
  } catch (error) {
    console.error("Error starting project:", error);
    res.status(500).json({ error: "Failed to start project" });
  }
});

app.post("/stop-project", async (req, res) => {
  const { projectName } = req.body;
  if (!projectName) {
    return res.status(400).json({ error: "Project name is required" });
  }

  // Check if project is running
  if (!runningProjects[projectName]) {
    return res.status(400).json({ error: "Project is not running" });
  }

  const port = runningProjects[projectName];

  try {
    await killPort(port);
    // console.log(`🛑 Project "${projectName}" stopped.`);
    delete runningProjects[projectName]; // Remove from active projects
    res.json({ message: `Project "${projectName}" has been stopped.` });
  } catch (err) {
    console.error("Error stopping project:", err);
    res.status(500).json({ error: "Failed to stop project" });
  }
});

// Chat Endpoints
app.post("/chat", async (req, res) => {
  const { projectName, message, files } = req.body;

  if (!projectName || !message) {
    return res.status(400).json({
      error: "Project name and message are required",
    });
  }

  try {
    // Retrieve the project record from the database
    const project = getProjectByName(projectName);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Append file list to the original message
    const appendedMessage = `${message}\nFiles:\n${files
      .map((file) => `- ${file}`)
      .join("\n")}`;

    // Retrieve the conversation record for the project
    const conversation = getConversationByProjectId(project.projectId);

    if (!conversation) {
      return res
        .status(404)
        .json({ error: "Conversation not found for project" });
    }

    const conversationId = conversation.conversationId;

    // Check if the conversation is in clarification mode
    const clarificationPending = getClarificationState(conversationId);

    if (clarificationPending) {
      addMessage(conversationId, "user", appendedMessage);
      updateConversationLastUpdated(conversationId);

      // Build conversation context as an array of formatted messages
      const formattedMessages = getFormattedMessages(conversationId);

      const assessResponse = await utilities.assessCodeChangeDetail(
        projectName,
        formattedMessages,
        (chunk) => {
          // Emit each new chunk to connected clients
          io.to(projectName).emit("newMessage", {
            sender: "assistant",
            content: chunk,
            done: false,
          });
        }
      );

      if (!assessResponse.isSufficient) {
        // Remain in clarification mode
        setClarificationState(conversationId, true);
        addMessage(conversationId, "assistant", assessResponse.response);
        updateConversationLastUpdated(conversationId);
        io.to(projectName).emit("newMessage", {
          sender: "assistant",
          content: assessResponse.response,
          done: true,
        });
        return res.json({
          message: assessResponse.response,
          clarificationNeeded: true,
        });
      } else {
        // Details are now sufficient; exit clarification mode
        setClarificationState(conversationId, false);
        const successMessage =
          "Code change request received and processing will begin shortly.";

        await utilities.generateCode(projectName, formattedMessages);

        // addMessage(conversationId, "assistant", successMessage);
        // updateConversationLastUpdated(conversationId);
        // io.to(projectName).emit("newMessage", {
        //   sender: "assistant",
        //   content: successMessage,
        //   done: true,
        // });
        return res.json({ message: successMessage });
      }
    }

    // If not in clarification mode, proceed with normal intent detection
    const intentResult = await utilities.detectIntent(message);

    // If intentResult contains a message, return it (for general_chat and out_of_scope)
    if (intentResult.message) {
      const responseMessage = intentResult.message;

      // Emit the message to connected clients
      io.to(projectName).emit("newMessage", {
        sender: "assistant",
        content: responseMessage,
        done: true,
      });
      return res.json({ message: responseMessage });
    }

    // If intent is "code_change", process further
    if (intentResult.intent === "code_change") {
      // Store the user's message in the messages table
      addMessage(conversationId, "user", appendedMessage);
      updateConversationLastUpdated(conversationId);

      // Retrieve all messages for context, ordered chronologically
      const conversationMessages = getFormattedMessages(conversationId);

      // Stream the assistant's response
      const assessResponse = await utilities.assessCodeChangeDetail(
        projectName,
        conversationMessages,
        (chunk) => {
          io.to(projectName).emit("newMessage", {
            sender: "assistant",
            content: chunk,
            done: false,
          });
        }
      );

      if (!assessResponse.isSufficient) {
        setClarificationState(conversationId, true);
        addMessage(conversationId, "assistant", assessResponse.response);
        updateConversationLastUpdated(conversationId);
        io.to(projectName).emit("newMessage", {
          sender: "assistant",
          content: assessResponse.response,
          done: true,
        });
        return res.json({
          message: assessResponse.response,
          clarificationNeeded: true,
        });
      }

      // If details are sufficient, proceed with the code change process

      const successMessage =
        "Code change request received and processing will begin shortly.";

      await utilities.generateCode(projectName, conversationMessages);

      // addMessage(conversationId, "assistant", successMessage);
      // updateConversationLastUpdated(conversationId);

      // // Emit the success message
      // io.to(projectName).emit("newMessage", {
      //   sender: "assistant",
      //   content: successMessage,
      //   done: true,
      // });
      return res.json({ message: successMessage });
    }

    // Handle any unexpected cases
    return res.status(500).json({ error: "Unknown classification result." });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return res.status(500).json({ error: "Failed to process message." });
  }
});

app.get("/chat-messages", (req, res) => {
  const { projectName } = req.query;
  if (!projectName) {
    return res.status(400).json({ error: "Project name is required" });
  }
  try {
    const project = getProjectByName(projectName);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    const conversation = getConversationByProjectId(project.projectId);
    if (!conversation) {
      return res
        .status(404)
        .json({ error: "Conversation not found for project" });
    }
    const conversationId = conversation.conversationId;
    const messages = getMessages(conversationId);
    return res.json({ messages });
  } catch (error) {
    console.error("Error retrieving chat messages:", error);
    return res.status(500).json({ error: "Failed to retrieve messages" });
  }
});

app.post("/reset-chat", async (req, res) => {
  const { projectName } = req.body;
  if (!projectName) {
    return res.status(400).json({ error: "Project name is required" });
  }

  try {
    // Retrieve the project record from the database
    const project = getProjectByName(projectName);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Retrieve the conversation record for the project
    const conversation = getConversationByProjectId(project.projectId);
    if (!conversation) {
      return res
        .status(404)
        .json({ error: "Conversation not found for project" });
    }
    const conversationId = conversation.conversationId;

    // Delete all messages for the conversation
    deleteMessagesByConversationId(conversationId);

    // Reset the clarification_pending flag to 0 (false)
    setClarificationState(conversationId, false);

    res.json({ message: "Chat reset successfully" });
  } catch (error) {
    console.error("Error resetting chat:", error);
    res.status(500).json({ error: "Failed to reset chat" });
  }
});

// When a client connects, join them to a room based on projectName
io.on("connection", (socket) => {
  // console.log("New client connected");

  // Listen for a join event from the client with projectName
  socket.on("joinProject", (projectName) => {
    socket.join(projectName);
    // console.log(`Client joined room for project: ${projectName}`);
  });

  socket.on("disconnect", () => {
    // console.log("Client disconnected");
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));
app.set("io", io);
