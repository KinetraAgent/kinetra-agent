// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title KinetraAgentRegistry
/// @notice Onchain identity and reputation for KINETRA agents. An agent is the address that registers;
///         KinetraServiceMarket records every completed job and its rating here.
contract KinetraAgentRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Agent {
        address account;
        string name;
        string metadataURI;
        address payout;
        uint64 registeredAt;
        uint32 jobsCompleted;
        uint32 ratingCount;
        uint64 ratingSum;
    }

    uint256 public constant MAX_NAME_LENGTH = 32;
    uint256 public constant MAX_URI_LENGTH = 512;

    Agent[] private _agents;
    mapping(address account => uint256 idPlusOne) private _ids;
    mapping(bytes32 nameHash => uint256 idPlusOne) private _names;
    address public market;

    event AgentRegistered(uint256 indexed id, address indexed account, string name);
    event AgentUpdated(uint256 indexed id, string metadataURI, address payout);
    event JobRecorded(address indexed account, uint8 rating);
    event MarketSet(address market);

    error InvalidName();
    error InvalidURI();
    error NameTaken(string name);
    error AlreadyRegistered(address account);
    error NotRegistered(address account);
    error UnknownName(string name);
    error NotMarket();
    error InvalidRating();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    /// @notice Names are 1-32 characters of a-z, 0-9 and '-', so they read the same everywhere.
    function register(string calldata name, string calldata metadataURI, address payout) external returns (uint256 id) {
        if (_ids[msg.sender] != 0) revert AlreadyRegistered(msg.sender);
        if (!_validName(bytes(name))) revert InvalidName();
        if (bytes(metadataURI).length > MAX_URI_LENGTH) revert InvalidURI();
        bytes32 key = keccak256(bytes(name));
        if (_names[key] != 0) revert NameTaken(name);

        id = _agents.length;
        _agents.push(Agent(msg.sender, name, metadataURI, payout == address(0) ? msg.sender : payout, uint64(block.timestamp), 0, 0, 0));
        _ids[msg.sender] = id + 1;
        _names[key] = id + 1;
        emit AgentRegistered(id, msg.sender, name);
    }

    function update(string calldata metadataURI, address payout) external {
        uint256 idPlusOne = _ids[msg.sender];
        if (idPlusOne == 0) revert NotRegistered(msg.sender);
        if (bytes(metadataURI).length > MAX_URI_LENGTH) revert InvalidURI();
        Agent storage a = _agents[idPlusOne - 1];
        a.metadataURI = metadataURI;
        a.payout = payout == address(0) ? msg.sender : payout;
        emit AgentUpdated(idPlusOne - 1, metadataURI, a.payout);
    }

    /// @notice Called by the market when a job settles. Rating 0 means the job auto-released unrated.
    function recordJob(address account, uint8 rating) external {
        if (msg.sender != market) revert NotMarket();
        if (rating > 5) revert InvalidRating();
        uint256 idPlusOne = _ids[account];
        if (idPlusOne == 0) revert NotRegistered(account);
        Agent storage a = _agents[idPlusOne - 1];
        a.jobsCompleted++;
        if (rating > 0) {
            a.ratingCount++;
            a.ratingSum += rating;
        }
        emit JobRecorded(account, rating);
    }

    function setMarket(address market_) external onlyOwner {
        market = market_;
        emit MarketSet(market_);
    }

    function isRegistered(address account) external view returns (bool) {
        return _ids[account] != 0;
    }

    function payoutOf(address account) external view returns (address) {
        uint256 idPlusOne = _ids[account];
        if (idPlusOne == 0) revert NotRegistered(account);
        return _agents[idPlusOne - 1].payout;
    }

    function agentOf(address account) external view returns (Agent memory) {
        uint256 idPlusOne = _ids[account];
        if (idPlusOne == 0) revert NotRegistered(account);
        return _agents[idPlusOne - 1];
    }

    function agentByName(string calldata name) external view returns (Agent memory) {
        uint256 idPlusOne = _names[keccak256(bytes(name))];
        if (idPlusOne == 0) revert UnknownName(name);
        return _agents[idPlusOne - 1];
    }

    function agentCount() external view returns (uint256) {
        return _agents.length;
    }

    function agents(uint256 offset, uint256 limit) external view returns (Agent[] memory page) {
        uint256 total = _agents.length;
        if (offset >= total) return page;
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new Agent[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _agents[i];
        }
    }

    function _validName(bytes calldata name) private pure returns (bool) {
        if (name.length == 0 || name.length > MAX_NAME_LENGTH) return false;
        for (uint256 i; i < name.length; ++i) {
            bytes1 ch = name[i];
            if (!((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch == "-")) return false;
        }
        return true;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
