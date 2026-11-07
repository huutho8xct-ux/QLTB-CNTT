; =====================================================================
;  Trình cài đặt Windows (Setup.exe) cho QLTB-CNTT - Inno Setup 6
;  Bước 1: npm run build:windows   (tạo thư mục dist\QLTB-CNTT)
;  Bước 2: iscc windows\setup.iss  (tạo dist\QLTB-CNTT-Setup-<phiên bản>.exe)
; =====================================================================
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6B1F2C7E-3A4D-4E8B-9C21-5D7A0F3E9B42}
AppName=QLTB-CNTT - Quản lý thiết bị CNTT
AppVersion={#AppVersion}
AppVerName=QLTB-CNTT {#AppVersion}
AppPublisher=QLTB-CNTT
DefaultDirName={sd}\QLTB-CNTT
DefaultGroupName=QLTB-CNTT
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=admin
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=QLTB-CNTT-Setup-{#AppVersion}
SetupIconFile=..\public\favicon.ico
UninstallDisplayIcon={app}\public\favicon.ico
UninstallDisplayName=QLTB-CNTT - Quản lý thiết bị CNTT
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\QLTB-CNTT\*"; DestDir: "{app}"; Excludes: "windows\config.cmd,data\*"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data"; Flags: uninsneveruninstall

[Run]
Filename: "http://localhost:{code:GetPort}/"; Description: "Mở phần mềm QLTB-CNTT ngay"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\windows\service.ps1"" -Action uninstall -InstallDir ""{app}"" -Quiet"; Flags: runhidden waituntilterminated; RunOnceId: "QLTBUninstallService"

[Code]
var
  PortPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PortPage := CreateInputQueryPage(wpSelectDir,
    'Cổng truy cập',
    'Chọn cổng (port) cho máy chủ web của phần mềm',
    'Phần mềm chạy nền như một dịch vụ và tự khởi động cùng Windows. ' +
    'Các máy tính trong mạng nội bộ truy cập qua địa chỉ http://<IP máy chủ>:<cổng>. ' +
    'Nếu không chắc chắn, hãy giữ nguyên 3000.');
  PortPage.Add('Cổng:', False);
  PortPage.Values[0] := GetPreviousData('Port', '3000');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  P: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    P := StrToIntDef(Trim(PortPage.Values[0]), 0);
    if (P < 1) or (P > 65535) then
    begin
      MsgBox('Cổng không hợp lệ. Vui lòng nhập số từ 1 đến 65535.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'Port', Trim(PortPage.Values[0]));
end;

function GetPort(Param: String): String;
begin
  Result := Trim(PortPage.Values[0]);
end;

function PowerShellRun(Args: String): Integer;
var
  RC: Integer;
begin
  if not Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass ' + Args, '', SW_HIDE, ewWaitUntilTerminated, RC) then
    RC := -1;
  Result := RC;
end;

// Dừng phiên bản đang chạy trước khi ghi đè tệp (nâng cấp)
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  S: String;
begin
  Result := '';
  S := ExpandConstant('{app}\windows\service.ps1');
  if FileExists(S) then
    PowerShellRun('-File "' + S + '" -Action stop -Quiet');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  RC: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Đang cấu hình dịch vụ, tường lửa và khởi động phần mềm...';
    RC := PowerShellRun('-File "' + ExpandConstant('{app}\windows\service.ps1') + '" -Action install -InstallDir "' +
      ExpandConstant('{app}') + '" -Port ' + GetPort('') + ' -Quiet');
    if RC <> 0 then
      MsgBox('Chưa cấu hình được dịch vụ (mã lỗi ' + IntToStr(RC) + ').' + #13#10 +
        'Xem chi tiết tại: ' + ExpandConstant('{app}\data\logs\install.log') + #13#10 +
        'Có thể chạy lại CAI-DAT.bat trong thư mục cài đặt để thử lại.', mbError, MB_OK);
  end;
end;
