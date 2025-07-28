const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class SecurityManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
    this.saltRounds = 12;
    this.sessions = new Map();
    this.loginAttempts = new Map();
  }

  // User management
  async createUser(username, password, role = 'viewer', metadata = {}) {
    try {
      const hashedPassword = await bcrypt.hash(password, this.saltRounds);
      
      const user = {
        username,
        password: hashedPassword,
        role,
        metadata,
        createdAt: new Date(),
        lastLogin: null,
        active: true
      };

      // In a real implementation, this would save to a database
      this.logger.info(`User created: ${username} with role: ${role}`);
      
      return {
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        active: user.active
      };
    } catch (error) {
      this.logger.error('Failed to create user:', error);
      throw error;
    }
  }

  async authenticateUser(username, password) {
    try {
      // Check for too many failed attempts
      const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: null };
      const lockoutDuration = this.config.getSetting('security.lockoutDuration') || 900; // 15 minutes
      
      if (attempts.count >= 5 && attempts.lastAttempt && 
          (Date.now() - attempts.lastAttempt) < lockoutDuration * 1000) {
        throw new Error('Account temporarily locked due to too many failed login attempts');
      }

      // In a real implementation, this would check against a database
      // For demo purposes, we'll simulate a user lookup
      const user = await this.getUserByUsername(username);
      
      if (!user || !user.active) {
        this.recordFailedLogin(username);
        throw new Error('Invalid credentials');
      }

      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        this.recordFailedLogin(username);
        throw new Error('Invalid credentials');
      }

      // Clear failed attempts on successful login
      this.loginAttempts.delete(username);
      
      // Update last login
      user.lastLogin = new Date();
      
      this.logger.info(`User authenticated: ${username}`);
      
      return {
        username: user.username,
        role: user.role,
        lastLogin: user.lastLogin
      };
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      throw error;
    }
  }

  recordFailedLogin(username) {
    const attempts = this.loginAttempts.get(username) || { count: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(username, attempts);
    
    this.logger.warn(`Failed login attempt for user: ${username} (${attempts.count} attempts)`);
  }

  async getUserByUsername(username) {
    // Simulate database lookup
    // In a real implementation, this would query a user database
    const demoUsers = {
      'admin': {
        username: 'admin',
        password: await bcrypt.hash('admin123', this.saltRounds), // Demo password
        role: 'admin',
        active: true,
        createdAt: new Date(),
        lastLogin: null
      },
      'viewer': {
        username: 'viewer',
        password: await bcrypt.hash('viewer123', this.saltRounds), // Demo password
        role: 'viewer',
        active: true,
        createdAt: new Date(),
        lastLogin: null
      }
    };
    
    return demoUsers[username] || null;
  }

  generateToken(user) {
    const payload = {
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    };

    const options = {
      expiresIn: this.config.getSetting('security.sessionTimeout') || '1h'
    };

    const token = jwt.sign(payload, this.jwtSecret, options);
    
    // Store session
    this.sessions.set(token, {
      user: user.username,
      role: user.role,
      createdAt: new Date(),
      lastActivity: new Date()
    });

    return token;
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      const session = this.sessions.get(token);
      
      if (!session) {
        throw new Error('Session not found');
      }

      // Update last activity
      session.lastActivity = new Date();
      
      return decoded;
    } catch (error) {
      this.sessions.delete(token);
      throw new Error('Invalid or expired token');
    }
  }

  revokeToken(token) {
    this.sessions.delete(token);
    this.logger.info('Token revoked');
  }

  // Role-based access control
  hasPermission(userRole, requiredPermission) {
    const rolePermissions = {
      'admin': ['read', 'write', 'admin', 'backup', 'monitor'],
      'operator': ['read', 'write', 'backup', 'monitor'],
      'viewer': ['read', 'monitor'],
      'readonly': ['read']
    };

    const permissions = rolePermissions[userRole] || [];
    return permissions.includes(requiredPermission);
  }

  checkClusterAccess(userRole, clusterName, operation) {
    // In a real implementation, this would check cluster-specific permissions
    const isProductionCluster = clusterName.includes('production');
    
    if (isProductionCluster && operation === 'write' && userRole === 'viewer') {
      return false;
    }

    return this.hasPermission(userRole, operation);
  }

  // Audit logging
  logAccess(username, action, resource, success = true, metadata = {}) {
    const logEntry = {
      timestamp: new Date(),
      username,
      action,
      resource,
      success,
      metadata,
      ip: metadata.ip || 'unknown'
    };

    this.logger.info('Access log:', logEntry);
    
    // In a real implementation, this would be stored in an audit database
    return logEntry;
  }

  // Security utilities
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Basic sanitization - remove potentially dangerous characters
    return input.replace(/[<>'"&]/g, '');
  }

  validateConnectionString(uri) {
    try {
      const url = new URL(uri);
      
      // Check for suspicious patterns
      if (uri.includes('javascript:') || uri.includes('data:')) {
        throw new Error('Invalid connection string format');
      }
      
      // Ensure it's a MongoDB URI
      if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol)) {
        throw new Error('Invalid MongoDB URI protocol');
      }
      
      return true;
    } catch (error) {
      throw new Error('Invalid connection string: ' + error.message);
    }
  }

  // Session management
  cleanupExpiredSessions() {
    const sessionTimeout = this.config.getSetting('security.sessionTimeout') || 3600; // 1 hour
    const cutoffTime = new Date(Date.now() - sessionTimeout * 1000);
    
    let cleanedCount = 0;
    for (const [token, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.sessions.delete(token);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} expired sessions`);
    }
    
    return cleanedCount;
  }

  getActiveSessions() {
    return Array.from(this.sessions.entries()).map(([token, session]) => ({
      token: token.substring(0, 10) + '...', // Truncated for security
      user: session.user,
      role: session.role,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    }));
  }

  // Security middleware for Express
  authMiddleware() {
    return (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = this.verifyToken(token);
        
        req.user = decoded;
        req.token = token;
        
        // Log access
        this.logAccess(decoded.username, req.method, req.path, true, {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }

  // Permission middleware
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!this.hasPermission(req.user.role, permission)) {
        this.logAccess(req.user.username, req.method, req.path, false, {
          reason: 'Insufficient permissions',
          requiredPermission: permission
        });
        
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  // Rate limiting
  createRateLimiter(windowMs = 15 * 60 * 1000, max = 100) {
    const requests = new Map();
    
    return (req, res, next) => {
      const key = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Get or create request log for this IP
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      
      const requestLog = requests.get(key);
      
      // Remove old requests outside the window
      const validRequests = requestLog.filter(time => time > windowStart);
      
      if (validRequests.length >= max) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      // Add current request
      validRequests.push(now);
      requests.set(key, validRequests);
      
      next();
    };
  }
}

module.exports = SecurityManager;