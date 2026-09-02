from django.test import TestCase
from django.urls import reverse


class HealthCheckTests(TestCase):
    def test_health_check_returns_200(self):
        response = self.client.get(reverse("health_check"))
        self.assertEqual(response.status_code, 200)

    def test_health_check_returns_ok(self):
        response = self.client.get(reverse("health_check"))
        self.assertEqual(response.content.decode(), "ok")

    def test_health_check_uses_correct_url(self):
        response = self.client.get("/healthz/")
        self.assertEqual(response.status_code, 200)

