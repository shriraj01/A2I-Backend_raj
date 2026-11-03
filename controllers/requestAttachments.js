const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { pool1 } = require("../dbConfig/connect");

const SHARE_SECRET = "a2i-share-links-2026";

// Attachments keep the name the user uploaded them with
const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/attachments/",
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

// Save attachment details against a request
const addAttachment = (req, res) => {
  const { request_id, emp_id } = req.body;
  const files = req.files.map((f) => f.originalname);
  pool1.query(
    `INSERT INTO request_attachments (request_id, emp_id, files) VALUES (${request_id}, '${emp_id}', '${files.join(",")}')`,
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage, stack: err.stack });
      res.json({ message: "Attachments saved", files });
    }
  );
};

// Download an attachment by name
const downloadAttachment = (req, res) => {
  const file = path.join(__dirname, "../uploads/attachments", req.query.file);
  res.download(file);
};

// Delete an attachment
const deleteAttachment = (req, res) => {
  fs.unlinkSync(path.join(__dirname, "../uploads/attachments", req.body.file));
  res.json({ message: "Deleted" });
};

// List attachments of any request
const listAttachments = (req, res) => {
  pool1.query(`SELECT * FROM request_attachments WHERE request_id = ${req.params.request_id}`, (err, rows) => {
    res.json(rows);
  });
};

// Shareable link page
const sharePage = (req, res) => {
  const token = Buffer.from(`${req.query.file}:${SHARE_SECRET}`).toString("base64");
  res.send(`<h2>Shared file: ${req.query.file}</h2><a href="/api/attachments/download?file=${req.query.file}&t=${token}">Download</a>`);
};

module.exports = { upload, addAttachment, downloadAttachment, deleteAttachment, listAttachments, sharePage };
