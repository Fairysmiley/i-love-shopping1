from django.contrib.auth.base_user import BaseUserManager, AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin, AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import validate_email, RegexValidator
from django.db import models
from django.utils import timezone


class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, username, email, password, **extra_fields):
        if not username:
            raise ValueError('The given username must be set')
        if not email:
            raise ValueError('The given email must be set')
        email = self.normalize_email(email)
        try:
            validate_email(email)
        except ValidationError:
            raise ValueError('The given email is not valid')
        if len(username) > 320:
            raise ValueError('Username too long')
        extra_fields.setdefault('is_active', True)
        user = self.model(username=username, email=email, **extra_fields)
        if password:
            if len(password) < 6:
                raise ValueError('Password too short')
            elif len(password) > 128:
                raise ValueError('Password too long')
            user.set_password(password)
        else:
            raise ValueError('Password must be set')
        user.save(using=self._db)
        return user

    def create_user(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(username, email, password, **extra_fields)
    
    def create_oauth_user(self, username, email, oauth_id, **extra_fields):
        """Create user for OAuth authentication (no password required)"""
        if not username:
            raise ValueError('The given username must be set')
        if not email:
            raise ValueError('The given email must be set')
        if not oauth_id:
            raise ValueError('OAuth ID must be provided')
            
        email = self.normalize_email(email)
        try:
            validate_email(email)
        except ValidationError:
            raise ValueError('The given email is not valid')
            
        if len(username) > 320:
            raise ValueError('Username too long')
            
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        
        user = self.model(
            username=username, 
            email=email, 
            oauth_id=oauth_id,
            **extra_fields
        )
        # OAuth users don't have passwords - set unusable password
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True')
        return self._create_user(username, email, password, **extra_fields)


class CustomUser(AbstractUser):
    # Dont have the django default first_name and last_name
    first_name = None
    last_name = None

    username = models.CharField(
        max_length=320,
        unique=True,
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9_]+$',
                message='Username must contain only letters, numbers, and underscores',
            ),
        ]
    )
    email = models.EmailField(max_length=320, unique=True)

    oauth_id = models.CharField(max_length=255, blank=True, null=True)

    twofa_secret = models.CharField(max_length=32, blank=True, null=True)
    twofa_enabled = models.BooleanField(default=False)
    gdpr_consent = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Increment to invalidate all outstanding access tokens for this user
    token_version = models.IntegerField(default=0)

    objects = CustomUserManager()

    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = 'auth_user'

    def __str__(self):
        return self.username


# Token blacklist for JWT refresh token rotation
class TokenBlacklist(models.Model):
    user = models.ForeignKey('CustomUser', on_delete=models.CASCADE, related_name='blacklisted_tokens')
    token = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'token_blacklist'

    def __str__(self):
        return f"{self.user.username} - {self.token[:10]}..."


class PasswordResetToken(models.Model):
    user = models.ForeignKey('CustomUser', on_delete=models.CASCADE, related_name='password_reset_tokens')
    token = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    class Meta:
        db_table = 'password_reset_tokens'

    def __str__(self):
        return f"{self.user.username} - {self.token[:10]}..."


class UserProfile(models.Model):
    """User profile with shipping/billing address information"""
    user = models.OneToOneField(
        'CustomUser', 
        on_delete=models.CASCADE, 
        related_name='profile'
    )
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    country = models.CharField(max_length=2, blank=True, null=True, default='FI')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return f"{self.user.username}'s profile"
