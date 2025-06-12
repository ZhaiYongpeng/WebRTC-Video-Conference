const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  message: String,
  time: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);
