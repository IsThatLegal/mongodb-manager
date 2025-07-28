#!/usr/bin/env node

/**
 * MongoDB Atlas Connection Example
 * 
 * This example shows how to connect to MongoDB Atlas cloud clusters
 * and perform common operations.
 */

const MongoDBManager = require('../lib');

async function atlasConnectionExample() {
  console.log('🌐 MongoDB Atlas Connection Example\n');

  // Initialize the manager
  const manager = new MongoDBManager({
    logLevel: 'info'
  });

  try {
    // Initialize the manager
    console.log('📋 Initializing MongoDB Manager...');
    await manager.initialize();
    console.log('✅ Manager initialized successfully\n');

    // Atlas connection details (replace with your actual details)
    const atlasConfig = {
      clusterName: 'atlas-production',
      // Replace these with your actual Atlas details:
      uri: process.env.MONGODB_ATLAS_URI || 'mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/',
      database: process.env.MONGODB_ATLAS_DB || 'myapp',
      environment: 'production'
    };

    console.log('🔧 Atlas Connection Configuration:');
    console.log(`   Cluster: ${atlasConfig.clusterName}`);
    console.log(`   Database: ${atlasConfig.database}`);
    console.log(`   Environment: ${atlasConfig.environment}`);
    console.log(`   URI: ${atlasConfig.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials
    console.log();

    // Add Atlas cluster configuration
    console.log('🔗 Adding Atlas cluster configuration...');
    manager.config.addCluster(atlasConfig.clusterName, {
      uri: atlasConfig.uri,
      environment: atlasConfig.environment,
      databases: [atlasConfig.database],
      description: 'MongoDB Atlas Production Cluster',
      options: {
        retryWrites: true,
        w: 'majority',
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 30000
      }
    });
    await manager.config.save();
    console.log('✅ Atlas cluster configuration saved\n');

    // Connect to Atlas cluster
    const clusterManager = manager.getClusterManager();
    
    try {
      console.log('🌐 Connecting to MongoDB Atlas...');
      await clusterManager.addCluster(atlasConfig.clusterName, {
        uri: atlasConfig.uri,
        environment: atlasConfig.environment,
        databases: [atlasConfig.database],
        options: {
          retryWrites: true,
          w: 'majority'
        }
      });
      console.log('✅ Successfully connected to Atlas cluster\n');

      // Get Atlas cluster information
      console.log('ℹ️ Getting Atlas cluster information...');
      const clusterInfo = await clusterManager.getClusterInfo(atlasConfig.clusterName);
      console.log(`   MongoDB Version: ${clusterInfo.buildInfo?.version || 'Unknown'}`);
      console.log(`   Server Type: Atlas Cloud`);
      console.log(`   Connection Status: Connected`);
      
      // Display Atlas-specific information
      if (clusterInfo.atlasInfo) {
        console.log(`   Atlas Tier: ${clusterInfo.atlasInfo.tier}`);
        console.log(`   Region: ${clusterInfo.atlasInfo.region}`);
      }
      console.log();

      // Database operations on Atlas
      const dbOps = manager.getDatabaseOperations();
      
      console.log('📁 Listing Atlas databases...');
      const databases = await dbOps.listDatabases(atlasConfig.clusterName);
      databases.forEach(db => {
        if (db.name !== 'admin' && db.name !== 'local') {
          const sizeStr = db.sizeOnDisk ? `${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB` : 'Empty';
          console.log(`   - ${db.name}: ${sizeStr}`);
        }
      });
      console.log();

      // Work with your specific database
      if (databases.some(db => db.name === atlasConfig.database)) {
        console.log(`📄 Working with database: ${atlasConfig.database}`);
        
        // List collections
        const collections = await dbOps.listCollections(atlasConfig.clusterName, atlasConfig.database);
        console.log('   Collections:');
        if (collections.length > 0) {
          collections.forEach(collection => {
            console.log(`     - ${collection.name}: ${collection.count || 0} documents`);
          });
        } else {
          console.log('     No collections found');
        }
        console.log();

        // Example: Query a collection (modify collection name as needed)
        if (collections.length > 0) {
          const collectionName = collections[0].name;
          console.log(`🔍 Querying collection: ${collectionName}`);
          
          try {
            const queryResult = await dbOps.query(atlasConfig.clusterName, atlasConfig.database, collectionName, {
              filter: {},
              limit: 5,
              sort: { _id: -1 } // Latest documents first
            });
            
            console.log(`   Found ${queryResult.totalCount} total documents`);
            if (queryResult.documents.length > 0) {
              console.log('   Sample documents:');
              queryResult.documents.forEach((doc, index) => {
                console.log(`     ${index + 1}. ${JSON.stringify(doc, null, 2).substring(0, 100)}...`);
              });
            }
          } catch (queryError) {
            console.log(`   ⚠️ Could not query collection: ${queryError.message}`);
          }
          console.log();
        }

        // Create Atlas backup
        console.log('💾 Creating Atlas backup...');
        const backupManager = manager.getBackupManager();
        try {
          const backup = await backupManager.createBackup(atlasConfig.clusterName, atlasConfig.database, {
            compress: true
          });
          console.log(`✅ Atlas backup created: ${backup.name}`);
          console.log(`   Size: ${(backup.size / 1024).toFixed(2)} KB`);
          console.log(`   Collections: ${backup.collections}`);
          console.log(`   Path: ${backup.path}`);
          console.log();
        } catch (backupError) {
          console.log(`   ⚠️ Backup creation failed: ${backupError.message}`);
        }

        // Schedule automated Atlas backups
        console.log('⏰ Setting up automated Atlas backups...');
        try {
          const scheduleId = await backupManager.scheduleBackup(
            atlasConfig.clusterName,
            atlasConfig.database,
            '0 2 * * *', // Daily at 2 AM
            { 
              compress: true,
              retention: 30 // Keep for 30 days
            }
          );
          console.log(`✅ Automated backup scheduled: ${scheduleId}`);
          console.log('   Schedule: Daily at 2:00 AM UTC');
          console.log('   Compression: Enabled');
          console.log('   Retention: 30 days');
          console.log();
        } catch (scheduleError) {
          console.log(`   ⚠️ Backup scheduling failed: ${scheduleError.message}`);
        }
      }

      // Atlas monitoring setup
      console.log('📈 Setting up Atlas monitoring...');
      const monitoring = manager.getMonitoring();
      
      // Configure alerts for Atlas-specific metrics
      await monitoring.setAlert(atlasConfig.clusterName, {
        metric: 'connections',
        threshold: 80,
        condition: 'above',
        notification: {
          email: 'admin@yourcompany.com',
          webhook: 'https://your-webhook-url.com/alerts'
        }
      });
      
      await monitoring.setAlert(atlasConfig.clusterName, {
        metric: 'memory',
        threshold: 85,
        condition: 'above'
      });

      console.log('✅ Atlas monitoring alerts configured');
      console.log('   - Connection count alert: > 80');
      console.log('   - Memory usage alert: > 85%');
      console.log();

      // Start monitoring
      await monitoring.startMonitoring(30000); // Check every 30 seconds for Atlas
      console.log('✅ Atlas monitoring started');
      console.log('   Interval: 30 seconds');
      console.log('   Collecting metrics for performance analysis...');
      console.log();

      // Wait for some metrics
      console.log('⏱️ Collecting initial metrics (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 32000));
      
      // Get Atlas metrics
      const metrics = await monitoring.getMetrics(atlasConfig.clusterName, '1m');
      if (metrics.dataPoints > 0) {
        console.log('📊 Current Atlas Metrics:');
        console.log(`   Data Points Collected: ${metrics.dataPoints}`);
        console.log(`   Connections: ${metrics.summary?.connections?.current || 'N/A'}`);
        console.log(`   Memory Usage: ${metrics.summary?.memory?.current || 'N/A'} MB`);
        console.log(`   Operations/sec: ${metrics.summary?.operations?.current || 'N/A'}`);
        
        if (metrics.summary?.performance) {
          console.log(`   Avg Query Time: ${metrics.summary.performance.avgQueryTime || 'N/A'} ms`);
        }
      }
      console.log();

      monitoring.stopMonitoring();

      // Security recommendations for Atlas
      console.log('🔒 Atlas Security Recommendations:');
      console.log('   ✅ Use MongoDB Atlas network access controls');
      console.log('   ✅ Enable database authentication');
      console.log('   ✅ Use connection string with retryWrites=true');
      console.log('   ✅ Implement application-level rate limiting');
      console.log('   ✅ Monitor connection pools and slow queries');
      console.log('   ✅ Enable Atlas backup if not using custom backups');
      console.log();

    } catch (connectionError) {
      console.log('❌ Failed to connect to MongoDB Atlas');
      console.log('   Please check the following:');
      console.log('   1. Connection string is correct');
      console.log('   2. Username and password are valid');
      console.log('   3. IP address is whitelisted in Atlas Network Access');
      console.log('   4. Cluster is running and accessible');
      console.log('   5. Database user has required permissions');
      console.log(`   Error details: ${connectionError.message}`);
      console.log();
      
      // Provide troubleshooting steps
      console.log('🛠️ Troubleshooting Steps:');
      console.log('   1. Go to https://cloud.mongodb.com');
      console.log('   2. Navigate to Network Access and add your IP');
      console.log('   3. Check Database Access for user permissions');
      console.log('   4. Verify cluster is not paused');
      console.log('   5. Test connection string in MongoDB Compass');
      console.log();
    }

  } catch (error) {
    console.error('❌ Error during Atlas connection example:', error.message);
    console.log('\n💡 Setup Help:');
    console.log('   Set environment variables:');
    console.log('   export MONGODB_ATLAS_URI="mongodb+srv://user:pass@cluster.mongodb.net/"');
    console.log('   export MONGODB_ATLAS_DB="your-database-name"');
    console.log();
    console.log('   Or modify the atlasConfig object in this file with your Atlas details.');
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    await manager.shutdown();
    console.log('✅ Atlas connection example completed!');
  }
}

// Run the example
if (require.main === module) {
  atlasConnectionExample().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = atlasConnectionExample;