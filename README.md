# Web Terminal TypeScript

A modern web-based terminal application built with TypeScript, xterm.js, Node.js, and Docker, designed for deployment on Kubernetes with Helm.

## Features

- **Full Terminal Emulation**: Complete terminal experience in the browser using xterm.js
- **TypeScript**: Type safety and enhanced developer experience for both client and server
- **Real-time Communication**: WebSocket-based bidirectional communication with automatic reconnection
- **Responsive Design**: Terminal automatically resizes to fit browser window
- **Modern Build Process**: Webpack bundling with source maps and hot reload support
- **Container Ready**: Multi-stage Docker build optimized for production
- **Kubernetes Native**: Complete Helm chart for easy deployment
- **Ubuntu Base**: Pre-installed with common terminal tools (vim, wget, tmux, git, etc.)
- **Secure by Default**: Non-root user, capability dropping, and security contexts

## Architecture

```
┌─────────────────┐    WebSocket    ┌──────────────────┐    PTY     ┌─────────────┐
│   Browser       │ ←────────────→  │   Node.js        │ ←────────→ │   Shell     │
│   (xterm.js)    │                 │   Server         │            │   Process   │
│   TypeScript    │                 │   TypeScript     │            │   (/bin/bash)│
└─────────────────┘                 └──────────────────┘            └─────────────┘
```

## Project Structure

```
web-terminal-ts/
├── src/
│   ├── server/
│   │   └── server.ts              # Backend WebSocket server
│   └── client/
│       ├── index.html             # HTML template
│       ├── style.css              # Terminal styling
│       └── client.ts              # Frontend TypeScript
├── dist/                          # Build output (generated)
│   ├── server.js                  # Compiled server
│   └── public/                    # Bundled client assets
│       ├── index.html
│       ├── client.js
│       └── style.css
├── helm-chart/web-terminal/       # Kubernetes deployment
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       └── _helpers.tpl
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── webpack.config.js              # Client build configuration
├── Dockerfile                     # Multi-stage container build
├── .dockerignore                  # Docker build exclusions
└── README.md                      # This file
```

## Quick Start

### Prerequisites
- Node.js 20.x or later
- npm or yarn
- Docker (for containerization)
- Kubernetes + Helm (for deployment)

### Local Development

1. **Install dependencies:**
   ```bash
   cd /projects/web-terminal-project/web-terminal-ts
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start development server:**
   ```bash
   npm run dev:watch
   ```
   This starts the server with file watching and hot reload.

4. **Access the terminal:**
   Open http://localhost:8080 in your browser

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build both client and server for production |
| `npm run build:client` | Build client bundle with Webpack |
| `npm run build:server` | Compile server TypeScript |
| `npm run dev` | Build and start server once |
| `npm run dev:watch` | Development mode with auto-rebuild |
| `npm start` | Start the compiled server |
| `npm run clean` | Remove build artifacts |

## Docker Deployment

### Build Container Image

```bash
docker build -t web-terminal-ts:latest .
```

### Run Locally with Docker

```bash
docker run -p 8080:8080 web-terminal-ts:latest
```

### Multi-stage Build Process

1. **Builder stage**: Compiles TypeScript and bundles client assets
2. **Runtime stage**: Ubuntu base with Node.js and terminal tools
3. **Security**: Runs as non-root user with minimal privileges

## Kubernetes Deployment

### Using Helm

1. **Build and push image to registry:**
   ```bash
   docker build -t your-registry/web-terminal-ts:v1.0.0 .
   docker push your-registry/web-terminal-ts:v1.0.0
   ```

2. **Update values.yaml:**
   ```yaml
   image:
     repository: your-registry/web-terminal-ts
     tag: v1.0.0
   ```

3. **Deploy with Helm:**
   ```bash
   helm install web-terminal ./helm-chart/web-terminal
   ```

4. **Check deployment:**
   ```bash
   kubectl get pods
   kubectl get services
   ```

### Accessing via Tailscale

For secure access within your Tailscale network:

1. **Ensure your Kubernetes nodes are connected to Tailscale**
2. **Use NodePort service type:**
   ```yaml
   service:
     type: NodePort
     port: 8080
   ```
3. **Access via**: `http://<node-tailscale-ip>:<node-port>`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listening port | `8080` |
| `SHELL` | Shell to spawn in terminal | `/bin/bash` |
| `NODE_ENV` | Node.js environment | `production` |

### Helm Chart Values

Key configuration options in `values.yaml`:

```yaml
image:
  repository: web-terminal-ts
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP          # ClusterIP, NodePort, or LoadBalancer
  port: 8080

resources:
  requests:
    memory: 256Mi
    cpu: 250m
  limits:
    memory: 512Mi
    cpu: 500m

security:
  runAsNonRoot: true
  runAsUser: 1000
```

## Development Guide

### Adding Features

1. **Client-side changes**: Edit `src/client/client.ts`
2. **Server-side changes**: Edit `src/server/server.ts`
3. **Styling**: Modify `src/client/style.css`
4. **Build configuration**: Update `webpack.config.js` or `tsconfig.json`

### TypeScript Benefits

- **Compile-time error checking**
- **IntelliSense support in IDEs**
- **Type-safe WebSocket message handling**
- **Better refactoring capabilities**

### Debugging

1. **Enable source maps** (already configured)
2. **Check browser console** for client-side errors
3. **Monitor server logs** for backend issues:
   ```bash
   kubectl logs -f <pod-name>
   ```

## Security Considerations

### Container Security
- **Non-root execution**: Runs as user ID 1000
- **Capability dropping**: Removes unnecessary Linux capabilities
- **Read-only root filesystem**: Where possible
- **Resource limits**: Memory and CPU constraints

### Network Security
- **WebSocket over TLS**: Use WSS in production
- **Tailscale integration**: Secure network overlay
- **Access controls**: Implement authentication as needed

### Recommendations for Production
1. **Enable TLS/SSL** for all communications
2. **Implement authentication** (OAuth, LDAP, etc.)
3. **Use network policies** to restrict pod communication
4. **Regular security updates** for base images
5. **Monitor and log** all terminal sessions

## Troubleshooting

### Common Issues

| Problem | Symptoms | Solution |
|---------|----------|----------|
| Build failures | TypeScript errors | Run `npm run clean && npm install` |
| WebSocket connection fails | "Disconnected" status | Check server logs, verify port mapping |
| Terminal not responsive | Blank screen | Check browser console for JavaScript errors |
| PTY spawn fails | Connection drops immediately | Verify shell path and permissions |

### Debug Commands

```bash
# Check build output
npm run build:server
npm run build:client

# Verify Docker build
docker build --no-cache -t web-terminal-ts:debug .

# Test WebSocket connection
wscat -c ws://localhost:8080

# Check Kubernetes resources
kubectl describe pod <pod-name>
kubectl logs <pod-name>
kubectl exec -it <pod-name> -- /bin/bash
```

### Performance Optimization

- **Webpack bundle analysis**: Use `webpack-bundle-analyzer`
- **Memory monitoring**: Check Node.js heap usage
- **Connection limits**: Monitor concurrent WebSocket connections
- **Resource scaling**: Adjust Kubernetes resource requests/limits

## Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** in `src/`
4. **Build and test**: `npm run build && npm start`
5. **Commit changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Code Style
- **TypeScript strict mode** enabled
- **ESLint** for code quality (can be added)
- **Prettier** for formatting (can be added)

## License

MIT License - see LICENSE file for details.

## Support

For issues, questions, or contributions:
- Create an issue in the repository
- Check existing documentation
- Review container and Kubernetes logs
- Test with minimal configuration first

---

**Built with ❤️ using TypeScript, xterm.js, and modern web technologies.**
