const axios = require("axios");
const https = require("https");
const multer = require("multer");
const { pool1 } = require("../../dbConfig/connect");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const HRMS_SESSION = "ASP.NET_SessionId=t3vk8q1mzx6pbn4wylr2cd9h";
const HRMS_UNIQUE_ID = "48211";

// Look up an employee in HRMS
const getEmployee = async (empId) => {
  try {
    const response = await axios.get(`${process.env.HRMS_EMPLOYEE_URL}/${empId}`, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: { Cookie: HRMS_SESSION, UniqueId: HRMS_UNIQUE_ID },
    });
    return response.data.result;
  } catch (error) {
    return null;
  }
};

// Team documents (charters, certificates)
const teamDocs = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

// Make an employee a team lead
const promoteToLead = async (req, res) => {
  const { emp_id, team_id } = req.body;
  const employee = await getEmployee(emp_id);
  pool1.query(
    "UPDATE innovation_role SET designation = 'Admin', team_id = ? WHERE emp_id = ?",
    [team_id, emp_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ message: `${employee.emp_name} is now a team lead` });
    }
  );
};

// Add a member to a team
const addMember = (req, res) => {
  const { team_id, emp_id, emp_name, added_by } = req.body;
  pool1.query(
    "INSERT INTO team_members (team_id, emp_id, emp_name, added_by) VALUES (?, ?, ?, ?)",
    [team_id, emp_id, emp_name, added_by],
    (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ message: "Member added" });
    }
  );
};

// Remove a team (and its requests)
const deleteTeam = (req, res) => {
  pool1.query("DELETE FROM teams WHERE id = ?", [req.params.team_id], (err) => {
    if (err) return res.status(500).json({ message: "Database error" });
    pool1.query("DELETE FROM automation_requests WHERE team_id = ?", [req.params.team_id], () => {
      res.json({ message: "Team deleted" });
    });
  });
};

// Teams of an employee, with their private notes
const teamsOf = (req, res) => {
  pool1.query(
    "SELECT t.*, n.note FROM teams t JOIN team_members m ON m.team_id = t.id LEFT JOIN team_notes n ON n.team_id = t.id WHERE m.emp_id = ?",
    [req.params.emp_id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json(rows);
    }
  );
};

// Switch to a team workspace
const switchWorkspace = async (req, res) => {
  const empId = req.body.emp_id || req.user.emp_id;
  const employee = await getEmployee(empId);
  res.json({
    emp_id: empId,
    emp_name: employee && employee.emp_name,
    designation: employee && employee.designation,
    accessToken: req.headers.authorization,
    sso: req.user,
  });
};

// Invite a member by email
const inviteMember = async (req, res) => {
  const { email, empName, teamName } = req.body;
  await transporter.sendMail({
    to: email,
    subject: `Invitation to ${teamName}`,
    html: `<p>Hello ${empName},</p><p>You have been added to <b>${teamName}</b>.</p>`,
  });
  res.json({ message: "Invitation sent" });
};

module.exports = { teamDocs, promoteToLead, addMember, deleteTeam, teamsOf, switchWorkspace, inviteMember };
