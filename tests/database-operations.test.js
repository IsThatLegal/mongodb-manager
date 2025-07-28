const DatabaseOperations = require('../lib/database-operations');

describe('DatabaseOperations', () => {
  let databaseOps;
  let mockClusterManager;
  let mockLogger;
  let mockClient;
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    mockCollection = {
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        explain: jest.fn().mockResolvedValue({})
      }),
      findOne: jest.fn().mockResolvedValue(null),
      insertMany: jest.fn().mockResolvedValue({
        insertedCount: 0,
        insertedIds: {},
        acknowledged: true
      }),
      updateMany: jest.fn().mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
        acknowledged: true
      }),
      deleteMany: jest.fn().mockResolvedValue({
        deletedCount: 0,
        acknowledged: true
      }),
      countDocuments: jest.fn().mockResolvedValue(0),
      distinct: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      createIndex: jest.fn().mockResolvedValue('index_name'),
      dropIndex: jest.fn().mockResolvedValue(),
      listIndexes: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      stats: jest.fn().mockResolvedValue({
        count: 0,
        size: 0,
        avgObjSize: 0,
        storageSize: 0,
        nindexes: 0,
        totalIndexSize: 0
      }),
      drop: jest.fn().mockResolvedValue()
    };

    mockDb = {
      command: jest.fn(),
      stats: jest.fn().mockResolvedValue({
        collections: 0,
        objects: 0,
        avgObjSize: 0,
        dataSize: 0,
        storageSize: 0,
        indexes: 0,
        indexSize: 0
      }),
      listCollections: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      collection: jest.fn().mockReturnValue(mockCollection),
      createCollection: jest.fn().mockResolvedValue(),
      dropCollection: jest.fn().mockResolvedValue()
    };

    mockClient = {
      db: jest.fn().mockReturnValue(mockDb)
    };

    mockClusterManager = {
      getConnection: jest.fn().mockReturnValue(mockClient),
      getDatabase: jest.fn().mockReturnValue(mockDb)
    };

    mockLogger = createMockLogger();

    databaseOps = new DatabaseOperations(mockClusterManager, mockLogger);
  });

  describe('Constructor', () => {
    test('should initialize with cluster manager and logger', () => {
      expect(databaseOps.clusterManager).toBe(mockClusterManager);
      expect(databaseOps.logger).toBe(mockLogger);
    });
  });

  describe('List Databases', () => {
    test('should list databases successfully', async () => {
      const mockDatabases = {
        databases: [
          { name: 'db1', sizeOnDisk: 1024, empty: false },
          { name: 'db2', sizeOnDisk: 2048, empty: false },
          { name: 'empty_db', sizeOnDisk: 0, empty: true }
        ]
      };

      mockDb.command.mockResolvedValue(mockDatabases);

      const result = await databaseOps.listDatabases('test-cluster');

      expect(mockClusterManager.getConnection).toHaveBeenCalledWith('test-cluster');
      expect(mockDb.command).toHaveBeenCalledWith({ listDatabases: 1 });
      expect(result).toEqual([
        { name: 'db1', sizeOnDisk: 1024, empty: false },
        { name: 'db2', sizeOnDisk: 2048, empty: false },
        { name: 'empty_db', sizeOnDisk: 0, empty: true }
      ]);
    });

    test('should handle database listing errors', async () => {
      const error = new Error('Access denied');
      mockDb.command.mockRejectedValue(error);

      await expect(databaseOps.listDatabases('test-cluster'))
        .rejects.toThrow('Access denied');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list databases for cluster test-cluster'),
        error
      );
    });
  });

  describe('Database Statistics', () => {
    test('should get database statistics', async () => {
      const mockStats = {
        collections: 5,
        objects: 1000,
        avgObjSize: 512,
        dataSize: 512000,
        storageSize: 1024000,
        indexes: 10,
        indexSize: 102400,
        fileSize: 2048000,
        nsSizeMB: 16
      };

      mockDb.stats.mockResolvedValue(mockStats);

      const result = await databaseOps.getDatabaseStats('test-cluster', 'testdb');

      expect(mockClusterManager.getDatabase).toHaveBeenCalledWith('test-cluster', 'testdb');
      expect(result).toEqual({
        database: 'testdb',
        collections: 5,
        objects: 1000,
        avgObjSize: 512,
        dataSize: 512000,
        storageSize: 1024000,
        indexes: 10,
        indexSize: 102400,
        fileSize: 2048000,
        nsSizeMB: 16
      });
    });

    test('should handle missing optional stats fields', async () => {
      const minimalStats = {
        collections: 1,
        objects: 100,
        avgObjSize: 256,
        dataSize: 25600,
        storageSize: 51200,
        indexes: 1,
        indexSize: 1024
        // fileSize and nsSizeMB missing
      };

      mockDb.stats.mockResolvedValue(minimalStats);

      const result = await databaseOps.getDatabaseStats('test-cluster', 'testdb');

      expect(result.fileSize).toBe(0);
      expect(result.nsSizeMB).toBe(0);
    });

    test('should handle database stats errors', async () => {
      const error = new Error('Database not found');
      mockDb.stats.mockRejectedValue(error);

      await expect(databaseOps.getDatabaseStats('test-cluster', 'nonexistent'))
        .rejects.toThrow('Database not found');
    });
  });

  describe('List Collections', () => {
    test('should list collections with statistics', async () => {
      const mockCollections = [
        { name: 'users', type: 'collection' },
        { name: 'orders', type: 'collection' }
      ];

      mockDb.listCollections.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockCollections)
      });

      mockCollection.stats
        .mockResolvedValueOnce({
          count: 100,
          size: 10240,
          avgObjSize: 102,
          storageSize: 20480,
          nindexes: 2,
          totalIndexSize: 2048
        })
        .mockResolvedValueOnce({
          count: 50,
          size: 5120,
          avgObjSize: 102,
          storageSize: 10240,
          nindexes: 1,
          totalIndexSize: 1024
        });

      const result = await databaseOps.listCollections('test-cluster', 'testdb');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'users',
        type: 'collection',
        count: 100,
        size: 10240,
        avgObjSize: 102,
        storageSize: 20480,
        indexes: 2,
        totalIndexSize: 2048
      });
    });

    test('should handle collection stats errors gracefully', async () => {
      const mockCollections = [
        { name: 'users', type: 'collection' },
        { name: 'restricted', type: 'collection' }
      ];

      mockDb.listCollections.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockCollections)
      });

      mockCollection.stats
        .mockResolvedValueOnce({ count: 100 })
        .mockRejectedValueOnce(new Error('Access denied'));

      const result = await databaseOps.listCollections('test-cluster', 'testdb');

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        name: 'restricted',
        type: 'collection',
        error: 'Access denied'
      });
    });
  });

  describe('Collection Statistics', () => {
    test('should get detailed collection statistics', async () => {
      const mockStats = {
        count: 1000,
        size: 102400,
        avgObjSize: 102,
        storageSize: 204800,
        capped: false
      };

      const mockIndexes = [
        { name: '_id_', key: { _id: 1 }, unique: false },
        { name: 'email_1', key: { email: 1 }, unique: true, sparse: false }
      ];

      const mockSampleDoc = { _id: '123', name: 'John', email: 'john@example.com' };

      mockCollection.stats.mockResolvedValue(mockStats);
      mockCollection.listIndexes.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockIndexes)
      });
      mockCollection.findOne.mockResolvedValue(mockSampleDoc);

      const result = await databaseOps.getCollectionStats('test-cluster', 'testdb', 'users');

      expect(result).toEqual({
        name: 'users',
        database: 'testdb',
        cluster: 'test-cluster',
        stats: {
          count: 1000,
          size: 102400,
          avgObjSize: 102,
          storageSize: 204800,
          capped: false,
          maxSize: null
        },
        indexes: [
          { name: '_id_', key: { _id: 1 }, unique: false, sparse: false, background: false, size: 0 },
          { name: 'email_1', key: { email: 1 }, unique: true, sparse: false, background: false, size: 0 }
        ],
        sampleDocument: mockSampleDoc
      });
    });
  });

  describe('Query Operations', () => {
    test('should execute find query successfully', async () => {
      const mockDocuments = [
        { _id: '1', name: 'John', age: 30 },
        { _id: '2', name: 'Jane', age: 25 }
      ];

      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockDocuments)
      });
      mockCollection.countDocuments.mockResolvedValue(100);

      const options = {
        filter: { active: true },
        projection: { name: 1, age: 1 },
        sort: { age: -1 },
        limit: 10,
        skip: 0
      };

      const result = await databaseOps.query('test-cluster', 'testdb', 'users', options);

      expect(mockCollection.find).toHaveBeenCalledWith(
        options.filter,
        { projection: options.projection }
      );
      expect(result).toEqual({
        documents: mockDocuments,
        totalCount: 100,
        returnedCount: 2,
        hasMore: true,
        query: options
      });
    });

    test('should execute explain query', async () => {
      const mockExplain = { queryPlanner: {}, executionStats: {} };
      
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        explain: jest.fn().mockResolvedValue(mockExplain)
      });

      const result = await databaseOps.query('test-cluster', 'testdb', 'users', {
        filter: {},
        explain: true
      });

      expect(result).toBe(mockExplain);
    });

    test('should handle query errors', async () => {
      const error = new Error('Invalid query');
      mockCollection.find.mockImplementation(() => {
        throw error;
      });

      await expect(databaseOps.query('test-cluster', 'testdb', 'users', {}))
        .rejects.toThrow('Invalid query');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Query failed for users'),
        error
      );
    });
  });

  describe('Aggregation Operations', () => {
    test('should execute aggregation pipeline', async () => {
      const pipeline = [
        { $match: { active: true } },
        { $group: { _id: '$department', count: { $sum: 1 } } }
      ];

      const mockResults = [
        { _id: 'Engineering', count: 10 },
        { _id: 'Marketing', count: 5 }
      ];

      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockResults)
      });

      const result = await databaseOps.aggregate('test-cluster', 'testdb', 'users', pipeline);

      expect(mockCollection.aggregate).toHaveBeenCalledWith(pipeline, { allowDiskUse: true });
      expect(result).toEqual({
        results: mockResults,
        count: 2,
        pipeline
      });
    });

    test('should execute aggregation with explain', async () => {
      const pipeline = [{ $match: { active: true } }];
      const mockExplain = { stages: [] };

      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockExplain)
      });

      const result = await databaseOps.aggregate('test-cluster', 'testdb', 'users', pipeline, {
        explain: true
      });

      expect(mockCollection.aggregate).toHaveBeenCalledWith(pipeline, {
        explain: true,
        allowDiskUse: true
      });
    });
  });

  describe('Data Modification Operations', () => {
    test('should insert many documents', async () => {
      const documents = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 }
      ];

      const mockResult = {
        insertedCount: 2,
        insertedIds: { 0: 'id1', 1: 'id2' },
        acknowledged: true
      };

      mockCollection.insertMany.mockResolvedValue(mockResult);

      const result = await databaseOps.insertMany('test-cluster', 'testdb', 'users', documents);

      expect(mockCollection.insertMany).toHaveBeenCalledWith(documents, { ordered: true });
      expect(result).toEqual(mockResult);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Inserted 2 documents into users')
      );
    });

    test('should update many documents', async () => {
      const filter = { active: false };
      const update = { $set: { active: true } };
      const mockResult = {
        matchedCount: 5,
        modifiedCount: 5,
        acknowledged: true
      };

      mockCollection.updateMany.mockResolvedValue(mockResult);

      const result = await databaseOps.updateMany('test-cluster', 'testdb', 'users', filter, update);

      expect(mockCollection.updateMany).toHaveBeenCalledWith(filter, update, { upsert: false });
      expect(result).toEqual(mockResult);
    });

    test('should delete many documents', async () => {
      const filter = { active: false };
      const mockResult = {
        deletedCount: 3,
        acknowledged: true
      };

      mockCollection.deleteMany.mockResolvedValue(mockResult);

      const result = await databaseOps.deleteMany('test-cluster', 'testdb', 'users', filter);

      expect(mockCollection.deleteMany).toHaveBeenCalledWith(filter);
      expect(result).toEqual(mockResult);
    });
  });

  describe('Index Management', () => {
    test('should create index successfully', async () => {
      const indexSpec = { email: 1 };
      const options = { unique: true };

      mockCollection.createIndex.mockResolvedValue('email_1');

      const result = await databaseOps.createIndex('test-cluster', 'testdb', 'users', indexSpec, options);

      expect(mockCollection.createIndex).toHaveBeenCalledWith(indexSpec, options);
      expect(result).toEqual({ indexName: 'email_1', created: true });
    });

    test('should drop index successfully', async () => {
      const indexName = 'email_1';

      mockCollection.dropIndex.mockResolvedValue();

      const result = await databaseOps.dropIndex('test-cluster', 'testdb', 'users', indexName);

      expect(mockCollection.dropIndex).toHaveBeenCalledWith(indexName);
      expect(result).toEqual({ indexName, dropped: true });
    });
  });

  describe('Collection Management', () => {
    test('should create collection successfully', async () => {
      const options = { capped: true, size: 1048576 };

      mockDb.createCollection.mockResolvedValue();

      const result = await databaseOps.createCollection('test-cluster', 'testdb', 'newcollection', options);

      expect(mockDb.createCollection).toHaveBeenCalledWith('newcollection', options);
      expect(result).toEqual({ collection: 'newcollection', created: true });
    });

    test('should drop collection successfully', async () => {
      mockDb.dropCollection.mockResolvedValue();

      const result = await databaseOps.dropCollection('test-cluster', 'testdb', 'oldcollection');

      expect(mockDb.dropCollection).toHaveBeenCalledWith('oldcollection');
      expect(result).toEqual({ collection: 'oldcollection', dropped: true });
    });
  });

  describe('Data Export', () => {
    test('should export collection to JSON', async () => {
      const mockDocuments = [
        { _id: '1', name: 'John' },
        { _id: '2', name: 'Jane' }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDocuments)
      });

      const result = await databaseOps.exportToJSON('test-cluster', 'testdb', 'users');

      expect(result).toEqual({
        collection: 'users',
        database: 'testdb',
        cluster: 'test-cluster',
        exportedAt: expect.any(Date),
        count: 2,
        documents: mockDocuments
      });
    });

    test('should export with filter and projection', async () => {
      const filter = { active: true };
      const options = { limit: 10, projection: { name: 1 } };

      mockCollection.find.mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      });

      await databaseOps.exportToJSON('test-cluster', 'testdb', 'users', filter, options);

      expect(mockCollection.find).toHaveBeenCalledWith(filter, { projection: options.projection });
    });
  });

  describe('Query Builder', () => {
    test('should build query from valid JSON string', () => {
      const queryString = '{"name": "John", "age": {"$gte": 18}}';
      const expectedQuery = { name: 'John', age: { $gte: 18 } };

      const result = databaseOps.buildQueryFromString(queryString);

      expect(result).toEqual(expectedQuery);
    });

    test('should throw error for invalid JSON', () => {
      const invalidQuery = '{"name": "John", "invalid": }';

      expect(() => databaseOps.buildQueryFromString(invalidQuery))
        .toThrow('Invalid query format');
    });

    test('should handle empty query string', () => {
      const result = databaseOps.buildQueryFromString('{}');

      expect(result).toEqual({});
    });
  });

  describe('Slow Query Analysis', () => {
    test('should analyze slow queries when profiling enabled', async () => {
      const mockProfilingData = [
        {
          ts: new Date(),
          millis: 150,
          command: { find: 'users' },
          ns: 'testdb.users',
          planSummary: 'COLLSCAN'
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

      const result = await databaseOps.analyzeSlowQueries('test-cluster', 'testdb');

      expect(result).toEqual({
        database: 'testdb',
        cluster: 'test-cluster',
        slowQueries: [{
          timestamp: expect.any(Date),
          duration: 150,
          command: { find: 'users' },
          collection: 'testdb.users',
          planSummary: 'COLLSCAN'
        }]
      });
    });

    test('should handle case when profiling is disabled', async () => {
      mockDb.command.mockResolvedValue({ was: 0 }); // Profiling disabled

      const result = await databaseOps.analyzeSlowQueries('test-cluster', 'testdb');

      expect(result).toEqual({
        error: 'Database profiling is not enabled',
        suggestion: 'Enable profiling with: db.setProfilingLevel(1, { slowms: 100 })'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle cluster manager errors', async () => {
      mockClusterManager.getConnection.mockImplementation(() => {
        throw new Error('Cluster not found');
      });

      await expect(databaseOps.listDatabases('non-existent'))
        .rejects.toThrow('Cluster not found');
    });

    test('should handle database operation timeouts', async () => {
      const timeoutError = new Error('Operation timed out');
      timeoutError.code = 'ETIMEOUT';
      
      mockCollection.find.mockImplementation(() => {
        throw timeoutError;
      });

      await expect(databaseOps.query('test-cluster', 'testdb', 'users', {}))
        .rejects.toThrow('Operation timed out');
    });

    test('should handle permission errors gracefully', async () => {
      const permissionError = new Error('Insufficient permissions');
      permissionError.code = 'EACCES';
      
      mockCollection.insertMany.mockRejectedValue(permissionError);

      await expect(databaseOps.insertMany('test-cluster', 'testdb', 'users', [{}]))
        .rejects.toThrow('Insufficient permissions');
    });
  });
});