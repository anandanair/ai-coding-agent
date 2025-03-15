const db = require("../db");
const conversationRepository = require("./conversationRepository");

function createProject(projectName) {
  try {
    const stmt = db.prepare(`INSERT INTO projects (projectName) VALUES (?)`);
    const info = stmt.run(projectName); // Execute the statement
    return info.lastInsertRowid; // Return the auto-generated projectId
  } catch (err) {
    throw err; // Propagate the error
  }
}

function getProjectByName(projectName) {
  try {
    const stmt = db.prepare(
      `SELECT projectId FROM projects WHERE projectName = ?`
    );
    const row = stmt.get(projectName); // Execute the query and get the first row
    return row; // Return the row (or undefined if not found)
  } catch (err) {
    throw err; // Propagate the error
  }
}

function getAllProjects() {
  try {
    const stmt = db.prepare(`SELECT * FROM projects`);
    const rows = stmt.all(); // Execute the query and return all rows
    return rows;
  } catch (err) {
    throw err; // Propagate the error
  }
}

/**
 * Cascade deletion: Delete all conversations and messages attached to the project,
 * then delete the project record.
 */
function deleteProjectCascade(projectName) {
  try {
    const project = getProjectByName(projectName);
    if (!project) {
      // If project not found, nothing to delete
      return 0;
    }
    const projectId = project.projectId;

    // Delete all conversations (and their messages) attached to this project.
    conversationRepository.deleteConversationsByProjectId(projectId);

    // Now delete the project record
    const stmt = db.prepare(`DELETE FROM projects WHERE projectName = ?`);
    const info = stmt.run(projectName);
    return info.changes; // Should be 1 if deletion succeeded
  } catch (err) {
    throw err;
  }
}

module.exports = {
  createProject,
  getProjectByName,
  getAllProjects,
  deleteProjectCascade,
};
