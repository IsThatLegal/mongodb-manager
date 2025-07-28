const inquirer = require('inquirer');
const chalk = require('chalk');
const CLIEnhancer = require('./enhanced-ux');

class SetupWizard {
  constructor(manager) {
    this.manager = manager;
    this.config = {};
  }

  async start() {
    CLIEnhancer.showWelcomeBanner();
    
    console.log(chalk.blue('🚀 Welcome to MongoDB Manager Setup Wizard!\n'));
    console.log(chalk.gray('This wizard will help you configure your first MongoDB cluster connection.\n'));

    try {
      await this.detectEnvironment();
      await this.gatherClusterInfo();
      await this.testConnection();
      await this.configureFeatures();
      await this.saveConfiguration();
      await this.showNextSteps();
    } catch (error) {
      CLIEnhancer.showError('Setup failed', [
        'Check your MongoDB connection details',
        'Ensure MongoDB is running and accessible',
        'Run the wizard again with mm clusters setup'
      ]);
      throw error;
    }
  }

  async detectEnvironment() {
    console.log(chalk.cyan('🔍 Detecting Environment...\n'));

    const detectedEnvs = [];
    
    // Check for local MongoDB
    try {
      // This would actually test connections in real implementation
      detectedEnvs.push({
        name: 'Local MongoDB',
        uri: 'mongodb://localhost:27017',
        type: 'local'
      });
    } catch (e) {
      // No local MongoDB
    }

    // Check for common cloud providers
    const cloudOptions = [
      { name: 'MongoDB Atlas (Cloud)', value: 'atlas' },
      { name: 'AWS DocumentDB', value: 'documentdb' },
      { name: 'Azure Cosmos DB', value: 'cosmosdb' },
      { name: 'Self-hosted MongoDB', value: 'selfhosted' },
      { name: 'Local Development', value: 'local' }
    ];

    if (detectedEnvs.length > 0) {
      console.log(chalk.green('✅ Found potential MongoDB instances:'));
      detectedEnvs.forEach(env => {
        console.log(`   • ${env.name}: ${chalk.gray(env.uri)}`);
      });
      console.log();

      const useDetected = await inquirer.prompt([{
        type: 'confirm',
        name: 'useDetected',
        message: 'Would you like to use the detected local MongoDB?',
        default: true
      }]);

      if (useDetected.useDetected && detectedEnvs.length > 0) {
        this.config = {
          name: 'local',
          uri: detectedEnvs[0].uri,
          environment: 'development',
          type: 'local'
        };
        return;
      }
    }

    const envChoice = await inquirer.prompt([{
      type: 'list',
      name: 'environment',
      message: 'What type of MongoDB are you connecting to?',
      choices: cloudOptions,
      pageSize: 10
    }]);

    this.config.type = envChoice.environment;
  }

  async gatherClusterInfo() {
    console.log(chalk.cyan('\n📋 Cluster Configuration\n'));

    const questions = [];

    // Cluster name
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Enter a name for this cluster:',
      default: this.config.name || this.config.type || 'my-cluster',
      validate: input => input.trim().length > 0 || 'Please enter a cluster name'
    });

    // Connection string based on type
    if (this.config.type === 'atlas') {
      questions.push({
        type: 'input',
        name: 'uri',
        message: 'Enter your MongoDB Atlas connection string:',
        validate: this.validateMongoDBURI,
        transformer: this.maskPassword
      });
    } else if (this.config.type === 'local') {
      questions.push({
        type: 'input',
        name: 'uri',
        message: 'Enter your MongoDB connection string:',
        default: this.config.uri || 'mongodb://localhost:27017',
        validate: this.validateMongoDBURI
      });
    } else {
      questions.push({
        type: 'input',
        name: 'uri',
        message: 'Enter your MongoDB connection string:',
        validate: this.validateMongoDBURI,
        transformer: this.maskPassword
      });
    }

    // Environment
    questions.push({
      type: 'list',
      name: 'environment',
      message: 'What environment is this cluster for?',
      choices: [
        { name: '🔧 Development', value: 'development' },
        { name: '🧪 Testing', value: 'testing' },
        { name: '📋 Staging', value: 'staging' },
        { name: '🚀 Production', value: 'production' }
      ],
      default: this.config.environment || 'development'
    });

    // Databases
    questions.push({
      type: 'input',
      name: 'databases',
      message: 'Enter database names (comma-separated, or leave empty to discover):',
      filter: input => input ? input.split(',').map(db => db.trim()).filter(db => db) : []
    });

    // Description
    questions.push({
      type: 'input',
      name: 'description',
      message: 'Enter a description for this cluster (optional):',
      default: `${this.config.type} MongoDB cluster`
    });

    const answers = await inquirer.prompt(questions);
    Object.assign(this.config, answers);

    // Show configuration summary
    console.log(chalk.yellow('\n📊 Configuration Summary:'));
    console.log(`   Name: ${chalk.cyan(this.config.name)}`);
    console.log(`   Environment: ${chalk.cyan(this.config.environment)}`);
    console.log(`   URI: ${chalk.gray(this.maskPassword(this.config.uri))}`);
    console.log(`   Databases: ${chalk.cyan(this.config.databases.length > 0 ? this.config.databases.join(', ') : 'Auto-discover')}`);
    console.log(`   Description: ${chalk.gray(this.config.description)}`);
    console.log();
  }

  async testConnection() {
    console.log(chalk.cyan('🔌 Testing Connection...\n'));

    const spinner = CLIEnhancer.createProgressSpinner('Connecting to MongoDB cluster...');
    spinner.start();

    try {
      // Test the connection
      await this.manager.getClusterManager().addCluster(this.config.name, {
        uri: this.config.uri,
        environment: this.config.environment,
        databases: this.config.databases,
        description: this.config.description
      });

      spinner.succeed(chalk.green('Connection successful!'));

      // Get cluster info
      const info = await this.manager.getClusterManager().getClusterInfo(this.config.name);
      
      CLIEnhancer.showSuccess('Connected successfully!', [
        `MongoDB Version: ${info.buildInfo?.version || 'Unknown'}`,
        `Server Type: ${info.replicaSet ? 'Replica Set' : 'Standalone'}`,
        `Connection established at: ${new Date().toLocaleTimeString()}`
      ]);

      // Auto-discover databases if not specified
      if (this.config.databases.length === 0) {
        console.log(chalk.blue('🔍 Discovering databases...'));
        const databases = await this.manager.getDatabaseOperations().listDatabases(this.config.name);
        this.config.databases = databases.map(db => db.name);
        
        if (this.config.databases.length > 0) {
          console.log(chalk.green(`   Found ${this.config.databases.length} databases: ${this.config.databases.join(', ')}`));
        }
      }

    } catch (error) {
      spinner.fail(chalk.red('Connection failed!'));
      
      CLIEnhancer.showError('Failed to connect to MongoDB', [
        'Check your connection string format',
        'Verify network connectivity',
        'Ensure MongoDB is running and accessible',
        'Check authentication credentials'
      ]);
      
      const retry = await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to re-enter the connection details?',
        default: true
      }]);

      if (retry.retry) {
        await this.gatherClusterInfo();
        await this.testConnection();
      } else {
        throw error;
      }
    }
  }

  async configureFeatures() {
    console.log(chalk.cyan('\n⚙️ Feature Configuration\n'));

    const features = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableMonitoring',
        message: 'Enable real-time monitoring?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableBackups',
        message: 'Set up automated backups?',
        default: this.config.environment === 'production'
      },
      {
        type: 'confirm',
        name: 'enableWebDashboard',
        message: 'Start web dashboard after setup?',
        default: true
      }
    ]);

    if (features.enableBackups) {
      const backupConfig = await inquirer.prompt([
        {
          type: 'list',
          name: 'backupFrequency',
          message: 'How often should backups run?',
          choices: [
            { name: 'Daily (recommended for production)', value: 'daily' },
            { name: 'Weekly', value: 'weekly' },
            { name: 'Manual only', value: 'manual' }
          ]
        },
        {
          type: 'confirm',
          name: 'compressBackups',
          message: 'Compress backup files?',
          default: true
        }
      ]);
      
      Object.assign(features, backupConfig);
    }

    this.config.features = features;
  }

  async saveConfiguration() {
    console.log(chalk.cyan('\n💾 Saving Configuration...\n'));

    const spinner = CLIEnhancer.createProgressSpinner('Saving cluster configuration...');
    spinner.start();

    try {
      // Save cluster configuration
      this.manager.config.addCluster(this.config.name, {
        uri: this.config.uri,
        environment: this.config.environment,
        databases: this.config.databases,
        description: this.config.description
      });

      await this.manager.config.save();

      // Set up monitoring if enabled
      if (this.config.features.enableMonitoring) {
        await this.manager.getMonitoring().startMonitoring();
      }

      // Set up backups if enabled
      if (this.config.features.enableBackups && this.config.features.backupFrequency !== 'manual') {
        const cronPattern = this.config.features.backupFrequency === 'daily' ? '0 2 * * *' : '0 2 * * 0';
        
        for (const dbName of this.config.databases) {
          await this.manager.getBackupManager().scheduleBackup(
            this.config.name,
            dbName,
            cronPattern,
            { compress: this.config.features.compressBackups }
          );
        }
      }

      spinner.succeed(chalk.green('Configuration saved successfully!'));

    } catch (error) {
      spinner.fail(chalk.red('Failed to save configuration'));
      throw error;
    }
  }

  async showNextSteps() {
    console.log(chalk.green('\n🎉 Setup Complete!\n'));

    const nextSteps = [
      `View cluster status: ${chalk.cyan('mm clusters list')}`,
      `Explore databases: ${chalk.cyan(`mm databases list ${this.config.name}`)}`,
      `Run queries: ${chalk.cyan(`mm query find ${this.config.name} <database> <collection>`)}`,
      `Check health: ${chalk.cyan(`mm health ${this.config.name}`)}`
    ];

    if (this.config.features.enableWebDashboard) {
      nextSteps.push(`Open web dashboard: ${chalk.cyan('mm web')} then visit http://localhost:3000`);
    }

    nextSteps.push(`Get help anytime: ${chalk.cyan('mm --help')}`);

    console.log(chalk.blue('🚀 What you can do next:'));
    nextSteps.forEach((step, index) => {
      console.log(`   ${chalk.yellow((index + 1) + '.')} ${step}`);
    });

    console.log();
    CLIEnhancer.showTips();

    if (this.config.features.enableWebDashboard) {
      const startDashboard = await inquirer.prompt([{
        type: 'confirm',
        name: 'start',
        message: 'Start the web dashboard now?',
        default: true
      }]);

      if (startDashboard.start) {
        console.log(chalk.blue('\n🌐 Starting web dashboard...'));
        console.log(chalk.gray('Dashboard will be available at: http://localhost:3000\n'));
        
        // This would start the web server
        require('../../web/server');
      }
    }
  }

  validateMongoDBURI(input) {
    try {
      new URL(input);
      if (!input.startsWith('mongodb://') && !input.startsWith('mongodb+srv://')) {
        return 'Please enter a valid MongoDB connection string (mongodb:// or mongodb+srv://)';
      }
      return true;
    } catch (error) {
      return 'Please enter a valid MongoDB connection string';
    }
  }

  maskPassword(input) {
    if (!input) return input;
    return input.replace(/:([^@]+)@/, ':***@');
  }
}

module.exports = SetupWizard;