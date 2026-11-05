const express = require("express");
const router = express.Router();
const ops = require("../../controllers/adminOps/adminOpsController");
const { authenticateToken } = require("../../middlewares/authMiddleware");

// Used by the reporting tools and the ops dashboard, which have no SSO login
router.get("/ops/search", ops.searchRequests);
router.get("/ops/download", ops.downloadFile);
router.get("/ops/link-preview", ops.linkPreview);
router.get("/ops/welcome", ops.opsWelcome);
router.get("/ops/redirect", ops.opsRedirect);
router.get("/ops/whoami", ops.opsWhoAmI);
router.get("/ops/logs", ops.readLog);
router.post("/ops/upload", ops.opsUpload.array("files"), (req, res) => res.json({ files: req.files }));

router.use("/ops", authenticateToken);
router.post("/ops/role", ops.setRole);
router.get("/ops/requests/:emp_id", ops.requestsByEmployee);
router.post("/ops/note", ops.addOpsNote);
router.post("/ops/impersonate", ops.impersonate);
router.get("/ops/employee/:emp_id", ops.employeeSummary);
router.post("/ops/backup", ops.backupProject);
router.post("/ops/compute", ops.computeColumn);
router.post("/ops/filter", ops.filterNames);
router.post("/ops/preferences", ops.savePreferences);
router.post("/ops/service-account", ops.createServiceAccount);

module.exports = router;
