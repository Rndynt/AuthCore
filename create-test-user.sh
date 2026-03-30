#!/bin/bash

# Script untuk membuat test user di tenant database
# User ini akan muncul di halaman Users dashboard

echo "Creating test user via API..."

curl -X POST http://localhost:5000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234!",
    "name": "Test User"
  }'

echo ""
echo "User created! Now you can see it in the Users page."
echo ""
echo "Login credentials:"
echo "  Email: test@example.com"
echo "  Password: Test1234!"
