import { existsSync } from "node:fs";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";

const envFile = new URL("../../.env", `file://${__filename}`).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);
const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC ?? "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts,
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC ?? "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts,
    },
  },
  etherscan: {
    // Blockscout accepts any non-empty key
    apiKey: { robinhoodTestnet: "blockscout", robinhood: "blockscout" },
    customChains: [
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};

export default config;
