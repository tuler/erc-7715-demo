import {
    deserializePermissionAccount,
    toPermissionValidator,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import type {
    KernelAccountClient,
    KernelSmartAccountImplementation,
} from "@zerodev/sdk";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";

// biome-ignore lint/style/useNodejsImportProtocol: needed for event emitter functionality
import { EventEmitter } from "events";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type {
    Chain,
    EIP1193Parameters,
    EIP1193RequestFn,
    Hash,
    SendCallsReturnType,
    SendTransactionParameters,
    Transport,
    WalletGetCallsStatusReturnType,
    WalletSendCallsParameters,
} from "viem";
import { hexToNumber, http, isHex, numberToHex, toHex } from "viem";
import {
    type EntryPointVersion,
    type SmartAccount,
    createPaymasterClient,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { GrantPermissionsParameters } from "viem/experimental";
import {
    type SessionType,
    getPolicies,
    validatePermissions,
} from "./permissions";
import { serializePermissionAccount } from "./serializePermissionAccount";

const PERMISSION_KEY = "zerodev.permissions";

const getStorageKey = <T>(key: string): T | undefined => {
    if (window.localStorage) {
        const value = window.localStorage.getItem(key);
        return value ? (JSON.parse(value) as T) : undefined;
    }
};

const setStorageKey = <T>(key: string, value: T) => {
    if (window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(value));
    }
};

export class KernelEIP1193Provider<
    entryPointVersion extends EntryPointVersion
> extends EventEmitter {
    private kernelClient: KernelAccountClient<
        Transport,
        Chain,
        SmartAccount<KernelSmartAccountImplementation<entryPointVersion>>
    >;

    constructor(
        kernelClient: KernelAccountClient<
            Transport,
            Chain,
            SmartAccount<KernelSmartAccountImplementation<entryPointVersion>>
        >
    ) {
        super();
        this.kernelClient = kernelClient;
    }

    getChainId() {
        return this.handleGetChainId();
    }

    async request({
        method,
        params = [],
    }: EIP1193Parameters): ReturnType<EIP1193RequestFn> {
        switch (method) {
            case "eth_chainId":
                return this.handleGetChainId();
            case "eth_requestAccounts":
                return this.handleEthRequestAccounts();
            case "eth_accounts":
                return this.handleEthAccounts();
            case "eth_sendTransaction":
                return this.handleEthSendTransaction(params);
            case "eth_sign":
                return this.handleEthSign(params as [string, string]);
            case "personal_sign":
                return this.handlePersonalSign(params as [string, string]);
            case "eth_signTypedData":
            case "eth_signTypedData_v4":
                return this.handleEthSignTypedDataV4(
                    params as [string, string]
                );
            case "wallet_getCapabilities":
                console.log("wallet_getCapabilities", params);
                return this.handleWalletCapabilities(
                    params as [string, string[]]
                );
            case "wallet_sendCalls":
                return this.handleWalletSendCalls(
                    params as WalletSendCallsParameters
                );
            case "wallet_getCallsStatus":
                return this.handleWalletGetCallStatus(params as [string]);
            case "wallet_grantPermissions":
                console.log("wallet_grantPermissions", params);
                return this.handleWalletGrantPermissions(
                    params as [GrantPermissionsParameters]
                );
            case "wallet_switchEthereumChain":
                return this.handleSwitchEthereumChain();
            default:
                return this.kernelClient.transport.request({ method, params });
        }
    }

    private handleGetChainId() {
        return this.kernelClient.chain.id;
    }

    private async handleEthRequestAccounts(): Promise<string[]> {
        if (!this.kernelClient.account) {
            return [];
        }
        return [this.kernelClient.account.address];
    }

    private async handleEthAccounts(): Promise<string[]> {
        if (!this.kernelClient.account) {
            return [];
        }
        return [this.kernelClient.account.address];
    }

    private async handleEthSendTransaction(params: unknown): Promise<Hash> {
        const [tx] = params as [SendTransactionParameters];
        return this.kernelClient.sendTransaction(tx);
    }

    private async handleEthSign(params: [string, string]): Promise<string> {
        if (!this.kernelClient?.account) {
            throw new Error("account not connected!");
        }
        const [address, message] = params;
        if (
            address.toLowerCase() !==
            this.kernelClient.account.address.toLowerCase()
        ) {
            throw new Error(
                "cannot sign for address that is not the current account"
            );
        }

        return this.kernelClient.signMessage({
            message,
            account: this.kernelClient.account,
        });
    }

    private async handlePersonalSign(
        params: [string, string]
    ): Promise<string> {
        if (!this.kernelClient?.account) {
            throw new Error("account not connected!");
        }
        const [message, address] = params;
        if (
            address.toLowerCase() !==
            this.kernelClient.account.address.toLowerCase()
        ) {
            throw new Error(
                "cannot sign for address that is not the current account"
            );
        }

        return this.kernelClient.signMessage({
            message,
            account: this.kernelClient.account,
        });
    }

    private async handleEthSignTypedDataV4(
        params: [string, string]
    ): Promise<string> {
        if (!this.kernelClient?.account) {
            throw new Error("account not connected!");
        }
        const [address, typedDataJSON] = params;
        const typedData = JSON.parse(typedDataJSON);
        if (
            address.toLowerCase() !==
            this.kernelClient.account.address.toLowerCase()
        ) {
            throw new Error(
                "cannot sign for address that is not the current account"
            );
        }

        return this.kernelClient.signTypedData({
            account: this.kernelClient.account,
            domain: typedData.domain,
            types: typedData.types,
            message: typedData.message,
            primaryType: typedData.primaryType,
        });
    }

    private async handleSwitchEthereumChain() {
        throw new Error("Not implemented.");
    }

    private async handleWalletSendCalls(
        params: WalletSendCallsParameters
    ): Promise<SendCallsReturnType> {
        const accountAddress = this.kernelClient.account.address;
        const accountChainId = this.kernelClient.chain.id;

        // TODO: check version 2.0.0 or 1.0
        const { calls, capabilities, chainId, from } = params[0];
        if (from && from !== accountAddress) {
            throw new Error("invalid account address");
        }
        if (chainId && hexToNumber(chainId) !== accountChainId) {
            throw new Error("invalid chain id");
        }
        if (
            this.kernelClient.account.entryPoint.version !== "0.7" &&
            capabilities?.permissions
        ) {
            throw new Error("Permissions not supported with kernel v2");
        }

        let kernelAccountClient: KernelAccountClient<
            Transport,
            Chain,
            SmartAccount<KernelSmartAccountImplementation<entryPointVersion>>
        >;

        // paymaster service
        const paymaster =
            capabilities?.paymasterService?.[
                numberToHex(this.kernelClient.chain.id)
            ] || capabilities?.paymasterService;
        const paymasterService = paymaster
            ? createPaymasterClient({ transport: http(paymaster.url) })
            : undefined;

        // get stored permissions
        const permission = getStorageKey<SessionType>(PERMISSION_KEY) || {};

        // is a session id provided?
        const sessionId = capabilities?.permissions?.sessionId;

        // search for the session in the stored permissions
        const session = permission[accountAddress]?.[
            toHex(accountChainId)
        ]?.find((session) => session.sessionId === sessionId);

        if (session && this.kernelClient?.account?.client) {
            const sessionSigner = await toECDSASigner({
                signer: privateKeyToAccount(session.signerPrivateKey),
            });
            const sessionKeyAccount = await deserializePermissionAccount(
                this.kernelClient.account.client,
                this.kernelClient.account.entryPoint,
                this.kernelClient.account.kernelVersion,
                session.approval,
                sessionSigner
            );

            const kernelClient = createKernelAccountClient({
                account: sessionKeyAccount,
                chain: this.kernelClient.chain,
                userOperation: {
                    estimateFeesPerGas: async () => {
                        const pimlicoClient = createPimlicoClient({
                            transport: http(this.kernelClient.transport.url),
                        });
                        const gas =
                            await pimlicoClient.getUserOperationGasPrice();
                        return gas.standard;
                    },
                },
                bundlerTransport: http(this.kernelClient.transport.url),
                paymaster: paymasterService,
            });

            kernelAccountClient = kernelClient;
        } else {
            /*
            kernelAccountClient = createKernelAccountClient({
                account: this.kernelClient.account,
                chain: this.kernelClient.chain,
                bundlerTransport: http(this.kernelClient.transport.url),
                // userOperation: this.kernelClient.userOperation,
                paymaster: paymasterService,
            });
            */
            kernelAccountClient = this.kernelClient;
        }

        const id = await kernelAccountClient.sendUserOperation({
            calls: calls.map((call) => ({
                to: call.to ?? kernelAccountClient.account.address,
                value: call.value ? BigInt(call.value) : 0n,
                data: call.data ?? "0x",
            })),
        });

        return {
            id,
            // capabilities // TODO: add capabilities used
        };
    }

    private async handleWalletCapabilities(params: [string, string[]]) {
        const [_accountAddress, chainIds] = params;
        const capabilities = {
            atomic: {
                status: "supported",
            },
            paymasterService: {
                supported: true,
            },
            permissions: {
                supported: true,
                permissionTypes: [
                    "sudo",
                    "contract-call",
                    "rate-limit",
                    "gas-limit",
                    "signature",
                ],
            },
        };
        type Capabilities = typeof capabilities;
        return chainIds.reduce<Record<string, Capabilities>>((obj, chainId) => {
            obj[chainId] = capabilities;
            return obj;
        }, {});
    }

    private async handleWalletGetCallStatus(
        params: [string]
    ): Promise<WalletGetCallsStatusReturnType> {
        const hash = params[0];

        if (!isHex(hash)) {
            throw new Error(
                "Invalid params for wallet_getCallStatus: not a hex string"
            );
        }
        const result = await this.kernelClient.getUserOperationReceipt({
            hash,
        });
        if (!result.success) {
            return {
                version: "2.0.0",
                id: hash,
                atomic: true,
                chainId: toHex(this.kernelClient.chain.id),
                status: 100, // TODO: handle the error case
                // capabilities: // TODO: what is this?
                receipts: [
                    {
                        blockHash: result.receipt.blockHash,
                        blockNumber: toHex(result.receipt.blockNumber),
                        gasUsed: toHex(result.receipt.gasUsed),
                        status: "0x0",
                        transactionHash: result.receipt.transactionHash,
                        logs: result.receipt.logs,
                    },
                ],
            };
        }
        return {
            version: "2.0.0",
            id: hash,
            atomic: true,
            chainId: toHex(this.kernelClient.chain.id),
            // capabilities: // TODO: what is this?
            status: 200,
            receipts: [
                {
                    blockHash: result.receipt.blockHash,
                    blockNumber: toHex(result.receipt.blockNumber),
                    gasUsed: toHex(result.receipt.gasUsed),
                    status: "0x1",
                    transactionHash: result.receipt.transactionHash,
                    logs: result.receipt.logs,
                },
            ],
        };
    }

    private async handleWalletGrantPermissions(
        params: [GrantPermissionsParameters]
    ) {
        if (this.kernelClient.account.entryPoint.version !== "0.7") {
            throw new Error("Permissions not supported with kernel v2");
        }
        const requestedPermissions = [
            "sudo",
            "contract-call",
            "rate-limit",
            "gas-limit",
            "signature",
        ];

        validatePermissions(params[0], requestedPermissions);
        const policies = getPolicies(params[0]);
        const permissions = params[0].permissions;

        // signer
        const sessionPrivateKey = generatePrivateKey();
        const sessionKeySigner = await toECDSASigner({
            signer: privateKeyToAccount(sessionPrivateKey),
        });

        const client = this.kernelClient.account.client;

        const permissionValidator = await toPermissionValidator(client, {
            entryPoint: this.kernelClient.account.entryPoint,
            kernelVersion: this.kernelClient.account.kernelVersion,
            signer: sessionKeySigner,
            policies: policies,
        });

        const sudoValidator =
            this.kernelClient.account.kernelPluginManager.sudoValidator;
        const sessionKeyAccount = await createKernelAccount(client, {
            entryPoint: this.kernelClient.account.entryPoint,
            kernelVersion: this.kernelClient.account.kernelVersion,
            plugins: {
                sudo: sudoValidator,
                regular: permissionValidator,
            },
        });
        const enabledSignature =
            await sessionKeyAccount.kernelPluginManager.getPluginEnableSignature(
                sessionKeyAccount.address
            );
        const sessionKeyAccountWithSig = await createKernelAccount(client, {
            entryPoint: this.kernelClient.account.entryPoint,
            kernelVersion: this.kernelClient.account.kernelVersion,
            plugins: {
                sudo: sudoValidator,
                regular: permissionValidator,
                pluginEnableSignature: enabledSignature,
            },
        });

        const createdPermissions =
            getStorageKey<SessionType>(PERMISSION_KEY) || {};
        const serializedSessionKey = await serializePermissionAccount(
            sessionKeyAccountWithSig
        );
        const newPermission = {
            sessionId: permissionValidator.getIdentifier(),
            entryPoint: this.kernelClient.account.entryPoint.version,
            signerPrivateKey: sessionPrivateKey,
            approval: serializedSessionKey,
        };

        const address = this.kernelClient.account.address;
        const chainId = toHex(this.kernelClient.chain.id);

        const mergedPermissions: SessionType = { ...createdPermissions };

        if (!mergedPermissions[address]) {
            mergedPermissions[address] = {};
        }

        if (!mergedPermissions[address][chainId]) {
            mergedPermissions[address][chainId] = [];
        }

        mergedPermissions[address][chainId].push(newPermission);
        setStorageKey(PERMISSION_KEY, mergedPermissions);
        return {
            grantedPermissions: permissions.map((permission) => ({
                type: permission.type,
                data: permission.data,
                policies: permission.policies,
            })),
            expiry: params[0].expiry,
            permissionsContext: permissionValidator.getIdentifier(),
        };
    }
}
