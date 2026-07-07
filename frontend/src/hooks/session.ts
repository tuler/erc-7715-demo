"use client";

import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import { useGrantPermissions, useRevokePermissions } from "@jaw.id/wagmi";
import { useEffect, useState } from "react";
import { getAbiItem } from "viem";
import { formatAbiItem } from "viem/utils";
import { useConnection } from "wagmi";

export const useAddInputSession = () => {
    const { address } = useConnection();
    const { mutateAsync: grantPermissions } = useGrantPermissions();
    const { mutateAsync: revokePermissions } = useRevokePermissions();
    const [sessionId, setSessionId] = useState<`0x${string}`>();
    const [expiry, setExpiry] = useState<number | undefined>();

    useEffect(() => {
        // initialize session id from local storage
        const storedSessionId = window.localStorage.getItem("sessionId");
        if (storedSessionId) {
            setSessionId(storedSessionId as `0x${string}`);
        }
    }, []);

    const createSession = async (expiry: number) => {
        if (address) {
            const result = await grantPermissions({
                expiry,
                // the connected account itself uses the permission,
                // sending calls with the permissions capability
                spender: address,
                permissions: {
                    calls: [
                        {
                            target: inputBoxAddress,
                            functionSignature: formatAbiItem(
                                getAbiItem({
                                    abi: inputBoxAbi,
                                    name: "addInput",
                                })
                            ),
                        },
                    ],
                },
            });
            setSessionId(result.permissionId);
            window.localStorage.setItem("sessionId", result.permissionId);
            setExpiry(result.end);
        }
    };

    const deleteSession = async () => {
        if (sessionId) {
            await revokePermissions({ id: sessionId });
            window.localStorage.removeItem("sessionId");
            setSessionId(undefined);
            setExpiry(undefined);
        }
    };

    return {
        createSession,
        deleteSession,
        sessionId,
        expiry,
    };
};
