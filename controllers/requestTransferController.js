const { pool1 } = require("../dbConfig/connect");
const { innovationTransferMail } = require("../emailConfig/mailConfig");
const logger = require("../utils/logger");
const util = require("util");

const transferRequest = async (req, res) => {

  const route = req.originalUrl;
  const method = req.method;

  const { id, from, to } = req.body;

  if (!id || !from || !to)
    return res.status(400).json({ success:false, message:"id, from and to required" });

  const numericId = parseInt(id, 10);
  if (isNaN(numericId) || numericId <= 0 || String(numericId) !== String(id).trim()) {
    return res.status(400).json({ success:false, message:"Invalid request id format" });
  }

  if (from === to)
    return res.status(400).json({ success:false, message:"Invalid transfer request" });

  const ALLOWED_MODULES = Object.freeze(["automation", "support", "innovation"]);
  if (!ALLOWED_MODULES.includes(from) || !ALLOWED_MODULES.includes(to)) {
    return res.status(400).json({ success:false, message:"Invalid module. Allowed modules: automation, support, innovation" });
  }

  const map = {
    automation: { table:"automation_requests", id:"request_id" },
    support: { table:"support_requests", id:"support_request_id" },
    innovation: { table:"innovationtask_details", id:"Innovation_id" }
  };

  const source = Object.prototype.hasOwnProperty.call(map, from) ? map[from] : null;
  const dest = Object.prototype.hasOwnProperty.call(map, to) ? map[to] : null;

  if (!source || !dest)
    return res.status(400).json({ success:false, message:"Invalid module" });

  // promisify connection
  const getConnection = util.promisify(pool1.getConnection).bind(pool1);
  const conn = await getConnection();

  const query = util.promisify(conn.query).bind(conn);
  const beginTransaction = util.promisify(conn.beginTransaction).bind(conn);
  const commit = util.promisify(conn.commit).bind(conn);
  const rollback = util.promisify(conn.rollback).bind(conn);

  try {

    await beginTransaction();

    // Fetch record
    const rows = await query(
      `SELECT * FROM ${source.table} WHERE ${source.id}=?`,
      [numericId]
    );

    if (!rows.length)
      throw new Error("Request not found");

    const r = rows[0];

    if (r.status !== "Under Review")
      throw new Error("Transfer allowed only in Under Review");

    let insertQuery;
    let values;

    // ---------- TO INNOVATION ----------
    if (to === "innovation") {

      insertQuery = `
      INSERT INTO innovationtask_details
      (emp_id, emp_name, idea_name, idea_description,
       upload_path, status, created_by, created_at,
       previous_upload_path,
       A2I_response_id, A2I_response_name, A2I_update_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

      values = [
        r.emp_id,
        r.emp_name,
        r.process_name,
        r.process_description,
        r.process_chart_file,
        r.status,
        r.created_by,
        r.created_at,
        r.previous_file || null,
        r.A2I_response_id || null,
        r.A2I_response_name || null,
        r.A2I_update_date || null
      ];
    }

    // ---------- FROM INNOVATION ----------
    else if (from === "innovation") {

      insertQuery = `
      INSERT INTO ${dest.table}
      (emp_id, emp_name, process_name, process_description,
       process_chart_file, created_by,
       created_at, previous_file,
       A2I_response_id, A2I_response_name, A2I_update_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

      values = [
        r.emp_id,
        r.emp_name,
        r.idea_name,
        r.idea_description,
        r.upload_path,
        r.created_by,
        r.created_at,
        r.previous_upload_path || null,
        r.A2I_response_id || null,
        r.A2I_response_name || null,
        r.A2I_update_date || null
      ];
    }

    // ---------- AUTOMATION ↔ SUPPORT ----------
    else {

      insertQuery = `
      INSERT INTO ${dest.table}
      (emp_id, emp_name, process_name, process_description,
       process_chart_file, request_for, manual_effort_hours,
       manual_expenses, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`;

      values = [
        r.emp_id,
        r.emp_name,
        r.process_name,
        r.process_description,
        r.process_chart_file,
        r.request_for,
        r.manual_effort_hours,
        r.manual_expenses,
        r.created_by,
        r.created_at
      ];
    }

    await query(insertQuery, values);

    if (from === "innovation") {

      await query(
        `DELETE FROM innovationtask_history WHERE Innovation_id=?`,
        [numericId]
      );

    }
    // delete original request
    await query(
      `DELETE FROM ${source.table} WHERE ${source.id}=?`,
      [numericId]
    );

    await commit();

    const empRows = await query(
      `SELECT emp_email FROM master.emp WHERE emp_id = ?`,
      [r.emp_id]
    );

    const emp_email = empRows.length ? empRows[0].emp_email : null;

    if (from === "innovation" || to === "innovation") {
      innovationTransferMail(
        emp_email,
        r.emp_name,
        from,
        to
      );
    }

    logger.info({
      message:"Request transferred successfully",
      route,
      method,
      id,
      from,
      to
    });

    res.json({
      success:true,
      message:`Request transferred from ${from} to ${to}`
    });

  } catch (err) {

    await rollback();

    logger.error({
      message:"Transfer failed",
      route,
      method,
      error:err.message
    });

    res.status(500).json({
      success:false,
      message:err.message
    });

  } finally {
    conn.release();
  }
};

module.exports = { transferRequest };