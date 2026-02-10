#!/bin/bash

# Trading Exchange - Quick Start Script
# This script installs dependencies, builds the client, and starts the server

echo ""
echo "========================================"
echo "  Sandwich Trading Exchange"
echo "========================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

echo "Node.js version: $(node --version)"

# Install server dependencies
if [ ! -d "server/node_modules" ]; then
    echo ""
    echo "Installing server dependencies..."
    cd server && npm install && cd ..
fi

# Install client dependencies
if [ ! -d "client/node_modules" ]; then
    echo ""
    echo "Installing client dependencies..."
    cd client && npm install && cd ..
fi

# Build client for production
echo ""
echo "Building client..."
cd client && npm run build && cd ..

# Start server (serves both API and built client)
echo ""
echo "Starting server..."
cd server && npm start
