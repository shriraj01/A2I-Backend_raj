const { pool1 } = require("../dbConfig/connect");
const logger = require("../utils/logger");

const updateQueries = Object.freeze({
    Automation: Object.freeze({
        table: "automation_requests",
        key: "request_id",
        query: `UPDATE automation_requests 
                SET A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW()
                WHERE request_id = ?`
    }),

    Innovation: Object.freeze({
        table: "innovationtask_details",
        key: "Innovation_id",
        query: `UPDATE innovationtask_details 
                SET A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW()
                WHERE Innovation_id = ?`
    }),

    Enthusiasts: Object.freeze({
        table: "ai_enthusiasts",
        key: "enthusiasts_id",
        query: `UPDATE ai_enthusiasts 
                SET A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW()
                WHERE enthusiasts_id = ?`
    }),

    Support: Object.freeze({
        table: "support_requests",
        key: "support_request_id",
        query: `UPDATE support_requests 
                SET A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW()
                WHERE support_request_id = ?`
    }),
});

const ALLOWED_REQUEST_TYPES = Object.freeze(["Automation", "Innovation", "Enthusiasts", "Support"]);


const addNote = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id, request_type, sender_type, emp_id, emp_name, message } = req.body;

  // Validation log
  if (!request_type || !request_id || !sender_type || !emp_id || !emp_name || !message) {
    logger.error({
      message: "Missing required fields for addNote",
      route,
      method,
      request_id,
      request_type,
      sender_type,
      emp_id
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!ALLOWED_REQUEST_TYPES.includes(request_type)) {
    return res.status(400).json({ error: "Invalid request_type. Allowed types: Automation, Innovation, Enthusiasts, Support" });
  }

  const numericRequestId = parseInt(request_id, 10);
  if (isNaN(numericRequestId) || numericRequestId <= 0 || String(numericRequestId) !== String(request_id).trim()) {
    return res.status(400).json({ error: "Invalid request_id format" });
  }

  // Request log
  logger.info({
    message: "Adding note",
    route,
    method,
    request_id: numericRequestId,
    request_type,
    sender_type,
    emp_id,
    emp_name,
    message_preview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
  });

  // Always insert note
  pool1.query(
    `INSERT INTO request_notes 
         (request_type, request_id, sender_type, emp_id, emp_name, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
    [request_type, numericRequestId, sender_type, emp_id, emp_name, message],
    (err, noteResult) => {
      if (err) {
        logger.error({
          message: "Note insert error",
          route,
          method,
          request_id: numericRequestId,
          request_type,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "Internal server error" });
      }

      logger.info({
        message: "Note added successfully",
        route,
        method,
        request_id: numericRequestId,
        request_type,
        note_id: noteResult.insertId
      });

      // 2. ROLE CHECK: Only proceed to update A2I response fields if sender is Admin
      const config = Object.prototype.hasOwnProperty.call(updateQueries, request_type) ? updateQueries[request_type] : null;
      
      if (!config || sender_type !== "Admin") {
        logger.info({
          message: sender_type === "Admin" ? "No config found for type" : "Non-admin note added",
          route,
          method,
          request_id: numericRequestId,
          request_type,
          sender_type,
          note_id: noteResult.insertId
        });
        
        return res.status(201).json({
          status: "success",
          message: sender_type === "Admin" 
            ? "Note added (Type not found in config)" 
            : "Note added successfully (A2I response fields not updated for this role)",
          message_id: noteResult.insertId
        });
      }

      // 3. If Admin, check if response fields already exist
      pool1.query(
        `SELECT A2I_response_id, A2I_response_name FROM ${config.table} WHERE ${config.key} = ?`,
        [numericRequestId],
        (err, rows) => {
          if (err) {
            logger.error({
              message: "Query check error for existing response",
              route,
              method,
              request_id,
              request_type,
              error: err.message,
              stack: err.stack
            });
            return res.status(500).json({ error: "Internal server error" });
          }

          const row = rows[0];

          // If Admin already responded previously, don't overwrite the first response date/id
          if (row && (row.A2I_response_id || row.A2I_response_name)) {
            logger.info({
              message: "Admin response already exists - skipping update",
              route,
              method,
              request_id,
              request_type,
              note_id: noteResult.insertId
            });
            
            return res.status(201).json({
              status: "success",
              message: "Note added (Admin response already present)",
              message_id: noteResult.insertId
            });
          }

          // 4. Update the main table with Admin details
          pool1.query(
            config.query,
            [emp_id, emp_name, numericRequestId],
            (err) => {
              if (err) {
                logger.error({
                  message: "Error updating table with Admin info",
                  route,
                  method,
                  request_id: numericRequestId,
                  request_type,
                  error: err.message,
                  stack: err.stack
                });
                return res.status(500).json({ error: "Internal server error" });
              }

              logger.info({
                message: "Note added & Admin response updated successfully",
                route,
                method,
                request_id: numericRequestId,
                request_type,
                note_id: noteResult.insertId
              });

              return res.status(201).json({
                status: "success",
                message: "Note added & Admin response updated successfully",
                message_id: noteResult.insertId
              });
            }
          );
        }
      );
    }
  );
};

const getMessages = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id, request_type } = req.query;

  // Validation log
  if (!request_id || !request_type) {
    logger.error({
      message: "Missing required fields for getMessages",
      route,
      method,
      request_id,
      request_type
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!ALLOWED_REQUEST_TYPES.includes(request_type)) {
    return res.status(400).json({ error: "Invalid request_type. Allowed types: Automation, Innovation, Enthusiasts, Support" });
  }

  const numericRequestId = parseInt(request_id, 10);
  if (isNaN(numericRequestId) || numericRequestId <= 0 || String(numericRequestId) !== String(request_id).trim()) {
    return res.status(400).json({ error: "Invalid request_id format" });
  }

  // Request log
  logger.info({
    message: "Fetching messages",
    route,
    method,
    request_id: numericRequestId,
    request_type
  });

  pool1.query(
    `SELECT message_id, sender_type, emp_id, emp_name, message, created_at
     FROM request_notes
     WHERE request_id = ? AND request_type = ?
     ORDER BY created_at ASC`, 
    [numericRequestId, request_type], 
    (err, results) => {
      if (err) {
        logger.error({
          message: "Error fetching notes",
          route,
          method,
          request_id: numericRequestId,
          request_type,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: 'Server error' });
      }

      logger.info({
        message: "Messages fetched successfully",
        route,
        method,
        request_id: numericRequestId,
        request_type,
        message_count: results.length
      });

      res.json({ status: 'success', messages: results });
    }
  );
};

const markAsSeen = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id, request_type, emp_id } = req.body;
  
  // Validation log
  if (!request_id || !request_type || !emp_id) {
    logger.error({
      message: "Missing required fields for markAsSeen",
      route,
      method,
      request_id,
      request_type,
      emp_id
    });
    return res.status(400).json({ error: "Missing fields" });
  }

  if (!ALLOWED_REQUEST_TYPES.includes(request_type)) {
    return res.status(400).json({ error: "Invalid request_type. Allowed types: Automation, Innovation, Enthusiasts, Support" });
  }

  const numericRequestId = parseInt(request_id, 10);
  if (isNaN(numericRequestId) || numericRequestId <= 0 || String(numericRequestId) !== String(request_id).trim()) {
    return res.status(400).json({ error: "Invalid request_id format" });
  }

  // Request log
  logger.info({
    message: "Marking messages as seen",
    route,
    method,
    request_id: numericRequestId,
    request_type,
    emp_id
  });

  pool1.query(
    `SELECT message_id FROM request_notes WHERE request_id = ? AND request_type = ?`,
    [numericRequestId, request_type],
    (err, messages) => {
      if (err) {
        logger.error({
          message: "Database query error in markAsSeen",
          route,
          method,
          request_id: numericRequestId,
          request_type,
          emp_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "Server error" });
      }

      logger.info({
        message: "Found messages to mark",
        route,
        method,
        request_id: numericRequestId,
        request_type,
        emp_id,
        messages_found: messages.length
      });

      if (!messages.length) {
        logger.info({
          message: "No messages to mark",
          route,
          method,
          request_id,
          request_type,
          emp_id
        });
        return res.json({ status: "success", message: "No messages to mark" });
      }

      const values = messages.map(m => [m.message_id, emp_id]);
      
      pool1.query(
        `INSERT IGNORE INTO request_message_reads (message_id, emp_id) VALUES ?`, 
        [values], 
        (err2, result) => {
          if (err2) {
            logger.error({
              message: "Database insert error in markAsSeen",
              route,
              method,
              request_id,
              request_type,
              emp_id,
              error: err2.message,
              stack: err2.stack
            });
            return res.status(500).json({ error: "Server error" });
          }

          logger.info({
            message: "Messages marked as seen",
            route,
            method,
            request_id,
            request_type,
            emp_id,
            affected_rows: result.affectedRows
          });

          // SOCKET.IO INTEGRATION - Emit real-time read receipt
          try {
            const io = req.app.get('io');
            if (io) {
              // Emit to the specific chat room
              io.to(`chat_${request_id}_${request_type}`).emit('messages-read', {
                request_id,
                request_type,
                read_by: emp_id,
                messages_count: messages.length,
                affected_rows: result.affectedRows,
                read_at: new Date().toISOString()
              });

              // Emit general notification
              io.emit('messages-seen-update', {
                type: 'messages-seen',
                message: 'Messages have been read',
                request_id,
                request_type,
                read_by: emp_id,
                messages_count: messages.length
              });

              logger.info({
                message: "Socket events emitted for read receipt",
                route,
                method,
                request_id,
                request_type,
                emp_id
              });
            } else {
              logger.error({
                message: "Socket.IO not available for markAsSeen",
                route,
                method,
                request_id,
                request_type,
                emp_id
              });
            }
          } catch (socketError) {
            logger.error({
              message: "Socket.IO error in markAsSeen",
              route,
              method,
              request_id,
              request_type,
              emp_id,
              error: socketError.message,
              stack: socketError.stack
            });
          }

          res.json({ 
            status: "success", 
            message: "Messages marked as seen",
            messages_count: messages.length,
            affected_rows: result.affectedRows
          });
        }
      );
    }
  );
};

const getUnreadCount = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id, request_type, emp_id } = req.query;
  
  if (!request_id || !request_type || !emp_id) {
    logger.error({
      message: "Missing required fields for getUnreadCount",
      route,
      method,
      request_id,
      request_type,
      emp_id
    });
    return res.status(400).json({ error: "Missing fields" });
  }

  if (!ALLOWED_REQUEST_TYPES.includes(request_type)) {
    return res.status(400).json({ error: "Invalid request_type. Allowed types: Automation, Innovation, Enthusiasts, Support" });
  }

  const numericRequestId = parseInt(request_id, 10);
  if (isNaN(numericRequestId) || numericRequestId <= 0 || String(numericRequestId) !== String(request_id).trim()) {
    return res.status(400).json({ error: "Invalid request_id format" });
  }

  // Request log
  logger.info({
    message: "Fetching unread count",
    route,
    method,
    request_id: numericRequestId,
    request_type,
    emp_id
  });

  pool1.query(
    `SELECT COUNT(*) AS unread_count
     FROM request_notes rn
     WHERE rn.request_id = ? AND rn.request_type = ?
       AND rn.emp_id != ?
       AND rn.message_id NOT IN (SELECT message_id FROM request_message_reads WHERE emp_id = ?)`,
    [numericRequestId, request_type, emp_id, emp_id],
    (err, result) => {
      if (err) {
        logger.error({
          message: "Database query error in getUnreadCount",
          route,
          method,
          request_id: numericRequestId,
          request_type,
          emp_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "Server error" });
      }

      const unread_count = result[0]?.unread_count || 0;
      
      logger.info({
        message: "Unread count retrieved",
        route,
        method,
        request_id,
        request_type,
        emp_id,
        unread_count
      });

      res.json({ 
        status: "success", 
        unread_count: unread_count
      });
    }
  );
};

module.exports = {
    addNote,
    getMessages,
    markAsSeen,
    getUnreadCount
};