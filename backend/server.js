const { createServer } = require("http");
const express = require("express");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

// Initialize Express instead of Next.js
const app = express();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/remote-desktop";

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("> Connected to MongoDB successfully");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

const server = createServer(app);

// Initialize Socket.io with CORS enabled
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userId);

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
    });
  });

  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming);
  });

  socket.on("remote-control-event", (data) => {
    socket.to(data.roomId).emit("remote-control-event", data.event);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`> Signaling server ready on port ${PORT}`);
});
