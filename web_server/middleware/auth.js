const jwt = require("jsonwebtoken");
const User = require("../models/user");

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "无效的 Token，请重新登录" });
  }
  try {
    const decoded = jwt.verify(token, "your_jwt_secret");
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) {
      return res.status(401).json({ message: "用户不存在" });
    }
    next();
  } catch (error) {
    res.status(401).json({ message: "Token 验证失败" });
  }
};

module.exports = authMiddleware;
