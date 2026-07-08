import { sessionConnector } from "@/connectors/session";
import { jaw } from "@jaw.id/wagmi";
import {
    ActionIcon,
    Alert,
    Group,
    Image,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from "@mantine/core";
import {
    IconAlertCircleFilled,
    IconCircleCheckFilled,
    IconPlugConnectedX,
} from "@tabler/icons-react";
import type { FC } from "react";
import type { WalletCapabilities } from "viem";
import {
    type Connection,
    type Connector,
    useCapabilities,
    useConnect,
    useConnection,
    useConnections,
    useConnectors,
    useDisconnect,
} from "wagmi";
import { metaMask } from "wagmi/connectors";

type PermissionsCapabilities = WalletCapabilities<{
    permissions?: {
        supported: boolean;
        signerTypes?: string[];
        keyTypes?: string[];
        permissionTypes?: string[];
    };
}>;

const images = {
    [metaMask.type]: "/img/metamask.svg",
    [jaw.type]: "/img/jaw.png",
};

const ConnectorItem: FC<{ connector: Connector; connection?: Connection }> = ({
    connector,
    connection,
}) => {
    const type = connector.type as typeof metaMask.type | typeof jaw.type;

    const { accounts, chainId } = connection ?? {};
    const { mutate: disconnect } = useDisconnect();

    const { data: capabilities, error } = useCapabilities({
        account: accounts?.[0],
        chainId,
        connector,
        scopeKey: connector.type,
        query: {
            enabled: !!accounts?.[0],
        },
    });
    const permissionsSupported = (capabilities as PermissionsCapabilities)
        ?.permissions?.supported;

    return (
        <Group p={10}>
            <Image src={images[type]} w={50} />
            <Stack align="flex-start" gap={2}>
                <Group justify="space-between" w="100%">
                    <Text fw={800}>{connector.name}</Text>
                    {permissionsSupported && (
                        <Group gap={3}>
                            <IconCircleCheckFilled size={16} color="green" />
                            <Text c="green" size="xs">
                                permissions supported
                            </Text>
                        </Group>
                    )}
                    {error && (
                        <Group gap={3}>
                            <IconAlertCircleFilled size={16} color="red" />
                            <Text c="red" size="xs">
                                permissions not supported
                            </Text>
                        </Group>
                    )}
                    {connection && (
                        <Tooltip label="Disconnect">
                            <ActionIcon
                                variant="subtle"
                                onClick={() => disconnect({ connector })}
                            >
                                <IconPlugConnectedX
                                    style={{ width: "70%", height: "70%" }}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                {accounts?.map((a) => (
                    <Text ff="monospace" key={a}>
                        {a}
                    </Text>
                ))}
            </Stack>
        </Group>
    );
};

export const ConnectionPanel: FC = () => {
    // list of all connectors, except the internal session connector
    const connectors = useConnectors().filter(
        (c) => c.type !== sessionConnector.type
    );
    const { mutate: connect, error } = useConnect();

    // list of active connections
    const connections = useConnections();

    // current connected connector
    const { connector } = useConnection();

    const connectById = (connectorId: string) => {
        const connector = connectors.find((c) => c.id === connectorId);
        if (connector) {
            connect({ connector });
        }
    };

    return (
        <Stack>
            <SegmentedControl
                orientation="vertical"
                value={connector?.id}
                onChange={connectById}
                data={connectors.map((connector) => ({
                    value: connector.id,
                    label: (
                        <ConnectorItem
                            connector={connector}
                            connection={connections.find(
                                (c) => c.connector.id === connector.id
                            )}
                        />
                    ),
                }))}
            />
            {error?.message && <Alert color="red">{error?.message}</Alert>}
        </Stack>
    );
};
