const { pool, pool1 } = require("../../dbConfig/connect");
const { innovationsUpdatemail } = require("../../emailConfig/mailConfig");
const {insertInnovationHistory, insertUpdateInnovationHistory} = require("../../helper/logHistory");

const multer = require("multer");
const logger = require("../../utils/logger");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

const uploadFields = upload.fields([
  { name: "upload_path", maxCount: 1 },
]);

const CreateInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Create innovation initiated",
    route,
    method,
    body: req.body,
    files: req.files ? Object.keys(req.files) : []
  });

  try {
    uploadFields(req, res, function (err) {
      if (err) {
        logger.error({
          message: "Artefacts data upload error in CreateInnovation",
          route,
          method,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "Artefacts data upload failed." });
      }

      const innovation_data = req.body;
      const upload_path = req.files["upload_path"]
        ? req.files["upload_path"][0]
        : null;

      // Insert innovation data into the database
      const insertQuery = `
        INSERT INTO innovationtask_details(
          emp_id, emp_name, idea_name, idea_description, market, target_audience,
          tried_before, reference_links, upload_path, join_implementation_team, created_by, group_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertValues = [
        innovation_data.emp_id,
        innovation_data.emp_name,
        innovation_data.idea_name,
        innovation_data.idea_description,
        innovation_data.market,
        innovation_data.target_audience,
        innovation_data.tried_before,
        innovation_data.reference_links || null,
        upload_path ? upload_path.originalname : null,
        innovation_data.join_implementation_team,
        innovation_data.emp_id,
        innovation_data.groupName,
      ];

      pool1.query(insertQuery, insertValues, async (error, result) => {
        if (error) {
          logger.error({
            message: "Database insert error in CreateInnovation",
            route,
            method,
            emp_id: innovation_data.emp_id,
            idea_name: innovation_data.idea_name,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database insert failed." });
        }

        const newInnovationId = result.insertId;

        try {
          await insertInnovationHistory(newInnovationId, innovation_data, upload_path, 1);
          logger.info({
            message: "Innovation history inserted successfully",
            route,
            method,
            newInnovationId,
            emp_id: innovation_data.emp_id
          });
        } catch (historyErr) {
          logger.error({
            message: "Failed to insert into innovation history table",
            route,
            method,
            newInnovationId,
            emp_id: innovation_data.emp_id,
            error: historyErr.message,
            stack: historyErr.stack
          });
        }
        
        // Get io instance from app
        const io = req.app.get('io');
        
        // Emit socket event for real-time notification
        if (io) {
          try {
            // Emit to all connected clients about new innovation
            io.emit('innovation-created', {
              type: 'innovation',
              message: 'New innovation idea submitted',
              innovationId: newInnovationId,
              idea_name: innovation_data.idea_name,
              emp_name: innovation_data.emp_name,
              emp_id: innovation_data.emp_id,
              groupName: innovation_data.groupName,
              createdAt: new Date().toISOString()
            });

            // Emit specific notification to the user who submitted
            io.to(`user_${innovation_data.emp_id}`).emit('user-notification', {
              type: 'innovation',
              innovationId: newInnovationId,
              idea_name: innovation_data.idea_name,
              status: 'submitted'
            });

            // Join this innovation room for future updates
            io.to(`innovation_${newInnovationId}`).emit('innovation-joined', {
              innovationId: newInnovationId,
              message: 'Innovation room created'
            });

          } catch (socketErr) {
            logger.error({
              message: "Socket emission error",
              route,
              method,
              newInnovationId,
              error: socketErr.message,
              stack: socketErr.stack
            });
          }
        } else {
          logger.error({
            message: "Socket.io instance not available",
            route,
            method,
            newInnovationId
          });
        }

        // Now fetch employee details
        pool1.query(
          `SELECT emp_id, emp_email, emp_name FROM master.emp WHERE emp_id = ?`,
          [innovation_data.emp_id],
          (error, results) => {
            if (error) {
              logger.error({
                message: "Employee details query error",
                route,
                method,
                newInnovationId,
                emp_id: innovation_data.emp_id,
                error: error.message,
                stack: error.stack
              });
              return res.status(500).json({ error: "Database query failed." });
            }

            if (!results || results.length === 0) {
              logger.error({
                message: "Employee details not found in master emp table",
                route,
                method,
                newInnovationId,
                emp_id: innovation_data.emp_id
              });
              return res
                .status(404)
                .json({ error: "Employee details not found." });
            }

            const emp_email = results[0].emp_email;
            const emp_name = results[0].emp_name;

            logger.info({
              message: "Employee details fetched successfully",
              route,
              method,
              newInnovationId,
              emp_id: innovation_data.emp_id,
              emp_email,
              emp_name
            });

            // Send email
            innovationsUpdatemail(emp_email, emp_name);

            logger.info({
              message: "Innovation created successfully",
              route,
              method,
              newInnovationId,
              emp_id: innovation_data.emp_id,
              idea_name: innovation_data.idea_name
            });

            // Send final response
            return res.status(200).json({
              status: "Success",
              innovation_data: {
                Innovation_id: newInnovationId, // Include the ID in response
                ...innovation_data,
                upload_path: upload_path ? upload_path.originalname : null,
                created_at: new Date().toISOString(),
              },
            });
          }
        );
      });
    });
  } catch (error) {
    logger.error({
      message: "Error in CreateInnovation",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Internal server error." });
  }
};

const getallEmployess = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Fetching all active employees",
    route,
    method
  });

  pool.query(
      `select emp_id, emp_name from master.emp where flag="Active"`,
      (error, result) => {
        if (error) {
          logger.error({
            message: "Error fetching active employees",
            route,
            method,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).send("Unable to connect");
        }

        logger.info({
          message: "Active employees fetched successfully",
          route,
          method,
          employeeCount: result.length
        });

        return res.status(200).json({ result });
      }
    );
  };

const viewuserInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { emp_id } = req.params;

  logger.info({
    message: "View user innovations initiated",
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
      itd.*,
      ipa.assign_to_name,
      ipa.project_code
    FROM ahana_innovation_lab.innovationtask_details itd
    LEFT JOIN ahana_innovation_lab.innovation_project_assigned ipa
      ON itd.Innovation_id = ipa.Innovation_id
    WHERE itd.emp_id = ?
    ORDER BY itd.created_at DESC;
  `;

  pool1.query(query, [emp_id], (error, result) => {
    if (error) {
      logger.error({
        message: "Database error in viewuserInnovation",
        route,
        method,
        emp_id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({ message: "Unable to connect to database" });
    }

    logger.info({
      message: "User innovations fetched successfully",
      route,
      method,
      emp_id,
      innovationCount: result.length
    });

    return res.status(200).json({ result });
  });
};

const accpetInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Accept innovation initiated",
    route,
    method,
    Innovation_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!Innovation_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for accept innovation",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ error: "Innovation_id, A2I_response_id, and A2I_response_name are required" });
  }

  try {
    // Use callback pattern instead of await
    pool1.query(
      `SELECT emp_id, emp_name, idea_name FROM innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      (error, innovationResults) => {
        if (error) {
          logger.error({
            message: "Database query error in accept innovation",
            route,
            method,
            Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database query failed" });
        }

        if (!innovationResults || innovationResults.length === 0) {
          logger.error({
            message: "Innovation not found for accept",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        const innovation = innovationResults[0];
        const innovationOwnerEmpId = innovation.emp_id;
        const ideaName = innovation.idea_name;

        // Use callback for update query too
        pool1.query(
          `UPDATE innovationtask_details SET status = "Accepted", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE Innovation_id = ?`,
          [A2I_response_id, A2I_response_name, Innovation_id],
          (updateError, result) => {
            if (updateError) {
              logger.error({
                message: "Database update error in accept innovation",
                route,
                method,
                Innovation_id,
                error: updateError.message,
                stack: updateError.stack
              });
              return res.status(500).json({ error: "Error updating innovation: " + updateError.message });
            }


            // SOCKET.IO INTEGRATION - Emit real-time status update
            try {
              const io = req.app.get('io');
              if (io) {
                logger.info({
                  message: "Emitting socket events for innovation acceptance",
                  route,
                  method,
                  Innovation_id
                });

                // Emit to all connected clients about status change
                io.emit('innovation-status-updated', {
                  type: 'innovation',
                  innovationId: Innovation_id,
                  idea_name: ideaName,
                  previousStatus: 'Under Review',
                  newStatus: 'Accepted',
                  updatedBy: A2I_response_name,
                  updatedByEmpId: A2I_response_id,
                  innovationOwner: innovation.emp_name,
                  innovationOwnerEmpId: innovationOwnerEmpId,
                  updatedAt: new Date().toISOString()
                });

                // Emit specific notification to the innovation owner
                io.to(`user_${innovationOwnerEmpId}`).emit('user-notification', {
                  type: 'innovation-status',
                  innovationId: Innovation_id,
                  status: 'Accepted',
                  updatedBy: A2I_response_name
                });

                // Emit to the specific innovation room for detailed updates
                io.to(`innovation_${Innovation_id}`).emit('innovation-status-changed', {
                  innovationId: Innovation_id,
                  status: 'Accepted',
                  updatedBy: A2I_response_name,
                  updatedAt: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for innovation acceptance",
                  route,
                  method,
                  Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation acceptance",
                  route,
                  method,
                  Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in accept innovation",
                route,
                method,
                Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            return res.json({
              status: "success",
              innovationId: Innovation_id
            });
          }
        );
      }
    );

  } catch (error) {
    logger.error({
      message: "Error in acceptInnovation",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Unable to connect" });
  }
};


const declinInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;
  
  logger.info({
    message: "Decline innovation initiated",
    route,
    method,
    Innovation_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!Innovation_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for decline innovation",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ error: "Innovation_id, A2I_response_id, and A2I_response_name are required" });
  }

  try {
    // Use callback pattern instead of await
    pool1.query(
      `SELECT emp_id, emp_name, idea_name FROM innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      (error, innovationResults) => {
        if (error) {
          logger.error({
            message: "Database query error in decline innovation",
            route,
            method,
            Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database query failed" });
        }

        
        if (!innovationResults || innovationResults.length === 0) {
          logger.error({
            message: "Innovation not found for decline",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        const innovation = innovationResults[0];
        const innovationOwnerEmpId = innovation.emp_id;
        const ideaName = innovation.idea_name;

        // Use callback for update query too
        pool1.query(
          `UPDATE innovationtask_details SET status = "Declined", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE Innovation_id = ?`,
          [A2I_response_id, A2I_response_name, Innovation_id],
          (updateError, result) => {
            if (updateError) {
              logger.error({
                message: "Database update error in decline innovation",
                route,
                method,
                Innovation_id,
                error: updateError.message,
                stack: updateError.stack
              });
              return res.status(500).json({ error: "Error updating innovation: " + updateError.message });
            }

            logger.info({
              message: "Innovation declined successfully",
              route,
              method,
              Innovation_id,
              affectedRows: result.affectedRows
            });

            // SOCKET.IO INTEGRATION - Emit real-time status update
            try {
              const io = req.app.get('io');
              if (io) {
  

                // Emit to all connected clients about status change
                io.emit('innovation-status-updated', {
                  type: 'innovation',
                  innovationId: Innovation_id,
                  idea_name: ideaName,
                  previousStatus: 'Under Review',
                  newStatus: 'Declined',
                  updatedBy: A2I_response_name,
                  updatedByEmpId: A2I_response_id,
                  innovationOwner: innovation.emp_name,
                  innovationOwnerEmpId: innovationOwnerEmpId,
                  updatedAt: new Date().toISOString()
                });

                // Emit specific notification to the innovation owner
                io.to(`user_${innovationOwnerEmpId}`).emit('user-notification', {
                  type: 'innovation-status',
                  innovationId: Innovation_id,
                  status: 'Declined',
                  updatedBy: A2I_response_name
                });

                // Emit to the specific innovation room for detailed updates
                io.to(`innovation_${Innovation_id}`).emit('innovation-status-changed', {
                  innovationId: Innovation_id,
                  status: 'Declined',
                  updatedBy: A2I_response_name,
                  updatedAt: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for innovation decline",
                  route,
                  method,
                  Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation decline",
                  route,
                  method,
                  Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in decline innovation",
                route,
                method,
                Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            return res.json({ 
              status: "success",
              innovationId: Innovation_id
            });
          }
        );
      }
    );
    
  } catch (error) {
    logger.error({
      message: "Error in declinInnovation",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Unable to connect" });
  }
};

const onholdInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;
  
  logger.info({
    message: "On hold innovation initiated",
    route,
    method,
    Innovation_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!Innovation_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for on hold innovation",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ error: "Innovation_id, A2I_response_id, and A2I_response_name are required" });
  }

  try {
    // Use callback pattern instead of await
    pool1.query(
      `SELECT emp_id, emp_name, idea_name FROM innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      (error, innovationResults) => {
        if (error) {
          logger.error({
            message: "Database query error in on hold innovation",
            route,
            method,
            Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database query failed" });
        }

        
        if (!innovationResults || innovationResults.length === 0) {
          logger.error({
            message: "Innovation not found for on hold",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        const innovation = innovationResults[0];
        const innovationOwnerEmpId = innovation.emp_id;
        const ideaName = innovation.idea_name;

        logger.info({
          message: "Innovation details fetched for on hold",
          route,
          method,
          Innovation_id,
          ideaName,
          innovationOwnerEmpId
        });

        // Use callback for update query too
        pool1.query(
          `UPDATE innovationtask_details SET status = "On Hold", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE Innovation_id = ?`,
          [A2I_response_id, A2I_response_name, Innovation_id],
          (updateError, result) => {
            if (updateError) {
              logger.error({
                message: "Database update error in on hold innovation",
                route,
                method,
                Innovation_id,
                error: updateError.message,
                stack: updateError.stack
              });
              return res.status(500).json({ error: "Error updating innovation: " + updateError.message });
            }

            logger.info({
              message: "Innovation put on hold successfully",
              route,
              method,
              Innovation_id,
              affectedRows: result.affectedRows
            });

            // SOCKET.IO INTEGRATION - Emit real-time status update
            try {
              const io = req.app.get('io');
              if (io) {
                logger.info({
                  message: "Emitting socket events for innovation on hold",
                  route,
                  method,
                  Innovation_id
                });

                // Emit to all connected clients about status change
                io.emit('innovation-status-updated', {
                  type: 'innovation',
                  innovationId: Innovation_id,
                  idea_name: ideaName,
                  previousStatus: 'Under Review',
                  newStatus: 'On Hold',
                  updatedBy: A2I_response_name,
                  updatedByEmpId: A2I_response_id,
                  innovationOwner: innovation.emp_name,
                  innovationOwnerEmpId: innovationOwnerEmpId,
                  updatedAt: new Date().toISOString()
                });

                // Emit specific notification to the innovation owner
                io.to(`user_${innovationOwnerEmpId}`).emit('user-notification', {
                  type: 'innovation-status',
                  innovationId: Innovation_id,
                  status: 'On Hold',
                  updatedBy: A2I_response_name
                });

                // Emit to the specific innovation room for detailed updates
                io.to(`innovation_${Innovation_id}`).emit('innovation-status-changed', {
                  innovationId: Innovation_id,
                  status: 'On Hold',
                  updatedBy: A2I_response_name,
                  updatedAt: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for innovation on hold",
                  route,
                  method,
                  Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation on hold",
                  route,
                  method,
                  Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in on hold innovation",
                route,
                method,
                Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            return res.json({ 
              status: "success",
              innovationId: Innovation_id
            });
          }
        );
      }
    );
    
  } catch (error) {
    logger.error({
      message: "Error in onholdInnovation",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Unable to connect" });
  }
};

const inProgressInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;
  
  logger.info({
    message: "In progress innovation initiated",
    route,
    method,
    Innovation_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!Innovation_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for in progress innovation",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ error: "Innovation_id, A2I_response_id, and A2I_response_name are required" });
  }

  try {
    // Use callback pattern instead of await
    pool1.query(
      `SELECT emp_id, emp_name, idea_name FROM innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      (error, innovationResults) => {
        if (error) {
          logger.error({
            message: "Database query error in in progress innovation",
            route,
            method,
            Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database query failed" });
        }

        
        if (!innovationResults || innovationResults.length === 0) {
          logger.error({
            message: "Innovation not found for in progress",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        const innovation = innovationResults[0];
        const innovationOwnerEmpId = innovation.emp_id;
        const ideaName = innovation.idea_name;

        logger.info({
          message: "Innovation details fetched for in progress",
          route,
          method,
          Innovation_id,
          ideaName,
          innovationOwnerEmpId
        });

        // Use callback for update query too
        pool1.query(
          `UPDATE innovationtask_details SET status = "InProgress", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE Innovation_id = ?`,
          [A2I_response_id, A2I_response_name, Innovation_id],
          (updateError, result) => {
            if (updateError) {
              logger.error({
                message: "Database update error in in progress innovation",
                route,
                method,
                Innovation_id,
                error: updateError.message,
                stack: updateError.stack
              });
              return res.status(500).json({ error: "Error updating innovation: " + updateError.message });
            }

            logger.info({
              message: "Innovation moved to in progress successfully",
              route,
              method,
              Innovation_id,
              affectedRows: result.affectedRows
            });

            // SOCKET.IO INTEGRATION - Emit real-time status update
            try {
              const io = req.app.get('io');
              if (io) {
                logger.info({
                  message: "Emitting socket events for innovation in progress",
                  route,
                  method,
                  Innovation_id
                });

                // Emit to all connected clients about status change
                io.emit('innovation-status-updated', {
                  type: 'innovation',
                  innovationId: Innovation_id,
                  idea_name: ideaName,
                  previousStatus: 'Accepted',
                  newStatus: 'InProgress',
                  updatedBy: A2I_response_name,
                  updatedByEmpId: A2I_response_id,
                  innovationOwner: innovation.emp_name,
                  innovationOwnerEmpId: innovationOwnerEmpId,
                  updatedAt: new Date().toISOString()
                });

                // Emit specific notification to the innovation owner
                io.to(`user_${innovationOwnerEmpId}`).emit('user-notification', {
                  type: 'innovation-status',
                  innovationId: Innovation_id,
                  status: 'InProgress',
                  updatedBy: A2I_response_name
                });

                // Emit to the specific innovation room for detailed updates
                io.to(`innovation_${Innovation_id}`).emit('innovation-status-changed', {
                  innovationId: Innovation_id,
                  status: 'InProgress',
                  updatedBy: A2I_response_name,
                  updatedAt: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for innovation in progress",
                  route,
                  method,
                  Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation in progress",
                  route,
                  method,
                  Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in in progress innovation",
                route,
                method,
                Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            return res.json({ 
              status: "success",
              innovationId: Innovation_id
            });
          }
        );
      }
    );
    
  } catch (error) {
    logger.error({
      message: "Error in inProgressInnovation",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Unable to connect" });
  }
};

const completedInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;
  
  logger.info({
    message: "Complete innovation initiated",
    route,
    method,
    Innovation_id,
    A2I_response_id,
    A2I_response_name
  });

  if (!Innovation_id || !A2I_response_id || !A2I_response_name) {
    logger.error({
      message: "Missing required fields for complete innovation",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      A2I_response_name
    });
    return res.status(400).json({ error: "Innovation_id, A2I_response_id, and A2I_response_name are required" });
  }

  try {
    // Use callback pattern instead of await
    pool1.query(
      `SELECT emp_id, emp_name, idea_name FROM innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      (error, innovationResults) => {
        if (error) {
          logger.error({
            message: "Database query error in complete innovation",
            route,
            method,
            Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database query failed" });
        }

        
        if (!innovationResults || innovationResults.length === 0) {
          logger.error({
            message: "Innovation not found for complete",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        const innovation = innovationResults[0];
        const innovationOwnerEmpId = innovation.emp_id;
        const ideaName = innovation.idea_name;

        logger.info({
          message: "Innovation details fetched for complete",
          route,
          method,
          Innovation_id,
          ideaName,
          innovationOwnerEmpId
        });

        // Use callback for update query too
        pool1.query(
          `UPDATE innovationtask_details SET status = "Completed", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE Innovation_id = ?`,
          [A2I_response_id, A2I_response_name, Innovation_id],
          (updateError, result) => {
            if (updateError) {
              logger.error({
                message: "Database update error in complete innovation",
                route,
                method,
                Innovation_id,
                error: updateError.message,
                stack: updateError.stack
              });
              return res.status(500).json({ error: "Error updating innovation: " + updateError.message });
            }

            logger.info({
              message: "Innovation completed successfully",
              route,
              method,
              Innovation_id,
              affectedRows: result.affectedRows
            });

            // SOCKET.IO INTEGRATION - Emit real-time status update
            try {
              const io = req.app.get('io');
              if (io) {
                logger.info({
                  message: "Emitting socket events for innovation completion",
                  route,
                  method,
                  Innovation_id
                });

                // Emit to all connected clients about status change
                io.emit('innovation-status-updated', {
                  type: 'innovation',
                  innovationId: Innovation_id,
                  idea_name: ideaName,
                  previousStatus: 'InProgress',
                  newStatus: 'Completed',
                  updatedBy: A2I_response_name,
                  updatedByEmpId: A2I_response_id,
                  innovationOwner: innovation.emp_name,
                  innovationOwnerEmpId: innovationOwnerEmpId,
                  updatedAt: new Date().toISOString()
                });

                // Emit specific notification to the innovation owner
                io.to(`user_${innovationOwnerEmpId}`).emit('user-notification', {
                  type: 'innovation-status',
                  innovationId: Innovation_id,
                  status: 'Completed',
                  updatedBy: A2I_response_name
                });

                // Emit to the specific innovation room for detailed updates
                io.to(`innovation_${Innovation_id}`).emit('innovation-status-changed', {
                  innovationId: Innovation_id,
                  status: 'Completed',
                  updatedBy: A2I_response_name,
                  updatedAt: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for innovation completion",
                  route,
                  method,
                  Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation completion",
                  route,
                  method,
                  Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in complete innovation",
                route,
                method,
                Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            return res.json({ 
              status: "success",
              innovationId: Innovation_id
            });
          }
        );
      }
    );
    
  } catch (error) {
    logger.error({
      message: "Error in completedInnovation",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Unable to connect" });
  }
};

const viewallInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "View all innovations initiated",
    route,
    method
  });

  pool1.query(
    `SELECT 
    id.*,
    ipa.ipa_id,
    ipa.project_owner_name,
    ipa.project_code,
    ipa.planned_start_date,
    ipa.actual_start_date,
    ipa.planned_end_date,
    ipa.actual_end_date,
    ipa.assign_by_name,
    ipa.priority,
    ipa.priority_code,
    ipa.progress_percentage
    FROM ahana_innovation_lab.innovationtask_details id
    LEFT JOIN ahana_innovation_lab.innovation_project_assigned ipa 
    ON id.Innovation_id = ipa.Innovation_id
    ORDER BY id.created_at DESC;`,
    (error, result) => {
      if (error) {
        logger.error({
          message: "Error fetching all innovations",
          route,
          method,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).send(error);
      }

      logger.info({
        message: "All innovations fetched successfully",
        route,
        method,
        innovationCount: result.length
      });

      return res.status(200).json({ result });
    }
  );
};

const getinnovationCount = (req, res) => {
  pool1.query(
    `SELECT COUNT(*) AS Accepted FROM ahana_innovation_lab.innovationtask_details WHERE status = "Accepted"`,
    (err, acceptedCount) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong while retrieving Accepted count",
        });
      }

      pool1.query(
        `SELECT COUNT(*) AS Declined FROM ahana_innovation_lab.innovationtask_details WHERE STATUS = "Declined"`,
        (err, declinedCount) => {
          if (err) {
            console.error(err);
            return res.status(500).json({
              error: "Something went wrong while retrieving Declined count",
            });
          }

          pool1.query(
            `SELECT COUNT(*) AS Pending FROM ahana_innovation_lab.innovationtask_details WHERE STATUS = "Pending"`,
            (err, pendingCount) => {
              if (err) {
                console.error(err);
                return res.status(500).json({
                  error: "Something went wrong while retrieving Pending count",
                });
              }

              res.status(200).json({
                Accepted: acceptedCount[0].Accepted,
                Declined: declinedCount[0].Declined,
                Pending: pendingCount[0].Pending,
              });
            }
          );
        }
      );
    }
  );
};

const viewApprovedInnovation = async (req, res) => {
  pool1.query(
    `SELECT Innovation_id,emp_id,emp_name, Describe_idea_technology, idea_caters, customer_target, market_size, groupName, created_at,
    Competitors, artefacts_data, shelflife_product, status, costingsheet_budget_data FROM ahana_innovation_lab.innovationtask_details
    WHERE status = "Accepted" ORDER BY created_at DESC;`,
    (error, result) => {
      if (error) {
        return res.send("Unable to connect").status(500);
      }
      return res.json({ result }).status(200);
    }
  );
};

const editInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Edit innovation initiated",
    route,
    method,
    body: req.body,
    files: req.files ? Object.keys(req.files) : []
  });

  try {
    uploadFields(req, res, (err) => {
      if (err) {
        logger.error({
          message: "File upload error in editInnovation",
          route,
          method,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "File upload failed" });
      }

      const updatedInnovation = req.body;
      
      logger.info({
        message: "File upload successful",
        route,
        method,
        Innovation_id: updatedInnovation.Innovation_id,
        idea_name: updatedInnovation.idea_name,
        emp_id: updatedInnovation.emp_id
      });

      // If a new file is uploaded
      const newFile = req.files?.upload_path ? req.files.upload_path[0].originalname : null;
      
      logger.info({
        message: "File upload status",
        route,
        method,
        Innovation_id: updatedInnovation.Innovation_id,
        hasNewFile: !!newFile,
        newFileName: newFile
      });

      // Use MySQL compatible datetime format
      const mysqlTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

      let sql, params;

      if (newFile) {
        // Move old file to previous_upload_path column and save new file in upload_path
        sql = `
          UPDATE ahana_innovation_lab.innovationtask_details
          SET idea_name = ?, idea_description = ?, market = ?, target_audience = ?,
              tried_before = ?, reference_links = ?, previous_upload_path = upload_path, 
              upload_path = ?, join_implementation_team = ?, updated_at = ?
          WHERE Innovation_id = ?
        `;

        params = [
          updatedInnovation.idea_name,
          updatedInnovation.idea_description,
          updatedInnovation.market,
          updatedInnovation.target_audience,
          updatedInnovation.tried_before,
          updatedInnovation.reference_links,
          newFile, // new file replaces upload_path
          updatedInnovation.join_implementation_team,
          mysqlTimestamp, 
          updatedInnovation.Innovation_id
        ];

        logger.info({
          message: "Executing update with file replacement",
          route,
          method,
          Innovation_id: updatedInnovation.Innovation_id,
          newFile
        });
      } else {
        // No new file uploaded → keep old upload_path as is
        sql = `
          UPDATE ahana_innovation_lab.innovationtask_details
          SET idea_name = ?, idea_description = ?, market = ?, target_audience = ?,
              tried_before = ?, reference_links = ?, join_implementation_team = ?, updated_at = ?
          WHERE Innovation_id = ?
        `;

        params = [
          updatedInnovation.idea_name,
          updatedInnovation.idea_description,
          updatedInnovation.market,
          updatedInnovation.target_audience,
          updatedInnovation.tried_before,
          updatedInnovation.reference_links,
          updatedInnovation.join_implementation_team,
          mysqlTimestamp, 
          updatedInnovation.Innovation_id
        ];

        logger.info({
          message: "Executing update without file change",
          route,
          method,
          Innovation_id: updatedInnovation.Innovation_id
        });
      }

      pool1.query(sql, params, (error, result) => {
        if (error) {
          logger.error({
            message: "Error updating innovation",
            route,
            method,
            Innovation_id: updatedInnovation.Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Error updating innovation: " + error.message });
        }

        if (result.affectedRows === 0) {
          logger.error({
            message: "Innovation not found for update",
            route,
            method,
            Innovation_id: updatedInnovation.Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        logger.info({
          message: "Innovation updated successfully",
          route,
          method,
          Innovation_id: updatedInnovation.Innovation_id,
          affectedRows: result.affectedRows
        });

        pool1.query(
          `SELECT MAX(version) AS maxVersion FROM ahana_innovation_lab.innovationtask_history WHERE Innovation_id = ?`,
          [updatedInnovation.Innovation_id],
          async (err, results) => {
            if (err) {
              logger.error({
                message: "Error fetching history version",
                route,
                method,
                Innovation_id: updatedInnovation.Innovation_id,
                error: err.message,
                stack: err.stack
              });
              // Don't return here, continue with response
            }

            const nextVersion = (results && results[0]?.maxVersion ? results[0].maxVersion : 0) + 1;
            
            logger.info({
              message: "Next history version",
              route,
              method,
              Innovation_id: updatedInnovation.Innovation_id,
              nextVersion
            });

            try {
              await insertUpdateInnovationHistory(
                updatedInnovation.Innovation_id,
                updatedInnovation,
                newFile,
                nextVersion
              );
              
              logger.info({
                message: "Innovation history inserted successfully",
                route,
                method,
                Innovation_id: updatedInnovation.Innovation_id,
                version: nextVersion
              });
            } catch (historyErr) {
              logger.error({
                message: "Failed to insert update history",
                route,
                method,
                Innovation_id: updatedInnovation.Innovation_id,
                error: historyErr.message,
                stack: historyErr.stack
              });
              // Continue even if history fails
            }

            // SOCKET.IO INTEGRATION - Emit real-time update event
            try {
              const io = req.app.get('io');
              if (io) {
                logger.info({
                  message: "Emitting socket events for innovation update",
                  route,
                  method,
                  Innovation_id: updatedInnovation.Innovation_id
                });
                
                // Emit to all connected clients
                io.emit('innovation-updated', {
                  type: 'innovation',
                  message: 'Innovation idea has been updated',
                  innovationId: updatedInnovation.Innovation_id,
                  idea_name: updatedInnovation.idea_name,
                  emp_id: updatedInnovation.emp_id,
                  emp_name: updatedInnovation.emp_name,
                  updatedAt: new Date().toISOString(),
                  action: 'updated'
                });

                // Emit specific notification to the user
                io.to(`user_${updatedInnovation.emp_id}`).emit('user-notification', {
                  type: 'innovation',
                  innovationId: updatedInnovation.Innovation_id,
                  idea_name: updatedInnovation.idea_name
                });

                logger.info({
                  message: "Socket events emitted successfully",
                  route,
                  method,
                  Innovation_id: updatedInnovation.Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation update",
                  route,
                  method,
                  Innovation_id: updatedInnovation.Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in editInnovation",
                route,
                method,
                Innovation_id: updatedInnovation.Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            res.json({
              message: "Innovation updated successfully",
              affectedRows: result.affectedRows,
              innovationId: updatedInnovation.Innovation_id
            });
          }
        );
      });
    });
  } catch (error) {
    logger.error({
      message: "Top-level error in editInnovation",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
};


const addInnovationRemark = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { reason, Innovation_id, priority = null, reasonType = null } = req.body;

  logger.info({
    message: "Add innovation remark initiated",
    route,
    method,
    Innovation_id,
    reason
  });

  if (!Innovation_id || !reason) {
    logger.error({
      message: "Missing required fields for innovation remark",
      route,
      method,
      Innovation_id,
      reason
    });
    return res.status(400).json({ error: "Innovation_id and reason are required" });
  }

  if (reasonType === "Accept" && !priority) {
    logger.error({
      message: "Priority is required for accept action",
      route,
      method,
      Innovation_id,
      reason,
      priority
    });
    return res.status(400).json({ error: "Priority is required for accept action" });
  }

  try {
    // Use callback pattern for mysql package
    pool1.query(
      `SELECT emp_id, emp_name, idea_name, status FROM innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      async (error, innovationResults) => {
        if (error) {
          logger.error({
            message: "Database query failed in addInnovationRemark",
            route,
            method,
            Innovation_id,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: "Database query failed" });
        }

        
        if (!innovationResults || innovationResults.length === 0) {
          logger.error({
            message: "Innovation not found for remark",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ error: "Innovation not found" });
        }

        const innovation = innovationResults[0];
        const innovationOwnerEmpId = innovation.emp_id;
        const ideaName = innovation.idea_name;
        const currentStatus = innovation.status;

        logger.info({
          message: "Innovation details fetched for remark",
          route,
          method,
          Innovation_id,
          ideaName,
          innovationOwnerEmpId,
          currentStatus
        });

        // Update the innovation remarks
        pool1.query(
          `UPDATE innovationtask_details SET remarks = ?, request_priority = ? WHERE Innovation_id = ?`,
          [reason, priority, Innovation_id],
          async (updateError, updateResult) => {
            if (updateError) {
              logger.error({
                message: "Failed to update remarks",
                route,
                method,
                Innovation_id,
                error: updateError.message,
                stack: updateError.stack
              });
              return res.status(500).json({ error: "Failed to update remarks" });
            }

            logger.info({
              message: "Remark added successfully",
              route,
              method,
              Innovation_id,
              affectedRows: updateResult.affectedRows
            });

            // SOCKET.IO INTEGRATION - Emit real-time remark update
            try {
              const io = req.app.get('io');
              if (io) {
                logger.info({
                  message: "Emitting socket events for innovation remark",
                  route,
                  method,
                  Innovation_id
                });

                // Emit to all connected clients about remark addition
                io.emit('innovation-remark-added', {
                  type: 'innovation',
                  message: 'New remark added to innovation',
                  innovationId: Innovation_id,
                  idea_name: ideaName,
                  remark: reason,
                  status: currentStatus,
                  innovationOwner: innovation.emp_name,
                  innovationOwnerEmpId: innovationOwnerEmpId,
                  updatedAt: new Date().toISOString()
                });

                // Emit specific notification to the innovation owner
                io.to(`user_${innovationOwnerEmpId}`).emit('user-notification', {
                  type: 'innovation-remark',
                  innovationId: Innovation_id,
                  remark: reason.substring(0, 100) + (reason.length > 100 ? '...' : ''),
                  status: currentStatus
                });

                // Emit to the specific innovation room for detailed updates
                io.to(`innovation_${Innovation_id}`).emit('innovation-remarks-updated', {
                  innovationId: Innovation_id,
                  remark: reason,
                  updatedAt: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for innovation remark",
                  route,
                  method,
                  Innovation_id
                });
              } else {
                logger.error({
                  message: "Socket.IO not available for innovation remark",
                  route,
                  method,
                  Innovation_id
                });
              }
            } catch (socketError) {
              logger.error({
                message: "Socket.IO error in addInnovationRemark",
                route,
                method,
                Innovation_id,
                error: socketError.message,
                stack: socketError.stack
              });
              // Don't fail the request if Socket.IO fails
            }

            return res.json({ 
              status: "success",
              message: "Remark added successfully",
              innovationId: Innovation_id
            });
          }
        );
      }
    );
    
  } catch (error) {
    logger.error({
      message: "Error in addInnovationRemark",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Unable to connect" });
  }
};

// const getAllDetails = async (req, res) => {
//   const { year } = req.query;
//   try {
//     const query1 = `
//     SELECT 
//     ar.request_id AS request_id,
//     'Automation' AS request_type,
//     ar.emp_name,
//     'Automation' AS type,
//     COALESCE(ar.process_description, 'No description') AS description,
//     COALESCE(ar.process_chart_file, 'No documents') AS attached_documents,
//     ar.status,
//     ar.created_at,
//     apa.assign_to_name,
//     apa.project_code,
//     apa.planned_start_date,
//     apa.actual_start_date,
//     apa.planned_end_date,
//     apa.actual_end_date

//     FROM automation_requests ar
//     LEFT JOIN automation_project_assigned apa 
//     ON ar.request_id = apa.request_id

//     WHERE ar.status IN ('Accepted', 'In Progress')
//     `;

//     // Query 2: Innovation
//     const query2 = `
//     SELECT 
//     itd.Innovation_id AS request_id,
//     'Innovation' AS request_type,
//     itd.emp_name,
//     'Innovation' AS type,
//     COALESCE(itd.idea_description, 'No description') AS description,
//     COALESCE(itd.upload_path, 'No documents') AS attached_documents,
//     itd.status,
//     itd.created_at,
//     ipa.assign_to_name,
//     ipa.project_code,
//     ipa.planned_start_date,
//     ipa.actual_start_date,
//     ipa.planned_end_date,
//     ipa.actual_end_date

//     FROM innovationtask_details itd
//     LEFT JOIN innovation_project_assigned ipa 
//     ON itd.Innovation_id = ipa.Innovation_id

//     WHERE itd.status IN ('Accepted', 'InProgress')
//     `;

//     // Query 3: Support
//     const query3 = `
//     SELECT 
//     sr.support_request_id AS request_id,
//     'Support' AS request_type,
//     sr.emp_name,
//     'Support' AS type,
//     COALESCE(sr.process_description, 'No description') AS description,
//     COALESCE(sr.process_chart_file, 'No documents') AS attached_documents,
//     sr.status,
//     sr.created_at,
//     spa.assign_to_name,
//     spa.project_code,
//     spa.planned_start_date,
//     spa.actual_start_date,
//     spa.planned_end_date,
//     spa.actual_end_date
//     FROM support_requests sr
//     LEFT JOIN support_project_assigned spa 
//     ON sr.support_request_id = spa.support_request_id
//     WHERE sr.status IN ('Accepted', 'In Progress')
//     `;

//     // Run all queries with year parameter
//     const [results1, results2, results3] = await Promise.all([
//       new Promise(resolve => {
//         pool1.query(query1, [year], (err, results) => {
//           if (err) {
//             console.error('Automation query error:', err);
//             resolve([]);
//           } else resolve(results || []);
//         });
//       }),
//       new Promise(resolve => {
//         pool1.query(query2, [year], (err, results) => {
//           if (err) {
//             console.error('Innovation query error:', err);
//             resolve([]);
//           } else resolve(results || []);
//         });
//       }),
//       new Promise(resolve => {
//         pool1.query(query3, [year], (err, results) => {
//           if (err) {
//             console.error('Support query error:', err);
//             resolve([]);
//           } else resolve(results || []);
//         });
//       }),
//     ]);

//     // Combine all results
//     const allData = [...results1, ...results2, ...results3];
//     console.log('Total combined data:', allData.length);
//     console.log('Breakdown:', {
//       automation: results1.length,
//       innovation: results2.length,
//       support: results3.length
//     });

//     // Function to fetch messages for each request
//     const fetchLatestMessage = (request) => {
//       return new Promise((resolve) => {
//         pool1.query(
//           `SELECT 
//          message_id, sender_type, emp_id, emp_name, message, created_at
//        FROM request_notes
//        WHERE request_id = ? AND request_type = ?
//        ORDER BY created_at DESC
//        LIMIT 1`,
//           [request.request_id, request.request_type],
//           (err, results) => {
//             if (err || results.length === 0) {
//               return resolve(null);
//             }

//             const msg = results[0];

//             resolve({
//               message_id: msg.message_id,
//               sender_type: msg.sender_type,
//               emp_id: msg.emp_id,
//               emp_name: msg.emp_name,
//               message: msg.message,
//               created_date: new Date(msg.created_at).toLocaleDateString('en-IN'),
//               created_time: new Date(msg.created_at).toLocaleTimeString('en-IN', {
//                 hour: '2-digit',
//                 minute: '2-digit',
//                 hour12: true
//               }),
//               created_at: msg.created_at
//             });
//           }
//         );
//       });
//     };

//     // Fetch messages for all requests
//     const allDataWithMessages = await Promise.all(
//       allData.map(async (request) => {
//         const latest_message = await fetchLatestMessage(request);
//         return {
//           ...request,
//           latest_message,
//           message_count: latest_message ? 1 : 0,
//           created_date: new Date(request.created_at).toLocaleDateString('en-IN'),
//           created_time: new Date(request.created_at).toLocaleTimeString('en-IN', {
//             hour: '2-digit',
//             minute: '2-digit',
//             hour12: true
//           })
//         };
//       })
//     );

//     // Sort by latest message date or created date
//     allDataWithMessages.sort((a, b) => {
//       const dateA = a.latest_message ? new Date(a.latest_message.created_at) : new Date(a.created_at);
//       const dateB = b.latest_message ? new Date(b.latest_message.created_at) : new Date(b.created_at);
//       return dateB - dateA; // Descending order (newest first)
//     });

//     console.log('Final data with messages:', allDataWithMessages.length);

//     res.json({
//       success: true,
//       data: allDataWithMessages,
//       counts: {
//         automation: results1.length,
//         innovation: results2.length,
//         support: results3.length,
//         total: allData.length
//       },
//       message: `Found ${allData.length} records (Automation: ${results1.length}, Innovation: ${results2.length}, Support: ${results3.length})`
//     });

//   } catch (error) {
//     console.error('Error in getAllDetails:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       message: 'Failed to fetch details'
//     });
//   }
// };

const getAllDetails = async (req, res) => {
  const { year } = req.query;
  try {
    const query1 = `
    SELECT 
    ar.request_id AS request_id,
    'Automation' AS request_type,
    ar.emp_name,
    'Automation' AS type,
    COALESCE(ar.process_description, 'No description') AS description,
    COALESCE(ar.process_chart_file, 'No documents') AS attached_documents,
    ar.status,
    ar.created_at,
    apa.assign_to_name,
    apa.project_code,
    apa.planned_start_date,
    apa.actual_start_date,
    apa.planned_end_date,
    apa.actual_end_date

    FROM automation_requests ar
    LEFT JOIN automation_project_assigned apa 
    ON ar.request_id = apa.request_id
    `;

    // Query 2: Innovation
    const query2 = `
    SELECT 
    itd.Innovation_id AS request_id,
    'Innovation' AS request_type,
    itd.emp_name,
    'Innovation' AS type,
    COALESCE(itd.idea_description, 'No description') AS description,
    COALESCE(itd.upload_path, 'No documents') AS attached_documents,
    itd.status,
    itd.created_at,
    ipa.assign_to_name,
    ipa.project_code,
    ipa.planned_start_date,
    ipa.actual_start_date,
    ipa.planned_end_date,
    ipa.actual_end_date

    FROM innovationtask_details itd
    LEFT JOIN innovation_project_assigned ipa 
    ON itd.Innovation_id = ipa.Innovation_id
    `;

    // Query 3: Support
    const query3 = `
    SELECT 
    sr.support_request_id AS request_id,
    'Support' AS request_type,
    sr.emp_name,
    'Support' AS type,
    COALESCE(sr.process_description, 'No description') AS description,
    COALESCE(sr.process_chart_file, 'No documents') AS attached_documents,
    sr.status,
    sr.created_at,
    spa.assign_to_name,
    spa.project_code,
    spa.planned_start_date,
    spa.actual_start_date,
    spa.planned_end_date,
    spa.actual_end_date
    FROM support_requests sr
    LEFT JOIN support_project_assigned spa 
    ON sr.support_request_id = spa.support_request_id
    `;

    const queryParams = year ? [year] : [];

    // Run all queries with year parameter
    const [results1, results2, results3] = await Promise.all([
      new Promise(resolve => {
        pool1.query(query1, queryParams, (err, results) => {
          if (err) {
            console.error('Automation query error:', err);
            resolve([]);
          } else resolve(results || []);
        });
      }),
      new Promise(resolve => {
        pool1.query(query2, queryParams, (err, results) => {
          if (err) {
            console.error('Innovation query error:', err);
            resolve([]);
          } else resolve(results || []);
        });
      }),
      new Promise(resolve => {
        pool1.query(query3, queryParams, (err, results) => {
          if (err) {
            console.error('Support query error:', err);
            resolve([]);
          } else resolve(results || []);
        });
      }),
    ]);

    // Combine all results
    const allData = [...results1, ...results2, ...results3];


    // Function to fetch messages for each request
    const fetchLatestMessage = (request) => {
      return new Promise((resolve) => {
        pool1.query(
          `SELECT 
         message_id, sender_type, emp_id, emp_name, message, created_at
       FROM request_notes
       WHERE request_id = ? AND request_type = ?
       ORDER BY created_at DESC
       LIMIT 1`,
          [request.request_id, request.request_type],
          (err, results) => {
            if (err || results.length === 0) {
              return resolve(null);
            }

            const msg = results[0];

            resolve({
              message_id: msg.message_id,
              sender_type: msg.sender_type,
              emp_id: msg.emp_id,
              emp_name: msg.emp_name,
              message: msg.message,
              created_date: new Date(msg.created_at).toLocaleDateString('en-IN'),
              created_time: new Date(msg.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              }),
              created_at: msg.created_at
            });
          }
        );
      });
    };

    // Fetch messages for all requests
    const allDataWithMessages = await Promise.all(
      allData.map(async (request) => {
        const latest_message = await fetchLatestMessage(request);
        return {
          ...request,
          latest_message,
          message_count: latest_message ? 1 : 0,
          created_date: new Date(request.created_at).toLocaleDateString('en-IN'),
          created_time: new Date(request.created_at).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
        };
      })
    );

    // Sort by latest message date or created date
    allDataWithMessages.sort((a, b) => {
      const dateA = a.latest_message ? new Date(a.latest_message.created_at) : new Date(a.created_at);
      const dateB = b.latest_message ? new Date(b.latest_message.created_at) : new Date(b.created_at);
      return dateB - dateA; // Descending order (newest first)
    });


    res.json({
      success: true,
      data: allDataWithMessages,
      counts: {
        automation: results1.length,
        innovation: results2.length,
        support: results3.length,
        total: allData.length
      },
      message: `Found ${allData.length} records (Automation: ${results1.length}, Innovation: ${results2.length}, Support: ${results3.length})`
    });

  } catch (error) {
    console.error('Error in getAllDetails:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Failed to fetch details'
    });
  }
};
const getAllInnovationRoles = async (req, res) => {
  try {
    pool.query(
      `SELECT role_id, emp_id, emp_name, designation, groupName, STATUS 
       FROM ahana_innovation_lab.innovation_role`,
      (error, result) => {
        if (error) {
          console.error("Error fetching innovation roles:", error);
          return res.status(500).json({ message: "Failed to fetch roles" });
        }
        return res.status(200).json({ result });
      }
    );
  } catch (error) {
    console.error("Error in getAllInnovationRoles:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Update or insert user role
const updateUserRole = async (req, res) => {
  const { emp_id, newRole } = req.body;


  if (!emp_id || !newRole) {
    return res.status(400).json({ message: "emp_id and newRole are required" });
  }

  // Validate role
  if (newRole !== "Admin" && newRole !== "A2I group") {
    return res.status(400).json({ message: "Invalid role. Only Admin and A2I group are allowed" });
  }

  try {
    // First, get employee details from master table
    pool.query(
      `SELECT emp_id, emp_name FROM master.emp WHERE emp_id = ? AND flag = "Active"`,
      [emp_id],
      (error, empResults) => {
        if (error) {
          console.error("Error checking employee:", error);
          return res.status(500).json({ 
            message: "Database error checking employee",
            error: error.message 
          });
        }

        if (empResults.length === 0) {
          return res.status(404).json({ message: "Employee not found" });
        }

        const employee = empResults[0];

        // Check if employee already exists in innovation_role
        pool.query(
          `SELECT * FROM ahana_innovation_lab.innovation_role WHERE emp_id = ?`,
          [emp_id],
          (error, roleResults) => {
            if (error) {
              console.error("Error checking innovation role:", error);
              return res.status(500).json({ 
                message: "Database error checking role",
                error: error.message 
              });
            }


            if (roleResults.length > 0) {
              // Update existing employee role
              pool.query(
                `UPDATE ahana_innovation_lab.innovation_role 
                 SET designation = ?, emp_name = ?, STATUS = 1
                 WHERE emp_id = ?`,
                [newRole, employee.emp_name, emp_id],
                (err, updateResult) => {
                  if (err) {
                    console.error("Error updating role:", err);
                    return res.status(500).json({ 
                      message: "Failed to update role",
                      error: err.message 
                    });
                  }
                  return res.status(200).json({ 
                    message: "Role updated successfully",
                    emp_id: emp_id,
                    newRole: newRole
                  });
                }
              );
            } else {
              // Insert new employee role
              pool.query(
                `INSERT INTO ahana_innovation_lab.innovation_role 
                 (emp_id, emp_name, designation, groupName, STATUS) 
                 VALUES (?, ?, ?, 'Digital Transformation Services', 1)`,
                [emp_id, employee.emp_name, newRole],
                (err, insertResult) => {
                  if (err) {
                    console.error("Error inserting role:", err);
                    return res.status(500).json({ 
                      message: "Failed to insert role",
                      error: err.message 
                    });
                  }
                  return res.status(200).json({ 
                    message: "Role assigned successfully",
                    emp_id: emp_id,
                    newRole: newRole
                  });
                }
              );
            }
          }
        );
      }
    );
  } catch (err) {
    console.error("Unexpected error in updateUserRole:", err);
    return res.status(500).json({ 
      message: "Server Error",
      error: err.message 
    });
  }
};

// Toggle user role status
const updateUserRoleStatus = async (req, res) => {
  const { role_id, status } = req.body;


  if (!role_id || status === undefined) {
    return res.status(400).json({ message: "role_id and status are required" });
  }

  try {
    pool.query(
      `UPDATE ahana_innovation_lab.innovation_role 
       SET STATUS = ? 
       WHERE role_id = ?`,
      [status, role_id],
      (error, results) => {
        if (error) {
          console.error("Error updating status:", error);
          return res.status(500).json({ 
            message: "Failed to update status",
            error: error.message 
          });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({ message: "Role not found" });
        }

        return res.status(200).json({ 
          message: "Status updated successfully",
          role_id: role_id,
          newStatus: status
        });
      }
    );
  } catch (err) {
    console.error("Unexpected error in updateUserRoleStatus:", err);
    return res.status(500).json({ 
      message: "Server Error",
      error: err.message 
    });
  }
};

// Delete user role (soft delete)
const deleteUserRole = async (req, res) => {
  const { role_id } = req.body;


  if (!role_id) {
    return res.status(400).json({ message: "role_id is required" });
  }

  try {
    pool.query(
      `UPDATE ahana_innovation_lab.innovation_role 
       SET STATUS = 0 
       WHERE role_id = ?`,
      [role_id],
      (error, results) => {
        if (error) {
          console.error("Error deleting role:", error);
          return res.status(500).json({ 
            message: "Failed to delete role",
            error: error.message 
          });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({ message: "Role not found" });
        }

        return res.status(200).json({ 
          message: "Role removed successfully",
          role_id: role_id
        });
      }
    );
  } catch (err) {
    console.error("Unexpected error in deleteUserRole:", err);
    return res.status(500).json({ 
      message: "Server Error",
      error: err.message 
    });
  }
};


// Add this to your backend - Permanent delete
const permanentDeleteUserRole = async (req, res) => {
  const { role_id } = req.body;


  if (!role_id) {
    return res.status(400).json({ message: "role_id is required" });
  }

  try {
    pool.query(
      `DELETE FROM ahana_innovation_lab.innovation_role 
       WHERE role_id = ?`,
      [role_id],
      (error, results) => {
        if (error) {
          console.error("Error permanently deleting role:", error);
          return res.status(500).json({ 
            message: "Failed to delete role",
            error: error.message 
          });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({ message: "Role not found" });
        }

        return res.status(200).json({ 
          message: "Role permanently deleted successfully",
          role_id: role_id
        });
      }
    );
  } catch (err) {
    console.error("Unexpected error in permanentDeleteUserRole:", err);
    return res.status(500).json({ 
      message: "Server Error",
      error: err.message 
    });
  }
};


const getInnovationHistory = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Fetch innovation history initiated",
    route,
    method
  });

  try {
    const query = `
      SELECT * 
      FROM ahana_innovation_lab.innovationtask_history h
      WHERE h.version < (
        SELECT MAX(version)
        FROM ahana_innovation_lab.innovationtask_history h2
        WHERE h2.Innovation_id = h.Innovation_id
      )
      ORDER BY h.created_at DESC;
    `;

    pool1.query(query, (error, result) => {
      if (error) {
        logger.error({
          message: "Error fetching innovation history",
          route,
          method,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).send("Unable to fetch history data");
      }

      logger.info({
        message: "Innovation history fetched successfully",
        route,
        method,
        historyCount: result.length
      });

      return res.status(200).json({ result });
    });
  } catch (error) {
    logger.error({
      message: "Server error in getInnovationHistory",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteInnovation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.body;

  logger.info({
    message: "Delete innovation initiated",
    route,
    method,
    Innovation_id
  });

  if (!Innovation_id) {
    logger.error({
      message: "Innovation_id missing in body",
      route,
      method,
      body: req.body
    });
    return res.status(400).json({ message: "Innovation_id is required" });
  }

  try {
    // First fetch innovation details for socket emissions
    pool1.query(
      `SELECT Innovation_id, idea_name, emp_id, emp_name FROM ahana_innovation_lab.innovationtask_details WHERE Innovation_id = ?`,
      [Innovation_id],
      (selectErr, selectResults) => {
        if (selectErr) {
          logger.error({
            message: "Error fetching innovation details for deletion",
            route,
            method,
            Innovation_id,
            error: selectErr.message,
            stack: selectErr.stack
          });
          return res.status(500).json({ message: "Failed to fetch innovation details", error: selectErr.message });
        }

        if (selectResults.length === 0) {
          logger.error({
            message: "Innovation not found for deletion",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ message: "No innovation found with this Innovation_id" });
        }

        const innovationData = selectResults[0];
        
        logger.info({
          message: "Innovation details fetched for deletion",
          route,
          method,
          Innovation_id,
          idea_name: innovationData.idea_name,
          emp_id: innovationData.emp_id
        });

        // Delete child records first
        pool1.query(
          `DELETE FROM ahana_innovation_lab.innovationtask_history WHERE Innovation_id = ?`,
          [Innovation_id],
          (err) => {
            if (err) {
              logger.error({
                message: "Error deleting innovation history",
                route,
                method,
                Innovation_id,
                error: err.message,
                stack: err.stack
              });
              return res.status(500).json({ message: "Failed to delete history", error: err.message });
            }

            logger.info({
              message: "Innovation history deleted successfully",
              route,
              method,
              Innovation_id
            });

            // Then delete parent record
            pool1.query(
              `DELETE FROM ahana_innovation_lab.innovationtask_details WHERE Innovation_id = ?`,
              [Innovation_id],
              (error, result) => {
                if (error) {
                  logger.error({
                    message: "Error deleting innovation",
                    route,
                    method,
                    Innovation_id,
                    error: error.message,
                    stack: error.stack
                  });
                  return res.status(500).json({ message: "Failed to delete innovation", error: error.message });
                }

                if (result.affectedRows === 0) {
                  logger.error({
                    message: "Innovation record not found for deletion",
                    route,
                    method,
                    Innovation_id
                  });
                  return res.status(404).json({ message: "No record found with this Innovation_id" });
                }

                logger.info({
                  message: "Innovation deleted successfully",
                  route,
                  method,
                  Innovation_id,
                  affectedRows: result.affectedRows
                });

                // SOCKET EMISSIONS FOR REAL-TIME DELETION NOTIFICATION
                const io = req.app.get('io');
                if (io) {
                  try {
                    // Emit to all clients that innovation was deleted
                    io.emit('innovation-deleted', {
                      type: 'innovation',
                      message: 'Innovation idea has been deleted',
                      Innovation_id: Innovation_id,
                      idea_name: innovationData.idea_name,
                      emp_name: innovationData.emp_name,
                      emp_id: innovationData.emp_id,
                      deletedAt: new Date().toISOString(),
                      action: 'deleted'
                    });

                    // Emit specific notification to the user who owned the innovation
                    io.to(`user_${innovationData.emp_id}`).emit('user-notification', {
                      type: 'innovation',
                      message: 'Your innovation idea was deleted successfully',
                      Innovation_id: Innovation_id,
                      idea_name: innovationData.idea_name,
                      status: 'deleted'
                    });

                    // Emit to the specific innovation room
                    io.to(`innovation_${Innovation_id}`).emit('innovation-removed', {
                      Innovation_id: Innovation_id,
                      deletedBy: req.user?.emp_id || 'system',
                      timestamp: new Date().toISOString()
                    });

                    logger.info({
                      message: "Socket events emitted for deleted innovation",
                      route,
                      method,
                      Innovation_id,
                      emp_id: innovationData.emp_id
                    });
                  } catch (socketError) {
                    logger.error({
                      message: "Socket emission error during innovation deletion",
                      route,
                      method,
                      Innovation_id,
                      error: socketError.message,
                      stack: socketError.stack
                    });
                  }
                } else {
                  logger.error({
                    message: "Socket.io instance not available for innovation deletion",
                    route,
                    method,
                    Innovation_id
                  });
                }

                return res.status(200).json({
                  message: "Innovation and related history deleted successfully",
                  Innovation_id,
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    logger.error({
      message: "Unexpected error in deleteInnovation",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const assignInnovationProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Assign innovation project initiated",
    route,
    method,
    body: req.body
  });

  try {
    const {
      Innovation_id,
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

    if (!Innovation_id || !assign_to_id) {
      logger.error({
        message: "Missing required fields for innovation project assignment",
        route,
        method,
        Innovation_id,
        assign_to_id
      });
      return res.status(400).json({ error: "Innovation_id and assign_to_id are required" });
    }

    logger.info({
      message: "Innovation project assignment data validated",
      route,
      method,
      Innovation_id,
      assign_by_id,
      assign_to_id,
      priority
    });

    const insertSql = `
      INSERT INTO innovation_project_assigned (
        Innovation_id,
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
      Innovation_id,
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
          message: "Database insert error in assignInnovationProject",
          route,
          method,
          Innovation_id,
          assign_to_id,
          error: insertErr.message,
          stack: insertErr.stack
        });
        return res.status(500).json({ error: "Database insert failed." });
      }

      logger.info({
        message: "Innovation project inserted successfully",
        route,
        method,
        Innovation_id,
        assign_to_id,
        insertId: insertResult.insertId
      });

      const updateSql = `
        UPDATE innovationtask_details
        SET status = ?
        WHERE Innovation_id = ?
      `;

      const updateValues = ["Assigned", Innovation_id];

      pool1.query(updateSql, updateValues, (updateErr, updateResult) => {
        if (updateErr) {
          logger.error({
            message: "Status update error after innovation assignment",
            route,
            method,
            Innovation_id,
            error: updateErr.message,
            stack: updateErr.stack
          });
          return res.status(500).json({ error: "Failed to update request status." });
        }

        logger.info({
          message: "Innovation project assigned successfully",
          route,
          method,
          Innovation_id,
          assign_to_id
        });

        return res.status(200).json({
          status: "Success",
          message: "Innovation project assigned and request status updated.",
          assigned_data: insertResult,
          updated_status: updateResult
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "API Error in assignInnovationProject",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
}

const getMyInnovationProjects = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {
    const { emp_id } = req.params;

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
        ipa.*,
        id.Innovation_id,
        id.idea_name,
        id.status AS project_status,
        ipa.uploaded_link,
        ipa.uploaded_doc_path,
        ipa.upload_type,
        ipa.uploaded_at,
        ipa.progress_percentage
      FROM innovation_project_assigned AS ipa
      LEFT JOIN innovationtask_details AS id
      ON ipa.Innovation_id = id.Innovation_id
      WHERE ipa.assign_to_id = ?
      ORDER BY ipa.created_at DESC`;
    const values = [emp_id];

    pool1.query(sql, values, (error, result) => {
      if (error) {
        logger.error({
          message: "Database query error in getMyInnovationProjects",
          route,
          method,
          emp_id,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).json({ error: "Database query failed." });
      }

      logger.info({
        message: "Innovation projects fetched successfully",
        route,
        method,
        emp_id,
        projectCount: result.length
      });

      // Process results with upload data
      const formattedResult = result.map(project => {
        let uploadedFiles = [];
        const baseUrl = process.env.UPLOAD_IMAGES_URL || '/uploads';

        if (project.uploaded_doc_path) {
          try {
            const parsed = JSON.parse(project.uploaded_doc_path);

            if (Array.isArray(parsed)) {
              uploadedFiles = parsed.map(file => ({
                originalName: file.originalName || file.originalname || 'Unknown',
                storedName: file.storedName || file.filename,
                size: file.size,
                mimetype: file.mimetype,
                url: `${baseUrl}/${file.storedName || file.filename}`
              }));
            } else if (typeof parsed === 'object' && parsed !== null) {
              uploadedFiles = [{
                originalName: parsed.originalName || parsed.originalname || parsed.storedName || 'Unknown',
                storedName: parsed.storedName || parsed.filename,
                size: parsed.size,
                mimetype: parsed.mimetype,
                url: `${baseUrl}/${parsed.storedName || parsed.filename}`
              }];
            }
          } catch (e) {
            logger.error({
              message: "Error parsing uploaded_doc_path JSON",
              route,
              method,
              emp_id,
              ipa_id: project.ipa_id,
              error: e.message
            });
            
            if (typeof project.uploaded_doc_path === 'string' && project.uploaded_doc_path.trim() !== '') {
              uploadedFiles = [{
                originalName: project.uploaded_doc_path,
                storedName: project.uploaded_doc_path,
                url: `${baseUrl}/${project.uploaded_doc_path}`
              }];
            }
          }
        }

        return {
          ipa_id: project.ipa_id,
          Innovation_id: project.Innovation_id,
          project_name: project.idea_name,
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
          uploaded_files: uploadedFiles,
          upload_type: project.upload_type,
          uploaded_at: project.uploaded_at,
          teams: []
        };
      });

      return res.status(200).json({
        status: "Success",
        data: formattedResult
      });
    });
  } catch (error) {
    logger.error({
      message: "API Error in getMyInnovationProjects",
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

const manageInnovationProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Manage innovation project team initiated",
    route,
    method,
    body: req.body
  });

  const { ipa_id, teams_data } = req.body;

  if (!ipa_id) {
    logger.error({ message: "Project ID (ipa_id) missing", route, method, body: req.body });
    return res.status(400).json({ success: false, message: "Project ID (ipa_id) is required" });
  }

  if (!Array.isArray(teams_data) || teams_data.length === 0) {
    logger.error({ message: "Teams data missing or invalid", route, method, ipa_id, teams_data });
    return res.status(400).json({ success: false, message: "Teams data is required" });
  }

  let processedCount = 0;

  teams_data.forEach(team => {
    const checkSql = `SELECT * FROM innovation_project_team WHERE ipa_id = ? AND role_name = ? AND team_lead_id = ?`;

    pool1.query(checkSql, [ipa_id, team.role_name, team.team_lead_id], (err, result) => {
      if (err) {
        logger.error({ message: "Check query failed", route, method, ipa_id, team, error: err.message });
        return res.status(500).json({ success: false, message: "Database error", error: err.message });
      }

      const finish = () => {
        processedCount++;
        if (processedCount === teams_data.length) {
          logger.info({ message: "Teams processed successfully", route, method, ipa_id });
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
          `UPDATE innovation_project_team 
           SET team_member_id = ?, team_member_name = ? 
           WHERE team_id = ?`,
          [JSON.stringify(mergedIds), JSON.stringify(mergedNames), existing.team_id],
          (updateErr) => {
            if (updateErr) {
              logger.error({ message: "Update failed", route, method, ipa_id, team, error: updateErr.message });
              return res.status(500).json({ success: false, message: "Database error in update", error: updateErr.message });
            }
            logger.info({ message: "Team updated successfully", route, method, ipa_id, team_lead_id: team.team_lead_id });
            finish();
          }
        );

      } else {
        // Insert new team
        pool1.query(
          `INSERT INTO innovation_project_team 
           (ipa_id, role_id, role_name, team_lead_id, team_lead_name, team_member_id, team_member_name) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ipa_id,
            team.role_id || null,
            team.role_name,
            team.team_lead_id,
            team.team_lead_name,
            JSON.stringify(team.team_members?.map(m => m.id) || []),
            JSON.stringify(team.team_members?.map(m => m.name) || [])
          ],
          (insertErr) => {
            if (insertErr) {
              logger.error({ message: "Insert failed", route, method, ipa_id, team, error: insertErr.message });
              return res.status(500).json({ success: false, message: "Database error in insert", error: insertErr.message });
            }
            logger.info({ message: "Team inserted successfully", route, method, ipa_id, team_lead_id: team.team_lead_id });
            finish();
          }
        );
      }
    });
  });
};

const getAllMyInnovationProjectTeams = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { emp_id } = req.params;

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
    FROM innovation_project_team t
    JOIN innovation_project_assigned p
      ON t.ipa_id = p.ipa_id
    WHERE p.assign_to_id = ?
  `;

  pool1.query(sql, [emp_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching innovation project teams",
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
      message: "Innovation project teams fetched successfully",
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

const getInnovationProjectTeamDetails = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;

  logger.info({
    message: "Fetching innovation project team details",
    route,
    method,
    Innovation_id
  });

  if (!Innovation_id) {
    logger.error({
      message: "Innovation ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Innovation ID missing" });
  }

  const sql = `
    SELECT 
      ipt.*,
      ipa.assign_to_id,
      ipa.assign_to_name,
      ipa.planned_start_date,
      ipa.planned_end_date,
      ipa.actual_start_date,
      ipa.actual_end_date
    FROM innovation_project_assigned ipa
    LEFT JOIN innovation_project_team ipt ON ipt.ipa_id = ipa.ipa_id
    WHERE ipa.Innovation_id = ?
  `;

  pool1.query(sql, [Innovation_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching innovation project teams",
        route,
        method,
        Innovation_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ success: false, message: "Database error" });
    }

    logger.info({
      message: "Innovation project team details fetched successfully",
      route,
      method,
      Innovation_id,
      teamCount: result.length
    });

    return res.status(200).json({ success: true, data: result });
  });
};

const editInnovationProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { team_id } = req.params;
  const { role_id, role_name, team_lead_id, team_lead_name, team_member_id, team_member_name } = req.body;

  logger.info({
    message: "Editing innovation project team",
    route,
    method,
    team_id,
    body: req.body
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

  let teamMemberIdArray, teamMemberNameArray;
  
  try {
    teamMemberIdArray = typeof team_member_id === 'string' ? JSON.parse(team_member_id) : team_member_id;
    teamMemberNameArray = typeof team_member_name === 'string' ? JSON.parse(team_member_name) : team_member_name;
    
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
    `UPDATE innovation_project_team 
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
          message: "Error updating innovation project team",
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
          message: "Innovation team not found for update",
          route,
          method,
          team_id
        });
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      logger.info({
        message: "Innovation project team updated successfully",
        route,
        method,
        team_id,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ success: true, message: "Team updated successfully" });
    }
  );
};

const deleteInnovationProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { team_id } = req.params;

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
    `DELETE FROM innovation_project_team WHERE team_id = ?`,
    [team_id],
    (err, result) => {
      if (err) {
        logger.error({
          message: "Error deleting innovation project team",
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
          message: "Innovation team not found for deletion",
          route,
          method,
          team_id
        });
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      logger.info({
        message: "Innovation project team deleted successfully",
        route,
        method,
        team_id,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ success: true, message: "Team deleted successfully" });
    }
  );
}

const approveInnovationProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id, emp_id, emp_name } = req.body;

  logger.info({
    message: "Approve innovation project initiated",
    route,
    method,
    Innovation_id,
    emp_id,
    emp_name
  });

  if (!Innovation_id || !emp_id || !emp_name) {
    logger.error({
      message: "Missing required fields for innovation project approval",
      route,
      method,
      Innovation_id,
      emp_id,
      emp_name
    });
    return res.status(400).json({ 
      msg: "Innovation_id, emp_id, and emp_name are required" 
    });
  }

  try {
    pool1.query(
      `UPDATE innovationtask_details 
       SET status = ?
       WHERE Innovation_id = ?`,
      ["Approved", Innovation_id],
      (err, result) => {
        if (err) {
          logger.error({
            message: "Error updating innovationtask_details status",
            route,
            method,
            Innovation_id,
            error: err.message,
            stack: err.stack
          });
          return res.status(500).json({ msg: "Internal server error" });
        }

        if (result.affectedRows === 0) {
          logger.error({
            message: "Innovation request not found for approval",
            route,
            method,
            Innovation_id
          });
          return res.status(404).json({ msg: "Request not found" });
        }

        logger.info({
          message: "Innovation request status updated to Approved",
          route,
          method,
          Innovation_id
        });

        pool1.query(
          `UPDATE innovation_project_assigned
           SET project_approver_id = ?,
               project_approver_name = ?
           WHERE Innovation_id = ?`,
          [emp_id, emp_name, Innovation_id],
          (err2, result2) => {
            if (err2) {
              logger.error({
                message: "Error updating innovation project approver",
                route,
                method,
                Innovation_id,
                error: err2.message,
                stack: err2.stack
              });
              return res.status(500).json({ msg: "Internal server error while updating assigned project" });
            }

            logger.info({
              message: "Innovation project approver updated successfully",
              route,
              method,
              Innovation_id,
              emp_id,
              affectedRows: result2.affectedRows
            });

            return res.status(200).json({
              msg: "Innovation project approved and approver updated successfully"
            });
          }
        );
      }
    );
  } catch (error) {
    logger.error({
      message: "Unexpected error in approveInnovationProject",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const startInnovationProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;  
  const { actual_start_date } = req.body;

  logger.info({
    message: "Start innovation project initiated",
    route,
    method,
    Innovation_id,
    actual_start_date
  });

  if (!Innovation_id) {
    logger.error({
      message: "Innovation ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ msg: "Innovation ID is required" });
  }

  if (!actual_start_date) {
    logger.error({
      message: "Actual start date missing in body",
      route,
      method,
      Innovation_id,
      body: req.body
    });
    return res.status(400).json({ msg: "Actual start date is required" });
  }

  try {
    const updateRequestSql = `
      UPDATE innovationtask_details 
      SET status = "InProgress" 
      WHERE Innovation_id = ?
    `;

    const updateAssignedSql = `
      UPDATE innovation_project_assigned
      SET actual_start_date = ?
      WHERE Innovation_id = ?
    `;

    pool1.query(updateRequestSql, [Innovation_id], (err, result1) => {
      if (err) {
        logger.error({
          message: "Error updating innovation request status to InProgress",
          route,
          method,
          Innovation_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ msg: "Internal server error" });
      }

      if (result1.affectedRows === 0) {
        logger.error({
          message: "Innovation request not found for starting project",
          route,
          method,
          Innovation_id
        });
        return res.status(404).json({ msg: "Request not found" });
      }

      logger.info({
        message: "Innovation request status updated to InProgress",
        route,
        method,
        Innovation_id,
        affectedRows: result1.affectedRows
      });

      pool1.query(updateAssignedSql, [actual_start_date, Innovation_id], (err2, result2) => {
        if (err2) {
          logger.error({
            message: "Error updating innovation project start date",
            route,
            method,
            Innovation_id,
            actual_start_date,
            error: err2.message,
            stack: err2.stack
          });
          return res.status(500).json({ msg: "Failed to update project start date" });
        }

        logger.info({
          message: "Innovation project started successfully",
          route,
          method,
          Innovation_id,
          actual_start_date,
          status: "InProgress",
          rowsUpdated: result2.affectedRows
        });

        return res.status(200).json({
          msg: "Innovation project started successfully",
          status: "InProgress",
          date_updated: true,
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "Unexpected error in startInnovationProject",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const endInnovationProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;

  logger.info({
    message: "End innovation project initiated",
    route,
    method,
    Innovation_id
  });

  if (!Innovation_id) {
    logger.error({
      message: "Innovation ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ msg: "Innovation ID is required" });
  }

  try {
    const updateRequestSql = `
      UPDATE innovationtask_details 
      SET status = "Completed" 
      WHERE Innovation_id = ?
    `;

    const updateAssignedSql = `
      UPDATE innovation_project_assigned
      SET actual_end_date = CURDATE()
      WHERE Innovation_id = ?
    `;

    pool1.query(updateRequestSql, [Innovation_id], (err, result1) => {
      if (err) {
        logger.error({
          message: "Error updating innovation request status to Completed",
          route,
          method,
          Innovation_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ msg: "Internal server error" });
      }

      if (result1.affectedRows === 0) {
        logger.error({
          message: "Innovation request not found for ending project",
          route,
          method,
          Innovation_id
        });
        return res.status(404).json({ msg: "Request not found" });
      }

      logger.info({
        message: "Innovation request status updated to Completed",
        route,
        method,
        Innovation_id,
        affectedRows: result1.affectedRows
      });

      pool1.query(updateAssignedSql, [Innovation_id], (err2, result2) => {
        if (err2) {
          logger.error({
            message: "Error updating innovation project end date",
            route,
            method,
            Innovation_id,
            error: err2.message,
            stack: err2.stack
          });
          return res.status(500).json({ msg: "Failed to update project end date" });
        }

        logger.info({
          message: "Innovation project ended successfully",
          route,
          method,
          Innovation_id,
          status: "Completed",
          rowsUpdated: result2.affectedRows
        });

        return res.status(200).json({
          msg: "Innovation project completed successfully",
          status: "Completed",
          date_updated: true,
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "Unexpected error in endInnovationProject",
      route,
      method,
      Innovation_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const getInnovationProjectDetails = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;

  logger.info({
    message: "Fetching innovation project details",
    route,
    method,
    Innovation_id
  });

  if (!Innovation_id) {
    logger.error({
      message: "Innovation ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Innovation ID missing" });
  }

  const sql = `
    SELECT
      ipa.*,
      id.idea_name,
      id.idea_description,
      id.status as project_status,
      id.emp_id as request_emp_id,
      id.emp_name as request_emp_name,
      ipt.role_name,
      ipt.team_lead_id,
      ipt.team_lead_name,
      ipt.team_member_id,
      ipt.team_member_name,
      ipt.created_at as team_created_at,
      (SELECT message FROM request_notes 
       WHERE request_id = id.Innovation_id AND request_type = 'Innovation' 
       ORDER BY created_at DESC LIMIT 1) as latest_note_message,
      (SELECT created_at FROM request_notes 
       WHERE request_id = id.Innovation_id AND request_type = 'Innovation' 
       ORDER BY created_at DESC LIMIT 1) as latest_note_date,
      (SELECT emp_name FROM request_notes 
       WHERE request_id = id.Innovation_id AND request_type = 'Innovation' 
       ORDER BY created_at DESC LIMIT 1) as latest_note_sender
    FROM innovation_project_assigned ipa
    LEFT JOIN innovationtask_details id ON ipa.Innovation_id = id.Innovation_id
    LEFT JOIN innovation_project_team ipt ON ipt.ipa_id = ipa.ipa_id
    WHERE ipa.Innovation_id = ?
    ORDER BY ipt.created_at ASC
  `;

  pool1.query(sql, [Innovation_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching innovation project details",
        route,
        method,
        Innovation_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (result.length === 0) {
      logger.info({
        message: "Innovation project not found",
        route,
        method,
        Innovation_id
      });
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    logger.info({
      message: "Innovation project details fetched successfully",
      route,
      method,
      Innovation_id,
      rowCount: result.length
    });

    const projectData = processInnovationProjectData(result);
    
    logger.info({
      message: "Innovation project data processed successfully",
      route,
      method,
      Innovation_id
    });

    return res.status(200).json({ success: true, data: projectData });
  });
};

const processInnovationProjectData = (rawData) => {
  const functionName = "processInnovationProjectData";
  
  logger.info({
    message: "Processing innovation project data",
    function: functionName,
    dataLength: rawData?.length || 0
  });

  if (!rawData || rawData.length === 0) return null;

  const firstRow = rawData[0];

  let uploadedFiles = [];
  const baseUrl = process.env.UPLOAD_IMAGES_URL || '/uploads';

  if (firstRow.uploaded_doc_path) {
    try {
      const parsed = JSON.parse(firstRow.uploaded_doc_path);

      if (Array.isArray(parsed)) {
        uploadedFiles = parsed.map(file => ({
          originalName: file.originalName || file.originalname || 'Unknown',
          storedName: file.storedName || file.filename,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: file.uploadedAt,
          url: `${baseUrl}/${file.storedName || file.filename}`
        }));
        
        logger.info({
          message: "Parsed uploaded files array",
          function: functionName,
          fileCount: uploadedFiles.length
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        uploadedFiles = [{
          originalName: parsed.originalName || parsed.originalname || parsed.storedName || 'Unknown',
          storedName: parsed.storedName || parsed.filename,
          size: parsed.size,
          mimetype: parsed.mimetype,
          uploadedAt: parsed.uploadedAt,
          url: `${baseUrl}/${parsed.storedName || parsed.filename}`
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
        Innovation_id: firstRow.Innovation_id,
        error: e.message,
        stack: e.stack
      });
      
      if (typeof firstRow.uploaded_doc_path === 'string' && firstRow.uploaded_doc_path.trim() !== '') {
        uploadedFiles = [{
          originalName: firstRow.uploaded_doc_path,
          storedName: firstRow.uploaded_doc_path,
          url: `${baseUrl}/${firstRow.uploaded_doc_path}`
        }];
        
        logger.info({
          message: "Using legacy filename format",
          function: functionName,
          fileName: firstRow.uploaded_doc_path
        });
      }
    }
  }

  const projectInfo = {
    ipa_id: firstRow.ipa_id,
    Innovation_id: firstRow.Innovation_id,
    idea_name: firstRow.idea_name,
    idea_description: firstRow.idea_description,
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

  const teams = [];
  const teamMap = new Map();

  rawData.forEach(row => {
    if (row.role_name && row.team_lead_id) {
      if (!teamMap.has(row.role_name)) {
        
        let teamMemberIds = [];
        try {
          teamMemberIds = row.team_member_id ?
            (typeof row.team_member_id === 'string' ?
              JSON.parse(row.team_member_id) :
              row.team_member_id) : [];
        } catch (e) {
          logger.error({
            message: "Error parsing team_member_id",
            function: functionName,
            Innovation_id: firstRow.Innovation_id,
            role: row.role_name,
            error: e.message
          });
        }

        let teamMemberNames = [];
        try {
          teamMemberNames = row.team_member_name ?
            (typeof row.team_member_name === 'string' ?
              JSON.parse(row.team_member_name) :
              row.team_member_name) : [];
        } catch (e) {
          logger.error({
            message: "Error parsing team_member_name",
            function: functionName,
            Innovation_id: firstRow.Innovation_id,
            role: row.role_name,
            error: e.message
          });
        }

        const teamMembers = teamMemberIds.map((id, index) => ({
          id: id,
          name: teamMemberNames[index] || 'Unknown'
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
    message: "Innovation project data processing complete",
    function: functionName,
    Innovation_id: firstRow.Innovation_id,
    teamCount: teams.length,
    hasUploadedFiles: uploadedFiles.length > 0
  });

  return {
    ...projectInfo,
    teams: teams
  };
};

const setInnovationProjectOwnerAndCode = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Set innovation project owner and code initiated",
    route,
    method,
    body: req.body
  });

  try {
    const { Innovation_id, project_code } = req.body;

    if (!Innovation_id || !project_code) {
      logger.error({
        message: "Missing required fields for innovation project",
        route,
        method,
        Innovation_id,
        project_code
      });
      return res.status(400).json({ 
        error: "Innovation_id and project_code are required" 
      });
    }

    logger.info({
      message: "Updating innovation project code",
      route,
      method,
      Innovation_id,
      project_code
    });

    const sql = `UPDATE innovation_project_assigned
                 SET project_code = ?
                 WHERE Innovation_id = ?`;
    const values = [project_code, Innovation_id];
    
    pool1.query(sql, values, (error, result) => {
      if (error) {
        logger.error({
          message: "Database query error in setInnovationProjectOwnerAndCode",
          route,
          method,
          Innovation_id,
          project_code,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).json({ error: "Database query failed." });
      }

      if (result.affectedRows === 0) {
        logger.error({
          message: "Innovation project not found for code update",
          route,
          method,
          Innovation_id,
          project_code
        });
        return res.status(404).json({ error: "Project not found" });
      }

      logger.info({
        message: "Innovation project code set successfully",
        route,
        method,
        Innovation_id,
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
      message: "API Error in setInnovationProjectOwnerAndCode",
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

const mergeInnovationIdea = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id, A2I_response_id, A2I_response_name, emp_name, idea_name } = req.body;

  logger.info({
    message: "Merge innovation idea initiated",
    route,
    method,
    Innovation_id,
    A2I_response_id,
    A2I_response_name,
    emp_name,
    idea_name
  });

  if (!Innovation_id || !A2I_response_id || !A2I_response_name || !emp_name || !idea_name) {
    logger.error({
      message: "Missing required fields for merge innovation",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      A2I_response_name,
      emp_name,
      idea_name
    });
    return res.status(400).json({ 
      success: false, 
      message: "All fields are required" 
    });
  }

  try {
    const [result] = await pool1.promise().query(
      `UPDATE innovationtask_details SET status = "Merged", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW(), idea_merge_emp = ?, idea_merge_name = ? WHERE Innovation_id = ?`,
      [A2I_response_id, A2I_response_name, emp_name, idea_name, Innovation_id]
    );

    logger.info({
      message: "Innovation idea merged successfully",
      route,
      method,
      Innovation_id,
      A2I_response_id,
      affectedRows: result.affectedRows
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in mergeInnovationIdea",
      route,
      method,
      Innovation_id,
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

const updateProgressPercentage = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { progress, ipa_id } = req.body;

  if (!ipa_id || progress === undefined || progress === null) {
    logger.error({
      message: "Missing required fields for innovation progress update",
      route,
      method,
      ipa_id,
      progress
    });
    return res.status(400).json({ 
      success: false, 
      message: "ipa_id and progress are required" 
    });
  }

  if (isNaN(progress) || progress < 0 || progress > 100) {
    logger.error({
      message: "Invalid progress value for innovation",
      route,
      method,
      ipa_id,
      progress
    });
    return res.status(400).json({ 
      success: false, 
      message: "Progress must be a number between 0 and 100" 
    });
  }

  try {
    const [result] = await pool1.promise().query(
      `UPDATE innovation_project_assigned SET progress_percentage = ? WHERE ipa_id = ?`, 
      [progress, ipa_id]
    );

    if (result.affectedRows === 0) {
      logger.error({
        message: "Innovation project not found for progress update",
        route,
        method,
        ipa_id
      });
      return res.status(404).json({ 
        success: false, 
        message: "Project not found" 
      });
    }

    logger.info({
      message: "Innovation progress updated successfully",
      route,
      method,
      ipa_id,
      progress,
    });

    return res.status(200).json({ status: "success" })
  } catch (error) {
    logger.error({
      message: "Error in updateProgressPercentage",
      route,
      method,
      ipa_id,
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

const updateInnovationStatus = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { Innovation_id } = req.params;
  const { status, A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Update innovation status initiated",
    route,
    method,
    Innovation_id,
    status,
    A2I_response_id,
    A2I_response_name
  });

  if (!Innovation_id || !status) {
    logger.error({
      message: "Missing required fields for innovation status update",
      route,
      method,
      Innovation_id,
      status
    });
    return res.status(400).json({
      status: "error",
      message: "Innovation_id and status are required"
    });
  }

  try {
    const [result] = await pool1.promise().query(
      `UPDATE innovationtask_details SET status = ?, A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE Innovation_id = ?`,
      [status, A2I_response_id, A2I_response_name, Innovation_id]
    );

    if (result.affectedRows === 0) {
      logger.error({
        message: "Innovation not found for status update",
        route,
        method,
        Innovation_id
      });
      return res.status(404).json({
        status: "error",
        message: "Innovation not found"
      });
    }

    logger.info({
      message: "Innovation status updated in database",
      route,
      method,
      Innovation_id,
      status,
      affectedRows: result.affectedRows
    });

    const [innovationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT idea_name, emp_id, emp_name FROM innovationtask_details WHERE Innovation_id = ?`,
        [Innovation_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching innovation data for notification",
              route,
              method,
              Innovation_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Innovation data fetched for notification",
              route,
              method,
              Innovation_id,
              idea_name: results[0]?.idea_name,
              emp_id: results[0]?.emp_id
            });
            resolve(results);
          }
        }
      );
    });

    const io = req.app.get('io');
    if (io && innovationData) {
      const socketData = {
        type: 'innovation',
        Innovation_id,
        idea_name: innovationData.idea_name,
        emp_name: innovationData.emp_name,
        emp_id: innovationData.emp_id,
        status: status,
        timestamp: new Date().toISOString()
      };

      io.emit('innovation-updated', socketData);
      io.to(`user_${innovationData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your innovation "${innovationData.idea_name}" status updated to: ${status}`
      });
      io.to('admin_room').emit('admin-notification', {
        ...socketData,
        message: `Innovation request "${innovationData.idea_name}" status updated to: ${status}`
      });

      logger.info({
        message: "Socket events emitted for innovation status update",
        route,
        method,
        Innovation_id,
        status
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available for innovation",
        route,
        method,
        Innovation_id
      });
    }

    logger.info({
      message: "Innovation status updated successfully",
      route,
      method,
      Innovation_id,
      status
    });

    return res.status(200).json({
      status: "success",
      message: `Status updated to ${status}`
    });
  } catch (error) {
    logger.error({
      message: "Error updating innovation status",
      route,
      method,
      Innovation_id,
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
  CreateInnovation,
  getallEmployess,
  viewuserInnovation,
  accpetInnovation,
  declinInnovation,
  viewallInnovation,
  getinnovationCount,
  viewApprovedInnovation,
  onholdInnovation,
  editInnovation,
  inProgressInnovation,
  completedInnovation,
  addInnovationRemark,
  getAllDetails,
  getAllInnovationRoles,
  updateUserRole,
  deleteUserRole,
  updateUserRoleStatus,
  permanentDeleteUserRole,
  getInnovationHistory,
  deleteInnovation,
  assignInnovationProject,
  getMyInnovationProjects,
  manageInnovationProjectTeam,
  getAllMyInnovationProjectTeams,
  getInnovationProjectTeamDetails,
  editInnovationProjectTeam,
  deleteInnovationProjectTeam,
  approveInnovationProject,
  startInnovationProject,
  endInnovationProject,
  getInnovationProjectDetails,
  setInnovationProjectOwnerAndCode,
  mergeInnovationIdea,
  updateProgressPercentage,
  updateInnovationStatus
};
