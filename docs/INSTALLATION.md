# Installation Guide

This guide will help you install and set up MongoDB Cluster Manager on your system.

## Prerequisites

### System Requirements
- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 8.0.0 or higher  
- **MongoDB**: Access to at least one MongoDB instance (local, Atlas, or self-hosted)
- **Operating System**: Windows, macOS, or Linux

### Check Prerequisites
```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Check if MongoDB is accessible (if using local instance)
mongosh --eval "db.runCommand('ping')"
```

## Installation Methods

### Method 1: Install from npm (Recommended)

```bash
# Install globally for CLI access
npm install -g mongodb-cluster-manager

# Verify installation
mm --version
```

### Method 2: Install from Source

```bash
# Clone the repository
git clone https://github.com/your-username/mongodb-cluster-manager.git
cd mongodb-cluster-manager

# Install dependencies
npm install

# Link for global CLI access (optional)
npm link

# Or run locally
node bin/mm --version
```

### Method 3: Docker Installation

```bash
# Pull the Docker image (when available)
docker pull mongodb-cluster-manager:latest

# Run with Docker
docker run -it --rm \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/backups:/app/backups \
  -p 3000:3000 \
  mongodb-cluster-manager:latest
```

## Initial Setup

### 1. Configuration Directory

Create the configuration directory:

```bash
# Create config directory in your project
mkdir -p ~/mongodb-manager/config
mkdir -p ~/mongodb-manager/logs
mkdir -p ~/mongodb-manager/backups

# Navigate to the directory
cd ~/mongodb-manager
```

### 2. First-Time Setup

Run the interactive setup wizard:

```bash
mm clusters setup
```

This will guide you through:
- Adding your first cluster
- Configuring basic settings
- Testing the connection
- Setting up initial security

### 3. Manual Configuration

Alternatively, create a configuration file manually:

```bash
# Copy example configuration
cp node_modules/mongodb-cluster-manager/config/clusters.example.json config/clusters.json

# Edit the configuration
nano config/clusters.json
```

Example minimal configuration:
```json
{
  "clusters": {
    "local": {
      "uri": "mongodb://localhost:27017",
      "environment": "development",
      "databases": ["test"],
      "description": "Local MongoDB instance"
    }
  },
  "settings": {
    "logLevel": "info",
    "webPort": 3000,
    "backupRetention": 30
  }
}
```

### 4. Environment Variables

Set up environment variables (optional but recommended):

```bash
# Create .env file
cat > .env << EOF
# Encryption key for connection strings (generate a secure random key)
MM_ENCRYPTION_KEY=your-secret-encryption-key-here

# Log level
LOG_LEVEL=info

# Web dashboard port
PORT=3000

# MongoDB connection timeout
MONGO_TIMEOUT=30000

# JWT secret for web authentication
JWT_SECRET=your-jwt-secret-here
EOF
```

Generate secure keys:
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Verification

### Test CLI Installation

```bash
# Check version
mm --version

# List available commands
mm --help

# Test configuration
mm clusters list
```

### Test Web Dashboard

```bash
# Start the web server
mm web
# or
npm run web

# Open browser to http://localhost:3000
```

### Test API

```bash
# Test API endpoint
curl http://localhost:3000/api/clusters

# Test health endpoint
curl http://localhost:3000/health
```

## Platform-Specific Instructions

### Windows

1. **Using PowerShell** (Run as Administrator):
```powershell
# Install Node.js from https://nodejs.org/
# Then install MongoDB Manager
npm install -g mongodb-cluster-manager

# Verify installation
mm --version
```

2. **Using Windows Subsystem for Linux (WSL)**:
```bash
# Install in WSL environment
sudo apt update
sudo apt install nodejs npm
npm install -g mongodb-cluster-manager
```

### macOS

1. **Using Homebrew**:
```bash
# Install Node.js
brew install node

# Install MongoDB Manager
npm install -g mongodb-cluster-manager
```

2. **Using MacPorts**:
```bash
sudo port install nodejs18
npm install -g mongodb-cluster-manager
```

### Linux

#### Ubuntu/Debian:
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB Manager
sudo npm install -g mongodb-cluster-manager
```

#### CentOS/RHEL/Fedora:
```bash
# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install MongoDB Manager
sudo npm install -g mongodb-cluster-manager
```

#### Arch Linux:
```bash
# Install Node.js
sudo pacman -S nodejs npm

# Install MongoDB Manager
sudo npm install -g mongodb-cluster-manager
```

## Development Setup

For development or contributing:

```bash
# Clone the repository
git clone https://github.com/your-username/mongodb-cluster-manager.git
cd mongodb-cluster-manager

# Install dependencies
npm install

# Install development dependencies
npm install --include=dev

# Run tests
npm test

# Start development server with auto-reload
npm run dev

# Run linting
npm run lint

# Generate documentation
npm run docs
```

## Troubleshooting

### Common Issues

1. **Permission Denied (Linux/macOS)**:
```bash
# Install without sudo using npm config
npm config set prefix ~/.local
echo 'export PATH=~/.local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g mongodb-cluster-manager
```

2. **Node.js Version Too Old**:
```bash
# Update Node.js using n (Node.js version manager)
sudo npm install -g n
sudo n stable
```

3. **MongoDB Connection Issues**:
```bash
# Test MongoDB connection manually
mongosh "your-mongodb-uri"

# Check if MongoDB is running (local instance)
sudo systemctl status mongod  # Linux
brew services list | grep mongo  # macOS
```

4. **Port Already in Use**:
```bash
# Find process using port 3000
lsof -i :3000  # Linux/macOS
netstat -ano | findstr :3000  # Windows

# Kill the process or use different port
PORT=3001 mm web
```

5. **Module Not Found Errors**:
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

1. **Check logs**:
```bash
# View application logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log
```

2. **Enable debug mode**:
```bash
# Run with debug logging
LOG_LEVEL=debug mm clusters list

# Or set environment variable
export LOG_LEVEL=debug
mm clusters list
```

3. **Verify installation**:
```bash
# Check installed packages
npm list -g mongodb-cluster-manager

# Check Node.js modules path
npm root -g
```

## Next Steps

After successful installation:

1. **Add your clusters**: Use `mm clusters add` or the setup wizard
2. **Explore the CLI**: Run `mm --help` to see all available commands
3. **Start the web dashboard**: Run `mm web` or `npm run web`
4. **Set up monitoring**: Configure alerts and backup schedules
5. **Read the documentation**: Check out the API docs and examples

## Uninstallation

To remove MongoDB Cluster Manager:

```bash
# Uninstall global package
npm uninstall -g mongodb-cluster-manager

# Remove configuration files (optional)
rm -rf ~/mongodb-manager

# Remove logs and backups (optional)
rm -rf ~/.mongodb-manager
```

## Support

If you encounter issues during installation:

- 📚 Check the [Documentation](../README.md)
- 🐛 Report issues on [GitHub](https://github.com/your-username/mongodb-cluster-manager/issues)
- 💬 Join discussions on [GitHub Discussions](https://github.com/your-username/mongodb-cluster-manager/discussions)
- 📧 Email: support@mongodb-manager.com