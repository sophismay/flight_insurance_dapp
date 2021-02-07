
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
    let fifthAirline = accounts[5];
    const funding = web3.utils.toWei('10', 'ether');

    // first airline funds
    await config.flightSuretyData.fund({ from: firstAirline, value: funding });

    // check money paid?

    // add second airline. first airline should be able to register second now after funding
    await config.flightSuretyData.registerAirline(secondAirline, { from: firstAirline });
    let registered = await config.flightSuretyData.isRegisteredAirline.call(secondAirline);
    assert.equal(registered, true, "Airline should be able to register another airline after funding");

    // second airline registering third airline
    await config.flightSuretyData.fund({ from: secondAirline, value: funding });
    let hasFunded = await config.flightSuretyData.isFundedAirline.call(secondAirline);
    assert.equal(hasFunded, true, "Airline should be funded");

    await config.flightSuretyData.registerAirline(thirdAirline, { from: secondAirline });
    let thirdRegistered = await config.flightSuretyData.isRegisteredAirline.call(thirdAirline);
    assert.equal(thirdRegistered, true, "Airline should be able to register another airline after funding");

     // third airline registering fourth airline
     await config.flightSuretyData.fund({ from: thirdAirline, value: funding });
     let hasFunded2 = await config.flightSuretyData.isFundedAirline.call(thirdAirline);
     assert.equal(hasFunded2, true, "Airline should be funded");
 
     await config.flightSuretyData.registerAirline(fourthAirline, { from: thirdAirline });
     let fourthRegistered = await config.flightSuretyData.isRegisteredAirline.call(thirdAirline);
     assert.equal(fourthRegistered, true, "Airline should be able to register another airline after funding");

  });

  /*it('(airline) can be registered, but does not participate in contract until it submits funding of 10 ether', async () => {
    const funding = web3.utils.toWei('10', 'ether');
    const fourthAirline = accounts[4];
    const fifthAirline = accounts[5];

    await config.flightSuretyData.registerAirline(fifthAirline, { from: fourthAirline });
    let registered5 = await config.flightSuretyData.isRegisteredAirline.call(fifthAirline);
    assert.equal(registered5, false, "Airline not funded should not participate in contract");

  }); */

  it('registration of fifth and subsequent airlines requires multi-party consensus of 50% of registered airlines', async () => {
    const funding = web3.utils.toWei('10', 'ether');
    let firstAirline = config.firstAirline;
    let secondAirline = accounts[2];
    let thirdAirline = accounts[3];
    let fourthAirline = accounts[4];
    let fifthAirline = accounts[5];
    
    let registered = await config.flightSuretyData.isRegisteredAirline.call(secondAirline);
    console.log(`Registered ${registered}`)
    // fund and register 4 airlines
    //await config.flightSuretyData.setAirlineFund(firstAirline, { from: firstAirline, value: funding });
    //await config.flightSuretyData.registerAirline(secondAirline, { from: firstAirline });
    //await config.flightSuretyData.setAirlineFund(secondAirline, { from: secondAirline, value: funding });
    //await config.flightSuretyData.registerAirline(thirdAirline, { from: secondAirline });
    //await config.flightSuretyData.setAirlineFund(thirdAirline, { from: thirdAirline, value: funding });
    //await config.flightSuretyData.registerAirline(fourthAirline, { from: thirdAirline });
    await config.flightSuretyData.fund({ from: fourthAirline, value: funding });

    // fifth airline registration by first airline
    await config.flightSuretyData.registerAirline(fifthAirline, { from: firstAirline });
    let fifthRegistered = await config.flightSuretyData.isRegisteredAirline.call(fifthAirline);
    assert.equal(fifthRegistered, false, "Multisig required to register fifth and subsequent airlines");

    // fifth airline registration by second airline
    await config.flightSuretyData.registerAirline(fifthAirline, { from: secondAirline });
    let fifthRegistered2 = await config.flightSuretyData.isRegisteredAirline.call(fifthAirline);
    assert.equal(fifthRegistered2, true, "Multisig registration by 50%");

  });
 

});
