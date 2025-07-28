#!/usr/bin/env node

/**
 * Advanced Monitoring Example
 * 
 * This example demonstrates advanced monitoring capabilities including:
 * - Real-time metrics collection
 * - Custom alerts
 * - Performance analysis
 * - Slow query detection
 */

const MongoDBManager = require('../lib');
const fs = require('fs').promises;
const path = require('path');

class AdvancedMonitoringExample {
  constructor() {
    this.manager = null;
    this.monitoring = null;
    this.metricsLog = [];
  }

  async run() {
    console.log('📈 Advanced MongoDB Monitoring Example\n');

    this.manager = new MongoDBManager({
      logLevel: 'info'
    });

    try {
      await this.manager.initialize();
      this.monitoring = this.manager.getMonitoring();

      // Setup monitoring event handlers
      this.setupMonitoringEvents();

      // Add example cluster (modify as needed)
      await this.addExampleCluster();

      // Start comprehensive monitoring
      await this.startComprehensiveMonitoring();

      // Simulate some load and monitor
      await this.simulateWorkloadAndMonitor();

      // Analyze collected metrics
      await this.analyzeMetrics();

      // Generate monitoring report
      await this.generateReport();

    } catch (error) {
      console.error('❌ Monitoring example failed:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  setupMonitoringEvents() {
    console.log('🔧 Setting up monitoring event handlers...');

    // Handle metrics collection
    this.monitoring.on('metricsCollected', (data) => {
      console.log(`📊 Metrics collected for ${data.cluster}`);
      this.metricsLog.push({
        timestamp: new Date(),
        cluster: data.cluster,
        metrics: data.metrics
      });
    });

    // Handle alerts
    this.monitoring.on('alert', (alert) => {
      console.log(`🚨 ALERT: ${alert.message}`);
      console.log(`   Cluster: ${alert.cluster}`);
      console.log(`   Severity: ${alert.severity}`);
      console.log(`   Time: ${new Date(alert.timestamp).toLocaleString()}`);
      
      // In a real scenario, you might send notifications here
      this.handleAlert(alert);
    });

    console.log('✅ Event handlers configured\n');
  }

  async addExampleCluster() {
    console.log('🔗 Configuring example cluster...');
    
    try {
      // Try to connect to local MongoDB
      await this.manager.getClusterManager().addCluster('monitoring-example', {
        uri: 'mongodb://localhost:27017',
        environment: 'development',
        databases: ['monitoring-test']
      });
      console.log('✅ Connected to local MongoDB instance\n');
    } catch (error) {
      console.log('⚠️ Could not connect to local MongoDB');
      console.log('   Please ensure MongoDB is running on localhost:27017');
      throw error;
    }
  }

  async startComprehensiveMonitoring() {
    console.log('📈 Starting comprehensive monitoring...');
    
    // Start monitoring with frequent collection for demo
    await this.monitoring.startMonitoring(5000); // Every 5 seconds
    
    console.log('✅ Monitoring active - collecting metrics every 5 seconds\n');
  }

  async simulateWorkloadAndMonitor() {
    console.log('⚡ Simulating workload and monitoring for 30 seconds...');
    
    const dbOps = this.manager.getDatabaseOperations();
    
    // Create test data to generate some activity
    try {
      await dbOps.createCollection('monitoring-example', 'monitoring-test', 'activity_log');
      
      // Generate some database activity
      const startTime = Date.now();
      const duration = 30000; // 30 seconds
      let operationCount = 0;

      while (Date.now() - startTime < duration) {
        try {
          // Insert some test documents
          const testDocs = Array.from({ length: 10 }, (_, i) => ({
            timestamp: new Date(),
            operation: 'test_operation',
            sequence: operationCount + i,
            data: {
              value: Math.random() * 1000,
              category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)]
            }
          }));

          await dbOps.insertMany('monitoring-example', 'monitoring-test', 'activity_log', testDocs);
          operationCount += testDocs.length;

          // Perform some queries
          await dbOps.query('monitoring-example', 'monitoring-test', 'activity_log', {
            filter: { 'data.category': 'A' },
            limit: 5
          });

          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        } catch (error) {
          console.log('   Error during workload simulation:', error.message);
        }
      }

      console.log(`✅ Workload simulation complete - ${operationCount} operations performed\n`);
    } catch (error) {
      console.log('⚠️ Could not simulate workload:', error.message);
    }
  }

  async analyzeMetrics() {
    console.log('📊 Analyzing collected metrics...\n');

    if (this.metricsLog.length === 0) {
      console.log('⚠️ No metrics collected');
      return;
    }

    // Get latest metrics
    const latest = this.metricsLog[this.metricsLog.length - 1];
    const metrics = latest.metrics;

    console.log('Current System Status:');
    console.log('─'.repeat(50));
    
    if (metrics.server) {
      console.log(`MongoDB Version: ${metrics.server.version || 'Unknown'}`);
      console.log(`Uptime: ${Math.floor((metrics.server.uptime || 0) / 3600)} hours`);
      console.log(`Connections: ${metrics.server.connections?.current || 'N/A'}/${metrics.server.connections?.available || 'N/A'}`);
      console.log(`Memory Usage: ${metrics.server.memory?.resident || 'N/A'} MB`);
    }

    if (metrics.operations) {
      console.log('\nOperation Counters:');
      console.log(`  Inserts: ${metrics.operations.insert || 0}`);
      console.log(`  Queries: ${metrics.operations.query || 0}`);
      console.log(`  Updates: ${metrics.operations.update || 0}`);
      console.log(`  Deletes: ${metrics.operations.delete || 0}`);
      console.log(`  Commands: ${metrics.operations.command || 0}`);
    }

    if (metrics.storage) {
      console.log('\nStorage Information:');
      console.log(`  Databases: ${metrics.storage.databases || 0}`);
      console.log(`  Total Documents: ${(metrics.storage.totalDocuments || 0).toLocaleString()}`);
      console.log(`  Total Size: ${((metrics.storage.totalSize || 0) / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Indexes: ${metrics.storage.indexes || 0}`);
    }

    // Analyze trends if we have multiple data points
    if (this.metricsLog.length > 1) {
      console.log('\nTrend Analysis:');
      console.log('─'.repeat(50));
      
      const first = this.metricsLog[0];
      const trend = this.calculateTrends(first.metrics, metrics);
      
      if (trend.operations) {
        console.log(`Operations since start: +${trend.operations.total} total ops`);
        console.log(`  Inserts: +${trend.operations.inserts}`);
        console.log(`  Queries: +${trend.operations.queries}`);
      }
      
      if (trend.connections) {
        console.log(`Connection change: ${trend.connections > 0 ? '+' : ''}${trend.connections}`);
      }
    }

    console.log();
  }

  calculateTrends(firstMetrics, latestMetrics) {
    const trends = {};

    if (firstMetrics.operations && latestMetrics.operations) {
      const opsFirst = firstMetrics.operations;
      const opsLatest = latestMetrics.operations;
      
      trends.operations = {
        inserts: (opsLatest.insert || 0) - (opsFirst.insert || 0),
        queries: (opsLatest.query || 0) - (opsFirst.query || 0),
        updates: (opsLatest.update || 0) - (opsFirst.update || 0),
        deletes: (opsLatest.delete || 0) - (opsFirst.delete || 0),
        total: ((opsLatest.insert || 0) + (opsLatest.query || 0) + (opsLatest.update || 0) + (opsLatest.delete || 0)) -
               ((opsFirst.insert || 0) + (opsFirst.query || 0) + (opsFirst.update || 0) + (opsFirst.delete || 0))
      };
    }

    if (firstMetrics.server?.connections && latestMetrics.server?.connections) {
      trends.connections = (latestMetrics.server.connections.current || 0) - (firstMetrics.server.connections.current || 0);
    }

    return trends;
  }

  async generateReport() {
    console.log('📄 Generating monitoring report...');

    const report = {
      generatedAt: new Date(),
      duration: this.metricsLog.length > 0 ? 
        new Date(this.metricsLog[this.metricsLog.length - 1].timestamp) - new Date(this.metricsLog[0].timestamp) : 0,
      dataPoints: this.metricsLog.length,
      clusters: ['monitoring-example'],
      summary: this.generateSummary(),
      alerts: this.monitoring.getAlerts(),
      recommendations: this.generateRecommendations()
    };

    // Save report to file
    const reportPath = path.join(process.cwd(), 'logs', 'monitoring-report.json');
    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`✅ Report saved to: ${reportPath}`);
    } catch (error) {
      console.log(`⚠️ Could not save report: ${error.message}`);
    }

    // Display summary
    console.log('\nMonitoring Summary:');
    console.log('─'.repeat(50));
    console.log(`Monitoring Duration: ${Math.floor(report.duration / 1000)} seconds`);
    console.log(`Data Points Collected: ${report.dataPoints}`);
    console.log(`Active Alerts: ${report.alerts.filter(a => !a.acknowledged).length}`);
    console.log(`Total Alerts: ${report.alerts.length}`);

    if (report.recommendations.length > 0) {
      console.log('\nRecommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }

    console.log();
  }

  generateSummary() {
    if (this.metricsLog.length === 0) return {};

    const latest = this.metricsLog[this.metricsLog.length - 1].metrics;
    
    return {
      lastUpdate: new Date(),
      status: 'healthy', // You could implement logic to determine this
      currentConnections: latest.server?.connections?.current || 0,
      availableConnections: latest.server?.connections?.available || 0,
      memoryUsage: latest.server?.memory?.resident || 0,
      totalDatabases: latest.storage?.databases || 0,
      totalDocuments: latest.storage?.totalDocuments || 0
    };
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.metricsLog.length === 0) {
      return ['Insufficient data for recommendations'];
    }

    const latest = this.metricsLog[this.metricsLog.length - 1].metrics;
    
    // Connection analysis
    if (latest.server?.connections) {
      const connectionUsage = latest.server.connections.current / latest.server.connections.available;
      if (connectionUsage > 0.8) {
        recommendations.push('High connection usage detected - consider increasing maxPoolSize');
      }
    }

    // Memory analysis
    if (latest.server?.memory?.resident > 4096) {
      recommendations.push('High memory usage detected - monitor for memory leaks');
    }

    // Index recommendations (would require more analysis in real scenario)
    if (latest.operations?.query > latest.operations?.insert * 5) {
      recommendations.push('High query-to-insert ratio - ensure proper indexing');
    }

    if (recommendations.length === 0) {
      recommendations.push('System appears to be running optimally');
    }

    return recommendations;
  }

  handleAlert(alert) {
    // In a real implementation, you might:
    // - Send email notifications
    // - Post to Slack
    // - Create tickets in JIRA
    // - Send SMS for critical alerts
    // - Log to external monitoring systems

    console.log(`   📧 Alert notification would be sent here`);
    
    // Auto-acknowledge certain types of alerts after logging
    if (alert.severity === 'info') {
      setTimeout(() => {
        this.monitoring.acknowledgeAlert(alert.id);
        console.log(`   ✅ Auto-acknowledged alert: ${alert.id}`);
      }, 5000);
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up monitoring example...');
    
    if (this.monitoring) {
      this.monitoring.stopMonitoring();
    }
    
    if (this.manager) {
      await this.manager.shutdown();
    }
    
    console.log('✅ Monitoring example completed!\n');
  }
}

// Run the example
if (require.main === module) {
  const example = new AdvancedMonitoringExample();
  example.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = AdvancedMonitoringExample;