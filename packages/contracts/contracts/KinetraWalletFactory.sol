// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

interface IKinetraAgentWallet {
    function initialize(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, address target) external;
}

/// @title KinetraWalletFactory
/// @notice Creates KinetraAgentWallet beacon proxies at deterministic addresses. The address commits to
///         every setting, so nobody can take a wallet's address with different ones.
contract KinetraWalletFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public beacon;
    /// @notice contract new wallets let their agent call, KinetraServiceMarket
    address public defaultTarget;
    uint256 public walletCount;
    mapping(address owner => address[]) private _walletsOf;

    event WalletCreated(address indexed wallet, address indexed owner, address indexed agent);
    event DefaultTargetSet(address target);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address beacon_, address defaultTarget_) external initializer {
        __Ownable_init(initialOwner);
        beacon = beacon_;
        defaultTarget = defaultTarget_;
    }

    function createWallet(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, bytes32 salt)
        external
        returns (address wallet)
    {
        (bytes32 key, bytes memory code) = _creation(owner, agent, expiresAt, ethPerTx, ethPerDay, salt);
        wallet = Create2.deploy(0, key, code);
        _walletsOf[owner].push(wallet);
        walletCount++;
        emit WalletCreated(wallet, owner, agent);
    }

    function predictWallet(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, bytes32 salt)
        external
        view
        returns (address)
    {
        (bytes32 key, bytes memory code) = _creation(owner, agent, expiresAt, ethPerTx, ethPerDay, salt);
        return Create2.computeAddress(key, keccak256(code));
    }

    function walletsOf(address owner) external view returns (address[] memory) {
        return _walletsOf[owner];
    }

    function setDefaultTarget(address target) external onlyOwner {
        defaultTarget = target;
        emit DefaultTargetSet(target);
    }

    function _creation(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, bytes32 salt)
        private
        view
        returns (bytes32 key, bytes memory code)
    {
        bytes memory init = abi.encodeCall(IKinetraAgentWallet.initialize, (owner, agent, expiresAt, ethPerTx, ethPerDay, defaultTarget));
        key = keccak256(abi.encode(owner, salt));
        code = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, init));
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
