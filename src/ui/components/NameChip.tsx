import { nameTierClass } from '../profile';

interface Props {
  name: string;
  level: number;
  size?: 'sm' | 'md' | 'lg';
  showLevel?: boolean;
  className?: string;
}

export function NameChip({ name, level, size = 'md', showLevel = true, className }: Props) {
  return (
    <span
      className={[
        'name-chip',
        `name-${size}`,
        nameTierClass(level),
        className ?? '',
      ].filter(Boolean).join(' ')}
      title={`${name} · Lv.${level}`}
    >
      {showLevel && <span className="name-level">Lv.{level}</span>}
      <b>{name}</b>
    </span>
  );
}
