# 🌐 MongoDB Atlas Connection Guide

## Overview
This guide shows you how to connect your MongoDB Cluster Manager to your MongoDB Atlas cloud clusters.

## Step 1: Get Your Atlas Connection String

1. **Login to MongoDB Atlas**: Visit [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Navigate to your project**: Based on your URL, you're in organization `67b66f0480ec4b69b4f3fcda`
3. **Select your cluster**: Click on your cluster name
4. **Click "Connect"**: Choose "Connect your application"
5. **Copy the connection string**: It will look like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
   ```

## Step 2: Configure Database User

In Atlas, ensure you have a database user with appropriate permissions:

1. Go to **Database Access** in your Atlas project
2. Create a new user or use existing one
3. Note the username and password for the connection string

## Step 3: Configure Network Access

1. Go to **Network Access** in your Atlas project
2. Add your IP address or use `0.0.0.0/0` for development (not recommended for production)

## Step 4: Connect Using CLI

### Option A: Using the CLI directly

```bash
# Add your Atlas cluster
./bin/mm cluster add my-atlas-cluster \
  --uri "mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/" \
  --environment production \
  --description "My Atlas Production Cluster"

# List clusters to verify
./bin/mm cluster list

# Test connection
./bin/mm cluster health my-atlas-cluster
```

### Option B: Using configuration file

Create a configuration file `atlas-config.json`:

```json
{
  "clusters": {
    "atlas-production": {
      "uri": "mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/",
      "environment": "production",
      "databases": ["myapp", "analytics"],
      "description": "Atlas Production Cluster",
      "options": {
        "retryWrites": true,
        "w": "majority"
      }
    }
  },
  "settings": {
    "defaultDatabase": "myapp",
    "logLevel": "info"
  }
}
```

Then load it:
```bash
./bin/mm config import atlas-config.json
```

## Step 5: Environment Variables (Recommended)

For security, use environment variables:

```bash
# Set environment variables
export ATLAS_USERNAME="your-username"
export ATLAS_PASSWORD="your-password"
export ATLAS_CLUSTER="cluster0.xxxxx.mongodb.net"

# Use in connection string
./bin/mm cluster add atlas-prod \
  --uri "mongodb+srv://${ATLAS_USERNAME}:${ATLAS_PASSWORD}@${ATLAS_CLUSTER}/" \
  --environment production
```

## Step 6: Verify Connection

```bash
# Check cluster status
./bin/mm cluster health atlas-prod

# List databases
./bin/mm db list atlas-prod

# Get cluster info
./bin/mm cluster info atlas-prod
```

## Step 7: Database Operations

Once connected, you can perform various operations:

```bash
# List collections in a database
./bin/mm db collections atlas-prod myapp

# Query data
./bin/mm db query atlas-prod myapp users --filter '{"status": "active"}' --limit 10

# Create backup
./bin/mm backup create atlas-prod myapp --compress

# Schedule automated backups
./bin/mm backup schedule atlas-prod myapp "0 2 * * *" --compress
```

## Step 8: Web Dashboard Access

Start the web dashboard to manage your Atlas clusters:

```bash
# Start web dashboard
npm run web

# Open browser to http://localhost:3000
# Login with configured credentials
```

## Example: Complete Atlas Setup Script

Create `setup-atlas.sh`:

```bash
#!/bin/bash

# Atlas connection details
ATLAS_USER="your-username"
ATLAS_PASS="your-password"  
ATLAS_HOST="cluster0.xxxxx.mongodb.net"
CLUSTER_NAME="atlas-production"

# Add Atlas cluster
./bin/mm cluster add $CLUSTER_NAME \
  --uri "mongodb+srv://$ATLAS_USER:$ATLAS_PASS@$ATLAS_HOST/" \
  --environment production \
  --description "Atlas Production Cluster"

# Verify connection
echo "Testing connection..."
./bin/mm cluster health $CLUSTER_NAME

# List databases
echo "Available databases:"
./bin/mm db list $CLUSTER_NAME

# Setup monitoring
echo "Starting monitoring..."
./bin/mm monitor start $CLUSTER_NAME

# Schedule daily backup at 2 AM
echo "Scheduling daily backup..."
./bin/mm backup schedule $CLUSTER_NAME myapp "0 2 * * *" --compress

echo "Atlas setup complete!"
```

## Security Best Practices

### 1. Use Environment Variables
```bash
# In your .env file
MONGODB_ATLAS_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
MONGODB_ATLAS_DB=myapp
```

### 2. Rotate Credentials Regularly
```bash
# Update cluster connection
./bin/mm cluster update atlas-prod --uri "new-connection-string"
```

### 3. Use Read-Only Users for Monitoring
```bash
# Add read-only connection for monitoring
./bin/mm cluster add atlas-readonly \
  --uri "mongodb+srv://readonly:pass@cluster0.xxxxx.mongodb.net/" \
  --environment production \
  --readonly
```

## Troubleshooting

### Connection Issues
```bash
# Test network connectivity
ping cluster0.xxxxx.mongodb.net

# Check detailed connection logs
./bin/mm cluster connect atlas-prod --verbose
```

### Authentication Issues
- Verify username/password in Atlas Database Access
- Check that user has necessary permissions
- Ensure IP is whitelisted in Network Access

### Common Error Solutions

1. **IP Not Whitelisted**: Add your IP in Atlas Network Access
2. **Authentication Failed**: Check username/password
3. **Database Not Found**: Verify database name exists
4. **Connection Timeout**: Check network connectivity

## Advanced Configuration

### Custom Connection Options
```json
{
  "clusters": {
    "atlas-custom": {
      "uri": "mongodb+srv://user:pass@cluster.mongodb.net/",
      "options": {
        "maxPoolSize": 50,
        "serverSelectionTimeoutMS": 30000,
        "socketTimeoutMS": 45000,
        "bufferMaxEntries": 0,
        "useNewUrlParser": true,
        "useUnifiedTopology": true
      }
    }
  }
}
```

### Multiple Environment Setup
```bash
# Production
./bin/mm cluster add atlas-prod --uri "mongodb+srv://..." --environment production

# Staging  
./bin/mm cluster add atlas-staging --uri "mongodb+srv://..." --environment staging

# Development
./bin/mm cluster add atlas-dev --uri "mongodb+srv://..." --environment development
```

## Next Steps

1. ✅ Connect to your Atlas cluster
2. ✅ Verify database operations work
3. ✅ Set up automated backups
4. ✅ Configure monitoring alerts
5. ✅ Access web dashboard
6. ✅ Set up scheduled maintenance tasks

Your MongoDB Cluster Manager is now ready to manage your Atlas infrastructure!