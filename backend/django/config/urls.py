"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

# config/urls.py

from django.contrib             import admin
from django.urls                import path, include

from django.conf                import settings
from django.conf.urls.static    import static

from .views                     import (
    health_check, root_debug, system_health, system_health_ready,
)

urlpatterns = [
    path('',                    include('django_prometheus.urls')),
    path('healthz/',            health_check,        name='health_check'),
    path('api/health/',         system_health,       name='system_health'),
    path('api/health/ready',    system_health_ready, name='system_health_ready'),
    path('admin/',              admin.site.urls),
    path('api/',                include('local_auth.urls')),
    path('api/',                include('users.urls')),
    path('api/chess/',          include('chess_game.urls')),
    #path('api/pacman/',         include('pacman_game.urls')),
    path('api/friends/',        include('friends.urls')),
    path('api/chat/',           include("chat.urls")),
    path('api/auth/',           include('open_auth.urls')),
    path('api/auth/',           include('two_factor_auth.urls')),
    path('accounts/',           include('allauth.urls')),
    path('api/tournaments/',    include('tournament.urls')),
    path('api/goose/',          include('goose_game.urls')),
]

if  settings.DEBUG:
    urlpatterns += [
        path('', root_debug, name='root_debug')
    ]

if  settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

