"""
BYOK (Bring Your Own Key) client for Proof Agent
Supports multiple model providers: OpenAI, Anthropic, Azure
"""

import os
import sys
import json
import requests
from typing import Dict, Any


class BYOKClient:
    """Client for custom model providers"""
    
    def __init__(self):
        self.base_url = os.getenv('PROOF_AGENT_PROVIDER_BASE_URL')
        self.provider_type = os.getenv('PROOF_AGENT_PROVIDER_TYPE', 'openai').lower()
        self.api_key = os.getenv('PROOF_AGENT_PROVIDER_API_KEY')
        self.bearer_token = os.getenv('PROOF_AGENT_PROVIDER_BEARER_TOKEN')
        self.model = os.getenv('PROOF_AGENT_MODEL')
        self.verifier_model = os.getenv('PROOF_AGENT_VERIFIER_MODEL') or self.model
        self.azure_api_version = os.getenv('PROOF_AGENT_PROVIDER_AZURE_API_VERSION', '2024-02-15-preview')
        
        if not self.base_url:
            raise ValueError("PROOF_AGENT_PROVIDER_BASE_URL is required for BYOK mode")
        
        if not self.model:
            raise ValueError("PROOF_AGENT_MODEL is required for BYOK mode")
        
        # Prepare headers
        self.headers = {'Content-Type': 'application/json'}
        
        if self.bearer_token:
            self.headers['Authorization'] = f'Bearer {self.bearer_token}'
        elif self.api_key:
            if self.provider_type == 'anthropic':
                self.headers['x-api-key'] = self.api_key
                self.headers['anthropic-version'] = '2023-06-01'
            elif self.provider_type == 'azure':
                self.headers['api-key'] = self.api_key
            else:  # openai-compatible
                self.headers['Authorization'] = f'Bearer {self.api_key}'
    
    def _build_endpoint(self) -> str:
        """Build the appropriate endpoint URL based on provider type"""
        base = self.base_url.rstrip('/')
        
        if self.provider_type == 'azure':
            # Azure OpenAI format: https://resource.openai.azure.com/openai/deployments/{model}/chat/completions?api-version=...
            return f"{base}/openai/deployments/{self.verifier_model}/chat/completions?api-version={self.azure_api_version}"
        elif self.provider_type == 'anthropic':
            return f"{base}/v1/messages"
        else:  # openai-compatible (default)
            return f"{base}/chat/completions" if base.endswith('/v1') else f"{base}/v1/chat/completions"
    
    def _build_payload(self, prompt: str) -> Dict[str, Any]:
        """Build request payload based on provider type"""
        
        if self.provider_type == 'anthropic':
            return {
                "model": self.verifier_model,
                "max_tokens": 4000,
                "system": "You are an independent code verifier. Analyze the provided code changes and give a detailed security and correctness assessment.",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            }
        else:  # openai-compatible (default, includes Azure)
            return {
                "model": self.verifier_model,
                "messages": [
                    {
                        "role": "system", 
                        "content": "You are an independent code verifier. Analyze the provided code changes and give a detailed security and correctness assessment."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": 4000,
                "temperature": 0.1
            }
    
    def _extract_response(self, response_data: Dict[str, Any]) -> str:
        """Extract response text based on provider type"""
        
        if self.provider_type == 'anthropic':
            if 'content' in response_data and len(response_data['content']) > 0:
                return response_data['content'][0]['text']
        else:  # openai-compatible (default, includes Azure)
            if 'choices' in response_data and len(response_data['choices']) > 0:
                return response_data['choices'][0]['message']['content']
        
        # Fallback - return raw response as string
        return json.dumps(response_data, indent=2)
    
    def verify(self, prompt: str) -> str:
        """Send verification prompt to custom provider"""
        
        endpoint = self._build_endpoint()
        payload = self._build_payload(prompt)
        
        try:
            response = requests.post(
                endpoint,
                headers=self.headers,
                json=payload,
                timeout=120  # 2 minute timeout
            )
            
            response.raise_for_status()
            response_data = response.json()
            
            return self._extract_response(response_data)
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Request failed: {str(e)}"
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_details = e.response.json()
                    error_msg += f"\nResponse: {json.dumps(error_details, indent=2)}"
                except (ValueError, json.JSONDecodeError):
                    error_msg += f"\nResponse text: {e.response.text}"
            
            raise Exception(error_msg)
        except (ValueError, json.JSONDecodeError) as e:
            raise Exception(f"JSON parsing failed: {str(e)}")
        except Exception as e:
            raise Exception(f"Verification failed: {str(e)}")


def main():
    """CLI entry point for BYOK verification"""
    
    try:
        # Read prompt from stdin
        prompt = sys.stdin.read().strip()
        
        if not prompt:
            print("### PARTIAL\nNo verification prompt provided", file=sys.stderr)
            sys.exit(1)
        
        # Initialize BYOK client
        client = BYOKClient()
        
        # Run verification
        result = client.verify(prompt)
        
        # Output result
        print(result)
        
    except Exception as e:
        error_msg = f"### PARTIAL\nBYOK verification error: {str(e)}"
        print(error_msg, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
