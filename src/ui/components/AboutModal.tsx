import { useGameStore } from '../store';

const TESTERS = ['心晴未央', '花不琢', '青晨之城', '星野'];

export function AboutModal() {
  const open = useGameStore((s) => s.aboutOpen);
  const close = useGameStore((s) => s.closeAbout);
  const appVersion = useGameStore((s) => s.appVersion);
  if (!open) return null;

  return (
    <div className="modal-backdrop about-backdrop" onClick={close}>
      <div className="modal about-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="about-close" onClick={close} aria-label="关闭关于">
          ×
        </button>
        <div className="about-title">关于</div>

        <div className="about-brand-block">
          <span className="about-seal">闪</span>
          <h2>四国闪 · 星河</h2>
          <span className="about-version">版本 v{appVersion}</span>
          <p>
            一个不需要官方服务器、和朋友在局域网或虚拟局域网里直接开桌的三国杀风格联机游戏。
          </p>
        </div>

        <section className="about-section">
          <div className="about-section-title">作者</div>
          <div className="about-author">
            <span className="about-author-avatar">星</span>
            <div className="about-author-info">
              <b>星河一叶Roxy</b>
              <span>开发 · 设计 · 程序</span>
              <span className="about-author-meta">GitHub：RainxButterfly · Apache-2.0</span>
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="about-section-title">测试组</div>
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

        <div className="about-footer">感谢每一位参与测试、反馈和陪伴的朋友</div>
        <div className="about-actions">
          <button type="button" className="btn primary" onClick={close}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
