# 🚀 Vercel Auto-Deployment Setup

## Step-by-Step Vercel Setup

### 1. Login to Vercel
```bash
vercel login
```
**→ Choose "Continue with GitHub"**
**→ Follow browser authentication**

### 2. Initialize Project
```bash
vercel
```
**When prompted:**
- ✅ Set up and deploy? **Yes**
- ✅ Which scope? **Your personal account**
- ✅ Link to existing project? **No**
- ✅ What's your project's name? **mongodb-manager** (or press Enter)
- ✅ In which directory? **.** (current directory)
- ✅ Want to modify settings? **Yes**

**Build Settings:**
- ✅ Output directory: **web/public**
- ✅ Install command: **npm install**
- ✅ Build command: **npm run build**
- ✅ Development command: **npm run dev**

### 3. Add Environment Variables

In the Vercel dashboard or via CLI:

```bash
vercel env add MONGODB_ATLAS_URI
# Paste: mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

vercel env add JWT_SECRET
# Paste a secure secret (32+ characters)

vercel env add MM_ENCRYPTION_KEY
# Paste: generated-encryption-key-here

vercel env add NODE_ENV
# Value: production
```

### 4. Connect GitHub for Auto-Deploy

**Option A: Via Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Select your **mongodb-manager** project
3. Go to **Settings** → **Git**
4. Connect to GitHub repository: `IsThatLegal/mongodb-manager`
5. Enable **Auto-Deploy** from main branch

**Option B: Via CLI**
```bash
vercel git connect
```

### 5. Deploy!

```bash
vercel --prod
```

## 🎯 Auto-Deployment Features

### ✅ What Happens After Setup:

1. **Every push to `main`** → Automatic deployment to production
2. **Pull requests** → Preview deployments
3. **Zero downtime** → Instant rollouts
4. **Custom domains** → Configure your own domain
5. **SSL certificates** → Automatic HTTPS

### ✅ Deployment URLs:

- **Production**: `https://mongodb-manager.vercel.app`
- **Preview**: `https://mongodb-manager-git-feature-branch.vercel.app`
- **Custom**: `https://your-domain.com` (optional)

## 📊 Vercel Project Structure

```
Your MongoDB Manager on Vercel:
├── Frontend: web/public/ (static files)
├── API: api/index.js (serverless functions)
├── Auto-deploy: GitHub integration
└── Environment: Production variables
```

## 🔧 Environment Variables Required

| Variable | Value | Description |
|----------|-------|-------------|
| `MONGODB_ATLAS_URI` | `mongodb+srv://...` | Your Atlas connection string |
| `JWT_SECRET` | `your-secret-key` | JWT authentication secret |
| `MM_ENCRYPTION_KEY` | `encryption-key` | Config encryption key |
| `NODE_ENV` | `production` | Environment mode |

## 🚀 Commands After Setup

```bash
# Deploy to production
vercel --prod

# Deploy preview
vercel

# Check deployment status
vercel logs

# Open project in browser
vercel open

# View environment variables
vercel env ls
```

## 🌐 Access Your Deployed App

**After deployment, your MongoDB Manager will be available at:**
- 🌍 **Live URL**: https://mongodb-manager-[hash].vercel.app
- 📊 **Dashboard**: Access the web interface
- 🔌 **API**: `https://your-app.vercel.app/api/clusters`
- ❤️ **Health**: `https://your-app.vercel.app/health`

## ✨ Features You Get

### 🔄 Continuous Deployment
- **Push to GitHub** → **Auto-deploy to Vercel**
- **Preview deployments** for pull requests
- **Instant rollbacks** if needed

### 🌍 Global CDN
- **Worldwide availability**
- **Fast loading times**
- **Edge caching**

### 📈 Analytics & Monitoring
- **Real-time analytics** in Vercel dashboard
- **Performance metrics**
- **Error tracking**

### 🔒 Security
- **Automatic SSL certificates**
- **Environment variable encryption**
- **Secure headers**

## 🛠️ Troubleshooting

### Common Issues:

**1. Build Failures**
```bash
# Check build logs
vercel logs --follow

# Test build locally
npm run build
```

**2. Environment Variables**
```bash
# List current variables
vercel env ls

# Add missing variable
vercel env add VARIABLE_NAME
```

**3. API Errors**
```bash
# Check function logs
vercel logs [deployment-url]
```

## 🎯 Next Steps After Setup

1. ✅ **Test deployment**: Visit your Vercel URL
2. ✅ **Configure custom domain** (optional)
3. ✅ **Set up monitoring** alerts
4. ✅ **Share with team** - give them the URL!

## 💡 Pro Tips

- **Preview deployments**: Create a branch and push - get instant preview URL
- **Environment per branch**: Different configs for staging/production
- **Team collaboration**: Invite team members to Vercel project
- **Analytics**: Monitor usage and performance in Vercel dashboard

Your MongoDB Manager will be live worldwide with enterprise-grade hosting! 🌟