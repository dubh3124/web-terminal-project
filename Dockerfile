# Stage 1: Build the Node.js application
FROM node:20-slim as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Create the final Ubuntu-based image
FROM ubuntu:latest

# Install Node.js, build essentials, and terminal utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    python3 \
    locales \
    tzdata \
    vim \
    wget \
    tmux \
    git \
    nano \
    htop \
    net-tools \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.org/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Set up locale for proper terminal behavior
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Create app directory
WORKDIR /usr/src/app

# Copy node modules from builder
COPY --from=builder /app/node_modules ./

# Copy application files
COPY package*.json ./
COPY server.js ./
COPY static ./static

# Rebuild node-pty for the Ubuntu environment
RUN npm rebuild node-pty

# Create a non-root user for running the application
RUN useradd -m -s /bin/bash termuser

# Expose the application port
EXPOSE 8080

# Switch to non-root user
USER termuser

# Start the application
CMD ["node", "server.js"]
