# Multi-stage Dockerfile for Interactive Link State & Distance Vector Convergence Simulator
# Stage 1: Build the React frontend
FROM node:20-bullseye-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN node ./node_modules/vite/bin/vite.js build

# Stage 2: Runtime environment with Mininet, Open vSwitch, Python, and FastAPI
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies, Mininet, Open vSwitch, networking utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    mininet \
    openvswitch-switch \
    iproute2 \
    iputils-ping \
    net-tools \
    iptables \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install backend Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip3 install --no-cache-dir -r ./backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend assets to frontend/dist for FastAPI StaticFiles mounting
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose HTTP & WebSocket server port
EXPOSE 8000

# Start server with dynamic $PORT support for cloud deployments
ENTRYPOINT ["/entrypoint.sh"]
