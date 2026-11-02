const { pool1 } = require("../../dbConfig/connect");
const { automationCreationMail } = require("../../emailConfig/mailConfig");

const multer = require("multer");
const { insertAutomationHistory, insertUpdateAutomationHistory } = require("../../helper/logHistory");
const logger = require("../../utils/logger");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

const uploadFields = upload.fields([
  { name: "process_chart_file", maxCount: 1 },
]);


const createAutomationReq = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Create automation request initiated",
      route,
      method
    });

    uploadFields(req, res, function (err) {
      if (err) {

        logger.error({
          message: "File upload error during automation creation",
          route,
          method,
          error: err.message
        });

        return res.status(500).json({ error: "File upload failed." });
      }

      const automationReq_data = req.body;
      const processChartFile = req.files["process_chart_file"] ? req.files["process_chart_file"][0] : null;

      const manualEffort = parseFloat(automationReq_data.manual_effort_hours) || 0;
      const manualExpenses = parseFloat(automationReq_data.manual_expenses) || 0;

      const sql = `INSERT INTO automation_requests(
        emp_id, emp_name, process_name, process_description, process_chart_file,
        request_for, manual_effort_hours, manual_expenses,
        status, created_by, created_at, groupName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`;

      const values = [
        automationReq_data.emp_id,
        automationReq_data.emp_name,
        automationReq_data.process_name,
        automationReq_data.process_description,
        processChartFile ? processChartFile.originalname : null,
        automationReq_data.request_for,
        manualEffort,
        manualExpenses,
        automationReq_data.status || "Under Review",
        automationReq_data.created_by,
        automationReq_data.groupName,
      ];

      pool1.query(sql, values, async (insertErr, insertResult) => {

        if (insertErr) {

          logger.error({
            message: "Database insert error while creating automation request",
            route,
            method,
            error: insertErr.message
          });

          return res.status(500).json({ error: "Database insert failed." });
        }

        const newAutomationReqId = insertResult.insertId;

        logger.info({
          message: "Automation request created successfully",
          route,
          method,
          automationId: newAutomationReqId,
          emp_id: automationReq_data.emp_id
        });

        try {
          await insertAutomationHistory(newAutomationReqId, automationReq_data, processChartFile, 1);
        } catch (historyErr) {

          logger.error({
            message: "Failed to insert automation history",
            route,
            method,
            automationId: newAutomationReqId,
            error: historyErr.message
          });

        }

        const io = req.app.get("io");

        if (io) {
          io.emit("automation-created", {
            type: "automation",
            message: "New automation request submitted",
            automationId: newAutomationReqId,
            process_name: automationReq_data.process_name,
            emp_name: automationReq_data.emp_name,
            emp_id: automationReq_data.emp_id,
            createdAt: new Date().toISOString()
          });

          io.to(`user_${automationReq_data.emp_id}`).emit("user-notification", {
            type: "automation",
            message: "Your automation request was submitted successfully",
            automationId: newAutomationReqId,
            process_name: automationReq_data.process_name,
            status: "submitted"
          });

          io.to(`automation_${newAutomationReqId}`).emit("automation-joined", {
            automationId: newAutomationReqId,
            message: "automation room created"
          });

          logger.info({
            message: "Socket events emitted for new automation",
            route,
            method,
            automationId: newAutomationReqId
          });
        }

        pool1.query(
          `SELECT emp_id, emp_email, emp_name FROM master.emp WHERE emp_id = ?`,
          [automationReq_data.emp_id],
          (selectErr, results) => {

            if (selectErr) {

              logger.error({
                message: "Database query error while fetching employee for email",
                route,
                method,
                emp_id: automationReq_data.emp_id,
                error: selectErr.message
              });

              return res.status(500).json({ error: "Database query failed." });
            }

            if (!results || results.length === 0) {

              logger.error({
                message: "Employee not found for automation email",
                route,
                method,
                emp_id: automationReq_data.emp_id
              });

              return res.status(404).json({ error: "Employee not found." });
            }

            const { emp_email, emp_name } = results[0];

            logger.info({
              message: "Sending automation creation email",
              route,
              method,
              emp_id: automationReq_data.emp_id
            });

            automationCreationMail(emp_email, emp_name);

            return res.status(200).json({
              status: "Success",
              automationReq_data: {
                request_id: newAutomationReqId,
                ...automationReq_data,
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
      message: "Internal server error during automation creation",
      route,
      method,
      error: error.message
    });

    return res.status(500).json({ error: "Internal server error." });
  }
};


const viewuserAutomationReq = async (req, res) => {
  const { emp_id } = req.params;

  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Fetching user automation requests",
    route,
    method,
    emp_id
  });

  const query = `
    SELECT 
      ar.*,
      apa.assign_to_name,
      apa.project_code
    FROM ahana_innovation_lab.automation_requests ar
    LEFT JOIN ahana_innovation_lab.automation_project_assigned apa
      ON ar.request_id = apa.request_id
    WHERE ar.emp_id = ?
    ORDER BY ar.created_at DESC;
  `;

  pool1.query(query, [emp_id], (error, result) => {

    if (error) {

      logger.error({
        message: "Database error while fetching user automation requests",
        route,
        method,
        emp_id,
        error: error.message
      });

      return res.status(500).json({ message: "Unable to connect to database" });
    }

    logger.info({
      message: "User automation requests fetched successfully",
      route,
      method,
      emp_id,
      count: result.length
    });

    return res.status(200).json({ result });
  });
};


const acceptAutomationReq = async (req, res) => {
  const { request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Accept automation request",
      route,
      method,
      request_id
    });

    await pool1.promise().query(
      `UPDATE automation_requests 
       SET status = "Accepted", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() 
       WHERE request_id = ?`,
      [A2I_response_id, A2I_response_name, request_id]
    );

    const [automationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name 
         FROM automation_requests 
         WHERE request_id = ?`,
        [request_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    logger.info({
      message: "Automation request accepted",
      route,
      method,
      request_id,
      emp_id: automationData?.emp_id
    });

    const io = req.app.get("io");

    if (io && automationData) {
      const socketData = {
        type: "automation",
        request_id,
        process_name: automationData.process_name,
        emp_name: automationData.emp_name,
        emp_id: automationData.emp_id,
        status: "Accepted",
        timestamp: new Date().toISOString()
      };

      io.emit("automation-updated", socketData);

      io.to(`user_${automationData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your automation "${automationData.process_name}" has been accepted`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error accepting automation request",
      route,
      method,
      request_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const onholdAutomationReq = async (req, res) => {
  const { request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Automation request moved to On Hold",
      route,
      method,
      request_id
    });

    await pool1.promise().query(
      `UPDATE automation_requests 
       SET status = "On Hold", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() 
       WHERE request_id = ?`,
      [A2I_response_id, A2I_response_name, request_id]
    );

    const [automationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name 
         FROM automation_requests 
         WHERE request_id = ?`,
        [request_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    const io = req.app.get("io");

    if (io && automationData) {
      const socketData = {
        type: "automation",
        request_id,
        process_name: automationData.process_name,
        emp_name: automationData.emp_name,
        emp_id: automationData.emp_id,
        status: "On Hold",
        timestamp: new Date().toISOString()
      };

      io.emit("automation-updated", socketData);

      io.to(`user_${automationData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your automation "${automationData.process_name}" is on hold`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error putting automation request on hold",
      route,
      method,
      request_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const rejectAutomationReq = async (req, res) => {
  const { request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Reject automation request",
      route,
      method,
      request_id
    });

    await pool1.promise().query(
      `UPDATE automation_requests 
       SET status = "Rejected", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() 
       WHERE request_id = ?`,
      [A2I_response_id, A2I_response_name, request_id]
    );

    const [automationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name 
         FROM automation_requests 
         WHERE request_id = ?`,
        [request_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    const io = req.app.get("io");

    if (io && automationData) {
      const socketData = {
        type: "automation",
        request_id,
        process_name: automationData.process_name,
        emp_name: automationData.emp_name,
        emp_id: automationData.emp_id,
        status: "Rejected",
        timestamp: new Date().toISOString()
      };

      io.emit("automation-updated", socketData);

      io.to(`user_${automationData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your automation "${automationData.process_name}" has been rejected`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error rejecting automation request",
      route,
      method,
      request_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const inProgressAutomationReq = async (req, res) => {
  const { request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Automation request moved to In Progress",
      route,
      method,
      request_id
    });

    await pool1.promise().query(
      `UPDATE automation_requests 
       SET status = "In Progress", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() 
       WHERE request_id = ?`,
      [A2I_response_id, A2I_response_name, request_id]
    );

    const [automationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name 
         FROM automation_requests 
         WHERE request_id = ?`,
        [request_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    const io = req.app.get("io");

    if (io && automationData) {
      const socketData = {
        type: "automation",
        request_id,
        process_name: automationData.process_name,
        emp_name: automationData.emp_name,
        emp_id: automationData.emp_id,
        status: "In Progress",
        timestamp: new Date().toISOString()
      };

      io.emit("automation-updated", socketData);

      io.to(`user_${automationData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your automation "${automationData.process_name}" is in progress`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error updating automation request to In Progress",
      route,
      method,
      request_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const completedAutomationReq = async (req, res) => {
  const { request_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Automation request completed",
      route,
      method,
      request_id
    });

    await pool1.promise().query(
      `UPDATE automation_requests 
       SET status = "Completed", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() 
       WHERE request_id = ?`,
      [A2I_response_id, A2I_response_name, request_id]
    );

    const [automationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name 
         FROM automation_requests 
         WHERE request_id = ?`,
        [request_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    const io = req.app.get("io");

    if (io && automationData) {
      const socketData = {
        type: "automation",
        request_id,
        process_name: automationData.process_name,
        emp_name: automationData.emp_name,
        emp_id: automationData.emp_id,
        status: "Completed",
        timestamp: new Date().toISOString()
      };

      io.emit("automation-updated", socketData);

      io.to(`user_${automationData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your automation "${automationData.process_name}" is completed`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error completing automation request",
      route,
      method,
      request_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const viewallAutomationReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Fetching all automation requests",
      route,
      method
    });

    const query = `
      SELECT 
        ar.*,
        apa.apa_id,
        apa.project_owner_name,
        apa.project_code,
        apa.planned_start_date,
        apa.actual_start_date,
        apa.planned_end_date,
        apa.actual_end_date,
        apa.assign_by_name,
        apa.priority,
        apa.priority_code,
        apa.progress_percentage
      FROM ahana_innovation_lab.automation_requests ar
      LEFT JOIN ahana_innovation_lab.automation_project_assigned apa 
        ON ar.request_id = apa.request_id
      ORDER BY ar.created_at DESC;
    `;

    pool1.query(query, (error, result) => {

      if (error) {

        logger.error({
          message: "Error fetching automation requests",
          route,
          method,
          error: error.message
        });

        return res.status(500).json({
          status: "error",
          message: "Unable to fetch automation requests"
        });
      }

      logger.info({
        message: "Automation requests fetched successfully",
        route,
        method,
        total_records: result.length
      });

      return res.status(200).json({
        status: "success",
        result
      });

    });

  } catch (error) {

    logger.error({
      message: "Server error in viewallAutomationReq",
      route,
      method,
      error: error.message
    });

    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
};

const getAutomationReqCount = (req, res) => {
  pool1.query(
    `SELECT COUNT(*) AS Accepted FROM ahana_innovation_lab.automation_requests WHERE status = "Accepted"`,
    (err, acceptedCount) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong while retrieving Accepted count",
        });
      }

      pool1.query(
        `SELECT COUNT(*) AS Rejected FROM ahana_innovation_lab.automation_requests WHERE STATUS = "Rejected"`,
        (err, rejectedCount) => {
          if (err) {
            console.error(err);
            return res.status(500).json({
              error: "Something went wrong while retrieving Rejected count",
            });
          }

          pool1.query(
            `SELECT COUNT(*) AS OnHold FROM ahana_innovation_lab.automation_requests WHERE STATUS = "On Hold"`,
            (err, onHoldCount) => {
              if (err) {
                console.error(err);
                return res.status(500).json({
                  error: "Something went wrong while retrieving On Hold count",
                });
              }

              pool1.query(
                `SELECT COUNT(*) AS Pending FROM ahana_innovation_lab.automation_requests WHERE STATUS = "Pending"`,
                (err, pendingCount) => {
                  if (err) {
                    console.error(err);
                    return res.status(500).json({
                      error: "Something went wrong while retrieving Pending count",
                    });
                  }

                  res.status(200).json({
                    Accepted: acceptedCount[0].Accepted,
                    Rejected: rejectedCount[0].Rejected,
                    OnHold: onHoldCount[0].OnHold,
                    Pending: pendingCount[0].Pending,
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};

const viewApprovedAutomationReq = async (req, res) => {
  pool1.query(
    `SELECT request_id, emp_id, emp_name, process_description, process_chart_file, request_for, manual_effort_hours, 
     manual_expenses, status, created_by, groupName, created_at
     FROM ahana_innovation_lab.automation_requests
     WHERE status = "Accepted" 
     ORDER BY created_at DESC;`,
    (error, result) => {
      if (error) {
        return res.status(500).send("Unable to connect");
      }
      return res.status(200).json({ result });
    }
  );
};


const editAutomationReq = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Edit automation request initiated",
      route,
      method
    });

    uploadFields(req, res, (err) => {

      if (err) {

        logger.error({
          message: "File upload failed while editing automation request",
          route,
          method,
          error: err.message
        });

        return res.status(500).json({ error: "File upload failed" });
      }

      const updatedAutomationReq = req.body;

      const newFile = req.files?.process_chart_file
        ? req.files.process_chart_file[0].originalname
        : null;

      let sql, params;

      if (newFile) {

        logger.info({
          message: "New process chart uploaded during automation update",
          route,
          method,
          request_id: updatedAutomationReq.request_id,
          file_name: newFile
        });

        sql = `
          UPDATE ahana_innovation_lab.automation_requests
          SET process_name = ?, process_description = ?, 
              previous_file = process_chart_file, 
              process_chart_file = ?, request_for = ?,
              manual_effort_hours = ?, manual_expenses = ?
          WHERE request_id = ?
        `;

        params = [
          updatedAutomationReq.process_name,
          updatedAutomationReq.process_description,
          newFile,
          updatedAutomationReq.request_for,
          updatedAutomationReq.manual_effort_hours,
          updatedAutomationReq.manual_expenses,
          updatedAutomationReq.request_id
        ];

      } else {

        logger.info({
          message: "Automation request updated without file change",
          route,
          method,
          request_id: updatedAutomationReq.request_id
        });

        sql = `
          UPDATE ahana_innovation_lab.automation_requests
          SET process_name = ?, process_description = ?, 
              request_for = ?, manual_effort_hours = ?, manual_expenses = ?
          WHERE request_id = ?
        `;

        params = [
          updatedAutomationReq.process_name,
          updatedAutomationReq.process_description,
          updatedAutomationReq.request_for,
          updatedAutomationReq.manual_effort_hours,
          updatedAutomationReq.manual_expenses,
          updatedAutomationReq.request_id
        ];
      }

      pool1.query(sql, params, (error, result) => {

        if (error) {

          logger.error({
            message: "Error updating automation request",
            route,
            method,
            request_id: updatedAutomationReq.request_id,
            error: error.message
          });

          return res.status(500).json({ error: "Error updating Automation Request" });
        }

        pool1.query(
          `SELECT MAX(version) AS maxVersion 
           FROM ahana_innovation_lab.automation_requests_history 
           WHERE request_id = ?`,
          [updatedAutomationReq.request_id],
          async (err, results) => {

            if (err) {

              logger.error({
                message: "Error fetching automation history version",
                route,
                method,
                request_id: updatedAutomationReq.request_id,
                error: err.message
              });

              return res.status(500).json({ error: "Version check failed" });
            }

            const nextVersion = (results[0].maxVersion || 1) + 1;

            try {

              await insertUpdateAutomationHistory(
                updatedAutomationReq.request_id,
                updatedAutomationReq,
                newFile,
                nextVersion
              );

              logger.info({
                message: "Automation history inserted successfully",
                route,
                method,
                request_id: updatedAutomationReq.request_id,
                version: nextVersion
              });

            } catch (historyErr) {

              logger.error({
                message: "Failed to insert automation history",
                route,
                method,
                request_id: updatedAutomationReq.request_id,
                error: historyErr.message
              });

            }

            const io = req.app.get('io');

            if (io) {
              try {

                io.emit('automation-updated', {
                  type: 'automation',
                  message: 'automation request has been updated',
                  automationId: updatedAutomationReq.request_id,
                  process_name: updatedAutomationReq.process_name,
                  emp_name: updatedAutomationReq.emp_name,
                  emp_id: updatedAutomationReq.emp_id,
                  updatedAt: new Date().toISOString(),
                  action: 'updated'
                });

                io.to(`user_${updatedAutomationReq.emp_id}`).emit('user-notification', {
                  type: 'automation',
                  message: 'Your automation idea was updated successfully',
                  automationId: updatedAutomationReq.request_id,
                  process_name: updatedAutomationReq.process_name,
                  status: 'updated'
                });

                io.to(`automation_${updatedAutomationReq.request_id}`).emit('automation-details-changed', {
                  automationId: updatedAutomationReq.request_id,
                  updatedFields: Object.keys(updatedAutomationReq),
                  updatedBy: updatedAutomationReq.emp_id,
                  timestamp: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for automation update",
                  route,
                  method,
                  request_id: updatedAutomationReq.request_id
                });

              } catch (socketError) {

                logger.error({
                  message: "Socket emission error during automation update",
                  route,
                  method,
                  request_id: updatedAutomationReq.request_id,
                  error: socketError.message
                });

              }
            }

            logger.info({
              message: "Automation request updated successfully",
              route,
              method,
              request_id: updatedAutomationReq.request_id,
              affectedRows: result.affectedRows
            });

            res.status(200).json({
              message: "Automation Request updated successfully",
              affectedRows: result.affectedRows
            });

          }
        );

      });

    });

  } catch (error) {

    logger.error({
      message: "Server error while editing automation request",
      route,
      method,
      error: error.message
    });

    res.status(500).json({ error: "Error updating Automation Request" });

  }
};

const addAutomationRemark = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {
    const { reason, request_id, priority = null, reasonType = null } = req.body;

    logger.info({
      message: "Adding remark to automation request",
      route,
      method,
      request_id
    });

    await pool1.promise().query(
      `UPDATE automation_requests SET remarks = ?, request_priority = ? WHERE request_id = ?`,
      [reason, priority, request_id]
    );

    logger.info({
      message: "Automation remark added successfully",
      route,
      method,
      request_id
    });

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error adding automation remark",
      route,
      method,
      request_id: req.body?.request_id,
      error: error.message
    });

    return res.status(500).json({
      status: "error",
      message: "Unable to connect"
    });
  }
};

const getAutomationHistory = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Fetching automation history records",
      route,
      method
    });

    const query = `
      SELECT * 
      FROM ahana_innovation_lab.automation_requests_history h
      WHERE h.version < (
        SELECT MAX(version)
        FROM ahana_innovation_lab.automation_requests_history h2
        WHERE h2.request_id = h.request_id
      )
      ORDER BY h.created_at DESC;
    `;

    pool1.query(query, (error, result) => {

      if (error) {

        logger.error({
          message: "Error fetching automation history",
          route,
          method,
          error: error.message
        });

        return res.status(500).json({
          status: "error",
          message: "Unable to fetch history data"
        });
      }

      logger.info({
        message: "Automation history fetched successfully",
        route,
        method,
        total_records: result.length
      });

      return res.status(200).json({
        status: "success",
        result
      });

    });

  } catch (error) {

    logger.error({
      message: "Server error in getAutomationHistory",
      route,
      method,
      error: error.message
    });

    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
};

const deleteAutomation = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  const { request_id } = req.body;

  if (!request_id) {
    logger.error({
      message: "request_id missing in deleteAutomation request",
      route,
      method
    });

    return res.status(400).json({ message: "request_id is required" });
  }

  try {

    logger.info({
      message: "Delete automation request initiated",
      route,
      method,
      request_id
    });

    pool1.query(
      `SELECT request_id, process_name, emp_id, emp_name 
       FROM ahana_innovation_lab.automation_requests 
       WHERE request_id = ?`,
      [request_id],
      (selectErr, selectResults) => {

        if (selectErr) {

          logger.error({
            message: "Error fetching automation details before deletion",
            route,
            method,
            request_id,
            error: selectErr.message
          });

          return res.status(500).json({
            message: "Failed to fetch automation details"
          });
        }

        if (selectResults.length === 0) {

          logger.info({
            message: "No automation found for deletion",
            route,
            method,
            request_id
          });

          return res.status(404).json({
            message: "No automation found with this request_id"
          });
        }

        const automationData = selectResults[0];

        pool1.query(
          `DELETE FROM ahana_innovation_lab.automation_requests_history 
           WHERE request_id = ?`,
          [request_id],
          (err) => {

            if (err) {

              logger.error({
                message: "Error deleting automation history",
                route,
                method,
                request_id,
                error: err.message
              });

              return res.status(500).json({
                message: "Failed to delete history"
              });
            }

            pool1.query(
              `DELETE FROM ahana_innovation_lab.automation_requests 
               WHERE request_id = ?`,
              [request_id],
              (error, result) => {

                if (error) {

                  logger.error({
                    message: "Error deleting automation request",
                    route,
                    method,
                    request_id,
                    error: error.message
                  });

                  return res.status(500).json({
                    message: "Failed to delete Automation"
                  });
                }

                if (result.affectedRows === 0) {

                  logger.info({
                    message: "Automation record not found during deletion",
                    route,
                    method,
                    request_id
                  });

                  return res.status(404).json({
                    message: "No record found with this request_id"
                  });
                }

                const io = req.app.get("io");

                if (io) {
                  try {

                    io.emit("automation-deleted", {
                      type: "automation",
                      message: "Automation request has been deleted",
                      request_id,
                      process_name: automationData.process_name,
                      emp_name: automationData.emp_name,
                      emp_id: automationData.emp_id,
                      deletedAt: new Date().toISOString(),
                      action: "deleted"
                    });

                    io.to(`user_${automationData.emp_id}`).emit("user-notification", {
                      type: "automation",
                      message: "Your automation request was deleted successfully",
                      request_id,
                      process_name: automationData.process_name,
                      status: "deleted"
                    });

                    io.to(`automation_${request_id}`).emit("automation-removed", {
                      request_id,
                      deletedBy: req.user?.emp_id || "system",
                      timestamp: new Date().toISOString()
                    });

                    logger.info({
                      message: "Socket events emitted for automation deletion",
                      route,
                      method,
                      request_id
                    });

                  } catch (socketError) {

                    logger.error({
                      message: "Socket emission error during automation deletion",
                      route,
                      method,
                      request_id,
                      error: socketError.message
                    });

                  }
                }

                logger.info({
                  message: "Automation and related history deleted successfully",
                  route,
                  method,
                  request_id
                });

                return res.status(200).json({
                  message: "Automation and related history deleted successfully",
                  request_id
                });

              }
            );
          }
        );
      }
    );

  } catch (error) {

    logger.error({
      message: "Unexpected server error during automation deletion",
      route,
      method,
      request_id,
      error: error.message
    });

    return res.status(500).json({
      message: "Server error"
    });

  }
};

const assignAutomationProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Assign automation project initiated",
    route,
    method,
    body: req.body
  });

  try {
    const {
      request_id,
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

    logger.info({
      message: "Assignment data received",
      route,
      method,
      request_id,
      assign_by_id,
      assign_to_id,
      priority
    });
 
    const insertSql = `
      INSERT INTO automation_project_assigned (
        request_id,
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
      request_id,
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
          message: "Database insert error in assignAutomationProject",
          route,
          method,
          request_id,
          assign_by_id,
          assign_to_id,
          error: insertErr.message,
          stack: insertErr.stack
        });
        return res.status(500).json({ error: "Database insert failed." });
      }

      logger.info({
        message: "Project assignment inserted successfully",
        route,
        method,
        request_id,
        assign_to_id,
        insertId: insertResult.insertId
      });

      const updateSql = `
        UPDATE automation_requests
        SET status = ?
        WHERE request_id = ?
      `;

      const updateValues = ["Assigned", request_id];

      pool1.query(updateSql, updateValues, (updateErr, updateResult) => {
        if (updateErr) {
          logger.error({
            message: "Status update error after assignment",
            route,
            method,
            request_id,
            error: updateErr.message,
            stack: updateErr.stack
          });
          return res.status(500).json({ error: "Failed to update request status." });
        }

        logger.info({
          message: "Automation project assigned successfully",
          route,
          method,
          request_id,
          assign_to_id,
          status: "Assigned"
        });

        return res.status(200).json({
          status: "Success",
          message: "Automation project assigned and request status updated.",
          assigned_data: insertResult,
          updated_status: updateResult
        });
      });
    });
  } catch (error) {
    logger.error({
      message: "API Error in assignAutomationProject",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
}

const getMyAutomationProjects = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {
    const { emp_id } = req.params;

    logger.info({
      message: "Fetching automation projects for employee",
      route,
      method,
      emp_id
    });

    const sql = `
      SELECT
        apa.*,
        ar.request_id,
        ar.process_name,
        ar.status AS project_status,
        apa.uploaded_link,
        apa.uploaded_doc_path,
        apa.upload_type,
        apa.uploaded_at,
        apa.progress_percentage
      FROM automation_project_assigned AS apa
      LEFT JOIN automation_requests AS ar
      ON apa.request_id = ar.request_id
      WHERE apa.assign_to_id = ?
      ORDER BY apa.created_at DESC`;
    const values = [emp_id];

    pool1.query(sql, values, (error, result) => {
      if (error) {
        logger.error({
          message: "Database query error in getMyAutomationProjects",
          route,
          method,
          emp_id,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).json({ error: "Database query failed." });
      }

      logger.info({
        message: "Projects fetched successfully",
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

            // Handle both array and single object
            if (Array.isArray(parsed)) {
              fileData = parsed.map(file => ({
                originalName: file.originalName || file.originalname || 'Unknown',
                storedName: file.storedName || file.filename,
                size: file.size,
                mimetype: file.mimetype,
                url: `/uploads/project-docs/${file.storedName || file.filename}`
              }));
            } else if (typeof parsed === 'object') {
              // Handle single file object
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
              project_id: project.apa_id,
              error: e.message
            });
            
            // If it's a string, it might be old format with just filename
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
          apa_id: project.apa_id,
          request_id: project.request_id,
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
          // Upload data
          uploaded_link: project.uploaded_link,
          uploaded_files: fileData, // Array of file objects with original names
          upload_type: project.upload_type,
          uploaded_at: project.uploaded_at,
          teams: []
        };
      });

      logger.info({
        message: "Projects formatted successfully",
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
      message: "API Error in getMyAutomationProjects",
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

const manageAutomationProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Manage automation project team initiated",
    route,
    method,
    body: req.body
  });

  const { apa_id, teams_data } = req.body;

  if (!apa_id) {
    logger.error({ message: "Project ID (apa_id) missing", route, method, body: req.body });
    return res.status(400).json({ success: false, message: "Project ID (apa_id) is required" });
  }

  if (!Array.isArray(teams_data) || teams_data.length === 0) {
    logger.error({ message: "Teams data missing or invalid", route, method, apa_id, teams_data });
    return res.status(400).json({ success: false, message: "Teams data is required" });
  }

  let processedCount = 0;

  teams_data.forEach(team => {
    const checkSql = `SELECT * FROM automation_project_team WHERE apa_id = ? AND role_name = ? AND team_lead_id = ?`;

    pool1.query(checkSql, [apa_id, team.role_name, team.team_lead_id], (err, result) => {
      if (err) {
        logger.error({ message: "Check query failed", route, method, apa_id, team, error: err.message });
        return res.status(500).json({ success: false, message: "Database error", error: err.message });
      }

      const finish = () => {
        processedCount++;
        if (processedCount === teams_data.length) {
          logger.info({ message: "Teams processed successfully", route, method, apa_id });
          res.status(200).json({ success: true, message: "Teams processed successfully" });
        }
      };

      if (result.length > 0) {
        // 🔁 Merge existing members
        const existing = result[0];
        const mergedIds = [...new Set([
          ...(JSON.parse(existing.team_member_id || "[]")),
          ...(team.team_members?.map(m => m.id) || [])
        ])];

        const mergedNames = [...new Set([
          ...(JSON.parse(existing.team_member_name || "[]")),
          ...(team.team_members?.map(m => m.name) || [])
        ])];

        pool1.query(
          `UPDATE automation_project_team SET team_member_id = ?, team_member_name = ? WHERE team_id = ?`,
          [JSON.stringify(mergedIds), JSON.stringify(mergedNames), existing.team_id],
          (updateErr) => {
            if (updateErr) {
              logger.error({ message: "Update failed", route, method, apa_id, team, error: updateErr.message });
              return res.status(500).json({ success: false, message: "Database error in update", error: updateErr.message });
            }

            logger.info({ message: "Team updated successfully", route, method, apa_id, team_lead_id: team.team_lead_id });
            finish();
          }
        );

      } else {
        // 🆕 Insert new team
        pool1.query(
          `INSERT INTO automation_project_team (apa_id, role_id, role_name, team_lead_id, team_lead_name, team_member_id, team_member_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            apa_id,
            team.role_id || null,
            team.role_name,
            team.team_lead_id,
            team.team_lead_name,
            JSON.stringify(team.team_members?.map(m => m.id) || []),
            JSON.stringify(team.team_members?.map(m => m.name) || [])
          ],
          (insertErr) => {
            if (insertErr) {
              logger.error({ message: "Insert failed", route, method, apa_id, team, error: insertErr.message });
              return res.status(500).json({ success: false, message: "Database error in insert", error: insertErr.message });
            }

            logger.info({ message: "Team inserted successfully", route, method, apa_id, team_lead_id: team.team_lead_id });
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
    message: "Fetching all project teams for employee",
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
    FROM automation_project_team t
    JOIN automation_project_assigned p
      ON t.apa_id = p.apa_id
    WHERE p.assign_to_id = ?
  `;

  pool1.query(sql, [emp_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Database error fetching project teams",
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
      message: "Project teams fetched successfully",
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
  const { request_id } = req.params;

  logger.info({
    message: "Fetching project team details",
    route,
    method,
    request_id
  });

  if (!request_id) {
    logger.error({
      message: "Request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Request ID missing" });
  }

  const sql = `
    SELECT 
      apt.*,
      apa.assign_to_id,
      apa.assign_to_name,
      apa.planned_start_date,
      apa.planned_end_date,
      apa.actual_start_date,
      apa.actual_end_date
    FROM automation_project_assigned apa
    LEFT JOIN automation_project_team apt ON apt.apa_id = apa.apa_id
    WHERE apa.request_id = ?
  `;

  pool1.query(sql, [request_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching project teams",
        route,
        method,
        request_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ success: false, message: "Database error" });
    }

    logger.info({
      message: "Project team details fetched successfully",
      route,
      method,
      request_id,
      teamCount: result.length
    });

    return res.status(200).json({ success: true, data: result });
  });
};

const editAutomationProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { team_id } = req.params;
  const { role_id, role_name, team_lead_id, team_lead_name, team_member_id, team_member_name } = req.body;

  logger.info({
    message: "Editing automation project team",
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
    `UPDATE automation_project_team 
     SET role_id = ?, role_name = ?, team_lead_id = ?, team_lead_name = ?, 
         team_member_id = ?, team_member_name = ?
     WHERE team_id = ?`,
    [
      role_id,
      role_name,
      team_lead_id,
      team_lead_name,
      JSON.stringify(teamMemberIdArray), // Store as JSON string
      JSON.stringify(teamMemberNameArray), // Store as JSON string
      team_id
    ],
    (err, result) => {
      if (err) {
        logger.error({
          message: "Error updating project team",
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
          message: "Team not found for update",
          route,
          method,
          team_id
        });
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      logger.info({
        message: "Project team updated successfully",
        route,
        method,
        team_id,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ success: true, message: "Team updated successfully" });
    }
  );
};

const deleteAutomationProjectTeam = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { team_id } = req.params;

  logger.info({
    message: "Deleting automation project team",
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
    `DELETE FROM automation_project_team WHERE team_id = ?`,
    [team_id],
    (err, result) => {
      if (err) {
        logger.error({
          message: "Error deleting project team",
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
          message: "Team not found for deletion",
          route,
          method,
          team_id
        });
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      logger.info({
        message: "Project team deleted successfully",
        route,
        method,
        team_id,
        affectedRows: result.affectedRows
      });

      return res.status(200).json({ success: true, message: "Team deleted successfully" });
    }
  );
}

const approveAutomationProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id, emp_id, emp_name } = req.body;

  logger.info({
    message: "Approving automation project",
    route,
    method,
    request_id,
    emp_id,
    emp_name
  });

  if (!request_id || !emp_id || !emp_name) {
    logger.error({
      message: "Missing required fields for approval",
      route,
      method,
      request_id,
      emp_id,
      emp_name
    });
    return res.status(400).json({ 
      msg: "request_id, emp_id, and emp_name are required" 
    });
  }

  try {
    // 1) Update automation_requests table
    pool1.query(
      `UPDATE automation_requests 
       SET status = ?
       WHERE request_id = ?`,
      ["Approved", request_id],
      (err, result) => {
        if (err) {
          logger.error({
            message: "Error updating automation_requests status",
            route,
            method,
            request_id,
            error: err.message,
            stack: err.stack
          });
          return res.status(500).json({ msg: "Internal server error" });
        }

        if (result.affectedRows === 0) {
          logger.error({
            message: "Request not found for approval",
            route,
            method,
            request_id
          });
          return res.status(404).json({ msg: "Request not found" });
        }

        logger.info({
          message: "Automation request status updated to Approved",
          route,
          method,
          request_id
        });

        // 2) Now update automation_project_assigned table
        pool1.query(
          `UPDATE automation_project_assigned
           SET project_approver_id = ?,
               project_approver_name = ?
           WHERE request_id = ?`,
          [emp_id, emp_name, request_id],
          (err2, result2) => {
            if (err2) {
              logger.error({
                message: "Error updating project approver",
                route,
                method,
                request_id,
                error: err2.message,
                stack: err2.stack
              });
              return res.status(500).json({ msg: "Internal server error while updating assigned project" });
            }

            logger.info({
              message: "Project approver updated successfully",
              route,
              method,
              request_id,
              emp_id,
              affectedRows: result2.affectedRows
            });

            return res.status(200).json({
              msg: "Automation project approved and approver updated successfully"
            });
          }
        );
      }
    );
  } catch (error) {
    logger.error({
      message: "Unexpected error in approveAutomationProject",
      route,
      method,
      request_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};


const startProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id } = req.params;
  const { actual_start_date } = req.body;

  logger.info({
    message: "Starting project",
    route,
    method,
    request_id,
    actual_start_date
  });

  if (!request_id) {
    logger.error({
      message: "Request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ msg: "Request ID is required" });
  }

  if (!actual_start_date) {
    logger.error({
      message: "Actual start date missing in body",
      route,
      method,
      request_id,
      body: req.body
    });
    return res.status(400).json({ msg: "Actual start date is required" });
  }

  try {
    const updateRequestSql = `
      UPDATE automation_requests 
      SET status = "In Progress" 
      WHERE request_id = ?
    `;

    const updateAssignedSql = `
      UPDATE automation_project_assigned
      SET actual_start_date = ?
      WHERE request_id = ?
    `;

    pool1.query(updateRequestSql, [request_id], (err, result1) => {
      if (err) {
        logger.error({
          message: "Error updating request status to In Progress",
          route,
          method,
          request_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ msg: "Internal server error" });
      }

      if (result1.affectedRows === 0) {
        logger.error({
          message: "Request not found for starting project",
          route,
          method,
          request_id
        });
        return res.status(404).json({ msg: "Request not found" });
      }

      logger.info({
        message: "Request status updated to In Progress",
        route,
        method,
        request_id,
        affectedRows: result1.affectedRows
      });

      // Execute Query 2
      pool1.query(updateAssignedSql, [actual_start_date, request_id], (err2, result2) => {
        if (err2) {
          logger.error({
            message: "Error updating project start date",
            route,
            method,
            request_id,
            actual_start_date,
            error: err2.message,
            stack: err2.stack
          });
          return res.status(500).json({ msg: "Failed to update project start date" });
        }

        logger.info({
          message: "Project started successfully",
          route,
          method,
          request_id,
          actual_start_date,
          status: "In Progress",
          rowsUpdated: result2.affectedRows
        });

        return res.status(200).json({
          msg: "Automation project started successfully",
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
      request_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const endProject = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id } = req.params;

  logger.info({
    message: "Ending project",
    route,
    method,
    request_id
  });

  if (!request_id) {
    logger.error({
      message: "Request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ msg: "Request ID is required" });
  }

  try {
    const updateRequestSql = `
      UPDATE automation_requests 
      SET status = "Completed" 
      WHERE request_id = ?
    `;

    const updateAssignedSql = `
      UPDATE automation_project_assigned
      SET actual_end_date = CURDATE()
      WHERE request_id = ?
    `;

    pool1.query(updateRequestSql, [request_id], (err, result1) => {
      if (err) {
        logger.error({
          message: "Error updating request status to Completed",
          route,
          method,
          request_id,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ msg: "Internal server error" });
      }

      if (result1.affectedRows === 0) {
        logger.error({
          message: "Request not found for ending project",
          route,
          method,
          request_id
        });
        return res.status(404).json({ msg: "Request not found" });
      }

      logger.info({
        message: "Request status updated to Completed",
        route,
        method,
        request_id,
        affectedRows: result1.affectedRows
      });

      // Execute Query 2
      pool1.query(updateAssignedSql, [request_id], (err2, result2) => {
        if (err2) {
          logger.error({
            message: "Error updating project end date",
            route,
            method,
            request_id,
            error: err2.message,
            stack: err2.stack
          });
          return res.status(500).json({ msg: "Failed to update project end date" });
        }

        logger.info({
          message: "Project ended successfully",
          route,
          method,
          request_id,
          status: "Completed",
          rowsUpdated: result2.affectedRows
        });

        return res.status(200).json({
          msg: "Automation project completed successfully",
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
      request_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ msg: "Internal server error" });
  }
};

const getProjectDetails = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id } = req.params;

  logger.info({
    message: "Fetching project details",
    route,
    method,
    request_id
  });

  if (!request_id) {
    logger.error({
      message: "Request ID missing in params",
      route,
      method,
      params: req.params
    });
    return res.status(400).json({ success: false, message: "Request ID missing" });
  }

  const sql = `
  SELECT 
    apa.*, 
    ar.process_name, 
    ar.process_description, 
    ar.status as project_status, 
    ar.emp_id as request_emp_id, 
    ar.emp_name as request_emp_name,
    apt.role_name, 
    apt.team_lead_id, 
    apt.team_lead_name, 
    apt.team_member_id, 
    apt.team_member_name, 
    apt.created_at as team_created_at,
    -- Fetch latest note details
    (SELECT message FROM request_notes 
     WHERE request_id = ar.request_id AND request_type = 'Automation' 
     ORDER BY created_at DESC LIMIT 1) as latest_note_message,
    (SELECT created_at FROM request_notes 
     WHERE request_id = ar.request_id AND request_type = 'Automation' 
     ORDER BY created_at DESC LIMIT 1) as latest_note_date,
    (SELECT emp_name FROM request_notes 
     WHERE request_id = ar.request_id AND request_type = 'Automation' 
     ORDER BY created_at DESC LIMIT 1) as latest_note_sender
  FROM automation_project_assigned apa
  LEFT JOIN automation_requests ar ON apa.request_id = ar.request_id
  LEFT JOIN automation_project_team apt ON apt.apa_id = apa.apa_id
  WHERE apa.request_id = ?
  ORDER BY apt.created_at ASC`;

  pool1.query(sql, [request_id], (err, result) => {
    if (err) {
      logger.error({
        message: "Error fetching project details",
        route,
        method,
        request_id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (result.length === 0) {
      logger.info({
        message: "Project not found",
        route,
        method,
        request_id
      });
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    logger.info({
      message: "Project details fetched successfully",
      route,
      method,
      request_id,
      rowCount: result.length,
      hasTeams: result.some(row => row.role_name !== null)
    });

    // Process the data to group teams properly
    const projectData = processProjectData(result);
    
    logger.info({
      message: "Project data processed successfully",
      route,
      method,
      request_id
    });

    return res.status(200).json({ success: true, data: projectData });
  });
};

const processProjectData = (rawData) => {
  const functionName = "processProjectData";
  
  logger.info({
    message: "Processing project data",
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

      // Handle both array and single object
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
        // Handle single file object
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
        request_id: firstRow.request_id,
        error: e.message,
        stack: e.stack
      });
      
      // If it's a string, it might be old format with just filename
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
    apa_id: firstRow.apa_id,
    request_id: firstRow.request_id,
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
    // Upload data
    uploaded_link: firstRow.uploaded_link,
    uploaded_files: uploadedFiles, // Array of file objects with original names
    upload_type: firstRow.upload_type,
    uploaded_at: firstRow.uploaded_at
  };

  // Process teams data
  const teams = [];
  const teamMap = new Map();

  rawData.forEach((row, index) => {
    if (row.role_name && row.team_lead_id) {
      if (!teamMap.has(row.role_name)) {

        // Parse team member IDs
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
            request_id: firstRow.request_id,
            role: row.role_name,
            error: e.message
          });
        }

        // Parse team member names
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
            request_id: firstRow.request_id,
            role: row.role_name,
            error: e.message
          });
        }

        // Create team members array
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
    message: "Project data processing complete",
    function: functionName,
    request_id: firstRow.request_id,
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
    message: "Set project owner and code initiated",
    route,
    method,
    body: req.body
  });

  try {
    const { request_id, project_code } = req.body;

    if (!request_id || !project_code) {
      logger.error({
        message: "Missing required fields",
        route,
        method,
        request_id,
        project_code
      });
      return res.status(400).json({ 
        error: "request_id and project_code are required" 
      });
    }

    logger.info({
      message: "Updating project code",
      route,
      method,
      request_id,
      project_code
    });

    const sql = `UPDATE automation_project_assigned
                 SET project_code = ?
                 WHERE request_id = ?`;
    const values = [project_code, request_id];
    
    pool1.query(sql, values, (error, result) => {
      if (error) {
        logger.error({
          message: "Database query error in setProjectOwnerAndCode",
          route,
          method,
          request_id,
          project_code,
          error: error.message,
          stack: error.stack
        });
        return res.status(500).json({ error: "Database query failed." });
      }

      if (result.affectedRows === 0) {
        logger.error({
          message: "Project not found for code update",
          route,
          method,
          request_id,
          project_code
        });
        return res.status(404).json({ error: "Project not found" });
      }

      logger.info({
        message: "Project code set successfully",
        route,
        method,
        request_id,
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
  const { request_id, A2I_response_id, A2I_response_name, emp_name, process_name } = req.body;

  logger.info({
    message: "Merge process initiated",
    route,
    method,
    request_id,
    A2I_response_id,
    A2I_response_name,
    emp_name,
    process_name
  });

  if (!request_id || !A2I_response_id || !A2I_response_name || !emp_name || !process_name) {
    logger.error({
      message: "Missing required fields for merge process",
      route,
      method,
      request_id,
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
      `UPDATE automation_requests SET status = "Merged", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW(), process_merge_emp = ?, process_merge_name = ? WHERE request_id = ?`,
      [A2I_response_id, A2I_response_name, emp_name, process_name, request_id]
    );

    logger.info({
      message: "Process merged successfully",
      route,
      method,
      request_id,
      A2I_response_id,
      affectedRows: result.affectedRows
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in mergeProcess",
      route,
      method,
      request_id,
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

const updateAutomationProgressPercentage = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { progress, apa_id } = req.body;

  logger.info({
    message: "Update automation progress initiated",
    route,
    method,
    apa_id,
    progress
  });

  if (!apa_id || progress === undefined || progress === null) {
    logger.error({
      message: "Missing required fields for progress update",
      route,
      method,
      apa_id,
      progress
    });
    return res.status(400).json({ 
      success: false, 
      message: "apa_id and progress are required" 
    });
  }

  if (isNaN(progress) || progress < 0 || progress > 100) {
    logger.error({
      message: "Invalid progress value",
      route,
      method,
      apa_id,
      progress
    });
    return res.status(400).json({ 
      success: false, 
      message: "Progress must be a number between 0 and 100" 
    });
  }

  try {
    const [result] = await pool1.promise().query(
      `UPDATE automation_project_assigned SET progress_percentage = ? WHERE apa_id = ?`,
      [progress, apa_id]
    );

    if (result.affectedRows === 0) {
      logger.error({
        message: "Project not found for progress update",
        route,
        method,
        apa_id
      });
      return res.status(404).json({ 
        success: false, 
        message: "Project not found" 
      });
    }

    logger.info({
      message: "Progress updated successfully",
      route,
      method,
      apa_id,
      progress,
      affectedRows: result.affectedRows
    });

    return res.status(200).json({ status: "success" });
  } catch (error) {
    logger.error({
      message: "Error in updateAutomationProgressPercentage",
      route,
      method,
      apa_id,
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


// Update automation request status
const updateAutomationStatus = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { request_id } = req.params;
  const { status, A2I_response_id, A2I_response_name } = req.body;

  logger.info({
    message: "Update automation status initiated",
    route,
    method,
    request_id,
    status,
    A2I_response_id,
    A2I_response_name
  });

  if (!request_id || !status) {
    logger.error({
      message: "Missing required fields for status update",
      route,
      method,
      request_id,
      status
    });
    return res.status(400).json({
      status: "error",
      message: "request_id and status are required"
    });
  }

  try {
    // Update the status column instead of automation_status
    const [result] = await pool1.promise().query(
      `UPDATE automation_requests SET status = ?, A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE request_id = ?`,
      [status, A2I_response_id, A2I_response_name, request_id]
    );

    if (result.affectedRows === 0) {
      logger.error({
        message: "Request not found for status update",
        route,
        method,
        request_id
      });
      return res.status(404).json({
        status: "error",
        message: "Request not found"
      });
    }

    logger.info({
      message: "Status updated in database",
      route,
      method,
      request_id,
      status,
      affectedRows: result.affectedRows
    });

    // Get request details for notification
    const [automationData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT process_name, emp_id, emp_name FROM automation_requests WHERE request_id = ?`,
        [request_id],
        (err, results) => {
          if (err) {
            logger.error({
              message: "Error fetching automation data for notification",
              route,
              method,
              request_id,
              error: err.message,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.info({
              message: "Automation data fetched for notification",
              route,
              method,
              request_id,
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
    if (io && automationData) {
      const socketData = {
        type: 'automation',
        request_id,
        process_name: automationData.process_name,
        emp_name: automationData.emp_name,
        emp_id: automationData.emp_id,
        status: status,
        timestamp: new Date().toISOString()
      };

      // Emit to all connected clients
      io.emit('automation-updated', socketData);

      // Emit specific notification to the request owner
      io.to(`user_${automationData.emp_id}`).emit('user-notification', {
        ...socketData,
        message: `Your automation "${automationData.process_name}" status updated to: ${status}`
      });

      // Emit to admin/A2I group rooms
      io.to('admin_room').emit('admin-notification', {
        ...socketData,
        message: `Automation request "${automationData.process_name}" status updated to: ${status}`
      });

      logger.info({
        message: "Socket events emitted for status update",
        route,
        method,
        request_id,
        status
      });
    } else if (!io) {
      logger.error({
        message: "Socket.io instance not available",
        route,
        method,
        request_id
      });
    }

    logger.info({
      message: "Automation status updated successfully",
      route,
      method,
      request_id,
      status
    });

    return res.status(200).json({
      status: "success",
      message: `Status updated to ${status}`
    });
  } catch (error) {
    logger.error({
      message: "Error updating automation status",
      route,
      method,
      request_id,
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
  createAutomationReq,
  viewuserAutomationReq,
  acceptAutomationReq,
  onholdAutomationReq,
  rejectAutomationReq,
  viewallAutomationReq,
  getAutomationReqCount,
  viewApprovedAutomationReq,
  editAutomationReq,
  inProgressAutomationReq,
  completedAutomationReq,
  addAutomationRemark,
  getAutomationHistory,
  deleteAutomation,
  assignAutomationProject,
  getMyAutomationProjects,
  manageAutomationProjectTeam,
  getAllMyProjectTeams,
  getProjectTeamDetails,
  deleteAutomationProjectTeam,
  editAutomationProjectTeam,
  approveAutomationProject,
  startProject,
  endProject,
  getProjectDetails,
  setProjectOwnerAndCode,
  mergeProcess,
  updateAutomationProgressPercentage,
  updateAutomationStatus,
};