# Копирует фото террасы в шапку сайта: public/images/hero.jpg
$dst = Join-Path $PSScriptRoot "public\images\hero.jpg"
$srcDir = Join-Path $env:USERPROFILE "Desktop\картинки"

New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null

if (Test-Path -LiteralPath $srcDir) {
    $imgs = Get-ChildItem -LiteralPath $srcDir -File | Where-Object {
        $_.Extension -match '\.(jpg|jpeg|png|webp)$'
    }
    if ($imgs.Count -gt 0) {
        $pick = $imgs | Sort-Object Length -Descending | Select-Object -First 1
        Copy-Item -LiteralPath $pick.FullName -Destination $dst -Force
        Write-Host "OK: $($pick.Name) -> public/images/hero.jpg" -ForegroundColor Green
        exit 0
    }
}

Write-Host "Положите фото террасы в: $dst" -ForegroundColor Yellow
Write-Host "Или в Desktop\картинки и запустите скрипт снова."
