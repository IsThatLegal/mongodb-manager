const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const MongoDBManager = require('../lib');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic Authentication Middleware for API endpoints
function requireAuth(req, res, next) {
  // Skip auth for health check and debug endpoints
  if (req.path === '/health' || req.path === '/debug') {
    return next();
  }
  
  // Check for simple API key in headers
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  const validKeys = [
    'gabehuerta82-mongodb-access',
    'Bearer gabehuerta82-mongodb-access',
    'mongodb-manager-2024',
    'Bearer mongodb-cluster-access'
  ];
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ 
      error: 'Unauthorized access',
      message: 'Valid API key required for database operations'
    });
  }
  
  next();
}

// Apply auth to all API routes
app.use('/api', requireAuth);

// Initialize MongoDB Manager
let manager;
let isInitialized = false;

async function initializeManager() {
  if (!isInitialized) {
    try {
      // For Vercel serverless, use environment-based configuration
      const config = {
        logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'info',
        serverless: true
      };
      
      manager = new MongoDBManager(config);
      
      // Add Atlas cluster to config before initialization
      if (process.env.MONGODB_ATLAS_URI) {
        console.log('✅ MONGODB_ATLAS_URI found in environment');
        console.log('URI length:', process.env.MONGODB_ATLAS_URI.length);
        console.log('URI starts with:', process.env.MONGODB_ATLAS_URI.substring(0, 20) + '...');
        
        console.log('Adding Atlas cluster to configuration...');
        
        // Clean the URI to remove any whitespace/newlines
        const cleanUri = process.env.MONGODB_ATLAS_URI.trim().replace(/\s+/g, '');
        console.log('Cleaned URI length:', cleanUri.length);
        
        const clusterConfig = {
          uri: cleanUri,
          environment: 'production', 
          description: 'MongoDB Atlas Cluster0',
          encrypted: false,
          options: {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000
          }
        };
        
        manager.getConfigManager().addCluster('Cluster0', clusterConfig);
        console.log('✅ Atlas cluster added to config');
        
        // Verify it was added
        const configClusters = manager.getConfigManager().getClusters();
        console.log('Config clusters after adding:', Object.keys(configClusters));
      } else {
        console.log('❌ No MONGODB_ATLAS_URI found in environment');
        console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('MONGO')));
      }
      
      console.log('Initializing manager...');
      await manager.initialize();
      console.log('✅ Manager initialized');
      
      // Debug: Check clusters after initialization
      const clusters = manager.getClusterManager().listClusters();
      console.log('✅ Clusters after initialization:', clusters.length);
      clusters.forEach((cluster, index) => {
        console.log(`  ${index + 1}. ${cluster.name} (${cluster.environment}) - ${cluster.status}`);
      });
      isInitialized = true;
      console.log('MongoDB Manager initialized for Vercel serverless');
    } catch (error) {
      console.error('Failed to initialize MongoDB Manager:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }
  }
  return manager;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    vercel: true
  });
});

// Debug endpoint to check environment and configuration
app.get('/debug', async (req, res) => {
  try {
    console.log('=== DEBUG ENDPOINT CALLED ===');
    
    const envVars = Object.keys(process.env).filter(key => 
      key.includes('MONGO') || key.includes('NODE') || key.includes('VERCEL')
    );
    
    const hasAtlasUri = !!process.env.MONGODB_ATLAS_URI;
    const atlasUriLength = process.env.MONGODB_ATLAS_URI ? process.env.MONGODB_ATLAS_URI.length : 0;
    
    console.log('Environment check:');
    console.log('- Has MONGODB_ATLAS_URI:', hasAtlasUri);
    console.log('- URI length:', atlasUriLength);
    console.log('- Relevant env vars:', envVars);
    
    let managerStatus = 'not initialized';
    let configClusters = {};
    let clusterManagerClusters = [];
    
    if (isInitialized && manager) {
      managerStatus = 'initialized';
      configClusters = manager.getConfigManager().getClusters();
      clusterManagerClusters = manager.getClusterManager().listClusters();
      console.log('Manager is initialized, clusters:', clusterManagerClusters.length);
    } else {
      console.log('Manager not initialized yet');
    }
    
    const debugInfo = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        hasAtlasUri,
        atlasUriLength: atlasUriLength > 0 ? `${atlasUriLength} characters` : 'not set',
        relevantEnvVars: envVars
      },
      manager: {
        status: managerStatus,
        isInitialized,
        configClusters: Object.keys(configClusters),
        clusterManagerClusters: clusterManagerClusters.length
      }
    };
    
    console.log('Returning debug info:', JSON.stringify(debugInfo, null, 2));
    res.json(debugInfo);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// API Routes
app.get('/api/clusters', async (req, res) => {
  try {
    console.log('=== /api/clusters called ===');
    const mgr = await initializeManager();
    console.log('Manager initialized successfully');
    
    const clusters = mgr.getClusterManager().listClusters();
    console.log('Clusters from manager:', clusters);
    console.log('Number of clusters:', clusters.length);
    
    res.json(clusters);
  } catch (error) {
    console.error('Error listing clusters:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clusters/:name/info', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const info = await mgr.getClusterManager().getClusterInfo(req.params.name);
    res.json(info);
  } catch (error) {
    console.error('Error getting cluster info:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clusters/:name/health', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const health = await mgr.getClusterManager().healthCheck(req.params.name);
    res.json(health);
  } catch (error) {
    console.error('Error checking cluster health:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/databases/:cluster', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const databases = await mgr.getDatabaseOperations().listDatabases(req.params.cluster);
    res.json(databases);
  } catch (error) {
    console.error('Error listing databases:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:cluster/:database', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const collections = await mgr.getDatabaseOperations().listCollections(
      req.params.cluster, 
      req.params.database
    );
    res.json(collections);
  } catch (error) {
    console.error('Error listing collections:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/query/:cluster/:database/:collection', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const { cluster, database, collection } = req.params;
    const queryOptions = req.body;
    
    const result = await mgr.getDatabaseOperations().query(
      cluster, 
      database, 
      collection, 
      queryOptions
    );
    res.json(result);
  } catch (error) {
    console.error('Error querying data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/backups', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const backups = await mgr.getBackupManager().listBackups();
    res.json(backups);
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backup/:cluster/:database', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const { cluster, database } = req.params;
    const options = req.body || {};
    
    const backup = await mgr.getBackupManager().createBackup(cluster, database, options);
    res.json(backup);
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// CRUD API endpoints for documents
app.get('/api/documents/:cluster/:database/:collection', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const { cluster, database, collection } = req.params;
    const { page = 1, limit = 20, filter = '{}' } = req.query;
    
    const skip = (page - 1) * limit;
    const filterObj = JSON.parse(filter);
    
    const db = mgr.getClusterManager().getDatabase(cluster, database);
    const coll = db.collection(collection);
    
    const [documents, totalCount] = await Promise.all([
      coll.find(filterObj).skip(skip).limit(parseInt(limit)).toArray(),
      coll.countDocuments(filterObj)
    ]);
    
    res.json({
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents/:cluster/:database/:collection', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const { cluster, database, collection } = req.params;
    const document = req.body;
    
    const db = mgr.getClusterManager().getDatabase(cluster, database);
    const coll = db.collection(collection);
    
    const result = await coll.insertOne(document);
    res.json({ success: true, insertedId: result.insertedId });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/documents/:cluster/:database/:collection/:id', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const { cluster, database, collection, id } = req.params;
    const update = req.body;
    
    const { ObjectId } = require('mongodb');
    const db = mgr.getClusterManager().getDatabase(cluster, database);
    const coll = db.collection(collection);
    
    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );
    
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/documents/:cluster/:database/:collection/:id', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const { cluster, database, collection, id } = req.params;
    
    const { ObjectId } = require('mongodb');
    const db = mgr.getClusterManager().getDatabase(cluster, database);
    const coll = db.collection(collection);
    
    const result = await coll.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Default route for SPA
app.get('*', (req, res) => {
  // For non-API routes, let Vercel handle static files
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// For Vercel, we need to export the app, not listen
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`MongoDB Manager API running on port ${PORT}`);
  });
}