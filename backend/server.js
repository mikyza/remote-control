const { createServer } = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/remote-desktop";

// 1. Define Device Schema to persist device info in MongoDB
const deviceSchema = new mongoose.Schema({
  mac: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  lastIp: { type: String },
  lastSeen: { type: Date, default: Date.now },
});

const Device = mongoose.model("Device", deviceSchema);

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

// Map to track actively connected sockets
const onlineDevices = new Map();

io.on("connection", async (socket) => {
  // Extract query parameters sent from the Next.js frontend
  const queryLabel = socket.handshake.query.label;
  const queryMac = socket.handshake.query.mac;

  // Extract client IP address (handles reverse proxies like Render/Cloudflare)
  const rawIp = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const clientIp = typeof rawIp === "string" ? rawIp.split(",")[0].trim() : rawIp;

  const mac = queryMac || `UNKNOWN-${socket.id}`;
  let deviceLabel = queryLabel || `Device-${Math.floor(Math.random() * 10000)}`;

  // Persistent Storage Logic
  if (queryMac && queryMac !== "Unknown") {
    try {
      let existingDevice = await Device.findOne({ mac: queryMac });

      if (existingDevice) {
        existingDevice.lastIp = clientIp;
        existingDevice.lastSeen = new Date();
        if (queryLabel) existingDevice.label = queryLabel;
        
        await existingDevice.save();
        deviceLabel = existingDevice.label;
        console.log(`> Recognized returning device: ${deviceLabel} [MAC: ${queryMac}]`);
      } else {
        await Device.create({
          mac: queryMac,
          label: deviceLabel,
          lastIp: clientIp,
          lastSeen: new Date(),
        });
        console.log(`> Registered NEW device in MongoDB: ${deviceLabel} [MAC: ${queryMac}]`);
      }
    } catch (err) {
      console.error("Error processing device in MongoDB:", err.message);
    }
  }

  // Store active connection details
  const deviceInfo = {
    socketId: socket.id,
    label: deviceLabel,
    mac: mac,
    ip: clientIp,
    status: "online",
  };

  onlineDevices.set(socket.id, deviceInfo);
  console.log(`> Connected: ${deviceLabel} (IP: ${clientIp} | MAC: ${mac})`);

  // Broadcast updated device list to ALL connected clients
  io.emit("online-devices", Array.from(onlineDevices.values()));

  // ==========================================
  // WEBRTC SIGNALING & ROOM LOGIC
  // ==========================================

  socket.on("join-room", (roomId, userId) => {
    const activeUser = userId || socket.id;
    socket.join(roomId);
    console.log(`> Socket [${socket.id}] joined room: [${roomId}]`);

    // Notify existing room members that a viewer connected
    socket.to(roomId).emit("user-connected", { userId: activeUser, socketId: socket.id });
  });

  // Event allowing a newly joined viewer to request a fresh offer from host
  socket.on("request-stream", (payload) => {
    console.log(`> Stream requested in room [${payload.roomId}] by [${socket.id}]`);
    socket.to(payload.roomId).emit("request-stream", { requesterId: socket.id });
  });

  socket.on("offer", (payload) => {
    console.log(`> Signaling: OFFER from [${socket.id}] -> Target: [${payload.target || payload.roomId}]`);
    const data = { ...payload, sender: socket.id };
    
    if (payload.target) {
      io.to(payload.target).emit("offer", data);
    } else if (payload.roomId) {
      socket.to(payload.roomId).emit("offer", data);
    }
  });

  socket.on("answer", (payload) => {
    console.log(`> Signaling: ANSWER from [${socket.id}] -> Target: [${payload.target || payload.roomId}]`);
    const data = { ...payload, sender: socket.id };
    
    if (payload.target) {
      io.to(payload.target).emit("answer", data);
    } else if (payload.roomId) {
      socket.to(payload.roomId).emit("answer", data);
    }
  });

  socket.on("ice-candidate", (incoming) => {
    const data = { ...incoming, sender: socket.id };
    
    if (incoming.target) {
      io.to(incoming.target).emit("ice-candidate", data);
    } else if (incoming.roomId) {
      socket.to(incoming.roomId).emit("ice-candidate", data);
    }
  });

  socket.on("remote-control-event", (data) => {
    socket.to(data.roomId).emit("remote-control-event", data.event);
  });

  // Handle Disconnection
  socket.on("disconnect", () => {
    console.log(`> Disconnected: ${deviceLabel} (${socket.id})`);
    onlineDevices.delete(socket.id);
    io.emit("online-devices", Array.from(onlineDevices.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`> Signaling server ready on port ${PORT}`);
});
