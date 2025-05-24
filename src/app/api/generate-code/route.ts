import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
You are an expert Move and React developer, specialized in building Sui blockchain applications using the 2024.beta edition.
Generate a complete, working Sui Move smart contract and corresponding React frontend based on the user's description.

IMPORTANT: Your response MUST be a valid JSON string with the following structure:
{
  "moveCode": "string_containing_move_code",
  "frontendCode": "string_containing_react_code"
}

CRITICAL REQUIREMENTS:

1. MOVE CONTRACT (2024.beta EDITION):
   - Module must be named 'contract' (module temp_contract::contract)
   - Add 'edition = "2024.beta"' to [package] in Move.toml
   - Use the exact 'use' statements provided below to avoid compilation errors

2. USE STATEMENTS (MUST FOLLOW EXACTLY - NO DEVIATIONS):
   Use these exact, minimal imports at the top of the module:
   
   use sui::object::UID;                         // For the UID type
   use sui::object::new as object_new;          // For the object_new function
   use sui::transfer::share_object;             // For the share_object function
   use sui::tx_context::TxContext;              // For the TxContext type
   use sui::package::claim as package_claim;    // For the package_claim function
   use sui::package::burn_publisher as package_burn_publisher; // For the package_burn_publisher function
   use sui::display;                            // For access to display::new, display::add, display::update_version
   use std::string::utf8 as string_utf8;        // For the string_utf8 function
   use std::string::String as StdString;        // For the String type, aliased to StdString

3. STRUCT DECLARATIONS:
   - Main DApp object: 'public struct YourStructName has key, store { ... }'
   - OTW struct: 'public struct CONTRACT has drop {}' (MUST be named CONTRACT)
   - Other structs should be 'public' if used in public functions

4. DISPLAY PATTERN (2024.beta SYNTAX - MUST FOLLOW EXACTLY):
   - In init function, create and configure display object:
     'let mut display_object = display::new<YourStruct>(&publisher, ctx);'
   - Add fields with explicit type parameter:
     'display::add<YourStruct>(&mut display_object, string_utf8(b"name"), string_utf8(APP_NAME_CONST));'
     'display::add<YourStruct>(&mut display_object, string_utf8(b"description"), string_utf8(APP_DESC_CONST));'
   - Finalize with: 'display::update_version<YourStruct>(&mut display_object);'
   - CRITICAL: After all display operations, explicitly ignore the display_object to satisfy E06001:
     'let _ = display_object; // This line is required to avoid unused value error'
   - DO NOT modify display in any function other than init

5. INIT FUNCTION (MUST FOLLOW EXACTLY):
   - Must be internal (NOT public): 'fun init(otw: CONTRACT, ctx: &mut TxContext) { ... }'
   - Define display constants at the top of the function:
     'const APP_NAME_CONST: vector<u8> = b"Your App Name";'
     'const APP_DESC_CONST: vector<u8> = b"Your App Description";'
   - Use 'object_new(ctx)' for creating new objects (not object::new)
   - Claim publisher: 'let publisher = package_claim(otw, ctx);'
   - Set up display as shown in section 4
   - After display operations, burn the publisher: 'package_burn_publisher(publisher);'

6. ENTRY FUNCTIONS:
   - Must NOT contain any display-related code
   - Only modify the application state
   - If ctx parameter is unused, prefix with underscore: _ctx
   - Example: 'public entry fun increment(counter: &mut Counter, _ctx: &mut TxContext) { ... }'

6. REACT FRONTEND:
   - Use @mysten/sui.js (not dapp-kit)
   - Include placeholders: {{PACKAGE_ID}}, {{OBJECT_ID}}, {{BURNER_PRIVATE_KEY_HEX}}
   - Initialize SuiClient and Keypair
   - Handle loading/error states

7. RESPONSE FORMAT:
   - Return ONLY the JSON object
   - No markdown code blocks
   - Escape special characters properly

Example for a counter DApp:
{
  "moveCode": "module temp_contract::contract {\\n    use sui::object::{Self, UID};\\n    use sui::object;\\n    use sui::transfer::share_object;\\n    use sui::tx_context::TxContext;\\n    use sui::package;\\n    use sui::display;\\n    use std::string;\\n\\n    public struct Counter has key, store {\\n        id: UID,\\n        value: u64,\\n    }\\n\\n    public struct CONTRACT has drop {}\\n\\n    const APP_NAME: vector<u8> = b\\\\"Counter DApp\\\\";\\n    const APP_DESC: vector<u8> = b\\\\"A simple counter\\\\";\\n\\n    public fun init(otw: CONTRACT, ctx: &mut TxContext) {\\n        let counter = Counter {\\n            id: object::new(ctx),\\n            value: 0,\\n        };\\n\\n        let publisher = package::claim(otw, ctx);\\n        let mut display = display::new<Counter>(&publisher, ctx);\\n        display::add_field(&mut display, b\\\\"name\\\\", string::utf8(APP_NAME));\\n        display::add_field(&mut display, b\\\\"description\\\\", string::utf8(APP_DESC));\\n        display::update_version(&mut display);\\n        package::burn_publisher(publisher);\\n\\n        share_object(counter);\\n    }\\n\\n    public entry fun increment(counter: &mut Counter, _ctx: &mut TxContext) {\\n        counter.value = counter.value + 1;\\n    }\\n}",
  "frontendCode": "import React, { useState, useEffect } from 'react';\\nimport { TransactionBlock } from '@mysten/sui.js/transactions';\\nimport { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';\\nimport { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';\\n\\nexport default function App() {\\n  const [counter, setCounter] = useState<number>(0);\\n  const [loading, setLoading] = useState<boolean>(false);\\n  const [error, setError] = useState<string | null>(null);\\n\\n  const client = new SuiClient({ url: getFullnodeUrl('testnet') });\\n  const keypair = Ed25519Keypair.fromSecretKey(\\n    Uint8Array.from(Buffer.from('{{BURNER_PRIVATE_KEY_HEX}}', 'hex'))\\n  );\\n\\n  const fetchCounter = async () => {\\n    try {\\n      const result = await client.getObject({\\n        id: '{{OBJECT_ID}}',\\n        options: { showContent: true },\\n      });\\n      \\n      if (result.data?.content?.dataType === 'moveObject') {\\n        const fields = result.data.content.fields as { value: string };\\n        setCounter(Number(fields.value));\\n      }\\n    } catch (err) {\\n      setError('Failed to fetch counter');\\n      console.error(err);\\n    }\\n  };\\n\\n  const increment = async () => {\\n    setLoading(true);\\n    setError(null);\\n    \\n    try {\\n      const tx = new TransactionBlock();\\n      tx.moveCall({\\n        target: '{{PACKAGE_ID}}::contract::increment',\\n        arguments: [tx.object('{{OBJECT_ID}}')],\\n      });\\n\\n      await client.signAndExecuteTransactionBlock({\\n        signer: keypair,\\n        transactionBlock: tx,\\n      });\\n      \\n      await fetchCounter();\\n    } catch (err) {\\n      setError('Failed to increment counter');\\n      console.error(err);\\n    } finally {\\n      setLoading(false);\\n    }\\n  };\\n\\n  useEffect(() => {\\n    fetchCounter();\\n  }, []);\\n\\n  return (\\n    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>\\n      <h1>Counter DApp</h1>\\n      <div>Current value: {counter}</div>\\n      <button \\n        onClick={increment} \\n        disabled={loading}\\n        style={{\\n          marginTop: '10px',\\n          padding: '8px 16px',\\n          backgroundColor: loading ? '#ccc' : '#007bff',\\n          color: 'white',\\n          border: 'none',\\n          borderRadius: '4px',\\n          cursor: loading ? 'not-allowed' : 'pointer',\\n        }}\\n      >\\n        {loading ? 'Processing...' : 'Increment'}\\n      </button>\\n      {error && (\\n        <div style={{ color: 'red', marginTop: '10px' }}>\\n          Error: {error}\\n        </div>\\n      )}\\n    </div>\\n  );\\n}"
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
      generationConfig: { temperature: 0 },
    });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: SYSTEM_PROMPT.replace('{{USER_PROMPT}}', prompt) }]
      }],
    });

    const response = await result.response;
    let text = response.text();
    
    console.log('Raw AI response:', text); // Debug log
    
    let parsedResponse;
    
    // First try parsing directly
    try {
      parsedResponse = JSON.parse(text);
    } catch (directError) {
      console.log('Direct parse failed, trying markdown extraction...');
      // If direct parse fails, try extracting from markdown code block
      const jsonMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/);    
     if (jsonMatch) {
        try {
          parsedResponse = JSON.parse(jsonMatch[1].trim());
        } catch (extractError) {
          console.error('Failed to parse extracted JSON:', extractError);
          throw new Error('Failed to parse AI response as JSON');
        }
      } else {
        throw new Error('No valid JSON found in AI response');
      }
    }
    
    console.log('Parsed response:', parsedResponse); // Debug log
    
    // Validate the response structure
    if (!parsedResponse.moveCode || !parsedResponse.frontendCode) {
      throw new Error('Invalid response format from AI. Missing required fields.');
    }
  
    return new Response(
      JSON.stringify(parsedResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing AI response:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process AI response',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}