const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'clusters.json');
    this.config = {
      clusters: {},
      settings: {
        defaultTimeout: 30000,
        maxRetries: 3,
        backupRetention: 30,
        logLevel: 'info'
      }
    };
    this.encryptionKey = process.env.MM_ENCRYPTION_KEY || this.generateEncryptionKey();
  }

  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async load() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const parsedConfig = JSON.parse(configData);
      this.config = { ...this.config, ...parsedConfig };
      
      // Decrypt connection strings
      for (const [name, cluster] of Object.entries(this.config.clusters)) {
        if (cluster.uri && cluster.encrypted) {
          try {
            cluster.uri = this.decrypt(cluster.uri);
          } catch (decryptError) {
            console.warn(`Warning: Could not decrypt URI for cluster ${name}, removing cluster`);
            delete this.config.clusters[name];
          }
        }
      }
      
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.createDefaultConfig();
        return this.config;
      }
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  async save() {
    try {
      // Create a copy for saving with encrypted URIs
      const configToSave = JSON.parse(JSON.stringify(this.config));
      
      for (const [name, cluster] of Object.entries(configToSave.clusters)) {
        if (cluster.uri && !cluster.encrypted) {
          cluster.uri = this.encrypt(cluster.uri);
          cluster.encrypted = true;
        }
      }

      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(configToSave, null, 2));
      return true;
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  async createDefaultConfig() {
    const defaultConfig = {
      clusters: {
        example: {
          uri: 'mongodb://localhost:27017',
          environment: 'development',
          databases: ['test'],
          description: 'Example local MongoDB instance',
          options: {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000
          }
        }
      },
      settings: {
        defaultTimeout: 30000,
        maxRetries: 3,
        backupRetention: 30,
        logLevel: 'info',
        webPort: 3000,
        apiPort: 3001
      }
    };

    this.config = defaultConfig;
    await this.save();
    return this.config;
  }

  addCluster(name, clusterConfig) {
    this.config.clusters[name] = {
      ...clusterConfig,
      addedAt: new Date().toISOString()
    };
  }

  removeCluster(name) {
    delete this.config.clusters[name];
  }

  getCluster(name) {
    return this.config.clusters[name];
  }

  getClusters() {
    return this.config.clusters;
  }

  updateCluster(name, updates) {
    if (this.config.clusters[name]) {
      this.config.clusters[name] = {
        ...this.config.clusters[name],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      return true;
    }
    return false;
  }

  getSetting(key) {
    return this.config.settings[key];
  }

  setSetting(key, value) {
    this.config.settings[key] = value;
  }

  getSettings() {
    return this.config.settings;
  }

  updateSettings(settings) {
    this.config.settings = { ...this.config.settings, ...settings };
  }

  validateClusterConfig(config) {
    const required = ['uri'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate URI format
    try {
      new URL(config.uri);
    } catch (error) {
      throw new Error('Invalid URI format');
    }

    return true;
  }

  async backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(path.dirname(this.configPath), `clusters-backup-${timestamp}.json`);
    
    await fs.copyFile(this.configPath, backupPath);
    return backupPath;
  }

  async restore(backupPath) {
    try {
      await fs.copyFile(backupPath, this.configPath);
      await this.load();
      return true;
    } catch (error) {
      throw new Error(`Failed to restore config: ${error.message}`);
    }
  }

  listEnvironments() {
    const environments = new Set();
    for (const cluster of Object.values(this.config.clusters)) {
      if (cluster.environment) {
        environments.add(cluster.environment);
      }
    }
    return Array.from(environments);
  }

  getClustersByEnvironment(environment) {
    return Object.entries(this.config.clusters)
      .filter(([name, config]) => config.environment === environment)
      .reduce((acc, [name, config]) => {
        acc[name] = config;
        return acc;
      }, {});
  }
}

module.exports = ConfigManager;