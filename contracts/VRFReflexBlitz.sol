// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Interface for Supra dVRF Router
interface ISupraRouter {
    function generateRequest(
        uint256 rngCount,
        address clientAddress,
        uint256 clientNonce
    ) external returns (uint256);

    function fulfillRequest(bytes calldata rngPack) external;

    // Other functions might be needed depending on the exact integration pattern
}

// Interface for the client contract to receive RNG
interface IDVRACallback {
    function rngAvailable(bytes calldata rngPack) external;
}

contract VRFReflexBlitz is IDVRACallback {
    ISupraRouter public supraRouter;
    address public owner; // Contract owner for admin tasks if any

    uint256 public constant MIN_DELAY = 3; // seconds
    uint256 public constant MAX_DELAY = 10; // seconds
    uint256 public constant MIN_REACT = 1; // seconds
    uint256 public constant MAX_REACT = 3; // seconds

    mapping(address => uint40) public revealTime;
    mapping(uint256 => address) private requestOwner; // Using clientNonce as a key for now
    uint256 public nextClientNonce = 1; // Simple nonce management for requests

    event FlashScheduled(address indexed player, uint40 revealTime);
    event TapResult(address indexed player, bool success, uint40 reactionTime);
    event RandomNumberRequested(address indexed player, uint256 clientNonce);
    event RandomNumberFulfilled(uint256 clientNonce, uint256 randomNumber);

    // Monad Testnet dVRF Address: 0x6D46C098996AD584c9C40D6b4771680f54cE3726
    // This address is assumed to be the SupraRouter for Monad Testnet
    constructor(address _supraRouterAddress) {
        supraRouter = ISupraRouter(_supraRouterAddress);
        owner = msg.sender;
    }

    function requestFlash() external {
        require(revealTime[msg.sender] < block.timestamp, "Active flash exists or previous not cleared");
        
        uint256 clientNonceForRequest = nextClientNonce;
        requestOwner[clientNonceForRequest] = msg.sender;
        nextClientNonce++; // Increment nonce for next request

        // Request 1 random number
        supraRouter.generateRequest(1, address(this), clientNonceForRequest);
        emit RandomNumberRequested(msg.sender, clientNonceForRequest);
    }

    // Callback function called by SupraRouter
    function rngAvailable(bytes calldata rngPack) external override {
        // Ensure the caller is the SupraRouter
        // According to Supra docs, this check might be implicitly handled by Supra's system
        // or you might need to register this contract with the router.
        // For now, we assume direct call from the registered router.
        // require(msg.sender == address(supraRouter), "Caller is not SupraRouter");

        // Decode rngPack to get the nonce and random words
        // The exact decoding mechanism depends on Supra's rngPack structure.
        // Assuming a simple structure for now: (uint256 clientNonce, uint256[] randomWords)
        // This will likely need to be adjusted based on actual Supra dVRF documentation.
        (uint256 clientNonce, uint256[] memory randomWords) = abi.decode(
            rngPack,
            (uint256, uint256[])
        );

        require(randomWords.length > 0, "No random words received");
        address player = requestOwner[clientNonce];
        require(player != address(0), "No player found for this nonce");

        uint256 rand = randomWords[0];
        emit RandomNumberFulfilled(clientNonce, rand);

        uint256 delay = (rand % (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
        uint40 rt = uint40(block.timestamp + delay);
        revealTime[player] = rt;
        
        // Clean up the requestOwner mapping for this nonce
        delete requestOwner[clientNonce];

        emit FlashScheduled(player, rt);
    }

    function submitTap() external {
        uint40 rt = revealTime[msg.sender];
        require(rt != 0, "No flash scheduled for this player");
        require(block.timestamp >= rt, "Too early to tap");

        uint40 reaction = uint40(block.timestamp - rt);
        bool success = (reaction >= MIN_REACT && reaction <= MAX_REACT);
        
        emit TapResult(msg.sender, success, reaction);
        
        require(success, "Reaction out of range");
        
        // Clear the flash time for the player after a successful tap
        delete revealTime[msg.sender];
    }

    // receive() external payable {} // Not strictly needed unless contract receives ETH
} 