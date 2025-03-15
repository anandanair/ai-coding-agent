import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FaPlus,
  FaFolder,
  FaTrash,
  FaRocket,
  FaExclamationTriangle,
  FaInfoCircle,
} from "react-icons/fa";
import io from "socket.io-client";

function App() {
  const [projectName, setProjectName] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [projects, setProjects] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creationUpdate, setCreationUpdate] = useState({
    text: "",
    type: "info",
  });
  const [socket, setSocket] = useState(null);

  const navigate = useNavigate();

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get("http://localhost:5000/projects");
      setProjects(response.data.projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      showMessage("Failed to load projects", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const newSocket = io("http://localhost:5000");
    setSocket(newSocket);

    // Cleanup on unmount
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Listen for updates from the server
    socket.on("projectUpdate", (data) => {
      setCreationUpdate({ text: data.message, type: "info" });
    });

    // Cleanup the event listener on unmount or if socket changes
    return () => socket.off("projectUpdate");
  }, [socket]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    // Add event listener to handle Escape key press
    const handleEscape = (e) => {
      if (e.key === "Escape" && showModal) {
        setShowModal(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    // Add/remove body scroll lock when modal is open
    if (showModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "auto";
    };
  }, [showModal]);

  // Validate project name as user types
  useEffect(() => {
    validateProjectName(projectName);
  }, [projectName]);

  const validateProjectName = (name) => {
    // Project name can't be empty
    if (!name.trim()) {
      setValidationError("");
      return false;
    }

    // Check for spaces
    if (name.includes(" ")) {
      setValidationError("Project name cannot contain spaces");
      return false;
    }

    // Only allow alphanumeric characters, hyphens and underscores
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validNameRegex.test(name)) {
      setValidationError(
        "Project name can only contain letters, numbers, hyphens and underscores"
      );
      return false;
    }

    // Check if project name starts with a letter (Vite convention)
    if (!/^[a-zA-Z]/.test(name)) {
      setValidationError("Project name must start with a letter");
      return false;
    }

    // Clear error if all checks pass
    setValidationError("");
    return true;
  };

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000); // Auto-dismiss after 5 seconds
  };

  const createProject = async () => {
    if (!projectName.trim()) {
      showMessage("Project name is required!", "error");
      return;
    }

    // Validate project name before creating
    if (!validateProjectName(projectName)) {
      showMessage(validationError, "error");
      return;
    }

    // Check for duplicate project names in the updated projects structure
    if (projects.some((project) => project.projectName === projectName)) {
      showMessage("A project with this name already exists!", "error");
      return;
    }

    // Set loading state for project creation
    setIsCreating(true);

    try {
      const response = await axios.post(
        "http://localhost:5000/create-project",
        { projectName, socketId: socket.id }
      );
      showMessage(response.data.message);
      setProjectName("");
      fetchProjects();
    } catch (error) {
      showMessage(
        error.response?.data?.error || "Something went wrong",
        "error"
      );
    } finally {
      // Reset the loading state after creation completes
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      createProject();
    }
  };

  const confirmDelete = (project) => {
    setProjectToDelete(project.projectName); // now project is an object
    setShowModal(true);
  };

  const cancelDelete = () => {
    setShowModal(false);
    setProjectToDelete(null);
  };

  const deleteProject = async () => {
    if (!projectToDelete) return;

    setDeleting(projectToDelete);

    try {
      await axios.post("http://localhost:5000/delete-project", {
        projectName: projectToDelete,
      });
      // Filter out the deleted project based on its projectName property
      setProjects(projects.filter((p) => p.projectName !== projectToDelete));
      showMessage(`"${projectToDelete}" deleted successfully.`);
    } catch (error) {
      showMessage(
        error.response?.data?.error || "Failed to delete project",
        "error"
      );
    } finally {
      setDeleting(null);
      setProjectToDelete(null);
      setShowModal(false);
    }
  };

  // Custom modal component for delete confirmation
  const DeleteModal = () => {
    if (!showModal) return null;

    return (
      <>
        {/* Modal backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={cancelDelete}
        ></div>

        {/* Modal content */}
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl z-50 w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="bg-red-500/20 p-3 rounded-full mb-4">
              <FaExclamationTriangle className="text-red-500 text-2xl" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Delete Project</h3>
            <p className="text-gray-400">
              Are you sure you want to delete{" "}
              <span className="text-white font-medium">
                "{projectToDelete}"
              </span>
              ? This action cannot be undone.
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={cancelDelete}
              className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              disabled={deleting === projectToDelete}
            >
              Cancel
            </button>
            <button
              onClick={deleteProject}
              disabled={deleting === projectToDelete}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium flex items-center justify-center"
            >
              {deleting === projectToDelete ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                "Delete"
              )}
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-center mb-12">
          <FaRocket className="text-blue-400 text-4xl mr-4" />
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            AI Coding Agent
          </h1>
        </div>

        {/* Message display */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center ${
              messageType === "error"
                ? "bg-red-900/50 border border-red-500"
                : "bg-green-900/50 border border-green-500"
            }`}
          >
            <span className="text-sm">{message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Project Section */}
          <div className="bg-gray-800/50 backdrop-blur-sm shadow-lg rounded-xl p-6 border border-gray-700 hover:border-blue-500/30 transition-all">
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <FaPlus className="mr-2 text-blue-400" />
              Create New Project
            </h2>
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isCreating}
                  className={`w-full bg-gray-700/50 text-white border ${
                    validationError && projectName
                      ? "border-red-500"
                      : "border-gray-600"
                  } p-4 pl-4 pr-24 rounded-lg focus:outline-none focus:ring-2 ${
                    validationError && projectName
                      ? "focus:ring-red-500"
                      : "focus:ring-blue-500"
                  } focus:border-transparent`}
                />
                <button
                  onClick={createProject}
                  disabled={
                    (!!validationError && projectName.length > 0) || isCreating
                  }
                  className={`absolute right-2 top-2 bottom-2 ${
                    (validationError && projectName) || isCreating
                      ? "bg-gray-500 cursor-not-allowed"
                      : "bg-blue-500 hover:bg-blue-600"
                  } text-white px-4 rounded-md flex items-center gap-2 transition-colors`}
                >
                  {isCreating ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <FaPlus size={14} /> Create
                    </>
                  )}
                </button>
              </div>

              {isCreating && (
                <div className="mt-2 text-sm text-blue-300 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-300 mr-2"></div>
                  <span>{creationUpdate.text}</span>
                </div>
              )}

              {/* Validation message */}
              {projectName && (
                <div className="mt-2">
                  {validationError ? (
                    <p className="text-red-400 text-sm flex items-center">
                      <FaExclamationTriangle className="mr-2" />
                      {validationError}
                    </p>
                  ) : (
                    <p className="text-green-400 text-sm flex items-center">
                      <FaInfoCircle className="mr-2" />
                      Project name is valid
                    </p>
                  )}
                </div>
              )}

              {/* Help text */}
              <div className="mt-1 text-xs text-gray-400 bg-gray-700/30 p-3 rounded-md">
                <p className="flex items-center mb-1">
                  <FaInfoCircle className="mr-2" /> Project naming guidelines:
                </p>
                <ul className="space-y-1 pl-5 list-disc">
                  <li>Must start with a letter</li>
                  <li>
                    Can contain letters, numbers, hyphens, and underscores
                  </li>
                  <li>Cannot contain spaces or special characters</li>
                  <li>Examples: my-project, react_app, newProject2</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Project List Section */}
          <div className="bg-gray-800/50 backdrop-blur-sm shadow-lg rounded-xl p-6 border border-gray-700">
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <FaFolder className="mr-2 text-yellow-400" />
              Your Projects
            </h2>

            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : projects.length > 0 ? (
              <ul className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {projects.map((project, index) => (
                  <li key={index} className="relative group">
                    <div
                      className="flex items-center justify-between bg-gray-700/50 p-4 rounded-lg hover:bg-gray-600/70 transition-all border border-transparent hover:border-blue-500/30 cursor-pointer"
                      onClick={() => navigate(`/chat/${project.projectName}`)}
                    >
                      <div className="flex items-center gap-3 truncate pr-10">
                        <div className="bg-yellow-500/20 p-2 rounded-md">
                          <FaFolder className="text-yellow-400" />
                        </div>
                        <span className="font-medium truncate">
                          {project.projectName}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(project);
                        }}
                        className="absolute right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        disabled={deleting === project.projectName}
                      >
                        {deleting === project.projectName ? (
                          <div className="animate-spin h-5 w-5 border-2 border-red-500 rounded-full border-t-transparent"></div>
                        ) : (
                          <FaTrash />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 bg-gray-700/30 rounded-lg">
                <FaFolder className="text-4xl mb-4 text-gray-500" />
                <p>No projects created yet</p>
                <p className="text-sm mt-2 text-gray-500">
                  Create your first project to get started
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteModal />
    </div>
  );
}

export default App;
