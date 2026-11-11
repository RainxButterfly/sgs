import { isAndroidApp, isTauri } from '../net/lan';

/** 打开独立测试工具页：桌面端开同源子窗口（共享 localStorage），网页端开新标签。 */
export async function openDevtoolPage(): Promise<void> {
  if (isTauri() && !isAndroidApp()) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel('devtool');
      if (existing) {
        await existing.setFocus();
        return;
      }
      new WebviewWindow('devtool', {
        url: 'devtool.html',
        title: '星河测试工具',
        width: 920,
        height: 780,
        minWidth: 480,
        minHeight: 480,
      });
      return;
    } catch {
      // 子窗口不可用时退回新标签
    }
  }
  window.open('devtool.html', '_blank');
}