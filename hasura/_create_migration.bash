#!/usr/bin/env bash

if [ $# -eq 0 ]; then
    echo "Pass a name for the migration"
    exit 1
fi


hasura migrate create "$1" --database-name default
