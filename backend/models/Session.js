import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  hostName: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, expires: '24h' } // Auto-cleanup
});

export default mongoose.models.Session || mongoose.model("Session", SessionSchema);