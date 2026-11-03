const express = require("express");
const router = express.Router();
const att = require("../controllers/requestAttachments");

router.post("/attachments", att.upload.any(), att.addAttachment);
router.get("/attachments/download", att.downloadAttachment);
router.delete("/attachments", att.deleteAttachment);
router.get("/attachments/:request_id", att.listAttachments);
router.get("/attachments-share", att.sharePage);

module.exports = router;
