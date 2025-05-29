import { ActionIcon, SimpleGrid } from "@mantine/core";
import { IconCircle, IconX } from "@tabler/icons-react";
import { type FC, useState } from "react";

export interface BoardProps {
    board: ("x" | "o" | "")[];
    loading: boolean;
    onCellClick: (index: number) => void;
}

const Board: FC<BoardProps> = ({ board, loading, onCellClick }) => {
    const [lastClicked, setLastClicked] = useState<number>();

    return (
        <SimpleGrid cols={3}>
            {board.map((cell, index) => (
                <ActionIcon
                    variant="default"
                    size="input-xl"
                    key={`${index}-${cell}`}
                    disabled={cell !== ""}
                    loading={lastClicked === index && loading}
                    loaderProps={{ size: "sm", color: "gray" }}
                    onClick={() => {
                        setLastClicked(index);
                        onCellClick(index);
                    }}
                >
                    {cell === "x" ? (
                        <IconX />
                    ) : cell === "o" ? (
                        <IconCircle />
                    ) : (
                        <></>
                    )}
                </ActionIcon>
            ))}
        </SimpleGrid>
    );
};

export default Board;
