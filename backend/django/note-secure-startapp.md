VAULT_TOKEN=$(docker exec trans_vault cat /path/to/token) VAULT_ADDR=http://localhost:8200 python manage.py startapp chess_coach
