import "@mantine/core/styles.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cookieToInitialState } from "wagmi";

import { ColorSchemeScript } from "@mantine/core";
import { getConfig } from "../wagmi";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Tic-Tac-Toe",
    description: "ERC-7715 Demo",
};

export default async function RootLayout(props: { children: ReactNode }) {
    const initialState = cookieToInitialState(
        getConfig(),
        (await headers()).get("cookie")
    );
    return (
        <html lang="en" data-mantine-color-scheme="light">
            <head>
                <meta charSet="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <ColorSchemeScript />
            </head>
            <body className={inter.className}>
                <Providers initialState={initialState}>
                    {props.children}
                </Providers>
            </body>
        </html>
    );
}
