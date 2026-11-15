// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only stand-in for $KNTR; never deployed.
contract TestToken is ERC20 {
    constructor() ERC20("Test KNTR", "tKNTR") {
        _mint(msg.sender, 1e27);
    }
}
