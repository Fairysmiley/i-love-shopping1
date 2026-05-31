from cryptography.fernet import Fernet
from django.conf import settings
import json
import base64
import hashlib

"""
Encryption utilities for sensitive data like addresses
"""


def get_cipher():
    """Get Fernet cipher instance using encryption key derived from SECRET_KEY"""
    # Derive a valid Fernet key from Django's SECRET_KEY
    # Use SHA256 to create a 32-byte key, then base64 encode it
    secret = settings.SECRET_KEY.encode()
    key_bytes = hashlib.sha256(secret).digest()
    key = base64.urlsafe_b64encode(key_bytes)
    
    return Fernet(key)


def encrypt_data(data):
    """
    Encrypt data (string or dict) to encrypted string
    
    Args:
        data (str or dict): Data to encrypt
        
    Returns:
        str: Encrypted string
    """
    if not data:
        return None
    
    cipher = get_cipher()
    
    # Handle both strings and dicts
    if isinstance(data, dict):
        data_str = json.dumps(data)
    else:
        data_str = str(data)
    
    encrypted_bytes = cipher.encrypt(data_str.encode())
    return encrypted_bytes.decode()


def decrypt_data(encrypted_str):
    """
    Decrypt encrypted string back to original format (string or dict)
    
    Args:
        encrypted_str (str): Encrypted string
        
    Returns:
        str or dict: Decrypted data
    """
    if not encrypted_str:
        return None
    
    cipher = get_cipher()
    encrypted_bytes = encrypted_str.encode()
    decrypted_bytes = cipher.decrypt(encrypted_bytes)
    decrypted_str = decrypted_bytes.decode()
    
    # Try to parse as JSON (for dicts), otherwise return as string
    try:
        return json.loads(decrypted_str)
    except json.JSONDecodeError:
        return decrypted_str


def generate_encryption_key():
    """
    Generate a new Fernet encryption key
    
    Returns:
        str: Base64 encoded encryption key
    """
    return Fernet.generate_key().decode()
