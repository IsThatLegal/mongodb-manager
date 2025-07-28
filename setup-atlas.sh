#!/bin/bash

# MongoDB Atlas Quick Setup Script
# This script helps you quickly connect your MongoDB Manager to Atlas

echo "🌐 MongoDB Atlas Quick Setup"
echo "================================"
echo

# Check if required tools are available
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }

# Get Atlas connection details
echo "📋 Please provide your MongoDB Atlas connection details:"
echo "ℹ️  Note: If you log in with Google SSO, you need to create a separate"
echo "   database user (not your Google account) for application connections."
echo "   Go to Atlas → Database Access → Add New Database User"
echo

read -p "Atlas Connection URI (mongodb+srv://username:password@cluster.mongodb.net/): " ATLAS_URI
read -p "Primary Database Name: " ATLAS_DB
read -p "Cluster Name (for reference): " CLUSTER_NAME
read -p "Environment (production/staging/development): " ENVIRONMENT

# Validate inputs
if [ -z "$ATLAS_URI" ] || [ -z "$ATLAS_DB" ] || [ -z "$CLUSTER_NAME" ]; then
    echo "❌ All fields are required. Please try again."
    exit 1
fi

if [ -z "$ENVIRONMENT" ]; then
    ENVIRONMENT="production"
fi

echo
echo "🔧 Setting up Atlas connection..."

# Create environment file
cat > .env.atlas << EOF
# MongoDB Atlas Configuration
MONGODB_ATLAS_URI=${ATLAS_URI}
MONGODB_ATLAS_DB=${ATLAS_DB}
MONGODB_CLUSTER_NAME=${CLUSTER_NAME}
MONGODB_ENVIRONMENT=${ENVIRONMENT}
EOF

echo "✅ Created .env.atlas file with your configuration"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Test connection
echo "🔍 Testing Atlas connection..."

# Create a test script
cat > test-atlas-connection.js << 'EOF'
const { MongoClient } = require('mongodb');

async function testConnection() {
    const uri = process.env.MONGODB_ATLAS_URI;
    if (!uri) {
        console.log('❌ MONGODB_ATLAS_URI not found in environment');
        return false;
    }

    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        const admin = client.db().admin();
        const result = await admin.ping();
        console.log('✅ Successfully connected to Atlas!');
        
        // List databases
        const dbs = await admin.listDatabases();
        console.log('📁 Available databases:');
        dbs.databases.forEach(db => {
            if (db.name !== 'admin' && db.name !== 'local') {
                console.log(`   - ${db.name}`);
            }
        });
        
        return true;
    } catch (error) {
        console.log('❌ Connection failed:', error.message);
        return false;
    } finally {
        await client.close();
    }
}

testConnection();
EOF

# Load environment and test
source .env.atlas
export MONGODB_ATLAS_URI MONGODB_ATLAS_DB MONGODB_CLUSTER_NAME MONGODB_ENVIRONMENT
node test-atlas-connection.js

# Clean up test file
rm test-atlas-connection.js

echo
echo "🚀 Setting up MongoDB Manager with Atlas..."

# Add cluster using CLI
echo "Adding cluster configuration..."
./bin/mm cluster add "$CLUSTER_NAME" \
    --uri "$ATLAS_URI" \
    --environment "$ENVIRONMENT" \
    --description "MongoDB Atlas $ENVIRONMENT Cluster"

# Verify setup
echo
echo "✅ Atlas setup complete!"
echo
echo "📋 Quick Commands:"
echo "   List clusters:    ./bin/mm cluster list"
echo "   Check health:     ./bin/mm cluster health $CLUSTER_NAME"
echo "   List databases:   ./bin/mm db list $CLUSTER_NAME"
echo "   Start monitoring: ./bin/mm monitor start $CLUSTER_NAME"
echo "   Web dashboard:    npm run web"
echo

echo "🔧 Configuration saved to:"
echo "   - .env.atlas (environment variables)"
echo "   - MongoDB Manager config (cluster settings)"
echo

echo "📖 For more examples and documentation:"
echo "   - Read ATLAS_SETUP.md for detailed guide"
echo "   - Run: node examples/atlas-connection.js"
echo "   - Visit: http://localhost:3000 (after npm run web)"
echo

echo "🎉 Your MongoDB Manager is now connected to Atlas!"