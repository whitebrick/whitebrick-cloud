[//]: # "START:COMMON_HEADER"

![whitebrick logo](doc/whitebrick-logo-horizontal-white-sm.png)

# whitebrick-cloud (back end) BETA

### Open Source Airtable Alternative (No Code DB)

#### Whitebrick is a lightweight No Code Database with three points of difference:

1. The front end uses a [Gatsby static Jamstack](https://www.gatsbyjs.com/) client for easy customization and hosting.
2. The back end is a set of **Serverless functions** for making DDL calls to PostgreSQL and configuring [Hasura GraphQL server](https://hasura.io/).
3. The PostgreSQL database schemas can be accessed directly with psql for data import/export and integration with other tools.

##### Rather than reinventing the wheel Whitebrick stitches together the best-in-breed open source apps:
[Hasura](https://hasura.io/) | [Gastsby](https://www.gatsbyjs.com/) | [AG Grid](https://ag-grid.com/) | [Apollo](https://www.apollographql.com/) | [Serverless](https://www.serverless.com/)

---

#### Current Project status as of August:

_!!! This is BETA software - use at your own risk !!!_

- [x] DDL Table & Column CRUD
- [x] Live editing with subscription
- [x] Table-level RBAC
- [ ] Joins
- [ ] Column-level RBAC
- [ ] Documentation

Hosted demo and SaaS at [whitebrick.com](https://whitebrick.com)

---

#### License

Whitebrick is [licensed](LICENSE) under the Apache License v2.0 however the component apps use a variety of different licenses. We are working on a simple guide to outline the license information and options depending on your use case - TBA.

---

[//]: # "END:COMMON_HEADER"

### You are currently viewing the back end repository

- The frontend repository can be found [here](https://github.com/whitebrick/whitebrick)

[//]: # "START:COMMON_DESCRIPTION"

![whitebrick-cloud system diagram](doc/whitebrick-diagram.png)

Whitebrick comprises a front end Gatsby Jamstack client and back end Serverless application (whitebrick-cloud) that adds multi-tenant DDL and access control functions to a [PostgreSQL Database](https://www.postgresql.org/) via the [Hasura GraphQL Server](https://github.com/hasura/graphql-engine). The Jamstack client uses [AG Grid](https://ag-grid.com/) as a spreadsheet-like UI that reads/writes table data directly from/to Hasura over GraphQL. Additional functions (eg DDL and access control) are provided by whitebrick-cloud and exposed through the Hasura endpoint using [Schema stitching](https://hasura.io/docs/latest/graphql/core/remote-schemas/index.html).

---

[//]: # "END:COMMON_DESCRIPTION"

## Getting Started

1.  #### Configure Postgres

    Create a new database in PostgreSQL and ensure `pgcrypto` is in the search path
    (see [Hasura requirements](https://hasura.io/docs/latest/graphql/core/deployment/postgres-requirements.html))

    ```
    CREATE EXTENSION pgcrypto;
    ```

2.  #### Run Hasura

    Add the database credentials and run Hasura from [Docker](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/docker.html#deployment-docker)
    or [Kubernetes](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/kubernetes.html#deploy-kubernetes) and be sure to set a `HASURA_GRAPHQL_ADMIN_SECRET`.
    Launching Hasura will create data definitions and values in the `hdb_catalog` schema of the database.
    If Hasura does not launch check and debug your DB connection/permissions with psql.

3.  #### Install Hasura CLI

    [Install](https://hasura.io/docs/latest/graphql/core/hasura-cli/install-hasura-cli.html#install-hasura-cli) the Hasura CLI but do not init new config

4.  #### Configure .env File

    Copy `./dot_env_example.txt` to `./.env.development` and complete with database connection parameters from (1) above.

5.  #### Create wb Schema

    Change to the `./hasura` directory, copy `config-example.yaml` to `config.yaml` and complete with `admin_secret` from (2) above.
    This config is used for the Hasura CLI.
    Now create the whitebrick-cloud schema "wb" by running `bash ./scripts/apply_latest_migration.bash`.
    After the migration is complete, change to the `./db` directory and run `bash ./scripts/seed.bash` to insert the initial data.

6.  #### Run Serverless Listener

    Run `serverless offline start` to start the serverless listener in local/offline mode

7.  #### Track wb.table_permissions

    From The Hasura console, use the top menu to navigate to the "Data" page, click to expand the default database on the left, then click the "wb" schema.
    Click the "Track" button next to the "table_permissions" table.

8.  #### Add Remote Schema

    From The Hasura console, use the top menu to navigate to the "Remote Schemas" page, click add and enter the endpoint displayed from (6) above.
    **NB: If you are running Hasura in a local container you will need to use the corresponding URL** eg `http://host.docker.internal:3000/graphql`.
    If you now navigate to the "API" page from the top menu, In the query "Explorer" you should now see queries beginning with `wb*`.

9.  #### Run Functional Tests
    Download [Karate](https://github.com/intuit/karate#getting-started) (the [stand-alone executable](https://github.com/intuit/karate/wiki/ZIP-Release) is all that is needed).
    Update `./test/functional/karate-config.js` with your Hasura endpoint URL from (2) above and then with Hasura running, change to the `./test/functional` directory and run the command `bash run_tests.bash`

## Architecture

- ### DAL

  With the bulk of persistence performed through Hasura, the DAL class is used for supplemental system-wide data persistence (tenants, users, roles, etc) and DDL (creating and altering schemas, tables, columns etc). This implementation has been purposely chosen as a lightweight alternative to ORM.

- ### HasuraApi

  Hasura needs to know about any DDL changes to update the GraphQL schema - for example, when a new table is added it must be _tracked_. This class is used to call the [Hasura Metadat API](https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/index.html) over HTTP.

- ### WhitebrickCloud
  This is the top-level API that makes calls to the DAL and HasuraAPI and is called by the GraphQL resolvers.

## DB Schema

![whitebrick-cloud DB ERD](doc/whitebrick-db-erd.png)
