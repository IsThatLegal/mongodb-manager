const chalk = require('chalk');
const Table = require('cli-table3');
const inquirer = require('inquirer');

module.exports = function(program, initializeManager) {
  const clusters = program.command('clusters');
  clusters.description('Manage MongoDB clusters');

  // List clusters
  clusters
    .command('list')
    .alias('ls')
    .description('List all configured clusters')
    .option('-e, --environment <env>', 'Filter by environment')
    .action(async (options) => {
      const manager = await initializeManager(program.opts());
      try {
        const clusterList = manager.getClusterManager().listClusters();
        
        if (clusterList.length === 0) {
          console.log(chalk.yellow('No clusters configured.'));
          console.log('Use "mm clusters add" to add a cluster.');
          return;
        }

        let filteredClusters = clusterList;
        if (options.environment) {
          filteredClusters = clusterList.filter(c => c.environment === options.environment);
        }

        const table = new Table({
          head: ['Name', 'Environment', 'Status', 'Databases', 'Connected At'],
          colWidths: [20, 15, 12, 25, 20]
        });

        filteredClusters.forEach(cluster => {
          const status = cluster.status === 'healthy' ? 
            chalk.green('✓ Healthy') : 
            chalk.red('✗ Unhealthy');
          
          table.push([
            cluster.name,
            cluster.environment || 'unknown',
            status,
            cluster.databases.join(', ') || 'N/A',
            cluster.connectedAt ? new Date(cluster.connectedAt).toLocaleString() : 'N/A'
          ]);
        });

        console.log(table.toString());
      } catch (error) {
        console.error(chalk.red('Failed to list clusters:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Add cluster
  clusters
    .command('add <name> <uri>')
    .description('Add a new cluster')
    .option('-e, --environment <env>', 'Environment (dev, staging, prod)', 'development')
    .option('-d, --databases <dbs>', 'Comma-separated list of databases')
    .option('--description <desc>', 'Cluster description')
    .action(async (name, uri, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const clusterConfig = {
          uri,
          environment: options.environment,
          databases: options.databases ? options.databases.split(',').map(d => d.trim()) : [],
          description: options.description || `${name} cluster`
        };

        // Validate config
        manager.config.validateClusterConfig(clusterConfig);

        // Test connection
        console.log(chalk.blue('Testing connection...'));
        await manager.getClusterManager().addCluster(name, clusterConfig);

        // Save to config
        manager.config.addCluster(name, clusterConfig);
        await manager.config.save();

        console.log(chalk.green(`✓ Successfully added cluster: ${name}`));
        console.log(`Environment: ${clusterConfig.environment}`);
        console.log(`Databases: ${clusterConfig.databases.join(', ') || 'None specified'}`);
      } catch (error) {
        console.error(chalk.red('Failed to add cluster:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Remove cluster
  clusters
    .command('remove <name>')
    .alias('rm')
    .description('Remove a cluster')
    .option('-f, --force', 'Force removal without confirmation')
    .action(async (name, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const cluster = manager.config.getCluster(name);
        if (!cluster) {
          console.error(chalk.red(`Cluster "${name}" not found.`));
          process.exit(1);
        }

        if (!options.force) {
          const answer = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to remove cluster "${name}"?`,
            default: false
          }]);

          if (!answer.confirm) {
            console.log('Operation cancelled.');
            return;
          }
        }

        await manager.getClusterManager().removeCluster(name);
        manager.config.removeCluster(name);
        await manager.config.save();

        console.log(chalk.green(`✓ Successfully removed cluster: ${name}`));
      } catch (error) {
        console.error(chalk.red('Failed to remove cluster:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Test cluster connection
  clusters
    .command('test <name>')
    .description('Test connection to a cluster')
    .action(async (name) => {
      const manager = await initializeManager(program.opts());
      try {
        console.log(chalk.blue(`Testing connection to cluster: ${name}`));
        
        const info = await manager.getClusterManager().getClusterInfo(name);
        
        console.log(chalk.green('✓ Connection successful!'));
        console.log('\nCluster Information:');
        console.log(`  MongoDB Version: ${info.buildInfo?.version || 'Unknown'}`);
        console.log(`  Server Status: Connected`);
        
        if (info.replicaSet) {
          console.log(`  Replica Set: ${info.replicaSet.set}`);
          console.log(`  Primary: ${info.replicaSet.primary || 'Unknown'}`);
        }
        
        console.log(`  Connected At: ${info.connectionInfo.connectedAt}`);
      } catch (error) {
        console.error(chalk.red('✗ Connection failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Show cluster info
  clusters
    .command('info <name>')
    .description('Show detailed cluster information')
    .action(async (name) => {
      const manager = await initializeManager(program.opts());
      try {
        const info = await manager.getClusterManager().getClusterInfo(name);
        
        console.log(chalk.bold(`\nCluster: ${info.name}`));
        console.log('─'.repeat(50));
        
        if (info.buildInfo) {
          console.log(`MongoDB Version: ${info.buildInfo.version}`);
          console.log(`Git Version: ${info.buildInfo.gitVersion}`);
          console.log(`Platform: ${info.buildInfo.platform}`);
        }
        
        if (info.serverStatus) {
          console.log(`\nServer Status:`);
          console.log(`  Uptime: ${Math.floor(info.serverStatus.uptime / 3600)} hours`);
          console.log(`  Connections: ${info.serverStatus.connections?.current || 'Unknown'}`);
          console.log(`  Network: ${info.serverStatus.network?.bytesIn || 0} bytes in, ${info.serverStatus.network?.bytesOut || 0} bytes out`);
        }
        
        if (info.replicaSet) {
          console.log(`\nReplica Set:`);
          console.log(`  Name: ${info.replicaSet.set}`);
          console.log(`  Primary: ${info.replicaSet.primary}`);
          console.log(`  Members: ${info.replicaSet.members?.length || 0}`);
        }
        
        console.log(`\nConnection Info:`);
        console.log(`  Connected At: ${info.connectionInfo.connectedAt}`);
        console.log(`  Last Health Check: ${info.connectionInfo.lastHealthCheck}`);
      } catch (error) {
        console.error(chalk.red('Failed to get cluster info:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Interactive cluster setup
  clusters
    .command('setup')
    .description('Interactive cluster setup wizard')
    .action(async () => {
      const manager = await initializeManager(program.opts());
      try {
        console.log(chalk.bold('\nMongoDB Cluster Setup Wizard'));
        console.log('─'.repeat(40));
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Cluster name:',
            validate: input => input.trim().length > 0 || 'Name is required'
          },
          {
            type: 'input',
            name: 'uri',
            message: 'MongoDB URI:',
            validate: input => {
              try {
                new URL(input);
                return true;
              } catch {
                return 'Please enter a valid MongoDB URI';
              }
            }
          },
          {
            type: 'list',
            name: 'environment',
            message: 'Environment:',
            choices: ['development', 'staging', 'production', 'test']
          },
          {
            type: 'input',
            name: 'databases',
            message: 'Databases (comma-separated):',
            filter: input => input ? input.split(',').map(d => d.trim()).filter(d => d) : []
          },
          {
            type: 'input',
            name: 'description',
            message: 'Description (optional):'
          }
        ]);

        console.log(chalk.blue('\nTesting connection...'));
        
        const clusterConfig = {
          uri: answers.uri,
          environment: answers.environment,
          databases: answers.databases,
          description: answers.description || `${answers.name} cluster`
        };

        await manager.getClusterManager().addCluster(answers.name, clusterConfig);
        manager.config.addCluster(answers.name, clusterConfig);
        await manager.config.save();

        console.log(chalk.green(`\n✓ Successfully configured cluster: ${answers.name}`));
      } catch (error) {
        console.error(chalk.red('Setup failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });
};