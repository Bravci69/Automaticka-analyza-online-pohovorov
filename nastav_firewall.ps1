$ErrorActionPreference = 'Stop'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  AutWorldBP - Automaticka sprava Windows Firewall pravidla" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $pwd.Path }

$configPaths = @(
    (Join-Path $scriptDir "config.json"),
    (Join-Path $scriptDir "kod\nova_implementacia\server\config.json"),
    (Join-Path $scriptDir "..\config.json"),
    (Join-Path $scriptDir "..\..\config.json"),
    "C:\Users\Administrator\Desktop\BP\kod\nova_implementacia\server\config.json",
    "C:\Users\Administrator\Desktop\BP\config.json"
)

$targetPort = $null
$usedConfig = $null

foreach ($p in $configPaths) {
    if (Test-Path $p) {
        try {
            $cfg = Get-Content $p -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
            if ($cfg -and $cfg.port) {
                $targetPort = [int]$cfg.port
                $usedConfig = $p
                break
            }
        } catch {}
    }
}

if (-not $targetPort) {
    $targetPort = 13191
    Write-Host "[AutWorldBP] config.json nenajdeny, pouzity predvoleny port: $targetPort" -ForegroundColor Yellow
} else {
    Write-Host "[AutWorldBP] Cielovy port z config.json: $targetPort ($usedConfig)" -ForegroundColor Cyan
}

$ruleName = "AutWorldBP"
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue

if ($existing) {
    $pf = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $existing -ErrorAction SilentlyContinue
    $curPort = $pf.LocalPort
    Write-Host "[AutWorldBP] Najdene existujuce firewall pravidlo '$ruleName' s portom: $curPort"

    if ($curPort -eq [string]$targetPort) {
        Write-Host "[AutWorldBP] OK: Port sa zhoduje ($targetPort). Ziadna zmena nie je potrebna." -ForegroundColor Green
    } else {
        Write-Host "[AutWorldBP] ZMENA: Port v pravidle ($curPort) sa NEZHODUJE s portom v config.json ($targetPort)!" -ForegroundColor Yellow
        Write-Host "[AutWorldBP] Mazem stare firewall pravidlo '$ruleName'..." -ForegroundColor Yellow
        Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        Write-Host "[AutWorldBP] Vytvaram nove firewall pravidlo '$ruleName' pre port $targetPort..." -ForegroundColor Cyan
        New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $targetPort -Action Allow -Enabled True | Out-Null
        Write-Host "[AutWorldBP] HOTOVO: Pravidlo '$ruleName' bolo uspesne prekonfigurovane na novy port $targetPort!" -ForegroundColor Green
    }
} else {
    Write-Host "[AutWorldBP] Pravidlo '$ruleName' este neexistuje. Vytvaram pre port $targetPort..." -ForegroundColor Cyan
    New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $targetPort -Action Allow -Enabled True | Out-Null
    Write-Host "[AutWorldBP] HOTOVO: Firewall pravidlo '$ruleName' bolo uspesne vytvorene pre port $targetPort!" -ForegroundColor Green
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Hotovo." -ForegroundColor Green

