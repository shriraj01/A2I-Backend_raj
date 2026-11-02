const express = require("express");
const { addComment, getCommentsWithReactionsAndReplies, addReaction, getReactionCounts, addCommentReaction, addCommentReply } = require("../controllers/commentsAndReactions");
const { authenticateToken } = require("../middlewares/authMiddleware");
const router = express.Router();

router.use(authenticateToken);

router.post("/addComment", addComment);
router.get("/getCommentsWithReactionsAndReplies", getCommentsWithReactionsAndReplies);
router.post("/addReaction", addReaction);
router.get("/getReactionCounts", getReactionCounts);
router.post("/addCommentReaction", addCommentReaction);
router.post("/addCommentReply", addCommentReply);

module.exports = router;