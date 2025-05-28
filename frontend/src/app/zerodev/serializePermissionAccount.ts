import type { KernelSmartAccountImplementation } from "@zerodev/sdk";
import type { Hex, SignAuthorizationReturnType } from "viem";
import type { EntryPointVersion, SmartAccount } from "viem/account-abstraction";
import {
    isPermissionValidatorPlugin,
    serializePermissionAccountParams,
} from "./utils";

export const serializePermissionAccount = async <
    entryPointVersion extends EntryPointVersion
>(
    account: SmartAccount<KernelSmartAccountImplementation<entryPointVersion>>,
    privateKey?: Hex,
    enableSignature?: Hex,
    eip7702Auth?: SignAuthorizationReturnType
): Promise<string> => {
    if (!isPermissionValidatorPlugin(account.kernelPluginManager))
        throw new Error("Account plugin is not a permission validator");
    const permissionParams =
        account.kernelPluginManager.getPluginSerializationParams();
    const action = account.kernelPluginManager.getAction();
    const validityData = account.kernelPluginManager.getValidityData();
    const _enableSignature =
        enableSignature ??
        (await account.kernelPluginManager.getPluginEnableSignature(
            account.address
        ));
    const _eip7702Auth = account.authorization
        ? eip7702Auth ?? (await account?.eip7702Authorization?.())
        : undefined;
    const accountParams = {
        initCode: await account.generateInitCode(),
        accountAddress: account.address,
    };

    const paramsToBeSerialized = {
        permissionParams,
        action,
        validityData,
        accountParams,
        enableSignature: _enableSignature,
        privateKey,
        eip7702Auth: _eip7702Auth,
    };

    return serializePermissionAccountParams(paramsToBeSerialized);
};
