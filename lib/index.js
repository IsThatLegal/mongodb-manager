const ClusterManager = require('./cluster-manager');
const DatabaseOperations = require('./database-operations');
const BackupManager = require('./backup-manager');
const MonitoringService = require('./monitoring-service');
const ConfigManager = require('./config-manager');
const Logger = require('./utils/logger');

class MongoDBManager {
  constructor(options = {}) {
    this.logger = new Logger(options.logLevel || 'info', { serverless: options.serverless });
    this.config = new ConfigManager(options.configPath, { serverless: options.serverless });
    this.clusterManager = new ClusterManager(this.config, this.logger);
    this.databaseOps = new DatabaseOperations(this.clusterManager, this.logger);
    this.backupManager = new BackupManager(this.clusterManager, this.config, this.logger);
    this.monitoring = new MonitoringService(this.clusterManager, this.logger);
  }

  async initialize() {
    try {
      await this.config.load();
      await this.clusterManager.initialize();
      this.logger.info('MongoDB Manager initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize MongoDB Manager:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      await this.clusterManager.closeAllConnections();
      this.logger.info('MongoDB Manager shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  getConfigManager() {
    return this.config;
  }

  getClusterManager() {
    return this.clusterManager;
  }

  getDatabaseOperations() {
    return this.databaseOps;
  }

  getBackupManager() {
    return this.backupManager;
  }

  getMonitoring() {
    return this.monitoring;
  }
}

module.exports = MongoDBManager;