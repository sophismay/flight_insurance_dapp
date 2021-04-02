
import DOM from './dom';
import Contract from './contract';
import './flightsurety.css';


(async() => {

    let result;
    let airline;
    let flight;
    let insurance;
    let insured;
    let date;
    let delayed = false;
    const SERVER_URL = 'http://localhost:3000'
    const flights_path = '/api/flights'

    let contract = new Contract('localhost', () => {

        // Read transaction
        contract.isOperational((error, result) => {
            console.log(error,result);
            display('Operational Status', 'Check if contract is operational', [ { label: 'Operational Status', error: error, value: result} ]);
        });


        fetchFlights(SERVER_URL + flights_path);

        // User-submitted transaction
        DOM.elid('submit-oracle').addEventListener('click', () => {
            const tempFlight = DOM.elid('flight-number').value;
            const tempDate = DOM.elid('departure-date').value;
            const timestamp = (new Date(tempDate)).getTime();
            // Write transaction
            contract.fetchFlightStatus(tempFlight, timestamp, (error, result) => {
                date = result.timestamp;
                flight = result.flight;
                airline = result.airline;
                // make it possible to buy insurance
                const container = document.getElementById('buy-insurance-container');
                container.style.display = 'block';
                
                display('Oracles', 'Flight Status', [ { label: 'Fetch Flight Status', error: error, value: result.flight + ' ' + result.timestamp} ]);
            });
        })

        // trigger oracle response, first obtaining flight index from server
        DOM.elid('trigger-oracle-response').addEventListener('click', (e) => {
            const url = `${SERVER_URL}/api/events/index`;
            console.log("clicked trigger oracle");
            getOracleIndex(url)
                .then(index => {
                    // set index in UI
                    const _index = parseInt(index);

                    contract
                        .submitToOracle(airline, flight, date, _index, (err, data) => {
                            if(err) {
                                console.error(err);
                            }
                            // hide messages
                            let errorDiv = document.getElementById('passenger-withdraw-error');
                            errorDiv.style.display = 'none';
                            let successContainer = document.getElementById('passenger-withdraw-success');
                            successContainer.innerHTML = '';
                            successContainer.style.display = 'none';
                            

                            // set all in status-box div
                            console.log(data, new Date(date));
                            const box = document.getElementById('status-box');
                            box.innerHTML = `<p>Airline: ${data.airline}</p><p>Flight: ${flight}</p><p>Timestamp: ${new Date(data.timestamp)}</p><p>Index: ${_index}</p>`;
                            const status_code = data.statusCode;
                            const _withdrawable = insured ? insured : 0;

                            // flight status unknown
                            if (status_code == 0) {
                                delayed = false;
                                let temp = box.innerHTML;
                                box.innerHTML = `${temp}<p>Flight Status: <span class="flight-status-unknown">Unknown (${data.statusCode})</span></p><p> Withdrawable Amount: 0.00</p>`;
                            }

                            // flight on time
                            if (status_code == 10) {
                                delayed = false;
                                let temp = box.innerHTML;
                                box.innerHTML = `${temp}<p>Flight Status: <span class="flight-status-ontime">On Time (${data.statusCode})</span></p><p> Withdrawable Amount: 0.00</p>`;
                            }

                            // if flight delayed, show payout possibility
                            if (status_code == 20 || status_code == 30 || status_code == 40 || status_code == 50) {
                                delayed = true;
                                let temp = box.innerHTML;
                                box.innerHTML = `${temp}<p>Flight Status: <span class="flight-status-delayed">Delayed (${data.statusCode})</span></p><p> Withdrawable Amount: ${_withdrawable}</p>`;
                                document.getElementById('withdraw-credit-container').style.display = 'block';
    
                            }
                        });
                })
                .catch(e => { console.log(e); } );
        });

        DOM.elid('buy-insurance-btn').addEventListener('click', (e) => {
            const amount = DOM.elid('buy-insurance-amount').value;

            contract
                .buyInsurance(amount, (err, res) => {
                    console.log(`insurane bought at : ${amount}`);
                    insurance = amount;
                    insured = parseFloat(amount) * 1.5;
				    display('Oracles', 'Insurance details', 
                        [{ 
                            label: 'Insurance Details', 
                            error: err, 
                            value: "Flight: " + flight + " | Departure: " + date + " | Amount: " + amount + " ether" + " | Payout on Delay: " + amount * 1.5 + " ether" 
                        }], "display-flight", "display-detail");
                });
        });

        DOM.elid('passenger-credit-withdraw').addEventListener('click', (e) => {
            // chceck if flight delayed first
            if(!delayed) {
                let errorDiv = document.getElementById('passenger-withdraw-error');
                errorDiv.style.display = 'block';
                return;
            }
            contract
                .withdraw((err, res) => {
                    // display amount withdrawn
                    if (err) { console.log(`Error withdrawing insurance credit : ${err}`); }
                    let successContainer = document.getElementById('passenger-withdraw-success');
                    successContainer.innerHTML = `${insured} ether has been sent to your wallet`;
                    successContainer.style.display = 'block';
                });
        });
    
    });
    

})();

function fetchFlights(url) {
    let dropDown = document.getElementById('flight-number');
    fetch(url)
        .then( res => {
            if (res.status != 200) {
                return;
            }
            res
                .json()
                .then(data => {
                    console.log(`flight fetched: ${data}`);
                    let selectOption;
                    const flights = data.data;
                    for (const flight of flights) {
                        selectOption = document.createElement('option');
                        selectOption.text = flight.name;
                        selectOption.value = flight.name;
                        dropDown.add(selectOption);
                    }
                })
        })
        .catch(console.log);
}

function getOracleIndex(url) {
    return new Promise( (resolve, reject) => {
        fetch(url)
            .then(res => {
                if (res.status != 200) {
                    return;
                }
                res
                    .json()
                    .then( data => {
                        
                        try {
                            console.log(`index fetched: ${JSON.stringify(data)}`);
                            const index = data.data;
                            return resolve(index);
                        } catch (error) {
                            return reject(error);
                        }
                    
                    })
            })
    });
}


function display(title, description, results) {
    let displayDiv = DOM.elid("display-wrapper");
    let section = DOM.section();
    section.appendChild(DOM.h2(title));
    section.appendChild(DOM.h5(description));
    results.map((result) => {
        let row = section.appendChild(DOM.div({className:'row'}));
        row.appendChild(DOM.div({className: 'col-sm-4 field'}, result.label));
        row.appendChild(DOM.div({className: 'col-sm-8 field-value'}, result.error ? String(result.error) : String(result.value)));
        section.appendChild(row);
    })
    displayDiv.append(section);

}







