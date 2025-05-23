'use client';

import { useEffect, useRef, useState } from 'react';

interface WebContainerPreviewProps {
  frontendCode: string;
  packageId: string;
  objectId: string;
  privateKey: string;
}

export default function WebContainerPreview({ 
  frontendCode, 
  packageId, 
  objectId, 
  privateKey 
}: WebContainerPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    try {
      // Process the frontend code to replace placeholders
      const processedCode = frontendCode
        .replace(/PACKAGE_ID/g, packageId)
        .replace(/OBJECT_ID/g, objectId)
        .replace(/PRIVATE_KEY/g, privateKey);

      // Create a simple HTML page with the frontend code
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charSet="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Sui DApp Preview</title>
            <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <script src="https://unpkg.com/@mysten/sui.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { 
                margin: 0; 
                padding: 1rem; 
                font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
              }
              #root { 
                min-height: 100vh; 
                display: flex;
                flex-direction: column;
              }
              .container {
                max-width: 1200px;
                margin: 0 auto;
                width: 100%;
                padding: 0 1rem;
              }
            </style>
          </head>
          <body>
            <div id="root">
              <div class="container">
                <h1 class="text-2xl font-bold my-4">Sui DApp Preview</h1>
                <div id="app"></div>
              </div>
            </div>
            <script type="text/babel" data-type="module">
              // Pass contract info to the frontend
              window.SUI_CONTRACT = {
                packageId: '${packageId}',
                objectId: '${objectId}',
                privateKey: '${privateKey}'
              };

              ${processedCode}

              // Render the app
              const root = ReactDOM.createRoot(document.getElementById('app'));
              root.render(React.createElement(App));
            </script>
          </body>
        </html>
      `;

      // Set the iframe content
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();
        
        // Handle iframe load
        const handleLoad = () => {
          setIsLoading(false);
        };
        
        iframe.addEventListener('load', handleLoad);
        
        // Cleanup
        return () => {
          iframe.removeEventListener('load', handleLoad);
        };
      }
    } catch (err) {
      console.error('Error setting up preview:', err);
      setError('Failed to load preview. Please try again.');
      setIsLoading(false);
    }
  }, [frontendCode, packageId, objectId, privateKey]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <iframe
        ref={iframeRef}
        className="w-full h-full border-0"
        title="DApp Preview"
        sandbox="allow-scripts allow-same-origin"
        allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; xr-spatial-tracking"
      />
    </div>
  );
}
