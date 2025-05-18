import { NextResponse } from 'next/server';
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains'; // Monad TestnetのChainオブジェクト

// --- 環境変数 (実際のプロダクションではセキュアに管理) ---
// サーバー署名者の秘密鍵 (例: '0x...')
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
// デプロイされたReflexBlitzNFTコントラクトのアドレス
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS as `0x${string}` | undefined;

// EIP-712ドメイン情報 (ReflexBlitzNFT.solのコンストラクタと一致させる)
const EIP712_DOMAIN_NAME = process.env.EIP712_DOMAIN_NAME || 'ReflexBlitz Achievement NFT';
const EIP712_DOMAIN_VERSION = process.env.EIP712_DOMAIN_VERSION || '1';

// Monad Testnet Chain ID (ReflexBlitzNFT.solのEIP712コンストラクタで使用されるchainIdと一致している必要がある)
// viem/chains から monadTestnet.id を使用するのが望ましい
const CHAIN_ID = monadTestnet.id; 

// EIP-712タイプ定義 (ReflexBlitzNFT.solのMINT_TYPEHASHと一致させる)
const eip712Types = {
  Mint: [
    { name: 'player', type: 'address' },      // プレイヤーのアドレス
    { name: 'score', type: 'uint256' },       // 反応時間 (マイクロ秒)
    { name: 'nonce', type: 'uint256' },       // リプレイ攻撃防止用ナンス
    { name: 'expiry', type: 'uint256' },       // 署名の有効期限 (Unixタイムスタンプ)
    { name: 'contract', type: 'address' }     // NFTコントラクトのアドレス (検証用)
  ]
} as const; // as const で型を厳密にする

export async function POST(request: Request) {
  if (!SIGNER_PRIVATE_KEY) {
    console.error('SIGNER_PRIVATE_KEY is not set in environment variables.');
    return NextResponse.json({ error: 'Server configuration error: Signer key missing.' }, { status: 500 });
  }
  if (!NFT_CONTRACT_ADDRESS) {
    console.error('NFT_CONTRACT_ADDRESS is not set in environment variables.');
    return NextResponse.json({ error: 'Server configuration error: NFT contract address missing.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { playerAddress, score, fid } = body; // score は反応時間 (マイクロ秒)

    if (!playerAddress || typeof score !== 'number') {
      return NextResponse.json({ error: 'Invalid request parameters: playerAddress and score (number) are required.' }, { status: 400 });
    }
    // playerAddressの形式検証 (簡易的)
    if (!/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
        return NextResponse.json({ error: 'Invalid playerAddress format.' }, { status: 400 });
    }
    // スコアの検証 (例: 0以上、現実的な上限値)
    if (score < 0 || score > 100000000) { // 100秒を上限とする例
      return NextResponse.json({ error: 'Invalid score value.' }, { status: 400 });
    }

    // サーバー署名用アカウント
    const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet, // Monad Testnetを指定
      transport: http() // transportは署名のみなら必須ではないが、念のため
    });

    // ナンス値の生成 (FIDとタイムスタンプを組み合わせる例、またはより堅牢な方法を検討)
    // Date.now() はミリ秒なので、秒単位にする場合は /1000 するなど注意
    const nonce = BigInt(fid ? Number(fid) * 1000000000 + Date.now() : Date.now()); 
    
    // 有効期限 (現在から1時間後)
    const expiryTime = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);

    const message = {
      player: playerAddress as `0x${string}`,
      score: BigInt(score),
      nonce: nonce,
      expiry: expiryTime,
      contract: NFT_CONTRACT_ADDRESS
    };

    const domain = {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: NFT_CONTRACT_ADDRESS
    };

    console.log("Generating EIP-712 signature with:");
    console.log("Domain:", domain);
    console.log("Types:", eip712Types);
    console.log("Message (Value):", message);
    console.log("Signer Account:", account.address);

    const signature = await walletClient.signTypedData({
      account,
      domain,
      types: eip712Types,
      primaryType: 'Mint',
      message
    });

    console.log("Generated Signature:", signature);

    return NextResponse.json({
      signature,
      player: playerAddress,
      score: score, // number型で返す
      nonce: nonce.toString(), // string型で返す
      expiry: expiryTime.toString(), // string型で返す
      nftContractAddress: NFT_CONTRACT_ADDRESS
    });

  } catch (e: unknown) {
    const error = e as Error;
    console.error('Error generating EIP-712 signature:', error);
    let errorMessage = 'Failed to generate signature.';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error && typeof (error as any).shortMessage === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errorMessage += `: ${(error as any).shortMessage}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ error: errorMessage, details: error.message ? error.message : String(error) }, { status: 500 });
  }
} 