import { useEffect, useState } from 'react';

export function useIsMobile(): boolean {
  // 触屏设备也按移动端处理：部分安卓 WebView 会忽略 viewport meta，
  // 把布局宽度当成 980px，仅靠宽度判断会误判成桌面端。
  const query =
    '(max-width: 720px), (max-height: 900px) and (max-width: 1100px), (pointer: coarse) and (max-width: 1200px)';
  const isPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && (isPhone() || window.matchMedia(query).matches),
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMobile(isPhone() || media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
