const MonitoringService = require('../lib/monitoring-service');

describe('MonitoringService', () => {
  let monitoringService;
  let mockClusterManager;
  let mockLogger;
  let mockClient;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      command: jest.fn(),
      stats: jest.fn(),
      collection: jest.fn()
    };

    mockClient = {
      db: jest.fn().mockReturnValue(mockDb)
    };

    mockClusterManager = {
      listClusters: jest.fn().mockReturnValue([]),
      getConnection: jest.fn().mockReturnValue(mockClient)
    };

    mockLogger = createMockLogger();

    monitoringService = new MonitoringService(mockClusterManager, mockLogger);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with cluster manager and logger', () => {
      expect(monitoringService.clusterManager).toBe(mockClusterManager);
      expect(monitoringService.logger).toBe(mockLogger);
      expect(monitoringService.metrics).toBeInstanceOf(Map);
      expect(monitoringService.alerts).toEqual([]);
      expect(monitoringService.isMonitoring).toBe(false);
    });

    test('should extend EventEmitter', () => {
      expect(monitoringService.on).toBeDefined();
      expect(monitoringService.emit).toBeDefined();
    });
  });

  describe('Start and Stop Monitoring', () => {
    test('should start monitoring successfully', async () => {
      jest.spyOn(monitoringService, 'collectMetrics').mockResolvedValue();

      await monitoringService.startMonitoring(1000);

      expect(monitoringService.isMonitoring).toBe(true);
      expect(monitoringService.monitoringInterval).toBeDefined();
      expect(monitoringService.collectMetrics).toHaveBeenCalledTimes(1); // Initial collection
    });

    test('should not start monitoring if already monitoring', async () => {
      monitoringService.isMonitoring = true;

      await monitoringService.startMonitoring();

      expect(monitoringService.monitoringInterval).toBeNull();
    });

    test('should stop monitoring successfully', () => {
      monitoringService.isMonitoring = true;
      monitoringService.monitoringInterval = setInterval(() => {}, 1000);

      monitoringService.stopMonitoring();

      expect(monitoringService.isMonitoring).toBe(false);
      expect(monitoringService.monitoringInterval).toBeNull();
    });

    test('should handle stop monitoring when not monitoring', () => {
      monitoringService.stopMonitoring();

      expect(monitoringService.isMonitoring).toBe(false);
    });

    test('should collect metrics at specified intervals', async () => {
      jest.spyOn(monitoringService, 'collectMetrics').mockResolvedValue();
      jest.spyOn(monitoringService, 'checkAlerts').mockResolvedValue();

      await monitoringService.startMonitoring(100);

      jest.advanceTimersByTime(250);

      expect(monitoringService.collectMetrics).toHaveBeenCalledTimes(3); // Initial + 2 intervals
      expect(monitoringService.checkAlerts).toHaveBeenCalledTimes(3);
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(() => {
      mockClusterManager.listClusters.mockReturnValue([
        { name: 'test-cluster', status: 'healthy' }
      ]);
    });

    test('should collect metrics for healthy clusters', async () => {
      const mockMetrics = {
        server: { uptime: 3600, connections: { current: 10 } },
        operations: { insert: 100, query: 500 }
      };

      jest.spyOn(monitoringService, 'getClusterMetrics').mockResolvedValue(mockMetrics);
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      await monitoringService.collectMetrics();

      expect(monitoringService.getClusterMetrics).toHaveBeenCalledWith('test-cluster');
      expect(monitoringService.metrics.has('test-cluster')).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('metricsCollected', {
        cluster: 'test-cluster',
        metrics: expect.objectContaining(mockMetrics)
      });
    });

    test('should skip unhealthy clusters', async () => {
      mockClusterManager.listClusters.mockReturnValue([
        { name: 'unhealthy-cluster', status: 'unhealthy' }
      ]);

      jest.spyOn(monitoringService, 'getClusterMetrics');

      await monitoringService.collectMetrics();

      expect(monitoringService.getClusterMetrics).not.toHaveBeenCalled();
    });

    test('should handle metrics collection errors gracefully', async () => {
      jest.spyOn(monitoringService, 'getClusterMetrics')
        .mockRejectedValue(new Error('Connection failed'));

      await monitoringService.collectMetrics();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to collect metrics for test-cluster'),
        expect.any(Error)
      );
    });

    test('should limit stored metrics to 100 points per cluster', async () => {
      jest.spyOn(monitoringService, 'getClusterMetrics').mockResolvedValue({
        server: { uptime: 3600 }
      });

      // Simulate collecting 150 metrics
      for (let i = 0; i < 150; i++) {
        await monitoringService.collectMetrics();
      }

      const clusterMetrics = monitoringService.metrics.get('test-cluster');
      expect(clusterMetrics.length).toBe(100);
    });
  });

  describe('Cluster Metrics Retrieval', () => {
    beforeEach(() => {
      mockDb.command
        .mockResolvedValueOnce({ // serverStatus
          uptime: 3600,
          version: '7.0.0',
          connections: { current: 10, available: 100, totalCreated: 1000 },
          network: { bytesIn: 1024, bytesOut: 2048, numRequests: 500 },
          mem: { resident: 512, virtual: 1024, mapped: 256 },
          extra_info: { user_time_us: 1000, system_time_us: 500 },
          opcounters: { insert: 100, query: 500, update: 50, delete: 10, getmore: 25, command: 200 },
          repl: { ismaster: true, secondary: false, hosts: ['host1:27017'], setName: 'rs0', primary: 'host1:27017' }
        })
        .mockResolvedValueOnce({ // listDatabases
          databases: [
            { name: 'db1', sizeOnDisk: 1024 },
            { name: 'db2', sizeOnDisk: 2048 }
          ]
        });

      jest.spyOn(monitoringService, 'getDatabasesStats').mockResolvedValue({
        databases: 2,
        totalSize: 3072,
        totalDocuments: 1000,
        indexes: 5
      });
    });

    test('should get comprehensive cluster metrics', async () => {
      const metrics = await monitoringService.getClusterMetrics('test-cluster');

      expect(metrics).toEqual({
        server: {
          uptime: 3600,
          version: '7.0.0',
          connections: { current: 10, available: 100, totalCreated: 1000 },
          network: { bytesIn: 1024, bytesOut: 2048, numRequests: 500 },
          memory: { resident: 512, virtual: 1024, mapped: 256 },
          cpu: { user: 1000, system: 500 }
        },
        operations: {
          insert: 100,
          query: 500,
          update: 50,
          delete: 10,
          getmore: 25,
          command: 200
        },
        storage: {
          databases: 2,
          totalSize: 3072,
          totalDocuments: 1000,
          indexes: 5
        },
        replication: {
          ismaster: true,
          secondary: false,
          hosts: ['host1:27017'],
          setName: 'rs0',
          primary: 'host1:27017'
        }
      });
    });

    test('should handle missing optional fields', async () => {
      mockDb.command
        .mockResolvedValueOnce({ // Minimal serverStatus
          uptime: 3600,
          connections: { current: 10 },
          opcounters: { insert: 100 }
        });

      const metrics = await monitoringService.getClusterMetrics('test-cluster');

      expect(metrics.server.memory.mapped).toBe(0);
      expect(metrics.server.cpu.user).toBe(0);
      expect(metrics.replication).toBeNull();
    });

    test('should handle database stats errors', async () => {
      jest.spyOn(monitoringService, 'getDatabasesStats')
        .mockRejectedValue(new Error('Access denied'));

      await expect(monitoringService.getClusterMetrics('test-cluster'))
        .rejects.toThrow('Access denied');
    });
  });

  describe('Database Statistics', () => {
    test('should get databases statistics', async () => {
      mockDb.command.mockResolvedValue({
        databases: [
          { name: 'db1', sizeOnDisk: 1024 },
          { name: 'db2', sizeOnDisk: 2048 }
        ]
      });

      mockClient.db
        .mockReturnValueOnce({
          stats: jest.fn().mockResolvedValue({ objects: 500, indexes: 3 })
        })
        .mockReturnValueOnce({
          stats: jest.fn().mockResolvedValue({ objects: 300, indexes: 2 })
        });

      const result = await monitoringService.getDatabasesStats('test-cluster');

      expect(result).toEqual({
        databases: 2,
        totalSize: 3072,
        totalDocuments: 800,
        indexes: 5
      });
    });

    test('should handle database access errors gracefully', async () => {
      mockDb.command.mockResolvedValue({
        databases: [
          { name: 'accessible', sizeOnDisk: 1024 },
          { name: 'restricted', sizeOnDisk: 2048 }
        ]
      });

      mockClient.db
        .mockReturnValueOnce({
          stats: jest.fn().mockResolvedValue({ objects: 500, indexes: 3 })
        })
        .mockReturnValueOnce({
          stats: jest.fn().mockRejectedValue(new Error('Access denied'))
        });

      const result = await monitoringService.getDatabasesStats('test-cluster');

      expect(result.totalDocuments).toBe(500); // Only accessible database counted
      expect(result.indexes).toBe(3);
    });
  });

  describe('Metrics Retrieval and Analysis', () => {
    beforeEach(() => {
      // Setup some test metrics
      const testMetrics = [
        {
          timestamp: new Date(Date.now() - 3600000), // 1 hour ago
          server: { connections: { current: 5 }, memory: { resident: 256 } },
          operations: { insert: 50, query: 250 }
        },
        {
          timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
          server: { connections: { current: 8 }, memory: { resident: 320 } },
          operations: { insert: 75, query: 375 }
        },
        {
          timestamp: new Date(), // Now
          server: { connections: { current: 10 }, memory: { resident: 400 } },
          operations: { insert: 100, query: 500 }
        }
      ];
      
      monitoringService.metrics.set('test-cluster', testMetrics);
    });

    test('should get metrics for specified time range', async () => {
      const result = await monitoringService.getMetrics('test-cluster', '1h');

      expect(result.cluster).toBe('test-cluster');
      expect(result.timeRange).toBe('1h');
      expect(result.dataPoints).toBe(3);
      expect(result.metrics).toHaveLength(3);
    });

    test('should filter metrics by time range', async () => {
      const result = await monitoringService.getMetrics('test-cluster', '30m');

      expect(result.dataPoints).toBe(2); // Only last 2 metrics within 30 minutes
    });

    test('should return error for non-existent cluster', async () => {
      const result = await monitoringService.getMetrics('non-existent');

      expect(result.error).toBe('No metrics available for cluster');
    });

    test('should calculate metrics summary correctly', () => {
      const testMetrics = [
        {
          server: { connections: { current: 5 }, memory: { resident: 256 } },
          operations: { insert: 50, query: 250, update: 25, delete: 5 },
          storage: { totalSize: 1024, totalDocuments: 500, databases: 2 }
        },
        {
          server: { connections: { current: 10 }, memory: { resident: 512 } },
          operations: { insert: 100, query: 500, update: 50, delete: 10 },
          storage: { totalSize: 2048, totalDocuments: 1000, databases: 2 }
        }
      ];

      const summary = monitoringService.calculateMetricsSummary(testMetrics);

      expect(summary).toEqual({
        connections: {
          current: 10,
          peak: 10,
          average: 7.5
        },
        operations: {
          totalInserts: 50, // 100 - 50
          totalQueries: 250, // 500 - 250
          totalUpdates: 25,  // 50 - 25
          totalDeletes: 5    // 10 - 5
        },
        memory: {
          current: 512,
          peak: 512,
          average: 384
        },
        storage: {
          totalSize: 2048,
          totalDocuments: 1000,
          databases: 2
        }
      });
    });

    test('should handle empty metrics for summary', () => {
      const summary = monitoringService.calculateMetricsSummary([]);

      expect(summary).toEqual({});
    });
  });

  describe('Alert System', () => {
    beforeEach(() => {
      mockClusterManager.listClusters.mockReturnValue([
        { name: 'test-cluster', status: 'healthy' }
      ]);

      monitoringService.metrics.set('test-cluster', [{
        timestamp: new Date(),
        server: {
          connections: { current: 80, available: 100 },
          memory: { resident: 5120 }
        },
        replication: { ismaster: false }
      }]);
    });

    test('should create alert for high connection usage', async () => {
      const emitSpy = jest.spyOn(monitoringService, 'emit');

      await monitoringService.checkAlerts();

      expect(monitoringService.alerts).toHaveLength(1);
      expect(monitoringService.alerts[0].type).toBe('HIGH_CONNECTION_USAGE');
      expect(monitoringService.alerts[0].data.percentage).toBe(80);
      expect(emitSpy).toHaveBeenCalledWith('alert', expect.any(Object));
    });

    test('should create alert for high memory usage', async () => {
      await monitoringService.checkAlerts();

      const memoryAlert = monitoringService.alerts.find(a => a.type === 'HIGH_MEMORY_USAGE');
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert.data.memory).toBe(5120);
    });

    test('should not create duplicate alerts', async () => {
      await monitoringService.checkAlerts();
      await monitoringService.checkAlerts();

      // Should still only have 2 alerts (connection + memory)
      expect(monitoringService.alerts).toHaveLength(2);
    });

    test('should limit alerts to 100', async () => {
      // Create 150 alerts
      for (let i = 0; i < 150; i++) {
        monitoringService.createAlert('TEST_ALERT', 'test-cluster', { count: i });
      }

      expect(monitoringService.alerts).toHaveLength(100);
    });

    test('should get alert message correctly', () => {
      const message = monitoringService.getAlertMessage('HIGH_CONNECTION_USAGE', {
        percentage: 90,
        current: 90,
        available: 100
      });

      expect(message).toBe('High connection usage: 90% (90/100)');
    });

    test('should get alert severity correctly', () => {
      expect(monitoringService.getAlertSeverity('HIGH_CONNECTION_USAGE')).toBe('warning');
      expect(monitoringService.getAlertSeverity('CLUSTER_DOWN')).toBe('critical');
      expect(monitoringService.getAlertSeverity('UNKNOWN_TYPE')).toBe('info');
    });
  });

  describe('Alert Management', () => {
    beforeEach(() => {
      // Create some test alerts
      monitoringService.alerts = [
        {
          id: 'alert1',
          cluster: 'cluster1',
          severity: 'warning',
          acknowledged: false,
          timestamp: new Date(Date.now() - 3600000)
        },
        {
          id: 'alert2',
          cluster: 'cluster2',
          severity: 'error',
          acknowledged: true,
          timestamp: new Date(Date.now() - 1800000)
        },
        {
          id: 'alert3',
          cluster: 'cluster1',
          severity: 'critical',
          acknowledged: false,
          timestamp: new Date()
        }
      ];
    });

    test('should get all alerts sorted by timestamp', () => {
      const alerts = monitoringService.getAlerts();

      expect(alerts).toHaveLength(3);
      expect(alerts[0].id).toBe('alert3'); // Most recent first
      expect(alerts[2].id).toBe('alert1'); // Oldest last
    });

    test('should filter alerts by cluster', () => {
      const alerts = monitoringService.getAlerts('cluster1');

      expect(alerts).toHaveLength(2);
      expect(alerts.every(a => a.cluster === 'cluster1')).toBe(true);
    });

    test('should filter alerts by severity', () => {
      const alerts = monitoringService.getAlerts(null, 'warning');

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('warning');
    });

    test('should acknowledge alert', () => {
      const result = monitoringService.acknowledgeAlert('alert1');

      expect(result).toBe(true);
      expect(monitoringService.alerts.find(a => a.id === 'alert1').acknowledged).toBe(true);
      expect(monitoringService.alerts.find(a => a.id === 'alert1').acknowledgedAt).toBeDefined();
    });

    test('should return false for non-existent alert acknowledgment', () => {
      const result = monitoringService.acknowledgeAlert('non-existent');

      expect(result).toBe(false);
    });

    test('should clear acknowledged alerts', () => {
      const clearedCount = monitoringService.clearAcknowledgedAlerts();

      expect(clearedCount).toBe(1); // Only alert2 was acknowledged
      expect(monitoringService.alerts).toHaveLength(2);
      expect(monitoringService.alerts.every(a => !a.acknowledged)).toBe(true);
    });
  });

  describe('Monitoring Status', () => {
    test('should get monitoring status when not monitoring', () => {
      const status = monitoringService.getMonitoringStatus();

      expect(status).toEqual({
        isMonitoring: false,
        clustersMonitored: 0,
        alertsActive: 0,
        totalAlerts: 0,
        lastCollection: null
      });
    });

    test('should get monitoring status when monitoring with data', () => {
      monitoringService.isMonitoring = true;
      monitoringService.metrics.set('cluster1', [
        { timestamp: new Date(Date.now() - 1000) }
      ]);
      monitoringService.metrics.set('cluster2', [
        { timestamp: new Date() }
      ]);
      monitoringService.alerts = [
        { acknowledged: false },
        { acknowledged: true },
        { acknowledged: false }
      ];

      const status = monitoringService.getMonitoringStatus();

      expect(status.isMonitoring).toBe(true);
      expect(status.clustersMonitored).toBe(2);
      expect(status.alertsActive).toBe(2);
      expect(status.totalAlerts).toBe(3);
      expect(status.lastCollection).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling', () => {
    test('should handle cluster manager errors during monitoring', async () => {
      mockClusterManager.listClusters.mockImplementation(() => {
        throw new Error('Cluster manager error');
      });

      // Should not throw error
      await expect(monitoringService.collectMetrics()).resolves.not.toThrow();
    });

    test('should handle monitoring interval errors', async () => {
      jest.spyOn(monitoringService, 'collectMetrics').mockRejectedValue(new Error('Monitoring error'));
      jest.spyOn(monitoringService, 'checkAlerts').mockRejectedValue(new Error('Alert error'));

      await monitoringService.startMonitoring(10);

      jest.advanceTimersByTime(50);

      expect(mockLogger.error).toHaveBeenCalledWith('Monitoring error:', expect.any(Error));
    });

    test('should handle metrics calculation errors', () => {
      const invalidMetrics = [
        { server: null },
        { operations: undefined }
      ];

      const summary = monitoringService.calculateMetricsSummary(invalidMetrics);

      // Should not throw error and return partial results
      expect(summary).toBeDefined();
    });
  });

  describe('Slow Query Analysis', () => {
    test('should get slow queries when profiling enabled', async () => {
      const mockProfilingData = [
        {
          ts: new Date(),
          millis: 150,
          command: { find: 'users' },
          ns: 'testdb.users',
          planSummary: 'COLLSCAN',
          user: 'testuser',
          client: '127.0.0.1'
        }
      ];

      mockDb.command.mockResolvedValue({ was: 1 }); // Profiling enabled
      mockDb.collection.mockReturnValue({
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue(mockProfilingData)
        })
      });

      const result = await monitoringService.getSlowQueries('test-cluster', 'testdb');

      expect(result).toEqual({
        database: 'testdb',
        slowQueries: [{
          timestamp: expect.any(Date),
          duration: 150,
          namespace: 'testdb.users',
          command: { find: 'users' },
          planSummary: 'COLLSCAN',
          user: 'testuser',
          client: '127.0.0.1'
        }]
      });
    });

    test('should handle disabled profiling', async () => {
      mockDb.command.mockResolvedValue({ was: 0 }); // Profiling disabled

      const result = await monitoringService.getSlowQueries('test-cluster', 'testdb');

      expect(result.error).toBe('Database profiling is not enabled');
      expect(result.suggestion).toContain('Enable profiling');
    });
  });
});