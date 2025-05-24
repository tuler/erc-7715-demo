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
import type {
    Chain,
    Client,
    EIP1193Parameters,
    EIP1193RequestFn,
    GetCallsStatusParameters,
    GetCallsStatusReturnType,
    Hash,
    PublicActions,
    PublicRpcSchema,
    SendCallsReturnType,
    SendTransactionParameters,
    Transport,
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
import { KernelLocalStorage } from "./storage";

const WALLET_CAPABILITIES_STORAGE_KEY = "WALLET_CAPABILITIES";
const WALLET_PERMISSION_STORAGE_KEY = "WALLET_PERMISSION";

export type PaymasterServiceCapability = {
    url: string;
};

export class KernelEIP1193Provider<
    entryPointVersion extends EntryPointVersion
> extends EventEmitter {
    private readonly storage = new KernelLocalStorage("ZDWALLET");
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
        if (
            typeof kernelClient.account !== "object" ||
            typeof kernelClient.chain !== "object"
        ) {
            throw new Error("invalid kernel client");
        }
        this.kernelClient = kernelClient;
        const permissions =
            kernelClient.account.entryPoint.version === "0.7"
                ? {
                      supported: true,
                      permissionTypes: [
                          "sudo",
                          "contract-call",
                          "rate-limit",
                          "gas-limit",
                          "signature",
                      ],
                  }
                : {
                      supported: false,
                  };

        const capabilities = {
            [kernelClient.account.address]: {
                [toHex(kernelClient.chain.id)]: {
                    atomic: {
                        status: "supported",
                    },
                    paymasterService: {
                        supported: true,
                    },
                    permissions,
                },
            },
        };
        this.storeItemToStorage(WALLET_CAPABILITIES_STORAGE_KEY, capabilities);
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
                return this.handleWalletCapabilities();
            case "wallet_sendCalls":
                return this.handleWalletSendCalls(
                    params as WalletSendCallsParameters
                );
            case "wallet_getCallsStatus":
                return this.handleWalletGetCallStatus(
                    params as [GetCallsStatusParameters]
                );
            case "wallet_grantPermissions":
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
        const permission = this.getItemFromStorage(
            WALLET_PERMISSION_STORAGE_KEY
        ) as SessionType;

        // paymaster service
        const paymaster =
            capabilities?.paymasterService?.[
                numberToHex(this.kernelClient.chain.id)
            ];
        const paymasterService = paymaster
            ? createPaymasterClient({ transport: http(paymaster.url) })
            : undefined;

        const sessionId = capabilities?.permissions?.sessionId;
        const session = permission?.[accountAddress]?.[
            toHex(accountChainId)
        ]?.find((session) => session.sessionId === sessionId);
        if (session && this.kernelClient?.account?.client) {
            const sessionSigner = await toECDSASigner({
                signer: privateKeyToAccount(session.signerPrivateKey),
            });
            const sessionKeyAccount = (await deserializePermissionAccount(
                this.kernelClient.account.client as Client<
                    Transport,
                    Chain,
                    undefined,
                    PublicRpcSchema,
                    PublicActions
                >,
                this.kernelClient.account.entryPoint,
                this.kernelClient.account.kernelVersion,
                session.approval,
                sessionSigner
            )) as unknown as SmartAccount<
                KernelSmartAccountImplementation<entryPointVersion>
            >;

            const kernelClient = createKernelAccountClient({
                account: sessionKeyAccount,
                chain: this.kernelClient.chain,
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

        const callData = await kernelAccountClient.account.encodeCalls(
            calls.map((call) => ({
                // TODO: what about capabilities?
                to: call.to ?? kernelAccountClient.account.address,
                value: call.value ? BigInt(call.value) : 0n,
                data: call.data ?? "0x",
            }))
        );

        const account: SmartAccount = this.kernelClient.account;
        const id = await kernelAccountClient.sendUserOperation({
            account,
            callData,
            sender: this.kernelClient.account.address,
        });

        return {
            id,
            // capabilities // TODO: add capabilities used
        };
    }

    private handleWalletCapabilities() {
        const capabilities = this.getItemFromStorage(
            WALLET_CAPABILITIES_STORAGE_KEY
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        ) as Record<string, any> | undefined;

        return capabilities
            ? capabilities[this.kernelClient.account.address]
            : {};
    }

    private async handleWalletGetCallStatus(
        params: [GetCallsStatusParameters]
    ): Promise<GetCallsStatusReturnType> {
        const userOpHash = params[0].id;

        if (!isHex(userOpHash)) {
            throw new Error(
                "Invalid params for wallet_getCallStatus: not a hex string"
            );
        }
        const result = await this.kernelClient.getUserOperationReceipt({
            hash: userOpHash,
        });
        if (!result?.success) {
            return {
                id: userOpHash,
                atomic: false, // TODO: what is this?
                chainId: this.kernelClient.chain.id,
                status: "pending", // TODO: handle the error case
                statusCode: 200,
                version: this.kernelClient.account.entryPoint.version,
                // capabilities: // TODO: what is this?
                receipts: [result.receipt],
            };
        }
        return {
            atomic: false, // TODO: what is this?
            chainId: this.kernelClient.chain.id,
            id: userOpHash,
            statusCode: 200,
            version: this.kernelClient.account.entryPoint.version,
            // capabilities: // TODO: what is this?
            status: "success",
            receipts: [result.receipt],
        };
    }

    private async handleWalletGrantPermissions(
        params: [GrantPermissionsParameters]
    ) {
        if (this.kernelClient.account.entryPoint.version !== "0.7") {
            throw new Error("Permissions not supported with kernel v2");
        }
        const capabilities =
            this.handleWalletCapabilities()[toHex(this.kernelClient.chain.id)]
                .permissions.permissionTypes;

        validatePermissions(params[0], capabilities);
        const policies = getPolicies(params[0]);
        const permissions = params[0].permissions;

        // signer
        const sessionPrivateKey = generatePrivateKey();
        const sessionKeySigner = await toECDSASigner({
            signer: privateKeyToAccount(sessionPrivateKey),
        });

        const client = this.kernelClient.account.client as Client<
            Transport,
            Chain | undefined,
            undefined,
            PublicRpcSchema,
            PublicActions
        >;

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
            this.getItemFromStorage(WALLET_PERMISSION_STORAGE_KEY) || {};
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
        this.storeItemToStorage(
            WALLET_PERMISSION_STORAGE_KEY,
            mergedPermissions
        );
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

    private getItemFromStorage<T>(key: string): T | undefined {
        const item = this.storage.getItem(key);
        return item ? JSON.parse(item) : undefined;
    }

    private storeItemToStorage<T>(key: string, item: T) {
        this.storage.setItem(key, JSON.stringify(item));
    }
}
