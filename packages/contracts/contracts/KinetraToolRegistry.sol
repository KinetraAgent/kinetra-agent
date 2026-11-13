// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title KinetraToolRegistry
/// @notice Public index of KINETRA agent tools. Anyone can register a tool manifest;
///         the owner marks reviewed tools as verified.
contract KinetraToolRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Tool {
        address author;
        string name;
        string manifestURI;
        bytes32 manifestHash;
        bool verified;
        uint64 registeredAt;
    }

    uint256 public constant MAX_NAME_LENGTH = 64;

    Tool[] private _tools;
    mapping(bytes32 nameHash => uint256 idPlusOne) private _ids;

    event ToolRegistered(uint256 indexed id, address indexed author, string name);
    event ToolUpdated(uint256 indexed id, string manifestURI, bytes32 manifestHash);
    event ToolVerified(uint256 indexed id, bool verified);

    error InvalidName();
    error NameTaken(string name);
    error UnknownTool(string name);
    error NotAuthor(uint256 id);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function register(string calldata name, string calldata manifestURI, bytes32 manifestHash)
        external
        returns (uint256 id)
    {
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_NAME_LENGTH) revert InvalidName();
        bytes32 key = keccak256(bytes(name));
        if (_ids[key] != 0) revert NameTaken(name);

        id = _tools.length;
        _tools.push(Tool(msg.sender, name, manifestURI, manifestHash, false, uint64(block.timestamp)));
        _ids[key] = id + 1;
        emit ToolRegistered(id, msg.sender, name);
    }

    /// @notice A changed manifest loses its verified badge until it is reviewed again.
    function update(uint256 id, string calldata manifestURI, bytes32 manifestHash) external {
        Tool storage t = _tools[id];
        if (t.author != msg.sender) revert NotAuthor(id);
        t.manifestURI = manifestURI;
        t.manifestHash = manifestHash;
        emit ToolUpdated(id, manifestURI, manifestHash);
        if (t.verified) {
            t.verified = false;
            emit ToolVerified(id, false);
        }
    }

    function setVerified(uint256 id, bool verified) external onlyOwner {
        _tools[id].verified = verified;
        emit ToolVerified(id, verified);
    }

    function toolCount() external view returns (uint256) {
        return _tools.length;
    }

    function tool(uint256 id) external view returns (Tool memory) {
        return _tools[id];
    }

    function toolOf(string calldata name) external view returns (Tool memory) {
        uint256 idPlusOne = _ids[keccak256(bytes(name))];
        if (idPlusOne == 0) revert UnknownTool(name);
        return _tools[idPlusOne - 1];
    }

    function tools(uint256 offset, uint256 limit) external view returns (Tool[] memory page) {
        uint256 total = _tools.length;
        if (offset >= total) return page;
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new Tool[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _tools[i];
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
