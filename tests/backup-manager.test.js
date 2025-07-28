const BackupManager = require('../lib/backup-manager');
const fs = require('fs').promises;
const cron = require('node-cron');

describe('BackupManager', () => {
  let backupManager;
  let mockClusterManager;
  let mockConfig;
  let mockLogger;
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    mockCollection = {
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      listIndexes: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      stats: jest.fn().mockResolvedValue({})
    };

    mockDb = {
      listCollections: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    mockClusterManager = {
      getDatabase: jest.fn().mockReturnValue(mockDb)
    };

    mockConfig = {
      getSetting: jest.fn(),
      setSetting: jest.fn(),
      save: jest.fn().mockResolvedValue()
    };

    mockLogger = createMockLogger();

    backupManager = new BackupManager(mockClusterManager, mockConfig, mockLogger);

    // Mock fs operations
    fs.mkdir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.readFile.mockResolvedValue('{}');
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ isDirectory: () => false, size: 1024, mtime: new Date() });
    fs.rmdir.mockResolvedValue();
    fs.unlink.mockResolvedValue();
  });

  describe('Constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(backupManager.clusterManager).toBe(mockClusterManager);
      expect(backupManager.config).toBe(mockConfig);
      expect(backupManager.logger).toBe(mockLogger);
      expect(backupManager.scheduledJobs).toBeInstanceOf(Map);
      expect(backupManager.backupDir).toContain('backups');
    });
  });

  describe('Initialization', () => {
    test('should create backup directory and load scheduled backups', async () => {
      jest.spyOn(backupManager, 'loadScheduledBackups').mockResolvedValue();

      await backupManager.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('backups'),
        { recursive: true }
      );
      expect(backupManager.loadScheduledBackups).toHaveBeenCalled();
    });

    test('should handle initialization errors', async () => {
      const error = new Error('Permission denied');
      fs.mkdir.mockRejectedValue(error);

      await expect(backupManager.initialize()).rejects.toThrow('Permission denied');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize backup manager:',
        error
      );
    });
  });

  describe('Create Backup', () => {
    beforeEach(() => {
      mockDb.listCollections.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { name: 'users' },
          { name: 'orders' }
        ])
      });

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { _id: '1', name: 'John', email: 'john@example.com' },
          { _id: '2', name: 'Jane', email: 'jane@example.com' }
        ])
      });

      mockCollection.listIndexes.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { name: '_id_', key: { _id: 1 } },
          { name: 'email_1', key: { email: 1 }, unique: true }
        ])
      });

      mockCollection.stats.mockResolvedValue({
        count: 2,
        size: 1024
      });
    });

    test('should create backup successfully', async () => {
      const result = await backupManager.createBackup('test-cluster', 'testdb');

      expect(fs.mkdir).toHaveBeenCalled(); // Backup directory creation
      expect(fs.writeFile).toHaveBeenCalledTimes(3); // 2 collections + metadata
      expect(result).toEqual({
        name: expect.stringMatching(/test-cluster-testdb-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/),
        path: expect.stringContaining('backups'),
        info: expect.objectContaining({
          cluster: 'test-cluster',
          database: 'testdb',
          collections: expect.arrayContaining([
            expect.objectContaining({ name: 'users' }),
            expect.objectContaining({ name: 'orders' })
          ])
        }),
        size: expect.any(Number),
        collections: 2
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Backup completed')
      );
    });

    test('should create compressed backup', async () => {
      jest.spyOn(backupManager, 'compressBackup').mockResolvedValue();

      const result = await backupManager.createBackup('test-cluster', 'testdb', {
        compress: true
      });

      expect(backupManager.compressBackup).toHaveBeenCalled();
      expect(result.info.compressed).toBe(true);
      expect(fs.rmdir).toHaveBeenCalled(); // Remove uncompressed directory
    });

    test('should handle collection backup errors gracefully', async () => {
      mockCollection.find
        .mockReturnValueOnce({
          toArray: jest.fn().mockResolvedValue([{ _id: '1', name: 'John' }])
        })
        .mockReturnValueOnce({
          toArray: jest.fn().mockRejectedValue(new Error('Access denied'))
        });

      const result = await backupManager.createBackup('test-cluster', 'testdb');

      expect(result.info.collections).toHaveLength(2);
      expect(result.info.collections[1]).toEqual({
        name: 'orders',
        error: 'Access denied'
      });
    });

    test('should handle backup creation errors', async () => {
      const error = new Error('Disk full');
      fs.mkdir.mockRejectedValue(error);

      await expect(backupManager.createBackup('test-cluster', 'testdb'))
        .rejects.toThrow('Disk full');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Backup failed'),
        error
      );
    });
  });

  describe('Compression', () => {
    test('should compress backup directory', async () => {
      const mockArchiver = {
        pipe: jest.fn(),
        directory: jest.fn(),
        finalize: jest.fn(),
        pointer: jest.fn().mockReturnValue(1024),
        on: jest.fn((event, callback) => {
          if (event === 'error') return;
        })
      };

      const mockWriteStream = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(callback, 0); // Simulate async completion
          }
        })
      };

      // Mock the archiver and createWriteStream
      jest.doMock('archiver', () => jest.fn(() => mockArchiver));
      jest.doMock('fs', () => ({
        createWriteStream: jest.fn(() => mockWriteStream)
      }));

      await expect(
        backupManager.compressBackup('/source/path', '/target/path.zip')
      ).resolves.not.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Backup compressed')
      );
    });

    test('should handle compression errors', async () => {
      const error = new Error('Compression failed');
      
      jest.doMock('archiver', () => jest.fn(() => ({
        pipe: jest.fn(),
        directory: jest.fn(),
        finalize: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(error), 0);
          }
        })
      })));

      await expect(
        backupManager.compressBackup('/source/path', '/target/path.zip')
      ).rejects.toThrow('Compression failed');
    });
  });

  describe('Backup Restoration', () => {
    beforeEach(() => {
      const mockBackupInfo = {
        cluster: 'source-cluster',
        database: 'sourcedb',
        collections: [
          { name: 'users', error: undefined },
          { name: 'orders', error: undefined }
        ]
      };

      fs.readFile.mockImplementation((filePath) => {
        if (filePath.endsWith('backup-info.json')) {
          return Promise.resolve(JSON.stringify(mockBackupInfo));
        }
        return Promise.resolve(JSON.stringify({
          collection: 'users',
          documents: [{ _id: '1', name: 'John' }],
          indexes: [{ name: '_id_', key: { _id: 1 } }]
        }));
      });

      mockCollection.drop.mockResolvedValue();
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });
      mockCollection.createIndex.mockResolvedValue();
    });

    test('should restore backup successfully', async () => {
      const result = await backupManager.restoreBackup(
        '/path/to/backup',
        'target-cluster',
        'targetdb'
      );

      expect(result.restoredCollections).toHaveLength(2);
      expect(result.target).toEqual({
        cluster: 'target-cluster',
        database: 'targetdb'
      });

      expect(mockCollection.insertMany).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Restore completed')
      );
    });

    test('should drop existing collections when dropExisting option is true', async () => {
      await backupManager.restoreBackup(
        '/path/to/backup',
        'target-cluster',
        'targetdb',
        { dropExisting: true }
      );

      expect(mockCollection.drop).toHaveBeenCalledTimes(2);
    });

    test('should handle compressed backup restoration', async () => {
      const mockExtract = jest.fn().mockResolvedValue();
      jest.doMock('extract-zip', () => mockExtract);

      await backupManager.restoreBackup(
        '/path/to/backup.zip',
        'target-cluster',
        'targetdb'
      );

      expect(mockExtract).toHaveBeenCalled();
      expect(fs.rmdir).toHaveBeenCalled(); // Cleanup temp directory
    });

    test('should handle restoration errors gracefully', async () => {
      mockCollection.insertMany.mockRejectedValue(new Error('Insert failed'));

      const result = await backupManager.restoreBackup(
        '/path/to/backup',
        'target-cluster',
        'targetdb'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore collection'),
        expect.any(Error)
      );
      // Should still complete without throwing
      expect(result).toBeDefined();
    });

    test('should skip collections with errors in backup', async () => {
      const mockBackupInfo = {
        collections: [
          { name: 'users', error: undefined },
          { name: 'corrupted', error: 'Backup error' }
        ]
      };

      fs.readFile.mockImplementation((filePath) => {
        if (filePath.endsWith('backup-info.json')) {
          return Promise.resolve(JSON.stringify(mockBackupInfo));
        }
        return Promise.resolve('{}');
      });

      const result = await backupManager.restoreBackup(
        '/path/to/backup',
        'target-cluster',
        'targetdb'
      );

      expect(result.restoredCollections).toHaveLength(1);
      expect(result.restoredCollections[0].name).toBe('users');
    });
  });

  describe('List Backups', () => {
    test('should list uncompressed backups', async () => {
      fs.readdir.mockResolvedValue(['backup1', 'backup2', 'backup1.zip']);
      fs.stat
        .mockResolvedValueOnce({ 
          isDirectory: () => true, 
          size: 2048,
          mtime: new Date('2024-01-01')
        })
        .mockResolvedValueOnce({ 
          isDirectory: () => true, 
          size: 1024,
          mtime: new Date('2024-01-02')
        })
        .mockResolvedValueOnce({ 
          isDirectory: () => false, 
          size: 512,
          mtime: new Date('2024-01-03')
        });

      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('backup1')) {
          return Promise.resolve(JSON.stringify({
            cluster: 'cluster1',
            database: 'db1',
            timestamp: '2024-01-01T10:00:00.000Z',
            collections: [{ name: 'users' }],
            totalDocuments: 100
          }));
        }
        return Promise.resolve(JSON.stringify({
          cluster: 'cluster2',
          database: 'db2',
          timestamp: '2024-01-02T10:00:00.000Z',
          collections: [{ name: 'orders' }],
          totalDocuments: 50
        }));
      });

      const backups = await backupManager.listBackups();

      expect(backups).toHaveLength(3);
      expect(backups[0]).toEqual({
        name: 'backup1.zip',
        path: expect.stringContaining('backup1.zip'),
        created: expect.any(Date),
        size: 512,
        compressed: true
      });
      expect(backups[1]).toEqual({
        name: 'backup2',
        path: expect.stringContaining('backup2'),
        created: '2024-01-02T10:00:00.000Z',
        cluster: 'cluster2',
        database: 'db2',
        collections: 1,
        totalDocuments: 50,
        size: expect.any(Number),
        compressed: false
      });
    });

    test('should handle empty backup directory', async () => {
      fs.readdir.mockResolvedValue([]);

      const backups = await backupManager.listBackups();

      expect(backups).toEqual([]);
    });

    test('should skip invalid backup directories', async () => {
      fs.readdir.mockResolvedValue(['valid-backup', 'invalid-backup']);
      fs.stat.mockResolvedValue({ isDirectory: () => true, size: 1024 });
      fs.readFile
        .mockResolvedValueOnce('{"valid": "backup"}')
        .mockRejectedValueOnce(new Error('Invalid JSON'));

      const backups = await backupManager.listBackups();

      expect(backups).toHaveLength(1);
    });

    test('should sort backups by creation date (newest first)', async () => {
      fs.readdir.mockResolvedValue(['old-backup', 'new-backup']);
      fs.stat.mockResolvedValue({ isDirectory: () => true, size: 1024 });
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({
          timestamp: '2024-01-01T10:00:00.000Z',
          collections: []
        }))
        .mockResolvedValueOnce(JSON.stringify({
          timestamp: '2024-01-02T10:00:00.000Z',
          collections: []
        }));

      const backups = await backupManager.listBackups();

      expect(backups[0].name).toBe('new-backup');
      expect(backups[1].name).toBe('old-backup');
    });
  });

  describe('Scheduled Backups', () => {
    test('should schedule backup successfully', async () => {
      const mockJob = {
        start: jest.fn(),
        stop: jest.fn(),
        nextDate: jest.fn().mockReturnValue(new Date())
      };
      cron.schedule.mockReturnValue(mockJob);

      const jobId = await backupManager.scheduleBackup(
        'test-cluster',
        'testdb',
        '0 2 * * *',
        { compress: true }
      );

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 2 * * *',
        expect.any(Function),
        { scheduled: false }
      );
      expect(mockJob.start).toHaveBeenCalled();
      expect(backupManager.scheduledJobs.has(jobId)).toBe(true);
      expect(mockConfig.setSetting).toHaveBeenCalled();
      expect(mockConfig.save).toHaveBeenCalled();
    });

    test('should stop existing job when rescheduling', async () => {
      const existingJob = {
        job: { stop: jest.fn() },
        cluster: 'test-cluster',
        database: 'testdb'
      };
      backupManager.scheduledJobs.set('test-cluster-testdb', existingJob);

      const mockJob = {
        start: jest.fn(),
        stop: jest.fn(),
        nextDate: jest.fn().mockReturnValue(new Date())
      };
      cron.schedule.mockReturnValue(mockJob);

      await backupManager.scheduleBackup('test-cluster', 'testdb', '0 3 * * *');

      expect(existingJob.job.stop).toHaveBeenCalled();
    });

    test('should unschedule backup successfully', async () => {
      const mockJob = {
        job: { stop: jest.fn() },
        cluster: 'test-cluster',
        database: 'testdb'
      };
      backupManager.scheduledJobs.set('test-job', mockJob);
      jest.spyOn(backupManager, 'removeScheduleFromConfig').mockResolvedValue();

      const result = await backupManager.unscheduleBackup('test-job');

      expect(result).toBe(true);
      expect(mockJob.job.stop).toHaveBeenCalled();
      expect(backupManager.scheduledJobs.has('test-job')).toBe(false);
      expect(backupManager.removeScheduleFromConfig).toHaveBeenCalledWith('test-job');
    });

    test('should return false when unscheduling non-existent job', async () => {
      const result = await backupManager.unscheduleBackup('non-existent');

      expect(result).toBe(false);
    });

    test('should load scheduled backups from config', async () => {
      const schedules = {
        'job1': {
          cluster: 'cluster1',
          database: 'db1',
          pattern: '0 2 * * *',
          options: { compress: true }
        }
      };
      mockConfig.getSetting.mockReturnValue(schedules);
      jest.spyOn(backupManager, 'scheduleBackup').mockResolvedValue('job1');

      await backupManager.loadScheduledBackups();

      expect(backupManager.scheduleBackup).toHaveBeenCalledWith(
        'cluster1',
        'db1',
        '0 2 * * *',
        { compress: true }
      );
    });

    test('should handle errors when loading scheduled backups', async () => {
      const schedules = {
        'invalid-job': {
          cluster: 'cluster1',
          database: 'db1',
          pattern: 'invalid-cron'
        }
      };
      mockConfig.getSetting.mockReturnValue(schedules);
      jest.spyOn(backupManager, 'scheduleBackup').mockRejectedValue(new Error('Invalid cron'));

      await backupManager.loadScheduledBackups();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load scheduled backup'),
        expect.any(Error)
      );
    });

    test('should list scheduled backups', () => {
      const job1 = {
        cluster: 'cluster1',
        database: 'db1',
        pattern: '0 2 * * *',
        options: { compress: true },
        createdAt: new Date(),
        job: { nextDate: jest.fn().mockReturnValue(new Date()) }
      };

      backupManager.scheduledJobs.set('job1', job1);

      const schedules = backupManager.listScheduledBackups();

      expect(schedules).toHaveLength(1);
      expect(schedules[0]).toEqual({
        id: 'job1',
        cluster: 'cluster1',
        database: 'db1',
        pattern: '0 2 * * *',
        options: { compress: true },
        createdAt: expect.any(Date),
        nextRun: expect.any(Date)
      });
    });
  });

  describe('Backup Cleanup', () => {
    test('should cleanup old backups', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days old

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days old

      jest.spyOn(backupManager, 'listBackups').mockResolvedValue([
        {
          name: 'old-backup',
          created: oldDate,
          compressed: false,
          path: '/path/to/old-backup'
        },
        {
          name: 'recent-backup',
          created: recentDate,
          compressed: true,
          path: '/path/to/recent-backup.zip'
        }
      ]);

      const cleanedCount = await backupManager.cleanupOldBackups(30);

      expect(cleanedCount).toBe(1);
      expect(fs.rmdir).toHaveBeenCalledWith('/path/to/old-backup', { recursive: true });
      expect(fs.unlink).not.toHaveBeenCalled(); // Recent backup should not be deleted
    });

    test('should cleanup compressed backups', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      jest.spyOn(backupManager, 'listBackups').mockResolvedValue([
        {
          name: 'old-compressed-backup',
          created: oldDate,
          compressed: true,
          path: '/path/to/old-backup.zip'
        }
      ]);

      await backupManager.cleanupOldBackups(30);

      expect(fs.unlink).toHaveBeenCalledWith('/path/to/old-backup.zip');
    });

    test('should use default retention from config', async () => {
      mockConfig.getSetting.mockReturnValue(15); // 15 days retention
      jest.spyOn(backupManager, 'listBackups').mockResolvedValue([]);

      await backupManager.cleanupOldBackups();

      expect(mockConfig.getSetting).toHaveBeenCalledWith('backupRetention');
    });

    test('should handle cleanup errors gracefully', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      jest.spyOn(backupManager, 'listBackups').mockResolvedValue([
        {
          name: 'problematic-backup',
          created: oldDate,
          compressed: false,
          path: '/path/to/problematic-backup'
        }
      ]);

      fs.rmdir.mockRejectedValue(new Error('Permission denied'));

      const cleanedCount = await backupManager.cleanupOldBackups(30);

      expect(cleanedCount).toBe(0); // No backups cleaned due to error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup backup'),
        expect.any(Error)
      );
    });
  });

  describe('Configuration Management', () => {
    test('should save schedule to config', async () => {
      const schedule = {
        cluster: 'test-cluster',
        database: 'testdb',
        pattern: '0 2 * * *',
        options: { compress: true }
      };

      mockConfig.getSetting.mockReturnValue({});

      await backupManager.saveScheduleToConfig('job1', schedule);

      expect(mockConfig.setSetting).toHaveBeenCalledWith('backupSchedules', {
        job1: schedule
      });
      expect(mockConfig.save).toHaveBeenCalled();
    });

    test('should remove schedule from config', async () => {
      const existingSchedules = {
        'job1': { cluster: 'cluster1' },
        'job2': { cluster: 'cluster2' }
      };
      mockConfig.getSetting.mockReturnValue(existingSchedules);

      await backupManager.removeScheduleFromConfig('job1');

      expect(mockConfig.setSetting).toHaveBeenCalledWith('backupSchedules', {
        job2: { cluster: 'cluster2' }
      });
      expect(mockConfig.save).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      mockClusterManager.getDatabase.mockImplementation(() => {
        throw new Error('Cluster not found');
      });

      await expect(backupManager.createBackup('invalid-cluster', 'testdb'))
        .rejects.toThrow('Cluster not found');
    });

    test('should handle file system errors during backup', async () => {
      const error = new Error('Disk full');
      fs.writeFile.mockRejectedValue(error);

      await expect(backupManager.createBackup('test-cluster', 'testdb'))
        .rejects.toThrow('Disk full');
    });

    test('should handle invalid backup paths during restoration', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(backupManager.restoreBackup('/invalid/path', 'cluster', 'db'))
        .rejects.toThrow('File not found');
    });

    test('should handle cron scheduling errors', async () => {
      cron.schedule.mockImplementation(() => {
        throw new Error('Invalid cron pattern');
      });

      await expect(backupManager.scheduleBackup('cluster', 'db', 'invalid-pattern'))
        .rejects.toThrow('Invalid cron pattern');
    });
  });
});