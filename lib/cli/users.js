const chalk = require('chalk');

module.exports = function(program, initializeManager) {
  const users = program.command('users');
  users.description('User management operations');

  users
    .command('list <cluster>')
    .description('List database users')
    .action(async (cluster) => {
      console.log(chalk.blue(`Listing users for cluster: ${cluster}`));
      console.log('Feature coming soon...');
    });
};