#!/bin/bash

# Fix LocalAI permissions issue
# This script ensures the models directory exists and has proper permissions

echo "🔧 Fixing LocalAI permissions..."

# Create models directory if it doesn't exist
mkdir -p models

# Set permissions (read, write, execute for all)
chmod -R 777 models

# On macOS, also ensure the directory is accessible
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 macOS detected - ensuring directory is accessible..."
    # Make sure Docker can access the directory
    chmod 755 models
fi

echo "✅ Models directory ready at: $(pwd)/models"
echo "📋 Directory permissions:"
ls -la models

echo ""
echo "🚀 You can now restart LocalAI with:"
echo "   docker-compose -f ai-docker-compose.yml down"
echo "   docker-compose -f ai-docker-compose.yml up -d"

