// models/historicalMeeting.js
const mongoose = require("mongoose");

const historicalMeetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  version: { type: Number, required: true },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // 修改这里，把类型设置为 String 数组
  participants: [{ type: String }],
  messages: [
    {
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      message: String,
      time: { type: Date, default: Date.now },
    },
  ],
  whiteboardData: [mongoose.Schema.Types.Mixed],
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("HistoricalMeeting", historicalMeetingSchema);
