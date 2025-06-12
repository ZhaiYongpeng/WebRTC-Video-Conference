window.addEventListener("DOMContentLoaded", () => {
  console.log("Electron 预加载完成");
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getScreenSources: () => ipcRenderer.invoke("GET_SCREEN_SOURCES"),
});
