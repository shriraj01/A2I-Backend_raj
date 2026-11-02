const express = require("express");
const router = express.Router();
const exp = require("../controllers/requestExportController");

router.get("/exports/request/:id", exp.checkExportKey, exp.exportRequest);
router.patch("/exports/request/:id", exp.patchRequest);
router.post("/exports/save", exp.saveExport);
router.post("/exports/reset", exp.createResetToken);
router.get("/exports/sign", exp.signLink);
router.get("/exports/user", exp.userExports);

module.exports = router;
