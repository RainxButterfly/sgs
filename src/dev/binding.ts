import {
  licenseProblem,
  randomHex,
  verifyLicense,
  type LicenseEnv,
  type LicenseFields,
} from './license';

export const DEV_DEVICE_KEY = 'xhs-dev-device-v1';
export const DEV_BINDING_KEY = 'xhs-dev-binding-v1';

export interface DevBinding {
  serial: string;
  batch: string;
  code: string;
  deviceId: string;
  activatedAt: number;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEV_DEVICE_KEY);
  if (!id) {
    id = randomHex(8);
    localStorage.setItem(DEV_DEVICE_KEY, id);
  }
  return id;
}

export function readBinding(): DevBinding | null {
  try {
    const raw = localStorage.getItem(DEV_BINDING_KEY);
    if (!raw) return null;
    const binding = JSON.parse(raw) as DevBinding;
    if (!binding || typeof binding.serial !== 'string' || typeof binding.code !== 'string') return null;
    return binding;
  } catch {
    return null;
  }
}

export type BindResult = { ok: true; binding: DevBinding } | { ok: false; reason: string };

function writeBinding(code: string, fields: LicenseFields): DevBinding {
  const binding: DevBinding = {
    serial: fields.serial,
    batch: fields.batch,
    code,
    deviceId: getDeviceId(),
    activatedAt: Date.now(),
  };
  localStorage.setItem(DEV_BINDING_KEY, JSON.stringify(binding));
  return binding;
}

/**
 * 一台设备只绑定一个授权码。已绑定的码若被吊销、过期或超出版本范围则自动解绑，
 * 允许换发新码；仍有效的旧码会阻止本机改用其它码。
 */
export async function resolveBinding(
  code: string,
  fields: LicenseFields,
  env: LicenseEnv,
): Promise<BindResult> {
  const existing = readBinding();
  if (existing && existing.serial === fields.serial) return { ok: true, binding: existing };
  if (existing) {
    const oldFields = await verifyLicense(existing.code);
    const oldProblem = oldFields ? licenseProblem(oldFields, env) : '授权码无效';
    if (!oldProblem) {
      return {
        ok: false,
        reason: `本机已绑定编号「${existing.serial}」的授权码，一台设备只能使用一个授权码`,
      };
    }
  }
  return { ok: true, binding: writeBinding(code, fields) };
}