// client.js

/**
 * showAlert - 简单的自定义提示框
 * @param {string} message  要显示的文本
 * @param {Function} callback  用户点击“确定”后要执行的回调（可为 null）
 */
function showAlert(message, callback) {
  const overlay = document.getElementById("custom-alert-overlay");
  const box = document.getElementById("custom-alert-box");
  const title = document.getElementById("custom-alert-title");
  const msgElem = document.getElementById("custom-alert-message");
  const btn = document.getElementById("custom-alert-ok");

  if (!overlay || !box || !title || !msgElem || !btn) {
    // 如果页面上没有找到所需元素，则退化回原生 alert
    window.alert(message);
    if (typeof callback === "function") {
      callback();
    }
    return;
  }

  // 1. 设置要显示的消息（如果想隐藏标题，可在这里把 title.style.display = "none"）
  title.innerText = "提示"; // 你可以替换成动态标题，或固定为“提示”
  msgElem.innerText = message;

  // 2. 显示遮罩层和弹窗
  overlay.style.display = "block";
  box.style.display = "block";

  // 3. 给“确定”按钮绑定一次性事件
  const handler = function () {
    // 隐藏遮罩与弹窗
    overlay.style.display = "none";
    box.style.display = "none";
    // 移除当前绑定，避免重复触发
    btn.removeEventListener("click", handler);
    // 执行回调
    if (typeof callback === "function") {
      callback();
    }
  };

  btn.addEventListener("click", handler);
}

// 连接信令服务器，携带 token
const token = localStorage.getItem("token");
if (!token) {
  location.href = "login.html";
}

const socket = io({
  auth: { token },
});

let roomId = null;
let currentRoomPassword = "";

// 全局变量：peerId -> 用户名映射
const peerUsernames = {};

let echoCancellationEnabled = true;
let noiseSuppressionEnabled = true;
let autoGainControlEnabled = true;

let isScreenSharing = false;
let screenTrack = null;

// 新增DOM元素引用
const roomControl = document.getElementById("room-control");
const meetingInterface = document.getElementById("meetingInterface");
const roomIdInput = document.getElementById("roomIdInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const copyLink = document.getElementById("copyLink");
const leaveBtn = document.getElementById("leaveBtn");
const membersContainer = document.getElementById("membersContainer");
const memberCount = document.getElementById("member-count");

// 连接成功提示
socket.on("connect", () => {
  console.log("Socket.io 已连接");
});

socket.on("connect_error", (err) => {
  console.error("连接失败:", err.message);
  showAlert("连接失败：" + err.message);
  location.href = "login.html";
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  location.href = "login.html";
}

// 通用验证方法
const validators = {
  username: (value) => /^[a-zA-Z0-9_-]{3,16}$/.test(value),
  password: (value) => /^[A-Za-z\d]{6,20}$/.test(value),
  roomId: (value) => /^[A-Z0-9]{4,12}$/i.test(value),
};

const historyBtn = document.getElementById("historyBtn");
const historyModal = document.getElementById("historyModal");
const closeHistoryModal = document.getElementById("closeHistoryModal");
const historyList = document.getElementById("historyList");

// 点击查询历史会议按钮时发起请求
historyBtn.addEventListener("click", async () => {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/history", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });
    if (!res.ok) throw new Error("查询历史记录失败");
    const historyRecords = await res.json();

    historyList.innerHTML = "";

    if (historyRecords.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "暂无历史记录";
      tr.appendChild(td);
      historyList.appendChild(tr);
    } else {
      historyRecords.forEach((record) => {
        const tr = document.createElement("tr");

        // 房号
        const tdRoom = document.createElement("td");
        tdRoom.textContent = record.roomId;
        tr.appendChild(tdRoom);

        // 版本
        const tdVersion = document.createElement("td");
        tdVersion.textContent = record.version;
        tr.appendChild(tdVersion);

        // 开始时间
        const tdStart = document.createElement("td");
        tdStart.textContent = new Date(record.createdAt).toLocaleString();
        tr.appendChild(tdStart);

        // 结束时间
        const tdEnded = document.createElement("td");
        tdEnded.textContent = new Date(record.endedAt).toLocaleString();
        tr.appendChild(tdEnded);

        // 成员
        const tdParticipants = document.createElement("td");
        tdParticipants.textContent = Array.isArray(record.participants)
          ? record.participants.join(", ")
          : record.participants;
        tr.appendChild(tdParticipants);

        // 点击显示详细信息
        tr.addEventListener("click", async () => {
          // 获取创建者用户名
          let creatorUsername = "未知用户";
          try {
            const creatorRes = await fetch(`/api/user/${record.creator}`, {
              headers: { Authorization: "Bearer " + token },
            });
            if (creatorRes.ok) {
              const creatorData = await creatorRes.json();
              creatorUsername = creatorData.username;
            }
          } catch (err) {
            console.error("获取创建者用户名失败:", err);
          }

          // 获取消息的发送者用户名
          const messagesWithUsernames = await Promise.all(
            record.messages.map(async (msg) => {
              try {
                const userRes = await fetch(`/api/user/${msg.sender}`, {
                  headers: { Authorization: "Bearer " + token },
                });
                const userData = await userRes.json();
                return {
                  ...msg,
                  sender: userData.username || "未知用户",
                  time: new Date(msg.time).toLocaleString(),
                };
              } catch (err) {
                console.error("获取发送者用户名失败:", err);
                return {
                  ...msg,
                  sender: "未知用户",
                  time: new Date(msg.time).toLocaleString(),
                };
              }
            })
          );

          // 填充模态框内容
          document.getElementById("detailRoomId").textContent = record.roomId;
          document.getElementById("detailVersion").textContent = record.version;
          document.getElementById("detailCreator").textContent =
            creatorUsername;
          document.getElementById("detailParticipants").textContent =
            Array.isArray(record.participants)
              ? record.participants.join(", ")
              : record.participants;
          document.getElementById("detailCreatedAt").textContent = new Date(
            record.createdAt
          ).toLocaleString();
          document.getElementById("detailEndedAt").textContent = new Date(
            record.endedAt
          ).toLocaleString();

          // 渲染聊天消息
          const historyChatWindow =
            document.getElementById("historyChatWindow");
          historyChatWindow.innerHTML = "";
          messagesWithUsernames.forEach((msg) => {
            const messageDiv = document.createElement("div");
            const isSelf = msg.sender === localStorage.getItem("username");
            messageDiv.className = `message-bubble ${
              isSelf ? "self-message" : "other-message"
            }`;
            messageDiv.innerHTML = `
              <div class="message-content">
                <div class="message-header">
                  <span class="username">${msg.sender}</span>
                  <span class="timestamp">${msg.time}</span>
                </div>
                <div class="message-text">${msg.message}</div>
              </div>
            `;
            historyChatWindow.appendChild(messageDiv);
          });
          historyChatWindow.scrollTop = historyChatWindow.scrollHeight;

          // 初始化历史白板画布
          const historyCanvas = new fabric.Canvas("historyWhiteboard", {
            isDrawingMode: false,
          });
          historyCanvas.clear();
          if (record.whiteboardData && record.whiteboardData.length > 0) {
            fabric.util.enlivenObjects(record.whiteboardData, (objects) => {
              objects.forEach((obj) => {
                obj.set({ selectable: false }); // 历史白板只读
                historyCanvas.add(obj);
              });
              historyCanvas.renderAll();
            });
          }

          // 显示详情模态框
          document.getElementById("historyDetailModal").style.display = "block";
        });

        historyList.appendChild(tr);
      });
    }
    historyModal.style.display = "block";
  } catch (err) {
    showAlert("查询历史记录失败: " + err.message);
  }
});

// 点击关闭按钮隐藏模态框
closeHistoryModal.addEventListener("click", () => {
  historyModal.style.display = "none";
});

// 点击模态框外区域也关闭模态框
window.addEventListener("click", (event) => {
  if (event.target === historyModal) {
    historyModal.style.display = "none";
  }
});

// 关闭历史记录详情模态框
document
  .getElementById("closeHistoryDetailModal")
  .addEventListener("click", () => {
    document.getElementById("historyDetailModal").style.display = "none";
    // 清空画布以释放资源
    const historyCanvas = document.getElementById("historyWhiteboard").fabric;
    if (historyCanvas) {
      historyCanvas.clear();
      historyCanvas.dispose();
    }
  });

// 点击模态框外部关闭
window.addEventListener("click", (event) => {
  if (event.target === document.getElementById("historyDetailModal")) {
    document.getElementById("historyDetailModal").style.display = "none";
    const historyCanvas = document.getElementById("historyWhiteboard").fabric;
    if (historyCanvas) {
      historyCanvas.clear();
      historyCanvas.dispose();
    }
  }
});

// 用于保存与其他用户的 RTCPeerConnection 对象（键为对方的 socket id）
const peers = {};

let localStream; // 存储本地媒体流
let videoEnabled = false; // 视频是否开启的标识
let audioEnabled = false; // 音频是否开启的标识

function customPrompt(title = "请输入", placeholder = "") {
  return new Promise((resolve) => {
    const promptContainer = document.getElementById("customPrompt");
    const promptTitle = document.getElementById("customPromptTitle");
    const promptInput = document.getElementById("customPromptInput");
    const confirmButton = document.getElementById("customPromptConfirm");
    const cancelButton = document.getElementById("customPromptCancel");

    promptTitle.textContent = title;
    promptInput.placeholder = placeholder;
    promptInput.value = "";
    promptContainer.style.display = "flex";

    promptInput.focus();

    const cleanUp = () => {
      promptContainer.style.display = "none";
      confirmButton.removeEventListener("click", onConfirm);
      cancelButton.removeEventListener("click", onCancel);
      promptInput.removeEventListener("keydown", onKeyDown);
    };

    const onConfirm = () => {
      const value = promptInput.value.trim();
      cleanUp();
      resolve(value);
    };

    const onCancel = () => {
      cleanUp();
      resolve(null); // 如果取消，则返回 null
    };

    const onKeyDown = (event) => {
      if (event.key === "Enter") {
        onConfirm();
      } else if (event.key === "Escape") {
        onCancel();
      }
    };

    confirmButton.addEventListener("click", onConfirm);
    cancelButton.addEventListener("click", onCancel);
    promptInput.addEventListener("keydown", onKeyDown);
  });
}

function customConfirm(title = "确认操作？") {
  return new Promise((resolve) => {
    const confirmContainer = document.getElementById("customConfirm");
    const confirmTitle = document.getElementById("customConfirmTitle");
    const confirmButton = document.getElementById("customConfirmConfirm");
    const cancelButton = document.getElementById("customConfirmCancel");

    confirmTitle.textContent = title;
    confirmContainer.style.display = "flex";

    const cleanUp = () => {
      confirmContainer.style.display = "none";
      confirmButton.removeEventListener("click", onConfirm);
      cancelButton.removeEventListener("click", onCancel);
    };

    const onConfirm = () => {
      cleanUp();
      resolve(true); // 用户点击“确认”
    };

    const onCancel = () => {
      cleanUp();
      resolve(false); // 用户点击“取消”
    };

    confirmButton.addEventListener("click", onConfirm);
    cancelButton.addEventListener("click", onCancel);
  });
}

// 在DOM加载完成后立即执行
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const roomId = params.get("room");
  const username = localStorage.getItem("username");
  if (!username) {
    showAlert("请先登录");
    location.href = "login.html";
    return;
  }
  // 显示用户信息
  document.getElementById("currentUser").textContent = username;
  document.getElementById("localUsername").textContent = username;

  if (roomId) {
    const input = document.getElementById("roomIdInput");
    input.value = roomId;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const username = localStorage.getItem("username") || "我自己";
  document.getElementById("localUsername").textContent = username;
  updateAudioButtons();
});

// 放大预览元素引用
const videoFullscreen = document.getElementById("video-fullscreen");
const fullscreenVideo = document.getElementById("fullscreenVideo");
const closeFullscreen = document.getElementById("closeFullscreen");

// 绑定关闭按钮
closeFullscreen.addEventListener("click", () => {
  videoFullscreen.style.display = "none";
  fullscreenVideo.srcObject = null;
});

// 注册点击本地视频放大
document.getElementById("localVideo").addEventListener("click", (e) => {
  fullscreenVideo.srcObject = e.target.srcObject;
  videoFullscreen.style.display = "flex";
});

// 保存延迟数据的全局对象
const latencyData = {}; // peerId -> latency (ms)

// 获取并更新所有对等连接的网络延迟
async function updateNetworkLatency() {
  for (const peerId in peers) {
    const pc = peers[peerId];
    try {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (
          report.type === "candidate-pair" &&
          report.nominated &&
          report.state === "succeeded"
        ) {
          if (report.currentRoundTripTime !== undefined) {
            // 将秒转换为毫秒
            latencyData[peerId] = Math.round(
              report.currentRoundTripTime * 1000
            );
          }
        }
      });
    } catch (err) {
      console.error(`获取 ${peerId} 的延迟数据失败:`, err);
      latencyData[peerId] = null; // 出错时设为null
    }
  }
  updateLatencyDisplay(); // 更新界面显示
}

// 每秒更新一次延迟数据
setInterval(updateNetworkLatency, 1000);

// 1. 获取本地音视频流
async function initLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: echoCancellationEnabled,
        noiseSuppression: noiseSuppressionEnabled,
        autoGainControl: autoGainControlEnabled,
      },
    });
    console.log("获取到本地媒体流:", localStream);
    // 进入房间时，默认关闭视频和音频轨道
    localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    // 显示本地视频预览
    document.getElementById("localVideo").srcObject = localStream;
    updateButtonState();
    updateAudioButtons();
  } catch (err) {
    console.error("获取媒体流失败：", err);
  }
}

document.getElementById("toggleAEC").addEventListener("click", async () => {
  try {
    echoCancellationEnabled = !echoCancellationEnabled;
    console.log("AEC toggled to:", echoCancellationEnabled);
    await restartAudioStream();
    updateAudioButtons();
  } catch (err) {
    console.error("Failed to toggle AEC:", err);
    showAlert("无法更改回声消除设置，请检查设备权限");
  }
});

document.getElementById("toggleANS").addEventListener("click", async () => {
  try {
    noiseSuppressionEnabled = !noiseSuppressionEnabled;
    console.log("ANS toggled to:", noiseSuppressionEnabled);
    await restartAudioStream();
    updateAudioButtons();
  } catch (err) {
    console.error("Failed to toggle ANS:", err);
    showAlert("无法更改噪声抑制设置，请检查设备权限");
  }
});

document.getElementById("toggleAGC").addEventListener("click", async () => {
  try {
    autoGainControlEnabled = !autoGainControlEnabled;
    console.log("AGC toggled to:", autoGainControlEnabled);
    await restartAudioStream();
    updateAudioButtons();
  } catch (err) {
    console.error("Failed to toggle AGC:", err);
    showAlert("无法更改自动增益设置，请检查设备权限");
  }
});

function updateAudioButtons() {
  const aecBtn = document.getElementById("toggleAEC");
  const ansBtn = document.getElementById("toggleANS");
  const agcBtn = document.getElementById("toggleAGC");

  aecBtn.textContent = echoCancellationEnabled
    ? "关闭回声消除"
    : "开启回声消除";
  ansBtn.textContent = noiseSuppressionEnabled
    ? "关闭噪声抑制"
    : "开启噪声抑制";
  agcBtn.textContent = autoGainControlEnabled ? "关闭自动增益" : "开启自动增益";

  aecBtn.classList.toggle("active", echoCancellationEnabled);
  ansBtn.classList.toggle("active", noiseSuppressionEnabled);
  agcBtn.classList.toggle("active", autoGainControlEnabled);
}

async function restartAudioStream() {
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: echoCancellationEnabled,
        noiseSuppressionEnabled: noiseSuppressionEnabled,
        autoGainControl: autoGainControlEnabled, // 修正：确保使用当前值
      },
    });

    const newAudioTrack = newStream.getAudioTracks()[0];

    localStream.getAudioTracks().forEach((track) => {
      localStream.removeTrack(track);
      track.stop();
    });
    localStream.addTrack(newAudioTrack);

    for (let peerId in peers) {
      const sender = peers[peerId]
        .getSenders()
        .find((s) => s.track?.kind === "audio");
      if (sender) {
        await sender.replaceTrack(newAudioTrack);
      }
    }

    console.log("Audio stream restarted with settings:", {
      echoCancellationEnabled,
      noiseSuppressionEnabled,
      autoGainControlEnabled,
    });
  } catch (err) {
    console.error("Failed to restart audio stream:", err);
    throw err; // 让调用者处理错误
  }
}

document
  .getElementById("toggleScreenShare")
  .addEventListener("click", async () => {
    if (!isScreenSharing) {
      await startScreenShare();
    } else {
      await stopScreenShare();
    }
    updateScreenShareButton();
  });

async function startScreenShare() {
  try {
    let stream;

    // 尝试使用Electron API
    if (window.electronAPI) {
      const sources = await window.electronAPI.getScreenSources();
      const source = sources[0];

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
          },
        },
      });
    }
    // 回退到标准浏览器API
    else {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    }

    screenTrack = stream.getVideoTracks()[0];
    document.getElementById("localVideo").srcObject = stream;

    const sender = findSender("video");
    if (sender) await sender.replaceTrack(screenTrack);

    isScreenSharing = true;
    updateScreenShareButton();

    // 通知其他用户
    socket.emit("screen-sharing-started", {
      peerId: socket.id,
      username: localStorage.getItem("username"),
    });

    screenTrack.onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    console.error("屏幕共享失败：", err);
  }
}

// 处理其他用户开始屏幕共享
socket.on("screen-sharing-started", ({ peerId, username }) => {
  console.log(`用户 ${username} 开始屏幕共享`);

  // 隐藏视频元素，显示屏幕共享提示
  const videoContainer = document.getElementById(`container-${peerId}`);
  if (videoContainer) {
    const video = videoContainer.querySelector("video");
    video.style.display = "none";

    const sharingLabel = document.createElement("div");
    sharingLabel.className = "screen-sharing-label";
    sharingLabel.textContent = `${username} 正在共享屏幕`;
    videoContainer.appendChild(sharingLabel);
  }
});

// 处理其他用户停止屏幕共享
socket.on("screen-sharing-stopped", (peerId) => {
  console.log(`用户 ${peerId} 停止屏幕共享`);

  const videoContainer = document.getElementById(`container-${peerId}`);
  if (videoContainer) {
    const video = videoContainer.querySelector("video");
    video.style.display = "block";

    const sharingLabel = videoContainer.querySelector(".screen-sharing-label");
    if (sharingLabel) {
      sharingLabel.remove();
    }
  }
});

// 处理初始屏幕共享状态
socket.on("screen-sharing-status", (screenSharers) => {
  screenSharers.forEach(({ peerId, username }) => {
    const videoContainer = document.getElementById(`container-${peerId}`);
    if (videoContainer) {
      const video = videoContainer.querySelector("video");
      video.style.display = "none";

      const sharingLabel = document.createElement("div");
      sharingLabel.className = "screen-sharing-label";
      sharingLabel.textContent = `${username} 正在共享屏幕`;
      videoContainer.appendChild(sharingLabel);
    }
  });
});

async function stopScreenShare() {
  try {
    // 停止屏幕共享轨道
    if (screenTrack) {
      screenTrack.stop();
      screenTrack = null;
    }

    // 仅在视频应启用时恢复摄像头流
    if (videoEnabled) {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      // 替换对等连接中的视频轨道
      const videoSender = findSender("video");
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }

      // 更新本地流
      localStream.removeTrack(localStream.getVideoTracks()[0]);
      localStream.addTrack(newVideoTrack);
    } else {
      // 如果视频不应启用，移除视频轨道或保持禁用状态
      const videoSender = findSender("video");
      if (videoSender) {
        await videoSender.replaceTrack(null); // 移除视频轨道
      }
      // 如果本地流中仍有视频轨道，确保其禁用
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    // 更新本地视频预览
    document.getElementById("localVideo").srcObject = localStream;

    // 重置屏幕共享状态
    isScreenSharing = false;
    updateScreenShareButton();

    // 通知其他用户屏幕共享已停止
    socket.emit("screen-sharing-stopped", socket.id);
  } catch (err) {
    console.error("恢复摄像头失败：", err);
  }
}

function findSender(kind) {
  for (let peerId in peers) {
    const sender = peers[peerId]
      .getSenders()
      .find((s) => s.track && s.track.kind === kind);
    if (sender) return sender;
  }
  return null;
}

function updateScreenShareButton() {
  const btn = document.getElementById("toggleScreenShare");
  btn.textContent = isScreenSharing ? "停止共享屏幕" : "开始共享屏幕";
  btn.classList.toggle("active", isScreenSharing);
}

// 2. 初始化函数：获取媒体流后加入房间
async function init(isCreator = false) {
  try {
    await initLocalStream();
    // 显示会议界面
    roomControl.style.display = "none";
    meetingInterface.style.display = "block";
    // 加入房间
    const username = localStorage.getItem("username"); // 登录成功后有保存
    socket.emit("join", roomId, username);
    console.warn("[JOIN] 向服务器发送 join 请求", roomId, username);
    // 显示房间号
    document.getElementById("currentRoom").textContent = `房间号：${roomId}`;
    // 如果URL中有房间号参数自动填充
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("room")) {
      roomIdInput.value = urlParams.get("room");
    }
  } catch (err) {
    console.error("初始化失败:", err);
    showAlert("无法启动摄像头/麦克风，请检查权限设置");
  }
}

async function checkRoom(roomId) {
  const res = await fetch(`/api/check-room/${roomId}`);
  return res.json();
}

// 创建房间事件
createBtn.addEventListener("click", async () => {
  roomId = roomIdInput.value || generateRoomId();

  if (!validators.roomId(roomId)) {
    showAlert("房间号必须为4-12位字母或数字");
    return;
  }

  try {
    const { exists } = await checkRoom(roomId);
    if (exists) {
      const join = await customConfirm("房间已存在，是否加入？");
      if (!join) return;
      return handleJoinRoom();
    }

    const password = await customPrompt(
      "设置房间密码（可选）",
      "6-20位字母/数字",
      { inputType: "password", minLength: 6, maxLength: 20 }
    );

    // 检查用户是否点击了“取消”
    if (password === null) {
      showAlert("已取消创建房间");
      return; // 终止房间创建流程
    }

    // 验证密码（如果用户输入了密码）
    if (password && !validators.password(password)) {
      showAlert("密码需至少6位且包含字母或数字");
      return;
    }

    const creationResult = await new Promise((resolve) => {
      socket.emit("create-room", { roomId, password }, resolve);
    });

    if (!creationResult.success) throw new Error(creationResult.message);
    await init(true);
  } catch (err) {
    showAlert(`创建失败: ${err.message}`);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "创建房间";
  }
});

// 通用加入房间处理
async function handleJoinRoom(password = "") {
  try {
    const { requiresPassword } = await checkRoom(roomId);

    if (requiresPassword) {
      const inputPassword =
        password || (await customPrompt("该房间需要密码，请输入密码"));
      const verification = await new Promise((resolve) => {
        socket.emit(
          "verify-password",
          { roomId, password: inputPassword },
          resolve
        );
      });

      if (!verification.success) {
        throw new Error(verification.message);
      }
    }

    await init();
  } catch (err) {
    showAlert(`加入失败: ${err.message}`);
  }
}

// 加入房间事件
joinBtn.addEventListener("click", async () => {
  roomId = roomIdInput.value.trim();
  if (!roomId) {
    showAlert("请输入房间号");
    return;
  }
  if (!validators.roomId(roomId)) {
    showAlert("房间号必须为4-12位字母或数字");
    return;
  }

  try {
    const { exists, requiresPassword } = await checkRoom(roomId);

    if (!exists) {
      showAlert("房间不存在，请检查房间号是否正确");
      return;
    }

    if (requiresPassword) {
      const password = await customPrompt("该房间需要密码，请输入密码");
      if (!password) return;

      const verification = await new Promise((resolve) => {
        socket.emit("verify-password", { roomId, password }, resolve);
      });

      if (!verification.success) {
        throw new Error(verification.message);
      }
    }

    joinBtn.disabled = true;
    joinBtn.textContent = "加入中...";
    await init();
  } catch (err) {
    showAlert(err.message);
    meetingInterface.style.display = "none";
    roomControl.style.display = "block";
  } finally {
    joinBtn.disabled = false;
    joinBtn.textContent = "加入房间";
  }
});

// 新增复制链接功能
copyLink.addEventListener("click", () => {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const url = `${baseUrl}?room=${roomId}`;
  navigator.clipboard.writeText(url).then(() => {
    showAlert("链接已复制到剪贴板");
  });
});

// 用户列表更新功能
socket.on("members-updated", (members) => {
  membersContainer.innerHTML = "";
  members.forEach((member) => {
    const div = document.createElement("div");
    div.className = "member-item";
    div.textContent = `用户 ${member.username}`;
    membersContainer.appendChild(div);
  });
  memberCount.textContent = members.length;
});

// 生成随机房间号
function generateRoomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// 创建 RTCPeerConnection 连接，并添加本地流轨道
function createPeerConnection(peerId) {
  // 配置 STUN 服务器（帮助 NAT 穿透）
  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // 如有 TURN 服务器，可添加：
      // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
    ],
  };

  const pc = new RTCPeerConnection(config);

  // 将本地流中的所有轨道添加到连接中
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
    console.log("已添加轨道:", track);
  });

  pc.oniceconnectionstatechange = () => {
    console.log("ICE 连接状态变化:", pc.iceConnectionState);
  };

  // 当产生 ICE candidate 时，发送给对端
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", {
        to: peerId,
        from: socket.id,
        signal: { candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    console.log("ontrack 事件触发，远程流:", event.streams[0]);

    // 尝试获取已存在的远端视频容器
    let videoContainer = document.getElementById(`container-${peerId}`);
    if (!videoContainer) {
      // 创建容器并指定统一的 CSS 类
      videoContainer = document.createElement("div");
      videoContainer.id = `container-${peerId}`;
      videoContainer.className = "video-container"; // 使用已有的样式类

      // 创建 video 元素
      const remoteVideo = document.createElement("video");
      remoteVideo.id = peerId;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.srcObject = event.streams[0];

      // 添加点击事件，用于放大远程视频
      remoteVideo.addEventListener("click", () => {
        fullscreenVideo.srcObject = remoteVideo.srcObject;
        videoFullscreen.style.display = "flex";
      });

      // 创建用户名标签，并应用统一样式
      const usernameLabel = document.createElement("div");
      usernameLabel.className = "username-label"; // 使用统一样式标签
      usernameLabel.innerText = peerUsernames[peerId] || "未知用户";

      // 添加延迟显示元素
      const latencyDisplay = document.createElement("div");
      latencyDisplay.id = `latency-${peerId}`;
      latencyDisplay.className = "latency-display";
      latencyDisplay.innerText = "延迟: -- ms";

      // 组装远端视频容器
      videoContainer.appendChild(remoteVideo);
      videoContainer.appendChild(usernameLabel);
      videoContainer.appendChild(latencyDisplay); // 添加到容器
      document.getElementById("remoteVideos").appendChild(videoContainer);
    }
  };

  return pc;
}

function updateLatencyDisplay() {
  // 更新远程视频的延迟
  for (const peerId in latencyData) {
    const latencyElement = document.getElementById(`latency-${peerId}`);
    if (latencyElement) {
      const latency = latencyData[peerId];
      latencyElement.innerText =
        latency !== null ? `延迟: ${latency} ms` : "延迟: -- ms";
      updateLatencyColor(latencyElement, latency);
    }
  }

  // 更新本地视频的延迟（通常为0）
  const localLatencyElement = document.getElementById("latency-local");
  if (localLatencyElement) {
    localLatencyElement.innerText = "延迟: 0 ms";
    updateLatencyColor(localLatencyElement, 0);
  }
}

function updateLatencyColor(element, latency) {
  element.classList.remove("latency-low", "latency-medium", "latency-high");
  if (latency === null || latency === undefined) return;
  if (latency < 100) {
    element.classList.add("latency-low");
  } else if (latency <= 300) {
    element.classList.add("latency-medium");
  } else {
    element.classList.add("latency-high");
  }
}

// 当有新用户加入房间时（由服务器通知），建立连接并发送 offer
socket.on("new-peer", async ({ peerId, username }) => {
  console.warn("[NEW PEER] 来自服务器的新 peer 请求:", peerId, username);
  peerUsernames[peerId] = username;
  console.log("发现新用户:", peerId, "用户名:", username);

  const pc = createPeerConnection(peerId);
  console.log(`已创建 PeerConnection [${peerId}]`, pc);
  peers[peerId] = pc;

  // 创建 Offer
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 发送 Offer 信令
    socket.emit("signal", {
      to: peerId,
      from: socket.id,
      signal: { sdp: pc.localDescription },
    });
    console.log("已发送 offer:", pc.localDescription);
  } catch (err) {
    console.error("创建 Offer 失败:", err);
  }
});

socket.on("existing-users", (users) => {
  users.forEach(({ socketId, username }) => {
    peerUsernames[socketId] = username;
    console.log(`已有用户：${socketId} -> 用户名：${username}`);
  });
  console.log("现有用户列表:", peerUsernames);
});

// 处理接收到的信令消息（offer、answer 或 ICE candidate）
socket.on("signal", async (data) => {
  const { from, signal } = data;

  if (from === socket.id) return;

  let pc = peers[from];
  if (!pc) {
    console.log("为未知对端创建连接:", from);
    pc = createPeerConnection(from);
    peers[from] = pc;
  }

  // 初始化缓存（关键）
  if (!pc.pendingCandidates) pc.pendingCandidates = [];
  if (typeof pc.remoteDescriptionSet !== "boolean")
    pc.remoteDescriptionSet = false;

  try {
    if (signal.sdp) {
      console.log("接收到 SDP:", signal.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      pc.remoteDescriptionSet = true;
      console.log("已设置远程描述 (remoteDescription):", signal.sdp);

      // 处理缓存的 ICE candidate
      pc.pendingCandidates.forEach(async (candidate) => {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.error("添加缓存的 ICE candidate 失败:", err);
        }
      });
      pc.pendingCandidates = [];

      if (signal.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", {
          to: from,
          from: socket.id,
          signal: { sdp: pc.localDescription },
        });
        console.log("[接收方] 已发送 answer:", pc.localDescription);
      }
    } else if (signal.candidate) {
      const candidate = new RTCIceCandidate(signal.candidate);

      if (pc.remoteDescriptionSet) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.error("添加 ICE candidate 失败:", err);
        }
      } else {
        pc.pendingCandidates.push(candidate);
      }
    }
  } catch (err) {
    console.error("信令处理错误:", err);
  }
});

// 离开房间功能
leaveBtn.addEventListener("click", async () => {
  if (await customConfirm("确定要离开房间吗？")) {
    // 关闭所有 Peer 连接
    Object.keys(peers).forEach((socketId) => {
      peers[socketId].close();
      delete peers[socketId];
      // 移除对应的远端视频容器
      const container = document.getElementById(`container-${socketId}`);
      if (container) container.remove();
    });

    // 清空 peer 映射
    Object.keys(peerUsernames).forEach((key) => delete peerUsernames[key]);

    // 停止本地媒体流
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      document.getElementById("localVideo").srcObject = null;
    }

    // 通知服务器离开房间（确保 roomId 有效）
    if (roomId) {
      socket.emit("leave", roomId);
    }

    // 重置客户端状态
    roomId = null;
    meetingInterface.style.display = "none";
    roomControl.style.display = "block";
    document.getElementById("currentRoom").textContent = "";
    document.getElementById("membersContainer").innerHTML = "";

    // 清空聊天记录
    document.getElementById("chat-window").innerHTML = "";

    // 移除 URL 中的房间参数
    window.history.replaceState({}, document.title, window.location.pathname);

    // 强制刷新页面或手动重建 socket
    location.reload(); // 让用户重新进入页面时重新创建 socket（产生新 socket.id）
  }
});

// 当其他用户离开时，清理对应的连接和页面元素
socket.on("peer-disconnect", (disconnectedPeerId) => {
  console.log(`收到断开通知: ${disconnectedPeerId}`);

  // 关闭对应的 PeerConnection
  if (peers[disconnectedPeerId]) {
    const pc = peers[disconnectedPeerId];
    // 解除所有事件监听防止内存泄漏
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.oniceconnectionstatechange = null;
    pc.close();
    delete peers[disconnectedPeerId];
    console.log(`已关闭与 ${disconnectedPeerId} 的 PeerConnection`);
  }

  // 移除对应的视频容器（精确匹配容器ID）
  const container = document.getElementById(`container-${disconnectedPeerId}`);
  if (container) {
    container.remove();
    console.log(`已移除 ${disconnectedPeerId} 的视频容器`);
  }

  // 清理用户名映射
  delete peerUsernames[disconnectedPeerId];
});

// 5. 音视频开关控制

// 统一更新按钮状态
function updateButtonState() {
  const videoButton = document.getElementById("toggleVideo");
  const audioButton = document.getElementById("toggleAudio");

  videoButton.textContent = videoEnabled ? "关闭视频" : "开启视频";
  audioButton.textContent = audioEnabled ? "关闭音频" : "开启音频";

  // 可选：添加视觉样式变化
  videoButton.classList.toggle("active", videoEnabled);
  audioButton.classList.toggle("active", audioEnabled);
}

// 视频切换处理
document.getElementById("toggleVideo").addEventListener("click", () => {
  videoEnabled = !videoEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = videoEnabled;
  });
  updateButtonState();
});

// 音频切换处理
document.getElementById("toggleAudio").addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = audioEnabled;
  });
  updateButtonState();
});

// 绑定发送按钮点击事件
document.getElementById("chat-send").addEventListener("click", () => {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;

  // 只发送给服务器，不提前显示
  socket.emit("chat message", {
    room: roomId,
    message: message,
  });

  // 清空输入框
  input.value = "";
});

// 处理接收到的聊天消息（包含自己和他人的消息）
socket.on("chat message", (data) => {
  const isSelf = data.sender === localStorage.getItem("username");
  appendMessage(data, isSelf);
});

function appendMessage(data, isSelf) {
  const chatWindow = document.getElementById("chat-window");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message-bubble ${
    isSelf ? "self-message" : "other-message"
  }`;

  // 格式化时间为年月日时分秒
  const formattedTime = new Date(data.time).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // 气泡内容：用户名、时间、消息
  messageDiv.innerHTML = `
    <div class="message-content">
      <div class="message-header">
        <span class="username">${data.sender}</span>
        <span class="timestamp">${formattedTime}</span>
      </div>
      <div class="message-text">${data.message}</div>
    </div>
  `;

  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// 系统消息追加
function appendSystemMessage(message) {
  const chatWindow = document.getElementById("chat-window");
  const systemMessageDiv = document.createElement("div");
  systemMessageDiv.className = "system-message";
  systemMessageDiv.textContent = message;

  chatWindow.appendChild(systemMessageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// 当按下 Enter 键时发送消息
document.getElementById("chat-input").addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    document.getElementById("chat-send").click();
  }
});

// 初始化 Fabric.js
const canvas = new fabric.Canvas("whiteboard", { isDrawingMode: true });
canvas.freeDrawingBrush.width = 2;
canvas.freeDrawingBrush.color = "#000000";

// 历史记录栈
let undoStack = [];
let redoStack = [];
let isProcessingChange = false; // 防止连续操作冲突
let isUndoRedo = false; // 标记当前是否在执行撤销/重做操作

// 工具栏事件绑定
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("redoBtn").addEventListener("click", redo);
document.getElementById("clearBtn").addEventListener("click", clearCanvas);
document.getElementById("colorPicker").addEventListener("input", (e) => {
  canvas.freeDrawingBrush.color = e.target.value;
});
document.getElementById("brushSize").addEventListener("input", (e) => {
  canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
});

// 工具函数：生成唯一 ID
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 每次操作（新增、修改、删除）时记录变更
function recordChange(type, object) {
  if (isProcessingChange) return;
  // 克隆状态，防止后续修改
  const clonedState = object.toObject(["id", "userId"]);
  const changeRecord = { type, object: clonedState };
  undoStack.push(changeRecord);
  // 如非撤销／重做操作，新操作发生时清空 redoStack
  if (!isUndoRedo) {
    redoStack = [];
  }
}

//
// 根据操作记录“还原”一次操作（用于 undo）
//
function revertChange(change) {
  if (change.type === "add") {
    // 撤销“添加”：从 canvas 中移除该对象
    const target = canvas.getObjects().find((o) => o.id === change.object.id);
    if (target) {
      canvas.remove(target);
      canvas.renderAll();
      // 通知服务器：当前用户移除了该对象
      socket.emit("whiteboard:remove", {
        room: roomId,
        objectId: change.object.id,
      });
    }
  } else if (change.type === "remove") {
    // 撤销“删除”：将对象重新添加到 canvas 中
    fabric.util.enlivenObjects([change.object], function (objects) {
      objects.forEach(function (obj) {
        obj.set({
          id: change.object.id,
          userId: change.object.userId,
        });
        canvas.add(obj);
      });
      canvas.renderAll();
      socket.emit("whiteboard:add", {
        room: roomId,
        object: change.object,
      });
    });
  } else if (change.type === "update") {
    // 撤销“更新”：将对象状态还原为记录时的状态
    const target = canvas.getObjects().find((o) => o.id === change.object.id);
    if (target) {
      target.set(change.object);
      canvas.renderAll();
      socket.emit("whiteboard:update", {
        room: roomId,
        object: change.object,
      });
    }
  }
}

//
// 根据操作记录“重做”一次操作（用于 redo）
//
function applyChange(change) {
  if (change.type === "add") {
    // 重做“添加”：重新在 canvas 中加入该对象
    fabric.util.enlivenObjects([change.object], function (objects) {
      objects.forEach(function (obj) {
        obj.set({
          id: change.object.id,
          userId: change.object.userId,
        });
        canvas.add(obj);
      });
      canvas.renderAll();
      socket.emit("whiteboard:add", {
        room: roomId,
        object: change.object,
      });
    });
  } else if (change.type === "remove") {
    // 重做“删除”：从 canvas 中移除该对象
    const target = canvas.getObjects().find((o) => o.id === change.object.id);
    if (target) {
      canvas.remove(target);
      canvas.renderAll();
      socket.emit("whiteboard:remove", {
        room: roomId,
        objectId: change.object.id,
      });
    }
  } else if (change.type === "update") {
    // 重做“更新”：更新对象为记录中的状态
    const target = canvas.getObjects().find((o) => o.id === change.object.id);
    if (target) {
      target.set(change.object);
      canvas.renderAll();
      socket.emit("whiteboard:update", {
        room: roomId,
        object: change.object,
      });
    }
  }
}

let isRedoing = false;

// 保存当前状态到撤销栈
function saveState() {
  if (isRestoring || isRedoing) return; // 如果正在撤销/重做时，不清空 redoStack
  const myObjects = canvas
    .getObjects()
    .filter((obj) => obj.userId === socket.id);
  const json = JSON.stringify(
    myObjects.map((obj) => {
      const base = obj.toObject();
      base.id = obj.id;
      base.userId = obj.userId;
      return base;
    })
  );
  undoStack.push(json);
  redoStack = []; // 新操作时清空 redoStack
}

//
// 撤销按钮处理函数
//
function undo() {
  if (undoStack.length === 0) return;
  isProcessingChange = true;
  // 弹出最后一次操作
  const lastChange = undoStack.pop();
  // 将之推入 redoStack，方便后续重做
  redoStack.push(lastChange);
  isUndoRedo = true;
  // 执行撤销处理：将操作还原
  revertChange(lastChange);
  isUndoRedo = false;
  isProcessingChange = false;
  console.log("undo执行后，undoStack:", undoStack, " redoStack:", redoStack);
}

//
// 重做按钮处理函数
//
function redo() {
  if (redoStack.length === 0) {
    console.log("redoStack为空，无法重做");
    return;
  }
  isProcessingChange = true;
  const changeToRedo = redoStack.pop();
  // 将该操作重新推回撤销栈，保证连续操作的正确性
  undoStack.push(changeToRedo);
  isUndoRedo = true;
  applyChange(changeToRedo);
  isUndoRedo = false;
  isProcessingChange = false;
  console.log("redo执行后，undoStack:", undoStack, " redoStack:", redoStack);
}

// 删除对象并同步
function removeObject(objectId, isUndo = false) {
  const obj = canvas.getObjects().find((o) => o.id === objectId);
  if (!obj) return;

  canvas.remove(obj);
  if (!isUndo) recordChange("remove", obj);

  // 触发同步
  socket.emit("whiteboard:remove", {
    room: roomId,
    objectId: obj.id,
  });
}

// 恢复对象并同步
function restoreState(state, callback) {
  console.log("restoreState收到的state:", state, "类型：", typeof state);
  isRestoring = true;
  let stateData;
  if (typeof state === "string") {
    try {
      stateData = JSON.parse(state);
    } catch (e) {
      console.error("JSON解析失败:", e);
      isRestoring = false;
      return;
    }
  } else {
    stateData = state;
  }

  // 移除当前用户所有对象
  const myObjects = canvas
    .getObjects()
    .filter((obj) => obj.userId === socket.id);
  myObjects.forEach((obj) => {
    socket.emit("whiteboard:remove", { room: roomId, objectId: obj.id });
    canvas.remove(obj);
  });

  // 恢复状态
  fabric.util.enlivenObjects(stateData, (objects) => {
    objects.forEach((obj, index) => {
      const stateObj = stateData[index];
      obj.set({
        id: stateObj.id,
        userId: stateObj.userId,
      });
      canvas.add(obj);
    });
    canvas.renderAll();
    isRestoring = false;
    // 如果不是重做操作，才调用保存状态，从而清空 redoStack
    if (!isRedoing) {
      saveState();
    }
    if (callback) callback();
  });
}

// 回滚对象修改
function revertObjectUpdate(prevObjData) {
  const target = canvas.getObjects().find((o) => o.id === prevObjData.id);
  if (target) {
    target.set(prevObjData);
    canvas.renderAll();

    // 触发同步
    socket.emit("whiteboard:update", {
      room: roomId,
      object: prevObjData,
    });
  }
}

// 清空画布
function clearCanvas() {
  const myObjects = canvas
    .getObjects()
    .filter((obj) => obj.userId === socket.id);
  myObjects.forEach((obj) => {
    socket.emit("whiteboard:remove", { room: roomId, objectId: obj.id });
    canvas.remove(obj);
  });
  canvas.renderAll();
  saveState();
  broadcastMyObjects(); // 清空后广播
}

// 新建路径时记录“添加”操作，并同步发送给服务器
canvas.on("path:created", (e) => {
  const obj = e.path;
  obj.id = generateId();
  obj.userId = socket.id;
  recordChange("add", obj);
  // 同时向服务器发送新增白板对象
  socket.emit("whiteboard:add", {
    room: roomId,
    object: obj.toObject(["id", "userId"]),
  });
});

// 对象修改后记录“更新”操作
canvas.on("object:modified", (e) => {
  // 记录更新操作。注意：这里可能需要记录修改前状态，如果需要精确 undo，建议额外存储修改前的状态。
  recordChange("update", e.target);
  socket.emit("whiteboard:update", {
    room: roomId,
    object: e.target.toObject(["id", "userId"]),
  });
});

function removeObjectById(objectId) {
  const obj = canvas.getObjects().find((o) => o.id === objectId);
  if (!obj) return;
  recordChange("remove", obj);
  canvas.remove(obj);
  canvas.renderAll();
  socket.emit("whiteboard:remove", {
    room: roomId,
    objectId: obj.id,
  });
}

canvas.on("object:removed", function (event) {
  if (isRestoring) return; // 忽略恢复过程中的移除事件

  // 正常处理对象移除同步
  const objectId = event.target.id;
  socket.emit("whiteboard:remove", { room: roomId, objectId });
});

// 接收新用户初始白板数据
socket.on("whiteboard:init", (objects) => {
  isRestoring = true;
  canvas.clear();
  fabric.util.enlivenObjects(objects, (enlivenedObjects) => {
    enlivenedObjects.forEach((obj) => canvas.add(obj));
    canvas.renderAll();
    isRestoring = false;
    saveState();
  });
});

// 接收服务端同步事件
socket.on("whiteboard:add", (object) => {
  // 当其他用户增加对象时，将其加入白板，避免重复添加自己的操作
  if (object.userId === socket.id) return;
  fabric.util.enlivenObjects([object], (objects) => {
    objects.forEach((obj) => {
      obj.set({ id: object.id, userId: object.userId });
      canvas.add(obj);
    });
    canvas.renderAll();
  });
});

socket.on("whiteboard:update", (object) => {
  const target = canvas.getObjects().find((o) => o.id === object.id);
  if (target) {
    target.set(object);
    canvas.renderAll();
  }
});

socket.on("whiteboard:remove", (objectId) => {
  const target = canvas.getObjects().find((o) => o.id === objectId);
  if (target) {
    canvas.remove(target);
    canvas.renderAll();
  }
});

function broadcastMyObjects() {
  const myObjects = canvas
    .getObjects()
    .filter((obj) => obj.userId === socket.id);
  const payload = myObjects.map((obj) => obj.toObject(["id", "userId"]));
  socket.emit("whiteboard:sync", {
    room: roomId,
    objects: payload,
  });
}

socket.on("whiteboard:sync", (data) => {
  const { userId, objects } = data;
  const userObjects = canvas
    .getObjects()
    .filter((obj) => obj.userId === userId);
  userObjects.forEach((obj) => canvas.remove(obj));

  fabric.util.enlivenObjects(objects, (enlivenedObjects) => {
    enlivenedObjects.forEach((obj) => {
      obj.userId = userId;
      canvas.add(obj);
    });
    canvas.renderAll();
  });
});
