import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI client with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // For now, we'll return a simple counter example
    // In a real implementation, you would call the Gemini API here
    const moveCode = `module ${generateRandomName()}::counter {
    use std::signer;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    struct Counter has key {
        id: UID,
        value: u64,
    }

    fun init(ctx: &mut TxContext) {
        let counter = Counter {
            id: object::new(ctx),
            value: 0,
        };
        transfer::share_object(counter);
    }

    public entry fun increment(counter: &mut Counter) {
        counter.value = counter.value + 1;
    }

    public fun value(counter: &Counter): u64 {
        counter.value
    }
}`;

    const frontendCode = `import { useWallet } from '@mysten/wallet-kit';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { useSuiClient } from '@mysten/dapp-kit';
import { useEffect, useState } from 'react';

export default function App() {
  const { signAndExecuteTransactionBlock } = useWallet();
  const client = useSuiClient();
  const [counter, setCounter] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const packageId = '{{PACKAGE_ID}}';
  const objectId = '{{OBJECT_ID}}';
  const privateKey = '{{BURNER_PRIVATE_KEY_HEX}}';

  const fetchCounter = async () => {
    try {
      const result = await client.getObject({
        id: objectId,
        options: { showContent: true },
      });
      
      if (result.data?.content?.dataType === 'moveObject') {
        const fields = result.data.content.fields as { value: string };
        setCounter(Number(fields.value));
      }
    } catch (error) {
      console.error('Error fetching counter:', error);
    }
  };

  const increment = async () => {
    if (!packageId || !objectId) return;
    
    setLoading(true);
    try {
      const tx = new TransactionBlock();
      tx.moveCall({
        target: \`\${packageId}::counter::increment\`,
        arguments: [tx.object(objectId)],
      });

      await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });
      
      // Refresh the counter value
      await fetchCounter();
    } catch (error) {
      console.error('Error incrementing counter:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (objectId) {
      fetchCounter();
    }
  }, [objectId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Counter DApp</h1>
        <div className="text-center mb-6">
          <p className="text-4xl font-bold">{counter}</p>
          <p className="text-sm text-gray-500 mt-1">Current Value</p>
        </div>
        <button
          onClick={increment}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Increment'}
        </button>
      </div>
    </div>
  );
}`;

    return new Response(JSON.stringify({ 
      moveCode,
      frontendCode 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating code:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate code' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function generateRandomName() {
  const adjectives = ['happy', 'sunny', 'clever', 'swift', 'brave', 'gentle', 'jolly', 'lucky'];
  const nouns = ['tiger', 'panda', 'eagle', 'dolphin', 'koala', 'penguin', 'otter', 'zebra'];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${randomAdjective}_${randomNoun}`.toLowerCase();
}
