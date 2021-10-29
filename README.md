![whitebrick logo](doc/whitebrick-logo-white-hz-sm.png)

# whitebrick-cloud (back end) BETA

[//]: # "START:COMMON_HEADER"

### Open Source Airtable Alternative (No Code DB)

#### Whitebrick is a lightweight No Code Database with three points of difference:

1. The front end uses a [Gatsby static Jamstack](https://www.gatsbyjs.com/) client for easy customization and hosting.
2. The back end is a set of [Serverless functions](https://www.serverless.com/) for making DDL calls to [PostgreSQL](https://www.postgresql.org/) and configuring [Hasura GraphQL server](https://hasura.io/).
3. The [PostgreSQL](https://www.postgresql.org/) database schemas can be accessed directly with **_psql_** for data import/export and integrations with other tools.

##### Rather than reinventing the wheel Whitebrick stitches together the best-in-breed open source apps:

[Hasura](https://hasura.io/) | [Gastsby](https://www.gatsbyjs.com/) | [PostgreSQL](https://www.postgresql.org/) | [AG Grid](https://ag-grid.com/) | [Apollo](https://www.apollographql.com/) | [Serverless](https://www.serverless.com/)

---

#### Current Project status as of August:

We're currently fixing bugs and trying to get the Beta release stable. Please note this is Beta software so **use at your own risk**.

Please use GitHub [Isues](https://github.com/whitebrick/whitebrick-cloud/issues) to report bugs and [Discussions](https://github.com/whitebrick/whitebrick-cloud/discussions) for questions and suggestions.

- [x] DDL Table & Column CRUD
- [x] Live editing with subscription
- [x] Table-level RBAC
- [x] Joins
- [x] Background process queue 
- [ ] Documentation
- [ ] UI styling and themes
- [ ] Direct pg reader/writer access
- [ ] Validations
- [ ] Cloud file (bucket) download columns
- [ ] Column-level RBAC

Hosted demo at [whitebrick.com](https://whitebrick.com)

---

#### License

Whitebrick is [licensed](LICENSE) under the Apache License v2.0 however the dependencies use a variety of different licenses. We are working on a simple guide to outline the license information and options by use case - TBA.

---

[//]: # "END:COMMON_HEADER"

### You are currently viewing the back end repository (whitebrick-cloud)

- The front end repository can be found [here](https://github.com/whitebrick/whitebrick)

[//]: # "START:COMMON_DESCRIPTION"

![whitebrick-cloud system diagram](doc/whitebrick-diagram.png)

Whitebrick comprises a front end [Gatsby](https://www.gatsbyjs.com/) Jamstack client and back end [Serverless](https://www.serverless.com/) application (whitebrick-cloud) that adds multi-tenant DDL and access control functions to a [PostgreSQL](https://www.postgresql.org/) Database via the [Hasura](https://github.com/hasura/graphql-engine) GraphQL Server. The Jamstack client uses [AG Grid](https://ag-grid.com/) as a spreadsheet-like UI that reads/writes table data directly from/to Hasura over GraphQL. Additional functions (eg DDL and access control) are provided by whitebrick-cloud and exposed through the same Hasura endpoint using [Schema stitching](https://hasura.io/docs/latest/graphql/core/remote-schemas/index.html).

---

[//]: # "END:COMMON_DESCRIPTION"

## Getting Started

### Deploying on a Cloud Service

- AWS CloudFormation Stack - we're currently tidying this up for release, email us for early copy
- Heroku, Azure, DigitalOcean - all TBD but get in touch

### Running Locally

1.  #### Configure Postgres

    Create a new database in PostgreSQL and ensure `pgcrypto` is in the search path
    (see [Hasura requirements](https://hasura.io/docs/latest/graphql/core/deployment/postgres-requirements.html))

    ```
    CREATE EXTENSION pgcrypto;
    ```
    
    Make sure your database can be accessed from psql before proceeding (you may need to enable username/password authentication in pg_hba.conf)
    ie `$ psql -U <username> -h <host> -p <port> <db name>`

2.  #### Run Hasura

    Add the database credentials and run Hasura from [Docker](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/docker.html#deployment-docker)
    or [Kubernetes](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/kubernetes.html#deploy-kubernetes) and be sure to set a `HASURA_GRAPHQL_ADMIN_SECRET`.
    Launching Hasura will create data definitions and values in the `hdb_catalog` schema of the database.
    If Hasura does not launch check and debug your DB connection/permissions with psql.
    
    Our Docker file looks something like this:
    ```
    docker run -d -p 8080:8080 \
       -e HASURA_GRAPHQL_DATABASE_URL=postgres://db_usr:db_pass@host.docker.internal:5432/hasura_db \
       -e HASURA_GRAPHQL_ENABLE_CONSOLE=true \
       -e HASURA_GRAPHQL_DEV_MODE=true \
       -e HASURA_GRAPHQL_ADMIN_SECRET=secret \
       -e HASURA_GRAPHQL_UNAUTHORIZED_ROLE=wbpublic \
       hasura/graphql-engine:latest
    ```
    
    Navigate to http://localhost:8080 and check the admin console is running (password is `HASURA_GRAPHQL_ADMIN_SECRET` from above)

3.  #### Install Hasura CLI

    [Install](https://hasura.io/docs/latest/graphql/core/hasura-cli/install-hasura-cli.html#install-hasura-cli) the Hasura CLI but do not init new config

4.  #### Configure .env File

    Copy `./.env.example` to `./.env.development` and complete with database connection parameters from (1) above.

5.  #### Create the wb Schema

    Change to the `./hasura` directory, copy `config-example.yaml` to `config.yaml` and complete with `HASURA_GRAPHQL_ADMIN_SECRET` from (2) above.
    This config is used for the Hasura CLI.
    Now create the whitebrick-cloud schema "wb" by running `$ bash ./scripts/apply_latest_migration.bash`.
    After the migration is complete, change to the `./db` directory and run `$ bash ./scripts/seed.bash` to insert the initial data.

6.  #### Run Serverless Listener

    Run `$ bash scripts/start_dev.bash` to start the serverless listener in local/offline mode. By default this listens to http://localhost:3000/graphql

7.  #### Track wb.table_permissions

    From The Hasura console, use the top menu to navigate to the "Data" page, click to expand the default database on the left, then click the "wb" schema.
    Click the "Track" button next to the "table_permissions" table.

8.  #### Add Remote Schema

    From The Hasura console, use the top menu to navigate to the "Remote Schemas" page, click add and enter the endpoint displayed from (6) above, check forward all headers and     set and long time-out of 1200 seconds.
    **NB: If you are running Hasura in a local container you will need to use the corresponding URL** eg `http://host.docker.internal:3000/graphql`.
    If you now navigate to the "API" page from the top menu, In the query "Explorer" you should see queries beginning with `wb*`.

9.  #### Run Functional Tests
    Download [Karate](https://github.com/intuit/karate#getting-started) (the [stand-alone executable](https://github.com/intuit/karate/wiki/ZIP-Release) is all that is needed).
    Update `./test/functional/karate-config.js` with your Hasura endpoint URL from (2) above and then with Hasura running, change to the `./test/functional` directory and run       the command `$ bash run_tests.bash`
    
    This creates a few test users and a small test schema `test_the_daisy_blog`. Whitebrick is designed for incremental building-out of databases whereas this testing creates a           database all at once so it can take time to run - up to 10 minutes in some cases. If karate lags make sure Hasura and/or it's container has plenty of RAM.
    
    To then add additional test data (northwind, chinook and DVD databases) as a second step run `$ bash run_tests.bash importDBs` - this can take a additional 15 minutes. Or run `$ bash run_tests.bash withImportDBs` to run both in one hit.

## Architecture

- ### DAL

  With the bulk of persistence performed through Hasura, the DAL class is used for supplemental system-wide data persistence (tenants, users, roles, etc) and DDL (creating and altering schemas, tables, columns etc). This implementation has been purposely chosen as a lightweight alternative to ORM.

- ### HasuraApi

  Hasura needs to know about any DDL changes to update the GraphQL schema - for example, when a new table is added it must be _tracked_. This class is used to call the [Hasura Metadat API](https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/index.html) over HTTP.

- ### BgQueue

  API Gateway has a 30 second timeout so longer processes need to be executed in the background using the lambda invoke `event` type.

- ### WhitebrickCloud
  This is the top-level API that makes calls to the DAL and HasuraAPI and is called by the GraphQL resolvers.

## DB Schema

![whitebrick-cloud DB ERD](doc/whitebrick-db-erd.png)
