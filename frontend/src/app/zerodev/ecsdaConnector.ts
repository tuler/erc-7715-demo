import {
    ChainNotConfiguredError,
    type Connector,
    ProviderNotFoundError,
    type Storage,
    createConnector,
} from "@wagmi/core";
import type { Compute } from "@wagmi/core/internal";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import type { KernelValidator } from "@zerodev/sdk/types";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
    type AddEthereumChainParameter,
    type Chain,
    type ProviderRpcError,
    SwitchChainError,
    UserRejectedRequestError,
    type WalletCapabilities,
    createPublicClient,
    getAddress,
    numberToHex,
} from "viem";
import { createPaymasterClient } from "viem/account-abstraction";
import "viem/window";
import { http } from "wagmi";
import { KernelEIP1193Provider } from "./KernelEIP1193Provider";

type ConnectorParameters = {
    chain: Chain;
    rpcUrl: string;
    bundlerUrl: string;
    paymasterUrl?: string;
};

// connector types
export type Provider = KernelEIP1193Provider<"0.7"> | undefined;
export type StorageItem = {
    capabilities: WalletCapabilities;
};

export const ecdsaConnectorId = "zerodevEcdsaSDK";

ecdsaConnector.type = "ecdsaConnector" as const;
export function ecdsaConnector(params: ConnectorParameters) {
    const { bundlerUrl, chain, paymasterUrl, rpcUrl } = params;
    let walletProvider: KernelEIP1193Provider<"0.7"> | undefined;
    let accountsChanged: Connector["onAccountsChanged"] | undefined;
    let chainChanged: Connector["onChainChanged"] | undefined;
    let disconnect: Connector["onDisconnect"] | undefined;

    const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
    const entryPoint = getEntryPoint("0.7");
    const kernelVersion = KERNEL_V3_2;

    const createProvider = async (
        sudo: KernelValidator,
        storage?: Compute<Storage<StorageItem>> | null | undefined
    ) => {
        const kernelAccount = await createKernelAccount(publicClient, {
            entryPoint,
            kernelVersion,
            plugins: { sudo },
        });

        // gas price given by pimlico bundler API (including local alto)
        const estimateFeesPerGas = async () => {
            const pimlicoClient = createPimlicoClient({
                transport: http(bundlerUrl),
            });
            const gas = await pimlicoClient.getUserOperationGasPrice();
            return gas.standard;
        };

        const kernelClient = createKernelAccountClient({
            account: kernelAccount,
            chain,
            bundlerTransport: http(bundlerUrl),
            userOperation: { estimateFeesPerGas },
            paymaster: paymasterUrl
                ? createPaymasterClient({
                      transport: http(paymasterUrl),
                  })
                : undefined,
        });
        return new KernelEIP1193Provider(kernelClient, storage);
    };

    return createConnector<Provider, Record<string, unknown>, StorageItem>(
        (config) => {
            return {
                id: ecdsaConnectorId,
                name: "ZeroDev ECDSA",
                type: ecdsaConnector.type,

                async connect(params) {
                    const { chainId } = params ?? {};

                    try {
                        if (chainId && chain.id !== chainId) {
                            throw new Error(
                                `Incorrect chain Id: ${chainId} should be ${chain.id}`
                            );
                        }

                        const provider = await this.getProvider({
                            chainId,
                        });
                        if (provider) {
                            const accounts = (
                                (await provider.request({
                                    method: "eth_requestAccounts",
                                })) as string[]
                            ).map((x) => getAddress(x));
                            if (!accountsChanged) {
                                accountsChanged =
                                    this.onAccountsChanged.bind(this);
                                provider.on("accountsChanged", accountsChanged);
                            }
                            if (!chainChanged) {
                                chainChanged = this.onChainChanged.bind(this);
                                provider.on("chainChanged", chainChanged);
                            }
                            if (!disconnect) {
                                disconnect = this.onDisconnect.bind(this);
                                provider.on("disconnect", disconnect);
                            }
                            return { accounts, chainId: chain.id };
                        }

                        if (!window.ethereum) {
                            throw new Error("No Ethereum provider found");
                        }
                        const ecdsaValidator = await signerToEcdsaValidator(
                            publicClient,
                            {
                                entryPoint,
                                kernelVersion,
                                signer: window.ethereum,
                            }
                        );

                        walletProvider = await createProvider(
                            ecdsaValidator,
                            config.storage
                        );

                        const accounts = (
                            (await walletProvider.request({
                                method: "eth_requestAccounts",
                            })) as string[]
                        ).map((x) => getAddress(x));

                        return {
                            accounts,
                            chainId: chain.id,
                        };
                    } catch (error) {
                        if (
                            /(user closed modal|accounts received is empty|user denied account)/i.test(
                                (error as Error).message
                            )
                        )
                            throw new UserRejectedRequestError(error as Error);
                        throw error;
                    }
                },

                async disconnect() {
                    const provider = await this.getProvider();
                    if (accountsChanged) {
                        provider?.removeListener(
                            "accountsChanged",
                            accountsChanged
                        );
                        accountsChanged = undefined;
                    }
                    if (chainChanged) {
                        provider?.removeListener("chainChanged", chainChanged);
                        chainChanged = undefined;
                    }
                    if (disconnect) {
                        provider?.removeListener("disconnect", disconnect);
                        disconnect = undefined;
                    }
                    walletProvider = undefined;
                },

                async getAccounts() {
                    const provider = await this.getProvider();
                    if (!provider) throw new ProviderNotFoundError();

                    const accounts = (await provider.request({
                        method: "eth_accounts",
                    })) as string[];
                    return accounts.map(getAddress);
                },

                async getChainId() {
                    const provider = await this.getProvider();
                    if (!provider) return chain.id;

                    const chainId = await provider.request({
                        method: "eth_chainId",
                    });
                    return Number(chainId as number);
                },

                async getProvider() {
                    if (!walletProvider) {
                        if (!window.ethereum) {
                            throw new Error("No Ethereum provider found");
                        }

                        const ecdsaValidator = await signerToEcdsaValidator(
                            publicClient,
                            {
                                entryPoint,
                                kernelVersion,
                                signer: window.ethereum,
                            }
                        );

                        const provider = await createProvider(
                            ecdsaValidator,
                            config.storage
                        );

                        if (!accountsChanged) {
                            accountsChanged = this.onAccountsChanged.bind(this);
                            provider.on("accountsChanged", accountsChanged);
                        }
                        if (!chainChanged) {
                            chainChanged = this.onChainChanged.bind(this);
                            provider.on("chainChanged", chainChanged);
                        }
                        if (!disconnect) {
                            disconnect = this.onDisconnect.bind(this);
                            provider.on("disconnect", disconnect);
                        }
                        walletProvider = provider;
                    }
                    return walletProvider;
                },

                async isAuthorized() {
                    try {
                        const accounts = await this.getAccounts();
                        return !!accounts.length;
                    } catch {
                        return false;
                    }
                },

                async switchChain({ addEthereumChainParameter, chainId }) {
                    const chain = config.chains.find(
                        (chain) => chain.id === chainId
                    );
                    if (!chain)
                        throw new SwitchChainError(
                            new ChainNotConfiguredError()
                        );

                    const provider = await this.getProvider();
                    if (!provider)
                        throw new SwitchChainError(new Error("Not Connected"));

                    try {
                        await provider.request({
                            method: "wallet_switchEthereumChain",
                            params: [{ chainId: numberToHex(chain.id) }],
                        });
                        return chain;
                    } catch (error) {
                        // Indicates chain is not added to provider
                        if ((error as ProviderRpcError).code === 4902) {
                            try {
                                let blockExplorerUrls: string[];
                                if (
                                    addEthereumChainParameter?.blockExplorerUrls
                                )
                                    blockExplorerUrls =
                                        addEthereumChainParameter.blockExplorerUrls;
                                else
                                    blockExplorerUrls = chain.blockExplorers
                                        ?.default.url
                                        ? [chain.blockExplorers?.default.url]
                                        : [];

                                let rpcUrls: readonly string[];
                                if (addEthereumChainParameter?.rpcUrls?.length)
                                    rpcUrls = addEthereumChainParameter.rpcUrls;
                                else
                                    rpcUrls = [
                                        chain.rpcUrls.default?.http[0] ?? "",
                                    ];

                                const addEthereumChain = {
                                    blockExplorerUrls,
                                    chainId: numberToHex(chainId),
                                    chainName:
                                        addEthereumChainParameter?.chainName ??
                                        chain.name,
                                    iconUrls:
                                        addEthereumChainParameter?.iconUrls,
                                    nativeCurrency:
                                        addEthereumChainParameter?.nativeCurrency ??
                                        chain.nativeCurrency,
                                    rpcUrls,
                                } satisfies AddEthereumChainParameter;

                                await provider.request({
                                    method: "wallet_addEthereumChain",
                                    params: [addEthereumChain],
                                });

                                return chain;
                            } catch (error) {
                                throw new UserRejectedRequestError(
                                    error as Error
                                );
                            }
                        }

                        throw new SwitchChainError(error as Error);
                    }
                },

                async onAccountsChanged(accounts) {
                    if (accounts.length === 0) this.onDisconnect();
                    else
                        config.emitter.emit("change", {
                            accounts: accounts.map((x) => getAddress(x)),
                        });
                },

                async onChainChanged(chain) {
                    const chainId = Number(chain);
                    config.emitter.emit("change", { chainId });
                },

                async onDisconnect(_error) {
                    config.emitter.emit("disconnect");

                    const provider = await this.getProvider();
                    if (!provider) return;

                    if (accountsChanged) {
                        provider.removeListener(
                            "accountsChanged",
                            accountsChanged
                        );
                        accountsChanged = undefined;
                    }
                    if (chainChanged) {
                        provider.removeListener("chainChanged", chainChanged);
                        chainChanged = undefined;
                    }
                    if (disconnect) {
                        provider.removeListener("disconnect", disconnect);
                        disconnect = undefined;
                    }
                    walletProvider = undefined;
                },
            };
        }
    );
}

type PasskeyCreateConnectorFn = ReturnType<typeof ecdsaConnector>;
export type PasskeyConnector = Connector<PasskeyCreateConnectorFn>;
