import { BrowserProvider, Contract } from 'ethers';
import deployment from '../contracts/deployment.json';

export const ACTIVE_WALLET_KEY = 'monconnect.activeWallet';

// Role-identity NFT addresses (VerifiedNft x2) - generated into src/contracts/deployment.json by the deploy script.
export const ORGANIZER_NFT_ADDRESS: string = deployment.organizerNft.address;
export const SERVICE_PROVIDER_NFT_ADDRESS: string = deployment.serviceProviderNft.address;

// Complete ABI for the VerifiedNft contract - safeMint(address) is the mint function
const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function safeMint(address to)',
  'function owner() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

export function getProvider(): any {
  if (typeof (window as any).ethereum === 'undefined') {
    console.error('[getProvider] window.ethereum is not available - MetaMask not installed?');
    return null;
  }
  return new BrowserProvider((window as any).ethereum);
}

export async function requestWalletAccounts(): Promise<string[]> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('MetaMask is not installed. Please install it to continue.');

  try {
    await ethereum.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch (error: any) {
    if (error?.code !== -32601 && error?.code !== 4200) throw error;
  }

  let accounts: string[] = await ethereum.request({ method: 'eth_accounts' });
  if (!accounts.length) {
    accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  }
  return accounts;
}

export async function hasNFT(providerOrSigner: any, owner: string, contractAddress: string): Promise<boolean> {
  try {
    if (!providerOrSigner) {
      console.warn('[hasNFT] no provider/signer provided');
      return false;
    }
    if (!owner) {
      console.warn('[hasNFT] no owner address provided');
      return false;
    }
    
    // Verify we're checking the right address
    console.log('[hasNFT] checking balance for address:', owner);
    console.log('[hasNFT] contract address:', contractAddress);
    
    // Check if the contract exists at this address
    const code = await providerOrSigner.getCode?.(contractAddress) || 
                 await providerOrSigner.provider?.getCode?.(contractAddress);
    
    if (!code || code === '0x') {
      console.error('[hasNFT] No contract found at address:', contractAddress);
      console.error('[hasNFT] Make sure the contract is deployed on Monad Testnet (chainId 10143)');
      return false;
    }
    
    console.log('[hasNFT] Contract code exists, length:', code.length);
    
    const contract = new Contract(contractAddress, ERC721_ABI, providerOrSigner);
    
    const balance = await contract.balanceOf(owner);
    const balanceNum = typeof balance === 'bigint' ? Number(balance) : Number(balance);
    const hasToken = balanceNum > 0;
    
    console.log('[hasNFT] balance:', balance.toString(), 'hasToken:', hasToken);
    return hasToken;
  } catch (err: any) {
    console.error('[hasNFT] error:', err?.message || err);
    // If balanceOf fails, assume no NFT rather than blocking the flow
    return false;
  }
}

export async function mintNFTAndWait(signer: any, contractAddress: string): Promise<any> {
  console.log('[mintNFTAndWait] Starting mint process...');
  
  if (!signer) {
    const error = 'No signer available - wallet not connected?';
    console.error('[mintNFTAndWait]', error);
    throw new Error(error);
  }

  try {
    // Get signer address
    const signerAddress = await signer.getAddress();
    console.log('[mintNFTAndWait] Signer address:', signerAddress);

    // Create contract instance
    const contract = new Contract(contractAddress, ERC721_ABI, signer);
    console.log('[mintNFTAndWait] Contract instance created at:', contractAddress);

    // Verify contract exists on current network
    const provider = signer.provider;
    const network = await provider.getNetwork();
    console.log('[mintNFTAndWait] Current network:', {
      chainId: network.chainId.toString(),
      name: network.name
    });

    // Check if contract code exists at address
    const code = await provider.getCode(contractAddress);
    console.log('[mintNFTAndWait] Contract code length:', code.length);
    
    if (!code || code === '0x') {
      throw new Error(`Contract not found at ${contractAddress} on chainId ${network.chainId}. Make sure it's deployed on Monad Testnet (chainId 10143).`);
    }

    // Try to get contract name to verify connection
    try {
      const name = await contract.name();
      const symbol = await contract.symbol();
      console.log('[mintNFTAndWait] Contract name:', name, 'symbol:', symbol);
    } catch (e) {
      console.warn('[mintNFTAndWait] Could not read contract name/symbol - contract may not be ERC721 standard or missing these functions');
    }

    // Try to check if already minted (skip if it fails)
    try {
      const currentBalance = await contract.balanceOf(signerAddress);
      console.log('[mintNFTAndWait] Current balance before mint:', currentBalance.toString());
      
      if (Number(currentBalance) > 0) {
        console.warn('[mintNFTAndWait] Address already has NFT, balance:', currentBalance.toString());
        return { alreadyMinted: true };
      }
    } catch (balanceErr) {
      console.warn('[mintNFTAndWait] Could not check current balance, proceeding with mint anyway');
    }

    // Call safeMint(address)
    console.log('[mintNFTAndWait] Calling safeMint with address:', signerAddress);
    console.log('[mintNFTAndWait] This should trigger MetaMask...');
    
    const tx = await contract.safeMint(signerAddress);
    console.log('[mintNFTAndWait] Transaction sent! Hash:', tx.hash);
    console.log('[mintNFTAndWait] Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('[mintNFTAndWait] Transaction confirmed!');
    console.log('[mintNFTAndWait] Receipt:', {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status
    });

    return receipt;
  } catch (err: any) {
    console.error('[mintNFTAndWait] Error during mint:', err);
    
    // Better error messages
    if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
      throw new Error('Transaction rejected by user');
    }
    
    if (err.message && err.message.includes('user rejected')) {
      throw new Error('Transaction rejected by user');
    }

    if (err.reason) {
      throw new Error(`Contract error: ${err.reason}`);
    }

    if (err.data?.message) {
      throw new Error(`Contract error: ${err.data.message}`);
    }

    throw new Error(err.message || 'Unknown error during mint');
  }
}
