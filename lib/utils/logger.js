const winston = require('winston');
const path = require('path');

class Logger {
  constructor(level = 'info') {
    this.logDir = path.join(process.cwd(), 'logs');
    
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        return log;
      })
    );

    this.logger = winston.createLogger({
      level,
      format: logFormat,
      transports: [
        new winston.transports.File({
          filename: path.join(this.logDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join(this.logDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      ]
    });

    // Add console transport in development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: consoleFormat
      }));
    }

    // Create logs directory
    this.ensureLogDirectory();
  }

  async ensureLogDirectory() {
    const fs = require('fs').promises;
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create logs directory:', error);
    }
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, meta);
  }

  setLevel(level) {
    this.logger.level = level;
  }

  getLevel() {
    return this.logger.level;
  }

  // Create child logger with additional context
  child(context) {
    return {
      info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
      error: (message, meta = {}) => this.error(message, { ...context, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { ...context, ...meta }),
      verbose: (message, meta = {}) => this.verbose(message, { ...context, ...meta })
    };
  }

  // Log performance metrics
  profile(id) {
    this.logger.profile(id);
  }

  // Log operation timing
  time(label) {
    console.time(label);
  }

  timeEnd(label) {
    console.timeEnd(label);
  }
}

module.exports = Logger;