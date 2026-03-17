@echo off
REM Run MySQL schema for Security Verification System
REM Uses MYSQL_* from environment, or defaults. Prompts for password if MYSQL_PASSWORD not set.

set "SCRIPT_DIR=%~dp0"
set "SCHEMA=%SCRIPT_DIR%schema.sql"

if not defined MYSQL_USER set MYSQL_USER=root
if not defined MYSQL_HOST set MYSQL_HOST=localhost
if not defined MYSQL_PORT set MYSQL_PORT=3306
if not defined MYSQL_DATABASE set MYSQL_DATABASE=security_verification

echo Database: %MYSQL_DATABASE% @ %MYSQL_HOST%:%MYSQL_PORT% (user: %MYSQL_USER%)

echo Creating database if not exists...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p -e "CREATE DATABASE IF NOT EXISTS %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if errorlevel 1 (
    echo Failed to create database. Check MySQL is running and your password.
    exit /b 1
)

echo Applying schema.sql...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p %MYSQL_DATABASE% < "%SCHEMA%"
if errorlevel 1 (
    echo Failed to apply schema.
    exit /b 1
)

echo Schema applied successfully.
