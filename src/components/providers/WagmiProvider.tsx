import { createConfig, http, WagmiProvider } from "wagmi";
import { base, degen, mainnet, optimism, unichain } from "wagmi/chains"; // Keep existing general imports
import { monadTestnet as 공식MonadTestnet } from "wagmi/chains"; // Try importing official monadTestnet
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { coinbaseWallet, metaMask } from 'wagmi/connectors';
import { APP_NAME, APP_ICON_URL, APP_URL } from "~/lib/constants";
import { useEffect, useState } from "react";
import { useConnect, useAccount } from "wagmi";
import React from "react";

// Custom hook for Coinbase Wallet detection and auto-connection
function useCoinbaseWalletAutoConnect() {
  const [isCoinbaseWallet, setIsCoinbaseWallet] = useState(false);
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();

  useEffect(() => {
    // Check if we're running in Coinbase Wallet
    const checkCoinbaseWallet = () => {
      const isInCoinbaseWallet = window.ethereum?.isCoinbaseWallet || 
        window.ethereum?.isCoinbaseWalletExtension ||
        window.ethereum?.isCoinbaseWalletBrowser;
      setIsCoinbaseWallet(!!isInCoinbaseWallet);
    };
    
    checkCoinbaseWallet();
    window.addEventListener('ethereum#initialized', checkCoinbaseWallet);
    
    return () => {
      window.removeEventListener('ethereum#initialized', checkCoinbaseWallet);
    };
  }, []);

  useEffect(() => {
    // Auto-connect if in Coinbase Wallet and not already connected
    // Ensure connectors are available and coinbaseWallet is likely connectors[1]
    if (isCoinbaseWallet && !isConnected && connectors && connectors.length > 1 && connectors[1]) {
      connect({ connector: connectors[1] }); // Coinbase Wallet connector
    }
  }, [isCoinbaseWallet, isConnected, connect, connectors]);

  return isCoinbaseWallet;
}

// Define our custom Monad Testnet in case the official one isn't available or needs override
const customMonadTestnet = {
  id: 10143,
  name: 'Monad Testnet (Custom)',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
    public: {
      http: ['https://testnet-rpc.monad.xyz'],
    }
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
} as const;

// Use the official monadTestnet if available, otherwise fall back to custom definition
// We will attempt to use 공식MonadTestnet first. If it causes issues (e.g. not found at runtime),
// we might need a more robust way to switch or just rely on custom.
// For now, let's prioritize the custom one to ensure it works with the provided details.
const selectedMonadTestnet = customMonadTestnet; // Prioritize custom for stability

export const config = createConfig({
  chains: [selectedMonadTestnet], // Use our selected Monad Testnet
  transports: {
    [selectedMonadTestnet.id]: http(),
  },
  connectors: [
    farcasterFrame(),
    coinbaseWallet({
      appName: APP_NAME,
      appLogoUrl: APP_ICON_URL,
      preference: 'all',
    }),
    metaMask({
      dappMetadata: {
        name: APP_NAME,
        url: APP_URL,
      },
    }),
  ],
});

const queryClient = new QueryClient();

// Wrapper component that provides Coinbase Wallet auto-connection
function CoinbaseWalletAutoConnect({ children }: { children: React.ReactNode }) {
  useCoinbaseWalletAutoConnect();
  return <>{children}</>;
}

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <CoinbaseWalletAutoConnect>
          {children}
        </CoinbaseWalletAutoConnect>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
