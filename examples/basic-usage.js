#!/usr/bin/env node

/**
 * Basic Usage Example for MongoDB Cluster Manager
 * 
 * This example demonstrates the core functionality of the MongoDB Manager
 * including cluster management, database operations, and monitoring.
 */

const MongoDBManager = require('../lib');

async function basicUsageExample() {
  console.log('🚀 MongoDB Cluster Manager - Basic Usage Example\n');

  // Initialize the manager
  const manager = new MongoDBManager({
    logLevel: 'info'
  });

  try {
    // Initialize the manager
    console.log('📋 Initializing MongoDB Manager...');
    await manager.initialize();
    console.log('✅ Manager initialized successfully\n');

    // Add a cluster (example with local MongoDB)
    console.log('🔗 Adding cluster configuration...');
    manager.config.addCluster('example-local', {
      uri: 'mongodb://localhost:27017',
      environment: 'development',
      databases: ['testdb'],
      description: 'Example local MongoDB instance'
    });
    await manager.config.save();
    console.log('✅ Cluster configuration saved\n');

    // Get cluster manager and try to connect
    const clusterManager = manager.getClusterManager();
    
    try {
      console.log('🔍 Testing cluster connection...');
      await clusterManager.addCluster('example-local', {
        uri: 'mongodb://localhost:27017',
        environment: 'development',
        databases: ['testdb']
      });
      console.log('✅ Successfully connected to cluster\n');

      // List clusters
      console.log('📊 Listing configured clusters:');
      const clusters = clusterManager.listClusters();
      clusters.forEach(cluster => {
        console.log(`  - ${cluster.name} (${cluster.environment}): ${cluster.status}`);
      });
      console.log();

      // Get cluster information
      console.log('ℹ️ Getting cluster information...');
      const clusterInfo = await clusterManager.getClusterInfo('example-local');
      console.log(`  MongoDB Version: ${clusterInfo.buildInfo?.version || 'Unknown'}`);
      console.log(`  Server Status: Connected`);
      console.log();

      // Database operations
      const dbOps = manager.getDatabaseOperations();
      
      console.log('📁 Listing databases...');
      const databases = await dbOps.listDatabases('example-local');
      databases.forEach(db => {
        const sizeStr = db.sizeOnDisk ? `${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB` : 'Empty';
        console.log(`  - ${db.name}: ${sizeStr}`);
      });
      console.log();

      // If testdb exists, show collections
      if (databases.some(db => db.name === 'testdb')) {
        console.log('📄 Listing collections in testdb...');
        const collections = await dbOps.listCollections('example-local', 'testdb');
        if (collections.length > 0) {
          collections.forEach(collection => {
            console.log(`  - ${collection.name}: ${collection.count || 0} documents`);
          });
        } else {
          console.log('  No collections found');
        }
        console.log();
      }

      // Create a test collection and insert sample data
      console.log('🔨 Creating test collection and inserting sample data...');
      await dbOps.createCollection('example-local', 'testdb', 'examples');
      
      const sampleData = [
        { name: 'Alice', age: 30, department: 'Engineering' },
        { name: 'Bob', age: 25, department: 'Marketing' },
        { name: 'Charlie', age: 35, department: 'Sales' }
      ];
      
      const insertResult = await dbOps.insertMany('example-local', 'testdb', 'examples', sampleData);
      console.log(`✅ Inserted ${insertResult.insertedCount} documents\n`);

      // Query the data
      console.log('🔍 Querying sample data...');
      const queryResult = await dbOps.query('example-local', 'testdb', 'examples', {
        filter: {},
        limit: 10
      });
      
      console.log(`Found ${queryResult.totalCount} total documents:`);
      queryResult.documents.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.name} (${doc.age}) - ${doc.department}`);
      });
      console.log();

      // Count documents by department
      console.log('📊 Aggregation example - Count by department:');
      const aggregationResult = await dbOps.aggregate('example-local', 'testdb', 'examples', [
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 },
            avgAge: { $avg: '$age' }
          }
        }
      ]);
      
      aggregationResult.results.forEach(result => {
        console.log(`  - ${result._id}: ${result.count} people, avg age ${result.avgAge.toFixed(1)}`);
      });
      console.log();

      // Create backup
      console.log('💾 Creating backup...');
      const backupManager = manager.getBackupManager();
      const backup = await backupManager.createBackup('example-local', 'testdb', {
        compress: true
      });
      console.log(`✅ Backup created: ${backup.name}`);
      console.log(`   Size: ${(backup.size / 1024).toFixed(2)} KB`);
      console.log(`   Collections: ${backup.collections}`);
      console.log();

      // List backups
      console.log('📋 Available backups:');
      const backups = await backupManager.listBackups();
      backups.slice(0, 3).forEach(backup => {
        console.log(`  - ${backup.name} (${new Date(backup.created).toLocaleDateString()})`);
      });
      console.log();

      // Start monitoring
      console.log('📈 Starting monitoring service...');
      const monitoring = manager.getMonitoring();
      await monitoring.startMonitoring(10000); // Check every 10 seconds
      
      console.log('✅ Monitoring started - collecting metrics...');
      
      // Wait for some metrics to be collected
      await new Promise(resolve => setTimeout(resolve, 12000));
      
      // Get metrics
      const metrics = await monitoring.getMetrics('example-local', '5m');
      if (metrics.dataPoints > 0) {
        console.log(`📊 Collected ${metrics.dataPoints} metric data points`);
        console.log(`   Current connections: ${metrics.summary?.connections?.current || 'N/A'}`);
        console.log(`   Memory usage: ${metrics.summary?.memory?.current || 'N/A'} MB`);
      }
      console.log();

      monitoring.stopMonitoring();

    } catch (connectionError) {
      console.log('⚠️ Could not connect to local MongoDB instance');
      console.log('   Make sure MongoDB is running on localhost:27017');
      console.log('   Or modify the connection string in this example');
      console.log(`   Error: ${connectionError.message}\n`);
    }

  } catch (error) {
    console.error('❌ Error during example execution:', error.message);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    await manager.shutdown();
    console.log('✅ Example completed successfully!');
  }
}

// Run the example
if (require.main === module) {
  basicUsageExample().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = basicUsageExample;