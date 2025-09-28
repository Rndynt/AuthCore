#!/bin/bash

# Comprehensive Smoke Test Script for Auth Service
# This script tests the core authentication functionality

set -e

echo "🔐 Auth Service Smoke Tests"
echo "============================"

# Configuration
BASE_URL="http://localhost:4000"
EMAIL="demo@example.com"
PASSWORD="Passw0rd!"
COOKIE_JAR="cookies.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Test 1: Health check
echo ""
info "Testing service health..."
if curl -s -f "$BASE_URL/api/auth/session" > /dev/null; then
    success "Service is responding"
else
    error "Service is not responding at $BASE_URL"
    exit 1
fi

# Test 2: User sign-up
echo ""
info "Testing user sign-up..."
SIGNUP_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -w "HTTPSTATUS:%{http_code}" \
    -X POST "$BASE_URL/api/auth/sign-up/email" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

SIGNUP_HTTP_CODE=$(echo $SIGNUP_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
SIGNUP_BODY=$(echo $SIGNUP_RESPONSE | sed -E 's/HTTPSTATUS:[0-9]{3}$//')

if [ "$SIGNUP_HTTP_CODE" -eq 200 ] || [ "$SIGNUP_HTTP_CODE" -eq 201 ]; then
    success "User sign-up successful"
    echo "Response: $SIGNUP_BODY"
else
    info "Sign-up returned status $SIGNUP_HTTP_CODE (user may already exist)"
    echo "Response: $SIGNUP_BODY"
fi

# Test 3: User sign-in
echo ""
info "Testing user sign-in..."
SIGNIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -w "HTTPSTATUS:%{http_code}" \
    -X POST "$BASE_URL/api/auth/sign-in/email" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

SIGNIN_HTTP_CODE=$(echo $SIGNIN_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
SIGNIN_BODY=$(echo $SIGNIN_RESPONSE | sed -E 's/HTTPSTATUS:[0-9]{3}$//')

if [ "$SIGNIN_HTTP_CODE" -eq 200 ]; then
    success "User sign-in successful"
    echo "Response: $SIGNIN_BODY"
else
    error "User sign-in failed (HTTP $SIGNIN_HTTP_CODE)"
    echo "Response: $SIGNIN_BODY"
    exit 1
fi

# Test 4: Session verification
echo ""
info "Testing session verification..."
SESSION_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -w "HTTPSTATUS:%{http_code}" \
    "$BASE_URL/api/auth/session")

SESSION_HTTP_CODE=$(echo $SESSION_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
SESSION_BODY=$(echo $SESSION_RESPONSE | sed -E 's/HTTPSTATUS:[0-9]{3}$//')

if [ "$SESSION_HTTP_CODE" -eq 200 ]; then
    success "Session verification successful"
    echo "Response: $SESSION_BODY"
else
    error "Session verification failed (HTTP $SESSION_HTTP_CODE)"
    echo "Response: $SESSION_BODY"
    exit 1
fi

# Test 5: /me endpoint
echo ""
info "Testing /me endpoint..."
ME_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -w "HTTPSTATUS:%{http_code}" \
    "$BASE_URL/me")

ME_HTTP_CODE=$(echo $ME_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
ME_BODY=$(echo $ME_RESPONSE | sed -E 's/HTTPSTATUS:[0-9]{3}$//')

if [ "$ME_HTTP_CODE" -eq 200 ]; then
    success "/me endpoint working correctly"
    echo "Response: $ME_BODY"
else
    error "/me endpoint failed (HTTP $ME_HTTP_CODE)"
    echo "Response: $ME_BODY"
    exit 1
fi

# Test 6: API endpoints discovery
echo ""
info "Available authentication endpoints:"
echo "  POST $BASE_URL/api/auth/sign-up/email"
echo "  POST $BASE_URL/api/auth/sign-in/email"
echo "  GET  $BASE_URL/api/auth/session"
echo "  POST $BASE_URL/api/auth/sign-out"
echo "  GET  $BASE_URL/me"

# Cleanup
rm -f "$COOKIE_JAR"

echo ""
success "🎉 All smoke tests passed! Your auth service is working correctly."

echo ""
info "To start developing with this auth service:"
echo "1. Copy .env.example to .env and update the values"
echo "2. Start the service: npx tsx src/server.ts"
echo "3. Use the endpoints in your frontend application"
echo "4. For production, deploy using Netlify Functions"

echo ""
info "Available plugins and features:"
echo "- Email/Password authentication"
echo "- Admin plugin for user management"  
echo "- Organization plugin for RBAC"
echo "- API Key plugin for service-to-service auth"
echo "- JWT plugin for token-based auth"
echo "- Bearer plugin for Bearer token support"
echo "- Secure session cookies with CORS support"