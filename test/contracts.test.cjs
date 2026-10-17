const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Wallet Health Check - Smart Contract Suite", function () {
  let demoToken;
  let demoSpender;
  let healthBadge;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy DemoToken
    const DemoTokenFactory = await ethers.getContractFactory("DemoToken");
    demoToken = await DemoTokenFactory.deploy();
    await demoToken.waitForDeployment();

    // Deploy DemoSpender
    const DemoSpenderFactory = await ethers.getContractFactory("DemoSpender");
    demoSpender = await DemoSpenderFactory.deploy();
    await demoSpender.waitForDeployment();

    // Deploy HealthBadge
    const HealthBadgeFactory = await ethers.getContractFactory("HealthBadge");
    healthBadge = await HealthBadgeFactory.deploy();
    await healthBadge.waitForDeployment();
  });

  describe("DemoToken & Faucet", function () {
    it("Should allow user to claim 1,000 DEMO tokens from faucet", async function () {
      await expect(demoToken.connect(user1).faucet())
        .to.emit(demoToken, "FaucetClaimed")
        .withArgs(user1.address, ethers.parseEther("1000"));

      const balance = await demoToken.balanceOf(user1.address);
      expect(balance).to.equal(ethers.parseEther("1000"));
    });

    it("Should enforce faucet cooldown and revert if called before cooldown expires", async function () {
      // First claim succeeds
      await demoToken.connect(user1).faucet();

      // Second immediate claim must revert with custom error FaucetCooldownActive
      await expect(demoToken.connect(user1).faucet())
        .to.be.revertedWithCustomError(demoToken, "FaucetCooldownActive");
    });
  });

  describe("DemoSpender: Approval & Revoke Flow", function () {
    beforeEach(async function () {
      // user1 claims 1,000 DEMO tokens
      await demoToken.connect(user1).faucet();
    });

    it("TEST 2: Approve then pull succeeds", async function () {
      const spenderAddress = await demoSpender.getAddress();
      const tokenAddress = await demoToken.getAddress();
      const pullAmount = ethers.parseEther("250");

      // user1 approves DemoSpender
      await demoToken.connect(user1).approve(spenderAddress, pullAmount);

      // Verify allowance on-chain
      const allowanceBefore = await demoToken.allowance(user1.address, spenderAddress);
      expect(allowanceBefore).to.equal(pullAmount);

      // Spender contract pulls tokens from user1
      await expect(demoSpender.pull(tokenAddress, user1.address, pullAmount))
        .to.emit(demoSpender, "Pulled")
        .withArgs(tokenAddress, user1.address, spenderAddress, pullAmount);

      // Verify balances
      const userBalance = await demoToken.balanceOf(user1.address);
      const spenderBalance = await demoSpender.getBalance(tokenAddress);
      expect(userBalance).to.equal(ethers.parseEther("750"));
      expect(spenderBalance).to.equal(pullAmount);
    });

    it("TEST 3: Revoke (approve 0) then pull reverts", async function () {
      const spenderAddress = await demoSpender.getAddress();
      const tokenAddress = await demoToken.getAddress();
      const pullAmount = ethers.parseEther("100");

      // 1. First grant approval
      await demoToken.connect(user1).approve(spenderAddress, ethers.parseEther("500"));

      // 2. Revoke approval by setting allowance to 0
      await demoToken.connect(user1).approve(spenderAddress, 0);

      // Verify allowance is 0
      const allowanceAfterRevoke = await demoToken.allowance(user1.address, spenderAddress);
      expect(allowanceAfterRevoke).to.equal(0n);

      // 3. Attempting to pull tokens must revert due to insufficient allowance
      await expect(
        demoSpender.pull(tokenAddress, user1.address, pullAmount)
      ).to.be.reverted;
    });
  });

  describe("HealthBadge: On-Chain Health Reports", function () {
    it("TEST 4: recordCheck stores data and emits HealthChecked event", async function () {
      const activeApprovals = 3;
      const highRisk = 2;

      // user1 records their health check
      const tx = await healthBadge.connect(user1).recordCheck(activeApprovals, highRisk);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(healthBadge, "HealthChecked")
        .withArgs(user1.address, activeApprovals, highRisk, block.timestamp);

      // Retrieve via getter
      const record = await healthBadge.getLatestCheck(user1.address);
      expect(record.activeApprovals).to.equal(activeApprovals);
      expect(record.highRisk).to.equal(highRisk);
      expect(record.timestamp).to.equal(block.timestamp);
      expect(record.exists).to.be.true;

      // Another user has no record
      const noRecord = await healthBadge.getLatestCheck(user2.address);
      expect(noRecord.exists).to.be.false;
    });
  });
});
