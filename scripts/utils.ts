import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";
import { PION, BondedPION, MuonDelegatorRewards } from "../typechain-types";

export const MAX_UINT = BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

export async function deploy(treasury: string) {
  const [PION, bondedPION, MuonDelegatorRewards] = await Promise.all([
    ethers.getContractFactory("PION"),
    ethers.getContractFactory("BondedPION"),
    ethers.getContractFactory("MuonDelegatorRewards"),
  ]);

  const pion = (await upgrades.deployProxy(PION, [])) as PION;
  const bonPion = (await upgrades.deployProxy(bondedPION, [
    pion.address,
    treasury,
    "0",
    "0",
  ])) as BondedPION;

  return {
    pion,
    bonPion,
  };
}

export async function deployDelegation(
  pionAddress: string,
  bonPionAddress: string,
  nodeStaker: string
) {
  const [MuonDelegatorRewards] = await Promise.all([
    ethers.getContractFactory("MuonDelegatorRewards"),
  ]);

  const muonDelegatorRewards = (await upgrades.deployProxy(
    MuonDelegatorRewards,
    [pionAddress, bonPionAddress, 0, nodeStaker]
  )) as MuonDelegatorRewards;

  return {
    muonDelegatorRewards,
  };
}

export async function testDeployLocally() {
  const signers = await ethers.getSigners();
  const treasury = signers[signers.length - 1].address;
  const nodeStaker = signers[signers.length - 2].address;

  const contracts = await deploy(treasury);

  const delegationContract = await deployDelegation(
    contracts.pion.address,
    contracts.bonPion.address,
    nodeStaker
  );

  return {
    ...contracts,
    ...delegationContract,
    treasury,
    nodeStaker,
  };
}

export async function deployTestToken() {
  const TestToken = await ethers.getContractFactory("TestToken");
  const token = await TestToken.deploy();
  await token.deployTransaction.wait();
  await token.deployed();
  return token;
}
