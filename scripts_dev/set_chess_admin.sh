#!/usr/bin/env bash

docker exec trans_backend_django python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(username='zuk')
u.role = 'admin'
u.save(update_fields=['role'])
print(f'{u.username} is now {u.role}')
" 2>&1 | grep "is now"

