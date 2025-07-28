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
    console.log(`ClusterManager initializing with ${Object.keys(clusters).length} clusters:`, Object.keys(clusters));
    
    for (const [name, clusterConfig] of Object.entries(clusters)) {
      console.log(`Attempting to add cluster: ${name}`);
      try {
        await this.addCluster(name, clusterConfig);
        console.log(`✅ Successfully added cluster: ${name}`);
      } catch (error) {
        console.log(`❌ Failed to connect to cluster ${name}:`, error.message);
        this.logger.warn(`Failed to connect to cluster ${name}:`, error.message);
        
        // Still add to health status as unhealthy so it shows in the list
        this.healthStatus.set(name, { 
          status: 'unhealthy', 
          error: error.message, 
          lastCheck: new Date() 
        });
      }
    }
    
    console.log(`ClusterManager initialization complete. Connected clusters: ${this.connections.size}, Health status entries: ${this.healthStatus.size}`);
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
    // Get all cluster names from both connections and health status
    const allClusterNames = new Set([
      ...this.connections.keys(),
      ...this.healthStatus.keys()
    ]);

    return Array.from(allClusterNames).map(name => {
      const connection = this.connections.get(name);
      const health = this.healthStatus.get(name) || { status: 'unknown', lastCheck: new Date() };
      
      if (connection) {
        // Connected cluster
        return {
          name,
          environment: connection.config.environment || 'unknown',
          databases: connection.config.databases || [],
          status: health.status,
          connectedAt: connection.connectedAt,
          lastHealthCheck: health.lastCheck
        };
      } else {
        // Failed/unhealthy cluster
        const configClusters = this.config.getClusters();
        const clusterConfig = configClusters[name] || {};
        return {
          name,
          environment: clusterConfig.environment || 'unknown',
          databases: clusterConfig.databases || [],
          status: health.status,
          connectedAt: null,
          lastHealthCheck: health.lastCheck,
          error: health.error
        };
      }
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