#!/usr/bin/env bash
export $(cat ../.env.development | sed 's/#.*//g' | xargs)
echo "*** test/load_test_data.bash: Loading test data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < ./db/test_the_daisy_blog.sql
