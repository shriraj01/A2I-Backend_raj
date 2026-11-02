const express = require("express");
const { addNote, getMessages, markAsSeen, getUnreadCount } = require("../controllers/messageController");
const { authenticateToken } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/addNote", addNote);
router.get("/getMessages", getMessages);
router.post("/markAsSeen", markAsSeen);
router.get("/unreadCount", getUnreadCount);

module.exports = router;