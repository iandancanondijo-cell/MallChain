"""
Verify signup works by checking API response directly.
"""
import requests
import time

print("Testing signup API directly...")
test_email = f"test_{int(time.time())}@mallchain.com"
test_password = "TestPassword123!"

print(f"\nEmail: {test_email}")
print(f"Password: {test_password}")

# First, get CSRF token
session = requests.Session()
csrf_response = session.get('http://localhost:4000/api/csrf-token')
print(f"\nCSRF token response: {csrf_response.status_code}")
csrf_data = csrf_response.json()
csrf_token = csrf_data.get('csrfToken')
print(f"CSRF token: {csrf_token[:20]}...")

# Now register
register_response = session.post(
    'http://localhost:4000/api/auth/register',
    json={'email': test_email, 'password': test_password},
    headers={'X-CSRF-Token': csrf_token}
)

print(f"\nRegister response status: {register_response.status_code}")
register_data = register_response.json()

if register_response.status_code == 200:
    print("✓ Registration successful!")
    print(f"User ID: {register_data.get('user', {}).get('id')}")
    print(f"KYC Level: {register_data.get('user', {}).get('kycLevel')}")
    print(f"Expires At: {register_data.get('expiresAt')}")
    
    # Check if cookie was set
    cookies = session.cookies.get_dict()
    print(f"\nCookies set: {list(cookies.keys())}")
    if 'auth_token' in cookies:
        print("✓ auth_token cookie is set!")
        print(f"  Token length: {len(cookies['auth_token'])}")
    else:
        print("✗ auth_token cookie NOT set!")
    
    # Try accessing a protected endpoint
    print("\nTesting protected endpoint (/api/kyc/status)...")
    kyc_response = session.get('http://localhost:4000/api/kyc/status')
    print(f"KYC status response: {kyc_response.status_code}")
    if kyc_response.status_code == 200:
        print("✓ Can access protected endpoints!")
        kyc_data = kyc_response.json()
        print(f"KYC data: {kyc_data}")
    else:
        print(f"✗ Cannot access protected endpoints: {kyc_response.text}")
else:
    print(f"✗ Registration failed: {register_data}")
