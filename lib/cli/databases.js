const chalk = require('chalk');
const Table = require('cli-table3');

module.exports = function(program, initializeManager) {
  const databases = program.command('databases');
  databases.description('Database operations');

  // List databases
  databases
    .command('list [cluster]')
    .alias('ls')
    .description('List databases in a cluster')
    .action(async (cluster) => {
      const manager = await initializeManager(program.opts());
      try {
        if (!cluster) {
          // List databases for all clusters
          const clusters = manager.getClusterManager().listClusters();
          if (clusters.length === 0) {
            console.log(chalk.yellow('No clusters configured.'));
            return;
          }

          for (const c of clusters) {
            if (c.status !== 'healthy') continue;
            
            console.log(chalk.bold(`\nCluster: ${c.name}`));
            console.log('─'.repeat(30));
            
            try {
              const dbs = await manager.getDatabaseOperations().listDatabases(c.name);
              
              if (dbs.length === 0) {
                console.log(chalk.dim('  No databases found'));
                continue;
              }

              const table = new Table({
                head: ['Database', 'Size', 'Collections'],
                colWidths: [25, 15, 15]
              });

              for (const db of dbs) {
                const sizeStr = db.sizeOnDisk ? 
                  `${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB` : 
                  'Empty';
                
                table.push([
                  db.name,
                  sizeStr,
                  db.empty ? '0' : 'Unknown'
                ]);
              }

              console.log(table.toString());
            } catch (error) {
              console.log(chalk.red(`  Error: ${error.message}`));
            }
          }
        } else {
          // List databases for specific cluster
          const dbs = await manager.getDatabaseOperations().listDatabases(cluster);
          
          if (dbs.length === 0) {
            console.log(chalk.yellow(`No databases found in cluster: ${cluster}`));
            return;
          }

          const table = new Table({
            head: ['Database', 'Size on Disk', 'Empty'],
            colWidths: [25, 20, 10]
          });

          dbs.forEach(db => {
            const sizeStr = db.sizeOnDisk ? 
              `${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB` : 
              '0 MB';
            
            table.push([
              db.name,
              sizeStr,
              db.empty ? 'Yes' : 'No'
            ]);
          });

          console.log(`\nDatabases in cluster: ${chalk.bold(cluster)}`);
          console.log(table.toString());
        }
      } catch (error) {
        console.error(chalk.red('Failed to list databases:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Show database statistics
  databases
    .command('stats <cluster> <database>')
    .description('Show database statistics')
    .action(async (cluster, database) => {
      const manager = await initializeManager(program.opts());
      try {
        const stats = await manager.getDatabaseOperations().getDatabaseStats(cluster, database);
        
        console.log(chalk.bold(`\nDatabase Statistics: ${database}`));
        console.log('─'.repeat(50));
        console.log(`Cluster: ${cluster}`);
        console.log(`Collections: ${stats.collections}`);
        console.log(`Objects: ${stats.objects.toLocaleString()}`);
        console.log(`Average Object Size: ${stats.avgObjSize ? (stats.avgObjSize / 1024).toFixed(2) : 0} KB`);
        console.log(`Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Indexes: ${stats.indexes}`);
        console.log(`Index Size: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
        
        if (stats.fileSize) {
          console.log(`File Size: ${(stats.fileSize / 1024 / 1024).toFixed(2)} MB`);
        }
      } catch (error) {
        console.error(chalk.red('Failed to get database stats:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // List collections
  databases
    .command('collections <cluster> <database>')
    .alias('cols')
    .description('List collections in a database')
    .action(async (cluster, database) => {
      const manager = await initializeManager(program.opts());
      try {
        const collections = await manager.getDatabaseOperations().listCollections(cluster, database);
        
        if (collections.length === 0) {
          console.log(chalk.yellow(`No collections found in database: ${database}`));
          return;
        }

        const table = new Table({
          head: ['Collection', 'Type', 'Documents', 'Size', 'Avg Size', 'Indexes'],
          colWidths: [20, 10, 12, 12, 12, 10]
        });

        collections.forEach(collection => {
          if (collection.error) {
            table.push([
              collection.name,
              collection.type || 'unknown',
              chalk.red('Error'),
              chalk.red('Error'),
              chalk.red('Error'),
              chalk.red('Error')
            ]);
          } else {
            const sizeStr = collection.size ? 
              `${(collection.size / 1024).toFixed(1)} KB` : 
              '0 KB';
            const avgSizeStr = collection.avgObjSize ? 
              `${(collection.avgObjSize / 1024).toFixed(1)} KB` : 
              '0 KB';

            table.push([
              collection.name,
              collection.type || 'collection',
              collection.count?.toLocaleString() || '0',
              sizeStr,
              avgSizeStr,
              collection.indexes?.toString() || '0'
            ]);
          }
        });

        console.log(`\nCollections in ${chalk.bold(database)} (${cluster}):`);
        console.log(table.toString());
      } catch (error) {
        console.error(chalk.red('Failed to list collections:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Collection statistics
  databases
    .command('collection-stats <cluster> <database> <collection>')
    .description('Show detailed collection statistics')
    .action(async (cluster, database, collection) => {
      const manager = await initializeManager(program.opts());
      try {
        const stats = await manager.getDatabaseOperations().getCollectionStats(cluster, database, collection);
        
        console.log(chalk.bold(`\nCollection: ${collection}`));
        console.log('─'.repeat(50));
        console.log(`Database: ${database}`);
        console.log(`Cluster: ${cluster}`);
        console.log();

        console.log(chalk.bold('Statistics:'));
        console.log(`  Documents: ${stats.stats.count.toLocaleString()}`);
        console.log(`  Size: ${(stats.stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Average Object Size: ${(stats.stats.avgObjSize / 1024).toFixed(2)} KB`);
        console.log(`  Storage Size: ${(stats.stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Capped: ${stats.stats.capped ? 'Yes' : 'No'}`);
        
        if (stats.stats.maxSize) {
          console.log(`  Max Size: ${(stats.stats.maxSize / 1024 / 1024).toFixed(2)} MB`);
        }

        if (stats.indexes.length > 0) {
          console.log();
          console.log(chalk.bold('Indexes:'));
          
          const indexTable = new Table({
            head: ['Name', 'Keys', 'Unique', 'Sparse'],
            colWidths: [20, 30, 10, 10]
          });

          stats.indexes.forEach(index => {
            indexTable.push([
              index.name,
              JSON.stringify(index.key),
              index.unique ? 'Yes' : 'No',
              index.sparse ? 'Yes' : 'No'
            ]);
          });

          console.log(indexTable.toString());
        }

        if (stats.sampleDocument) {
          console.log();
          console.log(chalk.bold('Sample Document:'));
          console.log(JSON.stringify(stats.sampleDocument, null, 2));
        }
      } catch (error) {
        console.error(chalk.red('Failed to get collection stats:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Create collection
  databases
    .command('create-collection <cluster> <database> <collection>')
    .description('Create a new collection')
    .option('--capped', 'Create as capped collection')
    .option('--size <bytes>', 'Size limit for capped collection')
    .option('--max <documents>', 'Document limit for capped collection')
    .action(async (cluster, database, collection, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const createOptions = {};
        
        if (options.capped) {
          createOptions.capped = true;
          if (options.size) {
            createOptions.size = parseInt(options.size);
          }
          if (options.max) {
            createOptions.max = parseInt(options.max);
          }
        }

        const result = await manager.getDatabaseOperations().createCollection(cluster, database, collection, createOptions);
        
        console.log(chalk.green(`✓ Successfully created collection: ${collection}`));
        console.log(`Database: ${database}`);
        console.log(`Cluster: ${cluster}`);
        
        if (options.capped) {
          console.log('Type: Capped Collection');
          if (options.size) console.log(`Size Limit: ${options.size} bytes`);
          if (options.max) console.log(`Document Limit: ${options.max}`);
        }
      } catch (error) {
        console.error(chalk.red('Failed to create collection:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Drop collection
  databases
    .command('drop-collection <cluster> <database> <collection>')
    .description('Drop a collection')
    .option('-f, --force', 'Force drop without confirmation')
    .action(async (cluster, database, collection, options) => {
      const manager = await initializeManager(program.opts());
      try {
        if (!options.force) {
          const inquirer = require('inquirer');
          const answer = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to drop collection "${collection}" from database "${database}"?`,
            default: false
          }]);

          if (!answer.confirm) {
            console.log('Operation cancelled.');
            return;
          }
        }

        await manager.getDatabaseOperations().dropCollection(cluster, database, collection);
        
        console.log(chalk.green(`✓ Successfully dropped collection: ${collection}`));
        console.log(`Database: ${database}`);
        console.log(`Cluster: ${cluster}`);
      } catch (error) {
        console.error(chalk.red('Failed to drop collection:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });
};