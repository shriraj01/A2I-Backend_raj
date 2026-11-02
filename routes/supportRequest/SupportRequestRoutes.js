const express = require("express");
const router = express.Router();

const { createSupportReq, viewuserSupportReq, editSupportReq, acceptSupportReq,
    onholdSupportReq, rejectSupportReq, inProgressSupportReq, completedSupportReq, viewallSupportReq,
    addSupportRemark,
    getSupportHistory,
    deleteSupport,
    getMySupportProjects,
    manageSupportProjectTeam,
    assignSupportProject,
    approveSupportProject,
    getAllMyProjectTeams,
    getProjectTeamDetails,
    editSupportProjectTeam,
    deleteSupportProjectTeam,
    startProject,
    endProject,
    getProjectDetails,
    setProjectOwnerAndCode,
    mergeProcess,
    updateSupportStatus,
    updateSupportProgressPercentage } = require("../../controllers/supportRequest/SupportRequest");
const uploadController = require('../../controllers/uploadController');
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use(authenticateToken);

router.post("/createSupportReq", createSupportReq);
router.get("/viewuserSupportReq/:emp_id", viewuserSupportReq);
router.post("/editSupportReq", editSupportReq);
router.put("/acceptSupportReq/:support_request_id", acceptSupportReq);
router.put("/onholdSupportReq/:support_request_id", onholdSupportReq);
router.put("/rejectSupportReq/:support_request_id", rejectSupportReq);
router.put("/inProgressSupportReq/:support_request_id", inProgressSupportReq);
router.put("/completedSupportReq/:support_request_id", completedSupportReq);
router.get("/viewallSupportReq", viewallSupportReq);
router.put("/addSupportRemark", addSupportRemark);
router.get("/getSupportHistory", getSupportHistory);
router.post("/deleteSupport", deleteSupport);
router.get("/getMySupportProjects/:emp_id", getMySupportProjects);
router.post("/manageSupportProjectTeam", manageSupportProjectTeam);
router.post("/assignSupportProject", assignSupportProject);
router.put("/approveSupportProject", approveSupportProject);
router.get("/getAllMySupportProjectTeams/:emp_id", getAllMyProjectTeams);
router.get("/getSupportProjectTeamDetails/:support_request_id", getProjectTeamDetails);
router.put("/editSupportProjectTeam/:team_id", editSupportProjectTeam);
router.delete("/deleteSupportProjectTeam/:team_id", deleteSupportProjectTeam);
router.put("/startSupportProject/:support_request_id", startProject);
router.put("/endSupportProject/:support_request_id", endProject);
router.get("/getSupportProjectDetails/:support_request_id", getProjectDetails);
router.put("/setSupportProjectOwnerAndCode", setProjectOwnerAndCode);
router.put("/mergeSupportProcess", mergeProcess);
router.post(
    '/uploadSupportProjectDocument',
    uploadController.uploadMiddleware, // Multer middleware for file upload
    uploadController.uploadSupportProjectDocument // Controller function
);
router.put('/deleteSupportProjectDocument', uploadController.deleteSupportProjectDocument);
router.put('/updateSupportProgressPercentage', updateSupportProgressPercentage);
router.put("/updateSupportStatus/:support_request_id", updateSupportStatus);

module.exports = router;