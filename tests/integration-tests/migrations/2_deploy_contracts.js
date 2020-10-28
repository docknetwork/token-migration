const DockToken = artifacts.require("DockToken");
const StandardToken = artifacts.require("StandardToken");

module.exports = async function (deployer, network, accounts) {
    // First account is the admin
    await deployer.deploy(DockToken, accounts[0]);
    // contractInstance = await DockToken.deployed();
    // await contractInstance.enableTransfer();

    // This is only used for testing
    await deployer.deploy(StandardToken);
};