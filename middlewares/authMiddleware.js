const axios = require('axios');
const https = require('https');

/**
 * SSO-aware auth middleware.
 *
 * Every protected request must carry the MyAhana SSO token in the
 * Authorization header (Bearer <myahana_token>).
 *
 * The token is validated by calling MYAHANA_EMPLOYEE_DETAILS_URL.
 */
const authenticateToken = async (req, res, next) => {
    // Allow CORS preflight requests
    if (req.method === "OPTIONS") {
        return next();
    }

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;
    
    if (!token || token === "null" || token === "undefined") {
        return res.status(401).json({ 
            error: 'Access denied. No token provided.',
            message: 'Token required'
        });
    }

    try {
        const myahanaUrl = process.env.MYAHANA_EMPLOYEE_DETAILS_URL;
        if (!myahanaUrl) {
            return res.status(500).json({ 
                error: 'Configuration error',
                message: 'SSO validation URL not configured' 
            });
        }

        const rejectUnauthorized = process.env.REJECT_UNAUTHORIZED === "true";
        const instance = axios.create({
            httpsAgent: new https.Agent({ rejectUnauthorized }),
        });

        const response = await instance.get(myahanaUrl, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8000,
        });

        const data = response.data;

        if (data && (data.emp_id || data.employee_id || data.userid)) {
            const empId = data.emp_id || data.employee_id;
            req.user = {
                emp_id: empId,
                userid: data.userid || (data.u_id ? `${data.u_id}_${empId}` : empId),
                myahana_token: token,
                email: data.email || data.email_id || data.emp_email,
                emp_name: data.emp_name || data.name,
                ...data
            };
            return next();
        }

        return res.status(401).json({ 
            error: 'Invalid SSO token',
            message: 'Invalid SSO token' 
        });

    } catch (err) {
        const status = err.response?.status;

        // Explicit 401 / 403 from MyAhana → session expired
        if (status === 401 || status === 403) {
            return res.status(401).json({ 
                error: 'Token expired or invalid',
                message: 'SSO session expired or invalid' 
            });
        }

        console.error('❌ SSO Validation error:', err.message);
        return res.status(503).json({
            error: 'Authentication service unavailable',
            message: 'Authentication service unavailable. Please try again.',
        });
    }
};

module.exports = {
    authenticateToken
};