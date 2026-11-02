const express = require("express");
const router = express.Router();

const {
  CreateInnovation,
  getallEmployess,
  viewuserInnovation,
  accpetInnovation,
  declinInnovation,
  viewallInnovation,
  getinnovationCount,
  viewApprovedInnovation,
  onholdInnovation,
  editInnovation,
  inProgressInnovation,
  completedInnovation,
  addInnovationRemark,
  getInnovationHistory,
  deleteInnovation,
  assignInnovationProject,
  getInnovationProjectDetails,
  getMyInnovationProjects,
  manageInnovationProjectTeam,
  getAllMyInnovationProjectTeams,
  getInnovationProjectTeamDetails,
  editInnovationProjectTeam,
  deleteInnovationProjectTeam,
  approveInnovationProject,
  startInnovationProject,
  endInnovationProject,
  setInnovationProjectOwnerAndCode,
  mergeInnovationIdea,
  updateProgressPercentage,
  updateInnovationStatus
 
} = require("../../controllers/innovationIdea/Innovationlab");
const uploadController = require('../../controllers/uploadController');
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use(authenticateToken);

router.post("/CreateInnovation", CreateInnovation);

router.put("/accpetInnovation/:Innovation_id", accpetInnovation);
router.put("/declinInnovation/:Innovation_id", declinInnovation);
router.put("/onholdInnovation/:Innovation_id", onholdInnovation);
router.put("/inProgressInnovation/:Innovation_id", inProgressInnovation);
router.put("/completedInnovation/:Innovation_id", completedInnovation);

router.get("/getallEmployess", getallEmployess);
router.get("/viewuserInnovation/:emp_id", viewuserInnovation);
router.get("/viewallInnovation", viewallInnovation);
router.get("/getinnovationCount", getinnovationCount);
router.get("/viewapprovedInnovations", viewApprovedInnovation)
router.post("/editInnovation", editInnovation);
router.put("/addInnovationRemark", addInnovationRemark);

router.get("/getInnovationHistory", getInnovationHistory);
router.post("/deleteInnovation", deleteInnovation);
router.post("/assignInnovationProject", assignInnovationProject);
router.get("/getMyInnovationProjects/:emp_id", getMyInnovationProjects);
router.post("/manageInnovationProjectTeam", manageInnovationProjectTeam);
router.get("/getAllMyInnovationProjectTeams/:emp_id", getAllMyInnovationProjectTeams);
router.get("/getInnovationProjectTeamDetails/:Innovation_id", getInnovationProjectTeamDetails);
router.put("/editInnovationProjectTeam/:team_id", editInnovationProjectTeam);
router.delete("/deleteInnovationProjectTeam/:team_id", deleteInnovationProjectTeam);
router.put("/approveInnovationProject", approveInnovationProject);
router.put("/startInnovationProject/:Innovation_id", startInnovationProject);
router.put("/endInnovationProject/:Innovation_id", endInnovationProject);
router.get("/getInnovationProjectDetails/:Innovation_id", getInnovationProjectDetails);
router.put("/setInnovationProjectOwnerAndCode", setInnovationProjectOwnerAndCode);
router.put("/mergeInnovationIdea", mergeInnovationIdea);
router.post(
  '/uploadInnovationProjectDocument',
  uploadController.uploadMiddleware, // Multer middleware for file upload
  uploadController.uploadInnovationProjectDocument // Controller function
);
router.put('/deleteInnovationProjectDocument', uploadController.deleteInnovationProjectDocument);
router.put('/updateProgressPercentage', updateProgressPercentage);
router.put('/updateInnovationStatus/:Innovation_id', updateInnovationStatus);


module.exports = router;
