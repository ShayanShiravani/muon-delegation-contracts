const hre = require("hardhat");
const { ethers, upgrades } = hre;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function deployContract() {
  const factory = await ethers.getContractFactory("MuonDelegatorRewards");

  const contract = await upgrades.deployProxy(factory, [
    "0x39f2914690547694c8668ae07061179bd70A66f4",
    "0x8A916bEa7441d2297DE1d7e5F5404FBf8Abc0355",
    1728858231,
    "0xAa1EA50d282753b114D3bAFdc74d9F3191a7580e",
  ]);
  await contract.deployed();

  await sleep(20000);

  await hre.run("verify:verify", {
    address: contract.address,
  });

  console.log("Contract deployed at:", contract.address);
}

deployContract()
  .then(() => {
    console.log("done");
  })
  .catch(console.log);
