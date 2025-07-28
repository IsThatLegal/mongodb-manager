const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const MongoDBManager = require('../lib');

class WebServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3000;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.manager = null;
    this.connectedClients = new Set();
  }

  async initialize() {
    try {
      // Initialize MongoDB Manager
      this.manager = new MongoDBManager({
        logLevel: 'info'
      });
      await this.manager.initialize();

      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket handlers
      this.setupWebSocket();

      // Start monitoring
      await this.manager.getMonitoring().startMonitoring();

      // Listen for monitoring events
      this.manager.getMonitoring().on('metricsCollected', (data) => {
        this.io.emit('metrics', data);
      });

      this.manager.getMonitoring().on('alert', (alert) => {
        this.io.emit('alert', alert);
      });

      console.log('Web server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize web server:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // API Routes
    const apiRouter = express.Router();

    // Clusters
    apiRouter.get('/clusters', async (req, res) => {
      try {
        const clusters = this.manager.getClusterManager().listClusters();
        res.json(clusters);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    apiRouter.get('/clusters/:name/info', async (req, res) => {
      try {
        const info = await this.manager.getClusterManager().getClusterInfo(req.params.name);
        res.json(info);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    apiRouter.get('/clusters/:name/health', async (req, res) => {
      try {
        const health = await this.manager.getClusterManager().healthCheck(req.params.name);
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Databases
    apiRouter.get('/clusters/:cluster/databases', async (req, res) => {
      try {
        const databases = await this.manager.getDatabaseOperations().listDatabases(req.params.cluster);
        res.json(databases);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    apiRouter.get('/clusters/:cluster/databases/:db/stats', async (req, res) => {
      try {
        const stats = await this.manager.getDatabaseOperations().getDatabaseStats(
          req.params.cluster, 
          req.params.db
        );
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    apiRouter.get('/clusters/:cluster/databases/:db/collections', async (req, res) => {
      try {
        const collections = await this.manager.getDatabaseOperations().listCollections(
          req.params.cluster, 
          req.params.db
        );
        res.json(collections);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Query endpoint
    apiRouter.post('/clusters/:cluster/databases/:db/collections/:collection/query', async (req, res) => {
      try {
        const { filter, projection, sort, limit, skip, explain } = req.body;
        
        const result = await this.manager.getDatabaseOperations().query(
          req.params.cluster,
          req.params.db,
          req.params.collection,
          { filter, projection, sort, limit, skip, explain }
        );
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Monitoring
    apiRouter.get('/clusters/:cluster/metrics', async (req, res) => {
      try {
        const timeRange = req.query.timeRange || '1h';
        const metrics = await this.manager.getMonitoring().getMetrics(req.params.cluster, timeRange);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    apiRouter.get('/alerts', async (req, res) => {
      try {
        const { cluster, severity } = req.query;
        const alerts = this.manager.getMonitoring().getAlerts(cluster, severity);
        res.json(alerts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Backups
    apiRouter.get('/backups', async (req, res) => {
      try {
        const backups = await this.manager.getBackupManager().listBackups();
        res.json(backups);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    apiRouter.post('/backups', async (req, res) => {
      try {
        const { cluster, database, options } = req.body;
        const result = await this.manager.getBackupManager().createBackup(cluster, database, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.use('/api', apiRouter);

    // Serve dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date(),
        clusters: this.manager.getClusterManager().listClusters().length
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      console.error('API Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      this.connectedClients.add(socket.id);

      // Send initial data
      socket.emit('clusters', this.manager.getClusterManager().listClusters());
      socket.emit('monitoring-status', this.manager.getMonitoring().getMonitoringStatus());

      // Handle client requests
      socket.on('request-metrics', async (data) => {
        try {
          const metrics = await this.manager.getMonitoring().getMetrics(
            data.cluster, 
            data.timeRange || '1h'
          );
          socket.emit('metrics-response', metrics);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('request-health-check', async (data) => {
        try {
          const health = await this.manager.getClusterManager().healthCheck(data.cluster);
          socket.emit('health-check-response', health);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.connectedClients.delete(socket.id);
      });
    });
  }

  async start() {
    await this.initialize();
    
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`MongoDB Manager Web Dashboard running on port ${this.port}`);
        console.log(`Dashboard: http://localhost:${this.port}`);
        console.log(`API: http://localhost:${this.port}/api`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Web server stopped');
        resolve();
      });
    });
  }

  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      clusters: this.manager.getClusterManager().listClusters().length,
      monitoring: this.manager.getMonitoring().getMonitoringStatus()
    };
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new WebServer();
  
  server.start().catch(error => {
    console.error('Failed to start web server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down web server...');
    await server.stop();
    process.exit(0);
  });
}

module.exports = WebServer;