#!/usr/bin/env python3
"""
Manual BYOK testing script using BYOKClient abstraction.
Tests the actual BYOK implementation instead of raw OpenAI client.
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from proof_agent.byok import BYOKClient

def test_byok_manual():
    """Manual test using BYOKClient - no external dependencies needed"""
    
    # Check environment
    required_vars = [
        'PROOF_AGENT_PROVIDER_BASE_URL',
        'PROOF_AGENT_MODEL'
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        print(f"Missing environment variables: {missing}")
        print("\nSet these variables:")
        print("export PROOF_AGENT_PROVIDER_BASE_URL=http://localhost:11434/v1")
        print("export PROOF_AGENT_MODEL=qwen2.5:0.5b")
        return False
    
    try:
        # Use actual BYOKClient
        client = BYOKClient()
        print(f"✅ BYOK client initialized")
        print(f"Provider: {client.provider_type}")
        print(f"Base URL: {client.base_url}")
        print(f"Model: {client.model}")
        
        # Test verification
        test_prompt = """You are a security auditor. Find ALL vulnerabilities in this code:

```python
def login(username, password):
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
    return execute_query(query)
```

Respond with ### PASS, ### FAIL, or ### PARTIAL"""
        
        print("\n🔍 Testing verification...")
        result = client.verify(test_prompt)
        print(f"✅ Verification completed")
        print(f"Result: {result}")
        
        # Check for SQL injection detection
        if "sql" in result.lower() or "injection" in result.lower():
            print("✅ Model correctly identified SQL injection")
        else:
            print("❌ Model may have missed SQL injection vulnerability")
            
        return True
        
    except Exception as e:
        print(f"❌ BYOK test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_byok_manual()
    sys.exit(0 if success else 1)
