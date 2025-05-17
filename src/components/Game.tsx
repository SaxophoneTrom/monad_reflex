"use client";

import { useState, useEffect } from 'react';
import { watchContractEvent, writeContract } from 'wagmi/actions';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import sdk from '@farcaster/frame-sdk';
import { config } from '~/components/providers/WagmiProvider'; // Import wagmi config
import { monadTestnet } from 'wagmi/chains'; // Attempt to import monadTestnet from wagmi/chains to get its ID

// TODO: Replace with actual ABI after compiling the contract
const VRFReflexBlitzABI = [
  // ... (ABI content from compiled contract)
  // For now, let's use a minimal version based on the markdown
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint40",
        "name": "revealTime",
        "type": "uint40"
      }
    ],
    "name": "FlashScheduled",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "requestFlash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "submitTap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  { // Added TapResult event for potential feedback
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint40",
        "name": "reactionTime",
        "type": "uint40"
      }
    ],
    "name": "TapResult",
    "type": "event"
  },
  // Added new events for Supra dVRF integration debugging/logging
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "clientNonce",
        "type": "uint256"
      }
    ],
    "name": "RandomNumberRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "clientNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "randomNumber",
        "type": "uint256"
      }
    ],
    "name": "RandomNumberFulfilled",
    "type": "event"
  }
];

// TODO: Replace with your deployed contract address
const CONTRACT_ADDRESS = '0xYourContractAddress';
// Use the ID from the imported monadTestnet object
const MONAD_TESTNET_CHAIN_ID = monadTestnet.id; 

const truncateAddress = (address: string | undefined) => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export default function ReflexBlitzGame() {
  const [scheduledTime, setScheduledTime] = useState<number>(0);
  const [isButtonVisible, setIsButtonVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gameMessage, setGameMessage] = useState<string>("");

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError, isPending: isConnecting } = useConnect();
  const { switchChain, error: switchChainError, isPending: isSwitchingChain } = useSwitchChain();

  // Call ready on mount
  useEffect(() => {
    sdk.actions.ready();
  }, []);

  useEffect(() => {
    if (!isConnected || !address || chain?.id !== MONAD_TESTNET_CHAIN_ID) {
        if (isConnected && chain?.id !== MONAD_TESTNET_CHAIN_ID) {
            setGameMessage("Please switch to Monad Testnet to play.");
        } else {
            setGameMessage("Please connect your wallet to play.");
        }
        return;
    }
    setGameMessage(""); 

    const unwatch = watchContractEvent(
      config,
      {
        address: CONTRACT_ADDRESS,
        abi: VRFReflexBlitzABI,
        eventName: 'FlashScheduled',
        onLogs: (logs: any) => {
          logs.forEach((log: any) => {
            const eventData = log?.args as { player: string; revealTime: bigint };
            if (eventData && eventData.player.toLowerCase() === address.toLowerCase()) {
              setScheduledTime(Number(eventData.revealTime) * 1000);
              setIsButtonVisible(false);
              setGameMessage("Get ready...");
              console.log('FlashScheduled event received for current user:', eventData);
            }
          });
        },
      }
    );

    const unwatchTapResult = watchContractEvent(config, {
        address: CONTRACT_ADDRESS,
        abi: VRFReflexBlitzABI,
        eventName: 'TapResult',
        onLogs: (logs: any) => {
            logs.forEach((log: any) => {
                const eventData = log?.args as { player: string; success: boolean; reactionTime: bigint };
                if (eventData && eventData.player.toLowerCase() === address.toLowerCase()) {
                    if (eventData.success) {
                        setGameMessage(`Success! Your time: ${Number(eventData.reactionTime) / 1000}s`);
                    } else {
                        setGameMessage(`Try again! Reaction time: ${Number(eventData.reactionTime) / 1000}s`);
                    }
                    console.log('TapResult event received:', eventData);
                }
            });
        }
    });

    return () => {
        unwatch();
        unwatchTapResult();
    }
  }, [address, isConnected, chain]);

  useEffect(() => {
    if (!scheduledTime || !isConnected || chain?.id !== MONAD_TESTNET_CHAIN_ID) return;

    const now = Date.now();
    const delay = scheduledTime - now;

    if (delay > 0) {
      setIsButtonVisible(false);
      const timer = setTimeout(() => {
        if (Date.now() >= scheduledTime) { 
            setIsButtonVisible(true);
            setGameMessage("TAP NOW!");
        }
      }, delay);
      return () => clearTimeout(timer);
    } else if (now >= scheduledTime) { 
      setIsButtonVisible(true);
      setGameMessage("TAP NOW!");
    }
  }, [scheduledTime, isConnected, chain]);

  const handleRequestFlash = async () => {
    if (!isConnected || !address) {
      setGameMessage("Please connect your wallet first.");
      return;
    }
    if (chain?.id !== MONAD_TESTNET_CHAIN_ID) {
      setGameMessage("Please switch to Monad Testnet to request flash.");
      return;
    }
    setIsLoading(true);
    setGameMessage("Requesting flash... please confirm in your wallet.");
    try {
      const result = await writeContract(config, {
        address: CONTRACT_ADDRESS,
        abi: VRFReflexBlitzABI,
        functionName: 'requestFlash',
      });
      console.log('Request flash transaction sent:', result);
      setGameMessage("Flash requested! Waiting for VRF...");
    } catch (error: any) {
      console.error('Error requesting flash:', error);
      setGameMessage(`Error: ${error.shortMessage || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitTap = async () => {
    if (!isConnected || !address) {
      setGameMessage("Please connect your wallet first.");
      return;
    }
    if (chain?.id !== MONAD_TESTNET_CHAIN_ID) {
      setGameMessage("Please switch to Monad Testnet to submit tap.");
      return;
    }
    if (!isButtonVisible) {
        setGameMessage("Wait for the button to appear!");
        return;
    }
    setIsLoading(true);
    setGameMessage("Submitting tap...");
    try {
      const result = await writeContract(config, {
        address: CONTRACT_ADDRESS,
        abi: VRFReflexBlitzABI,
        functionName: 'submitTap',
      });
      console.log('Submit tap transaction sent:', result);
      setIsButtonVisible(false);
      setGameMessage("Tap submitted! Waiting for result...");
    } catch (error: any) {
      console.error('Error submitting tap:', error);
      if (error.shortMessage?.includes("Reaction out of range")) {
        setGameMessage("Oops! Reaction out of time range.");
      } else if (error.shortMessage?.includes("Too early or no flash")) {
        setGameMessage("Too early, or no flash active for you.");
      } else {
        setGameMessage(`Error: ${error.shortMessage || error.message}`);
      }
       setIsButtonVisible(false);
    } finally {
      setIsLoading(false);
    }
  };

  const renderWalletControls = () => {
    if (!isConnected) {
      return (
        <div className="mb-6">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              disabled={isConnecting}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out w-full mb-3 disabled:opacity-70"
            >
              {isConnecting ? 'Connecting...' : `Connect ${connector.name}`}
            </button>
          ))}
          {connectError && <p className="text-red-400 mt-2 text-sm">Error connecting: {connectError.message}</p>}
        </div>
      );
    }

    // Use monadTestnet.name for display if available
    const monadDisplayName = typeof monadTestnet !== 'undefined' && monadTestnet.name ? monadTestnet.name : 'Monad Testnet (Configured)';

    if (chain?.id !== MONAD_TESTNET_CHAIN_ID) {
      return (
        <div className="mb-6">
          <p className="text-sm text-yellow-400 mb-2">Connected to {chain?.name || 'wrong network'}.</p>
          <button
            onClick={() => switchChain({ chainId: MONAD_TESTNET_CHAIN_ID })}
            disabled={isSwitchingChain}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out w-full disabled:opacity-70"
          >
            {isSwitchingChain ? 'Switching...' : `Switch to ${monadDisplayName}`}
          </button>
          {switchChainError && <p className="text-red-400 mt-2 text-sm">Error switching: {switchChainError.message}</p>}
        </div>
      );
    }

    return (
      <div className="mb-6">
        <p className="text-sm text-green-400">Connected to {monadDisplayName}</p>
        <p className="text-xs text-gray-400">Address: {truncateAddress(address)}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 font-sans">
      <div className="p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-md text-center">
        <h1 className="text-5xl font-bold mb-6 text-purple-400 tracking-tight">Reflex Blitz</h1>

        {renderWalletControls()}

        <button
          onClick={handleRequestFlash}
          disabled={isLoading || !isConnected || chain?.id !== MONAD_TESTNET_CHAIN_ID || (scheduledTime > Date.now() && !isButtonVisible)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg text-xl transition duration-150 ease-in-out disabled:opacity-50 mb-8 w-full"
        >
          {isLoading && gameMessage.startsWith("Requesting") ? 'Processing...' : 'Request Flash'}
        </button>

        <div className="h-40 flex items-center justify-center">
            {isButtonVisible && isConnected && chain?.id === MONAD_TESTNET_CHAIN_ID && (
            <button
                onClick={handleSubmitTap}
                disabled={isLoading || !isConnected}
                className="animate-pulse bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold py-10 px-12 rounded-full text-4xl shadow-lg transition duration-150 ease-in-out disabled:opacity-50 transform hover:scale-105"
            >
                TAP!
            </button>
            )}
        </div>

        {gameMessage && (
          <p className={`mt-6 text-lg ${gameMessage.startsWith("Error") || gameMessage.startsWith("Oops") || gameMessage.includes("wrong network") || gameMessage.includes("Please switch") ? 'text-yellow-400' : 'text-purple-300'}`}>
            {gameMessage}
          </p>
        )}
         <p className="mt-8 text-xs text-gray-500">
          Instructions: Connect wallet. Switch to Monad Testnet. Click "Request Flash". A "TAP!" button will appear after a random delay. Click it as fast as you can!
        </p>
      </div>
    </div>
  );
}

// Wagmi v2 requires config to be passed to writeContract and watchContractEvent
// This config is typically created in a provider. We need to ensure this is set up.
// For now, this is a placeholder.

