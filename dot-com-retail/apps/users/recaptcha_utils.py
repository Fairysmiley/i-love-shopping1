from django.conf import settings
import requests
import logging

logger = logging.getLogger(__name__)


def verify_recaptcha(captcha_token):
    """
    Verify reCAPTCHA token with Google
    Returns True if valid, False otherwise
    """
    if not captcha_token:
        return False

    if not settings.RECAPTCHA_PRIVATE_KEY:
        logger.warning("reCAPTCHA private key not configured")
        return True  # Allow in development if not configured

    try:
        response = requests.post(
            'https://www.google.com/recaptcha/api/siteverify',
            data={
                'secret': settings.RECAPTCHA_PRIVATE_KEY,
                'response': captcha_token,
            },
            timeout=10
        )

        result = response.json()
        return result.get('success', False)

    except Exception as e:
        logger.error(f"reCAPTCHA verification failed: {e}")
        return False
