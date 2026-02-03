#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Spotify AI Web Client - Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js version: $(node -v)"

# Check if Yarn is installed
if ! command -v yarn &> /dev/null; then
    echo -e "${YELLOW}! Yarn is not installed. Installing...${NC}"
    npm install -g yarn
fi

echo -e "${GREEN}✓${NC} Yarn version: $(yarn -v)"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}! .env file not found. Creating from template...${NC}"
    cp .env.dist .env
    echo -e "${GREEN}✓${NC} Created .env file"
    echo -e "${YELLOW}! Please edit .env and add your API keys:${NC}"
    echo "  - REACT_APP_SPOTIFY_CLIENT_ID"
    echo "  - REACT_APP_SPOTIFY_REDIRECT_URL"
    echo "  - REACT_APP_OPENAI_API_KEY"
    echo ""
fi

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
yarn install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Dependencies installed successfully"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys"
echo "2. Run 'yarn start' to start the development server"
echo ""
echo "For AI features documentation, see:"
echo "  - README.md"
echo "  - GENERATION_SERVICE_README.md"
echo ""
