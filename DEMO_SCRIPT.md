# 🎙️ 2-Minute Demo Presentation Script & Pitch Deck

---

## ⚡ The 5-Bullet Pitch

1. **The Problem:** 
   Over $2.8 Billion in Web3 user funds have been drained through malicious or compromised smart contracts exploiting forgotten, unlimited ERC-20 token approvals. Most crypto users have dozens of contracts that can silently drain their tokens at any second.
2. **The Solution:** 
   **Wallet Health Check** is a zero-backend, non-custodial security dashboard that scans active allowances, calculates a transparent 0-100 Health Score, explains risks in human-readable English, and allows users to revoke permissions in 1 click.
3. **How It Works:** 
   Our 7-step scanner queries filtered `Approval` event logs with adaptive chunk halving, deduplicates records, queries live on-chain `allowance()` state, classifies risks using deterministic rules (unlimited allowances, age >180 days, EOA spenders), and executes atomic `approve(spender, 0)` transactions.
4. **What's Unique:** 
   Unlike closed-source scanners, we include an interactive **Sepolia Demo Lab** powered by custom smart contracts (`DemoToken.sol`, `DemoSpender.sol`, `HealthBadge.sol`). Users can claim tokens, grant an approval, witness a simulated dapp pull funds, and verify that revoking renders their wallet impenetrable. Furthermore, users can save their security checkpoint directly on-chain.
5. **What's Next:** 
   Automated telegram/email alerts for newly opened approvals, cross-chain support across L2 rollups (Arbitrum, Optimism, Base, Polygon), and native Permit2 off-chain signature audit support.

---

## ⏱️ 2-Minute Demo Script (Word-for-Word Walkthrough)

> **Total Time:** ~120 Seconds  
> **Prerequisites:** MetaMask connected on Sepolia, Demo Lab tab open.

---

### **[0:00 - 0:25] The Problem & Introduction**
* **Action:** Show the landing page with the dark-mode aesthetic and the circular Health Score gauge.
* **Narration:**
  > *"Hello everyone! Whenever you swap on a DEX or lend on a protocol, you sign an approval giving that contract permission to spend your tokens. Most dApps ask for 'Unlimited' approvals. If that contract gets hacked tomorrow, or turns malicious, your funds can be drained without your signature. Today, I'm presenting **Wallet Health Check** — a Web3 security scanner that audits active ERC-20 allowances, calculates an instant Health Score, and lets you revoke permissions safely."*

---

### **[0:25 - 0:50] The Demo Lab: Simulating Vulnerability**
* **Action:** Click the **Demo Lab (Sepolia)** tab.
* **Narration:**
  > *"To prove how real this vulnerability is, I built custom smart contracts deployed on Sepolia. Let's go through the 5-step interactive Demo Lab:*
  > 
  > *In **Step 1**, I click **'Get 1,000 DEMO'**. Our smart contract's public faucet mints 1,000 test tokens with a cooldown to prevent spam.*
  > 
  > *In **Step 2**, I click **'Approve Unlimited'**. This simulates what Uniswap or a lending protocol asks for by calling `approve(DemoSpender, MaxUint256)`."*

---

### **[0:50 - 1:15] The Exploit: Simulating Spender Pull**
* **Action:** Click **Step 4: Simulate Spender Pull**.
* **Narration:**
  > *"Now watch this: In **Step 4**, the DemoSpender contract calls `transferFrom()`. Notice: **my wallet never asked me to confirm a transfer!** The contract unilaterally pulled 200 DEMO tokens from my wallet because the allowance was open. This is exactly how real-world wallet drains happen."*

---

### **[1:15 - 1:40] The Scanner & Revocation**
* **Action:** Switch to the **Scanner** tab. Enter the wallet address or click **"Scan"**.
* **Narration:**
  > *"Now let's switch to the **Approvals Scanner**. Notice our transparent Health Score dropped to Critical Risk with a prominent red badge. The table flags the DemoSpender approval as **HIGH RISK** and warns in plain English: 'This contract can spend ALL of your DEMO tokens at any time.'*
  > 
  > *I click **'Revoke'**. Notice the security guardrail: our app strictly calls `approve(spender, 0)`. Once confirmed on Sepolia Etherscan, our app re-queries the on-chain allowance to verify it is zero, removes the row, and restores our Health Score to 100!"*

---

### **[1:40 - 2:00] On-Chain Report & Conclusion**
* **Action:** Click **"Save Report On-Chain"** and show the confirmation toast.
* **Narration:**
  > *"Finally, I click **'Save Report On-Chain'**, which records this clean audit inside `HealthBadge.sol` as a verifiable security checkpoint.*
  > 
  > *Wallet Health Check requires no backend, runs on pure mathematical verification, and gives everyday Web3 users complete control over their token permissions. Thank you!"*
