const { pool1 } = require("../../dbConfig/connect");
const { supportCreationMail } = require("../../emailConfig/mailConfig");

const multer = require("multer");
const { insertSupportHistory, insertUpdateSupportHistory } = require("../../helper/logHistory");
const logger = require("../../utils/logger");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

const uploadFields = upload.fields([
  { name: "process_chart_file", maxCount: 1 },
]);

const createSupportReq = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Create support request initiated",
    route,
    method,
      });

  try {
    uploadFields(req, res, function (err) {
      if (err) {
        logger.error({
          message: "File upload error in createSupportReq",
          route,
          method,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "File upload failed." });
      }

      const support_data = req.body;
      const processChartFile = req.files["process_chart_file"] ? req.files["process_chart_file"][0] : null;

      logger.info({
        message: "File upload successful",
        route,
        method,
        emp_id: support_data.emp_id,
        emp_name: support_data.emp_name,
        process_name: support_data.process_name,
        hasProcessChart: !!processChartFile
      });

      // Cast numeric fields
      const manualEffort = parseFloat(support_data.manual_effort_hours) || 0;
      const manualExpenses = parseFloat(support_data.manual_expenses) || 0;

      logger.info({
        message: "Parsed numeric fields",
        route,
        method,
        emp_id: support_data.emp_id,
        manualEffort,
        manualExpenses
      });

      // INSERT query
      const sql = `INSERT INTO support_requests(
        emp_id, emp_name, process_name, process_description, process_chart_file,
        request_for, manual_effort_hours, manual_expenses,
        status, created_by, created_at, groupName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`;

      const values = [
        support_data.emp_id,
        support_data.emp_name,
        support_data.process_name,
        support_data.process_description,
        processChartFile ? processChartFile.originalname : null,
        support_data.request_for,
        manualEffort,
        manualExpenses,
        support_data.status || "Under Review",
        support_data.created_by,
        support_data.groupName,
      ];

      pool1.query(sql, values, async (insertErr, insertResult) => {
        if (insertErr) {
          logger.error({
            message: "Database insert error in createSupportReq",
            route,
            method,
            emp_id: support_data.emp_id,
            error: insertErr.message,
            stack: insertErr.stack
          });
          return res.status(500).json({ error: "Database insert failed." });
        }

        const supportRequestId = insertResult.insertId;
        
        logger.info({
          message: "Support request inserted successfully",
          route,
          method,
          supportRequestId,
          emp_id: support_data.emp_id,
          emp_name: support_data.emp_name
        });

        try {
          await insertSupportHistory(supportRequestId, support_data, processChartFile, 1);
          logger.info({
            message: "Support history inserted successfully",
            route,
            method,
            supportRequestId,
            emp_id: support_data.emp_id
          });
        } catch (historyErr) {
          logger.error({
            message: "Failed to insert into support history table",
            route,
            method,
            supportRequestId,
            emp_id: support_data.emp_id,
            error: historyErr.message,
            stack: historyErr.stack
          });
        }

        const io = req.app.get('io');

        if (io) {
          // Emit to all connected clients about new support request
          io.emit('automation-created', {
            type: 'automation',
            message: 'New automation request submitted',
            automationId: supportRequestId,
            process_name: support_data.process_name,
            emp_name: support_data.emp_name,
            emp_id: support_data.emp_id,
            createdAt: new Date().toISOString()
          });

          // Emit specific notification to the user who submitted
          io.to(`user_${support_data.emp_id}`).emit('user-notification', {
            type: 'automation',
            message: 'Your automation request was submitted successfully',
            automationId: supportRequestId,
            process_name: support_data.process_name,
            status: 'submitted'
          });

          // Join this automation room for future updates
          io.to(`automation_${supportRequestId}`).emit('automation-joined', {
            automationId: supportRequestId,
            message: 'automation room created'
          });

          logger.info({
            message: "Socket events emitted for new support request",
            route,
            method,
            supportRequestId,
            emp_id: support_data.emp_id
          });
        } else {
          logger.error({
            message: "Socket.io instance not available",
            route,
            method,
            supportRequestId,
            emp_id: support_data.emp_id
          });
        }

        // Fetch employee details
        pool1.query(
          `SELECT emp_id, emp_email, emp_name FROM master.emp WHERE emp_id = ?`,
          [support_data.emp_id],
          (selectErr, results) => {
            if (selectErr) {
              logger.error({
                message: "Employee details query error",
                route,
                method,
                supportRequestId,
                emp_id: support_data.emp_id,
                error: selectErr.message,
                stack: selectErr.stack
              });
              return res.status(500).json({ error: "Database query failed." });
            }

            if (!results || results.length === 0) {
              logger.error({
                message: "Employee not found",
                route,
                method,
                supportRequestId,
                emp_id: support_data.emp_id
              });
              return res.status(404).json({ error: "Employee not found." });
            }

            const { emp_email, emp_name } = results[0];
            
            logger.info({
              message: "Employee details fetched successfully",
              route,
              method,
              supportRequestId,
              emp_id: support_data.emp_id,
              emp_email,
              emp_name
            });

            // Send email
            supportCreationMail(emp_email, emp_name);

            logger.info({
              message: "Support request created successfully",
              route,
              method,
              supportRequestId,
              emp_id: support_data.emp_id,
              emp_name,
              process_name: support_data.process_name
            });

            return res.status(200).json({
              status: "Success",
              support_data: {
                support_request_id: supportRequestId,
                ...support_data,
                process_chart_file: processChartFile ? processChartFile.originalname : null,
                created_at: new Date().toISOString(),
              },
            });
          }
        );
      });
    });
  } catch (error) {
    logger.error({
      message: "Internal server error in createSupportReq",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Internal server error." });
  }
};

const viewuserSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { emp_id } = req.params;

  logger.info({
    message: "View user support requests",
    route,
    method,
    emp_id
  });

  if (!emp_id) {
    logger.error({
      message: "Employee ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ message: "Employee ID is required" });
  }

  const query = `
    SELECT 
      sr.*,
      spa.assign_to_name,
      spa.project_code
    FROM ahana_innovation_lab.support_requests sr
    LEFT JOIN ahana_innovation_lab.support_project_assigned spa
      ON sr.support_request_id = spa.support_request_id
    WHERE sr.emp_id = ?
    ORDER BY sr.created_at DESC;
  `;

  pool1.query(query, [emp_id], (error, result) => {
    if (error) {
      logger.error({
        message: "Database error in viewuserSupportReq",
        route,
        method,
        emp_id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({ message: "Unable to connect to database" });
    }

    logger.info({
      message: "User support requests fetched successfully",
      route,
      method,
      emp_id,
      requestCount: result.length
    });

    return res.status(200).json({ result });
  });
};


const editSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Edit support request initiated",
    route,
    method,
    
    files: req.files ? Object.keys(req.files) : []
  });

  try {
    uploadFields(req, res, (err) => {
      if (err) {
        logger.error({
          message: "File upload failed in editSupportReq",
          route,
          method,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "File upload failed" });
      }

      const updatedSupportReq = req.body;
      const newFile = req.files?.process_chart_file
        ? req.files.process_chart_file[0].originalname
        : null;

      logger.info({
        message: "File upload successful",
        route,
        method,
        support_request_id: updatedSupportReq.support_request_id,
        hasNewFile: !!newFile,
        newFileName: newFile
      });

      let sql, params;

      if (newFile) {
        // Case 1: new file uploaded → move old file to previous_file
        sql = `
          UPDATE ahana_innovation_lab.support_requests
          SET process_name = ?, process_description = ?, 
              previous_file = process_chart_file, 
              process_chart_file = ?, request_for = ?,
              manual_effort_hours = ?, manual_expenses = ?
          WHERE support_request_id = ?
        `;

        params = [
          updatedSupportReq.process_name,
          updatedSupportReq.process_description,
          newFile,
          updatedSupportReq.request_for,
          updatedSupportReq.manual_effort_hours,
          updatedSupportReq.manual_expenses,
          updatedSupportReq.support_request_id
        ];

        logger.info({
          message: "Executing update with file replacement",
          route,
          method,
          support_request_id: updatedSupportReq.support_request_id,
          newFile
        });
      } else {
        // Case 2: no new file → keep file columns as is
        sql = `
          UPDATE ahana_innovation_lab.support_requests
          SET process_name = ?, process_description = ?, 
              request_for = ?, manual_effort_hours = ?, manual_expenses = ?
          WHERE support_request_id = ?
        `;

        params = [
          updatedSupportReq.process_name,
          updatedSupportReq.process_description,
          updatedSupportReq.request_for,
          updatedSupportReq.manual_effort_hours,
          updatedSupportReq.manual_expenses,
          updatedSupportReq.support_request_id
        ];

        logger.info({
          message: "Executing update without file change",
          route,
          method,
          support_request_id: updatedSupportReq.support_request_id
        });
      }

      pool1.query(sql, params, (error, result) => {
        if (error) {
          logger.error({
            message: "Error updating support request",
            route,
            method,
            support_request_id: updatedSupportReq.support_request_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Error updating Automation Request" });
        }

        if (result.affectedRows === 0) {
          logger.error({
            message: "Support request not found for update",
            route,
            method,
            support_request_id: updatedSupportReq.support_request_id
          });
          return res.status(404).json({ error: "Support request not found" });
        }

        logger.info({
          message: "Support request updated successfully",
          route,
          method,
          support_request_id: updatedSupportReq.support_request_id,
          affectedRows: result.affectedRows
        });

        pool1.query(
          `SELECT MAX(version) AS maxVersion FROM ahana_innovation_lab.support_requests_history WHERE support_request_id = ?`,
          [updatedSupportReq.support_request_id],
          async (err, results) => {
            if (err) {
              logger.error({
                message: "Error fetching history version",
                route,
                method,
                support_request_id: updatedSupportReq.support_request_id,
                error: err.message,
                stack: err.stack
              });
              return res.status(500).json({ error: "Version check failed" });
            }

            const nextVersion = (results[0].maxVersion || 1) + 1;
            
            logger.info({
              message: "History version fetched",
              route,
              method,
              support_request_id: updatedSupportReq.support_request_id,
              currentVersion: results[0].maxVersion || 1,
              nextVersion
            });

            try {
              await insertUpdateSupportHistory(
                updatedSupportReq.support_request_id,
                updatedSupportReq,
                newFile,
                nextVersion
              );
              logger.info({
                message: "Update history inserted successfully",
                route,
                method,
                support_request_id: updatedSupportReq.support_request_id,
                version: nextVersion
              });
            } catch (historyErr) {
              logger.error({
                message: "Failed to insert update history",
                route,
                method,
                support_request_id: updatedSupportReq.support_request_id,
                error: historyErr.message,
                stack: historyErr.stack
              });
              // Continue even if history fails
            }

            const io = req.app.get('io');
            if (io) {
              try {
                // Emit to all clients that innovation was updated
                io.emit('automation-updated', {
                  type: 'automation',
                  message: 'automation request has been updated',
                  automationId: updatedSupportReq.support_request_id,
                  process_name: updatedSupportReq.process_name,
                  emp_name: updatedSupportReq.emp_name,
                  emp_id: updatedSupportReq.emp_id,
                  updatedAt: new Date().toISOString(),
                  action: 'updated'
                });

                // Emit specific notification to the user who updated
                io.to(`user_${updatedSupportReq.emp_id}`).emit('user-notification', {
                  type: 'automation',
                  message: 'Your automation idea was updated successfully',
                  automationId: updatedSupportReq.support_request_id,
                  process_name: updatedSupportReq.process_name,
                  status: 'updated'
                });

                // Emit to the specific automation room
                io.to(`automation_${updatedSupportReq.support_request_id}`).emit('automation-details-changed', {
                  automationId: updatedSupportReq.support_request_id,
                  updatedFields: Object.keys(updatedSupportReq),
                  updatedBy: updatedSupportReq.emp_id,
                  timestamp: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for updated support request",
                  route,
                  method,
                  support_request_id: updatedSupportReq.support_request_id,
                  emp_id: updatedSupportReq.emp_id
                });
              } catch (socketError) {
                logger.error({
                  message: "Socket emission error",
                  route,
                  method,
                  support_request_id: updatedSupportReq.support_request_id,
                  error: socketError.message,
                  stack: socketError.stack
                });
              }
            } else {
              logger.error({
                message: "Socket.io instance not available",
                route,
                method,
                support_request_id: updatedSupportReq.support_request_id
              });
            }

            logger.info({
              message: "Support request edit completed successfully",
              route,
              method,
              support_request_id: updatedSupportReq.support_request_id,
              affectedRows: result.affectedRows
            });

            res.json({
              message: "Automation Request updated successfully", 
              affectedRows: result.affectedRows
            });
          }
        );
      });
    });
  } catch (error) {
    logger.error({
      message: "Error in editSupportReq",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Error updating Automation Request" });
  }
};

const acceptSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Accept support request initiated",
    route,
    method,
    support_request_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!support_request_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for accept support request",
      route,
      method,
      support_request_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }

  try {
    await pool1.promise().query(
      `UPDATE support_requests SET status = "Accepted", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE support_request_id = ?`,
      [A2I_response_id, A2I_response_name, support_request_id]
    );

    logger.info({
      message: "Support request status updated to Accepted",
      route,
      method,
      support_request_id
    });

    const [supportData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
        [support_request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching support data for notification",
              route,
              method,
              support_request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Support data fetched for notification",
              route,
              method,
              support_request_id,
              process_name: results[0]?.process_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    const io = req.app.get('io');
    if (io && supportData) {
      const socketData = {
        type: 'support',
        support_request_id,
        process_name: supportData.process_name,
        emp_name: supportData.emp_name,
        emp_id: supportData.emp_id,
        status: 'Accepted',
        timestamp: new Date().toISOString()
      };

      io.emit('support-updated', socketData);
      io.to(`user_${supportData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your support request "${supportData.process_name}" has been accepted`
      });

      logger.info({
        message: "Socket events emitted for accept support request",
        route,
        method,
        support_request_id,
        emp_id: supportData.emp_id
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available",
        route,
        method,
        support_request_id
      });
    }

    logger.info({
      message: "Support request accepted successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in acceptSupportReq",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ status: "error", message: "Unable to connect" });
  }
};

const onholdSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "On hold support request initiated",
    route,
    method,
    support_request_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!support_request_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for on hold support request",
      route,
      method,
      support_request_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }

  try {
    await pool1.promise().query(
      `UPDATE support_requests SET status = "On Hold", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE support_request_id = ?`,
      [A2I_response_id, A2I_response_name, support_request_id]
    );

    logger.info({
      message: "Support request status updated to On Hold",
      route,
      method,
      support_request_id
    });

    const [supportData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
        [support_request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching support data for notification",
              route,
              method,
              support_request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Support data fetched for notification",
              route,
              method,
              support_request_id,
              process_name: results[0]?.process_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    const io = req.app.get('io');
    if (io && supportData) {
      const socketData = {
        type: 'support',
        support_request_id,
        process_name: supportData.process_name,
        emp_name: supportData.emp_name,
        emp_id: supportData.emp_id,
        status: 'On Hold',
        timestamp: new Date().toISOString()
      };

      io.emit('support-updated', socketData);
      io.to(`user_${supportData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your support request "${supportData.process_name}" is on hold`
      });

      logger.info({
        message: "Socket events emitted for on hold support request",
        route,
        method,
        support_request_id,
        emp_id: supportData.emp_id
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available",
        route,
        method,
        support_request_id
      });
    }

    logger.info({
      message: "Support request put on hold successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in onholdSupportReq",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ status: "error", message: "Unable to connect" });
  }
};

const rejectSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Reject support request initiated",
    route,
    method,
    support_request_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!support_request_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for reject support request",
      route,
      method,
      support_request_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }

  try {
    await pool1.promise().query(
      `UPDATE support_requests SET status = "Rejected", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE support_request_id = ?`,
      [A2I_response_id, A2I_response_name, support_request_id]
    );

    logger.info({
      message: "Support request status updated to Rejected",
      route,
      method,
      support_request_id
    });

    const [supportData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
        [support_request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching support data for notification",
              route,
              method,
              support_request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Support data fetched for notification",
              route,
              method,
              support_request_id,
              process_name: results[0]?.process_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    const io = req.app.get('io');
    if (io && supportData) {
      const socketData = {
        type: 'support',
        support_request_id,
        process_name: supportData.process_name,
        emp_name: supportData.emp_name,
        emp_id: supportData.emp_id,
        status: 'Rejected',
        timestamp: new Date().toISOString()
      };

      io.emit('support-updated', socketData);
      io.to(`user_${supportData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your support request "${supportData.process_name}" has been rejected`
      });

      logger.info({
        message: "Socket events emitted for reject support request",
        route,
        method,
        support_request_id,
        emp_id: supportData.emp_id
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available",
        route,
        method,
        support_request_id
      });
    }

    logger.info({
      message: "Support request rejected successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in rejectSupportReq",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ status: "error", message: "Unable to connect" });
  }
};

const inProgressSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "In progress support request initiated",
    route,
    method,
    support_request_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!support_request_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for in progress support request",
      route,
      method,
      support_request_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }

  try {
    await pool1.promise().query(
      `UPDATE support_requests SET status = "In Progress", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE support_request_id = ?`,
      [A2I_response_id, A2I_response_name, support_request_id]
    );

    logger.info({
      message: "Support request status updated to In Progress",
      route,
      method,
      support_request_id
    });

    const [supportData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
        [support_request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching support data for notification",
              route,
              method,
              support_request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Support data fetched for notification",
              route,
              method,
              support_request_id,
              process_name: results[0]?.process_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    const io = req.app.get('io');
    if (io && supportData) {
      const socketData = {
        type: 'support',
        support_request_id,
        process_name: supportData.process_name,
        emp_name: supportData.emp_name,
        emp_id: supportData.emp_id,
        status: 'In Progress',
        timestamp: new Date().toISOString()
      };

      io.emit('support-updated', socketData);
      io.to(`user_${supportData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your support request "${supportData.process_name}" is in progress`
      });

      logger.info({
        message: "Socket events emitted for in progress support request",
        route,
        method,
        support_request_id,
        emp_id: supportData.emp_id
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available",
        route,
        method,
        support_request_id
      });
    }

    logger.info({
      message: "Support request marked in progress successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in inProgressSupportReq",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ status: "error", message: "Unable to connect" });
  }
};

const completedSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Complete support request initiated",
    route,
    method,
    support_request_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!support_request_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for complete support request",
      route,
      method,
      support_request_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }

  try {
    await pool1.promise().query(
      `UPDATE support_requests SET status = "Completed", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE support_request_id = ?`,
      [A2I_response_id, A2I_response_name, support_request_id]
    );

    logger.info({
      message: "Support request status updated to Completed",
      route,
      method,
      support_request_id
    });

    const [supportData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
        [support_request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching support data for notification",
              route,
              method,
              support_request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Support data fetched for notification",
              route,
              method,
              support_request_id,
              process_name: results[0]?.process_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    const io = req.app.get('io');
    if (io && supportData) {
      const socketData = {
        type: 'support',
        support_request_id,
        process_name: supportData.process_name,
        emp_name: supportData.emp_name,
        emp_id: supportData.emp_id,
        status: 'Completed',
        timestamp: new Date().toISOString()
      };

      io.emit('support-updated', socketData);
      io.to(`user_${supportData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your support request "${supportData.process_name}" is completed`
      });

      logger.info({
        message: "Socket events emitted for complete support request",
        route,
        method,
        support_request_id,
        emp_id: supportData.emp_id
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available",
        route,
        method,
        support_request_id
      });
    }

    logger.info({
      message: "Support request completed successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in completedSupportReq",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ status: "error", message: "Unable to connect" });
  }
};

const viewallSupportReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "View all support requests initiated",
    route,
    method
  });

  pool1.query(
    `SELECT 
      sr.*,
      spa.spa_id,
      spa.project_owner_name,
      spa.project_code,
      spa.planned_start_date,
      spa.actual_start_date,
      spa.planned_end_date,
      spa.actual_end_date,
      spa.assign_by_name,
      spa.assign_to_name,
      spa.priority,
      spa.priority_code,
      spa.progress_percentage
    FROM support_requests sr
    LEFT JOIN support_project_assigned spa 
      ON sr.support_request_id = spa.support_request_id
    ORDER BY sr.created_at DESC;`,
    (error, result) => {
      if (error) {
        logger.error({
          message: "Error fetching all support requests",
          route,
          method,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).send(error);
      }

      logger.info({
        message: "All support requests fetched successfully",
        route,
        method,
        requestCount: result.length
      });

      return res.status(200).json({ result });
    }
  );
};

const addSupportRemark = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { reason, support_request_id, priority = null, reasonType = null } = req.body;

  logger.info({
    message: "Add support remark initiated",
    route,
    method,
    support_request_id,
    reason
  });

  if (!support_request_id || !reason) {
    logger.error({
      message: "Missing required fields for support remark",
      route,
      method,
      support_request_id,
      reason
    });
    return res.status(400).json({ status: "error", message: "support_request_id and reason are required" });
  }

  try {
    await pool1.promise().query(
      `UPDATE support_requests SET remarks = ?, request_priority = ? WHERE support_request_id = ?`,
      [reason, priority, support_request_id]
    );

    logger.info({
      message: "Support remark added successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error adding support remark",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ status: "error", message: "Unable to connect" });
  }
}

const getSupportHistory = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Get support history initiated",
    route,
    method
  });

  try {
    const query = `
      SELECT * 
      FROM support_requests_history h
      WHERE h.version < (
        SELECT MAX(version)
        FROM support_requests_history h2
        WHERE h2.support_request_id = h.support_request_id
      )
      ORDER BY h.created_at DESC;
    `;

    pool1.query(query, (error, result) => {
      if (error) {
        logger.error({
          message: "Error fetching support history",
          route,
          method,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).send("Unable to fetch history data");
      }

      logger.info({
        message: "Support history fetched successfully",
        route,
        method,
        historyCount: result.length
      });

      return res.status(200).json({ result });
    });
  } catch (error) {
    logger.error({
      message: "Server error in getSupportHistory",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteSupport = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.body;

  logger.info({
    message: "Delete support request initiated",
    route,
    method,
    support_request_id
  });

  if (!support_request_id) {
    logger.error({
      message: "Missing support_request_id in body",
      route,
      method,
          });
    return res.status(400).json({ message: "support_request_id is required" });
  }

  try {
    pool1.query(
      `SELECT support_request_id, process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
      [support_request_id],
      (selectErr, selectResults) => {
        if (selectErr) {
          logger.error({
            message: "Error fetching support details for deletion",
            route,
            method,
            support_request_id,
            error: selectErr.message,
            stack: selectErr.stack
          });
          return res.status(500).json({ message: "Failed to fetch support details", error: selectErr.message });
        }

        if (selectResults.length === 0) {
          logger.error({
            message: "No support request found for deletion",
            route,
            method,
            support_request_id
          });
          return res.status(404).json({ message: "No support request found with this support_request_id" });
        }

        const supportData = selectResults[0];
        
        logger.info({
          message: "Support details fetched for deletion",
          route,
          method,
          support_request_id,
          process_name: supportData.process_name,
          emp_id: supportData.emp_id
        });

        // Proceed with deletion
        pool1.query(
          `DELETE FROM support_requests_history WHERE support_request_id = ?`,
          [support_request_id],
          (err) => {
            if (err) {
              logger.error({
                message: "Error deleting support history",
                route,
                method,
                support_request_id,
                error: err.message,
                stack: err.stack
              });
              return res.status(500).json({ message: "Failed to delete history", error: err.message });
            }

            logger.info({
              message: "Support history deleted successfully",
              route,
              method,
              support_request_id
            });

            pool1.query(
              `DELETE FROM support_requests WHERE support_request_id = ?`,
              [support_request_id],
              (error, result) => {
                if (error) {
                  logger.error({
                    message: "Error deleting support request",
                    route,
                    method,
                    support_request_id,
                    error: error.message,
                    stack: error.stack
                  });
                  return res.status(500).json({ message: "Failed to delete Support", error: error.message });
                }

                if (result.affectedRows === 0) {
                  logger.error({
                    message: "No support record found for deletion",
                    route,
                    method,
                    support_request_id
                  });
                  return res.status(404).json({ message: "No record found with this support_request_id" });
                }

                logger.info({
                  message: "Support request deleted successfully",
                  route,
                  method,
                  support_request_id,
                  affectedRows: result.affectedRows
                });

                // ✅ SOCKET EMISSIONS FOR REAL-TIME DELETION NOTIFICATION
                const io = req.app.get('io');
                if (io) {
                  try {
                    // Emit to all clients that support was deleted
                    io.emit('support-deleted', {
                      type: 'support',
                      message: 'Support request has been deleted',
                      support_request_id: support_request_id,
                      process_name: supportData.process_name,
                      emp_name: supportData.emp_name,
                      emp_id: supportData.emp_id,
                      deletedAt: new Date().toISOString(),
                      action: 'deleted'
                    });

                    // Emit specific notification to the user who owned the support request
                    io.to(`user_${supportData.emp_id}`).emit('user-notification', {
                      type: 'support',
                      message: 'Your support request was deleted successfully',
                      support_request_id: support_request_id,
                      process_name: supportData.process_name,
                      status: 'deleted'
                    });

                    // Emit to the specific support room
                    io.to(`support_${support_request_id}`).emit('support-removed', {
                      support_request_id: support_request_id,
                      deletedBy: req.user?.emp_id || 'system',
                      timestamp: new Date().toISOString()
                    });

                    logger.info({
                      message: "Socket events emitted for deleted support",
                      route,
                      method,
                      support_request_id,
                      emp_id: supportData.emp_id
                    });
                  } catch (socketError) {
                    logger.error({
                      message: "Socket emission error during deletion",
                      route,
                      method,
                      support_request_id,
                      error: socketError.message,
                      stack: socketError.stack
                    });
                  }
                } else {
                  logger.error({
                    message: "Socket.io instance not available",
                    route,
                    method,
                    support_request_id
                  });
                }

                return res.status(200).json({
                  message: "Support request and related history deleted successfully",
                  support_request_id,
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    logger.error({
      message: "Unexpected error in deleteSupport",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const assignSupportProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Assign support project initiated",
    route,
    method,
      });

  try {
    const {
      support_request_id,
      assign_by_id,
      assign_by_name,
      assign_to_id,
      assign_to_name,
      priority,
      priority_code,
      planned_start_date,
      planned_end_date,
      number_of_days_required
    } = req.body;

    if (!support_request_id || !assign_to_id) {
      logger.error({
        message: "Missing required fields for support project assignment",
        route,
        method,
        support_request_id,
        assign_to_id
      });
      return res.status(400).json({ error: "support_request_id and assign_to_id are required" });
    }

    logger.info({
      message: "Support project assignment data validated",
      route,
      method,
      support_request_id,
      assign_by_id,
      assign_to_id,
      priority
    });

    const insertSql = `
      INSERT INTO support_project_assigned (
        support_request_id,
        assign_by_id,
        assign_by_name,
        assign_to_id,
        assign_to_name,
        priority,
        priority_code,
        planned_start_date,
        planned_end_date,
        number_of_days_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      support_request_id,
      assign_by_id,
      assign_by_name,
      assign_to_id,
      assign_to_name,
      priority,
      priority_code,
      planned_start_date,
      planned_end_date,
      number_of_days_required
    ];

    pool1.query(insertSql, insertValues, (insertErr, insertResult) => {
      if (insertErr) {
        logger.error({
          message: "Database insert error in assignSupportProject",
          route,
          method,
          support_request_id,
          assign_to_id,
          error: insertErr.message,
          stack: insertErr.stack
        });
        return res.status(500).json({ error: "Database insert failed." });
      }

      logger.info({
        message: "Support project inserted successfully",
        route,
        method,
        support_request_id,
        assign_to_id,
        insertId: insertResult.insertId
      });

      const updateSql = `
        UPDATE support_requests
        SET status = ?
        WHERE support_request_id = ?
      `;

      const updateValues = ["Assigned", support_request_id];

      pool1.query(updateSql, updateValues, (updateErr, updateResult) => {
        if (updateErr) {
          logger.error({
            message: "Status update error after support assignment",
            route,
            method,
            support_request_id,
            error: updateErr.message,
            stack: updateErr.stack
          });
          return res.status(500).json({ error: "Failed to update request status." });
        }

        logger.info({
          message: "Support request status updated to Assigned",
          route,
          method,
          support_request_id,
          affectedRows: updateResult.affectedRows
        });

        logger.info({
          message: "Support project assigned successfully",
          route,
          method,
          support_request_id,
          assign_to_id
        });

        return res.status(200).json({
          status: "Success",
          message: "Support project assigned and request status updated.",
          assigned_data: insertResult,
          updated_status: updateResult
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "API Error in assignSupportProject",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
}

const getMySupportProjects = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {
    const { emp_id } = req.params;

    logger.info({
      message: "Fetching my support projects",
      route,
      method,
      emp_id
    });

    if (!emp_id) {
      logger.error({
        message: "Employee ID missing in params",
        route,
        method,
        params: req.params
      });
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const sql = `
      SELECT
        spa.*,
        sr.support_request_id,
        sr.process_name,
        sr.status AS project_status,
        spa.uploaded_link,
        spa.uploaded_doc_path,
        spa.upload_type,
        spa.uploaded_at,
        spa.progress_percentage
      FROM support_project_assigned AS spa
      LEFT JOIN support_requests AS sr
      ON spa.support_request_id = sr.support_request_id
      WHERE spa.assign_to_id = ?
      ORDER BY spa.created_at DESC`;
    const values = [emp_id];

    pool1.query(sql, values, (error, result) => {
      if (error) {
        logger.error({
          message: "Database query error in getMySupportProjects",
          route,
          method,
          emp_id,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).json({ error: "Database query failed." });
      }

      logger.info({
        message: "Support projects fetched successfully",
        route,
        method,
        emp_id,
        projectCount: result.length
      });

      // Process results with upload data
      const formattedResult = result.map(project => {
        // Parse uploaded_doc_path if it's JSON
        let fileData = [];

        if (project.uploaded_doc_path) {
          try {
            const parsed = JSON.parse(project.uploaded_doc_path);

            if (Array.isArray(parsed)) {
              fileData = parsed.map(file => ({
                originalName: file.originalName || file.originalname || 'Unknown',
                storedName: file.storedName || file.filename,
                size: file.size,
                mimetype: file.mimetype,
                url: `/uploads/project-docs/${file.storedName || file.filename}`
              }));
            } else if (typeof parsed === 'object') {
              fileData = [{
                originalName: parsed.originalName || parsed.originalname || 'Unknown',
                storedName: parsed.storedName || parsed.filename,
                size: parsed.size,
                mimetype: parsed.mimetype,
                url: `/uploads/project-docs/${parsed.storedName || parsed.filename}`
              }];
            }
          } catch (e) {
            logger.error({
              message: "Error parsing uploaded_doc_path JSON",
              route,
              method,
              emp_id,
              spa_id: project.spa_id,
              error: e.message
            });
            
            if (typeof project.uploaded_doc_path === 'string') {
              fileData = [{
                originalName: project.uploaded_doc_path,
                storedName: project.uploaded_doc_path,
                url: `/uploads/project-docs/${project.uploaded_doc_path}`
              }];
            }
          }
        }

        return {
          spa_id: project.spa_id,
          support_request_id: project.support_request_id,
          process_name: project.process_name,
          project_status: project.project_status,
          assign_by_name: project.assign_by_name,
          priority: project.priority,
          priority_code: project.priority_code,
          planned_start_date: project.planned_start_date,
          actual_start_date: project.actual_start_date,
          planned_end_date: project.planned_end_date,
          actual_end_date: project.actual_end_date,
          project_owner_id: project.project_owner_id,
          project_owner_name: project.project_owner_name,
          project_code: project.project_code,
          project_approver_id: project.project_approver_id,
          project_approver_name: project.project_approver_name,
          progress_percentage: project.progress_percentage,
          uploaded_link: project.uploaded_link,
          uploaded_files: fileData,
          upload_type: project.upload_type,
          uploaded_at: project.uploaded_at,
          teams: []
        };
      });

      logger.info({
        message: "Support projects formatted successfully",
        route,
        method,
        emp_id,
        formattedCount: formattedResult.length
      });

      return res.status(200).json({
        status: "Success",
        data: formattedResult
      });
    });
  } catch (error) {
    logger.error({
      message: "API Error in getMySupportProjects",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
}

const manageSupportProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Manage support project team initiated",
    route,
    method,
      });

  const { spa_id, teams_data } = req.body;

  if (!spa_id) {
    logger.error({ message: "Project ID (spa_id) missing", route, method, });
    return res.status(400).json({ success: false, message: "Project ID (spa_id) is required" });
  }

  if (!Array.isArray(teams_data) || teams_data.length === 0) {
    logger.error({ message: "Teams data missing or invalid", route, method, spa_id, teams_data });
    return res.status(400).json({ success: false, message: "Teams data is required" });
  }

  let processedCount = 0;

  teams_data.forEach(team => {
    const checkSql = `SELECT * FROM support_project_team WHERE spa_id = ? AND role_name = ? AND team_lead_id = ?`;

    pool1.query(checkSql, [spa_id, team.role_name, team.team_lead_id], (err, result) => {
      if (err) {
        logger.error({ message: "Check query failed", route, method, spa_id, team, error: err.message });
        return res.status(500).json({ success: false, message: "Database error", error: err.message });
      }

      const finish = () => {
        processedCount++;
        if (processedCount === teams_data.length) {
          logger.info({ message: "Teams processed successfully", route, method, spa_id });
          res.status(200).json({ success: true, message: "Teams processed successfully" });
        }
      };

      if (result.length > 0) {
        // Merge existing members
        const existing = result[0];

        const mergedIds = [
          ...new Set([
            ...(JSON.parse(existing.team_member_id || "[]")),
            ...(team.team_members?.map(m => m.id) || [])
          ])
        ];

        const mergedNames = [
          ...new Set([
            ...(JSON.parse(existing.team_member_name || "[]")),
            ...(team.team_members?.map(m => m.name) || [])
          ])
        ];

        pool1.query(
          `UPDATE support_project_team 
           SET team_member_id = ?, team_member_name = ? 
           WHERE team_id = ?`,
          [JSON.stringify(mergedIds), JSON.stringify(mergedNames), existing.team_id],
          (updateErr) => {
            if (updateErr) {
              logger.error({ message: "Update failed", route, method, spa_id, team, error: updateErr.message });
              return res.status(500).json({ success: false, message: "Database error in update", error: updateErr.message });
            }
            logger.info({ message: "Team updated successfully", route, method, spa_id, team_lead_id: team.team_lead_id });
            finish();
          }
        );

      } else {
        // Insert new team
        pool1.query(
          `INSERT INTO support_project_team 
           (spa_id, role_id, role_name, team_lead_id, team_lead_name, team_member_id, team_member_name) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            spa_id,
            team.role_id || null,
            team.role_name,
            team.team_lead_id,
            team.team_lead_name,
            JSON.stringify(team.team_members?.map(m => m.id) || []),
            JSON.stringify(team.team_members?.map(m => m.name) || [])
          ],
          (insertErr) => {
            if (insertErr) {
              logger.error({ message: "Insert failed", route, method, spa_id, team, error: insertErr.message });
              return res.status(500).json({ success: false, message: "Database error in insert", error: insertErr.message });
            }
            logger.info({ message: "Team inserted successfully", route, method, spa_id, team_lead_id: team.team_lead_id });
            finish();
          }
        );
      }
    });
  });
};

const getAllMyProjectTeams = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { emp_id } = req.params;

  logger.info({
    message: "Fetching all my support project teams",
    route,
    method,
    emp_id
  });

  if (!emp_id) {
    logger.error({
      message: "Employee ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ 
      success: false, 
      message: "Employee ID is required" 
    });
  }

  const sql = `
    SELECT t.*, p.assign_to_id
    FROM support_project_team t
    JOIN support_project_assigned p
      ON t.spa_id = p.spa_id
    WHERE p.assign_to_id = ?
  `;

  pool1.query(sql, [emp_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching support project teams",
        route,
        method,
        emp_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ 
        success: false, 
        message: "Database error",
        error: err.message 
      });
    }

    logger.info({
      message: "Support project teams fetched successfully",
      route,
      method,
      emp_id,
      teamCount: result.length
    });

    return res.status(200).json({ 
      success: true, 
      data: result 
    });
  });
};

const getProjectTeamDetails = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;

  logger.info({
    message: "Fetching support project team details",
    route,
    method,
    support_request_id
  });

  if (!support_request_id) {
    logger.error({
      message: "Support Request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Support Request ID missing" });
  }

  const sql = `
    SELECT 
      spt.*,
      spa.assign_to_id,
      spa.assign_to_name,
      spa.planned_start_date,
      spa.planned_end_date,
      spa.actual_start_date,
      spa.actual_end_date
    FROM support_project_assigned spa
    LEFT JOIN support_project_team spt ON spt.spa_id = spa.spa_id
    WHERE spa.support_request_id = ?
  `;

  pool1.query(sql, [support_request_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching support project teams",
        route,
        method,
        support_request_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ success: false, message: "Database error" });
    }

    logger.info({
      message: "Support project team details fetched successfully",
      route,
      method,
      support_request_id,
      teamCount: result.length
    });

    return res.status(200).json({ success: true, data: result });
  });
};

const editSupportProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { team_id } = req.params;
  const { role_id, role_name, team_lead_id, team_lead_name, team_member_id, team_member_name } = req.body;

  logger.info({
    message: "Editing support project team",
    route,
    method,
    team_id,
      });

  if (!team_id) {
    logger.error({
      message: "Team ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Team ID is required" });
  }

  // Parse JSON strings back to arrays for the query
  let teamMemberIdArray, teamMemberNameArray;
  
  try {
    teamMemberIdArray = typeof team_member_id === 'string' ? JSON.parse(team_member_id) : team_member_id;
    teamMemberNameArray = typeof team_member_name === 'string' ? JSON.parse(team_member_name) : team_member_name;
    
    logger.info({
      message: "Team member data parsed successfully",
      route,
      method,
      team_id,
      memberCount: teamMemberIdArray?.length || 0
    });
  } catch (parseErr) {
    logger.error({
      message: "Error parsing team member JSON data",
      route,
      method,
      team_id,
      error: parseErr.message,
      stack: parseErr.stack
    });
    return res.status(400).json({ success: false, message: "Invalid team member data format" });
  }

  pool1.query(
    `UPDATE support_project_team 
     SET role_id = ?, role_name = ?, team_lead_id = ?, team_lead_name = ?, 
         team_member_id = ?, team_member_name = ?
     WHERE team_id = ?`,
    [
      role_id,
      role_name,
      team_lead_id,
      team_lead_name,
      JSON.stringify(teamMemberIdArray),
      JSON.stringify(teamMemberNameArray),
      team_id
    ],
    (err, result) => {
      if (err) {
        logger.error({
          message: "Error updating support project team",
          route,
          method,
          team_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ success: false, message: "Database error" });
      }

      if (result.affectedRows === 0) {
        logger.error({
          message: "Support team not found for update",
          route,
          method,
          team_id
        });
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      logger.info({
        message: "Support project team updated successfully",
        route,
        method,
        team_id,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ success: true, message: "Team updated successfully" });
    }
  );
};

const deleteSupportProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { team_id } = req.params;

  logger.info({
    message: "Deleting support project team",
    route,
    method,
    team_id
  });

  if (!team_id) {
    logger.error({
      message: "Team ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Team ID is required" });
  }

  pool1.query(
    `DELETE FROM support_project_team WHERE team_id = ?`,
    [team_id],
    (err, result) => {
      if (err) {
        logger.error({
          message: "Error deleting support project team",
          route,
          method,
          team_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ success: false, message: "Database error" });
      }

      if (result.affectedRows === 0) {
        logger.error({
          message: "Support team not found for deletion",
          route,
          method,
          team_id
        });
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      logger.info({
        message: "Support project team deleted successfully",
        route,
        method,
        team_id,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ success: true, message: "Team deleted successfully" });
    }
  );
};

const approveSupportProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id, emp_id, emp_name } = req.body;

  logger.info({
    message: "Approving support project",
    route,
    method,
    support_request_id,
    emp_id,
    emp_name
  });

  if (!support_request_id || !emp_id || !emp_name) {
    logger.error({
      message: "Missing required fields for support project approval",
      route,
      method,
      support_request_id,
      emp_id,
      emp_name
    });
    return res.status(400).json({ 
      msg: "support_request_id, emp_id, and emp_name are required" 
    });
  }

  try {
    // 1) Update support_requests table
    pool1.query(
      `UPDATE support_requests 
       SET status = ?
       WHERE support_request_id = ?`,
      ["Approved", support_request_id],
      (err, result) => {
        if (err) {
          logger.error({
            message: "Error updating support_requests status",
            route,
            method,
            support_request_id,
            error: err.message,
            stack: err.stack
          });
          return res.status(500).json({ msg: "Internal server error" });
        }

        if (result.affectedRows === 0) {
          logger.error({
            message: "Support request not found for approval",
            route,
            method,
            support_request_id
          });
          return res.status(404).json({ msg: "Request not found" });
        }

        logger.info({
          message: "Support request status updated to Approved",
          route,
          method,
          support_request_id
        });

        // 2) Now update support_project_assigned table
        pool1.query(
          `UPDATE support_project_assigned
           SET project_approver_id = ?,
               project_approver_name = ?
           WHERE support_request_id = ?`,
          [emp_id, emp_name, support_request_id],
          (err2, result2) => {
            if (err2) {
              logger.error({
                message: "Error updating support project approver",
                route,
                method,
                support_request_id,
                error: err2.message,
                stack: err2.stack
              });
              return res.status(500).json({ msg: "Internal server error while updating assigned project" });
            }

            logger.info({
              message: "Support project approver updated successfully",
              route,
              method,
              support_request_id,
              emp_id,
              affectedRows: result2.affectedRows
            });

            return res.status(200).json({
              msg: "Support project approved and approver updated successfully"
            });
          }
        );
      }
    );
  } catch (error) {
    logger.error({
      message: "Unexpected error in approveSupportProject",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};
const startProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { actual_start_date } = req.body;

  logger.info({
    message: "Starting support project",
    route,
    method,
    support_request_id,
    actual_start_date
  });

  if (!support_request_id) {
    logger.error({
      message: "Support request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ msg: "Support request ID is required" });
  }

  if (!actual_start_date) {
    logger.error({
      message: "Actual start date missing in body",
      route,
      method,
      support_request_id,
          });
    return res.status(400).json({ msg: "Actual start date is required" });
  }

  try {
    const updateRequestSql = `
      UPDATE support_requests 
      SET status = "In Progress" 
      WHERE support_request_id = ?
    `;

    const updateAssignedSql = `
      UPDATE support_project_assigned
      SET actual_start_date = ?
      WHERE support_request_id = ?
    `;

    pool1.query(updateRequestSql, [support_request_id], (err, result1) => {
      if (err) {
        logger.error({
          message: "Error updating support request status to In Progress",
          route,
          method,
          support_request_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ msg: "Internal server error" });
      }

      if (result1.affectedRows === 0) {
        logger.error({
          message: "Support request not found for starting project",
          route,
          method,
          support_request_id
        });
        return res.status(404).json({ msg: "Request not found" });
      }

      logger.info({
        message: "Support request status updated to In Progress",
        route,
        method,
        support_request_id,
        affectedRows: result1.affectedRows
      });

      // Execute Query 2
      pool1.query(updateAssignedSql, [actual_start_date, support_request_id], (err2, result2) => {
        if (err2) {
          logger.error({
            message: "Error updating support project start date",
            route,
            method,
            support_request_id,
            actual_start_date,
            error: err2.message,
            stack: err2.stack
          });
          return res.status(500).json({ msg: "Failed to update project start date" });
        }

        logger.info({
          message: "Support project started successfully",
          route,
          method,
          support_request_id,
          actual_start_date,
          status: "In Progress",
          rowsUpdated: result2.affectedRows
        });

        return res.status(200).json({
          msg: "Support project started successfully",
          status: "In Progress",
          date_updated: true,
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "Unexpected error in startProject",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const endProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;

  logger.info({
    message: "Ending support project",
    route,
    method,
    support_request_id
  });

  if (!support_request_id) {
    logger.error({
      message: "Support request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ msg: "Support request ID is required" });
  }

  try {
    const updateRequestSql = `
      UPDATE support_requests 
      SET status = "Completed" 
      WHERE support_request_id = ?
    `;

    const updateAssignedSql = `
      UPDATE support_project_assigned
      SET actual_end_date = CURDATE()
      WHERE support_request_id = ?
    `;

    pool1.query(updateRequestSql, [support_request_id], (err, result1) => {
      if (err) {
        logger.error({
          message: "Error updating support request status to Completed",
          route,
          method,
          support_request_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ msg: "Internal server error" });
      }

      if (result1.affectedRows === 0) {
        logger.error({
          message: "Support request not found for ending project",
          route,
          method,
          support_request_id
        });
        return res.status(404).json({ msg: "Request not found" });
      }

      logger.info({
        message: "Support request status updated to Completed",
        route,
        method,
        support_request_id,
        affectedRows: result1.affectedRows
      });

      // Execute Query 2
      pool1.query(updateAssignedSql, [support_request_id], (err2, result2) => {
        if (err2) {
          logger.error({
            message: "Error updating support project end date",
            route,
            method,
            support_request_id,
            error: err2.message,
            stack: err2.stack
          });
          return res.status(500).json({ msg: "Failed to update project end date" });
        }

        logger.info({
          message: "Support project ended successfully",
          route,
          method,
          support_request_id,
          status: "Completed",
          rowsUpdated: result2.affectedRows
        });

        return res.status(200).json({
          msg: "Support project completed successfully",
          status: "Completed",
          date_updated: true,
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "Unexpected error in endProject",
      route,
      method,
      support_request_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const getProjectDetails = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;

  logger.info({
    message: "Fetching support project details",
    route,
    method,
    support_request_id
  });

  if (!support_request_id) {
    logger.error({
      message: "Support Request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Support Request ID missing" });
  }

  const sql = `
  SELECT 
    spa.*, 
    sr.process_name, 
    sr.process_description, 
    sr.status as project_status, 
    sr.emp_id as request_emp_id, 
    sr.emp_name as request_emp_name,
    spt.role_name, 
    spt.team_lead_id, 
    spt.team_lead_name, 
    spt.team_member_id, 
    spt.team_member_name, 
    spt.created_at as team_created_at,
    -- Fetch latest note details
    (SELECT message FROM request_notes 
     WHERE request_id = sr.support_request_id AND request_type = 'Support' 
     ORDER BY created_at DESC LIMIT 1) as latest_note_message,
    (SELECT created_at FROM request_notes 
     WHERE request_id = sr.support_request_id AND request_type = 'Support' 
     ORDER BY created_at DESC LIMIT 1) as latest_note_date,
    (SELECT emp_name FROM request_notes 
     WHERE request_id = sr.support_request_id AND request_type = 'Support' 
     ORDER BY created_at DESC LIMIT 1) as latest_note_sender
  FROM support_project_assigned spa
  LEFT JOIN support_requests sr ON spa.support_request_id = sr.support_request_id
  LEFT JOIN support_project_team spt ON spt.spa_id = spa.spa_id
  WHERE spa.support_request_id = ?
  ORDER BY spt.created_at ASC`;

  pool1.query(sql, [support_request_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching support project details",
        route,
        method,
        support_request_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (result.length === 0) {
      logger.info({
        message: "Support project not found",
        route,
        method,
        support_request_id
      });
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    logger.info({
      message: "Support project details fetched successfully",
      route,
      method,
      support_request_id,
      rowCount: result.length,
      hasTeams: result.some(row => row.role_name !== null)
    });

    // Process the data to group teams properly
    const projectData = processProjectData(result);
    
    logger.info({
      message: "Support project data processed successfully",
      route,
      method,
      support_request_id
    });

    return res.status(200).json({ success: true, data: projectData });
  });
};

const processProjectData = (rawData) => {
  const functionName = "processProjectData";
  
  logger.info({
    message: "Processing support project data",
    function: functionName,
    dataLength: rawData?.length || 0
  });

  if (!rawData || rawData.length === 0) {
    logger.info({
      message: "No raw data to process",
      function: functionName
    });
    return null;
  }

  const firstRow = rawData[0];

  // Parse uploaded_doc_path for file data
  let uploadedFiles = [];

  if (firstRow.uploaded_doc_path) {
    try {
      const parsed = JSON.parse(firstRow.uploaded_doc_path);

      if (Array.isArray(parsed)) {
        uploadedFiles = parsed.map(file => ({
          originalName: file.originalName || file.originalname || 'Unknown',
          storedName: file.storedName || file.filename,
          size: file.size,
          mimetype: file.mimetype,
          url: `/uploads/${file.storedName || file.filename}`
        }));
        
        logger.info({
          message: "Parsed uploaded files array",
          function: functionName,
          fileCount: uploadedFiles.length
        });
      } else if (typeof parsed === 'object') {
        uploadedFiles = [{
          originalName: parsed.originalName || parsed.originalname || 'Unknown',
          storedName: parsed.storedName || parsed.filename,
          size: parsed.size,
          mimetype: parsed.mimetype,
          url: `/uploads/${parsed.storedName || parsed.filename}`
        }];
        
        logger.info({
          message: "Parsed single uploaded file",
          function: functionName,
          fileName: uploadedFiles[0]?.originalName
        });
      }
    } catch (e) {
      logger.error({
        message: "Error parsing uploaded_doc_path JSON",
        function: functionName,
        support_request_id: firstRow.support_request_id,
        error: e.message,
        stack: e.stack
      });
      
      if (typeof firstRow.uploaded_doc_path === 'string') {
        uploadedFiles = [{
          originalName: firstRow.uploaded_doc_path,
          storedName: firstRow.uploaded_doc_path,
          url: `/uploads/${firstRow.uploaded_doc_path}`
        }];
        
        logger.info({
          message: "Using legacy filename format",
          function: functionName,
          fileName: firstRow.uploaded_doc_path
        });
      }
    }
  }

  // Extract project basic info
  const projectInfo = {
    spa_id: firstRow.spa_id,
    support_request_id: firstRow.support_request_id,
    process_name: firstRow.process_name,
    process_description: firstRow.process_description,
    project_status: firstRow.project_status,
    assign_by_id: firstRow.assign_by_id,
    assign_by_name: firstRow.assign_by_name,
    assign_to_id: firstRow.assign_to_id,
    assign_to_name: firstRow.assign_to_name,
    priority: firstRow.priority,
    priority_code: firstRow.priority_code,
    planned_start_date: firstRow.planned_start_date,
    actual_start_date: firstRow.actual_start_date,
    planned_end_date: firstRow.planned_end_date,
    actual_end_date: firstRow.actual_end_date,
    number_of_days_required: firstRow.number_of_days_required,
    created_at: firstRow.created_at,
    updated_at: firstRow.updated_at,
    request_emp_id: firstRow.request_emp_id,
    request_emp_name: firstRow.request_emp_name,
    project_approver_id: firstRow.project_approver_id,
    project_approver_name: firstRow.project_approver_name,
    project_code: firstRow.project_code,
    latest_note: {
      message: firstRow.latest_note_message || null,
      sender: firstRow.latest_note_sender || null,
      date: firstRow.latest_note_date || null
    },
    uploaded_link: firstRow.uploaded_link,
    uploaded_files: uploadedFiles,
    upload_type: firstRow.upload_type,
    uploaded_at: firstRow.uploaded_at
  };

  // Process teams data
  const teams = [];
  const teamMap = new Map();

  rawData.forEach((row, index) => {
    if (row.role_name && row.team_lead_id) {
      if (!teamMap.has(row.role_name)) {

        let teamMemberIds = [];
        try {
          teamMemberIds = row.team_member_id
            ? (typeof row.team_member_id === "string"
              ? JSON.parse(row.team_member_id)
              : row.team_member_id)
            : [];
        } catch (e) {
          logger.error({
            message: "Error parsing team_member_id",
            function: functionName,
            support_request_id: firstRow.support_request_id,
            role: row.role_name,
            error: e.message
          });
        }

        let teamMemberNames = [];
        try {
          teamMemberNames = row.team_member_name
            ? (typeof row.team_member_name === "string"
              ? JSON.parse(row.team_member_name)
              : row.team_member_name)
            : [];
        } catch (e) {
          logger.error({
            message: "Error parsing team_member_name",
            function: functionName,
            support_request_id: firstRow.support_request_id,
            role: row.role_name,
            error: e.message
          });
        }

        const teamMembers = teamMemberIds.map((id, idx) => ({
          id,
          name: teamMemberNames[idx] || "Unknown"
        }));

        const team = {
          role_id: row.role_id,
          role_name: row.role_name,
          team_lead_id: row.team_lead_id,
          team_lead_name: row.team_lead_name,
          team_members: teamMembers,
          team_member_ids: teamMemberIds,
          team_member_names: teamMemberNames,
          created_at: row.team_created_at
        };

        teamMap.set(row.role_name, team);
        teams.push(team);
      }
    }
  });

  logger.info({
    message: "Support project data processing complete",
    function: functionName,
    support_request_id: firstRow.support_request_id,
    teamCount: teams.length,
    hasUploadedFiles: uploadedFiles.length > 0
  });

  return {
    ...projectInfo,
    teams
  };
};

const setProjectOwnerAndCode = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Set support project owner and code initiated",
    route,
    method,
      });

  try {
    const { support_request_id, project_code } = req.body;

    if (!support_request_id || !project_code) {
      logger.error({
        message: "Missing required fields for support project",
        route,
        method,
        support_request_id,
        project_code
      });
      return res.status(400).json({ 
        error: "support_request_id and project_code are required" 
      });
    }

    logger.info({
      message: "Updating support project code",
      route,
      method,
      support_request_id,
      project_code
    });

    const sql = `UPDATE support_project_assigned
                 SET project_code = ?
                 WHERE support_request_id = ?`;
    const values = [project_code, support_request_id];
    
    pool1.query(sql, values, (error, result) => {
      if (error) {
        logger.error({
          message: "Database query error in setProjectOwnerAndCode",
          route,
          method,
          support_request_id,
          project_code,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).json({ error: "Database query failed." });
      }

      if (result.affectedRows === 0) {
        logger.error({
          message: "Support project not found for code update",
          route,
          method,
          support_request_id,
          project_code
        });
        return res.status(404).json({ error: "Project not found" });
      }

      logger.info({
        message: "Support project code set successfully",
        route,
        method,
        support_request_id,
        project_code,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ 
        status: "Success", 
        data: result 
      });
    });
  } catch (error) {
    logger.error({
      message: "API Error in setProjectOwnerAndCode",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
}

const mergeProcess = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id, A2I_response_id, A2I_response_name, emp_name, process_name } = req.body;

  logger.info({
    message: "Merge support process initiated",
    route,
    method,
    support_request_id,
    A2I_response_id,
    A2I_response_name,
    emp_name,
    process_name
  });

  if (!support_request_id || !A2I_response_id || !A2I_response_name || !emp_name || !process_name) {
    logger.error({
      message: "Missing required fields for merge support process",
      route,
      method,
      support_request_id,
      A2I_response_id,
      A2I_response_name,
      emp_name,
      process_name
    });
    return res.status(400).json({ 
      success: false, 
      message: "All fields are required" 
    });
  }

  try {
    const [result] = await pool1.promise().query(
      `UPDATE support_requests SET status = "Merged", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW(), process_merge_emp = ?, process_merge_name = ? WHERE support_request_id = ?`,
      [A2I_response_id, A2I_response_name, emp_name, process_name, support_request_id]
    );

    logger.info({
      message: "Support process merged successfully",
      route,
      method,
      support_request_id,
      A2I_response_id,
      affectedRows: result.affectedRows
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in mergeProcess for support",
      route,
      method,
      support_request_id,
      A2I_response_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
}

const updateSupportProgressPercentage = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { progress, spa_id } = req.body;

  logger.info({
    message: "Update support progress percentage initiated",
    route,
    method,
    spa_id,
    progress
  });

  if (!spa_id || progress === undefined || progress === null) {
    logger.error({
      message: "Missing required fields for support progress update",
      route,
      method,
      spa_id,
      progress
    });
    return res.status(400).json({ 
      success: false, 
      message: "spa_id and progress are required" 
    });
  }

  if (isNaN(progress) || progress < 0 || progress > 100) {
    logger.error({
      message: "Invalid progress value for support",
      route,
      method,
      spa_id,
      progress
    });
    return res.status(400).json({ 
      success: false, 
      message: "Progress must be a number between 0 and 100" 
    });
  }

  try {
    const [result] = await pool1.promise().query(
      `UPDATE support_project_assigned SET progress_percentage = ? WHERE spa_id = ?`,
      [progress, spa_id]
    );

    if (result.affectedRows === 0) {
      logger.error({
        message: "Support project not found for progress update",
        route,
        method,
        spa_id
      });
      return res.status(404).json({ 
        success: false, 
        message: "Project not found" 
      });
    }

    logger.info({
      message: "Support progress updated successfully",
      route,
      method,
      spa_id,
      progress,
      affectedRows: result.affectedRows
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in updateSupportProgressPercentage",
      route,
      method,
      spa_id,
      progress,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
}

// Update support request status
const updateSupportStatus = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { support_request_id } = req.params;
  const { status, A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Update support status initiated",
    route,
    method,
    support_request_id,
    status,
    A2I_response_id,
    A2I_response_name
  });

  if (!support_request_id || !status) {
    logger.error({
      message: "Missing required fields for support status update",
      route,
      method,
      support_request_id,
      status
    });
    return res.status(400).json({
      status: "error",
      message: "support_request_id and status are required"
    });
  }

  try {
    // Update the status column
    const [result] = await pool1.promise().query(
      `UPDATE support_requests SET status = ?, A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE support_request_id = ?`,
      [status, A2I_response_id, A2I_response_name, support_request_id]
    );

    if (result.affectedRows === 0) {
      logger.error({
        message: "Support request not found for status update",
        route,
        method,
        support_request_id
      });
      return res.status(404).json({
        status: "error",
        message: "Request not found"
      });
    }

    logger.info({
      message: "Support status updated in database",
      route,
      method,
      support_request_id,
      status,
      affectedRows: result.affectedRows
    });

    // Get request details for notification
    const [supportData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM support_requests WHERE support_request_id = ?`,
        [support_request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching support data for notification",
              route,
              method,
              support_request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Support data fetched for notification",
              route,
              method,
              support_request_id,
              process_name: results[0]?.process_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    // Socket emissions for real-time updates
    const io = req.app.get('io');
    if (io && supportData) {
      const socketData = {
        type: 'support',
        support_request_id,
        process_name: supportData.process_name,
        emp_name: supportData.emp_name,
        emp_id: supportData.emp_id,
        status: status,
        timestamp: new Date().toISOString()
      };

      // Emit to all connected clients
      io.emit('support-updated', socketData);

      // Emit specific notification to the request owner
      io.to(`user_${supportData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your support request "${supportData.process_name}" status updated to: ${status}`
      });

      // Emit to admin/A2I group rooms
      io.to('admin_room').emit('admin-notification', {
        ...socketData,
        message: `Support request "${supportData.process_name}" status updated to: ${status}`
      });

      logger.info({
        message: "Socket events emitted for support status update",
        route,
        method,
        support_request_id,
        status
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available for support",
        route,
        method,
        support_request_id
      });
    }

    logger.info({
      message: "Support status updated successfully",
      route,
      method,
      support_request_id,
      status
    });

    return res.status(200).json({
      status: "success",
      message: `Status updated to ${status}`
    });
  } catch (error) {
    logger.error({
      message: "Error updating support status",
      route,
      method,
      support_request_id,
      status,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      status: "error",
      message: "Unable to update status"
    });
  }
};

module.exports = {
  createSupportReq,
  viewuserSupportReq,
  editSupportReq,
  acceptSupportReq,
  onholdSupportReq,
  rejectSupportReq,
  inProgressSupportReq,
  completedSupportReq,
  viewallSupportReq,
  addSupportRemark,
  getSupportHistory,
  deleteSupport,
  assignSupportProject,
  getMySupportProjects,
  manageSupportProjectTeam,
  getAllMyProjectTeams,
  getProjectTeamDetails,
  editSupportProjectTeam,
  deleteSupportProjectTeam,
  approveSupportProject,
  startProject,
  endProject,
  getProjectDetails,
  setProjectOwnerAndCode,
  mergeProcess,
  updateSupportProgressPercentage,
  updateSupportStatus
};