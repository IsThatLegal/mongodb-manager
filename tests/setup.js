// Test setup and global mocks
const { MongoClient } = require('mongodb');

// Mock MongoDB client globally
jest.mock('mongodb', () => ({
  MongoClient: jest.fn(),
  ObjectId: jest.fn().mockImplementation((id) => ({ 
    toString: () => id || '507f1f77bcf86cd799439011' 
  }))
}));

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    rmdir: jest.fn(),
    copyFile: jest.fn()
  }
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    nextDate: jest.fn().mockReturnValue(new Date())
  })
}));

// Global test utilities
global.createMockMongoClient = () => {
  const mockDb = {
    command: jest.fn(),
    stats: jest.fn(),
    listCollections: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([])
    }),
    collection: jest.fn().mockReturnValue({
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis()
      }),
      findOne: jest.fn(),
      insertMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn(),
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      createIndex: jest.fn(),
      dropIndex: jest.fn(),
      listIndexes: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      stats: jest.fn(),
      drop: jest.fn()
    }),
    createCollection: jest.fn(),
    dropCollection: jest.fn()
  };

  return {
    connect: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    db: jest.fn().mockReturnValue(mockDb)
  };
};

global.createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn()
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Set up default environment variables for tests
process.env.NODE_ENV = 'test';
process.env.MM_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';