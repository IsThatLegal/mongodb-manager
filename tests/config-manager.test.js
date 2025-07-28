const ConfigManager = require('../lib/config-manager');
const fs = require('fs').promises;
const path = require('path');

describe('ConfigManager', () => {
  let configManager;
  const testConfigPath = './test-config.json';

  beforeEach(() => {
    configManager = new ConfigManager(testConfigPath);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default config path when none provided', () => {
      const manager = new ConfigManager();
      expect(manager.configPath).toContain('clusters.json');
    });

    test('should initialize with custom config path', () => {
      const customPath = './custom-config.json';
      const manager = new ConfigManager(customPath);
      expect(manager.configPath).toBe(customPath);
    });

    test('should generate encryption key', () => {
      expect(configManager.encryptionKey).toBeDefined();
      expect(typeof configManager.encryptionKey).toBe('string');
      expect(configManager.encryptionKey.length).toBeGreaterThan(0);
    });
  });

  describe('Encryption/Decryption', () => {
    test('should encrypt and decrypt strings correctly', () => {
      const originalText = 'mongodb://user:password@localhost:27017';
      const encrypted = configManager.encrypt(originalText);
      const decrypted = configManager.decrypt(encrypted);

      expect(encrypted).not.toBe(originalText);
      expect(decrypted).toBe(originalText);
      expect(encrypted).toContain(':'); // Should contain IV separator
    });

    test('should produce different encrypted outputs for same input', () => {
      const text = 'test-string';
      const encrypted1 = configManager.encrypt(text);
      const encrypted2 = configManager.encrypt(text);

      expect(encrypted1).not.toBe(encrypted2); // Due to random IV
      expect(configManager.decrypt(encrypted1)).toBe(text);
      expect(configManager.decrypt(encrypted2)).toBe(text);
    });
  });

  describe('Configuration Loading', () => {
    test('should load existing configuration file', async () => {
      const mockConfig = {
        clusters: {
          test: { uri: 'mongodb://localhost:27017' }
        },
        settings: { logLevel: 'info' }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.load();

      expect(fs.readFile).toHaveBeenCalledWith(testConfigPath, 'utf8');
      expect(result).toEqual(expect.objectContaining(mockConfig));
    });

    test('should create default config when file does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.readFile.mockRejectedValue(error);
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const result = await configManager.load();

      expect(result.clusters).toBeDefined();
      expect(result.clusters.example).toBeDefined();
      expect(result.settings).toBeDefined();
    });

    test('should throw error for other file read errors', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fs.readFile.mockRejectedValue(error);

      await expect(configManager.load()).rejects.toThrow('Failed to load config');
    });

    test('should decrypt encrypted connection strings on load', async () => {
      const originalUri = 'mongodb://user:pass@localhost:27017';
      const encryptedUri = configManager.encrypt(originalUri);
      
      const mockConfig = {
        clusters: {
          test: { 
            uri: encryptedUri,
            encrypted: true 
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      await configManager.load();

      expect(configManager.config.clusters.test.uri).toBe(originalUri);
    });
  });

  describe('Configuration Saving', () => {
    test('should save configuration with encrypted URIs', async () => {
      configManager.config = {
        clusters: {
          test: {
            uri: 'mongodb://user:pass@localhost:27017',
            environment: 'test'
          }
        },
        settings: { logLevel: 'info' }
      };

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await configManager.save();

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      
      const savedData = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(savedData.clusters.test.uri).not.toBe('mongodb://user:pass@localhost:27017');
      expect(savedData.clusters.test.encrypted).toBe(true);
    });

    test('should handle save errors', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(configManager.save()).rejects.toThrow('Failed to save config');
    });
  });

  describe('Cluster Management', () => {
    beforeEach(() => {
      configManager.config = {
        clusters: {},
        settings: {}
      };
    });

    test('should add cluster configuration', () => {
      const clusterConfig = {
        uri: 'mongodb://localhost:27017',
        environment: 'test',
        databases: ['testdb']
      };

      configManager.addCluster('test-cluster', clusterConfig);

      expect(configManager.config.clusters['test-cluster']).toEqual(
        expect.objectContaining(clusterConfig)
      );
      expect(configManager.config.clusters['test-cluster'].addedAt).toBeDefined();
    });

    test('should remove cluster configuration', () => {
      configManager.config.clusters['test-cluster'] = {
        uri: 'mongodb://localhost:27017'
      };

      configManager.removeCluster('test-cluster');

      expect(configManager.config.clusters['test-cluster']).toBeUndefined();
    });

    test('should get cluster configuration', () => {
      const clusterConfig = { uri: 'mongodb://localhost:27017' };
      configManager.config.clusters['test-cluster'] = clusterConfig;

      const result = configManager.getCluster('test-cluster');

      expect(result).toBe(clusterConfig);
    });

    test('should return undefined for non-existent cluster', () => {
      const result = configManager.getCluster('non-existent');

      expect(result).toBeUndefined();
    });

    test('should get all clusters', () => {
      const clusters = {
        cluster1: { uri: 'mongodb://localhost:27017' },
        cluster2: { uri: 'mongodb://localhost:27018' }
      };
      configManager.config.clusters = clusters;

      const result = configManager.getClusters();

      expect(result).toBe(clusters);
    });

    test('should update existing cluster', () => {
      configManager.config.clusters['test-cluster'] = {
        uri: 'mongodb://localhost:27017',
        environment: 'test'
      };

      const updates = { environment: 'production' };
      const result = configManager.updateCluster('test-cluster', updates);

      expect(result).toBe(true);
      expect(configManager.config.clusters['test-cluster'].environment).toBe('production');
      expect(configManager.config.clusters['test-cluster'].updatedAt).toBeDefined();
    });

    test('should return false when updating non-existent cluster', () => {
      const result = configManager.updateCluster('non-existent', {});

      expect(result).toBe(false);
    });
  });

  describe('Settings Management', () => {
    beforeEach(() => {
      configManager.config = {
        clusters: {},
        settings: { logLevel: 'info', timeout: 5000 }
      };
    });

    test('should get setting value', () => {
      const result = configManager.getSetting('logLevel');

      expect(result).toBe('info');
    });

    test('should return undefined for non-existent setting', () => {
      const result = configManager.getSetting('nonExistent');

      expect(result).toBeUndefined();
    });

    test('should set setting value', () => {
      configManager.setSetting('newSetting', 'newValue');

      expect(configManager.config.settings.newSetting).toBe('newValue');
    });

    test('should get all settings', () => {
      const result = configManager.getSettings();

      expect(result).toEqual({ logLevel: 'info', timeout: 5000 });
    });

    test('should update multiple settings', () => {
      const updates = { logLevel: 'debug', timeout: 10000, newSetting: 'value' };
      
      configManager.updateSettings(updates);

      expect(configManager.config.settings).toEqual(
        expect.objectContaining(updates)
      );
    });
  });

  describe('Validation', () => {
    test('should validate valid cluster configuration', () => {
      const validConfig = {
        uri: 'mongodb://localhost:27017',
        environment: 'test'
      };

      expect(() => configManager.validateClusterConfig(validConfig)).not.toThrow();
    });

    test('should throw error for missing required fields', () => {
      const invalidConfig = {
        environment: 'test'
        // Missing uri
      };

      expect(() => configManager.validateClusterConfig(invalidConfig))
        .toThrow('Missing required fields: uri');
    });

    test('should throw error for invalid URI format', () => {
      const invalidConfig = {
        uri: 'invalid-uri-format'
      };

      expect(() => configManager.validateClusterConfig(invalidConfig))
        .toThrow('Invalid URI format');
    });

    test('should validate complex URI formats', () => {
      const validConfigs = [
        { uri: 'mongodb://localhost:27017' },
        { uri: 'mongodb+srv://user:pass@cluster.mongodb.net/' },
        { uri: 'mongodb://user:pass@host1:27017,host2:27017/db' }
      ];

      validConfigs.forEach(config => {
        expect(() => configManager.validateClusterConfig(config)).not.toThrow();
      });
    });
  });

  describe('Backup and Restore', () => {
    test('should create backup of configuration', async () => {
      fs.copyFile.mockResolvedValue();

      const backupPath = await configManager.backup();

      expect(fs.copyFile).toHaveBeenCalled();
      expect(backupPath).toContain('clusters-backup-');
      expect(backupPath).toContain('.json');
    });

    test('should restore configuration from backup', async () => {
      const backupPath = './backup-config.json';
      fs.copyFile.mockResolvedValue();
      
      // Mock the load method for this test
      jest.spyOn(configManager, 'load').mockResolvedValue();

      const result = await configManager.restore(backupPath);

      expect(fs.copyFile).toHaveBeenCalledWith(backupPath, testConfigPath);
      expect(configManager.load).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should handle restore errors', async () => {
      const backupPath = './backup-config.json';
      fs.copyFile.mockRejectedValue(new Error('File not found'));

      await expect(configManager.restore(backupPath))
        .rejects.toThrow('Failed to restore config');
    });
  });

  describe('Environment Management', () => {
    beforeEach(() => {
      configManager.config = {
        clusters: {
          prod1: { environment: 'production' },
          prod2: { environment: 'production' },
          staging1: { environment: 'staging' },
          dev1: { environment: 'development' }
        }
      };
    });

    test('should list unique environments', () => {
      const environments = configManager.listEnvironments();

      expect(environments).toContain('production');
      expect(environments).toContain('staging');
      expect(environments).toContain('development');
      expect(environments).toHaveLength(3);
    });

    test('should get clusters by environment', () => {
      const productionClusters = configManager.getClustersByEnvironment('production');

      expect(Object.keys(productionClusters)).toHaveLength(2);
      expect(productionClusters.prod1).toBeDefined();
      expect(productionClusters.prod2).toBeDefined();
    });

    test('should return empty object for non-existent environment', () => {
      const result = configManager.getClustersByEnvironment('non-existent');

      expect(result).toEqual({});
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty configuration file', async () => {
      fs.readFile.mockResolvedValue('');

      await expect(configManager.load()).rejects.toThrow();
    });

    test('should handle malformed JSON in configuration file', async () => {
      fs.readFile.mockResolvedValue('{ invalid json }');

      await expect(configManager.load()).rejects.toThrow();
    });

    test('should handle encryption with empty string', () => {
      const encrypted = configManager.encrypt('');
      const decrypted = configManager.decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    test('should handle special characters in encryption', () => {
      const specialText = 'mongodb://user:p@$$w0rd!@localhost:27017/db?authSource=admin';
      const encrypted = configManager.encrypt(specialText);
      const decrypted = configManager.decrypt(encrypted);

      expect(decrypted).toBe(specialText);
    });

    test('should handle missing directory creation', async () => {
      configManager.config = { clusters: {}, settings: {} };
      
      const error = new Error('Directory does not exist');
      fs.mkdir.mockRejectedValue(error);
      fs.writeFile.mockResolvedValue();

      // Should not throw error, mkdir should handle recursive creation
      await expect(configManager.save()).resolves.not.toThrow();
    });
  });
});