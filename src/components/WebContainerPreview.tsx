// src/components/WebContainerPreview.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface WebContainerPreviewProps {
  frontendCode: string;
  packageId: string;
  objectId: string;
  privateKey: string;
  className?: string;
}

// File structure for the WebContainer
const fileStructure = {
  'src/App.tsx': (code: string) => code,
  'src/main.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);`,

  'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sui DApp</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,

  'package.json': `{
  "name": "sui-dapp-preview",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@mysten/sui.js": "^0.54.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}`,

  'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
})`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}`,

  'index.css': `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}`
};

export default function WebContainerPreview({ 
  frontendCode, 
  packageId, 
  objectId, 
  privateKey,
  className = ''
}: WebContainerPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webContainer, setWebContainer] = useState<WebContainer | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const newTerminal = new Terminal({
      convertEol: true,
      fontSize: 14,
      theme: {
        background: '#1E1E1E',
        foreground: '#F8F8F8',
      },
    });

    const fitAddon = new FitAddon();
    newTerminal.loadAddon(fitAddon);
    newTerminal.open(terminalRef.current);
    fitAddon.fit();

    setTerminal(newTerminal);

    // Cleanup
    return () => {
      newTerminal.dispose();
    };
  }, []);

  // Handle WebContainer lifecycle
  useEffect(() => {
    let mounted = true;
    let installProcess: any = null;
    let devProcess: any = null;

    async function setupWebContainer() {
      if (!terminal || !iframeRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        // Process the frontend code to replace placeholders
        const processedCode = frontendCode
          .replace(/\{\{PACKAGE_ID\}\}/g, packageId)
          .replace(/\{\{OBJECT_ID\}\}/g, objectId)
          .replace(/\{\{BURNER_PRIVATE_KEY_HEX\}\}/g, privateKey);

        // Create files in the WebContainer
        const files = {
          ...fileStructure,
          'src/App.tsx': processedCode,
          'src/global.d.ts': `/// <reference types="vite/client" />`,
        };

        // Boot the WebContainer
        const webContainer = await WebContainer.boot();
        if (!mounted) {
          await webContainer.teardown();
          return;
        }

        setWebContainer(webContainer);

        // Write files to the WebContainer
        await Promise.all(
          Object.entries(files).map(async ([path, content]) => {
            const contentStr = typeof content === 'function' ? content(processedCode) : content;
            await webContainer.fs.mkdir(path.split('/').slice(0, -1).join('/'), { recursive: true });
            await webContainer.fs.writeFile(path, contentStr);
          })
        );

        // Install dependencies
        terminal.write('\\x1b[1;33mInstalling dependencies...\\x1b[0m\\r\\n');
        installProcess = await webContainer.spawn('npm', ['install']);
        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              terminal.write(data);
            },
          })
        );

        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error(`Installation failed with code ${installExitCode}`);
        }

        // Start the dev server
        terminal.write('\\x1b[1;33mStarting dev server...\\x1b[0m\\r\\n');
        devProcess = await webContainer.spawn('npm', ['run', 'dev']);

        // Forward the output to the terminal
        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              terminal.write(data);
            },
          })
        );

        // Wait for server to be ready
        webContainer.on('server-ready', (port, url) => {
          if (!mounted) return;
          if (iframeRef.current) {
            iframeRef.current.src = url;
            terminal.write(`\\x1b[1;32mDev server ready at ${url}\\x1b[0m\\r\\n`);
            setIsLoading(false);
          }
        });

      } catch (err) {
        console.error('WebContainer error:', err);
        setError(`Failed to start preview: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    }

    setupWebContainer();

    // Cleanup function
    return () => {
      mounted = false;
      const cleanup = async () => {
        if (installProcess) {
          await installProcess.kill();
        }
        if (devProcess) {
          await devProcess.kill();
        }
        if (webContainer) {
          await webContainer.teardown();
        }
      };
      cleanup().catch(console.error);
    };
  }, [frontendCode, packageId, objectId, privateKey, terminal]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-1 flex flex-col bg-gray-900 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 text-white text-sm font-mono">
          Preview
          {isLoading && (
            <span className="ml-2 text-gray-400">Starting...</span>
          )}
          {error && (
            <span className="ml-2 text-red-400">Error: {error}</span>
          )}
        </div>
        
        <div className="flex-1 flex flex-col md:flex-row">
          {/* Preview iframe */}
          <div className="flex-1 min-h-64 md:min-h-0 bg-white">
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
              allow="cross-origin-isolated"
              allowFullScreen
            />
          </div>

          {/* Terminal */}
          <div className="w-full md:w-1/2 h-64 md:h-auto bg-gray-900 flex flex-col">
            <div className="bg-gray-800 px-4 py-1 text-white text-sm font-mono">
              Terminal
            </div>
            <div 
              ref={terminalRef} 
              className="flex-1 p-2 overflow-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}