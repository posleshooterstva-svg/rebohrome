import "server-only";

import { encodeFunctionData, getAddress, keccak256, stringToBytes, type Hex } from "viem";
import { ReboHromeCollectiblesAbi } from "@/lib/contracts/ReboHromeCollectibles.abi";

export function toBytes32OrderId(input: {
  provider?: string;
  localTransactionId: string;
  clickId: string;
}): Hex {
  const provider = input.provider?.trim() || "wert";
  const localTransactionId = input.localTransactionId.trim();
  const clickId = input.clickId.trim();

  if (!localTransactionId || !clickId) {
    throw new Error("Local transaction id is required for Wert order encoding.");
  }

  return keccak256(stringToBytes(`${provider}:${localTransactionId}:${clickId}`));
}

export function buildWertScInputData(input: {
  recipientAddress: string;
  tokenId: number | bigint;
  quantity: number | bigint;
  orderId: Hex;
}): Hex {
  const recipient = getAddress(input.recipientAddress);
  const tokenId = BigInt(input.tokenId);
  const quantity = BigInt(input.quantity);

  if (tokenId < BigInt(0)) {
    throw new Error("Token id must be zero or greater.");
  }

  if (quantity <= BigInt(0)) {
    throw new Error("Token quantity must be greater than zero.");
  }

  return encodeFunctionData({
    abi: ReboHromeCollectiblesAbi,
    functionName: "purchaseCollectible",
    args: [recipient, tokenId, quantity, input.orderId],
  });
}
