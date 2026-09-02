#curl -X POST http://localhost:8000/api/login/ \
#  -H "Content-Type: application/json" \
#  -d '{"username": "zuk", "password": "letsgo"}'
#
#curl -H "Authorization: Bearer <paste_access_token_here>" http://localhost:8000/api/me/
#







#from django.test import TestCase
#
## Create your tests here.
#class AuthFlowTests(TestCase):
    

#from django.test import TestCase
#from django.contrib.auth import get_user_model
#from rest_framework.test import APIClient
#
#class AuthFlowTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
#        User = get_user_model()
#        self.user = User.objects.create_user(
#            username="testuser",
#            password="secret123"
#        )
#
#    def test_login_and_me_endpoint(self):
#        # 1. Login
#        response = self.client.post("/api/login/", {
#            "username": "testuser",
#            "password": "secret123"
#        }, format="json")
#
#        self.assertEqual(response.status_code, 200)
#        #print("LOGIN RESPONSE:", response.data)
#        token = response.data["access"]
#
#        # 2. /api/me/ without token → 401
#        response = self.client.get("/api/me/")
#        self.assertEqual(response.status_code, 401)
#
#        # 3. /api/me/ with token → 200
#        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
#        response = self.client.get("/api/me/")
#        print("ME RESPONSE:", response.data)
#        self.assertEqual(response.status_code, 200)
#
#        # 4. Assert correct user data
#        #print("LOGIN RESPONSE:", response.data)
#        self.assertEqual(response.data["username"], "testuser")

from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

class AuthFlowTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser",
            password="secret123"
        )

    def test_login_and_me_endpoint(self):
        # 1. Login
        response = self.client.post("/api/login/", {
            "username": "testuser",
            "password": "secret123"
        }, format="json")

        self.assertEqual(response.status_code, 200)
        token = response.data["access"]

        # 2. /api/me/ without token → 401
        response = self.client.get("/api/me/")
        self.assertEqual(response.status_code, 401)

        # 3. /api/me/ with token → 200
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get("/api/me/")
        self.assertEqual(response.status_code, 200)

        # 4. Assert correct user data
        self.assertEqual(response.data["username"], "testuser")


