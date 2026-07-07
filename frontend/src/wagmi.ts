import { jaw } from "@jaw.id/wagmi";
import { defineChain } from "viem";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { baseSepolia, cannon } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL as string;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
const jawApiKey = process.env.NEXT_PUBLIC_JAW_API_KEY as string;

const cartesi = defineChain({
    ...cannon,
    rpcUrls: { default: { http: [rpcUrl] } },
});

export function getConfig() {
    const metaMaskConnector = metaMask();
    const jawConnector = jaw({
        apiKey: jawApiKey,
        appName: "TicTacToe",
        defaultChainId: baseSepolia.id,
        preference: {
            showTestnets: true,
        },
        paymasters: {
            [cartesi.id]: { url: paymasterUrl },
        },
    });

    return createConfig({
        chains: [cartesi, baseSepolia],
        connectors: [metaMaskConnector, jawConnector],
        storage: createStorage({
            storage: cookieStorage,
        }),
        ssr: true,
        transports: {
            [cartesi.id]: http(),
            [baseSepolia.id]: http(),
        },
    });
}

declare module "wagmi" {
    interface Register {
        config: ReturnType<typeof getConfig>;
    }
}
