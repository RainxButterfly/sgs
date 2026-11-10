import { useEffect, useState } from 'react';
import { CHANGE_LABEL, CHANGELOG, type ChangelogEntry, type ChangelogVersion } from '../changelog';
import { useGameStore } from '../store';

function compareVersion(left: string, right: string): number {
  const a = left.split('.').map((part) => Number(part) || 0);
  const b = right.split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function coversVersion(entry: ChangelogEntry, version: string): boolean {
  if (!version) return false;
  if (entry.version === version) return true;
  const [from, to] = entry.version.split('~');
  if (!to) return false;
  return compareVersion(version, from) >= 0 && compareVersion(version, to) <= 0;
}

function entryLabel(entry: ChangelogEntry): string {
  return versionLabel(entry.version);
}

function versionLabel(version: string): string {
  return version.includes('~') ? version : `v${version}`;
}

export function ChangelogModal() {
  const open = useGameStore((s) => s.changelogOpen);
  const close = useGameStore((s) => s.closeChangelog);
  const appVersion = useGameStore((s) => s.appVersion);
  const [selected, setSelected] = useState(CHANGELOG[0]?.version ?? '');

  useEffect(() => {
    if (!open) return;
    const current = CHANGELOG.find((entry) => coversVersion(entry, appVersion));
    setSelected(current?.version ?? CHANGELOG[0]?.version ?? '');
  }, [open, appVersion]);

  if (!open) return null;
  const entry = CHANGELOG.find((item) => item.version === selected) ?? CHANGELOG[0];
  if (!entry) return null;
  const isCurrent = coversVersion(entry, appVersion);
  const renderSections = (version: ChangelogVersion) =>
    version.sections.map((section) => (
      <section key={`${version.version}-${section.kind}`} className={`changelog-section ${section.kind}`}>
        <div className="changelog-section-title">{CHANGE_LABEL[section.kind]}</div>
        <ul>
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    ));

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
            {CHANGELOG.map((item) => {
              const current = coversVersion(item, appVersion);
              return (
                <button
                  key={item.version}
                  type="button"
                  className={`changelog-version ${item.version === entry.version ? 'active' : ''}`}
                  onClick={() => setSelected(item.version)}
                >
                  <span className="changelog-version-top">
                    <span className="changelog-version-date">{item.date}</span>
                    {current && <em>当前</em>}
                  </span>
                  <b>{entryLabel(item)}</b>
                  <span className="changelog-version-title">{item.title}</span>
                </button>
              );
            })}
          </aside>
          <article className="changelog-detail">
            <header className="changelog-heading">
              <div className="changelog-heading-meta">
                <span className="changelog-date">{entry.date}</span>
                {isCurrent && <span className="changelog-current">当前版本</span>}
              </div>
              <h3>{entry.title}</h3>
              <span className="changelog-range">{entryLabel(entry)}</span>
            </header>
            {entry.versions?.length ? (
              <div className="changelog-version-blocks">
                {entry.versions.map((version) => (
                  <section key={version.version} className="changelog-version-block">
                    <header className="changelog-version-block-head">
                      <span className="changelog-date">{version.date}</span>
                      <b>{versionLabel(version.version)}</b>
                      <h4>{version.title}</h4>
                    </header>
                    {renderSections(version)}
                  </section>
                ))}
              </div>
            ) : (
              entry.sections.map((section) => (
                <section key={section.kind} className={`changelog-section ${section.kind}`}>
                  <div className="changelog-section-title">{CHANGE_LABEL[section.kind]}</div>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))
            )}
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
