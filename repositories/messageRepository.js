const db = require("../db");

function addMessage(conversationId, sender, content) {
  try {
    const stmt = db.prepare(
      `INSERT INTO messages (conversationId, sender, content) VALUES (?, ?, ?)`
    );
    const info = stmt.run(conversationId, sender, content); // Execute the statement
    return info.lastInsertRowid; // Return the auto-generated messageId
  } catch (err) {
    throw err; // Propagate the error
  }
}

function getMessages(conversationId) {
  try {
    const stmt = db.prepare(
      `SELECT messageId, conversationId, sender, content, createdOn FROM messages WHERE conversationId = ? ORDER BY createdOn ASC`
    );
    const rows = stmt.all(conversationId); // Execute the query and get all rows
    return rows; // Return the rows (or an empty array if no rows are found)
  } catch (err) {
    throw err; // Propagate the error
  }
}

// New function: returns messages in the desired format
function getFormattedMessages(conversationId) {
  try {
    const stmt = db.prepare(
      `SELECT sender, content FROM messages WHERE conversationId = ? ORDER BY createdOn ASC`
    );
    const rows = stmt.all(conversationId);
    return rows.map((row) => ({
      role: row.sender,
      content: row.content,
    }));
  } catch (err) {
    throw err;
  }
}

/**
 * Delete all messages for a given conversation ID.
 */
function deleteMessagesByConversationId(conversationId) {
  try {
    const stmt = db.prepare(`DELETE FROM messages WHERE conversationId = ?`);
    stmt.run(conversationId);
  } catch (err) {
    throw err;
  }
}

module.exports = {
  addMessage,
  getMessages,
  getFormattedMessages,
  deleteMessagesByConversationId,
};
