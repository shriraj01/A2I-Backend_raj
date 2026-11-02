const { pool1 } = require("../../dbConfig/connect");
const logger = require("../../utils/logger");

const getAllStatusCount = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { year } = req.query;
  const ALLOWED_TABLES = Object.freeze(["automation_requests", "innovationtask_details", "support_requests"]);

  try {
    const getCounts = (table) =>
      new Promise((resolve, reject) => {
        if (!ALLOWED_TABLES.includes(table)) {
          return reject(new Error("Invalid table name"));
        }
        let sql = `
          SELECT status, COUNT(*) AS count 
          FROM ${table}
          GROUP BY status
        `;
        pool1.query(sql, [], (err, rows) => {
          if (err) {
            logger.error({
              message: "Database query failed",
              route,
              method,
              table,
              error: err.message
            });
            return reject(err);
          }

          const data = {
            "Under Review": 0,
            "On Hold": 0,
            "Rejected": 0,
            "Accepted": 0,
            "Assigned": 0,
            "Approved": 0,
            "In Progress": 0,
            "Completed": 0
          };

          const rawData = {};

          const normalizeStatus = (st) => {
            if (!st) return "Under Review";
            const s = st.trim();
            if (s === "InProgress" || s === "In Progress" || s === "In-Progress") return "In Progress";
            if (s === "Declined" || s === "Rejected") return "Rejected";
            if (s === "Merged" || s === "Under Review" || s === "UnderReview") return "Under Review";
            if (s === "On Hold" || s === "OnHold" || s === "Hold") return "On Hold";
            if (s === "Accepted" || s === "BRD Submitted" || s === "BRD Approved" || s === "Proposal Shared" || s === "Proposal/Budget Approved") return "Accepted";
            if (s === "Assigned") return "Assigned";
            if (s === "Approved") return "Approved";
            if (s === "Completed" || s === "Complete") return "Completed";
            return s;
          };

          if (rows && rows.length > 0) {
            rows.forEach((r) => {
              if (r.status) {
                rawData[r.status] = (rawData[r.status] || 0) + r.count;
              }
              let st = normalizeStatus(r.status);
              if (st && data.hasOwnProperty(st)) {
                data[st] += r.count;
              } else if (st) {
                data[st] = r.count;
              }
            });
          }

          resolve({ data, rawData });
        });
      });

    const [aObj, iObj, suObj] = await Promise.all([
      getCounts("automation_requests"),
      getCounts("innovationtask_details"),
      getCounts("support_requests"),
    ]);

    const a = aObj.data;
    const i = iObj.data;
    const su = suObj.data;

    const sum = (s) => (a[s] || 0) + (i[s] || 0) + (su[s] || 0);

    const totalCount = {
      accepted: sum("Accepted"),
      rejected: sum("Rejected"),
      underReview: sum("Under Review"),
      onHold: sum("On Hold"),
      inProgress: sum("In Progress"),
      completed: sum("Completed"),
      assigned: sum("Assigned"),
      approved: sum("Approved"),
    };

    const categoryCounts = {
      Automation: a,
      Innovation: i,
      Support: su
    };

    const rawCategoryCounts = {
      Automation: aObj.rawData,
      Innovation: iObj.rawData,
      Support: suObj.rawData
    };

    logger.info({
      message: "Status counts calculated successfully",
      route,
      method,
      totalCount,
      categoryCounts
    });

    res.json({
      success: true,
      totalCount,
      categoryCounts,
      rawCategoryCounts
    });

  } catch (err) {
    logger.error({
      message: "Error fetching status counts",
      route,
      method,
      error: err.message
    });

    res.status(500).json({
      success: false,
      message: "Error fetching counts"
    });
  }
};

const getRequestCountMonthWise = async (req, res) => {
  const { year } = req.query;
  const route = req.originalUrl;
  const method = req.method;

  // 1. KEEP: Database connection check
  if (!pool1) {
    logger.error({
      message: "Database connection pool not available",
      route,
      method
    });
    return res.status(500).json({ success: false, message: "Database connection failed" });
  }

  let validatedYear = null;
  if (year !== undefined && year !== null && String(year).trim() !== "") {
    const trimmedYear = String(year).trim();
    if (!/^\d{4}$/.test(trimmedYear)) {
      return res.status(400).json({ success: false, message: "Invalid year format. Must be a 4-digit year (e.g. 2026)" });
    }
    const parsedYear = parseInt(trimmedYear, 10);
    if (parsedYear < 2000 || parsedYear > 2100) {
      return res.status(400).json({ success: false, message: "Year out of acceptable range (2000-2100)" });
    }
    validatedYear = parsedYear;
  }

  try {
    const tables = {
      automation_requests: "Automation",
      innovationtask_details: "Innovation",
      support_requests: "Support",
    };

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthData = monthNames.map(() => ({ total: 0, Automation: 0, Innovation: 0, Support: 0 }));

    for (const [table, label] of Object.entries(tables)) {

      const rows = await new Promise((resolve, reject) => {
        pool1.query(
          `SELECT MONTH(created_at) AS month, COUNT(*) AS count 
           FROM ${table} 
           WHERE created_at IS NOT NULL 
           ${validatedYear ? "AND YEAR(created_at) = ?" : ""}
           GROUP BY MONTH(created_at)`,
          validatedYear ? [validatedYear] : [],
          (err, results) => {
            if (err) {
              // 2. KEEP: Error with context
              logger.error({
                message: "Database query failed",
                route,
                method,
                table,
                year: validatedYear || "all years",
                error: err.message
              });
              reject(err);
            } else {
              resolve(results);
            }
          }
        );
      });

      rows.forEach(({ month, count }) => {
        monthData[month - 1][label] = count;
        monthData[month - 1].total += count;
      });
    }

    const result = monthNames.map((name, i) => ({
      month: name,
      total: monthData[i].total,
      Automation: monthData[i].Automation,
      Innovation: monthData[i].Innovation,
      Support: monthData[i].Support,
    }));

    // 3. KEEP: Success with summary (works for both empty and non-empty)
    logger.info({
      message: "Month-wise counts fetched",
      route,
      method,
      year: year || "all years",
      totalRequests: result.reduce((sum, m) => sum + m.total, 0),
      monthsWithData: result.filter(m => m.total > 0).length
    });

    res.json({ success: true, result });

  } catch (error) {
    // 4. KEEP: Catch block
    logger.error({
      message: "Error fetching month-wise counts",
      route,
      method,
      year: year || "all years",
      error: error.message
    });

    res.status(500).json({ success: false, message: "Error fetching month-wise data" });
  }
};



// const getAllDetails = async (req, res) => {
//   const route = req.originalUrl;
//   const method = req.method;
//   const { year } = req.query;

//   // 1. INFO: Entry point
//   logger.info({ message: "Fetching all details", route, method, year: year || "all years" });

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

//     const [results1, results2, results3] = await Promise.all([
//       new Promise(resolve => {
//         pool1.query(query1, [year], (err, results) => {
//           if (err) {
//             // 2. ERROR: Automation query failed
//             logger.error({ message: "Automation query failed", route, method, error: err.message });
//             resolve([]);
//           } else resolve(results || []);
//         });
//       }),
//       new Promise(resolve => {
//         pool1.query(query2, [year], (err, results) => {
//           if (err) {
//             // 3. ERROR: Innovation query failed
//             logger.error({ message: "Innovation query failed", route, method, error: err.message });
//             resolve([]);
//           } else resolve(results || []);
//         });
//       }),
//       new Promise(resolve => {
//         pool1.query(query3, [year], (err, results) => {
//           if (err) {
//             // 4. ERROR: Support query failed
//             logger.error({ message: "Support query failed", route, method, error: err.message });
//             resolve([]);
//           } else resolve(results || []);
//         });
//       }),
//     ]);

//     const allData = [...results1, ...results2, ...results3];

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

//     allDataWithMessages.sort((a, b) => {
//       const dateA = a.latest_message ? new Date(a.latest_message.created_at) : new Date(a.created_at);
//       const dateB = b.latest_message ? new Date(b.latest_message.created_at) : new Date(b.created_at);
//       return dateB - dateA;
//     });

//     // 5. INFO: Success with counts
//     logger.info({
//       message: "All details fetched successfully",
//       route,
//       method,
//       year: year || "all years",
//       totalRecords: allData.length,
//       automationCount: results1.length,
//       innovationCount: results2.length,
//       supportCount: results3.length,
//       withMessages: allDataWithMessages.filter(r => r.message_count > 0).length
//     });

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
//     // 6. ERROR: Catch block
//     logger.error({ message: "Error in getAllDetails", route, method, error: error.message, stack: error.stack });
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       message: 'Failed to fetch details'
//     });
//   }
// };

const getAllDetails = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { year } = req.query;

  if (year !== undefined && year !== null && String(year).trim() !== "") {
    const trimmedYear = String(year).trim();
    if (!/^\d{4}$/.test(trimmedYear)) {
      return res.status(400).json({ success: false, message: "Invalid year format. Must be a 4-digit year (e.g. 2026)" });
    }
    const parsedYear = parseInt(trimmedYear, 10);
    if (parsedYear < 2000 || parsedYear > 2100) {
      return res.status(400).json({ success: false, message: "Year out of acceptable range (2000-2100)" });
    }
  }

  // 1. INFO: Entry point
  logger.info({ message: "Fetching all details", route, method, year: year || "all years" });

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

    const [results1, results2, results3] = await Promise.all([
      new Promise(resolve => {
        pool1.query(query1, [], (err, results) => {
          if (err) {
            // 2. ERROR: Automation query failed
            logger.error({ message: "Automation query failed", route, method, error: err.message });
            resolve([]);
          } else resolve(results || []);
        });
      }),
      new Promise(resolve => {
        pool1.query(query2, [], (err, results) => {
          if (err) {
            // 3. ERROR: Innovation query failed
            logger.error({ message: "Innovation query failed", route, method, error: err.message });
            resolve([]);
          } else resolve(results || []);
        });
      }),
      new Promise(resolve => {
        pool1.query(query3, [], (err, results) => {
          if (err) {
            // 4. ERROR: Support query failed
            logger.error({ message: "Support query failed", route, method, error: err.message });
            resolve([]);
          } else resolve(results || []);
        });
      }),
    ]);

    const allData = [...results1, ...results2, ...results3];

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

    allDataWithMessages.sort((a, b) => {
      const dateA = a.latest_message ? new Date(a.latest_message.created_at) : new Date(a.created_at);
      const dateB = b.latest_message ? new Date(b.latest_message.created_at) : new Date(b.created_at);
      return dateB - dateA;
    });

    // 5. INFO: Success with counts
    logger.info({
      message: "All details fetched successfully",
      route,
      method,
      year: year || "all years",
      totalRecords: allData.length,
      automationCount: results1.length,
      innovationCount: results2.length,
      supportCount: results3.length,
      withMessages: allDataWithMessages.filter(r => r.message_count > 0).length
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
    // 6. ERROR: Catch block
    logger.error({ message: "Error in getAllDetails", route, method, error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Failed to fetch details'
    });
  }
};

module.exports = { getAllStatusCount, getRequestCountMonthWise, getAllDetails };
