import { ActionIcon, SimpleGrid } from "@mantine/core";
import { IconCircle, IconX } from "@tabler/icons-react";
import { type FC, useState } from "react";

export interface BoardProps {
    xBoard: number;
    oBoard: number;
    loading: boolean;
    onCellClick: (index: number) => void;
}

const Board: FC<BoardProps> = ({ xBoard, oBoard, loading, onCellClick }) => {
    const [lastClicked, setLastClicked] = useState<number>();

    return (
        <SimpleGrid cols={3}>
            {Array.from({ length: 9 }, (_, index) => {
                const isX = (xBoard & (1 << index)) !== 0;
                const isO = (oBoard & (1 << index)) !== 0;
                return (
                    <ActionIcon
                        variant="default"
                        size="input-xl"
                        // biome-ignore lint/suspicious/noArrayIndexKey: index is the best choice here
                        key={index}
                        disabled={isX || isO}
                        loading={lastClicked === index && loading}
                        loaderProps={{ size: "sm", color: "gray" }}
                        onClick={() => {
                            setLastClicked(index);
                            onCellClick(index);
                        }}
                    >
                        {isX ? <IconX /> : isO ? <IconCircle /> : <></>}
                    </ActionIcon>
                );
            })}
        </SimpleGrid>
    );
};

export default Board;
