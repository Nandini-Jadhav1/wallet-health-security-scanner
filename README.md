# 🛡️ Wallet Health Check — Web3 Security & Revoke Engine

A zero-backend, non-custodial Web3 security dashboard that audits active ERC-20 token approvals, calculates a transparent **Wallet Health Score**, explains security vulnerabilities in plain English, and provides 1-click on-chain revocations.

Includes an interactive **Sepolia Demo Lab** powered by custom smart contracts to simulate live dapp token pulls and prove that revoking permissions guarantees complete fund safety.

---

## 📐 Architecture Diagram

```mermaid
flowchart TD
    subgraph Frontend["Frontend Client (Vite + React + Tailwind + Ethers v6)"]
        UI[User Interface / Theme Toggle]
        AI[Address / ENS Input]
        CS[Chain Selector: Sepolia & Mainnet]
        TB[Approval Table & Risk Engine]
        DL[Demo Lab: Sepolia Playground]
        HB_UI[On-Chain Checkpoint Card]
    end

    subgraph NodeLayer["Blockchain Node Providers"]
        Alchemy[Alchemy JSON-RPC Indexer<br/>(VITE_ALCHEMY_KEY)]
        PublicNode[Public Fallback RPCs<br/>(Auto-halving Chunking Engine)]
    end

    subgraph Contracts["Smart Contracts (Sepolia Testnet)"]
        DemoToken["DemoToken.sol (ERC-20 + Faucet)"]
        DemoSpender["DemoSpender.sol (Dapp Simulator)"]
        HealthBadge["HealthBadge.sol (On-Chain Report Registry)"]
    end

    AI -->|1. Resolve ENS on Mainnet| Alchemy
    CS -->|2. Adaptive getLogs Query| Alchemy
    Alchemy -->|3. Filter ERC-20 Logs| TB
    TB -->|4. Query live allowance & getCode| NodeLayer
    TB -->|5. Revoke: approve(spender, 0)| Contracts
    DL -->|Faucet / Approve / Pull Demo| Contracts
    HB_UI -->|recordCheck(approvals, highRisk)| HealthBadge
```

---

## 🔍 How the Scanner Works (The 7-Step Algorithm)

The scanner engine in [`src/lib/scanner.ts`](file:///c:/Users/Tuf/OneDrive/Desktop/Wallet%20“health%20check”%20scanner/src/lib/scanner.ts) executes the following sequence:

1. **Targeted Event Filter Construction:**
   Constructs a JSON-RPC `eth_getLogs` query with:
   - `topic[0]`: `keccak256("Approval(address,address,uint256)")` (`0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925`)
   - `topic[1]`: 32-byte zero-padded owner address (`zeroPadValue(owner, 32)`).
   *WHY:* Filtering on the node level allows the RPC to filter through millions of transactions efficiently.

2. **ERC-721 Discard Filter:**
   Discards any log where `topics.length !== 3`.
   *WHY:* ERC-721 NFT approvals define `event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)`, producing 4 topics. ERC-20 approvals index only owner and spender (value is in data), producing exactly 3 topics.

3. **50,000-Block Adaptive Concurrency Engine:**
   Splits the scan window into 50k-block batches queried with limited concurrency (max 5 simultaneous requests). If an RPC returns payload-size, timeout, or range errors, the engine dynamically halves the chunk size recursively down to 2,000 blocks.

4. **Pair Deduplication (Latest Event):**
   Groups all events by `tokenAddress + spenderAddress` and retains only the event with the highest block number and log index.
   *WHY:* Historical approvals are superseded by subsequent ones; only the latest transaction parameters reflect current state.

5. **On-Chain Allowance Verification & Drop Rule:**
   Calls `allowance(owner, spender)` on-chain for every unique pair. Any pair returning `0n` is **DROPPED**.
   *WHY:* Past events might have been spent down or already revoked. Only active non-zero allowances represent an active vulnerability.

6. **Resilient Metadata Extraction:**
   Queries `symbol()` and `decimals()` wrapped in defensive `try/catch` fallbacks (`"UNKNOWN"`, `18`).
   *WHY:* Non-standard tokens (like MKR or broken legacy ERC-20 implementations) may revert on `symbol()` or return `bytes32`.

7. **Unlimited Allowance Classification:**
   Flags `isUnlimited = allowance >= 2n ** 255n`.
   *WHY:* Standard dapps request `type(uint256).max` (~1.15 × 10⁷⁷) so users don't need to approve again. Any allowance ≥ 2²⁵⁵ allows the contract to drain the entire token balance indefinitely.

---

## ⚖️ Transparent Risk Rules & Health Score

### **Risk Levels**
* **🔴 HIGH RISK:** Unlimited allowance (`allowance >= 2^255`).
  * *Plain-English:* "This contract can spend ALL of your tokens at any time without further confirmation."
* **🟡 MEDIUM RISK:**
  * Approval is older than 180 days (calculated strictly from block timestamp, not block numbers).
  * Spender address is an EOA / personal wallet (`provider.getCode(spender) === "0x"`).
* **🔵 INFO (Known Protocol):** Spender matches an official protocol router from [`src/lib/routers.ts`](file:///c:/Users/Tuf/OneDrive/Desktop/Wallet%20“health%20check”%20scanner/src/lib/routers.ts) (Uniswap Universal Router, Permit2, SwapRouter02, 1inch v5/v6) with official documentation URLs linked.
* **🟢 LOW RISK:** Limited allowance granted to a recent, verified contract.

### **Health Score Formula (0 - 100)**
```text
Score = Math.max(0, 100 - (High × 25) - (Medium × 10) - (Low/Info × 2))
```
* **80 - 100:** Excellent (Green Shield)
* **50 - 79:** Moderate Risk (Amber Warning)
* **0 - 49:** Critical Risk (Red Alert)

---

## 📜 Smart Contracts (`/contracts`)

All contracts feature complete NatSpec documentation and custom Solidity errors:

| Contract | Purpose | Key Functions |
| :--- | :--- | :--- |
| **`DemoToken.sol`** | Test ERC-20 token (`DEMO`) on Sepolia | `faucet()` (mints 1,000 DEMO with a 1-minute anti-spam cooldown) |
| **`DemoSpender.sol`** | Dapp simulator demonstrating vulnerability | `pull(token, from, amount)` (calls `IERC20.transferFrom`) |
| **`HealthBadge.sol`** | On-chain audit registry | `recordCheck(activeApprovals, highRisk)`, `getLatestCheck(user)` |

### **Deployed Addresses Configuration**
Deploy the three contracts to Sepolia via [Remix IDE](https://remix.ethereum.org) and add the addresses to [`src/contracts/addresses.ts`](file:///c:/Users/Tuf/OneDrive/Desktop/Wallet%20“health%20check”%20scanner/src/contracts/addresses.ts):

```typescript
export const DEPLOYED_ADDRESSES = {
  11155111: {
    demoToken: '0xYourSepoliaDemoTokenAddress',
    demoSpender: '0xYourSepoliaDemoSpenderAddress',
    healthBadge: '0xYourSepoliaHealthBadgeAddress',
  },
};
```
*(You can also paste contract addresses directly inside the Demo Lab UI tab without modifying code).*

---

## 🔒 Security Invariants & Revocation Safety

* **Strict `approve(spender, 0)` only:** The app's revoke ABI is strictly limited to `function approve(address spender, uint256 value)`. Calldata containing `transfer` or arbitrary calls is impossible.
* **Owner-Only Gating:** Revoke buttons are active **only** when `connectedWallet.toLowerCase() === scannedAddress.toLowerCase()`. Otherwise, displays "View only".
* **Network Enforcer:** Automatically detects chain mismatch and prompts MetaMask's `wallet_switchEthereumChain` / `wallet_addEthereumChain`.
* **Allowance Re-verification:** After a revoke transaction confirms, the app re-checks the on-chain allowance before removing the row and updating the health score.
* **Zero Private Key Exposure:** No private keys or seed phrases are ever handled, requested, or stored.

---

## ⚠️ Known Limitations & RPC Reality

1. **Free RPC Tier Limits & Token-Address Scoping:**
   - **The 10-Block Limit:** Alchemy's free tier strictly limits `eth_getLogs` to a maximum 10-block range (`code: -32600`), and public endpoints reject queries without an `address` filter (`code: -32701`). Attempting a whole-wallet, all-contract historical scan across 180 days (~1.3M blocks) is impossible on free tiers; block-range halving cannot solve this because 130,000 requests would immediately exhaust compute unit per second (CUPS) quotas.
   - **The Token-Scoped Solution:** To deliver an instant, production-grade security audit without paid enterprise RPC nodes, the scanner scopes requests by token contract:
     - On **Sepolia**: Queries `DemoToken.sol` from `DEMO_TOKEN_DEPLOY_BLOCK` to latest.
     - On **Ethereum Mainnet**: Queries a curated list of high-volume tokens (`USDC`, `USDT`, `DAI`, `WETH`) documented in [`src/lib/knownTokens.ts`](file:///c:/Users/Tuf/OneDrive/Desktop/Wallet%20“health%20check”%20scanner/src/lib/knownTokens.ts).
     - **Custom Audits:** Users can paste any specific ERC-20 contract into the **"Check another token"** input field.
   - **Diagnostic Transparency:** Any failed chunk or node rate-limit error is reported honestly and surfaced directly in the UI diagnostic banner.
2. **Permit / Off-Chain Signatures:** EIP-2612 `permit` signatures and Permit2 approvals are signed off-chain and only materialize on-chain when redeemed. The scanner flags canonical Permit2 contracts as "Known Protocol" spenders.
3. **Default Scan Window:** Defaults to the last ~180 days to balance query latency with comprehensive permission auditing. The "Scan full history" toggle enables complete historical audits where the node tier permits.

---

## 🚀 Local Development Setup

### **1. Prerequisites**
* Node.js v18+ (tested on Node v22)
* npm v9+

### **2. Installation**
```bash
# Clone the repository and navigate to folder
cd "Wallet “health check” scanner"

# Install dependencies
npm install
```

### **3. Environment Setup**
Create a `.env` file in the project root:
```env
# Optional: Alchemy API key for high-speed indexing
VITE_ALCHEMY_KEY=your_alchemy_api_key_here
```
*(The `.env` file is excluded in `.gitignore` and will never be committed).*

### **4. Run Smart Contract Test Suite**
```bash
npx hardhat --config hardhat.config.cjs test
```

### **5. Run Development Server**
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.
