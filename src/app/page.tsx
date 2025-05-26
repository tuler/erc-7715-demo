"use client";

import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import { useState } from "react";
import { stringToHex, zeroAddress } from "viem";
import {
    useAccount,
    useCapabilities,
    useConnect,
    useDisconnect,
    useSendCalls,
} from "wagmi";

const application = zeroAddress;

function App() {
    const account = useAccount();
    const { connectors, connect, status, error } = useConnect();
    const { disconnect } = useDisconnect();

    const { data: capabilities } = useCapabilities();
    const [input, setInput] = useState("");
    const { sendCallsAsync } = useSendCalls();

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
                    sendCall
                </button>
            </div>
        </>
    );
}

export default App;
