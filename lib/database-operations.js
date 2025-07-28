const { ObjectId } = require('mongodb');

class DatabaseOperations {
  constructor(clusterManager, logger) {
    this.clusterManager = clusterManager;
    this.logger = logger;
  }

  async listDatabases(clusterName) {
    try {
      const client = this.clusterManager.getConnection(clusterName);
      const admin = client.db('admin');
      const result = await admin.command({ listDatabases: 1 });
      
      return result.databases.map(db => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty || false
      }));
    } catch (error) {
      this.logger.error(`Failed to list databases for cluster ${clusterName}:`, error);
      throw error;
    }
  }

  async getDatabaseStats(clusterName, dbName) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const stats = await db.stats();
      
      return {
        database: dbName,
        collections: stats.collections,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        fileSize: stats.fileSize || 0,
        nsSizeMB: stats.nsSizeMB || 0
      };
    } catch (error) {
      this.logger.error(`Failed to get stats for database ${dbName}:`, error);
      throw error;
    }
  }

  async listCollections(clusterName, dbName) {
    try {
      console.log(`Listing collections for cluster: ${clusterName}, database: ${dbName}`);
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collections = await db.listCollections().toArray();
      console.log(`Found ${collections.length} collections in ${dbName}:`, collections.map(c => c.name));
      
      const collectionsWithStats = await Promise.all(
        collections.map(async (collection) => {
          try {
            // Use collStats command instead of .stats() method
            const stats = await db.command({ collStats: collection.name });
            const coll = db.collection(collection.name);
            
            // Get document count using countDocuments
            let documentCount = 0;
            try {
              documentCount = await coll.countDocuments({});
            } catch (countError) {
              console.log(`Could not count documents for ${collection.name}:`, countError.message);
            }
            
            return {
              name: collection.name,
              type: collection.type || 'collection',
              count: documentCount,
              size: stats.size || 0,
              avgObjSize: stats.avgObjSize || 0,
              storageSize: stats.storageSize || 0,
              indexes: stats.nindexes || 0,
              totalIndexSize: stats.totalIndexSize || 0
            };
          } catch (error) {
            console.log(`Error getting stats for collection ${collection.name}:`, error.message);
            
            // Fallback: just get basic info without stats
            let documentCount = 0;
            try {
              const coll = db.collection(collection.name);
              documentCount = await coll.countDocuments({});
            } catch (countError) {
              console.log(`Could not count documents for ${collection.name}:`, countError.message);
            }
            
            return {
              name: collection.name,
              type: collection.type || 'collection',
              count: documentCount,
              size: 0,
              avgObjSize: 0,
              storageSize: 0,
              indexes: 0,
              totalIndexSize: 0,
              error: error.message
            };
          }
        })
      );

      console.log(`Successfully processed ${collectionsWithStats.length} collections for ${dbName}`);
      return collectionsWithStats;
    } catch (error) {
      console.error(`Failed to list collections for database ${dbName}:`, error.message);
      this.logger.error(`Failed to list collections for database ${dbName}:`, error);
      
      // Final fallback: return basic collection list without stats
      try {
        console.log('Attempting fallback: basic collection list without stats');
        const db = this.clusterManager.getDatabase(clusterName, dbName);
        const collections = await db.listCollections().toArray();
        
        return collections.map(collection => ({
          name: collection.name,
          type: collection.type || 'collection',
          count: 'Unknown',
          size: 0,
          error: 'Stats unavailable'
        }));
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError.message);
        throw error;
      }
    }
  }

  async getCollectionStats(clusterName, dbName, collectionName) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const [stats, indexes, sampleDoc] = await Promise.all([
        collection.stats(),
        collection.listIndexes().toArray(),
        collection.findOne({})
      ]);

      return {
        name: collectionName,
        database: dbName,
        cluster: clusterName,
        stats: {
          count: stats.count,
          size: stats.size,
          avgObjSize: stats.avgObjSize,
          storageSize: stats.storageSize,
          capped: stats.capped || false,
          maxSize: stats.maxSize || null
        },
        indexes: indexes.map(index => ({
          name: index.name,
          key: index.key,
          unique: index.unique || false,
          sparse: index.sparse || false,
          background: index.background || false,
          size: index.size || 0
        })),
        sampleDocument: sampleDoc
      };
    } catch (error) {
      this.logger.error(`Failed to get collection stats for ${collectionName}:`, error);
      throw error;
    }
  }

  async query(clusterName, dbName, collectionName, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const {
        filter = {},
        projection = {},
        sort = {},
        limit = 100,
        skip = 0,
        explain = false
      } = options;

      if (explain) {
        return await collection.find(filter, { projection }).sort(sort).limit(limit).skip(skip).explain();
      }

      const cursor = collection.find(filter, { projection }).sort(sort).limit(limit).skip(skip);
      const documents = await cursor.toArray();
      const count = await collection.countDocuments(filter);

      return {
        documents,
        totalCount: count,
        returnedCount: documents.length,
        hasMore: skip + documents.length < count,
        query: { filter, projection, sort, limit, skip }
      };
    } catch (error) {
      this.logger.error(`Query failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async aggregate(clusterName, dbName, collectionName, pipeline, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const { explain = false, allowDiskUse = true } = options;

      if (explain) {
        return await collection.aggregate(pipeline, { explain: true, allowDiskUse });
      }

      const cursor = collection.aggregate(pipeline, { allowDiskUse });
      const results = await cursor.toArray();

      return {
        results,
        count: results.length,
        pipeline
      };
    } catch (error) {
      this.logger.error(`Aggregation failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async insertMany(clusterName, dbName, collectionName, documents, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const { ordered = true } = options;
      const result = await collection.insertMany(documents, { ordered });

      this.logger.info(`Inserted ${result.insertedCount} documents into ${collectionName}`);
      
      return {
        insertedCount: result.insertedCount,
        insertedIds: result.insertedIds,
        acknowledged: result.acknowledged
      };
    } catch (error) {
      this.logger.error(`Insert failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async updateMany(clusterName, dbName, collectionName, filter, update, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const { upsert = false } = options;
      const result = await collection.updateMany(filter, update, { upsert });

      this.logger.info(`Updated ${result.modifiedCount} documents in ${collectionName}`);
      
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
        upsertedId: result.upsertedId,
        acknowledged: result.acknowledged
      };
    } catch (error) {
      this.logger.error(`Update failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async deleteMany(clusterName, dbName, collectionName, filter) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const result = await collection.deleteMany(filter);

      this.logger.info(`Deleted ${result.deletedCount} documents from ${collectionName}`);
      
      return {
        deletedCount: result.deletedCount,
        acknowledged: result.acknowledged
      };
    } catch (error) {
      this.logger.error(`Delete failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async createIndex(clusterName, dbName, collectionName, indexSpec, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const result = await collection.createIndex(indexSpec, options);
      
      this.logger.info(`Created index ${result} on ${collectionName}`);
      return { indexName: result, created: true };
    } catch (error) {
      this.logger.error(`Index creation failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async dropIndex(clusterName, dbName, collectionName, indexName) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      await collection.dropIndex(indexName);
      
      this.logger.info(`Dropped index ${indexName} from ${collectionName}`);
      return { indexName, dropped: true };
    } catch (error) {
      this.logger.error(`Index drop failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async createCollection(clusterName, dbName, collectionName, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      
      await db.createCollection(collectionName, options);
      
      this.logger.info(`Created collection ${collectionName} in database ${dbName}`);
      return { collection: collectionName, created: true };
    } catch (error) {
      this.logger.error(`Collection creation failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async dropCollection(clusterName, dbName, collectionName) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      
      await db.dropCollection(collectionName);
      
      this.logger.info(`Dropped collection ${collectionName} from database ${dbName}`);
      return { collection: collectionName, dropped: true };
    } catch (error) {
      this.logger.error(`Collection drop failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async exportToJSON(clusterName, dbName, collectionName, filter = {}, options = {}) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      const collection = db.collection(collectionName);
      
      const { limit = null, projection = {} } = options;
      
      let cursor = collection.find(filter, { projection });
      if (limit) {
        cursor = cursor.limit(limit);
      }
      
      const documents = await cursor.toArray();
      
      return {
        collection: collectionName,
        database: dbName,
        cluster: clusterName,
        exportedAt: new Date(),
        count: documents.length,
        documents
      };
    } catch (error) {
      this.logger.error(`Export failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async analyzeSlowQueries(clusterName, dbName) {
    try {
      const db = this.clusterManager.getDatabase(clusterName, dbName);
      
      // Get profiling data (if profiling is enabled)
      const profilingCollection = db.collection('system.profile');
      const slowQueries = await profilingCollection
        .find({ ts: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .sort({ ts: -1 })
        .limit(100)
        .toArray();

      return {
        database: dbName,
        cluster: clusterName,
        slowQueries: slowQueries.map(query => ({
          timestamp: query.ts,
          duration: query.millis,
          command: query.command,
          collection: query.ns,
          planSummary: query.planSummary
        }))
      };
    } catch (error) {
      this.logger.error(`Slow query analysis failed for ${dbName}:`, error);
      throw error;
    }
  }

  buildQueryFromString(queryString) {
    try {
      // Safe eval alternative for query building
      const query = JSON.parse(queryString);
      return query;
    } catch (error) {
      throw new Error(`Invalid query format: ${error.message}`);
    }
  }
}

module.exports = DatabaseOperations;