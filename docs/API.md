# MongoDB Cluster Manager API Documentation

The MongoDB Cluster Manager provides a comprehensive REST API for programmatic access to all functionality.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the API operates in single-user mode. Multi-user authentication will be added in v1.1.

## Rate Limiting

- 1000 requests per hour per IP address
- 100 requests per minute per IP address

## Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-XX T12:00:00.000Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": { ... }
  },
  "timestamp": "2024-01-XX T12:00:00.000Z"
}
```

## Endpoints

### Clusters

#### List Clusters
```http
GET /api/clusters
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "production",
      "environment": "production",
      "databases": ["myapp", "analytics"],
      "status": "healthy",
      "connectedAt": "2024-01-XX T10:00:00.000Z",
      "lastHealthCheck": "2024-01-XX T12:00:00.000Z"
    }
  ]
}
```

#### Get Cluster Information
```http
GET /api/clusters/:name/info
```

**Parameters:**
- `name` (string): Cluster name

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "production",
    "connected": true,
    "serverStatus": { ... },
    "buildInfo": {
      "version": "7.0.4",
      "gitVersion": "...",
      "platform": "linux"
    },
    "replicaSet": {
      "set": "replica-set-name",
      "primary": "host1:27017",
      "members": [...]
    },
    "connectionInfo": {
      "connectedAt": "2024-01-XX T10:00:00.000Z",
      "lastHealthCheck": "2024-01-XX T12:00:00.000Z"
    }
  }
}
```

#### Health Check
```http
GET /api/clusters/:name/health
```

**Parameters:**
- `name` (string): Cluster name (optional, if not provided checks all clusters)

**Response:**
```json
{
  "success": true,
  "data": {
    "production": {
      "status": "healthy",
      "lastCheck": "2024-01-XX T12:00:00.000Z"
    },
    "staging": {
      "status": "unhealthy",
      "error": "Connection timeout",
      "lastCheck": "2024-01-XX T12:00:00.000Z"
    }
  }
}
```

### Databases

#### List Databases
```http
GET /api/clusters/:cluster/databases
```

**Parameters:**
- `cluster` (string): Cluster name

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "myapp",
      "sizeOnDisk": 1048576,
      "empty": false
    },
    {
      "name": "analytics", 
      "sizeOnDisk": 5242880,
      "empty": false
    }
  ]
}
```

#### Get Database Statistics
```http
GET /api/clusters/:cluster/databases/:db/stats
```

**Parameters:**
- `cluster` (string): Cluster name
- `db` (string): Database name

**Response:**
```json
{
  "success": true,
  "data": {
    "database": "myapp",
    "collections": 5,
    "objects": 10000,
    "avgObjSize": 1024,
    "dataSize": 10485760,
    "storageSize": 20971520,
    "indexes": 10,
    "indexSize": 1048576
  }
}
```

#### List Collections
```http
GET /api/clusters/:cluster/databases/:db/collections
```

**Parameters:**
- `cluster` (string): Cluster name
- `db` (string): Database name

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "users",
      "type": "collection",
      "count": 1000,
      "size": 1048576,
      "avgObjSize": 1024,
      "storageSize": 2097152,
      "indexes": 3,
      "totalIndexSize": 524288
    }
  ]
}
```

### Queries

#### Execute Query
```http
POST /api/clusters/:cluster/databases/:db/collections/:collection/query
```

**Parameters:**
- `cluster` (string): Cluster name
- `db` (string): Database name
- `collection` (string): Collection name

**Request Body:**
```json
{
  "filter": { "status": "active" },
  "projection": { "name": 1, "email": 1 },
  "sort": { "createdAt": -1 },
  "limit": 10,
  "skip": 0,
  "explain": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "_id": "...",
        "name": "John Doe",
        "email": "john@example.com"
      }
    ],
    "totalCount": 1000,
    "returnedCount": 10,
    "hasMore": true,
    "query": {
      "filter": { "status": "active" },
      "projection": { "name": 1, "email": 1 },
      "sort": { "createdAt": -1 },
      "limit": 10,
      "skip": 0
    }
  }
}
```

#### Execute Aggregation
```http
POST /api/clusters/:cluster/databases/:db/collections/:collection/aggregate
```

**Request Body:**
```json
{
  "pipeline": [
    { "$match": { "status": "active" } },
    { "$group": { "_id": "$department", "count": { "$sum": 1 } } }
  ],
  "explain": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      { "_id": "Engineering", "count": 50 },
      { "_id": "Marketing", "count": 30 }
    ],
    "count": 2,
    "pipeline": [...]
  }
}
```

### Monitoring

#### Get Metrics
```http
GET /api/clusters/:cluster/metrics?timeRange=1h
```

**Parameters:**
- `cluster` (string): Cluster name
- `timeRange` (query string): Time range (5m, 30m, 1h, 6h, 24h)

**Response:**
```json
{
  "success": true,
  "data": {
    "cluster": "production",
    "timeRange": "1h", 
    "dataPoints": 120,
    "metrics": [
      {
        "timestamp": "2024-01-XX T12:00:00.000Z",
        "server": {
          "uptime": 86400,
          "connections": {
            "current": 50,
            "available": 200,
            "totalCreated": 1000
          },
          "memory": {
            "resident": 1024,
            "virtual": 2048
          }
        },
        "operations": {
          "insert": 1000,
          "query": 5000,
          "update": 500,
          "delete": 100
        },
        "storage": {
          "totalSize": 1073741824,
          "totalDocuments": 1000000
        }
      }
    ],
    "summary": {
      "connections": {
        "current": 50,
        "peak": 75,
        "average": 45
      },
      "operations": {
        "totalInserts": 100,
        "totalQueries": 500
      }
    }
  }
}
```

#### List Alerts
```http
GET /api/alerts?cluster=production&severity=warning
```

**Query Parameters:**
- `cluster` (string, optional): Filter by cluster
- `severity` (string, optional): Filter by severity (info, warning, error, critical)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "alert-123",
      "type": "HIGH_CONNECTION_USAGE",
      "cluster": "production",
      "severity": "warning",
      "message": "High connection usage: 85% (170/200)",
      "data": {
        "current": 170,
        "available": 200,
        "percentage": 85
      },
      "timestamp": "2024-01-XX T12:00:00.000Z",
      "acknowledged": false
    }
  ]
}
```

#### Acknowledge Alert
```http
POST /api/alerts/:id/acknowledge
```

**Parameters:**
- `id` (string): Alert ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "alert-123",
    "acknowledged": true,
    "acknowledgedAt": "2024-01-XX T12:05:00.000Z"
  }
}
```

### Backups

#### List Backups
```http
GET /api/backups
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "production-myapp-2024-01-XX -12-00-00",
      "path": "/path/to/backup",
      "created": "2024-01-XX T12:00:00.000Z",
      "cluster": "production",
      "database": "myapp",
      "collections": 5,
      "totalDocuments": 10000,
      "size": 1048576,
      "compressed": true
    }
  ]
}
```

#### Create Backup
```http
POST /api/backups
```

**Request Body:**
```json
{
  "cluster": "production",
  "database": "myapp",
  "options": {
    "compress": true,
    "encrypt": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "production-myapp-2024-01-XX -12-00-00",
    "path": "/path/to/backup.zip",
    "info": {
      "cluster": "production",
      "database": "myapp",
      "timestamp": "2024-01-XX T12:00:00.000Z",
      "collections": [
        {
          "name": "users",
          "documentCount": 1000,
          "size": 1048576,
          "indexes": 3
        }
      ],
      "totalDocuments": 1000,
      "totalSize": 1048576
    },
    "size": 524288,
    "collections": 1
  }
}
```

#### Restore Backup
```http
POST /api/backups/restore
```

**Request Body:**
```json
{
  "backupPath": "/path/to/backup.zip",
  "targetCluster": "staging",
  "targetDatabase": "myapp-restored",
  "options": {
    "dropExisting": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "restoredCollections": [
      {
        "name": "users",
        "documents": 1000,
        "indexes": 2
      }
    ],
    "sourceBackup": { ... },
    "target": {
      "cluster": "staging",
      "database": "myapp-restored"
    }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `CLUSTER_NOT_FOUND` | Specified cluster does not exist |
| `CONNECTION_FAILED` | Failed to connect to cluster |
| `DATABASE_NOT_FOUND` | Specified database does not exist |
| `COLLECTION_NOT_FOUND` | Specified collection does not exist |
| `INVALID_QUERY` | Invalid query syntax |
| `BACKUP_FAILED` | Backup operation failed |
| `RESTORE_FAILED` | Restore operation failed |
| `PERMISSION_DENIED` | Insufficient permissions |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Internal server error |

## WebSocket Events

The API also supports WebSocket connections for real-time updates:

```javascript
const socket = io('http://localhost:3000');

// Listen for real-time metrics
socket.on('metrics', (data) => {
  console.log('New metrics:', data);
});

// Listen for alerts
socket.on('alert', (alert) => {
  console.log('New alert:', alert);
});

// Request specific data
socket.emit('request-metrics', {
  cluster: 'production',
  timeRange: '1h'
});
```

## SDK Examples

### Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 30000
});

// Get cluster info
const clusterInfo = await api.get('/clusters/production/info');

// Execute query
const queryResult = await api.post('/clusters/production/databases/myapp/collections/users/query', {
  filter: { active: true },
  limit: 10
});

// Create backup
const backup = await api.post('/backups', {
  cluster: 'production',
  database: 'myapp',
  options: { compress: true }
});
```

### Python
```python
import requests

base_url = 'http://localhost:3000/api'

# Get cluster info
response = requests.get(f'{base_url}/clusters/production/info')
cluster_info = response.json()

# Execute query
query_data = {
    'filter': {'active': True},
    'limit': 10
}
response = requests.post(
    f'{base_url}/clusters/production/databases/myapp/collections/users/query',
    json=query_data
)
query_result = response.json()
```

### cURL Examples

```bash
# Get cluster list
curl -X GET http://localhost:3000/api/clusters

# Health check
curl -X GET http://localhost:3000/api/clusters/production/health

# Execute query
curl -X POST http://localhost:3000/api/clusters/production/databases/myapp/collections/users/query \
  -H "Content-Type: application/json" \
  -d '{"filter": {"active": true}, "limit": 10}'

# Create backup
curl -X POST http://localhost:3000/api/backups \
  -H "Content-Type: application/json" \
  -d '{"cluster": "production", "database": "myapp", "options": {"compress": true}}'
```

## Pagination

For endpoints that return large datasets, pagination is supported:

```http
GET /api/clusters/production/databases/myapp/collections/users/query?page=1&limit=50
```

**Response includes pagination metadata:**
```json
{
  "success": true,
  "data": {
    "documents": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1000,
      "pages": 20,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```