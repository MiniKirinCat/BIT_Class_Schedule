#ifndef AppVersion
  #define AppVersion "1.3.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\.build\installer-stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif
#ifndef SetupIcon
  #define SetupIcon "..\.build\installer-stage\assets\next-class.ico"
#endif
#ifndef LanguageFile
  #define LanguageFile "languages\ChineseSimplified.isl"
#endif

[Setup]
AppId={{56DDEDF1-14C7-4DF0-BA0E-D336E41D923A}
AppName=下一节
AppVersion={#AppVersion}
AppVerName=下一节 {#AppVersion}
AppPublisher=MiniKirinCat
AppPublisherURL=https://github.com/MiniKirinCat/BIT_Class_Schedule
AppSupportURL=https://github.com/MiniKirinCat/BIT_Class_Schedule
AppUpdatesURL=https://github.com/MiniKirinCat/BIT_Class_Schedule/releases
DefaultDirName={localappdata}\Programs\NextClass
DefaultGroupName=下一节
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=NextClass-Setup-{#AppVersion}
SetupIconFile={#SetupIcon}
UninstallDisplayIcon={app}\assets\next-class.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
UsePreviousAppDir=yes
UsePreviousTasks=yes
UsePreviousLanguage=no
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoVersion={#AppVersion}
VersionInfoCompany=MiniKirinCat
VersionInfoDescription=下一节安装程序
VersionInfoProductName=下一节
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "chinesesimp"; MessagesFile: "{#LanguageFile}"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "附加任务："; Flags: unchecked
Name: "startup"; Description: "开机时自动启动下一节托盘"; GroupDescription: "附加任务："; Flags: unchecked

[Files]
Source: "{#SourceDir}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\frontend\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\下一节"; Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\scripts\tray.py"" --open"; WorkingDir: "{app}"; IconFilename: "{app}\assets\next-class.ico"; Comment: "查看下一节课表"
Name: "{userdesktop}\下一节"; Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\scripts\tray.py"" --open"; WorkingDir: "{app}"; IconFilename: "{app}\assets\next-class.ico"; Comment: "查看下一节课表"; Tasks: desktopicon
Name: "{userstartup}\下一节"; Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\scripts\tray.py"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\next-class.ico"; Comment: "下一节开机启动"; Tasks: startup

[Run]
Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\scripts\tray.py"" --open"; WorkingDir: "{app}"; Description: "启动下一节"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\stop_all.ps1"" -Root ""{app}"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopNextClass"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\backend"
Type: filesandordirs; Name: "{app}\frontend"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\assets"
Type: files; Name: "{localappdata}\NextClass\data\runtime.json"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  PowerShell: String;
  StopScript: String;
  ResultCode: Integer;
begin
  StopScript := ExpandConstant('{app}\scripts\stop_all.ps1');
  PowerShell := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  if not FileExists(PowerShell) then
    PowerShell := 'powershell.exe';
  if FileExists(StopScript) then
    Exec(
      PowerShell,
      '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + StopScript +
        '" -Root "' + ExpandConstant('{app}') + '"',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
  Result := '';
end;
