const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: function () {
      return this.password && this.password.length > 0;
    },
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 添加密码哈希处理的 pre-save 钩子
roomSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    try {
      this.password = await bcrypt.hash(this.password, 10);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model("Room", roomSchema);
