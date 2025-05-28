import { createApp } from "@deroll/app";
import { hexToNumber, stringToHex } from "viem";

let xWins = 0;
let oWins = 0;
let draws = 0;

const board = ["", "", "", "", "", "", "", "", ""];
type Turn = "x" | "o";
let turn: Turn = "x";

function checkWin(board: string[], player: Turn): boolean {
    const winPatterns = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8], // rows
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8], // columns
        [0, 4, 8],
        [2, 4, 6], // diagonals
    ];
    return winPatterns.some((pattern) =>
        pattern.every((index) => board[index] === player)
    );
}

function checkDraw(board: string[]): boolean {
    return board.every((cell) => cell !== "");
}

function boardToString(board: string[]) {
    const rows = Array.from({ length: 3 }, (_, i) =>
        board
            .slice(i * 3, (i + 1) * 3)
            .map((cell) => cell || " ")
            .join("│")
    );
    const separator = "─┼─┼─";
    return rows.join(`\n${separator}\n`);
}

// create application
const app = createApp({ url: "http://127.0.0.1:5004" });

// log incoming advance request
app.addAdvanceHandler(async ({ metadata, payload }) => {
    // payload is a hex string of the cell number
    const cell = hexToNumber(payload, { size: 1, signed: false });

    // check if the cell is in bounds and empty
    if (cell < 0 || cell >= board.length) {
        console.error(`Rejecting invalid cell: ${cell}`);
        return "reject";
    }

    if (board[cell] !== "") {
        console.error(`Rejecting occupied cell: ${cell}`);
        return "reject";
    }

    console.log(`${metadata.msg_sender} plays ${turn} at ${cell}`);

    // update the board
    board[cell] = turn;

    // print the board
    console.log(boardToString(board));

    // check if the player has won
    if (checkWin(board, turn)) {
        if (turn === "x") {
            xWins++;
        } else {
            oWins++;
        }

        // reset the board
        board.fill("");
        turn = "x";
    } else if (checkDraw(board)) {
        // check if the board is full
        draws++;

        // reset the board
        board.fill("");
        turn = "x";
    } else {
        // switch turn
        turn = turn === "x" ? "o" : "x";
    }

    // create a report with the current state of the game
    const state = { xWins, oWins, draws, board, turn };
    await app.createNotice({
        payload: stringToHex(JSON.stringify(state)),
    });

    return "accept";
});

// start app
app.start().catch((e) => {
    console.error(e);
    process.exit(1);
});
