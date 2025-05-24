import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
You are an expert Move and React developer, specialized in building Sui blockchain applications.
Generate a complete, working Sui Move smart contract and corresponding React frontend based on the user's description.

IMPORTANT: Your response MUST be a valid JSON object with the following structure:
{
  "moveCode": "// Sui Move contract code",
  "frontendCode": "// React component code"
}

MOVE CONTRACT REQUIREMENTS:
1. The contract MUST be a complete Sui Move module
2. Module name should be descriptive (e.g., "counter", "nft_marketplace")
3. MUST include a parameterless init function that creates and shares the main object
4. Include all necessary public entry functions for the DApp's functionality
5. Use Sui framework best practices and security patterns

FRONTEND REQUIREMENTS:
1. Must be a single React component in App.tsx format
2. MUST use these exact placeholders:
   - {{PACKAGE_ID}} for the deployed package ID
   - {{OBJECT_ID}} for the main object ID
   - {{BURNER_PRIVATE_KEY_HEX}} for the burner wallet private key
3. Must initialize its own SuiClient and Keypair
4. Must include all necessary UI for the DApp's functionality
5. Should handle loading and error states appropriately

Example for a counter DApp:
{
  "moveCode": "module example::counter {\\n    use std::signer;\\n    use sui::object::{Self, UID};\\n    use sui::transfer;\\n    use sui::tx_context::{Self, TxContext};\\n\\n    struct Counter has key {\\n        id: UID,\\n        value: u64,\\n    }\\n\\n    public fun init(ctx: &mut TxContext) {\\n        let counter = Counter {\\n            id: object::new(ctx),\\n            value: 0,\\n        };\\n        transfer::share_object(counter);\\n    }\\n\\n    public entry fun increment(counter: &mut Counter) {\\n        counter.value = counter.value + 1;\\n    }\\n\\n    public fun value(counter: &Counter): u64 {\\n        counter.value\\n    }\\n}",
  "frontendCode": "import { useState, useEffect } from 'react';\\nimport { TransactionBlock } from '@mysten/sui.js/transactions';\\nimport { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';\\nimport { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';\\n\\nexport default function App() {\\n  const [counter, setCounter] = useState<number>(0);\\n  const [loading, setLoading] = useState<boolean>(false);\\n  const [error, setError] = useState<string | null>(null);\\n\\n  const client = new SuiClient({ url: getFullnodeUrl('testnet') });\\n  const keypair = Ed25519Keypair.fromSecretKey(\\n    Uint8Array.from(Buffer.from('{{BURNER_PRIVATE_KEY_HEX}}', 'hex'))\\n  );\\n\\n  const fetchCounter = async () => {\\n    try {\\n      const result = await client.getObject({\\n        id: '{{OBJECT_ID}}',\\n        options: { showContent: true },\\n      });\\n      \\n      if (result.data?.content?.dataType === 'moveObject') {\\n        const fields = result.data.content.fields as { value: string };\\n        setCounter(Number(fields.value));\\n      }\\n    } catch (err) {\\n      setError('Failed to fetch counter');\\n      console.error(err);\\n    }\\n  };\\n\\n  const increment = async () => {\\n    setLoading(true);\\n    setError(null);\\n    \\n    try {\\n      const tx = new TransactionBlock();\\n      tx.moveCall({\\n        target: '{{PACKAGE_ID}}::counter::increment',\\n        arguments: [tx.object('{{OBJECT_ID}}')],\\n      });\\n\\n      await client.signAndExecuteTransactionBlock({\\n        signer: keypair,\\n        transactionBlock: tx,\\n      });\\n      \\n      await fetchCounter();\\n    } catch (err) {\\n      setError('Failed to increment counter');\\n      console.error(err);\\n    } finally {\\n      setLoading(false);\\n    }\\n  };\\n\\n  useEffect(() => {\\n    fetchCounter();\\n  }, []);\\n\\n  return (\\n    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>\\n      <h1>Counter DApp</h1>\\n      <div>Current value: {counter}</div>\\n      <button \\n        onClick={increment} \\n        disabled={loading}\\n        style={{\\n          marginTop: '10px',\\n          padding: '8px 16px',\\n          backgroundColor: loading ? '#ccc' : '#007bff',\\n          color: 'white',\\n          border: 'none',\\n          borderRadius: '4px',\\n          cursor: loading ? 'not-allowed' : 'pointer',\\n        }}\\n      >\\n        {loading ? 'Processing...' : 'Increment'}\\n      </button>\\n      {error && (\\n        <div style={{ color: 'red', marginTop: '10px' }}>\\n          Error: {error}\\n        </div>\\n      )}\\n    </div>\\n  );\\n}"
}

Now generate a complete implementation for: {{USER_PROMPT}}`;

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { temperature: 0.2 },
    });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: SYSTEM_PROMPT.replace('{{USER_PROMPT}}', prompt) }]
      }],
    });

    const response = await result.response;
    const text = response.text();
    console.log('Raw AI Response:', text);

    // Extract JSON from markdown code block if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)```/);
    const jsonString = jsonMatch ? jsonMatch[1] : text;

    const generatedCode = JSON.parse(jsonString);

    if (!generatedCode.moveCode || !generatedCode.frontendCode) {
      throw new Error('AI response missing required code fields');
    }

    return new Response(
      JSON.stringify({
        moveCode: generatedCode.moveCode,
        frontendCode: generatedCode.frontendCode
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Code generation error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate code',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}