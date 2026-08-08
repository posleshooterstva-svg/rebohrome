import { mkdir, writeFile } from "fs/promises";
import path from "path";
import hre from "hardhat";

function requireEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";

  if (!value) {
    throw new Error(`${name} is required for BSC Mainnet deployment.`);
  }

  return value;
}

async function main() {
  requireEnv("DEPLOYER_PRIVATE_KEY");
  requireEnv("BSC_MAINNET_RPC_URL");

  const [deployer] = await hre.ethers.getSigners();
  const owner = process.env.REBOHROME_CONTRACT_OWNER?.trim() || deployer.address;
  const treasury = requireEnv("REBOHROME_TREASURY_ADDRESS");
  const baseURI =
    process.env.REBOHROME_COLLECTIBLES_URI?.trim() ||
    "https://www.rebohrome.com/api/metadata/{id}.json";

  const factory = await hre.ethers.getContractFactory("ReboHromeCollectibles");
  const contract = await factory.deploy(baseURI, owner, treasury);
  const deploymentTx = contract.deploymentTransaction();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const network = await hre.ethers.provider.getNetwork();
  const artifact = await hre.artifacts.readArtifact("ReboHromeCollectibles");
  const deployment = {
    contractName: "ReboHromeCollectibles",
    contractAddress,
    deployTxHash: deploymentTx?.hash ?? null,
    network: "bsc",
    chainId: Number(network.chainId),
    deployer: deployer.address,
    owner,
    treasury,
    baseURI,
    abi: artifact.abi,
    deployedAt: new Date().toISOString(),
  };
  const outputDir = path.join(process.cwd(), "deployments", "bsc-mainnet");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "ReboHromeCollectibles.json"),
    `${JSON.stringify(deployment, null, 2)}\n`,
    "utf8",
  );

  console.log(`ReboHromeCollectibles deployed to ${contractAddress}`);
  console.log(`Deploy tx: ${deployment.deployTxHash ?? "unknown"}`);
  console.log(`Network: bsc (${network.chainId})`);
  console.log("Artifact: deployments/bsc-mainnet/ReboHromeCollectibles.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
