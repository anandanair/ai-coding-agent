const db = require("../db");
const messageRepository = require("./messageRepository");

function createConversation(conversationId, projectId) {
  try {
    const stmt = db.prepare(
      `INSERT INTO conversations (conversationId, projectId) VALUES (?, ?)`
    );
    stmt.run(conversationId, projectId); // Execute the statement
  } catch (err) {
    throw err; // Propagate the error
  }
}

function getConversation(conversationId) {
  try {
    const stmt = db.prepare(
      `SELECT conversationId, projectId, createdOn, lastUpdated FROM conversations WHERE conversationId = ?`
    );
    const row = stmt.get(conversationId); // Execute the query and get the first row
    return row; // Return the row (or undefined if not found)
  } catch (err) {
    throw err; // Propagate the error
  }
}

function getConversationByProjectId(projectId) {
  try {
    const stmt = db.prepare(`SELECT * FROM conversations WHERE projectId = ?`);
    return stmt.get(projectId);
  } catch (err) {
    throw err;
  }
}

function updateConversationLastUpdated(conversationId) {
  try {
    const stmt = db.prepare(
      `UPDATE conversations SET lastUpdated = CURRENT_TIMESTAMP WHERE conversationId = ?`
    );
    stmt.run(conversationId); // Execute the statement
  } catch (err) {
    throw err; // Propagate the error
  }
}

/**
 * Delete all conversations and their associated messages for a given projectId.
 */
function deleteConversationsByProjectId(projectId) {
  try {
    // First, get all conversation IDs for the project
    const getStmt = db.prepare(
      `SELECT conversationId FROM conversations WHERE projectId = ?`
    );
    const conversations = getStmt.all(projectId);

    // Delete messages for each conversation
    conversations.forEach((conv) => {
      messageRepository.deleteMessagesByConversationId(conv.conversationId);
    });

    // Now, delete the conversations themselves
    const delStmt = db.prepare(`DELETE FROM conversations WHERE projectId = ?`);
    delStmt.run(projectId);
  } catch (err) {
    throw err;
  }
}

// New function: Get the clarification state for a conversation
function getClarificationState(conversationId) {
  try {
    const stmt = db.prepare(
      `SELECT clarification_pending FROM conversations WHERE conversationId = ?`
    );
    const row = stmt.get(conversationId);
    return row ? row.clarification_pending === 1 : false;
  } catch (err) {
    throw err;
  }
}

// New function: Update the clarification state for a conversation
function setClarificationState(conversationId, state) {
  try {
    const value = state ? 1 : 0;
    const stmt = db.prepare(
      `UPDATE conversations SET clarification_pending = ? WHERE conversationId = ?`
    );
    stmt.run(value, conversationId);
  } catch (err) {
    throw err;
  }
}

module.exports = {
  createConversation,
  getConversation,
  getConversationByProjectId,
  updateConversationLastUpdated,
  deleteConversationsByProjectId,
  getClarificationState,
  setClarificationState,
};
