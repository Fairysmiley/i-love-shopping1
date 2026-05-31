#!/bin/bash
# Generate self-signed TLS certificate for development/testing

echo "Generating self-signed TLS certificate..."

# Create certs directory
mkdir -p certs

# Generate private key and certificate
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -subj "/C=FI/ST=Finland/L=Local/O=E-Commerce-School-Project/CN=localhost"

echo "✓ Certificate generated at certs/cert.pem"
echo "✓ Private key generated at certs/key.pem"
echo ""
echo "Note: This is a self-signed certificate for SCHOOL PROJECT/TESTING only."
echo "Browsers will show a security warning - this is expected and normal."
echo "In production, you would use a real certificate from Let's Encrypt or similar."
