const chalk = require('chalk');
const ora = require('ora');

module.exports = function(program, initializeManager) {
  const backup = program.command('backup');
  backup.description('Backup and restore operations');

  backup
    .command('create <cluster> <database>')
    .description('Create a backup of a database')
    .option('-o, --output <path>', 'Output directory')
    .option('--compress', 'Compress backup files')
    .action(async (cluster, database, options) => {
      const manager = await initializeManager(program.opts());
      const spinner = ora('Creating backup...').start();
      
      try {
        const result = await manager.getBackupManager().createBackup(cluster, database, options);
        
        spinner.succeed('Backup completed successfully');
        console.log(`Backup location: ${result.path}`);
        console.log(`Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Collections: ${result.collections}`);
      } catch (error) {
        spinner.fail('Backup failed');
        console.error(chalk.red(error.message));
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });

  backup
    .command('list')
    .description('List available backups')
    .action(async () => {
      const manager = await initializeManager(program.opts());
      try {
        const backups = await manager.getBackupManager().listBackups();
        
        if (backups.length === 0) {
          console.log(chalk.yellow('No backups found.'));
          return;
        }

        console.log(chalk.bold('Available Backups:'));
        backups.forEach(backup => {
          console.log(`${backup.name} - ${backup.created} (${backup.size})`);
        });
      } catch (error) {
        console.error(chalk.red('Failed to list backups:'), error.message);
        process.exit(1);
      } finally {
        await manager.shutdown();
      }
    });
};