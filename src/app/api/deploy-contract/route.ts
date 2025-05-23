import { 
  Ed25519Keypair,
  JsonRpcProvider,
  RawSigner,
  SuiClient,
  TransactionBlock,
  SuiTransactionBlockResponse
} from '@mysten/sui';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Configuration
const SUI_NETWORK = 'testnet';
const SUI_RPC_URL = 'https://fullnode.testnet.sui.io:443';
const MASTER_WALLET_MNEMONIC = process.env.MASTER_WALLET_MNEMONIC || '';
const GAS_BUDGET = 100000000; // 0.1 SUI

// Initialize Sui client
const connection = new SuiClient({
  fullnode: SUI_RPC_URL,
  faucet: `https://faucet.${SUI_NETWORK}.sui.io/gas`,
  websocket: `wss://fullnode.${SUI_NETWORK}.sui.io:443`,
});

const provider = new JsonRpcProvider(connection);

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

    // Create a new burner wallet
    console.log('Creating burner wallet...');
    const keypair = new Ed25519Keypair();
    const address = keypair.getPublicKey().toSuiAddress();
    const privateKeyHex = Buffer.from(keypair.export().privateKey).toString('hex');
    const signer = new RawSigner(keypair, provider);

    // Fund the burner wallet from the master wallet (if configured)
    if (MASTER_WALLET_MNEMONIC) {
      try {
        console.log('Funding burner wallet...');
        const masterKeypair = Ed25519Keypair.deriveKeypairFromMnemonic(MASTER_WALLET_MNEMONIC);
        const masterSigner = new RawSigner(masterKeypair, provider);
        
        // Request test tokens
        await connection.requestSuiFromFaucet(address);
        
        // Transfer some SUI to the burner wallet
        const tx = new TransactionBlock();
        const [coin] = tx.splitCoins(tx.gas, [tx.pure(GAS_BUDGET)]);
        tx.transferObjects([coin], tx.pure(address));
        
        await masterSigner.signAndExecuteTransactionBlock({
          transactionBlock: await tx.build({ client: connection }),
        });
        
        console.log(`Funded burner wallet ${address} with ${GAS_BUDGET} MIST`);
      } catch (error) {
        console.error('Error funding burner wallet:', error);
        // Continue even if funding fails - the user can fund manually
      }
    }

    // Create a temporary file for the Move module
    const moduleName = `counter_${Date.now()}`;
    const moveFileName = `${moduleName}.move`;
    const moveFilePath = join('/tmp', moveFileName);
    writeFileSync(moveFilePath, moveCode);

    try {
      // Publish the package
      console.log('Publishing package...');
      const publishTxn = await signer.publish({
        compiledModules: [moveCode],
        dependencies: ['0x1', '0x2', '0x3'], // Core framework packages
      });

      console.log('Publish transaction:', publishTxn);
      
      // Wait for the transaction to complete
      const publishResult = await provider.waitForTransactionBlock({
        digest: publishTxn.digest,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      console.log('Publish result:', publishResult);
      
      if (!publishResult.effects?.status?.status || publishResult.effects.status.status !== 'success') {
        throw new Error('Publish transaction failed');
      }

      // Extract package ID and object ID from the publish result
      const packageId = publishResult.effects.created?.[0]?.reference?.objectId;
      const objectId = publishResult.effects.created?.[1]?.reference?.objectId;

      if (!packageId || !objectId) {
        throw new Error('Failed to extract package ID or object ID from publish result');
      }

      console.log(`Published package ${packageId} with object ${objectId}`);
      
      // Call the init function if it exists
      try {
        const tx = new TransactionBlock();
        tx.moveCall({
          target: `${packageId}::${moduleName}::init`,
          arguments: [],
        });
        
        await signer.signAndExecuteTransactionBlock({
          transactionBlock: await tx.build({ client: connection }),
        });
        console.log('Initialized module');
      } catch (initError) {
        console.warn('No init function found or init failed, continuing...', initError);
      }

      return new Response(
        JSON.stringify({
          packageId,
          objectId,
          privateKeyHex: privateKeyHex,
          address,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
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
