![whitebrick logo](https://hello.whitebrick.com/assets/whitebrick-logo-white-hz-sm.png)

# whitebrick-cloud (back end) BETA

(See [whitebrick](https://github.com/whitebrick/whitebrick) for the front end repo)

<!-- START:HEADER ================================================== -->

### Instant front end for your existing Database
_or create new Databases with No Code_
| ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-1.png) | ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-2.png) | ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-3.png) | ![Screenshot](https://hello.whitebrick.com/assets/whitebrick-landing-screenshot-4.png) |
| :------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: |
|                               <sub>Adding a record</sub>                               |                              <sub>Creating a column</sub>                              |                                <sub>Creating a DB</sub>                                |                               <sub>Managing access</sub>                               |

### Read and write new records or add new columns and tables just like using a spreadsheet.
1. On-prem, Cloud, SaaS or Hybrid. Currently supports PostgreSQL and Citus (MySQL, MS SQL Server coming soon).
2. The front end is built on a [Gatsby static Jamstack](https://www.gatsbyjs.com/) for dead easy customization and deployment.
3. The back end is a set of [Serverless functions](https://www.serverless.com/) for making DDL calls to your Database and configuring [Hasura](https://hasura.io/) for instant GraphQL.

##### Whitebrick stitches together the best-in-breed open source apps:

[Hasura](https://hasura.io/) | [Gastsby](https://www.gatsbyjs.com/) | [AG Grid](https://ag-grid.com/) | [Apollo](https://www.apollographql.com/) | [Serverless](https://www.serverless.com/)

---

#### Current Project status as of February:

We're currently fixing bugs and trying to get the Beta release stable.

Please use GitHub [Issues](https://github.com/whitebrick/whitebrick/issues) to report bugs and [Discussions](https://github.com/whitebrick/whitebrick/discussions) for questions, features and suggestions.

:point_right: **Background Job UI** - when a new column or new table is added/updated Hasura needs to re-track the schema and because this can take some time it is processed in the background. We currently do not have any progress indicator and instead just a "Please try again in a minute" which we're working on.

**Roadmap:**

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

Whitebrick is [licensed](https://github.com/whitebrick/whitebrick-cloud/blob/main/LICENSE) under the MIT License however the dependencies use a variety of different licenses. We are working on a simple guide to outline the license information and options by use case - TBD.

<!-- END:LICENSING ================================================== -->

---

### You are currently viewing the back end repository (whitebrick-cloud)

- The front end repository can be found [here](https://github.com/whitebrick/whitebrick)
- Documentation can be found [here](https://hello.whitebrick.com/docs)

![whitebrick-cloud system diagram](https://hello.whitebrick.com/assets/whitebrick-diagram.png)

<!-- START:SUMMARY ================================================== -->

Whitebrick comprises a [front end Gatsby Jamstack](https://github.com/whitebrick/whitebrick) client and [back end Serverless](https://github.com/whitebrick/whitebrick-cloud) application (whitebrick-cloud) that adds multi-tenant DDL and access control functions to a Database via the [Hasura](https://github.com/hasura/graphql-engine) GraphQL Server. The Jamstack client uses [AG Grid](https://ag-grid.com/) as a spreadsheet-like UI that reads/writes table data directly from/to Hasura over GraphQL. Additional functions (eg DDL and access control) are provided by whitebrick-cloud and exposed through the same Hasura endpoint using [Schema stitching](https://hasura.io/docs/latest/graphql/core/remote-schemas/index.html).

<!-- END:SUMMARY ================================================== -->

<!-- START:TECHNICAL_OVERVIEW ================================================== -->

### Hasura

Hasura is a server application that automatically wraps a GraphQL API around a standard relational database.
Hasura is written in Haskell and can be easily deployed directly from a Docker image.
The server comes with a web GUI admin console that allows the underlying database to be browsed and _Tracked_ so that it can be accessed over GraphQL.
Hasura also provides a WebSocket endpoint for subscription queries.

**Database Queries**

Whitebrick queries Hasura to display table data and to update table records. When table data is queried, paginated, sorted and updated (mutated) this is all managed by Hasura over GraphQL.

**Schema Stitching**

Hasura can also _stitch_ schemas together and pass requests on to other external endpoints. When Whitebrick requests DDL functions such as adding a new table or column, Hasura passes this request on to the Whitebrick Cloud Serverless app and then returns the response through the same single GraphQL endpoint.

**Metadata API**

Hasura provides a separate HTTP API that allows database metadata to be programmatically updated and refreshed. For example, when Whitebrick Cloud executes DDL commands to add a column to a table, it then calls this Hasura API to update the metadata so the new column can be tracked and queried over GraphQL.

**Authentication & Authorization**

Because Hasura stitches together multiple APIs under the one unified endpoint it is well placed to manage authentication and authorization. Hasura integrates with authentication providers such as Auth0 by checking for role variables encoded in JWTs with each request. Hasura also provides functionality to set permissions at a column level so checks can be configured to look-up user records for authorization.

### Whitebrick Cloud (back end)

The Whitebrick Cloud back end is a set of functions written in Javascript using the Apollo GraohQL interface and executed on a Serverless provider. Whitebrick Cloud connects with a database to make DDL calls such as creating new tables and columns. After mofifying the database Whitebrick Cloud then calls the Hasura Metadata API to _track_ the corresponding columns and tables. Whitebrick Cloud also manages additional metadata, background jobs, user permissions and settings, persisting them in a dedicated schema.

### Whitebrick (front end)

The Whitebrick front end is statically compiled Jamstack client written in Gatsby/React/Javascipt and uses AG Grid as the data grid GUI. Whitebrick sends GraphQL queries and mutations to the Hasura endpoint and displays the returned data. Because the client is statically compiled it can be easily customized by front end developers and deployed to any web site host.

<!-- END:TECHNICAL_OVERVIEW ================================================== -->

---

## Getting Started

<!-- START:BACKEND_SETUP ================================================== -->

### Deploying on a Cloud Service

-   AWS CloudFormation Stack - in progress
-   Heroku, Azure, DigitalOcean - TBD

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

- [Web](https://whitebrick.com/)
- [Documentation](https://hello.whitebrick.com/docs)
- [Discord](https://discord.gg/FPvjPCYt)
- [Medium](https://towardsdatascience.com/towards-a-modern-lims-dynamic-tables-no-code-databases-and-serverless-validations-8dea03416105)

<!-- END:LINKS ================================================== -->
