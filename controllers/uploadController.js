// controllers/uploadController.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool1 } = require('../dbConfig/connect');
const logger = require('../utils/logger');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads'; // Same as createAutomationReq
        const fullPath = path.join(__dirname, '../', uploadDir); // Adjusted path
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        cb(null, fullPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const originalName = path.parse(file.originalname).name;

        // Create unique filename
        const fileName = `${originalName}${ext}`;
        cb(null, fileName);
    }
});
// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only PDF, DOC, XLS, JPG, PNG files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5
    },
    fileFilter: fileFilter
});

// POST: Upload project documents - Updated to handle BOTH link and files
exports.uploadProjectDocument = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { apa_id, link } = req.body;
        const hasFiles = req.files && req.files.length > 0;
        const hasLink = link !== undefined && link !== null && link.trim() !== '';

        // 1. INFO: Entry point
        logger.info({
            message: "Upload project document initiated",
            route,
            method,
            apa_id,
            hasLink,
            fileCount: hasFiles ? req.files.length : 0
        });

        // Validate required fields
        if (!apa_id) {
            // 2. ERROR: Missing project ID
            logger.error({
                message: "Project ID missing",
                route,
                method,
                apa_id
            });
            return res.status(400).json({
                success: false,
                message: 'Project ID is required'
            });
        }

        if (!hasLink && !hasFiles) {
            // 3. ERROR: No content provided
            logger.error({
                message: "No link or files provided",
                route,
                method,
                apa_id
            });
            return res.status(400).json({
                success: false,
                message: 'Please provide either a link or files to upload'
            });
        }

        // First, get existing upload data
        const getExistingSql = `
            SELECT uploaded_link, uploaded_doc_path, upload_type 
            FROM automation_project_assigned 
            WHERE apa_id = ?
        `;

        pool1.query(getExistingSql, [apa_id], (selectError, selectResult) => {
            if (selectError) {
                // 4. ERROR: Select query failed
                logger.error({
                    message: "Database select error",
                    route,
                    method,
                    apa_id,
                    error: selectError.message,
                    stack: selectError.stack
                });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch existing upload data'
                });
            }

            let existingLink = null;
            let existingFiles = [];
            let existingUploadType = null;

            if (selectResult.length > 0) {
                const row = selectResult[0];
                existingLink = row.uploaded_link;
                existingUploadType = row.upload_type;

                // Parse existing files
                if (row.uploaded_doc_path) {
                    try {
                        const parsed = JSON.parse(row.uploaded_doc_path);
                        if (Array.isArray(parsed)) {
                            existingFiles = parsed;
                        } else if (parsed && typeof parsed === 'object') {
                            existingFiles = [parsed];
                        }
                    } catch (e) {
                        // Handle old format
                        if (row.uploaded_doc_path) {
                            existingFiles = [{
                                originalName: row.uploaded_doc_path,
                                storedName: row.uploaded_doc_path,
                                size: 0,
                                mimetype: 'application/octet-stream',
                                legacyFormat: true
                            }];
                        }
                    }
                }
            }

            // Prepare new upload data
            const uploadData = {
                uploaded_at: new Date()
            };

            // Handle link - REPLACE existing link
            let finalLink = null;
            if (hasLink) {
                finalLink = link.trim();
            } else {
                finalLink = existingLink;
            }
            uploadData.uploaded_link = finalLink;

            // Handle files - APPEND to existing files
            let finalFiles = [...existingFiles];
            if (hasFiles) {
                const newFiles = req.files.map(file => ({
                    originalName: file.originalname,
                    storedName: file.filename,
                    size: file.size,
                    mimetype: file.mimetype,
                    uploadedAt: new Date().toISOString()
                }));
                finalFiles = [...existingFiles, ...newFiles];
            }
            uploadData.uploaded_doc_path = finalFiles.length > 0 ? JSON.stringify(finalFiles) : null;

            // Determine upload type
            let uploadType = existingUploadType;

            if (hasLink && hasFiles) {
                uploadType = 'both';
            } else if (hasLink) {
                uploadType = finalFiles.length > 0 ? 'both' : 'link';
            } else if (hasFiles) {
                uploadType = finalLink ? 'both' : 'doc';
            }

            if (!finalLink && finalFiles.length === 0) {
                uploadType = null;
            }

            uploadData.upload_type = uploadType;

            // Update database
            const updateQuery = `
                UPDATE automation_project_assigned 
                SET uploaded_link = ?, 
                    uploaded_doc_path = ?, 
                    upload_type = ?, 
                    uploaded_at = ?
                WHERE apa_id = ?
            `;

            const values = [
                uploadData.uploaded_link,
                uploadData.uploaded_doc_path,
                uploadData.upload_type,
                uploadData.uploaded_at,
                apa_id
            ];

            pool1.query(updateQuery, values, (updateError, updateResult) => {
                if (updateError) {
                    // 6. ERROR: Update failed
                    logger.error({
                        message: "Database update error",
                        route,
                        method,
                        apa_id,
                        error: updateError.message,
                        code: updateError.code,
                        stack: updateError.stack
                    });

                    // If error is due to data too long, try simplified format
                    if (updateError.code === 'ER_DATA_TOO_LONG') {
                        // Create simplified file info
                        const simplifiedFiles = finalFiles.map(f => ({
                            n: f.originalName || f.storedName,
                            s: f.size || 0,
                            d: f.uploadedAt || new Date().toISOString()
                        }));

                        const fallbackQuery = `
                            UPDATE automation_project_assigned 
                            SET uploaded_link = ?, 
                                uploaded_doc_path = ?, 
                                upload_type = ?, 
                                uploaded_at = ?
                            WHERE apa_id = ?
                        `;

                        pool1.query(fallbackQuery, [
                            uploadData.uploaded_link,
                            JSON.stringify(simplifiedFiles),
                            uploadData.upload_type,
                            uploadData.uploaded_at,
                            apa_id
                        ], (fallbackError, fallbackResult) => {
                            if (fallbackError) {
                                // 7. ERROR: Fallback also failed
                                logger.error({
                                    message: "Fallback update error",
                                    route,
                                    method,
                                    apa_id,
                                    error: fallbackError.message,
                                    stack: fallbackError.stack
                                });
                                return res.status(500).json({
                                    success: false,
                                    message: 'Failed to update database'
                                });
                            }

                            // 8. INFO: Fallback success
                            logger.info({
                                message: "Documents updated with simplified format",
                                route,
                                method,
                                apa_id,
                                total_files: finalFiles.length,
                                new_files: hasFiles ? req.files.length : 0,
                                link_updated: hasLink
                            });

                            // Success with fallback
                            const newCount = hasFiles ? req.files.length : 0;
                            const totalCount = finalFiles.length;

                            let message = 'Documents updated successfully';
                            if (hasLink && hasFiles) {
                                message = 'Link replaced and files added';
                            } else if (hasLink) {
                                message = existingLink ? 'Link replaced' : 'Link added';
                            } else if (hasFiles) {
                                message = `Added ${newCount} file(s)`;
                            }

                            res.json({
                                success: true,
                                message: message + ' (stored in simplified format)',
                                data: {
                                    apa_id,
                                    upload_type: uploadData.upload_type,
                                    uploaded_at: uploadData.uploaded_at,
                                    total_files: totalCount,
                                    new_files: newCount,
                                    link_updated: hasLink,
                                    link_replaced: hasLink && existingLink
                                }
                            });
                        });
                        return;
                    }

                    return res.status(500).json({
                        success: false,
                        message: 'Failed to update database'
                    });
                }

                // 9. INFO: Success response
                const newCount = hasFiles ? req.files.length : 0;
                const totalCount = finalFiles.length;

                let message = 'Documents updated successfully';
                if (hasLink && hasFiles) {
                    message = `Link replaced and ${newCount} new file(s) added`;
                } else if (hasLink) {
                    message = existingLink ? 'Link replaced successfully' : 'Link added successfully';
                } else if (hasFiles) {
                    message = existingFiles.length > 0
                        ? `Added ${newCount} file(s) (${totalCount} total)`
                        : `${newCount} file(s) uploaded successfully`;
                }

                logger.info({
                    message: "Documents uploaded successfully",
                    route,
                    method,
                    apa_id,
                    total_files: totalCount,
                    new_files: newCount,
                    link_updated: hasLink,
                    link_replaced: hasLink && existingLink,
                    upload_type: uploadData.upload_type
                });

                res.json({
                    success: true,
                    message,
                    data: {
                        apa_id,
                        upload_type: uploadData.upload_type,
                        uploaded_at: uploadData.uploaded_at,
                        total_files: totalCount,
                        new_files: newCount,
                        link_updated: hasLink,
                        link_replaced: hasLink && existingLink,
                        has_existing_files: existingFiles.length > 0,
                        existing_files_count: existingFiles.length,
                        new_files_details: hasFiles ? req.files.map(f => ({
                            originalName: f.originalname,
                            storedName: f.filename,
                            size: f.size
                        })) : []
                    }
                });
            });
        });

    } catch (error) {
        // 10. ERROR: Catch block
        logger.error({
            message: "Upload error",
            route,
            method,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: 'Upload failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.uploadInnovationProjectDocument = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { ipa_id, link } = req.body;
        const hasFiles = req.files && req.files.length > 0;
        const hasLink = link !== undefined && link !== null && link.trim() !== '';

        // 1. INFO: Entry point
        logger.info({
            message: "Upload innovation project document initiated",
            route,
            method,
            ipa_id,
            hasLink,
            fileCount: hasFiles ? req.files.length : 0
        });

        // Validate required fields
        if (!ipa_id) {
            // 2. ERROR: Missing project ID
            logger.error({
                message: "Innovation Project ID missing",
                route,
                method,
                ipa_id
            });
            return res.status(400).json({
                success: false,
                message: 'Innovation Project ID is required'
            });
        }

        if (!hasLink && !hasFiles) {
            // 3. ERROR: No content provided
            logger.error({
                message: "No link or files provided",
                route,
                method,
                ipa_id
            });
            return res.status(400).json({
                success: false,
                message: 'Please provide either a link or file to upload'
            });
        }

        // First, get existing upload data
        const getExistingSql = `
            SELECT uploaded_link, uploaded_doc_path, upload_type 
            FROM innovation_project_assigned 
            WHERE ipa_id = ?
        `;

        pool1.query(getExistingSql, [ipa_id], (selectError, selectResult) => {
            if (selectError) {
                // 4. ERROR: Select query failed
                logger.error({
                    message: "Database select error",
                    route,
                    method,
                    ipa_id,
                    error: selectError.message,
                    stack: selectError.stack
                });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch existing upload data'
                });
            }

            let existingLink = null;
            let existingFiles = [];
            let existingUploadType = null;

            if (selectResult.length > 0) {
                const row = selectResult[0];
                existingLink = row.uploaded_link;
                existingUploadType = row.upload_type;

                // Parse existing files
                if (row.uploaded_doc_path) {
                    try {
                        const parsed = JSON.parse(row.uploaded_doc_path);
                        if (Array.isArray(parsed)) {
                            existingFiles = parsed;
                        }
                    } catch (e) {
                        // Handle old format
                        if (typeof row.uploaded_doc_path === 'string') {
                            existingFiles = [{
                                originalName: row.uploaded_doc_path,
                                storedName: row.uploaded_doc_path,
                                uploadedAt: new Date().toISOString()
                            }];
                        }
                        
                        // 5. WARN: JSON parse error but continuing
                        logger.warn({
                            message: "Error parsing existing files, using legacy format",
                            route,
                            method,
                            ipa_id,
                            error: e.message
                        });
                    }
                }
            }

            // Prepare new upload data
            const uploadData = {
                uploaded_at: new Date()
            };

            // Handle link - REPLACE existing link
            let finalLink = null;
            if (hasLink) {
                finalLink = link.trim();
            } else {
                finalLink = existingLink;
            }
            uploadData.uploaded_link = finalLink;

            // Handle files - APPEND to existing files
            let finalFiles = [...existingFiles];
            if (hasFiles) {
                const newFiles = req.files.map(file => ({
                    originalName: file.originalname,
                    storedName: file.filename,
                    size: file.size,
                    mimetype: file.mimetype,
                    uploadedAt: new Date().toISOString()
                }));
                finalFiles = [...existingFiles, ...newFiles];
            }
            uploadData.uploaded_doc_path = finalFiles.length > 0 ? JSON.stringify(finalFiles) : null;

            // Determine upload type
            let uploadType = existingUploadType;
            
            if (hasLink && hasFiles) {
                uploadType = 'both';
            } else if (hasLink) {
                uploadType = finalFiles.length > 0 ? 'both' : 'link';
            } else if (hasFiles) {
                uploadType = finalLink ? 'both' : 'doc';
            }
            
            if (!finalLink && finalFiles.length === 0) {
                uploadType = null;
            }
            
            uploadData.upload_type = uploadType;

            // Update database
            const updateQuery = `
                UPDATE innovation_project_assigned 
                SET uploaded_link = ?, 
                    uploaded_doc_path = ?, 
                    upload_type = ?, 
                    uploaded_at = ?
                WHERE ipa_id = ?
            `;

            const values = [
                uploadData.uploaded_link,
                uploadData.uploaded_doc_path,
                uploadData.upload_type,
                uploadData.uploaded_at,
                ipa_id
            ];

            pool1.query(updateQuery, values, (updateError, updateResult) => {
                if (updateError) {
                    // 6. ERROR: Update failed
                    logger.error({
                        message: "Database update error",
                        route,
                        method,
                        ipa_id,
                        error: updateError.message,
                        code: updateError.code,
                        stack: updateError.stack
                    });
                    
                    // If error is due to data too long, try simplified format
                    if (updateError.code === 'ER_DATA_TOO_LONG') {
                        // Create simplified file info
                        const simplifiedFiles = finalFiles.map(f => ({
                            n: f.originalName || f.storedName,
                            s: f.size || 0,
                            d: f.uploadedAt || new Date().toISOString()
                        }));
                        
                        const fallbackQuery = `
                            UPDATE innovation_project_assigned 
                            SET uploaded_link = ?, 
                                uploaded_doc_path = ?, 
                                upload_type = ?, 
                                uploaded_at = ?
                            WHERE ipa_id = ?
                        `;
                        
                        pool1.query(fallbackQuery, [
                            uploadData.uploaded_link,
                            JSON.stringify(simplifiedFiles),
                            uploadData.upload_type,
                            uploadData.uploaded_at,
                            ipa_id
                        ], (fallbackError, fallbackResult) => {
                            if (fallbackError) {
                                // 7. ERROR: Fallback also failed
                                logger.error({
                                    message: "Fallback update error",
                                    route,
                                    method,
                                    ipa_id,
                                    error: fallbackError.message,
                                    stack: fallbackError.stack
                                });
                                return res.status(500).json({
                                    success: false,
                                    message: 'Failed to update database'
                                });
                            }
                            
                            // 8. INFO: Fallback success
                            logger.info({
                                message: "Documents updated with simplified format",
                                route,
                                method,
                                ipa_id,
                                total_files: finalFiles.length,
                                new_files: hasFiles ? req.files.length : 0,
                                link_updated: hasLink
                            });
                            
                            // Success with fallback
                            const newCount = hasFiles ? req.files.length : 0;
                            const totalCount = finalFiles.length;
                            
                            let message = 'Documents updated successfully';
                            if (hasLink && hasFiles) {
                                message = 'Link replaced and files added';
                            } else if (hasLink) {
                                message = existingLink ? 'Link replaced' : 'Link added';
                            } else if (hasFiles) {
                                message = `Added ${newCount} file(s)`;
                            }
                            
                            res.json({
                                success: true,
                                message: message + ' (stored in simplified format)',
                                data: {
                                    ipa_id,
                                    upload_type: uploadData.upload_type,
                                    uploaded_at: uploadData.uploaded_at,
                                    total_files: totalCount,
                                    new_files: newCount,
                                    link_updated: hasLink,
                                    link_replaced: hasLink && existingLink
                                }
                            });
                        });
                        return;
                    }
                    
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to update database'
                    });
                }

                // 9. INFO: Success response
                const newCount = hasFiles ? req.files.length : 0;
                const totalCount = finalFiles.length;
                
                let message = 'Documents updated successfully';
                if (hasLink && hasFiles) {
                    message = `Link replaced and ${newCount} new file(s) added`;
                } else if (hasLink) {
                    message = existingLink ? 'Link replaced successfully' : 'Link added successfully';
                } else if (hasFiles) {
                    message = existingFiles.length > 0 
                        ? `Added ${newCount} file(s) (${totalCount} total)` 
                        : `${newCount} file(s) uploaded successfully`;
                }
                
                logger.info({
                    message: "Innovation project documents uploaded successfully",
                    route,
                    method,
                    ipa_id,
                    total_files: totalCount,
                    new_files: newCount,
                    link_updated: hasLink,
                    link_replaced: hasLink && existingLink,
                    upload_type: uploadData.upload_type
                });

                res.json({
                    success: true,
                    message,
                    data: {
                        ipa_id,
                        upload_type: uploadData.upload_type,
                        uploaded_at: uploadData.uploaded_at,
                        total_files: totalCount,
                        new_files: newCount,
                        link_updated: hasLink,
                        link_replaced: hasLink && existingLink,
                        has_existing_files: existingFiles.length > 0,
                        existing_files_count: existingFiles.length
                    }
                });
            });
        });

    } catch (error) {
        logger.error({
            message: "Upload error in innovation project",
            route,
            method,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: 'Upload failed. Please try again.'
        });
    }
};

exports.deleteProjectDocument = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { apa_id, file_name, link_only = false } = req.body;

        // 1. INFO: Entry point - what's being deleted
        logger.info({
            message: "Delete project document initiated",
            route,
            method,
            apa_id,
            deleteType: link_only ? 'link' : file_name ? 'file' : 'all',
            fileName: file_name || null
        });

        // Validate required fields
        if (!apa_id) {
            // 2. ERROR: Missing project ID
            logger.error({
                message: "Project ID missing for delete",
                route,
                method,
                apa_id
            });
            return res.status(400).json({
                success: false,
                message: 'Project ID is required'
            });
        }

        // First, get existing upload data
        const getExistingSql = `
            SELECT uploaded_link, uploaded_doc_path, upload_type 
            FROM automation_project_assigned 
            WHERE apa_id = ?
        `;

        pool1.query(getExistingSql, [apa_id], (selectError, selectResult) => {
            if (selectError) {
                // 3. ERROR: Select query failed
                logger.error({
                    message: "Database select error in delete",
                    route,
                    method,
                    apa_id,
                    error: selectError.message
                });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch existing upload data'
                });
            }

            if (selectResult.length === 0) {
                // 4. ERROR: Project not found
                logger.error({
                    message: "Project not found for delete",
                    route,
                    method,
                    apa_id
                });
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            const row = selectResult[0];
            const existingLink = row.uploaded_link;
            const existingUploadType = row.upload_type;

            let existingFiles = [];

            // Parse existing files
            if (row.uploaded_doc_path) {
                try {
                    const parsed = JSON.parse(row.uploaded_doc_path);
                    if (Array.isArray(parsed)) {
                        existingFiles = parsed;
                    } else if (parsed && typeof parsed === 'object') {
                        existingFiles = [parsed];
                    }
                } catch (e) {
                    // Handle old format
                    if (row.uploaded_doc_path) {
                        existingFiles = [{
                            originalName: row.uploaded_doc_path,
                            storedName: row.uploaded_doc_path,
                            size: 0,
                            mimetype: 'application/octet-stream',
                            legacyFormat: true
                        }];
                    }
                }
            }

            // Prepare update data
            const updateData = {
                updated_at: new Date()
            };

            let finalLink = existingLink;
            let finalFiles = [...existingFiles];
            let uploadType = existingUploadType;
            let deletedItem = null;

            // Handle deletion logic
            if (link_only === true || link_only === 'true') {
                // Delete only the link
                if (!existingLink) {
                    // 5. ERROR: No link to delete
                    logger.error({
                        message: "No link exists to delete",
                        route,
                        method,
                        apa_id
                    });
                    return res.status(400).json({
                        success: false,
                        message: 'No link exists to delete'
                    });
                }

                finalLink = null;
                deletedItem = 'link';

                if (uploadType === 'link') {
                    uploadType = null;
                } else if (uploadType === 'both') {
                    uploadType = 'doc';
                }

            } else if (file_name) {
                // Delete specific file
                const fileIndex = existingFiles.findIndex(file =>
                    file.originalName === file_name ||
                    file.storedName === file_name ||
                    (file.n && file.n === file_name)
                );

                if (fileIndex === -1) {
                    // 6. ERROR: File not found
                    logger.error({
                        message: "File not found for delete",
                        route,
                        method,
                        apa_id,
                        fileName: file_name
                    });
                    return res.status(404).json({
                        success: false,
                        message: 'File not found'
                    });
                }

                deletedItem = finalFiles[fileIndex];
                finalFiles.splice(fileIndex, 1);

                if (finalFiles.length === 0) {
                    uploadType = finalLink ? 'link' : null;
                } else if (uploadType === 'doc' && finalLink) {
                    uploadType = 'both';
                }

            } else {
                // Delete all files and link
                finalLink = null;
                finalFiles = [];
                uploadType = null;
            }

            updateData.uploaded_link = finalLink;
            updateData.uploaded_doc_path = finalFiles.length > 0 ? JSON.stringify(finalFiles) : null;
            updateData.upload_type = uploadType;

            // Update database
            const updateQuery = `
                UPDATE automation_project_assigned 
                SET uploaded_link = ?, 
                    uploaded_doc_path = ?, 
                    upload_type = ?, 
                    uploaded_at = ?
                WHERE apa_id = ?
            `;

            const values = [
                updateData.uploaded_link,
                updateData.uploaded_doc_path,
                updateData.upload_type,
                updateData.updated_at,
                apa_id
            ];

            pool1.query(updateQuery, values, (updateError, updateResult) => {
                if (updateError) {
                    // 7. ERROR: Update failed
                    logger.error({
                        message: "Database update error in delete",
                        route,
                        method,
                        apa_id,
                        error: updateError.message
                    });
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to update database'
                    });
                }

                // 8. INFO: Success - item deleted
                logger.info({
                    message: "Document deleted successfully",
                    route,
                    method,
                    apa_id,
                    deleteType: link_only ? 'link' : file_name ? 'file' : 'all',
                    remainingFiles: finalFiles.length,
                    hasLink: !!finalLink
                });

                // Determine response message
                let message = '';
                if (link_only === true || link_only === 'true') {
                    message = 'Link deleted successfully';
                } else if (file_name) {
                    message = `File '${deletedItem.originalName || deletedItem.n || file_name}' deleted successfully`;
                } else {
                    message = 'All documents and links cleared successfully';
                }

                res.json({
                    success: true,
                    message,
                    data: {
                        apa_id,
                        upload_type: updateData.upload_type,
                        updated_at: updateData.updated_at,
                        remaining_files_count: finalFiles.length,
                        link_deleted: link_only === true || link_only === 'true',
                        file_deleted: file_name ? file_name : null,
                        deleted_all: !file_name && !link_only,
                        remaining_link: finalLink ? true : false
                    }
                });
            });
        });

    } catch (error) {
        // 9. ERROR: Catch block
        logger.error({
            message: "Delete operation error",
            route,
            method,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Delete operation failed. Please try again.'
        });
    }
};

exports.deleteInnovationProjectDocument = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { ipa_id, file_name, link_only = false } = req.body;

        // 1. INFO: Entry point
        logger.info({
            message: "Delete innovation document initiated",
            route,
            method,
            ipa_id,
            deleteType: link_only ? 'link' : file_name ? 'file' : 'all'
        });

        // Validate required fields
        if (!ipa_id) {
            // 2. ERROR: Missing ID
            logger.error({ message: "Innovation Project ID missing", route, method, ipa_id });
            return res.status(400).json({
                success: false,
                message: 'Innovation Project ID is required'
            });
        }

        // Get existing upload data
        const getExistingSql = `
            SELECT uploaded_link, uploaded_doc_path, upload_type 
            FROM innovation_project_assigned 
            WHERE ipa_id = ?
        `;

        pool1.query(getExistingSql, [ipa_id], (selectError, selectResult) => {
            if (selectError) {
                // 3. ERROR: Select failed
                logger.error({ message: "Database select error", route, method, ipa_id, error: selectError.message });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch existing upload data'
                });
            }

            if (selectResult.length === 0) {
                // 4. ERROR: Not found
                logger.error({ message: "Innovation project not found", route, method, ipa_id });
                return res.status(404).json({
                    success: false,
                    message: 'Innovation project not found'
                });
            }

            const row = selectResult[0];
            const existingLink = row.uploaded_link;
            const existingUploadType = row.upload_type;

            let existingFiles = [];

            // Parse existing files
            if (row.uploaded_doc_path) {
                try {
                    const parsed = JSON.parse(row.uploaded_doc_path);
                    existingFiles = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    // Handle old format
                    if (row.uploaded_doc_path) {
                        existingFiles = [{
                            originalName: row.uploaded_doc_path,
                            storedName: row.uploaded_doc_path
                        }];
                    }
                }
            }

            // Prepare update data
            const updateData = { updated_at: new Date() };

            let finalLink = existingLink;
            let finalFiles = [...existingFiles];
            let uploadType = existingUploadType;
            let deletedItem = null;

            // Handle deletion logic
            if (link_only === true || link_only === 'true') {
                if (!existingLink) {
                    // 5. ERROR: No link to delete
                    logger.error({ message: "No link exists to delete", route, method, ipa_id });
                    return res.status(400).json({
                        success: false,
                        message: 'No link exists to delete'
                    });
                }
                finalLink = null;
                deletedItem = 'link';
                uploadType = uploadType === 'link' ? null : 'doc';

            } else if (file_name) {
                const fileIndex = existingFiles.findIndex(file =>
                    file.originalName === file_name ||
                    file.storedName === file_name ||
                    (file.n && file.n === file_name)
                );

                if (fileIndex === -1) {
                    // 6. ERROR: File not found
                    logger.error({ message: "File not found", route, method, ipa_id, fileName: file_name });
                    return res.status(404).json({
                        success: false,
                        message: 'File not found'
                    });
                }

                deletedItem = finalFiles[fileIndex];
                finalFiles.splice(fileIndex, 1);
                uploadType = finalFiles.length === 0 ? (finalLink ? 'link' : null) : 
                           (uploadType === 'doc' && finalLink ? 'both' : uploadType);

            } else {
                // Delete all
                finalLink = null;
                finalFiles = [];
                uploadType = null;
            }

            updateData.uploaded_link = finalLink;
            updateData.uploaded_doc_path = finalFiles.length > 0 ? JSON.stringify(finalFiles) : null;
            updateData.upload_type = uploadType;

            // Update database
            const updateQuery = `
                UPDATE innovation_project_assigned 
                SET uploaded_link = ?, uploaded_doc_path = ?, upload_type = ?, uploaded_at = ?
                WHERE ipa_id = ?
            `;

            pool1.query(updateQuery, [
                updateData.uploaded_link,
                updateData.uploaded_doc_path,
                updateData.upload_type,
                updateData.updated_at,
                ipa_id
            ], (updateError) => {
                if (updateError) {
                    // 7. ERROR: Update failed
                    logger.error({ message: "Database update error", route, method, ipa_id, error: updateError.message });
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to update database'
                    });
                }

                // 8. INFO: Success
                logger.info({
                    message: "Innovation document deleted successfully",
                    route,
                    method,
                    ipa_id,
                    deleteType: link_only ? 'link' : file_name ? 'file' : 'all',
                    remainingFiles: finalFiles.length
                });

                let message = link_only ? 'Link deleted successfully' :
                             file_name ? `File deleted successfully` :
                             'All documents and links cleared successfully';

                res.json({ success: true, message, data: { ipa_id, remaining_files_count: finalFiles.length } });
            });
        });

    } catch (error) {
        // 9. ERROR: Catch block
        logger.error({ message: "Delete operation error", route, method, error: error.message });
        res.status(500).json({ success: false, message: 'Delete operation failed' });
    }
};

// Add this new endpoint for file download
exports.downloadProjectFile = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../uploads', filename);

        // 1. INFO: Download initiated
        logger.info({
            message: "File download initiated",
            route,
            method,
            filename
        });

        if (!fs.existsSync(filePath)) {
            // 2. ERROR: File not found
            logger.error({
                message: "File not found for download",
                route,
                method,
                filename
            });
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // 3. INFO: Download successful
        logger.info({
            message: "File downloaded successfully",
            route,
            method,
            filename
        });

        res.download(filePath, filename);

    } catch (error) {
        // 4. ERROR: Download failed
        logger.error({
            message: "Download error",
            route,
            method,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: 'Download failed'
        });
    }
};

exports.uploadSupportProjectDocument = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { spa_id, link } = req.body;
        const hasFiles = req.files && req.files.length > 0;
        const hasLink = link !== undefined && link !== null && link.trim() !== '';

        // 1. INFO: Entry point
        logger.info({
            message: "Upload support project document initiated",
            route,
            method,
            spa_id,
            hasLink,
            fileCount: hasFiles ? req.files.length : 0
        });

        // Validate required fields
        if (!spa_id) {
            // 2. ERROR: Missing project ID
            logger.error({ message: "Support Project ID missing", route, method, spa_id });
            return res.status(400).json({
                success: false,
                message: 'Support Project ID (spa_id) is required'
            });
        }

        if (!hasLink && !hasFiles) {
            // 3. ERROR: No content provided
            logger.error({ message: "No link or files provided", route, method, spa_id });
            return res.status(400).json({
                success: false,
                message: 'Please provide either a link or files to upload'
            });
        }

        // Get existing upload data
        const getExistingSql = `
            SELECT uploaded_link, uploaded_doc_path, upload_type 
            FROM support_project_assigned 
            WHERE spa_id = ?
        `;

        pool1.query(getExistingSql, [spa_id], (selectError, selectResult) => {
            if (selectError) {
                // 4. ERROR: Select query failed
                logger.error({ message: "Database select error", route, method, spa_id, error: selectError.message });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch existing upload data'
                });
            }

            let existingLink = null;
            let existingFiles = [];
            let existingUploadType = null;

            if (selectResult.length > 0) {
                const row = selectResult[0];
                existingLink = row.uploaded_link;
                existingUploadType = row.upload_type;

                // Parse existing files
                if (row.uploaded_doc_path) {
                    try {
                        const parsed = JSON.parse(row.uploaded_doc_path);
                        existingFiles = Array.isArray(parsed) ? parsed : [parsed];
                    } catch (e) {
                        // Handle old format
                        if (row.uploaded_doc_path) {
                            existingFiles = [{
                                originalName: row.uploaded_doc_path,
                                storedName: row.uploaded_doc_path
                            }];
                        }
                        // 5. WARN: JSON parse error but continuing
                        logger.warn({ message: "Using legacy file format", route, method, spa_id });
                    }
                }
            }

            // Prepare new upload data
            const uploadData = { uploaded_at: new Date() };

            // Handle link - REPLACE existing
            let finalLink = hasLink ? link.trim() : existingLink;
            uploadData.uploaded_link = finalLink;

            // Handle files - APPEND to existing
            let finalFiles = [...existingFiles];
            if (hasFiles) {
                const newFiles = req.files.map(file => ({
                    originalName: file.originalname,
                    storedName: file.filename,
                    size: file.size,
                    mimetype: file.mimetype,
                    uploadedAt: new Date().toISOString()
                }));
                finalFiles = [...existingFiles, ...newFiles];
            }
            uploadData.uploaded_doc_path = finalFiles.length > 0 ? JSON.stringify(finalFiles) : null;

            // Determine upload type
            let uploadType = existingUploadType;
            if (hasLink && hasFiles) uploadType = 'both';
            else if (hasLink) uploadType = finalFiles.length > 0 ? 'both' : 'link';
            else if (hasFiles) uploadType = finalLink ? 'both' : 'doc';
            else if (!finalLink && finalFiles.length === 0) uploadType = null;
            uploadData.upload_type = uploadType;

            // Update database
            const updateQuery = `
                UPDATE support_project_assigned 
                SET uploaded_link = ?, uploaded_doc_path = ?, upload_type = ?, uploaded_at = ?
                WHERE spa_id = ?
            `;

            pool1.query(updateQuery, [
                uploadData.uploaded_link,
                uploadData.uploaded_doc_path,
                uploadData.upload_type,
                uploadData.uploaded_at,
                spa_id
            ], (updateError) => {
                if (updateError) {
                    // 6. ERROR: Update failed
                    logger.error({ message: "Database update error", route, method, spa_id, error: updateError.message });

                    // Try simplified format if data too long
                    if (updateError.code === 'ER_DATA_TOO_LONG') {
                        const simplifiedFiles = finalFiles.map(f => ({
                            n: f.originalName || f.storedName,
                            s: f.size || 0,
                            d: f.uploadedAt || new Date().toISOString()
                        }));

                        pool1.query(updateQuery, [
                            uploadData.uploaded_link,
                            JSON.stringify(simplifiedFiles),
                            uploadData.upload_type,
                            uploadData.uploaded_at,
                            spa_id
                        ], (fallbackError) => {
                            if (fallbackError) {
                                logger.error({ message: "Fallback update error", route, method, spa_id });
                                return res.status(500).json({ success: false, message: 'Failed to update database' });
                            }

                            // 7. INFO: Fallback success
                            logger.info({ message: "Documents updated with simplified format", route, method, spa_id });
                            res.json({ success: true, message: 'Documents updated (simplified format)' });
                        });
                        return;
                    }
                    return res.status(500).json({ success: false, message: 'Failed to update database' });
                }

                // 8. INFO: Success
                logger.info({
                    message: "Support project documents uploaded successfully",
                    route,
                    method,
                    spa_id,
                    total_files: finalFiles.length,
                    new_files: hasFiles ? req.files.length : 0,
                    link_updated: hasLink
                });

                res.json({ success: true, message: 'Documents uploaded successfully' });
            });
        });

    } catch (error) {
        // 9. ERROR: Catch block
        logger.error({ message: "Upload error", route, method, error: error.message });
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
};

// DELETE: Delete support project documents
exports.deleteSupportProjectDocument = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    
    try {
        const { spa_id, file_name, link_only = false } = req.body;

        // 1. INFO: Entry point
        logger.info({
            message: "Delete support document initiated",
            route,
            method,
            spa_id,
            deleteType: link_only ? 'link' : file_name ? 'file' : 'all'
        });

        // Validate required fields
        if (!spa_id) {
            // 2. ERROR: Missing ID
            logger.error({ message: "Support Project ID missing", route, method, spa_id });
            return res.status(400).json({
                success: false,
                message: 'Support Project ID (spa_id) is required'
            });
        }

        // Get existing upload data
        const getExistingSql = `
            SELECT uploaded_link, uploaded_doc_path, upload_type 
            FROM support_project_assigned 
            WHERE spa_id = ?
        `;

        pool1.query(getExistingSql, [spa_id], (selectError, selectResult) => {
            if (selectError) {
                // 3. ERROR: Select failed
                logger.error({ message: "Database select error", route, method, spa_id, error: selectError.message });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch existing upload data'
                });
            }

            if (selectResult.length === 0) {
                // 4. ERROR: Not found
                logger.error({ message: "Support project not found", route, method, spa_id });
                return res.status(404).json({
                    success: false,
                    message: 'Support project not found'
                });
            }

            const row = selectResult[0];
            const existingLink = row.uploaded_link;
            const existingUploadType = row.upload_type;

            let existingFiles = [];

            // Parse existing files
            if (row.uploaded_doc_path) {
                try {
                    const parsed = JSON.parse(row.uploaded_doc_path);
                    existingFiles = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    // Handle old format
                    if (row.uploaded_doc_path) {
                        existingFiles = [{
                            originalName: row.uploaded_doc_path,
                            storedName: row.uploaded_doc_path
                        }];
                    }
                }
            }

            // Prepare update data
            const updateData = { updated_at: new Date() };

            let finalLink = existingLink;
            let finalFiles = [...existingFiles];
            let uploadType = existingUploadType;

            // Handle deletion logic
            if (link_only === true || link_only === 'true') {
                if (!existingLink) {
                    // 5. ERROR: No link to delete
                    logger.error({ message: "No link exists to delete", route, method, spa_id });
                    return res.status(400).json({
                        success: false,
                        message: 'No link exists to delete'
                    });
                }
                finalLink = null;
                uploadType = uploadType === 'link' ? null : 'doc';

            } else if (file_name) {
                const fileIndex = existingFiles.findIndex(file =>
                    file.originalName === file_name ||
                    file.storedName === file_name ||
                    (file.n && file.n === file_name)
                );

                if (fileIndex === -1) {
                    // 6. ERROR: File not found
                    logger.error({ message: "File not found", route, method, spa_id, fileName: file_name });
                    return res.status(404).json({
                        success: false,
                        message: 'File not found'
                    });
                }

                finalFiles.splice(fileIndex, 1);
                uploadType = finalFiles.length === 0 ? (finalLink ? 'link' : null) : 
                           (uploadType === 'doc' && finalLink ? 'both' : uploadType);

            } else {
                // Delete all
                finalLink = null;
                finalFiles = [];
                uploadType = null;
            }

            updateData.uploaded_link = finalLink;
            updateData.uploaded_doc_path = finalFiles.length > 0 ? JSON.stringify(finalFiles) : null;
            updateData.upload_type = uploadType;

            // Update database
            const updateQuery = `
                UPDATE support_project_assigned 
                SET uploaded_link = ?, uploaded_doc_path = ?, upload_type = ?, uploaded_at = ?
                WHERE spa_id = ?
            `;

            pool1.query(updateQuery, [
                updateData.uploaded_link,
                updateData.uploaded_doc_path,
                updateData.upload_type,
                updateData.updated_at,
                spa_id
            ], (updateError) => {
                if (updateError) {
                    // 7. ERROR: Update failed
                    logger.error({ message: "Database update error", route, method, spa_id, error: updateError.message });
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to update database'
                    });
                }

                // 8. INFO: Success
                logger.info({
                    message: "Support document deleted successfully",
                    route,
                    method,
                    spa_id,
                    deleteType: link_only ? 'link' : file_name ? 'file' : 'all',
                    remainingFiles: finalFiles.length
                });

                let message = link_only ? 'Link deleted successfully' :
                             file_name ? `File deleted successfully` :
                             'All documents and links cleared successfully';

                res.json({ success: true, message });
            });
        });

    } catch (error) {
        // 9. ERROR: Catch block
        logger.error({ message: "Delete operation error", route, method, error: error.message });
        res.status(500).json({ success: false, message: 'Delete operation failed' });
    }
};

// GET: Download support project file
exports.downloadSupportProjectFile = async (req, res) => {
    const route = req.originalUrl;
    const method = req.method;
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../uploads', filename);
        logger.info({ message: "Support file download initiated", route, method, filename });

        if (!fs.existsSync(filePath)) {
            // 2. ERROR: File not found
            logger.error({ message: "Support file not found", route, method, filename });
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // 3. INFO: Download successful
        logger.info({ message: "Support file downloaded successfully", route, method, filename });
        res.download(filePath, filename);

    } catch (error) {
        // 4. ERROR: Download failed
        logger.error({ message: "Support file download error", route, method, error: error.message });
        res.status(500).json({
            success: false,
            message: 'Download failed'
        });
    }
};

// Middleware for file upload
exports.uploadMiddleware = upload.array('documents', 5); // Max 5 files