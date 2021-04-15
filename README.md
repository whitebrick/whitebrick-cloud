# whitebrick-cloud

## Setup

1. Create a new postgres DB
2. `psql DB_NAME < db/schema.sql`
3. `psql DB_NAME < db/seed.sql`
4. DB should now have data below:

```
dev=> select * from users;
 id | tenant_id |       email        | first_name | last_name |         created_at         |         updated_at         
----+-----------+--------------------+------------+-----------+----------------------------+----------------------------
  1 |         1 | user_a@example.com | Amy        | Addams    | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
  2 |         2 | user_b@example.com | Bill       | Bedford   | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
  3 |         3 | user_c@example.com | Chrissy    | Church    | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
  4 |         3 | user_d@example.com | Dan        | Dressler  | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
(4 rows)

dev=> select * from tenants;
 id |     name      |     label     |         created_at         |         updated_at         
----+---------------+---------------+----------------------------+----------------------------
  1 | test_tentant1 | Test Tenant 1 | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
  2 | test_tentant2 | Test Tenant 2 | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
  3 | test_tentant3 | Test Tenant 3 | 2021-04-15 23:01:06.771305 | 2021-04-15 23:01:06.771305
```

5. `cp src/dot_env_example.txt .env.development`
6. Update `.env.development` with DB credentials

7. Install serverless
8. `serverless offline start`
```
smba:whitebrick-cloud simon$ serverless offline start
Serverless: Running "serverless" installed locally (in service node_modules)
Serverless: DOTENV: Loading environment variables from .env.development:
Serverless: 	 - DB_NAME
Serverless: 	 - DB_HOST
Serverless: 	 - DB_PORT
Serverless: 	 - DB_USER
Serverless: 	 - DB_PASSWORD
Serverless: 	 - DB_POOL_MAX
Serverless: 	 - DB_POOL_IDLE_TIMEOUT_MILLIS
Serverless: 	 - DB_POOL_CONNECTION_TIMEOUT_MILLIS
Serverless: Bundling with Webpack...
asset src/apollo-server.js 5.87 KiB [emitted] (name: src/apollo-server)
./src/apollo-server.ts 449 bytes [built] [code generated]
external "apollo-server-lambda" 42 bytes [built] [code generated]
./src/resolvers.ts 192 bytes [built] [code generated]
./src/type-defs.ts 299 bytes [built] [code generated]
webpack compiled successfully in 3727 ms
Serverless: Watching for changes...
offline: Starting Offline: dev/us-east-1.
offline: Offline [http for lambda] listening on http://localhost:3002
offline: Function names exposed for local invocation by aws-sdk:
           * graphql: whitebrick-cloud-dev-graphql

   ┌───────────────────────────────────────────────────────────────────────────┐
   │                                                                           │
   │   POST | http://localhost:3000/dev/graphql                                │
   │   POST | http://localhost:3000/2015-03-31/functions/graphql/invocations   │
   │   GET  | http://localhost:3000/dev/graphql                                │
   │   POST | http://localhost:3000/2015-03-31/functions/graphql/invocations   │
   │                                                                           │
   └───────────────────────────────────────────────────────────────────────────┘
```
9. `POST { "query": "{ testMessage }" }` to `http://localhost:3000/dev/graphql` should return `"data": {"testMessage": "Hello world"}`

### TBD

- Fill out methods for tenant and user CRUD operations in `type-defs.ts` `resolvers.ts` and `dal.ts`
- Rename/restructure/reorganize for best practices
