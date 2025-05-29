"use client";

import { getConfig } from "@/wagmi";
import { CartesiProvider } from "@cartesi/wagmi";
import { MantineProvider, createTheme } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type State, WagmiProvider } from "wagmi";

const rpcUrl = process.env.NEXT_PUBLIC_CARTESI_RPC_URL as string;

const theme = createTheme({});

export function Providers(props: {
    children: ReactNode;
    initialState?: State;
}) {
    const [config] = useState(() => getConfig());
    const [queryClient] = useState(() => new QueryClient());

    return (
        <MantineProvider theme={theme}>
            <WagmiProvider config={config} initialState={props.initialState}>
                <QueryClientProvider client={queryClient}>
                    <CartesiProvider rpcUrl={rpcUrl}>
                        {props.children}
                    </CartesiProvider>
                </QueryClientProvider>
            </WagmiProvider>
        </MantineProvider>
    );
}
