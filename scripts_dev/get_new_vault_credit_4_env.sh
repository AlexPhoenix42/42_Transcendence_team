# Get role_id (static)
docker compose -f ../docker-compose.yml exec vault vault read -field=role_id auth/approle/role/trans-role/role-id

# Generate new secret_id (dynamic)
docker compose -f ../docker-compose.yml exec vault vault write -f -field=secret_id auth/approle/role/trans-role/secret-id
