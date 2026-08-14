const { createServer } = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/remote-desktop";

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("> Connected to MongoDB successfully");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Standard Node HTTP Server
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }
  
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Signaling server running");
});

// Initialize Socket.io
const io = new Server(server, {
  cors: { origin: "*" },
});

// Track all currently online devices
const onlineDevices = new Map();

io.on("connection", (socket) => {
  // 1. Generate a device label for the new connection
  const deviceLabel = `Device-${Math.floor(Math.random() * 10000)}`;
  
  // Store device data
  const deviceInfo = {
    socketId: socket.id,
    label: deviceLabel,
    status: "online"
  };
  
  onlineDevices.set(socket.id, deviceInfo);
  console.log(`> Connected: ${deviceLabel} (${socket.id})`);

  // 2. Broadcast the updated list of all online devices to EVERY connected client
  io.emit("online-devices", Array.from(onlineDevices.values()));

  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userId);
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

  // Handle Disconnection
  socket.on("disconnect", () => {
    console.log(`> Disconnected: ${deviceLabel}`);
    
    // Remove the device from our Map
    onlineDevices.delete(socket.id);
    
    // Broadcast the updated list again
    io.emit("online-devices", Array.from(onlineDevices.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`> Signaling server ready on port ${PORT}`);
});
