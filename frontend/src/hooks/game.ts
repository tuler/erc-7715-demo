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
    encodeFunctionData,
    hexToString,
    numberToHex,
    parseEventLogs,
} from "viem";
import {
    type Connector,
    useConnectors,
    useSendCalls,
    useWaitForCallsStatus,
} from "wagmi";
import { sessionConnector } from "@/connectors/session";
import type { Session } from "./session";

const application = process.env
    .NEXT_PUBLIC_APPLICATION_ADDRESS as `0x${string}`;

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
    xBoard: number;
    oBoard: number;
    turn: "x" | "o";
};

export const useTicTacToe = () => {
    // connector that plays through the session burner wallet
    const connectors = useConnectors();
    const burner = connectors.find((c) => c.type === sessionConnector.type);

    const {
        data,
        error,
        isPending,
        mutate: sendCalls,
        variables,
    } = useSendCalls();
    const {
        isPending: isConfirming,
        isSuccess: isConfirmed,
        data: callResult,
    } = useWaitForCallsStatus({
        // query the status from the same connector that sent the calls
        connector: variables?.connector as Connector | undefined,
        id: data?.id,
    });

    const [inputIndex, setInputIndex] = useState<bigint>();
    const { data: processedInputCount, refetch } = useProcessedInputCount({
        application,
    });

    const [game, setGame] = useState<State>({
        xWins: 0,
        oWins: 0,
        draws: 0,
        xBoard: 0,
        oBoard: 0,
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
            if (output?.decodedData?.type === "Notice") {
                setGame(JSON.parse(hexToString(output.decodedData.payload)));
            }
            refetch();
        }
    }, [outputs, refetch]);

    const play = (index: number, session?: Session) => {
        sendCalls({
            calls: [
                {
                    to: inputBoxAddress,
                    data: encodeFunctionData({
                        abi: inputBoxAbi,
                        functionName: "addInput",
                        args: [
                            application,
                            numberToHex(index, { size: 1, signed: false }), // input is the index of the clicked cell [0-8]
                        ],
                    }),
                },
            ],
            // play through the session connector when a session exists,
            // otherwise through the current connected wallet
            ...(session && burner ? { connector: burner } : {}),
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
