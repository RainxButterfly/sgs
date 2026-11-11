import { PLAYABLE_HEROES } from '../../core/deck';
import { NameChip } from './NameChip';
import { useGameStore } from '../store';

const TESTERS = ['心晴未央', '花不琢', '青晨之城', '星野', '甘雨门卫', '孙笨'];

export function AboutModal() {
  const open = useGameStore((s) => s.aboutOpen);
  const close = useGameStore((s) => s.closeAbout);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const appVersion = useGameStore((s) => s.appVersion);
  if (!open) return null;

  return (
    <div className="modal-backdrop about-backdrop" onClick={close}>
      <div className="modal about-modal about-modal-v2" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="about-close" onClick={close} aria-label="关闭关于">
          ×
        </button>

        <div className="about-hero-v2">
          <span className="about-seal about-seal-v2">闪</span>
          <div>
            <h2>四国闪 · 星河</h2>
            <span className="about-version">版本 v{appVersion}</span>
            <p>和朋友在局域网或虚拟局域网里直接开桌的三国杀风格联机游戏。</p>
          </div>
        </div>

        <div className="about-stats-v2">
          <span><b>{PLAYABLE_HEROES.length}</b> 名武将</span>
          <span><b>160</b> 张牌</span>
          <span><b>4</b> 种模式</span>
        </div>

        <div className="about-grid-v2">
          <div className="about-column">
            <section className="about-card-v2 about-author-v2">
              <div className="about-avatar-v2">星</div>
              <div className="about-author-body-v2">
                <span className="about-card-label">作者</span>
                <div className="about-author-name-v2">
                  <NameChip name="星河一叶Roxy" level={66} size="sm" />
                  <span className="about-tag-v2">独立开发</span>
                </div>
                <p>开发 · 设计 · 程序 · 测试协调</p>
              </div>
            </section>

            <section className="about-card-v2">
              <span className="about-card-label">昵称颜色</span>
              <div className="about-tier-grid">
                {[
                  ['素白', 1, 0],
                  ['青竹', 10, 1],
                  ['流蓝', 20, 2],
                  ['紫电', 30, 3],
                  ['鎏金', 40, 4],
                  ['赤霞', 50, 5],
                  ['星虹', 60, 6],
                ].map(([label, level, tier]) => (
                  <div key={String(label)} className="about-tier-item">
                    <i className={`about-tier-dot tier-${tier}`} />
                    <b>{label}</b>
                    <span>Lv.{level}</span>
                  </div>
                ))}
              </div>
              <p className="about-card-note">主界面可随时修改固定 ID；等级越高昵称颜色越特别，60 级解锁星虹。</p>
            </section>
          </div>

          <div className="about-column">
            <section className="about-card-v2">
              <span className="about-card-label">测试组</span>
              <div className="about-testers">
                {TESTERS.map((name) => (
                  <div key={name} className="about-tester">
                    <span>{name.slice(0, 1)}</span>
                    <b>{name}</b>
                  </div>
                ))}
              </div>
              <div className="about-note">测试名单持续补充中</div>
            </section>

            <section className="about-card-v2">
              <span className="about-card-label">开源与致谢</span>
              <div className="about-chip-row">
                <span>Apache-2.0</span>
                <span>2026</span>
              </div>
              <p className="about-card-note">
                感谢每一位参与测试、反馈和陪伴的朋友。你们的名字会继续出现在测试组名单里。
              </p>
            </section>
          </div>
        </div>

        <div className="about-footer">四国闪 · 星河 · 与朋友在同一张桌子上打牌</div>
        <div className="about-actions">
          <button type="button" className="btn primary" onClick={close}>
            {settingsOpen ? '返回设置' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
