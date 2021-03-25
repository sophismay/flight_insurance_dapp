import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';


let config = Config['localhost'];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
let flightSuretyData = new web3.eth.Contract(flightSuretyData.abi, config.dataAddress);

let oracles = {}; // object of oracleAddress: indexes 

web3.eth.getAccounts( async (error, accounts) => {
  const owner = accounts[0];
  await flightSuretyData.methods.authorizeCaller(flightSuretyApp._address).send({ from: owner });

  let registrationFee;
  let registrationFeeCall = await flightSuretyApp.methods.REGISTRATION_FEE.call();
  console.log(`registration fee call ${registrationFeeCall}`)
  registrationFeeCall
    .then( (fee) => {
      for(let i=10; i<30; i++) {
        let registrationResult = await flightSuretyApp.methods.registerOracle().send({ from: accounts[i], value: `${fee}`});
        registrationResult.then( (result) => {
          await flightSuretyApp.methods.getMyIndexes().call({ from: accounts[i]})
            .then( indexes => {
              oracles[accounts[i]] = indexes;
            })
            .catch( err => { console.log(err); });
        }).catch( err => { console.log(err); })
      }
    })
    .catch( (err) => {
      console.log(err);
    });
});

flightSuretyApp.events.OracleRequest({
    fromBlock: 0
  }, function (error, event) {
    if (error) console.log(error);
    else {
      console.log(event);
      var statusCodes = [0, 10, 20, 30, 40, 50];
      var statusCode = statusCodes[Math.floor(Math.random() * statusCodes.length)];

      for(const oracleAddress in oracles) {
        let indexes = oracles[oracleAddress];
        // if index found, submit oracle response
        if (indexes.indexOf(event.returnValue.index) != -1) {
          await flightSuretyApp.methods
            .submitOracleResponse(event.returnValues.index, event.returnValues.airline, event.returnValues.flight, event.returnValues.timestamp, oracleAddress)
            .send({ from: oracleAddress })
            .then( result => {
              console.log(`Oracle response submitted: ${oracleAddress}`);
            }).catch(err => console.log(err));
        }
      }
    }
    
});

const app = express();
app.get('/api', (req, res) => {
    res.send({
      message: 'An API for use with your Dapp!'
    })
})

export default app;


