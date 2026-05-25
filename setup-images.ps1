# Копирует фото с рабочего стола в сайт и создаёт manifest.json
$src = Join-Path $env:USERPROFILE "Desktop\картинки"
$root = $PSScriptRoot
$dst = Join-Path $root "images"

if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "Папка не найдена: $src" -ForegroundColor Red
    Write-Host "Положите фото в Desktop\картинки и запустите снова."
    exit 1
}

New-Item -ItemType Directory -Force -Path $dst | Out-Null

$ext = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.JPG', '.JPEG', '.PNG', '.WEBP')
$files = Get-ChildItem -LiteralPath $src -File | Where-Object { $ext -contains $_.Extension } | Sort-Object Name

if ($files.Count -eq 0) {
    Write-Host "В папке нет изображений." -ForegroundColor Yellow
    exit 1
}

$manifest = [System.Collections.ArrayList]@()
$i = 1
$cats = @('territory', 'house', 'rooms', 'interior', 'territory', 'house')

foreach ($f in $files) {
    $newName = "{0:D2}{1}" -f $i, $f.Extension.ToLower()
    $dest = Join-Path $dst $newName
    Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
    $cat = $cats[($i - 1) % $cats.Length]
    [void]$manifest.Add([ordered]@{
        src      = "images/$newName"
        title    = "Dvin — фото $i"
        category = $cat
    })
    Write-Host "OK: $($f.Name) -> $newName"
    $i++
}

$json = @{ photos = $manifest } | ConvertTo-Json -Depth 4
$json | Set-Content -Path (Join-Path $dst "manifest.json") -Encoding UTF8

Write-Host ""
Write-Host "Готово: $($files.Count) фото. Откройте index.html" -ForegroundColor Green
