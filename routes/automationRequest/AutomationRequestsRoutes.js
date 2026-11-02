const express = require("express");
const router = express.Router();
const { 
  createAutomationReq,
  viewuserAutomationReq,
  acceptAutomationReq,
  onholdAutomationReq,
  rejectAutomationReq,
  viewallAutomationReq,
  viewApprovedAutomationReq,
  getAutomationReqCount,
  editAutomationReq,
  inProgressAutomationReq,
  completedAutomationReq,
  addAutomationRemark,
  getAutomationHistory,
  deleteAutomation,
  assignAutomationProject,
  getMyAutomationProjects,
  manageAutomationProjectTeam,
  getAllMyProjectTeams,
  approveAutomationProject,
  startProject,
  endProject,
  getProjectTeamDetails,
  deleteAutomationProjectTeam,
  editAutomationProjectTeam,
  getProjectDetails,
  setProjectOwnerAndCode,
  mergeProcess,
  updateAutomationProgressPercentage,
  updateAutomationStatus
} = require("../../controllers/automationRequest/AutomationRequests");
const uploadController = require('../../controllers/uploadController');
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use(authenticateToken);

router.post("/createAutomationReq", createAutomationReq);
router.get("/viewuserAutomationReq/:emp_id", viewuserAutomationReq);
router.put("/acceptAutomationReq/:request_id", acceptAutomationReq);
router.put("/onholdAutomationReq/:request_id", onholdAutomationReq);
router.put("/rejectAutomationReq/:request_id", rejectAutomationReq);
router.put("/inProgressAutomationReq/:request_id", inProgressAutomationReq);
router.put("/completedAutomationReq/:request_id", completedAutomationReq);

router.get("/viewallAutomationReq", viewallAutomationReq);
router.get("/getAutomationReqCount", getAutomationReqCount);
router.get("/viewApprovedAutomationReq", viewApprovedAutomationReq)
router.post("/editAutomationReq", editAutomationReq);
router.put("/addAutomationRemark", addAutomationRemark);
router.get("/getAutomationHistory", getAutomationHistory);
router.post("/deleteAutomation", deleteAutomation);
router.get("/getMyAutomationProjects/:emp_id", getMyAutomationProjects);
router.post("/manageAutomationProjectTeam", manageAutomationProjectTeam);
router.post("/assignAutomationProject", assignAutomationProject);
router.put("/approveAutomationProject", approveAutomationProject);
router.get("/getAllMyProjectTeams/:emp_id", getAllMyProjectTeams);
router.get("/getProjectTeamDetails/:request_id", getProjectTeamDetails);
router.put("/editAutomationProjectTeam/:team_id", editAutomationProjectTeam);
router.delete("/deleteAutomationProjectTeam/:team_id", deleteAutomationProjectTeam);
router.put("/startProject/:request_id", startProject);
router.put("/endProject/:request_id", endProject);
router.get("/getProjectDetails/:request_id", getProjectDetails);
router.put("/setProjectOwnerAndCode", setProjectOwnerAndCode);
router.put("/mergeProcess", mergeProcess);
router.post(
  '/uploadProjectDocument',
  uploadController.uploadMiddleware, // Multer middleware for file upload
  uploadController.uploadProjectDocument // Controller function
);
router.put('/deleteProjectDocument', uploadController.deleteProjectDocument);
router.put('/updateAutomationProgressPercentage', updateAutomationProgressPercentage);
router.put("/updateAutomationStatus/:request_id", updateAutomationStatus);

module.exports = router;
