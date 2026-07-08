import { inputBoxAbi, inputBoxAddress } from "@cartesi/viem/abi";
import {
    useOutputs,
    useProcessedInputCount,
    useWaitForInput,
} from "@cartesi/wagmi";
import { Account, type CallStatusResponse } from "@jaw.id/core";
import { useEffect, useState } from "react";
import {
    type ContractEventArgsFromTopics,
    type Log,
    encodeFunctionData,
    hexToString,
    numberToHex,
    parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useChainId, useSendCalls, useWaitForCallsStatus } from "wagmi";
import type { Session } from "./session";

const application = process.env
    .NEXT_PUBLIC_APPLICATION_ADDRESS as `0x${string}`;
const apiKey = process.env.NEXT_PUBLIC_JAW_API_KEY as string;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;

export type InputAdded = ContractEventArgsFromTopics<
    typeof inputBoxAbi,
    "InputAdded",
    true
>;

// minimal receipt shape, compatible with receipts from both wagmi and @jaw.id/core
type ReceiptLike = {
    logs: {
        address: `0x${string}`;
        data: `0x${string}`;
        topics: `0x${string}`[];
    }[];
};

export const getInputsAdded = (receipt: ReceiptLike): InputAdded[] => {
    const transactionIndex = 0;
    const logs = receipt.logs.map((log, logIndex) => ({
        ...log,
        topics: [log.topics[0], ...log.topics.slice(1)],
        logIndex,
        transactionIndex,
        removed: false,
    })) as unknown as Log[];
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
    const chainId = useChainId();
    const { data, error, isPending, mutate: sendCalls } = useSendCalls();
    const {
        isPending: isConfirming,
        isSuccess: isConfirmed,
        data: callResult,
    } = useWaitForCallsStatus({ id: data?.id });

    // state of calls sent by the session burner wallet
    const [sessionCallResult, setSessionCallResult] =
        useState<CallStatusResponse>();
    const [isSessionPending, setIsSessionPending] = useState(false);
    const [sessionError, setSessionError] = useState<Error>();

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

    // read input index from the transaction receipt, from either play method
    const receipts = callResult?.receipts ?? sessionCallResult?.receipts;
    useEffect(() => {
        if (receipts) {
            const inputsAdded = receipts.flatMap(getInputsAdded);
            setInputIndex(inputsAdded[0]?.index);
        }
    }, [receipts]);

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

    const addInputCall = (index: number) => ({
        to: inputBoxAddress,
        data: encodeFunctionData({
            abi: inputBoxAbi,
            functionName: "addInput",
            args: [
                application,
                numberToHex(index, { size: 1, signed: false }), // input is the index of the clicked cell [0-8]
            ],
        }),
    });

    // play through the session burner wallet, spending the ERC-7715 permission,
    // without any user interaction
    const playWithSession = async (index: number, session: Session) => {
        setIsSessionPending(true);
        setSessionError(undefined);
        setSessionCallResult(undefined);
        try {
            // load the smart account owned by the burner wallet, which is
            // the spender the permission was granted to
            // the paymaster sponsors gas, as the account has no funds
            const spender = await Account.fromLocalAccount(
                { apiKey, chainId, paymasterUrl },
                privateKeyToAccount(session.privateKey)
            );

            // execute the call through the permission manager
            const { id } = await spender.sendCalls([addInputCall(index)], {
                permissionId: session.permissionId,
            });

            // wait for the call to be confirmed
            // status codes: 100=pending, 200=completed, 400=failed, 500=reverted
            let status = await spender.getCallStatus(id);
            for (let i = 0; (!status || status.status === 100) && i < 60; i++) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                status = await spender.getCallStatus(id);
            }
            if (!status || status.status === 100) {
                throw new Error("Timed out waiting for call confirmation");
            }
            if (status.status !== 200) {
                throw new Error(`Call failed with status ${status.status}`);
            }
            setSessionCallResult(status);
        } catch (err) {
            setSessionError(
                err instanceof Error ? err : new Error(String(err))
            );
        } finally {
            setIsSessionPending(false);
        }
    };

    const play = (index: number, session?: Session) => {
        if (session) {
            playWithSession(index, session);
        } else {
            // play through the connected wallet
            sendCalls({ calls: [addInputCall(index)] });
        }
    };

    return {
        error: error ?? sessionError,
        game,
        isConfirmed,
        play,
        isPending:
            isConfirming ||
            isPending ||
            isSessionPending ||
            isInputPending ||
            isOutputsPending,
    };
};
