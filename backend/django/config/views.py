
from django.http import HttpResponse

from django.http import JsonResponse

def health_check(request):
    return HttpResponse("ok", status=200)

def root_debug(request):
    return JsonResponse(dict(request.GET))

