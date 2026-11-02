const { pool1 } = require("../../dbConfig/connect");
const logger = require("../../utils/logger");
const axios = require('axios');
const https = require("https");

const ahanainnovationLogin = async (req, res) => {
try {
  // ADDED: Check database connection pool
  if (!pool1) {
    logger.error({
      message: "Database connection pool not available",
      route: req.originalUrl,
      method: req.method
    });
    return res.status(500).json({ error: "Database connection failed" });
  }

    let bodyData = req.body?.userData || req.body || {};
    let emp_id = bodyData.emp_id || req.user?.emp_id;
    let emp_email = bodyData.emp_email || req.user?.email || req.user?.emp_email || req.user?.email_id;
    let emp_password = bodyData.emp_password;

    const route = req.originalUrl;
    const method = req.method;

    const rawAuthHeader = req.headers.authorization || req.headers.Authorization;
    const authToken = rawAuthHeader?.replace(/^Bearer\s+/i, "").trim() || req.user?.myahana_token;
    const useTokenAuth = authToken && !emp_password;

    if (!useTokenAuth) {
      return res.status(400).json({
        message: "Password login not supported in this flow",
      });
    }

    // ─────────────────────────────────────────────
    // Step 1: Fetch user from master.emp
    // ─────────────────────────────────────────────
    let query, params;

    if (emp_id) {
      query = `
        SELECT emp_email, emp_pwd, emp_id, u_id, flag, emp_name
        FROM master.emp
        WHERE emp_id = ? ORDER BY flag = 'Active' DESC
        LIMIT 1
      `;
      params = [emp_id];
    } else if (emp_email) {
      query = `
        SELECT emp_email, emp_pwd, emp_id, u_id, flag, emp_name
        FROM master.emp 
        WHERE emp_email = ? ORDER BY flag = 'Active' DESC
        LIMIT 1
      `;
      params = [emp_email];
    } else {

      // CHANGED: From INFO to ERROR - missing required identifiers
      logger.error({
        message: "Login failed - missing both emp_id and emp_email",
        route,
        method
      });

      return res.status(400).json({
        error: "Either emp_email or emp_id is required",
      });
    }

    pool1.query(query, params, async (error, result) => {
      if (error) {

        logger.error({
          message: "Database error while fetching user",
          route,
          method,
          error: error.message,
          stack: error.stack // Added stack trace for better debugging
        });

        return res.status(500).json({ error: "Database error occurred" }); // Don't expose internal error details
      }

      if (result.length === 0) {

        logger.info({
          message: "Login failed - user not found",
          route,
          method,
          emp_email,
          emp_id
        });

        return res.status(401).json({
          result: "Invalid User",
          message: "User not found",
        });
      }

      const user = result[0];

      if (user.flag !== "Active") {

        logger.info({
          message: "Login blocked - inactive account",
          route,
          method,
          emp_id: user.emp_id,
          status: user.flag
        });

        return res.status(401).json({
          result: "Invalid User",
          message: "User is not active",
        });
      }

      // ─────────────────────────────────────────────
      // Step 2: Call RBAC API
      // ─────────────────────────────────────────────
      let rbacData = null;

      try {
        const instance = axios.create({
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });

        const rbacResponse = await instance.get(
          process.env.RBAC_API_URL,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            timeout: 5000,
          }
        );

        rbacData = rbacResponse.data;

      } catch (rbacError) {
        console.warn("RBAC API failed:", rbacError.message);
        rbacData = null;
      }

      // ─────────────────────────────────────────────
      // Step 3: Process Login with RBAC
      // ─────────────────────────────────────────────
      processUserLoginWithRBAC(user, res, rbacData, authToken);
    });

  } catch (err) {
    console.error("Unexpected Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// Helper: Process User Login with RBAC
// ─────────────────────────────────────────────────────────────────
const processUserLoginWithRBAC = (userRecord, res, rbacData, authToken) => {
  const emp_id = userRecord.emp_id;
  const userid = `${userRecord.u_id}_${emp_id}`;

  // ─────────────────────────────────────────────
  // Step 1: Normalize RBAC Data
  // ─────────────────────────────────────────────
  const rbacArray = Array.isArray(rbacData)
    ? rbacData
    : Array.isArray(rbacData?.associations)
      ? rbacData.associations
      : [];

  const appName = process.env.RBAC_APPLICATION_NAME;

  // Filter roles for this application
  const roles = rbacArray.filter(
    (role) =>
      role.application_name === appName &&
      role.is_active === true
  );

  // ─────────────────────────────────────────────
  // Step 2: If RBAC roles exist → return
  // ─────────────────────────────────────────────
  if (roles.length > 0) {
    const roleResults = roles.map((role) => ({
      emp_id,
      emp_name: userRecord.emp_name,
      designation: role.role_name,
      role_id: role.role_id,
      association_id: role.association_id,
      status: role.is_active === true ? 1 : 0
    }));

    return res.status(200).json({
      status: "success",
      userid,
      result: roleResults[0],
      accessToken: authToken,
      source: "rbac",
      message: "Login successful via RBAC",
    });
  }

  // ─────────────────────────────────────────────
  // Step 3: Fallback → employee_functional
  // ─────────────────────────────────────────────
  pool1.query(
    `
      SELECT 
        ef.emp_id,
        ef.designation,
        ef.group_name AS groupName,
        ef.reporting_mgr AS group_head_id,
        emp.emp_name,
        gh.emp_name AS group_head_name
      FROM hrms.employee_functional AS ef
      INNER JOIN master.emp AS emp 
        ON ef.emp_id = emp.emp_id
      LEFT JOIN master.emp AS gh 
        ON ef.reporting_mgr = gh.emp_id
      WHERE ef.emp_id = ?
    `,
    [emp_id],
    (error, result) => {
      if (error) {
        console.error("Fallback DB Error:", error);
        return res.status(500).json({ error: "Database error occurred" });
      }

      if (result.length === 0) {
        return res.status(404).json({
          result: "Invalid User",
          message: "No RBAC roles and no functional access found",
        });
      }

      return res.status(200).json({
        status: "success",
        userid,
        result: result[0],
        accessToken: authToken,
        rbacDetails: rbacData,
        source: "employee_functional",
        message: "Login successful via fallback",
      });
    }
  );
};

// ─────────────────────────────────────────────────────────────────
// Session validation endpoint
// ─────────────────────────────────────────────────────────────────
const validateSession = async (req, res) => {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() || req.user?.myahana_token;

  if (!token) {
    return res.status(401).json({ valid: false, message: "No token provided" });
  }

  try {
    const myahanaUrl = process.env.MYAHANA_EMPLOYEE_DETAILS_URL;
    if (!myahanaUrl) {
      return res.status(503).json({ valid: false, message: "SSO validation is not configured" });
    }
    const rejectUnauthorized = process.env.REJECT_UNAUTHORIZED === "true";
    const instance = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized }),
    });
    const response = await instance.get(myahanaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    if (response.data && (response.data.emp_id || response.data.employee_id || response.data.userid)) {
      return res.status(200).json({ valid: true, source: "myahana", data: response.data });
    }
    return res.status(401).json({ valid: false, message: "SSO session invalid" });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      return res.status(401).json({ valid: false, message: "SSO session expired" });
    }
    return res.status(503).json({
      valid: false,
      message: "Authentication service unavailable. Please try again.",
    });
  }
};

module.exports = {
    ahanainnovationLogin,
    validateSession,
};