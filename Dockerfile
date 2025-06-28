# Multi-stage build for TypeScript web terminal

# Stage 1: Build the application
FROM node:20 as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Copy package files first
COPY package*.json ./
COPY tsconfig*.json ./
COPY webpack.config.js ./

# Install dependencies
RUN npm ci

# Copy all source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Stage 2: Create the final Ubuntu-based image
FROM ubuntu:latest

# Install terminal utilities (no Node.js installation needed)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
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

# Copy Node.js and npm from the builder stage
COPY --from=builder /usr/local/bin/node /usr/local/bin/
COPY --from=builder /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

# Create symlinks for Node.js and npm
RUN ln -s /usr/local/bin/node /usr/bin/node && \
    ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/bin/npm /usr/bin/npm

# Set up locale for proper terminal behavior
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Create app directory
WORKDIR /usr/src/app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Rebuild node-pty for the Ubuntu environment
RUN npm rebuild node-pty

# Create a non-root user for running the application
RUN useradd -m -s /bin/bash termuser

# Expose the application port
EXPOSE 8080

# Switch to non-root user
USER termuser

# Start the application
CMD ["node", "dist/server/server.js"]