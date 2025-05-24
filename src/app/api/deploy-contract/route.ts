import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

// Configuration
const SUI_NETWORK = 'testnet';
const SUI_RPC_URL = getFullnodeUrl('testnet');
const MASTER_WALLET_MNEMONIC = process.env.MASTER_WALLET_MNEMONIC || '';
const GAS_BUDGET = 100000000; // 0.1 SUI

// Initialize Sui client
const client = new SuiClient({
  url: SUI_RPC_URL,
});

// Interface for the deploy contract request body
interface DeployContractRequest {
  moveCode: string;
}

export async function POST(request: Request) {
  try {
    const { moveCode } = await request.json();
    
    if (!moveCode) {
      return new Response(
        JSON.stringify({ error: 'Move code is required' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

        // Extract module name from Move code
    const moduleNameMatch = moveCode.match(/module\s+(\w+::)?(\w+)/);
    const moduleName = moduleNameMatch ? moduleNameMatch[2] || 'module' : 'module';

    // Create a new burner wallet
    console.log('Creating burner wallet...');
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();
    // Get private key as hex
    const privateKeyBytes = keypair.getSecretKey();
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
    
    console.log(`Using module name: ${moduleName}`);

    // Fund the burner wallet from the master wallet (if configured)
    if (MASTER_WALLET_MNEMONIC) {
      try {
        console.log('Funding burner wallet...');
        // Convert mnemonic to keypair
        let masterKeypair;
        try {
          // First try as a base64-encoded private key
          masterKeypair = Ed25519Keypair.fromSecretKey(fromB64(MASTER_WALLET_MNEMONIC));
        } catch (e) {
          // If that fails, try as a mnemonic phrase
          masterKeypair = Ed25519Keypair.deriveKeypair(MASTER_WALLET_MNEMONIC);
        }
        
        // Request test tokens from the faucet
        const faucetResponse = await fetch(`https://faucet.${SUI_NETWORK}.sui.io/gas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            FixedAmountRequest: {
              recipient: address
            }
          })
        });
        
        if (!faucetResponse.ok) {
          throw new Error(`Failed to fund wallet: ${await faucetResponse.text()}`);
        }
        
        // Wait a moment for the faucet to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Transfer some SUI to the burner wallet
        const tx = new Transaction();
        tx.setSender(masterKeypair.toSuiAddress());
        const [coin] = tx.splitCoins(tx.gas, [GAS_BUDGET]);
        tx.transferObjects([coin], address);
        
        await client.signAndExecuteTransaction({
          transaction: tx,
          signer: masterKeypair,
        });
        
        console.log(`Funded burner wallet ${address} with ${GAS_BUDGET} MIST`);
      } catch (error) {
        console.error('Error funding burner wallet:', error);
        // Continue even if funding fails - the user can fund manually
      }
    }

    // Create a temporary directory for the Move package
    const tempDir = join(tmpdir(), `sui-studio-${Date.now()}`);
    const sourcesDir = join(tempDir, 'sources');
    const moveTomlPath = join(tempDir, 'Move.toml');
    
    // Create directory structure
    mkdirSync(sourcesDir, { recursive: true });
    
    // Write Move.toml
    const moveTomlContent = `[package]
name = "sui_studio_pkg"
version = "0.0.1"

[addresses]
sui_studio = "${address}"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[dev-dependencies]`;
    
    writeFileSync(moveTomlPath, moveTomlContent);
    
    // Write the Move module
    const moveFileName = 'module.move';
    const moveFilePath = join(sourcesDir, moveFileName);
    writeFileSync(moveFilePath, moveCode);

    try {
      // Build the Move package
      console.log('Building Move package...');
      const buildOutput = execSync(
        `sui move build --dump-bytecode-as-base64 --path "${tempDir}"`,
        { encoding: 'utf-8' }
      );
      
      // Parse the build output to get the compiled modules
      // Split by newlines and filter out empty lines
      const modules = buildOutput
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      if (modules.length === 0) {
        throw new Error('No compiled modules found in build output');
      }

      // Publish the package
      console.log('Publishing package...');
      const tx = new Transaction();
      tx.setSender(address);
      
      // Publish the compiled modules
      const [upgradeCap] = tx.publish({
        modules: modules,
        dependencies: ['0x2'] // Only need the Sui framework
      });

    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });      
      console.log('Publish result:', result);
      
      if (result.effects?.status?.status !== 'success') {
        throw new Error('Publish transaction failed');
      }
      
      // Extract the package ID and upgrade capability from the transaction effects
      // Find the package object in the created objects
      const packageObj = result.effects?.created?.find(
        (obj) => obj.owner === 'Immutable' && obj.reference?.objectId
      );
      
      if (!packageObj) {
        throw new Error('Failed to find package object in transaction effects');
      }
      
      const packageId = packageObj.reference.objectId;
      
      if (!packageId) {
        throw new Error('Failed to extract package ID from publish result');
      }
      
      console.log(`Published package ${packageId}`);
      
      // Call the init function if it exists
      try {
        const initTx = new Transaction();
        initTx.setSender(address);
        // Use the extracted module name or default to 'module'
        const targetModuleName = moduleName || 'module';
        initTx.moveCall({
          target: `${packageId}::${targetModuleName}::init`,
          arguments: [],
        });
        
        const initResult = await client.signAndExecuteTransaction({
          transaction: initTx,
          signer: keypair,
        });
        
        if (initResult.effects?.status?.status !== 'success') {
          throw new Error('Init transaction failed');
        }
        
        console.log('Successfully initialized module');
        
        // Extract the created object ID from the init transaction
        const objectId = initResult.effects?.created?.[0]?.reference?.objectId;
        
        return new Response(
          JSON.stringify({
            packageId,
            objectId: objectId || null,
            privateKeyHex,
            address,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        
      } catch (initError) {
        console.warn('No init function found or init failed, continuing...', initError);
        
        // If init fails, still return success but without an objectId
        return new Response(
          JSON.stringify({
            packageId,
            objectId: null,
            privateKeyHex,
            address,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (error) {
      console.error('Error during deployment:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to deploy contract',
          details: error instanceof Error ? error.message : 'Unknown error',
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error: any) {
    console.error('Deployment error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to deploy contract',
        details: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }), 
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}
