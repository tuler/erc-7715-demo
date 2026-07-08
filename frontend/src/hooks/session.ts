"use client";

import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import { Account } from "@jaw.id/core";
import { useGrantPermissions, useRevokePermissions } from "@jaw.id/wagmi";
import { useEffect, useState } from "react";
import { type Hex, getAbiItem } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatAbiItem } from "viem/utils";
import { useChainId } from "wagmi";

const apiKey = process.env.NEXT_PUBLIC_JAW_API_KEY as string;

export type Session = {
    // id of the ERC-7715 permission granted by the connected account
    permissionId: Hex;
    // private key of the burner wallet that is the spender of the permission
    privateKey: Hex;
    // timestamp the permission is valid until (unix seconds)
    expiry: number;
};

const storageKey = "session";

export const useAddInputSession = () => {
    const chainId = useChainId();
    const { mutateAsync: grantPermissions } = useGrantPermissions();
    const { mutateAsync: revokePermissions } = useRevokePermissions();
    const [session, setSession] = useState<Session>();

    useEffect(() => {
        // initialize session from local storage
        const storedSession = window.localStorage.getItem(storageKey);
        if (storedSession) {
            setSession(JSON.parse(storedSession));
        }
    }, []);

    const createSession = async (expiry: number) => {
        // create a burner wallet for the session
        const privateKey = generatePrivateKey();

        // the spender of the permission is the smart account owned by the burner wallet
        const spender = await Account.fromLocalAccount(
            { apiKey, chainId },
            privateKeyToAccount(privateKey)
        );

        // grant permission to the burner smart account to call addInput on the InputBox
        const result = await grantPermissions({
            expiry,
            spender: spender.address,
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

        const session: Session = {
            permissionId: result.permissionId,
            privateKey,
            expiry: result.end,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(session));
        setSession(session);
    };

    const deleteSession = async () => {
        if (session) {
            await revokePermissions({ id: session.permissionId });
            window.localStorage.removeItem(storageKey);
            setSession(undefined);
        }
    };

    return {
        createSession,
        deleteSession,
        session,
        sessionId: session?.permissionId,
        expiry: session?.expiry,
    };
};
