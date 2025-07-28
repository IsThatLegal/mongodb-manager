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

// Initialize MongoDB Manager
let manager;
let isInitialized = false;

async function initializeManager() {
  if (!isInitialized) {
    try {
      manager = new MongoDBManager({
        logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'info'
      });
      await manager.initialize();
      isInitialized = true;
      console.log('MongoDB Manager initialized for Vercel');
    } catch (error) {
      console.error('Failed to initialize MongoDB Manager:', error.message);
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

// API Routes
app.get('/api/clusters', async (req, res) => {
  try {
    const mgr = await initializeManager();
    const clusters = mgr.getClusterManager().listClusters();
    res.json(clusters);
  } catch (error) {
    console.error('Error listing clusters:', error);
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