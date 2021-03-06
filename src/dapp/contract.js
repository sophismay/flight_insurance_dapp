import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import FlightSuretyData from '../../build/contracts/FlightSuretyData.json';
import Config from './config.json';
import Web3 from 'web3';

export default class Contract {
    constructor(network, callback) {

        let config = Config[network];
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.url));
        this.flightSuretyApp = new this.web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
        this.flightSuretyData = new this.web3.eth.Contract(FlightSuretyData.abi, config.dataAddress);
        this.initialize(callback, config);
        this.owner = null;
        this.firstAirline = null;
        this.airlines = [];
        this.passengers = [];
        this.flights = [];
        this.gas = 5000000;
        this.STATUS_CODES = [0, 10, 20, 30, 40, 50];
    }

    initialize(callback, config) {
        this.web3.eth.getAccounts( async (error, accts) => {
            this.owner = accts[0];
            this.firstAirline = accts[1];
            const gas = 5900000;
            let funding = this.web3.utils.toWei("10", "ether").toString();
            // authorize app
            let self = this;
            this.authorizeCaller(config);

            let counter = 1;

            // populate airlines
            while(this.airlines.length < 5) {
                
                let airline = {
                    address: accts[counter],
                    isRegistered: false,
                    votes: 0,
                    hasFunded: false
                }
                this.airlines.push(airline);
                counter += 1;
            }
            // fund first airline before registering
            this.fundAirline(this.owner, funding, gas);
            this.fundAirline(this.airlines[2], funding, gas);

            this.registerAirlines(this.owner, gas);

            // populate passengers
            while (this.passengers.length < 5) {
				this.passengers.push(accts[counter++]);
			}

			callback();

        });
    }

    async fundAirline(sender, funding, gas) {
        let self = this;
        await self.flightSuretyApp
                    .methods
                    .fund()
                    .send({ from: sender, value: funding, gas: self.gas }, async (err, res) => {
                        if(err) { console.log(err); }
                        else {
                            // update airline info
                            self.updateAirline(sender, { 'hasFunded': true });
                        }
                    });
    }

    async updateAirline(airline, update) {
        let self = this;
        const newAirline = Object.assign(airline, update);
        for (const airline of self.airlines) {
            if (airline['address'] == newAirline['address']) {
                airline = newAirline;
                break;
            }
        }
    }

    async registerFlights(sender, gas) {
        let self = this;
        for(const flight of self.flights) {
            //console.log(self.flights);
            await self.flightSuretyApp.methods.registerFlight(flight['address'], flight['flightId'], flight['time']).send({ from: sender, gas: gas });
        }
    }

    async registerAirlines(sender, gas) {
        let self = this;
        for(const airline of self.airlines) {
            console.log('before', airline);
            await self.flightSuretyApp.methods.registerAirline(airline['address']).send({ from: sender, gas: gas }, function(err, res) {
                self.updateAirline(airline, { isRegistered: true });
            });
            console.log('REGISTER AIRLINE: CALLED FROM CLIENT')
        }
        // verify airlines registered
        console.log("verifying airlines registered")
        for(const airline of self.airlines) {
            await self.flightSuretyApp
                .methods
                .isAirlineRegistered(airline['address'])
                .call()
                .then(console.log)
        }
    }
    
    async authorizeCaller(config) {
        const self = this;
        await self.flightSuretyData.methods.authorizeCaller(config.appAddress).call({ from: self.owner }, function(err, res) {
            if(err) {
                console.log(`Error authorizing caller ${err}`);
            } else { console.log(`Authorizing caller ${JSON.stringify(res)}`); }
            
        });
    }

    async isOperational(next) {
       let self = this;
       await self.flightSuretyApp.methods
            .isOperational()
            .call({ from: self.owner }, next);
    }

    async submitToOracle(airline, flight, time, index, next) {
        let self = this;
        let random_status_code = self.STATUS_CODES[Math.floor(Math.random() * self.STATUS_CODES.length)];

        self
            .flightSuretyApp
            .methods
            .initiateOracleResponse(airline, flight, time, index, random_status_code)
            .send({ from: self.owner, gas: self.gas }, (err, res) => { next(err, {
                index: index,
                airline: airline,
                timestamp: time,
                statusCode: random_status_code
            }); });
    }

    async fetchFlightStatus(flight, date, next) {
        let self = this;
        let data = {
            airline: self.airlines[0]['address'],
            flight: flight,
            timestamp: date
        } 
        await self.flightSuretyApp.methods
            .fetchFlightStatus(data.airline, data.flight, data.timestamp)
            .send({ from: self.owner, gas: 3000000 }, (error, result) => {
                next(error, data);
            });
    }

    async buyInsurance(amount, next) {
        let self = this;

        let toSend = self.web3.utils.toWei(amount, "ether").toString();
        console.log(toSend);
        
        await self
            .flightSuretyApp
            .methods
            .buyInsurance(self.airlines[2]['address'])
            .send({ from: self.passengers[1], value: toSend,  gas: self.gas }, (error, result) => {
                next(error, result);
            });
    }

    async withdraw(next) {
        let self = this;
        self
            .flightSuretyApp
            .methods
            .payout(self.airlines[2]['address'])
            .send({ from: self.passengers[1], gas: self.gas }, (err, res) => {
                next(err, res);
            });
    }

}