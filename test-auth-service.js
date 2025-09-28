#!/usr/bin/env node

/**
 * Comprehensive Test Script for Auth Service
 * Tests all major authentication endpoints and functionality
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔐 Auth Service Test Suite');
console.log('=========================\n');

// Test configuration
const BASE_URL = 'http://localhost:4000';
const TEST_EMAIL = 'demo@example.com';
const TEST_PASSWORD = 'Passw0rd!';

/**
 * Utility function to make HTTP requests
 */
async function makeRequest(url, options = {}) {
  const { default: fetch } = await import('undici');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}

/**
 * Test 1: Verify service health
 */
async function testServiceHealth() {
  console.log('📊 Testing service health...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/auth/session`);
    
    if (response.status === 200) {
      console.log('✅ Service is running and responding');
      console.log(`   Status: ${response.status}`);
      return true;
    } else {
      console.log('❌ Service health check failed');
      console.log(`   Status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Service unreachable');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Test user sign-up
 */
async function testSignUp() {
  console.log('\n📝 Testing user sign-up...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ User sign-up successful');
      return true;
    } else {
      console.log('❌ User sign-up failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Sign-up request failed');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Test user sign-in
 */
async function testSignIn() {
  console.log('\n🔑 Testing user sign-in...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200) {
      console.log('✅ User sign-in successful');
      return response.headers['set-cookie'] || null;
    } else {
      console.log('❌ User sign-in failed');
      return null;
    }
  } catch (error) {
    console.log('❌ Sign-in request failed');
    console.log(`   Error: ${error.message}`);
    return null;
  }
}

/**
 * Test 4: Test authenticated session
 */
async function testSession(cookies = null) {
  console.log('\n🎫 Testing authenticated session...');
  
  try {
    const headers = {};
    if (cookies) {
      headers['Cookie'] = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    }
    
    const response = await makeRequest(`${BASE_URL}/api/auth/session`, {
      headers,
    });
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200) {
      console.log('✅ Session verification successful');
      return true;
    } else {
      console.log('❌ Session verification failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Session request failed');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Test /me endpoint
 */
async function testMeEndpoint(cookies = null) {
  console.log('\n👤 Testing /me endpoint...');
  
  try {
    const headers = {};
    if (cookies) {
      headers['Cookie'] = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    }
    
    const response = await makeRequest(`${BASE_URL}/me`, {
      headers,
    });
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200) {
      console.log('✅ /me endpoint working correctly');
      return true;
    } else {
      console.log('❌ /me endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ /me request failed');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('Starting comprehensive auth service tests...\n');
  
  const results = {
    health: false,
    signup: false,
    signin: false,
    session: false,
    me: false,
  };
  
  // Test 1: Health check
  results.health = await testServiceHealth();
  
  if (!results.health) {
    console.log('\n❌ Service is not running. Please start the auth service first:');
    console.log('   npx tsx src/server.ts');
    return;
  }
  
  // Test 2: Sign up
  results.signup = await testSignUp();
  
  // Test 3: Sign in
  const cookies = await testSignIn();
  results.signin = cookies !== null;
  
  // Test 4: Session verification
  results.session = await testSession(cookies);
  
  // Test 5: /me endpoint
  results.me = await testMeEndpoint(cookies);
  
  // Summary
  console.log('\n📋 Test Summary');
  console.log('===============');
  console.log(`Health Check: ${results.health ? '✅' : '❌'}`);
  console.log(`User Sign-up: ${results.signup ? '✅' : '❌'}`);
  console.log(`User Sign-in: ${results.signin ? '✅' : '❌'}`);
  console.log(`Session Test: ${results.session ? '✅' : '❌'}`);
  console.log(`/me Endpoint: ${results.me ? '✅' : '❌'}`);
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log(`\n${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Your auth service is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
}

// Run the tests if this script is executed directly
if (process.argv[1] === __filename) {
  runTests().catch(console.error);
}

export { runTests, testServiceHealth, testSignUp, testSignIn, testSession, testMeEndpoint };