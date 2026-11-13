import { useGameStore } from '../store';

interface Props {
  /** 紧凑模式：用于对局内的浮层 */
  compact?: boolean;
  /** 额外显示总静音开关 */
  showMaster?: boolean;
}

/** 音量面板：音效 / 武将语音两条通道，设置与对局内共用（背景音乐通道已预留，暂不开放） */
export function VolumePanel({ compact = false, showMaster = false }: Props) {
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const soundVolume = useGameStore((s) => s.soundVolume);
  const voiceVolume = useGameStore((s) => s.voiceVolume);
  const setSoundEnabled = useGameStore((s) => s.setSoundEnabled);
  const setSoundVolume = useGameStore((s) => s.setSoundVolume);
  const setVoiceVolume = useGameStore((s) => s.setVoiceVolume);

  const rows = [
    {
      key: 'sfx',
      label: '音效',
      value: soundVolume,
      disabled: !soundEnabled,
      onChange: setSoundVolume,
    },
    {
      key: 'voice',
      label: '语音',
      value: voiceVolume,
      disabled: !soundEnabled,
      onChange: setVoiceVolume,
    },
  ] as const;

  return (
    <div className={`volume-panel ${compact ? 'is-compact' : ''}`}>
      {showMaster && (
        <div className="volume-master">
          <span>全部声音</span>
          <button
            type="button"
            className={`count-btn ${soundEnabled ? 'on' : ''}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? '开启' : '静音'}
          </button>
        </div>
      )}
      {rows.map((row) => (
        <label key={row.key} className="volume-row">
          <span className="volume-label">{row.label}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(row.value * 100)}
            disabled={row.disabled}
            onChange={(event) => row.onChange(Number(event.target.value) / 100)}
          />
          <b>{Math.round(row.value * 100)}%</b>
        </label>
      ))}
    </div>
  );
}
