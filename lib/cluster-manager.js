const { MongoClient } = require('mongodb');
const EventEmitter = require('events');

class ClusterManager extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.connections = new Map();
    this.healthStatus = new Map();
    this.connectionOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      retryWrites: true,
      retryReads: true
    };
  }

  async initialize() {
    const clusters = this.config.getClusters();
    for (const [name, clusterConfig] of Object.entries(clusters)) {
      try {
        await this.addCluster(name, clusterConfig);
      } catch (error) {
        this.logger.warn(`Failed to connect to cluster ${name}:`, error.message);
      }
    }
  }

  async addCluster(name, clusterConfig) {
    try {
      const options = { ...this.connectionOptions, ...clusterConfig.options };
      const client = new MongoClient(clusterConfig.uri, options);
      
      await client.connect();
      await this.testConnection(client);
      
      this.connections.set(name, {
        client,
        config: clusterConfig,
        connectedAt: new Date(),
        lastHealthCheck: new Date()
      });
      
      this.healthStatus.set(name, { status: 'healthy', lastCheck: new Date() });
      this.logger.info(`Successfully connected to cluster: ${name}`);
      this.emit('clusterConnected', { name, config: clusterConfig });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to connect to cluster ${name}:`, error);
      this.healthStatus.set(name, { 
        status: 'unhealthy', 
        error: error.message, 
        lastCheck: new Date() 
      });
      throw error;
    }
  }

  async removeCluster(name) {
    const connection = this.connections.get(name);
    if (connection) {
      try {
        await connection.client.close();
        this.connections.delete(name);
        this.healthStatus.delete(name);
        this.logger.info(`Disconnected from cluster: ${name}`);
        this.emit('clusterDisconnected', { name });
        return true;
      } catch (error) {
        this.logger.error(`Error disconnecting from cluster ${name}:`, error);
        throw error;
      }
    }
    return false;
  }

  async testConnection(client) {
    const admin = client.db('admin');
    await admin.command({ ping: 1 });
    return true;
  }

  async getClusterInfo(name) {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Cluster ${name} not found`);
    }

    try {
      const client = connection.client;
      const admin = client.db('admin');
      
      const [serverStatus, buildInfo, replSetStatus] = await Promise.allSettled([
        admin.command({ serverStatus: 1 }),
        admin.command({ buildInfo: 1 }),
        admin.command({ replSetGetStatus: 1 }).catch(() => null)
      ]);

      return {
        name,
        connected: true,
        serverStatus: serverStatus.status === 'fulfilled' ? serverStatus.value : null,
        buildInfo: buildInfo.status === 'fulfilled' ? buildInfo.value : null,
        replicaSet: replSetStatus.status === 'fulfilled' ? replSetStatus.value : null,
        connectionInfo: {
          connectedAt: connection.connectedAt,
          lastHealthCheck: connection.lastHealthCheck
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get cluster info for ${name}:`, error);
      throw error;
    }
  }

  async healthCheck(name = null) {
    const clustersToCheck = name ? [name] : Array.from(this.connections.keys());
    const results = {};

    for (const clusterName of clustersToCheck) {
      const connection = this.connections.get(clusterName);
      if (!connection) {
        results[clusterName] = { status: 'not_found' };
        continue;
      }

      try {
        await this.testConnection(connection.client);
        this.healthStatus.set(clusterName, { 
          status: 'healthy', 
          lastCheck: new Date() 
        });
        connection.lastHealthCheck = new Date();
        results[clusterName] = { status: 'healthy' };
      } catch (error) {
        this.healthStatus.set(clusterName, { 
          status: 'unhealthy', 
          error: error.message, 
          lastCheck: new Date() 
        });
        results[clusterName] = { status: 'unhealthy', error: error.message };
        this.logger.warn(`Health check failed for cluster ${clusterName}:`, error.message);
      }
    }

    return results;
  }

  getConnection(name) {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Cluster ${name} not found or not connected`);
    }
    return connection.client;
  }

  getDatabase(clusterName, dbName) {
    const client = this.getConnection(clusterName);
    return client.db(dbName);
  }

  listClusters() {
    return Array.from(this.connections.keys()).map(name => {
      const connection = this.connections.get(name);
      const health = this.healthStatus.get(name);
      return {
        name,
        environment: connection.config.environment || 'unknown',
        databases: connection.config.databases || [],
        status: health.status,
        connectedAt: connection.connectedAt,
        lastHealthCheck: health.lastCheck
      };
    });
  }

  async closeAllConnections() {
    const promises = Array.from(this.connections.entries()).map(([name, connection]) => 
      this.removeCluster(name)
    );
    await Promise.allSettled(promises);
  }

  async startHealthMonitoring(intervalMs = 30000) {
    this.healthInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        this.logger.error('Health monitoring error:', error);
      }
    }, intervalMs);
  }

  stopHealthMonitoring() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }
}

module.exports = ClusterManager;