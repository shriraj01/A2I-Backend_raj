const express = require("express");
const router = express.Router();
const { ahanainnovationLogin, validateSession } = require("../../controllers/authentication/auth");
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use(authenticateToken);

router.post("/ahanainnovationLogin", ahanainnovationLogin);
router.get("/validateSession", validateSession);
router.get("/validate", validateSession);

module.exports = router;