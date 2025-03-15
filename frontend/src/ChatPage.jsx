import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import io from "socket.io-client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// Create a socket connection (adjust the URL if needed)
const socket = io("http://localhost:5000");

function ChatPage() {
  const { projectName } = useParams(); // Get project name from URL
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [port, setPort] = useState(null); // Store assigned port
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [projectStructure, setProjectStructure] = useState(null); // New state for file structure
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Add these new state variables in the ChatPage function
  const [leftPanelWidth, setLeftPanelWidth] = useState(12); // percentage
  const [centerPanelWidth, setCenterPanelWidth] = useState(40); // percentage
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialLeftWidth, setInitialLeftWidth] = useState(0);
  const [initialCenterWidth, setInitialCenterWidth] = useState(0);

  const leftResizeRef = useRef(null);
  const rightResizeRef = useRef(null);

  const navigate = useNavigate();

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [previewError, setPreviewError] = useState(false);

  // Functions to start resizing
  const startLeftResize = (e) => {
    e.preventDefault();
    setIsResizingLeft(true);
    setInitialMouseX(e.clientX);
    setInitialLeftWidth(leftPanelWidth);
    setInitialCenterWidth(centerPanelWidth);
    setShowOverlay(true);
    preventTextSelection();
  };

  const startRightResize = (e) => {
    e.preventDefault();
    setIsResizingRight(true);
    setInitialMouseX(e.clientX);
    setInitialLeftWidth(leftPanelWidth);
    setInitialCenterWidth(centerPanelWidth);
    setShowOverlay(true);
    preventTextSelection();
  };

  // Prevent text selection
  const preventTextSelection = () => {
    document.body.style.userSelect = "none";
    document.body.style.WebkitUserSelect = "none";
  };

  const restoreTextSelection = () => {
    document.body.style.userSelect = "";
    document.body.style.WebkitUserSelect = "";
  };

  // Resize handler effect
  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - initialMouseX;
      const windowWidth = window.innerWidth;
      const deltaPercent = (deltaX / windowWidth) * 100;

      if (isResizingLeft) {
        // Calculate new widths
        const newLeftWidth = Math.max(
          15,
          Math.min(40, initialLeftWidth + deltaPercent)
        );
        const leftWidthDelta = newLeftWidth - leftPanelWidth;
        const newCenterWidth = Math.max(20, centerPanelWidth - leftWidthDelta);

        // Update state
        setLeftPanelWidth(newLeftWidth);
        setCenterPanelWidth(newCenterWidth);
      } else if (isResizingRight) {
        // Calculate new center width
        const newCenterWidth = Math.max(
          20,
          Math.min(65, initialCenterWidth + deltaPercent)
        );

        // Update state
        setCenterPanelWidth(newCenterWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      setShowOverlay(false);
      restoreTextSelection();
    };

    // Add event listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Cleanup
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isResizingLeft,
    isResizingRight,
    initialMouseX,
    initialLeftWidth,
    initialCenterWidth,
    leftPanelWidth,
    centerPanelWidth,
  ]);

  // Add this useEffect near the top with your other useEffect hooks
  useEffect(() => {
    // Add animation styles for file chips
    const styleTag = document.createElement("style");
    styleTag.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out forwards;
    }
  `;
    document.head.appendChild(styleTag);

    return () => {
      document.head.removeChild(styleTag);
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Auto-scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Listen for real-time messages via socket.io
  useEffect(() => {
    // When the component mounts, join the room for this project
    socket.emit("joinProject", projectName);

    socket.on("newMessage", (data) => {
      setIsLoading(false);
      setChatHistory((prev) => {
        if (data.sender === "assistant") {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.sender === "assistant" &&
            !lastMessage.done
          ) {
            // Only append the new chunk if it's not already at the end of the last message.
            if (!lastMessage.content.endsWith(data.content)) {
              return [
                ...prev.slice(0, prev.length - 1),
                {
                  ...lastMessage,
                  content: lastMessage.content + data.content,
                  done: data.done,
                },
              ];
            } else {
              // If it's already there, return previous state unmodified.
              return prev;
            }
          } else {
            // Otherwise, add the new message as a new entry.
            return [
              ...prev,
              { sender: data.sender, content: data.content, done: data.done },
            ];
          }
        }
        // For user messages or other cases, just append the new message.
        return [...prev, data];
      });
    });

    return () => {
      socket.off("newMessage");
    };
  }, [projectName]);

  // Load conversation messages when the project is opened
  useEffect(() => {
    const fetchConversationMessages = async () => {
      try {
        const response = await axios.get(
          "http://localhost:5000/chat-messages",
          {
            params: { projectName },
          }
        );
        setChatHistory(response.data.messages);
      } catch (error) {
        console.error("Error fetching conversation messages:", error);
      }
    };

    if (projectName) {
      fetchConversationMessages();
    }
  }, [projectName]);

  // 🔹 Start Project & Get Assigned Port
  useEffect(() => {
    const isRunningRef = { current: false }; // Track if project started

    const startProject = async () => {
      try {
        const response = await axios.post(
          "http://localhost:5000/start-project",
          {
            projectName,
          }
        );
        setPort(response.data.port); // Store the port
        if (response.data.projectStructure) {
          setProjectStructure(response.data.projectStructure);
        }
        isRunningRef.current = true; // Mark as started
      } catch (error) {
        console.error("Error starting project:", error);
      }
    };

    startProject();

    return () => {
      if (isRunningRef.current) {
        // Only stop if started
        axios
          .post("http://localhost:5000/stop-project", { projectName })
          .catch((error) => console.error("Error stopping project:", error));
      }
    };
  }, [projectName]);

  const handleSendMessage = async () => {
    if ((!message.trim() && attachedFiles.length === 0) || isLoading) return;

    // Create message content with file references
    let messageContent = message;
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles.join(", ");
      messageContent = messageContent.trim()
        ? `${messageContent}\n\nFiles: ${fileRefs}`
        : `Files: ${fileRefs}`;
    }

    setIsLoading(true);
    const newHistory = [
      ...chatHistory,
      { sender: "user", content: messageContent },
    ];
    setChatHistory(newHistory);

    try {
      await axios.post("http://localhost:5000/chat", {
        projectName,
        message: message.trim(),
        files: attachedFiles,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setChatHistory([
        ...newHistory,
        {
          sender: "ai",
          content: "⚠️ Error processing request. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setMessage("");
      setAttachedFiles([]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Improved message rendering with markdown
  const renderMessage = (text) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          return !inline && match ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              {...props}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );

  // Enhanced message bubble component
  const MessageBubble = ({ msg, index }) => (
    <div
      key={index}
      className={`flex ${
        msg.sender === "user" ? "justify-end" : "justify-start"
      } mb-4`}
    >
      <div
        className={`flex items-start gap-3 max-w-[90%] ${
          msg.sender === "user" ? "flex-row-reverse" : ""
        }`}
      >
        <div
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            msg.sender === "user"
              ? "bg-gradient-to-br from-blue-500 to-blue-600"
              : "bg-gradient-to-br from-purple-500 to-purple-600"
          }`}
        >
          {msg.sender === "user" ? (
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          )}
        </div>
        <div
          className={`rounded-xl p-4 shadow-lg ${
            msg.sender === "user"
              ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white"
              : "bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700"
          } transition-all hover:shadow-xl`}
        >
          {renderMessage(msg.content)}
          {msg.error && (
            <button
              onClick={() => handleRetry(msg)}
              className="mt-2 text-xs text-red-200 hover:text-red-100 flex items-center"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
  const CloseButton = () => (
    <button
      onClick={() => navigate(-1)} // Go back to previous page
      className="fixed top-4 right-4 z-50 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition-all hover:scale-105"
      title="Close chat"
    >
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  );

  // Improved ProjectStructureSidebar with drag and drop
  const ProjectStructureSidebar = ({ structure }) => {
    if (!structure || !Array.isArray(structure)) return null;

    const handleDragStart = (e, filename) => {
      e.dataTransfer.setData("text/plain", filename);
      e.dataTransfer.effectAllowed = "copy";
    };

    const renderItems = (items, depth = 0) => {
      return (
        <ul className={`ml-4 mt-1`}>
          {items.map((item, idx) => {
            if (typeof item === "string") {
              return (
                <li
                  key={idx}
                  className="flex items-center py-1 hover:bg-gray-800 rounded pl-1 group"
                >
                  <span className="mr-1 text-gray-500">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path>
                      <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                  </span>
                  <span
                    className="text-sm text-gray-300 cursor-grab flex-1"
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, item)}
                  >
                    {item}
                  </span>
                </li>
              );
            } else if (typeof item === "object") {
              return Object.keys(item).map((folderName) => (
                <li key={folderName} className="my-1">
                  <div className="flex items-center py-1 hover:bg-gray-800 rounded pl-1">
                    <span className="mr-1 text-blue-400">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-gray-200">
                      {folderName}
                    </span>
                  </div>
                  {renderItems(item[folderName], depth + 1)}
                </li>
              ));
            }
            return null;
          })}
        </ul>
      );
    };

    return (
      <div className="p-4 border-r border-gray-800 overflow-y-auto h-full">
        <h2 className="text-lg font-bold mb-4 flex items-center">
          <svg
            className="w-5 h-5 mr-2 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          Project Files
        </h2>
        {renderItems(structure)}
      </div>
    );
  };

  // Create this new component inside ChatPage
  const ConfirmationModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full animate-scale-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-red-500/20 rounded-full">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h3 className="text-xl font-semibold text-gray-100">
            Reset Chat History?
          </h3>

          <p className="text-gray-400">
            This will permanently delete all messages in this chat. This action
            cannot be undone.
          </p>

          <div className="flex gap-3 w-full mt-4">
            <button
              onClick={() => setShowConfirmation(false)}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleResetChat}
              className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Confirm Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const handleResetChat = async () => {
    setIsResetting(true);
    try {
      await axios.post("http://localhost:5000/reset-chat", { projectName });
      setChatHistory([]);
    } catch (error) {
      console.error("Error resetting chat:", error);
      alert("Failed to reset chat. Please try again.");
    } finally {
      setIsResetting(false);
      setShowConfirmation(false);
    }
  };

  const ResetButton = () => {
    return (
      <>
        <button
          onClick={() => setShowConfirmation(true)}
          disabled={isResetting}
          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Reset chat history"
        >
          {isResetting ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>Reset Chat</span>
            </>
          )}
        </button>
        {showConfirmation && <ConfirmationModal />}
      </>
    );
  };

  const LeftResizer = () => (
    <div
      ref={leftResizeRef}
      className="absolute right-0 top-0 bottom-0 w-1 bg-gray-800 hover:bg-purple-500 cursor-col-resize z-10 hover:w-1.5 transition-all"
      onMouseDown={startLeftResize}
    />
  );

  const RightResizer = () => (
    <div
      ref={rightResizeRef}
      className="absolute right-0 top-0 bottom-0 w-1 bg-gray-800 hover:bg-purple-500 cursor-col-resize z-10 hover:w-1.5 transition-all"
      onMouseDown={startRightResize}
    />
  );

  const AttachedFileChip = ({ filename, onRemove }) => (
    <div className="inline-flex items-center gap-1 bg-gray-700 text-gray-200 rounded-full px-3 py-1 mr-2 mb-2 text-sm animate-fade-in">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
      </svg>
      <span className="mx-1">{filename}</span>
      <button
        onClick={onRemove}
        className="hover:text-red-400 transition-colors"
        title="Remove file"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex relative">
      <CloseButton />

      {/* Left Sidebar: Project Structure */}
      <div
        className="relative h-screen border-r border-gray-800 overflow-hidden"
        style={{ width: `${leftPanelWidth}%` }}
      >
        {projectStructure && projectStructure.structure ? (
          <ProjectStructureSidebar structure={projectStructure.structure} />
        ) : (
          <div className="p-4 text-gray-400">Loading file structure...</div>
        )}
        <LeftResizer />
      </div>

      {/* Center: AI Chat */}
      <div
        className="relative border-r border-gray-800 h-screen flex flex-col overflow-hidden"
        style={{ width: `${centerPanelWidth}%` }}
      >
        <header className="bg-gray-900 p-4 border-b border-gray-800 flex-shrink-0">
          <div className="mx-auto flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
                {projectName}
              </span>
              <span className="text-gray-400">AI Assistant</span>
            </h1>
            <ResetButton />
          </div>
        </header>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* <main className="flex-1 flex flex-col overflow-hidden h-[calc(100vh-72px)]"> */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
            {chatHistory.map((msg, index) => (
              <MessageBubble key={index} msg={msg} index={index} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-3 pl-12">
                <div className="animate-pulse flex space-x-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 border-t border-gray-800 bg-gray-900 flex-shrink-0">
            <div
              className={`relative ${
                isDraggingOver
                  ? "ring-2 ring-purple-500 bg-gray-800/50 rounded-xl"
                  : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isDraggingOver) setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const filename = e.dataTransfer.getData("text/plain");
                if (filename && !attachedFiles.includes(filename)) {
                  setAttachedFiles((prev) => [...prev, filename]);
                }
              }}
            >
              {/* File attachment chips */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap items-center mb-2 px-1">
                  {attachedFiles.map((file, index) => (
                    <AttachedFileChip
                      key={index}
                      filename={file}
                      onRemove={() => {
                        setAttachedFiles((prev) =>
                          prev.filter((_, i) => i !== index)
                        );
                      }}
                    />
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me anything about the project... (drag files here)"
                className="w-full bg-gray-800 rounded-xl p-4 pr-16 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-800"
                rows="1"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading}
                className="absolute right-4 bottom-4 bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
        <RightResizer />
      </div>

      {/* Right: Live Preview */}
      <div
        className="bg-gray-950 h-screen relative"
        style={{ width: `${100 - leftPanelWidth - centerPanelWidth}%` }}
      >
        {showOverlay && (
          <div className="absolute inset-0 bg-transparent z-50" />
        )}
        {port ? (
          <iframe
            src={`http://localhost:${port}`}
            className="w-full h-screen bg-gray-900"
            onError={() => setPreviewError(true)}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-4">
              <svg
                className="animate-spin h-8 w-8 text-purple-500 mx-auto"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-gray-400">Starting project server...</p>
            </div>
          </div>
        )}
        {previewError && (
          <div className="h-full flex items-center justify-center text-red-400">
            <p>Failed to load preview - Server might be unavailable</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
