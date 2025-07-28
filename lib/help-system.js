// Context-aware help and suggestions

class HelpSystem {
  static getContextualHelp(command, error = null) {
    const helpData = {
      'clusters add': {
        description: 'Add a new MongoDB cluster to your configuration',
        examples: [
          'mm clusters add local mongodb://localhost:27017',
          'mm clusters add production mongodb+srv://user:pass@cluster.mongodb.net',
          'mm clusters add staging mongodb://staging-host:27017 --environment staging'
        ],
        commonIssues: [
          {
            issue: 'Connection timeout',
            solution: 'Check network connectivity and firewall settings'
          },
          {
            issue: 'Authentication failed',
            solution: 'Verify username and password in connection string'
          }
        ]
      },
      'query find': {
        description: 'Query documents from a MongoDB collection',
        examples: [
          'mm query find production mydb users --filter \'{"active": true}\'',
          'mm query find local testdb orders --limit 5 --sort \'{"date": -1}\'',
          'mm query find staging appdb products --projection \'{"name": 1, "price": 1}\''
        ],
        tips: [
          'Use single quotes around JSON to avoid shell escaping issues',
          'Add --pretty flag for formatted output',
          'Use --explain to see query execution plan'
        ]
      },
      'backup create': {
        description: 'Create a backup of a MongoDB database',
        examples: [
          'mm backup create production mydb',
          'mm backup create local testdb --compress',
          'mm backup create staging appdb --output /path/to/backups'
        ],
        bestPractices: [
          'Always test restore procedures',
          'Use compression for large databases',
          'Schedule regular automated backups'
        ]
      }
    };

    return helpData[command] || this.getGenericHelp();
  }

  static getGenericHelp() {
    return {
      description: 'MongoDB Cluster Manager - Professional MongoDB management tool',
      quickStart: [
        'mm clusters setup - Interactive setup wizard',
        'mm clusters list - View configured clusters',
        'mm health - Check cluster health',
        'mm web - Start web dashboard'
      ],
      gettingHelp: [
        'mm <command> --help - Get help for specific command',
        'mm --help - Show all available commands',
        'Check logs in ./logs/ directory for detailed information'
      ]
    };
  }

  static getSuggestions(partialCommand) {
    const commands = [
      'clusters list', 'clusters add', 'clusters remove', 'clusters test',
      'databases list', 'databases stats', 'databases collections',
      'query find', 'query count', 'query aggregate',
      'backup create', 'backup list', 'backup schedule',
      'monitor start', 'monitor metrics', 'health'
    ];

    return commands.filter(cmd => 
      cmd.toLowerCase().includes(partialCommand.toLowerCase())
    );
  }

  static getErrorSuggestions(error) {
    const errorPatterns = {
      'ECONNREFUSED': [
        'Check if MongoDB is running',
        'Verify the connection string',
        'Check firewall and network settings'
      ],
      'Authentication failed': [
        'Verify username and password',
        'Check if user has required permissions',
        'Ensure authentication database is correct'
      ],
      'Cluster not found': [
        'Use "mm clusters list" to see available clusters',
        'Add the cluster with "mm clusters add"',
        'Check cluster name spelling'
      ],
      'Permission denied': [
        'Check user permissions for this operation',
        'Ensure user has required role',
        'Contact database administrator'
      ]
    };

    for (const [pattern, suggestions] of Object.entries(errorPatterns)) {
      if (error.includes(pattern)) {
        return suggestions;
      }
    }

    return [
      'Check the error logs for more details',
      'Try running with --verbose flag',
      'Consult the documentation'
    ];
  }

  static formatHelp(helpData) {
    let output = '';
    
    if (helpData.description) {
      output += `📝 ${helpData.description}\n\n`;
    }

    if (helpData.examples) {
      output += '💡 Examples:\n';
      helpData.examples.forEach(example => {
        output += `   ${example}\n`;
      });
      output += '\n';
    }

    if (helpData.tips) {
      output += '🎯 Tips:\n';
      helpData.tips.forEach(tip => {
        output += `   • ${tip}\n`;
      });
      output += '\n';
    }

    if (helpData.commonIssues) {
      output += '🔧 Common Issues:\n';
      helpData.commonIssues.forEach(issue => {
        output += `   Problem: ${issue.issue}\n`;
        output += `   Solution: ${issue.solution}\n\n`;
      });
    }

    return output;
  }
}

module.exports = HelpSystem;