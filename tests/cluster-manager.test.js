const ClusterManager = require('../lib/cluster-manager');
const { MongoClient } = require('mongodb');

describe('ClusterManager', () => {
  let clusterManager;
  let mockConfig;
  let mockLogger;
  let mockClient;

  beforeEach(() => {
    mockConfig = {
      getClusters: jest.fn().mockReturnValue({}),
      getSetting: jest.fn()
    };
    
    mockLogger = createMockLogger();
    mockClient = createMockMongoClient();
    
    MongoClient.mockImplementation(() => mockClient);
    
    clusterManager = new ClusterManager(mockConfig, mockLogger);
  });

  describe('Constructor', () => {
    test('should initialize with empty connections and health status', () => {
      expect(clusterManager.connections.size).toBe(0);
      expect(clusterManager.healthStatus.size).toBe(0);
    });

    test('should set default connection options', () => {
      expect(clusterManager.connectionOptions).toEqual({
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true
      });
    });

    test('should extend EventEmitter', () => {
      expect(clusterManager.on).toBeDefined();
      expect(clusterManager.emit).toBeDefined();
    });
  });

  describe('Initialization', () => {
    test('should initialize with existing clusters from config', async () => {
      const clusters = {
        test1: { uri: 'mongodb://localhost:27017' },
        test2: { uri: 'mongodb://localhost:27018' }
      };
      mockConfig.getClusters.mockReturnValue(clusters);
      
      // Mock successful connections
      jest.spyOn(clusterManager, 'addCluster').mockResolvedValue(true);

      await clusterManager.initialize();

      expect(clusterManager.addCluster).toHaveBeenCalledTimes(2);
      expect(clusterManager.addCluster).toHaveBeenCalledWith('test1', clusters.test1);
      expect(clusterManager.addCluster).toHaveBeenCalledWith('test2', clusters.test2);
    });

    test('should continue initialization even if some clusters fail', async () => {
      const clusters = {
        working: { uri: 'mongodb://localhost:27017' },
        broken: { uri: 'mongodb://invalid:27017' }
      };
      mockConfig.getClusters.mockReturnValue(clusters);
      
      jest.spyOn(clusterManager, 'addCluster')
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Connection failed'));

      await clusterManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to cluster broken'),
        expect.any(String)
      );
    });
  });

  describe('Adding Clusters', () => {
    test('should successfully add a cluster', async () => {
      const clusterConfig = {
        uri: 'mongodb://localhost:27017',
        environment: 'test',
        databases: ['testdb']
      };

      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });

      const emitSpy = jest.spyOn(clusterManager, 'emit');

      const result = await clusterManager.addCluster('test-cluster', clusterConfig);

      expect(result).toBe(true);
      expect(mockClient.connect).toHaveBeenCalled();
      expect(clusterManager.connections.has('test-cluster')).toBe(true);
      expect(clusterManager.healthStatus.get('test-cluster').status).toBe('healthy');
      expect(emitSpy).toHaveBeenCalledWith('clusterConnected', {
        name: 'test-cluster',
        config: clusterConfig
      });
    });

    test('should handle connection failures', async () => {
      const clusterConfig = { uri: 'mongodb://invalid:27017' };
      const connectionError = new Error('Connection refused');
      
      mockClient.connect.mockRejectedValue(connectionError);

      await expect(clusterManager.addCluster('broken-cluster', clusterConfig))
        .rejects.toThrow('Connection refused');

      expect(clusterManager.connections.has('broken-cluster')).toBe(false);
      expect(clusterManager.healthStatus.get('broken-cluster').status).toBe('unhealthy');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to cluster broken-cluster'),
        connectionError
      );
    });

    test('should merge custom options with defaults', async () => {
      const clusterConfig = {
        uri: 'mongodb://localhost:27017',
        options: {
          maxPoolSize: 20,
          customOption: 'value'
        }
      };

      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });

      await clusterManager.addCluster('test-cluster', clusterConfig);

      expect(MongoClient).toHaveBeenCalledWith(
        clusterConfig.uri,
        expect.objectContaining({
          maxPoolSize: 20,
          serverSelectionTimeoutMS: 5000,
          customOption: 'value'
        })
      );
    });
  });

  describe('Removing Clusters', () => {
    beforeEach(async () => {
      // Add a cluster first
      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });
      await clusterManager.addCluster('test-cluster', { uri: 'mongodb://localhost:27017' });
    });

    test('should successfully remove a cluster', async () => {
      mockClient.close.mockResolvedValue();
      const emitSpy = jest.spyOn(clusterManager, 'emit');

      const result = await clusterManager.removeCluster('test-cluster');

      expect(result).toBe(true);
      expect(mockClient.close).toHaveBeenCalled();
      expect(clusterManager.connections.has('test-cluster')).toBe(false);
      expect(clusterManager.healthStatus.has('test-cluster')).toBe(false);
      expect(emitSpy).toHaveBeenCalledWith('clusterDisconnected', {
        name: 'test-cluster'
      });
    });

    test('should return false for non-existent cluster', async () => {
      const result = await clusterManager.removeCluster('non-existent');

      expect(result).toBe(false);
    });

    test('should handle close errors gracefully', async () => {
      const closeError = new Error('Close failed');
      mockClient.close.mockRejectedValue(closeError);

      await expect(clusterManager.removeCluster('test-cluster'))
        .rejects.toThrow('Close failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error disconnecting from cluster test-cluster'),
        closeError
      );
    });
  });

  describe('Connection Testing', () => {
    test('should test connection successfully', async () => {
      const mockAdmin = {
        command: jest.fn().mockResolvedValue({ ok: 1 })
      };
      mockClient.db.mockReturnValue(mockAdmin);

      const result = await clusterManager.testConnection(mockClient);

      expect(result).toBe(true);
      expect(mockClient.db).toHaveBeenCalledWith('admin');
      expect(mockAdmin.command).toHaveBeenCalledWith({ ping: 1 });
    });

    test('should handle test connection failures', async () => {
      const mockAdmin = {
        command: jest.fn().mockRejectedValue(new Error('Ping failed'))
      };
      mockClient.db.mockReturnValue(mockAdmin);

      await expect(clusterManager.testConnection(mockClient))
        .rejects.toThrow('Ping failed');
    });
  });

  describe('Cluster Information', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });
      await clusterManager.addCluster('test-cluster', { uri: 'mongodb://localhost:27017' });
    });

    test('should get comprehensive cluster information', async () => {
      const mockAdmin = {
        command: jest.fn()
          .mockResolvedValueOnce({ version: '7.0.0', connections: { current: 5 } }) // serverStatus
          .mockResolvedValueOnce({ version: '7.0.0', gitVersion: 'abc123' }) // buildInfo
          .mockResolvedValueOnce({ set: 'rs0', primary: 'host1:27017' }) // replSetStatus
      };
      
      mockClient.db.mockReturnValue(mockAdmin);

      const info = await clusterManager.getClusterInfo('test-cluster');

      expect(info).toEqual({
        name: 'test-cluster',
        connected: true,
        serverStatus: { version: '7.0.0', connections: { current: 5 } },
        buildInfo: { version: '7.0.0', gitVersion: 'abc123' },
        replicaSet: { set: 'rs0', primary: 'host1:27017' },
        connectionInfo: {
          connectedAt: expect.any(Date),
          lastHealthCheck: expect.any(Date)
        }
      });
    });

    test('should handle partial information gracefully', async () => {
      const mockAdmin = {
        command: jest.fn()
          .mockResolvedValueOnce({ version: '7.0.0' }) // serverStatus
          .mockRejectedValueOnce(new Error('BuildInfo failed')) // buildInfo
          .mockResolvedValueOnce(null) // replSetStatus (standalone)
      };
      
      mockClient.db.mockReturnValue(mockAdmin);

      const info = await clusterManager.getClusterInfo('test-cluster');

      expect(info.serverStatus).toBeDefined();
      expect(info.buildInfo).toBeNull();
      expect(info.replicaSet).toBeNull();
    });

    test('should throw error for non-existent cluster', async () => {
      await expect(clusterManager.getClusterInfo('non-existent'))
        .rejects.toThrow('Cluster non-existent not found');
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });
      await clusterManager.addCluster('healthy-cluster', { uri: 'mongodb://localhost:27017' });
      await clusterManager.addCluster('unhealthy-cluster', { uri: 'mongodb://localhost:27018' });
    });

    test('should check health of all clusters', async () => {
      jest.spyOn(clusterManager, 'testConnection')
        .mockResolvedValueOnce(true)  // healthy-cluster
        .mockRejectedValueOnce(new Error('Connection failed')); // unhealthy-cluster

      const results = await clusterManager.healthCheck();

      expect(results).toEqual({
        'healthy-cluster': { status: 'healthy' },
        'unhealthy-cluster': { status: 'unhealthy', error: 'Connection failed' }
      });

      expect(clusterManager.healthStatus.get('healthy-cluster').status).toBe('healthy');
      expect(clusterManager.healthStatus.get('unhealthy-cluster').status).toBe('unhealthy');
    });

    test('should check health of specific cluster', async () => {
      jest.spyOn(clusterManager, 'testConnection').mockResolvedValue(true);

      const results = await clusterManager.healthCheck('healthy-cluster');

      expect(results).toEqual({
        'healthy-cluster': { status: 'healthy' }
      });
      expect(Object.keys(results)).toHaveLength(1);
    });

    test('should handle health check for non-existent cluster', async () => {
      const results = await clusterManager.healthCheck('non-existent');

      expect(results).toEqual({
        'non-existent': { status: 'not_found' }
      });
    });

    test('should start and stop health monitoring', async () => {
      jest.useFakeTimers();
      jest.spyOn(clusterManager, 'healthCheck').mockResolvedValue({});

      clusterManager.startHealthMonitoring(1000);
      
      expect(clusterManager.healthInterval).toBeDefined();
      
      // Fast-forward time
      jest.advanceTimersByTime(1100);
      
      expect(clusterManager.healthCheck).toHaveBeenCalled();

      clusterManager.stopHealthMonitoring();
      
      expect(clusterManager.healthInterval).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('Connection Retrieval', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });
      await clusterManager.addCluster('test-cluster', { uri: 'mongodb://localhost:27017' });
    });

    test('should get connection for existing cluster', () => {
      const connection = clusterManager.getConnection('test-cluster');

      expect(connection).toBe(mockClient);
    });

    test('should throw error for non-existent cluster', () => {
      expect(() => clusterManager.getConnection('non-existent'))
        .toThrow('Cluster non-existent not found or not connected');
    });

    test('should get database for existing cluster', () => {
      const mockDb = { name: 'testdb' };
      mockClient.db.mockReturnValue(mockDb);

      const db = clusterManager.getDatabase('test-cluster', 'testdb');

      expect(db).toBe(mockDb);
      expect(mockClient.db).toHaveBeenCalledWith('testdb');
    });
  });

  describe('Cluster Listing', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });
    });

    test('should list all clusters with metadata', async () => {
      await clusterManager.addCluster('cluster1', {
        uri: 'mongodb://localhost:27017',
        environment: 'development',
        databases: ['db1', 'db2']
      });

      await clusterManager.addCluster('cluster2', {
        uri: 'mongodb://localhost:27018',
        environment: 'production',
        databases: ['proddb']
      });

      const clusters = clusterManager.listClusters();

      expect(clusters).toHaveLength(2);
      expect(clusters[0]).toEqual({
        name: 'cluster1',
        environment: 'development',
        databases: ['db1', 'db2'],
        status: 'healthy',
        connectedAt: expect.any(Date),
        lastHealthCheck: expect.any(Date)
      });
    });

    test('should return empty array when no clusters configured', () => {
      const clusters = clusterManager.listClusters();

      expect(clusters).toEqual([]);
    });
  });

  describe('Cleanup and Shutdown', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue();
      mockClient.db.mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      });
      await clusterManager.addCluster('cluster1', { uri: 'mongodb://localhost:27017' });
      await clusterManager.addCluster('cluster2', { uri: 'mongodb://localhost:27018' });
    });

    test('should close all connections', async () => {
      mockClient.close.mockResolvedValue();
      jest.spyOn(clusterManager, 'removeCluster').mockResolvedValue(true);

      await clusterManager.closeAllConnections();

      expect(clusterManager.removeCluster).toHaveBeenCalledTimes(2);
    });

    test('should handle partial close failures', async () => {
      jest.spyOn(clusterManager, 'removeCluster')
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Close failed'));

      await clusterManager.closeAllConnections();

      // Should not throw error, should handle failures gracefully
      expect(clusterManager.removeCluster).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed cluster configuration', async () => {
      const invalidConfig = null;

      await expect(clusterManager.addCluster('invalid', invalidConfig))
        .rejects.toThrow();
    });

    test('should handle connection timeout', async () => {
      const timeoutError = new Error('connection timeout');
      timeoutError.code = 'ECONNREFUSED';
      mockClient.connect.mockRejectedValue(timeoutError);

      await expect(clusterManager.addCluster('timeout-cluster', { uri: 'mongodb://timeout:27017' }))
        .rejects.toThrow('connection timeout');
    });

    test('should handle authentication failures', async () => {
      const authError = new Error('Authentication failed');
      authError.code = 'EAUTH';
      mockClient.connect.mockRejectedValue(authError);

      await expect(clusterManager.addCluster('auth-fail', { uri: 'mongodb://invalid:pass@localhost:27017' }))
        .rejects.toThrow('Authentication failed');
    });

    test('should handle health monitoring errors gracefully', async () => {
      jest.useFakeTimers();
      jest.spyOn(clusterManager, 'healthCheck').mockRejectedValue(new Error('Health check failed'));

      clusterManager.startHealthMonitoring(100);

      jest.advanceTimersByTime(150);

      expect(mockLogger.error).toHaveBeenCalledWith('Health monitoring error:', expect.any(Error));

      clusterManager.stopHealthMonitoring();
      jest.useRealTimers();
    });
  });
});