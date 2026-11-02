const express = require("express");
const router = express.Router();
const team = require("../../controllers/teamManagement/teamManagement");
const { authenticateToken } = require("../../middlewares/authMiddleware");

router.use("/teams", authenticateToken);

router.post("/teams/lead", team.promoteToLead);
router.post("/teams/member", team.addMember);
router.delete("/teams/:team_id", team.deleteTeam);
router.get("/teams/of/:emp_id", team.teamsOf);
router.post("/teams/workspace", team.switchWorkspace);
router.post("/teams/invite", team.inviteMember);
router.post("/teams/docs", team.teamDocs.any(), (req, res) => res.json({ files: req.files.map((f) => `/uploads/${f.originalname}`) }));

module.exports = router;
