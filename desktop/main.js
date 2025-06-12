const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
  Menu,
} = require("electron");
const path = require("path");
const prompt = require("electron-prompt"); // 新增：引入 electron-prompt

// 顶层声明，确保菜单回调能访问到
let win = null;
// 默认的远程地址，可以根据实际情况改成配置文件读取等
let currentRemoteURL = "http://localhost:8080";

app.commandLine.appendSwitch("disable-gpu"); // 禁用 GPU
app.commandLine.appendSwitch("disable-software-rasterizer"); // 禁用软件光栅化
app.commandLine.appendSwitch("enable-usermedia-screen-capturing"); // 允许屏幕共享

app.on(
  "certificate-error",
  (event, webContents, url, error, certificate, callback) => {
    // 允许加载自签名证书
    event.preventDefault();
    callback(true);
  }
);

function createWindow() {
  // 创建一个新的窗口实例
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      contextIsolation: true,
      // 如需要与主进程交互，可通过 preload 脚本实现
      preload: path.join(__dirname, "preload.js"),
      // 允许加载不安全内容
      allowRunningInsecureContent: true,
      // 禁用同源策略（仅限开发环境）
      webSecurity: false,
    },
  });

  // 初次加载默认的远程地址
  win.loadURL(currentRemoteURL);

  // 可选：监听窗口加载完成事件
  win.webContents.on("did-finish-load", () => {
    console.log("远程页面加载完成");
  });
}

// 当 Electron 完全初始化后创建窗口
app.whenReady().then(() => {
  createWindow();

  buildMenu(); // 新增：构建菜单

  // 针对 macOS 平台：当没有打开的窗口时，重新创建一个窗口
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 构建自定义菜单的方法
function buildMenu() {
  const isMac = process.platform === "darwin";

  // 菜单模板
  const template = [
    // 在 macOS 下，第一个菜单一定要是应用名称
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideothers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),

    // 文件菜单（可以根据需要调整）
    {
      label: "文件",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },

    // 编辑菜单
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Speech",
                submenu: [{ role: "startspeaking" }, { role: "stopspeaking" }],
              },
            ]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },

    // **设置菜单**：把“设置远程 URL”放在这里
    {
      label: "设置",
      submenu: [
        {
          label: "设置远程加载地址…",
          accelerator: "CmdOrCtrl+U",
          click: async () => {
            // 弹出一个输入框，让用户输入新的 URL
            // 初始值为 currentRemoteURL
            const result = await prompt({
              title: "设置远程加载地址",
              label: "请输入新的 URL 地址：",
              value: currentRemoteURL,
              inputAttrs: {
                type: "url",
              },
              type: "input",
            });

            // 如果用户点击了“取消”，result 会是 null
            if (result !== null) {
              let newURL = result.toString().trim();
              if (
                newURL.startsWith("http://") ||
                newURL.startsWith("https://")
              ) {
                currentRemoteURL = newURL;

                // 让主窗口加载新的 URL
                if (win && !win.isDestroyed()) {
                  win.loadURL(currentRemoteURL);
                }
              } else {
                // 可以用 dialog 弹个提示，告诉用户 URL 格式不对
                dialog.showErrorBox(
                  "URL 格式错误",
                  "请输入以 http:// 或 https:// 开头的合法 URL 地址。"
                );
              }
            }
          },
        },
        { type: "separator" },
        {
          label: "重置为默认地址",
          click: () => {
            currentRemoteURL = "http://localhost:8080";
            if (win && !win.isDestroyed()) {
              win.loadURL(currentRemoteURL);
            }
          },
        },
      ],
    },

    // 窗口菜单
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },

    // 帮助菜单
    {
      role: "help",
      submenu: [
        {
          label: "了解更多",
          click: async () => {
            const { shell } = require("electron");
            await shell.openExternal("https://www.electronjs.org");
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle("GET_SCREEN_SOURCES", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
  });
  return sources;
});

// 当所有窗口关闭后退出应用（除 macOS 外）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
