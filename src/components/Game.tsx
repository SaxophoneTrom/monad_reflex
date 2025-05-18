"use client";

import { useState, useEffect, useCallback } from 'react';
import { watchContractEvent, writeContract, readContract, GetBlockNumberReturnType } from 'wagmi/actions';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import sdk from '@farcaster/frame-sdk';
import { config } from '~/components/providers/WagmiProvider';
import { monadTestnet } from 'wagmi/chains';
import { type Address, parseEther, formatEther, Abi, Log, AbiItem } from 'viem';

// Updated ABI for VRFReflexBlitz
const VRFReflexBlitzABI_UPDATED: Abi = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "_initialPlayPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "_initialFreePlayInterval", "type": "uint256" },
      { "internalType": "uint256", "name": "_initialPlaysPerSession", "type": "uint256" }
    ],
    "stateMutability": "nonpayable", "type": "constructor"
  },
  { "anonymous": false, "inputs": [ { "indexed": true, "internalType": "address", "name": "player", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "requestTimestamp", "type": "uint256" }, { "indexed": false, "internalType": "bool", "name": "newSessionStartedAsFree", "type": "bool" }, { "indexed": false, "internalType": "uint256", "name": "playsLeftInSession", "type": "uint256" } ], "name": "FlashRequested", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": true, "internalType": "address", "name": "owner", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" } ], "name": "FundsWithdrawn", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": false, "internalType": "uint256", "name": "oldInterval", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "newInterval", "type": "uint256" } ], "name": "FreePlayIntervalUpdated", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" } ], "name": "OwnershipTransferred", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": false, "internalType": "uint256", "name": "oldPrice", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "newPrice", "type": "uint256" } ], "name": "PlayPriceUpdated", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": false, "internalType": "uint256", "name": "oldPlays", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "newPlays", "type": "uint256" } ], "name": "PlaysPerSessionUpdated", "type": "event" },
  { "inputs": [], "name": "freePlayInterval", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "player", "type": "address" } ], "name": "getRemainingFreePlayCooldown", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "player", "type": "address" } ], "name": "getRemainingPlaysInCurrentSession", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "", "type": "address" } ], "name": "lastPlayTime", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "playPrice", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "playsPerSession", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "", "type": "address" } ], "name": "remainingPlaysInSession", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "requestFlash", "outputs": [], "stateMutability": "payable", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "_newFreePlayInterval", "type": "uint256" } ], "name": "setFreePlayInterval", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "_newPlayPrice", "type": "uint256" } ], "name": "setPlayPrice", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "_newPlaysPerSession", "type": "uint256" } ], "name": "setPlaysPerSession", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "withdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "stateMutability": "payable", "type": "receive" }
] as const;

// ABI for ReflexBlitzNFT (Updated)
const ReflexBlitzNFTABI: Abi = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  { "inputs": [{ "internalType": "string", "name": "name", "type": "string" },{ "internalType": "string", "name": "version", "type": "string" } ], "name": "EIP712DomainChanged", "type": "event", "anonymous": false },
  { "anonymous": false, "inputs": [ { "indexed": true, "internalType": "address", "name": "player", "type": "address" }, { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "score", "type": "uint256" }, { "indexed": false, "internalType": "string", "name": "rank", "type": "string" }, { "indexed": false, "internalType": "uint256", "name": "nonce", "type": "uint256" } ], "name": "NFTMintedWithSignature", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" } ], "name": "OwnershipTransferred", "type": "event" }, 
  { "anonymous": false, "inputs": [ { "indexed": false, "internalType": "string[]", "name": "newRanks", "type": "string[]" }, { "indexed": false, "internalType": "uint256[]", "name": "newThresholds", "type": "uint256[]" } ], "name": "RankSettingsUpdated", "type": "event" },
  { "anonymous": false, "inputs": [ { "indexed": true, "internalType": "address", "name": "newSignerAddress", "type": "address" } ], "name": "SignerAddressUpdated", "type": "event" },
  { "inputs": [], "name": "MINT_PRICE", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "MINT_TYPEHASH", "outputs": [ { "internalType": "bytes32", "name": "", "type": "bytes32" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "score", "type": "uint256" } ], "name": "determineRank", "outputs": [ { "internalType": "string", "name": "", "type": "string" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "domainSeparator", "outputs": [{"internalType": "bytes32","name": "","type": "bytes32"}], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "user", "type": "address" } ], "name": "getTokensByUser", "outputs": [ { "internalType": "uint256[]", "name": "", "type": "uint256[]" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "tokenId", "type": "uint256" } ], "name": "getTokenScore", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "player", "type": "address" }, { "internalType": "uint256", "name": "score", "type": "uint256" }, { "internalType": "uint256", "name": "nonce", "type": "uint256" }, { "internalType": "uint256", "name": "expiry", "type": "uint256" }, { "internalType": "bytes", "name": "signature", "type": "bytes" } ], "name": "mintWithSignature", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "payable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "ranks", "outputs": [ { "internalType": "string[]", "name": "", "type": "string[]" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "name": "rankThresholds", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "string[]", "name": "_newRanks", "type": "string[]" }, { "internalType": "uint256[]", "name": "_newThresholds", "type": "uint256[]" } ], "name": "setRankSettings", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "_signerAddress", "type": "address" } ], "name": "setSignerAddress", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "signerAddress", "outputs": [ { "internalType": "address", "name": "", "type": "address" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "name": "tokenScores", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "address", "name": "", "type": "address" } ], "name": "userTokens", "outputs": [ { "internalType": "uint256[]", "name": "", "type": "uint256[]" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "name": "usedNonces", "outputs": [ { "internalType": "bool", "name": "", "type": "bool" } ], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "withdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "stateMutability": "payable", "type": "receive" }
] as const;

// Contract Addresses (Update VRF_CONTRACT_ADDRESS after new deployment)
const NFT_CONTRACT_ADDRESS = '0xFed7E2293919283Ec67e2c65C1Da03B642c6D197';
const VRF_CONTRACT_ADDRESS = '0x2CbFE9F51354Ec590FF80d34D1f06D922aABDF24'; // ★★★ UPDATE THIS ★★★


// Use the ID from the imported monadTestnet object
const MONAD_TESTNET_CHAIN_ID = 10143; 

// Default Play and Mint Prices (can be fetched from contract)
const DEFAULT_PLAY_PRICE_ETH = "0.01";
const DEFAULT_MINT_PRICE_ETH = "0.1";

const MAX_REACTION_TIME_MS = 5000; // 5 seconds for successful tap (client-side)
const MIN_REACTION_TIME_MS = 10;  // Minimum plausible reaction time (client-side)

const truncateAddress = (address: string | undefined) => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// ResultModal Component
interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  isSuccess: boolean;
  reactionTimeMicroseconds?: number; // 反応時間（マイクロ秒）
  onMintNFT?: () => void; // NFTミント用コールバック
  isMintingNFT?: boolean; // NFTミント中かどうか
  nftMinted?: boolean; // NFTがミントされたかどうか
  nftTokenId?: number; // ミントされたNFTのトークンID
  previewSvgDataUrl?: string; // NFTプレビューのSVGデータURL
  mintPriceFromGame?: bigint; // 追加: ミント価格をGameコンポーネントから受け取る
}

const ResultModal: React.FC<ResultModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  isSuccess, 
  reactionTimeMicroseconds, 
  onMintNFT,
  isMintingNFT,
  nftMinted,
  nftTokenId,
  previewSvgDataUrl,
  mintPriceFromGame
}) => {
  if (!isOpen) return null;

  const canMintNFT = isSuccess && reactionTimeMicroseconds !== undefined && !nftMinted && !!onMintNFT && !message.toLowerCase().includes("nft minted successfully");
  const hasMintedThisNFT = nftMinted && nftTokenId !== undefined && message.toLowerCase().includes("nft minted successfully");
  const canShareScore = isSuccess && reactionTimeMicroseconds !== undefined;

  const SITE_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

  const handleShareMintedNFTToFarcaster = () => {
    if (nftTokenId === undefined) return;
    const shareUrl = `${SITE_URL}`;
    const farcasterIntentUrl = `https://warpcast.com/~/compose?text=Check%20out%20my%20Reflex%20Blitz%20NFT!&embeds[]=${encodeURIComponent(shareUrl)}`;
    sdk.actions.openUrl(farcasterIntentUrl); 
  };

  const handleShareScoreToFarcaster = () => {
    if (reactionTimeMicroseconds === undefined) return;
    const shareUrl = `${SITE_URL}`;
    const scoreMs = (reactionTimeMicroseconds / 1000).toFixed(3);
    const farcasterIntentUrl = `https://warpcast.com/~/compose?text=Check%20out%20my%20Reflex%20Blitz%20score:%20${scoreMs}%20ms!&embeds[]=${encodeURIComponent(shareUrl)}`;
    sdk.actions.openUrl(farcasterIntentUrl);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md text-center border-4 ${isSuccess ? 'border-green-500' : 'border-red-500'}`}>
        <h2 className={`text-4xl font-bold mb-6 ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>{title}</h2>
        <p className="text-xl mb-6 text-gray-200 whitespace-pre-line">{message}</p>
        
        {previewSvgDataUrl && isSuccess && !hasMintedThisNFT && (
          <div className="my-4 p-2 bg-gray-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-gray-300">NFT Preview (if minted):</h3>
            <img src={previewSvgDataUrl} alt="NFT Preview" className="w-full max-w-[250px] mx-auto rounded border border-gray-600" />
          </div>
        )}
        
        {canMintNFT && (
          <button
            onClick={onMintNFT}
            disabled={isMintingNFT}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out w-full mb-3 disabled:opacity-70"
          >
            {isMintingNFT ? 'Processing Mint...' : `Mint Record for ${mintPriceFromGame ? formatEther(mintPriceFromGame) : DEFAULT_MINT_PRICE_ETH} MON`}
          </button>
        )}

        {/* Share Score Button (always shown if score is valid) */}
        {canShareScore && !hasMintedThisNFT && (
            <button
              onClick={handleShareScoreToFarcaster}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out w-full mb-3"
            >
              Share Score (Unminted)
            </button>
        )}

        {hasMintedThisNFT && (
          <div className="my-3 p-4 bg-gray-700 rounded-lg">
            <p className="text-green-400 font-semibold mb-2">NFT Minted Successfully!</p>
            <p className="text-sm text-gray-300">Token ID: #{nftTokenId}</p>
            <a
              href={`https://magiceden.io/item-details/monad-testnet/${NFT_CONTRACT_ADDRESS}/${nftTokenId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 text-sm underline hover:text-blue-300 block mb-3"
            >
              View on Monad Explorer
            </a>
            {/*
            <button
              onClick={handleShareMintedNFTToFarcaster} // Renamed handler
              className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition duration-150 ease-in-out w-full"
            >
              Share Minted NFT on Farcaster
            </button>
            */}
          </div>
        )}

        <button
          onClick={onClose}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out w-full mt-2"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// イベントの引数の型を定義
type FlashRequestedEventArgs = {
  player: string;
  requestTimestamp: bigint;
  newSessionStartedAsFree: boolean;
  playsLeftInSession: bigint;
};

type NFTMintedWithSignatureEventArgs = {
  player: string;
  tokenId: bigint;
  score: bigint;
  rank: string;
  nonce: bigint;
};

// viemのLog型を拡張してargsを持つようにする
// Log<TBlockNumber, TBlockTag, TTopics, TData, TRemoved, TArgs>
// よりシンプルなアプローチ: イベント固有のログタイプを定義
interface DecodedEventLog<TArgs = Record<string, unknown>> extends Log {
  args: TArgs;
  eventName: string;
}

// 具体的なイベントログの型
// type FlashRequestedEventLog = DecodedEventLog<FlashRequestedEventArgs>; // 削除
// type NFTMintedWithSignatureEventLog = DecodedEventLog<NFTMintedWithSignatureEventArgs>; // 削除

export default function ReflexBlitzGame() {
  const [scheduledTime, setScheduledTime] = useState<number>(0);
  const [isButtonVisible, setIsButtonVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gameMessage, setGameMessage] = useState<string>("");
  const [flashRequestInitiatedTime, setFlashRequestInitiatedTime] = useState<number>(0);
  const [visualCueTime, setVisualCueTime] = useState<number>(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalSuccess, setModalSuccess] = useState(false);
  const [isWaitingForFlash, setIsWaitingForFlash] = useState(false);
  const [reactionTimeForMint, setReactionTimeForMint] = useState<number | undefined>(undefined);
  const [lastDisplayedReactionTimeMs, setLastDisplayedReactionTimeMs] = useState<number | null>(null);
  const [previewSvgDataUrl, setPreviewSvgDataUrl] = useState<string | undefined>(undefined);
  const [nftMintedForCurrentResult, setNftMintedForCurrentResult] = useState(false);
  const [lastMintedTokenId, setLastMintedTokenId] = useState<number | undefined>(undefined);
  const [isMintingNFT, setIsMintingNFT] = useState(false);

  // --- Game Config States (from VRFReflexBlitz contract) ---
  const [playPrice, setPlayPrice] = useState<bigint>(parseEther("0.01")); // Default/fallback
  const [freePlayInterval, setFreePlayInterval] = useState<number>(3600); // Default/fallback (seconds)
  const [playsPerSession, setPlaysPerSession] = useState<number>(3);     // Default/fallback
  const [remainingPlays, setRemainingPlays] = useState<number>(0);
  
  // --- Other Game States ---
  const [mintPrice, setMintPrice] = useState<bigint>(parseEther(DEFAULT_MINT_PRICE_ETH));
  const [freeSessionCooldown, setFreeSessionCooldown] = useState<number>(0); // Cooldown for the next FREE session
  const [isFreeSessionPossible, setIsFreeSessionPossible] = useState<boolean>(false); // Is a free session possible (cooldown 0 and no remaining plays)

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError, isPending: isConnecting } = useConnect();
  const { switchChain, error: switchChainError, isPending: isSwitchingChain } = useSwitchChain();

  useEffect(() => { sdk.actions.ready(); }, []);

  // Fetch contract data (game settings, NFT mint price, user's game state)
  useEffect(() => {
    const fetchGameData = async () => {
      if (isConnected && address && chain?.id === MONAD_TESTNET_CHAIN_ID) {
        try {
          // Read from VRFReflexBlitz
          const [
            fetchedPlayPrice,
            fetchedFreePlayInterval,
            fetchedPlaysPerSession,
            fetchedRemainingPlays,
            fetchedCooldown
          ] = await Promise.all([
            readContract(config, { address: VRF_CONTRACT_ADDRESS as Address, abi: VRFReflexBlitzABI_UPDATED, functionName: 'playPrice' }) as Promise<bigint>,
            readContract(config, { address: VRF_CONTRACT_ADDRESS as Address, abi: VRFReflexBlitzABI_UPDATED, functionName: 'freePlayInterval' }) as Promise<bigint>,
            readContract(config, { address: VRF_CONTRACT_ADDRESS as Address, abi: VRFReflexBlitzABI_UPDATED, functionName: 'playsPerSession' }) as Promise<bigint>,
            readContract(config, { address: VRF_CONTRACT_ADDRESS as Address, abi: VRFReflexBlitzABI_UPDATED, functionName: 'getRemainingPlaysInCurrentSession', args: [address] }) as Promise<bigint>,
            readContract(config, { address: VRF_CONTRACT_ADDRESS as Address, abi: VRFReflexBlitzABI_UPDATED, functionName: 'getRemainingFreePlayCooldown', args: [address] }) as Promise<bigint>
          ]);

          setPlayPrice(fetchedPlayPrice);
          setFreePlayInterval(Number(fetchedFreePlayInterval));
          const numPlaysPerSession = Number(fetchedPlaysPerSession);
          setPlaysPerSession(numPlaysPerSession > 0 ? numPlaysPerSession : 1); // Ensure playsPerSession is at least 1
          setRemainingPlays(Number(fetchedRemainingPlays));
          setFreeSessionCooldown(Number(fetchedCooldown));
          
          // Read NFT Mint Price
          const fetchedMintPrice = await readContract(config, { address: NFT_CONTRACT_ADDRESS as Address, abi: ReflexBlitzNFTABI, functionName: 'MINT_PRICE' }) as bigint;
          setMintPrice(fetchedMintPrice);

        } catch (error) {
          console.error("Error fetching game data:", error);
        }
      }
    };
    fetchGameData();
  }, [address, isConnected, chain]);

  // Timer for free session cooldown
  useEffect(() => {
    const timerId = setInterval(() => {
      setFreeSessionCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  // Determine if a free session is possible
  useEffect(() => {
    if (remainingPlays === 0 && freeSessionCooldown === 0) {
      setIsFreeSessionPossible(true);
    } else {
      setIsFreeSessionPossible(false);
    }
  }, [remainingPlays, freeSessionCooldown]);

  const closeResultModal = () => {
    setShowResultModal(false);
    setGameMessage("");
    setIsButtonVisible(false);
    setIsWaitingForFlash(false);
    setScheduledTime(0);
    setVisualCueTime(0);
    setPreviewSvgDataUrl(undefined);
    if (!nftMintedForCurrentResult) {
        setReactionTimeForMint(undefined);
        setLastDisplayedReactionTimeMs(null);
    }
  };
  
  const displayResult = useCallback(async (title: string, message: string, success: boolean, reactionTimeForDisplayInMs?: number, reactionTimeForMintInMicro?: number) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalSuccess(success);
    setGameMessage("");
    if (success && reactionTimeForMintInMicro !== undefined) { 
      setLastDisplayedReactionTimeMs(reactionTimeForDisplayInMs !== undefined ? reactionTimeForDisplayInMs : reactionTimeForMintInMicro / 1000); 
      setReactionTimeForMint(reactionTimeForMintInMicro);
      if (!nftMintedForCurrentResult) { 
        try {
          const svgUrl = await generatePreviewSvgDataUrl(reactionTimeForMintInMicro, NFT_CONTRACT_ADDRESS as Address, ReflexBlitzNFTABI);
          setPreviewSvgDataUrl(svgUrl);
        } catch (e) {
          console.error("Error generating preview SVG:", e);
          setPreviewSvgDataUrl(undefined);
        }
      }
    } else {
      if(!nftMintedForCurrentResult) {
        setReactionTimeForMint(undefined);
        setLastDisplayedReactionTimeMs(null);
      }
      setPreviewSvgDataUrl(undefined); 
    }
    setShowResultModal(true); 
    setIsLoading(false);
    setIsButtonVisible(false);
    setIsWaitingForFlash(false);
  }, [nftMintedForCurrentResult]);

  // Event Listeners
  useEffect(() => {
    if (!isConnected || !address || chain?.id !== MONAD_TESTNET_CHAIN_ID) {
        if (isConnected && chain?.id !== MONAD_TESTNET_CHAIN_ID) {
            setGameMessage("Please switch to Monad Testnet to play.");
        } else {
            setGameMessage("Please connect your wallet to play.");
        }
        setIsWaitingForFlash(false);
        setIsButtonVisible(false);
        return;
    }
    setGameMessage(""); 

    const unwatchFlashRequested = watchContractEvent(config, {
      address: VRF_CONTRACT_ADDRESS as Address,
      abi: VRFReflexBlitzABI_UPDATED, 
        eventName: 'FlashRequested',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onLogs: (logs: any[]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          logs.forEach((log: any) => {
          const eventData = log.args as FlashRequestedEventArgs;
            if (eventData && eventData.player.toLowerCase() === address.toLowerCase()) {
              setFlashRequestInitiatedTime(Date.now());
              const frontendDelayMs = Math.random() * 3000 + 2000;
              setScheduledTime(Date.now() + frontendDelayMs);
              setIsButtonVisible(false);
            setGameMessage("Get Ready...");
            setIsWaitingForFlash(true);
            setIsLoading(false);
            setRemainingPlays(Number(eventData.playsLeftInSession)); 
            
            if (Number(eventData.playsLeftInSession) === playsPerSession -1 && Number(eventData.playsLeftInSession) < playsPerSession) { 
                 setIsFreeSessionPossible(false); 
            }
            console.log('FlashRequested event received:', eventData);
            }
          });
        },
    });

    const unwatchNFTMintedWithSignature = watchContractEvent(config, {
      address: NFT_CONTRACT_ADDRESS as Address,
      abi: ReflexBlitzNFTABI,
      eventName: 'NFTMintedWithSignature',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onLogs: (logs: any[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            logs.forEach((log: any) => {
          const eventData = log.args as NFTMintedWithSignatureEventArgs;
                if (eventData && eventData.player.toLowerCase() === address.toLowerCase()) {
            console.log('NFTMintedWithSignature event received:', eventData);
            setNftMintedForCurrentResult(true);
            setLastMintedTokenId(Number(eventData.tokenId));
            setIsMintingNFT(false);
            if (showResultModal && modalSuccess) {
                 setModalMessage(
                    `Your reaction time: ${(Number(eventData.score) / 1000).toFixed(3)} ms\nNFT Minted Successfully! Rank: ${eventData.rank}, Token ID: #${Number(eventData.tokenId)}`
                 );
                    } else {
                 displayResult(
                    "NFT Minted!", 
                    `Record Saved!\nRank: ${eventData.rank}, Token ID: #${Number(eventData.tokenId)}\nReaction Time: ${(Number(eventData.score) / 1000).toFixed(3)} ms`,
                    true,
                    undefined,
                    Number(eventData.score)
                 );
            }}
            });
        }
    });
    return () => { unwatchFlashRequested(); unwatchNFTMintedWithSignature(); };
  }, [address, isConnected, chain, displayResult, showResultModal, modalSuccess, nftMintedForCurrentResult, playsPerSession]);


  useEffect(() => {
    if (!scheduledTime || !isConnected || chain?.id !== MONAD_TESTNET_CHAIN_ID || scheduledTime === 0 || !isWaitingForFlash) return;
    const now = Date.now();
    const delay = scheduledTime - now;
    if (delay > 0) {
      setIsButtonVisible(false);
      const timer = setTimeout(() => {
        if (Date.now() >= scheduledTime && isWaitingForFlash && !showResultModal) { 
            setVisualCueTime(Date.now());
            setIsButtonVisible(true);
            setGameMessage("TAP NOW!");
            setIsWaitingForFlash(false);
        }
      }, delay);
      return () => clearTimeout(timer);
    } else if (now >= scheduledTime && isWaitingForFlash && !showResultModal) {
      setVisualCueTime(Date.now());
      setIsButtonVisible(true);
      setGameMessage("TAP NOW!");
      setIsWaitingForFlash(false);
    }
  }, [scheduledTime, isConnected, chain, isWaitingForFlash, showResultModal]);

  const handleRequestFlash = async () => {
    if (!isConnected || !address || chain?.id !== MONAD_TESTNET_CHAIN_ID) { displayResult("Error", "Please connect your wallet first.", false); return; }
    if (isLoading || isWaitingForFlash || isButtonVisible) { setGameMessage("Game in progress. Please wait."); return; }
    
    setIsLoading(true);
    setGameMessage("Requesting flash... please confirm in your wallet.");
    setFlashRequestInitiatedTime(0); setScheduledTime(0); setVisualCueTime(0);
    setIsButtonVisible(false); setShowResultModal(false); setPreviewSvgDataUrl(undefined);
    if (remainingPlays === 0) { 
        setNftMintedForCurrentResult(false);
        setLastMintedTokenId(undefined);
    }
    setReactionTimeForMint(undefined); setLastDisplayedReactionTimeMs(null);

    try {
      let flashValue = BigInt(0);
      let message = "";

      if (remainingPlays > 0) {
        message = `Requesting Flash (Plays Left: ${remainingPlays})... Please confirm.`;
      } else { 
        const currentCooldown = await readContract(config, { address: VRF_CONTRACT_ADDRESS as Address, abi: VRFReflexBlitzABI_UPDATED, functionName: 'getRemainingFreePlayCooldown', args: [address] }) as bigint;
        if (Number(currentCooldown) === 0) { 
          message = `Requesting Flash (Free Session, ${playsPerSession} Plays!)... Please confirm.`;
        } else { 
          flashValue = playPrice;
          message = `Requesting Flash (${formatEther(flashValue)} MON for ${playsPerSession} Plays)... Please confirm.`;
        }
      }
      setGameMessage(message);

      await writeContract(config, {
        address: VRF_CONTRACT_ADDRESS as Address,
        abi: VRFReflexBlitzABI_UPDATED,
        functionName: 'requestFlash',
        value: flashValue,
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Error requesting flash:', error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let friendlyMessage = (error && typeof (error as any).shortMessage === 'string' ? (error as any).shortMessage : null) || (error.message ? error.message : String(error)) || "An unknown error occurred.";
      if (error.message?.includes("Value sent for a play within an active session")) friendlyMessage = "Error: Payment sent when plays are remaining in session.";
      else if (error.message?.includes("Value sent for a free play session")) friendlyMessage = "Error: Payment sent for a free session.";
      else if (error.message?.includes("Incorrect play price for new session")) friendlyMessage = "Error: Incorrect payment amount for a new session.";
      displayResult("Request Failed", friendlyMessage, false);
      setIsLoading(false);
    }
  };

  const handleSubmitTap = () => { 
    if (!isButtonVisible || visualCueTime === 0) { return; }
    setIsButtonVisible(false); 
    const tapTime = Date.now();
    const calculatedReactionTime = tapTime - visualCueTime;
    const reactionTimeMicro = calculatedReactionTime * 1000;

    if (calculatedReactionTime < MIN_REACTION_TIME_MS) { 
        displayResult("Too Fast!", `Your reaction time: ${calculatedReactionTime} ms. That's impossibly quick! Try again.`, false, calculatedReactionTime, reactionTimeMicro);
    } else if (calculatedReactionTime <= MAX_REACTION_TIME_MS) { 
        displayResult("Success!", `Your reaction time: ${calculatedReactionTime} ms. Ready to mint your record?`, true, calculatedReactionTime, reactionTimeMicro);
    } else { 
        displayResult("Too Slow!", `Your reaction time: ${calculatedReactionTime} ms. Try to be quicker next time!`, false, calculatedReactionTime, reactionTimeMicro);
    }
  };
  const handleEarlyTapPreventerClick = (e: React.MouseEvent) => {
    if (isWaitingForFlash && !showResultModal) {
      displayResult("Too Soon!", "You tapped before the signal! Game Over.", false);
      setScheduledTime(0); setIsWaitingForFlash(false); setIsButtonVisible(false);
      e.stopPropagation();
    }
  };
  const handleMintNFT = async () => {
    if (!isConnected || !address) { displayResult("Error", "Please connect your wallet first.", false); return; }
    if (chain?.id !== MONAD_TESTNET_CHAIN_ID) { displayResult("Error", "Please switch to Monad Testnet to mint NFT.", false); return; }
    if (reactionTimeForMint === undefined || reactionTimeForMint <=0 ) {
      const msg = lastDisplayedReactionTimeMs ? `Recorded reaction time: ${(lastDisplayedReactionTimeMs / 1000).toFixed(3)} ms.` : "No valid reaction time recorded to mint NFT.";
      displayResult("Mint Error", msg, false, reactionTimeForMint);
        return;
    }
    setIsMintingNFT(true);
    const baseMessageForMintModal = `Minting NFT for your score of ${(reactionTimeForMint / 1000).toFixed(3)} ms.`;
    if (showResultModal && modalSuccess) {
        setModalMessage(`${baseMessageForMintModal}\n\nStage 1/2: Requesting server signature...`);
    } else {
        setModalTitle("NFT Mint");
        setModalMessage(`${baseMessageForMintModal}\n\nStage 1/2: Requesting server signature...`);
        setModalSuccess(true); setShowResultModal(true);
    }
    try {
      const signatureResponse = await fetch('/api/generate-mint-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerAddress: address, score: reactionTimeForMint }),
      });
      if (!signatureResponse.ok) {
        const errorData = await signatureResponse.json();
        throw new Error(errorData.error || `Signature API request failed with status ${signatureResponse.status}`);
      }
      const sigData = await signatureResponse.json();
      
      if (showResultModal) { 
        setModalMessage(`${baseMessageForMintModal}\n\nStage 2/2: Sending mint transaction for ${formatEther(mintPrice)} MON...`);
      }

      const hash = await writeContract(config, {
        address: NFT_CONTRACT_ADDRESS as Address, 
        abi: ReflexBlitzNFTABI, 
        functionName: 'mintWithSignature',
        args: [ sigData.player, BigInt(sigData.score), BigInt(sigData.nonce), BigInt(sigData.expiry), sigData.signature ],
        value: mintPrice,
      });

      if (showResultModal) {
          setModalMessage(`${baseMessageForMintModal}\n\nMint transaction sent (Tx: ${truncateAddress(hash)})! Waiting for blockchain confirmation...`);
      }

      const { waitForTransactionReceipt } = await import('wagmi/actions'); 
      const receipt = await waitForTransactionReceipt(config, { hash });

      if (receipt.status === 'success') {
        if (showResultModal) {
            setModalMessage(`${baseMessageForMintModal}\n\nTransaction confirmed! Waiting for event...`);
        }
      } else {
        console.error("Mint transaction reverted:", receipt);
        throw new Error(`Transaction reverted. Status: ${receipt.status}. TxHash: ${hash}. Check block explorer for details.`);
      }

    } catch (e: unknown) {
      const error = e as Error;
      console.error("Error in minting process:", error);
      setIsMintingNFT(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let friendlyMessage = (error && typeof (error as any).shortMessage === 'string' ? (error as any).shortMessage : null) || (error.message ? error.message : String(error)) || "An unknown error occurred while minting.";
      if (error.message?.includes("Nonce already used")) friendlyMessage = "Error: This score has already been submitted or the signature is invalid.";
      else if (error.message?.includes("Signature expired")) friendlyMessage = "Error: The minting signature has expired. Please try sharing again.";
      else if (error.message?.includes("Invalid signer")) friendlyMessage = "Error: Invalid signature. The signer is not authorized.";
      else if (error.message?.includes("Incorrect mint price")) friendlyMessage = "Error: Incorrect mint price provided.";
      displayResult(
          showResultModal ? modalTitle : "Mint Error", 
          `${friendlyMessage}`.substring(0, 1000), // Limit error message length for display
          showResultModal ? modalSuccess : false, 
          reactionTimeForMint 
      );
      console.error('Full error object during mint:', error);
    }
  };
  const renderWalletControls = () => {
    if (!isConnected) {
      return (
        <div className="mb-6">
          {connectors.map((connector) => (
            <button key={connector.uid} onClick={() => connect({ connector })} disabled={isConnecting} className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg w-full mb-3 disabled:opacity-70">
              {isConnecting ? 'Connecting...' : `Connect ${connector.name}`}
            </button>
          ))}
          {connectError && <p className="text-red-400 mt-2 text-sm">Error connecting: {connectError.message}</p>}
        </div>
      );
    }
    const monadDisplayName = monadTestnet.name ? monadTestnet.name : 'Monad Testnet (Configured)';
    if (chain?.id !== MONAD_TESTNET_CHAIN_ID) {
      return (
        <div className="mb-6">
          <p className="text-sm text-yellow-400 mb-2">Connected to {chain?.name || 'wrong network'}.</p>
          <button onClick={() => switchChain({ chainId: MONAD_TESTNET_CHAIN_ID })} disabled={isSwitchingChain} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg text-lg w-full disabled:opacity-70">
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

  const renderGameControls = () => {
    if (!isConnected || !address || chain?.id !== MONAD_TESTNET_CHAIN_ID) return null;
    if (isLoading || isWaitingForFlash || isButtonVisible) return null;

    const playPriceInEth = formatEther(playPrice);
    const currentPlaysPerSession = playsPerSession > 0 ? playsPerSession : 1; 

    if (remainingPlays > 0) {
      return (
        <button onClick={handleRequestFlash} disabled={isLoading} className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-lg text-xl w-full disabled:opacity-70 mb-4">
          Request Flash (Plays Left: {remainingPlays})
        </button>
      );
    }
    
    if (isFreeSessionPossible) {
      return (
        <button onClick={handleRequestFlash} disabled={isLoading} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-xl w-full disabled:opacity-70 mb-4">
          Request Flash (Free, {currentPlaysPerSession} Plays!)
        </button>
      );
    }
    
    if (freeSessionCooldown > 0) {
      return (
        <div className="text-center p-4 bg-gray-700 rounded-lg w-full mb-4">
          <p className="text-yellow-400 text-lg">Next free session in: {Math.floor(freeSessionCooldown / 60)}m {freeSessionCooldown % 60}s</p>
          <button onClick={handleRequestFlash} disabled={isLoading} className="mt-4 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg text-lg w-full disabled:opacity-70">
            Play Now ({playPriceInEth} MON for {currentPlaysPerSession} Plays)
          </button>
        </div>
      );
    }

    return (
      <button onClick={handleRequestFlash} disabled={isLoading} className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-8 rounded-lg text-xl w-full disabled:opacity-70 mb-4">
        Request Flash ({playPriceInEth} MON for {currentPlaysPerSession} Plays)
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 font-sans">
      <ResultModal 
        isOpen={showResultModal}
        onClose={closeResultModal}
        title={modalTitle}
        message={modalMessage}
        isSuccess={modalSuccess}
        reactionTimeMicroseconds={reactionTimeForMint}
        onMintNFT={handleMintNFT}
        isMintingNFT={isMintingNFT}
        nftMinted={nftMintedForCurrentResult}
        nftTokenId={lastMintedTokenId}
        previewSvgDataUrl={previewSvgDataUrl}
        mintPriceFromGame={mintPrice}
      />
      <div className="p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-md text-center">
        <h1 className="text-5xl font-bold mb-6 text-purple-400 tracking-tight">Reflex Blitz</h1>
        {renderWalletControls()}
        {renderGameControls()} {/* This will now render the correct button based on state */}

        {gameMessage && !showResultModal && (
          <p className={`my-4 text-lg ${gameMessage.includes("Error") || gameMessage.includes("Failed") || gameMessage.includes("wrong network") || gameMessage.includes("Please switch") ? 'text-red-400' : gameMessage.includes("Success") ? 'text-green-400' : 'text-purple-300'}`}>
            {gameMessage}
          </p>
        )}

        <div className="h-40 flex items-center justify-center bg-gray-700 rounded-lg my-6 relative" onClick={handleEarlyTapPreventerClick}>
            {isButtonVisible && isConnected && chain?.id === MONAD_TESTNET_CHAIN_ID && !showResultModal && (
            <button
                onClick={handleSubmitTap}
                className="animate-pulse bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold py-10 px-12 rounded-full text-4xl shadow-lg transition duration-150 ease-in-out transform hover:scale-105 z-10"
            >
                TAP!
            </button>
            )}
            {isWaitingForFlash && !showResultModal && (
              <div className="absolute inset-0 flex items-center justify-center cursor-pointer z-20">
                <p className="text-2xl text-purple-300">{gameMessage.includes("Get Ready") ? gameMessage : "Get Ready..."}</p>
              </div>
            )}
            {!isWaitingForFlash && !isButtonVisible && gameMessage === "TAP NOW!" && !showResultModal && (
                <p className="text-2xl text-yellow-400 animate-ping">TAP NOW!</p>
            )}
        </div>

         <p className="mt-8 text-xs text-gray-500">
          Instructions: Connect wallet & switch to Monad Testnet. Request a session (cost: {formatEther(playPrice)} MON for {playsPerSession} plays, or free if cooldown passed). Click &quot;TAP!&quot; when it appears. Mint your record for {formatEther(mintPrice)} MON.
        </p>
      </div>
    </div>
  );
}

async function generatePreviewSvgDataUrl(
  reactionTimeMicroseconds: number, 
  nftContractAddr: Address, 
  nftAbi: Abi
): Promise<string | undefined> {
  if (reactionTimeMicroseconds <= 0) return undefined;
  try {
    const rankResult = await readContract(config, {
      address: nftContractAddr,
      abi: nftAbi,
      functionName: 'determineRank',
      args: [BigInt(reactionTimeMicroseconds)],
    });
    const rank = rankResult as unknown as string;
    if (typeof rank !== 'string' || rank === '') {
        console.error("Failed to determine rank or rank is invalid:", rankResult);
        return undefined;
    }
    const reactionTimeMs = (reactionTimeMicroseconds / 1000).toFixed(3);
    const tokenIdText = "PREVIEW";
    let color: string;
    if (rank === "S+") color = "#FFD700"; 
    else if (rank === "S") color = "#C0C0C0"; 
    else if (rank === "A") color = "#CD7F32"; 
    else if (rank === "B") color = "#87CEEB"; 
    else if (rank === "C") color = "#90EE90"; 
    else color = "#DDA0DD";
    let rankYPosition = "140"; 
    if (rank.length === 1) rankYPosition = "140"; 
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">
        <style>
          .base-text { font-family: Arial, sans-serif; text-anchor: middle; fill: white; }
          .title-text { font-size: 20px; }
          .rank-text { font-size: 40px; font-weight: bold; dominant-baseline: central; }
          .label-text { font-size: 16px; }
          .value-text { font-size: 30px; font-weight: bold; }
          .tokenid-text { font-size: 14px; }
          .footer-text { font-size: 12px; fill: #a0aec0; }
        </style>
        <rect width="100%" height="100%" fill="#1f2937" />
        <text x="175" y="50" class="base-text title-text">Reflex Blitz Achievement</text>
        <circle cx="175" cy="140" r="50" fill="${color}" />
        <text x="175" y="${rankYPosition}" class="base-text rank-text">${rank}</text>
        <text x="175" y="215" class="base-text label-text">Reaction Time</text>
        <text x="175" y="245" class="base-text value-text">${reactionTimeMs} ms</text>
        <text x="175" y="285" class="base-text tokenid-text">Token #: ${tokenIdText}</text>
        <text x="175" y="320" class="base-text footer-text">Minted on Monad Testnet</text>
      </svg>
    `;
    return `data:image/svg+xml;base64,${window.btoa(svgString)}`;
  } catch (error) {
    console.error("Error generating preview SVG:", error);
    return undefined;
  }
}

