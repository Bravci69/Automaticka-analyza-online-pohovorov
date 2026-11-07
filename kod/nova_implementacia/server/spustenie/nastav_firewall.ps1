$ErrorActionPreference = 'Stop'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  AutWorldBP - Automaticka sprava Windows Firewall pravidla" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $pwd.Path }

# Hladanie config.json bez akychkolvek natvrdo zadanych fallback portov
$configPaths = @(
    (Join-Path $scriptDir "..\config.json"),
    (Join-Path $scriptDir "config.json"),
    (Join-Path $scriptDir "..\..\..\config.json"),
    (Join-Path $pwd "config.json"),
    (Join-Path $pwd "kod\nova_implementacia\server\config.json"),
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
                $usedConfig = (Resolve-Path $p).Path
                break
            }
        } catch {}
    }
}

if (-not $targetPort) {
    Write-Host "[AutWorldBP] CHYBA: Subor config.json nebol najdeny alebo neobsahuje parameter 'port'!" -ForegroundColor Red
    Write-Host "[AutWorldBP] Port sa NENASTAVUJE natvrdo, musi byt definovany v config.json." -ForegroundColor Red
    exit 1
}

Write-Host "[AutWorldBP] Cielovy port nacitany z config.json: $targetPort" -ForegroundColor Cyan
Write-Host "[AutWorldBP] Konfiguracny subor: $usedConfig" -ForegroundColor DarkGray

$ruleName = "AutWorldBP"
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue

if ($existing) {
    $pf = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $existing -ErrorAction SilentlyContinue
    $curPort = $pf.LocalPort
    Write-Host "[AutWorldBP] Najdene existujuce firewall pravidlo '$ruleName' s portom: $curPort"

    if ($curPort -eq [string]$targetPort) {
        Write-Host "[AutWorldBP] OK: Port v pravidle '$ruleName' sa zhoduje s portom v config.json ($targetPort). Ziadna zmena nie je potrebna." -ForegroundColor Green
    } else {
        Write-Host "[AutWorldBP] ZMENA ZISTENA: Port v pravidle ($curPort) sa NEZHODUJE s portom v config.json ($targetPort)!" -ForegroundColor Yellow
        Write-Host "[AutWorldBP] Mazem stare firewall pravidlo '$ruleName'..." -ForegroundColor Yellow
        Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        Write-Host "[AutWorldBP] Vytvaram nove firewall pravidlo '$ruleName' pre port $targetPort..." -ForegroundColor Cyan
        New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $targetPort -Action Allow -Enabled True | Out-Null
        Write-Host "[AutWorldBP] HOTOVO: Pravidlo '$ruleName' bolo uspesne prekonfigurovane na port $targetPort!" -ForegroundColor Green
    }
} else {
    Write-Host "[AutWorldBP] Pravidlo '$ruleName' este neexistuje. Vytvaram pre port $targetPort..." -ForegroundColor Cyan
    New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $targetPort -Action Allow -Enabled True | Out-Null
    Write-Host "[AutWorldBP] HOTOVO: Firewall pravidlo '$ruleName' bolo uspesne vytvorene pre port $targetPort!" -ForegroundColor Green
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Hotovo." -ForegroundColor Green

