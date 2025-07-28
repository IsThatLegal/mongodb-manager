const inquirer = require('inquirer');
const chalk = require('chalk');
const figlet = require('figlet');

class InteractiveShell {
  constructor(manager) {
    this.manager = manager;
    this.currentCluster = null;
    this.currentDatabase = null;
  }

  async start() {
    console.log(chalk.cyan(figlet.textSync('MongoDB Manager', { horizontalLayout: 'full' })));
    console.log(chalk.blue('Welcome to MongoDB Manager Interactive Shell\n'));

    while (true) {
      try {
        const action = await this.showMainMenu();
        if (action === 'exit') {
          break;
        }
        await this.handleAction(action);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
      }
    }

    console.log(chalk.blue('Goodbye!'));
  }

  async showMainMenu() {
    const choices = [
      'Select Cluster',
      'List Databases',
      'Query Collection',
      'Create Backup',
      'Monitor Cluster',
      'Exit'
    ];

    const prompt = `MongoDB Manager`;
    if (this.currentCluster) {
      prompt += ` [${this.currentCluster}]`;
    }
    if (this.currentDatabase) {
      prompt += ` / ${this.currentDatabase}`;
    }

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: prompt,
      choices
    }]);

    return answer.action.toLowerCase().replace(' ', '_');
  }

  async handleAction(action) {
    switch (action) {
      case 'select_cluster':
        await this.selectCluster();
        break;
      case 'list_databases':
        await this.listDatabases();
        break;
      case 'query_collection':
        await this.queryCollection();
        break;
      case 'create_backup':
        await this.createBackup();
        break;
      case 'monitor_cluster':
        await this.monitorCluster();
        break;
      case 'exit':
        return 'exit';
    }
  }

  async selectCluster() {
    const clusters = this.manager.getClusterManager().listClusters();
    if (clusters.length === 0) {
      console.log(chalk.yellow('No clusters configured. Use "mm clusters add" to add a cluster.'));
      return;
    }

    const choices = clusters.map(c => ({
      name: `${c.name} (${c.environment}) - ${c.status}`,
      value: c.name
    }));

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'cluster',
      message: 'Select a cluster:',
      choices
    }]);

    this.currentCluster = answer.cluster;
    console.log(chalk.green(`Selected cluster: ${this.currentCluster}`));
  }

  async listDatabases() {
    if (!this.currentCluster) {
      console.log(chalk.yellow('Please select a cluster first.'));
      return;
    }

    console.log(chalk.blue(`Listing databases for cluster: ${this.currentCluster}`));
    // Implementation would call database operations
  }

  async queryCollection() {
    console.log(chalk.blue('Query builder coming soon...'));
  }

  async createBackup() {
    console.log(chalk.blue('Backup wizard coming soon...'));
  }

  async monitorCluster() {
    console.log(chalk.blue('Monitoring dashboard coming soon...'));
  }
}

module.exports = InteractiveShell;