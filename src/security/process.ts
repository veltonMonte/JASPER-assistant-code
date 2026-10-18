import childProcess from 'node:child_process';
import os from 'node:os';

export interface ProgramOptions { cwd: string; timeoutMs: number; maxBuffer?: number }
export interface ProgramResult { ok: boolean; stdout: string; stderr: string; exitCode: number | null }

/** Ambiente mínimo: não propaga credenciais do servidor aos programas. */
export function minimalEnvironment(gui = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: os.homedir(), LANG: process.env.LANG || 'pt_BR.UTF-8' };
  if (gui) for (const key of ['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export async function runProgram(bin: string, args: string[], opts: ProgramOptions): Promise<ProgramResult> {
  if (!opts.cwd || !Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0 || opts.timeoutMs > 600_000) throw new Error('Informe cwd e timeout válidos para executar o programa.');
  if (!bin || bin.includes('\0') || !Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Programa ou argumentos inválidos.');
  return new Promise(resolve => {
    childProcess.execFile(bin, args, {
      cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: Math.min(opts.maxBuffer ?? 1024 * 1024, 4 * 1024 * 1024),
      env: minimalEnvironment(), shell: false, encoding: 'utf8',
    }, (error, stdout, stderr) => resolve({
      ok: !error, stdout: String(stdout || ''), stderr: String(stderr || error?.message || ''),
      exitCode: error ? (typeof error.code === 'number' ? error.code : null) : 0,
    }));
  });
}

export async function spawnDetached(bin: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(bin, args, { cwd: process.cwd(), env: minimalEnvironment(true), shell: false, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
