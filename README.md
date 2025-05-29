# ERC-7715 Demo

This demonstrates the usage of [ERC-7715](https://eip.tools/eip/7715), [EIP-5792](https://eip.tools/eip/5792) and [ERC-4337](https://eip.tools/eip/4337) with a [Cartesi](https://cartesi.io) application.

The implementation uses [ZeroDev Kernel](https://docs.zerodev.app) as Smart Account.

## Backend

The backend implements a simple tick-tac-toe game. Inputs are player choices, automatically alternating Xs and Os.
The game keeps tracks of stats, how many wins by Xs and Os and ties.

```shell
cd backend
cartesi build
cartesi deploy
```

## Frontend

Frontend is implemented using Next.

```shell
cd frontend
pnpm run dev
```
