import { execSync } from 'child_process';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import fs from 'fs';
import path from 'path';

// Environment variables
const MASTER_WALLET_MNEMONIC = process.env.MASTER_WALLET_MNEMONIC;
const SUI_NETWORK = process.env.SUI_NETWORK || 'testnet';

export async function POST(request: Request) {
  try {
    const { moveCode } = await request.json();

    if (!moveCode) {
      return new Response(
        JSON.stringify({ error: 'Move code is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Create a temporary directory for the Move project
    const tempDir = path.join(process.cwd(), 'temp-contract');
    const sourcesDir = path.join(tempDir, 'sources');
    const moveTomlPath = path.join(tempDir, 'Move.toml');
    const moveFilePath = path.join(sourcesDir, 'contract.move');

    try {
      // Create directory structure
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.mkdirSync(sourcesDir, { recursive: true });
      }

      // 2. Create Move.toml
      const moveTomlContent = `[package]
name = "temp_contract"
version = "0.0.1"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
temp_contract = "0x0"
`;
      fs.writeFileSync(moveTomlPath, moveTomlContent);

      // 3. Write the Move code
      fs.writeFileSync(moveFilePath, moveCode);

      // 4. Build the Move package
      const buildOutput = execSync('sui move build --dump-bytecode-as-base64', {
        cwd: tempDir,
        encoding: 'utf-8',
      });

      // 5. Parse the build output to get the compiled modules
      const modulesMatch = buildOutput.match(/Compiled Modules: \[([^\]]+)\]/);
      if (!modulesMatch) {
        throw new Error('Failed to extract compiled modules from build output');
      }

      const modules = modulesMatch[1]
        .split(',')
        .map((m: string) => m.trim().replace(/"/g, ''))
        .filter(Boolean);

      // 6. Set up the Sui client
      const client = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });

      // 7. Generate or use the master wallet
      let keypair;
      let isUsingMasterWallet = false;

      if (MASTER_WALLET_MNEMONIC) {
        // Use the master wallet for deployment
        keypair = Ed25519Keypair.deriveKeypair(MASTER_WALLET_MNEMONIC);
        isUsingMasterWallet = true;
      } else {
        // Fallback: Generate a new burner wallet
        keypair = Ed25519Keypair.generate();
      }

      const address = keypair.getPublicKey().toSuiAddress();
      const privateKeyHex = Buffer.from(keypair.getSecretKey().slice(0, 32)).toString('hex');

      // 8. Fund the wallet if needed (only for testnet/devnet)
      if (!isUsingMasterWallet && (SUI_NETWORK === 'testnet' || SUI_NETWORK === 'devnet')) {
        try {
          // Try to request from faucet first
          await fetch(`https://faucet.${SUI_NETWORK}.sui.io/gas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
          });

          // Wait for the transaction to complete
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          console.warn('Faucet request failed, trying master wallet funding...');
          
          if (MASTER_WALLET_MNEMONIC) {
            const masterKeypair = Ed25519Keypair.deriveKeypair(MASTER_WALLET_MNEMONIC);
            const masterClient = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });
            
            const tx = new TransactionBlock();
            const [coin] = tx.splitCoins(tx.gas, [tx.pure(1000000000)]); // 1 SUI
            tx.transferObjects([coin], tx.pure(address));
            
            await masterClient.signAndExecuteTransactionBlock({
              signer: masterKeypair,
              transactionBlock: tx,
            });

            // Wait for the transaction to complete
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      // 9. Publish the package using TransactionBlock
      const tx = new TransactionBlock();
      tx.setSender(address);
      tx.setGasBudget(100000000); // 0.1 SUI
      const [upgradeCap] = tx.publish({ modules });

      const publishTxn = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      // 10. Extract package ID and object ID
      const packageId = publishTxn.objectChanges?.find(
        (change: any) => change.type === 'published'
      )?.packageId;

      if (!packageId) {
        throw new Error('Failed to extract package ID from transaction');
      }

      // 11. Try to call the init function
      let objectId = null;
      const moduleNameMatch = moveCode.match(/module\s+(\w+)\s*::\s*(\w+)/) || 
                            moveCode.match(/module\s+(\w+)\s*\{/);
      
      if (moduleNameMatch) {
        const moduleName = moduleNameMatch[moduleNameMatch.length - 1];
        
        try {
          const initTx = new TransactionBlock();
          initTx.moveCall({
            target: `${packageId}::${moduleName}::init`,
          });

          const initResult = await client.signAndExecuteTransactionBlock({
            signer: keypair,
            transactionBlock: initTx,
          });

          // Try to extract the created object ID
          if (initResult.objectChanges) {
            const createdObject = initResult.objectChanges.find(
              (change: any) => change.type === 'created'
            );
            if (createdObject) {
              objectId = createdObject.objectId;
            }
          }
        } catch (error) {
          console.warn('Failed to call init function:', error);
          // Continue without objectId - some contracts might not have an init function
        }
      }

      // 12. Clean up the temporary directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary directory:', cleanupError);
      }

      // 13. Return the results
      return new Response(
        JSON.stringify({
          packageId,
          objectId,
          privateKeyHex,
          address,
          isUsingMasterWallet,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      // Clean up the temporary directory in case of error
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary directory:', cleanupError);
      }

      throw error;
    }

  } catch (error) {
    console.error('Deployment error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to deploy contract',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}