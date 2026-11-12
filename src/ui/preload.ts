/**
 * 启动预加载：把打包内置的武将立绘、卡牌图提前装入浏览器缓存，
 * 主界面渲染时即可直接命中缓存，避免白屏/黑屏与图片逐张闪现。
 */
import { allHeroArtUrls } from './heroArt';
import { allCardArtUrls } from './cardArt';

/** 收集所有需要预加载的静态图片地址 */
export function collectAssetUrls(): string[] {
  const urls = [...allHeroArtUrls(), ...allCardArtUrls()];
  // 去重（理论上不会重复，稳妥起见）
  return [...new Set(urls)];
}

/**
 * 预加载全部静态图片，每完成一张回调一次进度（0~100）。
 * 无论成败都会继续，保证最终能结束（不会卡住启动画面）。
 */
export function preloadAssets(onProgress?: (pct: number) => void): Promise<void> {
  const urls = collectAssetUrls();
  const total = urls.length;
  if (total === 0) {
    onProgress?.(100);
    return Promise.resolve();
  }

  let loaded = 0;
  const report = () => onProgress?.(Math.round((loaded / total) * 100));

  const tasks = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          loaded += 1;
          report();
          resolve();
        };
        img.onerror = () => {
          loaded += 1;
          report();
          resolve();
        };
        img.src = url;
      }),
  );

  return Promise.all(tasks).then(() => onProgress?.(100));
}

/** 启动画面控制对象（index.html 内联注入），用于更新进度与结束加载画面 */
export interface BootBridge {
  setProgress: (pct: number) => void;
  finish: () => void;
}

export function bootBridge(): BootBridge | null {
  const bridge = (window as unknown as { __BOOT__?: BootBridge }).__BOOT__;
  return bridge ?? null;
}
