# Dockerfile for self-hosting Browserless Chrome
# Run this on a free-tier VPS (e.g. Oracle Cloud ARM instance)
# Usage: 
#   docker build -t legalshield-browserless .
#   docker run -d -p 3000:3000 --env TOKEN=your-custom-token legalshield-browserless

FROM browserless/chrome:latest

# Expose the default browserless port
EXPOSE 3000

# Set default configuration
ENV MAX_CONCURRENT_SESSIONS=10
ENV MAX_QUEUE_LENGTH=5
ENV PREBOOT_CHROME=true
ENV CONNECTION_TIMEOUT=30000

# Browserless will use the TOKEN environment variable for authentication
