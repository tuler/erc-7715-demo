"use client";

import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import { useState } from "react";
import { getAbiItem, stringToHex, zeroAddress } from "viem";
import { erc7715Actions } from "viem/experimental";
import { formatAbiItem } from "viem/utils";
import {
    useAccount,
    useCapabilities,
    useConnect,
    useDisconnect,
    useSendCalls,
    useWalletClient,
} from "wagmi";

const application = zeroAddress;

const useAddInputSession = () => {
    const { data: walletClient } = useWalletClient();
    const [sessionId, setSessionId] = useState<string | undefined>();
    const [sessionExpiry, setSessionExpiry] = useState<number | undefined>();

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
            setSessionExpiry(expiry);
        }
    };

    return {
        createSession,
        sessionId,
        sessionExpiry,
    };
};

function App() {
    const account = useAccount();
    const { connectors, connect, status, error } = useConnect();
    const { disconnect } = useDisconnect();

    const { data: capabilities } = useCapabilities();
    const [input, setInput] = useState("");
    const { sendCallsAsync } = useSendCalls();

    const { createSession, sessionId, sessionExpiry } = useAddInputSession();

    return (
        <>
            <div>
                <h2>Account</h2>

                <div>
                    status: {account.status}
                    <br />
                    addresses: {JSON.stringify(account.addresses)}
                    <br />
                    chainId: {account.chainId}
                </div>

                {account.status === "connected" && (
                    <button type="button" onClick={() => disconnect()}>
                        Disconnect
                    </button>
                )}
            </div>

            <div>
                <h2>Connect</h2>
                {connectors.map((connector) => (
                    <button
                        key={connector.uid}
                        onClick={() => connect({ connector })}
                        type="button"
                    >
                        {connector.name}
                    </button>
                ))}
                <div>{status}</div>
                <div>{error?.message}</div>
            </div>

            <div>
                <h2>Transaction</h2>
                <div>
                    <label htmlFor="capabilities">Capabilities</label>
                </div>
                <div>
                    <textarea
                        value={JSON.stringify(capabilities, null, 2)}
                        rows={24}
                    />
                </div>
                <div>
                    <label htmlFor="input">Input</label>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                </div>
                <button
                    type="button"
                    onClick={() =>
                        sendCallsAsync({
                            calls: [
                                {
                                    to: inputBoxAddress,
                                    abi: inputBoxAbi,
                                    functionName: "addInput",
                                    args: [application, stringToHex(input)],
                                },
                            ],
                        })
                    }
                >
                    SendCall
                </button>
            </div>
            <div>
                <h2>Session</h2>
                <div>
                    <label htmlFor="sessionId">Session ID</label>: {sessionId}
                </div>
                <div>
                    <button
                        type="button"
                        onClick={() =>
                            createSession(Date.now() + 1000 * 60 * 60)
                        }
                    >
                        Create Input Session
                    </button>
                </div>
                <div>
                    <button
                        type="button"
                        onClick={() =>
                            sendCallsAsync({
                                calls: [
                                    {
                                        to: inputBoxAddress,
                                        abi: inputBoxAbi,
                                        functionName: "addInput",
                                        args: [application, stringToHex(input)],
                                    },
                                ],
                                capabilities: {
                                    paymasterService: {
                                        url: "http://127.0.0.1:8080/paymaster/",
                                    },
                                    permissions: {
                                        sessionId,
                                    },
                                },
                            })
                        }
                    >
                        SendCall With Session
                    </button>
                </div>
            </div>
        </>
    );
}

export default App;
