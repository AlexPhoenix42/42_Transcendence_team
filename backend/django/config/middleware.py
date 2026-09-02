# config/middleware.py

from django.conf    import settings

import logging
logger = logging.getLogger(__name__)

class LogOAuthDataMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only log in dev to avoid leaking OAuth coes in dep
        if  settings.DEBUG and '/accounts/google/login/callback/' in request.path:
            print(f"=== OAuth CALLBACK DATA ===\nGET params: {request.GET}\n")
        return self.get_response(request)

