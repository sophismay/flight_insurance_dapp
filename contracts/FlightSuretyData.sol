pragma solidity ^0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                                      // Account used to deploy contract
    bool private operational = true;                                    // Blocks all state changes throughout the contract if false
    mapping(address => bool) authorizedApps;    // active authorized dapps
    uint256 private funds; // contract funds
    uint256 private constant REQUIRED_AIRLINE_FUND = 10 ether;
    uint private MIN_CONSENSUS_RESPONSES;
    address[] multisigCalls = new address[](0); // to track addresses in ongoing multisig to register new airline
    // airline data structure (struct)
    struct Airline {
        address airlineAddress; // do we need this?
        bool isRegistered;
        bool hasFunded;
    }
    mapping(address => bool) private Voters;
    mapping(address => uint256) private Votes;
    mapping(address => Airline) Airlines; // address to Airline
    address[] private registeredAirlines; // existing airlines for easy lookup
    // passenger
    uint private MAX_INSURANCE_PASSENGER = 1 ether;
    struct Passenger {
        address passengerAddress;
        uint256[] paidInsurance;
        uint256 repayment; // received payment
        uint256 fundsWithdrawn;
        string[] flights;
        bool[] isInsurancePaid;
    }
    mapping(address => Passenger) Passengers;
    mapping(string => address[]) flightPassengers;
    mapping(address => uint256) private insurancePayouts;
    address private firstAirline;
    

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/
    event AirlineRegistered(address airline);
    event AirlineHasFunded(address airline, uint256 amount);
    event FundReceived(address airline, uint256 amount);
    event PassengerInsurancePayout(address payee, uint256 amount);

    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor
                                (
                                    address airlineAddress
                                ) 
                                public 
    {
        contractOwner = msg.sender;
        funds = 0;
        registeredAirlines = new address[](0);
        //registerFirstAirline(airlineAddress);
        // make owner first airline
        registerFirstAirline(contractOwner);
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
        require(operational, "Contract is currently not operational");
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireAuthorizedApp() {
        require(authorizedApps[msg.sender], "App is not authorized!");
        _;
    }

    // require multiparty consensus 
    modifier requireMultipartyConsensus(address sender) {
        // initially, just first 4 or below can register, else multisig
        if(registeredAirlines.length < 4) {
            _;
        } else {
            bool isDuplicate = false;
            // needs optimization: eg. make caller get for each airline
            for(uint c=0; c<multisigCalls.length; c++) {
                if(multisigCalls[c] == sender) {
                    isDuplicate = true;
                    break;
                }
            }
            require(!isDuplicate, "Caller has already called this function");
            multisigCalls.push(sender);
            // threshold to register
            uint256 registeredSize = registeredAirlines.length;
            MIN_CONSENSUS_RESPONSES = registeredSize.div(2);
            require(MIN_CONSENSUS_RESPONSES > 1, "More than one participant needed for multisig");
            if (multisigCalls.length >= MIN_CONSENSUS_RESPONSES) {
                // reset multisig calls tracker
                multisigCalls = new address[](0);
                // continue execution smart contract action
                _;
            }
        }
        
    }

    // require passenger has enough insurance payout
    modifier requireEnoughPayout(address passenger) {
        require(Passengers[passenger].repayment > 0 ether, "Passenger has no insurance payout!");
        _;
    }

    // require is registered airline
    modifier requireAirlineRegistered(address sender) {
        require(Airlines[sender].isRegistered == true, "Only registered airlines can register other airlines!");
        _;
    }

    // require airline has funded 10 ether to participate in contract 
    modifier requireAirlineHasFunded(address airline) {
        require(Airlines[airline].hasFunded == true, "Only airlines that have funded can perform this action!");
        _;
    }

    modifier requireSufficientFunding(uint256 amount) {
        require(amount >= REQUIRED_AIRLINE_FUND, "Airline must fund minimum 10 ETH");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */      
    function isOperational() 
                            public 
                            view 
                            returns(bool) 
    {
        return operational;
    }


    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */    
    function setOperatingStatus
                            (
                                bool mode
                            ) 
                            external
                            requireContractOwner 
    {
        operational = mode;
    }

    // set fund of airline
    //function setAirlineFund(address airline) external payable requireIsOperational requireAirlineRegistered requireSufficientFunding(msg.value) {
    //    //require(address(this).transfer(amount), "Error receiving funds")
    //    Airlines[airline].hasFunded = true;
    //}

    // check if airline is registered
    function isRegisteredAirline(address airline) public view returns(bool isRegistered) {
        isRegistered = Airlines[airline].isRegistered;
    }

    // check if airline has funded
    function isFundedAirline(address airline) public view returns(bool isFunded) {
        isFunded = Airlines[airline].hasFunded;
    }

    function setMultisigCall(address airline) internal requireIsOperational{
        multisigCalls.push(airline);
    }

    function getMultisigCallsLength() external view returns(uint256) {
        return multisigCalls.length;
    }

    function setAirlineVoteStatus(address airline, bool status) external {
        Voters[airline] = status;
    }

    function getAirlineVoteStatus(address airline) external view returns(bool) {
        return Voters[airline];
    }

    function getVotesCount(address airline) external view requireIsOperational returns(uint256) {
        return Votes[airline];
    }

    // update count of votes airline has received
    function updateVotesCount(address airline, uint count) external requireIsOperational {
        // temp
        uint256 vote = Votes[airline];
        Votes[airline] = vote.add(count);
    }

    function resetVotesCount(address airline) external requireIsOperational {
        delete Votes[airline];
    }


    //fallback() external payable {}
    //receive() external payable {}

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    // get passenger and flight info
    function getPassengerFlightInfo(address passenger, string flight) internal view returns (int8 index, bool insurancePaid, uint256 paidInsurance) {
        int8 _index = -1; // not insured for flight
        uint8 _len = uint8(Passengers[passenger].flights.length);
        string[] memory flights = new string[](_len);
        flights = Passengers[passenger].flights;
        for(uint8 i=0; i<_len; i++) {
            if(keccak256(bytes(flights[i])) == keccak256(bytes(flight))) {
                _index = int8(i);
                break;
            }
        }
        insurancePaid = Passengers[passenger].isInsurancePaid[uint(_index)];
        paidInsurance = Passengers[passenger].paidInsurance[uint(_index)];
        return (
            _index,
            insurancePaid,
            paidInsurance
        );
    }

    // payout insurance to passenger
    function withdraw(address passenger) external requireIsOperational requireAuthorizedApp requireEnoughPayout(passenger) {
        uint256 _payout = Passengers[passenger].repayment;
        Passengers[passenger].repayment = 0;
        passenger.transfer(_payout);
        emit PassengerInsurancePayout(passenger, _payout);
    }

   /**
    * @dev Add an airline to the registration queue
    *      Can only be called from FlightSuretyApp contract
    *
    */   
    function registerAirline
                            (   
                                address airline,
                                address sender
                            )
                            external
                            requireIsOperational
                            //requireAirlineRegistered(sender) // only registered airline can register another
                            //requireMultipartyConsensus(sender)
                            //requireAirlineHasFunded(sender) // sender can participate only if funded
                            //returns(bool, uint)
    {
        // avoid duplicate registration
        //require(!Airlines[airline].isRegistered, "REGISTER AIRLINE: AIRLINE ALREADY REGISTERED!");
        Airlines[airline] = Airline({
            airlineAddress: airline,
            isRegistered: true,
            //votes: 0,
            hasFunded: false
        });
        setMultisigCall(airline);
        registeredAirlines.push(airline);
        emit AirlineRegistered(airline);
        //registeredAirlines[airline] = _airline;
        //return (true, Airlines[airline].votes);
    }

    // register first airline
    function registerFirstAirline(address newAirlineAddress) internal requireIsOperational {
        //require(!Airlines[newAirlineAddress].isRegistered, "Airline is already registered.");

        Airlines[newAirlineAddress].airlineAddress = newAirlineAddress;
        Airlines[newAirlineAddress].isRegistered = true;
        Airlines[newAirlineAddress].hasFunded = false;
        //Airlines[newAirlineAddress].votes = 0;
        registeredAirlines.push(newAirlineAddress);
        firstAirline = newAirlineAddress;
        emit AirlineRegistered(newAirlineAddress);
    }

    function isAirlineRegistered(address airline) public view returns(bool) {
        return Airlines[airline].isRegistered;
    }

    function getFirstAirline() public view returns(address _firstAirline) {
        _firstAirline = firstAirline;
    }


   /**
    * @dev Buy insurance for a flight
    *
    */   
    function buy
                            (   
                                string flight,
                                uint256 time,
                                address passenger,
                                uint256 amount                         
                            )
                            external
                            payable
                            requireIsOperational
                            requireAuthorizedApp
    {
        require(msg.value <= MAX_INSURANCE_PASSENGER, "A maximum insurance of 1 ether is permitted!");

        // check for first time insurance
        // aasuming msg.sender is passenger
        if(Passengers[msg.sender].isInsurancePaid.length < 1) {
            uint256[] memory paidInsurance = new uint256[](0);
            string[] memory flights = new string[](0);
            bool[] memory isInsurancePaid = new bool[](0);
            uint256 repaid = 0;
            uint256 fundsWithdrawn = 0;
            paidInsurance[0] = msg.value; // assuming sender is passenger
            flights[0] = flight;
            isInsurancePaid[0] = false;
            Passengers[msg.sender].passengerAddress = msg.sender;
            Passengers[msg.sender].paidInsurance = paidInsurance;
            Passengers[msg.sender].flights = flights;
            Passengers[msg.sender].isInsurancePaid = isInsurancePaid;
            Passengers[msg.sender].repayment = repaid;
            Passengers[msg.sender].fundsWithdrawn = fundsWithdrawn;
            /*Passengers[msg.sender] = Passenger({
                passengerAddress: msg.sender,
                paidInsurance: paidInsurance,
                flights: flights,
                isInsurancePaid: isInsurancePaid,
                repaid: repaid,
                fundsWithdrawn: fundsWithdrawn
            });*/
        } else {
            int8 _index; 
            bool _insurancePaid; 
            uint256 _paidInsurance;
            (_index, _insurancePaid, _paidInsurance) = getPassengerFlightInfo(msg.sender, flight);
            require(_index == -1, "Passenger insured for this flight already!");

            Passengers[msg.sender].isInsurancePaid.push(true);
            Passengers[msg.sender].paidInsurance.push(msg.value);
            Passengers[msg.sender].flights.push(flight);
        }
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees
                                (
                                    string flight
                                )
                                external
                                requireIsOperational
                                requireAuthorizedApp
                                // requireRegisteredFlight?
    {   int8 _index; 
        bool _isInsurancePaid; 
        uint256 _paidInsurance;
        uint256 _payout;
        uint _len = flightPassengers[flight].length;
        address[] memory passengers = new address[](_len);
        passengers = flightPassengers[flight];

        for(uint i=0; i<_len; i++) {
            (_index, _isInsurancePaid, _paidInsurance) = getPassengerFlightInfo(passengers[i], flight);
            if (!_isInsurancePaid) {
                _payout = _paidInsurance.mul(15).div(10);
                Passengers[passengers[i]].isInsurancePaid[uint256(_index)] = true;
                Passengers[passengers[i]].repayment = Passengers[passengers[i]].repayment.add(_payout);
            }
        }
    }
    

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay
                            (
                            )
                            external
                            pure
    {
    }

   /**
    * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    *
    */   
    function fund
                            (   
                                address sender,
                                uint256 amount
                            )
                            external
                            requireIsOperational
                            //requireAirlineRegistered
                            requireSufficientFunding(amount)
    {
        //if (!Airlines[sender]) {
        //    Airlines[sender] = Airline({
        //        airlineAddress: sender,
        //    })
        //}
        Airlines[sender].hasFunded = true;
        emit FundReceived(sender, amount);
    }

    function getFlightKey
                        (
                            address airline,
                            string memory flight,
                            uint256 timestamp
                        )
                        pure
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() 
                            external 
                            payable 
    {
        this.fund(msg.sender, msg.value);
    }

    function authorizeCaller(address appContract) external requireContractOwner {
        authorizedApps[appContract] = true;
    }


}

