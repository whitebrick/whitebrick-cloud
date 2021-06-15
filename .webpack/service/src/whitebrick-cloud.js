/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/dal.ts":
/*!********************!*\
  !*** ./src/dal.ts ***!
  \********************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DAL = void 0;
const environment_1 = __webpack_require__(/*! ./environment */ "./src/environment.ts");
const whitebrick_cloud_1 = __webpack_require__(/*! ./whitebrick-cloud */ "./src/whitebrick-cloud.ts");
const pg_1 = __webpack_require__(/*! pg */ "pg");
const entity_1 = __webpack_require__(/*! ./entity */ "./src/entity/index.ts");
class DAL {
    constructor() {
        this.pool = new pg_1.Pool({
            database: environment_1.environment.dbName,
            host: environment_1.environment.dbHost,
            port: environment_1.environment.dbPort,
            user: environment_1.environment.dbUser,
            password: environment_1.environment.dbPassword,
            max: environment_1.environment.dbPoolMax,
            idleTimeoutMillis: environment_1.environment.dbPoolConnectionTimeoutMillis,
            connectionTimeoutMillis: environment_1.environment.dbPoolConnectionTimeoutMillis,
        });
    }
    static sanitize(str) {
        return str.replace(/[^\w%]+/g, "");
    }
    executeQuery(queryParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([queryParams]);
            return results[0];
        });
    }
    executeQueries(queriesAndParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.pool.connect();
            const results = [];
            try {
                yield client.query("BEGIN");
                for (const queryParams of queriesAndParams) {
                    whitebrick_cloud_1.log.debug(`dal.executeQuery QueryParams: ${queryParams.query}`, queryParams.params);
                    const response = yield client.query(queryParams.query, queryParams.params);
                    results.push({
                        success: true,
                        payload: response,
                    });
                }
                yield client.query("COMMIT");
            }
            catch (error) {
                yield client.query("ROLLBACK");
                whitebrick_cloud_1.log.error(JSON.stringify(error));
                results.push({
                    success: false,
                    message: error.message,
                    code: "PG_" + error.code,
                });
            }
            finally {
                client.release();
            }
            return results;
        });
    }
    organizations(userId, userEmail, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let query = `
      SELECT wb.organizations.*
      FROM wb.organizations
      WHERE true
    `;
            if (userId || userEmail) {
                query = `
        SELECT wb.organizations.*, wb.roles.name as user_role
        FROM wb.organizations
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
      `;
                if (userId) {
                    query += `
          WHERE wb.organization_users.user_id=$1
        `;
                    params.push(userId);
                }
                else if (userEmail) {
                    query += `
          JOIN wb.users ON wb.organization_users.user_id=wb.users.id
          WHERE users.email=$1
        `;
                    params.push(userEmail);
                }
            }
            if (organizationId) {
                query += `
        AND wb.organizations.id=$${params.length + 1}
      `;
                params.push(organizationId);
            }
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            if (result.success) {
                result.payload = entity_1.Organization.parseResult(result.payload);
            }
            return result;
        });
    }
    organizationsByIdsOrNames(ids, names) {
        return __awaiter(this, void 0, void 0, function* () {
            let column = "id";
            let params = [ids];
            if (names) {
                column = "name";
                params = [names];
            }
            const result = yield this.executeQuery({
                query: `
        SELECT wb.organizations.*
        FROM wb.organizations
        WHERE ${column}=ANY($1)
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload);
            return result;
        });
    }
    organizationUsers(name, roles) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      SELECT wb.users.*, wb.roles.name as role
      FROM wb.users
      JOIN wb.organization_users ON wb.users.id=wb.organization_users.user_id
      JOIN wb.organizations ON wb.organizations.id=wb.organization_users.organization_id
      JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
      WHERE wb.organizations.name=$1
    `;
            if (roles)
                query += `AND wb.roles.name IN ('${roles.join("','")}')`;
            const result = yield this.executeQuery({
                query: query,
                params: [name],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload);
            return result;
        });
    }
    createOrganization(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.organizations(
          name, label
        ) VALUES($1, $2)
        RETURNING *
      `,
                params: [name, label],
            });
            if (result.success)
                result.payload = entity_1.Organization.parseResult(result.payload)[0];
            return result;
        });
    }
    updateOrganization(name, newName, newLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [new Date()];
            let query = "UPDATE wb.organizations SET updated_at=$1";
            if (newName) {
                params.push(newName);
                query += `, name=$${params.length}`;
            }
            if (newLabel) {
                params.push(newLabel);
                query += `, label=$${params.length}`;
            }
            params.push(name);
            query += ` WHERE id=$${params.length} RETURNING *`;
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Organization.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteOrganization(name) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.deleteOrganizations(name.replace("%", ""));
        });
    }
    deleteTestOrganizations() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.deleteOrganizations("test_%");
        });
    }
    deleteOrganizations(namePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: `
          DELETE FROM wb.organization_users
          WHERE organization_id IN (
            SELECT id FROM wb.organizations WHERE name like $1
          )
        `,
                    params: [namePattern],
                },
                {
                    query: `
          DELETE FROM wb.organizations WHERE name like $1
        `,
                    params: [namePattern],
                },
            ]);
            return results[results.length - 1];
        });
    }
    setOrganizationUsersRole(organizationId, users, roleId) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.warn(`++++++++++++++++++++++${organizationId} ${users} ${roleId}`);
            const queryParams = [];
            for (const user of users) {
                queryParams.push({
                    query: `
        INSERT INTO wb.organization_users(
          organization_id, user_id, role_id, updated_at
        ) VALUES($1, $2, $3, $4)
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
      `,
                    params: [organizationId, user.id, roleId, new Date()],
                });
            }
            const results = yield this.executeQueries(queryParams);
            return results[results.length - 1];
        });
    }
    removeUsersFromOrganization(users, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const queryParams = [];
            for (const user of users) {
                queryParams.push({
                    query: `
          DELETE FROM wb.organization_users
          WHERE user_id=$1 AND organization_id=$2
      `,
                    params: [user.id, organizationId],
                });
            }
            const results = yield this.executeQueries(queryParams);
            return results[results.length - 1];
        });
    }
    usersByOrganizationId(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE organization_id=$1
      `,
                params: [organizationId],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload);
            return result;
        });
    }
    usersByIdsOrEmails(ids, emails) {
        return __awaiter(this, void 0, void 0, function* () {
            let column = "id";
            let params = [ids];
            if (emails) {
                column = "email";
                params = [emails];
            }
            const result = yield this.executeQuery({
                query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE ${column}=ANY($1)
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload);
            return result;
        });
    }
    createUser(email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.users(
          email, first_name, last_name
        ) VALUES($1, $2, $3) RETURNING *
      `,
                params: [email, firstName, lastName],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    updateUser(id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!email && !firstName && !lastName) {
                return {
                    success: false,
                    message: "dal.updateUser: all parameters are null",
                };
            }
            let paramCount = 3;
            const date = new Date();
            const params = [date, id];
            let query = "UPDATE wb.users SET ";
            if (email) {
                query += `email=$${paramCount}, `;
                params.push(email);
                paramCount++;
            }
            if (firstName) {
                query += `first_name=$${paramCount}, `;
                params.push(firstName);
                paramCount++;
            }
            if (lastName) {
                query += `last_name=$${paramCount}, `;
                params.push(lastName);
                paramCount++;
            }
            query += "updated_at=$1 WHERE id=$2 RETURNING *";
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteTestUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        DELETE FROM wb.users
        WHERE email like 'test_%test.whitebrick.com'
      `,
                params: [],
            });
            return result;
        });
    }
    roleByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.roles.*
        FROM wb.roles
        WHERE name=$1 LIMIT 1
      `,
                params: [name],
            });
            if (result.success)
                result.payload = entity_1.Role.parseResult(result.payload)[0];
            return result;
        });
    }
    setRole(userId, roleName, roleLevel, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!entity_1.Role.isRole(roleName)) {
                return {
                    success: false,
                    message: `${roleName} is not a valid Role`,
                };
            }
            const roleResult = yield this.roleByName(roleName);
            if (!roleResult.success)
                return roleResult;
            let wbTable = "";
            let wbColumn = "";
            switch (roleLevel) {
                case "organization":
                    wbTable = "wb.organization_users";
                    wbColumn = "organization_id";
                    break;
                case "schema":
                    wbTable = "wb.schema_users";
                    wbColumn = "schema_id";
                    break;
                case "table":
                    wbTable = "wb.table_users";
                    wbColumn = "table_id";
                    break;
            }
            const query = `
      INSERT INTO ${wbTable} (role_id,  user_id, ${wbColumn}, updated_at)
      VALUES (${roleResult.payload.id}, ${userId}, ${objectId}, $1)
      ON CONFLICT (user_id, ${wbColumn})
      DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
    `;
            return yield this.executeQuery({
                query: query,
                params: [new Date()],
            });
        });
    }
    userRolesForSchema(schemaId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.executeQuery({
                query: `
        SELECT wb.roles.*
        FROM wb.roles
        JOIN wb.schema_users ON wb.roles.id=wb.schema_users.role_id
        WHERE wb.schema_users.schema_id=$1 AND wb.schema_users.user_id=$2
      `,
                params: [schemaId, userId],
            });
            if (!result.success)
                return result;
            const tableUserRoles = entity_1.Role.parseResult(result.payload);
            result = yield this.executeQuery({
                query: `
        SELECT wb.roles.*
        FROM wb.roles
        JOIN wb.schema_users ON wb.roles.id=wb.schema_users.role_id
        WHERE wb.schema_users.schema_id=$1 AND wb.schema_users.user_id=$2
      `,
                params: [schemaId, userId],
            });
            if (!result.success)
                return result;
            const schemaUserRoles = entity_1.Role.parseResult(result.payload);
            return result;
        });
    }
    createSchema(name, label, organizationOwnerId, userOwnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: `CREATE SCHEMA ${DAL.sanitize(name)}`,
                },
                {
                    query: `
          INSERT INTO wb.schemas(
            name, label, organization_owner_id, user_owner_id
          ) VALUES($1, $2, $3, $4) RETURNING *
        `,
                    params: [name, label, organizationOwnerId, userOwnerId],
                },
            ]);
            const insertResult = results[results.length - 1];
            if (insertResult.success) {
                insertResult.payload = entity_1.Schema.parseResult(insertResult.payload)[0];
            }
            return insertResult;
        });
    }
    schemas(schemaNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!schemaNamePattern)
                schemaNamePattern = "%";
            schemaNamePattern = DAL.sanitize(schemaNamePattern);
            const results = yield this.executeQueries([
                {
                    query: `
          SELECT information_schema.schemata.*
          FROM information_schema.schemata
          WHERE schema_name LIKE $1
          AND schema_name NOT LIKE 'pg_%'
          AND schema_name NOT IN ('${entity_1.Schema.SYS_SCHEMA_NAMES.join("','")}')
        `,
                    params: [schemaNamePattern],
                },
                {
                    query: `
          SELECT wb.schemas.*
          FROM wb.schemas
          WHERE name LIKE $1
        `,
                    params: [schemaNamePattern],
                },
            ]);
            if (results[0].success && results[1].success) {
                results[0].payload = entity_1.Schema.parseResult(results[0].payload);
                results[1].payload = entity_1.Schema.parseResult(results[1].payload);
                if (results[0].payload.length != results[1].payload.length) {
                    return {
                        success: false,
                        message: "dal.schemas: wb.schemas out of sync with information_schema.schemata",
                    };
                }
            }
            return results[results.length - 1];
        });
    }
    schemaByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.schemas.*
        FROM wb.schemas
        WHERE name=$1 LIMIT 1
      `,
                params: [name],
            });
            if (result.success) {
                result.payload = entity_1.Schema.parseResult(result.payload);
                if (result.payload.length == 0) {
                    return {
                        success: false,
                        message: `dal.schemaByName: Could not find schema where name=${name}`,
                    };
                }
                else {
                    result.payload = result.payload[0];
                }
            }
            return result;
        });
    }
    schemasByUserOwner(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.schemas.* FROM wb.schemas
        JOIN wb.users ON wb.schemas.user_owner_id=wb.users.id
        WHERE wb.users.email=$1
      `,
                params: [userEmail],
            });
            if (result.success) {
                const schemasWithRole = Array();
                for (const schema of entity_1.Schema.parseResult(result.payload)) {
                    schema.userRole = "schema_owner";
                    schemasWithRole.push(schema);
                }
                result.payload = schemasWithRole;
            }
            return result;
        });
    }
    schemasByOrgOwnerAdmin(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.schemas.*, wb.roles.name as user_role
        FROM wb.schemas
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        WHERE wb.roles.name='organization_administrator' AND wb.users.email=$1
      `,
                params: [userEmail],
            });
            if (result.success)
                result.payload = entity_1.Schema.parseResult(result.payload);
            return result;
        });
    }
    removeOrDeleteSchema(schemaName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            const queriesAndParams = [
                {
                    query: `
          DELETE FROM wb.schemas
          WHERE name=$1
        `,
                    params: [schemaName],
                },
            ];
            if (del) {
                queriesAndParams.push({
                    query: `DROP SCHEMA IF EXISTS ${DAL.sanitize(schemaName)} CASCADE`,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    addUserToSchema(schemaId, userId, schemaRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.schema_users(
          schema_id, user_id, role_id
        ) VALUES($1, $2, $3)
      `,
                params: [schemaId, userId, schemaRoleId],
            });
            return result;
        });
    }
    removeUserFromSchema(schemaId, userId, schemaRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      DELETE FROM wb.schema_users
      WHERE schema_id=$1 AND user_id=$2
    `;
            const params = [schemaId, userId];
            if (schemaRoleId)
                query += " AND role_id=$3";
            params.push(schemaRoleId);
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            return result;
        });
    }
    removeAllUsersFromSchema(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        DELETE FROM wb.schema_users
        WHERE schema_id IN (
          SELECT id FROM wb.schemas WHERE name=$1
        )
      `,
                params: [schemaName],
            });
            return result;
        });
    }
    schemasByUser(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.schemas.*, wb.roles.name as role_name
        FROM wb.schemas
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        WHERE wb.users.email=$1
      `,
                params: [userEmail],
            });
            if (result.success) {
                const schemasWithRole = Array();
                let schema;
                result.payload.rows.forEach((row) => {
                    schema = entity_1.Schema.parse(row);
                    schema.userRole = row.role_name;
                    schemasWithRole.push(schema);
                });
                result.payload = schemasWithRole;
            }
            return result;
        });
    }
    tables(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.tables.*
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1
      `,
                params: [schemaName],
            });
            if (result.success)
                result.payload = entity_1.Table.parseResult(result.payload);
            return result;
        });
    }
    discoverTables(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT information_schema.tables.table_name
        FROM information_schema.tables
        WHERE table_schema=$1
      `,
                params: [schemaName],
            });
            if (result.success) {
                result.payload = result.payload.rows.map((row) => row.table_name);
            }
            return result;
        });
    }
    columnBySchemaTableColumn(schemaName, tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.columns(schemaName, tableName, columnName);
            if (result.success)
                result.payload = result.payload[0];
            return result;
        });
    }
    columns(schemaName, tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      SELECT wb.columns.*, information_schema.columns.data_type as type
      FROM wb.columns
      JOIN wb.tables ON wb.columns.table_id=wb.tables.id
      JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
      JOIN information_schema.columns ON (
        wb.columns.name=information_schema.columns.column_name
        AND wb.schemas.name=information_schema.columns.table_schema
      )
      WHERE wb.schemas.name=$1 AND wb.tables.name=$2 AND information_schema.columns.table_name=$2
    `;
            let params = [schemaName, tableName];
            if (columnName) {
                query = `${query} AND wb.columns.name=$3 AND information_schema.columns.column_name=$3`;
                params.push(columnName);
            }
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Column.parseResult(result.payload);
            return result;
        });
    }
    discoverColumns(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT column_name as name, data_type as type
        FROM information_schema.columns
        WHERE table_schema=$1
        AND table_name=$2
      `,
                params: [schemaName, tableName],
            });
            if (result.success)
                result.payload = entity_1.Column.parseResult(result.payload);
            return result;
        });
    }
    foreignKeysOrReferences(schemaName, tableNamePattern, columnNamePattern, type) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableNamePattern = DAL.sanitize(tableNamePattern);
            columnNamePattern = DAL.sanitize(columnNamePattern);
            let whereSql = "";
            switch (type) {
                case "FOREIGN_KEYS":
                    whereSql = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
                    break;
                case "REFERENCES":
                    whereSql = `
          AND ref.table_name LIKE '${tableNamePattern}'
          AND ref.column_name LIKE '${columnNamePattern}'
        `;
                    break;
                case "ALL":
                    whereSql = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
                    break;
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        -- unique reference info
        ref.table_name       AS ref_table,
        ref.column_name      AS ref_column,
        refd.constraint_type AS ref_type, -- e.g. UNIQUE or PRIMARY KEY
        -- foreign key info
        fk.table_name        AS fk_table,
        fk.column_name       AS fk_column,
        fk.constraint_name   AS fk_name,
        map.update_rule      AS fk_on_update,
        map.delete_rule      AS fk_on_delete
        -- lists fk constraints AND maps them to pk constraints
        FROM information_schema.referential_constraints AS map
        -- join unique constraints (e.g. PKs constraints) to ref columns info
        INNER JOIN information_schema.key_column_usage AS ref
        ON  ref.constraint_catalog = map.unique_constraint_catalog
        AND ref.constraint_schema = map.unique_constraint_schema
        AND ref.constraint_name = map.unique_constraint_name
        -- optional: to include reference constraint type
        LEFT JOIN information_schema.table_constraints AS refd
        ON  refd.constraint_catalog = ref.constraint_catalog
        AND refd.constraint_schema = ref.constraint_schema
        AND refd.constraint_name = ref.constraint_name
        -- join fk columns to the correct ref columns using ordinal positions
        INNER JOIN information_schema.key_column_usage AS fk
        ON  fk.constraint_catalog = map.constraint_catalog
        AND fk.constraint_schema = map.constraint_schema
        AND fk.constraint_name = map.constraint_name
        AND fk.position_in_unique_constraint = ref.ordinal_position --IMPORTANT!
        WHERE ref.table_schema='${schemaName}'
        AND fk.table_schema='${schemaName}'
        ${whereSql}
      `,
            });
            if (!result.success)
                return result;
            const constraints = [];
            for (const row of result.payload.rows) {
                const constraint = {
                    constraintName: row.fk_name,
                    tableName: row.fk_table,
                    columnName: row.fk_column,
                    relTableName: row.ref_table,
                    relColumnName: row.ref_column,
                };
                constraints.push(constraint);
            }
            result.payload = constraints;
            return result;
        });
    }
    primaryKeys(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            const result = yield this.executeQuery({
                query: `
        SELECT DISTINCT c.column_name, tc.constraint_name
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage AS ccu
        USING (constraint_schema, constraint_name)
        JOIN information_schema.columns AS c
        ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name
        AND ccu.column_name = c.column_name
        WHERE constraint_type = 'PRIMARY KEY'
        AND c.table_schema='${schemaName}'
        AND tc.table_name = '${tableName}'
      `,
            });
            if (result.success) {
                const pKColsConstraints = {};
                for (const row of result.payload.rows) {
                    pKColsConstraints[row.column_name] = row.constraint_name;
                }
                result.payload = pKColsConstraints;
            }
            return result;
        });
    }
    deleteConstraint(schemaName, tableName, constraintName) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            constraintName = DAL.sanitize(constraintName);
            const result = yield this.executeQuery({
                query: `
        ALTER TABLE ${schemaName}.${tableName}
        DROP CONSTRAINT IF EXISTS ${constraintName}
      `,
            });
            return result;
        });
    }
    createPrimaryKey(schemaName, tableName, columnNames) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            const sanitizedColumnNames = [];
            for (const columnName of columnNames) {
                sanitizedColumnNames.push(DAL.sanitize(columnName));
            }
            const result = yield this.executeQuery({
                query: `
        ALTER TABLE ${schemaName}.${tableName}
        ADD PRIMARY KEY (${sanitizedColumnNames.join(",")});
      `,
            });
            return result;
        });
    }
    createForeignKey(schemaName, tableName, columnNames, parentTableName, parentColumnNames) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.createForeignKey(${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames})`);
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            const sanitizedColumnNames = [];
            for (const columnName of columnNames) {
                sanitizedColumnNames.push(DAL.sanitize(columnName));
            }
            parentTableName = DAL.sanitize(parentTableName);
            const sanitizedParentColumnNames = [];
            for (const parentColumnName of parentColumnNames) {
                sanitizedParentColumnNames.push(DAL.sanitize(parentColumnName));
            }
            const result = yield this.executeQuery({
                query: `
        ALTER TABLE ${schemaName}.${tableName}
        ADD CONSTRAINT ${tableName}_${sanitizedColumnNames.join("_")}_fkey
        FOREIGN KEY (${sanitizedColumnNames.join(",")})
        REFERENCES ${schemaName}.${parentTableName}
          (${sanitizedParentColumnNames.join(",")})
        ON DELETE SET NULL
      `,
            });
            return result;
        });
    }
    tableBySchemaTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.tables.*
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2 LIMIT 1
      `,
                params: [schemaName, tableName],
            });
            if (result.success)
                result.payload = entity_1.Table.parseResult(result.payload)[0];
            return result;
        });
    }
    addOrCreateTable(schemaName, tableName, tableLabel, create) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.addOrCreateTable ${schemaName} ${tableName} ${tableLabel} ${create}`);
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            let result = yield this.schemaByName(schemaName);
            if (!result.success)
                return result;
            const queriesAndParams = [
                {
                    query: `
        INSERT INTO wb.tables(schema_id, name, label)
        VALUES ($1, $2, $3)
      `,
                    params: [result.payload.id, tableName, tableLabel],
                },
            ];
            if (create) {
                queriesAndParams.push({
                    query: `CREATE TABLE "${schemaName}"."${tableName}"()`,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    removeOrDeleteTable(schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            let result = yield this.schemaByName(schemaName);
            if (!result.success)
                return result;
            const queriesAndParams = [
                {
                    query: `
          DELETE FROM wb.tables
          WHERE schema_id=$1 AND name=$2
        `,
                    params: [result.payload.id, tableName],
                },
            ];
            if (del) {
                queriesAndParams.push({
                    query: `DROP TABLE IF EXISTS "${schemaName}"."${tableName}" CASCADE`,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    updateTable(schemaName, tableName, newTableName, newTableLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            let result = yield this.tableBySchemaTable(schemaName, tableName);
            if (!result.success)
                return result;
            let params = [];
            let query = `
      UPDATE wb.tables SET
    `;
            let updates = [];
            if (newTableName) {
                params.push(newTableName);
                updates.push("name=$" + params.length);
            }
            if (newTableLabel) {
                params.push(newTableLabel);
                updates.push("label=$" + params.length);
            }
            params.push(result.payload.id);
            query += `${updates.join(", ")} WHERE id=$${params.length}`;
            const queriesAndParams = [
                {
                    query: query,
                    params: params,
                },
            ];
            if (newTableName) {
                queriesAndParams.push({
                    query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          RENAME TO ${newTableName}
        `,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnPGType) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.addOrCreateColumn ${schemaName} ${tableName} ${columnName} ${columnLabel} ${columnPGType} ${create}`);
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            columnName = DAL.sanitize(columnName);
            let result = yield this.tableBySchemaTable(schemaName, tableName);
            if (!result.success)
                return result;
            const queriesAndParams = [
                {
                    query: `
          INSERT INTO wb.columns(table_id, name, label)
          VALUES ($1, $2, $3)
        `,
                    params: [result.payload.id, columnName, columnLabel],
                },
            ];
            if (create) {
                queriesAndParams.push({
                    query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          ADD ${columnName} ${columnPGType}
        `,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            columnName = DAL.sanitize(columnName);
            const queriesAndParams = [];
            if (newColumnName || newColumnLabel) {
                let result = yield this.columnBySchemaTableColumn(schemaName, tableName, columnName);
                if (!result.success)
                    return result;
                let params = [];
                let query = `
        UPDATE wb.columns SET
      `;
                let updates = [];
                if (newColumnName) {
                    params.push(newColumnName);
                    updates.push("name=$" + params.length);
                }
                if (newColumnLabel) {
                    params.push(newColumnLabel);
                    updates.push("label=$" + params.length);
                }
                params.push(result.payload.id);
                query += `${updates.join(", ")} WHERE id=$${params.length}`;
                queriesAndParams.push({
                    query: query,
                    params: params,
                });
            }
            if (newType) {
                queriesAndParams.push({
                    query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          ALTER COLUMN ${columnName} TYPE ${newType}
        `,
                });
            }
            if (newColumnName) {
                queriesAndParams.push({
                    query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          RENAME COLUMN ${columnName} TO ${newColumnName}
        `,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    removeOrDeleteColumn(schemaName, tableName, columnName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            columnName = DAL.sanitize(columnName);
            let result = yield this.tableBySchemaTable(schemaName, tableName);
            if (!result.success)
                return result;
            const queriesAndParams = [
                {
                    query: `
          DELETE FROM wb.columns
          WHERE table_id=$1 AND name=$2
        `,
                    params: [result.payload.id, columnName],
                },
            ];
            if (del) {
                queriesAndParams.push({
                    query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          DROP COLUMN IF EXISTS ${columnName} CASCADE
        `,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            return results[results.length - 1];
        });
    }
    tableUser(userEmail, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.table_users.*
        FROM wb.table_users
        JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        WHERE wb.users.email=$1 AND wb.schemas.name=$2 AND wb.tables.name=$3
        LIMIT 1
      `,
                params: [userEmail, schemaName, tableName],
            });
            if (result.success) {
                result.payload = entity_1.TableUser.parseResult(result.payload)[0];
            }
            return result;
        });
    }
    removeTableUsers(schemaName, tableName, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            let params = [schemaName, tableName];
            let query = `
      DELETE FROM wb.table_users
      WHERE wb.table_users.table_id IN (
        SELECT wb.tables.id FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1
        AND wb.tables.name=$2
      )
    `;
            if (userEmails && userEmails.length > 0) {
                params.push(userEmails.join(","));
                query += `
        AND wb.table_users.user_id IN (
          SELECT wb.users.id from wb.users
          WHERE email IN $3
        )
      `;
            }
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            return result;
        });
    }
    saveTableUserSettings(tableId, userId, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.table_users (
          table_id, user_id, settings
        )
        VALUES($1, $2, $3)
        ON CONFLICT (table_id, user_id) 
        DO UPDATE SET settings = EXCLUDED.settings
      `,
                params: [tableId, userId, settings],
            });
            return result;
        });
    }
}
exports.DAL = DAL;


/***/ }),

/***/ "./src/entity/Column.ts":
/*!******************************!*\
  !*** ./src/entity/Column.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Column = void 0;
class Column {
    static parseResult(data) {
        if (!data)
            throw new Error("Column.parseResult: input is null");
        const columns = Array();
        data.rows.forEach((row) => {
            columns.push(Column.parse(row));
        });
        return columns;
    }
    static parse(data) {
        if (!data)
            throw new Error("Column.parse: input is null");
        const column = new Column();
        column.id = data.id;
        column.tableId = data.table_id;
        column.name = data.name;
        column.label = data.label;
        column.type = data.type;
        column.createdAt = data.created_at;
        column.updatedAt = data.updated_at;
        return column;
    }
}
exports.Column = Column;
Column.COMMON_TYPES = {
    Text: "text",
    Number: "integer",
    Decimal: "decimal",
    Boolean: "boolean",
    Date: "date",
    "Date & Time": "timestamp",
};


/***/ }),

/***/ "./src/entity/Organization.ts":
/*!************************************!*\
  !*** ./src/entity/Organization.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Organization = void 0;
class Organization {
    static parseResult(data) {
        if (!data)
            throw new Error("Organization.parseResult: input is null");
        const organizations = Array();
        data.rows.forEach((row) => {
            organizations.push(Organization.parse(row));
        });
        return organizations;
    }
    static parse(data) {
        if (!data)
            throw new Error("Organization.parse: input is null");
        const organization = new Organization();
        organization.id = data.id;
        organization.name = data.name;
        organization.label = data.label;
        organization.createdAt = data.created_at;
        organization.updatedAt = data.updated_at;
        if (data.user_role)
            organization.userRole = data.user_role;
        return organization;
    }
}
exports.Organization = Organization;


/***/ }),

/***/ "./src/entity/Role.ts":
/*!****************************!*\
  !*** ./src/entity/Role.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Role = void 0;
class Role {
    static isRole(roleName) {
        return (Object.keys(Role.SYSROLES_ORGANIZATIONS).includes(roleName) ||
            Object.keys(Role.SYSROLES_SCHEMAS).includes(roleName) ||
            Object.keys(Role.SYSROLES_TABLES).includes(roleName));
    }
    static areRoles(roleNames) {
        for (const roleName of roleNames) {
            if (!Role.isRole(roleName))
                return false;
        }
        return true;
    }
    static parseResult(data) {
        if (!data)
            throw new Error("Role.parseResult: input is null");
        const roles = Array();
        data.rows.forEach((row) => {
            roles.push(Role.parse(row));
        });
        return roles;
    }
    static parse(data) {
        if (!data)
            throw new Error("Role.parse: input is null");
        const role = new Role();
        role.id = data.id;
        role.name = data.name;
        if (data.syscode)
            role.syscode = data.syscode;
        role.label = data.label;
        role.createdAt = data.created_at;
        role.updatedAt = data.updated_at;
        if (data.schemaId)
            role.schemaId = data.schemaId;
        if (data.schemaName)
            role.schemaName = data.schemaName;
        if (data.tableId)
            role.tableId = data.tableId;
        if (data.tableName)
            role.tableName = data.tableName;
        return role;
    }
}
exports.Role = Role;
Role.SYSROLES_ORGANIZATIONS = {
    organization_administrator: {
        syscode: "oa",
        label: "Organization Administrator",
    },
    organization_user: { syscode: "ou", label: "Organization User" },
    organization_external_user: {
        syscode: "oe",
        label: "Organization External User",
    },
};
Role.SYSROLES_SCHEMAS = {
    schema_owner: { syscode: "so", label: "DB Owner" },
    schema_administrator: { syscode: "sa", label: "DB Administrator" },
    schema_manager: { syscode: "sm", label: "DB Manager" },
    schema_editor: { syscode: "se", label: "DB Editor" },
    schema_reader: { syscode: "sr", label: "DB Reader" },
};
Role.SYSROLES_TABLES = {
    table_inherit: { syscode: "ti", label: "Inherit Table Role From DB" },
    table_administrator: { syscode: "ta", label: "Table Administrator" },
    table_manager: { syscode: "tm", label: "Table Manager" },
    table_editor: { syscode: "te", label: "Table Editor" },
    table_reader: { syscode: "tr", label: "Table Reader" },
};


/***/ }),

/***/ "./src/entity/Schema.ts":
/*!******************************!*\
  !*** ./src/entity/Schema.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Schema = void 0;
class Schema {
    static parseResult(data) {
        if (!data)
            throw new Error("Schema.parseResult: input is null");
        const schemas = Array();
        data.rows.forEach((row) => {
            schemas.push(Schema.parse(row));
        });
        return schemas;
    }
    static parse(data) {
        if (!data)
            throw new Error("Schema.parse: input is null");
        const schema = new Schema();
        schema.id = data.id;
        schema.name = data.name;
        schema.label = data.label;
        schema.organizationOwnerId = data.organizationOwnerId;
        schema.userOwnerId = data.userOwnerId;
        schema.createdAt = data.created_at;
        schema.updatedAt = data.updated_at;
        if (data.user_role)
            schema.userRole = data.user_role;
        return schema;
    }
}
exports.Schema = Schema;
Schema.SYS_SCHEMA_NAMES = [
    "public",
    "information_schema",
    "hdb_catalog",
    "wb",
];


/***/ }),

/***/ "./src/entity/Table.ts":
/*!*****************************!*\
  !*** ./src/entity/Table.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Table = void 0;
class Table {
    static parseResult(data) {
        if (!data)
            throw new Error("Table.parseResult: input is null");
        const tables = Array();
        data.rows.forEach((row) => {
            tables.push(Table.parse(row));
        });
        return tables;
    }
    static parse(data) {
        if (!data)
            throw new Error("Table.parse: input is null");
        const table = new Table();
        table.id = data.id;
        table.schemaId = data.schema_id;
        table.name = data.name;
        table.label = data.label;
        table.createdAt = data.created_at;
        table.updatedAt = data.updated_at;
        return table;
    }
}
exports.Table = Table;


/***/ }),

/***/ "./src/entity/TableUser.ts":
/*!*********************************!*\
  !*** ./src/entity/TableUser.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TableUser = void 0;
class TableUser {
    static parseResult(data) {
        if (!data)
            throw new Error("TableUser.parseResult: input is null");
        const tableUsers = Array();
        data.rows.forEach((row) => {
            tableUsers.push(TableUser.parse(row));
        });
        return tableUsers;
    }
    static parse(data) {
        if (!data)
            throw new Error("TableUser.parse: input is null");
        const tableUser = new TableUser();
        tableUser.tableId = data.table_id;
        tableUser.userId = data.user_id;
        tableUser.roleId = data.role_id;
        tableUser.settings = data.settings;
        tableUser.createdAt = data.created_at;
        tableUser.updatedAt = data.updated_at;
        return tableUser;
    }
}
exports.TableUser = TableUser;


/***/ }),

/***/ "./src/entity/User.ts":
/*!****************************!*\
  !*** ./src/entity/User.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.User = void 0;
class User {
    static isAdmin(uid) {
        return uid == User.HASURA_ADMIN_ID;
    }
    static parseResult(data) {
        if (!data)
            throw new Error("User.parseResult: input is null");
        const users = Array();
        data.rows.forEach((row) => {
            users.push(User.parse(row));
        });
        return users;
    }
    static parse(data) {
        if (!data)
            throw new Error("User.parse: input is null");
        const user = new User();
        user.id = data.id;
        user.email = data.email;
        if (data.first_name)
            user.firstName = data.first_name;
        if (data.last_name)
            user.lastName = data.last_name;
        user.createdAt = data.created_at;
        user.updatedAt = data.updated_at;
        if (data.role)
            user.role = data.role;
        return user;
    }
}
exports.User = User;
User.HASURA_ADMIN_ID = 1;


/***/ }),

/***/ "./src/entity/index.ts":
/*!*****************************!*\
  !*** ./src/entity/index.ts ***!
  \*****************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(/*! ./Role */ "./src/entity/Role.ts"), exports);
__exportStar(__webpack_require__(/*! ./Schema */ "./src/entity/Schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./Table */ "./src/entity/Table.ts"), exports);
__exportStar(__webpack_require__(/*! ./Column */ "./src/entity/Column.ts"), exports);
__exportStar(__webpack_require__(/*! ./TableUser */ "./src/entity/TableUser.ts"), exports);
__exportStar(__webpack_require__(/*! ./Organization */ "./src/entity/Organization.ts"), exports);
__exportStar(__webpack_require__(/*! ./User */ "./src/entity/User.ts"), exports);


/***/ }),

/***/ "./src/environment.ts":
/*!****************************!*\
  !*** ./src/environment.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.environment = void 0;
exports.environment = {
    secretMessage: process.env.SECRET_MESSAGE,
    dbName: process.env.DB_NAME,
    dbHost: process.env.DB_HOST,
    dbPort: parseInt(process.env.DB_PORT || ""),
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD,
    dbPoolMax: parseInt(process.env.DB_POOL_MAX || ""),
    dbPoolIdleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MILLIS || ""),
    dbPoolConnectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MILLIS || ""),
    hasuraHost: process.env.HASURA_HOST,
    hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET,
};


/***/ }),

/***/ "./src/hasura-api.ts":
/*!***************************!*\
  !*** ./src/hasura-api.ts ***!
  \***************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hasuraApi = void 0;
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const environment_1 = __webpack_require__(/*! ./environment */ "./src/environment.ts");
const whitebrick_cloud_1 = __webpack_require__(/*! ./whitebrick-cloud */ "./src/whitebrick-cloud.ts");
const headers = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "x-hasura-admin-secret": environment_1.environment.hasuraAdminSecret,
};
class HasuraApi {
    constructor() {
        this.instance = null;
    }
    get http() {
        return this.instance != null ? this.instance : this.initHasuraApi();
    }
    initHasuraApi() {
        const http = axios_1.default.create({
            baseURL: environment_1.environment.hasuraHost,
            headers,
            withCredentials: false,
        });
        this.instance = http;
        return http;
    }
    post(type, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = { success: false };
            try {
                whitebrick_cloud_1.log.debug(`hasuraApi.post: type: ${type}`, args);
                const response = yield this.http.post("/v1/metadata", {
                    type: type,
                    args: args,
                });
                result = {
                    success: true,
                    payload: response,
                };
            }
            catch (error) {
                if (error.response && error.response.data) {
                    if (!HasuraApi.HASURA_IGNORE_CODES.includes(error.response.data.code)) {
                        whitebrick_cloud_1.log.error(error.response.data);
                        result = {
                            success: false,
                            message: error.response.data.error,
                            code: error.response.data.code,
                        };
                    }
                    else {
                        result = {
                            success: true,
                        };
                    }
                }
                else {
                    result = {
                        success: false,
                        message: error.message,
                    };
                }
            }
            return result;
        });
    }
    trackTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.post("pg_track_table", {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
            });
            if (!result.success &&
                result.code &&
                HasuraApi.HASURA_IGNORE_CODES.includes(result.code)) {
                return {
                    success: true,
                    payload: true,
                    message: result.code,
                };
            }
            return result;
        });
    }
    untrackTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.post("pg_untrack_table", {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                cascade: true,
            });
            if (!result.success &&
                result.code &&
                HasuraApi.HASURA_IGNORE_CODES.includes(result.code)) {
                return {
                    success: true,
                    payload: true,
                    message: result.code,
                };
            }
            return result;
        });
    }
    createObjectRelationship(schemaName, tableName, columnName, parentTableName) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`hasuraApi.createObjectRelationship(${schemaName}, ${tableName}, ${columnName}, ${parentTableName})`);
            const result = yield this.post("pg_create_object_relationship", {
                name: `obj_${tableName}_${parentTableName}`,
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                using: {
                    foreign_key_constraint_on: columnName,
                },
            });
            if (!result.success &&
                result.code &&
                HasuraApi.HASURA_IGNORE_CODES.includes(result.code)) {
                return {
                    success: true,
                    payload: true,
                    message: result.code,
                };
            }
            return result;
        });
    }
    createArrayRelationship(schemaName, tableName, childTableName, childColumnNames) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`hasuraApi.createArrayRelationship(${schemaName}, ${tableName}, ${childTableName}, ${childColumnNames})`);
            const result = yield this.post("pg_create_array_relationship", {
                name: `arr_${tableName}_${childTableName}`,
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                using: {
                    foreign_key_constraint_on: {
                        column: childColumnNames[0],
                        table: {
                            schema: schemaName,
                            name: childTableName,
                        },
                    },
                },
            });
            if (!result.success &&
                result.code &&
                HasuraApi.HASURA_IGNORE_CODES.includes(result.code)) {
                return {
                    success: true,
                    payload: true,
                    message: result.code,
                };
            }
            return result;
        });
    }
    dropRelationships(schemaName, tableName, parentTableName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.post("pg_drop_relationship", {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                relationship: `obj_${tableName}_${parentTableName}`,
            });
            if (!result.success &&
                (!result.code ||
                    (result.code && !HasuraApi.HASURA_IGNORE_CODES.includes(result.code)))) {
                return result;
            }
            result = yield this.post("pg_drop_relationship", {
                table: {
                    schema: schemaName,
                    name: parentTableName,
                },
                relationship: `arr_${parentTableName}_${tableName}`,
            });
            if (!result.success &&
                result.code &&
                HasuraApi.HASURA_IGNORE_CODES.includes(result.code)) {
                return {
                    success: true,
                    payload: true,
                    message: result.code,
                };
            }
            return result;
        });
    }
}
HasuraApi.HASURA_IGNORE_CODES = [
    "already-untracked",
    "already-tracked",
    "not-exists",
];
exports.hasuraApi = new HasuraApi();


/***/ }),

/***/ "./src/types/index.ts":
/*!****************************!*\
  !*** ./src/types/index.ts ***!
  \****************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.schema = void 0;
const schema_1 = __webpack_require__(/*! ./schema */ "./src/types/schema.ts");
const organization_1 = __webpack_require__(/*! ./organization */ "./src/types/organization.ts");
const user_1 = __webpack_require__(/*! ./user */ "./src/types/user.ts");
const table_1 = __webpack_require__(/*! ./table */ "./src/types/table.ts");
const lodash_1 = __webpack_require__(/*! lodash */ "lodash");
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const graphql_constraint_directive_1 = __webpack_require__(/*! graphql-constraint-directive */ "graphql-constraint-directive");
const graphql_tools_1 = __webpack_require__(/*! graphql-tools */ "graphql-tools");
const typeDefs = apollo_server_lambda_1.gql `
  type Query {
    wbHealthCheck: JSON!
    wbCloudContext: JSON!
  }

  type Mutation {
    wbResetTestData: Boolean!
    wbAuth(
      schemaName: String!
      authUserId: String!
      authUserName: String
    ): JSON!
  }
`;
const resolvers = {
    Query: {
        wbHealthCheck: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            return {
                headers: context.headers,
                multiValueHeaders: context.headers,
            };
        }),
        wbCloudContext: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            return context.wbCloud.cloudContext();
        }),
    },
    Mutation: {
        wbResetTestData: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.resetTestData();
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAuth: (_, { schemaName, authUserId, authUserName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.auth(schemaName, authUserId, authUserName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
};
exports.schema = graphql_tools_1.makeExecutableSchema({
    typeDefs: [
        graphql_constraint_directive_1.constraintDirectiveTypeDefs,
        typeDefs,
        organization_1.typeDefs,
        user_1.typeDefs,
        schema_1.typeDefs,
        table_1.typeDefs,
    ],
    resolvers: lodash_1.merge(resolvers, organization_1.resolvers, user_1.resolvers, schema_1.resolvers, table_1.resolvers),
    schemaTransforms: [graphql_constraint_directive_1.constraintDirective()],
});


/***/ }),

/***/ "./src/types/organization.ts":
/*!***********************************!*\
  !*** ./src/types/organization.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolvers = exports.typeDefs = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Organization {
    id: ID!
    name: String!
    label: String!
    userRole: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbOrganizations(userEmail: String): [Organization]
    wbOrganizationById(id: ID!): Organization
    wbOrganizationByName(name: String!): Organization
  }

  extend type Mutation {
    wbCreateOrganization(
      currentUserEmail: String!
      name: String!
      label: String!
    ): Organization
    wbUpdateOrganization(
      name: String!
      newName: String
      newLabel: String
    ): Organization
    wbDeleteOrganization(name: String!): Boolean
  }
`;
exports.resolvers = {
    Query: {
        wbOrganizations: (_, { userEmail }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.organizations(undefined, userEmail, undefined);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbOrganizationById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.organizationById(id);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbOrganizationByName: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.organizationByName(name);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateOrganization: (_, { currentUserEmail, name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createOrganization(currentUserEmail, name, label);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateOrganization: (_, { name, newName, newLabel }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateOrganization(name, newName, newLabel);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbDeleteOrganization: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.deleteOrganization(name);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
    },
};


/***/ }),

/***/ "./src/types/schema.ts":
/*!*****************************!*\
  !*** ./src/types/schema.ts ***!
  \*****************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolvers = exports.typeDefs = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    userRole: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbSchemas(userEmail: String!): [Schema]
  }

  extend type Mutation {
    wbCreateSchema(
      name: String!
      label: String!
      organizationOwnerId: Int
      organizationOwnerName: String
      userOwnerId: Int
      userOwnerEmail: String
    ): Schema
  }
`;
exports.resolvers = {
    Query: {
        wbSchemas: (_, { userEmail }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const uidResult = yield context.wbCloud.uidFromHeaders(context.headers);
            if (!uidResult.success)
                return context.wbCloud.err(uidResult);
            const result = yield context.wbCloud.accessibleSchemas(userEmail);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateSchema: (_, { name, label, organizationOwnerId, organizationOwnerName, userOwnerId, userOwnerEmail, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const uidResult = yield context.wbCloud.uidFromHeaders(context.headers);
            if (!uidResult.success)
                return context.wbCloud.err(uidResult);
            const result = yield context.wbCloud.createSchema(uidResult.payload, name, label, organizationOwnerId, organizationOwnerName, userOwnerId, userOwnerEmail);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
};


/***/ }),

/***/ "./src/types/table.ts":
/*!****************************!*\
  !*** ./src/types/table.ts ***!
  \****************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolvers = exports.typeDefs = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const graphql_type_json_1 = __webpack_require__(/*! graphql-type-json */ "graphql-type-json");
exports.typeDefs = apollo_server_lambda_1.gql `
  scalar JSON

  type Table {
    id: ID!
    schemaId: Int!
    name: String!
    label: String!
    createdAt: String!
    updatedAt: String!
    columns: [Column]!
  }

  type Column {
    id: ID!
    tableId: Int!
    name: String!
    label: String!
    type: String!
    isPrimaryKey: Boolean!
    foreignKeys: [ConstraintId]!
    referencedBy: [ConstraintId]!
    createdAt: String!
    updatedAt: String!
  }

  type ConstraintId {
    constraintName: String!
    tableName: String!
    columnName: String!
    relTableName: String
    relColumnName: String
  }

  type TableUser {
    tableId: Int!
    userId: Int!
    roleId: Int!
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbTables(schemaName: String!): [Table]
    wbColumns(schemaName: String!, tableName: String!): [Column]
    wbTableUser(
      userEmail: String!
      schemaName: String!
      tableName: String!
    ): TableUser
  }

  extend type Mutation {
    wbAddOrCreateTable(
      schemaName: String!
      tableName: String!
      tableLabel: String!
      create: Boolean
    ): Boolean!
    wbUpdateTable(
      schemaName: String!
      tableName: String!
      newTableName: String
      newTableLabel: String
    ): Boolean!
    wbRemoveOrDeleteTable(
      schemaName: String!
      tableName: String!
      del: Boolean
    ): Boolean!
    wbAddAllExistingTables(schemaName: String!): Boolean!
    wbAddOrCreateColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      columnLabel: String!
      create: Boolean
      columnType: String
    ): Boolean!
    wbUpdateColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      newColumnName: String
      newColumnLabel: String
      newType: String
    ): Boolean!
    wbRemoveOrDeleteColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      del: Boolean
    ): Boolean!
    wbCreateOrDeletePrimaryKey(
      schemaName: String!
      tableName: String!
      columnNames: [String]!
      del: Boolean
    ): Boolean!
    wbAddOrCreateForeignKey(
      schemaName: String!
      tableName: String!
      columnNames: [String]!
      parentTableName: String!
      parentColumnNames: [String]!
      create: Boolean
    ): Boolean!
    wbRemoveOrDeleteForeignKey(
      schemaName: String!
      tableName: String!
      columnNames: [String]!
      parentTableName: String!
      del: Boolean
    ): Boolean!
    wbSaveTableUserSettings(
      userEmail: String!
      schemaName: String!
      tableName: String!
      settings: JSON!
    ): Boolean!
    wbAddAllExistingRelationships(schemaName: String!): Boolean!
  }
`;
exports.resolvers = {
    JSON: graphql_type_json_1.GraphQLJSON,
    Query: {
        wbTables: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tables(schemaName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbColumns: (_, { schemaName, tableName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.columns(schemaName, tableName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbTableUser: (_, { schemaName, tableName, userEmail }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tableUser(userEmail, schemaName, tableName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbAddOrCreateTable: (_, { schemaName, tableName, tableLabel, create }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addOrCreateTable(schemaName, tableName, tableLabel, create);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbUpdateTable: (_, { schemaName, tableName, newTableName, newTableLabel }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateTable(schemaName, tableName, newTableName, newTableLabel);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteTable: (_, { schemaName, tableName, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.removeOrDeleteTable(schemaName, tableName, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddAllExistingTables: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addAllExistingTables(schemaName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddAllExistingRelationships: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addAllExistingRelationships(schemaName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddOrCreateColumn: (_, { schemaName, tableName, columnName, columnLabel, create, columnType }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbUpdateColumn: (_, { schemaName, tableName, columnName, newColumnName, newColumnLabel, newType, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteColumn: (_, { schemaName, tableName, columnName, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.removeOrDeleteColumn(schemaName, tableName, columnName, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbCreateOrDeletePrimaryKey: (_, { schemaName, tableName, columnNames, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createOrDeletePrimaryKey(schemaName, tableName, columnNames, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddOrCreateForeignKey: (_, { schemaName, tableName, columnNames, parentTableName, parentColumnNames, create, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addOrCreateForeignKey(schemaName, tableName, columnNames, parentTableName, parentColumnNames, create);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteForeignKey: (_, { schemaName, tableName, columnNames, parentTableName, parentColumnNames, del, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.removeOrDeleteForeignKey(schemaName, tableName, columnNames, parentTableName, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbSaveTableUserSettings: (_, { schemaName, tableName, userEmail, settings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.saveTableUserSettings(schemaName, tableName, userEmail, settings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
    },
};


/***/ }),

/***/ "./src/types/user.ts":
/*!***************************!*\
  !*** ./src/types/user.ts ***!
  \***************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolvers = exports.typeDefs = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.typeDefs = apollo_server_lambda_1.gql `
  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    createdAt: String!
    updatedAt: String!
    role: String
  }

  extend type Query {
    wbOrganizationUsers(name: String!, roles: [String]): [User]
    wbUsersByOrganizationId(organizationId: ID!): [User]
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
  }

  extend type Mutation {
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(
      id: ID!
      email: String
      firstName: String
      lastName: String
    ): User
    """
    Organization-User-Roles
    """
    wbSetOrganizationUsersRole(
      organizationName: String!
      userEmails: [String]!
      role: String!
    ): Boolean
    wbRemoveUsersFromOrganization(
      userEmails: [String]!
      organizationName: String!
    ): Boolean
    """
    Schema-User-Roles
    """
    wbAddUserToSchema(
      schemaName: String!
      userEmail: String!
      schemaRole: String!
    ): User
  }
`;
exports.resolvers = {
    Query: {
        wbOrganizationUsers: (_, { name, roles }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.organizationUsers(name, roles);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUsersByOrganizationId: (_, { organizationId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.usersByOrganizationId(organizationId);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUserById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.userById(id);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUserByEmail: (_, { email }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.userByEmail(email);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateUser: (_, { email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createUser(email, firstName, lastName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateUser: (_, { id, email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateUser(id, email, firstName, lastName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSetOrganizationUsersRole: (_, { organizationName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.setOrganizationUsersRole(organizationName, userEmails, role);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveUsersFromOrganization: (_, { userEmails, organizationName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.removeUsersFromOrganization(userEmails, organizationName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddUserToSchema: (_, { schemaName, userEmail, schemaRole }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addUserToSchema(schemaName, userEmail, schemaRole);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
};


/***/ }),

/***/ "./src/whitebrick-cloud.ts":
/*!*********************************!*\
  !*** ./src/whitebrick-cloud.ts ***!
  \*********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.log = exports.graphqlHandler = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const tslog_1 = __webpack_require__(/*! tslog */ "tslog");
const dal_1 = __webpack_require__(/*! ./dal */ "./src/dal.ts");
const hasura_api_1 = __webpack_require__(/*! ./hasura-api */ "./src/hasura-api.ts");
const types_1 = __webpack_require__(/*! ./types */ "./src/types/index.ts");
const v = __webpack_require__(/*! voca */ "voca");
const entity_1 = __webpack_require__(/*! ./entity */ "./src/entity/index.ts");
exports.graphqlHandler = new apollo_server_lambda_1.ApolloServer({
    schema: types_1.schema,
    introspection: true,
    context: ({ event, context }) => {
        return {
            headers: event.headers,
            multiValueHeaders: event.multiValueHeaders,
            wbCloud: new WhitebrickCloud(),
        };
    },
}).createHandler();
exports.log = new tslog_1.Logger({
    minLevel: "debug",
});
class WhitebrickCloud {
    constructor() {
        this.dal = new dal_1.DAL();
    }
    err(result) {
        if (result.success) {
            return new Error("WhitebrickCloud.err: result is not an error (success==true)");
        }
        let apolloError = "INTERNAL_SERVER_ERROR";
        if (result.apolloError)
            apolloError = result.apolloError;
        return new apollo_server_lambda_1.ApolloError(result.message, apolloError, {
            ref: result.code,
        });
    }
    uidFromHeaders(headers) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.warn("========== HEADERS: " + JSON.stringify(headers));
            const headersLowerCase = Object.entries(headers).reduce((acc, [key, val]) => ((acc[key.toLowerCase()] = val), acc), {});
            let result = WhitebrickCloud.RESULT_DEFAULT;
            if (headersLowerCase["x-hasura-role"] &&
                headersLowerCase["x-hasura-role"].toLowerCase() == "admin") {
                return {
                    success: true,
                    payload: entity_1.User.HASURA_ADMIN_ID,
                };
            }
            else if ( true &&
                headersLowerCase["x-test-user-id"]) {
                result = yield this.userByEmail(headersLowerCase["x-test-user-id"]);
                if (result.success)
                    result.payload = result.payload.id;
            }
            else if (headersLowerCase["x-hasura-user-id"]) {
                result = {
                    success: true,
                    payload: parseInt(headersLowerCase["x-hasura-user-id"]),
                };
            }
            else {
                result = {
                    success: false,
                    message: `uidFromHeaders: Could not find headers for Admin, Test or User in: ${JSON.stringify(headers)}`,
                };
            }
            return result;
        });
    }
    cloudContext() {
        return {
            defaultColumnTypes: entity_1.Column.COMMON_TYPES,
            roles: {
                organizations: entity_1.Role.SYSROLES_ORGANIZATIONS,
                schemas: entity_1.Role.SYSROLES_SCHEMAS,
                tables: entity_1.Role.SYSROLES_TABLES,
            },
        };
    }
    resetTestData() {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.schemas("test_%");
            if (!result.success)
                return result;
            for (const schema of result.payload) {
                result = yield this.removeOrDeleteSchema(schema.name, true);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.deleteTestOrganizations();
            if (!result.success)
                return result;
            result = yield this.dal.deleteTestUsers();
            return result;
        });
    }
    auth(schemaName, authUserId, authUserName) {
        return __awaiter(this, void 0, void 0, function* () {
            const randomNumber = Math.floor(Math.random() * 10000);
            return {
                success: true,
                payload: {
                    "x-hasura-allowed-roles": [
                        `RANDOM_ROLE_${randomNumber}`,
                        "tr40320",
                        "tr40321",
                    ],
                    "x-hasura-default-role": "tr40321",
                    "x-hasura-user-id": authUserId,
                },
            };
        });
    }
    organizations(userId, userEmail, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.organizations(userId, userEmail, organizationId);
        });
    }
    organizationsByUserId(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.organizations(userId);
        });
    }
    organizationsByUserEmail(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.organizations(undefined, userEmail);
        });
    }
    organizationAccess(userId, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const orgsResult = yield this.dal.organizations(userId, undefined, organizationId);
            if (orgsResult.success)
                orgsResult.payload = orgsResult.payload[0];
            return orgsResult;
        });
    }
    organizationsByIds(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.organizationsByIdsOrNames(ids);
        });
    }
    organizationById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationsByIds([id]);
            if (result.success)
                result.payload = result.payload[0];
            return result;
        });
    }
    organizationsByNames(names) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.organizationsByIdsOrNames(undefined, names);
        });
    }
    organizationByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationsByNames([name]);
            if (result.success)
                result.payload = result.payload[0];
            return result;
        });
    }
    organizationUsers(name, roles) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationByName(name);
            if (!result.success)
                return result;
            if (!result.payload) {
                return {
                    success: false,
                    message: `Organization with name '${name}' could not be found`,
                    code: "WB_ORGANIZATION_NOT_FOUND",
                    apolloError: "BAD_USER_INPUT",
                };
            }
            if (roles && !entity_1.Role.areRoles(roles)) {
                return {
                    success: false,
                    message: "organizationUsers: roles contains one or more unrecognized strings",
                };
            }
            return this.dal.organizationUsers(name, roles);
        });
    }
    createOrganization(currentUserEmail, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const checkNameResult = yield this.organizationByName(name);
            if (!checkNameResult.success)
                return checkNameResult;
            if (checkNameResult.payload) {
                return {
                    success: false,
                    message: `This organization name has already been taken.`,
                    code: "WB_ORGANIZATION_NAME_TAKEN",
                    apolloError: "BAD_USER_INPUT",
                };
            }
            const createOrgResult = yield this.dal.createOrganization(name, label);
            if (!createOrgResult.success)
                return createOrgResult;
            const result = yield this.setOrganizationUserRole(name, currentUserEmail, "organization_administrator");
            if (!result.success)
                return result;
            return createOrgResult;
        });
    }
    updateOrganization(name, newName, newLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.updateOrganization(name, newName, newLabel);
        });
    }
    deleteOrganization(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationUsers(name, [
                "organization_user",
                "organization_external_user",
            ]);
            if (!result.success)
                return result;
            if (result.payload.length > 0) {
                return {
                    success: false,
                    message: `Remove all non-administrative users from Organization before deleting.`,
                    code: "WB_ORGANIZATION_NOT_EMPTY",
                    apolloError: "BAD_USER_INPUT",
                };
            }
            return this.dal.deleteOrganization(name);
        });
    }
    deleteTestOrganizations() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.deleteTestOrganizations();
        });
    }
    setOrganizationUserRole(organizationName, userEmail, role) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.setOrganizationUsersRole(organizationName, [userEmail], role);
        });
    }
    setOrganizationUsersRole(organizationName, userEmails, role) {
        return __awaiter(this, void 0, void 0, function* () {
            const usersResult = yield this.usersByEmails(userEmails);
            if (!usersResult.success)
                return usersResult;
            if (usersResult.payload.length != userEmails) {
                return {
                    success: false,
                    message: `setOrganizationUsersRole: ${userEmails.length - usersResult.payload.length} missing user(s)`,
                };
            }
            const organizationResult = yield this.organizationByName(organizationName);
            if (!organizationResult.success)
                return organizationResult;
            const roleResult = yield this.dal.roleByName(role);
            if (!roleResult.success)
                return roleResult;
            const result = yield this.dal.setOrganizationUsersRole(organizationResult.payload.id, usersResult.payload, roleResult.payload.id);
            return result;
        });
    }
    removeUsersFromOrganization(userEmails, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            const usersResult = yield this.usersByEmails(userEmails);
            if (!usersResult.success)
                return usersResult;
            const userIds = usersResult.payload.map((user) => user.id);
            const adminsResult = yield this.organizationUsers(organizationName, [
                "organization_administrator",
            ]);
            if (!adminsResult.success)
                return adminsResult;
            const allAdminIds = adminsResult.payload.map((user) => user.id);
            if (allAdminIds.every((elem) => userIds.includes(elem))) {
                return {
                    success: false,
                    message: `You can not remove all Administrators from an Organization - you must leave at least one.`,
                    code: "WB_ORGANIZATION_NO_ADMINS",
                    apolloError: "BAD_USER_INPUT",
                };
            }
            const organizationResult = yield this.organizationByName(organizationName);
            if (!organizationResult.success)
                return organizationResult;
            const result = yield this.dal.removeUsersFromOrganization(usersResult.payload, organizationResult.payload.id);
            return result;
        });
    }
    usersByOrganizationId(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.usersByOrganizationId(organizationId);
        });
    }
    usersByIds(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.usersByIdsOrEmails(ids);
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.usersByIds([id]);
            if (result.success)
                result.payload = result.payload[0];
            return result;
        });
    }
    usersByEmails(userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.usersByIdsOrEmails(undefined, userEmails);
        });
    }
    userByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.usersByEmails([email]);
            if (result.success)
                result.payload = result.payload[0];
            return result;
        });
    }
    createUser(email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.createUser(email, firstName, lastName);
        });
    }
    updateUser(id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.updateUser(id, email, firstName, lastName);
        });
    }
    roleByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.roleByName(name);
        });
    }
    createSchema(uid, name, label, organizationOwnerId, organizationOwnerName, userOwnerId, userOwnerEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            if (name.startsWith("pg_") || entity_1.Schema.SYS_SCHEMA_NAMES.includes(name)) {
                return {
                    success: false,
                    message: `Database name can not begin with 'pg_' or be in the reserved list: ${entity_1.Schema.SYS_SCHEMA_NAMES.join(", ")}`,
                    code: "WB_SCHEMA_NAME",
                    apolloError: "BAD_USER_INPUT",
                };
            }
            let result = WhitebrickCloud.RESULT_DEFAULT;
            if (!organizationOwnerId && !userOwnerId) {
                if (organizationOwnerName) {
                    let result = yield this.organizationByName(organizationOwnerName);
                    if (!result.success)
                        return result;
                    organizationOwnerId = result.payload.id;
                }
                else if (userOwnerEmail) {
                    result = yield this.userByEmail(userOwnerEmail);
                    if (!result.success)
                        return result;
                    userOwnerId = result.payload.id;
                }
                else {
                    return {
                        success: false,
                        message: "createSchema: Owner could not be found",
                    };
                }
            }
            let userOrgRole = undefined;
            if (!entity_1.User.isAdmin(uid)) {
                if (organizationOwnerId) {
                    const orgResult = yield this.organizationAccess(uid, organizationOwnerId);
                    if (!orgResult.success)
                        return orgResult;
                    userOrgRole = orgResult.payload;
                    if (!userOrgRole) {
                        return {
                            success: false,
                            message: `createSchema: User ${uid} must be in Organization ${organizationOwnerId}`,
                        };
                    }
                }
                else if (userOwnerId) {
                    if (uid != userOwnerId) {
                        return {
                            success: false,
                            message: `createSchema: The current user ${uid} does not match the userOwnerId ${userOwnerId}`,
                        };
                    }
                }
            }
            const schemaResult = yield this.dal.createSchema(name, label, organizationOwnerId, userOwnerId);
            if (!schemaResult.success)
                return schemaResult;
            if (!entity_1.User.isAdmin(uid) &&
                organizationOwnerId &&
                userOrgRole &&
                userOrgRole.userRole != "organiation_admin") {
                result = yield this.setRole(uid, "schema_administrator", "schema", schemaResult.payload.id);
                if (!result.success)
                    return result;
            }
            return schemaResult;
        });
    }
    setRole(userId, roleName, roleLevel, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.setRole(userId, roleName, roleLevel, objectId);
        });
    }
    removeOrDeleteSchema(schemaName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.discoverTables(schemaName);
            if (!result.success)
                return result;
            for (const tableName of result.payload) {
                result = yield this.removeOrDeleteTable(schemaName, tableName, del);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeAllUsersFromSchema(schemaName);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteSchema(schemaName, del);
        });
    }
    schemasByUserOwner(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByUserOwner(userEmail);
        });
    }
    schemasByOrgOwnerAdmin(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByOrgOwnerAdmin(userEmail);
        });
    }
    addUserToSchema(schemaName, userEmail, schemaRole) {
        return __awaiter(this, void 0, void 0, function* () {
            const userResult = yield this.userByEmail(userEmail);
            if (!userResult.success)
                return userResult;
            const schemaResult = yield this.dal.schemaByName(schemaName);
            if (!schemaResult.success)
                return schemaResult;
            const roleResult = yield this.dal.roleByName(schemaRole);
            if (!roleResult.success)
                return roleResult;
            const result = yield this.dal.addUserToSchema(schemaResult.payload.id, userResult.payload.id, roleResult.payload.id);
            if (!result.success)
                return result;
            return userResult;
        });
    }
    accessibleSchemas(userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const schemaOwnerResult = yield this.schemasByUserOwner(userEmail);
            if (!schemaOwnerResult.success)
                return schemaOwnerResult;
            const schemaOrgAdminResult = yield this.schemasByOrgOwnerAdmin(userEmail);
            if (!schemaOrgAdminResult.success)
                return schemaOrgAdminResult;
            const userRolesResult = yield this.dal.schemasByUser(userEmail);
            if (!userRolesResult.success)
                return userRolesResult;
            const schemas = [];
            const schemaIds = [];
            for (const schema of schemaOwnerResult.payload.concat(schemaOrgAdminResult.payload, userRolesResult.payload)) {
                if (!schemaIds.includes(schema.id)) {
                    schemas.push(schema);
                    schemaIds.push(schema.id);
                }
            }
            return {
                success: true,
                payload: schemas,
            };
        });
    }
    tables(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.tables(schemaName);
            if (!result.success)
                return result;
            for (const table of result.payload) {
                const columnsResult = yield this.columns(schemaName, table.name);
                if (!columnsResult.success)
                    return columnsResult;
                table.columns = columnsResult.payload;
            }
            return result;
        });
    }
    columns(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.primaryKeys(schemaName, tableName);
            if (!result.success)
                return result;
            const pKColsConstraints = result.payload;
            const pKColumnNames = Object.keys(pKColsConstraints);
            result = yield this.dal.columns(schemaName, tableName);
            if (!result.success)
                return result;
            for (const column of result.payload) {
                column.isPrimaryKey = pKColumnNames.includes(column.name);
                const foreignKeysResult = yield this.dal.foreignKeysOrReferences(schemaName, tableName, column.name, "FOREIGN_KEYS");
                if (!foreignKeysResult.success)
                    return result;
                column.foreignKeys = foreignKeysResult.payload;
                const referencesResult = yield this.dal.foreignKeysOrReferences(schemaName, tableName, column.name, "REFERENCES");
                if (!referencesResult.success)
                    return result;
                column.referencedBy = referencesResult.payload;
            }
            return result;
        });
    }
    addOrCreateTable(schemaName, tableName, tableLabel, create) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!create)
                create = false;
            let result = yield this.dal.addOrCreateTable(schemaName, tableName, tableLabel, create);
            if (!result.success)
                return result;
            return yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
        });
    }
    removeOrDeleteTable(schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!del)
                del = false;
            let result = yield hasura_api_1.hasuraApi.untrackTable(schemaName, tableName);
            if (!result.success)
                return result;
            result = yield this.dal.columns(schemaName, tableName);
            if (!result.success)
                return result;
            const columns = result.payload;
            for (const column of columns) {
                result = yield this.removeOrDeleteColumn(schemaName, tableName, column.name, del);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeTableUsers(schemaName, tableName);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteTable(schemaName, tableName, del);
        });
    }
    removeOrDeleteColumn(schemaName, tableName, columnName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!del)
                del = false;
            return yield this.dal.removeOrDeleteColumn(schemaName, tableName, columnName, del);
        });
    }
    updateTable(schemaName, tableName, newTableName, newTableLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            if (newTableName) {
                result = yield this.tables(schemaName);
                if (!result.success)
                    return result;
                const existingTableNames = result.payload.map((table) => table.name);
                if (existingTableNames.includes(newTableName)) {
                    return {
                        success: false,
                        message: "The new table name must be unique",
                        code: "WB_TABLE_NAME_EXISTS",
                        apolloError: "BAD_USER_INPUT",
                    };
                }
                result = yield hasura_api_1.hasuraApi.untrackTable(schemaName, tableName);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateTable(schemaName, tableName, newTableName, newTableLabel);
            if (!result.success)
                return result;
            if (newTableName) {
                result = yield hasura_api_1.hasuraApi.trackTable(schemaName, newTableName);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    addAllExistingTables(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.discoverTables(schemaName);
            if (!result.success)
                return result;
            const tableNames = result.payload;
            for (const tableName of tableNames) {
                result = yield this.addOrCreateTable(schemaName, tableName, v.titleCase(tableName.replaceAll("_", " ")), false);
                if (!result.success)
                    return result;
                result = yield this.dal.discoverColumns(schemaName, tableName);
                if (!result.success)
                    return result;
                const columns = result.payload;
                for (const column of columns) {
                    result = yield this.addOrCreateColumn(schemaName, tableName, column.name, v.titleCase(column.name.replaceAll("_", " ")), false);
                    if (!result.success)
                        return result;
                }
            }
            return result;
        });
    }
    addAllExistingRelationships(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.foreignKeysOrReferences(schemaName, "%", "%", "ALL");
            if (!result.success)
                return result;
            const relationships = result.payload;
            if (relationships.length > 0) {
                for (const relationship of relationships) {
                    if (relationship.relTableName && relationship.relColumnName) {
                        this.addOrCreateForeignKey(schemaName, relationship.tableName, [relationship.columnName], relationship.relTableName, [relationship.relColumnName]);
                    }
                    else {
                        return {
                            success: false,
                            message: "addAllExistingRelationships: ConstraintId must have relTableName and relColumnName",
                        };
                    }
                }
            }
            return result;
        });
    }
    addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!create)
                create = false;
            let result = yield this.dal.addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType);
            if (!result.success)
                return result;
            if (create) {
                result = yield hasura_api_1.hasuraApi.untrackTable(schemaName, tableName);
                if (!result.success)
                    return result;
                result = yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
            }
            return result;
        });
    }
    updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            if (newColumnName) {
                result = yield this.columns(schemaName, tableName);
                if (!result.success)
                    return result;
                const existingColumnNames = result.payload.map((table) => table.name);
                if (existingColumnNames.includes(newColumnName)) {
                    return {
                        success: false,
                        message: "The new column name must be unique",
                        code: "WB_COLUMN_NAME_EXISTS",
                        apolloError: "BAD_USER_INPUT",
                    };
                }
            }
            if (newColumnName || newType) {
                result = yield hasura_api_1.hasuraApi.untrackTable(schemaName, tableName);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType);
            if (!result.success)
                return result;
            if (newColumnName || newType) {
                result = yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    createOrDeletePrimaryKey(schemaName, tableName, columnNames, del) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!del)
                del = false;
            let result = yield this.dal.primaryKeys(schemaName, tableName);
            if (!result.success)
                return result;
            const existingConstraintNames = Object.values(result.payload);
            if (del) {
                if (existingConstraintNames.length > 0) {
                    result = yield this.dal.deleteConstraint(schemaName, tableName, existingConstraintNames[0]);
                }
            }
            else {
                if (existingConstraintNames.length > 0) {
                    return {
                        success: false,
                        message: "Remove existing primary key first",
                        code: "WB_PK_EXISTS",
                        apolloError: "BAD_USER_INPUT",
                    };
                }
                result = yield hasura_api_1.hasuraApi.untrackTable(schemaName, tableName);
                if (!result.success)
                    return result;
                result = yield this.dal.createPrimaryKey(schemaName, tableName, columnNames);
                if (!result.success)
                    return result;
                result = yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
            }
            return result;
        });
    }
    addOrCreateForeignKey(schemaName, tableName, columnNames, parentTableName, parentColumnNames, create) {
        return __awaiter(this, void 0, void 0, function* () {
            let operation = "CREATE";
            if (!create)
                operation = "ADD";
            return yield this.setForeignKey(schemaName, tableName, columnNames, parentTableName, parentColumnNames, operation);
        });
    }
    removeOrDeleteForeignKey(schemaName, tableName, columnNames, parentTableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            let operation = "DELETE";
            if (!del)
                operation = "REMOVE";
            return yield this.setForeignKey(schemaName, tableName, columnNames, parentTableName, [], operation);
        });
    }
    setForeignKey(schemaName, tableName, columnNames, parentTableName, parentColumnNames, operation) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.foreignKeysOrReferences(schemaName, tableName, columnNames[0], "FOREIGN_KEYS");
            if (!result.success)
                return result;
            const existingForeignKeys = {};
            for (const constraintId of result.payload) {
                existingForeignKeys[constraintId.columnName] =
                    constraintId.constraintName;
            }
            for (const columnName of columnNames) {
                if (Object.keys(existingForeignKeys).includes(columnName)) {
                    if (operation == "REMOVE" || operation == "DELETE") {
                        result = yield hasura_api_1.hasuraApi.dropRelationships(schemaName, tableName, parentTableName);
                        if (result.success && operation == "DELETE") {
                            result = yield this.dal.deleteConstraint(schemaName, tableName, existingForeignKeys[columnName]);
                        }
                        return result;
                    }
                    else {
                        return {
                            success: false,
                            message: `Remove existing foreign key on ${columnName} first`,
                            code: "WB_FK_EXISTS",
                            apolloError: "BAD_USER_INPUT",
                        };
                    }
                }
            }
            if (operation == "ADD" || operation == "CREATE") {
                if (operation == "CREATE") {
                    result = yield this.dal.createForeignKey(schemaName, tableName, columnNames, parentTableName, parentColumnNames);
                    if (!result.success)
                        return result;
                }
                result = yield hasura_api_1.hasuraApi.createObjectRelationship(schemaName, tableName, columnNames[0], parentTableName);
                if (!result.success)
                    return result;
                result = yield hasura_api_1.hasuraApi.createArrayRelationship(schemaName, parentTableName, tableName, columnNames);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    tableUser(userEmail, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.tableUser(userEmail, schemaName, tableName);
        });
    }
    saveTableUserSettings(schemaName, tableName, userEmail, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const tableResult = yield this.dal.tableBySchemaTable(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const userResult = yield this.userByEmail(userEmail);
            if (!userResult.success)
                return userResult;
            return this.dal.saveTableUserSettings(tableResult.payload.id, userResult.payload.id, settings);
        });
    }
}
WhitebrickCloud.RESULT_DEFAULT = {
    success: false,
    message: "RESULT_DEFAULT: result has not been assigned",
};


/***/ }),

/***/ "apollo-server-lambda":
/*!***************************************!*\
  !*** external "apollo-server-lambda" ***!
  \***************************************/
/***/ ((module) => {

module.exports = require("apollo-server-lambda");;

/***/ }),

/***/ "axios":
/*!************************!*\
  !*** external "axios" ***!
  \************************/
/***/ ((module) => {

module.exports = require("axios");;

/***/ }),

/***/ "graphql-constraint-directive":
/*!***********************************************!*\
  !*** external "graphql-constraint-directive" ***!
  \***********************************************/
/***/ ((module) => {

module.exports = require("graphql-constraint-directive");;

/***/ }),

/***/ "graphql-tools":
/*!********************************!*\
  !*** external "graphql-tools" ***!
  \********************************/
/***/ ((module) => {

module.exports = require("graphql-tools");;

/***/ }),

/***/ "graphql-type-json":
/*!************************************!*\
  !*** external "graphql-type-json" ***!
  \************************************/
/***/ ((module) => {

module.exports = require("graphql-type-json");;

/***/ }),

/***/ "lodash":
/*!*************************!*\
  !*** external "lodash" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("lodash");;

/***/ }),

/***/ "pg":
/*!*********************!*\
  !*** external "pg" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("pg");;

/***/ }),

/***/ "tslog":
/*!************************!*\
  !*** external "tslog" ***!
  \************************/
/***/ ((module) => {

module.exports = require("tslog");;

/***/ }),

/***/ "voca":
/*!***********************!*\
  !*** external "voca" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("voca");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/whitebrick-cloud.ts");
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1JvbGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1RhYmxlLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1RhYmxlVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Vc2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW52aXJvbm1lbnQudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9oYXN1cmEtYXBpLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvaW5kZXgudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy9vcmdhbml6YXRpb24udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy9zY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy90YWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL3VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy93aGl0ZWJyaWNrLWNsb3VkLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJheGlvc1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdG9vbHNcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC10eXBlLWpzb25cIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwibG9kYXNoXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInBnXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInRzbG9nXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInZvY2FcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIE9yZ2FuaXphdGlvbixcbiAgVXNlcixcbiAgUm9sZSxcbiAgU2NoZW1hLFxuICBUYWJsZSxcbiAgQ29sdW1uLFxuICBUYWJsZVVzZXIsXG4gIFJvbGVMZXZlbCxcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIHVzZWQgZm9yIERETCBpZGVudGlmaWVycyAoZWcgQ1JFQVRFIFRBQkxFIHNhbml0aXplKHRhYmxlTmFtZSkpXG4gIHB1YmxpYyBzdGF0aWMgc2FuaXRpemUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvW15cXHclXSsvZywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBxdWVyeVBhcmFtcy5wYXJhbXNcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XG4gICAgICBsb2cuZXJyb3IoSlNPTi5zdHJpbmdpZnkoZXJyb3IpKTtcbiAgICAgIHJlc3VsdHMucHVzaCg8U2VydmljZVJlc3VsdD57XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICBjb2RlOiBcIlBHX1wiICsgZXJyb3IuY29kZSxcbiAgICAgIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBPcmdhbml6YXRpb25zXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW107XG4gICAgbGV0IHF1ZXJ5OiBzdHJpbmcgPSBgXG4gICAgICBTRUxFQ1Qgd2Iub3JnYW5pemF0aW9ucy4qXG4gICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbnNcbiAgICAgIFdIRVJFIHRydWVcbiAgICBgO1xuICAgIGlmICh1c2VySWQgfHwgdXNlckVtYWlsKSB7XG4gICAgICBxdWVyeSA9IGBcbiAgICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKiwgd2Iucm9sZXMubmFtZSBhcyB1c2VyX3JvbGVcbiAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9uX3VzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICBgO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBxdWVyeSArPSBgXG4gICAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9JDFcbiAgICAgICAgYDtcbiAgICAgICAgcGFyYW1zLnB1c2godXNlcklkKTtcbiAgICAgIH0gZWxzZSBpZiAodXNlckVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgV0hFUkUgdXNlcnMuZW1haWw9JDFcbiAgICAgICAgYDtcbiAgICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlsKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9yZ2FuaXphdGlvbklkKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIEFORCB3Yi5vcmdhbml6YXRpb25zLmlkPSQke3BhcmFtcy5sZW5ndGggKyAxfVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uc0J5SWRzT3JOYW1lcyhcbiAgICBpZHM/OiBudW1iZXJbXSxcbiAgICBuYW1lcz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBjb2x1bW4gPSBcImlkXCI7XG4gICAgbGV0IHBhcmFtczogYW55W10gPSBbaWRzXTtcbiAgICBpZiAobmFtZXMpIHtcbiAgICAgIGNvbHVtbiA9IFwibmFtZVwiO1xuICAgICAgcGFyYW1zID0gW25hbWVzXTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKlxuICAgICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbnNcbiAgICAgICAgV0hFUkUgJHtjb2x1bW59PUFOWSgkMSlcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25Vc2VycyhcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcm9sZXM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBTRUxFQ1Qgd2IudXNlcnMuKiwgd2Iucm9sZXMubmFtZSBhcyByb2xlXG4gICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi51c2Vycy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZFxuICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxXG4gICAgYDtcbiAgICBpZiAocm9sZXMpIHF1ZXJ5ICs9IGBBTkQgd2Iucm9sZXMubmFtZSBJTiAoJyR7cm9sZXMuam9pbihcIicsJ1wiKX0nKWA7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBbbmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLm9yZ2FuaXphdGlvbnMoXG4gICAgICAgICAgbmFtZSwgbGFiZWxcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyKVxuICAgICAgICBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IHN0cmluZylbXSA9IFtuZXcgRGF0ZSgpXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi5vcmdhbml6YXRpb25zIFNFVCB1cGRhdGVkX2F0PSQxXCI7XG4gICAgaWYgKG5ld05hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld05hbWUpO1xuICAgICAgcXVlcnkgKz0gYCwgbmFtZT0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmIChuZXdMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TGFiZWwpO1xuICAgICAgcXVlcnkgKz0gYCwgbGFiZWw9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICBxdWVyeSArPSBgIFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9IFJFVFVSTklORyAqYDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVPcmdhbml6YXRpb24obmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy8gbm8gcGF0dGVybnMgYWxsb3dlZCBoZXJlXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGVsZXRlT3JnYW5pemF0aW9ucyhuYW1lLnJlcGxhY2UoXCIlXCIsIFwiXCIpKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKFwidGVzdF8lXCIpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbnMoXG4gICAgbmFtZVBhdHRlcm46IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX2lkIElOIChcbiAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLm9yZ2FuaXphdGlvbnMgV0hFUkUgbmFtZSBsaWtlICQxXG4gICAgICAgICAgKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLm9yZ2FuaXphdGlvbnMgV0hFUkUgbmFtZSBsaWtlICQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBPcmdhbml6YXRpb24tVXNlci1Sb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXIsXG4gICAgdXNlcnM6IFVzZXJbXSxcbiAgICByb2xlSWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cud2FybihgKysrKysrKysrKysrKysrKysrKysrKyR7b3JnYW5pemF0aW9uSWR9ICR7dXNlcnN9ICR7cm9sZUlkfWApO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgZm9yIChjb25zdCB1c2VyIG9mIHVzZXJzKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2Iub3JnYW5pemF0aW9uX3VzZXJzKFxuICAgICAgICAgIG9yZ2FuaXphdGlvbl9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgdXBkYXRlZF9hdFxuICAgICAgICApIFZBTFVFUygkMSwgJDIsICQzLCAkNClcbiAgICAgICAgT04gQ09ORkxJQ1QgKG9yZ2FuaXphdGlvbl9pZCwgdXNlcl9pZClcbiAgICAgICAgRE8gVVBEQVRFIFNFVCByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbb3JnYW5pemF0aW9uSWQsIHVzZXIuaWQsIHJvbGVJZCwgbmV3IERhdGUoKV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgIHVzZXJzOiBVc2VyW10sXG4gICAgb3JnYW5pemF0aW9uSWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgdXNlciBvZiB1c2Vycykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgICAgV0hFUkUgdXNlcl9pZD0kMSBBTkQgb3JnYW5pemF0aW9uX2lkPSQyXG4gICAgICBgLFxuICAgICAgICBwYXJhbXM6IFt1c2VyLmlkLCBvcmdhbml6YXRpb25JZF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogVXNlcnNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlPcmdhbml6YXRpb25JZChcbiAgICBvcmdhbml6YXRpb25JZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICAgIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX2lkPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbb3JnYW5pemF0aW9uSWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlJZHNPckVtYWlscyhcbiAgICBpZHM/OiBudW1iZXJbXSxcbiAgICBlbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgY29sdW1uID0gXCJpZFwiO1xuICAgIGxldCBwYXJhbXM6IGFueVtdID0gW2lkc107XG4gICAgaWYgKGVtYWlscykge1xuICAgICAgY29sdW1uID0gXCJlbWFpbFwiO1xuICAgICAgcGFyYW1zID0gW2VtYWlsc107XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICAgIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgJHtjb2x1bW59PUFOWSgkMSlcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMpIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbD86IHN0cmluZyxcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmcsXG4gICAgbGFzdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFlbWFpbCAmJiAhZmlyc3ROYW1lICYmICFsYXN0TmFtZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IFwiZGFsLnVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIGxldCBwYXJhbUNvdW50ID0gMztcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBwYXJhbXM6IChEYXRlIHwgbnVtYmVyIHwgc3RyaW5nKVtdID0gW2RhdGUsIGlkXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi51c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsKSB7XG4gICAgICBxdWVyeSArPSBgZW1haWw9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbCk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChmaXJzdE5hbWUpIHtcbiAgICAgIHF1ZXJ5ICs9IGBmaXJzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZmlyc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgaWYgKGxhc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgbGFzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2gobGFzdE5hbWUpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBxdWVyeSArPSBcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgZW1haWwgbGlrZSAndGVzdF8ldGVzdC53aGl0ZWJyaWNrLmNvbSdcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRSb2xlKFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIVJvbGUuaXNSb2xlKHJvbGVOYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGAke3JvbGVOYW1lfSBpcyBub3QgYSB2YWxpZCBSb2xlYCxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUocm9sZU5hbWUpO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBsZXQgd2JUYWJsZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgd2JDb2x1bW46IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwib3JnYW5pemF0aW9uX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iuc2NoZW1hX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJzY2hlbWFfaWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnRhYmxlX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJ0YWJsZV9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgcXVlcnk6IHN0cmluZyA9IGBcbiAgICAgIElOU0VSVCBJTlRPICR7d2JUYWJsZX0gKHJvbGVfaWQsICB1c2VyX2lkLCAke3diQ29sdW1ufSwgdXBkYXRlZF9hdClcbiAgICAgIFZBTFVFUyAoJHtyb2xlUmVzdWx0LnBheWxvYWQuaWR9LCAke3VzZXJJZH0sICR7b2JqZWN0SWR9LCAkMSlcbiAgICAgIE9OIENPTkZMSUNUICh1c2VyX2lkLCAke3diQ29sdW1ufSlcbiAgICAgIERPIFVQREFURSBTRVQgcm9sZV9pZD1FWENMVURFRC5yb2xlX2lkLCB1cGRhdGVkX2F0PUVYQ0xVREVELnVwZGF0ZWRfYXRcbiAgICBgO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IFtuZXcgRGF0ZSgpXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyUm9sZXNGb3JTY2hlbWEoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYV91c2VycyBPTiB3Yi5yb2xlcy5pZD13Yi5zY2hlbWFfdXNlcnMucm9sZV9pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPSQxIEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0kMlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYUlkLCB1c2VySWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgdGFibGVVc2VyUm9sZXMgPSBSb2xlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuKlxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnJvbGVzLmlkPXdiLnNjaGVtYV91c2Vycy5yb2xlX2lkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9JDEgQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hSWQsIHVzZXJJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBzY2hlbWFVc2VyUm9sZXMgPSBSb2xlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVtYXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZyxcbiAgICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyLFxuICAgIHVzZXJPd25lcklkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgU0NIRU1BICR7REFMLnNhbml0aXplKG5hbWUpfWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnNjaGVtYXMoXG4gICAgICAgICAgICBuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uX293bmVyX2lkLCB1c2VyX293bmVyX2lkXG4gICAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQpIFJFVFVSTklORyAqXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25Pd25lcklkLCB1c2VyT3duZXJJZF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF0pO1xuICAgIGNvbnN0IGluc2VydFJlc3VsdDogU2VydmljZVJlc3VsdCA9IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgICBpZiAoaW5zZXJ0UmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGluc2VydFJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KGluc2VydFJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIGluc2VydFJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzKHNjaGVtYU5hbWVQYXR0ZXJuPzogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFzY2hlbWFOYW1lUGF0dGVybikgc2NoZW1hTmFtZVBhdHRlcm4gPSBcIiVcIjtcbiAgICBzY2hlbWFOYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIFNFTEVDVCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGEuKlxuICAgICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXG4gICAgICAgICAgV0hFUkUgc2NoZW1hX25hbWUgTElLRSAkMVxuICAgICAgICAgIEFORCBzY2hlbWFfbmFtZSBOT1QgTElLRSAncGdfJSdcbiAgICAgICAgICBBTkQgc2NoZW1hX25hbWUgTk9UIElOICgnJHtTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5qb2luKFwiJywnXCIpfScpXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWUgTElLRSAkMVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lUGF0dGVybl0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF0pO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MgJiYgcmVzdWx0c1sxXS5zdWNjZXNzKSB7XG4gICAgICByZXN1bHRzWzBdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKTtcbiAgICAgIHJlc3VsdHNbMV0ucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHRzWzFdLnBheWxvYWQpO1xuICAgICAgaWYgKHJlc3VsdHNbMF0ucGF5bG9hZC5sZW5ndGggIT0gcmVzdWx0c1sxXS5wYXlsb2FkLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBcImRhbC5zY2hlbWFzOiB3Yi5zY2hlbWFzIG91dCBvZiBzeW5jIHdpdGggaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbbmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuICg8U2VydmljZVJlc3VsdD57XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogYGRhbC5zY2hlbWFCeU5hbWU6IENvdWxkIG5vdCBmaW5kIHNjaGVtYSB3aGVyZSBuYW1lPSR7bmFtZX1gLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iuc2NoZW1hcy4qIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3VzZXJFbWFpbF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAvLyBUQkQ6IG1hcCB0aGlzIGluc3RlYWRcbiAgICAgIGNvbnN0IHNjaGVtYXNXaXRoUm9sZSA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCkpIHtcbiAgICAgICAgc2NoZW1hLnVzZXJSb2xlID0gXCJzY2hlbWFfb3duZXJcIjtcbiAgICAgICAgc2NoZW1hc1dpdGhSb2xlLnB1c2goc2NoZW1hKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gc2NoZW1hc1dpdGhSb2xlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ093bmVyQWRtaW4oXG4gICAgdXNlckVtYWlsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKiwgd2Iucm9sZXMubmFtZSBhcyB1c2VyX3JvbGVcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9uX3VzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iucm9sZXMubmFtZT0nb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3InIEFORCB3Yi51c2Vycy5lbWFpbD0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3VzZXJFbWFpbF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgZGVsOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgV0hFUkUgbmFtZT0kMVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYERST1AgU0NIRU1BIElGIEVYSVNUUyAke0RBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKX0gQ0FTQ0FERWAsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTY2hlbWEtVXNlci1Sb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYWRkVXNlclRvU2NoZW1hKFxuICAgIHNjaGVtYUlkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgc2NoZW1hUm9sZUlkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hX3VzZXJzKFxuICAgICAgICAgIHNjaGVtYV9pZCwgdXNlcl9pZCwgcm9sZV9pZFxuICAgICAgICApIFZBTFVFUygkMSwgJDIsICQzKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYUlkLCB1c2VySWQsIHNjaGVtYVJvbGVJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVVc2VyRnJvbVNjaGVtYShcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNjaGVtYVJvbGVJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMSBBTkQgdXNlcl9pZD0kMlxuICAgIGA7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgdW5kZWZpbmVkKVtdID0gW3NjaGVtYUlkLCB1c2VySWRdO1xuICAgIGlmIChzY2hlbWFSb2xlSWQpIHF1ZXJ5ICs9IFwiIEFORCByb2xlX2lkPSQzXCI7XG4gICAgcGFyYW1zLnB1c2goc2NoZW1hUm9sZUlkKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXIodXNlckVtYWlsOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iuc2NoZW1hcy4qLCB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iuc2NoZW1hcy5pZD13Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3VzZXJFbWFpbF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAvLyBUQkQ6IG1hcCB0aGlzIGluc3RlYWRcbiAgICAgIGNvbnN0IHNjaGVtYXNXaXRoUm9sZSA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICAgIGxldCBzY2hlbWE6IFNjaGVtYTtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgICAgc2NoZW1hID0gU2NoZW1hLnBhcnNlKHJvdyk7XG4gICAgICAgIHNjaGVtYS51c2VyUm9sZSA9IHJvdy5yb2xlX25hbWU7XG4gICAgICAgIHNjaGVtYXNXaXRoUm9sZS5wdXNoKHNjaGVtYSk7XG4gICAgICB9KTtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gc2NoZW1hc1dpdGhSb2xlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVzKHNjaGVtYU5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKlxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaXNjb3ZlclRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcy50YWJsZV9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlc1xuICAgICAgICBXSEVSRSB0YWJsZV9zY2hlbWE9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93cy5tYXAoXG4gICAgICAgIChyb3c6IHsgdGFibGVfbmFtZTogc3RyaW5nIH0pID0+IHJvdy50YWJsZV9uYW1lXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbkJ5U2NoZW1hVGFibGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLmNvbHVtbnMuKiwgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuZGF0YV90eXBlIGFzIHR5cGVcbiAgICAgIEZST00gd2IuY29sdW1uc1xuICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IuY29sdW1ucy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgT04gKFxuICAgICAgICB3Yi5jb2x1bW5zLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWVcbiAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9zY2hlbWFcbiAgICAgIClcbiAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX25hbWU9JDJcbiAgICBgO1xuICAgIGxldCBwYXJhbXM6IHN0cmluZ1tdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9IEFORCB3Yi5jb2x1bW5zLm5hbWU9JDMgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lPSQzYDtcbiAgICAgIHBhcmFtcy5wdXNoKGNvbHVtbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyQ29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gdHlwZSA9IGZvcmVpZ25LZXlzfHJlZmVyZW5jZXN8YWxsXG4gIHB1YmxpYyBhc3luYyBmb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lUGF0dGVybjogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWVQYXR0ZXJuKTtcbiAgICBjb2x1bW5OYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lUGF0dGVybik7XG4gICAgbGV0IHdoZXJlU3FsOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSBcIkZPUkVJR05fS0VZU1wiOlxuICAgICAgICB3aGVyZVNxbCA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiUkVGRVJFTkNFU1wiOlxuICAgICAgICB3aGVyZVNxbCA9IGBcbiAgICAgICAgICBBTkQgcmVmLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgcmVmLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJBTExcIjpcbiAgICAgICAgd2hlcmVTcWwgPSBgXG4gICAgICAgICAgQU5EIGZrLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgZmsuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgLS0gdW5pcXVlIHJlZmVyZW5jZSBpbmZvXG4gICAgICAgIHJlZi50YWJsZV9uYW1lICAgICAgIEFTIHJlZl90YWJsZSxcbiAgICAgICAgcmVmLmNvbHVtbl9uYW1lICAgICAgQVMgcmVmX2NvbHVtbixcbiAgICAgICAgcmVmZC5jb25zdHJhaW50X3R5cGUgQVMgcmVmX3R5cGUsIC0tIGUuZy4gVU5JUVVFIG9yIFBSSU1BUlkgS0VZXG4gICAgICAgIC0tIGZvcmVpZ24ga2V5IGluZm9cbiAgICAgICAgZmsudGFibGVfbmFtZSAgICAgICAgQVMgZmtfdGFibGUsXG4gICAgICAgIGZrLmNvbHVtbl9uYW1lICAgICAgIEFTIGZrX2NvbHVtbixcbiAgICAgICAgZmsuY29uc3RyYWludF9uYW1lICAgQVMgZmtfbmFtZSxcbiAgICAgICAgbWFwLnVwZGF0ZV9ydWxlICAgICAgQVMgZmtfb25fdXBkYXRlLFxuICAgICAgICBtYXAuZGVsZXRlX3J1bGUgICAgICBBUyBma19vbl9kZWxldGVcbiAgICAgICAgLS0gbGlzdHMgZmsgY29uc3RyYWludHMgQU5EIG1hcHMgdGhlbSB0byBwayBjb25zdHJhaW50c1xuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5yZWZlcmVudGlhbF9jb25zdHJhaW50cyBBUyBtYXBcbiAgICAgICAgLS0gam9pbiB1bmlxdWUgY29uc3RyYWludHMgKGUuZy4gUEtzIGNvbnN0cmFpbnRzKSB0byByZWYgY29sdW1ucyBpbmZvXG4gICAgICAgIElOTkVSIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmtleV9jb2x1bW5fdXNhZ2UgQVMgcmVmXG4gICAgICAgIE9OICByZWYuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZi5jb25zdHJhaW50X3NjaGVtYSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZi5jb25zdHJhaW50X25hbWUgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBvcHRpb25hbDogdG8gaW5jbHVkZSByZWZlcmVuY2UgY29uc3RyYWludCB0eXBlXG4gICAgICAgIExFRlQgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVfY29uc3RyYWludHMgQVMgcmVmZFxuICAgICAgICBPTiAgcmVmZC5jb25zdHJhaW50X2NhdGFsb2cgPSByZWYuY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCByZWZkLmNvbnN0cmFpbnRfc2NoZW1hID0gcmVmLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCByZWZkLmNvbnN0cmFpbnRfbmFtZSA9IHJlZi5jb25zdHJhaW50X25hbWVcbiAgICAgICAgLS0gam9pbiBmayBjb2x1bW5zIHRvIHRoZSBjb3JyZWN0IHJlZiBjb2x1bW5zIHVzaW5nIG9yZGluYWwgcG9zaXRpb25zXG4gICAgICAgIElOTkVSIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmtleV9jb2x1bW5fdXNhZ2UgQVMgZmtcbiAgICAgICAgT04gIGZrLmNvbnN0cmFpbnRfY2F0YWxvZyA9IG1hcC5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCBmay5jb25zdHJhaW50X25hbWUgPSBtYXAuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEFORCBmay5wb3NpdGlvbl9pbl91bmlxdWVfY29uc3RyYWludCA9IHJlZi5vcmRpbmFsX3Bvc2l0aW9uIC0tSU1QT1JUQU5UIVxuICAgICAgICBXSEVSRSByZWYudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgZmsudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICAke3doZXJlU3FsfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRzOiBDb25zdHJhaW50SWRbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnQ6IENvbnN0cmFpbnRJZCA9IHtcbiAgICAgICAgY29uc3RyYWludE5hbWU6IHJvdy5ma19uYW1lLFxuICAgICAgICB0YWJsZU5hbWU6IHJvdy5ma190YWJsZSxcbiAgICAgICAgY29sdW1uTmFtZTogcm93LmZrX2NvbHVtbixcbiAgICAgICAgcmVsVGFibGVOYW1lOiByb3cucmVmX3RhYmxlLFxuICAgICAgICByZWxDb2x1bW5OYW1lOiByb3cucmVmX2NvbHVtbixcbiAgICAgIH07XG4gICAgICBjb25zdHJhaW50cy5wdXNoKGNvbnN0cmFpbnQpO1xuICAgIH1cbiAgICByZXN1bHQucGF5bG9hZCA9IGNvbnN0cmFpbnRzO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcHJpbWFyeUtleXMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIERJU1RJTkNUIGMuY29sdW1uX25hbWUsIHRjLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyB0YyBcbiAgICAgICAgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEuY29uc3RyYWludF9jb2x1bW5fdXNhZ2UgQVMgY2N1XG4gICAgICAgIFVTSU5HIChjb25zdHJhaW50X3NjaGVtYSwgY29uc3RyYWludF9uYW1lKVxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIEFTIGNcbiAgICAgICAgT04gYy50YWJsZV9zY2hlbWEgPSB0Yy5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9IGMudGFibGVfbmFtZVxuICAgICAgICBBTkQgY2N1LmNvbHVtbl9uYW1lID0gYy5jb2x1bW5fbmFtZVxuICAgICAgICBXSEVSRSBjb25zdHJhaW50X3R5cGUgPSAnUFJJTUFSWSBLRVknXG4gICAgICAgIEFORCBjLnRhYmxlX3NjaGVtYT0nJHtzY2hlbWFOYW1lfSdcbiAgICAgICAgQU5EIHRjLnRhYmxlX25hbWUgPSAnJHt0YWJsZU5hbWV9J1xuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGNvbnN0IHBLQ29sc0NvbnN0cmFpbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucGF5bG9hZC5yb3dzKSB7XG4gICAgICAgIHBLQ29sc0NvbnN0cmFpbnRzW3Jvdy5jb2x1bW5fbmFtZV0gPSByb3cuY29uc3RyYWludF9uYW1lO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBwS0NvbHNDb25zdHJhaW50cztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVDb25zdHJhaW50KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb25zdHJhaW50TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3RyYWludE5hbWUgPSBEQUwuc2FuaXRpemUoY29uc3RyYWludE5hbWUpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIERST1AgQ09OU1RSQUlOVCBJRiBFWElTVFMgJHtjb25zdHJhaW50TmFtZX1cbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVQcmltYXJ5S2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgQUREIFBSSU1BUlkgS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSk7XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmNyZWF0ZUZvcmVpZ25LZXkoJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtwYXJlbnRUYWJsZU5hbWV9LCR7cGFyZW50Q29sdW1uTmFtZXN9KWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIHBhcmVudFRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZShwYXJlbnRUYWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZFBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgcGFyZW50Q29sdW1uTmFtZSBvZiBwYXJlbnRDb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUocGFyZW50Q29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgQ09OU1RSQUlOVCAke3RhYmxlTmFtZX1fJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiX1wiKX1fZmtleVxuICAgICAgICBGT1JFSUdOIEtFWSAoJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pXG4gICAgICAgIFJFRkVSRU5DRVMgJHtzY2hlbWFOYW1lfS4ke3BhcmVudFRhYmxlTmFtZX1cbiAgICAgICAgICAoJHtzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pXG4gICAgICAgIE9OIERFTEVURSBTRVQgTlVMTFxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRhYmxlQnlTY2hlbWFUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy4qXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlVGFibGUgJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHt0YWJsZUxhYmVsfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2IudGFibGVzKHNjaGVtYV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMylcbiAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCB0YWJsZU5hbWUsIHRhYmxlTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgQ1JFQVRFIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIoKWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVzXG4gICAgICAgICAgV0hFUkUgc2NoZW1hX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCB0YWJsZU5hbWVdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIiBDQVNDQURFYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBuZXdUYWJsZU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3VGFibGVMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi50YWJsZXMgU0VUXG4gICAgYDtcbiAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1RhYmxlTGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgVE8gJHtuZXdUYWJsZU5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbkxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlOiBib29sZWFuLFxuICAgIGNvbHVtblBHVHlwZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlQ29sdW1uICR7c2NoZW1hTmFtZX0gJHt0YWJsZU5hbWV9ICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5MYWJlbH0gJHtjb2x1bW5QR1R5cGV9ICR7Y3JlYXRlfWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi5jb2x1bW5zKHRhYmxlX2lkLCBuYW1lLCBsYWJlbClcbiAgICAgICAgICBWQUxVRVMgKCQxLCAkMiwgJDMpXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lLCBjb2x1bW5MYWJlbF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgQUREICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5QR1R5cGV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtdO1xuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld0NvbHVtbkxhYmVsKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5CeVNjaGVtYVRhYmxlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgICBVUERBVEUgd2IuY29sdW1ucyBTRVRcbiAgICAgIGA7XG4gICAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICAgIHBhcmFtcy5wdXNoKG5ld0NvbHVtbk5hbWUpO1xuICAgICAgICB1cGRhdGVzLnB1c2goXCJuYW1lPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgaWYgKG5ld0NvbHVtbkxhYmVsKSB7XG4gICAgICAgIHBhcmFtcy5wdXNoKG5ld0NvbHVtbkxhYmVsKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBpZiAobmV3VHlwZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgQUxURVIgQ09MVU1OICR7Y29sdW1uTmFtZX0gVFlQRSAke25ld1R5cGV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIFJFTkFNRSBDT0xVTU4gJHtjb2x1bW5OYW1lfSBUTyAke25ld0NvbHVtbk5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbHVtbk5hbWUgPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IuY29sdW1uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5OYW1lfSBDQVNDQURFXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZSBVc2Vyc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VyKFxuICAgIHVzZXJFbWFpbDogc3RyaW5nLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVfdXNlcnMuKlxuICAgICAgICBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMSBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyIEFORCB3Yi50YWJsZXMubmFtZT0kM1xuICAgICAgICBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbdXNlckVtYWlsLCBzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZVVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVRhYmxlVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM/OiBbc3RyaW5nXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcGFyYW1zID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgREVMRVRFIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkIElOIChcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy5pZCBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgICBBTkQgd2IudGFibGVzLm5hbWU9JDJcbiAgICAgIClcbiAgICBgO1xuICAgIGlmICh1c2VyRW1haWxzICYmIHVzZXJFbWFpbHMubGVuZ3RoID4gMCkge1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlscy5qb2luKFwiLFwiKSk7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIEFORCB3Yi50YWJsZV91c2Vycy51c2VyX2lkIElOIChcbiAgICAgICAgICBTRUxFQ1Qgd2IudXNlcnMuaWQgZnJvbSB3Yi51c2Vyc1xuICAgICAgICAgIFdIRVJFIGVtYWlsIElOICQzXG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIHRhYmxlSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlX3VzZXJzIChcbiAgICAgICAgICB0YWJsZV9pZCwgdXNlcl9pZCwgc2V0dGluZ3NcbiAgICAgICAgKVxuICAgICAgICBWQUxVRVMoJDEsICQyLCAkMylcbiAgICAgICAgT04gQ09ORkxJQ1QgKHRhYmxlX2lkLCB1c2VyX2lkKSBcbiAgICAgICAgRE8gVVBEQVRFIFNFVCBzZXR0aW5ncyA9IEVYQ0xVREVELnNldHRpbmdzXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbdGFibGVJZCwgdXNlcklkLCBzZXR0aW5nc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQ29sdW1uIHtcbiAgc3RhdGljIENPTU1PTl9UWVBFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBUZXh0OiBcInRleHRcIixcbiAgICBOdW1iZXI6IFwiaW50ZWdlclwiLFxuICAgIERlY2ltYWw6IFwiZGVjaW1hbFwiLFxuICAgIEJvb2xlYW46IFwiYm9vbGVhblwiLFxuICAgIERhdGU6IFwiZGF0ZVwiLFxuICAgIFwiRGF0ZSAmIFRpbWVcIjogXCJ0aW1lc3RhbXBcIixcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIHR5cGUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgaXNQcmltYXJ5S2V5ITogYm9vbGVhbjtcbiAgZm9yZWlnbktleXMhOiBbQ29uc3RyYWludElkXTtcbiAgcmVmZXJlbmNlZEJ5ITogW0NvbnN0cmFpbnRJZF07XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxDb2x1bW4+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIkNvbHVtbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBjb2x1bW5zID0gQXJyYXk8Q29sdW1uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgY29sdW1ucy5wdXNoKENvbHVtbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29sdW1ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IENvbHVtbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgIGNvbHVtbi5pZCA9IGRhdGEuaWQ7XG4gICAgY29sdW1uLnRhYmxlSWQgPSBkYXRhLnRhYmxlX2lkO1xuICAgIGNvbHVtbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIGNvbHVtbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgY29sdW1uLnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgY29sdW1uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBjb2x1bW4udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiBjb2x1bW47XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBPcmdhbml6YXRpb24ge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb24+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25zID0gQXJyYXk8T3JnYW5pemF0aW9uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9ucy5wdXNoKE9yZ2FuaXphdGlvbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uID0gbmV3IE9yZ2FuaXphdGlvbigpO1xuICAgIG9yZ2FuaXphdGlvbi5pZCA9IGRhdGEuaWQ7XG4gICAgb3JnYW5pemF0aW9uLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgb3JnYW5pemF0aW9uLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBvcmdhbml6YXRpb24uY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvbi51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBvcmdhbml6YXRpb24udXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi4vQ29sdW1uXCI7XG5cbi8qKlxuICogU0NIRU1BXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGFuIG9yZ2FuaXphdGlvblxuICogICAtIEFsbCBhZG1pbmlzdHJhdG9ycyBvZiB0aGUgb3JnYW5pemF0aW9uIGhhdmUgaW1wbGljaXQgYWRtaW4gYWNjZXNzXG4gKiAgIC0gVGhlcmUgYXJlIG5vIGV4Y2VwdGlvbnNcbiAqIC0gSWYgYSBzY2hlbWEgaXMgb3duZWQgYnkgYSB1c2VyLCB0aGUgdXNlciBoYXMgaW1wbGljaXQgYWRtaW4gYWNjZXNzXG4gKiAgIC0gQWRkaXRpb25hbCB1c2VycyBjYW4gYmUgZ3JhbnRlZCBhZG1pbiBhY2Nlc3MgZXhwbGljaXRseVxuICovXG5cbmV4cG9ydCB0eXBlIFJvbGVMZXZlbCA9IFwib3JnYW5pemF0aW9uXCIgfCBcInNjaGVtYVwiIHwgXCJ0YWJsZVwiO1xuXG5leHBvcnQgY2xhc3MgUm9sZSB7XG4gIHN0YXRpYyBTWVNST0xFU19PUkdBTklaQVRJT05TOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiA9IHtcbiAgICBvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcjoge1xuICAgICAgc3lzY29kZTogXCJvYVwiLFxuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEFkbWluaXN0cmF0b3JcIixcbiAgICB9LFxuICAgIG9yZ2FuaXphdGlvbl91c2VyOiB7IHN5c2NvZGU6IFwib3VcIiwgbGFiZWw6IFwiT3JnYW5pemF0aW9uIFVzZXJcIiB9LFxuICAgIG9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyOiB7XG4gICAgICBzeXNjb2RlOiBcIm9lXCIsXG4gICAgICBsYWJlbDogXCJPcmdhbml6YXRpb24gRXh0ZXJuYWwgVXNlclwiLFxuICAgIH0sXG4gIH07XG5cbiAgc3RhdGljIFNZU1JPTEVTX1NDSEVNQVM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+ID0ge1xuICAgIHNjaGVtYV9vd25lcjogeyBzeXNjb2RlOiBcInNvXCIsIGxhYmVsOiBcIkRCIE93bmVyXCIgfSxcbiAgICBzY2hlbWFfYWRtaW5pc3RyYXRvcjogeyBzeXNjb2RlOiBcInNhXCIsIGxhYmVsOiBcIkRCIEFkbWluaXN0cmF0b3JcIiB9LFxuICAgIHNjaGVtYV9tYW5hZ2VyOiB7IHN5c2NvZGU6IFwic21cIiwgbGFiZWw6IFwiREIgTWFuYWdlclwiIH0sXG4gICAgc2NoZW1hX2VkaXRvcjogeyBzeXNjb2RlOiBcInNlXCIsIGxhYmVsOiBcIkRCIEVkaXRvclwiIH0sXG4gICAgc2NoZW1hX3JlYWRlcjogeyBzeXNjb2RlOiBcInNyXCIsIGxhYmVsOiBcIkRCIFJlYWRlclwiIH0sXG4gIH07XG5cbiAgc3RhdGljIFNZU1JPTEVTX1RBQkxFUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XG4gICAgdGFibGVfaW5oZXJpdDogeyBzeXNjb2RlOiBcInRpXCIsIGxhYmVsOiBcIkluaGVyaXQgVGFibGUgUm9sZSBGcm9tIERCXCIgfSxcbiAgICB0YWJsZV9hZG1pbmlzdHJhdG9yOiB7IHN5c2NvZGU6IFwidGFcIiwgbGFiZWw6IFwiVGFibGUgQWRtaW5pc3RyYXRvclwiIH0sXG4gICAgdGFibGVfbWFuYWdlcjogeyBzeXNjb2RlOiBcInRtXCIsIGxhYmVsOiBcIlRhYmxlIE1hbmFnZXJcIiB9LFxuICAgIHRhYmxlX2VkaXRvcjogeyBzeXNjb2RlOiBcInRlXCIsIGxhYmVsOiBcIlRhYmxlIEVkaXRvclwiIH0sXG4gICAgdGFibGVfcmVhZGVyOiB7IHN5c2NvZGU6IFwidHJcIiwgbGFiZWw6IFwiVGFibGUgUmVhZGVyXCIgfSxcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgc3lzY29kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBzY2hlbWFJZD86IG51bWJlcjtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdGFibGVJZD86IG51bWJlcjtcbiAgdGFibGVOYW1lPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgaXNSb2xlKHJvbGVOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gKFxuICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfU0NIRU1BUykuaW5jbHVkZXMocm9sZU5hbWUpIHx8XG4gICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykuaW5jbHVkZXMocm9sZU5hbWUpXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgYXJlUm9sZXMocm9sZU5hbWVzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuICAgIGZvciAoY29uc3Qgcm9sZU5hbWUgb2Ygcm9sZU5hbWVzKSB7XG4gICAgICBpZiAoIVJvbGUuaXNSb2xlKHJvbGVOYW1lKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Um9sZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiUm9sZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCByb2xlcyA9IEFycmF5PFJvbGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICByb2xlcy5wdXNoKFJvbGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJvbGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUm9sZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGUgPSBuZXcgUm9sZSgpO1xuICAgIHJvbGUuaWQgPSBkYXRhLmlkO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICBpZiAoZGF0YS5zeXNjb2RlKSByb2xlLnN5c2NvZGUgPSBkYXRhLnN5c2NvZGU7XG4gICAgcm9sZS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgcm9sZS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgcm9sZS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hSWQpIHJvbGUuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYUlkO1xuICAgIGlmIChkYXRhLnNjaGVtYU5hbWUpIHJvbGUuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hTmFtZTtcbiAgICBpZiAoZGF0YS50YWJsZUlkKSByb2xlLnRhYmxlSWQgPSBkYXRhLnRhYmxlSWQ7XG4gICAgaWYgKGRhdGEudGFibGVOYW1lKSByb2xlLnRhYmxlTmFtZSA9IGRhdGEudGFibGVOYW1lO1xuICAgIHJldHVybiByb2xlO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgU2NoZW1hIHtcbiAgc3RhdGljIFNZU19TQ0hFTUFfTkFNRVM6IHN0cmluZ1tdID0gW1xuICAgIFwicHVibGljXCIsXG4gICAgXCJpbmZvcm1hdGlvbl9zY2hlbWFcIixcbiAgICBcImhkYl9jYXRhbG9nXCIsXG4gICAgXCJ3YlwiLFxuICBdO1xuXG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcjtcbiAgdXNlck93bmVySWQ/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IGRhdGEuaWQ7XG4gICAgc2NoZW1hLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgc2NoZW1hLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBzY2hlbWEub3JnYW5pemF0aW9uT3duZXJJZCA9IGRhdGEub3JnYW5pemF0aW9uT3duZXJJZDtcbiAgICBzY2hlbWEudXNlck93bmVySWQgPSBkYXRhLnVzZXJPd25lcklkO1xuICAgIHNjaGVtYS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS51c2VyX3JvbGUpIHNjaGVtYS51c2VyUm9sZSA9IGRhdGEudXNlcl9yb2xlO1xuICAgIHJldHVybiBzY2hlbWE7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBDb2x1bW4gfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGUge1xuICBpZCE6IG51bWJlcjtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGNvbHVtbnMhOiBbQ29sdW1uXTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZXMgPSBBcnJheTxUYWJsZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlcy5wdXNoKFRhYmxlLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZSA9IG5ldyBUYWJsZSgpO1xuICAgIHRhYmxlLmlkID0gZGF0YS5pZDtcbiAgICB0YWJsZS5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hX2lkO1xuICAgIHRhYmxlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgdGFibGUubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHRhYmxlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHRhYmxlO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVGFibGVVc2VyIHtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGVVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZVVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVVc2VycyA9IEFycmF5PFRhYmxlVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlVXNlcnMucHVzaChUYWJsZVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZVVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlciA9IG5ldyBUYWJsZVVzZXIoKTtcbiAgICB0YWJsZVVzZXIudGFibGVJZCA9IGRhdGEudGFibGVfaWQ7XG4gICAgdGFibGVVc2VyLnVzZXJJZCA9IGRhdGEudXNlcl9pZDtcbiAgICB0YWJsZVVzZXIucm9sZUlkID0gZGF0YS5yb2xlX2lkO1xuICAgIHRhYmxlVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgdGFibGVVc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB0YWJsZVVzZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgc3RhdGljIEhBU1VSQV9BRE1JTl9JRDogbnVtYmVyID0gMTtcblxuICBpZCE6IG51bWJlcjtcbiAgb3JnYW5pemF0aW9uX2lkITogbnVtYmVyO1xuICBlbWFpbCE6IHN0cmluZztcbiAgZmlyc3ROYW1lPzogc3RyaW5nO1xuICBsYXN0TmFtZT86IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgaXNBZG1pbih1aWQ6IG51bWJlcikge1xuICAgIHJldHVybiB1aWQgPT0gVXNlci5IQVNVUkFfQURNSU5fSUQ7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlcnMgPSBBcnJheTxVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdXNlcnMucHVzaChVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB1c2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB1c2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gZGF0YS5pZDtcbiAgICB1c2VyLmVtYWlsID0gZGF0YS5lbWFpbDtcbiAgICBpZiAoZGF0YS5maXJzdF9uYW1lKSB1c2VyLmZpcnN0TmFtZSA9IGRhdGEuZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5sYXN0X25hbWUpIHVzZXIubGFzdE5hbWUgPSBkYXRhLmxhc3RfbmFtZTtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5yb2xlKSB1c2VyLnJvbGUgPSBkYXRhLnJvbGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cbn1cbiIsImV4cG9ydCAqIGZyb20gXCIuL1JvbGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1NjaGVtYVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL0NvbHVtblwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Pcmdhbml6YXRpb25cIjtcbmV4cG9ydCAqIGZyb20gXCIuL1VzZXJcIjtcbiIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmc7XG4gIGRiSG9zdDogc3RyaW5nO1xuICBkYlBvcnQ6IG51bWJlcjtcbiAgZGJVc2VyOiBzdHJpbmc7XG4gIGRiUGFzc3dvcmQ6IHN0cmluZztcbiAgZGJQb29sTWF4OiBudW1iZXI7XG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGhhc3VyYUhvc3Q6IHN0cmluZztcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHN0cmluZztcbn07XG5cbmV4cG9ydCBjb25zdCBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHByb2Nlc3MuZW52LlNFQ1JFVF9NRVNTQUdFIGFzIHN0cmluZyxcbiAgZGJOYW1lOiBwcm9jZXNzLmVudi5EQl9OQU1FIGFzIHN0cmluZyxcbiAgZGJIb3N0OiBwcm9jZXNzLmVudi5EQl9IT1NUIGFzIHN0cmluZyxcbiAgZGJQb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT1JUIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRV9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9DT05ORUNUSU9OX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGhhc3VyYUhvc3Q6IHByb2Nlc3MuZW52LkhBU1VSQV9IT1NUIGFzIHN0cmluZyxcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHByb2Nlc3MuZW52LkhBU1VSQV9BRE1JTl9TRUNSRVQgYXMgc3RyaW5nLFxufTtcbiIsIi8vIGh0dHBzOi8vYWx0cmltLmlvL3Bvc3RzL2F4aW9zLWh0dHAtY2xpZW50LXVzaW5nLXR5cGVzY3JpcHRcblxuaW1wb3J0IGF4aW9zLCB7IEF4aW9zSW5zdGFuY2UsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5jb25zdCBoZWFkZXJzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPj4gPSB7XG4gIEFjY2VwdDogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICBcIngtaGFzdXJhLWFkbWluLXNlY3JldFwiOiBlbnZpcm9ubWVudC5oYXN1cmFBZG1pblNlY3JldCxcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHN0YXRpYyBIQVNVUkFfSUdOT1JFX0NPREVTOiBzdHJpbmdbXSA9IFtcbiAgICBcImFscmVhZHktdW50cmFja2VkXCIsXG4gICAgXCJhbHJlYWR5LXRyYWNrZWRcIixcbiAgICBcIm5vdC1leGlzdHNcIiwgLy8gZHJvcHBpbmcgYSByZWxhdGlvbnNoaXBcbiAgXTtcbiAgcHJpdmF0ZSBpbnN0YW5jZTogQXhpb3NJbnN0YW5jZSB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZ2V0IGh0dHAoKTogQXhpb3NJbnN0YW5jZSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zdGFuY2UgIT0gbnVsbCA/IHRoaXMuaW5zdGFuY2UgOiB0aGlzLmluaXRIYXN1cmFBcGkoKTtcbiAgfVxuXG4gIGluaXRIYXN1cmFBcGkoKSB7XG4gICAgY29uc3QgaHR0cCA9IGF4aW9zLmNyZWF0ZSh7XG4gICAgICBiYXNlVVJMOiBlbnZpcm9ubWVudC5oYXN1cmFIb3N0LFxuICAgICAgaGVhZGVycyxcbiAgICAgIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXG4gICAgfSk7XG5cbiAgICB0aGlzLmluc3RhbmNlID0gaHR0cDtcbiAgICByZXR1cm4gaHR0cDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcG9zdCh0eXBlOiBzdHJpbmcsIGFyZ3M6IFJlY29yZDxzdHJpbmcsIGFueT4pIHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0geyBzdWNjZXNzOiBmYWxzZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgdHJ5IHtcbiAgICAgIGxvZy5kZWJ1ZyhgaGFzdXJhQXBpLnBvc3Q6IHR5cGU6ICR7dHlwZX1gLCBhcmdzKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5odHRwLnBvc3Q8YW55LCBBeGlvc1Jlc3BvbnNlPihcbiAgICAgICAgXCIvdjEvbWV0YWRhdGFcIixcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgYXJnczogYXJncyxcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogcmVzcG9uc2UsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvci5yZXNwb25zZSAmJiBlcnJvci5yZXNwb25zZS5kYXRhKSB7XG4gICAgICAgIGlmICghSGFzdXJhQXBpLkhBU1VSQV9JR05PUkVfQ09ERVMuaW5jbHVkZXMoZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlKSkge1xuICAgICAgICAgIGxvZy5lcnJvcihlcnJvci5yZXNwb25zZS5kYXRhKTtcbiAgICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLnJlc3BvbnNlLmRhdGEuZXJyb3IsXG4gICAgICAgICAgICBjb2RlOiBlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3RyYWNrX3RhYmxlXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5jb2RlICYmXG4gICAgICBIYXN1cmFBcGkuSEFTVVJBX0lHTk9SRV9DT0RFUy5pbmNsdWRlcyhyZXN1bHQuY29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdW50cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICBjYXNjYWRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LmNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5IQVNVUkFfSUdOT1JFX0NPREVTLmluY2x1ZGVzKHJlc3VsdC5jb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LmNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBhIHBvc3QgaGFzIG9uZSBhdXRob3IgKGNvbnN0cmFpbnQgcG9zdHMuYXV0aG9yX2lkIC0+IGF1dGhvcnMuaWQpXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIGNvbHVtbk5hbWU6IHN0cmluZywgLy8gYXV0aG9yX2lkXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcgLy8gYXV0aG9yc1xuICApIHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgaGFzdXJhQXBpLmNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcCgke3NjaGVtYU5hbWV9LCAke3RhYmxlTmFtZX0sICR7Y29sdW1uTmFtZX0sICR7cGFyZW50VGFibGVOYW1lfSlgXG4gICAgKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19jcmVhdGVfb2JqZWN0X3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICBuYW1lOiBgb2JqXyR7dGFibGVOYW1lfV8ke3BhcmVudFRhYmxlTmFtZX1gLCAvLyBvYmpfcG9zdHNfYXV0aG9yc1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICB9LFxuICAgICAgdXNpbmc6IHtcbiAgICAgICAgZm9yZWlnbl9rZXlfY29uc3RyYWludF9vbjogY29sdW1uTmFtZSwgLy8gYXV0aG9yX2lkXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LmNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5IQVNVUkFfSUdOT1JFX0NPREVTLmluY2x1ZGVzKHJlc3VsdC5jb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LmNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBhbiBhdXRob3IgaGFzIG1hbnkgcG9zdHMgKGNvbnN0cmFpbnQgcG9zdHMuYXV0aG9yX2lkIC0+IGF1dGhvcnMuaWQpXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVBcnJheVJlbGF0aW9uc2hpcChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIGF1dGhvcnNcbiAgICBjaGlsZFRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIGNoaWxkQ29sdW1uTmFtZXM6IHN0cmluZ1tdIC8vIGF1dGhvcl9pZFxuICApIHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKCR7c2NoZW1hTmFtZX0sICR7dGFibGVOYW1lfSwgJHtjaGlsZFRhYmxlTmFtZX0sICR7Y2hpbGRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX2FycmF5X3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICBuYW1lOiBgYXJyXyR7dGFibGVOYW1lfV8ke2NoaWxkVGFibGVOYW1lfWAsIC8vIGFycl9hdXRob3JzX3Bvc3RzXG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IHtcbiAgICAgICAgICBjb2x1bW46IGNoaWxkQ29sdW1uTmFtZXNbMF0sIC8vIGF1dGhvcl9pZFxuICAgICAgICAgIHRhYmxlOiB7XG4gICAgICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgICAgICBuYW1lOiBjaGlsZFRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5jb2RlICYmXG4gICAgICBIYXN1cmFBcGkuSEFTVVJBX0lHTk9SRV9DT0RFUy5pbmNsdWRlcyhyZXN1bHQuY29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRyb3BSZWxhdGlvbnNoaXBzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgIH0sXG4gICAgICByZWxhdGlvbnNoaXA6IGBvYmpfJHt0YWJsZU5hbWV9XyR7cGFyZW50VGFibGVOYW1lfWAsIC8vIG9ial9wb3N0c19hdXRob3JzXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICAoIXJlc3VsdC5jb2RlIHx8XG4gICAgICAgIChyZXN1bHQuY29kZSAmJiAhSGFzdXJhQXBpLkhBU1VSQV9JR05PUkVfQ09ERVMuaW5jbHVkZXMocmVzdWx0LmNvZGUpKSlcbiAgICApIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2Ryb3BfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogcGFyZW50VGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICB9LFxuICAgICAgcmVsYXRpb25zaGlwOiBgYXJyXyR7cGFyZW50VGFibGVOYW1lfV8ke3RhYmxlTmFtZX1gLCAvLyBhcnJfYXV0aG9yc19wb3N0c1xuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LmNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5IQVNVUkFfSUdOT1JFX0NPREVTLmluY2x1ZGVzKHJlc3VsdC5jb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LmNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhc3VyYUFwaSA9IG5ldyBIYXN1cmFBcGkoKTtcbiIsImltcG9ydCB7IHR5cGVEZWZzIGFzIFNjaGVtYSwgcmVzb2x2ZXJzIGFzIHNjaGVtYVJlc29sdmVycyB9IGZyb20gXCIuL3NjaGVtYVwiO1xuaW1wb3J0IHtcbiAgdHlwZURlZnMgYXMgT3JnYW5pemF0aW9uLFxuICByZXNvbHZlcnMgYXMgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxufSBmcm9tIFwiLi9vcmdhbml6YXRpb25cIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFVzZXIsIHJlc29sdmVycyBhcyB1c2VyUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdXNlclwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVGFibGUsIHJlc29sdmVycyBhcyB0YWJsZVJlc29sdmVycyB9IGZyb20gXCIuL3RhYmxlXCI7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gXCJsb2Rhc2hcIjtcbmltcG9ydCB7IGdxbCwgQXBvbGxvRXJyb3IsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7XG4gIGNvbnN0cmFpbnREaXJlY3RpdmUsXG4gIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbn0gZnJvbSBcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIjtcbmltcG9ydCB7IG1ha2VFeGVjdXRhYmxlU2NoZW1hIH0gZnJvbSBcImdyYXBocWwtdG9vbHNcIjtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnk7IG1lc3NhZ2U/OiBzdHJpbmcgfVxuICB8IHsgc3VjY2VzczogZmFsc2U7IG1lc3NhZ2U6IHN0cmluZzsgY29kZT86IHN0cmluZzsgYXBvbGxvRXJyb3I/OiBzdHJpbmcgfTtcblxuZXhwb3J0IHR5cGUgUXVlcnlQYXJhbXMgPSB7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHBhcmFtcz86IGFueVtdO1xufTtcblxuZXhwb3J0IHR5cGUgQ29uc3RyYWludElkID0ge1xuICBjb25zdHJhaW50TmFtZTogc3RyaW5nO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgY29sdW1uTmFtZTogc3RyaW5nO1xuICByZWxUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIHJlbENvbHVtbk5hbWU/OiBzdHJpbmc7XG59O1xuXG5jb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogSlNPTiFcbiAgICB3YkNsb3VkQ29udGV4dDogSlNPTiFcbiAgfVxuXG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiUmVzZXRUZXN0RGF0YTogQm9vbGVhbiFcbiAgICB3YkF1dGgoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICBhdXRoVXNlcklkOiBTdHJpbmchXG4gICAgICBhdXRoVXNlck5hbWU6IFN0cmluZ1xuICAgICk6IEpTT04hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgIH07XG4gICAgfSxcbiAgICB3YkNsb3VkQ29udGV4dDogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gY29udGV4dC53YkNsb3VkLmNsb3VkQ29udGV4dCgpO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkF1dGg6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIGF1dGhVc2VySWQsIGF1dGhVc2VyTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYXV0aChcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgYXV0aFVzZXJJZCxcbiAgICAgICAgYXV0aFVzZXJOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG59O1xuXG5leHBvcnQgY29uc3Qgc2NoZW1hID0gbWFrZUV4ZWN1dGFibGVTY2hlbWEoe1xuICB0eXBlRGVmczogW1xuICAgIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbiAgICB0eXBlRGVmcyxcbiAgICBPcmdhbml6YXRpb24sXG4gICAgVXNlcixcbiAgICBTY2hlbWEsXG4gICAgVGFibGUsXG4gIF0sXG4gIHJlc29sdmVyczogbWVyZ2UoXG4gICAgcmVzb2x2ZXJzLFxuICAgIG9yZ2FuaXphdGlvblJlc29sdmVycyxcbiAgICB1c2VyUmVzb2x2ZXJzLFxuICAgIHNjaGVtYVJlc29sdmVycyxcbiAgICB0YWJsZVJlc29sdmVyc1xuICApLFxuICBzY2hlbWFUcmFuc2Zvcm1zOiBbY29uc3RyYWludERpcmVjdGl2ZSgpXSxcbn0pO1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgT3JnYW5pemF0aW9uIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgdXNlclJvbGU6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIHdiT3JnYW5pemF0aW9ucyh1c2VyRW1haWw6IFN0cmluZyk6IFtPcmdhbml6YXRpb25dXG4gICAgd2JPcmdhbml6YXRpb25CeUlkKGlkOiBJRCEpOiBPcmdhbml6YXRpb25cbiAgICB3Yk9yZ2FuaXphdGlvbkJ5TmFtZShuYW1lOiBTdHJpbmchKTogT3JnYW5pemF0aW9uXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JDcmVhdGVPcmdhbml6YXRpb24oXG4gICAgICBjdXJyZW50VXNlckVtYWlsOiBTdHJpbmchXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBsYWJlbDogU3RyaW5nIVxuICAgICk6IE9yZ2FuaXphdGlvblxuICAgIHdiVXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgbmFtZTogU3RyaW5nIVxuICAgICAgbmV3TmFtZTogU3RyaW5nXG4gICAgICBuZXdMYWJlbDogU3RyaW5nXG4gICAgKTogT3JnYW5pemF0aW9uXG4gICAgd2JEZWxldGVPcmdhbml6YXRpb24obmFtZTogU3RyaW5nISk6IEJvb2xlYW5cbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3Yk9yZ2FuaXphdGlvbnM6IGFzeW5jIChfLCB7IHVzZXJFbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQub3JnYW5pemF0aW9ucyhcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1c2VyRW1haWwsXG4gICAgICAgIHVuZGVmaW5lZFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiT3JnYW5pemF0aW9uQnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5SWQoaWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5TmFtZShuYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBjdXJyZW50VXNlckVtYWlsLCBuYW1lLCBsYWJlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXJFbWFpbCxcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSwgbmV3TmFtZSwgbmV3TGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3TmFtZSxcbiAgICAgICAgbmV3TGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuZGVsZXRlT3JnYW5pemF0aW9uKG5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFNjaGVtYSB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ6IEludFxuICAgIHVzZXJPd25lcklkOiBJbnRcbiAgICB1c2VyUm9sZTogU3RyaW5nXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgd2JTY2hlbWFzKHVzZXJFbWFpbDogU3RyaW5nISk6IFtTY2hlbWFdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JDcmVhdGVTY2hlbWEoXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBsYWJlbDogU3RyaW5nIVxuICAgICAgb3JnYW5pemF0aW9uT3duZXJJZDogSW50XG4gICAgICBvcmdhbml6YXRpb25Pd25lck5hbWU6IFN0cmluZ1xuICAgICAgdXNlck93bmVySWQ6IEludFxuICAgICAgdXNlck93bmVyRW1haWw6IFN0cmluZ1xuICAgICk6IFNjaGVtYVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIHdiU2NoZW1hczogYXN5bmMgKF8sIHsgdXNlckVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHVpZFJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51aWRGcm9tSGVhZGVycyhjb250ZXh0LmhlYWRlcnMpO1xuICAgICAgaWYgKCF1aWRSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbnRleHQud2JDbG91ZC5lcnIodWlkUmVzdWx0KTtcbiAgICAgIC8vIHVpZFJlc3VsdC5wYXlsb2FkXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWNjZXNzaWJsZVNjaGVtYXModXNlckVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIHdiQ3JlYXRlU2NoZW1hOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBuYW1lLFxuICAgICAgICBsYWJlbCxcbiAgICAgICAgb3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgICAgb3JnYW5pemF0aW9uT3duZXJOYW1lLFxuICAgICAgICB1c2VyT3duZXJJZCxcbiAgICAgICAgdXNlck93bmVyRW1haWwsXG4gICAgICB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgdWlkUmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVpZEZyb21IZWFkZXJzKGNvbnRleHQuaGVhZGVycyk7XG4gICAgICBpZiAoIXVpZFJlc3VsdC5zdWNjZXNzKSByZXR1cm4gY29udGV4dC53YkNsb3VkLmVycih1aWRSZXN1bHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVNjaGVtYShcbiAgICAgICAgdWlkUmVzdWx0LnBheWxvYWQsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lck5hbWUsXG4gICAgICAgIHVzZXJPd25lcklkLFxuICAgICAgICB1c2VyT3duZXJFbWFpbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgR3JhcGhRTEpTT04gfSBmcm9tIFwiZ3JhcGhxbC10eXBlLWpzb25cIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgc2NhbGFyIEpTT05cblxuICB0eXBlIFRhYmxlIHtcbiAgICBpZDogSUQhXG4gICAgc2NoZW1hSWQ6IEludCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgICBjb2x1bW5zOiBbQ29sdW1uXSFcbiAgfVxuXG4gIHR5cGUgQ29sdW1uIHtcbiAgICBpZDogSUQhXG4gICAgdGFibGVJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHR5cGU6IFN0cmluZyFcbiAgICBpc1ByaW1hcnlLZXk6IEJvb2xlYW4hXG4gICAgZm9yZWlnbktleXM6IFtDb25zdHJhaW50SWRdIVxuICAgIHJlZmVyZW5jZWRCeTogW0NvbnN0cmFpbnRJZF0hXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbnN0cmFpbnRJZCB7XG4gICAgY29uc3RyYWludE5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgcmVsVGFibGVOYW1lOiBTdHJpbmdcbiAgICByZWxDb2x1bW5OYW1lOiBTdHJpbmdcbiAgfVxuXG4gIHR5cGUgVGFibGVVc2VyIHtcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgcm9sZUlkOiBJbnQhXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlRhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogW1RhYmxlXVxuICAgIHdiQ29sdW1ucyhzY2hlbWFOYW1lOiBTdHJpbmchLCB0YWJsZU5hbWU6IFN0cmluZyEpOiBbQ29sdW1uXVxuICAgIHdiVGFibGVVc2VyKFxuICAgICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICApOiBUYWJsZVVzZXJcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JVcGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgbmV3VGFibGVOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1RhYmxlTGFiZWw6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkQWxsRXhpc3RpbmdUYWJsZXMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JBZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICAgY29sdW1uVHlwZTogU3RyaW5nXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlVwZGF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgbmV3Q29sdW1uTmFtZTogU3RyaW5nXG4gICAgICBuZXdDb2x1bW5MYWJlbDogU3RyaW5nXG4gICAgICBuZXdUeXBlOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIHBhcmVudFRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgcGFyZW50Q29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIEpTT046IEdyYXBoUUxKU09OLFxuICBRdWVyeToge1xuICAgIHdiVGFibGVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkNvbHVtbnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JUYWJsZVVzZXI6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXIoXG4gICAgICAgIHVzZXJFbWFpbCxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JBZGRPckNyZWF0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHRhYmxlTGFiZWwsIGNyZWF0ZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdGFibGVMYWJlbCxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JVcGRhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBuZXdUYWJsZU5hbWUsIG5ld1RhYmxlTGFiZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVUYWJsZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBuZXdUYWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZEFsbEV4aXN0aW5nVGFibGVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRBbGxFeGlzdGluZ1RhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgIHNjaGVtYU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIGNvbHVtbkxhYmVsLCBjcmVhdGUsIGNvbHVtblR5cGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBjb2x1bW5MYWJlbCxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgICBjb2x1bW5UeXBlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JVcGRhdGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICAgIG5ld1R5cGUsXG4gICAgICB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlVGFibGVVc2VyU2V0dGluZ3M6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlsLCBzZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWwsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgVXNlciB7XG4gICAgaWQ6IElEIVxuICAgIGVtYWlsOiBTdHJpbmchXG4gICAgZmlyc3ROYW1lOiBTdHJpbmdcbiAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gICAgcm9sZTogU3RyaW5nXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgd2JPcmdhbml6YXRpb25Vc2VycyhuYW1lOiBTdHJpbmchLCByb2xlczogW1N0cmluZ10pOiBbVXNlcl1cbiAgICB3YlVzZXJzQnlPcmdhbml6YXRpb25JZChvcmdhbml6YXRpb25JZDogSUQhKTogW1VzZXJdXG4gICAgd2JVc2VyQnlJZChpZDogSUQhKTogVXNlclxuICAgIHdiVXNlckJ5RW1haWwoZW1haWw6IFN0cmluZyEpOiBVc2VyXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JDcmVhdGVVc2VyKGVtYWlsOiBTdHJpbmchLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICB3YlVwZGF0ZVVzZXIoXG4gICAgICBpZDogSUQhXG4gICAgICBlbWFpbDogU3RyaW5nXG4gICAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgICk6IFVzZXJcbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb24tVXNlci1Sb2xlc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIFwiXCJcIlxuICAgIFNjaGVtYS1Vc2VyLVJvbGVzXG4gICAgXCJcIlwiXG4gICAgd2JBZGRVc2VyVG9TY2hlbWEoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICAgIHNjaGVtYVJvbGU6IFN0cmluZyFcbiAgICApOiBVc2VyXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JPcmdhbml6YXRpb25Vc2VyczogYXN5bmMgKF8sIHsgbmFtZSwgcm9sZXMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvblVzZXJzKG5hbWUsIHJvbGVzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlcnNCeU9yZ2FuaXphdGlvbklkOiBhc3luYyAoXywgeyBvcmdhbml6YXRpb25JZCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlcnNCeU9yZ2FuaXphdGlvbklkKFxuICAgICAgICBvcmdhbml6YXRpb25JZFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChpZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUVtYWlsOiBhc3luYyAoXywgeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5RW1haWwoZW1haWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gVXNlcnNcbiAgICB3YkNyZWF0ZVVzZXI6IGFzeW5jIChfLCB7IGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVXNlcjogYXN5bmMgKF8sIHsgaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVVc2VyKFxuICAgICAgICBpZCxcbiAgICAgICAgZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24tVXNlci1Sb2xlc1xuICAgIHdiU2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBvcmdhbml6YXRpb25OYW1lLCB1c2VyRW1haWxzLCByb2xlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICByb2xlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb246IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHVzZXJFbWFpbHMsIG9yZ2FuaXphdGlvbk5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24tU2NoZW1hLVJvbGVzXG4gICAgd2JBZGRVc2VyVG9TY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbCwgc2NoZW1hUm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZFVzZXJUb1NjaGVtYShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdXNlckVtYWlsLFxuICAgICAgICBzY2hlbWFSb2xlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgQXBvbGxvU2VydmVyLCBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcInRzbG9nXCI7XG5pbXBvcnQgeyBEQUwgfSBmcm9tIFwiLi9kYWxcIjtcbmltcG9ydCB7IGhhc3VyYUFwaSB9IGZyb20gXCIuL2hhc3VyYS1hcGlcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgc2NoZW1hLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB2ID0gcmVxdWlyZShcInZvY2FcIik7XG5pbXBvcnQgeyBDb2x1bW4sIE9yZ2FuaXphdGlvbiwgUm9sZSwgUm9sZUxldmVsLCBTY2hlbWEsIFVzZXIgfSBmcm9tIFwiLi9lbnRpdHlcIjtcbmltcG9ydCB7IGlzVGhpc1R5cGVOb2RlIH0gZnJvbSBcInR5cGVzY3JpcHRcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxIYW5kbGVyID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gIHNjaGVtYSxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogKHsgZXZlbnQsIGNvbnRleHQgfSkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBoZWFkZXJzOiBldmVudC5oZWFkZXJzLFxuICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGV2ZW50Lm11bHRpVmFsdWVIZWFkZXJzLFxuICAgICAgd2JDbG91ZDogbmV3IFdoaXRlYnJpY2tDbG91ZCgpLFxuICAgIH07XG4gIH0sXG59KS5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiLFxufSk7XG5cbmNsYXNzIFdoaXRlYnJpY2tDbG91ZCB7XG4gIGRhbCA9IG5ldyBEQUwoKTtcblxuICBzdGF0aWMgUkVTVUxUX0RFRkFVTFQ6IFNlcnZpY2VSZXN1bHQgPSB7XG4gICAgc3VjY2VzczogZmFsc2UsXG4gICAgbWVzc2FnZTogXCJSRVNVTFRfREVGQVVMVDogcmVzdWx0IGhhcyBub3QgYmVlbiBhc3NpZ25lZFwiLFxuICB9O1xuXG4gIHB1YmxpYyBlcnIocmVzdWx0OiBTZXJ2aWNlUmVzdWx0KTogRXJyb3Ige1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmV0dXJuIG5ldyBFcnJvcihcbiAgICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQuZXJyOiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiXG4gICAgICApO1xuICAgIH1cbiAgICBsZXQgYXBvbGxvRXJyb3IgPSBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiO1xuICAgIGlmIChyZXN1bHQuYXBvbGxvRXJyb3IpIGFwb2xsb0Vycm9yID0gcmVzdWx0LmFwb2xsb0Vycm9yO1xuICAgIHJldHVybiBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIGFwb2xsb0Vycm9yLCB7XG4gICAgICByZWY6IHJlc3VsdC5jb2RlLFxuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVpZEZyb21IZWFkZXJzKFxuICAgIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLndhcm4oXCI9PT09PT09PT09IEhFQURFUlM6IFwiICsgSlNPTi5zdHJpbmdpZnkoaGVhZGVycykpO1xuICAgIGNvbnN0IGhlYWRlcnNMb3dlckNhc2UgPSBPYmplY3QuZW50cmllcyhoZWFkZXJzKS5yZWR1Y2UoXG4gICAgICAoYWNjOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBba2V5LCB2YWxdKSA9PiAoXG4gICAgICAgIChhY2Nba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsKSwgYWNjXG4gICAgICApLFxuICAgICAge31cbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBXaGl0ZWJyaWNrQ2xvdWQuUkVTVUxUX0RFRkFVTFQ7XG4gICAgaWYgKFxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0gJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdLnRvTG93ZXJDYXNlKCkgPT0gXCJhZG1pblwiXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiBVc2VyLkhBU1VSQV9BRE1JTl9JRCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT0gXCJkZXZlbG9wbWVudFwiICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItaWRcIl1cbiAgICApIHtcbiAgICAgIC8vIGxvZy53YXJuKFwidWlkOiBcIiArIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXSk7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJCeUVtYWlsKGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXSk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgfSBlbHNlIGlmIChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGB1aWRGcm9tSGVhZGVyczogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBoZWFkZXJzXG4gICAgICAgICl9YCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBjbG91ZENvbnRleHQoKTogb2JqZWN0IHtcbiAgICByZXR1cm4ge1xuICAgICAgZGVmYXVsdENvbHVtblR5cGVzOiBDb2x1bW4uQ09NTU9OX1RZUEVTLFxuICAgICAgcm9sZXM6IHtcbiAgICAgICAgb3JnYW5pemF0aW9uczogUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TLFxuICAgICAgICBzY2hlbWFzOiBSb2xlLlNZU1JPTEVTX1NDSEVNQVMsXG4gICAgICAgIHRhYmxlczogUm9sZS5TWVNST0xFU19UQUJMRVMsXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogVGVzdFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcmVzZXRUZXN0RGF0YSgpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2NoZW1hcyhcInRlc3RfJVwiKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlU2NoZW1hKHNjaGVtYS5uYW1lLCB0cnVlKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIEF1dGhcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGF1dGgoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGF1dGhVc2VySWQ6IHN0cmluZyxcbiAgICBhdXRoVXNlck5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmFuZG9tTnVtYmVyID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDApO1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICBcIngtaGFzdXJhLWFsbG93ZWQtcm9sZXNcIjogW1xuICAgICAgICAgIGBSQU5ET01fUk9MRV8ke3JhbmRvbU51bWJlcn1gLFxuICAgICAgICAgIFwidHI0MDMyMFwiLFxuICAgICAgICAgIFwidHI0MDMyMVwiLFxuICAgICAgICBdLFxuICAgICAgICBcIngtaGFzdXJhLWRlZmF1bHQtcm9sZVwiOiBcInRyNDAzMjFcIixcbiAgICAgICAgXCJ4LWhhc3VyYS11c2VyLWlkXCI6IGF1dGhVc2VySWQsXG4gICAgICB9LFxuICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBPcmdhbml6YXRpb25zXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvbnModXNlcklkLCB1c2VyRW1haWwsIG9yZ2FuaXphdGlvbklkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlVc2VySWQodXNlcklkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwub3JnYW5pemF0aW9ucyh1c2VySWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeVVzZXJFbWFpbChcbiAgICB1c2VyRW1haWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwub3JnYW5pemF0aW9ucyh1bmRlZmluZWQsIHVzZXJFbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQWNjZXNzKFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3Qgb3Jnc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnMoXG4gICAgICB1c2VySWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBvcmdhbml6YXRpb25JZFxuICAgICk7XG4gICAgaWYgKG9yZ3NSZXN1bHQuc3VjY2Vzcykgb3Jnc1Jlc3VsdC5wYXlsb2FkID0gb3Jnc1Jlc3VsdC5wYXlsb2FkWzBdO1xuICAgIHJldHVybiBvcmdzUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeUlkcyhpZHM6IG51bWJlcltdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvbnNCeUlkc09yTmFtZXMoaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnNCeUlkcyhbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlOYW1lcyhuYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwub3JnYW5pemF0aW9uc0J5SWRzT3JOYW1lcyh1bmRlZmluZWQsIG5hbWVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zQnlOYW1lcyhbbmFtZV0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvblVzZXJzKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICByb2xlcz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGBPcmdhbml6YXRpb24gd2l0aCBuYW1lICcke25hbWV9JyBjb3VsZCBub3QgYmUgZm91bmRgLFxuICAgICAgICBjb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgYXBvbGxvRXJyb3I6IFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgaWYgKHJvbGVzICYmICFSb2xlLmFyZVJvbGVzKHJvbGVzKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJvcmdhbml6YXRpb25Vc2Vyczogcm9sZXMgY29udGFpbnMgb25lIG9yIG1vcmUgdW5yZWNvZ25pemVkIHN0cmluZ3NcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvblVzZXJzKG5hbWUsIHJvbGVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPcmdhbml6YXRpb24oXG4gICAgY3VycmVudFVzZXJFbWFpbDogc3RyaW5nLCAvLyBUQkQ6IHJlcGFjZSB3aXRoIHVpZFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IGNoZWNrTmFtZVJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG5hbWUpO1xuICAgIGlmICghY2hlY2tOYW1lUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjaGVja05hbWVSZXN1bHQ7XG4gICAgaWYgKGNoZWNrTmFtZVJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYFRoaXMgb3JnYW5pemF0aW9uIG5hbWUgaGFzIGFscmVhZHkgYmVlbiB0YWtlbi5gLFxuICAgICAgICBjb2RlOiBcIldCX09SR0FOSVpBVElPTl9OQU1FX1RBS0VOXCIsXG4gICAgICAgIGFwb2xsb0Vycm9yOiBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IGNyZWF0ZU9yZ1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZU9yZ2FuaXphdGlvbihuYW1lLCBsYWJlbCk7XG4gICAgaWYgKCFjcmVhdGVPcmdSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNyZWF0ZU9yZ1Jlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNldE9yZ2FuaXphdGlvblVzZXJSb2xlKFxuICAgICAgbmFtZSxcbiAgICAgIGN1cnJlbnRVc2VyRW1haWwsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGNyZWF0ZU9yZ1Jlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZU9yZ2FuaXphdGlvbihuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMobmFtZSwgW1xuICAgICAgXCJvcmdhbml6YXRpb25fdXNlclwiLFxuICAgICAgXCJvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlclwiLFxuICAgIF0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBgUmVtb3ZlIGFsbCBub24tYWRtaW5pc3RyYXRpdmUgdXNlcnMgZnJvbSBPcmdhbml6YXRpb24gYmVmb3JlIGRlbGV0aW5nLmAsXG4gICAgICAgIGNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9FTVBUWVwiLFxuICAgICAgICBhcG9sbG9FcnJvcjogXCJCQURfVVNFUl9JTlBVVFwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlT3JnYW5pemF0aW9uKG5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVUZXN0T3JnYW5pemF0aW9ucygpO1xuICB9XG5cbiAgLyoqXG4gICAqIE9yZ2FuaXphdGlvbi1Vc2VyLVJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBzZXRPcmdhbml6YXRpb25Vc2VyUm9sZShcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsOiBzdHJpbmcsXG4gICAgcm9sZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICBbdXNlckVtYWlsXSxcbiAgICAgIHJvbGVcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW10sXG4gICAgcm9sZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGlmICh1c2Vyc1Jlc3VsdC5wYXlsb2FkLmxlbmd0aCAhPSB1c2VyRW1haWxzKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogJHtcbiAgICAgICAgICB1c2VyRW1haWxzLmxlbmd0aCAtIHVzZXJzUmVzdWx0LnBheWxvYWQubGVuZ3RoXG4gICAgICAgIH0gbWlzc2luZyB1c2VyKHMpYCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUob3JnYW5pemF0aW9uTmFtZSk7XG4gICAgaWYgKCFvcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIG9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICBjb25zdCByb2xlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucm9sZUJ5TmFtZShyb2xlKTtcbiAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJvbGVSZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICB1c2Vyc1Jlc3VsdC5wYXlsb2FkLFxuICAgICAgcm9sZVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHModXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgLy8gY2hlY2sgbm90IGFsbCB0aGUgYWRtaW5zIHdpbGwgYmUgcmVtb3ZlZFxuICAgIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMob3JnYW5pemF0aW9uTmFtZSwgW1xuICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIF0pO1xuICAgIGlmICghYWRtaW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBhZG1pbnNSZXN1bHQ7XG4gICAgY29uc3QgYWxsQWRtaW5JZHMgPSBhZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICApO1xuICAgIGlmIChhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzLmluY2x1ZGVzKGVsZW0pKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGBZb3UgY2FuIG5vdCByZW1vdmUgYWxsIEFkbWluaXN0cmF0b3JzIGZyb20gYW4gT3JnYW5pemF0aW9uIC0geW91IG11c3QgbGVhdmUgYXQgbGVhc3Qgb25lLmAsXG4gICAgICAgIGNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PX0FETUlOU1wiLFxuICAgICAgICBhcG9sbG9FcnJvcjogXCJCQURfVVNFUl9JTlBVVFwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShvcmdhbml6YXRpb25OYW1lKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgIHVzZXJzUmVzdWx0LnBheWxvYWQsXG4gICAgICBvcmdhbml6YXRpb25SZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBVc2Vyc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeU9yZ2FuaXphdGlvbklkKFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzQnlPcmdhbml6YXRpb25JZChvcmdhbml6YXRpb25JZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUlkcyhpZHM6IG51bWJlcltdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzQnlJZHNPckVtYWlscyhpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlJZHMoW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUVtYWlscyh1c2VyRW1haWxzOiBzdHJpbmdbXSk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vyc0J5SWRzT3JFbWFpbHModW5kZWZpbmVkLCB1c2VyRW1haWxzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChlbWFpbDogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKFtlbWFpbF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoXG4gICAgZW1haWw6IHN0cmluZyxcbiAgICBmaXJzdE5hbWU6IHN0cmluZyxcbiAgICBsYXN0TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIFRCRDogYXV0aGVudGljYXRpb24sIHNhdmUgcGFzc3dvcmRcbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVXNlcihlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByb2xlQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5yb2xlQnlOYW1lKG5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVtYXNcbiAgICogVEJEOiB2YWxpZGF0ZSBuYW1lIH4gW2Etel17MX1bX2EtejAtOV17Mix9XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEoXG4gICAgdWlkOiBudW1iZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU/OiBzdHJpbmcsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcInBnX1wiKSB8fCBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5pbmNsdWRlcyhuYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGBEYXRhYmFzZSBuYW1lIGNhbiBub3QgYmVnaW4gd2l0aCAncGdfJyBvciBiZSBpbiB0aGUgcmVzZXJ2ZWQgbGlzdDogJHtTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5qb2luKFxuICAgICAgICAgIFwiLCBcIlxuICAgICAgICApfWAsXG4gICAgICAgIGNvZGU6IFwiV0JfU0NIRU1BX05BTUVcIixcbiAgICAgICAgYXBvbGxvRXJyb3I6IFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IFdoaXRlYnJpY2tDbG91ZC5SRVNVTFRfREVGQVVMVDtcbiAgICAvLyBHZXQgdGhlIElEc1xuICAgIGlmICghb3JnYW5pemF0aW9uT3duZXJJZCAmJiAhdXNlck93bmVySWQpIHtcbiAgICAgIGlmIChvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG9yZ2FuaXphdGlvbk93bmVyTmFtZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH0gZWxzZSBpZiAodXNlck93bmVyRW1haWwpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbCh1c2VyT3duZXJFbWFpbCk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIHVzZXJPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IFwiY3JlYXRlU2NoZW1hOiBPd25lciBjb3VsZCBub3QgYmUgZm91bmRcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICBsZXQgdXNlck9yZ1JvbGU6IE9yZ2FuaXphdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBpZiAoIVVzZXIuaXNBZG1pbih1aWQpKSB7XG4gICAgICAvLyBVc2VyIG11c3QgYmUgaW4gdGhlIG9yZ2FuaXphdGlvbiBmb3Igb3JnYW5pemF0aW9uT3duZXJcbiAgICAgIGlmIChvcmdhbml6YXRpb25Pd25lcklkKSB7XG4gICAgICAgIGNvbnN0IG9yZ1Jlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQWNjZXNzKFxuICAgICAgICAgIHVpZCxcbiAgICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkXG4gICAgICAgICk7XG4gICAgICAgIGlmICghb3JnUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdSZXN1bHQ7XG4gICAgICAgIHVzZXJPcmdSb2xlID0gb3JnUmVzdWx0LnBheWxvYWQ7XG4gICAgICAgIGlmICghdXNlck9yZ1JvbGUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBgY3JlYXRlU2NoZW1hOiBVc2VyICR7dWlkfSBtdXN0IGJlIGluIE9yZ2FuaXphdGlvbiAke29yZ2FuaXphdGlvbk93bmVySWR9YCxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgLy8gT25seSB0aGUgY3VycmVudCB1c2VyIGNhbiBiZSB0aGUgdXNlck93bmVyXG4gICAgICB9IGVsc2UgaWYgKHVzZXJPd25lcklkKSB7XG4gICAgICAgIGlmICh1aWQgIT0gdXNlck93bmVySWQpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBgY3JlYXRlU2NoZW1hOiBUaGUgY3VycmVudCB1c2VyICR7dWlkfSBkb2VzIG5vdCBtYXRjaCB0aGUgdXNlck93bmVySWQgJHt1c2VyT3duZXJJZH1gLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVTY2hlbWEoXG4gICAgICBuYW1lLFxuICAgICAgbGFiZWwsXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgdXNlck93bmVySWRcbiAgICApO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgLy8gSWYgb3duZXIgaXMgb3JnYW5pemF0aW9uIGFuZCB1c2VyIGlzIG5vdCBhbiBhZG1pbiBvZiB0aGUgb3JnYW5pemF0aW9uLFxuICAgIC8vIGFkZCBhZG1pbiBzbyB0aGV5IGRvbnQgbG9zZSBhY2Nlc3NcbiAgICBpZiAoXG4gICAgICAhVXNlci5pc0FkbWluKHVpZCkgJiZcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgJiZcbiAgICAgIHVzZXJPcmdSb2xlICYmXG4gICAgICB1c2VyT3JnUm9sZS51c2VyUm9sZSAhPSBcIm9yZ2FuaWF0aW9uX2FkbWluXCJcbiAgICApIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgdWlkLFxuICAgICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnNldFJvbGUodXNlcklkLCByb2xlTmFtZSwgcm9sZUxldmVsLCBvYmplY3RJZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHRhYmxlTmFtZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcih1c2VyRW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdPd25lckFkbWluKFxuICAgIHVzZXJFbWFpbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlPcmdPd25lckFkbWluKHVzZXJFbWFpbCk7XG4gIH1cblxuICAvKipcbiAgICogU2NoZW1hLVVzZXItUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJUb1NjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsOiBzdHJpbmcsXG4gICAgc2NoZW1hUm9sZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHVzZXJSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJCeUVtYWlsKHVzZXJFbWFpbCk7XG4gICAgaWYgKCF1c2VyUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2VyUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYUJ5TmFtZShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yb2xlQnlOYW1lKHNjaGVtYVJvbGUpO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRVc2VyVG9TY2hlbWEoXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHVzZXJSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHJvbGVSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gdXNlclJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hcyh1c2VyRW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIE9yZGVyIG1hdHRlcnMgLSBvd25lcnMsIGFkbWlucyB0YWtlIHByZXNlZGVuY2Ugb3ZlciB1c2Vyc1xuICAgIC8vIFNjaGVtYXMgd2l0aCB1c2VyIG93bmVyc1xuICAgIGNvbnN0IHNjaGVtYU93bmVyUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsKTtcbiAgICBpZiAoIXNjaGVtYU93bmVyUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFPd25lclJlc3VsdDtcbiAgICAvLyBTY2hlbWFzIHdpdGggb3JnYW5pemF0aW9uIG93bmVycyB3aGVyZSB1c2VyIGlzIG9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXG4gICAgY29uc3Qgc2NoZW1hT3JnQWRtaW5SZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXNCeU9yZ093bmVyQWRtaW4odXNlckVtYWlsKTtcbiAgICBpZiAoIXNjaGVtYU9yZ0FkbWluUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFPcmdBZG1pblJlc3VsdDtcbiAgICAvLyBTY2hlbWFzIHdpdGggc2NoZWFtYV91c2VycyBhc3NpZ25lZFxuICAgIGNvbnN0IHVzZXJSb2xlc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXIodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSb2xlc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlclJvbGVzUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYXM6IFNjaGVtYVtdID0gW107XG4gICAgY29uc3Qgc2NoZW1hSWRzOiBudW1iZXJbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHNjaGVtYU93bmVyUmVzdWx0LnBheWxvYWQuY29uY2F0KFxuICAgICAgc2NoZW1hT3JnQWRtaW5SZXN1bHQucGF5bG9hZCxcbiAgICAgIHVzZXJSb2xlc1Jlc3VsdC5wYXlsb2FkXG4gICAgKSkge1xuICAgICAgaWYgKCFzY2hlbWFJZHMuaW5jbHVkZXMoc2NoZW1hLmlkKSkge1xuICAgICAgICBzY2hlbWFzLnB1c2goc2NoZW1hKTtcbiAgICAgICAgc2NoZW1hSWRzLnB1c2goc2NoZW1hLmlkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBwYXlsb2FkOiBzY2hlbWFzLFxuICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZXNcbiAgICogVEJEOiB2YWxpZGF0ZSBuYW1lIH4gW2Etel17MX1bX2EtejAtOV17Mix9XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICAgIGlmICghY29sdW1uc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gY29sdW1uc1Jlc3VsdDtcbiAgICAgIHRhYmxlLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBwS0NvbHNDb25zdHJhaW50czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHBLQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMocEtDb2xzQ29uc3RyYWludHMpO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgY29sdW1uIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICBjb2x1bW4uaXNQcmltYXJ5S2V5ID0gcEtDb2x1bW5OYW1lcy5pbmNsdWRlcyhjb2x1bW4ubmFtZSk7XG4gICAgICBjb25zdCBmb3JlaWduS2V5c1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgICApO1xuICAgICAgaWYgKCFmb3JlaWduS2V5c1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29sdW1uLmZvcmVpZ25LZXlzID0gZm9yZWlnbktleXNSZXN1bHQucGF5bG9hZDtcbiAgICAgIGNvbnN0IHJlZmVyZW5jZXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgXCJSRUZFUkVOQ0VTXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlZmVyZW5jZXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbHVtbi5yZWZlcmVuY2VkQnkgPSByZWZlcmVuY2VzUmVzdWx0LnBheWxvYWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFjcmVhdGUpIGNyZWF0ZSA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIHRhYmxlTGFiZWwsXG4gICAgICBjcmVhdGVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgLy8gMS4gdW50cmFja1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyAyLiByZW1vdmUvZGVsZXRlIGNvbHVtbnNcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgLy8gMy4gcmVtb3ZlIHVzZXIgc2V0dGluZ3NcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVUYWJsZVVzZXJzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyA0LiByZW1vdmUvZGVsZXRlIHRoZSB0YWJsZVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgZGVsXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBleGlzdGluZ1RhYmxlTmFtZXMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICAgKTtcbiAgICAgIGlmIChleGlzdGluZ1RhYmxlTmFtZXMuaW5jbHVkZXMobmV3VGFibGVOYW1lKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IFwiVGhlIG5ldyB0YWJsZSBuYW1lIG11c3QgYmUgdW5pcXVlXCIsXG4gICAgICAgICAgY29kZTogXCJXQl9UQUJMRV9OQU1FX0VYSVNUU1wiLFxuICAgICAgICAgIGFwb2xsb0Vycm9yOiBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS51bnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVwZGF0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIG5ld1RhYmxlTmFtZSxcbiAgICAgIG5ld1RhYmxlTGFiZWxcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgbmV3VGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkQWxsRXhpc3RpbmdUYWJsZXMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlclRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHRhYmxlTmFtZXMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IHRhYmxlTmFtZSBvZiB0YWJsZU5hbWVzKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdi50aXRsZUNhc2UodGFibGVOYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiIFwiKSksXG4gICAgICAgIGZhbHNlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRpc2NvdmVyQ29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICAgIGZvciAoY29uc3QgY29sdW1uIG9mIGNvbHVtbnMpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgICB2LnRpdGxlQ2FzZShjb2x1bW4ubmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIiBcIikpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgXCIlXCIsXG4gICAgICBcIiVcIixcbiAgICAgIFwiQUxMXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcmVsYXRpb25zaGlwczogQ29uc3RyYWludElkW10gPSByZXN1bHQucGF5bG9hZDtcbiAgICBpZiAocmVsYXRpb25zaGlwcy5sZW5ndGggPiAwKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlbGF0aW9uc2hpcCBvZiByZWxhdGlvbnNoaXBzKSB7XG4gICAgICAgIGlmIChyZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lICYmIHJlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lKSB7XG4gICAgICAgICAgdGhpcy5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgIFtyZWxhdGlvbnNoaXAuY29sdW1uTmFtZV0sXG4gICAgICAgICAgICByZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lLFxuICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lXVxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgICAgXCJhZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHM6IENvbnN0cmFpbnRJZCBtdXN0IGhhdmUgcmVsVGFibGVOYW1lIGFuZCByZWxDb2x1bW5OYW1lXCIsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5MYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW4sXG4gICAgY29sdW1uVHlwZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBjb2x1bW5MYWJlbCxcbiAgICAgIGNyZWF0ZSxcbiAgICAgIGNvbHVtblR5cGVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nQ29sdW1uTmFtZXMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICAgKTtcbiAgICAgIGlmIChleGlzdGluZ0NvbHVtbk5hbWVzLmluY2x1ZGVzKG5ld0NvbHVtbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogXCJUaGUgbmV3IGNvbHVtbiBuYW1lIG11c3QgYmUgdW5pcXVlXCIsXG4gICAgICAgICAgY29kZTogXCJXQl9DT0xVTU5fTkFNRV9FWElTVFNcIixcbiAgICAgICAgICBhcG9sbG9FcnJvcjogXCJCQURfVVNFUl9JTlBVVFwiLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld1R5cGUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS51bnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVwZGF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgbmV3VHlwZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdUeXBlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFBhc3MgZW1wdHkgY29sdW1uTmFtZXNbXSB0byBjbGVhclxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0NvbnN0cmFpbnROYW1lcyA9IE9iamVjdC52YWx1ZXMocmVzdWx0LnBheWxvYWQpO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIG11bHRpcGxlIGNvdWxtbiBwcmltYXJ5IGtleXMgd2lsbCBhbGwgaGF2ZSBzYW1lIGNvbnN0cmFpbnQgbmFtZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGV4aXN0aW5nQ29uc3RyYWludE5hbWVzWzBdIGFzIHN0cmluZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IFwiUmVtb3ZlIGV4aXN0aW5nIHByaW1hcnkga2V5IGZpcnN0XCIsXG4gICAgICAgICAgY29kZTogXCJXQl9QS19FWElTVFNcIixcbiAgICAgICAgICBhcG9sbG9FcnJvcjogXCJCQURfVVNFUl9JTlBVVFwiLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlUHJpbWFyeUtleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBjcmVhdGU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiQ1JFQVRFXCI7XG4gICAgaWYgKCFjcmVhdGUpIG9wZXJhdGlvbiA9IFwiQUREXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiREVMRVRFXCI7XG4gICAgaWYgKCFkZWwpIG9wZXJhdGlvbiA9IFwiUkVNT1ZFXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIFtdLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIG9wZXJhdGlvbiA9IFwiQUREfENSRUFURXxSRU1PVkV8REVMRVRFXCJcbiAgcHVibGljIGFzeW5jIHNldEZvcmVpZ25LZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzWzBdLFxuICAgICAgXCJGT1JFSUdOX0tFWVNcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0ZvcmVpZ25LZXlzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgZm9yIChjb25zdCBjb25zdHJhaW50SWQgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29uc3RyYWludElkLmNvbHVtbk5hbWVdID1cbiAgICAgICAgY29uc3RyYWludElkLmNvbnN0cmFpbnROYW1lO1xuICAgIH1cbiAgICAvLyBDaGVjayBmb3IgZXhpc3RpbmcgZm9yZWlnbiBrZXlzXG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdGb3JlaWduS2V5cykuaW5jbHVkZXMoY29sdW1uTmFtZSkpIHtcbiAgICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIlJFTU9WRVwiIHx8IG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRyb3BSZWxhdGlvbnNoaXBzKFxuICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgIHBhcmVudFRhYmxlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29sdW1uTmFtZV0gYXMgc3RyaW5nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBSZW1vdmUgZXhpc3RpbmcgZm9yZWlnbiBrZXkgb24gJHtjb2x1bW5OYW1lfSBmaXJzdGAsXG4gICAgICAgICAgICBjb2RlOiBcIldCX0ZLX0VYSVNUU1wiLFxuICAgICAgICAgICAgYXBvbGxvRXJyb3I6IFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9wZXJhdGlvbiA9PSBcIkFERFwiIHx8IG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAvLyByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICAvLyBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICAgIHBhcmVudENvbHVtbk5hbWVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgcGFyZW50VGFibGVOYW1lIC8vIGF1dGhvcnNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lcyAvLyBhdXRob3JfaWRcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRhYmxlVXNlcihcbiAgICB1c2VyRW1haWw6IHN0cmluZyxcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRhYmxlVXNlcih1c2VyRW1haWwsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWw6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVCeVNjaGVtYVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICB1c2VyUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10b29sc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10eXBlLWpzb25cIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImxvZGFzaFwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ2b2NhXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2hpdGVicmljay1jbG91ZC50c1wiKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7Ozs7Ozs7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUdBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7OztBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBOzs7Ozs7Ozs7O0FBVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBOEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7Ozs7Ozs7QUFRQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUF0eUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ2RBO0FBc0JBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQTFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDWEE7QUFTQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBN0JBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ1VBO0FBeUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUEvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUN6Q0E7QUFrQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQXZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNQQTtBQVVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0hBO0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE1QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFhQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUFyQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUM5QkE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFNQTtBQW9OQTtBQWxOQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBOztBQXhOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdU5BO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzNPQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBbUJBOzs7Ozs7Ozs7Ozs7OztBQWNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2pHQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTZCQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2RkE7QUFJQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEwQkE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFDQTtBQUFBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDekVBO0FBQ0E7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBMkhBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDL1VBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBK0NBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzdJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFtZ0NBO0FBNS9CQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBR0E7QUFDQTtBQU1BO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBS0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFJQTtBQUNBO0FBQUE7QUFNQTs7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFTQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUFBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBQ0E7QUFBQTtBQUNBO0FBUUE7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBUUE7QUFBQTtBQUdBOztBQVFBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBOztBQWhnQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7O0FDakNBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBIiwic291cmNlUm9vdCI6IiJ9