// tests/swaggerSpec.test.js
const swaggerSpec = require('../swagger/swaggerSpec');

describe('A2I Backend - Swagger OpenAPI Specification Unit Tests', () => {
  test('should declare OpenAPI version 3.0.0', () => {
    expect(swaggerSpec.openapi).toBe('3.0.0');
  });

  test('should configure Bearer Authentication security scheme', () => {
    expect(swaggerSpec.components).toBeDefined();
    expect(swaggerSpec.components.securitySchemes).toBeDefined();
    expect(swaggerSpec.components.securitySchemes.bearerAuth).toBeDefined();

    const bearer = swaggerSpec.components.securitySchemes.bearerAuth;
    expect(bearer.type).toBe('http');
    expect(bearer.scheme).toBe('bearer');
    expect(bearer.bearerFormat).toBe('JWT');
  });

  test('should apply Bearer security globally', () => {
    expect(swaggerSpec.security).toBeDefined();
    expect(swaggerSpec.security).toContainEqual({ bearerAuth: [] });
  });

  test('should document essential routes across core modules', () => {
    const paths = swaggerSpec.paths;
    expect(paths).toBeDefined();

    // System
    expect(paths['/health']).toBeDefined();
    expect(paths['/health'].get).toBeDefined();

    // Authentication
    expect(paths['/api/ahanainnovationLogin']).toBeDefined();
    expect(paths['/api/validateSession']).toBeDefined();

    // Innovation Lab
    expect(paths['/api/CreateInnovation']).toBeDefined();
    expect(paths['/api/viewallInnovation']).toBeDefined();

    // Automation Requests
    expect(paths['/api/createAutomationReq']).toBeDefined();
    expect(paths['/api/viewallAutomationReq']).toBeDefined();

    // AI Enthusiasts
    expect(paths['/api/createEnthusiasts']).toBeDefined();

    // Support Requests
    expect(paths['/api/createSupportReq']).toBeDefined();

    // Transfer
    expect(paths['/api/transferRequest']).toBeDefined();
  });

  test('should have tags defined with descriptions', () => {
    expect(swaggerSpec.tags).toBeDefined();
    expect(Array.isArray(swaggerSpec.tags)).toBe(true);
    expect(swaggerSpec.tags.length).toBeGreaterThan(5);

    const tagNames = swaggerSpec.tags.map((t) => t.name);
    expect(tagNames).toContain('Authentication');
    expect(tagNames).toContain('Innovation Lab');
    expect(tagNames).toContain('Automation Requests');
  });
});
