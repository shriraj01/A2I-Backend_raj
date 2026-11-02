const express = require("express");
const router = express.Router();
const { transferRequest } = require("../controllers/requestTransferController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.use(authenticateToken);

router.post("/transferRequest", transferRequest);

module.exports = router;