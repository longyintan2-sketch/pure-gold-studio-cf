// 预留的安全桥接层（当前渲染层为纯本地功能，暂无需暴露 Node 能力）。
// 保留此文件以便后续需要文件系统/系统对话框等能力时安全扩展。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('vsNative', {
  version: '1.0.0',
  platform: process.platform,
});
