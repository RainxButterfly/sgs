import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isAndroidApp, isTauri } from '../net/lan';

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function useDeviceStatus(): { time: string; battery: number | null } {
  const [time, setTime] = useState(() => formatTime(new Date()));
  const [battery, setBattery] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setTime(formatTime(new Date()));
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let manager: any = null;
    const setLevel = (value: number) => {
      if (!cancelled && Number.isFinite(value) && value >= 0) {
        setBattery(Math.round(value));
      }
    };
    const getBattery = (
      navigator as Navigator & { getBattery?: () => Promise<any> }
    ).getBattery;
    const onChange = () => {
      if (manager) setLevel(manager.level * 100);
    };
    const attachWebBattery = () => {
      if (!getBattery) return;
      void getBattery
        .call(navigator)
        .then((result) => {
          manager = result;
          onChange();
          manager.addEventListener('levelchange', onChange);
        })
        .catch(() => undefined);
    };

    if (isTauri() && isAndroidApp()) {
      const read = () => {
        void invoke<number>('android_battery')
          .then((level) => setLevel(level))
          .catch(attachWebBattery);
      };
      read();
      const onVisible = () => {
        if (document.visibilityState === 'visible') read();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        cancelled = true;
        document.removeEventListener('visibilitychange', onVisible);
        manager?.removeEventListener('levelchange', onChange);
      };
    }

    attachWebBattery();
    return () => {
      cancelled = true;
      manager?.removeEventListener('levelchange', onChange);
    };
  }, []);

  return { time, battery };
}
