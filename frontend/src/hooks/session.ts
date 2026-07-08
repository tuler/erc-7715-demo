"use client";

import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import { Account } from "@jaw.id/core";
import { useGrantPermissions, useRevokePermissions } from "@jaw.id/wagmi";
import { useEffect, useState } from "react";
import { getAbiItem } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatAbiItem } from "viem/utils";
import {
    useChainId,
    useConnect,
    useConnection,
    useConnections,
    useConnectors,
    useDisconnect,
    useSwitchConnection,
} from "wagmi";
import {
    type Session,
    clearSession,
    loadSession,
    saveSession,
    sessionConnector,
} from "@/connectors/session";

const apiKey = process.env.NEXT_PUBLIC_JAW_API_KEY as string;

export type { Session };

export const useAddInputSession = () => {
    const chainId = useChainId();
    const { mutateAsync: grantPermissions } = useGrantPermissions();
    const { mutateAsync: revokePermissions } = useRevokePermissions();
    const [session, setSession] = useState<Session>();

    // connector that plays through the session burner wallet
    const connectors = useConnectors();
    const connector = connectors.find((c) => c.type === sessionConnector.type);
    const connections = useConnections();
    const isConnected = connections.some(
        (c) => c.connector.id === connector?.id
    );
    const { connector: currentConnector } = useConnection();
    const { mutateAsync: connect } = useConnect();
    const { mutateAsync: disconnect } = useDisconnect();
    const { mutate: switchConnection } = useSwitchConnection();

    useEffect(() => {
        // initialize session from local storage
        setSession(loadSession());
    }, []);

    // keep the session connector connected while there is a session,
    // without making it the current connection
    useEffect(() => {
        if (session && connector && !isConnected) {
            connect({ connector })
                .then(() => {
                    if (currentConnector) {
                        switchConnection({ connector: currentConnector });
                    }
                })
                .catch(() => {});
        }
    }, [
        session,
        connector,
        isConnected,
        connect,
        currentConnector,
        switchConnection,
    ]);

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
        saveSession(session);
        setSession(session); // the effect above connects the session connector
    };

    const deleteSession = async () => {
        if (session) {
            // revoke the permission, through the connected user wallet
            await revokePermissions({ id: session.permissionId });

            // disconnect the session connector
            if (connector && isConnected) {
                await disconnect({ connector });
            }
            clearSession();
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
