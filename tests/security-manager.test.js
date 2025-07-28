const SecurityManager = require('../lib/security-manager');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock bcrypt and jwt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

describe('SecurityManager', () => {
  let securityManager;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    mockConfig = {
      getSetting: jest.fn()
    };

    mockLogger = createMockLogger();

    securityManager = new SecurityManager(mockConfig, mockLogger);

    // Reset mocks
    bcrypt.hash.mockClear();
    bcrypt.compare.mockClear();
    jwt.sign.mockClear();
    jwt.verify.mockClear();
  });

  describe('Constructor', () => {
    test('should initialize with config and logger', () => {
      expect(securityManager.config).toBe(mockConfig);
      expect(securityManager.logger).toBe(mockLogger);
      expect(securityManager.jwtSecret).toBeDefined();
      expect(securityManager.saltRounds).toBe(12);
      expect(securityManager.sessions).toBeInstanceOf(Map);
      expect(securityManager.loginAttempts).toBeInstanceOf(Map);
    });

    test('should use environment JWT secret if available', () => {
      process.env.JWT_SECRET = 'test-secret';
      const manager = new SecurityManager(mockConfig, mockLogger);
      expect(manager.jwtSecret).toBe('test-secret');
    });
  });

  describe('User Creation', () => {
    beforeEach(() => {
      bcrypt.hash.mockResolvedValue('hashed-password');
    });

    test('should create user successfully', async () => {
      const result = await securityManager.createUser('testuser', 'password123', 'admin', {
        email: 'test@example.com'
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(result).toEqual({
        username: 'testuser',
        role: 'admin',
        createdAt: expect.any(Date),
        active: true
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User created: testuser with role: admin'
      );
    });

    test('should create user with default role', async () => {
      const result = await securityManager.createUser('testuser', 'password123');

      expect(result.role).toBe('viewer');
    });

    test('should handle user creation errors', async () => {
      const error = new Error('Hash failed');
      bcrypt.hash.mockRejectedValue(error);

      await expect(securityManager.createUser('testuser', 'password123'))
        .rejects.toThrow('Hash failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create user:', error);
    });
  });

  describe('User Authentication', () => {
    beforeEach(() => {
      jest.spyOn(securityManager, 'getUserByUsername').mockResolvedValue({
        username: 'testuser',
        password: 'hashed-password',
        role: 'admin',
        active: true,
        lastLogin: null
      });
    });

    test('should authenticate user successfully', async () => {
      bcrypt.compare.mockResolvedValue(true);

      const result = await securityManager.authenticateUser('testuser', 'correct-password');

      expect(securityManager.getUserByUsername).toHaveBeenCalledWith('testuser');
      expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
      expect(result).toEqual({
        username: 'testuser',
        role: 'admin',
        lastLogin: expect.any(Date)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('User authenticated: testuser');
    });

    test('should fail authentication with wrong password', async () => {
      bcrypt.compare.mockResolvedValue(false);

      await expect(securityManager.authenticateUser('testuser', 'wrong-password'))
        .rejects.toThrow('Invalid credentials');

      expect(securityManager.loginAttempts.has('testuser')).toBe(true);
    });

    test('should fail authentication for non-existent user', async () => {
      jest.spyOn(securityManager, 'getUserByUsername').mockResolvedValue(null);

      await expect(securityManager.authenticateUser('nonexistent', 'password'))
        .rejects.toThrow('Invalid credentials');
    });

    test('should fail authentication for inactive user', async () => {
      jest.spyOn(securityManager, 'getUserByUsername').mockResolvedValue({
        username: 'testuser',
        password: 'hashed-password',
        role: 'admin',
        active: false
      });

      await expect(securityManager.authenticateUser('testuser', 'password'))
        .rejects.toThrow('Invalid credentials');
    });

    test('should lock account after too many failed attempts', async () => {
      mockConfig.getSetting.mockReturnValue(900); // 15 minutes lockout

      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        securityManager.recordFailedLogin('testuser');
      }

      await expect(securityManager.authenticateUser('testuser', 'password'))
        .rejects.toThrow('Account temporarily locked');
    });

    test('should clear failed attempts on successful login', async () => {
      securityManager.recordFailedLogin('testuser');
      bcrypt.compare.mockResolvedValue(true);

      await securityManager.authenticateUser('testuser', 'correct-password');

      expect(securityManager.loginAttempts.has('testuser')).toBe(false);
    });
  });

  describe('Token Management', () => {
    const mockUser = {
      username: 'testuser',
      role: 'admin',
      lastLogin: new Date()
    };

    test('should generate token successfully', () => {
      const mockToken = 'jwt-token';
      jwt.sign.mockReturnValue(mockToken);
      mockConfig.getSetting.mockReturnValue('1h');

      const token = securityManager.generateToken(mockUser);

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          username: 'testuser',
          role: 'admin',
          iat: expect.any(Number)
        },
        securityManager.jwtSecret,
        { expiresIn: '1h' }
      );
      expect(token).toBe(mockToken);
      expect(securityManager.sessions.has(mockToken)).toBe(true);
    });

    test('should verify token successfully', () => {
      const mockToken = 'valid-token';
      const mockDecoded = { username: 'testuser', role: 'admin' };
      
      jwt.verify.mockReturnValue(mockDecoded);
      securityManager.sessions.set(mockToken, {
        user: 'testuser',
        role: 'admin',
        createdAt: new Date(),
        lastActivity: new Date()
      });

      const result = securityManager.verifyToken(mockToken);

      expect(jwt.verify).toHaveBeenCalledWith(mockToken, securityManager.jwtSecret);
      expect(result).toBe(mockDecoded);
    });

    test('should fail token verification for invalid token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => securityManager.verifyToken('invalid-token'))
        .toThrow('Invalid or expired token');
    });

    test('should fail token verification for missing session', () => {
      jwt.verify.mockReturnValue({ username: 'testuser' });

      expect(() => securityManager.verifyToken('token-without-session'))
        .toThrow('Invalid or expired token');
    });

    test('should revoke token successfully', () => {
      const mockToken = 'token-to-revoke';
      securityManager.sessions.set(mockToken, { user: 'testuser' });

      securityManager.revokeToken(mockToken);

      expect(securityManager.sessions.has(mockToken)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Token revoked');
    });
  });

  describe('Role-Based Access Control', () => {
    test('should check permissions correctly', () => {
      expect(securityManager.hasPermission('admin', 'read')).toBe(true);
      expect(securityManager.hasPermission('admin', 'write')).toBe(true);
      expect(securityManager.hasPermission('admin', 'admin')).toBe(true);

      expect(securityManager.hasPermission('viewer', 'read')).toBe(true);
      expect(securityManager.hasPermission('viewer', 'write')).toBe(false);
      expect(securityManager.hasPermission('viewer', 'admin')).toBe(false);

      expect(securityManager.hasPermission('unknown-role', 'read')).toBe(false);
    });

    test('should check cluster access correctly', () => {
      expect(securityManager.checkClusterAccess('admin', 'production-db', 'write')).toBe(true);
      expect(securityManager.checkClusterAccess('viewer', 'production-db', 'write')).toBe(false);
      expect(securityManager.checkClusterAccess('viewer', 'development-db', 'write')).toBe(false);
      expect(securityManager.checkClusterAccess('operator', 'production-db', 'write')).toBe(true);
    });
  });

  describe('Input Validation and Security', () => {
    test('should sanitize input correctly', () => {
      expect(securityManager.sanitizeInput('normal text')).toBe('normal text');
      expect(securityManager.sanitizeInput('<script>alert("xss")</script>'))
        .toBe('scriptalert("xss")/script');
      expect(securityManager.sanitizeInput("'; DROP TABLE users; --"))
        .toBe('; DROP TABLE users; --');
      expect(securityManager.sanitizeInput(123)).toBe(123); // Non-string should pass through
    });

    test('should validate MongoDB connection strings', () => {
      expect(() => securityManager.validateConnectionString('mongodb://localhost:27017'))
        .not.toThrow();
      
      expect(() => securityManager.validateConnectionString('mongodb+srv://user:pass@cluster.mongodb.net/'))
        .not.toThrow();

      expect(() => securityManager.validateConnectionString('javascript:alert("xss")'))
        .toThrow('Invalid connection string format');

      expect(() => securityManager.validateConnectionString('http://example.com'))
        .toThrow('Invalid MongoDB URI protocol');

      expect(() => securityManager.validateConnectionString('invalid-uri'))
        .toThrow('Invalid connection string');
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockConfig.getSetting.mockReturnValue(3600); // 1 hour timeout
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should cleanup expired sessions', () => {
      const now = new Date();
      const oldSession = {
        user: 'olduser',
        lastActivity: new Date(now.getTime() - 7200000) // 2 hours ago
      };
      const activeSession = {
        user: 'activeuser',
        lastActivity: new Date(now.getTime() - 1800000) // 30 minutes ago
      };

      securityManager.sessions.set('old-token', oldSession);
      securityManager.sessions.set('active-token', activeSession);

      const cleanedCount = securityManager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
      expect(securityManager.sessions.has('old-token')).toBe(false);
      expect(securityManager.sessions.has('active-token')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up 1 expired sessions');
    });

    test('should get active sessions list', () => {
      securityManager.sessions.set('token1', {
        user: 'user1',
        role: 'admin',
        createdAt: new Date(),
        lastActivity: new Date()
      });

      securityManager.sessions.set('token2', {
        user: 'user2',
        role: 'viewer',
        createdAt: new Date(),
        lastActivity: new Date()
      });

      const sessions = securityManager.getActiveSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual({
        token: 'token1...',
        user: 'user1',
        role: 'admin',
        createdAt: expect.any(Date),
        lastActivity: expect.any(Date)
      });
    });
  });

  describe('Express Middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        headers: {},
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent')
      };
      
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      mockNext = jest.fn();
    });

    test('should authenticate valid token', () => {
      const mockToken = 'valid-token';
      const mockDecoded = { username: 'testuser', role: 'admin' };
      
      mockReq.headers.authorization = `Bearer ${mockToken}`;
      jest.spyOn(securityManager, 'verifyToken').mockReturnValue(mockDecoded);
      jest.spyOn(securityManager, 'logAccess').mockReturnValue();

      const middleware = securityManager.authMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBe(mockDecoded);
      expect(mockReq.token).toBe(mockToken);
      expect(mockNext).toHaveBeenCalled();
      expect(securityManager.logAccess).toHaveBeenCalledWith(
        'testuser',
        'GET',
        '/api/test',
        true,
        expect.objectContaining({ ip: '127.0.0.1' })
      );
    });

    test('should reject request without token', () => {
      const middleware = securityManager.authMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject request with invalid token', () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      jest.spyOn(securityManager, 'verifyToken').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const middleware = securityManager.authMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    test('should check permissions with permission middleware', () => {
      mockReq.user = { username: 'testuser', role: 'admin' };
      jest.spyOn(securityManager, 'hasPermission').mockReturnValue(true);

      const middleware = securityManager.requirePermission('write');
      middleware(mockReq, mockRes, mockNext);

      expect(securityManager.hasPermission).toHaveBeenCalledWith('admin', 'write');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject insufficient permissions', () => {
      mockReq.user = { username: 'testuser', role: 'viewer' };
      jest.spyOn(securityManager, 'hasPermission').mockReturnValue(false);
      jest.spyOn(securityManager, 'logAccess').mockReturnValue();

      const middleware = securityManager.requirePermission('admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(securityManager.logAccess).toHaveBeenCalledWith(
        'testuser',
        'GET',
        '/api/test',
        false,
        expect.objectContaining({ reason: 'Insufficient permissions' })
      );
    });
  });

  describe('Rate Limiting', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      jest.useFakeTimers();
      
      mockReq = { ip: '127.0.0.1' };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should allow requests within rate limit', () => {
      const rateLimiter = securityManager.createRateLimiter(60000, 5); // 5 requests per minute

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        rateLimiter(mockReq, mockRes, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should block requests exceeding rate limit', () => {
      const rateLimiter = securityManager.createRateLimiter(60000, 2); // 2 requests per minute

      // Make 3 requests (exceeding limit)
      for (let i = 0; i < 3; i++) {
        rateLimiter(mockReq, mockRes, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        retryAfter: 60
      });
    });

    test('should reset rate limit after window expires', () => {
      const rateLimiter = securityManager.createRateLimiter(1000, 2); // 2 requests per second

      // Use up the limit
      rateLimiter(mockReq, mockRes, mockNext);
      rateLimiter(mockReq, mockRes, mockNext);

      // Advance time beyond window
      jest.advanceTimersByTime(1100);

      // Should allow new requests
      rateLimiter(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
    });
  });

  describe('Audit Logging', () => {
    test('should log access events', () => {
      const logEntry = securityManager.logAccess(
        'testuser',
        'POST',
        '/api/clusters',
        true,
        { ip: '127.0.0.1', userAgent: 'test-agent' }
      );

      expect(logEntry).toEqual({
        timestamp: expect.any(Date),
        username: 'testuser',
        action: 'POST',
        resource: '/api/clusters',
        success: true,
        metadata: { ip: '127.0.0.1', userAgent: 'test-agent' },
        ip: '127.0.0.1'
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Access log:', logEntry);
    });

    test('should log failed access attempts', () => {
      const logEntry = securityManager.logAccess(
        'testuser',
        'DELETE',
        '/api/clusters/prod',
        false,
        { reason: 'Insufficient permissions' }
      );

      expect(logEntry.success).toBe(false);
      expect(logEntry.metadata.reason).toBe('Insufficient permissions');
    });
  });

  describe('Error Handling', () => {
    test('should handle authentication errors gracefully', async () => {
      jest.spyOn(securityManager, 'getUserByUsername').mockRejectedValue(new Error('Database error'));

      await expect(securityManager.authenticateUser('testuser', 'password'))
        .rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith('Authentication failed:', expect.any(Error));
    });

    test('should handle token generation errors', () => {
      jwt.sign.mockImplementation(() => {
        throw new Error('JWT error');
      });

      expect(() => securityManager.generateToken({ username: 'test', role: 'admin' }))
        .toThrow('JWT error');
    });

    test('should handle session cleanup errors', () => {
      // Create a session with a corrupted lastActivity
      securityManager.sessions.set('bad-token', {
        user: 'testuser',
        lastActivity: 'invalid-date'
      });

      // Should not throw error
      expect(() => securityManager.cleanupExpiredSessions()).not.toThrow();
    });
  });

  describe('Failed Login Tracking', () => {
    test('should record failed login attempts', () => {
      securityManager.recordFailedLogin('testuser');
      securityManager.recordFailedLogin('testuser');

      const attempts = securityManager.loginAttempts.get('testuser');
      expect(attempts.count).toBe(2);
      expect(attempts.lastAttempt).toBeInstanceOf(Number);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    test('should increment existing attempt count', () => {
      securityManager.loginAttempts.set('testuser', { count: 3, lastAttempt: Date.now() });
      
      securityManager.recordFailedLogin('testuser');

      const attempts = securityManager.loginAttempts.get('testuser');
      expect(attempts.count).toBe(4);
    });
  });
});