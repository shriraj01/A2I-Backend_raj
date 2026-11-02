// tests/authController.test.js
const axios = require('axios');
const { validateSession } = require('../controllers/authentication/auth');

jest.mock('axios');

describe('A2I Backend - Auth Controller Unit Tests', () => {
  let req, res;

  beforeEach(() => {
    process.env.MYAHANA_EMPLOYEE_DETAILS_URL = 'http://104.211.117.118:8000/api/auth/employee_details';
    req = {
      headers: {},
      user: null,
      originalUrl: '/api/validateSession',
      method: 'GET',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('validateSession', () => {
    test('should return 401 when no token is present', async () => {
      req.headers = {};
      req.user = null;

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          message: 'No token provided',
        })
      );
    });

    test('should return 200 with valid: true when token is verified with MyAhana', async () => {
      req.headers = { authorization: 'Bearer test_valid_token' };
      const mockGet = jest.fn().mockResolvedValueOnce({
        data: {
          emp_id: 'EMP101',
          userid: '101',
          email: 'tester@ahanait.com',
        },
      });
      axios.create.mockReturnValue({ get: mockGet });

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: true,
          source: 'myahana',
        })
      );
    });

    test('should return 401 when MyAhana responds with 401', async () => {
      req.headers = { authorization: 'Bearer expired_token' };
      const mockGet = jest.fn().mockRejectedValueOnce({
        response: { status: 401 },
      });
      axios.create.mockReturnValue({ get: mockGet });

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          message: 'SSO session expired',
        })
      );
    });

    test('should return 503 when MyAhana network call fails', async () => {
      req.headers = { authorization: 'Bearer test_token' };
      const mockGet = jest.fn().mockRejectedValueOnce({
        message: 'Network error',
      });
      axios.create.mockReturnValue({ get: mockGet });

      await validateSession(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          message: expect.stringMatching(/Authentication service unavailable/i),
        })
      );
    });
  });
});
