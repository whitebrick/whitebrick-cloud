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
    tenants() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.tenants.*
        FROM wb.tenants
      `,
            });
            if (result.success)
                result.payload = entity_1.Tenant.parseResult(result.payload);
            return result;
        });
    }
    tenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.tenants.*
        FROM wb.tenants
        WHERE id=$1 LIMIT 1
      `,
                params: [id],
            });
            if (result.success)
                result.payload = entity_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    tenantByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.tenants.*
        FROM wb.tenants
        WHERE name=$1 LIMIT 1
      `,
                params: [name],
            });
            if (result.success) {
                result.payload = entity_1.Tenant.parseResult(result.payload);
                if (result.payload.length == 0) {
                    return {
                        success: false,
                        message: `dal.tenantByName: Could not find tenant where name=${name}`,
                    };
                }
                else {
                    result.payload = result.payload[0];
                }
            }
            return result;
        });
    }
    createTenant(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.tenants(
          name, label, created_at, updated_at
        ) VALUES($1, $2, $3, $4)
        RETURNING *
      `,
                params: [name, label, new Date(), new Date()],
            });
            if (result.success)
                result.payload = entity_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    updateTenant(id, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!name && !label) {
                return {
                    success: false,
                    message: "dal.updateTenant: all parameters are null",
                };
            }
            let paramCount = 3;
            const params = [new Date(), id];
            let query = "UPDATE wb.tenants SET ";
            if (name) {
                query += `name=$${paramCount}, `;
                params.push(name);
                paramCount++;
            }
            if (label) {
                query += `label=$${paramCount}, `;
                params.push(label);
                paramCount++;
            }
            query += "updated_at=$1 WHERE id=$2 RETURNING *";
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteTestTenants() {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: `
          DELETE FROM wb.tenant_users
          WHERE tenant_id IN (
            SELECT id FROM wb.tenants WHERE name like 'test_%'
          )
        `,
                },
                {
                    query: `
          DELETE FROM wb.tenants WHERE name like 'test_%'
        `,
                },
            ]);
            return results[results.length - 1];
        });
    }
    addUserToTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.tenant_users(
          tenant_id, user_id, role_id, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5)
      `,
                params: [tenantId, userId, tenantRoleId, new Date(), new Date()],
            });
            return result;
        });
    }
    removeUserFromTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      DELETE FROM wb.tenant_users
      WHERE tenant_id=$1 AND user_id=$2
    `;
            const params = [tenantId, userId];
            if (tenantRoleId)
                query += " AND role_id=$3";
            params.push(tenantRoleId);
            const result = yield this.executeQuery({
                query: query,
                params: params,
            });
            return result;
        });
    }
    usersByTenantId(tenantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE tenant_id=$1
      `,
                params: [tenantId],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload);
            return result;
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE id=$1 LIMIT 1
      `,
                params: [id],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    userByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT * FROM wb.users
        WHERE email=$1 LIMIT 1
      `,
                params: [email],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    createUser(email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.users(
          email, first_name, last_name, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5) RETURNING *
      `,
                params: [email, firstName, lastName, new Date(), new Date()],
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
            const params = [new Date(), id];
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
    createSchema(name, label, tenantOwnerId, userOwnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: `CREATE SCHEMA ${DAL.sanitize(name)}`,
                },
                {
                    query: `
          INSERT INTO wb.schemas(
            name, label, tenant_owner_id, user_owner_id, created_at, updated_at
          ) VALUES($1, $2, $3, $4, $5, $6) RETURNING *
        `,
                    params: [
                        name,
                        label,
                        tenantOwnerId,
                        userOwnerId,
                        new Date(),
                        new Date(),
                    ],
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
          schema_id, user_id, role_id, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5)
      `,
                params: [schemaId, userId, schemaRoleId, new Date(), new Date()],
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
                case "REFERENCES":
                    whereSql = `
          AND ref.table_name LIKE '${tableNamePattern}'
          AND ref.column_name LIKE '${columnNamePattern}'
        `;
                case "ALL":
                    whereSql = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
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
        INSERT INTO wb.tables(schema_id, name, label, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
                    params: [
                        result.payload.id,
                        tableName,
                        tableLabel,
                        new Date(),
                        new Date(),
                    ],
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
          INSERT INTO wb.columns(table_id, name, label, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
                    params: [
                        result.payload.id,
                        columnName,
                        columnLabel,
                        new Date(),
                        new Date(),
                    ],
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
    saveTableUserSettings(tableId, userId, roleId, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.table_users (
          table_id, user_id, role_id, settings
        )
        VALUES($1, $2, $3, $4)
        ON CONFLICT (table_id, user_id, role_id) 
        DO UPDATE SET settings = EXCLUDED.settings
      `,
                params: [tableId, userId, roleId, settings],
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

/***/ "./src/entity/Role.ts":
/*!****************************!*\
  !*** ./src/entity/Role.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Role = void 0;
class Role {
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
        return role;
    }
}
exports.Role = Role;


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
        schema.tenantOwnerId = data.tenantOwnerId;
        schema.userOwnerId = data.userOwnerId;
        schema.createdAt = data.created_at;
        schema.updatedAt = data.updated_at;
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

/***/ "./src/entity/Tenant.ts":
/*!******************************!*\
  !*** ./src/entity/Tenant.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Tenant = void 0;
class Tenant {
    static parseResult(data) {
        if (!data)
            throw new Error("Tenant.parseResult: input is null");
        const tenants = Array();
        data.rows.forEach((row) => {
            tenants.push(Tenant.parse(row));
        });
        return tenants;
    }
    static parse(data) {
        if (!data)
            throw new Error("Tenant.parse: input is null");
        const tenant = new Tenant();
        tenant.id = data.id;
        tenant.name = data.name;
        tenant.label = data.label;
        tenant.createdAt = data.created_at;
        tenant.updatedAt = data.updated_at;
        return tenant;
    }
}
exports.Tenant = Tenant;


/***/ }),

/***/ "./src/entity/User.ts":
/*!****************************!*\
  !*** ./src/entity/User.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.User = void 0;
class User {
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
        user.firstName = data.first_name;
        user.lastName = data.last_name;
        user.createdAt = data.created_at;
        user.updatedAt = data.updated_at;
        return user;
    }
}
exports.User = User;


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
__exportStar(__webpack_require__(/*! ./Tenant */ "./src/entity/Tenant.ts"), exports);
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
const tenant_1 = __webpack_require__(/*! ./tenant */ "./src/types/tenant.ts");
const user_1 = __webpack_require__(/*! ./user */ "./src/types/user.ts");
const table_1 = __webpack_require__(/*! ./table */ "./src/types/table.ts");
const lodash_1 = __webpack_require__(/*! lodash */ "lodash");
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const graphql_constraint_directive_1 = __webpack_require__(/*! graphql-constraint-directive */ "graphql-constraint-directive");
const graphql_tools_1 = __webpack_require__(/*! graphql-tools */ "graphql-tools");
const typeDefs = apollo_server_lambda_1.gql `
  type Query {
    wbHealthCheck: String!
  }

  type Mutation {
    wbResetTestData: Boolean!
  }
`;
const resolvers = {
    Query: {
        wbHealthCheck: () => "All good",
    },
    Mutation: {
        wbResetTestData: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.resetTestData();
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
    },
};
exports.schema = graphql_tools_1.makeExecutableSchema({
    typeDefs: [
        graphql_constraint_directive_1.constraintDirectiveTypeDefs,
        typeDefs,
        tenant_1.typeDefs,
        user_1.typeDefs,
        schema_1.typeDefs,
        table_1.typeDefs,
    ],
    resolvers: lodash_1.merge(resolvers, tenant_1.resolvers, user_1.resolvers, schema_1.resolvers, table_1.resolvers),
    schemaTransforms: [graphql_constraint_directive_1.constraintDirective()],
});


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
    tenantOwnerId: Int
    userOwnerId: Int
    userRole: String
    context: JSON
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
      tenantOwnerId: Int
      tenantOwnerName: String
      userOwnerId: Int
      userOwnerEmail: String
    ): Schema
  }
`;
exports.resolvers = {
    Query: {
        wbSchemas: (_, { userEmail }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.accessibleSchemas(userEmail);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateSchema: (_, { name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createSchema(name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail);
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

/***/ "./src/types/tenant.ts":
/*!*****************************!*\
  !*** ./src/types/tenant.ts ***!
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
  type Tenant {
    id: ID!
    name: String!
    label: String!
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbTenants: [Tenant]
    wbTenantById(id: ID!): Tenant
    wbTenantByName(name: String!): Tenant
  }

  extend type Mutation {
    wbCreateTenant(name: String!, label: String!): Tenant
    wbUpdateTenant(id: ID!, name: String, label: String): Tenant
  }
`;
exports.resolvers = {
    Query: {
        wbTenants: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenants();
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbTenantById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenantById(id);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbTenantByName: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenantByName(name);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateTenant: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createTenant(name, label);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateTenant: (_, { id, name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateTenant(id, name, label);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
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
  }

  extend type Query {
    wbUsersByTenantId(tenantId: ID!): [User]
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
    Tenant-User-Roles
    """
    wbAddUserToTenant(
      tenantName: String!
      userEmail: String!
      tenantRole: String!
    ): User
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
        wbUsersByTenantId: (_, { tenantId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.usersByTenantId(tenantId);
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
        wbAddUserToTenant: (_, { tenantName, userEmail, tenantRole }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addUserToTenant(tenantName, userEmail, tenantRole);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
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
    context: function () {
        return {
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
    addSchemaContext(schema) {
        schema.context = {
            defaultColumnTypes: entity_1.Column.COMMON_TYPES,
        };
        return schema;
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
            result = yield this.dal.deleteTestTenants();
            if (!result.success)
                return result;
            result = yield this.dal.deleteTestUsers();
            return result;
        });
    }
    tenants() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.tenants();
        });
    }
    tenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.tenantById(id);
        });
    }
    tenantByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.tenantByName(name);
        });
    }
    createTenant(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.createTenant(name, label);
        });
    }
    updateTenant(id, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.updateTenant(id, name, label);
        });
    }
    deleteTestTenants() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.deleteTestTenants();
        });
    }
    addUserToTenant(tenantName, userEmail, tenantRole) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`whitebrickCloud.addUserToTenant: ${tenantName}, ${userEmail}, ${tenantRole}`);
            const userResult = yield this.dal.userByEmail(userEmail);
            if (!userResult.success)
                return userResult;
            const tenantResult = yield this.dal.tenantByName(tenantName);
            if (!tenantResult.success)
                return tenantResult;
            const roleResult = yield this.dal.roleByName(tenantRole);
            if (!roleResult.success)
                return roleResult;
            const result = yield this.dal.addUserToTenant(tenantResult.payload.id, userResult.payload.id, roleResult.payload.id);
            if (!result.success)
                return result;
            return userResult;
        });
    }
    usersByTenantId(tenantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.usersByTenantId(tenantId);
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.userById(id);
        });
    }
    userByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.userByEmail(email);
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
    createSchema(name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`
      wbCloud.createSchema name=${name},
      label=${label},
      tenantOwnerId=${tenantOwnerId},
      tenantOwnerName=${tenantOwnerName},
      userOwnerId=${userOwnerId},
      userOwnerEmail=${userOwnerEmail}
    `);
            let result;
            if (!tenantOwnerId && !userOwnerId) {
                if (tenantOwnerName) {
                    result = yield this.dal.tenantByName(tenantOwnerName);
                    if (!result.success)
                        return result;
                    tenantOwnerId = result.payload.id;
                }
                else if (userOwnerEmail) {
                    result = yield this.dal.userByEmail(userOwnerEmail);
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
            if (name.startsWith("pg_") || entity_1.Schema.SYS_SCHEMA_NAMES.includes(name)) {
                return {
                    success: false,
                    message: `Database name can not begin with 'pg_' or be in the reserved list: ${entity_1.Schema.SYS_SCHEMA_NAMES.join(", ")}`,
                    code: "WB_SCHEMA_NAME",
                    apolloError: "BAD_USER_INPUT",
                };
            }
            return yield this.dal.createSchema(name, label, tenantOwnerId, userOwnerId);
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
    addUserToSchema(schemaName, userEmail, schemaRole) {
        return __awaiter(this, void 0, void 0, function* () {
            const userResult = yield this.dal.userByEmail(userEmail);
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
            const userRolesResult = yield this.dal.schemasByUser(userEmail);
            if (!userRolesResult.success)
                return userRolesResult;
            const schemas = [];
            for (const schema of schemaOwnerResult.payload.concat(userRolesResult.payload)) {
                schemas.push(this.addSchemaContext(schema));
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
            const userResult = yield this.dal.userByEmail(userEmail);
            if (!userResult.success)
                return userResult;
            const roleResult = yield this.dal.roleByName("table_inherit");
            if (!roleResult.success)
                return roleResult;
            return this.dal.saveTableUserSettings(tableResult.payload.id, userResult.payload.id, roleResult.payload.id, settings);
        });
    }
}


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGFibGVVc2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1RlbmFudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Vc2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW52aXJvbm1lbnQudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9oYXN1cmEtYXBpLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvaW5kZXgudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy9zY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy90YWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL3RlbmFudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL3VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy93aGl0ZWJyaWNrLWNsb3VkLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJheGlvc1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdG9vbHNcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC10eXBlLWpzb25cIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwibG9kYXNoXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInBnXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInRzbG9nXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInZvY2FcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFRlbmFudCwgVXNlciwgUm9sZSwgU2NoZW1hLCBUYWJsZSwgQ29sdW1uLCBUYWJsZVVzZXIgfSBmcm9tIFwiLi9lbnRpdHlcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgUXVlcnlQYXJhbXMsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgREFMIHtcbiAgcHJpdmF0ZSBwb29sOiBQb29sO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMucG9vbCA9IG5ldyBQb29sKHtcbiAgICAgIGRhdGFiYXNlOiBlbnZpcm9ubWVudC5kYk5hbWUsXG4gICAgICBob3N0OiBlbnZpcm9ubWVudC5kYkhvc3QsXG4gICAgICBwb3J0OiBlbnZpcm9ubWVudC5kYlBvcnQsXG4gICAgICB1c2VyOiBlbnZpcm9ubWVudC5kYlVzZXIsXG4gICAgICBwYXNzd29yZDogZW52aXJvbm1lbnQuZGJQYXNzd29yZCxcbiAgICAgIG1heDogZW52aXJvbm1lbnQuZGJQb29sTWF4LFxuICAgICAgaWRsZVRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgICAgY29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gdXNlZCBmb3IgRERMIGlkZW50aWZpZXJzIChlZyBDUkVBVEUgVEFCTEUgc2FuaXRpemUodGFibGVOYW1lKSlcbiAgcHVibGljIHN0YXRpYyBzYW5pdGl6ZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXlxcdyVdKy9nLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtcyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtxdWVyeVBhcmFtc10pO1xuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBleGVjdXRlUXVlcmllcyhcbiAgICBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0W10+IHtcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLnBvb2wuY29ubmVjdCgpO1xuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gW107XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkJFR0lOXCIpO1xuICAgICAgZm9yIChjb25zdCBxdWVyeVBhcmFtcyBvZiBxdWVyaWVzQW5kUGFyYW1zKSB7XG4gICAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgICBgZGFsLmV4ZWN1dGVRdWVyeSBRdWVyeVBhcmFtczogJHtxdWVyeVBhcmFtcy5xdWVyeX1gLFxuICAgICAgICAgIHF1ZXJ5UGFyYW1zLnBhcmFtc1xuICAgICAgICApO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5xdWVyeShcbiAgICAgICAgICBxdWVyeVBhcmFtcy5xdWVyeSxcbiAgICAgICAgICBxdWVyeVBhcmFtcy5wYXJhbXNcbiAgICAgICAgKTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIHBheWxvYWQ6IHJlc3BvbnNlLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiQ09NTUlUXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcbiAgICAgIGxvZy5lcnJvcihKU09OLnN0cmluZ2lmeShlcnJvcikpO1xuICAgICAgcmVzdWx0cy5wdXNoKDxTZXJ2aWNlUmVzdWx0PntcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgIGNvZGU6IFwiUEdfXCIgKyBlcnJvci5jb2RlLFxuICAgICAgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlbmFudHNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRlbmFudHMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnRlbmFudHMuKlxuICAgICAgICBGUk9NIHdiLnRlbmFudHNcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRlbmFudC5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGVuYW50cy4qXG4gICAgICAgIEZST00gd2IudGVuYW50c1xuICAgICAgICBXSEVSRSBpZD0kMSBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbaWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50ZW5hbnRzLipcbiAgICAgICAgRlJPTSB3Yi50ZW5hbnRzXG4gICAgICAgIFdIRVJFIG5hbWU9JDEgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiAoPFNlcnZpY2VSZXN1bHQ+e1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IGBkYWwudGVuYW50QnlOYW1lOiBDb3VsZCBub3QgZmluZCB0ZW5hbnQgd2hlcmUgbmFtZT0ke25hbWV9YCxcbiAgICAgICAgfSkgYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVGVuYW50KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnRlbmFudHMoXG4gICAgICAgICAgbmFtZSwgbGFiZWwsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXRcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQpXG4gICAgICAgIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWwsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGVuYW50KFxuICAgIGlkOiBudW1iZXIsXG4gICAgbmFtZT86IHN0cmluZyxcbiAgICBsYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIW5hbWUgJiYgIWxhYmVsKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogXCJkYWwudXBkYXRlVGVuYW50OiBhbGwgcGFyYW1ldGVycyBhcmUgbnVsbFwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgRGF0ZSB8IHN0cmluZylbXSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudGVuYW50cyBTRVQgXCI7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHF1ZXJ5ICs9IGBuYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2gobmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChsYWJlbCkge1xuICAgICAgcXVlcnkgKz0gYGxhYmVsPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2gobGFiZWwpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBxdWVyeSArPSBcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RUZW5hbnRzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50ZW5hbnRfdXNlcnNcbiAgICAgICAgICBXSEVSRSB0ZW5hbnRfaWQgSU4gKFxuICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGVuYW50cyBXSEVSRSBuYW1lIGxpa2UgJ3Rlc3RfJSdcbiAgICAgICAgICApXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRlbmFudHMgV0hFUkUgbmFtZSBsaWtlICd0ZXN0XyUnXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF0pO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogVGVuYW50LVVzZXItUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJUb1RlbmFudChcbiAgICB0ZW5hbnRJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHRlbmFudFJvbGVJZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnRlbmFudF91c2VycyhcbiAgICAgICAgICB0ZW5hbnRfaWQsIHVzZXJfaWQsIHJvbGVfaWQsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXRcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1KVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3RlbmFudElkLCB1c2VySWQsIHRlbmFudFJvbGVJZCwgbmV3IERhdGUoKSwgbmV3IERhdGUoKV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVVc2VyRnJvbVRlbmFudChcbiAgICB0ZW5hbnRJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHRlbmFudFJvbGVJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBERUxFVEUgRlJPTSB3Yi50ZW5hbnRfdXNlcnNcbiAgICAgIFdIRVJFIHRlbmFudF9pZD0kMSBBTkQgdXNlcl9pZD0kMlxuICAgIGA7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgdW5kZWZpbmVkKVtdID0gW3RlbmFudElkLCB1c2VySWRdO1xuICAgIGlmICh0ZW5hbnRSb2xlSWQpIHF1ZXJ5ICs9IFwiIEFORCByb2xlX2lkPSQzXCI7XG4gICAgcGFyYW1zLnB1c2godGVuYW50Um9sZUlkKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFVzZXJzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICAgIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgdGVuYW50X2lkPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbdGVuYW50SWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudXNlcnMuKlxuICAgICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGlkPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtpZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5RW1haWwoZW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCAqIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgZW1haWw9JDEgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2VtYWlsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0XG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSkgUkVUVVJOSU5HICpcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSwgbmV3IERhdGUoKSwgbmV3IERhdGUoKV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsPzogc3RyaW5nLFxuICAgIGZpcnN0TmFtZT86IHN0cmluZyxcbiAgICBsYXN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWVtYWlsICYmICFmaXJzdE5hbWUgJiYgIWxhc3ROYW1lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogXCJkYWwudXBkYXRlVXNlcjogYWxsIHBhcmFtZXRlcnMgYXJlIG51bGxcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgbGV0IHBhcmFtQ291bnQgPSAzO1xuICAgIGNvbnN0IHBhcmFtczogKERhdGUgfCBudW1iZXIgfCBzdHJpbmcpW10gPSBbbmV3IERhdGUoKSwgaWRdO1xuICAgIGxldCBxdWVyeSA9IFwiVVBEQVRFIHdiLnVzZXJzIFNFVCBcIjtcbiAgICBpZiAoZW1haWwpIHtcbiAgICAgIHF1ZXJ5ICs9IGBlbWFpbD0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGVtYWlsKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgaWYgKGZpcnN0TmFtZSkge1xuICAgICAgcXVlcnkgKz0gYGZpcnN0X25hbWU9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgICBwYXJhbXMucHVzaChmaXJzdE5hbWUpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBpZiAobGFzdE5hbWUpIHtcbiAgICAgIHF1ZXJ5ICs9IGBsYXN0X25hbWU9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgICBwYXJhbXMucHVzaChsYXN0TmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIHF1ZXJ5ICs9IFwidXBkYXRlZF9hdD0kMSBXSEVSRSBpZD0kMiBSRVRVUk5JTkcgKlwiO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RVc2VycygpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSB3Yi51c2Vyc1xuICAgICAgICBXSEVSRSBlbWFpbCBsaWtlICd0ZXN0XyV0ZXN0LndoaXRlYnJpY2suY29tJ1xuICAgICAgYCxcbiAgICAgIHBhcmFtczogW10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuKlxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgIFdIRVJFIG5hbWU9JDEgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBSb2xlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVtYXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZyxcbiAgICB0ZW5hbnRPd25lcklkPzogbnVtYmVyLFxuICAgIHVzZXJPd25lcklkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgU0NIRU1BICR7REFMLnNhbml0aXplKG5hbWUpfWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnNjaGVtYXMoXG4gICAgICAgICAgICBuYW1lLCBsYWJlbCwgdGVuYW50X293bmVyX2lkLCB1c2VyX293bmVyX2lkLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0XG4gICAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1LCAkNikgUkVUVVJOSU5HICpcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICBsYWJlbCxcbiAgICAgICAgICB0ZW5hbnRPd25lcklkLFxuICAgICAgICAgIHVzZXJPd25lcklkLFxuICAgICAgICAgIG5ldyBEYXRlKCksXG4gICAgICAgICAgbmV3IERhdGUoKSxcbiAgICAgICAgXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgY29uc3QgaW5zZXJ0UmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICAgIGlmIChpbnNlcnRSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgaW5zZXJ0UmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQoaW5zZXJ0UmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gaW5zZXJ0UmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXMoc2NoZW1hTmFtZVBhdHRlcm4/OiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIXNjaGVtYU5hbWVQYXR0ZXJuKSBzY2hlbWFOYW1lUGF0dGVybiA9IFwiJVwiO1xuICAgIHNjaGVtYU5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YS4qXG4gICAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcbiAgICAgICAgICBXSEVSRSBzY2hlbWFfbmFtZSBMSUtFICQxXG4gICAgICAgICAgQU5EIHNjaGVtYV9uYW1lIE5PVCBMSUtFICdwZ18lJ1xuICAgICAgICAgIEFORCBzY2hlbWFfbmFtZSBOT1QgSU4gKCcke1NjaGVtYS5TWVNfU0NIRU1BX05BTUVTLmpvaW4oXCInLCdcIil9JylcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZVBhdHRlcm5dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBTRUxFQ1Qgd2Iuc2NoZW1hcy4qXG4gICAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgV0hFUkUgbmFtZSBMSUtFICQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2VzcyAmJiByZXN1bHRzWzFdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHRzWzBdLnBheWxvYWQpO1xuICAgICAgcmVzdWx0c1sxXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMV0ucGF5bG9hZCk7XG4gICAgICBpZiAocmVzdWx0c1swXS5wYXlsb2FkLmxlbmd0aCAhPSByZXN1bHRzWzFdLnBheWxvYWQubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgIFwiZGFsLnNjaGVtYXM6IHdiLnNjaGVtYXMgb3V0IG9mIHN5bmMgd2l0aCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iuc2NoZW1hcy4qXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gKDxTZXJ2aWNlUmVzdWx0PntcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBtZXNzYWdlOiBgZGFsLnNjaGVtYUJ5TmFtZTogQ291bGQgbm90IGZpbmQgc2NoZW1hIHdoZXJlIG5hbWU9JHtuYW1lfWAsXG4gICAgICAgIH0pIGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcih1c2VyRW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi5zY2hlbWFzLiogRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hcy51c2VyX293bmVyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIFdIRVJFIHdiLnVzZXJzLmVtYWlsPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbdXNlckVtYWlsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIC8vIFRCRDogbWFwIHRoaXMgaW5zdGVhZFxuICAgICAgY29uc3Qgc2NoZW1hc1dpdGhSb2xlID0gQXJyYXk8U2NoZW1hPigpO1xuICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKSkge1xuICAgICAgICBzY2hlbWEudXNlclJvbGUgPSBcInNjaGVtYV9vd25lclwiO1xuICAgICAgICBzY2hlbWFzV2l0aFJvbGUucHVzaChzY2hlbWEpO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBzY2hlbWFzV2l0aFJvbGU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNDSEVNQSBJRiBFWElTVFMgJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9IENBU0NBREVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogU2NoZW1hLVVzZXItUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJUb1NjaGVtYShcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNjaGVtYVJvbGVJZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnNjaGVtYV91c2VycyhcbiAgICAgICAgICBzY2hlbWFfaWQsIHVzZXJfaWQsIHJvbGVfaWQsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXRcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1KVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYUlkLCB1c2VySWQsIHNjaGVtYVJvbGVJZCwgbmV3IERhdGUoKSwgbmV3IERhdGUoKV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVVc2VyRnJvbVNjaGVtYShcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNjaGVtYVJvbGVJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMSBBTkQgdXNlcl9pZD0kMlxuICAgIGA7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgdW5kZWZpbmVkKVtdID0gW3NjaGVtYUlkLCB1c2VySWRdO1xuICAgIGlmIChzY2hlbWFSb2xlSWQpIHF1ZXJ5ICs9IFwiIEFORCByb2xlX2lkPSQzXCI7XG4gICAgcGFyYW1zLnB1c2goc2NoZW1hUm9sZUlkKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXIodXNlckVtYWlsOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iuc2NoZW1hcy4qLCB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iuc2NoZW1hcy5pZD13Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3VzZXJFbWFpbF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAvLyBUQkQ6IG1hcCB0aGlzIGluc3RlYWRcbiAgICAgIGNvbnN0IHNjaGVtYXNXaXRoUm9sZSA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICAgIGxldCBzY2hlbWE6IFNjaGVtYTtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgICAgc2NoZW1hID0gU2NoZW1hLnBhcnNlKHJvdyk7XG4gICAgICAgIHNjaGVtYS51c2VyUm9sZSA9IHJvdy5yb2xlX25hbWU7XG4gICAgICAgIHNjaGVtYXNXaXRoUm9sZS5wdXNoKHNjaGVtYSk7XG4gICAgICB9KTtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gc2NoZW1hc1dpdGhSb2xlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVzKHNjaGVtYU5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKlxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaXNjb3ZlclRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcy50YWJsZV9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlc1xuICAgICAgICBXSEVSRSB0YWJsZV9zY2hlbWE9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93cy5tYXAoXG4gICAgICAgIChyb3c6IHsgdGFibGVfbmFtZTogc3RyaW5nIH0pID0+IHJvdy50YWJsZV9uYW1lXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbkJ5U2NoZW1hVGFibGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLmNvbHVtbnMuKiwgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuZGF0YV90eXBlIGFzIHR5cGVcbiAgICAgIEZST00gd2IuY29sdW1uc1xuICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IuY29sdW1ucy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgT04gKFxuICAgICAgICB3Yi5jb2x1bW5zLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWVcbiAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9zY2hlbWFcbiAgICAgIClcbiAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX25hbWU9JDJcbiAgICBgO1xuICAgIGxldCBwYXJhbXM6IHN0cmluZ1tdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9IEFORCB3Yi5jb2x1bW5zLm5hbWU9JDMgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lPSQzYDtcbiAgICAgIHBhcmFtcy5wdXNoKGNvbHVtbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyQ29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gdHlwZSA9IGZvcmVpZ25LZXlzfHJlZmVyZW5jZXN8YWxsXG4gIHB1YmxpYyBhc3luYyBmb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lUGF0dGVybjogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWVQYXR0ZXJuKTtcbiAgICBjb2x1bW5OYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lUGF0dGVybik7XG4gICAgbGV0IHdoZXJlU3FsOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSBcIkZPUkVJR05fS0VZU1wiOlxuICAgICAgICB3aGVyZVNxbCA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgIGNhc2UgXCJSRUZFUkVOQ0VTXCI6XG4gICAgICAgIHdoZXJlU3FsID0gYFxuICAgICAgICAgIEFORCByZWYudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCByZWYuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICBjYXNlIFwiQUxMXCI6XG4gICAgICAgIHdoZXJlU3FsID0gYFxuICAgICAgICAgIEFORCBmay50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIGZrLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgLS0gdW5pcXVlIHJlZmVyZW5jZSBpbmZvXG4gICAgICAgIHJlZi50YWJsZV9uYW1lICAgICAgIEFTIHJlZl90YWJsZSxcbiAgICAgICAgcmVmLmNvbHVtbl9uYW1lICAgICAgQVMgcmVmX2NvbHVtbixcbiAgICAgICAgcmVmZC5jb25zdHJhaW50X3R5cGUgQVMgcmVmX3R5cGUsIC0tIGUuZy4gVU5JUVVFIG9yIFBSSU1BUlkgS0VZXG4gICAgICAgIC0tIGZvcmVpZ24ga2V5IGluZm9cbiAgICAgICAgZmsudGFibGVfbmFtZSAgICAgICAgQVMgZmtfdGFibGUsXG4gICAgICAgIGZrLmNvbHVtbl9uYW1lICAgICAgIEFTIGZrX2NvbHVtbixcbiAgICAgICAgZmsuY29uc3RyYWludF9uYW1lICAgQVMgZmtfbmFtZSxcbiAgICAgICAgbWFwLnVwZGF0ZV9ydWxlICAgICAgQVMgZmtfb25fdXBkYXRlLFxuICAgICAgICBtYXAuZGVsZXRlX3J1bGUgICAgICBBUyBma19vbl9kZWxldGVcbiAgICAgICAgLS0gbGlzdHMgZmsgY29uc3RyYWludHMgQU5EIG1hcHMgdGhlbSB0byBwayBjb25zdHJhaW50c1xuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5yZWZlcmVudGlhbF9jb25zdHJhaW50cyBBUyBtYXBcbiAgICAgICAgLS0gam9pbiB1bmlxdWUgY29uc3RyYWludHMgKGUuZy4gUEtzIGNvbnN0cmFpbnRzKSB0byByZWYgY29sdW1ucyBpbmZvXG4gICAgICAgIElOTkVSIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmtleV9jb2x1bW5fdXNhZ2UgQVMgcmVmXG4gICAgICAgIE9OICByZWYuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZi5jb25zdHJhaW50X3NjaGVtYSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZi5jb25zdHJhaW50X25hbWUgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBvcHRpb25hbDogdG8gaW5jbHVkZSByZWZlcmVuY2UgY29uc3RyYWludCB0eXBlXG4gICAgICAgIExFRlQgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVfY29uc3RyYWludHMgQVMgcmVmZFxuICAgICAgICBPTiAgcmVmZC5jb25zdHJhaW50X2NhdGFsb2cgPSByZWYuY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCByZWZkLmNvbnN0cmFpbnRfc2NoZW1hID0gcmVmLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCByZWZkLmNvbnN0cmFpbnRfbmFtZSA9IHJlZi5jb25zdHJhaW50X25hbWVcbiAgICAgICAgLS0gam9pbiBmayBjb2x1bW5zIHRvIHRoZSBjb3JyZWN0IHJlZiBjb2x1bW5zIHVzaW5nIG9yZGluYWwgcG9zaXRpb25zXG4gICAgICAgIElOTkVSIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmtleV9jb2x1bW5fdXNhZ2UgQVMgZmtcbiAgICAgICAgT04gIGZrLmNvbnN0cmFpbnRfY2F0YWxvZyA9IG1hcC5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCBmay5jb25zdHJhaW50X25hbWUgPSBtYXAuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEFORCBmay5wb3NpdGlvbl9pbl91bmlxdWVfY29uc3RyYWludCA9IHJlZi5vcmRpbmFsX3Bvc2l0aW9uIC0tSU1QT1JUQU5UIVxuICAgICAgICBXSEVSRSByZWYudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgZmsudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICAke3doZXJlU3FsfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRzOiBDb25zdHJhaW50SWRbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnQ6IENvbnN0cmFpbnRJZCA9IHtcbiAgICAgICAgY29uc3RyYWludE5hbWU6IHJvdy5ma19uYW1lLFxuICAgICAgICB0YWJsZU5hbWU6IHJvdy5ma190YWJsZSxcbiAgICAgICAgY29sdW1uTmFtZTogcm93LmZrX2NvbHVtbixcbiAgICAgICAgcmVsVGFibGVOYW1lOiByb3cucmVmX3RhYmxlLFxuICAgICAgICByZWxDb2x1bW5OYW1lOiByb3cucmVmX2NvbHVtbixcbiAgICAgIH07XG4gICAgICBjb25zdHJhaW50cy5wdXNoKGNvbnN0cmFpbnQpO1xuICAgIH1cbiAgICByZXN1bHQucGF5bG9hZCA9IGNvbnN0cmFpbnRzO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcHJpbWFyeUtleXMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIERJU1RJTkNUIGMuY29sdW1uX25hbWUsIHRjLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyB0YyBcbiAgICAgICAgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEuY29uc3RyYWludF9jb2x1bW5fdXNhZ2UgQVMgY2N1XG4gICAgICAgIFVTSU5HIChjb25zdHJhaW50X3NjaGVtYSwgY29uc3RyYWludF9uYW1lKVxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIEFTIGNcbiAgICAgICAgT04gYy50YWJsZV9zY2hlbWEgPSB0Yy5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9IGMudGFibGVfbmFtZVxuICAgICAgICBBTkQgY2N1LmNvbHVtbl9uYW1lID0gYy5jb2x1bW5fbmFtZVxuICAgICAgICBXSEVSRSBjb25zdHJhaW50X3R5cGUgPSAnUFJJTUFSWSBLRVknXG4gICAgICAgIEFORCBjLnRhYmxlX3NjaGVtYT0nJHtzY2hlbWFOYW1lfSdcbiAgICAgICAgQU5EIHRjLnRhYmxlX25hbWUgPSAnJHt0YWJsZU5hbWV9J1xuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGNvbnN0IHBLQ29sc0NvbnN0cmFpbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucGF5bG9hZC5yb3dzKSB7XG4gICAgICAgIHBLQ29sc0NvbnN0cmFpbnRzW3Jvdy5jb2x1bW5fbmFtZV0gPSByb3cuY29uc3RyYWludF9uYW1lO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBwS0NvbHNDb25zdHJhaW50cztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVDb25zdHJhaW50KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb25zdHJhaW50TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3RyYWludE5hbWUgPSBEQUwuc2FuaXRpemUoY29uc3RyYWludE5hbWUpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIERST1AgQ09OU1RSQUlOVCBJRiBFWElTVFMgJHtjb25zdHJhaW50TmFtZX1cbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVQcmltYXJ5S2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgQUREIFBSSU1BUlkgS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSk7XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmNyZWF0ZUZvcmVpZ25LZXkoJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtwYXJlbnRUYWJsZU5hbWV9LCR7cGFyZW50Q29sdW1uTmFtZXN9KWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIHBhcmVudFRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZShwYXJlbnRUYWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZFBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgcGFyZW50Q29sdW1uTmFtZSBvZiBwYXJlbnRDb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUocGFyZW50Q29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgQ09OU1RSQUlOVCAke3RhYmxlTmFtZX1fJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiX1wiKX1fZmtleVxuICAgICAgICBGT1JFSUdOIEtFWSAoJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pXG4gICAgICAgIFJFRkVSRU5DRVMgJHtzY2hlbWFOYW1lfS4ke3BhcmVudFRhYmxlTmFtZX1cbiAgICAgICAgICAoJHtzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pXG4gICAgICAgIE9OIERFTEVURSBTRVQgTlVMTFxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRhYmxlQnlTY2hlbWFUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy4qXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlVGFibGUgJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHt0YWJsZUxhYmVsfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2IudGFibGVzKHNjaGVtYV9pZCwgbmFtZSwgbGFiZWwsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpXG4gICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMywgJDQsICQ1KVxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbXG4gICAgICAgICAgcmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIHRhYmxlTGFiZWwsXG4gICAgICAgICAgbmV3IERhdGUoKSxcbiAgICAgICAgICBuZXcgRGF0ZSgpLFxuICAgICAgICBdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgQ1JFQVRFIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIoKWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVzXG4gICAgICAgICAgV0hFUkUgc2NoZW1hX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCB0YWJsZU5hbWVdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIiBDQVNDQURFYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBuZXdUYWJsZU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3VGFibGVMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi50YWJsZXMgU0VUXG4gICAgYDtcbiAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1RhYmxlTGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgVE8gJHtuZXdUYWJsZU5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbkxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlOiBib29sZWFuLFxuICAgIGNvbHVtblBHVHlwZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlQ29sdW1uICR7c2NoZW1hTmFtZX0gJHt0YWJsZU5hbWV9ICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5MYWJlbH0gJHtjb2x1bW5QR1R5cGV9ICR7Y3JlYXRlfWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi5jb2x1bW5zKHRhYmxlX2lkLCBuYW1lLCBsYWJlbCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdClcbiAgICAgICAgICBWQUxVRVMgKCQxLCAkMiwgJDMsICQ0LCAkNSlcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbXG4gICAgICAgICAgcmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgICBjb2x1bW5MYWJlbCxcbiAgICAgICAgICBuZXcgRGF0ZSgpLFxuICAgICAgICAgIG5ldyBEYXRlKCksXG4gICAgICAgIF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgQUREICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5QR1R5cGV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtdO1xuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld0NvbHVtbkxhYmVsKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5CeVNjaGVtYVRhYmxlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgICBVUERBVEUgd2IuY29sdW1ucyBTRVRcbiAgICAgIGA7XG4gICAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICAgIHBhcmFtcy5wdXNoKG5ld0NvbHVtbk5hbWUpO1xuICAgICAgICB1cGRhdGVzLnB1c2goXCJuYW1lPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgaWYgKG5ld0NvbHVtbkxhYmVsKSB7XG4gICAgICAgIHBhcmFtcy5wdXNoKG5ld0NvbHVtbkxhYmVsKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBpZiAobmV3VHlwZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgQUxURVIgQ09MVU1OICR7Y29sdW1uTmFtZX0gVFlQRSAke25ld1R5cGV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIFJFTkFNRSBDT0xVTU4gJHtjb2x1bW5OYW1lfSBUTyAke25ld0NvbHVtbk5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbHVtbk5hbWUgPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IuY29sdW1uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5OYW1lfSBDQVNDQURFXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZSBVc2Vyc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VyKFxuICAgIHVzZXJFbWFpbDogc3RyaW5nLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVfdXNlcnMuKlxuICAgICAgICBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMSBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyIEFORCB3Yi50YWJsZXMubmFtZT0kM1xuICAgICAgICBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbdXNlckVtYWlsLCBzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZVVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVRhYmxlVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM/OiBbc3RyaW5nXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcGFyYW1zID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgREVMRVRFIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkIElOIChcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy5pZCBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgICBBTkQgd2IudGFibGVzLm5hbWU9JDJcbiAgICAgIClcbiAgICBgO1xuICAgIGlmICh1c2VyRW1haWxzICYmIHVzZXJFbWFpbHMubGVuZ3RoID4gMCkge1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlscy5qb2luKFwiLFwiKSk7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIEFORCB3Yi50YWJsZV91c2Vycy51c2VyX2lkIElOIChcbiAgICAgICAgICBTRUxFQ1Qgd2IudXNlcnMuaWQgZnJvbSB3Yi51c2Vyc1xuICAgICAgICAgIFdIRVJFIGVtYWlsIElOICQzXG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIHRhYmxlSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICByb2xlSWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlX3VzZXJzIChcbiAgICAgICAgICB0YWJsZV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgc2V0dGluZ3NcbiAgICAgICAgKVxuICAgICAgICBWQUxVRVMoJDEsICQyLCAkMywgJDQpXG4gICAgICAgIE9OIENPTkZMSUNUICh0YWJsZV9pZCwgdXNlcl9pZCwgcm9sZV9pZCkgXG4gICAgICAgIERPIFVQREFURSBTRVQgc2V0dGluZ3MgPSBFWENMVURFRC5zZXR0aW5nc1xuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3RhYmxlSWQsIHVzZXJJZCwgcm9sZUlkLCBzZXR0aW5nc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQ29sdW1uIHtcbiAgc3RhdGljIENPTU1PTl9UWVBFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBUZXh0OiBcInRleHRcIixcbiAgICBOdW1iZXI6IFwiaW50ZWdlclwiLFxuICAgIERlY2ltYWw6IFwiZGVjaW1hbFwiLFxuICAgIEJvb2xlYW46IFwiYm9vbGVhblwiLFxuICAgIERhdGU6IFwiZGF0ZVwiLFxuICAgIFwiRGF0ZSAmIFRpbWVcIjogXCJ0aW1lc3RhbXBcIixcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIHR5cGUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgaXNQcmltYXJ5S2V5ITogYm9vbGVhbjtcbiAgZm9yZWlnbktleXMhOiBbQ29uc3RyYWludElkXTtcbiAgcmVmZXJlbmNlZEJ5ITogW0NvbnN0cmFpbnRJZF07XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxDb2x1bW4+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIkNvbHVtbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBjb2x1bW5zID0gQXJyYXk8Q29sdW1uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgY29sdW1ucy5wdXNoKENvbHVtbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29sdW1ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IENvbHVtbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgIGNvbHVtbi5pZCA9IGRhdGEuaWQ7XG4gICAgY29sdW1uLnRhYmxlSWQgPSBkYXRhLnRhYmxlX2lkO1xuICAgIGNvbHVtbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIGNvbHVtbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgY29sdW1uLnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgY29sdW1uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBjb2x1bW4udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiBjb2x1bW47XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCB0eXBlIFJvbGVOYW1lID1cbiAgfCBcInRlbmFudF91c2VyXCJcbiAgfCBcInRlbmFudF9hZG1pblwiXG4gIHwgXCJzY2hlbWFfb3duZXJcIlxuICB8IFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIlxuICB8IFwic2NoZW1hX2VkaXRvclwiXG4gIHwgXCJzY2hlbWFfY29tbWVudGVyXCJcbiAgfCBcInNjaGVtYV9yZWFkZXJcIjtcblxuZXhwb3J0IGNsYXNzIFJvbGUge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFJvbGU+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlJvbGUucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgcm9sZXMgPSBBcnJheTxSb2xlPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgcm9sZXMucHVzaChSb2xlLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiByb2xlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFJvbGUge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiUm9sZS5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCByb2xlID0gbmV3IFJvbGUoKTtcbiAgICByb2xlLmlkID0gZGF0YS5pZDtcbiAgICByb2xlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBSb2xlTmFtZSB9IGZyb20gXCIuL1JvbGVcIjtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYSB7XG4gIHN0YXRpYyBTWVNfU0NIRU1BX05BTUVTOiBzdHJpbmdbXSA9IFtcbiAgICBcInB1YmxpY1wiLFxuICAgIFwiaW5mb3JtYXRpb25fc2NoZW1hXCIsXG4gICAgXCJoZGJfY2F0YWxvZ1wiLFxuICAgIFwid2JcIixcbiAgXTtcblxuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIHRlbmFudE93bmVySWQ/OiBudW1iZXI7XG4gIHVzZXJPd25lcklkPzogbnVtYmVyO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHVzZXJSb2xlPzogUm9sZU5hbWU7XG4gIGNvbnRleHQhOiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IGRhdGEuaWQ7XG4gICAgc2NoZW1hLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgc2NoZW1hLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBzY2hlbWEudGVuYW50T3duZXJJZCA9IGRhdGEudGVuYW50T3duZXJJZDtcbiAgICBzY2hlbWEudXNlck93bmVySWQgPSBkYXRhLnVzZXJPd25lcklkO1xuICAgIHNjaGVtYS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIFRhYmxlIHtcbiAgaWQhOiBudW1iZXI7XG4gIHNjaGVtYUlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBjb2x1bW5zITogW0NvbHVtbl07XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxUYWJsZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGUucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVzID0gQXJyYXk8VGFibGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0YWJsZXMucHVzaChUYWJsZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGFibGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGFibGUge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGUgPSBuZXcgVGFibGUoKTtcbiAgICB0YWJsZS5pZCA9IGRhdGEuaWQ7XG4gICAgdGFibGUuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICB0YWJsZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRhYmxlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICB0YWJsZS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdGFibGUudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB0YWJsZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFRhYmxlVXNlciB7XG4gIHRhYmxlSWQhOiBudW1iZXI7XG4gIHVzZXJJZCE6IG51bWJlcjtcbiAgcm9sZUlkITogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlcnMgPSBBcnJheTxUYWJsZVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0YWJsZVVzZXJzLnB1c2goVGFibGVVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGFibGVVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZVVzZXIgPSBuZXcgVGFibGVVc2VyKCk7XG4gICAgdGFibGVVc2VyLnRhYmxlSWQgPSBkYXRhLnRhYmxlX2lkO1xuICAgIHRhYmxlVXNlci51c2VySWQgPSBkYXRhLnVzZXJfaWQ7XG4gICAgdGFibGVVc2VyLnJvbGVJZCA9IGRhdGEucm9sZV9pZDtcbiAgICB0YWJsZVVzZXIuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIHRhYmxlVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdGFibGVVc2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gdGFibGVVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVGVuYW50IHtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGVuYW50PiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUZW5hbnQucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGVuYW50cyA9IEFycmF5PFRlbmFudD4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRlbmFudHMucHVzaChUZW5hbnQucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRlbmFudHM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUZW5hbnQge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGVuYW50LnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRlbmFudCA9IG5ldyBUZW5hbnQoKTtcbiAgICB0ZW5hbnQuaWQgPSBkYXRhLmlkO1xuICAgIHRlbmFudC5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRlbmFudC5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgdGVuYW50LmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0ZW5hbnQudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB0ZW5hbnQ7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgaWQhOiBudW1iZXI7XG4gIHRlbmFudF9pZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZSE6IHN0cmluZztcbiAgbGFzdE5hbWUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXJzID0gQXJyYXk8VXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHVzZXJzLnB1c2goVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IGRhdGEuaWQ7XG4gICAgdXNlci5lbWFpbCA9IGRhdGEuZW1haWw7XG4gICAgdXNlci5maXJzdE5hbWUgPSBkYXRhLmZpcnN0X25hbWU7XG4gICAgdXNlci5sYXN0TmFtZSA9IGRhdGEubGFzdF9uYW1lO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB1c2VyO1xuICB9XG59XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9Sb2xlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1RhYmxlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Db2x1bW5cIjtcbmV4cG9ydCAqIGZyb20gXCIuL1RhYmxlVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGVuYW50XCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Vc2VyXCI7XG4iLCJ0eXBlIEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBzdHJpbmc7XG4gIGRiTmFtZTogc3RyaW5nO1xuICBkYkhvc3Q6IHN0cmluZztcbiAgZGJQb3J0OiBudW1iZXI7XG4gIGRiVXNlcjogc3RyaW5nO1xuICBkYlBhc3N3b3JkOiBzdHJpbmc7XG4gIGRiUG9vbE1heDogbnVtYmVyO1xuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBoYXN1cmFIb3N0OiBzdHJpbmc7XG4gIGhhc3VyYUFkbWluU2VjcmV0OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBwcm9jZXNzLmVudi5TRUNSRVRfTUVTU0FHRSBhcyBzdHJpbmcsXG4gIGRiTmFtZTogcHJvY2Vzcy5lbnYuREJfTkFNRSBhcyBzdHJpbmcsXG4gIGRiSG9zdDogcHJvY2Vzcy5lbnYuREJfSE9TVCBhcyBzdHJpbmcsXG4gIGRiUG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9SVCB8fCBcIlwiKSBhcyBudW1iZXIsXG4gIGRiVXNlcjogcHJvY2Vzcy5lbnYuREJfVVNFUiBhcyBzdHJpbmcsXG4gIGRiUGFzc3dvcmQ6IHByb2Nlc3MuZW52LkRCX1BBU1NXT1JEIGFzIHN0cmluZyxcbiAgZGJQb29sTWF4OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX01BWCB8fCBcIlwiKSBhcyBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBwYXJzZUludChcbiAgICBwcm9jZXNzLmVudi5EQl9QT09MX0lETEVfVElNRU9VVF9NSUxMSVMgfHwgXCJcIlxuICApIGFzIG51bWJlcixcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfQ09OTkVDVElPTl9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxuICBoYXN1cmFIb3N0OiBwcm9jZXNzLmVudi5IQVNVUkFfSE9TVCBhcyBzdHJpbmcsXG4gIGhhc3VyYUFkbWluU2VjcmV0OiBwcm9jZXNzLmVudi5IQVNVUkFfQURNSU5fU0VDUkVUIGFzIHN0cmluZyxcbn07XG4iLCIvLyBodHRwczovL2FsdHJpbS5pby9wb3N0cy9heGlvcy1odHRwLWNsaWVudC11c2luZy10eXBlc2NyaXB0XG5cbmltcG9ydCBheGlvcywgeyBBeGlvc0luc3RhbmNlLCBBeGlvc1Jlc3BvbnNlIH0gZnJvbSBcImF4aW9zXCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgXCJ4LWhhc3VyYS1hZG1pbi1zZWNyZXRcIjogZW52aXJvbm1lbnQuaGFzdXJhQWRtaW5TZWNyZXQsXG59O1xuXG5jbGFzcyBIYXN1cmFBcGkge1xuICBzdGF0aWMgSEFTVVJBX0lHTk9SRV9DT0RFUzogc3RyaW5nW10gPSBbXG4gICAgXCJhbHJlYWR5LXVudHJhY2tlZFwiLFxuICAgIFwiYWxyZWFkeS10cmFja2VkXCIsXG4gICAgXCJub3QtZXhpc3RzXCIsIC8vIGRyb3BwaW5nIGEgcmVsYXRpb25zaGlwXG4gIF07XG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogZW52aXJvbm1lbnQuaGFzdXJhSG9zdCxcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIHRyeSB7XG4gICAgICBsb2cuZGVidWcoYGhhc3VyYUFwaS5wb3N0OiB0eXBlOiAke3R5cGV9YCwgYXJncyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuaHR0cC5wb3N0PGFueSwgQXhpb3NSZXNwb25zZT4oXG4gICAgICAgIFwiL3YxL21ldGFkYXRhXCIsXG4gICAgICAgIHtcbiAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgIGFyZ3M6IGFyZ3MsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHJlc3BvbnNlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IucmVzcG9uc2UgJiYgZXJyb3IucmVzcG9uc2UuZGF0YSkge1xuICAgICAgICBpZiAoIUhhc3VyYUFwaS5IQVNVUkFfSUdOT1JFX0NPREVTLmluY2x1ZGVzKGVycm9yLnJlc3BvbnNlLmRhdGEuY29kZSkpIHtcbiAgICAgICAgICBsb2cuZXJyb3IoZXJyb3IucmVzcG9uc2UuZGF0YSk7XG4gICAgICAgICAgcmVzdWx0ID0ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICAgICAgY29kZTogZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ190cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQuY29kZSAmJlxuICAgICAgSGFzdXJhQXBpLkhBU1VSQV9JR05PUkVfQ09ERVMuaW5jbHVkZXMocmVzdWx0LmNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQuY29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3VudHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgY2FzY2FkZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5jb2RlICYmXG4gICAgICBIYXN1cmFBcGkuSEFTVVJBX0lHTk9SRV9DT0RFUy5pbmNsdWRlcyhyZXN1bHQuY29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gYSBwb3N0IGhhcyBvbmUgYXV0aG9yIChjb25zdHJhaW50IHBvc3RzLmF1dGhvcl9pZCAtPiBhdXRob3JzLmlkKVxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsIC8vIGF1dGhvcl9pZFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nIC8vIGF1dGhvcnNcbiAgKSB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NvbHVtbk5hbWV9LCAke3BhcmVudFRhYmxlTmFtZX0pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX29iamVjdF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IGNvbHVtbk5hbWUsIC8vIGF1dGhvcl9pZFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5jb2RlICYmXG4gICAgICBIYXN1cmFBcGkuSEFTVVJBX0lHTk9SRV9DT0RFUy5pbmNsdWRlcyhyZXN1bHQuY29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gYW4gYXV0aG9yIGhhcyBtYW55IHBvc3RzIChjb25zdHJhaW50IHBvc3RzLmF1dGhvcl9pZCAtPiBhdXRob3JzLmlkKVxuICBwdWJsaWMgYXN5bmMgY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLCAvLyBhdXRob3JzXG4gICAgY2hpbGRUYWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBjaGlsZENvbHVtbk5hbWVzOiBzdHJpbmdbXSAvLyBhdXRob3JfaWRcbiAgKSB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVBcnJheVJlbGF0aW9uc2hpcCgke3NjaGVtYU5hbWV9LCAke3RhYmxlTmFtZX0sICR7Y2hpbGRUYWJsZU5hbWV9LCAke2NoaWxkQ29sdW1uTmFtZXN9KWBcbiAgICApO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2NyZWF0ZV9hcnJheV9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYGFycl8ke3RhYmxlTmFtZX1fJHtjaGlsZFRhYmxlTmFtZX1gLCAvLyBhcnJfYXV0aG9yc19wb3N0c1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgIH0sXG4gICAgICB1c2luZzoge1xuICAgICAgICBmb3JlaWduX2tleV9jb25zdHJhaW50X29uOiB7XG4gICAgICAgICAgY29sdW1uOiBjaGlsZENvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgICB0YWJsZToge1xuICAgICAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgbmFtZTogY2hpbGRUYWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQuY29kZSAmJlxuICAgICAgSGFzdXJhQXBpLkhBU1VSQV9JR05PUkVfQ09ERVMuaW5jbHVkZXMocmVzdWx0LmNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQuY29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkcm9wUmVsYXRpb25zaGlwcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcgLy8gYXV0aG9yc1xuICApIHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfZHJvcF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICB9LFxuICAgICAgcmVsYXRpb25zaGlwOiBgb2JqXyR7dGFibGVOYW1lfV8ke3BhcmVudFRhYmxlTmFtZX1gLCAvLyBvYmpfcG9zdHNfYXV0aG9yc1xuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgKCFyZXN1bHQuY29kZSB8fFxuICAgICAgICAocmVzdWx0LmNvZGUgJiYgIUhhc3VyYUFwaS5IQVNVUkFfSUdOT1JFX0NPREVTLmluY2x1ZGVzKHJlc3VsdC5jb2RlKSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHBhcmVudFRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHJlbGF0aW9uc2hpcDogYGFycl8ke3BhcmVudFRhYmxlTmFtZX1fJHt0YWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5jb2RlICYmXG4gICAgICBIYXN1cmFBcGkuSEFTVVJBX0lHTk9SRV9DT0RFUy5pbmNsdWRlcyhyZXN1bHQuY29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG5cbmV4cG9ydCBjb25zdCBoYXN1cmFBcGkgPSBuZXcgSGFzdXJhQXBpKCk7XG4iLCJpbXBvcnQgeyB0eXBlRGVmcyBhcyBTY2hlbWEsIHJlc29sdmVycyBhcyBzY2hlbWFSZXNvbHZlcnMgfSBmcm9tIFwiLi9zY2hlbWFcIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFRlbmFudCwgcmVzb2x2ZXJzIGFzIHRlbmFudFJlc29sdmVycyB9IGZyb20gXCIuL3RlbmFudFwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVXNlciwgcmVzb2x2ZXJzIGFzIHVzZXJSZXNvbHZlcnMgfSBmcm9tIFwiLi91c2VyXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyBhcyBUYWJsZSwgcmVzb2x2ZXJzIGFzIHRhYmxlUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdGFibGVcIjtcbmltcG9ydCB7IG1lcmdlIH0gZnJvbSBcImxvZGFzaFwiO1xuaW1wb3J0IHsgZ3FsLCBBcG9sbG9FcnJvciwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHtcbiAgY29uc3RyYWludERpcmVjdGl2ZSxcbiAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxufSBmcm9tIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiO1xuaW1wb3J0IHsgbWFrZUV4ZWN1dGFibGVTY2hlbWEgfSBmcm9tIFwiZ3JhcGhxbC10b29sc1wiO1xuXG5leHBvcnQgdHlwZSBTZXJ2aWNlUmVzdWx0ID1cbiAgfCB7IHN1Y2Nlc3M6IHRydWU7IHBheWxvYWQ6IGFueTsgbWVzc2FnZT86IHN0cmluZyB9XG4gIHwgeyBzdWNjZXNzOiBmYWxzZTsgbWVzc2FnZTogc3RyaW5nOyBjb2RlPzogc3RyaW5nOyBhcG9sbG9FcnJvcj86IHN0cmluZyB9O1xuXG5leHBvcnQgdHlwZSBRdWVyeVBhcmFtcyA9IHtcbiAgcXVlcnk6IHN0cmluZztcbiAgcGFyYW1zPzogYW55W107XG59O1xuXG5leHBvcnQgdHlwZSBDb25zdHJhaW50SWQgPSB7XG4gIGNvbnN0cmFpbnROYW1lOiBzdHJpbmc7XG4gIHRhYmxlTmFtZTogc3RyaW5nO1xuICBjb2x1bW5OYW1lOiBzdHJpbmc7XG4gIHJlbFRhYmxlTmFtZT86IHN0cmluZztcbiAgcmVsQ29sdW1uTmFtZT86IHN0cmluZztcbn07XG5cbmNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFF1ZXJ5IHtcbiAgICB3YkhlYWx0aENoZWNrOiBTdHJpbmchXG4gIH1cblxuICB0eXBlIE11dGF0aW9uIHtcbiAgICB3YlJlc2V0VGVzdERhdGE6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiAoKSA9PiBcIkFsbCBnb29kXCIsXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBzY2hlbWEgPSBtYWtlRXhlY3V0YWJsZVNjaGVtYSh7XG4gIHR5cGVEZWZzOiBbXG4gICAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxuICAgIHR5cGVEZWZzLFxuICAgIFRlbmFudCxcbiAgICBVc2VyLFxuICAgIFNjaGVtYSxcbiAgICBUYWJsZSxcbiAgXSxcbiAgcmVzb2x2ZXJzOiBtZXJnZShcbiAgICByZXNvbHZlcnMsXG4gICAgdGVuYW50UmVzb2x2ZXJzLFxuICAgIHVzZXJSZXNvbHZlcnMsXG4gICAgc2NoZW1hUmVzb2x2ZXJzLFxuICAgIHRhYmxlUmVzb2x2ZXJzXG4gICksXG4gIHNjaGVtYVRyYW5zZm9ybXM6IFtjb25zdHJhaW50RGlyZWN0aXZlKCldLFxufSk7XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBTY2hlbWEge1xuICAgIGlkOiBJRCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICB0ZW5hbnRPd25lcklkOiBJbnRcbiAgICB1c2VyT3duZXJJZDogSW50XG4gICAgdXNlclJvbGU6IFN0cmluZ1xuICAgIGNvbnRleHQ6IEpTT05cbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlNjaGVtYXModXNlckVtYWlsOiBTdHJpbmchKTogW1NjaGVtYV1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICB3YkNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIGxhYmVsOiBTdHJpbmchXG4gICAgICB0ZW5hbnRPd25lcklkOiBJbnRcbiAgICAgIHRlbmFudE93bmVyTmFtZTogU3RyaW5nXG4gICAgICB1c2VyT3duZXJJZDogSW50XG4gICAgICB1c2VyT3duZXJFbWFpbDogU3RyaW5nXG4gICAgKTogU2NoZW1hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JTY2hlbWFzOiBhc3luYyAoXywgeyB1c2VyRW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFzKHVzZXJFbWFpbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICB3YkNyZWF0ZVNjaGVtYTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIHRlbmFudE93bmVySWQsXG4gICAgICAgIHRlbmFudE93bmVyTmFtZSxcbiAgICAgICAgdXNlck93bmVySWQsXG4gICAgICAgIHVzZXJPd25lckVtYWlsLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVTY2hlbWEoXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICB0ZW5hbnRPd25lcklkLFxuICAgICAgICB0ZW5hbnRPd25lck5hbWUsXG4gICAgICAgIHVzZXJPd25lcklkLFxuICAgICAgICB1c2VyT3duZXJFbWFpbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgR3JhcGhRTEpTT04gfSBmcm9tIFwiZ3JhcGhxbC10eXBlLWpzb25cIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgc2NhbGFyIEpTT05cblxuICB0eXBlIFRhYmxlIHtcbiAgICBpZDogSUQhXG4gICAgc2NoZW1hSWQ6IEludCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgICBjb2x1bW5zOiBbQ29sdW1uXSFcbiAgfVxuXG4gIHR5cGUgQ29sdW1uIHtcbiAgICBpZDogSUQhXG4gICAgdGFibGVJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHR5cGU6IFN0cmluZyFcbiAgICBpc1ByaW1hcnlLZXk6IEJvb2xlYW4hXG4gICAgZm9yZWlnbktleXM6IFtDb25zdHJhaW50SWRdIVxuICAgIHJlZmVyZW5jZWRCeTogW0NvbnN0cmFpbnRJZF0hXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbnN0cmFpbnRJZCB7XG4gICAgY29uc3RyYWludE5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgcmVsVGFibGVOYW1lOiBTdHJpbmdcbiAgICByZWxDb2x1bW5OYW1lOiBTdHJpbmdcbiAgfVxuXG4gIHR5cGUgVGFibGVVc2VyIHtcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgcm9sZUlkOiBJbnQhXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlRhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogW1RhYmxlXVxuICAgIHdiQ29sdW1ucyhzY2hlbWFOYW1lOiBTdHJpbmchLCB0YWJsZU5hbWU6IFN0cmluZyEpOiBbQ29sdW1uXVxuICAgIHdiVGFibGVVc2VyKFxuICAgICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICApOiBUYWJsZVVzZXJcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JVcGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgbmV3VGFibGVOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1RhYmxlTGFiZWw6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkQWxsRXhpc3RpbmdUYWJsZXMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JBZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICAgY29sdW1uVHlwZTogU3RyaW5nXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlVwZGF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgbmV3Q29sdW1uTmFtZTogU3RyaW5nXG4gICAgICBuZXdDb2x1bW5MYWJlbDogU3RyaW5nXG4gICAgICBuZXdUeXBlOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIHBhcmVudFRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgcGFyZW50Q29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIEpTT046IEdyYXBoUUxKU09OLFxuICBRdWVyeToge1xuICAgIHdiVGFibGVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkNvbHVtbnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JUYWJsZVVzZXI6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXIoXG4gICAgICAgIHVzZXJFbWFpbCxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JBZGRPckNyZWF0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHRhYmxlTGFiZWwsIGNyZWF0ZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdGFibGVMYWJlbCxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JVcGRhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBuZXdUYWJsZU5hbWUsIG5ld1RhYmxlTGFiZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVUYWJsZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBuZXdUYWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZEFsbEV4aXN0aW5nVGFibGVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRBbGxFeGlzdGluZ1RhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgIHNjaGVtYU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIGNvbHVtbkxhYmVsLCBjcmVhdGUsIGNvbHVtblR5cGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBjb2x1bW5MYWJlbCxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgICBjb2x1bW5UeXBlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JVcGRhdGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICAgIG5ld1R5cGUsXG4gICAgICB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlVGFibGVVc2VyU2V0dGluZ3M6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlsLCBzZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWwsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgVGVuYW50IHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgd2JUZW5hbnRzOiBbVGVuYW50XVxuICAgIHdiVGVuYW50QnlJZChpZDogSUQhKTogVGVuYW50XG4gICAgd2JUZW5hbnRCeU5hbWUobmFtZTogU3RyaW5nISk6IFRlbmFudFxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiQ3JlYXRlVGVuYW50KG5hbWU6IFN0cmluZyEsIGxhYmVsOiBTdHJpbmchKTogVGVuYW50XG4gICAgd2JVcGRhdGVUZW5hbnQoaWQ6IElEISwgbmFtZTogU3RyaW5nLCBsYWJlbDogU3RyaW5nKTogVGVuYW50XG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JUZW5hbnRzOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50ZW5hbnRzKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlRlbmFudEJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50ZW5hbnRCeUlkKGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVGVuYW50QnlOYW1lOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50ZW5hbnRCeU5hbWUobmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICB3YkNyZWF0ZVRlbmFudDogYXN5bmMgKF8sIHsgbmFtZSwgbGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVRlbmFudChuYW1lLCBsYWJlbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVRlbmFudDogYXN5bmMgKF8sIHsgaWQsIG5hbWUsIGxhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVUZW5hbnQoaWQsIG5hbWUsIGxhYmVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFVzZXIge1xuICAgIGlkOiBJRCFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIHdiVXNlcnNCeVRlbmFudElkKHRlbmFudElkOiBJRCEpOiBbVXNlcl1cbiAgICB3YlVzZXJCeUlkKGlkOiBJRCEpOiBVc2VyXG4gICAgd2JVc2VyQnlFbWFpbChlbWFpbDogU3RyaW5nISk6IFVzZXJcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICB3YkNyZWF0ZVVzZXIoZW1haWw6IFN0cmluZyEsIGZpcnN0TmFtZTogU3RyaW5nLCBsYXN0TmFtZTogU3RyaW5nKTogVXNlclxuICAgIHdiVXBkYXRlVXNlcihcbiAgICAgIGlkOiBJRCFcbiAgICAgIGVtYWlsOiBTdHJpbmdcbiAgICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgKTogVXNlclxuICAgIFwiXCJcIlxuICAgIFRlbmFudC1Vc2VyLVJvbGVzXG4gICAgXCJcIlwiXG4gICAgd2JBZGRVc2VyVG9UZW5hbnQoXG4gICAgICB0ZW5hbnROYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICAgIHRlbmFudFJvbGU6IFN0cmluZyFcbiAgICApOiBVc2VyXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hLVVzZXItUm9sZXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZFVzZXJUb1NjaGVtYShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgICAgc2NoZW1hUm9sZTogU3RyaW5nIVxuICAgICk6IFVzZXJcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YlVzZXJzQnlUZW5hbnRJZDogYXN5bmMgKF8sIHsgdGVuYW50SWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUlkOiBhc3luYyAoXywgeyBpZCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5SWQoaWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2VyQnlFbWFpbDogYXN5bmMgKF8sIHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUVtYWlsKGVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFVzZXJzXG4gICAgd2JDcmVhdGVVc2VyOiBhc3luYyAoXywgeyBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlVXNlcihcbiAgICAgICAgZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVVzZXI6IGFzeW5jIChfLCB7IGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVXNlcihcbiAgICAgICAgaWQsXG4gICAgICAgIGVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGxhc3ROYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVGVuYW50LVVzZXItUm9sZXNcbiAgICB3YkFkZFVzZXJUb1RlbmFudDogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgdGVuYW50TmFtZSwgdXNlckVtYWlsLCB0ZW5hbnRSb2xlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkVXNlclRvVGVuYW50KFxuICAgICAgICB0ZW5hbnROYW1lLFxuICAgICAgICB1c2VyRW1haWwsXG4gICAgICAgIHRlbmFudFJvbGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBUZW5hbnQtU2NoZW1hLVJvbGVzXG4gICAgd2JBZGRVc2VyVG9TY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbCwgc2NoZW1hUm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZFVzZXJUb1NjaGVtYShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdXNlckVtYWlsLFxuICAgICAgICBzY2hlbWFSb2xlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgQXBvbGxvU2VydmVyLCBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcInRzbG9nXCI7XG5pbXBvcnQgeyBEQUwgfSBmcm9tIFwiLi9kYWxcIjtcbmltcG9ydCB7IGhhc3VyYUFwaSB9IGZyb20gXCIuL2hhc3VyYS1hcGlcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgc2NoZW1hLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB2ID0gcmVxdWlyZShcInZvY2FcIik7XG5pbXBvcnQgeyBDb2x1bW4sIFNjaGVtYSB9IGZyb20gXCIuL2VudGl0eVwiO1xuaW1wb3J0IHsgaXNUaGlzVHlwZU5vZGUgfSBmcm9tIFwidHlwZXNjcmlwdFwiO1xuXG5leHBvcnQgY29uc3QgZ3JhcGhxbEhhbmRsZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgc2NoZW1hLFxuICBpbnRyb3NwZWN0aW9uOiB0cnVlLFxuICBjb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHdiQ2xvdWQ6IG5ldyBXaGl0ZWJyaWNrQ2xvdWQoKSxcbiAgICB9O1xuICB9LFxufSkuY3JlYXRlSGFuZGxlcigpO1xuXG5leHBvcnQgY29uc3QgbG9nOiBMb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgbWluTGV2ZWw6IFwiZGVidWdcIixcbn0pO1xuXG5jbGFzcyBXaGl0ZWJyaWNrQ2xvdWQge1xuICBkYWwgPSBuZXcgREFMKCk7XG5cbiAgcHVibGljIGVycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXR1cm4gbmV3IEVycm9yKFxuICAgICAgICBcIldoaXRlYnJpY2tDbG91ZC5lcnI6IHJlc3VsdCBpcyBub3QgYW4gZXJyb3IgKHN1Y2Nlc3M9PXRydWUpXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGxldCBhcG9sbG9FcnJvciA9IFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCI7XG4gICAgaWYgKHJlc3VsdC5hcG9sbG9FcnJvcikgYXBvbGxvRXJyb3IgPSByZXN1bHQuYXBvbGxvRXJyb3I7XG4gICAgcmV0dXJuIG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgYXBvbGxvRXJyb3IsIHtcbiAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgYWRkU2NoZW1hQ29udGV4dChzY2hlbWE6IFNjaGVtYSk6IFNjaGVtYSB7XG4gICAgc2NoZW1hLmNvbnRleHQgPSB7XG4gICAgICBkZWZhdWx0Q29sdW1uVHlwZXM6IENvbHVtbi5DT01NT05fVFlQRVMsXG4gICAgfTtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlc3RcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJlc2V0VGVzdERhdGEoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXMoXCJ0ZXN0XyVcIik7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVNjaGVtYShzY2hlbWEubmFtZSwgdHJ1ZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VGVuYW50cygpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlVGVzdFVzZXJzKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUZW5hbnRzXG4gICAqIFRCRDogdmFsaWRhdGUgbmFtZSB+IFthLXpdezF9W2EtejAtOV17Mix9XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC50ZW5hbnRzKCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlJZChpZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRlbmFudEJ5SWQoaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRlbmFudEJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudGVuYW50QnlOYW1lKG5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVRlbmFudChcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVGVuYW50KG5hbWUsIGxhYmVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUZW5hbnQoXG4gICAgaWQ6IG51bWJlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFRlbmFudHMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RUZW5hbnRzKCk7XG4gIH1cblxuICAvKipcbiAgICogVGVuYW50LVVzZXItUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJUb1RlbmFudChcbiAgICB0ZW5hbnROYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsOiBzdHJpbmcsXG4gICAgdGVuYW50Um9sZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB3aGl0ZWJyaWNrQ2xvdWQuYWRkVXNlclRvVGVuYW50OiAke3RlbmFudE5hbWV9LCAke3VzZXJFbWFpbH0sICR7dGVuYW50Um9sZX1gXG4gICAgKTtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlckJ5RW1haWwodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgY29uc3QgdGVuYW50UmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGVuYW50QnlOYW1lKHRlbmFudE5hbWUpO1xuICAgIGlmICghdGVuYW50UmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0ZW5hbnRSZXN1bHQ7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJvbGVCeU5hbWUodGVuYW50Um9sZSk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZFVzZXJUb1RlbmFudChcbiAgICAgIHRlbmFudFJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgdXNlclJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgcm9sZVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiB1c2VyUmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFVzZXJzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vyc0J5VGVuYW50SWQodGVuYW50SWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlckJ5SWQoaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKGVtYWlsOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlckJ5RW1haWwoZW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoXG4gICAgZW1haWw6IHN0cmluZyxcbiAgICBmaXJzdE5hbWU6IHN0cmluZyxcbiAgICBsYXN0TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIFRCRDogYXV0aGVudGljYXRpb24sIHNhdmUgcGFzc3dvcmRcbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVXNlcihlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByb2xlQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5yb2xlQnlOYW1lKG5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVtYXNcbiAgICogVEJEOiB2YWxpZGF0ZSBuYW1lIH4gW2Etel17MX1bX2EtejAtOV17Mix9XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEoXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgdGVuYW50T3duZXJJZD86IG51bWJlcixcbiAgICB0ZW5hbnRPd25lck5hbWU/OiBzdHJpbmcsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYFxuICAgICAgd2JDbG91ZC5jcmVhdGVTY2hlbWEgbmFtZT0ke25hbWV9LFxuICAgICAgbGFiZWw9JHtsYWJlbH0sXG4gICAgICB0ZW5hbnRPd25lcklkPSR7dGVuYW50T3duZXJJZH0sXG4gICAgICB0ZW5hbnRPd25lck5hbWU9JHt0ZW5hbnRPd25lck5hbWV9LFxuICAgICAgdXNlck93bmVySWQ9JHt1c2VyT3duZXJJZH0sXG4gICAgICB1c2VyT3duZXJFbWFpbD0ke3VzZXJPd25lckVtYWlsfVxuICAgIGApO1xuICAgIGxldCByZXN1bHQ7XG4gICAgaWYgKCF0ZW5hbnRPd25lcklkICYmICF1c2VyT3duZXJJZCkge1xuICAgICAgaWYgKHRlbmFudE93bmVyTmFtZSkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50ZW5hbnRCeU5hbWUodGVuYW50T3duZXJOYW1lKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgdGVuYW50T3duZXJJZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgICAgfSBlbHNlIGlmICh1c2VyT3duZXJFbWFpbCkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VyQnlFbWFpbCh1c2VyT3duZXJFbWFpbCk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIHVzZXJPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IFwiY3JlYXRlU2NoZW1hOiBPd25lciBjb3VsZCBub3QgYmUgZm91bmRcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmFtZS5zdGFydHNXaXRoKFwicGdfXCIpIHx8IFNjaGVtYS5TWVNfU0NIRU1BX05BTUVTLmluY2x1ZGVzKG5hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYERhdGFiYXNlIG5hbWUgY2FuIG5vdCBiZWdpbiB3aXRoICdwZ18nIG9yIGJlIGluIHRoZSByZXNlcnZlZCBsaXN0OiAke1NjaGVtYS5TWVNfU0NIRU1BX05BTUVTLmpvaW4oXG4gICAgICAgICAgXCIsIFwiXG4gICAgICAgICl9YCxcbiAgICAgICAgY29kZTogXCJXQl9TQ0hFTUFfTkFNRVwiLFxuICAgICAgICBhcG9sbG9FcnJvcjogXCJCQURfVVNFUl9JTlBVVFwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuY3JlYXRlU2NoZW1hKG5hbWUsIGxhYmVsLCB0ZW5hbnRPd25lcklkLCB1c2VyT3duZXJJZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHRhYmxlTmFtZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcih1c2VyRW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTY2hlbWEtVXNlci1Sb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYWRkVXNlclRvU2NoZW1hKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWw6IHN0cmluZyxcbiAgICBzY2hlbWFSb2xlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJCeUVtYWlsKHVzZXJFbWFpbCk7XG4gICAgaWYgKCF1c2VyUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2VyUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYUJ5TmFtZShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yb2xlQnlOYW1lKHNjaGVtYVJvbGUpO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRVc2VyVG9TY2hlbWEoXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHVzZXJSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHJvbGVSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gdXNlclJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hcyh1c2VyRW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHNjaGVtYU93bmVyUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsKTtcbiAgICBpZiAoIXNjaGVtYU93bmVyUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFPd25lclJlc3VsdDtcbiAgICBjb25zdCB1c2VyUm9sZXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzQnlVc2VyKHVzZXJFbWFpbCk7XG4gICAgaWYgKCF1c2VyUm9sZXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSb2xlc1Jlc3VsdDtcbiAgICBjb25zdCBzY2hlbWFzOiBTY2hlbWFbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHNjaGVtYU93bmVyUmVzdWx0LnBheWxvYWQuY29uY2F0KFxuICAgICAgdXNlclJvbGVzUmVzdWx0LnBheWxvYWRcbiAgICApKSB7XG4gICAgICBzY2hlbWFzLnB1c2godGhpcy5hZGRTY2hlbWFDb250ZXh0KHNjaGVtYSkpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHNjaGVtYXMsXG4gICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKiBUQkQ6IHZhbGlkYXRlIG5hbWUgfiBbYS16XXsxfVtfYS16MC05XXsyLH1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgICAgaWYgKCFjb2x1bW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjb2x1bW5zUmVzdWx0O1xuICAgICAgdGFibGUuY29sdW1ucyA9IGNvbHVtbnNSZXN1bHQucGF5bG9hZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucHJpbWFyeUtleXMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHBLQ29sc0NvbnN0cmFpbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcEtDb2x1bW5OYW1lczogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhwS0NvbHNDb25zdHJhaW50cyk7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW4gb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIGNvbHVtbi5pc1ByaW1hcnlLZXkgPSBwS0NvbHVtbk5hbWVzLmluY2x1ZGVzKGNvbHVtbi5uYW1lKTtcbiAgICAgIGNvbnN0IGZvcmVpZ25LZXlzUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIFwiRk9SRUlHTl9LRVlTXCJcbiAgICAgICk7XG4gICAgICBpZiAoIWZvcmVpZ25LZXlzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb2x1bW4uZm9yZWlnbktleXMgPSBmb3JlaWduS2V5c1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgY29uc3QgcmVmZXJlbmNlc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBcIlJFRkVSRU5DRVNcIlxuICAgICAgKTtcbiAgICAgIGlmICghcmVmZXJlbmNlc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29sdW1uLnJlZmVyZW5jZWRCeSA9IHJlZmVyZW5jZXNSZXN1bHQucGF5bG9hZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZUxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgdGFibGVMYWJlbCxcbiAgICAgIGNyZWF0ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmICghZGVsKSBkZWwgPSBmYWxzZTtcbiAgICAvLyAxLiB1bnRyYWNrXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS51bnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIDIuIHJlbW92ZS9kZWxldGUgY29sdW1uc1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICAvLyAzLiByZW1vdmUgdXNlciBzZXR0aW5nc1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZVRhYmxlVXNlcnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIDQuIHJlbW92ZS9kZWxldGUgdGhlIHRhYmxlXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBkZWxcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBuZXdUYWJsZU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3VGFibGVMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nVGFibGVOYW1lcy5pbmNsdWRlcyhuZXdUYWJsZU5hbWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogXCJUaGUgbmV3IHRhYmxlIG5hbWUgbXVzdCBiZSB1bmlxdWVcIixcbiAgICAgICAgICBjb2RlOiBcIldCX1RBQkxFX05BTUVfRVhJU1RTXCIsXG4gICAgICAgICAgYXBvbGxvRXJyb3I6IFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVMYWJlbFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudHJhY2tUYWJsZShzY2hlbWFOYW1lLCBuZXdUYWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRBbGxFeGlzdGluZ1RhYmxlcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRpc2NvdmVyVGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgdGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHRhYmxlTmFtZXMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB2LnRpdGxlQ2FzZSh0YWJsZU5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCIgXCIpKSxcbiAgICAgICAgZmFsc2VcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJDb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgY29sdW1ucyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICAgIHYudGl0bGVDYXNlKGNvbHVtbi5uYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiIFwiKSksXG4gICAgICAgICAgZmFsc2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICBcIiVcIixcbiAgICAgIFwiJVwiLFxuICAgICAgXCJBTExcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDb25zdHJhaW50SWRbXSA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGlmIChyZWxhdGlvbnNoaXBzLmxlbmd0aCA+IDApIHtcbiAgICAgIGZvciAoY29uc3QgcmVsYXRpb25zaGlwIG9mIHJlbGF0aW9uc2hpcHMpIHtcbiAgICAgICAgaWYgKHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWUgJiYgcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWUpIHtcbiAgICAgICAgICB0aGlzLmFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICByZWxhdGlvbnNoaXAudGFibGVOYW1lLFxuICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWUsXG4gICAgICAgICAgICBbcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWVdXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgICAgICBcImFkZEFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogQ29uc3RyYWludElkIG11c3QgaGF2ZSByZWxUYWJsZU5hbWUgYW5kIHJlbENvbHVtbk5hbWVcIixcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbkxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhbixcbiAgICBjb2x1bW5UeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmICghY3JlYXRlKSBjcmVhdGUgPSBmYWxzZTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIGNvbHVtbkxhYmVsLFxuICAgICAgY3JlYXRlLFxuICAgICAgY29sdW1uVHlwZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdDb2x1bW5OYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nQ29sdW1uTmFtZXMuaW5jbHVkZXMobmV3Q29sdW1uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBtZXNzYWdlOiBcIlRoZSBuZXcgY29sdW1uIG5hbWUgbXVzdCBiZSB1bmlxdWVcIixcbiAgICAgICAgICBjb2RlOiBcIldCX0NPTFVNTl9OQU1FX0VYSVNUU1wiLFxuICAgICAgICAgIGFwb2xsb0Vycm9yOiBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICBuZXdUeXBlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld1R5cGUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gUGFzcyBlbXB0eSBjb2x1bW5OYW1lc1tdIHRvIGNsZWFyXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmICghZGVsKSBkZWwgPSBmYWxzZTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucHJpbWFyeUtleXMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nQ29uc3RyYWludE5hbWVzID0gT2JqZWN0LnZhbHVlcyhyZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKGRlbCkge1xuICAgICAgaWYgKGV4aXN0aW5nQ29uc3RyYWludE5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gbXVsdGlwbGUgY291bG1uIHByaW1hcnkga2V5cyB3aWxsIGFsbCBoYXZlIHNhbWUgY29uc3RyYWludCBuYW1lXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgZXhpc3RpbmdDb25zdHJhaW50TmFtZXNbMF0gYXMgc3RyaW5nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogXCJSZW1vdmUgZXhpc3RpbmcgcHJpbWFyeSBrZXkgZmlyc3RcIixcbiAgICAgICAgICBjb2RlOiBcIldCX1BLX0VYSVNUU1wiLFxuICAgICAgICAgIGFwb2xsb0Vycm9yOiBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS51bnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVQcmltYXJ5S2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJDUkVBVEVcIjtcbiAgICBpZiAoIWNyZWF0ZSkgb3BlcmF0aW9uID0gXCJBRERcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJERUxFVEVcIjtcbiAgICBpZiAoIWRlbCkgb3BlcmF0aW9uID0gXCJSRU1PVkVcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgW10sXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gb3BlcmF0aW9uID0gXCJBRER8Q1JFQVRFfFJFTU9WRXxERUxFVEVcIlxuICBwdWJsaWMgYXN5bmMgc2V0Rm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXNbMF0sXG4gICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nRm9yZWlnbktleXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGNvbnN0cmFpbnRJZCBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb25zdHJhaW50SWQuY29sdW1uTmFtZV0gPVxuICAgICAgICBjb25zdHJhaW50SWQuY29uc3RyYWludE5hbWU7XG4gICAgfVxuICAgIC8vIENoZWNrIGZvciBleGlzdGluZyBmb3JlaWduIGtleXNcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0ZvcmVpZ25LZXlzKS5pbmNsdWRlcyhjb2x1bW5OYW1lKSkge1xuICAgICAgICBpZiAob3BlcmF0aW9uID09IFwiUkVNT1ZFXCIgfHwgb3BlcmF0aW9uID09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuZHJvcFJlbGF0aW9uc2hpcHMoXG4gICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgICAgcGFyZW50VGFibGVOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgb3BlcmF0aW9uID09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb2x1bW5OYW1lXSBhcyBzdHJpbmdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogYFJlbW92ZSBleGlzdGluZyBmb3JlaWduIGtleSBvbiAke2NvbHVtbk5hbWV9IGZpcnN0YCxcbiAgICAgICAgICAgIGNvZGU6IFwiV0JfRktfRVhJU1RTXCIsXG4gICAgICAgICAgICBhcG9sbG9FcnJvcjogXCJCQURfVVNFUl9JTlBVVFwiLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAob3BlcmF0aW9uID09IFwiQUREXCIgfHwgb3BlcmF0aW9uID09IFwiQ1JFQVRFXCIpIHtcbiAgICAgIC8vIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS51bnRyYWNrVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIC8vIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBpZiAob3BlcmF0aW9uID09IFwiQ1JFQVRFXCIpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlRm9yZWlnbktleShcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgICAgcGFyZW50Q29sdW1uTmFtZXNcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgY29sdW1uTmFtZXNbMF0sIC8vIGF1dGhvcl9pZFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUgLy8gYXV0aG9yc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzIC8vIGF1dGhvcl9pZFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VyKFxuICAgIHVzZXJFbWFpbDogc3RyaW5nLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudGFibGVVc2VyKHVzZXJFbWFpbCwgc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbDogc3RyaW5nLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZUJ5U2NoZW1hVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlckJ5RW1haWwodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJvbGVCeU5hbWUoXCJ0YWJsZV9pbmhlcml0XCIpO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHVzZXJSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHJvbGVSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImF4aW9zXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJncmFwaHFsLXRvb2xzXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJncmFwaHFsLXR5cGUtanNvblwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwibG9kYXNoXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJwZ1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwidHNsb2dcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInZvY2FcIik7OyIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIvLyBzdGFydHVwXG4vLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbi8vIFRoaXMgZW50cnkgbW9kdWxlIGlzIHJlZmVyZW5jZWQgYnkgb3RoZXIgbW9kdWxlcyBzbyBpdCBjYW4ndCBiZSBpbmxpbmVkXG52YXIgX193ZWJwYWNrX2V4cG9ydHNfXyA9IF9fd2VicGFja19yZXF1aXJlX18oXCIuL3NyYy93aGl0ZWJyaWNrLWNsb3VkLnRzXCIpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7OztBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBOzs7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTs7Ozs7Ozs7OztBQVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQThCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7O0FBVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7Ozs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBcnFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNMQTtBQXNCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUExQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBcEJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ1ZBO0FBbUJBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQXZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNSQTtBQVVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0hBO0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE1QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUExQkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFTQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTdCQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUM5QkE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFNQTtBQW9OQTtBQWxOQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBOztBQXhOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdU5BO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzNPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBbUJBOzs7Ozs7OztBQVFBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDdkVBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTJCQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNuRUE7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEySEE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMvVUE7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1CQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN4REE7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5Q0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDcEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBc3RCQTtBQXB0QkE7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFBQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQVFBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQVFBO0FBQUE7QUFHQTs7QUFRQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQ2h2QkE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0EiLCJzb3VyY2VSb290IjoiIn0=