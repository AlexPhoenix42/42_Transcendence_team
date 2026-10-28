#!/usr/bin/env bash

docker exec trans_backend_django python manage.py shell -c "
from users.models import User
u = User.objects.get(username='$1')
u.role = 'admin'
u.is_staff = True
u.is_superuser = True
u.save()
print('done')"

