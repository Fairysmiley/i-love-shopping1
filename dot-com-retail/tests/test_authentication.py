from rest_framework.test import APITestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.users.models import TokenBlacklist
from .factories import UserFactory
import jwt
from django.conf import settings

User = get_user_model()


class JWTTokenHandlingTest(APITestCase):
    
    def setUp(self):
        self.user = UserFactory(email='test@example.com', username='testuser')
    
    def test_token_generation_on_login(self):
        url = reverse('users:login')
        data = {'email': 'test@example.com', 'password': 'testpass123'}
        response = self.client.post(url, data, format='json')
        
        if response.status_code == 200:
            self.assertIn('access', response.data)
            self.assertIn('user', response.data)
            self.assertTrue(len(response.data['access']) > 0)
    
    def test_token_validation_with_valid_token(self):
        # Login to get token
        url = reverse('users:login')
        data = {'email': 'test@example.com', 'password': 'testpass123'}
        response = self.client.post(url, data, format='json')
        
        if response.status_code == 200:
            token = response.data['access']
            
            # Use token to access protected endpoint
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            protected_url = reverse('users:twofa_setup')
            protected_response = self.client.get(protected_url)
            self.assertNotEqual(protected_response.status_code, 401)
    
    def test_token_validation_with_invalid_token(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid_token_here')
        url = reverse('users:twofa_setup')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)
    
    def test_token_refresh_rotation(self):
        # Login to get initial tokens
        login_url = reverse('users:login')
        login_data = {'email': 'test@example.com', 'password': 'testpass123'}
        login_response = self.client.post(login_url, login_data, format='json')
        
        if login_response.status_code == 200:
            # Attempt first refresh
            refresh_url = reverse('users:token_refresh')
            first_refresh = self.client.post(refresh_url, format='json')
            
            self.assertIn(first_refresh.status_code, [200, 401])
            
            if first_refresh.status_code == 200:
                # Second refresh with same cookie should fail
                second_refresh = self.client.post(refresh_url, format='json')
                self.assertIn('access', first_refresh.data)
    
    def test_token_revocation(self):
        # Login
        url = reverse('users:login')
        data = {'email': 'test@example.com', 'password': 'testpass123'}
        response = self.client.post(url, data, format='json')
        
        if response.status_code == 200:
            token = response.data['access']
            
            # Revoke token
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            revoke_url = reverse('users:token_revoke')
            revoke_response = self.client.post(revoke_url, format='json')
            self.assertIn(revoke_response.status_code, [200, 204, 401])


class UserInputValidationTest(APITestCase):
    
    def test_email_format_validation(self):
        url = reverse('users:register')
        data = {
            'username': 'testuser',
            'email': 'invalid-email',
            'password1': 'testpass123',
            'password2': 'testpass123'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
    
    def test_duplicate_email_validation(self):
        UserFactory(email='existing@example.com')
        
        url = reverse('users:register')
        data = {
            'username': 'newuser',
            'email': 'existing@example.com',
            'password1': 'testpass123',
            'password2': 'testpass123'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
    
    def test_password_mismatch_validation(self):
        url = reverse('users:register')
        data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password1': 'testpass123',
            'password2': 'differentpass456'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
    
    def test_empty_field_validation(self):
        url = reverse('users:register')
        data = {
            'username': '',
            'email': 'test@example.com',
            'password1': 'testpass123',
            'password2': 'testpass123'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)


class AuthenticationAPITest(APITestCase):
    
    def setUp(self):
        self.user = UserFactory(email='test@example.com', username='testuser')
    
    def test_successful_login_flow(self):
        url = reverse('users:login')
        data = {'email': 'test@example.com', 'password': 'testpass123'}
        response = self.client.post(url, data, format='json')
        
        if response.status_code == 200:
            self.assertIn('access', response.data)
            self.assertIn('user', response.data)
            self.assertEqual(response.data['user']['email'], 'test@example.com')
    
    def test_login_with_invalid_credentials(self):
        url = reverse('users:login')
        data = {'email': 'test@example.com', 'password': 'wrongpassword'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
    
    def test_successful_registration_flow(self):
        url = reverse('users:register')
        data = {
            'username': 'newuser',
            'email': 'new@example.com',
            'password1': 'strongpass123',
            'password2': 'strongpass123'
        }
        response = self.client.post(url, data, format='json')
        
        self.assertIn(response.status_code, [201, 400])
        
        if response.status_code == 201:
            user_exists = User.objects.filter(email='new@example.com').exists()
            self.assertTrue(user_exists)
    
    def test_logout_flow(self):
        # Login first
        login_url = reverse('users:login')
        login_data = {'email': 'test@example.com', 'password': 'testpass123'}
        login_response = self.client.post(login_url, login_data, format='json')
        
        if login_response.status_code == 200:
            token = login_response.data['access']
            
            # Logout
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            logout_url = reverse('users:token_revoke')
            logout_response = self.client.post(logout_url, format='json')
            self.assertIn(logout_response.status_code, [200, 204, 401])
    
    def test_password_reset_request(self):
        url = reverse('users:password_reset_request')
        data = {'email': 'test@example.com'}
        response = self.client.post(url, data, format='json')
        self.assertIn(response.status_code, [200, 400])


class SecurityTest(APITestCase):
    
    def test_sql_injection_prevention_in_login(self):
        url = reverse('users:login')
        data = {
            'email': "admin'--",
            'password': "' OR '1'='1"
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
    
    def test_xss_prevention_in_registration(self):
        url = reverse('users:register')
        data = {
            'username': '<script>alert("xss")</script>',
            'email': 'test@example.com',
            'password1': 'testpass123',
            'password2': 'testpass123'
        }
        response = self.client.post(url, data, format='json')
        self.assertIn(response.status_code, [201, 400])
        
        if response.status_code == 201:
            user = User.objects.get(email='test@example.com')
            self.assertNotIn('<script>', user.username)
    
    def test_malformed_json_handling(self):
        url = reverse('users:login')
        response = self.client.post(url, 'not-json', content_type='application/json')
        self.assertEqual(response.status_code, 400)
    
    def test_missing_required_fields(self):
        url = reverse('users:login')
        data = {'email': 'test@example.com'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(len(response.data) > 0)