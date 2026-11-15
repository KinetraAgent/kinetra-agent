// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IKinetraAgentRegistry {
    function isRegistered(address account) external view returns (bool);
    function payoutOf(address account) external view returns (address);
    function recordJob(address account, uint8 rating) external;
}

/// @title KinetraServiceMarket
/// @notice Registered agents list services; clients (people or agents) hire them with ETH or a supported
///         token such as $KNTR. Payment sits in escrow until the client accepts the delivery, or the review
///         window passes. Undelivered jobs refund the client.
contract KinetraServiceMarket is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Delivered,
        Completed,
        Refunded
    }

    struct Service {
        address provider;
        string title;
        string details;
        address asset;
        uint256 price;
        bool active;
        uint64 listedAt;
        uint32 jobs;
    }

    struct Job {
        uint256 serviceId;
        address client;
        address provider;
        address asset;
        uint256 amount;
        Status status;
        uint8 rating;
        uint64 createdAt;
        uint64 deliveredAt;
        string brief;
        string result;
    }

    uint256 public constant MAX_TITLE = 64;
    uint256 public constant MAX_DETAILS = 2048;
    uint256 public constant MAX_BRIEF = 4096;
    uint256 public constant MAX_RESULT = 8192;
    uint16 public constant MAX_FEE_BPS = 1000;

    IKinetraAgentRegistry public registry;
    address public treasury;
    uint16 public feeBps;
    uint64 public deliveryWindow;
    uint64 public reviewWindow;
    mapping(address token => bool) public supportedAsset;
    /// @notice settled amount per asset, address(0) is ETH
    mapping(address asset => uint256) public volume;
    uint256 public completedJobs;

    Service[] private _services;
    Job[] private _jobs;

    event ServiceListed(uint256 indexed id, address indexed provider, address asset, uint256 price, string title);
    event ServiceUpdated(uint256 indexed id, uint256 price, bool active);
    event JobCreated(uint256 indexed id, uint256 indexed serviceId, address indexed client, address provider, uint256 amount);
    event JobDelivered(uint256 indexed id);
    event JobCompleted(uint256 indexed id, uint8 rating, uint256 paid, uint256 fee);
    event JobRefunded(uint256 indexed id);
    event AssetSet(address token, bool supported);
    event TermsSet(address treasury, uint16 feeBps, uint64 deliveryWindow, uint64 reviewWindow);

    error NotRegistered(address account);
    error UnsupportedAsset(address asset);
    error InvalidText();
    error InvalidPrice();
    error InvalidRating();
    error InvalidTerms();
    error NotProvider();
    error NotClient();
    error Inactive(uint256 serviceId);
    error SelfHire();
    error WrongPayment();
    error WrongStatus(Status status);
    error TooEarly();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address registry_) external initializer {
        __Ownable_init(initialOwner);
        registry = IKinetraAgentRegistry(registry_);
        _setTerms(initialOwner, 0, 1 days, 3 days);
    }

    // ── services ────────────────────────────────────────────────────────────

    function listService(string calldata title, string calldata details, address asset, uint256 price)
        external
        returns (uint256 id)
    {
        if (!registry.isRegistered(msg.sender)) revert NotRegistered(msg.sender);
        if (asset != address(0) && !supportedAsset[asset]) revert UnsupportedAsset(asset);
        if (bytes(title).length == 0 || bytes(title).length > MAX_TITLE || bytes(details).length > MAX_DETAILS) revert InvalidText();
        if (price == 0) revert InvalidPrice();

        id = _services.length;
        _services.push(Service(msg.sender, title, details, asset, price, true, uint64(block.timestamp), 0));
        emit ServiceListed(id, msg.sender, asset, price, title);
    }

    function updateService(uint256 id, uint256 price, bool active) external {
        Service storage s = _services[id];
        if (s.provider != msg.sender) revert NotProvider();
        if (price == 0) revert InvalidPrice();
        s.price = price;
        s.active = active;
        emit ServiceUpdated(id, price, active);
    }

    // ── jobs ────────────────────────────────────────────────────────────────

    /// @notice Pays the service price into escrow. Tokens need an allowance for this contract first.
    function hire(uint256 serviceId, string calldata brief) external payable nonReentrant returns (uint256 id) {
        Service storage s = _services[serviceId];
        if (!s.active) revert Inactive(serviceId);
        if (s.provider == msg.sender) revert SelfHire();
        if (bytes(brief).length == 0 || bytes(brief).length > MAX_BRIEF) revert InvalidText();
        uint256 price = s.price;
        address asset = s.asset;

        id = _jobs.length;
        Job storage j = _jobs.push();
        j.serviceId = serviceId;
        j.client = msg.sender;
        j.provider = s.provider;
        j.asset = asset;
        j.amount = price;
        j.status = Status.Open;
        j.createdAt = uint64(block.timestamp);
        j.brief = brief;
        s.jobs++;
        emit JobCreated(id, serviceId, msg.sender, s.provider, price);

        if (asset == address(0)) {
            if (msg.value != price) revert WrongPayment();
        } else {
            if (msg.value != 0) revert WrongPayment();
            IERC20(asset).safeTransferFrom(msg.sender, address(this), price);
        }
    }

    function deliver(uint256 id, string calldata result) external {
        Job storage j = _jobs[id];
        if (j.provider != msg.sender) revert NotProvider();
        if (j.status != Status.Open) revert WrongStatus(j.status);
        if (bytes(result).length == 0 || bytes(result).length > MAX_RESULT) revert InvalidText();
        j.status = Status.Delivered;
        j.deliveredAt = uint64(block.timestamp);
        j.result = result;
        emit JobDelivered(id);
    }

    function accept(uint256 id, uint8 rating) external nonReentrant {
        Job storage j = _jobs[id];
        if (j.client != msg.sender) revert NotClient();
        if (j.status != Status.Delivered) revert WrongStatus(j.status);
        if (rating == 0 || rating > 5) revert InvalidRating();
        _settle(id, j, rating);
    }

    /// @notice Pays the provider once the review window after delivery has passed, unrated.
    function release(uint256 id) external nonReentrant {
        Job storage j = _jobs[id];
        if (j.status != Status.Delivered) revert WrongStatus(j.status);
        if (block.timestamp <= j.deliveredAt + reviewWindow) revert TooEarly();
        _settle(id, j, 0);
    }

    /// @notice Refunds the client when the provider has not delivered within the delivery window.
    function cancel(uint256 id) external nonReentrant {
        Job storage j = _jobs[id];
        if (j.client != msg.sender) revert NotClient();
        if (j.status != Status.Open) revert WrongStatus(j.status);
        if (block.timestamp <= j.createdAt + deliveryWindow) revert TooEarly();
        _refund(id, j);
    }

    /// @notice The provider turns a job down and the client gets the full amount back.
    function decline(uint256 id) external nonReentrant {
        Job storage j = _jobs[id];
        if (j.provider != msg.sender) revert NotProvider();
        if (j.status != Status.Open) revert WrongStatus(j.status);
        _refund(id, j);
    }

    function _settle(uint256 id, Job storage j, uint8 rating) private {
        j.status = Status.Completed;
        j.rating = rating;
        uint256 fee = (j.amount * feeBps) / 10_000;
        uint256 paid = j.amount - fee;
        volume[j.asset] += j.amount;
        completedJobs++;
        registry.recordJob(j.provider, rating);
        emit JobCompleted(id, rating, paid, fee);
        _pay(j.asset, registry.payoutOf(j.provider), paid);
        if (fee > 0) _pay(j.asset, treasury, fee);
    }

    function _refund(uint256 id, Job storage j) private {
        j.status = Status.Refunded;
        emit JobRefunded(id);
        _pay(j.asset, j.client, j.amount);
    }

    function _pay(address asset, address to, uint256 amount) private {
        if (asset == address(0)) Address.sendValue(payable(to), amount);
        else IERC20(asset).safeTransfer(to, amount);
    }

    // ── admin ───────────────────────────────────────────────────────────────

    function setAsset(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert UnsupportedAsset(token);
        supportedAsset[token] = supported;
        emit AssetSet(token, supported);
    }

    function setTerms(address treasury_, uint16 feeBps_, uint64 deliveryWindow_, uint64 reviewWindow_) external onlyOwner {
        _setTerms(treasury_, feeBps_, deliveryWindow_, reviewWindow_);
    }

    function _setTerms(address treasury_, uint16 feeBps_, uint64 deliveryWindow_, uint64 reviewWindow_) private {
        if (treasury_ == address(0) || feeBps_ > MAX_FEE_BPS || deliveryWindow_ == 0 || reviewWindow_ == 0) revert InvalidTerms();
        treasury = treasury_;
        feeBps = feeBps_;
        deliveryWindow = deliveryWindow_;
        reviewWindow = reviewWindow_;
        emit TermsSet(treasury_, feeBps_, deliveryWindow_, reviewWindow_);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function serviceCount() external view returns (uint256) {
        return _services.length;
    }

    function service(uint256 id) external view returns (Service memory) {
        return _services[id];
    }

    function services(uint256 offset, uint256 limit) external view returns (Service[] memory page) {
        uint256 total = _services.length;
        if (offset >= total) return page;
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new Service[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _services[i];
        }
    }

    function jobCount() external view returns (uint256) {
        return _jobs.length;
    }

    function job(uint256 id) external view returns (Job memory) {
        return _jobs[id];
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
