DO $$ 
DECLARE
    user_id_to_delete INTEGER;
BEGIN
    SELECT id INTO user_id_to_delete FROM users WHERE intra_id IS NOT NULL LIMIT 1;

    IF user_id_to_delete IS NOT NULL THEN
        DELETE FROM token_blacklist_blacklistedtoken 
        WHERE token_id IN (SELECT id FROM token_blacklist_outstandingtoken WHERE user_id = user_id_to_delete);

        DELETE FROM token_blacklist_outstandingtoken WHERE user_id = user_id_to_delete;

        DELETE FROM users WHERE id = user_id_to_delete;
    END IF;
END $$;

/*
How to use:
docker compose exec -T postgres psql -U alephoen -d trans_server_db < delete_oauth_user.sql

or:
docker compose exec postgres psql -U alephoen -d trans_server_db
\i delete_oauth_user.sql
*/

