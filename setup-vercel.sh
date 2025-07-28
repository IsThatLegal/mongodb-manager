#!/bin/bash

echo "🚀 MongoDB Manager - Vercel Setup Helper"
echo "========================================"
echo

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    print_warning "Vercel CLI not found. Installing..."
    npm install -g vercel
    print_success "Vercel CLI installed"
fi

# Generate environment secrets
print_step "Generating secure environment variables..."
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)

echo
print_step "🔐 Environment Variables to Add in Vercel:"
echo
echo "MONGODB_ATLAS_URI = mongodb+srv://gabehuerta82:Mongodb137*@cluster0.yxtut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
echo "JWT_SECRET = $JWT_SECRET"
echo "MM_ENCRYPTION_KEY = $ENCRYPTION_KEY"
echo "NODE_ENV = production"

echo
print_step "📝 Manual Setup Steps:"
echo
echo "1. Login to Vercel:"
echo "   vercel login"
echo "   → Choose 'Continue with GitHub'"
echo
echo "2. Initialize project:"
echo "   vercel"
echo "   → Answer setup questions (see VERCEL_SETUP.md for details)"
echo
echo "3. Add environment variables:"
echo "   vercel env add MONGODB_ATLAS_URI"
echo "   vercel env add JWT_SECRET"
echo "   vercel env add MM_ENCRYPTION_KEY"
echo "   vercel env add NODE_ENV"
echo
echo "4. Deploy to production:"
echo "   vercel --prod"
echo

print_step "🌐 After Setup - Your App URLs:"
echo
echo "Production: https://mongodb-manager.vercel.app"
echo "Dashboard:  https://mongodb-manager.vercel.app/"
echo "API:        https://mongodb-manager.vercel.app/api/clusters"
echo "Health:     https://mongodb-manager.vercel.app/health"

echo
print_step "🔄 Auto-Deployment Setup:"
echo
echo "1. Go to https://vercel.com/dashboard"
echo "2. Select your 'mongodb-manager' project"
echo "3. Settings → Git → Connect GitHub repo"
echo "4. Enable auto-deploy from main branch"
echo
echo "After this setup:"
echo "• Every push to 'main' = automatic production deployment"
echo "• Pull requests = preview deployments"
echo "• Zero downtime deployments"

echo
print_step "📱 Quick Test Commands (after deployment):"
echo
echo "# Test health endpoint"
echo "curl https://your-app.vercel.app/health"
echo
echo "# Test API"
echo "curl https://your-app.vercel.app/api/clusters"
echo
echo "# View logs"
echo "vercel logs --follow"

echo
print_success "Setup helper complete!"
echo
print_step "Next steps:"
echo "1. Run: vercel login"
echo "2. Run: vercel"
echo "3. Add environment variables"
echo "4. Run: vercel --prod"
echo "5. Set up GitHub auto-deploy"

echo
print_step "📖 For detailed instructions, see: VERCEL_SETUP.md"