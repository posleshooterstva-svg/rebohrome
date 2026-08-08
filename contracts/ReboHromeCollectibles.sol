// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReboHromeCollectibles is ERC1155, Ownable, Pausable, ReentrancyGuard {
    address public treasury;

    mapping(bytes32 => bool) public usedOrders;
    mapping(uint256 => bool) public tokenActive;
    mapping(uint256 => uint256) public maxSupply;
    mapping(uint256 => uint256) public totalMinted;

    event CollectiblePurchased(
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 quantity,
        bytes32 indexed orderId,
        uint256 value,
        uint256 timestamp
    );
    event TokenStatusUpdated(uint256 indexed tokenId, bool active);
    event MaxSupplyUpdated(uint256 indexed tokenId, uint256 maxSupply);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event TreasuryWithdrawal(address indexed treasury, uint256 amount);

    constructor(
        string memory initialUri,
        address initialOwner,
        address initialTreasury
    ) ERC1155(initialUri) Ownable(initialOwner) {
        require(initialOwner != address(0), "Owner is zero address");
        require(initialTreasury != address(0), "Treasury is zero address");
        treasury = initialTreasury;
    }

    function purchaseCollectible(
        address recipient,
        uint256 tokenId,
        uint256 quantity,
        bytes32 orderId
    ) external payable whenNotPaused nonReentrant {
        require(recipient != address(0), "Recipient is zero address");
        require(quantity > 0, "Quantity is zero");
        require(orderId != bytes32(0), "Order id is empty");
        require(!usedOrders[orderId], "Order already used");
        require(tokenActive[tokenId], "Token is not active");

        uint256 tokenMaxSupply = maxSupply[tokenId];
        require(tokenMaxSupply > 0, "Token not configured");
        require(totalMinted[tokenId] + quantity <= tokenMaxSupply, "Max supply exceeded");

        usedOrders[orderId] = true;
        totalMinted[tokenId] += quantity;
        _mint(recipient, tokenId, quantity, "");

        emit CollectiblePurchased(recipient, tokenId, quantity, orderId, msg.value, block.timestamp);
    }

    function setTokenActive(uint256 tokenId, bool active) external onlyOwner {
        tokenActive[tokenId] = active;
        emit TokenStatusUpdated(tokenId, active);
    }

    function setMaxSupply(uint256 tokenId, uint256 tokenMaxSupply) external onlyOwner {
        require(tokenMaxSupply == 0 || tokenMaxSupply >= totalMinted[tokenId], "Max below minted");
        maxSupply[tokenId] = tokenMaxSupply;
        emit MaxSupplyUpdated(tokenId, tokenMaxSupply);
    }

    function setURI(string memory newUri) external onlyOwner {
        _setURI(newUri);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Treasury is zero address");
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    function withdrawNative() external onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds");
        require(treasury != address(0), "Treasury is zero address");

        (bool ok, ) = payable(treasury).call{value: amount}("");
        require(ok, "Withdraw failed");
        emit TreasuryWithdrawal(treasury, amount);
    }
}
