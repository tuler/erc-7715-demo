import { defineChain } from "viem";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { cannon } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { ecdsaConnector } from "./app/zerodev/ecsdaConnector";
import { passkeyConnector } from "./app/zerodev/passkeyConnector";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL as string;
const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL as string;
const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL as string;
const passkeyServerUrl = process.env.NEXT_PUBLIC_PASSKEY_SERVER_URL as string;

const cartesi = defineChain({
    ...cannon,
    rpcUrls: { default: { http: [rpcUrl] } },
});

export function getConfig() {
    const metaMaskConnector = metaMask();
    const zeroDevECDSAConnector = ecdsaConnector({
        bundlerUrl,
        chain: cartesi,
        rpcUrl,
        paymasterUrl,
    });
    const zeroDevPasskeyConnector = passkeyConnector({
        bundlerUrl,
        chain: cartesi,
        name: "TicTacToe",
        passkeyServerUrl: passkeyServerUrl,
        rpcUrl,
        paymasterUrl,
    });

    return createConfig({
        chains: [cartesi],
        connectors: [
            metaMaskConnector,
            zeroDevECDSAConnector,
            zeroDevPasskeyConnector,
        ],
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
