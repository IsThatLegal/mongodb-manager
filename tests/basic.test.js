const MongoDBManager = require('../lib');
const ConfigManager = require('../lib/config-manager');

describe('MongoDB Cluster Manager', () => {
  let manager;

  beforeEach(() => {
    manager = new MongoDBManager({
      logLevel: 'error', // Reduce noise in tests
      configPath: './test-config.json'
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(manager.initialize()).resolves.toBe(true);
    });

    test('should have all required components', async () => {
      await manager.initialize();
      
      expect(manager.getClusterManager()).toBeDefined();
      expect(manager.getDatabaseOperations()).toBeDefined();
      expect(manager.getBackupManager()).toBeDefined();
      expect(manager.getMonitoring()).toBeDefined();
    });
  });

  describe('Configuration Manager', () => {
    let config;

    beforeEach(() => {
      config = new ConfigManager('./test-config.json');
    });

    test('should create default configuration', async () => {
      await config.createDefaultConfig();
      
      const clusters = config.getClusters();
      expect(clusters).toHaveProperty('example');
      expect(clusters.example).toHaveProperty('uri');
      expect(clusters.example).toHaveProperty('environment', 'development');
    });

    test('should validate cluster configuration', () => {
      const validConfig = {
        uri: 'mongodb://localhost:27017',
        environment: 'test'
      };

      expect(() => config.validateClusterConfig(validConfig)).not.toThrow();

      const invalidConfig = {
        environment: 'test'
        // Missing required 'uri' field
      };

      expect(() => config.validateClusterConfig(invalidConfig)).toThrow('Missing required fields: uri');
    });

    test('should encrypt and decrypt connection strings', () => {
      const originalUri = 'mongodb://user:password@localhost:27017';
      const encrypted = config.encrypt(originalUri);
      const decrypted = config.decrypt(encrypted);

      expect(encrypted).not.toBe(originalUri);
      expect(decrypted).toBe(originalUri);
    });

    test('should manage cluster configurations', () => {
      const clusterConfig = {
        uri: 'mongodb://localhost:27017',
        environment: 'test',
        databases: ['testdb']
      };

      config.addCluster('test-cluster', clusterConfig);
      
      const retrieved = config.getCluster('test-cluster');
      expect(retrieved).toMatchObject(clusterConfig);
      expect(retrieved.addedAt).toBeDefined();

      config.removeCluster('test-cluster');
      expect(config.getCluster('test-cluster')).toBeUndefined();
    });
  });

  describe('Database Operations', () => {
    test('should build query from string', () => {
      const dbOps = manager.getDatabaseOperations();
      
      const queryString = '{"status": "active", "age": {"$gte": 18}}';
      const query = dbOps.buildQueryFromString(queryString);
      
      expect(query).toEqual({
        status: 'active',
        age: { $gte: 18 }
      });
    });

    test('should handle invalid query strings', () => {
      const dbOps = manager.getDatabaseOperations();
      
      const invalidQuery = '{"status": "active", "invalid": }';
      
      expect(() => dbOps.buildQueryFromString(invalidQuery)).toThrow('Invalid query format');
    });
  });

  describe('Monitoring Service', () => {
    test('should calculate metrics trends correctly', async () => {
      await manager.initialize();
      const monitoring = manager.getMonitoring();

      const firstMetrics = {
        operations: {
          insert: 100,
          query: 500,
          update: 50,
          delete: 10
        },
        server: {
          connections: { current: 10 }
        }
      };

      const latestMetrics = {
        operations: {
          insert: 150,
          query: 700,
          update: 75,
          delete: 15
        },
        server: {
          connections: { current: 15 }
        }
      };

      // Access private method for testing
      const trends = monitoring.calculateTrends(firstMetrics, latestMetrics);
      
      expect(trends.operations.inserts).toBe(50);
      expect(trends.operations.queries).toBe(200);
      expect(trends.operations.updates).toBe(25);
      expect(trends.operations.deletes).toBe(5);
      expect(trends.operations.total).toBe(275);
      expect(trends.connections).toBe(5);
    });

    test('should generate appropriate alert messages', async () => {
      await manager.initialize();
      const monitoring = manager.getMonitoring();

      const highConnectionData = {
        current: 180,
        available: 200,
        percentage: 90
      };

      const message = monitoring.getAlertMessage('HIGH_CONNECTION_USAGE', highConnectionData);
      expect(message).toBe('High connection usage: 90% (180/200)');
    });
  });
});

// Mock tests for functionality that requires actual MongoDB connection
describe('MongoDB Operations (Mocked)', () => {
  test('should handle connection errors gracefully', async () => {
    const manager = new MongoDBManager({
      logLevel: 'error'
    });

    // This will fail because no MongoDB is running, which is expected
    await expect(manager.initialize()).rejects.toThrow();
  });
});