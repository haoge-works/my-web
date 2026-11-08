# 秒级回滚：把 current symlink 指回上一 release（publish 保留最近 3 个，可连续回滚）
# 用法：npm run rollback   （发布仓库机制见 scripts/deploy.ps1 头注释）
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$target    = $env:DEPLOY_TARGET ; if (-not $target)    { $target    = 'ubuntu@100.66.247.91' }
$verifyUrl = $env:DEPLOY_URL    ; if (-not $verifyUrl) { $verifyUrl = 'https://ubuntu-server.tail0f5897.ts.net/' }
$remoteDir = '/var/www/my-web'

$winSsh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$winScp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
if (-not (Test-Path $winSsh)) { throw "缺少工具：$winSsh" }

Write-Host "rollback on $target ..." -ForegroundColor Cyan
& $winScp -o BatchMode=yes (Join-Path $PSScriptRoot 'remote-publish.sh') "${target}:/tmp/my-web-publish.sh"
if ($LASTEXITCODE -ne 0) { throw '上传发布脚本失败（检查 ssh-agent：ssh-add -l）' }
$rLine = & $winSsh -o BatchMode=yes $target "bash /tmp/my-web-publish.sh rollback $remoteDir"
if ($LASTEXITCODE -ne 0) { throw "回滚失败：$rLine" }
$rout = ($rLine | Out-String).Trim()
if ($rout -match 'ROLLBACK_OK') {
  Write-Host $rout -ForegroundColor Green
}
elseif ($rout -match 'ALREADY_OLDEST') {
  Write-Host $rout -ForegroundColor Yellow
}
else { throw "远端返回异常：$rout" }

# 验证（nginx root 已切到 current 时线上立即生效；未切换则只影响 current，线上由旧目录服务）
try {
  $resp = Invoke-WebRequest -Uri $verifyUrl -UseBasicParsing -TimeoutSec 15
  Write-Host "回滚完成并通过验证：$verifyUrl (HTTP $($resp.StatusCode))"
}
catch {
  Write-Host '回滚已执行，但公网验证未通过——若 nginx root 尚未切到 current，回滚不会反映到线上（先完成 root 切换）' -ForegroundColor Yellow
}
