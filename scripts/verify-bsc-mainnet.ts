import hre from "hardhat";

function requireEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";

  if (!value) {
    throw new Error(`${name} is required for BSC Mainnet verification.`);
  }

  return value;
}

async function main() {
  const contractAddress = requireEnv("WERT_SMART_CONTRACT_ADDRESS");
  const treasury = requireEnv("REBOHROME_TREASURY_ADDRESS");
  const [deployer] = await hre.ethers.getSigners();
  const owner = process.env.REBOHROME_CONTRACT_OWNER?.trim() || deployer.address;
  const baseURI =
    process.env.REBOHROME_COLLECTIBLES_URI?.trim() ||
    "https://www.rebohrome.com/api/metadata/{id}.json";

  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: [baseURI, owner, treasury],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
