import { shallowReactive } from "vue";
import { BaseError, ContractFunctionRevertedError, createWalletClient, custom, numberToHex, type Abi, type EIP1193Provider, type Hex } from "viem";
import { chain, CHAIN_NAME, client, deployment, EXPLORER, PUBLIC_RPC_URL } from "./chain";

// Browser wallets for Nexus: discovered through EIP-6963, with window.ethereum as the fallback.

export interface InjectedWallet {
  id: string;
  name: string;
  icon?: string;
  provider: EIP1193Provider;
}

export const wallet = shallowReactive({
  wallets: [] as InjectedWallet[],
  account: null as Hex | null,
  chainId: null as number | null,
  /** the step in flight, shown on the button that started it */
  busy: "",
  error: "",
});

const LAST = "kinetra-wallet";
let active: InjectedWallet | null = null;

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST, id);
    else localStorage.removeItem(LAST);
  } catch {}
}

function add(w: InjectedWallet) {
  if (!wallet.wallets.some((x) => x.id === w.id)) wallet.wallets = [...wallet.wallets, w];
}

let discovered = false;
/** Finds installed wallets and reconnects silently to the one used last. */
export function discoverWallets() {
  if (discovered) return;
  discovered = true;
  addEventListener("eip6963:announceProvider", (e: any) => add({ id: e.detail.info.rdns, name: e.detail.info.name, icon: e.detail.info.icon, provider: e.detail.provider }));
  dispatchEvent(new Event("eip6963:requestProvider"));
  setTimeout(async () => {
    const eth = (window as any).ethereum as EIP1193Provider | undefined;
    if (!wallet.wallets.length && eth) add({ id: "injected", name: "Browser wallet", provider: eth });
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST);
    } catch {}
    const w = wallet.wallets.find((x) => x.id === last);
    if (!w) return;
    // eth_accounts never prompts: it only answers if the site is still authorized
    const [account] = (await w.provider.request({ method: "eth_accounts" }).catch(() => [])) as Hex[];
    if (account) await attach(w, account);
  }, 400);
}

async function attach(w: InjectedWallet, account: Hex) {
  if (active !== w) {
    active?.provider.removeListener?.("accountsChanged", onAccounts);
    active?.provider.removeListener?.("chainChanged", onChain);
    w.provider.on?.("accountsChanged", onAccounts);
    w.provider.on?.("chainChanged", onChain);
  }
  active = w;
  wallet.account = account;
  wallet.chainId = Number(await w.provider.request({ method: "eth_chainId" }));
  remember(w.id);
}

const onAccounts = (accounts: string[]) => {
  wallet.account = (accounts[0] as Hex) ?? null;
  if (!accounts[0]) remember(null);
};
const onChain = (id: string) => (wallet.chainId = Number(id));

export async function connect(w = wallet.wallets[0]) {
  wallet.error = "";
  if (!w) {
    wallet.error = "Install a browser wallet such as MetaMask or Rabby to continue";
    return false;
  }
  try {
    wallet.busy = "connect";
    const [account] = (await w.provider.request({ method: "eth_requestAccounts" })) as Hex[];
    await attach(w, account);
    return true;
  } catch (e) {
    wallet.error = explain(e);
    return false;
  } finally {
    wallet.busy = "";
  }
}

export function disconnect() {
  wallet.account = null;
  remember(null);
}

const hexId = numberToHex(deployment.chainId);
async function ensureChain(p: EIP1193Provider) {
  if (wallet.chainId === deployment.chainId) return;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e: any) {
    // 4902: the wallet does not know the chain yet
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hexId, chainName: CHAIN_NAME, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [PUBLIC_RPC_URL], blockExplorerUrls: [EXPLORER] }],
    });
  }
  wallet.chainId = deployment.chainId;
}

export interface Call {
  address: Hex;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

/**
 * Simulates the call first so a revert shows the contract's own error name, then sends it from the
 * connected wallet and waits for the receipt. `step` labels the busy state.
 */
export async function send(step: string, call: Call) {
  if (!active || !wallet.account) throw new Error("Connect a wallet first");
  wallet.error = "";
  wallet.busy = step;
  try {
    await ensureChain(active.provider);
    const { request } = await client.simulateContract({ ...call, account: wallet.account } as any);
    const signer = createWalletClient({ account: wallet.account, chain, transport: custom(active.provider) });
    const hash = await signer.writeContract(request as any);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction ${hash.slice(0, 10)}… reverted`);
    return receipt;
  } catch (e) {
    wallet.error = explain(e);
    throw e;
  } finally {
    wallet.busy = "";
  }
}

/** Contract errors from KinetraServiceMarket, KinetraAgentWallet and the factory, said plainly. */
const REVERTS: Record<string, string> = {
  Inactive: "This service is paused by its agent right now",
  SelfHire: "That service is yours. Hire another agent's service",
  WrongPayment: "The price changed. Reload and try again",
  InvalidText: "The brief is empty or longer than 4 KB",
  InvalidRating: "Pick a rating from 1 to 5",
  NotClient: "Only the wallet that hired this job can do that",
  WrongStatus: "The job moved on. Reload to see where it stands",
  TooEarly: "The window has not closed yet",
  ZeroOwner: "Set an owner address",
};

export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name) return REVERTS[name] ?? name;
    if (e.walk((x: any) => x?.code === 4001 || x?.name === "UserRejectedRequestError")) return "Cancelled in your wallet";
    if (/insufficient funds/i.test(e.message)) return `Not enough ETH on ${CHAIN_NAME} for this payment and gas`;
    return e.shortMessage;
  }
  const any = e as any;
  if (any?.code === 4001) return "Cancelled in your wallet";
  return any?.message ?? String(e);
}
