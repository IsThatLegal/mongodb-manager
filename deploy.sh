#!/bin/bash

echo "🚀 MongoDB Manager - Cloud Deployment Script"
echo "============================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
print_step "Checking prerequisites..."

# Check if git is installed
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Please install git first."
    exit 1
fi

# Check if node is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

print_success "Prerequisites check passed"

# Test the application
print_step "Running tests..."
if npm test > /dev/null 2>&1; then
    print_success "Tests passed"
else
    print_warning "Tests failed or not available. Continuing anyway..."
fi

# Build check
print_step "Checking build..."
if npm run lint > /dev/null 2>&1; then
    print_success "Linting passed"
else
    print_warning "Linting issues found. Continuing anyway..."
fi

# Generate environment secrets
print_step "Generating security keys..."
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)

print_success "Security keys generated"

# Choose deployment platform
echo
echo "Choose your deployment platform:"
echo "1) Render (Full Stack - Recommended)"
echo "2) Vercel (Frontend + Serverless)"
echo "3) Both (Render API + Vercel Frontend)"
echo "4) Show environment variables only"
echo

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        print_step "Preparing for Render deployment..."
        
        # Create .env.example
        cat > .env.example << EOF
# MongoDB Configuration
MONGODB_ATLAS_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_CLUSTER_NAME=atlas-prod

# Security
JWT_SECRET=your-jwt-secret-key
MM_ENCRYPTION_KEY=your-encryption-key

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Optional: Monitoring
SENTRY_DSN=your-sentry-dsn
EOF

        print_success ".env.example created"
        
        echo
        print_step "Render Deployment Instructions:"
        echo "1. Push your code to GitHub:"
        echo "   git init"
        echo "   git add ."
        echo "   git commit -m 'MongoDB Manager initial commit'"
        echo "   git remote add origin https://github.com/YOUR_USERNAME/mongodb-manager.git"
        echo "   git push -u origin main"
        echo
        echo "2. Go to render.com and create a new Web Service"
        echo "3. Connect your GitHub repository"
        echo "4. Add these environment variables in Render:"
        echo
        echo "   MONGODB_ATLAS_URI = mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
        echo "   JWT_SECRET = $JWT_SECRET"
        echo "   MM_ENCRYPTION_KEY = $ENCRYPTION_KEY"
        echo "   NODE_ENV = production"
        echo "   PORT = 3000"
        echo
        echo "5. Deploy! Your app will be available at: https://your-app.onrender.com"
        ;;
        
    2)
        print_step "Preparing for Vercel deployment..."
        
        # Install Vercel CLI if not present
        if ! command -v vercel &> /dev/null; then
            print_step "Installing Vercel CLI..."
            npm install -g vercel
        fi
        
        echo
        print_step "Vercel Deployment Instructions:"
        echo "1. Run: vercel login"
        echo "2. Run: vercel --prod"
        echo "3. Add environment variables in Vercel dashboard:"
        echo
        echo "   MONGODB_ATLAS_URI = mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
        echo "   JWT_SECRET = $JWT_SECRET"
        echo "   MM_ENCRYPTION_KEY = $ENCRYPTION_KEY"
        echo
        echo "Your app will be available at: https://your-app.vercel.app"
        ;;
        
    3)
        print_step "Preparing for split deployment (Render + Vercel)..."
        
        echo
        print_step "Split Deployment Instructions:"
        echo
        echo "RENDER (Backend API):"
        echo "1. Deploy backend to Render with environment variables:"
        echo "   MONGODB_ATLAS_URI = mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
        echo "   JWT_SECRET = $JWT_SECRET"
        echo "   MM_ENCRYPTION_KEY = $ENCRYPTION_KEY"
        echo
        echo "VERCEL (Frontend):"
        echo "2. Deploy frontend to Vercel with:"
        echo "   NEXT_PUBLIC_API_URL = https://your-render-app.onrender.com"
        echo
        print_success "This gives you the best of both platforms!"
        ;;
        
    4)
        print_step "Environment Variables for Manual Setup:"
        echo
        echo "MONGODB_ATLAS_URI=mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
        echo "JWT_SECRET=$JWT_SECRET"
        echo "MM_ENCRYPTION_KEY=$ENCRYPTION_KEY"
        echo "NODE_ENV=production"
        echo "PORT=3000"
        echo "LOG_LEVEL=info"
        echo
        print_success "Copy these to your deployment platform's environment variables"
        ;;
        
    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo
print_step "Additional Setup (Optional):"
echo "• Custom Domain: Configure in your platform's dashboard"
echo "• SSL Certificate: Automatically provided by both platforms"
echo "• Monitoring: Add Sentry DSN for error tracking"
echo "• Analytics: Add Google Analytics or similar"

echo
print_success "Deployment preparation complete!"
echo
print_step "Quick Commands for Testing:"
echo "• Health Check: curl https://your-app.com/health"
echo "• API Test: curl https://your-app.com/api/clusters"
echo "• Web Interface: https://your-app.com"

echo
print_step "Cost Estimates:"
echo "• Render Starter: $7/month (includes backend + frontend)"
echo "• Vercel Hobby: Free (frontend only)"
echo "• Split setup: $7/month (Render backend + Vercel free frontend)"

echo
print_step "Next Steps:"
echo "1. Choose your platform and follow the instructions above"
echo "2. Set up environment variables"
echo "3. Deploy your application"
echo "4. Test the deployment"
echo "5. Set up monitoring and custom domain (optional)"

print_success "Ready for cloud deployment! 🌍"