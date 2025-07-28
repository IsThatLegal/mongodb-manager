# ☁️ Cloud Deployment Guide - Render & Vercel

## Overview
Deploy your MongoDB Manager to the cloud using Render (for the backend/API) and Vercel (for the web dashboard frontend).

## 🚀 Architecture Options

### Option 1: Full Stack on Render (Recommended)
- **Render Web Service**: Full MongoDB Manager with web dashboard
- **Best for**: Complete management platform with all features

### Option 2: Split Architecture  
- **Render Backend**: API server and CLI functionality
- **Vercel Frontend**: Web dashboard only
- **Best for**: Scalable frontend with dedicated backend

---

## 🔧 Option 1: Deploy to Render (Full Stack)

### Step 1: Prepare for Deployment

Create deployment configuration files:

**1. Create `render.yaml`**
```yaml
services:
  - type: web
    name: mongodb-manager
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm run web
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: MONGODB_ATLAS_URI
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: MM_ENCRYPTION_KEY
        generateValue: true
```

**2. Update `package.json` scripts**
```json
{
  "scripts": {
    "start": "node web/server.js",
    "web": "node web/server.js",
    "build": "npm install",
    "dev": "nodemon web/server.js"
  }
}
```

### Step 2: Deploy to Render

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial MongoDB Manager setup"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/mongodb-manager.git
   git push -u origin main
   ```

2. **Connect to Render**:
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Choose the repository: `mongodb-manager`

3. **Configure Environment Variables**:
   ```
   MONGODB_ATLAS_URI=mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   NODE_ENV=production
   PORT=3000
   JWT_SECRET=your-secret-key
   MM_ENCRYPTION_KEY=auto-generated
   ```

4. **Deploy Settings**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm run web`
   - **Node Version**: 18.x or later

---

## 🔧 Option 2: Split Architecture

### Render Backend Setup

**1. Create API-only version**
```javascript
// api-server.js
const express = require('express');
const cors = require('cors');
const MongoDBManager = require('./lib');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let manager;

// Initialize MongoDB Manager
async function initializeManager() {
  manager = new MongoDBManager({
    logLevel: 'info'
  });
  await manager.initialize();
}

// API Routes
app.get('/api/clusters', async (req, res) => {
  try {
    const clusters = manager.getClusterManager().listClusters();
    res.json(clusters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/databases/:cluster', async (req, res) => {
  try {
    const databases = await manager.getDatabaseOperations()
      .listDatabases(req.params.cluster);
    res.json(databases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:cluster/:database', async (req, res) => {
  try {
    const collections = await manager.getDatabaseOperations()
      .listCollections(req.params.cluster, req.params.database);
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/query/:cluster/:database/:collection', async (req, res) => {
  try {
    const result = await manager.getDatabaseOperations()
      .query(req.params.cluster, req.params.database, req.params.collection, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  await initializeManager();
  console.log(`MongoDB Manager API running on port ${PORT}`);
});
```

**2. Render Configuration**:
```yaml
# render.yaml
services:
  - type: web
    name: mongodb-manager-api
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: node api-server.js
    envVars:
      - key: MONGODB_ATLAS_URI
        sync: false
      - key: NODE_ENV
        value: production
```

### Vercel Frontend Setup

**1. Create `vercel.json`**:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "web/public/**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "https://your-render-backend.onrender.com/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/web/public/$1"
    }
  ],
  "env": {
    "REACT_APP_API_URL": "https://your-render-backend.onrender.com"
  }
}
```

**2. Deploy to Vercel**:
```bash
npx vercel --prod
```

---

## 🔐 Environment Variables Setup

### For Render:
```bash
# In Render Dashboard → Environment Variables
MONGODB_ATLAS_URI=mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key
MM_ENCRYPTION_KEY=32-character-encryption-key
PORT=3000
```

### For Vercel:
```bash
# In Vercel Dashboard → Settings → Environment Variables  
NEXT_PUBLIC_API_URL=https://your-mongodb-manager.onrender.com
```

---

## 📦 Production Optimizations

### 1. Update for Production
```javascript
// web/server.js - Add production optimizations
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
  app.use(compression());
  
  // Rate limiting
  const rateLimit = require('express-rate-limit');
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }));
}
```

### 2. Health Check Endpoint
```javascript
// Add to your server
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 3. Logging Configuration
```javascript
// Production logging
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

---

## 🚀 Deployment Scripts

### Quick Deploy Script
```bash
#!/bin/bash
# deploy.sh

echo "🚀 Deploying MongoDB Manager to the cloud..."

# Build and test
npm install
npm run test
npm run lint

# Deploy to Render
echo "📦 Pushing to GitHub..."
git add .
git commit -m "Deploy: $(date)"
git push origin main

echo "🌐 Render will auto-deploy from GitHub"
echo "✅ Check your Render dashboard for deployment status"
echo "🔗 Your app will be available at: https://your-app.onrender.com"
```

### Environment Setup Script
```bash
#!/bin/bash
# setup-env.sh

echo "🔧 Setting up environment variables..."

# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "Add these to your Render environment variables:"
echo "JWT_SECRET=$JWT_SECRET"
echo "MM_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "MONGODB_ATLAS_URI=your-atlas-connection-string"
echo "NODE_ENV=production"
```

---

## 🌍 Custom Domain Setup

### For Render:
1. Go to Render Dashboard → Your Service → Settings
2. Add custom domain: `mongodb-manager.yourdomain.com`
3. Update DNS records as instructed

### SSL Certificate:
- Render provides automatic SSL certificates
- Vercel includes SSL by default

---

## 📊 Monitoring & Analytics

### 1. Add Monitoring
```javascript
// Add to your server
const prometheus = require('prom-client');

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'status_code']
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(await prometheus.register.metrics());
});
```

### 2. Error Tracking
```javascript
// Add Sentry or similar
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

app.use(Sentry.Handlers.errorHandler());
```

---

## 🔧 CI/CD Pipeline

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
name: Deploy to Render

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v2
      with:
        node-version: '18'
    - run: npm install
    - run: npm test
    - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - name: Deploy to Render
      run: echo "Render auto-deploys from main branch"
```

---

## 💰 Cost Optimization

### Render Pricing:
- **Starter Plan**: $7/month
- **Standard Plan**: $25/month  
- **Pro Plan**: $85/month

### Vercel Pricing:
- **Hobby**: Free (perfect for frontend)
- **Pro**: $20/month (if you need more)

### Recommended Setup:
- **Render Starter**: $7/month (backend)
- **Vercel Hobby**: Free (frontend)
- **Total**: $7/month

---

## 🎯 Next Steps

1. **Choose your architecture** (Option 1 or 2)
2. **Set up GitHub repository**
3. **Configure environment variables**
4. **Deploy to Render/Vercel**
5. **Set up custom domain** (optional)
6. **Configure monitoring** (recommended)

Your MongoDB Manager will be accessible worldwide with enterprise-grade hosting, automatic SSL, and professional deployment infrastructure!