import { Group, Stack, Title } from "@mantine/core";
import { IconCircle, IconX } from "@tabler/icons-react";
import type { FC } from "react";

interface ScoreboardProps {
    xWins: number;
    oWins: number;
    draws: number;
}

const Scoreboard: FC<ScoreboardProps> = ({ xWins, oWins, draws }) => {
    return (
        <Group justify="space-around">
            <Stack align="center" gap={5}>
                <IconX />
                <Title order={2} ff="monospace">
                    {xWins}
                </Title>
            </Stack>
            <Stack align="center" gap={5}>
                <IconCircle />
                <Title order={2} ff="monospace">
                    {oWins}
                </Title>
            </Stack>
        </Group>
    );
};

export default Scoreboard;
