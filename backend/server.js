const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/remote-desktop";

app.prepare().then(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("> Connected to MongoDB successfully");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

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
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});