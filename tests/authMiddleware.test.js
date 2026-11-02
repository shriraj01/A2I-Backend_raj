// tests/authMiddleware.test.js
const axios = require('axios');
const { authenticateToken } = require('../middlewares/authMiddleware');

jest.mock('axios');

describe('A2I Backend - authMiddleware Unit Tests', () => {
  let req, res, next, mockGet;

  beforeEach(() => {
    process.env.MYAHANA_EMPLOYEE_DETAILS_URL = 'http://104.211.117.118:8000/api/auth/employee_details';
    
    mockGet = jest.fn();
    axios.create.mockReturnValue({
      get: mockGet,
    });

    req = {
      headers: {},
      user: null,
      originalUrl: '/api/test',
      method: 'GET',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('should return 401 if Authorization header is missing', async () => {
    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Token required',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 if Authorization token is null string or empty', async () => {
    req.headers['authorization'] = 'Bearer null';

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Token required',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 500 if MYAHANA_EMPLOYEE_DETAILS_URL is not configured', async () => {
    delete process.env.MYAHANA_EMPLOYEE_DETAILS_URL;
    req.headers['authorization'] = 'Bearer some_token';

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'SSO validation URL not configured',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should authenticate successfully when MyAhana employee_details returns valid data', async () => {
    req.headers['authorization'] = 'Bearer valid_mock_token_abc';

    const mockEmpData = {
      emp_id: 'EMP101',
      userid: '101',
      email: 'tester@ahanait.com',
      emp_name: 'Test Engineer',
    };

    mockGet.mockResolvedValueOnce({
      status: 200,
      data: mockEmpData,
    });

    await authenticateToken(req, res, next);

    expect(mockGet).toHaveBeenCalledWith(
      'http://104.211.117.118:8000/api/auth/employee_details',
      expect.objectContaining({
        headers: { Authorization: 'Bearer valid_mock_token_abc' },
      })
    );
    expect(req.user).toBeDefined();
    expect(req.user.emp_id).toBe('EMP101');
    expect(req.user.email).toBe('tester@ahanait.com');
    expect(req.user.myahana_token).toBe('valid_mock_token_abc');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 401 when MyAhana responds with 401 Unauthorized', async () => {
    req.headers['authorization'] = 'Bearer expired_token';

    mockGet.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { message: 'Token has expired' },
      },
      message: 'Request failed with status code 401',
    });

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Token expired or invalid',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 503 when MyAhana SSO service is unreachable', async () => {
    req.headers['authorization'] = 'Bearer valid_token';

    mockGet.mockRejectedValueOnce({
      request: {},
      message: 'Network Error: Connection refused',
    });

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Authentication service unavailable',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
