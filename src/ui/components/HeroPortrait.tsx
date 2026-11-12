import { useEffect, useState } from 'react';
import { portraitFor } from '../portrait';
import { ensureSkins, getSkinSnapshot, skinUrl, subscribeSkins } from '../skins';

/** 订阅皮肤表：导入或清除后自动刷新 */
export function useSkins() {
  const [, force] = useState(0);
  useEffect(() => {
    void ensureSkins();
    return subscribeSkins(() => force((v) => v + 1));
  }, []);
  return getSkinSnapshot();
}

interface Props {
  heroId?: string;
  className?: string;
  /** 暗将：强制使用内置暗面，不显示导入皮肤 */
  hidden?: boolean;
}

export function HeroPortrait({ heroId, className, hidden = false }: Props) {
  useSkins();
  const url = portraitFor(heroId, hidden);
  const imported = !hidden && !!skinUrl(heroId);
  return (
    <span
      className={['hero-portrait', imported ? 'is-imported' : 'is-builtin', className]
        .filter(Boolean)
        .join(' ')}
      style={{ backgroundImage: `url("${url}")` }}
      aria-hidden="true"
    />
  );
}
