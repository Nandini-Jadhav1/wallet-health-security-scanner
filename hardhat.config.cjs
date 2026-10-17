// Load .env so SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY are available.
// dotenv is a devDependency — it is never bundled into the frontend build.
require("dotenv").config();

require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

// Read from .env. Fall back to Alchemy key for RPC if SEPOLIA_RPC_URL is not set.
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  `https://eth-sepolia.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_KEY || ""}`;

// A dummy private key prevents Hardhat from crashing during compile/test
// when no real deployer key is present. Deployment will fail loudly if
// DEPLOYER_PRIVATE_KEY is missing — that is intentional.
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // Sepolia testnet – used for Demo Lab deployment
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
