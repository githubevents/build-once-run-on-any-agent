"""
Tests for BYOK functionality
"""
import pytest
import os
from unittest.mock import patch, MagicMock
from proof_agent.byok import BYOKClient


def test_byok_client_requires_base_url():
    """BYOK client should require base URL"""
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="PROOF_AGENT_PROVIDER_BASE_URL is required for BYOK mode"):
            BYOKClient()


def test_byok_client_requires_model():
    """BYOK client should require model"""
    with patch.dict(os.environ, {'PROOF_AGENT_PROVIDER_BASE_URL': 'http://test.com'}, clear=True):
        with pytest.raises(ValueError, match="PROOF_AGENT_MODEL is required for BYOK mode"):
            BYOKClient()


def test_byok_client_openai_endpoint():
    """Test OpenAI endpoint building"""
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.openai.com/v1',
        'PROOF_AGENT_MODEL': 'gpt-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        endpoint = client._build_endpoint()
        assert endpoint == 'https://api.openai.com/v1/chat/completions'


def test_byok_client_anthropic_endpoint():
    """Test Anthropic endpoint building"""
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.anthropic.com',
        'PROOF_AGENT_PROVIDER_TYPE': 'anthropic',
        'PROOF_AGENT_MODEL': 'claude-sonnet-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        endpoint = client._build_endpoint()
        assert endpoint == 'https://api.anthropic.com/v1/messages'


def test_byok_client_azure_endpoint():
    """Test Azure OpenAI endpoint building"""
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://mycompany.openai.azure.com',
        'PROOF_AGENT_PROVIDER_TYPE': 'azure',
        'PROOF_AGENT_MODEL': 'gpt-4-deployment'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        endpoint = client._build_endpoint()
        expected = 'https://mycompany.openai.azure.com/openai/deployments/gpt-4-deployment/chat/completions?api-version=2024-02-15-preview'
        assert endpoint == expected


def test_byok_client_openai_payload():
    """Test OpenAI payload building"""
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.openai.com/v1',
        'PROOF_AGENT_MODEL': 'gpt-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        payload = client._build_payload("test prompt")
        
        assert payload['model'] == 'gpt-4'
        assert len(payload['messages']) == 2
        assert payload['messages'][0]['role'] == 'system'
        assert payload['messages'][1]['role'] == 'user'
        assert payload['messages'][1]['content'] == 'test prompt'


def test_byok_client_anthropic_payload():
    """Test Anthropic payload building"""
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.anthropic.com',
        'PROOF_AGENT_PROVIDER_TYPE': 'anthropic',
        'PROOF_AGENT_MODEL': 'claude-sonnet-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        payload = client._build_payload("test prompt")
        
        assert payload['model'] == 'claude-sonnet-4'
        assert 'system' in payload
        assert len(payload['messages']) == 1
        assert payload['messages'][0]['role'] == 'user'
        assert payload['messages'][0]['content'] == 'test prompt'


def test_byok_client_authentication_headers():
    """Test authentication header setup"""
    # Test OpenAI API key
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.openai.com/v1',
        'PROOF_AGENT_PROVIDER_API_KEY': 'sk-test-key',
        'PROOF_AGENT_MODEL': 'gpt-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        assert client.headers['Authorization'] == 'Bearer sk-test-key'
    
    # Test Anthropic API key
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.anthropic.com',
        'PROOF_AGENT_PROVIDER_TYPE': 'anthropic',
        'PROOF_AGENT_PROVIDER_API_KEY': 'sk-ant-test',
        'PROOF_AGENT_MODEL': 'claude-sonnet-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        assert client.headers['x-api-key'] == 'sk-ant-test'
        assert client.headers['anthropic-version'] == '2023-06-01'
    
    # Test Azure API key
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://mycompany.openai.azure.com',
        'PROOF_AGENT_PROVIDER_TYPE': 'azure',
        'PROOF_AGENT_PROVIDER_API_KEY': 'azure-key-123',
        'PROOF_AGENT_MODEL': 'gpt-4-deployment'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        assert client.headers['api-key'] == 'azure-key-123'


@patch('proof_agent.byok.requests.post')
def test_byok_client_verify_success(mock_post):
    """Test successful verification"""
    # Mock response
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        'choices': [{
            'message': {'content': '### PASS\nAll checks passed.'}
        }]
    }
    mock_post.return_value = mock_response
    
    env_vars = {
        'PROOF_AGENT_PROVIDER_BASE_URL': 'https://api.openai.com/v1',
        'PROOF_AGENT_MODEL': 'gpt-4'
    }
    
    with patch.dict(os.environ, env_vars, clear=True):
        client = BYOKClient()
        result = client.verify("test prompt")
        
        assert result == '### PASS\nAll checks passed.'
        mock_post.assert_called_once()
