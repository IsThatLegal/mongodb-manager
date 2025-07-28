# MongoDB Cluster Manager

A comprehensive, professional MongoDB cluster management tool with CLI, web dashboard, and automation capabilities.

## Features

### 🎯 Core Functionality
- **Multi-Cluster Support**: Connect to and manage multiple MongoDB clusters (Atlas, self-hosted, local)
- **Database Operations**: Full CRUD operations, query builder, bulk operations
- **Real-time Monitoring**: Performance metrics, health monitoring, slow query analysis
- **Automated Backups**: Scheduled backups, compression, cross-cluster migration
- **User Management**: Database users, roles, permissions, security auditing
- **Data Maintenance**: Cleanup tools, index optimization, data analysis

### 🔧 Interfaces
- **CLI Tool**: Powerful command-line interface with intuitive commands
- **Web Dashboard**: Modern responsive web interface with real-time updates
- **REST API**: Complete API for automation and third-party integrations
- **Interactive Shell**: Step-by-step guided operations

### 📊 Monitoring & Analytics
- Real-time cluster health monitoring
- Performance metrics and charts
- Slow query identification and analysis
- Alert system for critical issues
- Resource usage tracking
- Connection monitoring

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/IsThatLegal/mongodb-manager.git
cd mongodb-manager

# Install dependencies
npm install

# Make CLI globally available
npm link

# Or install globally
npm install -g mongodb-cluster-manager
```

### Basic Setup

1. **Initialize configuration**:
```bash
mm clusters setup
```

2. **Add your first cluster**:
```bash
mm clusters add mylocal mongodb://localhost:27017 --environment development
```

3. **Test the connection**:
```bash
mm clusters test mylocal
```

4. **Start the web dashboard**:
```bash
npm run web
```
Visit http://localhost:3000 to access the dashboard.

## CLI Usage

### Cluster Management

```bash
# List all clusters
mm clusters list

# Add a cluster
mm clusters add production mongodb+srv://user:pass@cluster.mongodb.net --environment production

# Remove a cluster
mm clusters remove staging

# Test cluster connection
mm clusters test production

# Show cluster information
mm clusters info production

# Interactive setup wizard
mm clusters setup
```

### Database Operations

```bash
# List databases
mm databases list production

# Show database statistics
mm databases stats production myapp

# List collections
mm databases collections production myapp

# Collection statistics
mm databases collection-stats production myapp users

# Create collection
mm databases create-collection production myapp logs --capped --size 1048576
```

### Querying Data

```bash
# Find documents
mm query find production myapp users --filter '{"active": true}' --limit 10

# Count documents
mm query count production myapp users --filter '{"status": "pending"}'

# Aggregation pipeline
mm query aggregate production myapp orders '[{"$group": {"_id": "$status", "count": {"$sum": 1}}}]'

# Get distinct values
mm query distinct production myapp users country

# Random sampling
mm query sample production myapp products --size 5
```

### Backup Operations

```bash
# Create backup
mm backup create production myapp --compress

# List backups
mm backup list

# Schedule automated backup (every day at 2 AM)
mm backup schedule production myapp "0 2 * * *" --compress

# Restore backup
mm backup restore backup-file.zip staging myapp-test
```

### Monitoring

```bash
# Check cluster health
mm health production

# Start monitoring dashboard
mm monitor start

# View metrics
mm monitor metrics production

# List alerts
mm alerts list
```

### Interactive Shell

```bash
# Start interactive mode
mm shell
```

## Web Dashboard

The web dashboard provides a modern interface for:

- **Real-time cluster monitoring** with live metrics
- **Interactive query builder** with syntax highlighting
- **Backup management** with scheduling interface
- **Alert dashboard** with filtering and acknowledgment
- **User management** panels for security administration
- **Configuration editor** for cluster settings

### Starting the Dashboard

```bash
# Development mode
npm run dev

# Production mode
npm run web

# Custom port
PORT=8080 npm run web
```

## REST API

The REST API provides programmatic access to all functionality:

### Endpoints

```
GET    /api/clusters                           # List clusters
GET    /api/clusters/:name/info                # Cluster information
GET    /api/clusters/:name/health              # Health check
GET    /api/clusters/:cluster/databases        # List databases
POST   /api/clusters/:cluster/databases/:db/collections/:collection/query
GET    /api/clusters/:cluster/metrics          # Get metrics
GET    /api/alerts                             # List alerts
GET    /api/backups                            # List backups
POST   /api/backups                            # Create backup
```

### Example API Usage

```javascript
// Get cluster information
const response = await fetch('/api/clusters/production/info');
const clusterInfo = await response.json();

// Query data
const queryResponse = await fetch('/api/clusters/production/databases/myapp/collections/users/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filter: { active: true },
    limit: 10,
    sort: { created_at: -1 }
  })
});
const results = await queryResponse.json();
```

## Configuration

### Cluster Configuration

Clusters are configured in `config/clusters.json`:

```json
{
  "clusters": {
    "production": {
      "uri": "mongodb+srv://user:pass@cluster.mongodb.net",
      "environment": "production",
      "databases": ["myapp", "analytics"],
      "description": "Production cluster",
      "options": {
        "maxPoolSize": 20,
        "serverSelectionTimeoutMS": 5000
      }
    },
    "staging": {
      "uri": "mongodb://staging-host:27017",
      "environment": "staging",
      "databases": ["myapp"],
      "description": "Staging environment"
    }
  },
  "settings": {
    "defaultTimeout": 30000,
    "maxRetries": 3,
    "backupRetention": 30,
    "logLevel": "info",
    "webPort": 3000
  }
}
```

### Environment Variables

```bash
# Encryption key for connection strings
MM_ENCRYPTION_KEY=your-secret-key

# Log level
LOG_LEVEL=info

# Web dashboard port
PORT=3000

# MongoDB connection timeout
MONGO_TIMEOUT=30000
```

## Security

### Connection Security
- Connection strings are encrypted at rest
- Support for SSL/TLS connections
- Authentication with username/password or certificates
- Role-based access control

### Best Practices
- Store sensitive credentials in environment variables
- Use read-only users for monitoring operations
- Enable audit logging for production environments
- Regularly rotate credentials
- Use network security groups to restrict access

## Performance

### Optimization Features
- Connection pooling with configurable limits
- Async operations with proper error handling
- Memory-efficient streaming for large operations
- Caching for frequently accessed metadata
- Bulk operations for better performance

### Resource Management
- Configurable connection timeouts
- Memory usage monitoring
- CPU usage tracking
- Network I/O monitoring
- Query performance analysis

## Examples

### Automated Maintenance Script

```javascript
const MongoDBManager = require('mongodb-cluster-manager');

async function dailyMaintenance() {
  const manager = new MongoDBManager();
  await manager.initialize();
  
  // Health check all clusters
  const clusters = manager.getClusterManager().listClusters();
  for (const cluster of clusters) {
    const health = await manager.getClusterManager().healthCheck(cluster.name);
    console.log(`${cluster.name}: ${health[cluster.name].status}`);
  }
  
  // Create backups
  await manager.getBackupManager().createBackup('production', 'myapp', {
    compress: true
  });
  
  // Cleanup old backups
  await manager.getBackupManager().cleanupOldBackups(7);
  
  await manager.shutdown();
}

dailyMaintenance().catch(console.error);
```

### Custom Monitoring Script

```javascript
const manager = new MongoDBManager();

manager.getMonitoring().on('alert', (alert) => {
  console.log(`ALERT: ${alert.message}`);
  // Send notification to Slack, email, etc.
});

await manager.initialize();
await manager.getMonitoring().startMonitoring();
```

## Development

### Project Structure

```
mongodb-cluster-manager/
├── bin/                    # CLI executables
│   └── mm                  # Main CLI entry point
├── lib/                    # Core functionality
│   ├── index.js            # Main library entry
│   ├── cluster-manager.js  # Cluster management
│   ├── database-operations.js # Database operations
│   ├── backup-manager.js   # Backup functionality
│   ├── monitoring-service.js # Monitoring system
│   ├── config-manager.js   # Configuration management
│   ├── cli/                # CLI commands
│   └── utils/              # Utility functions
├── web/                    # Web dashboard
│   ├── server.js           # Express server
│   └── public/             # Static files
├── config/                 # Configuration files
├── tests/                  # Test suites
├── docs/                   # Documentation
└── examples/               # Usage examples
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

### Building Documentation

```bash
# Generate API documentation
npm run docs
```

## Troubleshooting

### Common Issues

**Connection timeouts**
- Check network connectivity
- Verify connection string format
- Increase timeout values in configuration

**Authentication failures**
- Verify credentials
- Check user permissions
- Ensure database exists

**Performance issues**
- Monitor connection pool usage
- Check for slow queries
- Review index usage

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug mm clusters list

# Verbose CLI output
mm clusters list --verbose

# Monitor network traffic
DEBUG=* mm clusters test production
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📚 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/IsThatLegal/mongodb-manager/issues)
- 💬 [Discussions](https://github.com/IsThatLegal/mongodb-manager/discussions)
- 📧 Email: support@mongodb-manager.com

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.