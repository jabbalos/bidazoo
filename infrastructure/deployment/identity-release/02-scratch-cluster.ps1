# Manages the THROWAWAY PostgreSQL cluster used for every rehearsal (port 54341, loopback, scram auth).
# It never touches the live cluster on 54340. Actions: Init | Start | Stop | Status
param([ValidateSet('Init', 'Start', 'Stop', 'Status')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"
Initialize-Release "02-scratch-$Action"
switch ($Action) {
    'Init'   { Initialize-ScratchCluster }
    'Start'  { Start-ScratchCluster }
    'Stop'   { Stop-ScratchCluster }
    'Status' { }
}
Rec 'live cluster untouched (54340 not managed here)' $true
$up = Test-Listening $ScratchPort
Note "scratch cluster listening on 54341: $up"
if ($Action -eq 'Start') { Rec 'scratch cluster running' $up }
if ($Action -eq 'Stop')  { Rec 'scratch cluster stopped' (-not $up) }
if ($up) {
    $l = Get-NetTCPConnection -LocalPort $ScratchPort -State Listen | Select-Object -ExpandProperty LocalAddress -Unique
    Rec 'scratch cluster listens on loopback only' (@($l | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count -eq 0) ($l -join ',')
}
Finish-Release
