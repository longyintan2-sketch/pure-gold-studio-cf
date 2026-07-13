// 空操作签名器：覆盖 electron-builder 默认 Windows 签名流程，
// 避免其下载并解压 winCodeSign（其中含 macOS 符号链接，当前环境无权限导致打包失败）。
// 便携版无需代码签名即可正常运行。
module.exports = async function noopSign() {
  return;
};
