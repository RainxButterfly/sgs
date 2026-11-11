import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HEROES } from '../core/deck';
import { DEV_CARD_NAMES } from '../dev/bridge';
import {
  DEV_GAME_VERSION_KEY,
  DEV_TOOL_CODE_KEY,
  DEV_TOOL_VERSION,
  licenseProblem,
  licenseSummary,
  readSession,
  todayStamp,
  verifyLicense,
  writeSession,
  type DevCardSpec,
  type DevCommand,
  type DevCommandType,
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
const rankLabel = (rank: number) => (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank - 1] ?? String(rank));

const COMMAND_LABEL: Record<DevCommandType, string> = {
  setHand: '替换手牌',
  addCards: '追加手牌',
  stackDeck: '牌堆置顶',
  setHero: '更换武将',
  setPickPool: '指定候选武将',
  setHp: '设置体力',
  setRole: '设置身份',
};

const ROLE_LABEL: Record<string, string> = {
  lord: '主公',
  loyalist: '忠臣',
  rebel: '反贼',
  renegade: '内奸',
};

let cmdSeq = 0;

function ToolApp() {
  const [code, setCode] = useState(() => localStorage.getItem(DEV_TOOL_CODE_KEY) ?? '');
  const [fields, setFields] = useState<LicenseFields | null>(null);
  const [unlockError, setUnlockError] = useState('');
  const [gameVersion, setGameVersion] = useState(() => localStorage.getItem(DEV_GAME_VERSION_KEY) ?? '');
  const [session, setSession] = useState<DevSession | null>(() => readSession());
  const [binding, setBinding] = useState<DevBinding | null>(() => readBinding());
  const [rows, setRows] = useState<DevCardSpec[]>([{ name: '杀', suit: 'spade', rank: 7 }]);
  const [heroSearch, setHeroSearch] = useState('');
  const [pickedHeroes, setPickedHeroes] = useState<string[]>([]);
  const [heroId, setHeroId] = useState('caocao');
  const [hp, setHp] = useState(4);
  const [role, setRole] = useState('rebel');
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSession(readSession());
      setBinding(readBinding());
      setGameVersion(localStorage.getItem(DEV_GAME_VERSION_KEY) ?? '');
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  const problem = useMemo(() => {
    if (!fields || !gameVersion) return null;
    return licenseProblem(fields, {
      gameVersion,
      toolVersion: DEV_TOOL_VERSION,
      revoked: REVOKED_DEV_BATCHES,
      revokedSerials: REVOKED_DEV_SERIALS,
      today: todayStamp(),
    });
  }, [fields, gameVersion]);

  const heroList = useMemo(() => {
    const keyword = heroSearch.trim();
    return HEROES.filter((hero) => !keyword || hero.name.includes(keyword) || hero.id.includes(keyword.toLowerCase()));
  }, [heroSearch]);

  const unlock = async () => {
    setUnlockError('');
    const verified = await verifyLicense(code);
    if (!verified) {
      setFields(null);
      setUnlockError('授权码无效：签名或格式不正确，请向开发者索取新的授权码。');
      return;
    }
    const bind = await resolveBinding(code.trim(), verified, {
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
    localStorage.setItem(DEV_TOOL_CODE_KEY, code.trim());
    const current = readSession() ?? { code: '', commands: [], updatedAt: 0 };
    current.code = code.trim();
    current.updatedAt = Date.now();
    writeSession(current);
    setSession(current);
  };

  const send = (type: DevCommandType, extra: Partial<DevCommand>) => {
    setSendError('');
    if (!fields) {
      setSendError('请先解锁授权码。');
      return;
    }
    if (problem) {
      setSendError(problem);
      return;
    }
    cmdSeq += 1;
    const cmd: DevCommand = { id: `c${Date.now()}-${cmdSeq}`, type, status: 'pending', ...extra };
    const current = readSession() ?? { code: code.trim(), commands: [], updatedAt: 0 };
    current.code = code.trim();
    current.commands = [...current.commands.slice(-60), cmd];
    current.updatedAt = Date.now();
    writeSession(current);
    setSession(current);
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
            删除
          </button>
        </div>
      ))}
      <button type="button" className="dt-ghost" onClick={() => setRows((prev) => [...prev, { name: '杀', suit: 'spade', rank: 7 }])}>
        加一张
      </button>
    </div>
  );

  return (
    <div className="dt-app">
      <header className="dt-head">
        <div>
          <h1>星河测试工具</h1>
          <p>独立测试页 · 工具 v{DEV_TOOL_VERSION} · 游戏 {gameVersion ? `v${gameVersion}` : '未启动'}</p>
        </div>
        <span className={`dt-state ${fields && !problem ? 'ok' : fields ? 'bad' : ''}`}>
          {fields ? (problem ? '授权不匹配' : '已解锁') : '未解锁'}
        </span>
      </header>

      <section className="dt-panel">
        <h2>授权码</h2>
        <div className="dt-unlock">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="粘贴开发者发放的授权码，如 XH2.20261111.武器专项.…"
            spellCheck={false}
          />
          <button type="button" className="dt-primary" onClick={() => void unlock()}>解锁</button>
        </div>
        {unlockError && <p className="dt-error">{unlockError}</p>}
        {fields && (
          <p className="dt-summary">{licenseSummary(fields)}</p>
        )}
        {binding && (
          <p className="dt-note">已绑定本机 · 编号 {binding.serial} · 一台设备仅可使用一个授权码。</p>
        )}
        {fields && !gameVersion && <p className="dt-note">等待游戏启动后写入版本号，再核对授权范围。</p>}
        {problem && <p className="dt-error">{problem}。游戏内只会警告并拒绝指令，不会关闭对局。</p>}
        <p className="dt-note">一人一码：授权码由开发者用 tools/gen-license.ts 按人数批量生成，每码含唯一编号；首次解锁绑定本机，编号或批次被吊销、版本不匹配时指令被拒绝。</p>
      </section>

      <section className="dt-panel">
        <h2>武将</h2>
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
            指定候选武将（下次选将）
          </button>
          <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {HEROES.map((hero) => (
              <option key={hero.id} value={hero.id}>{hero.name}</option>
            ))}
          </select>
          <button type="button" className="dt-primary" onClick={() => send('setHero', { heroId })}>
            立即更换我的武将
          </button>
        </div>
      </section>

      <section className="dt-panel">
        <h2>手牌与牌堆</h2>
        {cardEditor}
        <div className="dt-actions">
          <button type="button" className="dt-primary" onClick={() => send('setHand', { cards: rows })}>替换我的手牌</button>
          <button type="button" className="dt-primary" onClick={() => send('addCards', { cards: rows })}>追加手牌</button>
          <button type="button" className="dt-primary" onClick={() => send('stackDeck', { cards: rows })}>按顺序置顶牌堆</button>
        </div>
        <p className="dt-note">置顶顺序即摸牌 / 判定顺序，第一行最先被摸到。</p>
      </section>

      <section className="dt-panel">
        <h2>状态</h2>
        <div className="dt-actions">
          <input type="number" min={1} max={12} value={hp} onChange={(e) => setHp(Number(e.target.value))} />
          <button type="button" className="dt-primary" onClick={() => send('setHp', { hp })}>设置体力</button>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLE_LABEL).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <button type="button" className="dt-primary" onClick={() => send('setRole', { role })}>设置身份（身份场）</button>
        </div>
      </section>

      {sendError && <p className="dt-error dt-send-error">{sendError}</p>}

      <section className="dt-panel">
        <h2>指令回执</h2>
        {session?.commands.length ? (
          <ul className="dt-log">
            {[...session.commands].reverse().slice(0, 30).map((cmd) => (
              <li key={cmd.id} className={cmd.status}>
                <b>{COMMAND_LABEL[cmd.type]}</b>
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
  );
}

createRoot(document.getElementById('root')!).render(<ToolApp />);