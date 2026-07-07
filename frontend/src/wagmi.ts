import { jaw } from "@jaw.id/wagmi";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";

const jawApiKey = process.env.NEXT_PUBLIC_JAW_API_KEY as string;

export function getConfig() {
    const metaMaskConnector = metaMask();
    const jawConnector = jaw({
        apiKey: jawApiKey,
        appName: "TicTacToe",
        defaultChainId: baseSepolia.id,
        preference: {
            showTestnets: true,
        },
    });

    return createConfig({
        chains: [baseSepolia],
        connectors: [metaMaskConnector, jawConnector],
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
