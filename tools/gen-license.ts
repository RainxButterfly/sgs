// 星河测试工具授权码生成器（一人一码）：
//   node tools/gen-license.ts --batch 武器专项 --count 5 --names 张三,李四,王五 [选项]
// 每个码含唯一编号 serial，首次解锁绑定本机；泄露时把编号加入 src/dev/policy.ts 的 REVOKED_DEV_SERIALS 单独吊销。
import { signLicense, randomHex, todayStamp, type LicenseFields } from '../src/dev/license.ts';
import pkg from '../package.json' with { type: 'json' };

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}

const batch = arg('batch');
if (!batch || batch.includes('.')) {
  console.error('用法：node tools/gen-license.ts --batch <用途批次，如 武器专项> [--count 5] [--names 张三,李四] [--tool-min 1] [--tool-max 1] [--game-min 0.9.10] [--game-max 0.9.12] [--days 30 | --expires 20261211 | --long]');
  process.exit(1);
}

const count = Math.max(1, Math.floor(Number(arg('count', '1')) || 1));
const names = (arg('names') ?? '').split(',').map((name) => name.trim()).filter(Boolean);

const days = Number(arg('days', '30'));
const expiresArg = arg('expires');
const long = process.argv.includes('--long');
let expires = '';
if (!long) {
  if (expiresArg) {
    expires = expiresArg;
  } else {
    const d = new Date();
    d.setDate(d.getDate() + (Number.isFinite(days) ? days : 30));
    expires = d.toISOString().slice(0, 10).replace(/-/g, '');
  }
}

const toolMin = Number(arg('tool-min', '1'));
const toolMax = Number(arg('tool-max', '1'));
const gameMin = arg('game-min', pkg.version)!;
const gameMax = arg('game-max', pkg.version)!;

const base: Omit<LicenseFields, 'serial'> = {
  created: todayStamp(),
  batch,
  toolMin,
  toolMax,
  gameMin,
  gameMax,
  expires,
};

const used = new Set<string>();
console.log(`批次「${batch}」 · 共 ${count} 个一人一码授权码`);
for (let i = 0; i < count; i += 1) {
  let serial = randomHex(3);
  while (used.has(serial)) serial = randomHex(3);
  used.add(serial);
  const code = await signLicense({ ...base, serial });
  const label = names[i] ? ` · ${names[i]}` : '';
  console.log(`\n[${i + 1}]${label} 编号 ${serial}`);
  console.log(code);
}
console.log(`\n工具 v${toolMin}–v${toolMax} · 游戏 v${gameMin}–v${gameMax} · 有效期 ${expires || '长期'}`);
console.log('提示：编号即授权码明文中的 serial 段；单独吊销某码时把其编号加入 REVOKED_DEV_SERIALS。');