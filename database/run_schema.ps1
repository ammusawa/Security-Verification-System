# Run MySQL schema for Security Verification System
# Creates the database if missing, then applies schema.sql
# Uses MYSQL_* from environment or backend/.env; prompts for password if not set.

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SchemaPath = Join-Path $ScriptDir "schema.sql"

# Load backend/.env if present (for MYSQL_USER, MYSQL_PASSWORD, MYSQL_HOST, MYSQL_DATABASE)
$EnvFile = Join-Path (Split-Path -Parent $ScriptDir) "backend\.env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$MYSQL_USER = if ($env:MYSQL_USER) { $env:MYSQL_USER } else { "root" }
$MYSQL_HOST = if ($env:MYSQL_HOST) { $env:MYSQL_HOST } else { "localhost" }
$MYSQL_PORT = if ($env:MYSQL_PORT) { $env:MYSQL_PORT } else { "3306" }
$MYSQL_DATABASE = if ($env:MYSQL_DATABASE) { $env:MYSQL_DATABASE } else { "security_verification" }
$MYSQL_PASSWORD = $env:MYSQL_PASSWORD

Write-Host "Database: $MYSQL_DATABASE @ $MYSQL_HOST`:$MYSQL_PORT (user: $MYSQL_USER)" -ForegroundColor Cyan

# Build mysql args (password: -p with no space means "use env", or will prompt)
$mysqlArgs = @("-h", $MYSQL_HOST, "-P", $MYSQL_PORT, "-u", $MYSQL_USER)
if ($MYSQL_PASSWORD) {
    $mysqlArgs += "-p$MYSQL_PASSWORD"
} else {
    $mysqlArgs += "-p"
}

# 1) Create database if not exists
Write-Host "Creating database (if not exists)..." -ForegroundColor Yellow
$createDbSql = "CREATE DATABASE IF NOT EXISTS \`" + $MYSQL_DATABASE + "\`" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
& mysql $mysqlArgs -e $createDbSql 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create database. Check MySQL is running and credentials in backend/.env" -ForegroundColor Red
    exit 1
}
Write-Host "Database ready." -ForegroundColor Green

# 2) Run schema.sql (use cmd for < redirect on Windows)
Write-Host "Applying schema.sql..." -ForegroundColor Yellow
$mysqlCmd = "mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER "
if ($MYSQL_PASSWORD) { $mysqlCmd += "-p$MYSQL_PASSWORD " }
$mysqlCmd += " $MYSQL_DATABASE < \`"$SchemaPath\`""
$result = cmd /c $mysqlCmd 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $result -ForegroundColor Red
    Write-Host "Failed to apply schema." -ForegroundColor Red
    exit 1
}
Write-Host "Schema applied successfully." -ForegroundColor Green
