import hre, { ethers, upgrades } from "hardhat";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}


async function deployContract() {
  const factory = await ethers.getContractFactory("MuonDelegatorRewards");

  const contract = await upgrades.deployProxy(factory, [
    "0xb8067235c9b71FeeC069Af151Fdf0975dfBDFBA5",
    1728858231,
    "0x7Da0355397aA56ec7121d8dADCcc04550217a188",
  ]);
  await contract.deployed();

  await sleep(20000); 

  await hre.run("verify:verify", {
    address: contract.address
  });

  console.log("Contract deployed at:", contract.address);
}

deployContract()
  .then(() => {
    console.log("done");
  })
  .catch(console.log);
