import { expect, use } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployMockContract,
  MockContract,
} from "@ethereum-waffle/mock-contract";
import { MuonDelegatorRewards, PION, BondedPION } from "../typechain-types";
import { describe, it, beforeEach } from "mocha";
import { Address } from "hardhat-deploy/types";
import { MAX_UINT, deployTestToken, testDeployLocally } from "../scripts/utils";

describe("MuonDelegatorRewards", function () {
  let muonDelegatorRewards: MuonDelegatorRewards;
  let pion: PION;
  let bonPion: BondedPION;
  let admin: SignerWithAddress;
  let treasury: string;
  let DEFAULT_ADMIN_ROLE: string;
  let MINTER_ROLE: string;
  let nodeStaker: Address;
  let user: SignerWithAddress;
  let pionMinter: SignerWithAddress;
  const pionMintAmount = ethers.utils.parseEther("100000");
  const DelegateAmount = ethers.utils.parseEther("10");

  before(async function () {
    [admin, user, pionMinter] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const contracts = await loadFixture(testDeployLocally);
    pion = contracts.pion.connect(user);
    bonPion = contracts.bonPion.connect(user);
    nodeStaker = contracts.nodeStaker;
    muonDelegatorRewards = contracts.muonDelegatorRewards.connect(user);
    treasury = contracts.treasury;
    DEFAULT_ADMIN_ROLE = await bonPion.DEFAULT_ADMIN_ROLE();
    MINTER_ROLE = await pion.MINTER_ROLE();
    await pion.connect(admin).grantRole(MINTER_ROLE, pionMinter.address);
  });

  describe("Delegate Token", async () => {
    it("user should delegate token first time successful", async () => {
      expect(await pion.balanceOf(nodeStaker)).to.be.equal(0);
      expect(await pion.balanceOf(user.address)).to.be.equal(0);

      await pion.connect(pionMinter).mint(user.address, pionMintAmount);

      const UserPionBalance = await pion.balanceOf(user.address);
      expect(UserPionBalance).to.be.equal(pionMintAmount);

      expect(await pion.balanceOf(muonDelegatorRewards.address)).to.be.equal(0);

      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmount);

      //check mappings before delegation
      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        0
      );
      expect(await muonDelegatorRewards.allUsers.length).to.be.equal(0);

      expect(await muonDelegatorRewards.restake(user.address)).to.be.equal(
        false
      );

      const initialNodeStakerBalance = await pion.balanceOf(nodeStaker);

      expect(initialNodeStakerBalance).to.be.equal(0);

      expect(await muonDelegatorRewards.balances(user.address)).to.be.equal(0);

      //Delegate Token
      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmount, user.address, false);

      const startDate = await muonDelegatorRewards.startDates(user.address);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      expect(startDate).to.be.closeTo(currentTimestamp, 10);

      expect(await pion.balanceOf(muonDelegatorRewards.address)).to.be.equal(0);

      expect(await pion.balanceOf(user.address)).to.be.equal(
        UserPionBalance.sub(DelegateAmount)
      );

      expect(await pion.balanceOf(nodeStaker)).to.be.equal(
        initialNodeStakerBalance.add(DelegateAmount)
      );

      //check mapping after delegate
      expect(await muonDelegatorRewards.balances(user.address)).to.be.equal(
        DelegateAmount
      );

      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        1
      );

      expect(await muonDelegatorRewards.restake(user.address)).to.be.equal(
        false
      );
    });

    it("should user delegate token successfully again", async () => {
      //check mapping before first mint
      expect(await muonDelegatorRewards.balances(user.address)).to.be.equal(0);
      expect(await pion.balanceOf(nodeStaker)).to.be.equals(0);
      expect(await pion.balanceOf(user.address)).to.be.equal(0);
      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        0
      );
      await pion.connect(pionMinter).mint(user.address, pionMintAmount);
      expect(await pion.balanceOf(user.address)).to.be.equal(pionMintAmount);

      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmount);

      const firstTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;
      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmount, user.address, false);

      //check mapping after first delegate
      const userDelegateBalanceAfterDelegate =
        await muonDelegatorRewards.balances(user.address);
      expect(userDelegateBalanceAfterDelegate).to.be.equal(DelegateAmount);

      const nodeStakerPionBalanceAfterDelegate = await pion.balanceOf(
        nodeStaker
      );
      expect(nodeStakerPionBalanceAfterDelegate).to.be.equals(DelegateAmount);

      const userPionBalanceAfterDelegate = await pion.balanceOf(user.address);
      expect(userPionBalanceAfterDelegate).to.be.equal(
        pionMintAmount.sub(DelegateAmount)
      );

      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        1
      );

      const userStartDateAfterFirstDelegate =
        await muonDelegatorRewards.startDates(user.address);
      expect(
        Math.abs(userStartDateAfterFirstDelegate.toNumber() - firstTimestamp)
      ).to.be.lessThanOrEqual(
        1,
        "Start date should be approximately the first timestamp"
      );

      const SECONDS_IN_A_DAY = 86400;
      const TWO_DAYS = SECONDS_IN_A_DAY * 2;

      await ethers.provider.send("evm_increaseTime", [TWO_DAYS]);
      await ethers.provider.send("evm_mine", []);

      //Delegate again
      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmount);

      const secondTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;

      const expectedNewStartDate = userDelegateBalanceAfterDelegate
        .mul(userStartDateAfterFirstDelegate)
        .add(DelegateAmount.mul(secondTimestamp))
        .div(userDelegateBalanceAfterDelegate.add(DelegateAmount));

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmount, user.address, false);

      const userStartDateAfterSecondDelegate =
        await muonDelegatorRewards.startDates(user.address);

      expect(
        Math.abs(
          userStartDateAfterSecondDelegate.toNumber() -
            expectedNewStartDate.toNumber()
        )
      ).to.be.lte(1);
      //check mapping after second delegate
      const secondUserDelegateBalanceAfterDelegate =
        await muonDelegatorRewards.balances(user.address);

      expect(secondUserDelegateBalanceAfterDelegate).to.be.equal(
        userDelegateBalanceAfterDelegate.add(DelegateAmount)
      );

      const secondNodeStakerPionBalanceAfterDelegate = await pion.balanceOf(
        nodeStaker
      );
      expect(secondNodeStakerPionBalanceAfterDelegate).to.be.equal(
        nodeStakerPionBalanceAfterDelegate.add(DelegateAmount)
      );

      const secondUserPionBalanceAfterDelegate = await pion.balanceOf(
        user.address
      );

      expect(secondUserPionBalanceAfterDelegate).to.be.equal(
        pionMintAmount.sub(secondUserDelegateBalanceAfterDelegate)
      );

      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        1
      );
    });

    it("should update startDate correctly based on stake amount", async () => {
      const DelegateAmountSmall = ethers.utils.parseEther("0.000001");
      const DelegateAmountLarge = ethers.utils.parseEther("80");
      const DelegateAmountLarge2 = ethers.utils.parseEther("10000");

      // Mint tokens for user
      await pion.connect(pionMinter).mint(user.address, pionMintAmount);
      expect(await pion.balanceOf(user.address)).to.be.equal(pionMintAmount);

      // First delegate (10 tokens)
      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmount);
      const firstDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;
      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmount, user.address, false);

      const startDateAfterFirstDelegate = await muonDelegatorRewards.startDates(
        user.address
      );
      const firstTimeDifference = Math.abs(
        startDateAfterFirstDelegate.toNumber() - firstDelegateTime
      );
      expect(firstTimeDifference).to.be.lte(1);
      console.log(
        "Time difference after first delegate (10 tokens):",
        firstTimeDifference
      );

      // Increase time by 5 days
      const SECONDS_IN_A_DAY = 86400;
      await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 5]);
      await ethers.provider.send("evm_mine", []);

      const secondDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;
      // Second delegate (0.000001 tokens)
      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmountSmall);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmountSmall, user.address, false);

      const startDateAfterSecondDelegate =
        await muonDelegatorRewards.startDates(user.address);

      await expect(
        startDateAfterSecondDelegate.sub(startDateAfterFirstDelegate)
      ).to.be.equal(0);

      console.log(
        "second",
        startDateAfterFirstDelegate.toNumber(),
        startDateAfterSecondDelegate.toNumber(),
        secondDelegateTime
      );

      //third delegate DelegateAmountLarge
      await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 10]);
      await ethers.provider.send("evm_mine", []);

      const thirdDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;

      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmountLarge);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmountLarge, user.address, false);

      const startDateAfterThirdDelegate = await muonDelegatorRewards.startDates(
        user.address
      );

      console.log(
        "third",
        startDateAfterSecondDelegate.toNumber(),
        startDateAfterThirdDelegate.toNumber(),
        thirdDelegateTime
      );

      //forth delegate
      await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 10]);
      await ethers.provider.send("evm_mine", []);

      const fourthDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;

      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmountLarge2);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmountLarge2, user.address, false);

      const startDateAfterFourthDelegate =
        await muonDelegatorRewards.startDates(user.address);

      console.log(
        "forth",
        startDateAfterThirdDelegate.toNumber(),
        startDateAfterFourthDelegate.toNumber(),
        fourthDelegateTime
      );
    });
  });
});
