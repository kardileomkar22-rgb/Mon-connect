// Deploys VerifiedNft (x2) + ChainConnectV2, then writes addresses + ABIs into
// ../src/contracts/deployment.json so the React app picks them up automatically.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function deployOne(name, args) {
  const factory = await hre.ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const receipt = await tx.wait();
  const address = await contract.getAddress();
  console.log(`${name}: ${address}  (tx ${tx.hash}, block ${receipt.blockNumber})`);
  return { address, txHash: tx.hash, blockNumber: receipt.blockNumber };
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const feeWallet = process.env.FEE_WALLET || deployer.address;
  const net = await hre.ethers.provider.getNetwork();
  console.log(`Network chainId ${net.chainId}, deployer ${deployer.address}, feeWallet ${feeWallet}`);

  const organizerNft = await deployOne("VerifiedNft", ["MonConnect Organizer", "MCORG", deployer.address]);
  const serviceNft = await deployOne("VerifiedNft", ["MonConnect Service Provider", "MCSP", deployer.address]);
  const chainConnect = await deployOne("ChainConnectV2", [feeWallet]);

  const abiOf = async (n) => (await hre.artifacts.readArtifact(n)).abi;
  const out = {
    network: hre.network.name,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    feeWallet,
    chainConnectV2: { ...chainConnect, abi: await abiOf("ChainConnectV2") },
    organizerNft: organizerNft,
    serviceProviderNft: serviceNft,
    verifiedNftAbi: await abiOf("VerifiedNft"),
  };

  // Frontend consumes this file (see src/utils/chainConnectV2.ts and nft.ts).
  // Skip it for the in-process "hardhat" network so a dry run never overwrites real addresses.
  const isLocal = hre.network.name === "hardhat";
  const frontendFile = path.join(__dirname, "..", "..", "src", "contracts", "deployment.json");
  if (!isLocal) {
    fs.mkdirSync(path.dirname(frontendFile), { recursive: true });
    fs.writeFileSync(frontendFile, JSON.stringify(out, null, 2));
  }

  // Keep a per-network record next to the contracts too.
  const recDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(recDir, { recursive: true });
  fs.writeFileSync(path.join(recDir, `${hre.network.name}.json`), JSON.stringify(out, null, 2));

  console.log(isLocal ? "\nLocal dry run: frontend config left untouched." : "\nWrote src/contracts/deployment.json and blockchain/deployments/" + hre.network.name + ".json");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
