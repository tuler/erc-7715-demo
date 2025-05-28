import type { Policy } from "@zerodev/permissions";
import {
    CallPolicyVersion,
    type SignatureCallerPolicyParams,
    toCallPolicy,
    toGasPolicy,
    toRateLimitPolicy,
    toSignatureCallerPolicy,
    toSudoPolicy,
    toTimestampPolicy,
} from "@zerodev/permissions/policies";
import { type Address, type Hex, toFunctionSelector, toHex } from "viem";
import type { EntryPointVersion } from "viem/account-abstraction";
import type { GrantPermissionsParameters } from "viem/experimental";

export type SessionType = {
    [address: Address]: {
        [chainId: Hex]: {
            sessionId: Hex;
            entryPoint: EntryPointVersion;
            signerPrivateKey: Hex;
            approval: string;
        }[];
    };
};

export type Permission = GrantPermissionsParameters["permissions"][number];

export const validatePermissions = (
    permissionsParams: GrantPermissionsParameters,
    supportedPolicies: string[],
) => {
    // check expiry
    if (permissionsParams.expiry < Math.floor(Date.now() / 1000)) {
        throw new Error(
            `Invalid expiry ${permissionsParams.expiry} for permissions`,
        );
    }

    // check policies are supported
    for (const permission of permissionsParams.permissions) {
        const type =
            typeof permission.type === "string"
                ? permission.type
                : permission.type.custom;
        if (!supportedPolicies.includes(type)) {
            throw new Error(`Unsupported policy ${permission.type}`);
        }
    }
};

export const getPermissionPoliciy = (permission: Permission): Policy[] => {
    const policies: Policy[] = [];
    if (typeof permission.type === "string") {
        switch (permission.type) {
            case "contract-call":
                policies.push(
                    toCallPolicy({
                        permissions: permission.data.calls.map((call) => ({
                            target: permission.data.address,
                            selector: toFunctionSelector(call),
                        })),
                        policyVersion: CallPolicyVersion.V0_0_4,
                    }),
                );
                break;
        }
    } else {
        switch (permission.type.custom) {
            case "sudo":
                policies.push(toSudoPolicy({}));
                break;
            case "signature":
                policies.push(
                    toSignatureCallerPolicy(
                        permission.data as SignatureCallerPolicyParams,
                    ),
                );
                break;
        }
    }
    for (const policy of permission.policies) {
        switch (policy.type) {
            case "gas-limit":
                policies.push(
                    toGasPolicy({
                        allowed: policy.data.limit,
                    }),
                );
                break;
            case "rate-limit":
                policies.push(toRateLimitPolicy(policy.data));
                break;
            case "token-allowance":
                // TODO: implement
                break;
            default:
                break;
        }
    }
    return policies;
};

export const getPolicies = (
    permissionsParams: GrantPermissionsParameters,
): Policy[] => {
    const policies = permissionsParams.permissions
        .flatMap((permission) => getPermissionPoliciy(permission))
        .concat([
            toTimestampPolicy({
                validAfter: Math.floor(new Date().valueOf() / 1000),
                validUntil: permissionsParams.expiry,
            }),
        ]);
    return policies;
};

export const isSessionValid = (
    sessionId: `0x${string}` | undefined,
    permission: SessionType | undefined,
    address: Address,
    chainId: number,
): boolean => {
    if (!sessionId || !permission) return false;

    const selectedPermission = permission[address]?.[toHex(chainId)];
    if (!selectedPermission) return false;

    return !!selectedPermission.find((p) => p.sessionId === sessionId);
};
