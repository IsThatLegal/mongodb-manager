# 🔐 MongoDB Atlas with Google SSO - Connection Guide

## Overview
This guide is specifically for users who log into MongoDB Atlas using Google SSO authentication.

## Step 1: Access Your Atlas Project

1. **Go to Atlas**: Visit [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Sign in with Google**: Click "Sign in with Google" and authenticate
3. **Navigate to your project**: You'll see your organization and projects
4. **Select your cluster**: Click on the cluster you want to connect to

## Step 2: Create Database User (Not Your Google Account)

⚠️ **Important**: Your Google login is for Atlas dashboard access only. You need a separate database user for applications.

1. **Go to Database Access** (left sidebar)
2. **Click "Add New Database User"**
3. **Choose Authentication Method**: Select "Password" (not "Certificate")
4. **Create credentials**:
   ```
   Username: myapp-user
   Password: [Generate a strong password]
   ```
5. **Set permissions**:
   - **Built-in Role**: `readWriteAnyDatabase` (or more restrictive as needed)
   - **Or Custom Role**: Define specific permissions
6. **Click "Add User"**

## Step 3: Configure Network Access

1. **Go to Network Access** (left sidebar)
2. **Click "Add IP Address"**
3. **Choose option**:
   - **Add Current IP**: For your development machine
   - **Allow Access from Anywhere**: `0.0.0.0/0` (for testing only)
   - **Custom IP**: Add specific IP ranges for production
4. **Click "Confirm"**

## Step 4: Get Connection String

1. **Go to Database** (left sidebar)
2. **Click "Connect" on your cluster**
3. **Choose "Drivers"** (not MongoDB Compass or Shell)
4. **Select your driver version**: Node.js / Version 4.1 or later
5. **Copy the connection string**: It looks like:
   ```
   mongodb+srv://myapp-user:<password>@cluster0.xxxxx.mongodb.net/myretryWrites=true&w=majority
   ```
6. **Replace `<password>`** with the actual password you created for the database user

## Step 5: Connect Using MongoDB Manager

### Method A: Quick Setup Script
```bash
./setup-atlas.sh
```
When prompted, enter:
- **Atlas Connection URI**: `mongodb+srv://myapp-user:your-password@cluster0.xxxxx.mongodb.net/`
- **Database Name**: Your main database name (e.g., `myapp`, `production`)
- **Cluster Name**: A friendly name (e.g., `atlas-prod`)
- **Environment**: `production`, `staging`, or `development`

### Method B: Manual CLI Setup
```bash
# Replace with your actual connection details
./bin/mm cluster add atlas-prod \
  --uri "mongodb+srv://myapp-user:your-password@cluster0.xxxxx.mongodb.net/" \
  --environment production \
  --description "Atlas Production Cluster"

# Test connection
./bin/mm cluster health atlas-prod

# List databases
./bin/mm db list atlas-prod
```

### Method C: Environment Variables (Most Secure)
```bash
# Create .env file
cat > .env << EOF
MONGODB_ATLAS_URI=mongodb+srv://myapp-user:your-password@cluster0.xxxxx.mongodb.net/
MONGODB_ATLAS_DB=your-database-name
MONGODB_CLUSTER_NAME=atlas-prod
EOF

# Load environment and connect
source .env
node examples/atlas-connection.js
```

## Step 6: Verify Everything Works

```bash
# Check cluster status
./bin/mm cluster health atlas-prod

# List all databases
./bin/mm db list atlas-prod

# List collections in a specific database
./bin/mm db collections atlas-prod your-database-name

# Query some data (if collections exist)
./bin/mm db query atlas-prod your-database-name your-collection --limit 5
```

## Common Issues & Solutions

### ❌ "Authentication failed"
**Solution**: 
- Verify database username/password (not your Google account)
- Check that database user exists in Atlas Database Access
- Ensure password is correct in connection string

### ❌ "IP not whitelisted"
**Solution**:
- Go to Atlas Network Access
- Add your current IP address
- Wait 1-2 minutes for changes to propagate

### ❌ "MongoNetworkError: connection timed out"
**Solution**:
- Check your internet connection
- Verify cluster is not paused in Atlas
- Try connecting from a different network

### ❌ "Database does not exist"
**Solution**:
- Create database first in Atlas or through the manager
- Check database name spelling
- List available databases: `./bin/mm db list atlas-prod`

## Complete Example: Real-World Setup

```bash
#!/bin/bash
# Example: Setting up Atlas connection for a real project

# Your Atlas details (replace with actual values)
ATLAS_USER="myapp-prod-user"
ATLAS_PASS="SecurePassword123!"
ATLAS_HOST="cluster0.ab1cd.mongodb.net"
DATABASE_NAME="ecommerce"
CLUSTER_NAME="atlas-production"

# Full connection string
ATLAS_URI="mongodb+srv://${ATLAS_USER}:${ATLAS_PASS}@${ATLAS_HOST}/"

# Add cluster
./bin/mm cluster add $CLUSTER_NAME \
  --uri "$ATLAS_URI" \
  --environment production \
  --description "E-commerce Production Atlas Cluster"

# Verify connection
echo "Testing connection..."
./bin/mm cluster health $CLUSTER_NAME

# List available databases
echo "Available databases:"
./bin/mm db list $CLUSTER_NAME

# Set up automated backups
echo "Setting up daily backups..."
./bin/mm backup schedule $CLUSTER_NAME $DATABASE_NAME "0 2 * * *" --compress

# Start monitoring
echo "Starting monitoring..."
./bin/mm monitor start $CLUSTER_NAME

# Start web dashboard
echo "Starting web dashboard on http://localhost:3000"
npm run web &

echo "✅ Atlas setup complete!"
echo "💻 Web Dashboard: http://localhost:3000"
echo "📊 Monitor: ./bin/mm monitor status $CLUSTER_NAME"
echo "💾 Backups: ./bin/mm backup list"
```

## Security Best Practices for Google SSO + Atlas

### 1. Separate Concerns
- **Google SSO**: For Atlas dashboard access
- **Database Users**: For application connections
- **API Keys**: For programmatic Atlas management

### 2. Database User Management
```bash
# Create specific users for different purposes
# Read-only user for analytics
atlas-readonly-user: readAnyDatabase

# Application user with limited scope  
myapp-user: readWrite on specific databases

# Admin user for management tasks
admin-user: dbAdminAnyDatabase + readWriteAnyDatabase
```

### 3. Environment-Specific Access
```bash
# Production cluster
./bin/mm cluster add atlas-prod --uri "mongodb+srv://prod-user:..." --environment production

# Staging cluster  
./bin/mm cluster add atlas-staging --uri "mongodb+srv://staging-user:..." --environment staging

# Development cluster
./bin/mm cluster add atlas-dev --uri "mongodb+srv://dev-user:..." --environment development
```

### 4. Network Security
- Use specific IP ranges instead of `0.0.0.0/0` in production
- Set up VPC peering for production environments
- Use private endpoints when available

## Next Steps

1. ✅ **Connect successfully**: Follow steps above
2. ✅ **Test basic operations**: List databases, collections, query data
3. ✅ **Set up monitoring**: `./bin/mm monitor start cluster-name`
4. ✅ **Configure backups**: `./bin/mm backup schedule ...`
5. ✅ **Access web dashboard**: `npm run web`
6. ✅ **Set up alerts**: Configure email/webhook notifications
7. ✅ **Document your setup**: Save connection details securely

## Support

If you run into issues:

1. **Check Atlas Status**: [status.mongodb.com](https://status.mongodb.com)
2. **Review Atlas Logs**: Go to Atlas → Project → Activity Feed
3. **Test with MongoDB Compass**: Use the same connection string
4. **Contact Support**: Use Atlas support if connection issues persist

Your MongoDB Manager is now ready to work with your Google SSO-authenticated Atlas clusters!