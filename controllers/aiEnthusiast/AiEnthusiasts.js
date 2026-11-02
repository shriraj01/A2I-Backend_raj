const { pool1 } = require("../../dbConfig/connect");
const { enthusiastCreationMail } = require("../../emailConfig/mailConfig");

const multer = require("multer");
const { insertEnthusiastHistory, insertUpdateEnthusiastHistory } = require("../../helper/logHistory");
const logger = require("../../utils/logger");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

const uploadFields = upload.fields([
  { name: "certificateFile", maxCount: 1 },
]);

const createEnthusiasts = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Create enthusiast request initiated",
    route,
    method,
    body: req.body
  });

  try {
    uploadFields(req, res, function (err) {
      if (err) {
        logger.error({
          message: "File upload error",
          route,
          method,
          error: err.message,
          stack: err.stack
        });
        return res.status(500).json({ error: "File upload failed." });
      }

      const enthusiastData = req.body;
      const certificateFile = req.files["certificateFile"] ? req.files["certificateFile"][0] : null;

      logger.info({
        message: "File upload successful",
        route,
        method,
        emp_id: enthusiastData.emp_id,
        emp_name: enthusiastData.emp_name,
        hasCertificate: !!certificateFile,
        certificateFileName: certificateFile ? certificateFile.originalname : null
      });

      // INSERT query
      const sql = `INSERT INTO ai_enthusiasts (
        emp_id, emp_name, skills_profile, ai_tools_known, automation_experience,
        automation_description, time_available_daily, expertise_level, status,
        created_by, created_at, groupName, haveCertificate, certificateFile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?);`;

      const values = [
        enthusiastData.emp_id,
        enthusiastData.emp_name,
        enthusiastData.skills_profile,
        enthusiastData.ai_tools_known || null,
        enthusiastData.automation_experience,
        enthusiastData.automation_description || null,
        enthusiastData.time_available_daily,
        enthusiastData.expertise_level,
        enthusiastData.status || "Under Review",
        enthusiastData.created_by,
        enthusiastData.groupName || null,
        enthusiastData.haveCertificate,
        certificateFile ? certificateFile.originalname : null,
      ];

      pool1.query(sql, values, async (insertErr, insertResult) => {
        if (insertErr) {
          logger.error({
            message: "Database insert error",
            route,
            method,
            emp_id: enthusiastData.emp_id,
            error: insertErr.message,
            stack: insertErr.stack
          });
          return res.status(500).json({ error: "Database insert failed." });
        }

        const enthusiastId = insertResult.insertId;
        
        logger.info({
          message: "Database insert successful",
          route,
          method,
          enthusiastId,
          emp_id: enthusiastData.emp_id,
          emp_name: enthusiastData.emp_name
        });

        try {
          await insertEnthusiastHistory(enthusiastId, enthusiastData, certificateFile, 1);
          logger.info({
            message: "History table insert successful",
            route,
            method,
            enthusiastId,
            emp_id: enthusiastData.emp_id
          });
        } catch (historyErr) {
          logger.error({
            message: "Failed to insert into history table",
            route,
            method,
            enthusiastId,
            emp_id: enthusiastData.emp_id,
            error: historyErr.message,
            stack: historyErr.stack
          });
        }

        const io = req.app.get('io');

        if (io) {
          // Emit to all connected clients about new innovation
          io.emit('enthusiast-created', {
            type: 'enthusiast',
            message: 'New AI Enthusiast submitted',
            enthusiastId: enthusiastId,
            expertise_level: enthusiastData.expertise_level,
            emp_name: enthusiastData.emp_name,
            emp_id: enthusiastData.emp_id,
            createdAt: new Date().toISOString()
          });

          // Emit specific notification to the user who submitted
          io.to(`user_${enthusiastData.emp_id}`).emit('user-notification', {
            type: 'automation',
            message: 'Your automation request was submitted successfully',
            enthusiastId: enthusiastId,
            expertise_level: enthusiastData.expertise_level,
            status: 'submitted'
          });

          // Join this automation room for future updates
          io.to(`automation_${enthusiastId}`).emit('automation-joined', {
            enthusiastId: enthusiastId,
            message: 'automation room created'
          });

          logger.info({
            message: "Socket events emitted successfully",
            route,
            method,
            enthusiastId,
            emp_id: enthusiastData.emp_id
          });
        } else {
          logger.error({
            message: "Socket.io instance not available",
            route,
            method,
            enthusiastId,
            emp_id: enthusiastData.emp_id
          });
        }

        // Fetch employee details
        pool1.query(
          `SELECT emp_id, emp_email, emp_name FROM master.emp WHERE emp_id = ?`,
          [enthusiastData.emp_id],
          (selectErr, results) => {
            if (selectErr) {
              logger.error({
                message: "Employee details query error",
                route,
                method,
                enthusiastId,
                emp_id: enthusiastData.emp_id,
                error: selectErr.message,
                stack: selectErr.stack
              });
              return res.status(500).json({ error: "Database query failed." });
            }

            if (!results || results.length === 0) {
              logger.error({
                message: "Employee details not found",
                route,
                method,
                enthusiastId,
                emp_id: enthusiastData.emp_id
              });
              return res.status(404).json({ error: "Employee details not found." });
            }

            const { emp_email, emp_name } = results[0];
            
            logger.info({
              message: "Employee details fetched successfully",
              route,
              method,
              enthusiastId,
              emp_id: enthusiastData.emp_id,
              emp_email,
              emp_name
            });

            // Send email notification
            enthusiastCreationMail(emp_email, emp_name);

            logger.info({
              message: "Enthusiast creation completed successfully",
              route,
              method,
              enthusiastId,
              emp_id: enthusiastData.emp_id,
              emp_email,
              emp_name
            });

            return res.status(200).json({
              status: "Success",
              enthusiastData: {
                ...enthusiastData,
                certificateFile: certificateFile ? certificateFile.originalname : null,
                created_at: new Date().toISOString(),
              },
            });
          }
        );
      });
    });
  } catch (error) {
    logger.error({
      message: "Internal server error in createEnthusiasts",
      route,
      method,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Internal server error." });
  }
};

const viewuserEnthusiasts = async (req, res) => {

  const { emp_id } = req.params;
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Fetching AI enthusiasts for user",
    route,
    method,
    emp_id
  });

  pool1.query(
    `
    SELECT * 
    FROM ahana_innovation_lab.ai_enthusiasts
    WHERE emp_id = ?
    ORDER BY created_at DESC
    `,
    [emp_id],
    (error, result) => {

      if (error) {

        logger.error({
          message: "Database error while fetching AI enthusiasts",
          route,
          method,
          emp_id,
          error: error.message
        });

        return res.status(500).json({
          success: false,
          message: "Unable to fetch AI enthusiasts"
        });
      }

      logger.info({
        message: "AI enthusiasts fetched successfully",
        route,
        method,
        emp_id,
        count: result.length
      });

      return res.status(200).json({
        success: true,
        result
      });
    }
  );
};

const inReviewEnthusiasts = async (req, res) => {
  const { enthusiasts_id } = req.params;
  try {
    const [result] = await pool1.promise().query(
      `UPDATE ai_enthusiasts SET status = "In Review" WHERE enthusiasts_id = ?`,
      [enthusiasts_id]
    );

    return res.json({ status: "success" }).status(200);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Unable to connect");
  }
};

const acceptEnthusiasts = async (req, res) => {
  const { enthusiasts_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Accept enthusiast request",
      route,
      method,
      enthusiasts_id,
      A2I_response_id
    });

    const [result] = await pool1.promise().query(
      `UPDATE ai_enthusiasts SET status = "Accepted", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE enthusiasts_id = ?`,
      [A2I_response_id, A2I_response_name, enthusiasts_id]
    );

    const [enthusiastData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT expertise_level, emp_id, emp_name FROM ai_enthusiasts WHERE enthusiasts_id = ?`,
        [enthusiasts_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    logger.info({
      message: "Enthusiast accepted successfully",
      route,
      method,
      enthusiasts_id,
      emp_id: enthusiastData?.emp_id
    });

    // Socket emissions
    const io = req.app.get("io");
    if (io && enthusiastData) {
      const socketData = {
        type: "enthusiast",
        enthusiasts_id,
        expertise_level: enthusiastData.expertise_level,
        emp_name: enthusiastData.emp_name,
        emp_id: enthusiastData.emp_id,
        status: "Accepted",
        timestamp: new Date().toISOString()
      };

      io.emit("enthusiast-updated", socketData);

      io.to(`user_${enthusiastData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your enthusiast "${enthusiastData.expertise_level}" has been accepted`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error accepting enthusiast",
      route,
      method,
      enthusiasts_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const rejectEnthusiasts = async (req, res) => {
  const { enthusiasts_id } = req.params;
  const { A2I_response_id, A2I_response_name } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Reject enthusiast request",
      route,
      method,
      enthusiasts_id,
      A2I_response_id
    });

    const [result] = await pool1.promise().query(
      `UPDATE ai_enthusiasts SET status = "Rejected", A2I_response_id = ?, A2I_response_name = ?, A2I_update_date = NOW() WHERE enthusiasts_id = ?`,
      [A2I_response_id, A2I_response_name, enthusiasts_id]
    );

    const [enthusiastData] = await new Promise((resolve, reject) => {
      pool1.query(
        `SELECT expertise_level, emp_id, emp_name FROM ai_enthusiasts WHERE enthusiasts_id = ?`,
        [enthusiasts_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });

    logger.info({
      message: "Enthusiast rejected successfully",
      route,
      method,
      enthusiasts_id,
      emp_id: enthusiastData?.emp_id
    });

    // Socket emissions
    const io = req.app.get("io");
    if (io && enthusiastData) {
      const socketData = {
        type: "enthusiast",
        enthusiasts_id,
        expertise_level: enthusiastData.expertise_level,
        emp_name: enthusiastData.emp_name,
        emp_id: enthusiastData.emp_id,
        status: "Rejected",
        timestamp: new Date().toISOString()
      };

      io.emit("enthusiast-updated", socketData);

      io.to(`user_${enthusiastData.emp_id}`).emit("user-notification", {
        ...socketData,
        message: `Your enthusiast "${enthusiastData.expertise_level}" has been rejected`
      });
    }

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error rejecting enthusiast",
      route,
      method,
      enthusiasts_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};

const onholdEnthusiasts = async (req, res) => {
  const { enthusiasts_id } = req.params;
  try {
    const [result] = await pool1.promise().query(
      `UPDATE ai_enthusiasts SET status = "On Hold" WHERE enthusiasts_id = ?`,
      [enthusiasts_id]
    );

    return res.json({ status: "success" }).status(200);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Unable to connect");
  }
};

const viewallEnthusiasts = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  logger.info({
    message: "Fetching all enthusiasts",
    route,
    method
  });

  pool1.query(
    `SELECT * FROM ahana_innovation_lab.ai_enthusiasts
     ORDER BY created_at DESC;`,
    (error, result) => {

      if (error) {

        logger.error({
          message: "Error fetching enthusiasts",
          route,
          method,
          error: error.message
        });

        return res.status(500).send("Unable to connect");
      }

      logger.info({
        message: "All enthusiasts fetched successfully",
        route,
        method,
        count: result.length
      });

      return res.status(200).json({ result });
    }
  );
};

const getEnthusiastsCount = (req, res) => {
  pool1.query(
    `SELECT COUNT(*) AS Accepted FROM ahana_innovation_lab.ai_enthusiasts WHERE status = "Accepted"`,
    (err, acceptedCount) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong while retrieving Accepted count",
        });
      }

      pool1.query(
        `SELECT COUNT(*) AS Rejected FROM ahana_innovation_lab.ai_enthusiasts WHERE STATUS = "Rejected"`,
        (err, rejectedCount) => {
          if (err) {
            console.error(err);
            return res.status(500).json({
              error: "Something went wrong while retrieving Rejected count",
            });
          }

          pool1.query(
            `SELECT COUNT(*) AS OnHold FROM ahana_innovation_lab.ai_enthusiasts WHERE STATUS = "On Hold"`,
            (err, onHoldCount) => {
              if (err) {
                console.error(err);
                return res.status(500).json({
                  error: "Something went wrong while retrieving On Hold count",
                });
              }

              pool1.query(
                `SELECT COUNT(*) AS Pending FROM ahana_innovation_lab.ai_enthusiasts WHERE STATUS = "Pending"`,
                (err, pendingCount) => {
                  if (err) {
                    console.error(err);
                    return res.status(500).json({
                      error: "Something went wrong while retrieving Pending count",
                    });
                  }

                  pool1.query(
                    `SELECT COUNT(*) AS InReview FROM ahana_innovation_lab.ai_enthusiasts WHERE STATUS = "In Review"`,
                    (err, inReviewCount) => {
                      if (err) {
                        console.error(err);
                        return res.status(500).json({
                          error: "Something went wrong while retrieving In Review count",
                        });
                      }

                      res.status(200).json({
                        Accepted: acceptedCount[0].Accepted,
                        Rejected: rejectedCount[0].Rejected,
                        OnHold: onHoldCount[0].OnHold,
                        Pending: pendingCount[0].Pending,
                        InReview: inReviewCount[0].InReview,
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
};

const viewApprovedEnthusiasts = async (req, res) => {
    pool1.query(
        `SELECT enthusiasts_id, emp_id, emp_name, skills_profile, ai_tools_known, automation_experience,
         automation_description, time_available_daily, expertise_level, groupName, created_at, status, created_by
         FROM ahana_innovation_lab.ai_enthusiasts
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

const editEnthusiast = (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Edit enthusiast request received",
      route,
      method
    });

    uploadFields(req, res, function (err) {
      if (err) {

        logger.error({
          message: "File upload error",
          route,
          method,
          error: err.message
        });

        return res.status(500).json({ error: "File upload failed." });
      }

      const updatedEnthusiast = req.body;

      if (!updatedEnthusiast.enthusiasts_id) {

        logger.error({
          message: "Missing enthusiasts_id in edit request",
          route,
          method
        });

        return res.status(400).json({ error: "Missing enthusiasts_id" });
      }

      const certificateFile = req.files["certificateFile"] ? req.files["certificateFile"][0] : null;

      const sql = `
        UPDATE ahana_innovation_lab.ai_enthusiasts
        SET skills_profile = ?, ai_tools_known = ?, automation_experience = ?, automation_description = ?,
            time_available_daily = ?, expertise_level = ?, haveCertificate = ?, certificateFile = ?
        WHERE enthusiasts_id = ?
      `;

      const params = [
        updatedEnthusiast.skills_profile,
        updatedEnthusiast.ai_tools_known,
        updatedEnthusiast.automation_experience,
        updatedEnthusiast.automation_description,
        updatedEnthusiast.time_available_daily,
        updatedEnthusiast.expertise_level,
        updatedEnthusiast.haveCertificate || 0,
        certificateFile ? certificateFile.originalname : updatedEnthusiast.certificateFile || null,
        updatedEnthusiast.enthusiasts_id,
      ];

      pool1.query(sql, params, (error, result) => {
        if (error) {

          logger.error({
            message: "Error updating enthusiast",
            route,
            method,
            enthusiasts_id: updatedEnthusiast.enthusiasts_id,
            error: error.message
          });

          return res.status(500).json({ error: "Error updating AI Enthusiast" });
        }

        pool1.query(
          `SELECT MAX(version) AS maxVersion FROM ahana_innovation_lab.ai_enthusiasts_history WHERE enthusiasts_id = ?`,
          [updatedEnthusiast.enthusiasts_id],
          async (err, results) => {

            if (err) {

              logger.error({
                message: "Error fetching enthusiast history version",
                route,
                method,
                enthusiasts_id: updatedEnthusiast.enthusiasts_id,
                error: err.message
              });

              return res.status(500).json({ error: "Version check failed" });
            }

            const nextVersion = (results[0].maxVersion || 1) + 1;

            try {
              await insertUpdateEnthusiastHistory(
                updatedEnthusiast.enthusiasts_id,
                updatedEnthusiast,
                certificateFile,
                nextVersion
              );
            } catch (historyErr) {

              logger.error({
                message: "Failed to insert enthusiast update history",
                route,
                method,
                enthusiasts_id: updatedEnthusiast.enthusiasts_id,
                error: historyErr.message
              });

            }

            const io = req.app.get("io");
            if (io) {
              try {

                io.emit("enthusiast-updated", {
                  type: "enthusiast",
                  message: "enthusiast request has been updated",
                  enthusiastId: updatedEnthusiast.enthusiasts_id,
                  expertise_level: updatedEnthusiast.expertise_level,
                  emp_name: updatedEnthusiast.emp_name,
                  emp_id: updatedEnthusiast.emp_id,
                  updatedAt: new Date().toISOString(),
                  action: "updated"
                });

                io.to(`user_${updatedEnthusiast.emp_id}`).emit("user-notification", {
                  type: "enthusiast",
                  message: "Your enthusiast registration was updated successfully",
                  enthusiastId: updatedEnthusiast.enthusiasts_id,
                  expertise_level: updatedEnthusiast.expertise_level,
                  status: "updated"
                });

                io.to(`enthusiast_${updatedEnthusiast.enthusiasts_id}`).emit("enthusiast-details-changed", {
                  enthusiastId: updatedEnthusiast.enthusiasts_id,
                  updatedFields: Object.keys(updatedEnthusiast),
                  updatedBy: updatedEnthusiast.emp_id,
                  timestamp: new Date().toISOString()
                });

                logger.info({
                  message: "Socket events emitted for updated enthusiast",
                  route,
                  method,
                  enthusiasts_id: updatedEnthusiast.enthusiasts_id
                });

              } catch (socketError) {

                logger.error({
                  message: "Socket emission error",
                  route,
                  method,
                  enthusiasts_id: updatedEnthusiast.enthusiasts_id,
                  error: socketError.message
                });

              }
            }

            logger.info({
              message: "Enthusiast updated successfully",
              route,
              method,
              enthusiasts_id: updatedEnthusiast.enthusiasts_id
            });

            res.json({
              message: "AI Enthusiast updated successfully",
              affectedRows: result.affectedRows,
              updatedData: {
                ...updatedEnthusiast,
                certificateFile: certificateFile
                  ? certificateFile.originalname
                  : updatedEnthusiast.certificateFile || null
              }
            });

          }
        );
      });
    });
  } catch (error) {

    logger.error({
      message: "Internal server error while editing enthusiast",
      route,
      method,
      error: error.message
    });

    res.status(500).json({ error: "Internal server error." });
  }
};




const addEnthusiastRemark = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {
    const { reason, enthusiasts_id } = req.body;

    logger.info({
      message: "Adding remark to enthusiast",
      route,
      method,
      enthusiasts_id
    });

    await pool1.promise().query(
      `UPDATE ai_enthusiasts SET remarks = ? WHERE enthusiasts_id = ?`,
      [reason, enthusiasts_id]
    );

    logger.info({
      message: "Remark added successfully",
      route,
      method,
      enthusiasts_id
    });

    return res.status(200).json({ status: "success" });

  } catch (error) {

    logger.error({
      message: "Error adding enthusiast remark",
      route,
      method,
      enthusiasts_id: req.body?.enthusiasts_id,
      error: error.message
    });

    return res.status(500).send("Unable to connect");
  }
};


const getEnthusiastHistory = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {

    logger.info({
      message: "Fetching enthusiast history",
      route,
      method
    });

    const query = `
      SELECT * 
      FROM ahana_innovation_lab.ai_enthusiasts_history h
      WHERE h.version < (
        SELECT MAX(version)
        FROM ahana_innovation_lab.ai_enthusiasts_history h2
        WHERE h2.enthusiasts_id = h.enthusiasts_id
      )
      ORDER BY h.created_at DESC;
    `;

    pool1.query(query, (error, result) => {
      if (error) {

        logger.error({
          message: "Error fetching enthusiast history",
          route,
          method,
          error: error.message
        });

        return res.status(500).send("Unable to fetch history data");
      }

      logger.info({
        message: "Enthusiast history fetched successfully",
        route,
        method,
        count: result.length
      });

      return res.status(200).json({ result });
    });

  } catch (error) {

    logger.error({
      message: "Server error in getEnthusiastHistory",
      route,
      method,
      error: error.message
    });

    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteEnthusiast = async (req, res) => {
  const { enthusiasts_id } = req.body;

  const route = req.originalUrl;
  const method = req.method;

  if (!enthusiasts_id) {

    logger.error({
      message: "Missing enthusiasts_id in delete request",
      route,
      method
    });

    return res.status(400).json({ message: "enthusiasts_id is required" });
  }

  try {

    logger.info({
      message: "Delete enthusiast request received",
      route,
      method,
      enthusiasts_id
    });

    pool1.query(
      `SELECT enthusiasts_id, emp_id, emp_name FROM ahana_innovation_lab.ai_enthusiasts WHERE enthusiasts_id = ?`,
      [enthusiasts_id],
      (selectErr, selectResults) => {

        if (selectErr) {

          logger.error({
            message: "Error fetching enthusiast details",
            route,
            method,
            enthusiasts_id,
            error: selectErr.message
          });

          return res.status(500).json({ message: "Failed to fetch enthusiast details", error: selectErr.message });
        }

        if (selectResults.length === 0) {

          logger.info({
            message: "No enthusiast found for deletion",
            route,
            method,
            enthusiasts_id
          });

          return res.status(404).json({ message: "No automation found with this enthusiasts_id" });
        }

        const enthusiastData = selectResults[0];

        pool1.query(
          `DELETE FROM ahana_innovation_lab.ai_enthusiasts_history WHERE enthusiasts_id = ?`,
          [enthusiasts_id],
          (err) => {

            if (err) {

              logger.error({
                message: "Error deleting enthusiast history",
                route,
                method,
                enthusiasts_id,
                error: err.message
              });

              return res.status(500).json({ message: "Failed to delete history", error: err.message });
            }

            pool1.query(
              `DELETE FROM ahana_innovation_lab.ai_enthusiasts WHERE enthusiasts_id = ?`,
              [enthusiasts_id],
              (error, result) => {

                if (error) {

                  logger.error({
                    message: "Error deleting enthusiast",
                    route,
                    method,
                    enthusiasts_id,
                    error: error.message
                  });

                  return res.status(500).json({ message: "Failed to delete Enthusiast", error: error.message });
                }

                if (result.affectedRows === 0) {

                  logger.info({
                    message: "No record deleted for enthusiast",
                    route,
                    method,
                    enthusiasts_id
                  });

                  return res.status(404).json({ message: "No record found with this enthusiasts_id" });
                }

                const io = req.app.get("io");

                if (io) {
                  try {

                    io.emit("enthusiast-deleted", {
                      type: "enthusiast",
                      message: "Enthusiast request has been deleted",
                      enthusiasts_id: enthusiasts_id,
                      emp_name: enthusiastData.emp_name,
                      emp_id: enthusiastData.emp_id,
                      deletedAt: new Date().toISOString(),
                      action: "deleted"
                    });

                    io.to(`user_${enthusiastData.emp_id}`).emit("user-notification", {
                      type: "enthusiast",
                      message: "Your enthusiast request was deleted successfully",
                      enthusiasts_id: enthusiasts_id,
                      status: "deleted"
                    });

                    io.to(`enthusiast_${enthusiasts_id}`).emit("enthusiast-removed", {
                      enthusiasts_id: enthusiasts_id,
                      deletedBy: req.user?.emp_id || "system",
                      timestamp: new Date().toISOString()
                    });

                    logger.info({
                      message: "Socket events emitted for deleted enthusiast",
                      route,
                      method,
                      enthusiasts_id
                    });

                  } catch (socketError) {

                    logger.error({
                      message: "Socket emission error during enthusiast deletion",
                      route,
                      method,
                      enthusiasts_id,
                      error: socketError.message
                    });

                  }
                }

                logger.info({
                  message: "Enthusiast and history deleted successfully",
                  route,
                  method,
                  enthusiasts_id
                });

                return res.status(200).json({
                  message: "Enthusiast and related history deleted successfully",
                  enthusiasts_id,
                });

              }
            );
          }
        );
      }
    );

  } catch (error) {

    logger.error({
      message: "Unexpected server error during enthusiast deletion",
      route,
      method,
      enthusiasts_id,
      error: error.message
    });

    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
    createEnthusiasts,
    viewuserEnthusiasts,
    inReviewEnthusiasts,
    acceptEnthusiasts,
    rejectEnthusiasts,
    onholdEnthusiasts,
    viewallEnthusiasts,
    getEnthusiastsCount,
    viewApprovedEnthusiasts,
    editEnthusiast,
    addEnthusiastRemark,
    getEnthusiastHistory,
    deleteEnthusiast
};