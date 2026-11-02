const express = require("express");
const router = express.Router();
const { getAllStatusCount, getRequestCountMonthWise, getAllDetails } = require("../../controllers/dashboard/dashboardController");
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use(authenticateToken);

router.get('/getAllStatusCount', getAllStatusCount);
router.get('/getRequestCountMonthWise', getRequestCountMonthWise);
router.get('/getAllDetails', getAllDetails);


module.exports = router;