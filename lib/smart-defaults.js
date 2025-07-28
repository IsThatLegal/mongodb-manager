// Smart defaults and auto-configuration suggestions

class SmartDefaults {
  static getConnectionDefaults(environment) {
    const defaults = {
      development: {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 3000,
        socketTimeoutMS: 30000,
        retryWrites: true
      },
      staging: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true
      },
      production: {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        retryReads: true,
        readPreference: 'secondaryPreferred'
      }
    };
    
    return defaults[environment] || defaults.development;
  }

  static getBackupRecommendations(environment, dbSize) {
    if (environment === 'production') {
      if (dbSize > 10 * 1024 * 1024 * 1024) { // > 10GB
        return {
          frequency: 'every 4 hours',
          compression: true,
          retention: 30,
          crossRegion: true
        };
      } else {
        return {
          frequency: 'daily',
          compression: true,
          retention: 14,
          crossRegion: false
        };
      }
    } else if (environment === 'staging') {
      return {
        frequency: 'daily',
        compression: true,
        retention: 7,
        crossRegion: false
      };
    } else {
      return {
        frequency: 'weekly',
        compression: false,
        retention: 3,
        crossRegion: false
      };
    }
  }

  static getMonitoringRecommendations(environment) {
    return {
      development: {
        interval: 60000, // 1 minute
        alertThresholds: {
          connectionUsage: 0.9,
          memoryUsage: 8192,
          diskUsage: 0.9
        }
      },
      staging: {
        interval: 30000, // 30 seconds
        alertThresholds: {
          connectionUsage: 0.85,
          memoryUsage: 6144,
          diskUsage: 0.85
        }
      },
      production: {
        interval: 15000, // 15 seconds
        alertThresholds: {
          connectionUsage: 0.8,
          memoryUsage: 4096,
          diskUsage: 0.8
        }
      }
    }[environment];
  }
}

module.exports = SmartDefaults;