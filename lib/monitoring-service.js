const EventEmitter = require('events');

class MonitoringService extends EventEmitter {
  constructor(clusterManager, logger) {
    super();
    this.clusterManager = clusterManager;
    this.logger = logger;
    this.metrics = new Map();
    this.alerts = [];
    this.monitoringInterval = null;
    this.isMonitoring = false;
  }

  async startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.logger.info('Starting monitoring service');

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
      } catch (error) {
        this.logger.error('Monitoring error:', error);
      }
    }, intervalMs);

    // Initial collection
    await this.collectMetrics();
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger.info('Stopped monitoring service');
  }

  async collectMetrics() {
    const clusters = this.clusterManager.listClusters();
    const timestamp = new Date();

    for (const cluster of clusters) {
      if (cluster.status !== 'healthy') continue;

      try {
        const metrics = await this.getClusterMetrics(cluster.name);
        
        if (!this.metrics.has(cluster.name)) {
          this.metrics.set(cluster.name, []);
        }

        const clusterMetrics = this.metrics.get(cluster.name);
        clusterMetrics.push({
          timestamp,
          ...metrics
        });

        // Keep only last 100 metric points
        if (clusterMetrics.length > 100) {
          clusterMetrics.splice(0, clusterMetrics.length - 100);
        }

        this.emit('metricsCollected', { cluster: cluster.name, metrics });
      } catch (error) {
        this.logger.error(`Failed to collect metrics for ${cluster.name}:`, error);
      }
    }
  }

  async getClusterMetrics(clusterName) {
    try {
      const client = this.clusterManager.getConnection(clusterName);
      const admin = client.db('admin');

      const [serverStatus, dbStats] = await Promise.all([
        admin.command({ serverStatus: 1 }),
        this.getDatabasesStats(clusterName)
      ]);

      return {
        server: {
          uptime: serverStatus.uptime,
          version: serverStatus.version,
          connections: {
            current: serverStatus.connections.current,
            available: serverStatus.connections.available,
            totalCreated: serverStatus.connections.totalCreated
          },
          network: {
            bytesIn: serverStatus.network.bytesIn,
            bytesOut: serverStatus.network.bytesOut,
            numRequests: serverStatus.network.numRequests
          },
          memory: {
            resident: serverStatus.mem.resident,
            virtual: serverStatus.mem.virtual,
            mapped: serverStatus.mem.mapped || 0
          },
          cpu: {
            user: serverStatus.extra_info?.user_time_us || 0,
            system: serverStatus.extra_info?.system_time_us || 0
          }
        },
        operations: {
          insert: serverStatus.opcounters.insert,
          query: serverStatus.opcounters.query,
          update: serverStatus.opcounters.update,
          delete: serverStatus.opcounters.delete,
          getmore: serverStatus.opcounters.getmore,
          command: serverStatus.opcounters.command
        },
        storage: {
          databases: dbStats.databases,
          totalSize: dbStats.totalSize,
          totalDocuments: dbStats.totalDocuments,
          indexes: dbStats.indexes
        },
        replication: serverStatus.repl ? {
          ismaster: serverStatus.repl.ismaster,
          secondary: serverStatus.repl.secondary,
          hosts: serverStatus.repl.hosts,
          setName: serverStatus.repl.setName,
          primary: serverStatus.repl.primary
        } : null
      };
    } catch (error) {
      this.logger.error(`Failed to get metrics for ${clusterName}:`, error);
      throw error;
    }
  }

  async getDatabasesStats(clusterName) {
    try {
      const client = this.clusterManager.getConnection(clusterName);
      const admin = client.db('admin');
      const dbList = await admin.command({ listDatabases: 1 });

      let totalSize = 0;
      let totalDocuments = 0;
      let totalIndexes = 0;

      for (const dbInfo of dbList.databases) {
        totalSize += dbInfo.sizeOnDisk || 0;
        
        try {
          const db = client.db(dbInfo.name);
          const stats = await db.stats();
          totalDocuments += stats.objects || 0;
          totalIndexes += stats.indexes || 0;
        } catch (error) {
          // Skip databases we can't access
        }
      }

      return {
        databases: dbList.databases.length,
        totalSize,
        totalDocuments,
        indexes: totalIndexes
      };
    } catch (error) {
      throw error;
    }
  }

  async getMetrics(clusterName, timeRange = '1h') {
    const clusterMetrics = this.metrics.get(clusterName);
    if (!clusterMetrics) {
      return { error: 'No metrics available for cluster' };
    }

    const now = new Date();
    let startTime = new Date();

    switch (timeRange) {
      case '5m':
        startTime.setMinutes(now.getMinutes() - 5);
        break;
      case '30m':
        startTime.setMinutes(now.getMinutes() - 30);
        break;
      case '1h':
        startTime.setHours(now.getHours() - 1);
        break;
      case '6h':
        startTime.setHours(now.getHours() - 6);
        break;
      case '24h':
        startTime.setHours(now.getHours() - 24);
        break;
      default:
        startTime.setHours(now.getHours() - 1);
    }

    const filteredMetrics = clusterMetrics.filter(m => 
      new Date(m.timestamp) >= startTime
    );

    return {
      cluster: clusterName,
      timeRange,
      dataPoints: filteredMetrics.length,
      metrics: filteredMetrics,
      summary: this.calculateMetricsSummary(filteredMetrics)
    };
  }

  calculateMetricsSummary(metrics) {
    if (metrics.length === 0) {
      return {};
    }

    const latest = metrics[metrics.length - 1];
    const earliest = metrics[0];

    return {
      connections: {
        current: latest.server.connections.current,
        peak: Math.max(...metrics.map(m => m.server.connections.current)),
        average: metrics.reduce((sum, m) => sum + m.server.connections.current, 0) / metrics.length
      },
      operations: {
        totalInserts: latest.operations.insert - earliest.operations.insert,
        totalQueries: latest.operations.query - earliest.operations.query,
        totalUpdates: latest.operations.update - earliest.operations.update,
        totalDeletes: latest.operations.delete - earliest.operations.delete
      },
      memory: {
        current: latest.server.memory.resident,
        peak: Math.max(...metrics.map(m => m.server.memory.resident)),
        average: metrics.reduce((sum, m) => sum + m.server.memory.resident, 0) / metrics.length
      },
      storage: {
        totalSize: latest.storage.totalSize,
        totalDocuments: latest.storage.totalDocuments,
        databases: latest.storage.databases
      }
    };
  }

  async getSlowQueries(clusterName, database, limit = 10) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, database);
      
      // Check if profiling is enabled
      const profilingStatus = await db.command({ profile: -1 });
      
      if (profilingStatus.was === 0) {
        return {
          error: 'Database profiling is not enabled',
          suggestion: 'Enable profiling with: db.setProfilingLevel(1, { slowms: 100 })'
        };
      }

      const profileCollection = db.collection('system.profile');
      const slowQueries = await profileCollection
        .find({ 
          ts: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          millis: { $exists: true }
        })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray();

      return {
        database,
        slowQueries: slowQueries.map(query => ({
          timestamp: query.ts,
          duration: query.millis,
          namespace: query.ns,
          command: query.command,
          planSummary: query.planSummary,
          user: query.user,
          client: query.client
        }))
      };
    } catch (error) {
      this.logger.error(`Failed to get slow queries for ${clusterName}/${database}:`, error);
      throw error;
    }
  }

  async checkAlerts() {
    const clusters = this.clusterManager.listClusters();

    for (const cluster of clusters) {
      if (cluster.status !== 'healthy') continue;

      const clusterMetrics = this.metrics.get(cluster.name);
      if (!clusterMetrics || clusterMetrics.length === 0) continue;

      const latest = clusterMetrics[clusterMetrics.length - 1];
      
      // Check connection threshold
      if (latest.server.connections.current / latest.server.connections.available > 0.8) {
        this.createAlert('HIGH_CONNECTION_USAGE', cluster.name, {
          current: latest.server.connections.current,
          available: latest.server.connections.available,
          percentage: Math.round((latest.server.connections.current / latest.server.connections.available) * 100)
        });
      }

      // Check memory usage
      if (latest.server.memory.resident > 4096) { // 4GB
        this.createAlert('HIGH_MEMORY_USAGE', cluster.name, {
          memory: latest.server.memory.resident,
          unit: 'MB'
        });
      }

      // Check replication lag (if replica set)
      if (latest.replication && !latest.replication.ismaster) {
        // Implementation would check replication lag
      }
    }
  }

  createAlert(type, cluster, data) {
    const alert = {
      id: `${type}-${cluster}-${Date.now()}`,
      type,
      cluster,
      severity: this.getAlertSeverity(type),
      message: this.getAlertMessage(type, data),
      data,
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    this.emit('alert', alert);
    this.logger.warn(`Alert created: ${alert.message}`);

    return alert;
  }

  getAlertSeverity(type) {
    const severityMap = {
      'HIGH_CONNECTION_USAGE': 'warning',
      'HIGH_MEMORY_USAGE': 'warning',
      'REPLICATION_LAG': 'error',
      'CLUSTER_DOWN': 'critical'
    };
    return severityMap[type] || 'info';
  }

  getAlertMessage(type, data) {
    switch (type) {
      case 'HIGH_CONNECTION_USAGE':
        return `High connection usage: ${data.percentage}% (${data.current}/${data.available})`;
      case 'HIGH_MEMORY_USAGE':
        return `High memory usage: ${data.memory} ${data.unit}`;
      case 'REPLICATION_LAG':
        return `Replication lag detected: ${data.lag}ms`;
      case 'CLUSTER_DOWN':
        return `Cluster is down or unreachable`;
      default:
        return `Unknown alert type: ${type}`;
    }
  }

  getAlerts(clusterName = null, severity = null) {
    let filteredAlerts = this.alerts;

    if (clusterName) {
      filteredAlerts = filteredAlerts.filter(alert => alert.cluster === clusterName);
    }

    if (severity) {
      filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
    }

    return filteredAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      return true;
    }
    return false;
  }

  clearAcknowledgedAlerts() {
    const before = this.alerts.length;
    this.alerts = this.alerts.filter(alert => !alert.acknowledged);
    return before - this.alerts.length;
  }

  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      clustersMonitored: this.metrics.size,
      alertsActive: this.alerts.filter(a => !a.acknowledged).length,
      totalAlerts: this.alerts.length,
      lastCollection: this.metrics.size > 0 ? 
        Math.max(...Array.from(this.metrics.values()).map(metrics => 
          metrics.length > 0 ? new Date(metrics[metrics.length - 1].timestamp) : 0
        )) : null
    };
  }
}

module.exports = MonitoringService;