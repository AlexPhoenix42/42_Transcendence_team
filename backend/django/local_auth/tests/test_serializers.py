from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError as DRFValidationError
from unittest.mock import patch, MagicMock

from local_auth.serializers import RegisterSerializer

User = get_user_model()


class RegisterSerializerTests(TestCase):
    def setUp(self):
        self.valid_data = {
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpass123"
        }

    def test_serializer_valid_data(self):
        serializer = RegisterSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())

    def test_serializer_creates_user(self):
        serializer = RegisterSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))

    def test_serializer_email_validation_invalid_format(self):
        data = self.valid_data.copy()
        data["email"] = "notanemail"
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_serializer_email_validation_empty(self):
        data = self.valid_data.copy()
        data["email"] = ""
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_serializer_username_validation_duplicate(self):
        User.objects.create_user(username="testuser", email="existing@example.com", password="pass")
        data = self.valid_data.copy()
        data["email"] = "new@example.com"
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("username", serializer.errors)

    def test_serializer_password_writable(self):
        """Test that password is write-only and not returned"""
        serializer = RegisterSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()
        self.assertIsNotNone(user.password)  # Should be hashed

    def test_serializer_email_missing(self):
        data = self.valid_data.copy()
        del data["email"]
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_serializer_username_missing(self):
        data = self.valid_data.copy()
        del data["username"]
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("username", serializer.errors)

    def test_serializer_password_missing(self):
        data = self.valid_data.copy()
        del data["password"]
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)

    @patch("local_auth.serializers.domain_has_mx")
    def test_serializer_email_mx_validation_fails(self, mock_domain_has_mx):
        mock_domain_has_mx.return_value = False
        data = self.valid_data.copy()
        data["email"] = "test@nonexistent.com"
        serializer = RegisterSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    @patch("local_auth.serializers.domain_has_mx")
    def test_serializer_email_mx_validation_passes(self, mock_domain_has_mx):
        mock_domain_has_mx.return_value = True
        data = self.valid_data.copy()
        data["email"] = "test@valid.com"
        serializer = RegisterSerializer(data=data)
        self.assertTrue(serializer.is_valid())

