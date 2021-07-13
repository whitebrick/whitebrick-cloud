#!/usr/bin/env bash
export $(cat ../../.env.development | sed 's/#.*//g' | xargs)
echo "*** functional/test/load_test_schemas.bash: Loading test schemas..."
PGPASSWORD=$DB_PASSWORD pg_restore -c --no-owner -n test_chinook -Fc -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME ../db/test_chinook.pg
PGPASSWORD=$DB_PASSWORD pg_restore -c --no-owner -n test_donnasdvd -Fc -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME ../db/test_donnasdvd.pg
PGPASSWORD=$DB_PASSWORD pg_restore -c --no-owner -n test_northwind -Fc -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME ../db/test_northwind.pg
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < ../db/test_the_daisy_blog.sql
