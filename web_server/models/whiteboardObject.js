const mongoose = require("mongoose");

const whiteboardObjectSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  object: Object, // 存储白板对象 JSON
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WhiteboardObject", whiteboardObjectSchema);
