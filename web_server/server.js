const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const socketIO = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User = require("./models/user");
const Room = require("./models/room");
const Message = require("./models/message");
const WhiteboardObject = require("./models/whiteboardObject");
const HistoricalMeeting = require("./models/historicalMeeting");

const authMiddleware = require("./middleware/auth");
const { time } = require("console");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const roomUsers = {}; // roomId -> [{ socketId, username }]

// 全局对象，记录每个房间所有加入过的用户（这里存 username，也可以存 id）
const allRoomParticipants = {}; // roomId -> Set of username

mongoose
  .connect("mongodb://localhost:27017/webrtc_conference", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB 连接成功"))
  .catch((err) => console.error("MongoDB 连接失败:", err));

// 注册
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  // 增强后端验证
  if (!username || !password) {
    return res.status(400).json({ message: "用户名和密码不能为空" });
  }
  if (username.length < 3 || username.length > 16) {
    return res.status(400).json({ message: "用户名长度需为3-16位" });
  }
  if (!/^[A-Za-z\d]{6,20}$/.test(password)) {
    return res.status(400).json({ message: "密码需为6-20位，仅限字母和数字" });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "用户名已存在" });
    }
    const user = await User.create({ username, password });
    res.json({ message: "注册成功" });
  } catch (err) {
    res.status(500).json({ message: "服务器错误" });
  }
});

// 登录
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ message: "用户名或密码错误" });
    }
    const token = jwt.sign({ id: user._id }, "your_jwt_secret", {
      expiresIn: "7d",
    });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ message: "服务器错误" });
  }
});

// 检查房间
app.get("/api/check-room/:roomId", async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) return res.json({ exists: false });
  res.json({ exists: true, requiresPassword: !!room.password });
});

app.get("/api/user/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("username");
    if (!user) {
      return res.status(404).json({ message: "用户不存在" });
    }
    res.json({ username: user.username });
  } catch (err) {
    res.status(500).json({ message: "服务器错误" });
  }
});

app.get("/api/history", authMiddleware, async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ message: "请先登录" });
  }

  const userId = req.user._id;
  const username = req.user.username; // 获取登录用户的用户名

  try {
    // 查询条件修改为：creator 匹配用户 id 或者 participants 包含用户名
    const history = await HistoricalMeeting.find({
      $or: [{ creator: userId }, { participants: username }],
    }).sort({ endedAt: -1 });

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 在 socketAuth 中间件中增加验证
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      // 明确返回认证错误
      return next(new Error("未提供认证token"));
    }

    const decoded = jwt.verify(token, "your_jwt_secret");
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new Error("用户不存在或token无效"));
    }

    socket.user = {
      _id: user._id,
      username: user.username,
    };
    next();
  } catch (err) {
    // 区分不同类型的错误
    if (err.name === "TokenExpiredError") {
      next(new Error("登录已过期，请重新登录"));
    } else {
      next(new Error("无效的token"));
    }
  }
};

io.use(socketAuth);

io.on("connection", (socket) => {
  console.log(`用户已连接：${socket.user.username}`);

  socket.on("create-room", async ({ roomId, password }, callback) => {
    try {
      // 1. 检查房间是否存在
      const exists = await Room.findOne({ roomId });
      if (exists)
        return callback({
          success: false,
          message: "房间已存在",
        });

      // 2. 使用 new + save 确保触发 pre-save 钩子
      const newRoom = new Room({
        roomId,
        password: password || "", // 允许空密码
        creator: socket.user._id,
      });

      // 3. 显式处理保存错误
      await newRoom.save();

      callback({ success: true });
      console.log(`房间 ${roomId} 创建成功`);
    } catch (err) {
      // 4. 添加详细错误日志
      console.error("创建房间错误:", err);
      callback({
        success: false,
        message: err.code === 11000 ? "房间ID已存在" : "服务器内部错误",
      });
    }
  });

  socket.on("verify-password", async ({ roomId, password }, callback) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room) {
        return callback({ success: false, message: "房间不存在" });
      }
      const isMatch = await bcrypt.compare(password, room.password);
      if (!isMatch) {
        return callback({ success: false, message: "密码错误" });
      }
      callback({ success: true });
    } catch (err) {
      callback({ success: false, message: "服务器错误" });
    }
  });

  socket.on("signal", (data) => {
    const { to, from, signal } = data;
    // 转发给目标用户
    io.to(to).emit("signal", { from, signal });
  });

  socket.on("join", async (roomId, username) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room) return socket.emit("error", "房间不存在");

      // 用户加入房间
      socket.join(roomId);
      socket.roomId = roomId;

      // 记录当前用户到在线列表
      if (!roomUsers[roomId]) {
        roomUsers[roomId] = [];
      }
      roomUsers[roomId].push({ socketId: socket.id, username });

      // 记录所有曾经加入过该房间的用户（去重处理）
      if (!allRoomParticipants[roomId]) {
        allRoomParticipants[roomId] = new Set();
      }
      allRoomParticipants[roomId].add(username);

      // 广播最新用户列表给所有在该房间的用户
      io.to(roomId).emit("members-updated", roomUsers[roomId]);

      // 向新用户发送当前所有在线用户
      const existingUsers = roomUsers[roomId].filter(
        (u) => u.socketId !== socket.id
      );
      socket.emit("existing-users", existingUsers);

      console.log("[SERVER] 向房间广播 new-peer：", {
        toRoom: roomId,
        newPeer: socket.id,
        username,
      });

      // 通知其他用户：有新人加入
      socket.to(roomId).emit("new-peer", {
        peerId: socket.id,
        username,
      });

      const whiteboardObjects = await WhiteboardObject.find({ room: room._id });
      socket.emit(
        "whiteboard:init",
        whiteboardObjects.map((w) => w.object)
      );

      const messages = await Message.find({ room: room._id }).populate(
        "sender",
        "username"
      );
      messages.forEach((msg) => {
        socket.emit("chat message", {
          sender: msg.sender.username,
          message: msg.message,
          time: msg.time,
        });
      });

      // 获取房间内所有用户的屏幕共享状态
      const screenSharers = [];
      for (const [id, socket] of io.sockets.sockets) {
        if (socket.roomId === roomId && socket.isScreenSharing) {
          screenSharers.push({
            peerId: id,
            username: socket.user.username,
          });
        }
      }

      // 打印屏幕共享状态
      console.log("当前房间内的屏幕共享用户：", screenSharers);

      // 发送给新加入的用户
      socket.emit("screen-sharing-status", screenSharers);

      console.log(`用户 ${username} 加入房间 ${roomId}`);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("chat message", async (data) => {
    try {
      const room = await Room.findOne({ roomId: data.room });
      if (!room) return;

      // 保存到数据库
      await Message.create({
        room: room._id,
        sender: socket.user._id,
        message: data.message,
      });

      const messagePayload = {
        sender: socket.user.username,
        message: data.message,
        // 例如：2023/10/15 14:35:27
        time: Date.now(),
      };

      // 广播给其他成员
      socket.to(data.room).emit("chat message", messagePayload);

      // 同时发送给自己，保证格式统一
      socket.emit("chat message", messagePayload);

      // 格式化时间为年月日时分秒
      const formattedTime = new Date(messagePayload.time).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      console.log(
        `[${formattedTime}]用户 ${socket.user.username} 在房间 ${data.room} 发送消息：${data.message}`
      );
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("whiteboard:add", async ({ room, object }) => {
    try {
      // 1. 查询房间文档
      const roomDoc = await Room.findOne({ roomId: room });
      if (!roomDoc) {
        console.error("[SERVER] 房间不存在:", room);
        return;
      }

      // 2. 创建白板对象
      const newObj = await WhiteboardObject.create({
        room: roomDoc._id,
        user: socket.user._id, // 从认证信息中获取用户ID
        object: object,
      });

      // 3. 广播给其他用户（排除发送者）
      socket.to(room).emit("whiteboard:add", object);
    } catch (err) {
      console.error("[SERVER] 处理新增对象错误:", err);
    }
  });

  socket.on("whiteboard:update", async ({ room, object }) => {
    await WhiteboardObject.updateOne(
      { "object.id": object.id },
      { $set: { object } }
    );
    socket.to(room).emit("whiteboard:update", object);
  });

  socket.on("whiteboard:remove", async ({ room, objectId }) => {
    await WhiteboardObject.deleteOne({
      "object.id": objectId,
      user: socket.user._id, // 确保删除操作针对当前用户
    });
    socket.to(room).emit("whiteboard:remove", objectId);
  });

  socket.on("whiteboard:sync", async (data) => {
    try {
      const { room, objects } = data;
      const roomDoc = await Room.findOne({ roomId: room });
      if (!roomDoc) return;

      // 使用当前用户的 ObjectId
      const userId = socket.user._id;

      // 删除该用户在该房间的所有旧对象
      await WhiteboardObject.deleteMany({ room: roomDoc._id, user: userId });

      // 插入新对象
      if (objects.length > 0) {
        await WhiteboardObject.insertMany(
          objects.map((obj) => ({
            room: roomDoc._id,
            user: userId, // 使用正确的 ObjectId
            object: obj,
          }))
        );
      }

      // 广播时不需要包含 userId，其他客户端根据消息处理
      socket.to(room).emit("whiteboard:sync", {
        room,
        userId: socket.user._id.toString(), // 可选：传递用户的字符串ID供客户端识别
        objects,
      });
    } catch (err) {
      console.error("白板同步错误:", err);
    }
  });

  // 引入新的历史记录模型
  const HistoricalMeeting = require("./models/historicalMeeting");

  async function deleteRoomData(roomId) {
    try {
      const deletedRoom = await Room.findOne({ roomId: roomId });
      if (!deletedRoom) {
        console.log(`未找到房间 ${roomId} 对应的数据库记录`);
        return;
      }

      // 第一步：在删除前获取消息和白板数据
      const messages = await Message.find({ room: deletedRoom._id }).populate(
        "sender",
        "username"
      );
      const whiteboardData = await WhiteboardObject.find({
        room: deletedRoom._id,
      });

      // 第二步：获取参与者
      let participants = [];
      if (allRoomParticipants[roomId]) {
        participants = [...allRoomParticipants[roomId]];
        delete allRoomParticipants[roomId]; // 获取后清理
      }

      // 第三步：获取创建者的用户名
      const creatorUser = await User.findById(deletedRoom.creator);
      if (creatorUser && !participants.includes(creatorUser.username)) {
        participants.unshift(creatorUser.username); // 确保创建者包含在内
      }

      // 第四步：确定下一个版本号
      const lastRecord = await HistoricalMeeting.findOne({ roomId }).sort({
        version: -1,
      });
      const version = lastRecord ? lastRecord.version + 1 : 1;

      // 第五步：创建历史会议记录
      const historyRecord = new HistoricalMeeting({
        roomId,
        version,
        creator: deletedRoom.creator,
        participants,
        messages: messages.map((m) => ({
          sender: m.sender._id, // 存储发送者的 ObjectId
          message: m.message,
          time: m.time,
        })),
        whiteboardData: whiteboardData.map((w) => w.object),
        createdAt: deletedRoom.createdAt,
        endedAt: new Date(),
      });

      await historyRecord.save();
      console.log(`房间 ${roomId} 的历史会议记录已保存，版本号：${version}`);

      // 第六步：删除房间、消息和白板数据
      await Room.deleteOne({ roomId: roomId });
      console.log(`房间 ${roomId} 已从数据库中删除`);

      await Message.deleteMany({ room: deletedRoom._id });
      console.log(`房间 ${roomId} 的消息已删除`);

      await WhiteboardObject.deleteMany({ room: deletedRoom._id });
      console.log(`房间 ${roomId} 的白板数据已删除`);
    } catch (err) {
      console.error("删除房间或保存历史记录错误:", err);
    }
  }

  // 当用户主动离开房间
  socket.on("leave", async (roomId) => {
    console.log("[SERVER] 用户离开/断开：", socket.id, socket.user?.username);

    if (roomUsers[roomId]) {
      // 从房间中移除该用户
      roomUsers[roomId] = roomUsers[roomId].filter(
        (user) => user.socketId !== socket.id
      );

      // 如果房间中的用户全部离开，清除 roomUsers 中对应的记录，并删除数据库记录
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
        console.log(`房间 ${roomId} 已清空`);

        // 删除房间、消息和白板数据
        deleteRoomData(roomId);
      }
    }

    // 通知其他用户该用户离开
    socket.to(roomId).emit("peer-disconnect", socket.id);
    io.to(roomId).emit("members-updated", roomUsers[roomId]);
    console.log(`用户 ${socket.user.username} 离开了房间 ${roomId}`);
    socket.roomId = null;
  });

  // 当用户断开连接时
  socket.on("disconnect", async () => {
    const roomId = socket.roomId;
    console.log(`用户断开连接：${socket.id} (${socket.user?.username})`);

    if (roomId && roomUsers[roomId]) {
      // 从房间中移除当前用户
      roomUsers[roomId] = roomUsers[roomId].filter(
        (u) => u.socketId !== socket.id
      );

      // 通知其它用户
      socket.to(roomId).emit("peer-disconnect", socket.id);
      io.to(roomId).emit("members-updated", roomUsers[roomId]);

      // 若房间中已无用户，则清除并删除数据库记录
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
        console.log(`房间 ${roomId} 已清空`);

        // 删除数据库中该房间记录及相关数据
        deleteRoomData(roomId);
      }
    }
  });
});

server.listen(8080, () => {
  console.log("服务器已启动，监听端口 8080");
  console.log("请访问 http://localhost:8080");
});
