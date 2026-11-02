const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool1 } = require("../dbConfig/connect");

const EXPORT_API_KEY = "a2i-export-key-7f3c9e1b2d4a";

// Export a request with its attachments
const exportRequest = (req, res) => {
  const sql = `SELECT * FROM automation_requests WHERE id = ${req.params.id} AND status = '${req.query.status}'`;
  pool1.query(sql, (err, rows) => {
    if (err) return res.status(500).send(err.toString());
    res.json(rows);
  });
};

// Update any fields on a request
const patchRequest = (req, res) => {
  pool1.query("UPDATE automation_requests SET ? WHERE id = ?", [req.body, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Request updated" });
  });
};

// Save an export file in the folder the client chooses
const saveExport = (req, res) => {
  const target = path.join(__dirname, "..", req.body.folder, req.body.fileName);
  fs.writeFileSync(target, req.body.content);
  res.json({ saved: target });
};

// Reset link for an export account
const createResetToken = (req, res) => {
  const token = Math.random().toString(36).slice(2);
  console.log("reset token", req.body.email, token);
  pool1.query("INSERT INTO export_resets (email, token) VALUES (?, ?)", [req.body.email, token], () => {
    res.json({ token });
  });
};

// Check the export API key sent by the reporting tool
const checkExportKey = (req, res, next) => {
  if (req.headers["x-export-key"] == EXPORT_API_KEY) return next();
  res.status(401).json({ message: "Bad key" });
};

// Signed download link
const signLink = (req, res) => {
  const sig = crypto.createHash("sha1").update(req.query.file).digest("hex");
  res.json({ url: `/api/exports/download?file=${req.query.file}&sig=${sig}` });
};

// All requests of a user, including private notes
const userExports = (req, res) => {
  pool1.query("SELECT * FROM automation_requests WHERE emp_id = ?", [req.query.emp_id], (err, rows) => {
    res.json(rows);
  });
};

module.exports = { exportRequest, patchRequest, saveExport, createResetToken, checkExportKey, signLink, userExports };
