"use client";

import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import { useEffect, useState } from "react";
import { getAbiItem } from "viem";
import { erc7715Actions } from "viem/experimental";
import { formatAbiItem } from "viem/utils";
import { useWalletClient } from "wagmi";

export const useAddInputSession = () => {
    const { data: walletClient } = useWalletClient();
    const [sessionId, setSessionId] = useState<string>();
    const [expiry, setExpiry] = useState<number | undefined>();

    useEffect(() => {
        // initialize session id from local storage
        const storedSessionId = window.localStorage.getItem("sessionId");
        if (storedSessionId) {
            setSessionId(storedSessionId);
        }
    }, []);

    const createSession = async (expiry: number) => {
        if (walletClient) {
            const sessionWalletClient = walletClient.extend(erc7715Actions());
            const result = await sessionWalletClient.grantPermissions({
                expiry,
                permissions: [
                    {
                        type: "contract-call",
                        data: {
                            address: inputBoxAddress,
                            calls: [
                                formatAbiItem(
                                    getAbiItem({
                                        abi: inputBoxAbi,
                                        name: "addInput",
                                    })
                                ),
                            ],
                        },
                        policies: [],
                    },
                ],
            });
            setSessionId(result.permissionsContext);
            window.localStorage.setItem("sessionId", result.permissionsContext);
            setExpiry(result.expiry);
        }
    };

    const deleteSession = () => {
        if (sessionId) {
            // TODO: actually revoke the session from the wallet
            // for now just removing from application local storage
            window.localStorage.removeItem("sessionId");
            setSessionId(undefined);
        }
    };

    return {
        createSession,
        deleteSession,
        sessionId,
        expiry,
    };
};
