# config/views.py

import socket
import time
import logging
from concurrent.futures import (
    ThreadPoolExecutor, as_completed, 
    TimeoutError as FutureTimeout, CancelledError
)

from django.http import HttpResponse, JsonResponse
from django.db import connections, OperationalError, InterfaceError
from django.core.cache import cache

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

import urllib.request
import ssl
import json
import os

logger = logging.getLogger(__name__)


# ── Existing views (untouched) ────────────────────────────────

def health_check(request):
    return HttpResponse("ok", status=200)


def root_debug(request):
    return JsonResponse(dict(request.GET))


# ── Service checks ───────────────────────────────────────────

def _check_postgres():
    try:
        conn = connections["default"]
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "healthy"}
    except (OperationalError, InterfaceError) as e:
        return {"status": "unhealthy", "error": str(e)}


def _check_redis():
    try:
        cache.set("_health_probe", "1", 10)
        val = cache.get("_health_probe")
        if val != "1":
            return {"status": "unhealthy", "error": "cache read mismatch"}
        return {"status": "healthy"}
    except (ConnectionError, TimeoutError, OSError) as e:
        return {"status": "unhealthy", "error": str(e)}


def _check_vault():
    try:
        vault_addr = os.environ.get("VAULT_URL", "https://trans_vault:8200")
        ca_cert = os.environ.get("VAULT_CACERT", "/vault/certs/ca-cert.pem")
        ctx = ssl.create_default_context(cafile=ca_cert)
        req = urllib.request.Request(f"{vault_addr}/v1/sys/health")
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            data = json.loads(resp.read())
            if data.get("sealed"):
                return {"status": "degraded", "error": "vault is sealed"}
            return {"status": "healthy"}
    except (urllib.error.URLError, OSError, json.JSONDecodeError, ValueError) as e:
        return {"status": "unhealthy", "error": str(e)}


def _check_tcp(host, port, timeout=3):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return {"status": "healthy"}
    except (ConnectionError, TimeoutError, OSError) as e:
        return {"status": "unhealthy", "error": str(e)}


# Registry: (name, kind, critical, check_fn)
_CHECKS = [
    ("PostgreSQL",    "database", True,  _check_postgres),
    ("Redis",         "cache",    True,  _check_redis),
    ("Vault",         "secrets",  True,  _check_vault),
    ("Nginx",         "proxy",    True,  lambda: _check_tcp("trans_frontend_nginx", 443)),
    ("Chess Engine",  "service",  False, lambda: _check_tcp("chess_engine", 4190)),
    ("Stockfish AI",  "service",  False, lambda: _check_tcp("stockfish_ai", 4191)),
    ("Mailpit SMTP",  "email",    False, lambda: _check_tcp("mailpit", 1025)),
]


def _run_all_checks():
    results = {}
    overall = "healthy"
    t_start = time.monotonic()

    with ThreadPoolExecutor(max_workers=len(_CHECKS)) as pool:
        futures = {}
        for name, kind, critical, fn in _CHECKS:
            futures[pool.submit(fn)] = (name, kind, critical)

        for future in as_completed(futures):
            name, kind, critical = futures[future]
            t0 = time.monotonic()
            try:
                check_result = future.result(timeout=10)
            except (FutureTimeout, CancelledError, OSError, ConnectionError) as e:
                check_result = {"status": "unhealthy", "error": str(e)}

            results[name] = {
                **check_result,
                "response_time_ms": round((time.monotonic() - t0) * 1000, 1),
                "kind": kind,
                "critical": critical,
            }

            if check_result["status"] == "unhealthy" and critical:
                overall = "unhealthy"
            elif check_result["status"] != "healthy" and overall == "healthy":
                overall = "degraded"

    return {
        "status": overall,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_time_ms": round((time.monotonic() - t_start) * 1000, 1),
        "services": results,
    }


# ── API endpoints ─────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def system_health(request):
    """Full health status of all services."""
    data = _run_all_checks()
    status_code = 200 if data["status"] == "healthy" else 503
    return JsonResponse(data, status=status_code)


@api_view(["GET"])
@permission_classes([AllowAny])
def system_health_ready(request):
    """Readiness probe — are critical dependencies up?"""
    data = _run_all_checks()
    critical_ok = all(
        v["status"] == "healthy"
        for v in data["services"].values()
        if v.get("critical")
    )
    return JsonResponse(
        {"status": "ready" if critical_ok else "not_ready"},
        status=200 if critical_ok else 503,
    )

