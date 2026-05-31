from django.test import TestCase
from django.contrib.auth import get_user_model
from .factories import UserFactory, PasswordResetTokenFactory

User = get_user_model()


class UserModelTest(TestCase):
    
    def test_user_creation(self):
        user = UserFactory()
        self.assertIsNotNone(user.id)
        self.assertTrue(user.is_active)

    def test_user_string_representation(self):
        user = UserFactory(username='testuser')
        self.assertEqual(str(user), 'testuser')

    def test_password_hashing(self):
        user = UserFactory()
        self.assertTrue(user.check_password('testpass123'))


class PasswordResetTest(TestCase):
    
    def test_password_reset_token_creation(self):
        token = PasswordResetTokenFactory()
        self.assertIsNotNone(token.id)
        self.assertFalse(token.used)
        self.assertIsNotNone(token.expires_at)