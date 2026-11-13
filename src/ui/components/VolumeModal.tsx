import { VolumePanel } from './VolumePanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 对局内音量窗：和战报一样，点其它区域即可关闭 */
export function VolumeModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <>
      <button type="button" className="volume-scrim" aria-label="关闭音量设置" onClick={onClose} />
      <div className="volume-window" role="dialog" aria-modal="true" aria-label="音量设置">
        <div className="volume-window-head">
          <span>音量</span>
          <button type="button" className="btn ghost small" onClick={onClose}>
            收起
          </button>
        </div>
        <VolumePanel showMaster />
        <div className="volume-window-hint">音效、武将语音分别调节；关闭总开关后全部静音。</div>
      </div>
    </>
  );
}
