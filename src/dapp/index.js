
import DOM from './dom';
import Contract from './contract';
import './flightsurety.css';


(async() => {

    let result;
    let airline;
    let flight;
    let date;
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

            // Write transaction
            contract.fetchFlightStatus(tempFlight, tempDate, (error, result) => {
                date = result.timestamp;
                flight = result.flight;
                airline = result.airline;
                display('Oracles', 'Trigger oracles', [ { label: 'Fetch Flight Status', error: error, value: result.flight + ' ' + result.timestamp} ]);
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
                    const elem = document.getElementById('event-index-placeholder');
                    elem.innerHTML = `Index: ${_index}`;
                    elem.style.display = 'block';

                    contract
                        .submitToOracle(airline, flight, date, _index, (err, data) => {
                            if(err) {
                                console.error(err);
                            }
                            // set all in status-box div
                            console.log(data);
                            const box = document.getElementById('status-box');
                            box.innerHTML = `<p>Airline: ${data.airline}</p><p>Flight: ${flight}</p><p>Timestamp: ${new Date(data.timestamp)}</p><p>Index: ${_index}</p><p>Status Code: ${data.statusCode}`;
                            const status_code = data.statusCode;
                            if (status_code == 20 || status_code == 40) {

                            }
                        });
                })
                .catch(e => { console.log(e); } );
        })
    
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







