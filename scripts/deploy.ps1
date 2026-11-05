# 一键部署（三段式 + 代码闸门）：git 同步检查 -> 拉取合并 -> build -> 双推送 -> 验证
# 用法：npm run deploy
#
# 内容同步策略（防多终端编辑丢稿）：
#   服务器上有独立内容目录 /home/ubuntu/blog-src（posts/ + site.json + post-order.json），
#   部署前先比对 mtime 把「服务器上比本机新/本机没有」的文件拉回本机构建，
#   构建完再把合并结果回传快照——服务器内容目录永远 = 最新已发布状态（兼作云端备份）。
#   冲突规则只有一条：mtime 新者胜（不搞三方合并）。
#   注意：文章内容走 mtime 同步，但**代码走 git**——deploy 前强制与 origin/main 对齐，
#   若本机落后则中止（防止旧代码构建覆盖另一终端已部署的新版本，有过教训）。
#
# 前提：私钥已加入 Windows ssh-agent（服务需为 Running，本机已设为开机自动）。
# 站点地址：feed.xml/sitemap.xml 的绝对链接用 SITE_URL（默认 funnel 公网址，可用环境变量覆盖）。
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 目标可用环境变量覆盖，方便换机器部署
$target    = $env:DEPLOY_TARGET ; if (-not $target)    { $target    = 'ubuntu@100.66.247.91' }
$verifyUrl = $env:DEPLOY_URL    ; if (-not $verifyUrl) { $verifyUrl = 'https://ubuntu-server.tail0f5897.ts.net/' }
$remoteDir = '/var/www/my-web'          # nginx 站点目录（构建产物）
$remoteSrc = '/home/ubuntu/blog-src'    # 内容中转目录（md 源 + 数据 json，不在 nginx 下）

# feed/sitemap/robots 里的绝对地址（构建期 gen-feed.mjs 读取）
$env:SITE_URL = if ($env:SITE_URL) { $env:SITE_URL } else { 'https://ubuntu-server.tail0f5897.ts.net' }

$winSsh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$winScp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$winTar = Join-Path $env:WINDIR 'System32\tar.exe'
foreach ($tool in @($winSsh, $winScp, $winTar)) {
  if (-not (Test-Path $tool)) { throw "缺少工具：$tool" }
}

# ---------- 1/6 代码闸门：本机必须基于最新远程代码构建 ----------
Write-Host '[1/6] git sync guard...' -ForegroundColor Cyan
& git fetch origin
if ($LASTEXITCODE -ne 0) {
  # fetch 失败（网络问题）不中止部署，只提示——与服务器之间走内网 ssh 仍可能可用
  Write-Host '  warning: git fetch 失败，跳过落后检查（网络恢复后建议重新部署）' -ForegroundColor Yellow
}
else {
  $behind = (& git rev-list --count HEAD..origin/main) -as [int]
  if ($behind -gt 0) {
    throw "本机落后 origin/main $behind 个提交，已中止：旧代码构建会覆盖另一终端部署的新版本——先 git pull --rebase 再 deploy"
  }
  Write-Host '  local code is up to date with origin/main' -ForegroundColor DarkGray
}

# ---------- 2/6 拉取：服务器比本机新/本机没有的内容 ----------
Write-Host '[2/6] pulling content from server...' -ForegroundColor Cyan

# 远端清单：每行 "mtime_epoch filename"（站点根与 posts/ 一并列出）
$listing = & $winSsh -o BatchMode=yes $target ('for f in {0}/posts/*.md {0}/site.json {0}/post-order.json; do if [ -f "$f" ]; then echo "$(stat -c %Y "$f") $(basename "$f")"; fi; done' -f $remoteSrc)
if ($LASTEXITCODE -ne 0) { throw '读取服务器内容清单失败（检查 ssh-agent：ssh-add -l）' }

$pulled = 0
foreach ($line in ($listing -split "`n")) {
  $line = $line.Trim()
  if ($line -notmatch '^(\d+)\s+(\S+)$') { continue }
  $remoteTime = [long]$Matches[1]
  $name = $Matches[2]
  $isMd = $name -like '*.md'
  $localPath = if ($isMd) { Join-Path $repoRoot "src\posts\$name" } else { Join-Path $repoRoot "src\$name" }
  $remotePath = if ($isMd) { "$remoteSrc/posts/$name" } else { "$remoteSrc/$name" }

  $needPull = $false
  if (-not (Test-Path $localPath)) {
    $needPull = $true    # 本机没有：其它终端生成的新内容
  }
  else {
    $fileTime = (Get-Item $localPath).LastWriteTimeUtc
    $localTime = ([DateTimeOffset]::new($fileTime.Ticks, [TimeSpan]::Zero)).ToUnixTimeSeconds()
    if ($remoteTime -gt $localTime) { $needPull = $true }   # 服务器更新：服务器端修改要保住
  }

  if ($needPull) {
    & $winScp -o BatchMode=yes -p "${target}:$remotePath" $localPath
    if ($LASTEXITCODE -ne 0) { throw "拉取 $name 失败" }
    Write-Host "  pulled: $name" -ForegroundColor DarkGray
    $pulled++
  }
}
if ($pulled -eq 0) { Write-Host '  nothing new on server' -ForegroundColor DarkGray }
else { Write-Host "  pulled $pulled file(s)" }

# ---------- 3/6 构建 ----------
Write-Host '[3/6] building...' -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'build 失败，部署中止' }
if (-not (Test-Path (Join-Path $repoRoot 'dist\index.html'))) { throw 'dist/index.html 不存在，部署中止' }

# ---------- 4/6 上传构建产物 ----------
Write-Host '[4/6] uploading dist...' -ForegroundColor Cyan
$bundle = Join-Path $env:TEMP 'my-web-dist.tgz'
& $winTar -C dist -czf $bundle .
if ($LASTEXITCODE -ne 0) { throw '本地打包失败' }
& $winScp -o BatchMode=yes $bundle "${target}:/tmp/my-web-dist.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败（检查 ssh-agent：ssh-add -l）" }
& $winSsh -o BatchMode=yes $target "rm -rf $remoteDir/* && tar -xzf /tmp/my-web-dist.tgz -C $remoteDir && rm -f /tmp/my-web-dist.tgz && echo UPLOAD_OK"
if ($LASTEXITCODE -ne 0) { throw '远端解压失败' }
Remove-Item $bundle -Force -ErrorAction SilentlyContinue

# ---------- 5/6 回传内容快照（服务器 = 云端备份） ----------
Write-Host '[5/6] pushing content snapshot...' -ForegroundColor Cyan
$srcBundle = Join-Path $env:TEMP 'my-web-src.tgz'
& $winTar -C src -czf $srcBundle posts site.json post-order.json
if ($LASTEXITCODE -ne 0) { throw '内容打包失败' }
& $winScp -o BatchMode=yes $srcBundle "${target}:/tmp/my-web-src.tgz"
if ($LASTEXITCODE -ne 0) { throw '内容上传失败' }
& $winSsh -o BatchMode=yes $target "mkdir -p $remoteSrc && rm -rf $remoteSrc/posts && tar -xzf /tmp/my-web-src.tgz -C $remoteSrc && rm -f /tmp/my-web-src.tgz && echo SNAPSHOT_OK"
if ($LASTEXITCODE -ne 0) { throw '内容快照写入失败' }
Remove-Item $srcBundle -Force -ErrorAction SilentlyContinue

# ---------- 6/6 验证 ----------
Write-Host '[6/6] verifying...' -ForegroundColor Cyan
$resp = Invoke-WebRequest -Uri $verifyUrl -UseBasicParsing -TimeoutSec 20
if ($resp.StatusCode -ne 200) { throw "部署后验证失败：HTTP $($resp.StatusCode)" }
$feed = Invoke-WebRequest -Uri ($verifyUrl.TrimEnd('/') + '/feed.xml') -UseBasicParsing -TimeoutSec 20
if ($feed.StatusCode -ne 200) { throw "feed 验证失败：HTTP $($feed.StatusCode)" }
Write-Host "部署完成并通过验证：$verifyUrl (HTTP $($resp.StatusCode), feed HTTP $($feed.StatusCode))" -ForegroundColor Green
