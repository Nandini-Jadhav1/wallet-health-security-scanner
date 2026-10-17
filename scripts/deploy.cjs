/**
 * scripts/deploy.cjs
 *
 * Deploys DemoToken, DemoSpender, and HealthBadge to Sepolia (or any
 * network you pass via --network).
 *
 * Run:
 *   npx hardhat run scripts/deploy.cjs --network sepolia
 *
 * Required .env variables:
 *   SEPOLIA_RPC_URL     – Alchemy/Infura Sepolia endpoint
 *   DEPLOYER_PRIVATE_KEY – Funded Sepolia wallet private key (with 0x prefix)
 */

// hre (Hardhat Runtime Environment) is injected by Hardhat automatically.
// We do NOT need to import it; it is available as a global.
const { ethers } = require("hardhat");

async function main() {
  // ── 1. Who is deploying? ────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log("\n🔑  Deployer address :", deployer.address);

  const balanceBig = await ethers.provider.getBalance(deployer.address);
  const balanceETH = ethers.formatEther(balanceBig);
  console.log("💰  Deployer balance :", balanceETH, "ETH");

  if (balanceBig === 0n) {
    throw new Error("Deployer wallet has 0 ETH – top it up on Sepolia faucet first.");
  }

  // ── 2. Deploy DemoToken ─────────────────────────────────────────────────
  console.log("\n📦  Deploying DemoToken …");
  const DemoToken = await ethers.getContractFactory("DemoToken");
  // Constructor: DemoToken() — no arguments
  const demoToken = await DemoToken.deploy();
  await demoToken.waitForDeployment();

  const demoTokenAddress = await demoToken.getAddress();
  const demoTokenTx = demoToken.deploymentTransaction();
  console.log("✅  DemoToken deployed");
  console.log("    Address :", demoTokenAddress);
  console.log("    Tx hash :", demoTokenTx.hash);

  // ── 3. Deploy DemoSpender ───────────────────────────────────────────────
  console.log("\n📦  Deploying DemoSpender …");
  const DemoSpender = await ethers.getContractFactory("DemoSpender");
  // Constructor: DemoSpender() — no arguments
  const demoSpender = await DemoSpender.deploy();
  await demoSpender.waitForDeployment();

  const demoSpenderAddress = await demoSpender.getAddress();
  const demoSpenderTx = demoSpender.deploymentTransaction();
  console.log("✅  DemoSpender deployed");
  console.log("    Address :", demoSpenderAddress);
  console.log("    Tx hash :", demoSpenderTx.hash);

  // ── 4. Deploy HealthBadge ───────────────────────────────────────────────
  console.log("\n📦  Deploying HealthBadge …");
  const HealthBadge = await ethers.getContractFactory("HealthBadge");
  // Constructor: HealthBadge() — no arguments
  const healthBadge = await HealthBadge.deploy();
  await healthBadge.waitForDeployment();

  const healthBadgeAddress = await healthBadge.getAddress();
  const healthBadgeTx = healthBadge.deploymentTransaction();
  console.log("✅  HealthBadge deployed");
  console.log("    Address :", healthBadgeAddress);
  console.log("    Tx hash :", healthBadgeTx.hash);

  // ── 5. Summary ──────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT SUMMARY — copy these into src/contracts/addresses.ts");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  DEMO_TOKEN_ADDRESS   = "${demoTokenAddress}"`);
  console.log(`  DEMO_SPENDER_ADDRESS = "${demoSpenderAddress}"`);
  console.log(`  HEALTH_BADGE_ADDRESS = "${healthBadgeAddress}"`);
  console.log("════════════════════════════════════════════════════════════\n");
  console.log("🔍  Verify on Etherscan:");
  console.log(`  https://sepolia.etherscan.io/address/${demoTokenAddress}`);
  console.log(`  https://sepolia.etherscan.io/address/${demoSpenderAddress}`);
  console.log(`  https://sepolia.etherscan.io/address/${healthBadgeAddress}`);
  console.log("");
}

// Standard Hardhat error-handling wrapper
main().catch((err) => {
  console.error("\n❌  Deployment failed:", err.message);
  process.exitCode = 1;
});
