import { createApp } from "@deroll/app";
import { hexToNumber, stringToHex } from "viem";

// stats
let xWins = 0;
let oWins = 0;
let draws = 0;

// Board represented as two bit masks: one for X and one for O
let xBoard = 0;
let oBoard = 0;
type Turn = "x" | "o";
let turn: Turn = "x";

function checkWin(board: number): boolean {
    const winPatterns = [
        0b111000000, // top row
        0b000111000, // middle row
        0b000000111, // bottom row
        0b100100100, // left column
        0b010010010, // middle column
        0b001001001, // right column
        0b100010001, // diagonal top-left to bottom-right
        0b001010100, // diagonal top-right to bottom-left
    ];
    return winPatterns.some((pattern) => (board & pattern) === pattern);
}

function isBoardFull(): boolean {
    return (xBoard | oBoard) === 0b111111111;
}

function boardToString(xBoard: number, oBoard: number) {
    let board = "";
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const pos = row * 3 + col;
            const mask = 1 << pos;
            if (xBoard & mask) {
                board += "x";
            } else if (oBoard & mask) {
                board += "o";
            } else {
                board += ".";
            }
        }
        board += "\n";
    }
    return board;
}

// create application
const app = createApp({ url: "http://127.0.0.1:5004" });

// log incoming advance request
app.addAdvanceHandler(async ({ metadata, payload }) => {
    // payload is a hex string of the cell number
    const cell = hexToNumber(payload, { size: 1, signed: false });

    // check if the cell is in bounds and empty
    if (cell < 0 || cell >= 9) {
        console.error(`Rejecting invalid cell: ${cell}`);
        return "reject";
    }

    if (((xBoard | oBoard) & (1 << cell)) !== 0) {
        console.error(`Rejecting occupied cell: ${cell}`);
        return "reject";
    }

    console.log(`${metadata.msg_sender} plays ${turn} at ${cell}`);

    // update the board
    if (turn === "x") {
        xBoard |= 1 << cell;
    } else {
        oBoard |= 1 << cell;
    }
    console.log(boardToString(xBoard, oBoard));

    // check if the player has won
    if (checkWin(turn === "x" ? xBoard : oBoard)) {
        if (turn === "x") {
            xWins++;
        } else {
            oWins++;
        }

        // reset the board
        xBoard = 0;
        oBoard = 0;
        turn = "x";
    } else if (isBoardFull()) {
        // check if the board is full
        draws++;

        // reset the board
        xBoard = 0;
        oBoard = 0;
        turn = "x";
    } else {
        // switch turn
        turn = turn === "x" ? "o" : "x";
    }

    // create a report with the current state of the game
    const state = { xWins, oWins, draws, xBoard, oBoard, turn };
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
