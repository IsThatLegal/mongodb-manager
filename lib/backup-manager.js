const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');

class BackupManager {
  constructor(clusterManager, config, logger) {
    this.clusterManager = clusterManager;
    this.config = config;
    this.logger = logger;
    this.scheduledJobs = new Map();
    this.backupDir = path.join(process.cwd(), 'backups');
  }

  async initialize() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      await this.loadScheduledBackups();
    } catch (error) {
      this.logger.error('Failed to initialize backup manager:', error);
      throw error;
    }
  }

  async createBackup(clusterName, dbName, options = {}) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${clusterName}-${dbName}-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);
      
      await fs.mkdir(backupPath, { recursive: true });

      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collections = await db.listCollections().toArray();
      
      const backupInfo = {
        cluster: clusterName,
        database: dbName,
        timestamp: new Date(),
        collections: [],
        totalDocuments: 0,
        totalSize: 0
      };

      this.logger.info(`Starting backup for ${clusterName}/${dbName}`);

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        
        try {
          const collection = db.collection(collectionName);
          const documents = await collection.find({}).toArray();
          
          const collectionFile = path.join(backupPath, `${collectionName}.json`);
          const collectionData = {
            collection: collectionName,
            database: dbName,
            cluster: clusterName,
            documents: documents,
            indexes: await collection.listIndexes().toArray(),
            stats: await collection.stats().catch(() => ({}))
          };

          await fs.writeFile(collectionFile, JSON.stringify(collectionData, null, 2));

          backupInfo.collections.push({
            name: collectionName,
            documentCount: documents.length,
            size: JSON.stringify(collectionData).length,
            indexes: collectionData.indexes.length
          });

          backupInfo.totalDocuments += documents.length;
          backupInfo.totalSize += JSON.stringify(collectionData).length;

          this.logger.info(`Backed up collection: ${collectionName} (${documents.length} documents)`);
        } catch (error) {
          this.logger.error(`Failed to backup collection ${collectionName}:`, error);
          backupInfo.collections.push({
            name: collectionName,
            error: error.message
          });
        }
      }

      // Save backup metadata
      const metadataFile = path.join(backupPath, 'backup-info.json');
      await fs.writeFile(metadataFile, JSON.stringify(backupInfo, null, 2));

      // Compress if requested
      if (options.compress) {
        const archivePath = `${backupPath}.zip`;
        await this.compressBackup(backupPath, archivePath);
        
        // Remove uncompressed directory
        await fs.rmdir(backupPath, { recursive: true });
        
        backupInfo.compressed = true;
        backupInfo.archivePath = archivePath;
      }

      this.logger.info(`Backup completed: ${backupName}`);
      
      return {
        name: backupName,
        path: options.compress ? `${backupPath}.zip` : backupPath,
        info: backupInfo,
        size: backupInfo.totalSize,
        collections: backupInfo.collections.length
      };
    } catch (error) {
      this.logger.error(`Backup failed for ${clusterName}/${dbName}:`, error);
      throw error;
    }
  }

  async compressBackup(sourcePath, targetPath) {
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(targetPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        this.logger.info(`Backup compressed: ${archive.pointer()} bytes`);
        resolve();
      });

      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  async restoreBackup(backupPath, targetCluster, targetDatabase, options = {}) {
    try {
      let backupDir = backupPath;
      
      // Extract if compressed
      if (backupPath.endsWith('.zip')) {
        const extract = require('extract-zip');
        const tempDir = path.join(this.backupDir, 'temp-restore');
        await extract(backupPath, { dir: tempDir });
        backupDir = tempDir;
      }

      // Read backup info
      const metadataFile = path.join(backupDir, 'backup-info.json');
      const backupInfo = JSON.parse(await fs.readFile(metadataFile, 'utf8'));

      const db = this.clusterManager.getDatabase(targetCluster, targetDatabase);
      const restoredCollections = [];

      this.logger.info(`Starting restore to ${targetCluster}/${targetDatabase}`);

      for (const collectionInfo of backupInfo.collections) {
        if (collectionInfo.error) continue;

        const collectionFile = path.join(backupDir, `${collectionInfo.name}.json`);
        
        try {
          const collectionData = JSON.parse(await fs.readFile(collectionFile, 'utf8'));
          const collection = db.collection(collectionInfo.name);

          // Drop existing collection if specified
          if (options.dropExisting) {
            try {
              await collection.drop();
            } catch (error) {
              // Collection might not exist
            }
          }

          // Restore documents
          if (collectionData.documents.length > 0) {
            await collection.insertMany(collectionData.documents, { ordered: false });
          }

          // Restore indexes (except _id_ which is automatic)
          for (const index of collectionData.indexes) {
            if (index.name !== '_id_') {
              try {
                await collection.createIndex(index.key, {
                  name: index.name,
                  unique: index.unique,
                  sparse: index.sparse,
                  background: true
                });
              } catch (error) {
                this.logger.warn(`Failed to restore index ${index.name}:`, error.message);
              }
            }
          }

          restoredCollections.push({
            name: collectionInfo.name,
            documents: collectionData.documents.length,
            indexes: collectionData.indexes.length - 1 // Exclude _id_
          });

          this.logger.info(`Restored collection: ${collectionInfo.name}`);
        } catch (error) {
          this.logger.error(`Failed to restore collection ${collectionInfo.name}:`, error);
        }
      }

      // Cleanup temp directory if used
      if (backupPath.endsWith('.zip')) {
        await fs.rmdir(backupDir, { recursive: true });
      }

      this.logger.info('Restore completed');
      
      return {
        restoredCollections,
        sourceBackup: backupInfo,
        target: { cluster: targetCluster, database: targetDatabase }
      };
    } catch (error) {
      this.logger.error('Restore failed:', error);
      throw error;
    }
  }

  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          try {
            const metadataFile = path.join(filePath, 'backup-info.json');
            const backupInfo = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
            
            backups.push({
              name: file,
              path: filePath,
              created: backupInfo.timestamp,
              cluster: backupInfo.cluster,
              database: backupInfo.database,
              collections: backupInfo.collections.length,
              totalDocuments: backupInfo.totalDocuments,
              size: stats.size,
              compressed: false
            });
          } catch (error) {
            // Skip invalid backup directories
          }
        } else if (file.endsWith('.zip')) {
          // Compressed backup
          backups.push({
            name: file.replace('.zip', ''),
            path: filePath,
            created: stats.mtime,
            size: stats.size,
            compressed: true
          });
        }
      }

      return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      this.logger.error('Failed to list backups:', error);
      throw error;
    }
  }

  async scheduleBackup(clusterName, dbName, cronPattern, options = {}) {
    try {
      const jobId = `${clusterName}-${dbName}`;
      
      // Stop existing job if any
      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId).stop();
      }

      const job = cron.schedule(cronPattern, async () => {
        try {
          this.logger.info(`Starting scheduled backup: ${jobId}`);
          await this.createBackup(clusterName, dbName, options);
          this.logger.info(`Scheduled backup completed: ${jobId}`);
        } catch (error) {
          this.logger.error(`Scheduled backup failed: ${jobId}`, error);
        }
      }, {
        scheduled: false
      });

      this.scheduledJobs.set(jobId, {
        job,
        cluster: clusterName,
        database: dbName,
        pattern: cronPattern,
        options,
        createdAt: new Date()
      });

      job.start();

      // Save schedule to config
      await this.saveScheduleToConfig(jobId, {
        cluster: clusterName,
        database: dbName,
        pattern: cronPattern,
        options
      });

      this.logger.info(`Scheduled backup created: ${jobId} (${cronPattern})`);
      
      return jobId;
    } catch (error) {
      this.logger.error('Failed to schedule backup:', error);
      throw error;
    }
  }

  async unscheduleBackup(jobId) {
    if (this.scheduledJobs.has(jobId)) {
      this.scheduledJobs.get(jobId).job.stop();
      this.scheduledJobs.delete(jobId);
      await this.removeScheduleFromConfig(jobId);
      this.logger.info(`Unscheduled backup: ${jobId}`);
      return true;
    }
    return false;
  }

  async loadScheduledBackups() {
    const schedules = this.config.getSetting('backupSchedules') || {};
    
    for (const [jobId, schedule] of Object.entries(schedules)) {
      try {
        await this.scheduleBackup(
          schedule.cluster,
          schedule.database,
          schedule.pattern,
          schedule.options
        );
      } catch (error) {
        this.logger.error(`Failed to load scheduled backup ${jobId}:`, error);
      }
    }
  }

  async saveScheduleToConfig(jobId, schedule) {
    const schedules = this.config.getSetting('backupSchedules') || {};
    schedules[jobId] = schedule;
    this.config.setSetting('backupSchedules', schedules);
    await this.config.save();
  }

  async removeScheduleFromConfig(jobId) {
    const schedules = this.config.getSetting('backupSchedules') || {};
    delete schedules[jobId];
    this.config.setSetting('backupSchedules', schedules);
    await this.config.save();
  }

  listScheduledBackups() {
    return Array.from(this.scheduledJobs.entries()).map(([id, job]) => ({
      id,
      cluster: job.cluster,
      database: job.database,
      pattern: job.pattern,
      options: job.options,
      createdAt: job.createdAt,
      nextRun: job.job.nextDate()
    }));
  }

  async cleanupOldBackups(retentionDays = null) {
    const retention = retentionDays || this.config.getSetting('backupRetention') || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retention);

    try {
      const backups = await this.listBackups();
      const oldBackups = backups.filter(backup => 
        new Date(backup.created) < cutoffDate
      );

      for (const backup of oldBackups) {
        try {
          if (backup.compressed) {
            await fs.unlink(backup.path);
          } else {
            await fs.rmdir(backup.path, { recursive: true });
          }
          this.logger.info(`Cleaned up old backup: ${backup.name}`);
        } catch (error) {
          this.logger.error(`Failed to cleanup backup ${backup.name}:`, error);
        }
      }

      return oldBackups.length;
    } catch (error) {
      this.logger.error('Backup cleanup failed:', error);
      throw error;
    }
  }
}

module.exports = BackupManager;