
var Test = require('../config/testConfig.js');
var BigNumber = require('bignumber.js');
var web3 = require('web3');

contract('Flight Surety Tests', async (accounts) => {

  var config;
  before('setup contract', async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/

  it(`(multiparty) has correct initial isOperational() value`, async function () {

    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");

  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {

      // Ensure that access is denied for non-Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, true, "Access not restricted to Contract Owner");
            
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {

      // Ensure that access is allowed for Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.owner });
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, false, "Access not restricted to Contract Owner");
      
  });

  it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {

      await config.flightSuretyData.setOperatingStatus(false, { from: config.owner });

      let reverted = false;
      let newAirlineAddress = config.testAddresses[2]
      try 
      {
          await config.flightSuretyData.registerAirline(newAirlineAddress, { from: config.firstAirline });
      }
      catch(e) {
          reverted = true;
      }
      assert.equal(reverted, true, "Access not blocked for requireIsOperational");      

      // Set it back for other tests to work
      await config.flightSuretyData.setOperatingStatus(true);

  });

  it('(airline) cannot register an Airline using registerAirline() if it is not funded', async () => {
    
    // ARRANGE
    let newAirline = accounts[2];

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(newAirline, {from: config.firstAirline});
    }
    catch(e) {
      //console.log(e);
    }
    let result = await config.flightSuretyData.isRegisteredAirline.call(newAirline); 

    // ASSERT
    assert.equal(result, false, "Airline should not be able to register another airline if it hasn't provided funding");

  });

  // tests for multisig consensus and funding for airlines
  it('only existing (airline) may register a new airline until there are at least four airlines registered', async () => {
    // create first, add second , create third with second, third adds fourth, fourth tries but fails
    let firstAirline = config.firstAirline;
    let secondAirline = accounts[2];
    let thirdAirline = accounts[3];
    let fourthAirline = accounts[4];
    const funding = web3.utils.toWei('10', 'ether');

    

    try {
      await config.flightSuretyApp.fund({ from: config.owner, value: funding });

      await config.flightSuretyApp.registerAirline(firstAirline, { from: config.owner });
      await config.flightSuretyApp.registerAirline(secondAirline, { from: config.owner });
      await config.flightSuretyApp.registerAirline(thirdAirline, { from: config.owner });
      let result = await config.flightSuretyApp.registerAirline(fourthAirline, { from: config.owner });
      assert.equal(result, false, "Passed, didn't register fourth airline without multisig")
    } catch(e) {
      //console.log(e);
    }
  });


  it('registration of fifth and subsequent airlines requires multi-party consensus of 50% of registered airlines', async () => {
    const funding = web3.utils.toWei('10', 'ether');
    let firstAirline = config.firstAirline;
    let secondAirline = accounts[2];
    let thirdAirline = accounts[3];
    let fourthAirline = accounts[4];
    let fifthAirline = accounts[5];

    try {
      await config.flightSuretyApp.approveAirlineForMultisig(fourthAirline, { from: config.owner });
      await config.flightSuretyApp.approveAirlineForMultisig(fourthAirline, { from: secondAirline });
      await config.flightSuretyApp.approveAirlineForMultisig(fourthAirline, { from: thirdAirline });

      await config.flightSuretyApp.registerAirline(fourthAirline, { from: thirdAirline });
    } catch (e) {}

    let result = await config.flightSuretyData.isRegisteredAirline.call(fourthAirline);

    assert.equal(result, true, "Multisig consensus failed!");

  });
 

});
