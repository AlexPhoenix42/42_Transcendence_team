from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


class RegisterViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("register")
        self.valid_data = {
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpass123"
        }

    def test_register_success(self):
        response = self.client.post(self.url, self.valid_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "testuser")
        self.assertTrue("id" in response.data)

    def test_register_duplicate_username(self):
        User.objects.create_user(username="testuser", email="existing@example.com", password="pass")
        response = self.client.post(self.url, self.valid_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_register_duplicate_email(self):
        User.objects.create_user(username="existinguser", email="test@example.com", password="pass")
        response = self.client.post(self.url, self.valid_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_missing_username(self):
        data = self.valid_data.copy()
        del data["username"]
        response = self.client.post(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_register_missing_email(self):
        data = self.valid_data.copy()
        del data["email"]
        response = self.client.post(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_missing_password(self):
        data = self.valid_data.copy()
        del data["password"]
        response = self.client.post(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_register_invalid_email(self):
        data = self.valid_data.copy()
        data["email"] = "notanemail"
        response = self.client.post(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


class LoginViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("token_obtain_pair")
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )

    def test_login_success(self):
        response = self.client.post(self.url, {
            "username": "testuser",
            "password": "testpass123"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password(self):
        response = self.client.post(self.url, {
            "username": "testuser",
            "password": "wrongpass"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_nonexistent_user(self):
        response = self.client.post(self.url, {
            "username": "nonexistent",
            "password": "pass"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_username(self):
        response = self.client.post(self.url, {
            "password": "testpass123"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_missing_password(self):
        response = self.client.post(self.url, {
            "username": "testuser"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ProfileViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("profile_update")
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )

    def test_profile_get_unauthorized(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_get_authorized(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "testuser")

    def test_profile_update_unauthorized(self):
        response = self.client.patch(self.url, {"bio": "New bio"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_update_authorized(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.url, {"bio": "Updated bio"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, "Updated bio")

    def test_profile_update_username_blocked(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.url, {"username": "newusername"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "testuser")

    def test_profile_update_dispname(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.url, {"dispname": "Test Display"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.dispname, "Test Display")

    def test_profile_update_avatar(self):
        self.client.force_authenticate(user=self.user)
        # Simple test - just check that avatar field is accepted
        # Actual file upload testing is more complex and covered in model tests
        response = self.client.patch(self.url, {"avatar": None}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class RefreshTokenTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("token_refresh")
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )

    def test_refresh_token_success(self):
        login_response = self.client.post(reverse("token_obtain_pair"), {
            "username": "testuser",
            "password": "testpass123"
        }, format="json")
        refresh_token = login_response.data["refresh"]

        response = self.client.post(self.url, {"refresh": refresh_token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_refresh_token_invalid(self):
        response = self.client.post(self.url, {"refresh": "invalidtoken"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_missing(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

