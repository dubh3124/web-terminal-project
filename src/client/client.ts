// src/client/client.ts
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import './style.css';

// Initialize xterm.js with minimal configuration, let FitAddon control size
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Cascadia Code", "Monaco", "Menlo", "Ubuntu Mono", monospace',
    scrollback: 1000, // Reasonable scrollback
    allowTransparency: false,
    convertEol: true, // Convert line endings properly
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
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const webLinksAddon = new WebLinksAddon();
term.loadAddon(webLinksAddon);

// Open terminal in the DOM
const terminalElement = document.getElementById('terminal');
if (!terminalElement) {
    throw new Error('Terminal element not found');
}
term.open(terminalElement);

// Ensure the terminal always scrolls to the bottom when new output is parsed
term.onWriteParsed(() => {
    term.scrollToBottom(); // [45]
});

// WebSocket connection
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const wsUrl = `ws://${window.location.host}`;

// Fit function using FitAddon
function fitTerminal(): void {
    if (!term) return; // Ensure term object is initialized
    
    try {
        fitAddon.fit(); // This is the core function for sizing
        const cols = term.cols;
        const rows = term.rows;
        
        console.log(`Terminal fitted to: ${cols}x${rows}`);
        
        // Send size to server if WebSocket is open
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'resize',
                cols: cols,
                rows: rows
            }));
            updateTerminalSize(cols, rows);
        }
    } catch (error) {
        console.error('Error fitting terminal:', error);
        // Fallback: Manually set a common size if fit fails
        term.resize(80, 24); 
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'resize',
                cols: 80,
                rows: 24
            }));
        }
    }
}

// Initial fit after DOM has definitely rendered
setTimeout(() => {
    fitTerminal();
}, 50); // Small delay to ensure initial render completed

// Refit on window resize with debouncing
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(fitTerminal, 250); // Longer debounce for stability
});

function updateConnectionStatus(connected: boolean): void {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;
    
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
    }
}

function updateTerminalSize(cols: number, rows: number): void {
    const sizeEl = document.getElementById('terminal-size');
    if (sizeEl) {
        sizeEl.textContent = `${cols}×${rows}`; // Example: 120x30
    }
}

interface WebSocketMessage {
    type: 'data' | 'id' | 'exit' | 'resize';
    data?: string;
    id?: number;
    exitCode?: number;
    cols?: number;
    rows?: number;
}

function connect(): void {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        // Important: Re-fit and focus after connection is established
        // This sends the correct size to the newly spawned PTY
        setTimeout(() => {
            fitTerminal();
            term.focus();
            term.clear(); // Clear any initial garbage
        }, 100); 
    };
    
    ws.onmessage = (event) => {
        try {
            const msg: WebSocketMessage = JSON.parse(event.data);
            
            switch (msg.type) {
                case 'data':
                    if (msg.data) {
                        // Filter out common problematic patterns that cause weird output
                        let cleanData = msg.data.replace(/[\x00-\x1f\x7f]/g, ''); // Remove all control characters, except newline
                        cleanData = cleanData.replace(/f{5,}/g, ''); // Remove sequences of 'f'
                        cleanData = cleanData.replace(/>{5,}/g, ''); // Remove sequences of '>'
                        cleanData = cleanData.replace(/\s{20,}/g, ''); // Remove excessive whitespace
                        
                        if (cleanData.length > 0) {
                            term.write(cleanData);
                        }
                    }
                    break;
                    
                case 'id':
                    console.log('Terminal ID:', msg.id);
                    // Initial clear to remove any previous state or garbage
                    term.clear();
                    break;
                    
                case 'exit':
                    console.log('Terminal exited with code:', msg.exitCode);
                    term.write(`\r\n\r\n[Process exited with code ${msg.exitCode || 0}]\r\n`);
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
        
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
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

// Update PTY size on xterm.js resize event
term.onResize(({ cols, rows }) => {
    // This is fired by fitAddon.fit() or manual term.resize()
    console.log(`xterm.js reported resize: ${cols}x${rows}`);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'resize',
            cols: cols,
            rows: rows
        }));
        updateTerminalSize(cols, rows);
    }
});

// Focus terminal on click
terminalElement?.addEventListener('click', () => {
    term.focus();
});

// Basic scrolling and clear shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        switch(e.key) {
            case 'Home':
                term.scrollToTop();
                e.preventDefault();
                break;
            case 'End':
                term.scrollToBottom();
                e.preventDefault();
                break;
            case 'l': // Ctrl+L to clear screen
                term.clear();
                e.preventDefault();
                break;
        }
    } else if (e.key === 'PageUp') {
        term.scrollPages(-1); // Scroll up one page
        e.preventDefault();
    } else if (e.key === 'PageDown') {
        term.scrollPages(1); // Scroll down one page
        e.preventDefault();
    }
});


// Start connection
connect();