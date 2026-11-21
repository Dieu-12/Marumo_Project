param(
    [string]$Server = 'localhost',
    [string]$BaselineSchema
)

$ErrorActionPreference = 'Stop'
$sqlRoot = Split-Path $PSScriptRoot -Parent
$schemaPath = Join-Path $sqlRoot 'MarumoDB.sql'
$migrationPath = Join-Path $sqlRoot 'migrations/20261121_db_integrity.sql'
$database = 'MarumoIntegrityTest_' + [guid]::NewGuid().ToString('N')
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) $database
New-Item -ItemType Directory -Path $testDirectory | Out-Null

function Invoke-TestSqlFile([string]$Path) {
    $output = & sqlcmd -S $Server -E -C -I -f 65001 -b -l 15 -d $database -i $Path 2>&1
    $code = $LASTEXITCODE
    $output | Out-File (Join-Path $testDirectory ((Split-Path $Path -Leaf) + '.log')) -Encoding utf8
    if ($code -ne 0) { throw ($output -join [Environment]::NewLine) }
    $output | Where-Object { "$_" -match '^PASS' } | ForEach-Object { Write-Host $_ }
}

function Open-TestConnection {
    $builder = [Data.SqlClient.SqlConnectionStringBuilder]::new()
    $builder['Data Source'] = $Server
    $builder['Initial Catalog'] = $database
    $builder['Integrated Security'] = $true
    $builder['TrustServerCertificate'] = $true
    $connection = [Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
    $connection.Open()
    return $connection
}

function Invoke-ConcurrentSql([string]$First, [string]$Second) {
    $one = Open-TestConnection
    $two = Open-TestConnection
    try {
        $a = $one.CreateCommand()
        $a.CommandTimeout = 30
        $a.CommandText = $First
        $b = $two.CreateCommand()
        $b.CommandTimeout = 30
        $b.CommandText = $Second
        $taskA = $a.ExecuteNonQueryAsync()
        $taskB = $b.ExecuteNonQueryAsync()
        [void]$taskA.GetAwaiter().GetResult()
        [void]$taskB.GetAwaiter().GetResult()
    }
    finally {
        $one.Dispose()
        $two.Dispose()
    }
}

try {
    $inputSchema = if ($BaselineSchema) { $BaselineSchema } else { $schemaPath }
    $source = Get-Content -LiteralPath $inputSchema -Raw -Encoding utf8
    $clone = $source.Replace("DB_ID(N'MarumoDB')", "DB_ID(N'$database')").Replace(
        'CREATE DATABASE MarumoDB COLLATE', "CREATE DATABASE [$database] COLLATE"
    ).Replace('USE MarumoDB;', "USE [$database];")
    if ($clone -match '(?im)^\s*USE\s+MarumoDB\s*;' -or $clone -eq $source) {
        throw 'The schema database name was not redirected.'
    }
    $installPath = Join-Path $testDirectory 'schema.sql'
    [IO.File]::WriteAllText($installPath, $clone, [Text.UTF8Encoding]::new($true))
    $output = & sqlcmd -S $Server -E -C -I -f 65001 -b -l 15 -d master -i $installPath 2>&1
    $code = $LASTEXITCODE
    $output | Out-File (Join-Path $testDirectory 'install.log') -Encoding utf8
    if ($code -ne 0) { throw ($output -join [Environment]::NewLine) }
    Write-Host 'PASS isolated schema installation'
    Invoke-TestSqlFile $migrationPath
    Invoke-TestSqlFile $migrationPath
    Write-Host 'PASS migration applied twice'
    Invoke-TestSqlFile (Join-Path $PSScriptRoot 'db_integrity.sql')
    Invoke-TestSqlFile (Join-Path $PSScriptRoot 'db_migration_setup.sql')
    Invoke-TestSqlFile $migrationPath
    Invoke-TestSqlFile (Join-Path $PSScriptRoot 'db_migration_assert.sql')
    Invoke-TestSqlFile (Join-Path $PSScriptRoot 'db_concurrency_setup.sql')

    $webhook = @'
DECLARE @tx BIGINT=(SELECT payment_transaction_id FROM dbo.payment_transactions WHERE idempotency_key='REVIEW_CONCURRENT_PAYMENT');
DECLARE @provider INT=(SELECT provider_id FROM dbo.payment_transactions WHERE payment_transaction_id=@tx);
EXEC dbo.usp_payment_provider_event_apply @provider_id=@provider,@provider_event_id='REVIEW_CONCURRENT_EVENT',@payment_transaction_id=@tx,@event_type='PAYMENT_SUCCESS',@event_payload=N'{}',@signature_valid=1,@provider_transaction_id='REVIEW_CONCURRENT_TX',@event_amount=100000,@event_currency='VND';
'@
    Invoke-ConcurrentSql ("BEGIN TRANSACTION;`n" + $webhook + "`nWAITFOR DELAY '00:00:01'; COMMIT TRANSACTION;") $webhook
    $allocation = @'
SET XACT_ABORT ON;
DECLARE @booking BIGINT=(SELECT booking_id FROM dbo.bookings WHERE booking_code='{BOOKING}');
DECLARE @seat BIGINT=(SELECT ss.showtime_seat_id FROM dbo.showtime_seats ss JOIN dbo.seats s ON s.seat_id=ss.seat_id WHERE s.seat_code='REVIEW_RACE_SEAT');
BEGIN TRY
 BEGIN TRANSACTION;
 INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price)
 SELECT @booking,showtime_id,showtime_seat_id,100000,100000 FROM dbo.showtime_seats WITH (UPDLOCK,HOLDLOCK) WHERE showtime_seat_id=@seat;
 UPDATE dbo.showtime_seats SET seat_status='BOOKED' WHERE showtime_seat_id=@seat;
 WAITFOR DELAY '00:00:01';
 COMMIT TRANSACTION;
END TRY BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 IF ERROR_NUMBER() NOT IN (2601,2627) THROW;
END CATCH;
'@
    Invoke-ConcurrentSql ($allocation.Replace('{BOOKING}', 'REVIEW_RACE_ONE')) ($allocation.Replace('{BOOKING}', 'REVIEW_RACE_TWO'))
    Invoke-TestSqlFile (Join-Path $PSScriptRoot 'db_concurrency_assert.sql')

    $connection = Open-TestConnection
    try {
        $current = Get-Content -LiteralPath $schemaPath -Raw -Encoding utf8
        foreach ($match in [regex]::Matches($current, '(?ms)^CREATE (?:PROCEDURE|TRIGGER) dbo\.(\w+)\b.*?(?=^GO\r?$)')) {
            $command = $connection.CreateCommand()
            $command.CommandText = 'SELECT OBJECT_DEFINITION(OBJECT_ID(@name))'
            [void]$command.Parameters.AddWithValue('@name', 'dbo.' + $match.Groups[1].Value)
            $actual = [string]$command.ExecuteScalar()
            $actual = [regex]::Replace($actual, '(?is)^.*?(?=CREATE\s+(?:OR ALTER\s+)?(?:PROCEDURE|TRIGGER)\s+dbo\.)', '')
            $actual = $actual -replace '^CREATE OR ALTER ', 'CREATE '
            $actual = ($actual -replace '\s+', ' ').Trim()
            $expected = ($match.Value -replace '\s+', ' ').Trim()
            if ($actual -cne $expected) { throw ('Migrated module differs: ' + $match.Groups[1].Value) }
        }
    }
    finally { $connection.Dispose() }
    Write-Host 'PASS migrated modules match fresh schema'
    Write-Host ("PASS all DB tests; logs: $testDirectory")
}
finally {
    $output = & sqlcmd -S $Server -E -C -b -l 15 -d master -Q "IF DB_ID(N'$database') IS NOT NULL BEGIN ALTER DATABASE [$database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$database]; END;" 2>&1
    if ($LASTEXITCODE -ne 0) { throw ("Could not remove test database $database. " + ($output -join [Environment]::NewLine)) }
}
