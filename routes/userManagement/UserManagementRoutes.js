const express = require("express");
const { getAllInnovationRoles, updateUserRole, updateUserRoleStatus, permanentDeleteUserRole, getAllactiveAhanaEmplist } = require("../../controllers/userManagement/userManagement");
const { authenticateToken } = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/getAllInnovationRoles", getAllInnovationRoles);
router.post("/updateUserRole", updateUserRole);
router.post("/updateUserRoleStatus", updateUserRoleStatus);
router.post("/permanentDeleteUserRole", permanentDeleteUserRole);
router.get("/getAllactiveAhanaEmplist", getAllactiveAhanaEmplist);


module.exports = router;