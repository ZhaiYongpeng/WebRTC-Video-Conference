# WebRTC-Video-Conference
基于 WebRTC、Socket.IO 和 Electron，提供跨平台的音视频通话、即时消息、在线白板及历史记录归档功能。

# 实时多人视频会议 & 白板协作系统

## 🚀 项目概述
本项目是一款基于 **WebRTC**, **Socket.IO**, **Express** 和 **MongoDB** 的实时多人视频会议与在线白板协作系统。支持：
- 纯 Web 浏览器端会议
- 基于 Electron 的 windows 桌面端
- 聊天消息、白板实时同步
- 历史会议归档与回溯

## 🌟 主要功能
- 用户注册 / 登录（JWT 验证）
- 创建/加入带密码保护的会议室
- 音视频通话（回声消除、噪声抑制、自动增益）
- 实时文字聊天
- 在线白板：绘图、撤销/重做、同步
- 会议结束后自动归档历史记录

## 🛠 安装与部署

### 1. 克隆仓库
```bash
git clone https://github.com/ZhaiYongpeng/WebRTC-Video-Conference.git
cd WebRTC-Video-Conference
```

### 2.网页端部署
安装依赖：
```bash
cd web_server
npm install
```

启动服务：
```bash
node server.js
```
服务器/网页端默认监听 http://localhost:8080

### 3.桌面端（Electron）打包
安装依赖并打包：
```bash
cd ../desktop
npm install
npm run build  # 生成windows安装包
```
