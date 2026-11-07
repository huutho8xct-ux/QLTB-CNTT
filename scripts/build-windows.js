// Đóng gói bản cài đặt Windows (offline, kèm sẵn Node.js và thư viện):
//   npm run build:windows
// Kết quả: dist/QLTB-CNTT-<phiên bản>-windows-x64.zip và thư mục dist/QLTB-CNTT (dùng cho Inno Setup)
// Tùy chọn: NODE_VERSION=v22.x.y để chọn phiên bản Node.js đóng kèm (mặc định: phiên bản đang chạy).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'QLTB-CNTT');
const CACHE = path.join(DIST, 'cache');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NODE_VERSION = process.env.NODE_VERSION || process.version;
const WIN = process.platform === 'win32';

const INCLUDE = [
  'server.js', 'package.json', 'package-lock.json', 'README.md', 'HUONG-DAN-CAI-DAT-WINDOWS.md',
  'CAI-DAT.bat', 'QUAN-LY.bat', 'GO-CAI-DAT.bat', 'start.bat', 'src', 'public', 'scripts', 'windows',
];
const EXCLUDE = new Set([path.join('windows', 'config.cmd')]);
const CRLF_EXT = new Set(['.bat', '.cmd', '.ps1', '.iss']);

const step = (m) => console.log(`\n▶ ${m}`);

function copy(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src) || EXCLUDE.has(rel)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(src)) copy(path.join(rel, f));
    return;
  }
  const dst = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (CRLF_EXT.has(path.extname(rel).toLowerCase())) {
    fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace(/\r?\n/g, '\r\n'));
  } else {
    fs.copyFileSync(src, dst);
  }
}

function download(url, file) {
  if (fs.existsSync(file)) return;
  console.log(`  Tải ${url}`);
  const tmp = file + '.part';
  execFileSync(WIN ? 'curl.exe' : 'curl', ['-fL', '--retry', '3', '-o', tmp, url], { stdio: 'inherit' });
  fs.renameSync(tmp, file);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

step(`Chuẩn bị thư mục ${path.relative(ROOT, STAGE)}`);
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
INCLUDE.forEach(copy);

step('Cài thư viện (chỉ phần cần khi chạy)');
execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: STAGE, stdio: 'inherit' });

if (!process.argv.includes('--no-runtime')) {
  step(`Đóng kèm Node.js ${NODE_VERSION} (win-x64)`);
  const name = `node-${NODE_VERSION}-win-x64`;
  const zip = path.join(CACHE, `${name}.zip`);
  const sums = path.join(CACHE, `SHASUMS256-${NODE_VERSION}.txt`);
  download(`https://nodejs.org/dist/${NODE_VERSION}/${name}.zip`, zip);
  download(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`, sums);
  const expected = fs.readFileSync(sums, 'utf8').split('\n').find((l) => l.endsWith(`  ${name}.zip`))?.split(' ')[0];
  if (!expected || expected !== sha256(zip)) {
    fs.rmSync(zip, { force: true });
    throw new Error('Tệp Node.js tải về không khớp mã kiểm tra SHA-256, đã hủy.');
  }
  console.log('  Đã xác minh SHA-256');
  const tmp = path.join(CACHE, 'extract');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  if (WIN) execFileSync('tar.exe', ['-xf', zip, '-C', tmp, `${name}/node.exe`, `${name}/LICENSE`], { stdio: 'inherit' });
  else execFileSync('unzip', ['-q', '-o', zip, `${name}/node.exe`, `${name}/LICENSE`, '-d', tmp], { stdio: 'inherit' });
  const rt = path.join(STAGE, 'runtime');
  fs.mkdirSync(rt, { recursive: true });
  fs.copyFileSync(path.join(tmp, name, 'node.exe'), path.join(rt, 'node.exe'));
  fs.copyFileSync(path.join(tmp, name, 'LICENSE'), path.join(rt, 'LICENSE-nodejs.txt'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

step('Nén gói cài đặt');
const out = path.join(DIST, `QLTB-CNTT-${pkg.version}-windows-x64.zip`);
fs.rmSync(out, { force: true });
if (WIN) {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${STAGE}' -DestinationPath '${out}' -CompressionLevel Optimal`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-q', '-r', '-9', out, 'QLTB-CNTT'], { cwd: DIST, stdio: 'inherit' });
}
console.log(`\n✔ Hoàn tất: ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
console.log('  Tạo Setup.exe (trên Windows, đã cài Inno Setup 6): iscc windows\\setup.iss');
