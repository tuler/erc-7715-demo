"use client";

import Board from "@/components/board";
import { ConnectionPanel } from "@/components/connection";
import Scoreboard from "@/components/score";
import { useTicTacToe } from "@/hooks/game";
import { useAddInputSession } from "@/hooks/session";
import {
    ActionIcon,
    Alert,
    Group,
    Stack,
    TextInput,
    Textarea,
    Tooltip,
} from "@mantine/core";
import { IconCirclePlusFilled } from "@tabler/icons-react";

function App() {
    const { createSession, sessionId } = useAddInputSession();
    const { error, game, play, isPending } = useTicTacToe();

    return (
        <Group p={100} justify="space-around">
            <Stack>
                <ConnectionPanel />
                <TextInput
                    label="Session ID"
                    value={sessionId ?? "N/A"}
                    readOnly
                    rightSection={
                        <Tooltip label="Create Session">
                            <ActionIcon
                                variant="transparent"
                                onClick={() =>
                                    createSession(
                                        Math.round(
                                            (Date.now() + 1000 * 60 * 60 * 60) /
                                                1000
                                        )
                                    )
                                }
                            >
                                <IconCirclePlusFilled />
                            </ActionIcon>
                        </Tooltip>
                    }
                />
                {error && (
                    <Alert color="red" title={error.name}>
                        <Textarea
                            readOnly
                            rows={8}
                            value={error.message}
                            variant="unstyled"
                        />
                    </Alert>
                )}
            </Stack>

            <Stack gap={40}>
                <Board
                    xBoard={game.xBoard}
                    oBoard={game.oBoard}
                    onCellClick={(cell) => play(cell, sessionId)}
                    loading={error ? false : isPending}
                />
                <Scoreboard
                    xWins={game.xWins}
                    oWins={game.oWins}
                    draws={game.draws}
                />
            </Stack>
        </Group>
    );
}

export default App;
