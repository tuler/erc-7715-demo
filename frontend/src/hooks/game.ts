import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import {
    useOutputs,
    useProcessedInputCount,
    useWaitForInput,
} from "@cartesi/wagmi";
import { useEffect, useState } from "react";
import {
    type ContractEventArgsFromTopics,
    type Log,
    type WalletCallReceipt,
    hexToString,
    numberToHex,
    parseEventLogs,
} from "viem";
import { useSendCalls, useWaitForCallsStatus } from "wagmi";

const application = process.env
    .NEXT_PUBLIC_APPLICATION_ADDRESS as `0x${string}`;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;

export type InputAdded = ContractEventArgsFromTopics<
    typeof inputBoxAbi,
    "InputAdded",
    true
>;

export const getInputsAdded = (
    receipt: WalletCallReceipt<bigint, "success" | "reverted">
): InputAdded[] => {
    const transactionIndex = 0;
    const logs: Log[] = receipt.logs.map((log, logIndex) => ({
        ...receipt,
        ...log,
        topics: [log.topics[0], ...log.topics.slice(1)],
        logIndex,
        transactionIndex,
        removed: false,
    }));
    const parsedLogs = parseEventLogs({
        abi: inputBoxAbi,
        logs,
        eventName: "InputAdded",
    });
    return parsedLogs.map(({ args }) => args);
};

type State = {
    xWins: number;
    oWins: number;
    draws: number;
    board: ("x" | "o" | "")[];
    turn: "x" | "o";
};

export const useTicTacToe = () => {
    const { data, error, isPending, sendCalls } = useSendCalls();
    const {
        isPending: isConfirming,
        isSuccess: isConfirmed,
        data: callResult,
    } = useWaitForCallsStatus({ id: data?.id });

    const [inputIndex, setInputIndex] = useState<bigint>();
    const { data: processedInputCount, refetch } = useProcessedInputCount({
        application,
    });

    const [game, setGame] = useState<State>({
        xWins: 0,
        oWins: 0,
        draws: 0,
        board: Array(9).fill(""),
        turn: "x",
    });

    // read input index from the transaction receipt
    useEffect(() => {
        if (callResult?.receipts) {
            const inputsAdded = callResult.receipts.flatMap(getInputsAdded);
            setInputIndex(inputsAdded[0]?.index);
        }
    }, [callResult?.receipts]);

    // wait for the input to be processed
    const { data: input, isPending: isInputPending } = useWaitForInput({
        application,
        inputIndex,
    });

    // which input we should query for outputs
    // 1. last added input, from the transaction receipt
    // 2. or the last processed input, queried only once on load (not polling)
    const queryInput = input
        ? input.index
        : processedInputCount
        ? processedInputCount - 1n
        : undefined;

    // get outputs from last added input, or from the last processed input
    const { data: outputs, isPending: isOutputsPending } = useOutputs({
        application,
        inputIndex: queryInput,
        enabled: queryInput !== undefined,
    });

    useEffect(() => {
        if (outputs) {
            // read first output, which is a notice with the game state
            const output = outputs.data[0];
            if (output && output.decodedData.type === "Notice") {
                setGame(JSON.parse(hexToString(output.decodedData.payload)));
            }
            refetch();
        }
    }, [outputs, refetch]);

    const play = (index: number, sessionId?: string) => {
        sendCalls({
            calls: [
                {
                    to: inputBoxAddress,
                    abi: inputBoxAbi,
                    functionName: "addInput",
                    args: [
                        application,
                        numberToHex(index, { size: 1, signed: false }), // input is the index of the clicked cell [0-8]
                    ],
                },
            ],
            capabilities: {
                paymasterService: {
                    url: paymasterUrl, // always use paymaster
                },
                permissions: {
                    sessionId, // optional session usage
                },
            },
        });
    };

    return {
        error,
        game,
        isConfirmed,
        play,
        isPending:
            isConfirming || isPending || isInputPending || isOutputsPending,
    };
};
