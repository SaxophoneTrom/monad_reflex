// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract VRFReflexBlitz is Ownable {
    uint256 public playPrice;
    uint256 public freePlayInterval;
    uint256 public playsPerSession;

    mapping(address => uint256) public lastPlayTime;
    mapping(address => uint256) public remainingPlaysInSession;

    event FlashRequested(address indexed player, uint256 requestTimestamp, bool newSessionStartedAsFree, uint256 playsLeftInSession);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event PlayPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event FreePlayIntervalUpdated(uint256 oldInterval, uint256 newInterval);
    event PlaysPerSessionUpdated(uint256 oldPlays, uint256 newPlays);

    constructor(uint256 _initialPlayPrice, uint256 _initialFreePlayInterval, uint256 _initialPlaysPerSession) Ownable() {
        require(_initialPlaysPerSession > 0, "Plays per session must be > 0");
        playPrice = _initialPlayPrice;
        freePlayInterval = _initialFreePlayInterval;
        playsPerSession = _initialPlaysPerSession;

        emit PlayPriceUpdated(0, _initialPlayPrice);
        emit FreePlayIntervalUpdated(0, _initialFreePlayInterval);
        emit PlaysPerSessionUpdated(0, _initialPlaysPerSession);
    }

    function requestFlash() external payable {
        bool newSessionStartedAsFree = false;
        uint256 currentPlaysPerSession = playsPerSession; // Read from storage

        if (remainingPlaysInSession[msg.sender] > 0) {
            require(msg.value == 0, "VRFReflexBlitz: Value sent for a play within an active session.");
            remainingPlaysInSession[msg.sender]--;
        } else {
            bool isEligibleForFreeSession = (block.timestamp - lastPlayTime[msg.sender]) >= freePlayInterval;
            if (isEligibleForFreeSession) {
                require(msg.value == 0, "VRFReflexBlitz: Value sent for a free play session.");
                newSessionStartedAsFree = true;
            } else {
                require(msg.value == playPrice, "VRFReflexBlitz: Incorrect play price for new session.");
                newSessionStartedAsFree = false;
            }
            require(currentPlaysPerSession > 0, "Plays per session not set or zero");
            remainingPlaysInSession[msg.sender] = currentPlaysPerSession - 1;
            lastPlayTime[msg.sender] = block.timestamp;
        }
        emit FlashRequested(msg.sender, block.timestamp, newSessionStartedAsFree, remainingPlaysInSession[msg.sender]);
    }

    function getRemainingPlaysInCurrentSession(address player) external view returns (uint256) {
        return remainingPlaysInSession[player];
    }

    function getRemainingFreePlayCooldown(address player) external view returns (uint256) {
        uint256 timeSinceLastSessionStart = block.timestamp - lastPlayTime[player];
        if (timeSinceLastSessionStart >= freePlayInterval) {
            return 0;
        }
        return freePlayInterval - timeSinceLastSessionStart;
    }

    // --- Owner Functions ---
    function setPlayPrice(uint256 _newPlayPrice) external onlyOwner {
        uint256 oldPrice = playPrice;
        playPrice = _newPlayPrice;
        emit PlayPriceUpdated(oldPrice, _newPlayPrice);
    }

    function setFreePlayInterval(uint256 _newFreePlayInterval) external onlyOwner {
        uint256 oldInterval = freePlayInterval;
        freePlayInterval = _newFreePlayInterval;
        emit FreePlayIntervalUpdated(oldInterval, _newFreePlayInterval);
    }

    function setPlaysPerSession(uint256 _newPlaysPerSession) external onlyOwner {
        require(_newPlaysPerSession > 0, "Plays per session must be > 0");
        uint256 oldPlays = playsPerSession;
        playsPerSession = _newPlaysPerSession;
        emit PlaysPerSessionUpdated(oldPlays, _newPlaysPerSession);
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "VRFReflexBlitz: No balance to withdraw");
        payable(owner()).transfer(balance);
        emit FundsWithdrawn(owner(), balance);
    }

    receive() external payable {}
    fallback() external payable {}
} 