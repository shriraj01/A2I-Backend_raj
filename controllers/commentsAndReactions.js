const { pool1 } = require("../dbConfig/connect");
const logger = require("../utils/logger");

const addComment = (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    const { request_id, request_type, emp_id, emp_name, comment } = req.body;

    // Single validation log (ERROR only when missing)
    if (!request_id || !request_type || !emp_id || !emp_name || !comment) {
        logger.error({
            message: "Missing required fields for addComment",
            route,
            method,
            request_id,
            request_type,
            emp_id
        });
        return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Single INFO log for the request
    logger.info({
        message: "Adding comment",
        route,
        method,
        request_id,
        request_type,
        emp_id,
        emp_name,
        comment_preview: comment.substring(0, 50) + (comment.length > 50 ? '...' : '')
    });

    try {
        // Step 1: Insert new comment
        pool1.query(
            `INSERT INTO request_comments (request_type, request_id, emp_id, emp_name, comment) VALUES (?, ?, ?, ?, ?)`,
            [request_type, request_id, emp_id, emp_name, comment],
            (err, result) => {
                // ERROR log for DB insert failure
                if (err) {
                    logger.error({
                        message: "DB error adding comment",
                        route,
                        method,
                        request_id,
                        request_type,
                        error: err.message,
                        stack: err.stack
                    });
                    return res.status(500).json({ success: false, message: "DB error adding comment" });
                }

                const newCommentId = result.insertId;

                // Step 2: Fetch all comments with reactions and replies
                pool1.query(
                    `SELECT * FROM request_comments WHERE request_id = ? AND request_type = ? ORDER BY created_at DESC`,
                    [request_id, request_type],
                    (err, comments) => {
                        if (err) {
                            logger.error({
                                message: "DB error fetching comments",
                                route,
                                method,
                                request_id,
                                request_type,
                                error: err.message,
                                stack: err.stack
                            });
                            return res.status(500).json({ success: false, message: "DB error fetching comments" });
                        }
                        
                        if (!comments.length) {
                            logger.info({
                                message: "No comments found after insert",
                                route,
                                method,
                                request_id,
                                request_type
                            });
                            return res.json({ success: true, comments: [] });
                        }

                        const commentIds = comments.map(c => c.id);

                        // Get reactions for all comments
                        pool1.query(
                            `SELECT comment_id, type, COUNT(*) as count FROM comment_reactions WHERE comment_id IN (?) GROUP BY comment_id, type`,
                            [commentIds],
                            (err, reactions) => {
                                if (err) {
                                    logger.error({
                                        message: "DB error fetching reactions",
                                        route,
                                        method,
                                        request_id,
                                        error: err.message,
                                        stack: err.stack
                                    });
                                    return res.status(500).json({ success: false, message: "DB error fetching reactions" });
                                }

                                // Get user reactions
                                pool1.query(
                                    `SELECT comment_id, type FROM comment_reactions WHERE comment_id IN (?) AND emp_id = ?`,
                                    [commentIds, emp_id],
                                    (err, userReactions) => {
                                        if (err) {
                                            logger.error({
                                                message: "DB error fetching user reactions",
                                                route,
                                                method,
                                                request_id,
                                                emp_id,
                                                error: err.message,
                                                stack: err.stack
                                            });
                                            return res.status(500).json({ success: false, message: "DB error fetching user reactions" });
                                        }

                                        // Get replies
                                        pool1.query(
                                            `SELECT * FROM comment_replies WHERE comment_id IN (?) ORDER BY created_at ASC`,
                                            [commentIds],
                                            (err, replies) => {
                                                if (err) {
                                                    logger.error({
                                                        message: "DB error fetching replies",
                                                        route,
                                                        method,
                                                        request_id,
                                                        error: err.message,
                                                        stack: err.stack
                                                    });
                                                    return res.status(500).json({ success: false, message: "DB error fetching replies" });
                                                }

                                                // Combine everything
                                                const commentsWithDetails = comments.map(c => {
                                                    const commentReactions = reactions.filter(r => r.comment_id === c.id);
                                                    const likes = commentReactions.find(r => r.type === 'like')?.count || 0;
                                                    const dislikes = commentReactions.find(r => r.type === 'dislike')?.count || 0;
                                                    const commentReplies = replies.filter(r => r.comment_id === c.id);
                                                    const userReaction = userReactions.find(r => r.comment_id === c.id)?.type || null;

                                                    return {
                                                        ...c,
                                                        likes,
                                                        dislikes,
                                                        userReaction,
                                                        replies: commentReplies
                                                    };
                                                });

                                                // SOCKET EMISSION FOR REAL-TIME COMMENT UPDATES
                                                const io = req.app.get('io');
                                                if (io) {
                                                    try {
                                                        const roomName = `${request_type}_${request_id}`;
                                                        io.to(roomName).emit('comment-added', {
                                                            request_type,
                                                            request_id,
                                                            comment_id: newCommentId,
                                                            emp_id,
                                                            emp_name,
                                                            comment,
                                                            timestamp: new Date().toISOString(),
                                                            total_comments: commentsWithDetails.length
                                                        });

                                                        io.emit('comment-updated', {
                                                            request_type,
                                                            request_id,
                                                            action: 'added',
                                                            emp_name,
                                                            comment_preview: comment.substring(0, 50) + (comment.length > 50 ? '...' : ''),
                                                            timestamp: new Date().toISOString()
                                                        });

                                                        // Single INFO log for socket success
                                                        // logger.info({
                                                        //     message: "Comment socket events emitted",
                                                        //     route,
                                                        //     method,
                                                        //     request_id,
                                                        //     request_type,
                                                        //     comment_id: newCommentId
                                                        // });
                                                    } catch (socketError) {
                                                        // Single ERROR log for socket failure
                                                        logger.error({
                                                            message: "Socket emission error in addComment",
                                                            route,
                                                            method,
                                                            request_id,
                                                            error: socketError.message,
                                                            stack: socketError.stack
                                                        });
                                                    }
                                                }

                                                // Single INFO log for final success
                                                logger.info({
                                                    message: "Comment added successfully",
                                                    route,
                                                    method,
                                                    request_id,
                                                    request_type,
                                                    comment_id: newCommentId,
                                                    comment_count: commentsWithDetails.length
                                                });

                                                return res.status(200).json({
                                                    success: true,
                                                    message: "Comment added successfully",
                                                    comments: commentsWithDetails
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    } catch (err) {
        logger.error({
            message: "Server error in addComment",
            route,
            method,
            request_id,
            request_type,
            error: err.message,
            stack: err.stack
        });
        res.status(500).json({ success: false, message: "Server error" });
    }
};


const getCommentsWithReactionsAndReplies = (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    const { request_id, request_type, emp_id } = req.query;

    // Single validation log (ERROR only when missing)
    if (!request_id || !request_type || !emp_id) {
        logger.error({
            message: "Missing required query params for getComments",
            route,
            method,
            request_id,
            request_type,
            emp_id
        });
        return res.status(400).json({
            success: false,
            message: "request_id, request_type, and emp_id are required",
        });
    }

    // Single INFO log for the request
    logger.info({
        message: "Fetching comments with reactions",
        route,
        method,
        request_id,
        request_type,
        emp_id
    });

    try {
        // Step 1: Get all comments
        pool1.query(
            `SELECT * FROM request_comments WHERE request_id = ? AND request_type = ? ORDER BY created_at DESC`,
            [request_id, request_type],
            (err, comments) => {
                if (err) {
                    logger.error({
                        message: "DB error fetching comments",
                        route,
                        method,
                        request_id,
                        request_type,
                        error: err.message,
                        stack: err.stack
                    });
                    return res.status(500).json({ success: false, message: "DB error fetching comments" });
                }

                if (!comments.length) {
                    logger.info({
                        message: "No comments found",
                        route,
                        method,
                        request_id,
                        request_type
                    });
                    return res.json({ success: true, comments: [] });
                }

                const commentIds = comments.map(c => c.id);

                // Step 2: Get reactions
                pool1.query(
                    `SELECT comment_id, emp_id, emp_name, type FROM comment_reactions WHERE comment_id IN (?)`,
                    [commentIds],
                    (err, reactions) => {
                        if (err) {
                            logger.error({
                                message: "DB error fetching reactions",
                                route,
                                method,
                                request_id,
                                error: err.message,
                                stack: err.stack
                            });
                            return res.status(500).json({ success: false, message: "DB error fetching reactions" });
                        }

                        // Step 3: Get user reactions
                        pool1.query(
                            `SELECT comment_id, type FROM comment_reactions WHERE comment_id IN (?) AND emp_id = ?`,
                            [commentIds, emp_id],
                            (err, userReactions) => {
                                if (err) {
                                    logger.error({
                                        message: "DB error fetching user reactions",
                                        route,
                                        method,
                                        request_id,
                                        emp_id,
                                        error: err.message,
                                        stack: err.stack
                                    });
                                    return res.status(500).json({ success: false, message: "DB error fetching user reactions" });
                                }

                                // Step 4: Get replies
                                pool1.query(
                                    `SELECT * FROM comment_replies WHERE comment_id IN (?) ORDER BY created_at ASC`,
                                    [commentIds],
                                    (err, replies) => {
                                        if (err) {
                                            logger.error({
                                                message: "DB error fetching replies",
                                                route,
                                                method,
                                                request_id,
                                                error: err.message,
                                                stack: err.stack
                                            });
                                            return res.status(500).json({ success: false, message: "DB error fetching replies" });
                                        }

                                        // Step 5: Combine everything
                                        const commentsWithDetails = comments.map(c => {
                                            const commentReactions = reactions.filter(r => r.comment_id === c.id);
                                            const likes = commentReactions.filter(r => r.type === 'like');
                                            const dislikes = commentReactions.filter(r => r.type === 'dislike');

                                            return {
                                                ...c,
                                                likes: likes.length,
                                                dislikes: dislikes.length,
                                                likedUsers: likes.map(r => ({ emp_id: r.emp_id, emp_name: r.emp_name })),
                                                dislikedUsers: dislikes.map(r => ({ emp_id: r.emp_id, emp_name: r.emp_name })),
                                                userReaction: userReactions.find(r => r.comment_id === c.id)?.type || null,
                                                replies: replies.filter(r => r.comment_id === c.id)
                                            };
                                        });

                                        // Single INFO log for successful fetch
                                        logger.info({
                                            message: "Comments fetched successfully",
                                            route,
                                            method,
                                            request_id,
                                            request_type,
                                            comment_count: commentsWithDetails.length,
                                            reaction_count: reactions.length,
                                            reply_count: replies.length
                                        });

                                        res.json({ success: true, comments: commentsWithDetails });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    } catch (err) {
        logger.error({
            message: "Server error in getComments",
            route,
            method,
            request_id,
            request_type,
            error: err.message,
            stack: err.stack
        });
        res.status(500).json({ success: false, message: "Server error" });
    }
};


const addReaction = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    const { request_id, request_type, emp_id, emp_name, type } = req.body;

    // Single validation log (ERROR only when missing)
    if (!request_id || !request_type || !emp_id || !emp_name || !type) {
        logger.error({
            message: "Missing required fields for addReaction",
            route,
            method,
            request_id,
            request_type,
            emp_id,
            type
        });
        return res.status(400).json({ message: "All fields are required" });
    }

    // Single INFO log for the request
    logger.info({
        message: "Processing reaction",
        route,
        method,
        request_id,
        request_type,
        emp_id,
        emp_name,
        type
    });

    try {
        pool1.query(
            `SELECT * FROM ahana_innovation_lab.request_reactions WHERE request_type = ? AND request_id = ? AND emp_id = ?`,
            [request_type, request_id, emp_id],
            (err, results) => {
                if (err) {
                    logger.error({
                        message: "Error checking reaction",
                        route,
                        method,
                        request_id,
                        request_type,
                        emp_id,
                        error: err.message,
                        stack: err.stack
                    });
                    return res.status(500).json({ message: "Database error" });
                }

                if (results.length > 0) {
                    const existingType = results[0].type;

                    if (existingType === type) {
                        // Remove the reaction
                        pool1.query(
                            `DELETE FROM ahana_innovation_lab.request_reactions 
             WHERE request_type = ? AND request_id = ? AND emp_id = ?`,
                            [request_type, request_id, emp_id],
                            (err) => {
                                if (err) {
                                    logger.error({
                                        message: "Error removing reaction",
                                        route,
                                        method,
                                        request_id,
                                        request_type,
                                        emp_id,
                                        type,
                                        error: err.message,
                                        stack: err.stack
                                    });
                                    return res.status(500).json({ message: "Database error" });
                                }

                                // Single INFO log for removal
                                logger.info({
                                    message: "Reaction removed",
                                    route,
                                    method,
                                    request_id,
                                    request_type,
                                    emp_id,
                                    type
                                });

                                // Socket emission for reaction removed
                                const io = req.app.get('io');
                                if (io) {
                                    try {
                                        io.emit('reaction-updated', {
                                            request_type,
                                            request_id,
                                            emp_id,
                                            emp_name,
                                            type,
                                            action: 'removed',
                                            timestamp: new Date().toISOString()
                                        });
                                        
                                        const roomName = `${request_type}_${request_id}`;
                                        io.to(roomName).emit('reaction-changed', {
                                            request_type,
                                            request_id,
                                            action: 'removed',
                                            type,
                                            emp_name
                                        });

                                        // logger.info({
                                        //     message: "Reaction socket events emitted",
                                        //     route,
                                        //     method,
                                        //     request_id,
                                        //     request_type,
                                        //     action: 'removed'
                                        // });
                                    } catch (socketError) {
                                        logger.error({
                                            message: "Socket emission error in remove reaction",
                                            route,
                                            method,
                                            request_id,
                                            error: socketError.message,
                                            stack: socketError.stack
                                        });
                                    }
                                }

                                reactionCount(request_type, request_id, emp_id, res);
                            }
                        );
                    } else {
                        // Switch reaction type
                        pool1.query(
                            `UPDATE ahana_innovation_lab.request_reactions SET type = ?, created_at = CURRENT_TIMESTAMP 
             WHERE request_type = ? AND request_id = ? AND emp_id = ?`,
                            [type, request_type, request_id, emp_id],
                            (err) => {
                                if (err) {
                                    logger.error({
                                        message: "Error updating reaction",
                                        route,
                                        method,
                                        request_id,
                                        request_type,
                                        emp_id,
                                        from_type: existingType,
                                        to_type: type,
                                        error: err.message,
                                        stack: err.stack
                                    });
                                    return res.status(500).json({ message: "Database error" });
                                }

                                // Single INFO log for update
                                logger.info({
                                    message: "Reaction updated",
                                    route,
                                    method,
                                    request_id,
                                    request_type,
                                    emp_id,
                                    from_type: existingType,
                                    to_type: type
                                });

                                // Socket emission for reaction updated
                                const io = req.app.get('io');
                                if (io) {
                                    try {
                                        io.emit('reaction-updated', {
                                            request_type,
                                            request_id,
                                            emp_id,
                                            emp_name,
                                            type,
                                            action: 'updated',
                                            previous_type: existingType,
                                            timestamp: new Date().toISOString()
                                        });
                                        
                                        const roomName = `${request_type}_${request_id}`;
                                        io.to(roomName).emit('reaction-changed', {
                                            request_type,
                                            request_id,
                                            action: 'updated',
                                            type,
                                            previous_type: existingType,
                                            emp_name
                                        });

                                        logger.info({
                                            message: "Reaction socket events emitted",
                                            route,
                                            method,
                                            request_id,
                                            request_type,
                                            action: 'updated'
                                        });
                                    } catch (socketError) {
                                        logger.error({
                                            message: "Socket emission error in update reaction",
                                            route,
                                            method,
                                            request_id,
                                            error: socketError.message,
                                            stack: socketError.stack
                                        });
                                    }
                                }

                                reactionCount(request_type, request_id, emp_id, res);
                            }
                        );
                    }
                } else {
                    // Add new reaction
                    pool1.query(
                        `INSERT INTO ahana_innovation_lab.request_reactions 
         (request_type, request_id, emp_id, emp_name, type)
         VALUES (?, ?, ?, ?, ?)`,
                        [request_type, request_id, emp_id, emp_name, type],
                        (err) => {
                            if (err) {
                                logger.error({
                                    message: "Error adding reaction",
                                    route,
                                    method,
                                    request_id,
                                    request_type,
                                    emp_id,
                                    type,
                                    error: err.message,
                                    stack: err.stack
                                });
                                return res.status(500).json({ message: "Database error" });
                            }

                            // Single INFO log for addition
                            logger.info({
                                message: "Reaction added",
                                route,
                                method,
                                request_id,
                                request_type,
                                emp_id,
                                type
                            });

                            // Socket emission for reaction added
                            const io = req.app.get('io');
                            if (io) {
                                try {
                                    io.emit('reaction-updated', {
                                        request_type,
                                        request_id,
                                        emp_id,
                                        emp_name,
                                        type,
                                        action: 'added',
                                        timestamp: new Date().toISOString()
                                    });
                                    
                                    const roomName = `${request_type}_${request_id}`;
                                    io.to(roomName).emit('reaction-changed', {
                                        request_type,
                                        request_id,
                                        action: 'added',
                                        type,
                                        emp_name
                                    });

                                    // logger.info({
                                    //     message: "Reaction socket events emitted",
                                    //     route,
                                    //     method,
                                    //     request_id,
                                    //     request_type,
                                    //     action: 'added'
                                    // });
                                } catch (socketError) {
                                    logger.error({
                                        message: "Socket emission error in add reaction",
                                        route,
                                        method,
                                        request_id,
                                        error: socketError.message,
                                        stack: socketError.stack
                                    });
                                }
                            }
                            
                            reactionCount(request_type, request_id, emp_id, res);
                        }
                    );
                }
            }
        )
    } catch (err) {
        logger.error({
            message: "Unexpected server error in addReaction",
            route,
            method,
            request_id,
            request_type,
            error: err.message,
            stack: err.stack
        });
        res
            .status(500)
            .json({ success: false, message: "Something went wrong on the server" });
    }
}

const reactionCount = (request_type, request_id, emp_id, res) => {
    const functionName = "reactionCount";
    
    // Single INFO log for function entry (useful for debugging flow)
    logger.info({
        message: "Calculating reaction counts",
        function: functionName,
        request_type,
        request_id,
        emp_id: emp_id || "not provided"
    });

    // Query 1: Get all reactions (for counts + user lists)
    const allReactionsQuery = `
        SELECT emp_id, emp_name, type
        FROM ahana_innovation_lab.request_reactions
        WHERE request_type = ? AND request_id = ?
    `;

    // Query 2: Get user's reaction
    const userQuery = `
        SELECT type 
        FROM ahana_innovation_lab.request_reactions
        WHERE request_type = ? AND request_id = ? AND emp_id = ?
        LIMIT 1
    `;

    // Get all reactions
    pool1.query(allReactionsQuery, [request_type, request_id], (err, allResults) => {
        if (err) {
            logger.error({
                message: "Error fetching all reactions",
                function: functionName,
                request_type,
                request_id,
                error: err.message,
                stack: err.stack
            });
            return res.status(500).json({ message: "Database error while fetching reactions" });
        }

        // Separate liked and disliked users
        const likedUsers = allResults
            .filter(r => r.type === "like")
            .map(r => ({ emp_id: r.emp_id, emp_name: r.emp_name }));

        const dislikedUsers = allResults
            .filter(r => r.type === "dislike")
            .map(r => ({ emp_id: r.emp_id, emp_name: r.emp_name }));

        const likes = likedUsers.length;
        const dislikes = dislikedUsers.length;

        // If emp_id not passed, return counts + lists only
        if (!emp_id) {
            logger.info({
                message: "Reaction counts calculated (no user)",
                function: functionName,
                request_type,
                request_id,
                likes,
                dislikes,
                likedUsersCount: likedUsers.length,
                dislikedUsersCount: dislikedUsers.length
            });
            
            return res.json({
                success: true,
                likes,
                dislikes,
                likedUsers,
                dislikedUsers,
            });
        }

        // Get user’s reaction
        pool1.query(userQuery, [request_type, request_id, emp_id], (err2, userResults) => {
            if (err2) {
                logger.error({
                    message: "Error fetching user reaction",
                    function: functionName,
                    request_type,
                    request_id,
                    emp_id,
                    error: err2.message,
                    stack: err2.stack
                });
                return res.status(500).json({ message: "Database error while fetching user reaction" });
            }

            const userReaction = userResults[0]?.type || null;

            // Single INFO log for successful completion
            logger.info({
                message: "Reaction counts calculated successfully",
                function: functionName,
                request_type,
                request_id,
                emp_id,
                likes,
                dislikes,
                userReaction,
                likedUsersCount: likedUsers.length,
                dislikedUsersCount: dislikedUsers.length
            });

            res.json({
                success: true,
                likes,
                dislikes,
                userReaction,
                likedUsers,
                dislikedUsers,
            });
        });
    });
};


const getReactionCounts = (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    const { request_id, request_type, emp_id } = req.query;

    // Validation log (ERROR only when missing)
    if (!request_id || !request_type || !emp_id) {
        logger.error({
            message: "Missing required params for getReactionCounts",
            route,
            method,
            request_id,
            request_type,
            emp_id
        });
        return res.status(400).json({
            success: false,
            message: "request_id, request_type, and emp_id are required",
        });
    }

    // Single INFO log for request
    logger.info({
        message: "Fetching reaction counts",
        route,
        method,
        request_id,
        request_type,
        emp_id
    });

    try {
        // 1. Get counts + user lists in one query
        const allReactionsQuery = `
            SELECT emp_id, emp_name, type
            FROM ahana_innovation_lab.request_reactions
            WHERE request_type = ? AND request_id = ?
        `;

        // 2. Get user's own reaction
        const userQuery = `
            SELECT type 
            FROM ahana_innovation_lab.request_reactions
            WHERE request_type = ? AND request_id = ? AND emp_id = ?
            LIMIT 1
        `;

        pool1.query(allReactionsQuery, [request_type, request_id], (err, allResults) => {
            if (err) {
                logger.error({
                    message: "Error fetching all reactions",
                    route,
                    method,
                    request_id,
                    request_type,
                    error: err.message,
                    stack: err.stack
                });
                return res.status(500).json({
                    success: false,
                    message: "Database error while fetching reactions",
                });
            }

            // Separate likes and dislikes
            const likedUsers = allResults
                .filter(r => r.type === "like")
                .map(r => ({ emp_id: r.emp_id, emp_name: r.emp_name }));

            const dislikedUsers = allResults
                .filter(r => r.type === "dislike")
                .map(r => ({ emp_id: r.emp_id, emp_name: r.emp_name }));

            const likes = likedUsers.length;
            const dislikes = dislikedUsers.length;

            // Get user's own reaction
            pool1.query(userQuery, [request_type, request_id, emp_id], (err2, userResults) => {
                if (err2) {
                    logger.error({
                        message: "Error fetching user reaction",
                        route,
                        method,
                        request_id,
                        request_type,
                        emp_id,
                        error: err2.message,
                        stack: err2.stack
                    });
                    return res.status(500).json({
                        success: false,
                        message: "Database error while fetching user reaction",
                    });
                }

                const userReaction = userResults[0]?.type || null;

                // Success log with summary
                logger.info({
                    message: "Reaction counts fetched successfully",
                    route,
                    method,
                    request_id,
                    request_type,
                    likes,
                    dislikes,
                    userReaction
                });

                res.status(200).json({
                    success: true,
                    likes,
                    dislikes,
                    userReaction,
                    likedUsers,
                    dislikedUsers,
                });
            });
        });
    } catch (err) {
        logger.error({
            message: "Unexpected server error in getReactionCounts",
            route,
            method,
            request_id,
            request_type,
            error: err.message,
            stack: err.stack
        });
        res.status(500).json({
            success: false,
            message: "Something went wrong on the server",
        });
    }
};



const addCommentReaction = (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    const { comment_id, emp_id, emp_name, type } = req.body;

    // Validation log
    if (!comment_id || !emp_id || !emp_name || !type) {
        logger.error({
            message: "Missing required fields for addCommentReaction",
            route,
            method,
            comment_id,
            emp_id,
            type
        });
        return res.status(400).json({ message: "All fields are required" });
    }

    // Request log
    logger.info({
        message: "Processing comment reaction",
        route,
        method,
        comment_id,
        emp_id,
        emp_name,
        type
    });

    pool1.query(
        `SELECT * FROM comment_reactions WHERE comment_id = ? AND emp_id = ?`,
        [comment_id, emp_id],
        (err, results) => {
            if (err) {
                logger.error({
                    message: "DB error checking comment reaction",
                    route,
                    method,
                    comment_id,
                    emp_id,
                    error: err.message,
                    stack: err.stack
                });
                return res.status(500).json({ message: "DB error" });
            }

            if (results.length > 0) {
                const existingType = results[0].type;
                if (existingType === type) {
                    // Remove reaction
                    pool1.query(
                        `DELETE FROM comment_reactions WHERE comment_id = ? AND emp_id = ?`,
                        [comment_id, emp_id],
                        (err) => {
                            if (err) {
                                logger.error({
                                    message: "Error removing comment reaction",
                                    route,
                                    method,
                                    comment_id,
                                    emp_id,
                                    type,
                                    error: err.message,
                                    stack: err.stack
                                });
                                return res.status(500).json({ message: "Database error" });
                            }

                            logger.info({
                                message: "Comment reaction removed",
                                route,
                                method,
                                comment_id,
                                emp_id,
                                type
                            });

                            // Socket emission
                            const io = req.app.get('io');
                            if (io) {
                                try {
                                    io.emit('comment-reaction-updated', {
                                        request_type: 'comment',
                                        request_id: comment_id,
                                        emp_id,
                                        emp_name,
                                        type,
                                        action: 'removed',
                                        timestamp: new Date().toISOString()
                                    });

                                    const roomName = `comment_${comment_id}`;
                                    io.to(roomName).emit('comment-reaction-changed', {
                                        request_type: 'comment',
                                        request_id: comment_id,
                                        action: 'removed',
                                        type,
                                        emp_name
                                    });

                                    // logger.info({
                                    //     message: "Comment reaction socket events emitted",
                                    //     route,
                                    //     method,
                                    //     comment_id,
                                    //     action: 'removed'
                                    // });
                                } catch (socketError) {
                                    logger.error({
                                        message: "Socket emission error in comment reaction",
                                        route,
                                        method,
                                        comment_id,
                                        error: socketError.message,
                                        stack: socketError.stack
                                    });
                                }
                            }

                            getCommentReactionCounts(comment_id, res);
                        }
                    );
                } else {
                    // Update reaction type
                    pool1.query(
                        `UPDATE comment_reactions SET type = ?, created_at = CURRENT_TIMESTAMP WHERE comment_id = ? AND emp_id = ?`,
                        [type, comment_id, emp_id],
                        (err) => {
                            if (err) {
                                logger.error({
                                    message: "Error updating comment reaction",
                                    route,
                                    method,
                                    comment_id,
                                    emp_id,
                                    from_type: existingType,
                                    to_type: type,
                                    error: err.message,
                                    stack: err.stack
                                });
                                return res.status(500).json({ message: "Database error" });
                            }

                            logger.info({
                                message: "Comment reaction updated",
                                route,
                                method,
                                comment_id,
                                emp_id,
                                from_type: existingType,
                                to_type: type
                            });

                            const io = req.app.get('io');
                            if (io) {
                                try {
                                    io.emit('comment-reaction-updated', {
                                        request_type: 'comment',
                                        request_id: comment_id,
                                        emp_id,
                                        emp_name,
                                        type,
                                        action: 'updated',
                                        timestamp: new Date().toISOString()
                                    });

                                    const roomName = `comment_${comment_id}`;
                                    io.to(roomName).emit('comment-reaction-changed', {
                                        request_type: 'comment',
                                        request_id: comment_id,
                                        action: 'updated',
                                        type,
                                        emp_name
                                    });

                                    // logger.info({
                                    //     message: "Comment reaction socket events emitted",
                                    //     route,
                                    //     method,
                                    //     comment_id,
                                    //     action: 'updated'
                                    // });
                                } catch (socketError) {
                                    logger.error({
                                        message: "Socket emission error in comment reaction",
                                        route,
                                        method,
                                        comment_id,
                                        error: socketError.message,
                                        stack: socketError.stack
                                    });
                                }
                            }

                            getCommentReactionCounts(comment_id, res);
                        }
                    );
                }
            } else {
                // Add new reaction
                pool1.query(
                    `INSERT INTO comment_reactions (comment_id, emp_id, emp_name, type) VALUES (?, ?, ?, ?)`,
                    [comment_id, emp_id, emp_name, type],
                    (err) => {
                        if (err) {
                            logger.error({
                                message: "Error adding comment reaction",
                                route,
                                method,
                                comment_id,
                                emp_id,
                                type,
                                error: err.message,
                                stack: err.stack
                            });
                            return res.status(500).json({ message: "Database error" });
                        }

                        logger.info({
                            message: "Comment reaction added",
                            route,
                            method,
                            comment_id,
                            emp_id,
                            type
                        });

                        const io = req.app.get('io');
                        if (io) {
                            try {
                                io.emit('comment-reaction-updated', {
                                    request_type: 'comment',
                                    request_id: comment_id,
                                    emp_id,
                                    emp_name,
                                    type,
                                    action: 'added',
                                    timestamp: new Date().toISOString()
                                });

                                const roomName = `comment_${comment_id}`;
                                io.to(roomName).emit('comment-reaction-changed', {
                                    request_type: 'comment',
                                    request_id: comment_id,
                                    action: 'added',
                                    type,
                                    emp_name
                                });

                                // logger.info({
                                //     message: "Comment reaction socket events emitted",
                                //     route,
                                //     method,
                                //     comment_id,
                                //     action: 'added'
                                // });
                            } catch (socketError) {
                                logger.error({
                                    message: "Socket emission error in comment reaction",
                                    route,
                                    method,
                                    comment_id,
                                    error: socketError.message,
                                    stack: socketError.stack
                                });
                            }
                        }

                        getCommentReactionCounts(comment_id, res);
                    }
                );
            }
        }
    );
};

const getCommentReactionCounts = (comment_id, res) => {
    const functionName = "getCommentReactionCounts";

    logger.info({
        message: "Getting comment reaction counts",
        function: functionName,
        comment_id
    });

    pool1.query(
        `SELECT SUM(type='like') AS likes, SUM(type='dislike') AS dislikes FROM comment_reactions WHERE comment_id = ?`,
        [comment_id],
        (err, results) => {
            if (err) {
                logger.error({
                    message: "DB error in getCommentReactionCounts",
                    function: functionName,
                    comment_id,
                    error: err.message,
                    stack: err.stack
                });
                return res.status(500).json({ message: "DB error" });
            }

            const { likes, dislikes } = results[0];

            logger.info({
                message: "Comment reaction counts fetched",
                function: functionName,
                comment_id,
                likes: likes || 0,
                dislikes: dislikes || 0
            });

            res.json({ success: true, likes: likes || 0, dislikes: dislikes || 0 });
        }
    );
};


const addCommentReply = (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    const { comment_id, emp_id, emp_name, reply } = req.body;

    // Validation log
    if (!comment_id || !emp_id || !emp_name || !reply) {
        logger.error({
            message: "Missing required fields for addCommentReply",
            route,
            method,
            comment_id,
            emp_id
        });
        return res.status(400).json({ message: "All fields are required" });
    }

    // Request log
    logger.info({
        message: "Adding comment reply",
        route,
        method,
        comment_id,
        emp_id,
        emp_name,
        reply_preview: reply.substring(0, 50) + (reply.length > 50 ? '...' : '')
    });

    pool1.query(
        `INSERT INTO comment_replies (comment_id, emp_id, emp_name, reply) VALUES (?, ?, ?, ?)`,
        [comment_id, emp_id, emp_name, reply],
        (err, result) => {
            if (err) {
                logger.error({
                    message: "DB error adding comment reply",
                    route,
                    method,
                    comment_id,
                    emp_id,
                    error: err.message,
                    stack: err.stack
                });
                return res.status(500).json({ message: "DB error" });
            }

            const newReplyId = result.insertId;

            pool1.query(
                `SELECT * FROM comment_replies WHERE comment_id = ? ORDER BY created_at ASC`,
                [comment_id],
                (err, results) => {
                    if (err) {
                        logger.error({
                            message: "DB error fetching comment replies",
                            route,
                            method,
                            comment_id,
                            error: err.message,
                            stack: err.stack
                        });
                        return res.status(500).json({ message: "DB error" });
                    }

                    const io = req.app.get('io');
                    if (io) {
                        try {
                            io.emit('comment-reply-added', {
                                comment_id,
                                reply_id: newReplyId,
                                emp_id,
                                emp_name,
                                reply,
                                timestamp: new Date().toISOString(),
                                total_replies: results.length
                            });

                            // logger.info({
                            //     message: "Comment reply socket events emitted",
                            //     route,
                            //     method,
                            //     comment_id,
                            //     reply_id: newReplyId
                            // });
                        } catch (socketError) {
                            logger.error({
                                message: "Socket emission error in addCommentReply",
                                route,
                                method,
                                comment_id,
                                error: socketError.message,
                                stack: socketError.stack
                            });
                        }
                    }

                    logger.info({
                        message: "Comment reply added successfully",
                        route,
                        method,
                        comment_id,
                        reply_id: newReplyId,
                        total_replies: results.length
                    });

                    res.json({ success: true, replies: results });
                }
            );
        }
    );
};


module.exports = {
    addComment,
    getCommentsWithReactionsAndReplies,
    addReaction,
    getReactionCounts,
    addCommentReaction,
    addCommentReply
};