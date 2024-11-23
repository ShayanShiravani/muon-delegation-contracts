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

      const delegateTime = (await ethers.provider.getBlock("latest")).timestamp;

      const startDate = await muonDelegatorRewards.startDates(user.address);
      expect(startDate).to.be.equal(delegateTime);

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

    it("should update startDate correctly based on stake amount", async () => {
      const DelegateAmountSmall = ethers.utils.parseEther("10");
      const DelegateAmountLarge = ethers.utils.parseEther("40");
      const DelegateAmountLarge2 = ethers.utils.parseEther("10000");

      // Mint tokens for user
      await pion.connect(pionMinter).mint(user.address, pionMintAmount);
      expect(await pion.balanceOf(user.address)).to.be.equal(pionMintAmount);

      // First delegate (10 tokens)
      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmount);

      expect(await muonDelegatorRewards.balances(user.address)).to.be.equal(0);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmount, user.address, false);

      const firstDelegateBalance = await muonDelegatorRewards.balances(
        user.address
      );

      expect(firstDelegateBalance).to.be.equal(DelegateAmount);

      const firstDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;

      const startDateAfterFirstDelegate = await muonDelegatorRewards.startDates(
        user.address
      );

      expect(startDateAfterFirstDelegate).to.be.eq(firstDelegateTime);

      expect(await pion.balanceOf(nodeStaker)).to.be.equal(
        firstDelegateBalance
      );

      // Increase time by 5 days
      const SECONDS_IN_A_DAY = 86400;
      await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 5]);
      await ethers.provider.send("evm_mine", []);

      // Second delegate (0.000001 tokens)
      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmountSmall);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmountSmall, user.address, false);

      const secondDelegateBalance = await muonDelegatorRewards.balances(
        user.address
      );

      expect(secondDelegateBalance).to.be.equal(
        firstDelegateBalance.add(DelegateAmountSmall)
      );

      expect(await pion.balanceOf(nodeStaker)).to.be.equal(
        firstDelegateBalance.add(DelegateAmountSmall)
      );

      const secondDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;

      const startDateAfterSecondDelegate =
        await muonDelegatorRewards.startDates(user.address);

      await expect(startDateAfterSecondDelegate).to.be.eq(
        (firstDelegateTime + secondDelegateTime) / 2
      );

      //third delegate DelegateAmountLarge
      await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 10]);
      await ethers.provider.send("evm_mine", []);

      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmountLarge);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmountLarge, user.address, false);

      const thirdDelegateBalance = await muonDelegatorRewards.balances(
        user.address
      );

      expect(thirdDelegateBalance).to.be.equal(
        secondDelegateBalance.add(DelegateAmountLarge)
      );

      expect(await pion.balanceOf(nodeStaker)).to.be.equal(
        secondDelegateBalance.add(DelegateAmountLarge)
      );

      const thirdDelegateTime = (await ethers.provider.getBlock("latest"))
        .timestamp;

      const startDateAfterThirdDelegate = await muonDelegatorRewards.startDates(
        user.address
      );

      const diff =
        ((thirdDelegateTime - startDateAfterSecondDelegate.toNumber()) * 2) / 3;

      const newTime = startDateAfterSecondDelegate.toNumber() + diff;
      await expect(startDateAfterThirdDelegate).to.be.equal(newTime);

      //forth delegate
      await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 10]);
      await ethers.provider.send("evm_mine", []);

      await pion
        .connect(user)
        .approve(muonDelegatorRewards.address, DelegateAmountLarge2);

      await muonDelegatorRewards
        .connect(user)
        .delegateToken(DelegateAmountLarge2, user.address, false);

      const forthDelegateBalance = await muonDelegatorRewards.balances(
        user.address
      );

      expect(await pion.balanceOf(nodeStaker)).to.be.equal(
        thirdDelegateBalance.add(DelegateAmountLarge2)
      );

      expect(forthDelegateBalance).to.be.equal(
        thirdDelegateBalance.add(DelegateAmountLarge2)
      );
    });
  });

  describe("Delegate NFT", async () => {
    it("should successfully delegate nft", async () => {
      await pion
        .connect(admin)
        .grantRole(await pion.MINTER_ROLE(), user.address);
      await pion.connect(user).mint(user.address, pionMintAmount);
      await pion.connect(user).approve(bonPion.address, pionMintAmount);
      await bonPion
        .connect(user)
        .mintAndLock([pion.address], [pionMintAmount], user.address);

      const nftPower = await bonPion.getLockedOf(1, [pion.address]);

      const tokenId = 1;

      expect(await bonPion.ownerOf(1)).to.be.equal(user.address);

      await expect(
        muonDelegatorRewards
          .connect(user)
          .delegateNFT(tokenId, user.address, false)
      ).to.be.revertedWith("ERC721: caller is not token owner or approved");

      await bonPion
        .connect(user)
        .approve(muonDelegatorRewards.address, tokenId);

      expect(await bonPion.getApproved(1)).to.be.equal(
        muonDelegatorRewards.address
      );

      await expect(
        muonDelegatorRewards
          .connect(user)
          .delegateNFT(tokenId, user.address, false)
      ).to.be.revertedWith("Transfer is Limited");

      await bonPion.connect(admin).setPublicTransfer(true);

      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        0
      );
      expect(await muonDelegatorRewards.allUsers.length).to.be.equal(0);

      expect(await muonDelegatorRewards.restake(user.address)).to.be.equal(
        false
      );

      await muonDelegatorRewards
        .connect(user)
        .delegateNFT(tokenId, user.address, false);

      expect(await bonPion.ownerOf(1)).to.be.equal(nodeStaker);

      expect(await muonDelegatorRewards.balances(user.address)).to.be.equal(
        nftPower[0]
      );

      expect(await muonDelegatorRewards.userIndexes(user.address)).to.be.equal(
        1
      );

      expect(await muonDelegatorRewards.restake(user.address)).to.be.equal(
        false
      );
    });
  });

  describe("Bulk import", async () => {
    it("should successfully bulk import ", async () => {
      const [user1, user2, user3, user4] = await ethers.getSigners();

      const initialNodeStakerBalance = await pion.balanceOf(nodeStaker);

      const user1Balance = ethers.utils.parseEther("5");
      const user2Balance = ethers.utils.parseEther("10");
      const user3Balance = ethers.utils.parseEther("15");
      const user4Balance = ethers.utils.parseEther("20");

      const userBalances = [
        user1Balance,
        user2Balance,
        user3Balance,
        user4Balance,
      ];
      const userAddresses = [
        user1.address,
        user2.address,
        user3.address,
        user4.address,
      ];
      const userStartDates = [1729666262, 1727074262, 1724395862, 1721717462];
      const userReStakes = [false, false, true, true];

      await expect(
        muonDelegatorRewards
          .connect(user)
          .bulkImport(userAddresses, userBalances, userStartDates, userReStakes)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      expect(await muonDelegatorRewards.balances(user1.address)).to.be.equals(
        0
      );

      expect(await muonDelegatorRewards.balances(user2.address)).to.be.equals(
        0
      );

      expect(await muonDelegatorRewards.balances(user3.address)).to.be.equals(
        0
      );

      expect(await muonDelegatorRewards.balances(user4.address)).to.be.equals(
        0
      );

      await muonDelegatorRewards
        .connect(admin)
        .bulkImport(userAddresses, userBalances, userStartDates, userReStakes);

      const users = await muonDelegatorRewards.getUsers(0, 3);

      const addresses = users[0];
      const balances = users[1];
      const startDates = users[2];
      const reStakes = users[3];

      expect(addresses[0]).to.be.equal(userAddresses[0]);
      expect(addresses[1]).to.be.equal(userAddresses[1]);
      expect(addresses[2]).to.be.equal(userAddresses[2]);
      expect(addresses[3]).to.be.equal(userAddresses[3]);

      expect(balances[0]).to.be.equal(userBalances[0]);
      expect(balances[1]).to.be.equal(userBalances[1]);
      expect(balances[2]).to.be.equal(userBalances[2]);
      expect(balances[3]).to.be.equal(userBalances[3]);

      expect(startDates[0]).to.be.equal(userStartDates[0]);
      expect(startDates[1]).to.be.equal(userStartDates[1]);
      expect(startDates[2]).to.be.equal(userStartDates[2]);
      expect(startDates[3]).to.be.equal(userStartDates[3]);

      expect(reStakes[0]).to.be.equal(userReStakes[0]);
      expect(reStakes[1]).to.be.equal(userReStakes[1]);
      expect(reStakes[2]).to.be.equal(userReStakes[2]);
      expect(reStakes[3]).to.be.equal(userReStakes[3]);

      expect(await pion.balanceOf(nodeStaker)).to.be.equal(
        initialNodeStakerBalance
      );
    });
  });
});
