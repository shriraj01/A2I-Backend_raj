const { pool, pool1 } = require("../../dbConfig/connect");
const axios = require('axios');
const logger = require("../../utils/logger");

const getAllInnovationRoles = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;

  try {
    pool.query(
      `SELECT role_id, emp_id, emp_name, designation, groupName, STATUS 
       FROM ahana_innovation_lab.innovation_role`,
      (error, result) => {
        if (error) {
          // 2. ERROR: Query failed
          logger.error({ 
            message: "Error fetching innovation roles", 
            route, 
            method, 
            error: error.message,
            stack: error.stack 
          });
          return res.status(500).json({ message: "Failed to fetch roles" });
        }

        // 3. INFO: Success with count
        logger.info({ 
          message: "Innovation roles fetched successfully", 
          route, 
          method, 
          roleCount: result.length 
        });

        return res.status(200).json({ result });
      }
    );
  } catch (error) {
    // 4. ERROR: Catch block
    logger.error({ 
      message: "Error in getAllInnovationRoles", 
      route, 
      method, 
      error: error.message,
      stack: error.stack 
    });
    return res.status(500).json({ message: "Server error" });
  }
};

const getAhanaEmployeeById = async (emp_id) => {
  try {
    const tokenResponse = await axios.post(process.env.HRMS_TOKEN_API, {
      EncKey1: process.env.EncKey1,
      EncKey2: process.env.EncKey2,
    }, {
      headers: {
        "Content-Type": "application/json",
        "Cookie": "ASP.NET_SessionId=im0vi4l3zk0tnkkbzzmalinv",
      },
    });

    const token = tokenResponse.data.data[0].Table[0].Token;

    const employeeResponse = await axios.post(process.env.HRMS_EMPLOYEES_API, {
      Token: token,
      UniqueId: "29293",
    }, {
      headers: {
        "Content-Type": "application/json",
        "Cookie": "ASP.NET_SessionId=im0vi4l3zk0tnkkbzzmalinv",
      },
    });

    const employees = employeeResponse.data.data[0].rows || [];

    const employee = employees.find(
      (emp) => emp.Employee_ID === emp_id && emp.Employee_Status === "Active"
    );

    if (!employee) {
      throw new Error("Employee not found or inactive");
    }

      return {
          emp_id: employee.Employee_ID,
          emp_name: employee.Employee_Name,
          department: employee.Name_of_Department,
          status: employee.Employee_Status,
          designation: employee.Employee_Designation
      };
  } catch (error) {
    console.error("Error fetching employee data:", error.message);
    return null;
  }
};


// Update or insert user role
const updateUserRole = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { emp_id, newRole } = req.body;

  
  if (!emp_id || !newRole) {
    // 2. ERROR: Missing fields
    logger.error({ message: "Missing required fields", route, method, emp_id, newRole });
    return res.status(400).json({ message: "emp_id and newRole are required" });
  }

  // Validate role
  if (newRole !== "Admin" && newRole !== "A2I group") {
    // 3. ERROR: Invalid role
    logger.error({ message: "Invalid role", route, method, emp_id, newRole });
    return res.status(400).json({ message: "Invalid role. Only Admin and A2I group are allowed" });
  }


  try {
    const employee = await getAhanaEmployeeById(emp_id);

    pool.query(
      `SELECT * FROM ahana_innovation_lab.innovation_role WHERE emp_id = ?`,
      [emp_id],
      (error, roleResults) => {
        if (error) {
          // 5. ERROR: Database error
          logger.error({ message: "Database error in role update", route, method, emp_id, error: error.message });
          return res.status(500).json({ message: "Database error" });
        }

        const query = roleResults.length > 0
          ? `UPDATE ahana_innovation_lab.innovation_role SET designation = ?, emp_name = ?, STATUS = 1 WHERE emp_id = ?`
          : `INSERT INTO ahana_innovation_lab.innovation_role (emp_id, emp_name, designation, groupName, STATUS) VALUES (?, ?, ?, 'Digital Transformation Services', 1)`;

        const params = roleResults.length > 0
          ? [newRole, employee.emp_name, emp_id]
          : [emp_id, employee.emp_name, newRole];

        pool.query(query, params, (err) => {
          if (err) {
            // 6. ERROR: Update/Insert failed
            logger.error({ message: "Failed to update role", route, method, emp_id, error: err.message });
            return res.status(500).json({ message: "Failed to update role" });
          }

          // 7. INFO: Success
          logger.info({
            message: roleResults.length > 0 ? "Role updated" : "Role assigned",
            route, method, emp_id, newRole
          });

          res.status(200).json({
            message: roleResults.length > 0 ? "Role updated successfully" : "Role assigned successfully",
            emp_id, newRole
          });
        });
      }
    );
  } catch (err) {
    // 8. ERROR: Catch block
    logger.error({ message: "Server error in role update", route, method, emp_id, error: err.message });
    res.status(500).json({ message: "Server Error" });
  }
};

// Toggle user role status
const updateUserRoleStatus = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { role_id, status } = req.body;

  // 1. ERROR: Missing required fields
  if (!role_id || status === undefined) {
    logger.error({ message: "Missing required fields", route, method, role_id, status });
    return res.status(400).json({ message: "role_id and status are required" });
  }

  try {
    pool.query(
      `SELECT role_id, emp_id, emp_name, designation FROM ahana_innovation_lab.innovation_role WHERE role_id = ?`,
      [role_id],
      (error, roleResults) => {
        if (error) {
          // 3. ERROR: Database fetch error
          logger.error({ message: "Error fetching role details", route, method, role_id, error: error.message });
          return res.status(500).json({ message: "Database error" });
        }

        if (roleResults.length === 0) {
          // 4. ERROR: Role not found
          logger.error({ message: "Role not found", route, method, role_id });
          return res.status(404).json({ message: "Role not found" });
        }

        const role = roleResults[0];

        pool.query(
          `UPDATE ahana_innovation_lab.innovation_role SET STATUS = ? WHERE role_id = ?`,
          [status, role_id],
          (updateError, results) => {
            if (updateError) {
              // 5. ERROR: Update failed
              logger.error({ message: "Error updating status", route, method, role_id, error: updateError.message });
              return res.status(500).json({ message: "Failed to update status" });
            }

            // 6. INFO: Success
            const action = status === 1 ? 'activated' : 'deactivated';
            logger.info({ message: `User ${action} successfully`, route, method, role_id, emp_id: role.emp_id, status });

            return res.status(200).json({ 
              message: `User ${action} successfully`,
              role_id, emp_id: role.emp_id, emp_name: role.emp_name, newStatus: status, action
            });
          }
        );
      }
    );
  } catch (err) {
    // 7. ERROR: Catch block
    logger.error({ message: "Server error in status update", route, method, role_id, error: err.message });
    return res.status(500).json({ message: "Server Error" });
  }
};

const permanentDeleteUserRole = async (req, res) => {
  const route = req.originalUrl;
  const method = req.method;
  const { role_id } = req.body;

  // 1. ERROR: Missing required field
  if (!role_id) {
    logger.error({ message: "Missing role_id", route, method });
    return res.status(400).json({ message: "role_id is required" });
  }

  try {
    pool.query(
      `SELECT role_id, emp_id, emp_name, designation FROM ahana_innovation_lab.innovation_role WHERE role_id = ?`,
      [role_id],
      (error, roleResults) => {
        if (error) {
          // 3. ERROR: Database fetch error
          logger.error({ message: "Error fetching role details", route, method, role_id, error: error.message });
          return res.status(500).json({ message: "Database error" });
        }

        if (roleResults.length === 0) {
          // 4. ERROR: Role not found
          logger.error({ message: "Role not found for deletion", route, method, role_id });
          return res.status(404).json({ message: "Role not found" });
        }

        const role = roleResults[0];

        pool.query(
          `DELETE FROM ahana_innovation_lab.innovation_role WHERE role_id = ?`,
          [role_id],
          (deleteError, results) => {
            if (deleteError) {
              // 5. ERROR: Delete failed
              logger.error({ message: "Error deleting role", route, method, role_id, error: deleteError.message });
              return res.status(500).json({ message: "Failed to delete role" });
            }

            // 6. INFO: Success
            logger.info({ 
              message: "Role permanently deleted", 
              route, method, role_id, 
              emp_id: role.emp_id, 
              emp_name: role.emp_name 
            });

            return res.status(200).json({ 
              message: "Role permanently deleted successfully",
              role_id, emp_id: role.emp_id, emp_name: role.emp_name, designation: role.designation
            });
          }
        );
      }
    );
  } catch (err) {
    // 7. ERROR: Catch block
    logger.error({ message: "Server error in permanent delete", route, method, role_id, error: err.message });
    return res.status(500).json({ message: "Server Error" });
  }
};

const getAllactiveAhanaEmplist = async(req, res) => {
  try {
    const tokenResponse = await axios.post(process.env.HRMS_TOKEN_API, {
      EncKey1: process.env.EncKey1,
      EncKey2: process.env.EncKey2,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'ASP.NET_SessionId=im0vi4l3zk0tnkkbzzmalinv'
      }
    });

     const token = tokenResponse.data.data[0].Table[0].Token;
    
    const employeeResponse = await axios.post(process.env.HRMS_EMPLOYEES_API, {
      Token: token,
      UniqueId: "29293"
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'ASP.NET_SessionId=im0vi4l3zk0tnkkbzzmalinv'
      }
    });
    
    // Extract only required fields AND filter for active employees
    const simplifiedData = employeeResponse.data.data[0].rows
      .filter(employee => employee.Employee_Status === "Active")
      .map(employee => ({
        emp_id: employee.Employee_ID,
        emp_name: employee.Employee_Name,
        department: employee.Name_of_Department,
        status: employee.Employee_Status,
        designation: employee.Employee_Designation
      }))
      .sort((a, b) => a.emp_name.localeCompare(b.emp_name));

    logger.info({
      message: "Active Ahana employees fetched",
      employeeCount: simplifiedData.length
    });

     res.json({ data: simplifiedData });
    
  } catch (error) {
    logger.error({
      message: "Failed to fetch Ahana employees",
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: error.message });
  }
};


module.exports = {
  getAllInnovationRoles,
  updateUserRole,
  updateUserRoleStatus,
  permanentDeleteUserRole,
  getAllactiveAhanaEmplist
};