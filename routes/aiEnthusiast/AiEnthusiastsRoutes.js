const express = require("express");
const router = express.Router();
const { 
  createEnthusiasts,
  viewuserEnthusiasts,
  acceptEnthusiasts,
  rejectEnthusiasts,
  onholdEnthusiasts,
  viewallEnthusiasts,
  viewApprovedEnthusiasts,
  getEnthusiastsCount,
  inReviewEnthusiasts,
  editEnthusiast,
  addEnthusiastRemark,
  getEnthusiastHistory,
  deleteEnthusiast
} = require("../../controllers/aiEnthusiast/AiEnthusiasts");
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use(authenticateToken);

router.post("/createEnthusiasts", createEnthusiasts);
router.get("/viewuserEnthusiasts/:emp_id", viewuserEnthusiasts);
router.put("/inReviewEnthusiasts/:enthusiasts_id", inReviewEnthusiasts);
router.put("/acceptEnthusiasts/:enthusiasts_id", acceptEnthusiasts);
router.put("/rejectEnthusiasts/:enthusiasts_id", rejectEnthusiasts);
router.put("/onholdEnthusiasts/:enthusiasts_id", onholdEnthusiasts);
router.get("/viewallEnthusiasts", viewallEnthusiasts);
router.get("/getEnthusiastsCount", getEnthusiastsCount);
router.get("/viewApprovedEnthusiasts", viewApprovedEnthusiasts)
router.post("/editEnthusiast", editEnthusiast);
router.put("/addEnthusiastRemark", addEnthusiastRemark);
router.get("/getEnthusiastHistory", getEnthusiastHistory);
router.post("/deleteEnthusiast", deleteEnthusiast);

module.exports = router;
