'use client';

import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { BeatLoader } from 'react-spinners';
import dynamic from 'next/dynamic';

// Dynamically import WebContainerPreview with no SSR
const WebContainerPreview = dynamic<{
  frontendCode: string;
  packageId: string;
  objectId: string;
  privateKey: string;
}>(
  () => import('@/components/WebContainerPreview').then(mod => mod.default),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <BeatLoader color="#4F46E5" />
          <p className="mt-2 text-sm text-gray-500">Loading preview...</p>
        </div>
      </div>
    )
  }
);

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeTab, setActiveTab] = useState('move');
  const [generatedCode, setGeneratedCode] = useState<{
    moveCode: string;
    frontendCode: string;
  }>({ moveCode: '', frontendCode: '' });
  const [deployment, setDeployment] = useState<{
    packageId: string;
    objectId: string;
    burnerPrivateKey: string;
  }>({ packageId: '', objectId: '', burnerPrivateKey: '' });

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setGeneratedCode({ moveCode: '', frontendCode: '' });
    
    try {
      const response = await fetch('/api/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate code');
      }
      
      const { moveCode, frontendCode } = await response.json();
      setGeneratedCode({ moveCode, frontendCode });
    } catch (error) {
      console.error('Error generating code:', error);
      // Handle error
    } finally {
      setIsGenerating(false);
    }
  };

  // Alias for handleGenerate to match the UI
  const handleGenerateCode = handleGenerate;

  const handleDeploy = async () => {
    if (!generatedCode.moveCode) return;
    
    setIsDeploying(true);
    
    try {
      const response = await fetch('/api/deploy-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moveCode: generatedCode.moveCode,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to deploy contract');
      }
      
      const { packageId, objectId, burnerPrivateKey } = await response.json();
      setDeployment({ packageId, objectId, burnerPrivateKey });
    } catch (error) {
      console.error('Error deploying contract:', error);
      // Could add error toast here
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Sui Studio</h1>
          <p className="text-sm text-gray-500">Generate and deploy Sui DApps with AI</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8">Sui Studio Lite</h1>
          
          {/* Input Section */}
          <div className="mb-8">
            <div className="flex gap-4">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your DApp (e.g., a counter contract and UI)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) {
                    handleGenerateCode();
                  }
                }}
              />
              <button
                onClick={handleGenerateCode}
                disabled={isGenerating}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <BeatLoader size={8} color="white" />
                    Generating...
                  </span>
                ) : 'Generate Code'}
              </button>
            </div>
          </div>
          
          {/* Code Tabs */}
          {generatedCode.moveCode && (
            <div className="mb-8 bg-white rounded-lg shadow overflow-hidden">
              <div className="flex border-b border-gray-200 px-4">
                <button
                  className={`px-4 py-3 font-medium text-sm ${activeTab === 'move' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('move')}
                >
                  Move Contract
                </button>
                <button
                  className={`px-4 py-3 font-medium text-sm ${activeTab === 'frontend' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('frontend')}
                >
                  Frontend Code
                </button>
              </div>
              <div className="max-h-[500px] overflow-auto">
                {activeTab === 'move' ? (
                  <SyntaxHighlighter 
                    language="rust" 
                    style={atomDark} 
                    showLineNumbers
                    customStyle={{
                      margin: 0,
                      borderRadius: 0,
                      padding: '1rem',
                      fontSize: '0.875rem',
                      lineHeight: '1.5'
                    }}
                  >
                    {generatedCode.moveCode}
                  </SyntaxHighlighter>
                ) : (
                  <SyntaxHighlighter 
                    language="typescript" 
                    style={atomDark} 
                    showLineNumbers
                    customStyle={{
                      margin: 0,
                      borderRadius: 0,
                      padding: '1rem',
                      fontSize: '0.875rem',
                      lineHeight: '1.5'
                    }}
                  >
                    {generatedCode.frontendCode}
                  </SyntaxHighlighter>
                )}
              </div>
            </div>
          )}
          
          {/* Deploy Button */}
          {generatedCode.moveCode && !deployment.packageId && (
            <div className="flex justify-center mb-8">
              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeploying ? (
                  <>
                    <BeatLoader size={8} color="white" />
                    <span>Deploying...</span>
                  </>
                ) : 'Deploy to Testnet'}
              </button>
            </div>
          )}
          
          {/* Deployment Info */}
          {deployment.packageId && (
            <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-green-800 mb-2">Deployment Successful! 🎉</h3>
                  <div className="text-sm text-green-700 space-y-1">
                    <p><span className="font-medium">Package ID:</span> <code className="text-xs bg-green-100 px-1.5 py-0.5 rounded">{deployment.packageId}</code></p>
                    <p><span className="font-medium">Object ID:</span> <code className="text-xs bg-green-100 px-1.5 py-0.5 rounded">{deployment.objectId}</code></p>
                    <p className="text-xs text-green-600 mt-2">
                      Note: Save the private key to interact with the contract. It won't be shown again.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(deployment.packageId);
                    // Could add a toast notification here
                  }}
                  className="text-green-600 hover:text-green-800"
                  title="Copy Package ID"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          {/* Preview Section */}
          {deployment.packageId && generatedCode.frontendCode && (
            <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="text-sm font-medium text-gray-900">Live Preview</h3>
                <div className="flex space-x-2">
                  <a
                    href={`https://suiexplorer.com/object/${deployment.objectId}?network=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View in Explorer
                  </a>
                </div>
              </div>
              <div className="h-[600px] w-full relative">
                <WebContainerPreview
                  frontendCode={generatedCode.frontendCode}
                  packageId={deployment.packageId}
                  objectId={deployment.objectId}
                  privateKey={deployment.burnerPrivateKey}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}