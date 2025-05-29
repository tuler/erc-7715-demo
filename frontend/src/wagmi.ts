import { defineChain } from "viem";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { cannon } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { ecdsaConnector } from "./app/zerodev/ecsdaConnector";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL as string;
const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL as string;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;

const cartesi = defineChain({
    ...cannon,
    rpcUrls: { default: { http: [rpcUrl] } },
});

export function getConfig() {
    const metaMaskConnector = metaMask();
    const zeroDevConnector = ecdsaConnector({
        bundlerUrl,
        chain: cartesi,
        rpcUrl,
        paymasterUrl,
    });

    return createConfig({
        chains: [cartesi],
        connectors: [metaMaskConnector, zeroDevConnector],
        storage: createStorage({
            storage: cookieStorage,
        }),
        ssr: true,
        transports: {
            [cartesi.id]: http(),
        },
    });
}

declare module "wagmi" {
    interface Register {
        config: ReturnType<typeof getConfig>;
    }
}
