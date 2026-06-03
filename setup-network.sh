#!/bin/bash

# MingooLive Network Setup Script for Mac/Linux
# This script helps configure MingooLive for local network access

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     MingooLive Local Network Setup                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get local IP address
echo "Finding your local IP address..."
echo ""

# Try to get IP from common interfaces
IP=$(ifconfig | grep -E "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$IP" ]; then
    # Fallback for some systems
    IP=$(hostname -I | awk '{print $1}')
fi

if [ -z "$IP" ]; then
    echo "✗ Could not find IP address automatically"
    echo "Please run 'ifconfig' or 'hostname -I' manually to find your IP"
    exit 1
fi

echo "✓ Found IP Address: $IP"
echo ""
echo "Your MingooLive will be accessible at:"
echo "  • Local:   http://localhost:3000"
echo "  • Network: http://$IP:3000"
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "✓ Found .env file"
    echo ""
    echo "Current ALLOWED_ORIGINS:"
    grep "ALLOWED_ORIGINS" .env | sed 's/^/   /'
    echo ""
else
    echo "✗ .env file not found"
    echo "Please create .env file first"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Next Steps:                                               ║"
echo "║  1. Update .env file with your IP address                 ║"
echo "║  2. Add this line to ALLOWED_ORIGINS:                     ║"
echo "║     http://$IP:3000                                        ║"
echo "║  3. Save .env file                                        ║"
echo "║  4. Restart the server (npm start)                        ║"
echo "║  5. Access from other device: http://$IP:3000             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Ask if user wants to edit .env
read -p "Do you want to edit .env now? (y/n): " edit

if [[ "$edit" == "y" || "$edit" == "Y" ]]; then
    # Try different editors
    if command -v nano &> /dev/null; then
        nano .env
    elif command -v vi &> /dev/null; then
        vi .env
    elif command -v vim &> /dev/null; then
        vim .env
    else
        echo "No text editor found. Please edit .env manually."
    fi
    echo "Please update ALLOWED_ORIGINS and save"
else
    echo ""
    echo "Remember to update .env manually before restarting the server"
fi

echo ""
echo "Setup complete!"
echo "Restart your server with: npm start"
echo ""
