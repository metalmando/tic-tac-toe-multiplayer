const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(__dirname)); // Serve index.html

let queue = []; // Players waiting
let rooms = {}; // Active games: roomId -> { players: [socket1, socket2], board: [], turn: 'X' }

function checkWin(board) {
    const wins = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
    for (let combo of wins) {
        if (board[combo[0]] && board[combo[0]] === board[combo[1]] && board[combo[0]] === board[combo[2]]) {
            return board[combo[0]];
        }
    }
    return null;
}

function isTie(board) {
    return board.every(cell => cell !== null);
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join', () => {
        queue.push(socket);
        if (queue.length >= 2) {
            const player1 = queue.shift();
            const player2 = queue.shift();
            const roomId = `${player1.id}-${player2.id}`;
            rooms[roomId] = { players: [player1, player2], board: Array(9).fill(null), turn: 'X' };

            player1.join(roomId);
            player2.join(roomId);

            player1.emit('start', { symbol: 'X', turn: true });
            player2.emit('start', { symbol: 'O', turn: false });
            console.log(`Game started in room ${roomId}`);
        }
    });

    socket.on('move', (data) => {
        // Find the room for this socket
        let roomId;
        for (let id in rooms) {
            if (rooms[id].players.includes(socket)) {
                roomId = id;
                break;
            }
        }
        if (!roomId) return;

        const room = rooms[roomId];
        const playerSymbol = (socket === room.players[0]) ? 'X' : 'O';
        if (room.turn !== playerSymbol) return; // Not your turn

        const { index } = data;
        if (room.board[index] === null) {
            room.board[index] = room.turn;
            room.turn = room.turn === 'X' ? 'O' : 'X';
            console.log(`Move made: ${playerSymbol} at index ${index}. Next turn: ${room.turn}`);

            // Send update to both players with their specific turn status
            const isP1Turn = room.turn === 'X'; // P1 is X
            room.players[0].emit('update', { board: room.board, turn: isP1Turn });
            room.players[1].emit('update', { board: room.board, turn: !isP1Turn });

            const winner = checkWin(room.board);
            if (winner) {
                room.players[0].emit('win', winner);
                room.players[1].emit('win', winner);
                console.log(`Winner: ${winner}`);
            } else if (isTie(room.board)) {
                room.players[0].emit('tie');
                room.players[1].emit('tie');
                console.log('Tie game');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        queue = queue.filter(s => s !== socket);
        for (let roomId in rooms) {
            const room = rooms[roomId];
            if (room.players.includes(socket)) {
                // Notify the other player
                room.players.forEach(p => {
                    if (p !== socket) {
                        p.emit('status', 'Opponent disconnected. Game over.');
                    }
                });
                delete rooms[roomId];
                break;
            }
        }
    });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));