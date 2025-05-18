// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol"; // for isContract

contract ReflexBlitzNFT is ERC721URIStorage, Ownable, EIP712 {
    using Counters for Counters.Counter;
    using Strings for uint256;
    using Address for address;
    
    Counters.Counter private _tokenIds;
    
    // 反応時間に応じたランク付け (デフォルト値、変更可能)
    string[] public ranks = ["S+", "S", "A", "B", "C", "D"];
    
    // レベル別の最大反応時間（マイクロ秒） (デフォルト値、変更可能)
    // S+: <= 200ms, S: <= 250ms, A: <= 300ms, B: <= 350ms, C: <= 400ms, D: > 400ms
    uint256[] public rankThresholds = [
        200000,  // S+
        250000,  // S
        300000,  // A
        350000,  // B
        400000,  // C
        10000000 // D (非常に大きな値にして、これまでのすべてをカバー。最後の要素は事実上「それ以上」)
    ];
    
    // ReflexBlitzゲームコントラクトのアドレス
    address public gameAddress;
    
    // ユーザーごとのトークンID
    mapping(address => uint256[]) public userTokens;
    
    // トークンIDごとの反応時間
    mapping(uint256 => uint256) public tokenScores; // reactionTime を score として格納
    
    // --- EIP-712 & Server Signature Mint ---
    // TypeHash for Mint(address player,uint256 score,uint256 nonce,uint256 expiry,address contract)
    // score is reactionTime in microseconds.
    bytes32 public constant MINT_TYPEHASH = keccak256(
        "Mint(address player,uint256 score,uint256 nonce,uint256 expiry,address contract)"
    );

    address public signerAddress;
    uint256 public constant MINT_PRICE = 0.1 ether; // 0.1 MON (1e17)
    mapping(uint256 => bool) public usedNonces;
    // --- End EIP-712 & Server Signature Mint ---
    
    // イベント
    event NFTMintedWithSignature(address indexed player, uint256 indexed tokenId, uint256 score, string rank, uint256 nonce);
    event RankSettingsUpdated(string[] newRanks, uint256[] newThresholds);
    event SignerAddressUpdated(address indexed newSignerAddress);
    
    constructor()
        ERC721("ReflexBlitz Achievement", "RBA") // NFT名とシンボル
        Ownable() 
        EIP712("ReflexBlitz Achievement NFT", "1") // EIP-712 ドメイン名とバージョン (サーバーと一致させる)
    {
        // OpenZeppelin Contracts v4.x 以前では、Ownable() は引数なしで呼び出し、
        // msg.sender が自動的にオーナーになります。
    }
    
    // ゲームコントラクトアドレスの設定（オーナーのみ）
    function setGameAddress(address _gameAddress) external onlyOwner {
        gameAddress = _gameAddress;
    }
    
    function setSignerAddress(address _signerAddress) external onlyOwner {
        require(_signerAddress != address(0), "Signer address cannot be zero");
        require(!_signerAddress.isContract(), "Signer address cannot be a contract"); // Prevent setting a contract as signer
        signerAddress = _signerAddress;
        emit SignerAddressUpdated(_signerAddress);
    }
    
    // ランク設定を更新する関数 (オーナーのみ)
    function setRankSettings(string[] memory _newRanks, uint256[] memory _newThresholds) external onlyOwner {
        require(_newRanks.length == _newThresholds.length, "Ranks and thresholds length mismatch");
        require(_newRanks.length > 0, "Cannot set empty ranks");
        // 必要であれば、しきい値が昇順であることなどのバリデーションを追加
        for (uint i = 0; i < _newThresholds.length - 1; i++) {
            require(_newThresholds[i] < _newThresholds[i+1], "Thresholds must be in ascending order");
        }

        ranks = _newRanks;
        rankThresholds = _newThresholds;
        emit RankSettingsUpdated(_newRanks, _newThresholds);
    }
    
    function mintWithSignature(
        address player,         // The address to mint the NFT to
        uint256 score,          // The reaction time in microseconds
        uint256 nonce,          // A unique number to prevent replay attacks
        uint256 expiry,         // Timestamp when the signature expires
        bytes memory signature  // The EIP-712 signature from the server
    ) external payable returns (uint256) {
        require(msg.value == MINT_PRICE, "ReflexBlitzNFT: Incorrect mint price");
        require(!usedNonces[nonce], "ReflexBlitzNFT: Nonce already used");
        require(block.timestamp <= expiry, "ReflexBlitzNFT: Signature expired");
        require(signerAddress != address(0), "ReflexBlitzNFT: Signer address not set by owner");

        bytes32 structHash = keccak256(abi.encode(
            MINT_TYPEHASH,
            player,
            score,
            nonce,
            expiry,
            address(this) // Verifying contract address from the signature must be this contract
        ));
        bytes32 digest = _hashTypedDataV4(structHash);

        address recoveredSigner = ECDSA.recover(digest, signature);
        require(recoveredSigner == signerAddress, "ReflexBlitzNFT: Invalid signature");

        usedNonces[nonce] = true;

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _mint(player, newTokenId);
        tokenScores[newTokenId] = score;
        userTokens[player].push(newTokenId);
        
        string memory tokenURI = _generateTokenURI(newTokenId, score);
        _setTokenURI(newTokenId, tokenURI);
        
        string memory rank = determineRank(score);
        emit NFTMintedWithSignature(player, newTokenId, score, rank, nonce);
        
        return newTokenId;
    }
    
    // ランクを判定
    function determineRank(uint256 score) public view returns (string memory) {
        for (uint i = 0; i < rankThresholds.length; i++) {
            if (score <= rankThresholds[i]) {
                return ranks[i];
            }
        }
        // この部分は、最後のrankThresholdsが十分に大きい場合に到達しないはず
        // もし到達した場合は、配列の最後のランクを返す（例：Dランク）
        return ranks[ranks.length - 1]; 
    }
    
    // SVG画像の生成
    function _generateSVG(uint256 tokenId, uint256 score) internal view returns (string memory) {
        string memory scoreMsString;
        uint256 msPart = score / 1000;
        uint256 usPart = score % 1000;

        if (usPart == 0) {
            scoreMsString = string(abi.encodePacked(msPart.toString(), ".000"));
        } else if (usPart < 10) {
            scoreMsString = string(abi.encodePacked(msPart.toString(), ".00", usPart.toString()));
        } else if (usPart < 100) {
            scoreMsString = string(abi.encodePacked(msPart.toString(), ".0", usPart.toString()));
        } else {
            scoreMsString = string(abi.encodePacked(msPart.toString(), ".", usPart.toString()));
        }

        string memory rank = determineRank(score);
        string memory color;

        if (keccak256(abi.encodePacked(rank)) == keccak256(abi.encodePacked("S+"))) {
            color = "#FFD700"; // Gold
        } else if (keccak256(abi.encodePacked(rank)) == keccak256(abi.encodePacked("S"))) {
            color = "#C0C0C0"; // Silver
        } else if (keccak256(abi.encodePacked(rank)) == keccak256(abi.encodePacked("A"))) {
            color = "#CD7F32"; // Bronze (or a distinct color like #FF8C00 - DarkOrange)
        } else if (keccak256(abi.encodePacked(rank)) == keccak256(abi.encodePacked("B"))) {
            color = "#87CEEB"; // SkyBlue
        } else if (keccak256(abi.encodePacked(rank)) == keccak256(abi.encodePacked("C"))) {
            color = "#90EE90"; // LightGreen
        } else { // D and others
            color = "#DDA0DD"; // Plum (for D)
        }
        
        // ランク文字のy座標を調整し、dominant-baselineを追加して中央揃えを試みる
        // フォントサイズや文字によって微調整が必要な場合がある
        string memory rankYPosition = "140"; // Default for S+ etc.
        if(bytes(rank).length == 1){ // For single char ranks S, A, B, C, D
             rankYPosition = "140"; 
        }

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
                '<style>',
                '.base-text { font-family: Arial, sans-serif; text-anchor: middle; fill: white; }',
                '.title-text { font-size: 20px; }',
                '.rank-text { font-size: 40px; font-weight: bold; dominant-baseline: central; }',
                '.label-text { font-size: 16px; }',
                '.value-text { font-size: 30px; font-weight: bold; }',
                '.tokenid-text { font-size: 14px; }',
                '.footer-text { font-size: 12px; fill: #a0aec0; }',
                '</style>',
                '<rect width="100%" height="100%" fill="#1f2937" />',
                '<text x="175" y="50" class="base-text title-text">Reflex Blitz Achievement</text>',
                '<circle cx="175" cy="140" r="50" fill="', color, '" />',
                '<text x="175" y="',rankYPosition,'" class="base-text rank-text">', rank, '</text>',
                '<text x="175" y="215" class="base-text label-text">Reaction Time</text>',
                '<text x="175" y="245" class="base-text value-text">', scoreMsString, ' ms</text>',
                '<text x="175" y="285" class="base-text tokenid-text">Token #', tokenId.toString(), '</text>',
                '<text x="175" y="320" class="base-text footer-text">Minted on Monad Testnet</text>',
                '</svg>'
            )
        );
    }
    
    // トークンURIの生成
    function _generateTokenURI(uint256 tokenId, uint256 score) internal view returns (string memory) {
        string memory svgImage = _generateSVG(tokenId, score);
        string memory reactionTimeMs = (score / 1000).toString();
        string memory reactionTimeUs = (score % 1000).toString();
        if (score % 1000 < 10) reactionTimeUs = string(abi.encodePacked("00", reactionTimeUs));
        else if (score % 1000 < 100) reactionTimeUs = string(abi.encodePacked("0", reactionTimeUs));

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "ReflexBlitz RBA #', tokenId.toString(),'", ',
                        '"description": "ReflexBlitz achievement NFT. Reaction Time: ', reactionTimeMs, '.', reactionTimeUs, ' ms. Rank: ', determineRank(score), '.", ',
                        '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svgImage)), '", ',
                        '"attributes": [',
                        '{"trait_type": "Reaction Time (ms)", "value": "', reactionTimeMs, '.', reactionTimeUs, '"}, ',
                        '{"trait_type": "Rank", "value": "', determineRank(score), '"}]}'
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }
    
    // ユーザーが所有するすべてのNFTを取得
    function getTokensByUser(address user) external view returns (uint256[] memory) {
        return userTokens[user];
    }
    
    // NFTの反応時間を取得
    function getTokenScore(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return tokenScores[tokenId];
    }

    // --- Owner functions ---
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        payable(owner()).transfer(balance);
    }

    // --- Fallback and Receive ---
    receive() external payable {}
    fallback() external payable {}

    // --- Overrides for OpenZeppelin EIP712 ---
    // The functions below are overrides for EIP712 and are necessary for the domain separator to be correctly computed.
    // They simply return the EIP712 domain name and version defined in the constructor.
    // function _domainName() internal view virtual override returns (string memory) {
    //     return name(); // EIP712.name() returns the name given in constructor
    // }

    // function _domainVersion() internal view virtual override returns (string memory) {
    //     return version(); // EIP712.version() returns the version given in constructor
    // }
} 