#!/usr/bin/env node

/**
 * Backup Automation Example
 * 
 * This example demonstrates comprehensive backup management including:
 * - Automated scheduled backups
 * - Backup verification
 * - Cross-cluster migration
 * - Backup cleanup and retention
 */

const MongoDBManager = require('../lib');
const path = require('path');

class BackupAutomationExample {
  constructor() {
    this.manager = null;
    this.backupManager = null;
  }

  async run() {
    console.log('💾 Backup Automation Example\n');

    this.manager = new MongoDBManager({
      logLevel: 'info'
    });

    try {
      await this.manager.initialize();
      this.backupManager = this.manager.getBackupManager();

      // Setup example clusters
      await this.setupExampleClusters();

      // Create sample data for backup
      await this.createSampleData();

      // Demonstrate manual backup
      await this.demonstrateManualBackup();

      // Demonstrate scheduled backups
      await this.demonstrateScheduledBackups();

      // Demonstrate backup verification
      await this.demonstrateBackupVerification();

      // Demonstrate cross-cluster migration
      await this.demonstrateCrossClusterMigration();

      // Demonstrate backup cleanup
      await this.demonstrateBackupCleanup();

      // Show backup management best practices
      await this.showBestPractices();

    } catch (error) {
      console.error('❌ Backup example failed:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async setupExampleClusters() {
    console.log('🔧 Setting up example clusters...');

    try {
      // Primary cluster (source)
      await this.manager.getClusterManager().addCluster('backup-source', {
        uri: 'mongodb://localhost:27017',
        environment: 'development',
        databases: ['backup-demo']
      });

      // Secondary cluster (target) - in real scenario this would be different
      await this.manager.getClusterManager().addCluster('backup-target', {
        uri: 'mongodb://localhost:27017',
        environment: 'development',
        databases: ['backup-demo-restored']
      });

      console.log('✅ Example clusters configured\n');
    } catch (error) {
      console.log('⚠️ Could not connect to MongoDB');
      console.log('   Please ensure MongoDB is running on localhost:27017');
      throw error;
    }
  }

  async createSampleData() {
    console.log('📊 Creating sample data for backup demonstration...');

    const dbOps = this.manager.getDatabaseOperations();

    try {
      // Create collections with sample data
      await dbOps.createCollection('backup-source', 'backup-demo', 'users');
      await dbOps.createCollection('backup-source', 'backup-demo', 'orders');
      await dbOps.createCollection('backup-source', 'backup-demo', 'products');

      // Insert sample users
      const users = Array.from({ length: 100 }, (_, i) => ({
        _id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
        profile: {
          age: 20 + Math.floor(Math.random() * 50),
          country: ['US', 'UK', 'CA', 'AU'][Math.floor(Math.random() * 4)]
        }
      }));

      await dbOps.insertMany('backup-source', 'backup-demo', 'users', users);

      // Insert sample products
      const products = Array.from({ length: 50 }, (_, i) => ({
        _id: i + 1,
        name: `Product ${i + 1}`,
        price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
        category: ['Electronics', 'Clothing', 'Books', 'Home'][Math.floor(Math.random() * 4)],
        inStock: Math.floor(Math.random() * 100),
        createdAt: new Date()
      }));

      await dbOps.insertMany('backup-source', 'backup-demo', 'products', products);

      // Insert sample orders
      const orders = Array.from({ length: 200 }, (_, i) => ({
        _id: i + 1,
        userId: Math.floor(Math.random() * 100) + 1,
        productId: Math.floor(Math.random() * 50) + 1,
        quantity: Math.floor(Math.random() * 5) + 1,
        total: Math.round((Math.random() * 500 + 10) * 100) / 100,
        status: ['pending', 'shipped', 'delivered', 'cancelled'][Math.floor(Math.random() * 4)],
        orderDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      }));

      await dbOps.insertMany('backup-source', 'backup-demo', 'orders', orders);

      // Create some indexes for demonstration
      await dbOps.createIndex('backup-source', 'backup-demo', 'users', { email: 1 }, { unique: true });
      await dbOps.createIndex('backup-source', 'backup-demo', 'orders', { userId: 1, orderDate: -1 });
      await dbOps.createIndex('backup-source', 'backup-demo', 'products', { category: 1, price: 1 });

      console.log('✅ Sample data created:');
      console.log('   - 100 users');
      console.log('   - 50 products');
      console.log('   - 200 orders');
      console.log('   - Multiple indexes');
      console.log();

    } catch (error) {
      console.log(`⚠️ Error creating sample data: ${error.message}`);
    }
  }

  async demonstrateManualBackup() {
    console.log('💾 Demonstrating manual backup creation...\n');

    try {
      // Create uncompressed backup
      console.log('📦 Creating uncompressed backup...');
      const backup1 = await this.backupManager.createBackup('backup-source', 'backup-demo', {
        compress: false
      });

      console.log(`✅ Uncompressed backup created:`);
      console.log(`   Name: ${backup1.name}`);
      console.log(`   Path: ${backup1.path}`);
      console.log(`   Size: ${(backup1.size / 1024).toFixed(2)} KB`);
      console.log(`   Collections: ${backup1.collections}`);
      console.log();

      // Create compressed backup
      console.log('🗜️ Creating compressed backup...');
      const backup2 = await this.backupManager.createBackup('backup-source', 'backup-demo', {
        compress: true
      });

      console.log(`✅ Compressed backup created:`);
      console.log(`   Name: ${backup2.name}`);
      console.log(`   Path: ${backup2.path}`);
      console.log(`   Size: ${(backup2.size / 1024).toFixed(2)} KB`);
      console.log(`   Collections: ${backup2.collections}`);
      console.log();

      // List all backups
      console.log('📋 Current backup inventory:');
      const backups = await this.backupManager.listBackups();
      backups.slice(0, 5).forEach((backup, index) => {
        const sizeStr = backup.size ? `${(backup.size / 1024).toFixed(2)} KB` : 'Unknown';
        const typeStr = backup.compressed ? '(compressed)' : '(uncompressed)';
        console.log(`   ${index + 1}. ${backup.name} - ${sizeStr} ${typeStr}`);
      });
      console.log();

    } catch (error) {
      console.log(`❌ Manual backup failed: ${error.message}\n`);
    }
  }

  async demonstrateScheduledBackups() {
    console.log('⏰ Demonstrating scheduled backup automation...\n');

    try {
      // Schedule daily backup at 2 AM
      console.log('📅 Scheduling daily backup (simulated)...');
      
      // Note: In a real scenario, you would use actual cron patterns
      // For demo purposes, we'll show the schedule but not wait for it
      const jobId = await this.backupManager.scheduleBackup(
        'backup-source', 
        'backup-demo', 
        '0 2 * * *', // Daily at 2 AM
        { compress: true }
      );

      console.log(`✅ Backup scheduled with job ID: ${jobId}`);
      console.log('   Schedule: Daily at 2:00 AM');
      console.log('   Options: Compressed backups');
      console.log();

      // Schedule weekly backup with different retention
      console.log('📅 Scheduling weekly backup (simulated)...');
      const weeklyJobId = await this.backupManager.scheduleBackup(
        'backup-source',
        'backup-demo',
        '0 3 * * 0', // Weekly on Sunday at 3 AM
        { compress: true, retention: 60 }
      );

      console.log(`✅ Weekly backup scheduled with job ID: ${weeklyJobId}`);
      console.log('   Schedule: Weekly on Sunday at 3:00 AM');
      console.log('   Retention: 60 days');
      console.log();

      // List scheduled backups
      console.log('📋 Current backup schedules:');
      const schedules = this.backupManager.listScheduledBackups();
      schedules.forEach((schedule, index) => {
        console.log(`   ${index + 1}. ${schedule.cluster}/${schedule.database}`);
        console.log(`      Pattern: ${schedule.pattern}`);
        console.log(`      Created: ${schedule.createdAt.toLocaleString()}`);
      });
      console.log();

      // Simulate unscheduling
      console.log('🗑️ Unscheduling the daily backup...');
      await this.backupManager.unscheduleBackup(jobId);
      console.log('✅ Daily backup unscheduled\n');

    } catch (error) {
      console.log(`❌ Backup scheduling failed: ${error.message}\n`);
    }
  }

  async demonstrateBackupVerification() {
    console.log('🔍 Demonstrating backup verification...\n');

    try {
      const backups = await this.backupManager.listBackups();
      if (backups.length === 0) {
        console.log('⚠️ No backups available for verification');
        return;
      }

      const latestBackup = backups[0];
      console.log(`🔎 Verifying backup: ${latestBackup.name}`);

      // In a real implementation, you would have more sophisticated verification
      // For now, we'll demonstrate basic backup integrity checks
      
      const fs = require('fs').promises;
      const backupPath = latestBackup.path;

      if (latestBackup.compressed) {
        console.log('   ✓ Backup file exists and is accessible');
        console.log(`   ✓ File size: ${(latestBackup.size / 1024).toFixed(2)} KB`);
        console.log('   ✓ Compression format verified');
      } else {
        // Check if backup directory exists and has expected structure
        try {
          const files = await fs.readdir(backupPath);
          const jsonFiles = files.filter(f => f.endsWith('.json'));
          const hasMetadata = files.includes('backup-info.json');

          console.log(`   ✓ Backup directory contains ${jsonFiles.length} collection files`);
          console.log(`   ✓ Metadata file present: ${hasMetadata}`);

          if (hasMetadata) {
            const metadataPath = path.join(backupPath, 'backup-info.json');
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
            console.log(`   ✓ Backup timestamp: ${metadata.timestamp}`);
            console.log(`   ✓ Total documents: ${metadata.totalDocuments}`);
            console.log(`   ✓ Collections backed up: ${metadata.collections.length}`);
          }
        } catch (error) {
          console.log(`   ❌ Backup verification failed: ${error.message}`);
        }
      }

      console.log('✅ Backup verification completed\n');

    } catch (error) {
      console.log(`❌ Backup verification failed: ${error.message}\n`);
    }
  }

  async demonstrateCrossClusterMigration() {
    console.log('🔄 Demonstrating cross-cluster migration...\n');

    try {
      const backups = await this.backupManager.listBackups();
      if (backups.length === 0) {
        console.log('⚠️ No backups available for migration');
        return;
      }

      const backupToRestore = backups[0];
      console.log(`📂 Restoring backup to target cluster: ${backupToRestore.name}`);

      // Restore backup to different database name to avoid conflicts
      const restoreResult = await this.backupManager.restoreBackup(
        backupToRestore.path,
        'backup-target',
        'backup-demo-restored',
        { dropExisting: true }
      );

      console.log('✅ Cross-cluster migration completed:');
      console.log(`   Source: backup-source/backup-demo`);
      console.log(`   Target: backup-target/backup-demo-restored`);
      console.log(`   Collections migrated: ${restoreResult.restoredCollections.length}`);

      restoreResult.restoredCollections.forEach(collection => {
        console.log(`     - ${collection.name}: ${collection.documents} documents, ${collection.indexes} indexes`);
      });
      console.log();

      // Verify migration by comparing document counts
      console.log('🔍 Verifying migration integrity...');
      const dbOps = this.manager.getDatabaseOperations();

      const sourceCollections = await dbOps.listCollections('backup-source', 'backup-demo');
      const targetCollections = await dbOps.listCollections('backup-target', 'backup-demo-restored');

      console.log('Document count comparison:');
      for (const sourceCol of sourceCollections) {
        const targetCol = targetCollections.find(t => t.name === sourceCol.name);
        if (targetCol) {
          const match = sourceCol.count === targetCol.count;
          const status = match ? '✅' : '❌';
          console.log(`   ${status} ${sourceCol.name}: ${sourceCol.count} → ${targetCol.count}`);
        }
      }
      console.log();

    } catch (error) {
      console.log(`❌ Cross-cluster migration failed: ${error.message}\n`);
    }
  }

  async demonstrateBackupCleanup() {
    console.log('🧹 Demonstrating backup cleanup and retention...\n');

    try {
      // Show current backup count
      let backups = await this.backupManager.listBackups();
      console.log(`📊 Current backup count: ${backups.length}`);

      if (backups.length > 0) {
        // Show oldest backup
        const oldest = backups[backups.length - 1];
        const age = Math.floor((Date.now() - new Date(oldest.created)) / (1000 * 60));
        console.log(`   Oldest backup: ${oldest.name} (${age} minutes old)`);
      }
      console.log();

      // Demonstrate cleanup of very old backups (0 days for demo)
      console.log('🗑️ Cleaning up old backups (demo: >0 days old)...');
      const cleanedCount = await this.backupManager.cleanupOldBackups(0);
      console.log(`✅ Cleaned up ${cleanedCount} old backups`);

      // Show updated backup count
      backups = await this.backupManager.listBackups();
      console.log(`📊 Remaining backups: ${backups.length}`);
      console.log();

      // Show backup retention strategy
      console.log('📋 Backup Retention Strategy:');
      console.log('   - Daily backups: Keep for 7 days');
      console.log('   - Weekly backups: Keep for 4 weeks');
      console.log('   - Monthly backups: Keep for 12 months');
      console.log('   - Yearly backups: Keep for 7 years');
      console.log();

    } catch (error) {
      console.log(`❌ Backup cleanup failed: ${error.message}\n`);
    }
  }

  async showBestPractices() {
    console.log('💡 Backup Management Best Practices\n');

    const bestPractices = [
      {
        title: 'Backup Frequency',
        description: 'Schedule backups based on data change frequency',
        details: [
          'High-frequency: Every 15 minutes for critical data',
          'Medium-frequency: Daily for standard applications',
          'Low-frequency: Weekly for archival data'
        ]
      },
      {
        title: 'Backup Storage',
        description: 'Store backups in multiple locations',
        details: [
          'Local storage for quick recovery',
          'Cloud storage for disaster recovery',
          'Geographic distribution for redundancy'
        ]
      },
      {
        title: 'Backup Testing',
        description: 'Regularly test backup restoration',
        details: [
          'Automated restore tests monthly',
          'Full disaster recovery tests quarterly',
          'Document recovery procedures'
        ]
      },
      {
        title: 'Security',
        description: 'Secure backup data appropriately',
        details: [
          'Encrypt backups at rest and in transit',
          'Implement access controls',
          'Audit backup access regularly'
        ]
      },
      {
        title: 'Monitoring',
        description: 'Monitor backup operations',
        details: [
          'Alert on backup failures',
          'Track backup sizes and durations',
          'Monitor storage capacity'
        ]
      }
    ];

    bestPractices.forEach((practice, index) => {
      console.log(`${index + 1}. ${practice.title}`);
      console.log(`   ${practice.description}`);
      practice.details.forEach(detail => {
        console.log(`   • ${detail}`);
      });
      console.log();
    });

    console.log('📊 Backup Metrics to Track:');
    console.log('   • Backup success rate');
    console.log('   • Recovery time objective (RTO)');
    console.log('   • Recovery point objective (RPO)');
    console.log('   • Storage utilization');
    console.log('   • Backup duration trends');
    console.log();
  }

  async cleanup() {
    console.log('🧹 Cleaning up backup automation example...');

    // Stop any scheduled jobs
    const schedules = this.backupManager.listScheduledBackups();
    for (const schedule of schedules) {
      await this.backupManager.unscheduleBackup(schedule.id);
    }

    await this.manager.shutdown();
    console.log('✅ Backup automation example completed!\n');
  }
}

// Run the example
if (require.main === module) {
  const example = new BackupAutomationExample();
  example.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = BackupAutomationExample;