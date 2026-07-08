import { jaw } from "@jaw.id/wagmi";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { sessionConnector } from "./connectors/session";

const jawApiKey = process.env.NEXT_PUBLIC_JAW_API_KEY as string;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;

export function getConfig() {
    const metaMaskConnector = metaMask();
    const jawConnector = jaw({
        apiKey: jawApiKey,
        appName: "TicTacToe",
        defaultChainId: baseSepolia.id,
        preference: {
            showTestnets: true,
        },
        // sponsor gas of transactions sent through the connector
        ...(paymasterUrl
            ? { paymasters: { [baseSepolia.id]: { url: paymasterUrl } } }
            : {}),
    });

    // connector that plays through the session burner wallet
    const burnerConnector = sessionConnector({
        apiKey: jawApiKey,
        paymasterUrl,
    });

    return createConfig({
        chains: [baseSepolia],
        connectors: [metaMaskConnector, jawConnector, burnerConnector],
        storage: createStorage({
            storage: cookieStorage,
        }),
        ssr: true,
        transports: {
            [baseSepolia.id]: http(),
        },
    });
}

declare module "wagmi" {
    interface Register {
        config: ReturnType<typeof getConfig>;
    }
}
