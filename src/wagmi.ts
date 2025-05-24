import { defineChain } from "viem";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { cannon } from "wagmi/chains";
import { ecdsaConnector } from "./app/zerodev/ecsdaConnector";

const cartesi = defineChain({
    ...cannon,
    rpcUrls: { default: { http: ["http://127.0.0.1:8080/anvil"] } },
});

export function getConfig() {
    return createConfig({
        chains: [cartesi],
        connectors: [
            ecdsaConnector({
                bundlerUrl: "http://127.0.0.1:8080/bundler/rpc",
                chain: cartesi,
                rpcUrl: "http://127.0.0.1:8080/anvil",
                paymasterUrl: "http://127.0.0.1:8080/paymaster/",
            }),
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
