# Web Terminal

A web-based terminal application using xterm.js, Node.js, and Docker, designed for deployment on Kubernetes with Helm.

## Features

- Full terminal emulation in the browser using xterm.js
- WebSocket-based real-time communication
- Automatic reconnection on connection loss
- Terminal resizing support
- Ubuntu-based container with common terminal tools
- Secure deployment within Tailscale network
- Helm chart for easy Kubernetes deployment

## Project Structure

```
web-terminal-project/
├── Dockerfile              # Multi-stage Docker build
├── package.json           # Node.js dependencies
├── server.js              # Backend WebSocket server
├── static/                # Frontend assets
│   ├── index.html        # Main HTML page
│   ├── style.css         # Terminal styling
│   └── script.js         # Frontend JavaScript
└── helm-chart/           # Helm chart for Kubernetes
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the server:
   ```bash
   npm start
   ```

3. Open http://localhost:8080 in your browser

## Building the Docker Image

```bash
docker build -t web-terminal:latest .
```

## Testing Locally with Docker

```bash
docker run -p 8080:8080 web-terminal:latest
```

## Deploying with Helm

1. Build and push your Docker image to a registry accessible by your Kubernetes cluster.

2. Update `helm-chart/web-terminal/values.yaml` with your image repository and tag.

3. Install the Helm chart:
   ```bash
   helm install web-terminal ./helm-chart/web-terminal
   ```

4. For Tailscale access, ensure your Kubernetes cluster is connected to your Tailscale network.

## Security Considerations

- The application runs as a non-root user (termuser)
- WebSocket connections should be secured with TLS in production
- Access should be restricted via Tailscale ACLs
- Consider implementing authentication for production use

## Configuration

Environment variables:
- `PORT`: Server port (default: 8080)
- `SHELL`: Shell to spawn (default: /bin/bash)

## Troubleshooting

- Check WebSocket connection in browser console
- Verify PTY permissions in container
- Ensure proper locale settings for UTF-8 support
