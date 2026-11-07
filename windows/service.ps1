# =====================================================================
#  QLTB-CNTT - Cong cu cai dat va quan ly dich vu tren Windows
#  Phan mem chay nen bang Task Scheduler (tai khoan SYSTEM), tu khoi dong
#  cung may chu, khong can dang nhap Windows.
# =====================================================================
#Requires -Version 5.1
param(
  [ValidateSet('install', 'uninstall', 'start', 'stop', 'restart', 'status', 'logs', 'open', 'reset-admin', 'set-port', 'backups')]
  [string]$Action = 'status',
  [int]$Port = 0,
  [string]$InstallDir = '',
  [switch]$Interactive,
  [switch]$Quiet,
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$TaskName = 'QLTB-CNTT'
$AppName = 'QLTB-CNTT'
$MinNode = [version]'22.13.0'
$ScriptAppDir = Split-Path -Parent $PSScriptRoot

function Say([string]$msg, [string]$color = 'Gray') { if (-not $Quiet) { Write-Host $msg -ForegroundColor $color } }
function Fail([string]$msg) {
  Write-Host "[LOI] $msg" -ForegroundColor Red
  try {
    $logDir = Join-Path $ScriptAppDir 'data\logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -Path (Join-Path $logDir 'install.log') -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Action] $msg"
  } catch { }
  exit 1
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-Config([string]$dir) {
  $cfg = @{ PORT = '3000'; NODE_EXE = '' }
  $f = Join-Path $dir 'windows\config.cmd'
  if (Test-Path $f) {
    foreach ($line in Get-Content $f) {
      if ($line -match '^set "(\w+)=(.*)"\s*$') { $cfg[$matches[1]] = $matches[2] }
    }
  }
  return $cfg
}

function Write-Config([string]$dir, [int]$port, [string]$node) {
  $f = Join-Path $dir 'windows\config.cmd'
  $text = "@echo off`r`nrem Tu dong tao boi trinh cai dat - khong sua tay`r`nset `"PORT=$port`"`r`nset `"NODE_EXE=$node`"`r`n"
  $enc = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
  [IO.File]::WriteAllText($f, $text, $enc)
}

function Get-NodeVersion([string]$exe) {
  try {
    $v = & $exe -p 'process.versions.node' 2>$null
    if ($LASTEXITCODE -eq 0 -and $v) { return [version]($v.Trim()) }
  } catch { }
  return $null
}

function Find-Node([string]$dir) {
  $cands = @((Join-Path $dir 'runtime\node.exe'))
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { $cands += $cmd.Source }
  $cands += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
  foreach ($c in $cands) {
    if ($c -and (Test-Path $c)) {
      $v = Get-NodeVersion $c
      if ($v -and $v -ge $MinNode) { return (Resolve-Path $c).Path }
    }
  }
  return $null
}

function Install-NodeWinget {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { return $false }
  Say 'Chua co Node.js phu hop. Dang tai va cai dat Node.js LTS (can Internet)...' Yellow
  & winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Host
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  return $true
}

function Get-AppPid([string]$dir) {
  $f = Join-Path $dir 'data\server.pid'
  if (-not (Test-Path $f)) { return $null }
  try {
    $procId = [int]((Get-Content $f -Raw).Trim())
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { return $procId }
  } catch { }
  return $null
}

function Test-Health([int]$port) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Stop-App([string]$dir) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  }
  $procId = Get-AppPid $dir
  if ($procId) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 800 }
  Remove-Item (Join-Path $dir 'data\server.pid') -Force -ErrorAction SilentlyContinue
}

function Start-App([string]$dir, [int]$port) {
  if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) { Fail 'Dich vu chua duoc cai dat. Hay chay CAI-DAT.bat.' }
  Start-ScheduledTask -TaskName $TaskName
  Say "Dang khoi dong phan mem tren cong $port ..."
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 750
    if (Test-Health $port) { Say 'Phan mem da san sang.' Green; return $true }
  }
  Say 'Phan mem chua phan hoi. Xem nhat ky tai data\logs\server.log' Yellow
  return $false
}

function Register-AppTask([string]$dir) {
  $runner = Join-Path $dir 'windows\run-server.cmd'
  $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$runner`"`"" -WorkingDirectory $dir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Phan mem quan ly thiet bi CNTT (QLTB-CNTT) - may chu web' -Force | Out-Null
}

function Set-Firewall([int]$port) {
  try {
    Get-NetFirewallRule -DisplayName $AppName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $AppName -Description 'Cho phep may tinh trong mang noi bo truy cap QLTB-CNTT' `
      -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
    Say "Da mo tuong lua cong $port cho mang noi bo (LocalSubnet)."
  } catch {
    Say "Khong cau hinh duoc tuong lua: $($_.Exception.Message). Hay mo cong $port thu cong neu can." Yellow
  }
}

function Set-Shortcuts([string]$dir, [int]$port) {
  $ico = Join-Path $dir 'public\favicon.ico'
  $url = "[InternetShortcut]`r`nURL=http://localhost:$port/`r`nIconFile=$ico`r`nIconIndex=0`r`n"
  $desk = [Environment]::GetFolderPath('CommonDesktopDirectory')
  $menu = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) $AppName
  New-Item -ItemType Directory -Force -Path $menu | Out-Null
  [IO.File]::WriteAllText((Join-Path $desk 'QLTB-CNTT.url'), $url, [Text.Encoding]::ASCII)
  [IO.File]::WriteAllText((Join-Path $menu 'QLTB-CNTT.url'), $url, [Text.Encoding]::ASCII)
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut((Join-Path $menu 'Quan ly dich vu QLTB-CNTT.lnk'))
  $lnk.TargetPath = Join-Path $dir 'QUAN-LY.bat'
  $lnk.WorkingDirectory = $dir
  $lnk.IconLocation = "$ico,0"
  $lnk.Save()
}

function Remove-Shortcuts {
  Remove-Item (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'QLTB-CNTT.url') -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path ([Environment]::GetFolderPath('CommonPrograms')) $AppName) -Recurse -Force -ErrorAction SilentlyContinue
}

function Show-Urls([int]$port) {
  Say ''
  Say '================================================================' Cyan
  Say ' TRUY CAP PHAN MEM:' Cyan
  Say "   Tren may chu nay : http://localhost:$port" White
  try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      ForEach-Object { Say "   Tu may khac (LAN) : http://$($_.IPAddress):$port" White }
  } catch { }
  Say '   Tai khoan mac dinh: admin / admin@123 (doi mat khau khi dang nhap lan dau)' White
  Say '================================================================' Cyan
}

# ----------------------------------------------------------------------
function Invoke-Install {
  if (-not (Test-Admin)) { Fail 'Can chay voi quyen Administrator (chuot phai > Run as administrator).' }
  if (-not $InstallDir) { $InstallDir = if ($ScriptAppDir -like "$env:SystemDrive\QLTB-CNTT*" -or $ScriptAppDir -like "$env:ProgramFiles*") { $ScriptAppDir } else { "$env:SystemDrive\QLTB-CNTT" } }
  $defaultPort = [int](Read-Config $InstallDir).PORT
  if ($Interactive) {
    $d = Read-Host "Thu muc cai dat [$InstallDir]"
    if ($d) { $InstallDir = $d.Trim('"', ' ') }
    $defaultPort = [int](Read-Config $InstallDir).PORT
    $p = Read-Host "Cong truy cap (port) [$defaultPort]"
    if ($p) { $Port = [int]$p }
  }
  if ($Port -le 0) { $Port = $defaultPort }
  if ($Port -lt 1 -or $Port -gt 65535) { Fail 'Cong khong hop le' }
  $InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
  if ($InstallDir -match '[^\x20-\x7E]') { Fail 'Duong dan cai dat chi nen dung ky tu khong dau (VD: C:\QLTB-CNTT).' }

  Say "`n[1/7] Dung phien ban dang chay (neu co)..." Cyan
  Stop-App $InstallDir

  $src = $ScriptAppDir.TrimEnd('\')
  if ($src -ne $InstallDir) {
    Say "[2/7] Sao chep phan mem vao $InstallDir ..." Cyan
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    & robocopy $src $InstallDir /E /R:2 /W:1 /XD "$src\data" "$src\.git" /XF "$src\windows\config.cmd" /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "Sao chep that bai (ma loi robocopy $LASTEXITCODE)" }
  } else {
    Say "[2/7] Cai dat tai thu muc hien tai: $InstallDir" Cyan
  }

  try { Get-ChildItem -Path $InstallDir -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue } catch { }

  Say '[3/7] Kiem tra Node.js...' Cyan
  $node = Find-Node $InstallDir
  if (-not $node -and (Install-NodeWinget)) { $node = Find-Node $InstallDir }
  if (-not $node) { Fail "Khong tim thay Node.js $MinNode tro len. Tai ban LTS tai https://nodejs.org, cai dat roi chay lai CAI-DAT.bat." }
  Say "      Node.js: $node (v$(Get-NodeVersion $node))"

  Say '[4/7] Kiem tra thu vien...' Cyan
  if (-not (Test-Path (Join-Path $InstallDir 'node_modules\express\package.json'))) {
    $npm = Join-Path (Split-Path $node) 'npm.cmd'
    if (-not (Test-Path $npm)) { Fail 'Thieu thu muc node_modules va khong co npm. Hay dung goi cai dat day du (ban offline).' }
    Say '      Dang cai thu vien (can Internet)...'
    Push-Location $InstallDir
    & $npm install --omit=dev --no-audit --no-fund | Out-Host
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail 'Cai dat thu vien that bai. Kiem tra ket noi Internet.' }
  }

  $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    $owner = (Get-Process -Id $busy[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Fail "Cong $Port dang duoc chuong trinh '$owner' su dung. Chay lai va chon cong khac (VD: 8080)."
  }
  Write-Config $InstallDir $Port $node
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'data\logs') | Out-Null

  Say '[5/7] Dang ky dich vu tu khoi dong cung Windows...' Cyan
  Register-AppTask $InstallDir

  Say '[6/7] Cau hinh tuong lua va loi tat...' Cyan
  Set-Firewall $Port
  try { Set-Shortcuts $InstallDir $Port; Say '      Da tao loi tat tren Desktop va Start Menu.' } catch { Say "      Khong tao duoc loi tat: $($_.Exception.Message)" Yellow }

  if ($NoStart) { Say '[7/7] Bo qua khoi dong.' Cyan; return }
  Say '[7/7] Khoi dong phan mem...' Cyan
  $ok = Start-App $InstallDir $Port
  Show-Urls $Port
  if ($ok -and $Interactive) { Start-Process "http://localhost:$Port/" }
}

function Invoke-Uninstall {
  if (-not (Test-Admin)) { Fail 'Can chay voi quyen Administrator.' }
  $dir = if ($InstallDir) { $InstallDir } else { $ScriptAppDir }
  Say 'Dang dung va go dich vu...' Cyan
  Stop-App $dir
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $AppName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Remove-Shortcuts
  Say 'Da go dich vu, quy tac tuong lua va loi tat.' Green
  Say "Du lieu VAN DUOC GIU tai: $dir\data (co so du lieu va ban sao luu). Xoa thu cong neu khong can." Yellow
}

function Invoke-Status {
  $dir = $ScriptAppDir
  $cfg = Read-Config $dir
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Say "Thu muc      : $dir"
  Say ("Dich vu      : " + $(if ($task) { "Da cai dat ($($task.State))" } else { 'CHUA CAI DAT' }))
  Say "Cong         : $($cfg.PORT)"
  Say "Node.js      : $($cfg.NODE_EXE)"
  $procId = Get-AppPid $dir
  Say ("Tien trinh   : " + $(if ($procId) { "Dang chay (PID $procId)" } else { 'Khong chay' }))
  $h = Test-Health ([int]$cfg.PORT)
  Say ("Truy cap web : " + $(if ($h) { 'BINH THUONG' } else { 'KHONG PHAN HOI' })) $(if ($h) { 'Green' } else { 'Red' })
  $db = Join-Path $dir 'data\qltb.db'
  if (Test-Path $db) { Say ("Co so du lieu: {0} ({1:N1} MB)" -f $db, ((Get-Item $db).Length / 1MB)) }
  $bk = Join-Path $dir 'data\backups'
  if (Test-Path $bk) {
    $last = Get-ChildItem $bk -Filter *.db | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($last) { Say "Sao luu gan nhat: $($last.Name) ($($last.LastWriteTime))" }
  }
}

$dir = $ScriptAppDir
$cfgPort = [int](Read-Config $dir).PORT
switch ($Action) {
  'install' { Invoke-Install }
  'uninstall' { Invoke-Uninstall }
  'start' { Start-App $dir $cfgPort | Out-Null }
  'stop' { Stop-App $dir; Say 'Da dung phan mem.' Green }
  'restart' { Stop-App $dir; Start-App $dir $cfgPort | Out-Null }
  'status' { Invoke-Status }
  'open' { Start-Process "http://localhost:$cfgPort/" }
  'logs' {
    $log = Join-Path $dir 'data\logs\server.log'
    if (Test-Path $log) { Start-Process notepad.exe $log } else { Say 'Chua co nhat ky.' Yellow }
  }
  'backups' {
    $bk = Join-Path $dir 'data\backups'
    New-Item -ItemType Directory -Force -Path $bk | Out-Null
    Start-Process explorer.exe $bk
  }
  'reset-admin' {
    $node = (Read-Config $dir).NODE_EXE
    if (-not $node -or -not (Test-Path $node)) { $node = Find-Node $dir }
    if (-not $node) { Fail 'Khong tim thay Node.js' }
    $pw = Read-Host 'Mat khau moi cho tai khoan admin (Enter = admin@123)'
    Push-Location $dir
    if ($pw) { & $node --disable-warning=ExperimentalWarning scripts\reset-admin.js $pw } else { & $node --disable-warning=ExperimentalWarning scripts\reset-admin.js }
    Pop-Location
  }
  'set-port' {
    if (-not (Test-Admin)) { Fail 'Can quyen Administrator.' }
    if ($Port -le 0) { $Port = [int](Read-Host "Cong moi (hien tai $cfgPort)") }
    if ($Port -lt 1 -or $Port -gt 65535) { Fail 'Cong khong hop le' }
    $node = (Read-Config $dir).NODE_EXE
    Stop-App $dir
    Write-Config $dir $Port $node
    Set-Firewall $Port
    try { Set-Shortcuts $dir $Port } catch { }
    Start-App $dir $Port | Out-Null
    Show-Urls $Port
  }
}
