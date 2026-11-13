// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title KinetraReleaseRegistry
/// @notice Notarizes every KINETRA CLI build. Installers compare the sha256 of the
///         downloaded tarball with the checksum stored here before installing it.
contract KinetraReleaseRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Release {
        string version;
        bytes32 checksum;
        string uri;
        uint64 publishedAt;
    }

    Release[] private _releases;
    mapping(bytes32 versionHash => uint256 idPlusOne) private _ids;

    event ReleasePublished(uint256 indexed id, string version, bytes32 checksum, string uri);

    error EmptyVersion();
    error EmptyChecksum();
    error VersionExists(string version);
    error UnknownVersion(string version);
    error NoReleases();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function publish(string calldata version, bytes32 checksum, string calldata uri)
        external
        onlyOwner
        returns (uint256 id)
    {
        if (bytes(version).length == 0) revert EmptyVersion();
        if (checksum == bytes32(0)) revert EmptyChecksum();
        bytes32 key = keccak256(bytes(version));
        if (_ids[key] != 0) revert VersionExists(version);

        id = _releases.length;
        _releases.push(Release(version, checksum, uri, uint64(block.timestamp)));
        _ids[key] = id + 1;
        emit ReleasePublished(id, version, checksum, uri);
    }

    function releaseCount() external view returns (uint256) {
        return _releases.length;
    }

    function release(uint256 id) external view returns (Release memory) {
        return _releases[id];
    }

    function releaseOf(string calldata version) external view returns (Release memory) {
        uint256 idPlusOne = _ids[keccak256(bytes(version))];
        if (idPlusOne == 0) revert UnknownVersion(version);
        return _releases[idPlusOne - 1];
    }

    /// @dev Flat return values keep `checksum` at a fixed ABI word so shell installers can read it.
    function latest()
        external
        view
        returns (string memory version, bytes32 checksum, string memory uri, uint64 publishedAt)
    {
        if (_releases.length == 0) revert NoReleases();
        Release storage r = _releases[_releases.length - 1];
        return (r.version, r.checksum, r.uri, r.publishedAt);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
