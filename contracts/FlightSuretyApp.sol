pragma solidity ^0.4.25;

// It's important to avoid vulnerabilities due to numeric overflow bugs
// OpenZeppelin's SafeMath library, when used correctly, protects agains such bugs
// More info: https://www.nccgroup.trust/us/about-us/newsroom-and-events/blog/2018/november/smart-contract-insecurity-bad-arithmetic/

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

interface FlightSuretyData {
    function isOperational() external view returns(bool);
    function setOperatingStatus(bool mode) external;
    function registerAirline(address airline, address sender) external;
    function buy(string flight, uint256 time, address passenger, uint256 amount) external payable;
    function creditInsurees(string flight) external;
    function pay() external;
    function fund(address sender, uint256 amount) external payable;
    function authorizeCaller(address appContract) external;
    function isAirlineRegistered(address airline) public view returns(bool);
    function isFundedAirline(address airline) public view returns(bool);
    function getFirstAirline() public view returns(address);
    function getMultisigCallsLength() external view returns(uint256);
    function setAirlineVoteStatus(address airline, bool status) external;
    function getAirlineVoteStatus(address airline) external view returns(bool);
    function getVotesCount(address airline) external view returns(uint256);
    function updateVotesCount(address airline, uint count) external;
    function resetVotesCount(address airline) external;
}

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */
contract FlightSuretyApp {
    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    // Flight status codees
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    address private contractOwner;          // Account used to deploy contract

    struct Flight {
        string id; // flight number
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;        
        address airline;
    }
    mapping(bytes32 => Flight) private flights;
    FlightSuretyData DataContract; // data contract
    uint private constant MIN_CONSENSUS_RESPONSES = 4; 
    bool private voting = false;
    uint256 private constant AIRLINE_FUNDING = 10 ether;

    // event
    event FlightRegistered(string flightId);
    event AirlineRegistered(address airline);
    event PassengerInsured(address passenger, uint256 amount); // or at data contract level?

 
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
         // Modify to call data contract's status
        require(true, "Contract is currently not operational");  
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

    // check if flight is registered
    modifier requireFlightNotRegistered(bytes32 flightId) {
        require(flights[flightId].isRegistered == false, "Flight is not yet registered");
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
    * @dev Contract constructor
    *
    */
    constructor
                                (
                                    address dataAddress
                                ) 
                                public 
    {
        contractOwner = msg.sender;
        DataContract = FlightSuretyData(dataAddress);
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function isOperational() 
                            public  
                            view
                            returns(bool) 
    {
        return DataContract.isOperational();  // Modify to call data contract's status
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
     * @dev For registered airlines to approve airline in event of multiparty consensus  
     * @param airline  Airline to be registered
     *
     */
    function approveAirlineForMultisig(address airline) public requireIsOperational{
        require(!DataContract.isAirlineRegistered(airline), "APPROVE AIRLINE FOR MULTISIG: AIRLINE ALREADY REGISTERED!");
        
        require(!DataContract.getAirlineVoteStatus(msg.sender), "APPROVE AIRLINE FOR MULTISIG: CALLER ALREADY VOTED");
        DataContract.setAirlineVoteStatus(msg.sender, true);
        DataContract.updateVotesCount(msg.sender, 1);

        voting = true;
    }

   /**
    * @dev Add an airline to the registration queue
    *
    */   
    function registerAirline
                            (   
                                address airline
                            )
                            external
                            requireIsOperational
                            returns(bool)
                            //returns(bool success, uint256 votes)
    {
        require(!isAirlineRegistered(airline), "REGISTER AIRLINE: AIRLINE ALREADY REGISTERED!");
        require(DataContract.isFundedAirline(msg.sender) == true, "REGISTER AIRLINE: CALLER NOT FUNDED");
        uint256 multisigCalls = DataContract.getMultisigCallsLength();
        if (multisigCalls < MIN_CONSENSUS_RESPONSES) {
            DataContract.registerAirline(airline, msg.sender);
            return true;
        } else { // multisig
            if (voting) {
                uint256 votes =  DataContract.getVotesCount(airline);
                if (votes < multisigCalls.div(2)) {
                    DataContract.resetVotesCount(airline);
                    return false;
                } else {
                    DataContract.registerAirline(airline, msg.sender);
                    // no longer voting
                    voting = false;
                    DataContract.resetVotesCount(airline);
                    // TODO: reset multisigCall count using DataContract
                    return true;
                }
            } else {
                return false;
            }
        }
    }


   /**
    * @dev Register a future flight for insuring.
    *
    */  
    function registerFlight
                                (
                                    address airline,
                                    string flightId,
                                    uint time
                                )
                                external
                                requireIsOperational
                                requireFlightNotRegistered(getFlightKey(airline, flightId, time))
    {
        bytes32 key = getFlightKey(airline, flightId, time);
        flights[key].isRegistered = true;
        flights[key].airline = airline;
        flights[key].id = flightId;
        flights[key].statusCode = STATUS_CODE_UNKNOWN;
        flights[key].updatedTimestamp = time;
        emit FlightRegistered(flightId);
    }
    
   /**
    * @dev Called after oracle has updated flight status
    *
    */  
    function processFlightStatus
                                (
                                    address airline,
                                    string memory flight,
                                    uint256 timestamp,
                                    uint8 statusCode
                                )
                                internal
                                pure
    {
    }


    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus
                        (
                            address airline,
                            string flight,
                            uint256 timestamp                            
                        )
                        external
    {
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));
        oracleResponses[key] = ResponseInfo({
                                                requester: msg.sender,
                                                isOpen: true
                                            });

        emit OracleRequest(index, airline, flight, timestamp);
    } 

    function fund() public payable requireIsOperational{
        require(msg.value >= AIRLINE_FUNDING, "FUND AIRLINE: INSUFFICIENT AMOUNT!");

        DataContract.fund(msg.sender, msg.value);
    }

    function insurePassenger(address flight, string flightId, uint256 time, address passenger) external payable requireIsOperational {
        // require min or max payment to insure?
        // is msg.sender same as passenger?
        DataContract.buy(flightId, time, passenger, msg.value);
        emit PassengerInsured(passenger, msg.value);
    }

    function isAirlineRegistered(address airline) public view returns(bool) {
        DataContract.isAirlineRegistered(airline);
    }

    function getFirstAirline() public view returns(address) {
        return DataContract.getFirstAirline();
    }


// region ORACLE MANAGEMENT

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;    

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 3;


    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;        
    }

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Model for responses from oracles
    struct ResponseInfo {
        address requester;                              // Account that requested status
        bool isOpen;                                    // If open, oracle responses are accepted
        mapping(uint8 => address[]) responses;          // Mapping key is the status code reported
                                                        // This lets us group responses and identify
                                                        // the response that majority of the oracles
    }

    // Track all oracle responses
    // Key = hash(index, flight, timestamp)
    mapping(bytes32 => ResponseInfo) private oracleResponses;

    // Event fired each time an oracle submits a response
    event FlightStatusInfo(address airline, string flight, uint256 timestamp, uint8 status);

    event OracleReport(address airline, string flight, uint256 timestamp, uint8 status);

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(uint8 index, address airline, string flight, uint256 timestamp);


    // Register an oracle with the contract
    function registerOracle
                            (
                            )
                            external
                            payable
    {
        // Require registration fee
        require(msg.value >= REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        oracles[msg.sender] = Oracle({
                                        isRegistered: true,
                                        indexes: indexes
                                    });
    }

    function getMyIndexes
                            (
                            )
                            view
                            external
                            returns(uint8[3])
    {
        require(oracles[msg.sender].isRegistered, "Not registered as an oracle");

        return oracles[msg.sender].indexes;
    }




    // Called by oracle when a response is available to an outstanding request
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three Indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome)
    function submitOracleResponse
                        (
                            uint8 index,
                            address airline,
                            string flight,
                            uint256 timestamp,
                            uint8 statusCode
                        )
                        external
    {
        require((oracles[msg.sender].indexes[0] == index) || (oracles[msg.sender].indexes[1] == index) || (oracles[msg.sender].indexes[2] == index), "Index does not match oracle request");


        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp)); 
        require(oracleResponses[key].isOpen, "Flight or timestamp do not match oracle request");

        oracleResponses[key].responses[statusCode].push(msg.sender);

        // Information isn't considered verified until at least MIN_RESPONSES
        // oracles respond with the *** same *** information
        emit OracleReport(airline, flight, timestamp, statusCode);
        if (oracleResponses[key].responses[statusCode].length >= MIN_RESPONSES) {

            emit FlightStatusInfo(airline, flight, timestamp, statusCode);

            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }


    function getFlightKey
                        (
                            address airline,
                            string flight,
                            uint256 timestamp
                        )
                        pure
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes
                            (                       
                                address account         
                            )
                            internal
                            returns(uint8[3])
    {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);
        
        indexes[1] = indexes[0];
        while(indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex
                            (
                                address account
                            )
                            internal
                            returns (uint8)
    {
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(blockhash(block.number - nonce++), account))) % maxValue);

        if (nonce > 250) {
            nonce = 0;  // Can only fetch blockhashes for last 256 blocks so we adapt
        }

        return random;
    }

    function authorizeCaller(address appContract) external {
        DataContract.authorizeCaller(appContract);
    }

// endregion

}   
