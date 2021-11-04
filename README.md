![whitebrick logo](doc/whitebrick-logo-white-hz-sm.png)

# whitebrick-cloud (back end) BETA

<!-- START:HEADER ================================================== -->

### Open Source Airtable Alternative (No Code DB)

#### Whitebrick is a lightweight No Code Database with three points of difference:

1. The front end uses a [Gatsby static Jamstack](https://www.gatsbyjs.com/) client for dead easy customization and deployment.
2. The back end is a set of [Serverless functions](https://www.serverless.com/) for making DDL calls to [PostgreSQL](https://www.postgresql.org/) and configuring [Hasura GraphQL server](https://hasura.io/).
3. The [PostgreSQL](https://www.postgresql.org/) database schemas can be accessed directly with **_psql_** for data import/export and integrations with other tools.

##### Rather than reinventing the wheel Whitebrick stitches together the best-in-breed open source apps:

[Hasura](https://hasura.io/) | [Gastsby](https://www.gatsbyjs.com/) | [PostgreSQL](https://www.postgresql.org/) | [AG Grid](https://ag-grid.com/) | [Apollo](https://www.apollographql.com/) | [Serverless](https://www.serverless.com/)

---

#### Current Project status as of November:

We're currently fixing bugs and trying to get the Beta release stable.

Please use GitHub [Issues](https://github.com/whitebrick/whitebrick-cloud/issues) to report bugs and [Discussions](https://github.com/whitebrick/whitebrick-cloud/discussions) for questions, features and suggestions.

- [x] DDL Table & Column CRUD
- [x] Live editing with subscription
- [x] Table-level RBAC
- [x] Joins
- [x] Background process queue
- [ ] Background process UI
- [ ] UI styling and themes
- [ ] Psql reader/writer access
- [ ] Validations
- [ ] Bucket file download columns
- [ ] Column-level RBAC

Hosted demo at [whitebrick.com](https://whitebrick.com)

<!-- END:HEADER ================================================== -->

---

#### Licensing

<!-- START:LICENSING ================================================== -->

Whitebrick is [licensed](https://github.com/whitebrick/whitebrick-cloud/blob/main/LICENSE) under the Apache License v2.0 however the dependencies use a variety of different licenses. We are working on a simple guide to outline the license information and options by use case - TBA.

<!-- END:LICENSING ================================================== -->

---

### You are currently viewing the back end repository (whitebrick-cloud)

- The front end repository can be found [here](https://github.com/whitebrick/whitebrick)
- Documentation can be found [here](https://hello.whitebrick.com/docs)

![whitebrick-cloud system diagram](doc/whitebrick-diagram.png)

<!-- START:SUMMARY ================================================== -->

Whitebrick comprises a [front end Gatsby Jamstack](https://github.com/whitebrick/whitebrick) client and [back end Serverless](https://github.com/whitebrick/whitebrick-cloud) application (whitebrick-cloud) that adds multi-tenant DDL and access control functions to a [PostgreSQL](https://www.postgresql.org/) Database via the [Hasura](https://github.com/hasura/graphql-engine) GraphQL Server. The Jamstack client uses [AG Grid](https://ag-grid.com/) as a spreadsheet-like UI that reads/writes table data directly from/to Hasura over GraphQL. Additional functions (eg DDL and access control) are provided by whitebrick-cloud and exposed through the same Hasura endpoint using [Schema stitching](https://hasura.io/docs/latest/graphql/core/remote-schemas/index.html).

<!-- END:SUMMARY ================================================== -->

---

## Getting Started

<!-- START:BACKEND_SETUP ================================================== -->

### Deploying on a Cloud Service

- AWS CloudFormation Stack - in progress
- Heroku, Azure, DigitalOcean - TBD

### Running Locally

1. #### Configure Postgres

Create a new database in PostgreSQL and ensure `pgcrypto` is in the search path
(see [Hasura requirements](https://hasura.io/docs/latest/graphql/core/deployment/postgres-requirements.html))

```
CREATE EXTENSION pgcrypto;
```

Make sure your database can be accessed from psql before proceeding (you may need to enable username/password authentication in pg_hba.conf)
ie `$ psql -U <username> -h <host> -p <port> <db name>`

2. #### Run Hasura

Add the database credentials and run Hasura from [Docker](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/docker.html#deployment-docker)
or [Kubernetes](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/kubernetes.html#deploy-kubernetes) and be sure to set a `HASURA_GRAPHQL_ADMIN_SECRET`.
Launching Hasura will create data definitions and values in the `hdb_catalog` schema of the database.
If Hasura does not launch check and debug your DB connection/permissions with psql.

Our Docker file looks something like this:

```
docker run -d -p 8080:8080
-e HASURA_GRAPHQL_DATABASE_URL=postgres://db_usr:db_pass@host.docker.internal:5432/hasura_db
-e HASURA_GRAPHQL_ENABLE_CONSOLE=true
-e HASURA_GRAPHQL_DEV_MODE=true
-e HASURA_GRAPHQL_ADMIN_SECRET=secret
-e HASURA_GRAPHQL_UNAUTHORIZED_ROLE=wbpublic
hasura/graphql-engine:latest
```

Navigate to http://localhost:8080 and check the admin console is running (password is `HASURA_GRAPHQL_ADMIN_SECRET` from above)

3. #### Install Hasura CLI

[Install](https://hasura.io/docs/latest/graphql/core/hasura-cli/install-hasura-cli.html#install-hasura-cli) the Hasura CLI but do not init new config

4. #### Configure .env File

Copy `./.env.example` to `./.env.development` and complete with database connection parameters from (1) above.

5. #### Create the wb Schema

Change to the `./hasura` directory, copy `config-example.yaml` to `config.yaml` and complete with `HASURA_GRAPHQL_ADMIN_SECRET` from (2) above.
This config is used for the Hasura CLI.
Now create the whitebrick-cloud schema "wb" by running `$ bash ./scripts/apply_latest_migration.bash`.
After the migration is complete, change to the `./db` directory and run `$ bash ./scripts/seed.bash` to insert the initial data.

6. #### Run Serverless Listener

Run `$ bash scripts/start_dev.bash` to start the serverless listener in local/offline mode. By default this listens to http://localhost:3000/graphql

7. #### Track wb.table_permissions

From The Hasura console, use the top menu to navigate to the "Data" page, click to expand the default database on the left, then click the "wb" schema.
Click the "Track" button next to the "table_permissions" table.

8. #### Add Remote Schema

From The Hasura console, use the top menu to navigate to the "Remote Schemas" page, click add and enter the endpoint displayed from (6) above, check forward all headers and set and long time-out of 1200 seconds.
**NB: If you are running Hasura in a local container you will need to use the corresponding URL** eg `http://host.docker.internal:3000/graphql`.
If you now navigate to the "API" page from the top menu, In the query "Explorer" you should see queries beginning with `wb*`.

9. #### Run Functional Tests

Download [Karate](https://github.com/intuit/karate#getting-started) (the [stand-alone executable](https://github.com/intuit/karate/wiki/ZIP-Release) is all that is needed).
Update `./test/functional/karate-config.js` with your Hasura endpoint URL from (2) above and then with Hasura running, change to the `./test/functional` directory and run the command `$ bash run_tests.bash`

This creates a few test users and a small test schema `test_the_daisy_blog`. Whitebrick is designed for incremental building-out of databases whereas this testing creates a database all at once so it can take time to run - up to 10 minutes in some cases. If karate lags make sure Hasura and/or it's container has plenty of RAM.

To then add additional test data (northwind, chinook and DVD databases) as a second step run `$ bash run_tests.bash importDBs` - this can take a additional 15 minutes. Or run `$ bash run_tests.bash withImportDBs` to run both in one hit.

<!-- END:BACKEND_SETUP ================================================== -->

---

<!-- START:LINKS ================================================== -->

- [Web](https://whitebrick.com/)
- [Documentation](https://hello.whitebrick.com/docs)
- [Discord](https://discord.gg/FPvjPCYt)
- [Medium](https://towardsdatascience.com/towards-a-modern-lims-dynamic-tables-no-code-databases-and-serverless-validations-8dea03416105)

<!-- END:LINKS ================================================== -->
