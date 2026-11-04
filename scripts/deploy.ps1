# 一键部署：构建 -> tar 管道上传 -> 远端解压覆盖 -> 验证
# 用法：npm run deploy
# 前提：私钥已加入 Windows ssh-agent（Get-Service ssh-agent 需为 Running）
# 服务器端约定：nginx 已配置（SPA fallback + 静态缓存），站点目录 /var/www/my-web 属主为 ubuntu
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 目标可用环境变量覆盖，方便换机器部署
$target    = $env:DEPLOY_TARGET ; if (-not $target)    { $target    = 'ubuntu@100.66.247.91' }
$verifyUrl = $env:DEPLOY_URL    ; if (-not $verifyUrl) { $verifyUrl = 'http://100.66.247.91/' }
$remoteDir = '/var/www/my-web'

$winSsh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$winTar = Join-Path $env:WINDIR 'System32\tar.exe'
foreach ($tool in @($winSsh, $winTar)) {
  if (-not (Test-Path $tool)) { throw "缺少工具：$tool" }
}

# 1. 构建（构建失败/产物缺失直接中止）
Write-Host "[1/3] building (target: $target)..." -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'build 失败，部署中止' }
if (-not (Test-Path (Join-Path $repoRoot 'dist\index.html'))) { throw 'dist/index.html 不存在，部署中止' }

# 2. 上传：Windows 自带 tar 打包，ssh 管道直传远端解压（先清目录避免旧文件残留）
Write-Host '[2/3] uploading...' -ForegroundColor Cyan
# 注意：不用 PS 管道传二进制（Windows PowerShell 5.1 管道会把 gzip 流当文本转码而损坏），
# 改为「本地打包成文件 -> scp 上传 -> 远端解压」三步，所有 PowerShell 版本都稳定。
$bundle = Join-Path $env:TEMP 'my-web-dist.tgz'
& $winTar -C dist -czf $bundle .
if ($LASTEXITCODE -ne 0) { throw '本地打包失败' }
& (Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe') -o BatchMode=yes $bundle "${target}:/tmp/my-web-dist.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败（检查 ssh-agent 是否载入了密钥：ssh-add -l）" }
& $winSsh -o BatchMode=yes $target "rm -rf $remoteDir/* && tar -xzf /tmp/my-web-dist.tgz -C $remoteDir && rm -f /tmp/my-web-dist.tgz && echo UPLOAD_OK"
if ($LASTEXITCODE -ne 0) { throw '远端解压失败' }
Remove-Item $bundle -Force -ErrorAction SilentlyContinue

# 3. 验证：入口可访问
Write-Host '[3/3] verifying...' -ForegroundColor Cyan
$resp = Invoke-WebRequest -Uri $verifyUrl -UseBasicParsing -TimeoutSec 20
if ($resp.StatusCode -ne 200) { throw "部署后验证失败：HTTP $resp.StatusCode" }
Write-Host "部署完成并通过验证：$verifyUrl (HTTP $($resp.StatusCode))" -ForegroundColor Green
