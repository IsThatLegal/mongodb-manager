const chalk = require('chalk');
const Table = require('cli-table3');

module.exports = function(program, initializeManager) {
  const query = program.command('query');
  query.description('Query operations');

  // Query documents
  query
    .command('find <cluster> <database> <collection>')
    .description('Query documents from a collection')
    .option('-f, --filter <filter>', 'Filter query (JSON)', '{}')
    .option('-p, --projection <projection>', 'Projection (JSON)', '{}')
    .option('-s, --sort <sort>', 'Sort specification (JSON)', '{}')
    .option('-l, --limit <number>', 'Limit number of results', '20')
    .option('--skip <number>', 'Skip number of documents', '0')
    .option('--explain', 'Explain query execution')
    .option('--pretty', 'Pretty print output')
    .action(async (cluster, database, collection, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const queryOptions = {
          filter: JSON.parse(options.filter),
          projection: JSON.parse(options.projection),
          sort: JSON.parse(options.sort),
          limit: parseInt(options.limit),
          skip: parseInt(options.skip),
          explain: options.explain
        };

        const result = await manager.getDatabaseOperations().query(
          cluster, database, collection, queryOptions
        );

        if (options.explain) {
          console.log(chalk.bold('Query Execution Plan:'));
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.bold(`\nQuery Results: ${collection}`));
        console.log('─'.repeat(50));
        console.log(`Filter: ${JSON.stringify(queryOptions.filter)}`);
        console.log(`Total Documents: ${result.totalCount}`);
        console.log(`Returned: ${result.returnedCount}`);
        console.log(`Has More: ${result.hasMore ? 'Yes' : 'No'}`);
        console.log();

        if (result.documents.length === 0) {
          console.log(chalk.yellow('No documents found.'));
          return;
        }

        if (options.pretty) {
          result.documents.forEach((doc, index) => {
            console.log(chalk.dim(`Document ${index + 1}:`));
            console.log(JSON.stringify(doc, null, 2));
            console.log();
          });
        } else {
          // Try to create a table if documents have consistent structure
          const firstDoc = result.documents[0];
          const keys = Object.keys(firstDoc);
          
          if (keys.length <= 5 && result.documents.length <= 20) {
            const table = new Table({
              head: keys.map(key => key.length > 15 ? key.substring(0, 12) + '...' : key)
            });

            result.documents.forEach(doc => {
              const row = keys.map(key => {
                let value = doc[key];
                if (typeof value === 'object' && value !== null) {
                  value = JSON.stringify(value);
                }
                if (typeof value === 'string' && value.length > 20) {
                  value = value.substring(0, 17) + '...';
                }
                return value || '';
              });
              table.push(row);
            });

            console.log(table.toString());
          } else {
            // Fallback to JSON output for complex documents
            result.documents.forEach((doc, index) => {
              console.log(chalk.dim(`${index + 1}. ${JSON.stringify(doc)}`));
            });
          }
        }

        if (result.hasMore) {
          console.log(chalk.blue(`\nTip: Use --skip ${queryOptions.skip + queryOptions.limit} to see more results`));
        }
      } catch (error) {
        console.error(chalk.red('Query failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Aggregate pipeline
  query
    .command('aggregate <cluster> <database> <collection> <pipeline>')
    .description('Run aggregation pipeline')
    .option('--explain', 'Explain aggregation execution')
    .option('--pretty', 'Pretty print output')
    .action(async (cluster, database, collection, pipelineStr, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const pipeline = JSON.parse(pipelineStr);
        
        const result = await manager.getDatabaseOperations().aggregate(
          cluster, database, collection, pipeline, { explain: options.explain }
        );

        if (options.explain) {
          console.log(chalk.bold('Aggregation Execution Plan:'));
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.bold(`\nAggregation Results: ${collection}`));
        console.log('─'.repeat(50));
        console.log(`Pipeline: ${JSON.stringify(pipeline, null, 2)}`);
        console.log(`Results: ${result.count}`);
        console.log();

        if (result.results.length === 0) {
          console.log(chalk.yellow('No results found.'));
          return;
        }

        if (options.pretty) {
          result.results.forEach((doc, index) => {
            console.log(chalk.dim(`Result ${index + 1}:`));
            console.log(JSON.stringify(doc, null, 2));
            console.log();
          });
        } else {
          result.results.forEach((doc, index) => {
            console.log(chalk.dim(`${index + 1}. ${JSON.stringify(doc)}`));
          });
        }
      } catch (error) {
        console.error(chalk.red('Aggregation failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Count documents
  query
    .command('count <cluster> <database> <collection>')
    .description('Count documents in a collection')
    .option('-f, --filter <filter>', 'Filter query (JSON)', '{}')
    .action(async (cluster, database, collection, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const filter = JSON.parse(options.filter);
        
        // Use countDocuments for accurate count
        const db = manager.getClusterManager().getDatabase(cluster, database);
        const count = await db.collection(collection).countDocuments(filter);

        console.log(chalk.bold(`\nDocument Count: ${collection}`));
        console.log('─'.repeat(30));
        console.log(`Filter: ${JSON.stringify(filter)}`);
        console.log(`Count: ${chalk.green(count.toLocaleString())}`);
      } catch (error) {
        console.error(chalk.red('Count failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Distinct values
  query
    .command('distinct <cluster> <database> <collection> <field>')
    .description('Get distinct values for a field')
    .option('-f, --filter <filter>', 'Filter query (JSON)', '{}')
    .option('-l, --limit <number>', 'Limit number of results', '50')
    .action(async (cluster, database, collection, field, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const filter = JSON.parse(options.filter);
        const limit = parseInt(options.limit);
        
        const db = manager.getClusterManager().getDatabase(cluster, database);
        const values = await db.collection(collection).distinct(field, filter);

        console.log(chalk.bold(`\nDistinct Values: ${field}`));
        console.log('─'.repeat(30));
        console.log(`Collection: ${collection}`);
        console.log(`Filter: ${JSON.stringify(filter)}`);
        console.log(`Total Distinct Values: ${values.length}`);
        console.log();

        const displayValues = values.slice(0, limit);
        displayValues.forEach((value, index) => {
          console.log(`${index + 1}. ${JSON.stringify(value)}`);
        });

        if (values.length > limit) {
          console.log(chalk.blue(`\n... and ${values.length - limit} more values`));
          console.log(chalk.blue(`Use --limit ${values.length} to see all values`));
        }
      } catch (error) {
        console.error(chalk.red('Distinct query failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  // Sample documents
  query
    .command('sample <cluster> <database> <collection>')
    .description('Get random sample documents')
    .option('-s, --size <number>', 'Sample size', '5')
    .option('--pretty', 'Pretty print output')
    .action(async (cluster, database, collection, options) => {
      const manager = await initializeManager(program.opts());
      try {
        const sampleSize = parseInt(options.size);
        
        const pipeline = [{ $sample: { size: sampleSize } }];
        
        const result = await manager.getDatabaseOperations().aggregate(
          cluster, database, collection, pipeline
        );

        console.log(chalk.bold(`\nRandom Sample: ${collection}`));
        console.log('─'.repeat(40));
        console.log(`Sample Size: ${result.count}`);
        console.log();

        if (result.results.length === 0) {
          console.log(chalk.yellow('No documents found.'));
          return;
        }

        if (options.pretty) {
          result.results.forEach((doc, index) => {
            console.log(chalk.dim(`Sample ${index + 1}:`));
            console.log(JSON.stringify(doc, null, 2));
            console.log();
          });
        } else {
          result.results.forEach((doc, index) => {
            console.log(chalk.dim(`${index + 1}. ${JSON.stringify(doc)}`));
          });
        }
      } catch (error) {
        console.error(chalk.red('Sample query failed:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });
};