import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("ReboHromeCollectibles", () => {
  async function deployFixture() {
    const [owner, treasury, buyer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ReboHromeCollectibles");
    const contract = await factory.deploy(
      "https://www.rebohrome.com/api/metadata/{id}.json",
      owner.address,
      treasury.address,
    );
    await contract.waitForDeployment();
    await contract.setMaxSupply(1, 10);
    await contract.setTokenActive(1, true);

    return { contract, owner, treasury, buyer };
  }

  it("owner can deploy and configure token", async () => {
    const { contract } = await deployFixture();
    expect(await contract.tokenActive(1)).to.equal(true);
    expect(await contract.maxSupply(1)).to.equal(10);
  });

  it("purchaseCollectible mints to recipient and emits event", async () => {
    const { contract, buyer } = await deployFixture();
    const orderId = ethers.keccak256(ethers.toUtf8Bytes("WERT-ORDER-1"));

    await expect(contract.purchaseCollectible(buyer.address, 1, 2, orderId)).to.emit(
      contract,
      "CollectiblePurchased",
    );

    expect(await contract.balanceOf(buyer.address, 1)).to.equal(2);
    expect(await contract.usedOrders(orderId)).to.equal(true);
    expect(await contract.totalMinted(1)).to.equal(2);
  });

  it("rejects zero recipient, zero quantity, and duplicate order", async () => {
    const { contract, buyer } = await deployFixture();
    const orderId = ethers.keccak256(ethers.toUtf8Bytes("WERT-ORDER-2"));

    await expect(
      contract.purchaseCollectible(ethers.ZeroAddress, 1, 1, orderId),
    ).to.be.revertedWith("Recipient is zero address");
    await expect(
      contract.purchaseCollectible(buyer.address, 1, 0, orderId),
    ).to.be.revertedWith("Quantity is zero");

    await contract.purchaseCollectible(buyer.address, 1, 1, orderId);
    await expect(
      contract.purchaseCollectible(buyer.address, 1, 1, orderId),
    ).to.be.revertedWith("Order already used");
  });

  it("enforces pause and max supply", async () => {
    const { contract, buyer } = await deployFixture();
    const firstOrder = ethers.keccak256(ethers.toUtf8Bytes("WERT-ORDER-3"));
    const secondOrder = ethers.keccak256(ethers.toUtf8Bytes("WERT-ORDER-4"));

    await contract.pause();
    await expect(
      contract.purchaseCollectible(buyer.address, 1, 1, firstOrder),
    ).to.be.revertedWithCustomError(contract, "EnforcedPause");

    await contract.unpause();
    await expect(
      contract.purchaseCollectible(buyer.address, 1, 11, secondOrder),
    ).to.be.revertedWith("Max supply exceeded");
  });
});
