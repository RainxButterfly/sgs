import { useEffect, useState } from 'react';

export function useIsMobile(): boolean {
  const query = '(max-width: 720px), (max-height: 900px) and (max-width: 1100px)';
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
