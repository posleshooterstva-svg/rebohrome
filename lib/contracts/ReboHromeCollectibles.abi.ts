export const ReboHromeCollectiblesAbi = [
  {
    type: "function",
    name: "purchaseCollectible",
    stateMutability: "payable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "orderId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setTokenActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setMaxSupply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "tokenMaxSupply", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "usedOrders",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "tokenActive",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "CollectiblePurchased",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "quantity", type: "uint256", indexed: false },
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "value", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenStatusUpdated",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "active", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MaxSupplyUpdated",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "maxSupply", type: "uint256", indexed: false },
    ],
  },
] as const;
