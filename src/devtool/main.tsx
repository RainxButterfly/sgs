import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HEROES } from '../core/deck';
import { DEV_CARD_NAMES } from '../dev/bridge';
import {
  DEV_FEATURES,
  DEV_GAME_VERSION_KEY,
  DEV_TOOL_CODE_KEY,
  DEV_TOOL_VERSION,
  featureMeta,
  featureOfCommand,
  hasFeature,
  licenseAllowsLan,
  licenseProblem,
  licenseSummary,
  readSession,
  todayStamp,
  verifyLicense,
  writeSession,
  type DevCardSpec,
  type DevCommand,
  type DevCommandType,
  type DevFeature,
  type DevSession,
  type LicenseFields,
} from '../dev/license';
import { REVOKED_DEV_BATCHES, REVOKED_DEV_SERIALS } from '../dev/policy';
import { readBinding, resolveBinding, type DevBinding } from '../dev/binding';
import './devtool.css';

const SUITS: { id: DevCardSpec['suit']; label: string }[] = [
  { id: 'spade', label: '♠' },
  { id: 'heart', label: '♥' },
  { id: 'club', label: '♣' },
  { id: 'diamond', label: '♦' },
];

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const rankLabel = (rank: number) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank - 1] ?? String(rank);

const COMMAND_LABEL: Record<DevCommandType, string> = {
  setHand: '替换手牌',
  addCards: '追加手牌',
  stackDeck: '牌堆置顶',
  setHero: '更换武将',
  setPickPool: '指定候选武将',
  setHp: '设置体力',
  setMaxHp: '设置体力上限',
  healFull: '体力回满',
  drawCards: '摸牌',
  setRole: '设置身份',
  setChained: '铁索状态',
  setFlipped: '翻面状态',
  addJudge: '贴判定牌',
  clearJudges: '清空判定区',
  killSelf: '令自己阵亡',
  killOthers: '其他角色阵亡',
  endGame: '结束对局',
};

const ROLE_LABEL: Record<string, string> = {
  lord: '主公',
  loyalist: '忠臣',
  rebel: '反贼',
  renegade: '内奸',
};

const JUDGE_OPTIONS = ['乐不思蜀', '兵粮寸断', '闪电'];

const PRESETS: { label: string; cards: DevCardSpec[] }[] = [
  { label: '杀', cards: [{ name: '杀', suit: 'spade', rank: 7 }] },
  { label: '闪', cards: [{ name: '闪', suit: 'heart', rank: 2 }] },
  { label: '桃', cards: [{ name: '桃', suit: 'heart', rank: 3 }] },
  { label: '无懈可击', cards: [{ name: '无懈可击', suit: 'spade', rank: 11 }] },
  { label: '决斗', cards: [{ name: '决斗', suit: 'club', rank: 1 }] },
];

let cmdSeq = 0;

function ToolApp() {
  const [code, setCode] = useState(() => localStorage.getItem(DEV_TOOL_CODE_KEY) ?? '');
  const [fields, setFields] = useState<LicenseFields | null>(null);
  const [unlockError, setUnlockError] = useState('');
  const [autoTried, setAutoTried] = useState(false);
  const [gameVersion, setGameVersion] = useState(() => localStorage.getItem(DEV_GAME_VERSION_KEY) ?? '');
  const [session, setSession] = useState<DevSession | null>(() => readSession());
  const [binding, setBinding] = useState<DevBinding | null>(() => readBinding());
  const [rows, setRows] = useState<DevCardSpec[]>([{ name: '杀', suit: 'spade', rank: 7 }]);
  const [heroSearch, setHeroSearch] = useState('');
  const [pickedHeroes, setPickedHeroes] = useState<string[]>([]);
  const [heroId, setHeroId] = useState('caocao');
  const [hp, setHp] = useState(3);
  const [maxHp, setMaxHp] = useState(4);
  const [drawCount, setDrawCount] = useState(2);
  const [role, setRole] = useState('rebel');
  const [judge, setJudge] = useState('乐不思蜀');
  const [winner, setWinner] = useState<'loyalist' | 'rebel' | 'draw'>('loyalist');
  const [sendError, setSendError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSession(readSession());
      setBinding(readBinding());
      setGameVersion(localStorage.getItem(DEV_GAME_VERSION_KEY) ?? '');
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  const env = useMemo(
    () => ({
      gameVersion,
      toolVersion: DEV_TOOL_VERSION,
      revoked: REVOKED_DEV_BATCHES,
      revokedSerials: REVOKED_DEV_SERIALS,
      today: todayStamp(),
    }),
    [gameVersion],
  );

  const problem = useMemo(() => (fields && gameVersion ? licenseProblem(fields, env) : null), [fields, gameVersion, env]);

  /** 校验并解锁（含自动恢复上次授权） */
  const unlock = useCallback(
    async (raw: string, silent = false) => {
      const value = raw.trim();
      if (!value) return;
      setUnlockError('');
      const verified = await verifyLicense(value);
      if (!verified) {
        setFields(null);
        if (!silent) setUnlockError('授权码无效：签名或格式不正确，请向开发者索取新的授权码。');
        return;
      }
      const bind = await resolveBinding(value, verified, {
        gameVersion,
        toolVersion: DEV_TOOL_VERSION,
        revoked: REVOKED_DEV_BATCHES,
        revokedSerials: REVOKED_DEV_SERIALS,
        today: todayStamp(),
      });
      if (!bind.ok) {
        setFields(null);
        setUnlockError(bind.reason);
        return;
      }
      setFields(verified);
      setBinding(bind.binding);
      localStorage.setItem(DEV_TOOL_CODE_KEY, value);
      const current = readSession() ?? { code: '', commands: [], updatedAt: 0 };
      current.code = value;
      current.updatedAt = Date.now();
      writeSession(current);
      setSession(current);
    },
    [gameVersion],
  );

  // 打开工具页时自动恢复已保存的授权，不用每次重新激活
  useEffect(() => {
    if (autoTried) return;
    setAutoTried(true);
    const saved = localStorage.getItem(DEV_TOOL_CODE_KEY);
    if (saved) void unlock(saved, true);
  }, [autoTried, unlock]);

  const heroList = useMemo(() => {
    const keyword = heroSearch.trim();
    return HEROES.filter((hero) => !keyword || hero.name.includes(keyword) || hero.id.includes(keyword.toLowerCase()));
  }, [heroSearch]);

  const send = (type: DevCommandType, extra: Partial<DevCommand> = {}) => {
    setSendError('');
    if (!fields) {
      setSendError('请先解锁授权码。');
      return;
    }
    if (problem) {
      setSendError(problem);
      return;
    }
    const need = featureOfCommand(type);
    if (!hasFeature(fields, need)) {
      setSendError(`当前授权码未解锁「${featureMeta(need).label}」权限，请联系开发者换发。`);
      return;
    }
    cmdSeq += 1;
    const cmd: DevCommand = { id: `c${Date.now()}-${cmdSeq}`, type, status: 'pending', ...extra };
    const current = readSession() ?? { code: code.trim(), commands: [], updatedAt: 0 };
    current.code = code.trim();
    current.commands = [...current.commands.slice(-80), cmd];
    current.updatedAt = Date.now();
    writeSession(current);
    setSession(current);
    setFlash(`${COMMAND_LABEL[type]} 已发送`);
    window.setTimeout(() => setFlash(''), 1400);
  };

  const setRow = (index: number, patch: Partial<DevCardSpec>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const cardEditor = (
    <div className="dt-rows">
      {rows.map((row, index) => (
        <div className="dt-row" key={index}>
          <select value={row.name} onChange={(e) => setRow(index, { name: e.target.value })}>
            {DEV_CARD_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={row.suit} onChange={(e) => setRow(index, { suit: e.target.value as DevCardSpec['suit'] })}>
            {SUITS.map((suit) => (
              <option key={suit.id} value={suit.id}>{suit.label}</option>
            ))}
          </select>
          <select value={row.rank} onChange={(e) => setRow(index, { rank: Number(e.target.value) })}>
            {RANKS.map((rank) => (
              <option key={rank} value={rank}>{rankLabel(rank)}</option>
            ))}
          </select>
          <button type="button" className="dt-ghost" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
            移除
          </button>
        </div>
      ))}
      <div className="dt-row-actions">
        <button type="button" className="dt-ghost" onClick={() => setRows((prev) => [...prev, { name: '杀', suit: 'spade', rank: 7 }])}>
          + 加一张牌
        </button>
        {PRESETS.map((preset) => (
          <button key={preset.label} type="button" className="dt-tag" onClick={() => setRows(preset.cards)}>
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );

  const lanReady = fields ? licenseAllowsLan(fields) : false;
  const unlockedCount = fields ? DEV_FEATURES.filter((meta) => hasFeature(fields, meta.key)).length : 0;
  const lockedClass = (key: DevFeature) => (fields && !hasFeature(fields, key) ? ' is-locked' : '');
  const lockChip = (key: DevFeature) =>
    fields && !hasFeature(fields, key) ? (
      <span className="dt-chip small lock">✕ {featureMeta(key).label} 未解锁</span>
    ) : null;

  return (
    <div className="dt-app">
      <div className="dt-aurora" aria-hidden="true" />

      <header className="dt-head">
        <div className="dt-brand">
          <span className="dt-seal">測</span>
          <div>
            <h1>星河测试工具 <em>V{DEV_TOOL_VERSION}</em></h1>
            <p>游戏 {gameVersion ? `v${gameVersion}` : '未启动'} · 指令通过本机存储同步进对局</p>
          </div>
        </div>
        <div className="dt-head-chips">
          <span className={`dt-chip ${fields && !problem ? 'ok' : fields ? 'bad' : 'idle'}`}>
            {fields ? (problem ? '授权不匹配' : '已解锁') : '未解锁'}
          </span>
          {fields && (
            <>
              <span className={`dt-chip ${lanReady ? 'lan' : ''}`}>{lanReady ? '单机 + 联机' : '仅单机'}</span>
              <span className={`dt-chip ${fields.anyVersion ? 'any' : ''}`}>
                {fields.anyVersion ? '任意版本' : `v${fields.gameMin}–v${fields.gameMax}`}
              </span>
              <span className={`dt-chip ${unlockedCount === DEV_FEATURES.length ? 'ok' : 'part'}`}>
                功能 {unlockedCount}/{DEV_FEATURES.length}
              </span>
            </>
          )}
        </div>
      </header>

      <section className="dt-card dt-license">
        <div className="dt-card-head">
          <h2>授权</h2>
          {binding && <span className="dt-chip small">本机已绑定 · 编号 {binding.serial}</span>}
        </div>
        <div className="dt-unlock">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void unlock(code);
            }}
            placeholder="粘贴授权码，如 XH3.20261113.联调.9f2c11.lan.any.2-2.0.0.0~99.99.99.long.xxxxxxxxxxxx"
            spellCheck={false}
          />
          <button type="button" className="dt-primary" onClick={() => void unlock(code)}>解锁</button>
        </div>
        {unlockError && <p className="dt-error">{unlockError}</p>}
        {fields && <p className="dt-summary">{licenseSummary(fields)}</p>}
        {fields && (
          <div className="dt-feats">
            {DEV_FEATURES.map((meta) => {
              const on = hasFeature(fields, meta.key);
              return (
                <span
                  key={meta.key}
                  className={`dt-feat ${on ? 'on' : 'off'}${meta.danger ? ' danger' : ''}`}
                  title={meta.desc}
                >
                  <i>{on ? '✓' : '✕'}</i>
                  {meta.label}
                </span>
              );
            })}
          </div>
        )}
        {fields && !problem && (
          <p className="dt-note">
            {lanReady
              ? '该授权允许在局域网联机中使用：指令生效时全场会弹出通报，并写入战报。'
              : '该授权仅限单机；如需在联机中使用，请向开发者索取「单机 + 联机」类型的授权码。'}
          </p>
        )}
        {fields && !gameVersion && <p className="dt-note">等待游戏启动后写入版本号，再核对授权范围。</p>}
        {problem && <p className="dt-error">{problem}。游戏内只会警告并拒绝指令，不会关闭对局。</p>}
        {!fields && <p className="dt-note">授权码首次解锁后绑定本机并记住，重启游戏无需重新输入（换码时才会更新）。</p>}
      </section>

      <div className="dt-grid dt-grid-3">
        <section className={`dt-card${lockedClass('hp')}`}>
          <div className="dt-card-head"><h2>体力与摸牌</h2>{lockChip('hp')}</div>
          <div className="dt-actions">
            <label className="dt-field">
              <span>体力</span>
              <input type="number" min={1} max={12} value={hp} onChange={(e) => setHp(Number(e.target.value))} />
            </label>
            <button type="button" className="dt-primary" onClick={() => send('setHp', { hp })}>设置体力</button>
            <label className="dt-field">
              <span>上限</span>
              <input type="number" min={1} max={12} value={maxHp} onChange={(e) => setMaxHp(Number(e.target.value))} />
            </label>
            <button type="button" className="dt-primary" onClick={() => send('setMaxHp', { hp: maxHp })}>设置上限</button>
            <button type="button" className="dt-ghost strong" onClick={() => send('healFull')}>体力回满</button>
            <label className="dt-field">
              <span>摸牌</span>
              <input type="number" min={1} max={10} value={drawCount} onChange={(e) => setDrawCount(Number(e.target.value))} />
            </label>
            <button type="button" className="dt-ghost strong" onClick={() => send('drawCards', { count: drawCount })}>摸牌</button>
          </div>
        </section>

        <section className={`dt-card${lockedClass('status')}`}>
          <div className="dt-card-head"><h2>状态</h2>{lockChip('status')}</div>
          <div className="dt-actions">
            <button type="button" className="dt-ghost strong" onClick={() => send('setChained')}>切换铁索</button>
            <button type="button" className="dt-ghost strong" onClick={() => send('setFlipped')}>切换翻面</button>
            <select value={judge} onChange={(e) => setJudge(e.target.value)}>
              {JUDGE_OPTIONS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button type="button" className="dt-ghost strong" onClick={() => send('addJudge', { judge })}>贴判定牌</button>
            <button type="button" className="dt-ghost" onClick={() => send('clearJudges')}>清空判定区</button>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <button type="button" className="dt-ghost" onClick={() => send('setRole', { role })}>设置身份（身份场）</button>
          </div>
        </section>

        <section className={`dt-card dt-danger${lockedClass('fate')}`}>
          <div className="dt-card-head">
            <h2>生死与胜负</h2>
            {lockChip('fate') ?? <span className="dt-chip small bad">谨慎</span>}
          </div>
          <div className="dt-actions">
            <button type="button" className="dt-danger-btn" onClick={() => send('killSelf')}>令自己阵亡</button>
            <button type="button" className="dt-danger-btn" onClick={() => send('killOthers')}>其他角色全部阵亡</button>
            <select value={winner} onChange={(e) => setWinner(e.target.value as 'loyalist' | 'rebel' | 'draw')}>
              <option value="loyalist">甲队 / 主公方胜</option>
              <option value="rebel">乙队 / 反贼方胜</option>
              <option value="draw">平局</option>
            </select>
            <button type="button" className="dt-danger-btn" onClick={() => send('endGame', { winner })}>直接结束对局</button>
          </div>
          <p className="dt-note">联机时这些操作会立即向全场广播，请注意影响。</p>
        </section>

      </div>

      <div className="dt-grid dt-grid-fill">
        <section className={`dt-card${lockedClass('hero')}`}>
          <div className="dt-card-head"><h2>武将</h2>{lockChip('hero')}</div>
          <div className="dt-hero-picker">
            <input value={heroSearch} onChange={(e) => setHeroSearch(e.target.value)} placeholder="搜索武将，如 曹操 / 关羽" />
            <div className="dt-hero-list">
              {heroList.map((hero) => (
                <label key={hero.id} className={pickedHeroes.includes(hero.id) ? 'on' : ''}>
                  <input
                    type="checkbox"
                    checked={pickedHeroes.includes(hero.id)}
                    onChange={() =>
                      setPickedHeroes((prev) =>
                        prev.includes(hero.id) ? prev.filter((id) => id !== hero.id) : [...prev, hero.id],
                      )
                    }
                  />
                  <span>{hero.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="dt-actions">
            <button type="button" className="dt-primary" onClick={() => send('setPickPool', { heroIds: pickedHeroes })}>
              指定候选武将（下次选将 · {pickedHeroes.length}）
            </button>
            <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              {HEROES.map((hero) => (
                <option key={hero.id} value={hero.id}>{hero.name}</option>
              ))}
            </select>
            <button type="button" className="dt-primary" onClick={() => send('setHero', { heroId })}>立即更换我的武将</button>
          </div>
        </section>

        <section className={`dt-card${lockedClass('cards')}`}>
          <div className="dt-card-head"><h2>手牌与牌堆</h2>{lockChip('cards')}</div>
          {cardEditor}
          <div className="dt-actions">
            <button type="button" className="dt-primary" onClick={() => send('setHand', { cards: rows })}>替换我的手牌</button>
            <button type="button" className="dt-primary" onClick={() => send('addCards', { cards: rows })}>追加手牌</button>
            <button type="button" className="dt-primary" onClick={() => send('stackDeck', { cards: rows })}>按顺序置顶牌堆</button>
          </div>
          <p className="dt-note">置顶顺序即摸牌 / 判定顺序，第一行最先被摸到。</p>
        </section>

        <section className="dt-card dt-wide">
          <div className="dt-card-head">
            <h2>指令回执</h2>
            {flash && <span className="dt-chip small ok">{flash}</span>}
          </div>
          {session?.commands.length ? (
            <ul className="dt-log">
              {[...session.commands].reverse().slice(0, 40).map((cmd) => (
                <li key={cmd.id} className={cmd.status}>
                  <b>{COMMAND_LABEL[cmd.type] ?? cmd.type}</b>
                  <span>{cmd.status === 'pending' ? '等待游戏处理' : cmd.status === 'applied' ? '已生效' : '被拒绝'}</span>
                  {cmd.note && <em>{cmd.note}</em>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dt-note">还没有指令。解锁后发送指令，游戏每秒轮询一次并回写结果。</p>
          )}
        </section>
      </div>

      {sendError && <p className="dt-error dt-send-error">{sendError}</p>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<ToolApp />);
