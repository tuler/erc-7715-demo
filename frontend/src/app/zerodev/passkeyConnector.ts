import {
    ChainNotConfiguredError,
    type Connector,
    ProviderNotFoundError,
    createConnector,
} from "@wagmi/core";
import {
    PasskeyValidatorContractVersion,
    WebAuthnMode,
    deserializePasskeyValidator,
    toPasskeyValidator,
    toWebAuthnKey,
} from "@zerodev/passkey-validator";
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
    createPublicClient,
    getAddress,
    numberToHex,
} from "viem";
import { createPaymasterClient } from "viem/account-abstraction";
import { http } from "wagmi";
import { KernelEIP1193Provider } from "./KernelEIP1193Provider";

type ConnectorParameters = {
    chain: Chain;
    name: string;
    rpcUrl: string;
    bundlerUrl: string;
    paymasterUrl?: string;
    passkeyServerUrl: string;
};

// connector types
type Provider = KernelEIP1193Provider<"0.7"> | undefined;
type Properties = {
    login: (params?: { passkeyName?: string }) => Promise<void>;
    register: (params?: { passkeyName?: string }) => Promise<void>;
};
type StorageItem = {
    passkeyValidator: string;
};

export const passkeyConnectorId = "zerodevPasskeySDK";

passkeyConnector.type = "passkeyConnector" as const;
export function passkeyConnector(params: ConnectorParameters) {
    const { bundlerUrl, chain, name, passkeyServerUrl, paymasterUrl, rpcUrl } =
        params;
    let walletProvider: KernelEIP1193Provider<"0.7"> | undefined;
    let accountsChanged: Connector["onAccountsChanged"] | undefined;
    let chainChanged: Connector["onChainChanged"] | undefined;
    let disconnect: Connector["onDisconnect"] | undefined;
    let connectType: WebAuthnMode = WebAuthnMode.Register;
    let passkeyName: string = name;

    const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
    const entryPoint = getEntryPoint("0.7");
    const kernelVersion = KERNEL_V3_2;

    const createProvider = async (sudo: KernelValidator) => {
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
        return new KernelEIP1193Provider(kernelClient);
    };

    return createConnector<Provider, Properties, StorageItem>((config) => {
        return {
            id: passkeyConnectorId,
            name: "ZeroDev Passkey",
            type: passkeyConnector.type,

            async register(params) {
                passkeyName = params?.passkeyName ?? name;
                connectType = WebAuthnMode.Register;
            },

            async login(params) {
                passkeyName = params?.passkeyName ?? name;
                connectType = WebAuthnMode.Login;
            },

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
                        return { accounts, chainId: chain.id };
                    }

                    const webAuthnKey = await toWebAuthnKey({
                        passkeyName: passkeyName ?? name,
                        passkeyServerUrl,
                        mode: connectType,
                        passkeyServerHeaders: {},
                    });

                    const validator = await toPasskeyValidator(publicClient, {
                        entryPoint,
                        kernelVersion,
                        validatorContractVersion:
                            PasskeyValidatorContractVersion.V0_0_2,
                        webAuthnKey,
                    });

                    // store passkeyValidator, for future use on page reload
                    const serializedData = validator.getSerializedData();
                    config.storage?.setItem("passkeyValidator", serializedData);

                    walletProvider = await createProvider(validator);

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

                // remove passkeyValidator from storage
                config.storage?.removeItem("passkeyValidator");
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
                    // load from storage if available
                    const serializedData = await config.storage?.getItem(
                        "passkeyValidator"
                    );
                    if (serializedData) {
                        // create passkeyValidator from stored serialized data
                        const validator = await deserializePasskeyValidator(
                            publicClient,
                            {
                                entryPoint,
                                kernelVersion,
                                serializedData,
                            }
                        );

                        const provider = await createProvider(validator);

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
                    throw new SwitchChainError(new ChainNotConfiguredError());

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
                            if (addEthereumChainParameter?.blockExplorerUrls)
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
                                iconUrls: addEthereumChainParameter?.iconUrls,
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
                            throw new UserRejectedRequestError(error as Error);
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
                    provider.removeListener("accountsChanged", accountsChanged);
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

                // remove passkeyValidator from storage
                config.storage?.removeItem("passkeyValidator");
            },
        };
    });
}

type PasskeyCreateConnectorFn = ReturnType<typeof passkeyConnector>;
export type PasskeyConnector = Connector<PasskeyCreateConnectorFn>;
