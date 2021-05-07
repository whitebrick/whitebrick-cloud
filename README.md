# whitebrick-cloud (backend)
### Open source Airtable alternative (No Code DB)
- _whitebrick_ jamstack client on [GitHub](https://github.com/whitebrick/whitebrick)
- Hosted service at [whitebrick.com](https://whitebrick.com)

![whitebrick-cloud system diagram](doc/whitebrick-diagram.png)

_whitebrick-cloud_ is a serverless application that adds multi-tenant DDL and access control features to [Hasura](https://github.com/hasura/graphql-engine).
Jamstack clients interface with _whitebrick-cloud_ through a remote schema stitched to the Hasura GraphQL API.

_whitebrick-cloud_ uses the following technologies
- [TypeScipt](https://github.com/microsoft/TypeScript) for typed JavaScript
- [Apollo Server](https://github.com/apollographql/apollo-server) for GraphQL
- [Axios](https://github.com/axios/axios) for HTTP
- [node-postgres](https://node-postgres.com/) for DAL
- [Serverless](https://github.com/serverless/serverless) for dev and deployment
- [webpack](https://github.com/webpack/webpack) for bundling
- [Karate](https://github.com/intuit/karate) for functional testing

---

## Getting Started

1. #### Configure Postgres
    Create a new database in PostgreSQL and ensure `pgcrypto` is in the search path (see [Hasura requirements](https://hasura.io/docs/latest/graphql/core/deployment/postgres-requirements.html))

2. #### Run Hasura
    Add the database credentials and run Hasura from [Docker](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/docker.html#deployment-docker)
or [Kubernetes](https://hasura.io/docs/latest/graphql/core/deployment/deployment-guides/kubernetes.html#deploy-kubernetes) and be sure to set a `HASURA_GRAPHQL_ADMIN_SECRET`.
Launching Hasura will create data definitions and values in the `hdb_catalog` schema of the database. 

3. #### Hasura CLI
    [Install](https://hasura.io/docs/latest/graphql/core/hasura-cli/install-hasura-cli.html#install-hasura-cli) the Hasura CLI but do not init new config

4. #### .env file
    Copy `./dot_env_example.txt` to `./.env.development` and complete with database connection parameters from (1)

5. #### wb schema
    Change to the `./hasura` directory, copy `config-example.yaml` to `config.yaml` and complete with `admin_secret` from (2).
    This config is used for the Hasura CLI.
    Now create the whitebrick-cloud schema "`wb`" by running `bash ./_apply_latest_migration.bash`.
    After the migration is complete, change to the `./db` directory and run `bash ./_seed.bash` to insert the initial data.

6. #### Serverless listner
    Run `bash ./_offline_start.bash` to start the serverless listener in local/offline mode

7. #### Functional Test
    Download [Karate](https://github.com/intuit/karate#getting-started) (the [stand-alone executable](https://github.com/intuit/karate/wiki/ZIP-Release) is all that is needed).
    Update `./test/functional/karate-config.js` with your Hasura endpoint URL from (2) and then with Hasura running, change to the `./test` directory and run the command `karate functional/run.feature`