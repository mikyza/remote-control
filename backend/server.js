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

  // 2. Persistent Storage Logic: Check or store MAC in MongoDB
  if (queryMac && queryMac !== "Unknown") {
    try {
      let existingDevice = await Device.findOne({ mac: queryMac });

      if (existingDevice) {
        // Device seen before: update IP, last seen date, and label if changed
        existingDevice.lastIp = clientIp;
        existingDevice.lastSeen = new Date();
        if (queryLabel) existingDevice.label = queryLabel;
        
        await existingDevice.save();
        deviceLabel = existingDevice.label;
        console.log(`> Recognized returning device: ${deviceLabel} [MAC: ${queryMac}]`);
      } else {
        // First time connecting: create new device entry in MongoDB
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

  // 3. Store active connection details in memory map
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

  // Signaling Events
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
    console.log(`> Disconnected: ${deviceLabel} (${socket.id})`);
    
    // Remove device from active map
    onlineDevices.delete(socket.id);
    
    // Broadcast updated list to remaining clients
    io.emit("online-devices", Array.from(onlineDevices.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`> Signaling server ready on port ${PORT}`);
});
