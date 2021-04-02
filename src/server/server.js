import "core-js/stable";
import "regenerator-runtime/runtime";
import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import FlightSuretyData from '../../build/contracts/FlightSuretyData.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';


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

  flightSuretyApp.methods.REGISTRATION_FEE().call()
    .then( (fee) => {
      for(let i=10; i<30; i++) {
        let registrationResult = flightSuretyApp.methods.registerOracle().send({ from: accounts[i], value: `${fee}`, gas: gas });
        registrationResult.then( (result) => {
          flightSuretyApp.methods.getMyIndexes().call({ from: accounts[i]})
            .then( indexes => {
              console.log(`After oracle getting their indexes ${indexes} ${Object.values(indexes)}`);
              oracles[accounts[i]] = [].concat.apply([], Object.values(indexes));
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
    fromBlock: "latest"
  }, function (error, event) {
    if (error) console.log(error);
    //console.log(event);
    console.log(`oracle request : ${JSON.stringify(event.returnValues)}`);
    index = event.returnValues.index;
    console.log(`index set: ${index}`);
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

flightSuretyApp.events.AirlineFundReceived({
  fromBlock: 0
}, (err, event) => {
  if (err) {
    console.log(`Airline fund error ${err}`);
  }
  console.log(`AIRLINE FUND RECEIVED: ${JSON.stringify(event.returnValues)}`);
});

flightSuretyApp.events.PassengerInsured({
  fromBlock: 0
}, (err, event) => {
  if (err) {
    console.log(`Passenger insured error ${err}`);
  }
  console.log(`PASSENGER INSURED: ${JSON.stringify(event.returnValues)}`);
});


const app = express();

// enable CORS
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


