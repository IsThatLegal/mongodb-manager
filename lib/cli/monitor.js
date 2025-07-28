const chalk = require('chalk');

module.exports = function(program, initializeManager) {
  const monitor = program.command('monitor');
  monitor.description('Monitoring and metrics');

  monitor
    .command('start')
    .description('Start monitoring dashboard')
    .action(async () => {
      console.log(chalk.blue('Starting monitoring dashboard...'));
      console.log('Dashboard will be available at http://localhost:3000');
    });

  monitor
    .command('metrics <cluster>')
    .description('Show cluster metrics')
    .action(async (cluster) => {
      const manager = await initializeManager(program.opts());
      try {
        const metrics = await manager.getMonitoring().getMetrics(cluster);
        console.log(chalk.bold(`Metrics for cluster: ${cluster}`));
        console.log(JSON.stringify(metrics, null, 2));
      } catch (error) {
        console.error(chalk.red('Failed to get metrics:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });
};