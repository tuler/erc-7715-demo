import { Account } from "@jaw.id/core";
import { type EIP1193Parameters, type Hex, numberToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConnector } from "wagmi";

export type Session = {
    // id of the ERC-7715 permission granted by the connected account
    permissionId: Hex;
    // private key of the burner wallet that owns the spender smart account
    privateKey: Hex;
    // timestamp the permission is valid until (unix seconds)
    expiry: number;
};

const storageKey = "session";

export const loadSession = (): Session | undefined => {
    if (typeof window === "undefined") {
        return undefined;
    }
    const value = window.localStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as Session) : undefined;
};

export const saveSession = (session: Session) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
};

export const clearSession = () => {
    window.localStorage.removeItem(storageKey);
};

export type SessionConnectorParameters = {
    apiKey: string;
    paymasterUrl?: string;
};

sessionConnector.type = "session" as const;

/**
 * Connector backed by the session burner wallet stored in the browser local
 * storage. Calls are executed by the smart account owned by the burner wallet,
 * through the permission manager, spending the ERC-7715 permission granted by
 * the user. No user interaction is required.
 */
export function sessionConnector(parameters: SessionConnectorParameters) {
    const { apiKey, paymasterUrl } = parameters;

    type Provider = {
        request(args: EIP1193Parameters): Promise<unknown>;
    };

    return createConnector<Provider>((config) => {
        // single chain application
        const chainId = config.chains[0].id;

        // load the smart account owned by the session burner wallet
        // the paymaster sponsors gas, as the account has no funds
        const getAccount = async () => {
            const session = loadSession();
            if (!session) {
                throw new Error("No session available");
            }
            return Account.fromLocalAccount(
                { apiKey, chainId, paymasterUrl },
                privateKeyToAccount(session.privateKey)
            );
        };

        const provider: Provider = {
            async request({ method, params }) {
                switch (method) {
                    case "eth_chainId": {
                        return numberToHex(chainId);
                    }
                    case "eth_accounts": {
                        const account = await getAccount();
                        return [account.address];
                    }
                    case "wallet_sendCalls": {
                        const session = loadSession();
                        if (!session) {
                            throw new Error("No session available");
                        }
                        const [{ calls }] = params as [
                            {
                                calls: {
                                    to: `0x${string}`;
                                    data?: Hex;
                                    value?: Hex;
                                }[];
                            }
                        ];
                        const account = await getAccount();
                        // execute the calls through the permission manager
                        const { id } = await account.sendCalls(
                            calls.map((call) => ({
                                to: call.to,
                                data: call.data,
                                value: call.value,
                            })),
                            { permissionId: session.permissionId }
                        );
                        return { id };
                    }
                    case "wallet_getCallsStatus": {
                        const [id] = params as [Hex];
                        const account = await getAccount();
                        const status = await account.getCallStatus(id);
                        // report pending (100) while the status is unknown
                        return (
                            status ?? {
                                version: "2.0.0",
                                id,
                                chainId: numberToHex(chainId),
                                atomic: true,
                                status: 100,
                            }
                        );
                    }
                    default: {
                        throw new Error(`Method not supported: ${method}`);
                    }
                }
            },
        };

        return {
            id: "session",
            name: "Session",
            type: sessionConnector.type,
            async connect(parameters) {
                const account = await getAccount();
                const accounts = [account.address] as const;
                return {
                    accounts: (parameters?.withCapabilities
                        ? accounts.map((address) => ({
                              address,
                              capabilities: {},
                          }))
                        : accounts) as never,
                    chainId,
                };
            },
            async disconnect() {},
            async getAccounts() {
                const account = await getAccount();
                return [account.address];
            },
            async getChainId() {
                return chainId;
            },
            async getProvider() {
                return provider;
            },
            async isAuthorized() {
                return loadSession() !== undefined;
            },
            onAccountsChanged() {},
            onChainChanged() {},
            onDisconnect() {},
        };
    });
}
