# READ-ONLY state check for the maintenance window. Changes nothing.
#   -Expect Stopped   beta Caddy + API fully down: ports 3101/8480 free, no beta process, no restart-loop cmd
#   -Expect Running   beta stack up: 3101 and 8480 listening on loopback only
# Run from an ELEVATED shell: the beta tasks run as SYSTEM and their command lines are invisible otherwise.
param([ValidateSet('Stopped', 'Running')][string]$Expect = 'Stopped')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release "window-guard-$Expect"
Rec 'running elevated' (Test-Admin)
$procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'BidaZoo-beta\\(app|bin\\run-(api|caddy)|config\\(api\.env|Caddyfile))') })
foreach ($p in $procs) { Note ("beta process: {0} pid {1}" -f $p.Name, $p.ProcessId) }
$api = Test-Listening 3101; $cad = Test-Listening 8480
if ($Expect -eq 'Stopped') {
    Rec 'nothing listening on 3101 (beta API)' (-not $api)
    Rec 'nothing listening on 8480 (beta Caddy)' (-not $cad)
    Rec 'no beta API/Caddy process or restart loop remains' ($procs.Count -eq 0)
} else {
    Rec 'beta API listening on 3101' $api
    Rec 'beta Caddy listening on 8480' $cad
    foreach ($port in 3101, 8480, $LivePort) {
        $addr = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalAddress -Unique)
        Rec "port $port bound to loopback only" ($addr.Count -gt 0 -and @($addr | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count -eq 0) ($addr -join ',')
    }
}
Rec 'live PostgreSQL (54340) is up in both cases' (Test-Listening $LivePort)
Note 'Unrelated services are never inspected or stopped here (system Caddy :80/:2019, Cloudflared service).'
Finish-Release
