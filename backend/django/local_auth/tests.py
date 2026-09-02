from django.test import TestCase

from rest_framework.test import APITestCase
from django.urls import reverse
from django.contrib.auth import get_user_model

# The test must be run with:
# python manage.py test local_auth.tests -v 2

class RegisterTests(APITestCase):
    def test_register_user(self):
        url = reverse("register")  # requires name="register" in urls.py

        payload = {
            "username": "newuser",
            "password": "abc123"
        }

        response = self.client.post(url, payload, format="json")

        # Should succeed
        self.assertEqual(response.status_code, 200)

        # Response must contain id + username
        self.assertIn("id", response.data)
        self.assertEqual(response.data["username"], "newuser")

        # User must exist in DB
        User = get_user_model()
        self.assertTrue(User.objects.filter(username="newuser").exists())

