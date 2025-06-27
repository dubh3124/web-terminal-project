// Initialize xterm.js
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Cascadia Code", "Monaco", "Menlo", "Ubuntu Mono", monospace',
    theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
    }
});

// Load addons
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

const webLinksAddon = new WebLinksAddon.WebLinksAddon();
term.loadAddon(webLinksAddon);

// Open terminal in the DOM
term.open(document.getElementById('terminal'));

// Fit terminal to container
function fitTerminal() {
    fitAddon.fit();
    if (ws && ws.readyState === WebSocket.OPEN) {
        const dimensions = fitAddon.proposeDimensions();
        if (dimensions) {
            ws.send(JSON.stringify({
                type: 'resize',
                cols: dimensions.cols,
                rows: dimensions.rows
            }));
            updateTerminalSize(dimensions.cols, dimensions.rows);
        }
    }
}

// Initial fit
fitTerminal();

// Refit on window resize with debouncing
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(fitTerminal, 100);
});

// WebSocket connection
let ws;
let reconnectTimeout;
const wsUrl = `ws://${window.location.host}`;

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
    }
}

function updateTerminalSize(cols, rows) {
    document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
}

function connect() {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        fitTerminal();
        term.focus();
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            
            switch (msg.type) {
                case 'data':
                    term.write(msg.data);
                    break;
                    
                case 'id':
                    console.log('Terminal ID:', msg.id);
                    break;
                    
                case 'exit':
                    console.log('Terminal exited with code:', msg.exitCode);
                    term.write('\r\n\r\n[Process exited with code ' + msg.exitCode + ']\r\n');
                    break;
                    
                default:
                    console.warn('Unknown message type:', msg.type);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        term.write('\r\n\r\n[Connection lost. Reconnecting...]\r\n');
        
        // Attempt to reconnect after 3 seconds
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connect, 3000);
    };
    
    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        updateConnectionStatus(false);
    };
}

// Handle terminal input
term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
    }
});

// Handle terminal resize
term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        updateTerminalSize(cols, rows);
    }
});

// Focus terminal on click
document.getElementById('terminal').addEventListener('click', () => {
    term.focus();
});

// Start connection
connect();

// Welcome message
term.writeln('Web Terminal - Connecting...\r\n');