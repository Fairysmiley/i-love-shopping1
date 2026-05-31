@echo off
REM Generate self-signed TLS certificate for Windows

echo Generating self-signed TLS certificate...

REM Create certs directory
if not exist certs mkdir certs

REM Generate certificate using OpenSSL (must be installed)
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs\key.pem -out certs\cert.pem -days 365 -subj "/C=FI/ST=Finland/L=Local/O=E-Commerce-School-Project/CN=localhost"

echo.
echo Certificate generated at certs\cert.pem
echo Private key generated at certs\key.pem
echo.
echo Note: This is a self-signed certificate for SCHOOL PROJECT/TESTING only.
echo Browsers will show a security warning - this is expected and normal.
echo In production, you would use a real certificate from Let's Encrypt or similar.
pause

