// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title KinetraAgentWallet
/// @notice Smart wallet for an autonomous agent. The owner has full control; each agent key the owner
///         adds can only spend within per-asset limits (per transaction and per UTC day), until it expires,
///         and can only call contracts the owner allowed. Wallets are beacon proxies made by
///         KinetraWalletFactory, so one upgrade of the beacon upgrades every wallet in place.
contract KinetraAgentWallet is Initializable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Limit {
        uint128 perTx;
        uint128 perDay;
    }

    address public owner;
    mapping(address agent => uint64 expiresAt) public agentExpiry;
    mapping(address agent => mapping(address asset => Limit)) private _limits;
    mapping(address agent => mapping(address asset => mapping(uint256 day => uint256))) private _spent;
    mapping(address target => bool) public allowedTarget;

    event OwnerChanged(address owner);
    event AgentSet(address indexed agent, uint64 expiresAt);
    event LimitSet(address indexed agent, address indexed asset, uint128 perTx, uint128 perDay);
    event TargetSet(address indexed target, bool allowed);
    event Spent(address indexed agent, address indexed asset, address indexed to, uint256 amount);
    event Executed(address indexed target, uint256 value, bytes data);

    error NotOwner();
    error NotAgent(address caller);
    error OverTxLimit(uint256 amount, uint256 limit);
    error OverDailyLimit(uint256 spent, uint256 limit);
    error TargetNotAllowed(address target);
    error ZeroOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param target a contract the agent may call from the start, usually KinetraServiceMarket; 0 for none
    function initialize(address owner_, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, address target)
        external
        initializer
    {
        if (owner_ == address(0)) revert ZeroOwner();
        owner = owner_;
        emit OwnerChanged(owner_);
        if (agent != address(0)) {
            _setAgent(agent, expiresAt);
            _setLimit(agent, address(0), ethPerTx, ethPerDay);
        }
        if (target != address(0)) _setTarget(target, true);
    }

    receive() external payable {}

    // ── owner ───────────────────────────────────────────────────────────────

    function execute(address target, uint256 value, bytes calldata data) external onlyOwner nonReentrant returns (bytes memory) {
        emit Executed(target, value, data);
        return _call(target, value, data);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    /// @notice expiresAt 0 revokes the agent.
    function setAgent(address agent, uint64 expiresAt) external onlyOwner {
        _setAgent(agent, expiresAt);
    }

    function setLimit(address agent, address asset, uint128 perTx, uint128 perDay) external onlyOwner {
        _setLimit(agent, asset, perTx, perDay);
    }

    function setTarget(address target, bool allowed) external onlyOwner {
        _setTarget(target, allowed);
    }

    // ── agent ───────────────────────────────────────────────────────────────

    /// @notice Spends `amount` of `asset` (address(0) for ETH) within the caller's limits.
    ///         Empty `data` pays `to` directly. Otherwise `to` must be an allowed contract: ETH goes along as
    ///         value, a token is approved for exactly `amount` during the call and the approval is cleared after.
    function spend(address asset, address to, uint256 amount, bytes calldata data)
        external
        nonReentrant
        returns (bytes memory ret)
    {
        uint64 expiry = agentExpiry[msg.sender];
        if (expiry == 0 || block.timestamp > expiry) revert NotAgent(msg.sender);
        if (data.length > 0 && (!allowedTarget[to] || to == asset)) revert TargetNotAllowed(to);

        if (amount > 0) {
            Limit memory l = _limits[msg.sender][asset];
            if (amount > l.perTx) revert OverTxLimit(amount, l.perTx);
            uint256 day = block.timestamp / 1 days;
            uint256 total = _spent[msg.sender][asset][day] + amount;
            if (total > l.perDay) revert OverDailyLimit(total, l.perDay);
            _spent[msg.sender][asset][day] = total;
        }
        emit Spent(msg.sender, asset, to, amount);

        if (asset == address(0)) return _call(to, amount, data);
        if (data.length == 0) {
            IERC20(asset).safeTransfer(to, amount);
            return ret;
        }
        IERC20(asset).forceApprove(to, amount);
        ret = Address.functionCall(to, data);
        IERC20(asset).forceApprove(to, 0);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function limitOf(address agent, address asset) external view returns (Limit memory) {
        return _limits[agent][asset];
    }

    function spentToday(address agent, address asset) external view returns (uint256) {
        return _spent[agent][asset][block.timestamp / 1 days];
    }

    function isAgent(address agent) external view returns (bool) {
        uint64 expiry = agentExpiry[agent];
        return expiry != 0 && block.timestamp <= expiry;
    }

    /// @dev a plain ETH payment to an address without code is fine; functionCall would reject it
    function _call(address to, uint256 value, bytes calldata data) private returns (bytes memory ret) {
        if (data.length == 0) Address.sendValue(payable(to), value);
        else ret = Address.functionCallWithValue(to, data, value);
    }

    function _setAgent(address agent, uint64 expiresAt) private {
        agentExpiry[agent] = expiresAt;
        emit AgentSet(agent, expiresAt);
    }

    function _setLimit(address agent, address asset, uint128 perTx, uint128 perDay) private {
        _limits[agent][asset] = Limit(perTx, perDay);
        emit LimitSet(agent, asset, perTx, perDay);
    }

    function _setTarget(address target, bool allowed) private {
        allowedTarget[target] = allowed;
        emit TargetSet(target, allowed);
    }
}
