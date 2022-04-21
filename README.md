![whitebrick logo](https://hello.whitebrick.com/assets/whitebrick-logo-white-hz-sm.png)

# whitebrick-cloud No Code DB

(See [whitebrick-client](https://github.com/whitebrick/whitebrick-client) for front end)

<!-- START:HEADER ================================================== -->

##### No Code Database built on Hasura, GraphQL, Gatsby and Serverless

| ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-1.png) | ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-2.png) | ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-3.png) | ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-4.png) |
| :------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: |
|                               <sub>Adding a record</sub>                               |                              <sub>Creating a column</sub>                              |                                <sub>Creating a DB</sub>                                |                               <sub>Managing access</sub>                               |

Points of difference:
1. [Gatsby static Jamstack](https://www.gatsbyjs.com/) client allows for easy customization with [theme shadowing](https://www.gatsbyjs.com/docs/how-to/plugins-and-themes/shadowing/) and simple, zero downtime deployment to static web servers.
2. [Hasura](https://hasura.io/) is leveraged for battle-tested table tracking, query processing and authentication and RBAC.
3. The [Serverless framework](https://www.serverless.com/) with Apollo GraphQL allows for rapid development of light-weight Lambda support functions.

---

#### Roadmap:

- [x] DDL Table & Column CRUD
- [x] Live editing with subscription
- [x] Table-level RBAC
- [x] Joins
- [x] Background process queue
- [ ] Background process UI
- [ ] UI styling and themes
- [ ] psql reader/writer access
- [ ] Validations
- [ ] Bucket file download columns
- [ ] Column-level RBAC

<!-- END:HEADER ================================================== -->

---

#### Licensing

<!-- START:LICENSING ================================================== -->

Whitebrick is licensed under the MIT License however dependency licenses vary.

<!-- END:LICENSING ================================================== -->

---

#### Overview

- See [https://github.com/whitebrick/whitebrick-client](https://github.com/whitebrick/whitebrick-client) for front end
- [Documentation](https://hello.whitebrick.com/platform/documentation/)

![system diagram](https://hello.whitebrick.com/assets/whitebrick-no-code-db-diagram.png)

<!-- START:SUMMARY ================================================== -->

The Whitebrick No Code DB (Data Repository) comprises a front end Gatsby Jamstack client ([whitebrick-client](https://github.com/whitebrick/whitebrick-client)) and back end Serverless application ([whitebrick-cloud](https://github.com/whitebrick/whitebrick-cloud)) that adds multi-tenant DDL and access control functions to a Database via the [Hasura](https://github.com/hasura/graphql-engine) GraphQL Server. The Jamstack client uses [AG Grid](https://ag-grid.com/) as a spreadsheet-like UI that reads/writes table data directly from/to Hasura over GraphQL. Additional functions including DDL are provided by whitebrick-cloud Serverless functions that are exposed through the Hasura endpoint via schema stitching.

<!-- END:SUMMARY ================================================== -->

---

<!-- START:TECHNICAL_OVERVIEW ================================================== -->

### Hasura

Hasura is an Open Source server application that automatically wraps a GraphQL API around a standard relational database.

**Database Queries**

Whitebrick queries Hasura to display table data and to update table records. When table data is queried, paginated, sorted and updated (mutated) this is processed by Hasura over GraphQL.

**Schema Stitching & Remote Joins**

Hasura also supports stitching schemas and passing requests on to other external endpoints. When Whitebrick requests DDL functions such as adding a new table or column, Hasura passes this request on to the Whitebrick Cloud Serverless app and then returns the response through the same single GraphQL endpoint.

**Metadata API**

Hasura provides a separate HTTP API that allows database metadata to be programmatically updated and refreshed. For example, when Whitebrick Cloud executes DDL commands to add a column to a table, it then calls this Hasura API to update the metadata so the new column can be tracked and queried over GraphQL.

**Authentication & Authorization**

Because Hasura stitches together multiple APIs under the one unified endpoint it is well placed to manage authentication and authorization. Hasura checks for credentials in a JWT issued by a third-party authentication provider.

### Whitebrick Cloud

The Whitebrick Cloud back end is a set of functions written in Javascript using the Apollo GraohQL interface and executed on a Serverless provider. Whitebrick Cloud connects with a database to make DDL calls such as creating new tables and columns. After modifying the database Whitebrick Cloud then calls the Hasura Metadata API to _track_ the corresponding columns and tables. Whitebrick Cloud also manages additional metadata, background jobs, user permissions and settings, persisting them in a dedicated schema.

### Whitebrick Client

The Whitebrick front end is statically compiled Jamstack client written in Gatsby/React and uses AG Grid as the data grid GUI. Whitebrick sends GraphQL queries and mutations to the Hasura endpoint and displays the returned data. Because the client is statically compiled it can be easily customized by front end developers and deployed to any web site host.

<!-- END:TECHNICAL_OVERVIEW ================================================== -->

---

## Getting Started

<!-- START:BACKEND_SETUP ================================================== -->

### Deploying on a Cloud Service

-   Refer to Hasura and Serverless documentation

### Running Locally

1. **Configure Postgres**

    Create a new database in PostgreSQL and ensure `pgcrypto` is in the search path
    (see [Hasura requirements](https://hasura.io/docs/latest/graphql/core/deployment/postgres-requirements.html))

    ```
    CREATE EXTENSION pgcrypto;
    ```

    Make sure your database can be accessed from psql before proceeding (you may need to enable username/password authentication in pg_hba.conf)
    ie `$ psql -U <username> -h <host> -p <port> <db name>`

2. **Run Hasura**

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

3. **Install Hasura CLI**

    [Install](https://hasura.io/docs/latest/graphql/core/hasura-cli/install-hasura-cli.html#install-hasura-cli) the Hasura CLI but do not init new config

4. **Configure .env File**

    Copy `./.env.example` to `./.env.development` and complete with database connection parameters from (1) above.

5. **Create the wb Schema**

    Change to the `./hasura` directory, copy `config-example.yaml` to `config.yaml` and complete with `HASURA_GRAPHQL_ADMIN_SECRET` from (2) above.
    This config is used for the Hasura CLI.
    Now create the whitebrick-cloud schema "wb" by running `$ bash ./scripts/apply_latest_migration.bash`.
    After the migration is complete, change to the `./db` directory and run `$ bash ./scripts/seed.bash` to insert the initial data.

6. **Run Serverless Listener**

    Run `$ bash scripts/start_dev.bash` to start the serverless listener in local/offline mode. By default this listens to http://localhost:3000/graphql

7. **Track wb.table_permissions**

    From The Hasura console, use the top menu to navigate to the "Data" page, click to expand the default database on the left, then click the "wb" schema.
    Click the "Track" button next to the "table_permissions" table.

8. **Add Remote Schema**

    From The Hasura console, use the top menu to navigate to the "Remote Schemas" page, click add and enter the endpoint displayed from (6) above, check forward all headers and set and long time-out of 1200 seconds.
    **NB: If you are running Hasura in a local container you will need to use the corresponding URL** eg `http://host.docker.internal:3000/graphql`.
    If you now navigate to the "API" page from the top menu, In the query "Explorer" you should see queries beginning with `wb*`.

9. **Run Functional Tests**

    Download [Karate](https://github.com/intuit/karate#getting-started) (the [stand-alone executable](https://github.com/intuit/karate/wiki/ZIP-Release) is all that is needed).
    Update `./test/functional/karate-config.js` with your Hasura endpoint URL from (2) above and then with Hasura running, change to the `./test/functional` directory and run the command `$ bash run_tests.bash`

    This creates a few test users and a small test schema `test_the_daisy_blog`. Whitebrick is designed for incremental building-out of databases whereas this testing creates a database all at once so it can take time to run - up to 10 minutes in some cases. If karate lags make sure Hasura and/or it's container has plenty of RAM.

    To then add additional test data (northwind, chinook and DVD databases) as a second step run `$ bash run_tests.bash importDBs` - this can take a additional 15 minutes. Or run `$ bash run_tests.bash withImportDBs` to run both in one hit.

<!-- END:BACKEND_SETUP ================================================== -->

---

<!-- START:LINKS ================================================== -->

- [Documentation](https://hello.whitebrick.com/platform/documentation/)
- [Discord](https://discord.gg/FPvjPCYt)
- [Medium](https://towardsdatascience.com/towards-a-modern-lims-dynamic-tables-no-code-databases-and-serverless-validations-8dea03416105)

<!-- END:LINKS ================================================== -->
