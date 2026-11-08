$ErrorActionPreference = 'Stop'

Write-Host 'Checking GitHub CLI authentication...' -ForegroundColor Cyan
$login = (gh api user --jq '.login').Trim()
if ($login -ne 'sworldamir') {
    throw "Expected GitHub account sworldamir, but active account is '$login'. Run: gh auth switch --user sworldamir"
}

if (-not (Test-Path '.git')) {
    git init -b main
}

if (-not (git config user.name)) {
    $gitName = (gh api user --jq '.name // .login').Trim()
    git config user.name $gitName
}
if (-not (git config user.email)) {
    $githubId = (gh api user --jq '.id').Trim()
    git config user.email "$githubId+$login@users.noreply.github.com"
}

$remote = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or -not $remote) {
    git remote add origin 'https://github.com/sworldamir/xbank-platform.git'
} else {
    git remote set-url origin 'https://github.com/sworldamir/xbank-platform.git'
}

git add -A
$changes = git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    git commit -m 'feat: add XBank multilingual research demo'
} elseif ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect staged changes.'
} else {
    Write-Host 'No staged changes to commit.' -ForegroundColor Yellow
}

git push -u origin main
Write-Host 'XBank has been pushed to https://github.com/sworldamir/xbank-platform' -ForegroundColor Green
