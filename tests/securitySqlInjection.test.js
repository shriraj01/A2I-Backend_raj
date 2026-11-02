// tests/securitySqlInjection.test.js
jest.mock('../emailConfig/mailConfig', () => ({
  innovationTransferMail: jest.fn()
}));

const { transferRequest } = require('../controllers/requestTransferController');
const { addNote, getMessages, markAsSeen, getUnreadCount } = require('../controllers/messageController');
const { getRequestCountMonthWise, getAllDetails } = require('../controllers/dashboard/dashboardController');

describe('A2I Backend - SQL Injection Defense & Input Hardening Tests', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      headers: {},
      originalUrl: '/test-route',
      method: 'POST'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('transferRequest - SQL Injection & Identifier Hardening', () => {
    test('should reject SQL injection payload in id parameter', async () => {
      req.body = {
        id: "1; DROP TABLE automation_requests;--",
        from: "automation",
        to: "innovation"
      };

      await transferRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Invalid request id format/i)
        })
      );
    });

    test('should reject non-numeric SQL injection string in id', async () => {
      req.body = {
        id: "1 OR 1=1",
        from: "automation",
        to: "support"
      };

      await transferRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Invalid request id format/i)
        })
      );
    });

    test('should reject arbitrary or prototype injection in from/to module names', async () => {
      req.body = {
        id: 10,
        from: "__proto__",
        to: "automation"
      };

      await transferRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Invalid module/i)
        })
      );
    });

    test('should reject non-whitelisted table names injected into module names', async () => {
      req.body = {
        id: 5,
        from: "users; DROP TABLE users;--",
        to: "support"
      };

      await transferRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Invalid module/i)
        })
      );
    });
  });

  describe('messageController - SQL Injection & Whitelist Hardening', () => {
    test('addNote should reject malicious SQL injection in request_type', () => {
      req.body = {
        request_id: 123,
        request_type: "Automation' OR 1=1;--",
        sender_type: "Admin",
        emp_id: "EMP001",
        emp_name: "Admin User",
        message: "Hello"
      };

      addNote(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/Invalid request_type/i)
        })
      );
    });

    test('addNote should reject SQL injection payload in request_id', () => {
      req.body = {
        request_id: "123 OR 1=1",
        request_type: "Automation",
        sender_type: "User",
        emp_id: "EMP001",
        emp_name: "John Doe",
        message: "Hello"
      };

      addNote(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/Invalid request_id format/i)
        })
      );
    });

    test('getMessages should reject unwhitelisted request_type', () => {
      req.query = {
        request_id: "5",
        request_type: "MaliciousType"
      };

      getMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/Invalid request_type/i)
        })
      );
    });

    test('markAsSeen should reject SQL injection in request_id', () => {
      req.body = {
        request_id: "1; DROP TABLE request_notes;--",
        request_type: "Automation",
        emp_id: "EMP001"
      };

      markAsSeen(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/Invalid request_id format/i)
        })
      );
    });

    test('getUnreadCount should reject invalid request_id and unwhitelisted request_type', () => {
      req.query = {
        request_id: "abc",
        request_type: "Automation",
        emp_id: "EMP001"
      };

      getUnreadCount(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/Invalid request_id format/i)
        })
      );
    });
  });

  describe('dashboardController - Year Input Hardening', () => {
    test('getRequestCountMonthWise should reject SQL injection in year parameter', async () => {
      req.query = {
        year: "2026' OR '1'='1"
      };

      await getRequestCountMonthWise(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Invalid year format/i)
        })
      );
    });

    test('getRequestCountMonthWise should reject out-of-range year', async () => {
      req.query = {
        year: "9999"
      };

      await getRequestCountMonthWise(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Year out of acceptable range/i)
        })
      );
    });

    test('getAllDetails should reject SQL injection string in year', async () => {
      req.query = {
        year: "2024; DROP TABLE automation_requests;--"
      };

      await getAllDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/Invalid year format/i)
        })
      );
    });
  });
});
