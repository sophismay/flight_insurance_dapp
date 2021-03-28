//import 'babel-polyfill';
import "core-js/stable";
import "regenerator-runtime/runtime";
import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import FlightSuretyData from '../../build/contracts/FlightSuretyData.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';
//import { indexOf } from "core-js/core/array";


let config = Config['localhost'];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
let flightSuretyData = new web3.eth.Contract(FlightSuretyData.abi, config.dataAddress);

let oracles = {}; // object of oracleAddress: indexes 
let index; // event index
const gas = 3000000;

web3.eth.getAccounts( async (error, accounts) => {
  const owner = accounts[0];
  flightSuretyData.methods.authorizeCaller(flightSuretyApp._address).send({ from: owner, gas: gas });

  //let registrationFeeCall = flightSuretyApp.methods.REGISTRATION_FEE.call();
  //console.log(`registration fee call ${JSON.stringify(registrationFeeCall)}`)
  flightSuretyApp.methods.REGISTRATION_FEE().call()
    .then( (fee) => {
      for(let i=10; i<30; i++) {
        let registrationResult = flightSuretyApp.methods.registerOracle().send({ from: accounts[i], value: `${fee}`, gas: gas });
        registrationResult.then( (result) => {
          flightSuretyApp.methods.getMyIndexes().call({ from: accounts[i]})
            .then( indexes => {
              console.log(`After oracle getting their indexes ${indexes} ${Object.values(indexes)}`);
              oracles[accounts[i]] = [].concat.apply([], Object.values(indexes));
              // checking registered oracles and indexes
              //console.log(`Oracles and their indexes : ${JSON.stringify(oracles)}`)
            })
            .catch( err => { console.log(err); });
        }).catch( err => { console.log(err); })
      }
      
    })
    .catch( (err) => {
      console.log(err);
    });
});

/*flightSuretyApp.events.OracleRequest({
    fromBlock: 0
  }, function (error, event) {
    if (error) console.log(error);
    else {
      console.log(`EVENT RETURN VALUE: ${event.returnValue}`);
      var statusCodes = [0, 10, 20, 30, 40, 50];
      var statusCode = statusCodes[Math.floor(Math.random() * statusCodes.length)];

      for(const oracleAddress in oracles) {
        let indexes = oracles[oracleAddress];
        console.log(`INDEXES: ${indexes}`);
        // if index found, submit oracle response
        if (indexes.indexOf(event.returnValue.index) != -1) {
          flightSuretyApp.methods
            .submitOracleResponse(event.returnValues.index, event.returnValues.airline, event.returnValues.flight, event.returnValues.timestamp, oracleAddress)
            .send({ from: oracleAddress })
            .then( result => {
              console.log(`Oracle response submitted: ${oracleAddress}`);
            }).catch(err => console.log(err));
        }
      }
    }
    
});*/

flightSuretyApp.events.OracleRequest({
    fromBlock: "latest"
  }, function (error, event) {
    if (error) console.log(error);
    //console.log(event);
    console.log(`oracle request : ${JSON.stringify(event.returnValues)}`);
    index = event.returnValues.index;
    console.log(`index set: ${index}`);

    const airline = event.returnValues.airline;
    const flight = event.returnValues.flight;
    const timestamp = event.returnValues.timestamp;
    //const statusCode = event.returnValues.statusCode;

    // right away trigger oracle response?
    /*console.log(statusCode);
    const addresses = Object.keys(oracles);
    console.log(`addresses : ${addresses}`);
    addresses.forEach( (address, indx) => {
      // only send if event index from before, matches indexes of oracle
      console.log(`address: ${address}`);
      const assignedIndexes = intify(oracles[address]);
      console.log(assignedIndexes, assignedIndexes.indexOf(index));
      console.log(JSON.stringify(oracles[address]));
      if (assignedIndexes) {
        //if (Array(assignedIndexes).indexOf(index) > -1) {
          //for(var j=0; j<oracles[address].length; j++) {
            console.log("About to submit oracle response")
            flightSuretyApp
              .methods
              .submitOracleResponse(
                index,
                //intify(oracles[address])[j], 
                airline, 
                flight, 
                timestamp,
                statusCode)
              .send({ from: address, gas: gas })
              .then( res => {
                console.log("after submitting response came in")
                console.log(res); 
              })
              .catch(console.log);
          //}
          
        //}
      }
      
    });*/
});

function intify(arr) {
  let result = [];
  arr.forEach( (elem, ind) => {
    result.push(parseInt(elem));
  })
  
  return result;
}

flightSuretyApp.events.SubmitOracleResponse({
  fromBlock: 0 //"latest"
}, (err, event) => {
  console.log("INSIDE SUBMIT ORACLE RESPONSE EVENT");
  if (err) {
    console.log(err)
  }
  console.log(event.returnValues);
  const airline = event.returnValues.airline;
  const flight = event.returnValues.flight;
  const timestamp = event.returnValues.timestamp;
  const statusCode = event.returnValues.statusCode;
  console.log(`status copde : ${statusCode}`);
  // checking registered oracles and indexes
  console.log(`Oracles and their indexes : ${JSON.stringify(oracles)}`);
  const addresses = Object.keys(oracles);
  addresses.forEach((address, ind) => {
    // only send if event index from before, matches indexes of oracle
    const assignedIndexes = oracles[address];
    if (assignedIndexes.includes(index)) {
      flightSuretyApp
        .methods
        .submitOracleResponse(
          index, 
          airline, 
          flight, 
          timestamp,
          statusCode)
        .send({ from: address, gas: gas })
        .then( res => {
          console.log(`after submitting oracle response : ${res}`);
        })
        .catch(console.log);
    }
  });
});

flightSuretyApp.events.OracleReport({
  fromBlock: 0
}, (err, event) => {
  if (err) {
    console.log(`Oracle Report error ${err}`)
  }
  console.log(`ORACLE REPORT INCOMING ${JSON.stringify(event.returnValues)}`)
});

flightSuretyApp.events.FlightStatusInfo({
  fromBlock: 0
}, (err, event) => {
  if (err) {
    console.log(`Flight Status Info ${err}`)
  }
  console.log(`FLIGHT STATUS INFO ${JSON.stringify(event.returnValues)}`)
});


const app = express();

// enable CORS without external module
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/api', (req, res) => {
    res.send({
      message: 'An API for use with your Dapp!'
    })
});

app.get('/api/flights', (req, res, next) => {
  const flights =  [
    { "id": 1, "name": "KAL496946" },
    { "id": 2, "name": "LTH446466" },
    { "id": 3, "name": "KLM467454" },
    { "id": 4, "name": "LTH674545" },
    { "id": 5, "name": "KLM452333" }
  ]
  return res.status(200).json({ data: flights });
});

app.get('/api/events/index', (req, res, next) => {
  return res.status(200).json({ data: index });
});

export default app;


