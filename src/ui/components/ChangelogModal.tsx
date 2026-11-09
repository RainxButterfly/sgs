import { useEffect, useState } from 'react';
import { CHANGE_LABEL, CHANGELOG } from '../changelog';
import { useGameStore } from '../store';

export function ChangelogModal() {
  const open = useGameStore((s) => s.changelogOpen);
  const close = useGameStore((s) => s.closeChangelog);
  const appVersion = useGameStore((s) => s.appVersion);
  const [selected, setSelected] = useState(CHANGELOG[0]?.version ?? '');

  useEffect(() => {
    if (!open) return;
    const current = CHANGELOG.find((entry) => entry.version === appVersion);
    setSelected(current?.version ?? CHANGELOG[0]?.version ?? '');
  }, [open, appVersion]);

  if (!open) return null;
  const entry = CHANGELOG.find((item) => item.version === selected) ?? CHANGELOG[0];
  if (!entry) return null;

  return (
    <div className="modal-backdrop changelog-backdrop" onClick={close}>
      <div className="modal changelog-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">更新日志</div>
          <button type="button" className="modal-minimize" onClick={close}>
            关闭
          </button>
        </div>
        <div className="changelog-layout">
          <aside className="changelog-versions">
            {CHANGELOG.map((item) => (
              <button
                key={item.version}
                type="button"
                className={`changelog-version ${item.version === entry.version ? 'active' : ''}`}
                onClick={() => setSelected(item.version)}
              >
                <b>v{item.version}</b>
                <span>{item.title}</span>
                {item.version === appVersion && <em>当前版本</em>}
              </button>
            ))}
          </aside>
          <article className="changelog-detail">
            <div className="changelog-heading">
              <div>
                <span className="changelog-date">{entry.date}</span>
                <h3>v{entry.version} · {entry.title}</h3>
              </div>
              {entry.version === appVersion && <span className="changelog-current">当前版本</span>}
            </div>
            {entry.sections.map((section) => (
              <section key={section.kind} className={`changelog-section ${section.kind}`}>
                <div className="changelog-section-title">{CHANGE_LABEL[section.kind]}</div>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={close}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
