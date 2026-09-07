export function userFacingRequestError(error, fallback) {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return '无法连接本地服务。请双击桌面的“启动 TravelCanvas”，等待页面自动打开后再试。';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
