const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const figlet = require('figlet');

// Enhanced CLI helpers for better UX
class CLIEnhancer {
  static showWelcomeBanner() {
    console.log(chalk.cyan(figlet.textSync('MongoDB Manager', { 
      font: 'Small',
      horizontalLayout: 'fitted' 
    })));
    
    console.log(boxen(
      chalk.white('🚀 Professional MongoDB Cluster Management\n\n') +
      chalk.gray('• Multi-cluster support\n') +
      chalk.gray('• Real-time monitoring\n') +
      chalk.gray('• Automated backups\n') +
      chalk.gray('• Web dashboard\n\n') +
      chalk.blue('💡 Tip: Use ') + chalk.yellow('mm --help') + chalk.blue(' to see all commands'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'rounded',
        borderColor: 'cyan'
      }
    ));
  }

  static showQuickActions() {
    const actions = [
      { cmd: 'mm clusters setup', desc: 'Interactive cluster setup wizard' },
      { cmd: 'mm shell', desc: 'Start interactive shell' },
      { cmd: 'mm web', desc: 'Launch web dashboard' },
      { cmd: 'mm health', desc: 'Check cluster health' }
    ];

    console.log(chalk.bold('\n🔥 Quick Actions:'));
    actions.forEach(action => {
      console.log(`  ${chalk.green('▶')} ${chalk.cyan(action.cmd)} - ${chalk.gray(action.desc)}`);
    });
    console.log();
  }

  static createProgressSpinner(text) {
    return ora({
      text: chalk.blue(text),
      spinner: 'dots',
      color: 'cyan'
    });
  }

  static showSuccess(message, details = []) {
    console.log(`\n${chalk.green('✅')} ${chalk.bold(message)}`);
    details.forEach(detail => {
      console.log(`   ${chalk.gray('•')} ${detail}`);
    });
    console.log();
  }

  static showError(message, suggestions = []) {
    console.log(`\n${chalk.red('❌')} ${chalk.bold(message)}`);
    if (suggestions.length > 0) {
      console.log(chalk.yellow('\n💡 Suggestions:'));
      suggestions.forEach(suggestion => {
        console.log(`   ${chalk.yellow('•')} ${suggestion}`);
      });
    }
    console.log();
  }

  static showWarning(message, actions = []) {
    console.log(`\n${chalk.yellow('⚠️')} ${chalk.bold(message)}`);
    if (actions.length > 0) {
      console.log(chalk.blue('\n🔧 Recommended actions:'));
      actions.forEach(action => {
        console.log(`   ${chalk.blue('•')} ${action}`);
      });
    }
    console.log();
  }

  static createTable(headers, rows, options = {}) {
    const Table = require('cli-table3');
    return new Table({
      head: headers.map(h => chalk.cyan(h)),
      style: {
        head: [],
        border: ['gray']
      },
      ...options
    });
  }

  static formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  static createStatusBadge(status) {
    const badges = {
      healthy: chalk.green('● HEALTHY'),
      unhealthy: chalk.red('● UNHEALTHY'),
      warning: chalk.yellow('● WARNING'),
      unknown: chalk.gray('● UNKNOWN')
    };
    return badges[status] || badges.unknown;
  }

  static showTips() {
    const tips = [
      'Use tab completion for commands (if supported by your shell)',
      'Run commands with --verbose for detailed output',
      'Check logs in ./logs/ directory for troubleshooting',
      'Use the web dashboard for visual cluster management',
      'Set up alerts to monitor cluster health automatically'
    ];

    console.log(chalk.blue('\n💡 Pro Tips:'));
    tips.forEach((tip, index) => {
      console.log(`   ${chalk.yellow((index + 1) + '.')} ${tip}`);
    });
    console.log();
  }
}

module.exports = CLIEnhancer;