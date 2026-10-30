import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: "*" } });

let rooms = {}; 
const wordBank = ["apple", "car", "house", "cat", "banana", "tree", "fish"];

io.on("connection", 
    /** @param {any} socket */
    (socket) => {
    
    // When a player requests to join a room
    socket.on("join-room", 
        /** @param {any} data */
        (data) => {
        if (!data || !data.room) return;
        socket.join(data.room);
        
        // If room doesn't exist, create it
        if (!rooms[data.room]) {
            rooms[data.room] = {
                players: {},
                currentWord: "",
                correctGuessesThisRound: 0,
                drawerIndex: 0
            };
        }
        
        // Save player data
        rooms[data.room].players[socket.id] = { name: data.name || "Player", points: 0 };
        io.to(data.room).emit("update-scores", rooms[data.room].players);

        // If there are at least two players, start the game loop automatically
        if(Object.keys(rooms[data.room].players).length === 2) {
            startNewRound(data.room);
        }
    });

    // Receive drawings coordinates from the active painter and forward it to room
    socket.on("draw-data", 
        /** @param {any} data */
        (data) => {
        if (!data || !data.room) return;
        socket.to(data.room).emit("server-draw", data);
    });

    // Check guesses and hand out descending points
    socket.on("submit-guess", 
        /** @param {any} data */
        (data) => {
        if (!data || !data.room) return;
        let roomData = rooms[data.room];
        if(!roomData) return;

        if (data.guess && data.guess.toLowerCase() === roomData.currentWord.toLowerCase()) {
            roomData.correctGuessesThisRound++;
            
            // Descending points logic (1st gets 100, 2nd gets 75, etc.)
            let awardPoints = 100 - ((roomData.correctGuessesThisRound - 1) * 25);
            if(awardPoints < 25) awardPoints = 25; 

            roomData.players[socket.id].points += awardPoints;
            
            io.to(data.room).emit("update-scores", roomData.room ? roomData.players : roomData.players);
            
            // If everyone guessed right, jump to the next round immediately
            let totalPlayers = Object.keys(roomData.players).length;
            if(roomData.correctGuessesThisRound === totalPlayers - 1) {
                startNewRound(data.room);
            }
        }
    });
});

/** @param {any} roomName */
function startNewRound(roomName) {
    let roomData = rooms[roomName];
    if (!roomData) return;
    
    let playerIds = Object.keys(roomData.players);
    if(playerIds.length === 0) return;

    // Pick a new drawer sequentially
    roomData.drawerIndex = (roomData.drawerIndex + 1) % playerIds.length;
    let currentDrawerId = playerIds[roomData.drawerIndex];
    
    // Choose a random word
    roomData.currentWord = wordBank[Math.floor(Math.random() * wordBank.length)];
    roomData.correctGuessesThisRound = 0;

    // Broadcast round info to the room
    io.to(roomName).emit("new-turn", {
        drawerId: currentDrawerId,
        drawerName: roomData.players[currentDrawerId].name,
        word: roomData.currentWord
    });
}

// Start server on port 3000
http.listen(3000, () => {
    console.log("Skibble game manager server running on port 3000");
});
  