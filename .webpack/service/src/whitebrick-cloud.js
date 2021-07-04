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
                    whitebrick_cloud_1.log.debug(`dal.executeQuery QueryParams: ${queryParams.query}`, `    [ ${queryParams.params ? queryParams.params.join(", ") : ""} ]`);
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
                results.push(whitebrick_cloud_1.errResult({
                    message: error.message,
                    refCode: "PG_" + error.code,
                }));
            }
            finally {
                client.release();
            }
            return results;
        });
    }
    static sanitize(str) {
        return str.replace(/[^\w%]+/g, "");
    }
    rolesIdLookup() {
        return __awaiter(this, void 0, void 0, function* () {
            const nameIdLookup = {};
            const result = yield this.executeQuery({
                query: `
        SELECT wb.roles.id, wb.roles.name
        FROM wb.roles
        WHERE custom IS false
      `,
            });
            if (!result.success)
                return result;
            for (const row of result.payload.rows) {
                nameIdLookup[row.name] = row.id;
            }
            result.payload = nameIdLookup;
            return result;
        });
    }
    roleIdsFromNames(roleNames) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.roles.id
        FROM wb.roles
        WHERE custom IS false
        AND name=ANY($1)
      `,
                params: [roleNames],
            });
            if (result.success) {
                result.payload = result.payload.rows.map((row) => row.id);
            }
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
            if (result.success) {
                result.payload = entity_1.Role.parseResult(result.payload)[0];
                if (!result.payload) {
                    return whitebrick_cloud_1.errResult({
                        wbCode: "ROLE_NOT_FOUND",
                        values: [name],
                    });
                }
            }
            return result;
        });
    }
    setRole(userIds, roleName, roleLevel, objectId, keepImpliedFrom) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const params = [];
            const date = new Date();
            let query = `
      INSERT INTO ${wbTable} (role_id,  user_id, ${wbColumn}, updated_at)
      VALUES
    `;
            for (const userId of userIds) {
                query += `
        (
          ${roleResult.payload.id},
          ${userId},
          ${objectId},
          $${params.length + 1}
        )
      `;
                params.push(date);
                if (params.length != userIds.length)
                    query += ", ";
            }
            query += `
      ON CONFLICT (user_id, ${wbColumn})
      DO UPDATE SET
      role_id=EXCLUDED.role_id,
      updated_at=EXCLUDED.updated_at
    `;
            if (!keepImpliedFrom)
                query += ", implied_from_role_id=NULL";
            return yield this.executeQuery({
                query: query,
                params: params,
            });
        });
    }
    deleteRole(userIds, roleLevel, objectId, parentObjectId, impliedFromRoles) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [userIds];
            let wbTable = "";
            let wbWhere = "";
            switch (roleLevel) {
                case "organization":
                    wbTable = "wb.organization_users";
                    wbWhere = "AND organization_id=$2";
                    params.push(objectId);
                    break;
                case "schema":
                    wbTable = "wb.schema_users";
                    if (objectId) {
                        wbWhere = "AND schema_id=$2";
                        params.push(objectId);
                    }
                    else if (parentObjectId) {
                        wbWhere = `
            AND schema_id IN (
              SELECT id FROM wb.schemas
              WHERE organization_owner_id=$2
            )
          `;
                        params.push(parentObjectId);
                    }
                    break;
                case "table":
                    wbTable = "wb.table_users";
                    if (objectId) {
                        wbWhere = "AND table_id=$2";
                        params.push(objectId);
                    }
                    else if (parentObjectId) {
                        wbWhere = `
            AND table_id IN (
              SELECT id FROM wb.tables
              WHERE schema_id=$2
            )
          `;
                        params.push(parentObjectId);
                    }
                    break;
            }
            let result = whitebrick_cloud_1.errResult();
            if (impliedFromRoles) {
                wbWhere += `AND implied_from_role_id=ANY($3)`;
                result = yield this.roleIdsFromNames(impliedFromRoles);
                if (!result.success)
                    return result;
                params.push(result.payload);
            }
            result = yield this.executeQuery({
                query: `
        DELETE FROM ${wbTable}
        WHERE user_id=ANY($1)
        ${wbWhere}
      `,
                params: params,
            });
            return result;
        });
    }
    deleteAndSetTablePermissions(tableId, deleteOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.rolesIdLookup();
            if (!result.success)
                return result;
            const rolesIdLookup = result.payload;
            const queryParams = [
                {
                    query: `
          DELETE FROM wb.table_permissions
          WHERE table_id=$1
        `,
                    params: [tableId],
                },
            ];
            if (!deleteOnly) {
                for (const tableRole of Object.keys(entity_1.Role.SYSROLES_TABLES)) {
                    for (const permissionPrefix of entity_1.Role.SYSROLES_TABLES[tableRole]
                        .permissionPrefixes) {
                        queryParams.push({
                            query: `
              INSERT INTO wb.table_permissions(table_permission_key, user_id, table_id)
              SELECT '${entity_1.Role.tablePermissionKey(permissionPrefix, tableId)}', user_id, ${tableId}
              FROM wb.table_users
              JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
              WHERE wb.table_users.table_id=$1 AND wb.roles.name=$2
            `,
                            params: [tableId, tableRole],
                        });
                    }
                }
            }
            const results = yield this.executeQueries(queryParams);
            return results[results.length - 1];
        });
    }
    userIdFromAuthId(authId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.users.id
        FROM wb.users
        WHERE auth_id=$1
        LIMIT 1
      `,
                params: [authId],
            });
            if (result.success) {
                if (result.payload.rows.length == 0) {
                    return whitebrick_cloud_1.errResult({
                        wbCode: "WB_USER_NOT_FOUND",
                        values: [authId],
                    });
                }
                result.payload = result.payload.rows[0].id;
            }
            return result;
        });
    }
    users(ids, emails, emailPattern) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlWhere = "";
            let params = [];
            if (ids) {
                sqlWhere = "WHERE id=ANY($1)";
                params.push(ids);
            }
            else if (emails) {
                sqlWhere = "WHERE email=ANY($1)";
                params.push(emails);
            }
            else if (emailPattern) {
                sqlWhere = "WHERE email LIKE $1";
                params.push(emailPattern);
            }
            const result = yield this.executeQuery({
                query: `
      SELECT wb.users.*
      FROM wb.users
      ${sqlWhere}
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
                return whitebrick_cloud_1.errResult({
                    message: "dal.updateUser: all parameters are null",
                });
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
    organizations(organizationIds, organizationNames, organizationNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let query = `
      SELECT wb.organizations.*
      FROM wb.organizations
    `;
            if (organizationIds) {
                query += `
        WHERE wb.organizations.id=ANY($1)
      `;
                params.push(organizationIds);
            }
            else if (organizationNames) {
                query += `
        WHERE wb.organizations.name=ANY($1)
      `;
                params.push(organizationNames);
            }
            else if (organizationNamePattern) {
                query += `
        WHERE wb.organizations.name LIKE $1
      `;
                params.push(organizationNamePattern);
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
    organizationsByUsers(userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "WHERE wb.users.id=ANY($1)";
                params.push(userIds);
            }
            else if (userEmails) {
                sqlWhere = "WHERE wb.users.email=ANY($1)";
                params.push(userEmails);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.organizations.*,
        wb.roles.name as user_role,
        FROM wb.organizations
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success) {
                result.payload = entity_1.Organization.parseResult(result.payload);
            }
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
            query += ` WHERE name=$${params.length} RETURNING *`;
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
    organizationUsers(name, id, roles) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlWhere = "";
            const params = [];
            if (id) {
                sqlWhere = "WHERE wb.organization_users.organization_id=$1";
                params.push(id);
            }
            else if (name) {
                sqlWhere = "WHERE wb.organizations.name=$1";
                params.push(name);
            }
            if (roles) {
                sqlWhere += " AND wb.roles.name=ANY($2)";
                params.push(roles);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.organization_users.*,
        wb.organizations.name as organization_name,
        wb.users.email as user_email,
        wb.roles.name as role
        FROM wb.organization_users
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.organizations ON wb.organization_users.organization_id=wb.organizations.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.OrganizationUser.parseResult(result.payload);
            return result;
        });
    }
    schemas(schemaIds, schemaNames, schemaNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const pgParams = [
                entity_1.Schema.SYS_SCHEMA_NAMES,
            ];
            const wbParams = [];
            let sqlPgWhere = "";
            let sqlWbWhere = "";
            if (schemaIds) {
                sqlWbWhere = "WHERE id=ANY($1)";
                wbParams.push(schemaIds);
            }
            else if (schemaNames) {
                sqlPgWhere = "AND schema_name=ANY($2)";
                pgParams.push(schemaNames);
                sqlWbWhere = "WHERE name=ANY($1)";
                wbParams.push(schemaNames);
            }
            else if (schemaNamePattern) {
                sqlPgWhere = "AND schema_name LIKE $2";
                pgParams.push(schemaNamePattern);
                sqlWbWhere = "WHERE name LIKE $1";
                wbParams.push(schemaNamePattern);
            }
            const results = yield this.executeQueries([
                {
                    query: `
          SELECT information_schema.schemata.*
          FROM information_schema.schemata
          WHERE schema_name NOT LIKE 'pg_%'
          AND schema_name!=ANY($1)
          ${sqlPgWhere}
        `,
                    params: pgParams,
                },
                {
                    query: `
          SELECT wb.schemas.*
          FROM wb.schemas
          ${sqlWbWhere}
        `,
                    params: wbParams,
                },
            ]);
            if (results[0].success && results[1].success) {
                if (results[0].payload.rows.length != results[1].payload.rows.length) {
                    return whitebrick_cloud_1.errResult({
                        message: "dal.schemas: wb.schemas out of sync with information_schema.schemata",
                    });
                }
                else {
                    results[1].payload = entity_1.Schema.parseResult(results[1].payload);
                }
            }
            return results[1];
        });
    }
    schemasByUsers(userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "WHERE wb.users.id=ANY($1)";
                params.push(userIds);
            }
            else if (userEmails) {
                sqlWhere = "WHERE wb.users.email=ANY($1)";
                params.push(userEmails);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schemas.*,
        wb.roles.name as user_role,
        wb.organizations.name as organization_owner_name,
        user_owners.email as user_owner_email
        FROM wb.schemas
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.users user_owners ON wb.schemas.user_owner_id=user_owners.id
        LEFT JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Schema.parseResult(result.payload);
            return result;
        });
    }
    schemasByUserOwner(userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlWhere = "";
            if (userId) {
                sqlWhere = "WHERE wb.users.id=$1";
                params.push(userId);
            }
            else if (userEmail) {
                sqlWhere = "WHERE wb.users.email=$1";
                params.push(userEmail);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schemas.*,
        wb.users.email as user_owner_email,
        'schema_owner' as user_role
        FROM wb.schemas
        JOIN wb.users ON wb.schemas.user_owner_id=wb.users.id
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Schema.parseResult(result.payload);
            return result;
        });
    }
    schemasByOrganizationOwner(organizationId, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlWhere = "";
            if (organizationId) {
                sqlWhere = "WHERE wb.organizations.id=$1";
                params.push(organizationId);
            }
            else if (organizationName) {
                sqlWhere = "WHERE wb.organizations.name=$1";
                params.push(organizationName);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schemas.*,
        wb.organizations.name as organization_owner_name
        FROM wb.schemas
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Schema.parseResult(result.payload);
            return result;
        });
    }
    schemasByOrganizationOwnerAdmin(userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlWhere = "";
            if (userId) {
                sqlWhere = "AND wb.users.id=$1";
                params.push(userId);
            }
            else if (userEmail) {
                sqlWhere = "AND wb.users.email=$1";
                params.push(userEmail);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schemas.*,
        wb.organizations.name as organization_owner_name
        wb.roles.name as user_role,
        FROM wb.schemas
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        WHERE wb.roles.name='organization_administrator'
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Schema.parseResult(result.payload);
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
    schemaUsers(schemaName, userIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [schemaName];
            let whereSql = "";
            if (userIds) {
                whereSql = "AND wb.schema_users.user_id=ANY($2)";
                params.push(userIds);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schema_users.*,
        wb.schemas.name as schema_name,
        wb.users.email as user_email,
        wb.roles.name as role
        FROM wb.schema_users
        JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        WHERE wb.schemas.name=$1
        ${whereSql}
      `,
                params: params,
            });
            if (result.success) {
                result.payload = entity_1.SchemaUser.parseResult(result.payload);
                if (!result.payload) {
                    return whitebrick_cloud_1.errResult({
                        wbCode: "WB_SCHEMA_USERS_NOT_FOUND",
                        values: [schemaName],
                    });
                }
            }
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
    tableBySchemaNameTableName(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.tables.*, wb.schemas.name as schema_name
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2 LIMIT 1
      `,
                params: [schemaName, tableName],
            });
            if (result.success) {
                result.payload = entity_1.Table.parseResult(result.payload)[0];
                if (!result.payload) {
                    return whitebrick_cloud_1.errResult({
                        wbCode: "WB_TABLE_NOT_FOUND",
                        values: [schemaName, tableName],
                    });
                }
            }
            return result;
        });
    }
    addOrCreateTable(schemaName, tableName, tableLabel, create) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.addOrCreateTable ${schemaName} ${tableName} ${tableLabel} ${create}`);
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            let result = yield this.schemas(undefined, [schemaName]);
            if (!result.success)
                return result;
            const queriesAndParams = [
                {
                    query: `
        INSERT INTO wb.tables(schema_id, name, label)
        VALUES ($1, $2, $3) RETURNING *
      `,
                    params: [result.payload[0].id, tableName, tableLabel],
                },
            ];
            if (create) {
                queriesAndParams.push({
                    query: `CREATE TABLE "${schemaName}"."${tableName}"()`,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            if (create && !results[1].success)
                return results[1];
            if (results[0].success) {
                results[0].payload = entity_1.Table.parseResult(results[0].payload)[0];
            }
            return results[0];
        });
    }
    removeOrDeleteTable(schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            let result = yield this.schemas(undefined, [schemaName]);
            if (!result.success)
                return result;
            const queriesAndParams = [
                {
                    query: `
          DELETE FROM wb.tables
          WHERE schema_id=$1 AND name=$2
        `,
                    params: [result.payload[0].id, tableName],
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
            let result = yield this.tableBySchemaNameTableName(schemaName, tableName);
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
    tableUsers(schemaName, tableName, userIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [schemaName, tableName];
            let whereSql = "";
            if (userIds) {
                whereSql = "AND wb.table_users.user_id=ANY($3)";
                params.push(userIds);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.table_users.*,
        wb.schemas.name as schema_name,
        wb.tables.name as table_name,
        wb.users.email as user_email,
        wb.roles.name as role
        FROM wb.table_users
        JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2
        ${whereSql}
      `,
                params: params,
            });
            if (result.success) {
                result.payload = entity_1.TableUser.parseResult(result.payload);
                if (!result.payload) {
                    return whitebrick_cloud_1.errResult({
                        wbCode: "WB_TABLE_USERS_NOT_FOUND",
                        values: [schemaName, tableName],
                    });
                }
            }
            return result;
        });
    }
    setSchemaUserRolesFromOrganizationRoles(organizationId, roleMap, schemaIds, userIds, clearExisting) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`setSchemaUserRolesFromOrganizationRoles(${organizationId}, <roleMap>, ${schemaIds}, ${userIds}, ${clearExisting})`);
            let result = yield this.rolesIdLookup();
            if (!result.success)
                return result;
            let whereSchemasSql = "";
            let whereUsersSql = "";
            let whereSchemaUsersSql = "";
            let onConflictSql = "";
            if (schemaIds && schemaIds.length > 0) {
                whereSchemasSql = `AND wb.schemas.id IN (${schemaIds.join(",")})`;
            }
            if (userIds && userIds.length > 0) {
                whereSchemaUsersSql = `
        AND wb.schema_users.user_id IN (${userIds.join(",")})
      `;
                whereUsersSql = `AND wb.users.id IN (${userIds.join(",")})`;
            }
            const rolesIdLookup = result.payload;
            const queryParams = [];
            const date = new Date();
            if (clearExisting) {
                queryParams.push({
                    query: `
          DELETE FROM wb.schema_users
          WHERE
            wb.schema_users.schema_id IN (
              SELECT id FROM wb.schemas
              WHERE wb.schemas.organization_owner_id=$1
              ${whereSchemasSql}
            )
            ${whereSchemaUsersSql}
        `,
                    params: [organizationId],
                });
            }
            else {
                onConflictSql = `
        ON CONFLICT (schema_id, user_id)
        DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
        WHERE wb.schema_users.implied_from_role_id IS NOT NULL
      `;
            }
            for (const organizationRole of Object.keys(roleMap)) {
                queryParams.push({
                    query: `
          INSERT INTO wb.schema_users(schema_id, user_id, role_id, implied_from_role_id, updated_at)
          SELECT
          wb.schemas.id,
          user_id,
          ${rolesIdLookup[roleMap[organizationRole]]},
          ${rolesIdLookup[organizationRole]},
          $1
          FROM wb.organization_users
          JOIN wb.schemas ON wb.schemas.organization_owner_id=wb.organization_users.organization_id
          JOIN wb.users ON wb.organization_users.user_id=wb.users.id
          WHERE wb.organization_users.organization_id=$2
          AND wb.organization_users.role_id=$3
          ${whereSchemasSql}
          ${whereUsersSql}
          ${onConflictSql}
        `,
                    params: [date, organizationId, rolesIdLookup[organizationRole]],
                });
            }
            const results = yield this.executeQueries(queryParams);
            return results[results.length - 1];
        });
    }
    setTableUserRolesFromSchemaRoles(schemaId, roleMap, tableIds, userIds, clearExisting) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`setTableUserRolesFromSchemaRoles(${schemaId}, <roleMap>, ${tableIds}, ${userIds}, ${clearExisting})`);
            let result = yield this.rolesIdLookup();
            if (!result.success)
                return result;
            let whereTablesSql = "";
            let whereUsersSql = "";
            let whereTableUsersSql = "";
            let onConflictSql = "";
            if (tableIds && tableIds.length > 0) {
                whereTablesSql = `AND wb.tables.id IN (${tableIds.join(",")})`;
            }
            if (userIds && userIds.length > 0) {
                whereTableUsersSql = `
        AND wb.table_users.user_id IN (${userIds.join(",")})
      `;
                whereUsersSql = `AND wb.users.id IN (${userIds.join(",")})`;
            }
            const rolesIdLookup = result.payload;
            const queryParams = [];
            const date = new Date();
            if (clearExisting) {
                queryParams.push({
                    query: `
          DELETE FROM wb.table_users
          WHERE
            wb.table_users.table_id IN (
              SELECT id FROM wb.tables
              WHERE wb.tables.schema_id=$1
              ${whereTablesSql}
            )
            ${whereTableUsersSql}
        `,
                    params: [schemaId],
                });
            }
            else {
                onConflictSql = `
        ON CONFLICT (table_id, user_id)
        DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
        WHERE wb.table_users.implied_from_role_id IS NOT NULL
      `;
            }
            for (const schemaRole of Object.keys(roleMap)) {
                queryParams.push({
                    query: `
          INSERT INTO wb.table_users(table_id, user_id, role_id, implied_from_role_id, updated_at)
          SELECT
          wb.tables.id,
          user_id,
          ${rolesIdLookup[roleMap[schemaRole]]},
          ${rolesIdLookup[schemaRole]},
          $1
          FROM wb.schema_users
          JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
          JOIN wb.tables ON wb.schemas.id=wb.tables.schema_id
          JOIN wb.users ON wb.schema_users.user_id=wb.users.id
          WHERE wb.schema_users.schema_id=$2 AND wb.schema_users.role_id=$3
          ${whereTablesSql}
          ${whereUsersSql}
          ${onConflictSql}
        `,
                    params: [date, schemaId, rolesIdLookup[schemaRole]],
                });
            }
            const results = yield this.executeQueries(queryParams);
            return results[results.length - 1];
        });
    }
    removeAllTableUsers(tableId, schemaId) {
        return __awaiter(this, void 0, void 0, function* () {
            let queryWhere = "";
            const params = [];
            if (tableId) {
                queryWhere = "WHERE table_id=$1";
                params.push(tableId);
            }
            else if (schemaId) {
                queryWhere = `
        WHERE table_id IN (
          SELECT id from wb.tables
          WHERE wb.tables.schema_id=$1
        )
      `;
                params.push(schemaId);
            }
            const result = yield this.executeQuery({
                query: `
        DELETE FROM wb.table_users
        ${queryWhere}
      `,
                params: params,
            });
            return result;
        });
    }
    saveTableUserSettings(tableId, userId, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        UPDATE wb.table_users
        SET settings=$1, updated_at=$2
        WHERE table_id=$3
        AND user_id=$4
      `,
                params: [settings, new Date(), tableId, userId],
            });
            return result;
        });
    }
    columnBySchemaTableColumn(schemaName, tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.columns(schemaName, tableName, columnName);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return whitebrick_cloud_1.errResult({
                        wbCode: "COLUMN_NOT_FOUND",
                        values: [schemaName, tableName, columnName],
                    });
                }
            }
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
    addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnPGType) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.addOrCreateColumn ${schemaName} ${tableName} ${columnName} ${columnLabel} ${columnPGType} ${create}`);
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            columnName = DAL.sanitize(columnName);
            let result = yield this.tableBySchemaNameTableName(schemaName, tableName);
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
            let result = yield this.tableBySchemaNameTableName(schemaName, tableName);
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

/***/ "./src/entity/CurrentUser.ts":
/*!***********************************!*\
  !*** ./src/entity/CurrentUser.ts ***!
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
exports.CurrentUser = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
const whitebrick_cloud_1 = __webpack_require__(/*! ../whitebrick-cloud */ "./src/whitebrick-cloud.ts");
class CurrentUser {
    constructor(wbCloud, user) {
        this.organizations = {};
        this.actionHistory = [];
        this.wbCloud = wbCloud;
        this.user = user;
        this.id = user.id;
    }
    static getSysAdmin(wbCloud) {
        return new CurrentUser(wbCloud, _1.User.getSysAdminUser());
    }
    static getPublic(wbCloud) {
        return new CurrentUser(wbCloud, _1.User.getPublicUser());
    }
    isSignedIn() {
        return this.user.id !== _1.User.PUBLIC_ID;
    }
    isSignedOut() {
        return this.user.id == _1.User.PUBLIC_ID;
    }
    isPublic() {
        return !this.isSignedIn();
    }
    isSysAdmin() {
        return this.user.id === _1.User.SYS_ADMIN_ID;
    }
    isNotSysAdmin() {
        return !this.isSysAdmin;
    }
    idIs(otherId) {
        return this.user.id == otherId;
    }
    idIsNot(otherId) {
        return !this.idIs(otherId);
    }
    initOrganizationsIfEmpty() {
        return __awaiter(this, void 0, void 0, function* () {
            if (Object.keys(this.organizations).length == 0) {
                const organizationsResult = yield this.wbCloud.organizationById(this.id);
                if (!organizationsResult.success)
                    return false;
                for (const organization of organizationsResult.payload) {
                    this.organizations[organization.id] = organization;
                }
            }
        });
    }
    isInOrganization(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initOrganizationsIfEmpty();
            return this.organizations.hasOwnProperty(organizationId);
        });
    }
    isNotInOrganization(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return !this.isInOrganization(organizationId);
        });
    }
    is(role, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (role) {
                case "organization_administrator":
                    yield this.initOrganizationsIfEmpty();
                    return (this.organizations.hasOwnProperty(objectId) &&
                        this.organizations[objectId].userRole == role);
            }
            return false;
        });
    }
    isNot(role, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            return !this.is(role, objectId);
        });
    }
    static fromContext(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const headersLowerCase = Object.entries(context.headers).reduce((acc, [key, val]) => ((acc[key.toLowerCase()] = val), acc), {});
            let result = whitebrick_cloud_1.errResult();
            if ( true &&
                headersLowerCase["x-test-user-email"]) {
                whitebrick_cloud_1.log.debug(`========== FOUND TEST USER: ${headersLowerCase["x-test-user-email"]}`);
                result = yield context.wbCloud.userByEmail(headersLowerCase["x-test-user-email"]);
                if (result.success && result.payload && result.payload.id) {
                    return new CurrentUser(context.wbCloud, result.payload);
                }
                else {
                    whitebrick_cloud_1.log.error(`CurrentUser.fromContext: Couldn't find user for test email x-test-user-email=${headersLowerCase["x-test-user-email"]}`);
                    return new CurrentUser(context.wbCloud, _1.User.getPublicUser());
                }
            }
            else if (headersLowerCase["x-hasura-role"] &&
                headersLowerCase["x-hasura-role"].toLowerCase() == "admin") {
                whitebrick_cloud_1.log.debug("========== FOUND SYSADMIN USER");
                return new CurrentUser(context.wbCloud, _1.User.getSysAdminUser());
            }
            else if (headersLowerCase["x-hasura-user-id"]) {
                whitebrick_cloud_1.log.debug(`========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`);
                const result = yield context.wbCloud.userById(parseInt(headersLowerCase["x-hasura-user-id"]));
                if (result.success && result.payload && result.payload.id) {
                    return new CurrentUser(context.wbCloud, result.payload);
                }
                else {
                    whitebrick_cloud_1.log.error(`CurrentUser.fromContext: Couldn't find user for x-hasura-user-id=${headersLowerCase["x-hasura-user-id"]}`);
                    return new CurrentUser(context.wbCloud, _1.User.getPublicUser());
                }
            }
            else {
                whitebrick_cloud_1.log.debug(`CurrentUser.fromContext: Could not find headers for Admin, Test or User in: ${JSON.stringify(context.headers)}`);
                return new CurrentUser(context.wbCloud, _1.User.getPublicUser());
            }
        });
    }
}
exports.CurrentUser = CurrentUser;


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

/***/ "./src/entity/OrganizationUser.ts":
/*!****************************************!*\
  !*** ./src/entity/OrganizationUser.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrganizationUser = void 0;
class OrganizationUser {
    static parseResult(data) {
        if (!data)
            throw new Error("OrganizationUser.parseResult: input is null");
        const organizationUsers = Array();
        data.rows.forEach((row) => {
            organizationUsers.push(OrganizationUser.parse(row));
        });
        return organizationUsers;
    }
    static parse(data) {
        if (!data)
            throw new Error("OrganizationUser.parse: input is null");
        const organizationUser = new OrganizationUser();
        organizationUser.organizationId = data.organization_id;
        organizationUser.userId = data.user_id;
        organizationUser.roleId = data.role_id;
        organizationUser.impliedFromroleId = data.implied_from_role_id;
        organizationUser.settings = data.settings;
        organizationUser.createdAt = data.created_at;
        organizationUser.updatedAt = data.updated_at;
        if (data.organization_name)
            organizationUser.organizationName = data.organization_name;
        if (data.user_email)
            organizationUser.userEmail = data.user_email;
        if (data.role)
            organizationUser.role = data.role;
        return organizationUser;
    }
}
exports.OrganizationUser = OrganizationUser;


/***/ }),

/***/ "./src/entity/Role.ts":
/*!****************************!*\
  !*** ./src/entity/Role.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Role = void 0;
class Role {
    static isRole(roleName, roleLevel) {
        switch (roleLevel) {
            case "organization":
                return Object.keys(Role.SYSROLES_ORGANIZATIONS).includes(roleName);
            case "schema":
                return Object.keys(Role.SYSROLES_SCHEMAS).includes(roleName);
            case "table":
                return Object.keys(Role.SYSROLES_TABLES).includes(roleName);
            default:
                return (Object.keys(Role.SYSROLES_ORGANIZATIONS).includes(roleName) ||
                    Object.keys(Role.SYSROLES_SCHEMAS).includes(roleName) ||
                    Object.keys(Role.SYSROLES_TABLES).includes(roleName));
        }
    }
    static areRoles(roleNames) {
        for (const roleName of roleNames) {
            if (!Role.isRole(roleName))
                return false;
        }
        return true;
    }
    static tablePermissionKeysAndTypes(tableId) {
        const PERMISSION_PREFIXES_TYPES = {
            s: "select",
            i: "insert",
            u: "update",
            d: "delete",
        };
        const permissionKeysAndTypes = [];
        for (const prefix of Object.keys(PERMISSION_PREFIXES_TYPES)) {
            permissionKeysAndTypes.push({
                permissionKey: Role.tablePermissionKey(prefix, tableId),
                type: PERMISSION_PREFIXES_TYPES[prefix],
            });
        }
        return permissionKeysAndTypes;
    }
    static tablePermissionKey(permissionPrefix, tableId) {
        return `${permissionPrefix}${tableId}`;
    }
    static hasuraTablePermissionChecksAndTypes(tableId) {
        const hasuraPermissionsAndTypes = [];
        for (const permissionKeysAndType of Role.tablePermissionKeysAndTypes(tableId)) {
            hasuraPermissionsAndTypes.push({
                permissionCheck: {
                    _exists: {
                        _table: { schema: "wb", name: "table_permissions" },
                        _where: {
                            _and: [
                                {
                                    table_permission_key: {
                                        _eq: permissionKeysAndType.permissionKey,
                                    },
                                },
                                { user_id: { _eq: "X-Hasura-User-Id" } },
                            ],
                        },
                    },
                },
                permissionType: permissionKeysAndType.type,
            });
        }
        return hasuraPermissionsAndTypes;
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
        label: "Organization Administrator",
    },
    organization_user: { label: "Organization User" },
    organization_external_user: {
        label: "Organization External User",
    },
};
Role.SYSROLES_SCHEMAS = {
    schema_owner: { label: "DB Owner" },
    schema_administrator: { label: "DB Administrator" },
    schema_manager: { label: "DB Manager" },
    schema_editor: { label: "DB Editor" },
    schema_reader: { label: "DB Reader" },
};
Role.SYSROLES_TABLES = {
    table_administrator: {
        label: "Table Administrator",
        permissionPrefixes: ["s", "i", "u", "d"],
    },
    table_manager: {
        label: "Table Manager",
        permissionPrefixes: ["s", "i", "u", "d"],
    },
    table_editor: {
        label: "Table Editor",
        permissionPrefixes: ["s", "i", "u", "d"],
    },
    table_reader: {
        label: "Table Reader",
        permissionPrefixes: ["s"],
    },
};
Role.SCHEMA_TO_TABLE_ROLE_MAP = {
    schema_owner: "table_administrator",
    schema_administrator: "table_administrator",
    schema_manager: "table_manager",
    schema_editor: "table_editor",
    schema_reader: "table_reader",
};
Role.ORGANIZATION_TO_SCHEMA_ROLE_MAP = {
    organization_administrator: "schema_administrator",
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
        schema.organizationOwnerId = data.organization_owner_id;
        schema.userOwnerId = data.user_owner_id;
        schema.createdAt = data.created_at;
        schema.updatedAt = data.updated_at;
        if (data.user_role)
            schema.userRole = data.user_role;
        if (data.organization_owner_name) {
            schema.organizationOwnerName = data.organization_owner_name;
        }
        if (data.user_owner_email)
            schema.userOwnerEmail = data.user_owner_email;
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

/***/ "./src/entity/SchemaUser.ts":
/*!**********************************!*\
  !*** ./src/entity/SchemaUser.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SchemaUser = void 0;
class SchemaUser {
    static parseResult(data) {
        if (!data)
            throw new Error("SchemaUser.parseResult: input is null");
        const schemaUsers = Array();
        data.rows.forEach((row) => {
            schemaUsers.push(SchemaUser.parse(row));
        });
        return schemaUsers;
    }
    static parse(data) {
        if (!data)
            throw new Error("SchemaUser.parse: input is null");
        const schemaUser = new SchemaUser();
        schemaUser.schemaId = data.schema_id;
        schemaUser.userId = data.user_id;
        schemaUser.roleId = data.role_id;
        schemaUser.impliedFromRoleId = data.implied_from_role_id;
        schemaUser.settings = data.settings;
        schemaUser.createdAt = data.created_at;
        schemaUser.updatedAt = data.updated_at;
        if (data.schema_name)
            schemaUser.schemaName = data.schema_name;
        if (data.user_email)
            schemaUser.userEmail = data.user_email;
        if (data.role)
            schemaUser.role = data.role;
        return schemaUser;
    }
}
exports.SchemaUser = SchemaUser;


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
        if (data.schema_name)
            table.schemaName = data.schema_name;
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
        tableUser.impliedFromroleId = data.implied_from_role_id;
        tableUser.settings = data.settings;
        tableUser.createdAt = data.created_at;
        tableUser.updatedAt = data.updated_at;
        if (data.schema_name)
            tableUser.schemaName = data.schema_name;
        if (data.table_name)
            tableUser.tableName = data.table_name;
        if (data.user_email)
            tableUser.userEmail = data.user_email;
        if (data.role)
            tableUser.role = data.role;
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
        return user;
    }
    static getSysAdminUser() {
        const date = new Date();
        const user = new User();
        user.id = User.SYS_ADMIN_ID;
        user.email = "SYS_ADMIN@example.com";
        user.firstName = "SYS Admin";
        user.lastName = "SYS Admin";
        user.createdAt = date;
        user.updatedAt = date;
        return user;
    }
    static getPublicUser() {
        const date = new Date();
        const user = new User();
        user.id = User.PUBLIC_ID;
        user.email = "PUBLIC@example.com";
        user.firstName = "Public User";
        user.lastName = "Public User";
        user.createdAt = date;
        user.updatedAt = date;
        return user;
    }
}
exports.User = User;
User.SYS_ADMIN_ID = 1;
User.PUBLIC_ID = 1;


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
__exportStar(__webpack_require__(/*! ./User */ "./src/entity/User.ts"), exports);
__exportStar(__webpack_require__(/*! ./Organization */ "./src/entity/Organization.ts"), exports);
__exportStar(__webpack_require__(/*! ./OrganizationUser */ "./src/entity/OrganizationUser.ts"), exports);
__exportStar(__webpack_require__(/*! ./Schema */ "./src/entity/Schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./SchemaUser */ "./src/entity/SchemaUser.ts"), exports);
__exportStar(__webpack_require__(/*! ./Table */ "./src/entity/Table.ts"), exports);
__exportStar(__webpack_require__(/*! ./TableUser */ "./src/entity/TableUser.ts"), exports);
__exportStar(__webpack_require__(/*! ./Column */ "./src/entity/Column.ts"), exports);


/***/ }),

/***/ "./src/environment.ts":
/*!****************************!*\
  !*** ./src/environment.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.userMessages = exports.environment = void 0;
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
    testIgnoreErrors: (process.env.TEST_IGNORE_ERRORS || false),
};
exports.userMessages = {
    WB_USER_NOT_FOUND: ["User not found.", "BAD_USER_INPUT"],
    WB_USERS_NOT_FOUND: ["One or more users were not found."],
    WB_ORGANIZATION_NOT_FOUND: ["Organization not found.", "BAD_USER_INPUT"],
    WB_ORGANIZATION_NAME_TAKEN: [
        "This Organization name has already been taken.",
        "BAD_USER_INPUT",
    ],
    WB_ORGANIZATION_NOT_USER_EMPTY: [
        "This organization still has non-administrative users.",
        "BAD_USER_INPUT",
    ],
    WB_ORGANIZATION_NO_ADMINS: [
        "You can not remove all Administrators from an Organization - you must leave at least one.",
        "BAD_USER_INPUT",
    ],
    WB_USER_NOT_IN_ORG: ["User must be in Organization"],
    WB_USER_NOT_SCHEMA_OWNER: ["The current user is not the owner."],
    WB_SCHEMA_NOT_FOUND: ["Database could not be found."],
    WB_BAD_SCHEMA_NAME: [
        "Database name can not begin with 'pg_' or be in the reserved list.",
        "BAD_USER_INPUT",
    ],
    WB_CANT_REMOVE_SCHEMA_USER_OWNER: [
        "You can not remove the user_owner from a Schema",
    ],
    WB_SCHEMA_USERS_NOT_FOUND: ["One or more Schema Users not found."],
    WB_TABLE_NOT_FOUND: ["Table could not be found."],
    WB_TABLE_NAME_EXISTS: ["This Table name already exists", "BAD_USER_INPUT"],
    COLUMN_NOT_FOUND: ["Column could not be found"],
    WB_COLUMN_NAME_EXISTS: ["This Column name already exists.", "BAD_USER_INPUT"],
    WB_PK_EXISTS: ["Remove existing primary key first.", "BAD_USER_INPUT"],
    WB_FK_EXISTS: [
        "Remove existing foreign key on the column first.",
        "BAD_USER_INPUT",
    ],
    WB_TABLE_USERS_NOT_FOUND: ["One or more Table Users not found."],
    ROLE_NOT_FOUND: ["This role could not be found."],
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
    static errIgnore() {
        if (this.IGNORE_ERRORS || environment_1.environment.testIgnoreErrors) {
            return this.HASURA_IGNORE_CODES;
        }
        else {
            return [];
        }
    }
    post(type, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = whitebrick_cloud_1.errResult();
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
                    if (!HasuraApi.errIgnore().includes(error.response.data.code)) {
                        whitebrick_cloud_1.log.error("error.response.data: " + JSON.stringify(error.response.data));
                        result = whitebrick_cloud_1.errResult({
                            message: error.response.data.error,
                            refCode: error.response.data.code,
                        });
                    }
                    else {
                        result = {
                            success: true,
                        };
                    }
                }
                else {
                    result = whitebrick_cloud_1.errResult({
                        message: error.message,
                    });
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
                result.refCode &&
                HasuraApi.errIgnore().includes(result.refCode)) {
                return {
                    success: true,
                    payload: true,
                    message: result.refCode,
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
                result.refCode &&
                HasuraApi.errIgnore().includes(result.refCode)) {
                return {
                    success: true,
                    payload: true,
                    message: result.refCode,
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
                result.refCode &&
                HasuraApi.errIgnore().includes(result.refCode)) {
                return {
                    success: true,
                    payload: true,
                    message: result.refCode,
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
                result.refCode &&
                HasuraApi.errIgnore().includes(result.refCode)) {
                return {
                    success: true,
                    payload: true,
                    message: result.refCode,
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
                (!result.refCode ||
                    (result.refCode && !HasuraApi.errIgnore().includes(result.refCode)))) {
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
                result.refCode &&
                HasuraApi.errIgnore().includes(result.refCode)) {
                return {
                    success: true,
                    payload: true,
                    message: result.refCode,
                };
            }
            return result;
        });
    }
    createPermission(schemaName, tableName, permissionCheck, type, role, columns) {
        return __awaiter(this, void 0, void 0, function* () {
            const payload = {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                role: role,
                permission: {
                    columns: columns,
                },
            };
            if (type == "insert") {
                payload.permission.check = permissionCheck;
            }
            else {
                payload.permission.filter = permissionCheck;
            }
            const result = yield this.post(`pg_create_${type}_permission`, payload);
            return result;
        });
    }
    deletePermission(schemaName, tableName, type, role) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.post(`pg_drop_${type}_permission`, {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                role: role,
            });
            return result;
        });
    }
}
HasuraApi.IGNORE_ERRORS = false;
HasuraApi.HASURA_IGNORE_CODES = [
    "already-untracked",
    "already-tracked",
    "not-exists",
    "already-exists",
    "unexpected",
    "permission-denied",
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
    wbAuth(schemaName: String!, userAuthId: String!): JSON!
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
        wbAuth: (_, { schemaName, userAuthId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.auth(schemaName, userAuthId);
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
const CurrentUser_1 = __webpack_require__(/*! ../entity/CurrentUser */ "./src/entity/CurrentUser.ts");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Organization {
    id: ID!
    name: String!
    label: String!
    userRole: String
    createdAt: String!
    updatedAt: String!
  }

  type OrganizationUser {
    organizationId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    organizationName: String
    userEmail: String
    role: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Organizations
    """
    wbOrganizations(userEmail: String): [Organization]
    wbOrganizationById(id: ID!): Organization
    wbOrganizationByName(currentUserEmail: String!, name: String!): Organization
    """
    Organization Users
    """
    wbOrganizationUsers(
      organizationName: String!
      roles: [String]
    ): [OrganizationUser]
  }

  extend type Mutation {
    """
    Organizations
    """
    wbCreateOrganization(name: String!, label: String!): Organization
    wbUpdateOrganization(
      name: String!
      newName: String
      newLabel: String
    ): Organization
    wbDeleteOrganization(name: String!): Boolean
    """
    Organization Users
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
  }
`;
exports.resolvers = {
    Query: {
        wbOrganizations: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield CurrentUser_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleOrganizations(currentUser);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbOrganizationByName: (_, { currentUserEmail, name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.organizationByName(name);
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
        wbOrganizationUsers: (_, { organizationName, roles }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.organizationUsers(organizationName, undefined, roles);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateOrganization: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield CurrentUser_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createOrganization(currentUser, name, label);
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
        wbSetOrganizationUsersRole: (_, { organizationName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.setOrganizationUsersRole(organizationName, role, undefined, userEmails);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveUsersFromOrganization: (_, { userEmails, organizationName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.removeUsersFromOrganization(organizationName, undefined, userEmails);
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
const CurrentUser_1 = __webpack_require__(/*! ../entity/CurrentUser */ "./src/entity/CurrentUser.ts");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    createdAt: String!
    updatedAt: String!
    userRole: String
    organizationOwnerName: String
    userOwnerEmail: String
  }

  type SchemaUser {
    schemaId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    schemaName: String
    userEmail: String
    role: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Schemas
    """
    wbSchemas: [Schema]
    """
    Schema Users
    """
    wbSchemaUsers(schemaName: String!, userEmails: [String]): [SchemaUser]
  }

  extend type Mutation {
    """
    Schemas
    """
    wbCreateSchema(
      name: String!
      label: String!
      organizationOwnerId: Int
      organizationOwnerName: String
    ): Schema
    """
    Schema Users
    """
    wbSetSchemaUsersRole(
      schemaName: String!
      userEmails: [String]!
      role: String!
    ): Boolean
    wbRemoveSchemaUsers(schemaName: String!, userEmails: [String]!): Boolean
  }
`;
exports.resolvers = {
    Query: {
        wbSchemas: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield CurrentUser_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleSchemas(currentUser);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSchemaUsers: (_, { schemaName, userEmails }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.schemaUsers(schemaName, userEmails);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateSchema: (_, { name, label, organizationOwnerId, organizationOwnerName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield CurrentUser_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createSchema(currentUser, name, label, organizationOwnerId, organizationOwnerName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSetSchemaUsersRole: (_, { schemaName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.setSchemaUsersRole(schemaName, userEmails, role);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveSchemaUsers: (_, { schemaName, userEmails }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.removeSchemaUsers(schemaName, userEmails);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
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
    schemaName: String
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
    impliedFromRoleId: Int
    schemaName: String
    tableName: String
    userEmail: String
    role: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Tables
    """
    wbTables(schemaName: String!, withColumns: Boolean): [Table]
    """
    Table Users
    """
    wbTableUsers(
      schemaName: String!
      tableName: String!
      userEmails: [String]
    ): [TableUser]
    """
    Columns
    """
    wbColumns(schemaName: String!, tableName: String!): [Column]
  }

  extend type Mutation {
    """
    Tables
    """
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
    wbAddAllExistingRelationships(schemaName: String!): Boolean!
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
    """
    Table Users
    """
    wbSetTableUsersRole(
      schemaName: String!
      tableName: String!
      userEmails: [String]!
      role: String!
    ): Boolean
    wbSaveTableUserSettings(
      userEmail: String!
      schemaName: String!
      tableName: String!
      settings: JSON!
    ): Boolean!
    """
    Columns
    """
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
  }
`;
exports.resolvers = {
    JSON: graphql_type_json_1.GraphQLJSON,
    Query: {
        wbTables: (_, { schemaName, withColumns }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tables(schemaName, withColumns);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbTableUsers: (_, { schemaName, tableName, userEmails }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tableUsers(schemaName, tableName, userEmails);
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
            const result = yield context.wbCloud.addOrRemoveAllExistingRelationships(schemaName);
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
        wbSetTableUsersRole: (_, { schemaName, tableName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.setTableUsersRole(schemaName, tableName, userEmails, role);
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
  }

  extend type Query {
    """
    Users
    """
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
  }

  extend type Mutation {
    """
    Users
    """
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(
      id: ID!
      email: String
      firstName: String
      lastName: String
    ): User
  }
`;
exports.resolvers = {
    Query: {
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
exports.apolloErr = exports.errResult = exports.WhitebrickCloud = exports.log = exports.graphqlHandler = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const tslog_1 = __webpack_require__(/*! tslog */ "tslog");
const dal_1 = __webpack_require__(/*! ./dal */ "./src/dal.ts");
const hasura_api_1 = __webpack_require__(/*! ./hasura-api */ "./src/hasura-api.ts");
const types_1 = __webpack_require__(/*! ./types */ "./src/types/index.ts");
const v = __webpack_require__(/*! voca */ "voca");
const environment_1 = __webpack_require__(/*! ./environment */ "./src/environment.ts");
const entity_1 = __webpack_require__(/*! ./entity */ "./src/entity/index.ts");
const CurrentUser_1 = __webpack_require__(/*! ./entity/CurrentUser */ "./src/entity/CurrentUser.ts");
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
        return apolloErr(result);
    }
    uidFromHeaders(headers) {
        return __awaiter(this, void 0, void 0, function* () {
            const headersLowerCase = Object.entries(headers).reduce((acc, [key, val]) => ((acc[key.toLowerCase()] = val), acc), {});
            let result = errResult();
            if (headersLowerCase["x-hasura-role"] &&
                headersLowerCase["x-hasura-role"].toLowerCase() == "admin") {
                exports.log.debug("========== FOUND ADMIN USER");
                return {
                    success: true,
                    payload: entity_1.User.SYS_ADMIN_ID,
                };
            }
            else if ( true &&
                headersLowerCase["x-test-user-id"]) {
                result = yield this.userByEmail(headersLowerCase["x-test-user-id"]);
                if (result.success)
                    result.payload = result.payload.id;
                exports.log.debug(`========== FOUND TEST USER: ${headersLowerCase["x-test-user-id"]}`);
            }
            else if (headersLowerCase["x-hasura-user-id"]) {
                result = {
                    success: true,
                    payload: parseInt(headersLowerCase["x-hasura-user-id"]),
                };
                exports.log.debug(`========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`);
            }
            else {
                result = errResult({
                    message: `uidFromHeaders: Could not find headers for Admin, Test or User in: ${JSON.stringify(headers)}`,
                });
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
            exports.log.debug(`resetTestData()`);
            let result = yield this.schemas(undefined, undefined, "test_%");
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
            result = yield this.deleteTestUsers();
            return result;
        });
    }
    auth(schemaName, userAuthId) {
        return __awaiter(this, void 0, void 0, function* () {
            let hasuraUserId;
            let result = yield this.dal.userIdFromAuthId(userAuthId);
            if (!result.success)
                return result;
            hasuraUserId = result.payload;
            return {
                success: true,
                payload: {
                    "X-Hasura-Allowed-Roles": ["wbuser"],
                    "X-Hasura-Default-Role": "wbuser",
                    "X-Hasura-User-Id": hasuraUserId,
                    "X-Hasura-Schema-Name": schemaName,
                    "X-Hasura-Authenticated-At": Date().toString(),
                },
            };
        });
    }
    roleByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.roleByName(name);
        });
    }
    deleteAndSetTablePermissions(table, deleteOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.deleteAndSetTablePermissions(table.id);
        });
    }
    setRole(userIds, roleName, roleLevel, object) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`setRole(${userIds},${roleName},${roleLevel},${JSON.stringify(object)})`);
            if (!entity_1.Role.isRole(roleName, roleLevel)) {
                return errResult({
                    message: `${roleName} is not a valid name for an ${roleLevel} Role.`,
                });
            }
            let result = errResult();
            switch (roleLevel) {
                case "organization":
                    switch (roleName) {
                        case "organization_user":
                            result = yield this.organizationUsers(object.name, undefined, [
                                "organization_administrator",
                            ]);
                            exports.log.info(`@@@@@@@@@@@@@@@@@@ result ${JSON.stringify(result)}`);
                            if (!result.success)
                                return result;
                            const currentAdminIds = result.payload.map((organizationUser) => organizationUser.userId);
                            const demotedAdmins = userIds.filter((id) => currentAdminIds.includes(id));
                            exports.log.info(`@@@@@@@@@@@@@@@@@@ userIds ${userIds}`);
                            exports.log.info(`@@@@@@@@@@@@@@@@@@ currentAdminIds ${currentAdminIds}`);
                            exports.log.info(`@@@@@@@@@@@@@@@@@@ demotedAdmins ${currentAdminIds}`);
                            if (demotedAdmins.length > 0) {
                                result = yield this.removeUsersFromOrganization(object.name, demotedAdmins);
                                if (!result.success)
                                    return result;
                            }
                            result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                            break;
                        case "organization_administrator":
                            result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                            if (result.success)
                                return result;
                            result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(object.id, entity_1.Role.ORGANIZATION_TO_SCHEMA_ROLE_MAP, undefined, userIds);
                            if (result.success)
                                return result;
                            result = yield this.schemasByOrganizationOwner(object.id);
                            if (!result.success)
                                return result;
                            for (const schema of result.payload) {
                                result = yield this.dal.setTableUserRolesFromSchemaRoles(schema.id, entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP, undefined, userIds);
                                if (result.success)
                                    return result;
                            }
                            break;
                        case "organization_external_user":
                            result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                            break;
                    }
                    break;
                case "schema":
                    result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                    if (result.success)
                        return result;
                    result = yield this.dal.setTableUserRolesFromSchemaRoles(object.id, entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP, undefined, userIds);
                    break;
                case "table":
                    result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                    break;
            }
            return result;
        });
    }
    deleteRole(userIds, roleLevel, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.deleteRole(userIds, roleLevel, objectId);
            if (!result.success)
                return result;
            switch (roleLevel) {
                case "organization":
                    result = yield this.dal.deleteRole(userIds, "schema", undefined, objectId, ["organization_administrator"]);
                    if (result.success)
                        return result;
                    result = yield this.schemasByOrganizationOwner(objectId);
                    if (!result.success)
                        return result;
                    for (const schema of result.payload) {
                        result = yield this.dal.deleteRole(userIds, "table", undefined, schema.id, ["schema_administrator"]);
                        if (result.success)
                            return result;
                    }
                    break;
                case "schema":
                    result = yield this.dal.deleteRole(userIds, "table", undefined, objectId, Object.keys(entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP));
                    break;
            }
            return result;
        });
    }
    deleteTestUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteTestUsers()`);
            return this.dal.deleteTestUsers();
        });
    }
    usersByIds(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.users(ids);
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.usersByIds([id]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_USER_NOT_FOUND",
                        values: [id.toString()],
                    });
                }
            }
            return result;
        });
    }
    usersByEmails(userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.users(undefined, userEmails);
        });
    }
    userByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.usersByEmails([email]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_USER_NOT_FOUND",
                        values: [email],
                    });
                }
            }
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
    organizations(organizationIds, organizationNames, organizationNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.organizations(organizationIds, organizationNames, organizationNamePattern);
            return result;
        });
    }
    organizationsByIds(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.organizations(ids);
        });
    }
    organizationById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationsByIds([id]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_ORGANIZATION_NOT_FOUND",
                        values: [id.toString()],
                    });
                }
            }
            return result;
        });
    }
    organizationsByNames(names) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.organizations(undefined, names);
        });
    }
    organizationByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationsByNames([name]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_ORGANIZATION_NOT_FOUND",
                        values: [name],
                    });
                }
            }
            return result;
        });
    }
    organizationByNamePattern(namePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizations(undefined, undefined, namePattern);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_ORGANIZATION_NOT_FOUND",
                        values: [namePattern],
                    });
                }
            }
            return result;
        });
    }
    accessibleOrganizations(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.organizationsByUsers([cU.id]);
        });
    }
    createOrganization(cU = CurrentUser_1.CurrentUser.getSysAdmin(this), name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const checkNameResult = yield this.organizationByName(name);
            if (checkNameResult.success) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NAME_TAKEN",
                });
            }
            else if (checkNameResult.wbCode != "WB_ORGANIZATION_NOT_FOUND") {
                return checkNameResult;
            }
            const createOrgResult = yield this.dal.createOrganization(name, label);
            if (!createOrgResult.success)
                return createOrgResult;
            const result = yield this.setOrganizationUsersRole(name, "organization_administrator", [cU.id]);
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
            const result = yield this.organizationUsers(name, undefined, [
                "organization_user",
                "organization_external_user",
            ]);
            if (!result.success)
                return result;
            if (result.payload.length > 0) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NOT_USER_EMPTY",
                });
            }
            return this.dal.deleteOrganization(name);
        });
    }
    deleteTestOrganizations() {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteTestOrganizations()`);
            return this.dal.deleteTestOrganizations();
        });
    }
    organizationUsers(name, id, roles) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = errResult();
            if (name) {
                result = yield this.organizationByName(name);
            }
            else if (id) {
                result = yield this.organizationById(id);
            }
            if (!result.success)
                return result;
            if (!result.payload) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NOT_FOUND",
                });
            }
            if (roles && !entity_1.Role.areRoles(roles)) {
                return errResult({
                    message: "organizationUsers: roles contains one or more unrecognized strings",
                });
            }
            return this.dal.organizationUsers(name, id, roles);
        });
    }
    setOrganizationUsersRole(organizationName, role, userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`setOrganizationUsersRole(${organizationName},${role},${userIds},${userEmails})`);
            const organizationResult = yield this.organizationByName(organizationName);
            if (!organizationResult.success)
                return organizationResult;
            let result = errResult();
            let userIdsFound = [];
            let usersRequested = [];
            if (userIds) {
                usersRequested = userIds;
                result = yield this.usersByIds(userIds);
            }
            else if (userEmails) {
                usersRequested = userEmails;
                result = yield this.usersByEmails(userEmails);
            }
            if (!result.success || !result.payload)
                return result;
            userIdsFound = result.payload.map((user) => user.id);
            if (usersRequested.length != userIdsFound.length) {
                return errResult({
                    wbCode: "WB_USERS_NOT_FOUND",
                    values: [
                        `Requested ${usersRequested.length}: ${usersRequested.join(",")}`,
                        `Found ${userIdsFound.length}: ${userIdsFound.join(",")}`,
                    ],
                });
            }
            return yield this.setRole(userIdsFound, role, "organization", organizationResult.payload);
        });
    }
    removeUsersFromOrganization(organizationName, userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = errResult();
            let userIdsToBeRemoved = [];
            if (userIds)
                userIdsToBeRemoved = userIds;
            if (userEmails) {
                result = yield this.usersByEmails(userEmails);
                if (!result.success)
                    return result;
                userIdsToBeRemoved = result.payload.map((user) => user.id);
            }
            result = yield this.organizationUsers(organizationName, undefined, [
                "organization_administrator",
            ]);
            if (!result.success)
                return result;
            const allAdminIds = result.payload.map((user) => user.id);
            if (allAdminIds.every((elem) => userIdsToBeRemoved.includes(elem))) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NO_ADMINS",
                });
            }
            const organizationResult = yield this.organizationByName(organizationName);
            if (!organizationResult.success)
                return organizationResult;
            result = yield this.deleteRole(userIdsToBeRemoved, "organization", organizationResult.payload.id);
            return result;
        });
    }
    schemas(schemaIds, schemaNames, schemaNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.schemas(schemaIds, schemaNames, schemaNamePattern);
            return result;
        });
    }
    schemasByIds(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.schemas(ids);
        });
    }
    schemaById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.schemasByIds([id]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_SCHEMA_NOT_FOUND",
                        values: [id.toString()],
                    });
                }
            }
            return result;
        });
    }
    schemasByNames(names) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.schemas(undefined, names);
        });
    }
    schemaByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.schemasByNames([name]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_ORGANIZATION_NOT_FOUND",
                        values: [name],
                    });
                }
            }
            return result;
        });
    }
    schemaByNamePattern(namePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.schemas(undefined, undefined, namePattern);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_ORGANIZATION_NOT_FOUND",
                        values: [namePattern],
                    });
                }
            }
            return result;
        });
    }
    schemasByUserOwner(userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByUserOwner(userId, userEmail);
        });
    }
    schemasByOrganizationOwner(organizationId, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByOrganizationOwner(organizationId, organizationName);
        });
    }
    schemasByOrganizationOwnerAdmin(userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByOrganizationOwnerAdmin(userId, userEmail);
        });
    }
    accessibleSchemas(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.schemasByUsers([cU.id]);
        });
    }
    createSchema(cU = CurrentUser_1.CurrentUser.getSysAdmin(this), name, label, organizationOwnerId, organizationOwnerName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`createSchema(${cU.id},${name},${label},${organizationOwnerId},${organizationOwnerName})`);
            let result = errResult();
            let userOwnerId = undefined;
            if (organizationOwnerId || organizationOwnerName) {
                if (!organizationOwnerId && organizationOwnerName) {
                    result = yield this.organizationByName(organizationOwnerName);
                    if (!result.success)
                        return result;
                    organizationOwnerId = result.payload.id;
                }
                if (cU.isNotSysAdmin() &&
                    organizationOwnerId &&
                    cU.isNotInOrganization(organizationOwnerId)) {
                    return errResult({
                        wbCode: "WB_USER_NOT_IN_ORG",
                        values: [cU.toString(), organizationOwnerId.toString()],
                    });
                }
            }
            else {
                userOwnerId = cU.id;
            }
            if (name.startsWith("pg_") || entity_1.Schema.SYS_SCHEMA_NAMES.includes(name)) {
                return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" });
            }
            const schemaResult = yield this.dal.createSchema(name, label, organizationOwnerId, userOwnerId);
            if (!schemaResult.success)
                return schemaResult;
            if (organizationOwnerId) {
                if (cU.isNotSysAdmin() &&
                    cU.isNot("organization_administrator", organizationOwnerId)) {
                    result = yield this.setRole([cU.id], "schema_administrator", "schema", schemaResult.payload);
                    if (!result.success)
                        return result;
                }
                result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(organizationOwnerId, entity_1.Role.ORGANIZATION_TO_SCHEMA_ROLE_MAP, [schemaResult.payload.id]);
            }
            else {
                result = yield this.setRole([cU.id], "schema_owner", "schema", schemaResult.payload);
            }
            if (!result.success)
                return result;
            return schemaResult;
        });
    }
    removeOrDeleteSchema(schemaName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteSchema(${schemaName},${del})`);
            let result = yield this.addOrRemoveAllExistingRelationships(schemaName, true);
            if (!result.success)
                return result;
            result = yield this.dal.tables(schemaName);
            if (!result.success)
                return result;
            for (const table of result.payload) {
                result = yield this.removeOrDeleteTable(schemaName, table.name, del);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeAllUsersFromSchema(schemaName);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteSchema(schemaName, del);
        });
    }
    schemaUsers(schemaName, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
            }
            return this.dal.schemaUsers(schemaName, userIds);
        });
    }
    setSchemaUsersRole(schemaName, userEmails, role) {
        return __awaiter(this, void 0, void 0, function* () {
            const schemaResult = yield this.schemaByName(schemaName);
            if (!schemaResult.success)
                return schemaResult;
            const usersResult = yield this.usersByEmails(userEmails);
            if (!usersResult.success || !usersResult.payload)
                return usersResult;
            if (usersResult.payload.length != userEmails.length) {
                return errResult({
                    wbCode: "WB_USERS_NOT_FOUND",
                    values: userEmails.filter((x) => !usersResult.payload.includes(x)),
                });
            }
            const userIds = usersResult.payload.map((user) => user.id);
            return yield this.setRole(userIds, role, "schema", schemaResult.payload);
        });
    }
    removeSchemaUsers(schemaName, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            const usersResult = yield this.usersByEmails(userEmails);
            if (!usersResult.success)
                return usersResult;
            const userIds = usersResult.payload.map((user) => user.id);
            const schemaResult = yield this.schemaByName(schemaName);
            if (!schemaResult.success)
                return schemaResult;
            if (schemaResult.payload.user_owner_id &&
                userIds.includes(schemaResult.payload.user_owner_id)) {
                return errResult({
                    wbCode: "WB_CANT_REMOVE_SCHEMA_USER_OWNER",
                });
            }
            const result = yield this.deleteRole(userIds, "schema", schemaResult.payload.id);
            return result;
        });
    }
    tables(schemaName, withColumns) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.tables(schemaName);
            if (withColumns) {
                if (!result.success)
                    return result;
                for (const table of result.payload) {
                    const columnsResult = yield this.columns(schemaName, table.name);
                    if (!columnsResult.success)
                        return columnsResult;
                    table.columns = columnsResult.payload;
                }
            }
            return result;
        });
    }
    tableBySchemaNameTableName(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.tableBySchemaNameTableName(schemaName, tableName);
        });
    }
    addOrCreateTable(schemaName, tableName, tableLabel, create) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addOrCreateTable(${schemaName},${tableName},${tableLabel},${create})`);
            if (!create)
                create = false;
            const tableResult = yield this.dal.addOrCreateTable(schemaName, tableName, tableLabel, create);
            if (!tableResult.success)
                return tableResult;
            let result = yield this.addDefaultTableUsersToTable(tableResult.payload);
            if (!result.success)
                return result;
            result = yield this.deleteAndSetTablePermissions(tableResult.payload);
            if (!result.success)
                return result;
            tableResult.payload.schemaName = schemaName;
            return yield this.trackTableWithPermissions(tableResult.payload);
        });
    }
    removeOrDeleteTable(schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!del)
                del = false;
            let result = yield this.dal.columns(schemaName, tableName);
            if (!result.success)
                return result;
            const columns = result.payload;
            for (const column of columns) {
                result = yield this.removeOrDeleteColumn(schemaName, tableName, column.name, del, true);
                if (!result.success)
                    return result;
            }
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            result = yield this.untrackTableWithPermissions(tableResult.payload);
            if (!result.success)
                return result;
            result = yield this.dal.removeAllTableUsers(tableResult.payload.id);
            if (!result.success)
                return result;
            result = yield this.deleteAndSetTablePermissions(tableResult.payload, true);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteTable(schemaName, tableName, del);
        });
    }
    updateTable(schemaName, tableName, newTableName, newTableLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (newTableName) {
                result = yield this.tables(schemaName, false);
                if (!result.success)
                    return result;
                const existingTableNames = result.payload.map((table) => table.name);
                if (existingTableNames.includes(newTableName)) {
                    return errResult({ wbCode: "WB_TABLE_NAME_EXISTS" });
                }
                result = yield this.untrackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateTable(schemaName, tableName, newTableName, newTableLabel);
            if (!result.success)
                return result;
            if (newTableName) {
                result = yield this.trackTableWithPermissions(tableResult.payload);
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
                const tableResult = yield this.addOrCreateTable(schemaName, tableName, v.titleCase(tableName.replaceAll("_", " ")), false);
                if (!tableResult.success)
                    return tableResult;
                result = yield this.untrackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
                result = yield this.dal.discoverColumns(schemaName, tableName);
                if (!result.success)
                    return result;
                const columns = result.payload;
                for (const column of columns) {
                    result = yield this.addOrCreateColumn(schemaName, tableName, column.name, v.titleCase(column.name.replaceAll("_", " ")), false, undefined, true);
                    if (!result.success)
                        return result;
                }
                result = yield this.trackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    addOrRemoveAllExistingRelationships(schemaName, remove) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.foreignKeysOrReferences(schemaName, "%", "%", "ALL");
            if (!result.success)
                return result;
            const relationships = result.payload;
            if (relationships.length > 0) {
                for (const relationship of relationships) {
                    if (relationship.relTableName && relationship.relColumnName) {
                        let result;
                        if (remove) {
                            result = yield this.removeOrDeleteForeignKey(schemaName, relationship.tableName, [relationship.columnName], relationship.relTableName);
                        }
                        else {
                            result = yield this.addOrCreateForeignKey(schemaName, relationship.tableName, [relationship.columnName], relationship.relTableName, [relationship.relColumnName]);
                        }
                        if (!result.success)
                            return result;
                    }
                    else {
                        return errResult({
                            message: "addOrRemoveAllExistingRelationships: ConstraintId must have relTableName and relColumnName",
                        });
                    }
                }
            }
            return result;
        });
    }
    addDefaultTablePermissions(table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addDefaultTablePermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.columns(table.schemaName, table.name);
            if (!result.success)
                return result;
            if (result.payload.length == 0)
                return { success: true };
            const columnNames = result.payload.map((table) => table.name);
            for (const permissionCheckAndType of entity_1.Role.hasuraTablePermissionChecksAndTypes(table.id)) {
                result = yield hasura_api_1.hasuraApi.createPermission(table.schemaName, table.name, permissionCheckAndType.permissionCheck, permissionCheckAndType.permissionType, "wbuser", columnNames);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    removeDefaultTablePermissions(table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addDefaultTablePermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.columns(table.schemaName, table.name);
            if (!result.success)
                return result;
            if (result.payload.length == 0) {
                return { success: true, payload: true };
            }
            for (const permissionKeyAndType of entity_1.Role.tablePermissionKeysAndTypes(table.id)) {
                result = yield hasura_api_1.hasuraApi.deletePermission(table.schemaName, table.name, permissionKeyAndType.type, "wbuser");
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
                    return errResult({ wbCode: "WB_PK_EXISTS" });
                }
                result = yield this.dal.createPrimaryKey(schemaName, tableName, columnNames);
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
            if (!result.success)
                return result;
            for (const columnName of columnNames) {
                if (Object.keys(existingForeignKeys).includes(columnName)) {
                    if (operation == "REMOVE" || operation == "DELETE") {
                        result = yield hasura_api_1.hasuraApi.dropRelationships(schemaName, tableName, parentTableName);
                        if (result.success && operation == "DELETE") {
                            result = yield this.dal.deleteConstraint(schemaName, tableName, existingForeignKeys[columnName]);
                        }
                        return result;
                    }
                    else if (operation == "CREATE") {
                        return errResult({
                            wbCode: "WB_FK_EXISTS",
                            values: [columnName],
                        });
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
    trackTableWithPermissions(table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`trackTableWithPermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield hasura_api_1.hasuraApi.trackTable(table.schemaName, table.name);
            if (!result.success)
                return result;
            return yield this.addDefaultTablePermissions(table);
        });
    }
    untrackTableWithPermissions(table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`untrackTableWithPermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.removeDefaultTablePermissions(table);
            if (!result.success)
                return result;
            result = yield hasura_api_1.hasuraApi.untrackTable(table.schemaName, table.name);
            return result;
        });
    }
    tableUsers(schemaName, tableName, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
            }
            return this.dal.tableUsers(schemaName, tableName, userIds);
        });
    }
    addDefaultTableUsersToTable(table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addDefaultTableUsersToTable(${JSON.stringify(table)})`);
            return yield this.dal.setTableUserRolesFromSchemaRoles(table.schemaId, entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP, [table.id]);
        });
    }
    setTableUsersRole(schemaName, tableName, userEmails, role) {
        return __awaiter(this, void 0, void 0, function* () {
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const usersResult = yield this.usersByEmails(userEmails);
            if (!usersResult.success || !usersResult.payload)
                return usersResult;
            if (usersResult.payload.length != userEmails.length) {
                return errResult({
                    wbCode: "WB_USERS_NOT_FOUND",
                    values: userEmails.filter((x) => !usersResult.payload.includes(x)),
                });
            }
            const userIds = usersResult.payload.map((user) => user.id);
            return yield this.setRole(userIds, role, "table", tableResult.payload);
        });
    }
    removeUsersFromTable(userEmails, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const usersResult = yield this.usersByEmails(userEmails);
            if (!usersResult.success)
                return usersResult;
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const result = yield this.deleteRole(usersResult.payload, "table", tableResult.payload.id);
            return result;
        });
    }
    saveTableUserSettings(schemaName, tableName, userEmail, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const userResult = yield this.userByEmail(userEmail);
            if (!userResult.success)
                return userResult;
            return this.dal.saveTableUserSettings(tableResult.payload.id, userResult.payload.id, settings);
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
    addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addOrCreateColumn(${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${skipTracking})`);
            if (!create)
                create = false;
            let result = errResult();
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (!skipTracking) {
                result = yield this.untrackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType);
            if (result.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(tableResult.payload);
            }
            return result;
        });
    }
    removeOrDeleteColumn(schemaName, tableName, columnName, del, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteColumn(${schemaName},${tableName},${columnName},${del})`);
            if (!del)
                del = false;
            let result = errResult();
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (!skipTracking) {
                result = yield this.untrackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeOrDeleteColumn(schemaName, tableName, columnName, del);
            if (result.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(tableResult.payload);
            }
            return result;
        });
    }
    updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            const tableResult = yield this.tableBySchemaNameTableName(schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (newColumnName) {
                result = yield this.columns(schemaName, tableName);
                if (!result.success)
                    return result;
                const existingColumnNames = result.payload.map((table) => table.name);
                if (existingColumnNames.includes(newColumnName)) {
                    return errResult({ wbCode: "WB_COLUMN_NAME_EXISTS" });
                }
            }
            if (newColumnName || newType) {
                result = yield this.untrackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType);
            if (!result.success)
                return result;
            if (newColumnName || newType) {
                result = yield this.trackTableWithPermissions(tableResult.payload);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
}
exports.WhitebrickCloud = WhitebrickCloud;
function errResult(result) {
    if (!result) {
        return {
            success: false,
            message: "Result has not been assigned",
        };
    }
    if (result.success == true) {
        result = {
            success: false,
            message: "WhitebrickCloud errResult: result is not an error (success==true)",
        };
    }
    else if (!("success" in result)) {
        result.success = false;
    }
    if (!result.message && result.wbCode) {
        result.message = environment_1.userMessages[result.wbCode][0];
        if (!result.message) {
            result = {
                success: false,
                message: `WhitebrickCloud errResult: Could not find message for wbCode=${result.wbCode}`,
            };
        }
    }
    if (result.values) {
        result.message = `${result.message} Values: ${result.values.join(", ")}`;
        delete result.values;
    }
    if (!result.apolloErrorCode &&
        result.wbCode &&
        Object.keys(environment_1.userMessages).includes(result.wbCode) &&
        environment_1.userMessages[result.wbCode].length == 2) {
        result.apolloErrorCode = environment_1.userMessages[result.wbCode][1];
    }
    else if (!result.apolloErrorCode &&
        result.wbCode &&
        !Object.keys(environment_1.userMessages).includes(result.wbCode)) {
        result = {
            success: false,
            message: `WhitebrickCloud err: Could not find apolloErrorCode for wbCode=${result.wbCode}`,
        };
    }
    else {
        result.apolloErrorCode = "INTERNAL_SERVER_ERROR";
    }
    return result;
}
exports.errResult = errResult;
function apolloErr(result) {
    result = errResult(result);
    if (result.success) {
        return new Error("WhitebrickCloud.err: result is not an error (success==true)");
    }
    const details = {};
    if (!result.message)
        result.message = "Unknown error.";
    if (result.refCode)
        details.refCode = result.refCode;
    if (result.wbCode)
        details.wbCode = result.wbCode;
    return new apollo_server_lambda_1.ApolloError(result.message, result.apolloErrorCode, details);
}
exports.apolloErr = apolloErr;


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ3VycmVudFVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvblVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvb3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvc2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy91c2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvd2hpdGVicmljay1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2csIGVyclJlc3VsdCB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgVXNlcixcbiAgT3JnYW5pemF0aW9uLFxuICBPcmdhbml6YXRpb25Vc2VyLFxuICBTY2hlbWEsXG4gIFNjaGVtYVVzZXIsXG4gIFRhYmxlLFxuICBUYWJsZVVzZXIsXG4gIENvbHVtbixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGZpcnN0IH0gZnJvbSBcInZvY2FcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IERCID09PT09PT09PVxuICAgKi9cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBgICAgIFsgJHtxdWVyeVBhcmFtcy5wYXJhbXMgPyBxdWVyeVBhcmFtcy5wYXJhbXMuam9pbihcIiwgXCIpIDogXCJcIn0gXWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XG4gICAgICBsb2cuZXJyb3IoSlNPTi5zdHJpbmdpZnkoZXJyb3IpKTtcbiAgICAgIHJlc3VsdHMucHVzaChcbiAgICAgICAgZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgIHJlZkNvZGU6IFwiUEdfXCIgKyBlcnJvci5jb2RlLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpXG4gICAgICApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8vIHVzZWQgZm9yIERETCBpZGVudGlmaWVycyAoZWcgQ1JFQVRFIFRBQkxFIHNhbml0aXplKHRhYmxlTmFtZSkpXG4gIHB1YmxpYyBzdGF0aWMgc2FuaXRpemUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvW15cXHclXSsvZywgXCJcIik7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVzSWRMb29rdXAoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgbmFtZUlkTG9va3VwOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLmlkLCB3Yi5yb2xlcy5uYW1lXG4gICAgICAgIEZST00gd2Iucm9sZXNcbiAgICAgICAgV0hFUkUgY3VzdG9tIElTIGZhbHNlXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgbmFtZUlkTG9va3VwW3Jvdy5uYW1lXSA9IHJvdy5pZDtcbiAgICB9XG4gICAgcmVzdWx0LnBheWxvYWQgPSBuYW1lSWRMb29rdXA7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlSWRzRnJvbU5hbWVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWRcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgICAgQU5EIG5hbWU9QU5ZKCQxKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3JvbGVOYW1lc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKChyb3c6IHsgaWQ6IG51bWJlciB9KSA9PiByb3cuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJST0xFX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFR5cGljYWxseSBzZXR0aW5nIGEgcm9sZSBkaXJlY3RseSBpcyBleHBsaWNpdCxcbiAgLy8gc28gYW55IGltcGxpZWRfZnJvbV9yb2xlX2lkIGlzIGNsZWFyZWQgdW5sZXNzIGtlZXBJbXBsaWVkRnJvbVxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXIsXG4gICAga2VlcEltcGxpZWRGcm9tPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByb2xlUmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlQnlOYW1lKHJvbGVOYW1lKTtcbiAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJvbGVSZXN1bHQ7XG4gICAgbGV0IHdiVGFibGU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHdiQ29sdW1uOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcIm9yZ2FuaXphdGlvbl9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnNjaGVtYV91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwic2NoZW1hX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi50YWJsZV91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwidGFibGVfaWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHBhcmFtczogRGF0ZVtdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgbGV0IHF1ZXJ5OiBzdHJpbmcgPSBgXG4gICAgICBJTlNFUlQgSU5UTyAke3diVGFibGV9IChyb2xlX2lkLCAgdXNlcl9pZCwgJHt3YkNvbHVtbn0sIHVwZGF0ZWRfYXQpXG4gICAgICBWQUxVRVNcbiAgICBgO1xuICAgIGZvciAoY29uc3QgdXNlcklkIG9mIHVzZXJJZHMpIHtcbiAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgKFxuICAgICAgICAgICR7cm9sZVJlc3VsdC5wYXlsb2FkLmlkfSxcbiAgICAgICAgICAke3VzZXJJZH0sXG4gICAgICAgICAgJHtvYmplY3RJZH0sXG4gICAgICAgICAgJCR7cGFyYW1zLmxlbmd0aCArIDF9XG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChkYXRlKTtcbiAgICAgIGlmIChwYXJhbXMubGVuZ3RoICE9IHVzZXJJZHMubGVuZ3RoKSBxdWVyeSArPSBcIiwgXCI7XG4gICAgfVxuICAgIHF1ZXJ5ICs9IGBcbiAgICAgIE9OIENPTkZMSUNUICh1c2VyX2lkLCAke3diQ29sdW1ufSlcbiAgICAgIERPIFVQREFURSBTRVRcbiAgICAgIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCxcbiAgICAgIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgIGA7XG4gICAgaWYgKCFrZWVwSW1wbGllZEZyb20pIHF1ZXJ5ICs9IFwiLCBpbXBsaWVkX2Zyb21fcm9sZV9pZD1OVUxMXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVJvbGUoXG4gICAgdXNlcklkczogbnVtYmVyW10sXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWQ/OiBudW1iZXIsXG4gICAgcGFyZW50T2JqZWN0SWQ/OiBudW1iZXIsXG4gICAgaW1wbGllZEZyb21Sb2xlcz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IG51bWJlcltdIHwgdW5kZWZpbmVkKVtdID0gW3VzZXJJZHNdO1xuICAgIGxldCB3YlRhYmxlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCB3YldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnNcIjtcbiAgICAgICAgd2JXaGVyZSA9IFwiQU5EIG9yZ2FuaXphdGlvbl9pZD0kMlwiO1xuICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iuc2NoZW1hX3VzZXJzXCI7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBcIkFORCBzY2hlbWFfaWQ9JDJcIjtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gYFxuICAgICAgICAgICAgQU5EIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX293bmVyX2lkPSQyXG4gICAgICAgICAgICApXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXMucHVzaChwYXJlbnRPYmplY3RJZCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnRhYmxlX3VzZXJzXCI7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBcIkFORCB0YWJsZV9pZD0kMlwiO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgfSBlbHNlIGlmIChwYXJlbnRPYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBgXG4gICAgICAgICAgICBBTkQgdGFibGVfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICAgICAgV0hFUkUgc2NoZW1hX2lkPSQyXG4gICAgICAgICAgICApXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXMucHVzaChwYXJlbnRPYmplY3RJZCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBpZiAoaW1wbGllZEZyb21Sb2xlcykge1xuICAgICAgd2JXaGVyZSArPSBgQU5EIGltcGxpZWRfZnJvbV9yb2xlX2lkPUFOWSgkMylgO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlSWRzRnJvbU5hbWVzKGltcGxpZWRGcm9tUm9sZXMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gJHt3YlRhYmxlfVxuICAgICAgICBXSEVSRSB1c2VyX2lkPUFOWSgkMSlcbiAgICAgICAgJHt3YldoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhcbiAgICB0YWJsZUlkOiBudW1iZXIsXG4gICAgZGVsZXRlT25seT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3Blcm1pc3Npb25zXG4gICAgICAgICAgV0hFUkUgdGFibGVfaWQ9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbdGFibGVJZF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCFkZWxldGVPbmx5KSB7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlUm9sZSBvZiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykpIHtcbiAgICAgICAgZm9yIChjb25zdCBwZXJtaXNzaW9uUHJlZml4IG9mIFJvbGUuU1lTUk9MRVNfVEFCTEVTW3RhYmxlUm9sZV1cbiAgICAgICAgICAucGVybWlzc2lvblByZWZpeGVzKSB7XG4gICAgICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV9wZXJtaXNzaW9ucyh0YWJsZV9wZXJtaXNzaW9uX2tleSwgdXNlcl9pZCwgdGFibGVfaWQpXG4gICAgICAgICAgICAgIFNFTEVDVCAnJHtSb2xlLnRhYmxlUGVybWlzc2lvbktleShcbiAgICAgICAgICAgICAgICBwZXJtaXNzaW9uUHJlZml4LFxuICAgICAgICAgICAgICAgIHRhYmxlSWRcbiAgICAgICAgICAgICAgKX0nLCB1c2VyX2lkLCAke3RhYmxlSWR9XG4gICAgICAgICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQxIEFORCB3Yi5yb2xlcy5uYW1lPSQyXG4gICAgICAgICAgICBgLFxuICAgICAgICAgICAgcGFyYW1zOiBbdGFibGVJZCwgdGFibGVSb2xlXSxcbiAgICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFVzZXJzID09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcklkRnJvbUF1dGhJZChhdXRoSWQ6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy5pZFxuICAgICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGF1dGhfaWQ9JDFcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2F1dGhJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpZiAocmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFthdXRoSWRdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93c1swXS5pZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VycyhcbiAgICBpZHM/OiBudW1iZXJbXSxcbiAgICBlbWFpbHM/OiBzdHJpbmdbXSxcbiAgICBlbWFpbFBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdIHwgc3RyaW5nKVtdID0gW107XG4gICAgaWYgKGlkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkcyk7XG4gICAgfSBlbHNlIGlmIChlbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSBlbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbHMpO1xuICAgIH0gZWxzZSBpZiAoZW1haWxQYXR0ZXJuKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgZW1haWwgTElLRSAkMVwiO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWxQYXR0ZXJuKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAke3NxbFdoZXJlfVxuICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMpIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbD86IHN0cmluZyxcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmcsXG4gICAgbGFzdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFlbWFpbCAmJiAhZmlyc3ROYW1lICYmICFsYXN0TmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IFwiZGFsLnVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IG51bWJlciB8IHN0cmluZylbXSA9IFtkYXRlLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCkge1xuICAgICAgcXVlcnkgKz0gYGVtYWlsPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWwpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBpZiAoZmlyc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgZmlyc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGZpcnN0TmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChsYXN0TmFtZSkge1xuICAgICAgcXVlcnkgKz0gYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGxhc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgcXVlcnkgKz0gXCJ1cGRhdGVkX2F0PSQxIFdIRVJFIGlkPSQyIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGVtYWlsIGxpa2UgJ3Rlc3RfJXRlc3Qud2hpdGVicmljay5jb20nXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIG9yZ2FuaXphdGlvbklkcz86IG51bWJlcltdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKlxuICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgYDtcbiAgICBpZiAob3JnYW5pemF0aW9uSWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMuaWQ9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkcyk7XG4gICAgfSBlbHNlIGlmIChvcmdhbml6YXRpb25OYW1lcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5pZD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyB1c2VyX3JvbGUsXG4gICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5vcmdhbml6YXRpb25zLmlkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLm9yZ2FuaXphdGlvbnMoXG4gICAgICAgICAgbmFtZSwgbGFiZWxcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyKVxuICAgICAgICBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IHN0cmluZylbXSA9IFtuZXcgRGF0ZSgpXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi5vcmdhbml6YXRpb25zIFNFVCB1cGRhdGVkX2F0PSQxXCI7XG4gICAgaWYgKG5ld05hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld05hbWUpO1xuICAgICAgcXVlcnkgKz0gYCwgbmFtZT0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmIChuZXdMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TGFiZWwpO1xuICAgICAgcXVlcnkgKz0gYCwgbGFiZWw9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICBxdWVyeSArPSBgIFdIRVJFIG5hbWU9JCR7cGFyYW1zLmxlbmd0aH0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvLyBubyBwYXR0ZXJucyBhbGxvd2VkIGhlcmVcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKG5hbWUucmVwbGFjZShcIiVcIiwgXCJcIikpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRlbGV0ZU9yZ2FuaXphdGlvbnMoXCJ0ZXN0XyVcIik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9ucyhcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25faWQgSU4gKFxuICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgICApXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9uIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvblVzZXJzKFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZXM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBpZiAoaWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaChpZCk7XG4gICAgfSBlbHNlIGlmIChuYW1lKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICB9XG4gICAgaWYgKHJvbGVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIiBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChyb2xlcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMuKixcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX2VtYWlsLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVcbiAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvblVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWFzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXMoXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwZ1BhcmFtczogKHN0cmluZ1tdIHwgbnVtYmVyW10gfCBzdHJpbmcpW10gPSBbXG4gICAgICBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUyxcbiAgICBdO1xuICAgIGNvbnN0IHdiUGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxQZ1doZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXYldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMpIHtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hSWRzKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYU5hbWVzKSB7XG4gICAgICBzcWxQZ1doZXJlID0gXCJBTkQgc2NoZW1hX25hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGdQYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBuYW1lPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hTmFtZVBhdHRlcm4pIHtcbiAgICAgIHNxbFBnV2hlcmUgPSBcIkFORCBzY2hlbWFfbmFtZSBMSUtFICQyXCI7XG4gICAgICBwZ1BhcmFtcy5wdXNoKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIG5hbWUgTElLRSAkMVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhLipcbiAgICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YVxuICAgICAgICAgIFdIRVJFIHNjaGVtYV9uYW1lIE5PVCBMSUtFICdwZ18lJ1xuICAgICAgICAgIEFORCBzY2hlbWFfbmFtZSE9QU5ZKCQxKVxuICAgICAgICAgICR7c3FsUGdXaGVyZX1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBwZ1BhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICR7c3FsV2JXaGVyZX1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiB3YlBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2VzcyAmJiByZXN1bHRzWzFdLnN1Y2Nlc3MpIHtcbiAgICAgIGlmIChyZXN1bHRzWzBdLnBheWxvYWQucm93cy5sZW5ndGggIT0gcmVzdWx0c1sxXS5wYXlsb2FkLnJvd3MubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBcImRhbC5zY2hlbWFzOiB3Yi5zY2hlbWFzIG91dCBvZiBzeW5jIHdpdGggaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRzWzFdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1sxXS5wYXlsb2FkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5VXNlcnMoXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuaWQ9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlscyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgdXNlcl9yb2xlLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25zLm5hbWUgYXMgb3JnYW5pemF0aW9uX293bmVyX25hbWUsXG4gICAgICAgIHVzZXJfb3duZXJzLmVtYWlsIGFzIHVzZXJfb3duZXJfZW1haWxcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnVzZXJzIHVzZXJfb3duZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD11c2VyX293bmVycy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIoXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWQpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlsKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfb3duZXJfZW1haWwsXG4gICAgICAgICdzY2hlbWFfb3duZXInIGFzIHVzZXJfcm9sZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFzLnVzZXJfb3duZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgIG9yZ2FuaXphdGlvbklkPzogbnVtYmVyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChvcmdhbml6YXRpb25JZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWUpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hcy4qLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25zLm5hbWUgYXMgb3JnYW5pemF0aW9uX293bmVyX25hbWVcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZCk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWwpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZVxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHVzZXJfcm9sZSxcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9uX3VzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iucm9sZXMubmFtZT0nb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3InXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEoXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICB1c2VyT3duZXJJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgQ1JFQVRFIFNDSEVNQSAke0RBTC5zYW5pdGl6ZShuYW1lKX1gLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi5zY2hlbWFzKFxuICAgICAgICAgICAgbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbl9vd25lcl9pZCwgdXNlcl9vd25lcl9pZFxuICAgICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uT3duZXJJZCwgdXNlck93bmVySWRdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdKTtcbiAgICBjb25zdCBpbnNlcnRSZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gICAgaWYgKGluc2VydFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpbnNlcnRSZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChpbnNlcnRSZXN1bHQucGF5bG9hZClbMF07XG4gICAgfVxuICAgIHJldHVybiBpbnNlcnRSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNDSEVNQSBJRiBFWElTVFMgJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9IENBU0NBREVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXJbXSlbXSA9IFtzY2hlbWFOYW1lXTtcbiAgICBsZXQgd2hlcmVTcWwgPSBcIlwiO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICB3aGVyZVNxbCA9IFwiQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLiosXG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlXG4gICAgICAgIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgICAke3doZXJlU3FsfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWFVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1NDSEVNQV9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlQWxsVXNlcnNGcm9tU2NoZW1hKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgV0hFUkUgc2NoZW1hX2lkIElOIChcbiAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi5zY2hlbWFzIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVzKHNjaGVtYU5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKlxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaXNjb3ZlclRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcy50YWJsZV9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlc1xuICAgICAgICBXSEVSRSB0YWJsZV9zY2hlbWE9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93cy5tYXAoXG4gICAgICAgIChyb3c6IHsgdGFibGVfbmFtZTogc3RyaW5nIH0pID0+IHJvdy50YWJsZV9uYW1lXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gdHlwZSA9IGZvcmVpZ25LZXlzfHJlZmVyZW5jZXN8YWxsXG4gIHB1YmxpYyBhc3luYyBmb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lUGF0dGVybjogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWVQYXR0ZXJuKTtcbiAgICBjb2x1bW5OYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lUGF0dGVybik7XG4gICAgbGV0IHdoZXJlU3FsOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSBcIkZPUkVJR05fS0VZU1wiOlxuICAgICAgICB3aGVyZVNxbCA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiUkVGRVJFTkNFU1wiOlxuICAgICAgICB3aGVyZVNxbCA9IGBcbiAgICAgICAgICBBTkQgcmVmLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgcmVmLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJBTExcIjpcbiAgICAgICAgd2hlcmVTcWwgPSBgXG4gICAgICAgICAgQU5EIGZrLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgZmsuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgLS0gdW5pcXVlIHJlZmVyZW5jZSBpbmZvXG4gICAgICAgIHJlZi50YWJsZV9uYW1lICAgICAgIEFTIHJlZl90YWJsZSxcbiAgICAgICAgcmVmLmNvbHVtbl9uYW1lICAgICAgQVMgcmVmX2NvbHVtbixcbiAgICAgICAgcmVmZC5jb25zdHJhaW50X3R5cGUgQVMgcmVmX3R5cGUsIC0tIGUuZy4gVU5JUVVFIG9yIFBSSU1BUlkgS0VZXG4gICAgICAgIC0tIGZvcmVpZ24ga2V5IGluZm9cbiAgICAgICAgZmsudGFibGVfbmFtZSAgICAgICAgQVMgZmtfdGFibGUsXG4gICAgICAgIGZrLmNvbHVtbl9uYW1lICAgICAgIEFTIGZrX2NvbHVtbixcbiAgICAgICAgZmsuY29uc3RyYWludF9uYW1lICAgQVMgZmtfbmFtZSxcbiAgICAgICAgbWFwLnVwZGF0ZV9ydWxlICAgICAgQVMgZmtfb25fdXBkYXRlLFxuICAgICAgICBtYXAuZGVsZXRlX3J1bGUgICAgICBBUyBma19vbl9kZWxldGVcbiAgICAgICAgLS0gbGlzdHMgZmsgY29uc3RyYWludHMgQU5EIG1hcHMgdGhlbSB0byBwayBjb25zdHJhaW50c1xuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5yZWZlcmVudGlhbF9jb25zdHJhaW50cyBBUyBtYXBcbiAgICAgICAgLS0gam9pbiB1bmlxdWUgY29uc3RyYWludHMgKGUuZy4gUEtzIGNvbnN0cmFpbnRzKSB0byByZWYgY29sdW1ucyBpbmZvXG4gICAgICAgIElOTkVSIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmtleV9jb2x1bW5fdXNhZ2UgQVMgcmVmXG4gICAgICAgIE9OICByZWYuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZi5jb25zdHJhaW50X3NjaGVtYSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZi5jb25zdHJhaW50X25hbWUgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBvcHRpb25hbDogdG8gaW5jbHVkZSByZWZlcmVuY2UgY29uc3RyYWludCB0eXBlXG4gICAgICAgIExFRlQgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVfY29uc3RyYWludHMgQVMgcmVmZFxuICAgICAgICBPTiAgcmVmZC5jb25zdHJhaW50X2NhdGFsb2cgPSByZWYuY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCByZWZkLmNvbnN0cmFpbnRfc2NoZW1hID0gcmVmLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCByZWZkLmNvbnN0cmFpbnRfbmFtZSA9IHJlZi5jb25zdHJhaW50X25hbWVcbiAgICAgICAgLS0gam9pbiBmayBjb2x1bW5zIHRvIHRoZSBjb3JyZWN0IHJlZiBjb2x1bW5zIHVzaW5nIG9yZGluYWwgcG9zaXRpb25zXG4gICAgICAgIElOTkVSIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmtleV9jb2x1bW5fdXNhZ2UgQVMgZmtcbiAgICAgICAgT04gIGZrLmNvbnN0cmFpbnRfY2F0YWxvZyA9IG1hcC5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCBmay5jb25zdHJhaW50X25hbWUgPSBtYXAuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEFORCBmay5wb3NpdGlvbl9pbl91bmlxdWVfY29uc3RyYWludCA9IHJlZi5vcmRpbmFsX3Bvc2l0aW9uIC0tSU1QT1JUQU5UIVxuICAgICAgICBXSEVSRSByZWYudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgZmsudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICAke3doZXJlU3FsfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRzOiBDb25zdHJhaW50SWRbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnQ6IENvbnN0cmFpbnRJZCA9IHtcbiAgICAgICAgY29uc3RyYWludE5hbWU6IHJvdy5ma19uYW1lLFxuICAgICAgICB0YWJsZU5hbWU6IHJvdy5ma190YWJsZSxcbiAgICAgICAgY29sdW1uTmFtZTogcm93LmZrX2NvbHVtbixcbiAgICAgICAgcmVsVGFibGVOYW1lOiByb3cucmVmX3RhYmxlLFxuICAgICAgICByZWxDb2x1bW5OYW1lOiByb3cucmVmX2NvbHVtbixcbiAgICAgIH07XG4gICAgICBjb25zdHJhaW50cy5wdXNoKGNvbnN0cmFpbnQpO1xuICAgIH1cbiAgICByZXN1bHQucGF5bG9hZCA9IGNvbnN0cmFpbnRzO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcHJpbWFyeUtleXMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIERJU1RJTkNUIGMuY29sdW1uX25hbWUsIHRjLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyB0YyBcbiAgICAgICAgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEuY29uc3RyYWludF9jb2x1bW5fdXNhZ2UgQVMgY2N1XG4gICAgICAgIFVTSU5HIChjb25zdHJhaW50X3NjaGVtYSwgY29uc3RyYWludF9uYW1lKVxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIEFTIGNcbiAgICAgICAgT04gYy50YWJsZV9zY2hlbWEgPSB0Yy5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9IGMudGFibGVfbmFtZVxuICAgICAgICBBTkQgY2N1LmNvbHVtbl9uYW1lID0gYy5jb2x1bW5fbmFtZVxuICAgICAgICBXSEVSRSBjb25zdHJhaW50X3R5cGUgPSAnUFJJTUFSWSBLRVknXG4gICAgICAgIEFORCBjLnRhYmxlX3NjaGVtYT0nJHtzY2hlbWFOYW1lfSdcbiAgICAgICAgQU5EIHRjLnRhYmxlX25hbWUgPSAnJHt0YWJsZU5hbWV9J1xuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGNvbnN0IHBLQ29sc0NvbnN0cmFpbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucGF5bG9hZC5yb3dzKSB7XG4gICAgICAgIHBLQ29sc0NvbnN0cmFpbnRzW3Jvdy5jb2x1bW5fbmFtZV0gPSByb3cuY29uc3RyYWludF9uYW1lO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBwS0NvbHNDb25zdHJhaW50cztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVDb25zdHJhaW50KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb25zdHJhaW50TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3RyYWludE5hbWUgPSBEQUwuc2FuaXRpemUoY29uc3RyYWludE5hbWUpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIERST1AgQ09OU1RSQUlOVCBJRiBFWElTVFMgJHtjb25zdHJhaW50TmFtZX1cbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVQcmltYXJ5S2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgQUREIFBSSU1BUlkgS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSk7XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmNyZWF0ZUZvcmVpZ25LZXkoJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtwYXJlbnRUYWJsZU5hbWV9LCR7cGFyZW50Q29sdW1uTmFtZXN9KWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIHBhcmVudFRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZShwYXJlbnRUYWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZFBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgcGFyZW50Q29sdW1uTmFtZSBvZiBwYXJlbnRDb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUocGFyZW50Q29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgQ09OU1RSQUlOVCAke3RhYmxlTmFtZX1fJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiX1wiKX1fZmtleVxuICAgICAgICBGT1JFSUdOIEtFWSAoJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pXG4gICAgICAgIFJFRkVSRU5DRVMgJHtzY2hlbWFOYW1lfS4ke3BhcmVudFRhYmxlTmFtZX1cbiAgICAgICAgICAoJHtzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pXG4gICAgICAgIE9OIERFTEVURSBTRVQgTlVMTFxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLiosIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZVxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1RBQkxFX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGRhbC5hZGRPckNyZWF0ZVRhYmxlICR7c2NoZW1hTmFtZX0gJHt0YWJsZU5hbWV9ICR7dGFibGVMYWJlbH0gJHtjcmVhdGV9YFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgW3NjaGVtYU5hbWVdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2IudGFibGVzKHNjaGVtYV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMykgUkVUVVJOSU5HICpcbiAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkWzBdLmlkLCB0YWJsZU5hbWUsIHRhYmxlTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgQ1JFQVRFIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIoKWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgaWYgKGNyZWF0ZSAmJiAhcmVzdWx0c1sxXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1sxXTtcbiAgICBpZiAocmVzdWx0c1swXS5zdWNjZXNzKSB7XG4gICAgICByZXN1bHRzWzBdLnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHRzWzBdLnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgW3NjaGVtYU5hbWVdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICBXSEVSRSBzY2hlbWFfaWQ9JDEgQU5EIG5hbWU9JDJcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWRbMF0uaWQsIHRhYmxlTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiIENBU0NBREVgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIG5ld1RhYmxlTmFtZT86IHN0cmluZyxcbiAgICBuZXdUYWJsZUxhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBVUERBVEUgd2IudGFibGVzIFNFVFxuICAgIGA7XG4gICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3VGFibGVOYW1lKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm5hbWU9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChuZXdUYWJsZUxhYmVsKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZUxhYmVsKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgcXVlcnkgKz0gYCR7dXBkYXRlcy5qb2luKFwiLCBcIil9IFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgUkVOQU1FIFRPICR7bmV3VGFibGVOYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyW10pW10gPSBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXTtcbiAgICBsZXQgd2hlcmVTcWwgPSBcIlwiO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICB3aGVyZVNxbCA9IFwiQU5EIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9QU5ZKCQzKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi50YWJsZV91c2Vycy4qLFxuICAgICAgICB3Yi5zY2hlbWFzLm5hbWUgYXMgc2NoZW1hX25hbWUsXG4gICAgICAgIHdiLnRhYmxlcy5uYW1lIGFzIHRhYmxlX25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfZW1haWwsXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZVxuICAgICAgICBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMlxuICAgICAgICAke3doZXJlU3FsfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZVVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICBvcmdhbml6YXRpb25JZDogbnVtYmVyLFxuICAgIHJvbGVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIGNsZWFyRXhpc3Rpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoJHtvcmdhbml6YXRpb25JZH0sIDxyb2xlTWFwPiwgJHtzY2hlbWFJZHN9LCAke3VzZXJJZHN9LCAke2NsZWFyRXhpc3Rpbmd9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVzSWRMb29rdXAoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGxldCB3aGVyZVNjaGVtYXNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVTY2hlbWFVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IG9uQ29uZmxpY3RTcWwgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMgJiYgc2NoZW1hSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlU2NoZW1hc1NxbCA9IGBBTkQgd2Iuc2NoZW1hcy5pZCBJTiAoJHtzY2hlbWFJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGlmICh1c2VySWRzICYmIHVzZXJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVTY2hlbWFVc2Vyc1NxbCA9IGBcbiAgICAgICAgQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkIElOICgke3VzZXJJZHMuam9pbihcIixcIil9KVxuICAgICAgYDtcbiAgICAgIHdoZXJlVXNlcnNTcWwgPSBgQU5EIHdiLnVzZXJzLmlkIElOICgke3VzZXJJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGNvbnN0IHJvbGVzSWRMb29rdXAgPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtdO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGlmIChjbGVhckV4aXN0aW5nKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgICBXSEVSRVxuICAgICAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9JDFcbiAgICAgICAgICAgICAgJHt3aGVyZVNjaGVtYXNTcWx9XG4gICAgICAgICAgICApXG4gICAgICAgICAgICAke3doZXJlU2NoZW1hVXNlcnNTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW29yZ2FuaXphdGlvbklkXSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVcGRhdGUgaW1wbGllZCByb2xlcyBvbmx5LCBsZWF2ZSBleHBsaWNpdCByb2xlcyBhbG9uZVxuICAgICAgb25Db25mbGljdFNxbCA9IGBcbiAgICAgICAgT04gQ09ORkxJQ1QgKHNjaGVtYV9pZCwgdXNlcl9pZClcbiAgICAgICAgRE8gVVBEQVRFIFNFVCByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQgSVMgTk9UIE5VTExcbiAgICAgIGA7XG4gICAgfVxuICAgIGZvciAoY29uc3Qgb3JnYW5pemF0aW9uUm9sZSBvZiBPYmplY3Qua2V5cyhyb2xlTWFwKSkge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hX3VzZXJzKHNjaGVtYV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgU0VMRUNUXG4gICAgICAgICAgd2Iuc2NoZW1hcy5pZCxcbiAgICAgICAgICB1c2VyX2lkLFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtyb2xlTWFwW29yZ2FuaXphdGlvblJvbGVdXX0sXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW29yZ2FuaXphdGlvblJvbGVdfSxcbiAgICAgICAgICAkMVxuICAgICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD0kMlxuICAgICAgICAgIEFORCB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD0kM1xuICAgICAgICAgICR7d2hlcmVTY2hlbWFzU3FsfVxuICAgICAgICAgICR7d2hlcmVVc2Vyc1NxbH1cbiAgICAgICAgICAke29uQ29uZmxpY3RTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW2RhdGUsIG9yZ2FuaXphdGlvbklkLCByb2xlc0lkTG9va3VwW29yZ2FuaXphdGlvblJvbGVdXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8vIGlmICF0YWJsZUlkcyBhbGwgdGFibGVzIGZvciBzY2hlbWFcbiAgLy8gaWYgIXVzZXJJZHMgYWxsIHNjaGVtYV91c2Vyc1xuICBwdWJsaWMgYXN5bmMgc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICByb2xlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCAvLyBlZyB7IHNjaGVtYV9vd25lcjogXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIgfVxuICAgIHRhYmxlSWRzPzogbnVtYmVyW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIGNsZWFyRXhpc3Rpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcygke3NjaGVtYUlkfSwgPHJvbGVNYXA+LCAke3RhYmxlSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nfSlgXG4gICAgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlc0lkTG9va3VwKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBsZXQgd2hlcmVUYWJsZXNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVUYWJsZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHRhYmxlSWRzICYmIHRhYmxlSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlVGFibGVzU3FsID0gYEFORCB3Yi50YWJsZXMuaWQgSU4gKCR7dGFibGVJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGlmICh1c2VySWRzICYmIHVzZXJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVUYWJsZVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2IudGFibGVfdXNlcnMudXNlcl9pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlcbiAgICAgIGA7XG4gICAgICB3aGVyZVVzZXJzU3FsID0gYEFORCB3Yi51c2Vycy5pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBjb25zdCByb2xlc0lkTG9va3VwID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcXVlcnlQYXJhbXM6IFF1ZXJ5UGFyYW1zW10gPSBbXTtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBpZiAoY2xlYXJFeGlzdGluZykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICBXSEVSRVxuICAgICAgICAgICAgd2IudGFibGVfdXNlcnMudGFibGVfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICAgICAgV0hFUkUgd2IudGFibGVzLnNjaGVtYV9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlVGFibGVzU3FsfVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgJHt3aGVyZVRhYmxlVXNlcnNTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3NjaGVtYUlkXSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVcGRhdGUgaW1wbGllZCByb2xlcyBvbmx5LCBsZWF2ZSBleHBsaWNpdCByb2xlcyBhbG9uZVxuICAgICAgb25Db25mbGljdFNxbCA9IGBcbiAgICAgICAgT04gQ09ORkxJQ1QgKHRhYmxlX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkIElTIE5PVCBOVUxMXG4gICAgICBgO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHNjaGVtYVJvbGUgb2YgT2JqZWN0LmtleXMocm9sZU1hcCkpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlX3VzZXJzKHRhYmxlX2lkLCB1c2VyX2lkLCByb2xlX2lkLCBpbXBsaWVkX2Zyb21fcm9sZV9pZCwgdXBkYXRlZF9hdClcbiAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICB3Yi50YWJsZXMuaWQsXG4gICAgICAgICAgdXNlcl9pZCxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbcm9sZU1hcFtzY2hlbWFSb2xlXV19LFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtzY2hlbWFSb2xlXX0sXG4gICAgICAgICAgJDFcbiAgICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnRhYmxlcy5zY2hlbWFfaWRcbiAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD0kMiBBTkQgd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAke3doZXJlVGFibGVzU3FsfVxuICAgICAgICAgICR7d2hlcmVVc2Vyc1NxbH1cbiAgICAgICAgICAke29uQ29uZmxpY3RTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW2RhdGUsIHNjaGVtYUlkLCByb2xlc0lkTG9va3VwW3NjaGVtYVJvbGVdXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVBbGxUYWJsZVVzZXJzKFxuICAgIHRhYmxlSWQ/OiBudW1iZXIsXG4gICAgc2NoZW1hSWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5V2hlcmUgPSBcIlwiO1xuICAgIGNvbnN0IHBhcmFtczogbnVtYmVyW10gPSBbXTtcbiAgICBpZiAodGFibGVJZCkge1xuICAgICAgcXVlcnlXaGVyZSA9IFwiV0hFUkUgdGFibGVfaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHRhYmxlSWQpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hSWQpIHtcbiAgICAgIHF1ZXJ5V2hlcmUgPSBgXG4gICAgICAgIFdIRVJFIHRhYmxlX2lkIElOIChcbiAgICAgICAgICBTRUxFQ1QgaWQgZnJvbSB3Yi50YWJsZXNcbiAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMuc2NoZW1hX2lkPSQxXG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFJZCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICR7cXVlcnlXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICB0YWJsZUlkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBVUERBVEUgd2IudGFibGVfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHRhYmxlX2lkPSQzXG4gICAgICAgIEFORCB1c2VyX2lkPSQ0XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2V0dGluZ3MsIG5ldyBEYXRlKCksIHRhYmxlSWQsIHVzZXJJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IENvbHVtbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY29sdW1uQnlTY2hlbWFUYWJsZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIkNPTFVNTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLmNvbHVtbnMuKiwgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuZGF0YV90eXBlIGFzIHR5cGVcbiAgICAgIEZST00gd2IuY29sdW1uc1xuICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IuY29sdW1ucy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgT04gKFxuICAgICAgICB3Yi5jb2x1bW5zLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWVcbiAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9zY2hlbWFcbiAgICAgIClcbiAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX25hbWU9JDJcbiAgICBgO1xuICAgIGxldCBwYXJhbXM6IHN0cmluZ1tdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9IEFORCB3Yi5jb2x1bW5zLm5hbWU9JDMgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lPSQzYDtcbiAgICAgIHBhcmFtcy5wdXNoKGNvbHVtbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyQ29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU6IGJvb2xlYW4sXG4gICAgY29sdW1uUEdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuYWRkT3JDcmVhdGVDb2x1bW4gJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHtjb2x1bW5OYW1lfSAke2NvbHVtbkxhYmVsfSAke2NvbHVtblBHVHlwZX0gJHtjcmVhdGV9YFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2IuY29sdW1ucyh0YWJsZV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZC5pZCwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFERCAke2NvbHVtbk5hbWV9ICR7Y29sdW1uUEdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXTtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1uQnlTY2hlbWFUYWJsZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICAgIGxldCBxdWVyeSA9IGBcbiAgICAgICAgVVBEQVRFIHdiLmNvbHVtbnMgU0VUXG4gICAgICBgO1xuICAgICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5OYW1lKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5MYWJlbCk7XG4gICAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgICAgcXVlcnkgKz0gYCR7dXBkYXRlcy5qb2luKFwiLCBcIil9IFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld1R5cGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFMVEVSIENPTFVNTiAke2NvbHVtbk5hbWV9IFRZUEUgJHtuZXdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgQ09MVU1OICR7Y29sdW1uTmFtZX0gVE8gJHtuZXdDb2x1bW5OYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IuY29sdW1uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5OYW1lfSBDQVNDQURFXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQ29sdW1uIHtcbiAgc3RhdGljIENPTU1PTl9UWVBFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBUZXh0OiBcInRleHRcIixcbiAgICBOdW1iZXI6IFwiaW50ZWdlclwiLFxuICAgIERlY2ltYWw6IFwiZGVjaW1hbFwiLFxuICAgIEJvb2xlYW46IFwiYm9vbGVhblwiLFxuICAgIERhdGU6IFwiZGF0ZVwiLFxuICAgIFwiRGF0ZSAmIFRpbWVcIjogXCJ0aW1lc3RhbXBcIixcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIHR5cGUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgaXNQcmltYXJ5S2V5ITogYm9vbGVhbjtcbiAgZm9yZWlnbktleXMhOiBbQ29uc3RyYWludElkXTtcbiAgcmVmZXJlbmNlZEJ5ITogW0NvbnN0cmFpbnRJZF07XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxDb2x1bW4+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIkNvbHVtbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBjb2x1bW5zID0gQXJyYXk8Q29sdW1uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgY29sdW1ucy5wdXNoKENvbHVtbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29sdW1ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IENvbHVtbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgIGNvbHVtbi5pZCA9IGRhdGEuaWQ7XG4gICAgY29sdW1uLnRhYmxlSWQgPSBkYXRhLnRhYmxlX2lkO1xuICAgIGNvbHVtbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIGNvbHVtbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgY29sdW1uLnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgY29sdW1uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBjb2x1bW4udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiBjb2x1bW47XG4gIH1cbn1cbiIsImltcG9ydCB7IE9yZ2FuaXphdGlvbiwgU2NoZW1hLCBUYWJsZSwgVXNlciB9IGZyb20gXCIuXCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQgeyBlcnJSZXN1bHQsIGxvZywgV2hpdGVicmlja0Nsb3VkIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFJvbGUgfSBmcm9tIFwiLi9Sb2xlXCI7XG5cbmV4cG9ydCBjbGFzcyBDdXJyZW50VXNlciB7XG4gIHdiQ2xvdWQhOiBXaGl0ZWJyaWNrQ2xvdWQ7XG4gIHVzZXIhOiBVc2VyO1xuICBpZCE6IG51bWJlcjtcbiAgb3JnYW5pemF0aW9uczogUmVjb3JkPG51bWJlciwgT3JnYW5pemF0aW9uPiA9IHt9O1xuICBhY3Rpb25IaXN0b3J5OiBzdHJpbmdbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHdiQ2xvdWQ6IFdoaXRlYnJpY2tDbG91ZCwgdXNlcjogVXNlcikge1xuICAgIHRoaXMud2JDbG91ZCA9IHdiQ2xvdWQ7XG4gICAgdGhpcy51c2VyID0gdXNlcjtcbiAgICB0aGlzLmlkID0gdXNlci5pZDtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0U3lzQWRtaW4od2JDbG91ZDogV2hpdGVicmlja0Nsb3VkKSB7XG4gICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcih3YkNsb3VkLCBVc2VyLmdldFN5c0FkbWluVXNlcigpKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0UHVibGljKHdiQ2xvdWQ6IFdoaXRlYnJpY2tDbG91ZCkge1xuICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIod2JDbG91ZCwgVXNlci5nZXRQdWJsaWNVc2VyKCkpO1xuICB9XG5cbiAgcHVibGljIGlzU2lnbmVkSW4oKSB7XG4gICAgLy90aGlzLnJlY29yZChcIklTX1NJR05FRF9JTlwiKTtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkICE9PSBVc2VyLlBVQkxJQ19JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZE91dCgpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzUHVibGljKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1NpZ25lZEluKCk7XG4gIH1cblxuICBwdWJsaWMgaXNTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09PSBVc2VyLlNZU19BRE1JTl9JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc05vdFN5c0FkbWluKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1N5c0FkbWluO1xuICB9XG5cbiAgcHVibGljIGlkSXMob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PSBvdGhlcklkO1xuICB9XG5cbiAgcHVibGljIGlkSXNOb3Qob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuICF0aGlzLmlkSXMob3RoZXJJZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdE9yZ2FuaXphdGlvbnNJZkVtcHR5KCkge1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLm9yZ2FuaXphdGlvbnMpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBjb25zdCBvcmdhbml6YXRpb25zUmVzdWx0ID0gYXdhaXQgdGhpcy53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5SWQodGhpcy5pZCk7XG4gICAgICAvLyBUQkQgdHJ5IHJhaXNlIGVycm9yIGJlbG93XG4gICAgICBpZiAoIW9yZ2FuaXphdGlvbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGZhbHNlO1xuICAgICAgZm9yIChjb25zdCBvcmdhbml6YXRpb24gb2Ygb3JnYW5pemF0aW9uc1Jlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHRoaXMub3JnYW5pemF0aW9uc1tvcmdhbml6YXRpb24uaWRdID0gb3JnYW5pemF0aW9uO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpc0luT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBhd2FpdCB0aGlzLmluaXRPcmdhbml6YXRpb25zSWZFbXB0eSgpO1xuICAgIHJldHVybiB0aGlzLm9yZ2FuaXphdGlvbnMuaGFzT3duUHJvcGVydHkob3JnYW5pemF0aW9uSWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGlzTm90SW5Pcmdhbml6YXRpb24ob3JnYW5pemF0aW9uSWQ6IG51bWJlcikge1xuICAgIHJldHVybiAhdGhpcy5pc0luT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpcyhyb2xlOiBzdHJpbmcsIG9iamVjdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBzd2l0Y2ggKHJvbGUpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiOlxuICAgICAgICBhd2FpdCB0aGlzLmluaXRPcmdhbml6YXRpb25zSWZFbXB0eSgpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIHRoaXMub3JnYW5pemF0aW9ucy5oYXNPd25Qcm9wZXJ0eShvYmplY3RJZCkgJiZcbiAgICAgICAgICB0aGlzLm9yZ2FuaXphdGlvbnNbb2JqZWN0SWRdLnVzZXJSb2xlID09IHJvbGVcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGlzTm90KHJvbGU6IHN0cmluZywgb2JqZWN0SWQ6IGFueSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiAhdGhpcy5pcyhyb2xlLCBvYmplY3RJZCk7XG4gIH1cblxuICAvL2lmKGNVLmNhbnQoXCJlZGl0X3RhYmxlXCIsIHRhYmxlLmlkKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuXG4gIC8vIGFzeW5jIG9ubHkgcmVxdWlyZWQgZm9yIHRlc3RpbmdcbiAgcHVibGljIHN0YXRpYyBhc3luYyBmcm9tQ29udGV4dChjb250ZXh0OiBhbnkpOiBQcm9taXNlPEN1cnJlbnRVc2VyPiB7XG4gICAgLy9sb2cuaW5mbyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKFxuICAgICAgY29udGV4dC5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgICApLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChcbiAgICAgIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFRFU1QgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCByZXN1bHQucGF5bG9hZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHRlc3QgZW1haWwgeC10ZXN0LXVzZXItZW1haWw9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKGNvbnRleHQud2JDbG91ZCwgVXNlci5nZXRQdWJsaWNVc2VyKCkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgU1lTQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFN5c0FkbWluVXNlcigpKTtcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChcbiAgICAgICAgcGFyc2VJbnQoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCByZXN1bHQucGF5bG9hZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHgtaGFzdXJhLXVzZXItaWQ9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFB1YmxpY1VzZXIoKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRCRDogc3VwcG9ydCBmb3IgcHVibGljIHVzZXJzXG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGBDdXJyZW50VXNlci5mcm9tQ29udGV4dDogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBjb250ZXh0LmhlYWRlcnNcbiAgICAgICAgKX1gXG4gICAgICApO1xuICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBPcmdhbml6YXRpb24ge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb24+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25zID0gQXJyYXk8T3JnYW5pemF0aW9uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9ucy5wdXNoKE9yZ2FuaXphdGlvbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uID0gbmV3IE9yZ2FuaXphdGlvbigpO1xuICAgIG9yZ2FuaXphdGlvbi5pZCA9IGRhdGEuaWQ7XG4gICAgb3JnYW5pemF0aW9uLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgb3JnYW5pemF0aW9uLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBvcmdhbml6YXRpb24uY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvbi51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBvcmdhbml6YXRpb24udXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgT3JnYW5pemF0aW9uVXNlciB7XG4gIG9yZ2FuaXphdGlvbklkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21yb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgcm9sZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PE9yZ2FuaXphdGlvblVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvblVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uVXNlcnMgPSBBcnJheTxPcmdhbml6YXRpb25Vc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9uVXNlcnMucHVzaChPcmdhbml6YXRpb25Vc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBvcmdhbml6YXRpb25Vc2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvblVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25Vc2VyID0gbmV3IE9yZ2FuaXphdGlvblVzZXIoKTtcbiAgICBvcmdhbml6YXRpb25Vc2VyLm9yZ2FuaXphdGlvbklkID0gZGF0YS5vcmdhbml6YXRpb25faWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51c2VySWQgPSBkYXRhLnVzZXJfaWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5yb2xlSWQgPSBkYXRhLnJvbGVfaWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5pbXBsaWVkRnJvbXJvbGVJZCA9IGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgb3JnYW5pemF0aW9uVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEub3JnYW5pemF0aW9uX25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLm9yZ2FuaXphdGlvbk5hbWUgPSBkYXRhLm9yZ2FuaXphdGlvbl9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIG9yZ2FuaXphdGlvblVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnJvbGUpIG9yZ2FuaXphdGlvblVzZXIucm9sZSA9IGRhdGEucm9sZTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbHVtbiB9IGZyb20gXCIuL0NvbHVtblwiO1xuXG4vKipcbiAqIFNDSEVNQVxuICogLSBJZiBhIHNjaGVtYSBpcyBvd25lZCBieSBhbiBvcmdhbml6YXRpb25cbiAqICAgLSBBbGwgYWRtaW5pc3RyYXRvcnMgb2YgdGhlIG9yZ2FuaXphdGlvbiBoYXZlIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogICAtIFRoZXJlIGFyZSBubyBleGNlcHRpb25zXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGEgdXNlciwgdGhlIHVzZXIgaGFzIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogICAtIEFkZGl0aW9uYWwgdXNlcnMgY2FuIGJlIGdyYW50ZWQgYWRtaW4gYWNjZXNzIGV4cGxpY2l0bHlcbiAqL1xuXG5leHBvcnQgdHlwZSBSb2xlTGV2ZWwgPSBcIm9yZ2FuaXphdGlvblwiIHwgXCJzY2hlbWFcIiB8IFwidGFibGVcIjtcblxuZXhwb3J0IGNsYXNzIFJvbGUge1xuICBzdGF0aWMgU1lTUk9MRVNfT1JHQU5JWkFUSU9OUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XG4gICAgb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBBZG1pbmlzdHJhdG9yXCIsXG4gICAgfSxcbiAgICBvcmdhbml6YXRpb25fdXNlcjogeyBsYWJlbDogXCJPcmdhbml6YXRpb24gVXNlclwiIH0sXG4gICAgb3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXI6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBFeHRlcm5hbCBVc2VyXCIsXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgU1lTUk9MRVNfU0NIRU1BUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gICAgc2NoZW1hX293bmVyOiB7IGxhYmVsOiBcIkRCIE93bmVyXCIgfSxcbiAgICBzY2hlbWFfYWRtaW5pc3RyYXRvcjogeyBsYWJlbDogXCJEQiBBZG1pbmlzdHJhdG9yXCIgfSxcbiAgICBzY2hlbWFfbWFuYWdlcjogeyBsYWJlbDogXCJEQiBNYW5hZ2VyXCIgfSxcbiAgICBzY2hlbWFfZWRpdG9yOiB7IGxhYmVsOiBcIkRCIEVkaXRvclwiIH0sXG4gICAgc2NoZW1hX3JlYWRlcjogeyBsYWJlbDogXCJEQiBSZWFkZXJcIiB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19UQUJMRVM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge1xuICAgIHRhYmxlX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIEFkbWluaXN0cmF0b3JcIixcbiAgICAgIHBlcm1pc3Npb25QcmVmaXhlczogW1wic1wiLCBcImlcIiwgXCJ1XCIsIFwiZFwiXSxcbiAgICB9LFxuICAgIHRhYmxlX21hbmFnZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIE1hbmFnZXJcIixcbiAgICAgIHBlcm1pc3Npb25QcmVmaXhlczogW1wic1wiLCBcImlcIiwgXCJ1XCIsIFwiZFwiXSxcbiAgICB9LFxuICAgIHRhYmxlX2VkaXRvcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgRWRpdG9yXCIsXG4gICAgICBwZXJtaXNzaW9uUHJlZml4ZXM6IFtcInNcIiwgXCJpXCIsIFwidVwiLCBcImRcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9yZWFkZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIFJlYWRlclwiLFxuICAgICAgcGVybWlzc2lvblByZWZpeGVzOiBbXCJzXCJdLFxuICAgIH0sXG4gIH07XG5cbiAgc3RhdGljIFNDSEVNQV9UT19UQUJMRV9ST0xFX01BUDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiLFxuICAgIHNjaGVtYV9hZG1pbmlzdHJhdG9yOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIixcbiAgICBzY2hlbWFfbWFuYWdlcjogXCJ0YWJsZV9tYW5hZ2VyXCIsXG4gICAgc2NoZW1hX2VkaXRvcjogXCJ0YWJsZV9lZGl0b3JcIixcbiAgICBzY2hlbWFfcmVhZGVyOiBcInRhYmxlX3JlYWRlclwiLFxuICB9O1xuXG4gIHN0YXRpYyBPUkdBTklaQVRJT05fVE9fU0NIRU1BX1JPTEVfTUFQOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIG9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yOiBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gIH07XG5cbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHNjaGVtYUlkPzogbnVtYmVyO1xuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB0YWJsZUlkPzogbnVtYmVyO1xuICB0YWJsZU5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBpc1JvbGUocm9sZU5hbWU6IHN0cmluZywgcm9sZUxldmVsPzogUm9sZUxldmVsKTogYm9vbGVhbiB7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUykuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgICAgY2FzZSBcInNjaGVtYVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19TQ0hFTUFTKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBjYXNlIFwidGFibGVcIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUykuaW5jbHVkZXMocm9sZU5hbWUpIHx8XG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19TQ0hFTUFTKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykuaW5jbHVkZXMocm9sZU5hbWUpXG4gICAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHN0YXRpYyBhcmVSb2xlcyhyb2xlTmFtZXM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG4gICAgZm9yIChjb25zdCByb2xlTmFtZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gZWcge1xuICAvLyBwZXJtaXNzaW9uS2V5OiBzMTIzNCwgdHlwZTogXCJzZWxlY3RcIlxuICAvLyBwZXJtaXNzaW9uS2V5OiBpMTIzNCwgdHlwZTogXCJpbnNlcnRcIlxuICAvLyBwZXJtaXNzaW9uS2V5OiB1MTIzNCwgdHlwZTogXCJ1cGRhdGVcIlxuICAvLyBwZXJtaXNzaW9uS2V5OiBkMTIzNCwgdHlwZTogXCJkZWxldGVcIlxuICAvLyB9XG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uS2V5c0FuZFR5cGVzKFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10ge1xuICAgIGNvbnN0IFBFUk1JU1NJT05fUFJFRklYRVNfVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICBzOiBcInNlbGVjdFwiLFxuICAgICAgaTogXCJpbnNlcnRcIixcbiAgICAgIHU6IFwidXBkYXRlXCIsXG4gICAgICBkOiBcImRlbGV0ZVwiLFxuICAgIH07XG4gICAgY29uc3QgcGVybWlzc2lvbktleXNBbmRUeXBlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdID0gW107XG4gICAgZm9yIChjb25zdCBwcmVmaXggb2YgT2JqZWN0LmtleXMoUEVSTUlTU0lPTl9QUkVGSVhFU19UWVBFUykpIHtcbiAgICAgIHBlcm1pc3Npb25LZXlzQW5kVHlwZXMucHVzaCh7XG4gICAgICAgIHBlcm1pc3Npb25LZXk6IFJvbGUudGFibGVQZXJtaXNzaW9uS2V5KHByZWZpeCwgdGFibGVJZCksXG4gICAgICAgIHR5cGU6IFBFUk1JU1NJT05fUFJFRklYRVNfVFlQRVNbcHJlZml4XSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcGVybWlzc2lvbktleXNBbmRUeXBlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uS2V5KFxuICAgIHBlcm1pc3Npb25QcmVmaXg6IHN0cmluZyxcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7cGVybWlzc2lvblByZWZpeH0ke3RhYmxlSWR9YDtcbiAgfVxuXG4gIC8vIFVzZWQgdG8gZ2VuZXJhdGUgdGhlIEhhc3VyYSB0YWJsZSBwZXJtaXNzaW9uXG4gIHB1YmxpYyBzdGF0aWMgaGFzdXJhVGFibGVQZXJtaXNzaW9uQ2hlY2tzQW5kVHlwZXMoXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IFJlY29yZDxzdHJpbmcsIGFueT5bXSB7XG4gICAgY29uc3QgaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlczogUmVjb3JkPHN0cmluZywgYW55PltdID0gW107XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5c0FuZFR5cGUgb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kVHlwZXMoXG4gICAgICB0YWJsZUlkXG4gICAgKSkge1xuICAgICAgaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlcy5wdXNoKHtcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrOiB7XG4gICAgICAgICAgX2V4aXN0czoge1xuICAgICAgICAgICAgX3RhYmxlOiB7IHNjaGVtYTogXCJ3YlwiLCBuYW1lOiBcInRhYmxlX3Blcm1pc3Npb25zXCIgfSxcbiAgICAgICAgICAgIF93aGVyZToge1xuICAgICAgICAgICAgICBfYW5kOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgdGFibGVfcGVybWlzc2lvbl9rZXk6IHtcbiAgICAgICAgICAgICAgICAgICAgX2VxOiBwZXJtaXNzaW9uS2V5c0FuZFR5cGUucGVybWlzc2lvbktleSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7IHVzZXJfaWQ6IHsgX2VxOiBcIlgtSGFzdXJhLVVzZXItSWRcIiB9IH0sXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHBlcm1pc3Npb25UeXBlOiBwZXJtaXNzaW9uS2V5c0FuZFR5cGUudHlwZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Um9sZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiUm9sZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCByb2xlcyA9IEFycmF5PFJvbGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICByb2xlcy5wdXNoKFJvbGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJvbGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUm9sZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGUgPSBuZXcgUm9sZSgpO1xuICAgIHJvbGUuaWQgPSBkYXRhLmlkO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICByb2xlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICByb2xlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICByb2xlLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5zY2hlbWFJZCkgcm9sZS5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hSWQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hTmFtZSkgcm9sZS5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFOYW1lO1xuICAgIGlmIChkYXRhLnRhYmxlSWQpIHJvbGUudGFibGVJZCA9IGRhdGEudGFibGVJZDtcbiAgICBpZiAoZGF0YS50YWJsZU5hbWUpIHJvbGUudGFibGVOYW1lID0gZGF0YS50YWJsZU5hbWU7XG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBVc2VyLCBPcmdhbml6YXRpb24gfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgU2NoZW1hIHtcbiAgc3RhdGljIFNZU19TQ0hFTUFfTkFNRVM6IHN0cmluZ1tdID0gW1xuICAgIFwicHVibGljXCIsXG4gICAgXCJpbmZvcm1hdGlvbl9zY2hlbWFcIixcbiAgICBcImhkYl9jYXRhbG9nXCIsXG4gICAgXCJ3YlwiLFxuICBdO1xuXG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcjtcbiAgdXNlck93bmVySWQ/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG4gIG9yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZztcbiAgdXNlck93bmVyRW1haWw/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IGRhdGEuaWQ7XG4gICAgc2NoZW1hLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgc2NoZW1hLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBzY2hlbWEub3JnYW5pemF0aW9uT3duZXJJZCA9IGRhdGEub3JnYW5pemF0aW9uX293bmVyX2lkO1xuICAgIHNjaGVtYS51c2VyT3duZXJJZCA9IGRhdGEudXNlcl9vd25lcl9pZDtcbiAgICBzY2hlbWEuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBzY2hlbWEudXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICBpZiAoZGF0YS5vcmdhbml6YXRpb25fb3duZXJfbmFtZSkge1xuICAgICAgc2NoZW1hLm9yZ2FuaXphdGlvbk93bmVyTmFtZSA9IGRhdGEub3JnYW5pemF0aW9uX293bmVyX25hbWU7XG4gICAgfVxuICAgIGlmIChkYXRhLnVzZXJfb3duZXJfZW1haWwpIHNjaGVtYS51c2VyT3duZXJFbWFpbCA9IGRhdGEudXNlcl9vd25lcl9lbWFpbDtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgU2NoZW1hVXNlciB7XG4gIHNjaGVtYUlkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21Sb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgcm9sZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFNjaGVtYVVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYVVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hVXNlcnMgPSBBcnJheTxTY2hlbWFVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hVXNlcnMucHVzaChTY2hlbWFVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBzY2hlbWFVc2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYVVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFVc2VyID0gbmV3IFNjaGVtYVVzZXIoKTtcbiAgICBzY2hlbWFVc2VyLnNjaGVtYUlkID0gZGF0YS5zY2hlbWFfaWQ7XG4gICAgc2NoZW1hVXNlci51c2VySWQgPSBkYXRhLnVzZXJfaWQ7XG4gICAgc2NoZW1hVXNlci5yb2xlSWQgPSBkYXRhLnJvbGVfaWQ7XG4gICAgc2NoZW1hVXNlci5pbXBsaWVkRnJvbVJvbGVJZCA9IGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQ7XG4gICAgc2NoZW1hVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgc2NoZW1hVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHNjaGVtYVVzZXIuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9lbWFpbCkgc2NoZW1hVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEucm9sZSkgc2NoZW1hVXNlci5yb2xlID0gZGF0YS5yb2xlO1xuICAgIHJldHVybiBzY2hlbWFVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIFRhYmxlIHtcbiAgaWQhOiBudW1iZXI7XG4gIHNjaGVtYUlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBjb2x1bW5zITogW0NvbHVtbl07XG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxUYWJsZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGUucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVzID0gQXJyYXk8VGFibGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0YWJsZXMucHVzaChUYWJsZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGFibGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGFibGUge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGUgPSBuZXcgVGFibGUoKTtcbiAgICB0YWJsZS5pZCA9IGRhdGEuaWQ7XG4gICAgdGFibGUuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICB0YWJsZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRhYmxlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICB0YWJsZS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdGFibGUudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSB0YWJsZS5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICByZXR1cm4gdGFibGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBUYWJsZVVzZXIge1xuICB0YWJsZUlkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21yb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHRhYmxlTmFtZT86IHN0cmluZztcbiAgdXNlckVtYWlsPzogc3RyaW5nO1xuICByb2xlPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGVVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZVVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVVc2VycyA9IEFycmF5PFRhYmxlVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlVXNlcnMucHVzaChUYWJsZVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZVVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlciA9IG5ldyBUYWJsZVVzZXIoKTtcbiAgICB0YWJsZVVzZXIudGFibGVJZCA9IGRhdGEudGFibGVfaWQ7XG4gICAgdGFibGVVc2VyLnVzZXJJZCA9IGRhdGEudXNlcl9pZDtcbiAgICB0YWJsZVVzZXIucm9sZUlkID0gZGF0YS5yb2xlX2lkO1xuICAgIHRhYmxlVXNlci5pbXBsaWVkRnJvbXJvbGVJZCA9IGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQ7XG4gICAgdGFibGVVc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICB0YWJsZVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHRhYmxlVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlVXNlci5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS50YWJsZV9uYW1lKSB0YWJsZVVzZXIudGFibGVOYW1lID0gZGF0YS50YWJsZV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHRhYmxlVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEucm9sZSkgdGFibGVVc2VyLnJvbGUgPSBkYXRhLnJvbGU7XG4gICAgcmV0dXJuIHRhYmxlVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IHVzZXJNZXNzYWdlcyB9IGZyb20gXCIuLi9lbnZpcm9ubWVudFwiO1xuXG5leHBvcnQgY2xhc3MgVXNlciB7XG4gIHN0YXRpYyBTWVNfQURNSU5fSUQ6IG51bWJlciA9IDE7XG4gIHN0YXRpYyBQVUJMSUNfSUQ6IG51bWJlciA9IDE7XG5cbiAgaWQhOiBudW1iZXI7XG4gIGVtYWlsITogc3RyaW5nO1xuICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gIGxhc3ROYW1lPzogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB1c2VycyA9IEFycmF5PFVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB1c2Vycy5wdXNoKFVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBkYXRhLmlkO1xuICAgIHVzZXIuZW1haWwgPSBkYXRhLmVtYWlsO1xuICAgIGlmIChkYXRhLmZpcnN0X25hbWUpIHVzZXIuZmlyc3ROYW1lID0gZGF0YS5maXJzdF9uYW1lO1xuICAgIGlmIChkYXRhLmxhc3RfbmFtZSkgdXNlci5sYXN0TmFtZSA9IGRhdGEubGFzdF9uYW1lO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB1c2VyO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRTeXNBZG1pblVzZXIoKTogVXNlciB7XG4gICAgY29uc3QgZGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdXNlcjogVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IFVzZXIuU1lTX0FETUlOX0lEO1xuICAgIHVzZXIuZW1haWwgPSBcIlNZU19BRE1JTkBleGFtcGxlLmNvbVwiO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gXCJTWVMgQWRtaW5cIjtcbiAgICB1c2VyLmxhc3ROYW1lID0gXCJTWVMgQWRtaW5cIjtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGU7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRlO1xuICAgIHJldHVybiB1c2VyO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRQdWJsaWNVc2VyKCk6IFVzZXIge1xuICAgIGNvbnN0IGRhdGU6IERhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHVzZXI6IFVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBVc2VyLlBVQkxJQ19JRDtcbiAgICB1c2VyLmVtYWlsID0gXCJQVUJMSUNAZXhhbXBsZS5jb21cIjtcbiAgICB1c2VyLmZpcnN0TmFtZSA9IFwiUHVibGljIFVzZXJcIjtcbiAgICB1c2VyLmxhc3ROYW1lID0gXCJQdWJsaWMgVXNlclwiO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0ZTtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cbn1cbiIsImV4cG9ydCAqIGZyb20gXCIuL1JvbGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1VzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL09yZ2FuaXphdGlvblwiO1xuZXhwb3J0ICogZnJvbSBcIi4vT3JnYW5pemF0aW9uVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vU2NoZW1hXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UYWJsZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Db2x1bW5cIjtcbiIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmc7XG4gIGRiSG9zdDogc3RyaW5nO1xuICBkYlBvcnQ6IG51bWJlcjtcbiAgZGJVc2VyOiBzdHJpbmc7XG4gIGRiUGFzc3dvcmQ6IHN0cmluZztcbiAgZGJQb29sTWF4OiBudW1iZXI7XG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGhhc3VyYUhvc3Q6IHN0cmluZztcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHN0cmluZztcbiAgdGVzdElnbm9yZUVycm9yczogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCBjb25zdCBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHByb2Nlc3MuZW52LlNFQ1JFVF9NRVNTQUdFIGFzIHN0cmluZyxcbiAgZGJOYW1lOiBwcm9jZXNzLmVudi5EQl9OQU1FIGFzIHN0cmluZyxcbiAgZGJIb3N0OiBwcm9jZXNzLmVudi5EQl9IT1NUIGFzIHN0cmluZyxcbiAgZGJQb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT1JUIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRV9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9DT05ORUNUSU9OX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGhhc3VyYUhvc3Q6IHByb2Nlc3MuZW52LkhBU1VSQV9IT1NUIGFzIHN0cmluZyxcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHByb2Nlc3MuZW52LkhBU1VSQV9BRE1JTl9TRUNSRVQgYXMgc3RyaW5nLFxuICB0ZXN0SWdub3JlRXJyb3JzOiAocHJvY2Vzcy5lbnYuVEVTVF9JR05PUkVfRVJST1JTIHx8IGZhbHNlKSBhcyBib29sZWFuLFxufTtcblxuLy8gd2JFcnJvckNvZGUgOiBbIG1lc3NhZ2UsIGFwb2xsb0Vycm9yQ29kZT8gXVxuZXhwb3J0IGNvbnN0IHVzZXJNZXNzYWdlczogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAvLyBVc2Vyc1xuICBXQl9VU0VSX05PVF9GT1VORDogW1wiVXNlciBub3QgZm91bmQuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX1VTRVJTX05PVF9GT1VORDogW1wiT25lIG9yIG1vcmUgdXNlcnMgd2VyZSBub3QgZm91bmQuXCJdLFxuICAvLyBPcmdhbml6YXRpb25zXG4gIFdCX09SR0FOSVpBVElPTl9OT1RfRk9VTkQ6IFtcIk9yZ2FuaXphdGlvbiBub3QgZm91bmQuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX09SR0FOSVpBVElPTl9OQU1FX1RBS0VOOiBbXG4gICAgXCJUaGlzIE9yZ2FuaXphdGlvbiBuYW1lIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4uXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFk6IFtcbiAgICBcIlRoaXMgb3JnYW5pemF0aW9uIHN0aWxsIGhhcyBub24tYWRtaW5pc3RyYXRpdmUgdXNlcnMuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgYWxsIEFkbWluaXN0cmF0b3JzIGZyb20gYW4gT3JnYW5pemF0aW9uIC0geW91IG11c3QgbGVhdmUgYXQgbGVhc3Qgb25lLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfVVNFUl9OT1RfSU5fT1JHOiBbXCJVc2VyIG11c3QgYmUgaW4gT3JnYW5pemF0aW9uXCJdLFxuICBXQl9VU0VSX05PVF9TQ0hFTUFfT1dORVI6IFtcIlRoZSBjdXJyZW50IHVzZXIgaXMgbm90IHRoZSBvd25lci5cIl0sXG4gIC8vIFNjaGVtYXNcbiAgV0JfU0NIRU1BX05PVF9GT1VORDogW1wiRGF0YWJhc2UgY291bGQgbm90IGJlIGZvdW5kLlwiXSxcbiAgV0JfQkFEX1NDSEVNQV9OQU1FOiBbXG4gICAgXCJEYXRhYmFzZSBuYW1lIGNhbiBub3QgYmVnaW4gd2l0aCAncGdfJyBvciBiZSBpbiB0aGUgcmVzZXJ2ZWQgbGlzdC5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX0NBTlRfUkVNT1ZFX1NDSEVNQV9VU0VSX09XTkVSOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgdGhlIHVzZXJfb3duZXIgZnJvbSBhIFNjaGVtYVwiLFxuICBdLFxuICAvLyBTY2hlbWFzIFVzZXJzXG4gIFdCX1NDSEVNQV9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIFNjaGVtYSBVc2VycyBub3QgZm91bmQuXCJdLFxuICAvLyBUYWJsZXNcbiAgV0JfVEFCTEVfTk9UX0ZPVU5EOiBbXCJUYWJsZSBjb3VsZCBub3QgYmUgZm91bmQuXCJdLFxuICBXQl9UQUJMRV9OQU1FX0VYSVNUUzogW1wiVGhpcyBUYWJsZSBuYW1lIGFscmVhZHkgZXhpc3RzXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIENPTFVNTl9OT1RfRk9VTkQ6IFtcIkNvbHVtbiBjb3VsZCBub3QgYmUgZm91bmRcIl0sXG4gIFdCX0NPTFVNTl9OQU1FX0VYSVNUUzogW1wiVGhpcyBDb2x1bW4gbmFtZSBhbHJlYWR5IGV4aXN0cy5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfUEtfRVhJU1RTOiBbXCJSZW1vdmUgZXhpc3RpbmcgcHJpbWFyeSBrZXkgZmlyc3QuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX0ZLX0VYSVNUUzogW1xuICAgIFwiUmVtb3ZlIGV4aXN0aW5nIGZvcmVpZ24ga2V5IG9uIHRoZSBjb2x1bW4gZmlyc3QuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICAvLyBUYWJsZSBVc2VycyxcbiAgV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSBUYWJsZSBVc2VycyBub3QgZm91bmQuXCJdLFxuICAvLyBSb2xlc1xuICBST0xFX05PVF9GT1VORDogW1wiVGhpcyByb2xlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG59O1xuIiwiLy8gaHR0cHM6Ly9hbHRyaW0uaW8vcG9zdHMvYXhpb3MtaHR0cC1jbGllbnQtdXNpbmctdHlwZXNjcmlwdFxuXG5pbXBvcnQgYXhpb3MsIHsgQXhpb3NJbnN0YW5jZSwgQXhpb3NSZXNwb25zZSB9IGZyb20gXCJheGlvc1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nIH0gZnJvbSBcIi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5jb25zdCBoZWFkZXJzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPj4gPSB7XG4gIEFjY2VwdDogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICBcIngtaGFzdXJhLWFkbWluLXNlY3JldFwiOiBlbnZpcm9ubWVudC5oYXN1cmFBZG1pblNlY3JldCxcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHN0YXRpYyBJR05PUkVfRVJST1JTID0gZmFsc2U7XG4gIHN0YXRpYyBIQVNVUkFfSUdOT1JFX0NPREVTOiBzdHJpbmdbXSA9IFtcbiAgICBcImFscmVhZHktdW50cmFja2VkXCIsXG4gICAgXCJhbHJlYWR5LXRyYWNrZWRcIixcbiAgICBcIm5vdC1leGlzdHNcIiwgLy8gZHJvcHBpbmcgYSByZWxhdGlvbnNoaXBcbiAgICBcImFscmVhZHktZXhpc3RzXCIsXG4gICAgXCJ1bmV4cGVjdGVkXCIsXG4gICAgXCJwZXJtaXNzaW9uLWRlbmllZFwiLFxuICBdO1xuXG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogZW52aXJvbm1lbnQuaGFzdXJhSG9zdCxcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBlcnJJZ25vcmUoKSB7XG4gICAgaWYgKHRoaXMuSUdOT1JFX0VSUk9SUyB8fCBlbnZpcm9ubWVudC50ZXN0SWdub3JlRXJyb3JzKSB7XG4gICAgICByZXR1cm4gdGhpcy5IQVNVUkFfSUdOT1JFX0NPREVTO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwb3N0KHR5cGU6IHN0cmluZywgYXJnczogUmVjb3JkPHN0cmluZywgYW55Pikge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KFxuICAgICAgICBcIi92MS9tZXRhZGF0YVwiLFxuICAgICAgICB7XG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICBhcmdzOiBhcmdzLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yLnJlc3BvbnNlICYmIGVycm9yLnJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgaWYgKCFIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMoZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlKSkge1xuICAgICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICAgIFwiZXJyb3IucmVzcG9uc2UuZGF0YTogXCIgKyBKU09OLnN0cmluZ2lmeShlcnJvci5yZXNwb25zZS5kYXRhKVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLnJlc3BvbnNlLmRhdGEuZXJyb3IsXG4gICAgICAgICAgICByZWZDb2RlOiBlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdW50cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICBjYXNjYWRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbGF0aW9uc2hpcHNcbiAgICovXG5cbiAgLy8gYSBwb3N0IGhhcyBvbmUgYXV0aG9yIChjb25zdHJhaW50IHBvc3RzLmF1dGhvcl9pZCAtPiBhdXRob3JzLmlkKVxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsIC8vIGF1dGhvcl9pZFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nIC8vIGF1dGhvcnNcbiAgKSB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NvbHVtbk5hbWV9LCAke3BhcmVudFRhYmxlTmFtZX0pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX29iamVjdF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IGNvbHVtbk5hbWUsIC8vIGF1dGhvcl9pZFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGFuIGF1dGhvciBoYXMgbWFueSBwb3N0cyAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gYXV0aG9yc1xuICAgIGNoaWxkVGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY2hpbGRDb2x1bW5OYW1lczogc3RyaW5nW10gLy8gYXV0aG9yX2lkXG4gICkge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBoYXN1cmFBcGkuY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NoaWxkVGFibGVOYW1lfSwgJHtjaGlsZENvbHVtbk5hbWVzfSlgXG4gICAgKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19jcmVhdGVfYXJyYXlfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIG5hbWU6IGBhcnJfJHt0YWJsZU5hbWV9XyR7Y2hpbGRUYWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICB9LFxuICAgICAgdXNpbmc6IHtcbiAgICAgICAgZm9yZWlnbl9rZXlfY29uc3RyYWludF9vbjoge1xuICAgICAgICAgIGNvbHVtbjogY2hpbGRDb2x1bW5OYW1lc1swXSwgLy8gYXV0aG9yX2lkXG4gICAgICAgICAgdGFibGU6IHtcbiAgICAgICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIG5hbWU6IGNoaWxkVGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRyb3BSZWxhdGlvbnNoaXBzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgIH0sXG4gICAgICByZWxhdGlvbnNoaXA6IGBvYmpfJHt0YWJsZU5hbWV9XyR7cGFyZW50VGFibGVOYW1lfWAsIC8vIG9ial9wb3N0c19hdXRob3JzXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICAoIXJlc3VsdC5yZWZDb2RlIHx8XG4gICAgICAgIChyZXN1bHQucmVmQ29kZSAmJiAhSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHBhcmVudFRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHJlbGF0aW9uc2hpcDogYGFycl8ke3BhcmVudFRhYmxlTmFtZX1fJHt0YWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQZXJtaXNzaW9uc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlUGVybWlzc2lvbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGVybWlzc2lvbkNoZWNrOiBvYmplY3QsXG4gICAgdHlwZTogc3RyaW5nLFxuICAgIHJvbGU6IHN0cmluZyxcbiAgICBjb2x1bW5zOiBzdHJpbmdbXVxuICApIHtcbiAgICBjb25zdCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgcm9sZTogcm9sZSxcbiAgICAgIHBlcm1pc3Npb246IHtcbiAgICAgICAgY29sdW1uczogY29sdW1ucyxcbiAgICAgICAgLy8gZmlsdGVyOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICAgIC8vIGNoZWNrOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gaHR0cHM6Ly9oYXN1cmEuaW8vZG9jcy9sYXRlc3QvZ3JhcGhxbC9jb3JlL2FwaS1yZWZlcmVuY2UvbWV0YWRhdGEtYXBpL3Blcm1pc3Npb24uaHRtbFxuICAgIGlmICh0eXBlID09IFwiaW5zZXJ0XCIpIHtcbiAgICAgIHBheWxvYWQucGVybWlzc2lvbi5jaGVjayA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9IGVsc2Uge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmZpbHRlciA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KGBwZ19jcmVhdGVfJHt0eXBlfV9wZXJtaXNzaW9uYCwgcGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVQZXJtaXNzaW9uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcsXG4gICAgcm9sZTogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChgcGdfZHJvcF8ke3R5cGV9X3Blcm1pc3Npb25gLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICByb2xlOiByb2xlLFxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhc3VyYUFwaSA9IG5ldyBIYXN1cmFBcGkoKTtcbiIsImltcG9ydCB7IHR5cGVEZWZzIGFzIFNjaGVtYSwgcmVzb2x2ZXJzIGFzIHNjaGVtYVJlc29sdmVycyB9IGZyb20gXCIuL3NjaGVtYVwiO1xuaW1wb3J0IHtcbiAgdHlwZURlZnMgYXMgT3JnYW5pemF0aW9uLFxuICByZXNvbHZlcnMgYXMgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxufSBmcm9tIFwiLi9vcmdhbml6YXRpb25cIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFVzZXIsIHJlc29sdmVycyBhcyB1c2VyUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdXNlclwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVGFibGUsIHJlc29sdmVycyBhcyB0YWJsZVJlc29sdmVycyB9IGZyb20gXCIuL3RhYmxlXCI7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gXCJsb2Rhc2hcIjtcbmltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHtcbiAgY29uc3RyYWludERpcmVjdGl2ZSxcbiAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxufSBmcm9tIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiO1xuaW1wb3J0IHsgbWFrZUV4ZWN1dGFibGVTY2hlbWEgfSBmcm9tIFwiZ3JhcGhxbC10b29sc1wiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnk7IG1lc3NhZ2U/OiBzdHJpbmcgfVxuICB8IHtcbiAgICAgIHN1Y2Nlc3M/OiBmYWxzZTtcbiAgICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gICAgICByZWZDb2RlPzogc3RyaW5nO1xuICAgICAgd2JDb2RlPzogc3RyaW5nO1xuICAgICAgYXBvbGxvRXJyb3JDb2RlPzogc3RyaW5nO1xuICAgICAgdmFsdWVzPzogc3RyaW5nW107XG4gICAgfTtcblxuZXhwb3J0IHR5cGUgUXVlcnlQYXJhbXMgPSB7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHBhcmFtcz86IGFueVtdO1xufTtcblxuZXhwb3J0IHR5cGUgQ29uc3RyYWludElkID0ge1xuICBjb25zdHJhaW50TmFtZTogc3RyaW5nO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgY29sdW1uTmFtZTogc3RyaW5nO1xuICByZWxUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIHJlbENvbHVtbk5hbWU/OiBzdHJpbmc7XG59O1xuXG5jb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogSlNPTiFcbiAgICB3YkNsb3VkQ29udGV4dDogSlNPTiFcbiAgfVxuXG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiUmVzZXRUZXN0RGF0YTogQm9vbGVhbiFcbiAgICB3YkF1dGgoc2NoZW1hTmFtZTogU3RyaW5nISwgdXNlckF1dGhJZDogU3RyaW5nISk6IEpTT04hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgIH07XG4gICAgfSxcbiAgICB3YkNsb3VkQ29udGV4dDogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gY29udGV4dC53YkNsb3VkLmNsb3VkQ29udGV4dCgpO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkF1dGg6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJBdXRoSWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmF1dGgoc2NoZW1hTmFtZSwgdXNlckF1dGhJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBzY2hlbWEgPSBtYWtlRXhlY3V0YWJsZVNjaGVtYSh7XG4gIHR5cGVEZWZzOiBbXG4gICAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxuICAgIHR5cGVEZWZzLFxuICAgIE9yZ2FuaXphdGlvbixcbiAgICBVc2VyLFxuICAgIFNjaGVtYSxcbiAgICBUYWJsZSxcbiAgXSxcbiAgcmVzb2x2ZXJzOiBtZXJnZShcbiAgICByZXNvbHZlcnMsXG4gICAgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxuICAgIHVzZXJSZXNvbHZlcnMsXG4gICAgc2NoZW1hUmVzb2x2ZXJzLFxuICAgIHRhYmxlUmVzb2x2ZXJzXG4gICksXG4gIHNjaGVtYVRyYW5zZm9ybXM6IFtjb25zdHJhaW50RGlyZWN0aXZlKCldLFxufSk7XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eS9DdXJyZW50VXNlclwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIE9yZ2FuaXphdGlvbiB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHVzZXJSb2xlOiBTdHJpbmdcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgT3JnYW5pemF0aW9uVXNlciB7XG4gICAgb3JnYW5pemF0aW9uSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nXG4gICAgdXNlckVtYWlsOiBTdHJpbmdcbiAgICByb2xlOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbnNcbiAgICBcIlwiXCJcbiAgICB3Yk9yZ2FuaXphdGlvbnModXNlckVtYWlsOiBTdHJpbmcpOiBbT3JnYW5pemF0aW9uXVxuICAgIHdiT3JnYW5pemF0aW9uQnlJZChpZDogSUQhKTogT3JnYW5pemF0aW9uXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWUoY3VycmVudFVzZXJFbWFpbDogU3RyaW5nISwgbmFtZTogU3RyaW5nISk6IE9yZ2FuaXphdGlvblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiT3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICByb2xlczogW1N0cmluZ11cbiAgICApOiBbT3JnYW5pemF0aW9uVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb25zXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVPcmdhbml6YXRpb24obmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBPcmdhbml6YXRpb25cbiAgICB3YlVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIG5ld05hbWU6IFN0cmluZ1xuICAgICAgbmV3TGFiZWw6IFN0cmluZ1xuICAgICk6IE9yZ2FuaXphdGlvblxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEpOiBCb29sZWFuXG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiT3JnYW5pemF0aW9uczogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVPcmdhbml6YXRpb25zKGN1cnJlbnRVc2VyKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiT3JnYW5pemF0aW9uQnlOYW1lOiBhc3luYyAoXywgeyBjdXJyZW50VXNlckVtYWlsLCBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25CeU5hbWUobmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk9yZ2FuaXphdGlvbkJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25CeUlkKGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIHdiT3JnYW5pemF0aW9uVXNlcnM6IGFzeW5jIChfLCB7IG9yZ2FuaXphdGlvbk5hbWUsIHJvbGVzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25Vc2VycyhcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByb2xlc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIE9yZ2FuaXphdGlvbnNcbiAgICB3YkNyZWF0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSwgbGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVPcmdhbml6YXRpb24oXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBsYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBuYW1lLFxuICAgICAgICBuZXdOYW1lLFxuICAgICAgICBuZXdMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5kZWxldGVPcmdhbml6YXRpb24obmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3YlNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgcm9sZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb246IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHVzZXJFbWFpbHMsIG9yZ2FuaXphdGlvbk5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5L0N1cnJlbnRVc2VyXCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgU2NoZW1hIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZDogSW50XG4gICAgdXNlck93bmVySWQ6IEludFxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICAgIHVzZXJSb2xlOiBTdHJpbmdcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU6IFN0cmluZ1xuICAgIHVzZXJPd25lckVtYWlsOiBTdHJpbmdcbiAgfVxuXG4gIHR5cGUgU2NoZW1hVXNlciB7XG4gICAgc2NoZW1hSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdXNlckVtYWlsOiBTdHJpbmdcbiAgICByb2xlOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YlNjaGVtYXM6IFtTY2hlbWFdXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSk6IFtTY2hlbWFVc2VyXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIGxhYmVsOiBTdHJpbmchXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkOiBJbnRcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgKTogU2NoZW1hXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSEpOiBCb29sZWFuXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiU2NoZW1hczogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFzKGN1cnJlbnRVc2VyKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFNjaGVtYSBVc2Vyc1xuICAgIHdiU2NoZW1hVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNjaGVtYVVzZXJzKHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiQ3JlYXRlU2NoZW1hOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uT3duZXJJZCwgb3JnYW5pemF0aW9uT3duZXJOYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVNjaGVtYShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lck5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBTY2hlbWEgVXNlcnNcbiAgICB3YlNldFNjaGVtYVVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldFNjaGVtYVVzZXJzUm9sZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgcm9sZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlU2NoZW1hVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZVNjaGVtYVVzZXJzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBHcmFwaFFMSlNPTiB9IGZyb20gXCJncmFwaHFsLXR5cGUtanNvblwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICBzY2FsYXIgSlNPTlxuXG4gIHR5cGUgVGFibGUge1xuICAgIGlkOiBJRCFcbiAgICBzY2hlbWFJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICAgIGNvbHVtbnM6IFtDb2x1bW5dIVxuICAgIHNjaGVtYU5hbWU6IFN0cmluZ1xuICB9XG5cbiAgdHlwZSBDb2x1bW4ge1xuICAgIGlkOiBJRCFcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgdHlwZTogU3RyaW5nIVxuICAgIGlzUHJpbWFyeUtleTogQm9vbGVhbiFcbiAgICBmb3JlaWduS2V5czogW0NvbnN0cmFpbnRJZF0hXG4gICAgcmVmZXJlbmNlZEJ5OiBbQ29uc3RyYWludElkXSFcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgQ29uc3RyYWludElkIHtcbiAgICBjb25zdHJhaW50TmFtZTogU3RyaW5nIVxuICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICByZWxUYWJsZU5hbWU6IFN0cmluZ1xuICAgIHJlbENvbHVtbk5hbWU6IFN0cmluZ1xuICB9XG5cbiAgdHlwZSBUYWJsZVVzZXIge1xuICAgIHRhYmxlSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdGFibGVOYW1lOiBTdHJpbmdcbiAgICB1c2VyRW1haWw6IFN0cmluZ1xuICAgIHJvbGU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgVGFibGVzXG4gICAgXCJcIlwiXG4gICAgd2JUYWJsZXMoc2NoZW1hTmFtZTogU3RyaW5nISwgd2l0aENvbHVtbnM6IEJvb2xlYW4pOiBbVGFibGVdXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlRhYmxlVXNlcnMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgKTogW1RhYmxlVXNlcl1cbiAgICBcIlwiXCJcbiAgICBDb2x1bW5zXG4gICAgXCJcIlwiXG4gICAgd2JDb2x1bW5zKHNjaGVtYU5hbWU6IFN0cmluZyEsIHRhYmxlTmFtZTogU3RyaW5nISk6IFtDb2x1bW5dXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgVGFibGVzXG4gICAgXCJcIlwiXG4gICAgd2JBZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZUxhYmVsOiBTdHJpbmchXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiVXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIG5ld1RhYmxlTmFtZTogU3RyaW5nXG4gICAgICBuZXdUYWJsZUxhYmVsOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZEFsbEV4aXN0aW5nVGFibGVzKHNjaGVtYU5hbWU6IFN0cmluZyEpOiBCb29sZWFuIVxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKHNjaGVtYU5hbWU6IFN0cmluZyEpOiBCb29sZWFuIVxuICAgIHdiQ3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBwYXJlbnRUYWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHBhcmVudENvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIHBhcmVudFRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICBcIlwiXCJcbiAgICBUYWJsZSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddIVxuICAgICAgcm9sZTogU3RyaW5nIVxuICAgICk6IEJvb2xlYW5cbiAgICB3YlNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5MYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgICBjb2x1bW5UeXBlOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiVXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBuZXdDb2x1bW5OYW1lOiBTdHJpbmdcbiAgICAgIG5ld0NvbHVtbkxhYmVsOiBTdHJpbmdcbiAgICAgIG5ld1R5cGU6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgSlNPTjogR3JhcGhRTEpTT04sXG4gIFF1ZXJ5OiB7XG4gICAgLy8gVGFibGVzXG4gICAgd2JUYWJsZXM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHdpdGhDb2x1bW5zIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZXMoc2NoZW1hTmFtZSwgd2l0aENvbHVtbnMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVGFibGUgVXNlcnNcbiAgICB3YlRhYmxlVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudGFibGVVc2VycyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gQ29sdW1uc1xuICAgIHdiQ29sdW1uczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBUYWJsZXNcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdGFibGVMYWJlbCwgY3JlYXRlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB0YWJsZUxhYmVsLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIG5ld1RhYmxlTmFtZSwgbmV3VGFibGVMYWJlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZVRhYmxlKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTmFtZSxcbiAgICAgICAgbmV3VGFibGVMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGRlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdUYWJsZXM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZEFsbEV4aXN0aW5nVGFibGVzKHNjaGVtYU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgLy8gQ29sdW1uc1xuICAgIHdiQWRkT3JDcmVhdGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWwsIGNyZWF0ZSwgY29sdW1uVHlwZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIGNvbHVtbkxhYmVsLFxuICAgICAgICBjcmVhdGUsXG4gICAgICAgIGNvbHVtblR5cGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlVwZGF0ZUNvbHVtbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZSxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgICBuZXdUeXBlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZUNvbHVtbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldFRhYmxlVXNlcnNSb2xlKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHJvbGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlNhdmVUYWJsZVVzZXJTZXR0aW5nczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VyRW1haWwsIHNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbCxcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbi8qKlxuICogT25seSBmaWVsZHMgcmVsYXRlZCB0byBhbiBpc29sYXRlZCB1c2VyIG9yIHJvbGUgb2JqZWN0cyBsaXZlIGhlcmVcbiAqIEZvciBvcmdhbml6YXRpb24tdXNlcnMsIHNjaGVtYS11c2VycywgdGFibGUtdXNlcnMgc2VlIHJlc3BlY3RpdmUgY2xhc3Nlc1xuICovXG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBVc2VyIHtcbiAgICBpZDogSUQhXG4gICAgZW1haWw6IFN0cmluZyFcbiAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgIGxhc3ROYW1lOiBTdHJpbmdcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiVXNlckJ5SWQoaWQ6IElEISk6IFVzZXJcbiAgICB3YlVzZXJCeUVtYWlsKGVtYWlsOiBTdHJpbmchKTogVXNlclxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVVc2VyKGVtYWlsOiBTdHJpbmchLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICB3YlVwZGF0ZVVzZXIoXG4gICAgICBpZDogSUQhXG4gICAgICBlbWFpbDogU3RyaW5nXG4gICAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgICk6IFVzZXJcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChpZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUVtYWlsOiBhc3luYyAoXywgeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5RW1haWwoZW1haWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gVXNlcnNcbiAgICB3YkNyZWF0ZVVzZXI6IGFzeW5jIChfLCB7IGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVXNlcjogYXN5bmMgKF8sIHsgaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVVc2VyKFxuICAgICAgICBpZCxcbiAgICAgICAgZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBBcG9sbG9TZXJ2ZXIsIEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuaW1wb3J0IHsgaGFzdXJhQXBpIH0gZnJvbSBcIi4vaGFzdXJhLWFwaVwiO1xuaW1wb3J0IHsgQ29uc3RyYWludElkLCBzY2hlbWEsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHYgPSByZXF1aXJlKFwidm9jYVwiKTtcbmltcG9ydCB7IHVzZXJNZXNzYWdlcyB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5cbmltcG9ydCB7XG4gIENvbHVtbixcbiAgT3JnYW5pemF0aW9uLFxuICBSb2xlLFxuICBSb2xlTGV2ZWwsXG4gIFNjaGVtYSxcbiAgVGFibGUsXG4gIFVzZXIsXG59IGZyb20gXCIuL2VudGl0eVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi9lbnRpdHkvQ3VycmVudFVzZXJcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxIYW5kbGVyID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gIHNjaGVtYSxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogKHsgZXZlbnQsIGNvbnRleHQgfSkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBoZWFkZXJzOiBldmVudC5oZWFkZXJzLFxuICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGV2ZW50Lm11bHRpVmFsdWVIZWFkZXJzLFxuICAgICAgd2JDbG91ZDogbmV3IFdoaXRlYnJpY2tDbG91ZCgpLFxuICAgIH07XG4gIH0sXG59KS5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBXaGl0ZWJyaWNrQ2xvdWQge1xuICBkYWwgPSBuZXcgREFMKCk7XG5cbiAgcHVibGljIGVycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gICAgcmV0dXJuIGFwb2xsb0VycihyZXN1bHQpO1xuICB9XG5cbiAgLy8gb25seSBhc3luYyBmb3IgdGVzdGluZyAtIGZvciB0aGUgbW9zdCBwYXJ0IHN0YXRpY1xuICBwdWJsaWMgYXN5bmMgdWlkRnJvbUhlYWRlcnMoXG4gICAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvL2xvZy5pbmZvKFwiPT09PT09PT09PSBIRUFERVJTOiBcIiArIEpTT04uc3RyaW5naWZ5KGhlYWRlcnMpKTtcbiAgICBjb25zdCBoZWFkZXJzTG93ZXJDYXNlID0gT2JqZWN0LmVudHJpZXMoaGVhZGVycykucmVkdWNlKFxuICAgICAgKGFjYzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgW2tleSwgdmFsXSkgPT4gKFxuICAgICAgICAoYWNjW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbCksIGFjY1xuICAgICAgKSxcbiAgICAgIHt9XG4gICAgKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgLy8gaWYgeC1oYXN1cmEtYWRtaW4tc2VjcmV0IGlzIHByZXNlbnQgYW5kIHZhbGlkIGhhc3VyYSBzZXRzIHJvbGUgdG8gYWRtaW5cbiAgICBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IFVzZXIuU1lTX0FETUlOX0lELFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5OT0RFX0VOViA9PSBcImRldmVsb3BtZW50XCIgJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXVxuICAgICkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItaWRcIl0pO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBURVNUIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogYHVpZEZyb21IZWFkZXJzOiBDb3VsZCBub3QgZmluZCBoZWFkZXJzIGZvciBBZG1pbiwgVGVzdCBvciBVc2VyIGluOiAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGhlYWRlcnNcbiAgICAgICAgKX1gLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBjbG91ZENvbnRleHQoKTogb2JqZWN0IHtcbiAgICByZXR1cm4ge1xuICAgICAgZGVmYXVsdENvbHVtblR5cGVzOiBDb2x1bW4uQ09NTU9OX1RZUEVTLFxuICAgICAgcm9sZXM6IHtcbiAgICAgICAgb3JnYW5pemF0aW9uczogUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TLFxuICAgICAgICBzY2hlbWFzOiBSb2xlLlNZU1JPTEVTX1NDSEVNQVMsXG4gICAgICAgIHRhYmxlczogUm9sZS5TWVNST0xFU19UQUJMRVMsXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUZXN0ID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJlc2V0VGVzdERhdGEoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGByZXNldFRlc3REYXRhKClgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBcInRlc3RfJVwiKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlU2NoZW1hKHNjaGVtYS5uYW1lLCB0cnVlKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVRlc3RVc2VycygpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBBdXRoID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGF1dGgoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJBdXRoSWQ6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgaGFzdXJhVXNlcklkOiBudW1iZXI7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJJZEZyb21BdXRoSWQodXNlckF1dGhJZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBoYXN1cmFVc2VySWQgPSByZXN1bHQucGF5bG9hZDtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgXCJYLUhhc3VyYS1BbGxvd2VkLVJvbGVzXCI6IFtcIndidXNlclwiXSxcbiAgICAgICAgXCJYLUhhc3VyYS1EZWZhdWx0LVJvbGVcIjogXCJ3YnVzZXJcIixcbiAgICAgICAgXCJYLUhhc3VyYS1Vc2VyLUlkXCI6IGhhc3VyYVVzZXJJZCxcbiAgICAgICAgXCJYLUhhc3VyYS1TY2hlbWEtTmFtZVwiOiBzY2hlbWFOYW1lLFxuICAgICAgICBcIlgtSGFzdXJhLUF1dGhlbnRpY2F0ZWQtQXRcIjogRGF0ZSgpLnRvU3RyaW5nKCksXG4gICAgICB9LFxuICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFJvbGVzICYgUGVybWlzc2lvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgIHRhYmxlOiBUYWJsZSxcbiAgICBkZWxldGVPbmx5PzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyh0YWJsZS5pZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdDogT3JnYW5pemF0aW9uIHwgU2NoZW1hIHwgVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgc2V0Um9sZSgke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke0pTT04uc3RyaW5naWZ5KG9iamVjdCl9KWBcbiAgICApO1xuICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUsIHJvbGVMZXZlbCkpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBgJHtyb2xlTmFtZX0gaXMgbm90IGEgdmFsaWQgbmFtZSBmb3IgYW4gJHtyb2xlTGV2ZWx9IFJvbGUuYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgc3dpdGNoIChyb2xlTmFtZSkge1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fdXNlclwiOlxuICAgICAgICAgICAgLy8gYXJlIGFueSBvZiB0aGVzZSB1c2VyIGN1cnJlbnRseSBhZG1pbnMgZ2V0dGluZyBkZW1vdGVkP1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhvYmplY3QubmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICAgICAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nLmluZm8oYEBAQEBAQEBAQEBAQEBAQEBAQCByZXN1bHQgJHtKU09OLnN0cmluZ2lmeShyZXN1bHQpfWApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBZG1pbklkcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgICAgICAgKG9yZ2FuaXphdGlvblVzZXI6IHsgdXNlcklkOiBudW1iZXIgfSkgPT4gb3JnYW5pemF0aW9uVXNlci51c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBkZW1vdGVkQWRtaW5zOiBudW1iZXJbXSA9IHVzZXJJZHMuZmlsdGVyKChpZDogbnVtYmVyKSA9PlxuICAgICAgICAgICAgICBjdXJyZW50QWRtaW5JZHMuaW5jbHVkZXMoaWQpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgbG9nLmluZm8oYEBAQEBAQEBAQEBAQEBAQEBAQCB1c2VySWRzICR7dXNlcklkc31gKTtcbiAgICAgICAgICAgIGxvZy5pbmZvKGBAQEBAQEBAQEBAQEBAQEBAQEAgY3VycmVudEFkbWluSWRzICR7Y3VycmVudEFkbWluSWRzfWApO1xuICAgICAgICAgICAgbG9nLmluZm8oYEBAQEBAQEBAQEBAQEBAQEBAQCBkZW1vdGVkQWRtaW5zICR7Y3VycmVudEFkbWluSWRzfWApO1xuICAgICAgICAgICAgaWYgKGRlbW90ZWRBZG1pbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAvLyBjb21wbGV0ZWx5IHJlbW92ZSB0aGVtICh3aWxsIHJhaXNlIGVycm9yIGlmIG5vIGFkbWlucylcbiAgICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICAgICAgICAgICAgb2JqZWN0Lm5hbWUsXG4gICAgICAgICAgICAgICAgZGVtb3RlZEFkbWluc1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gYWRkIG9yZ25haXphdGlvbl91c2VyXG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIjpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyEpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoXG4gICAgICAgICAgICAgIG9iamVjdC5pZCxcbiAgICAgICAgICAgICAgUm9sZS5PUkdBTklaQVRJT05fVE9fU0NIRU1BX1JPTEVfTUFQLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVzZXJJZHNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MhKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihvYmplY3QuaWQpO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5pZCxcbiAgICAgICAgICAgICAgICBSb2xlLlNDSEVNQV9UT19UQUJMRV9ST0xFX01BUCxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgdXNlcklkc1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MhKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCI6XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIjpcbiAgICAgICAgLy8gYWRkIHNjaGVtYV91c2VyXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyEpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIENoYW5naW5nIHJvbGUgYXQgdGhlIHNjaGVtYSBsZXZlbCByZXNldHMgYWxsXG4gICAgICAgIC8vIHRhYmxlIHJvbGVzIHRvIHRoZSBzY2hlbWEgZGVmYXVsdCBpbmhlcml0ZW5jZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgICAgICBvYmplY3QuaWQsXG4gICAgICAgICAgUm9sZS5TQ0hFTUFfVE9fVEFCTEVfUk9MRV9NQVAsIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHVzZXJJZHNcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIjpcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUm9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKHVzZXJJZHMsIHJvbGVMZXZlbCwgb2JqZWN0SWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgLy8gRGVsZXRlIHNjaGVtYSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBvcmdhbml6YXRpb24gYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICBcInNjaGVtYVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIG9yZ2FuaXphdGlvbiBpZFxuICAgICAgICAgIFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdXG4gICAgICAgICk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyEpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBzY2hlbWEgYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIob2JqZWN0SWQpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgc2NoZW1hLmlkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgc2NoZW1hIGlkXG4gICAgICAgICAgICBbXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzISkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIjpcbiAgICAgICAgLy8gRGVsZXRlIHRhYmxlIHVzZXJzIGltcGxpY2l0bHkgc2V0IGZyb20gc2NoZW1hIHVzZXJzXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICBcInRhYmxlXCIsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIG9iamVjdElkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgc2NoZW1hIGlkXG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TQ0hFTUFfVE9fVEFCTEVfUk9MRV9NQVApXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgZGVsZXRlVGVzdFVzZXJzKClgKTtcbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdFVzZXJzKCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUlkcyhpZHM6IG51bWJlcltdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzKGlkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5SWQoaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUlkcyhbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2lkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHM6IHN0cmluZ1tdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzKHVuZGVmaW5lZCwgdXNlckVtYWlscyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5RW1haWwoZW1haWw6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhbZW1haWxdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2VtYWlsXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy8gVEJEOiBhdXRoZW50aWNhdGlvbiwgc2F2ZSBwYXNzd29yZFxuICAgIHJldHVybiB0aGlzLmRhbC5jcmVhdGVVc2VyKGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKFxuICAgIGlkOiBudW1iZXIsXG4gICAgZW1haWw6IHN0cmluZyxcbiAgICBmaXJzdE5hbWU6IHN0cmluZyxcbiAgICBsYXN0TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVVc2VyKGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnMoXG4gICAgb3JnYW5pemF0aW9uSWRzPzogbnVtYmVyW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5vcmdhbml6YXRpb25zKFxuICAgICAgb3JnYW5pemF0aW9uSWRzLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZXMsXG4gICAgICBvcmdhbml6YXRpb25OYW1lUGF0dGVyblxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlJZHMoaWRzOiBudW1iZXJbXSk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLm9yZ2FuaXphdGlvbnMoaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnNCeUlkcyhbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeU5hbWVzKG5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLm9yZ2FuaXphdGlvbnModW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uc0J5TmFtZXMoW25hbWVdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5TmFtZVBhdHRlcm4oXG4gICAgbmFtZVBhdHRlcm46IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnModW5kZWZpbmVkLCB1bmRlZmluZWQsIG5hbWVQYXR0ZXJuKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlT3JnYW5pemF0aW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnNCeVVzZXJzKFtjVS5pZF0pO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIgPSBDdXJyZW50VXNlci5nZXRTeXNBZG1pbih0aGlzKSxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBjaGVja05hbWVSZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShuYW1lKTtcbiAgICBpZiAoY2hlY2tOYW1lUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05BTUVfVEFLRU5cIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAvLyBXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EIGlzIHRoZSBkZXNpcmVkIHJlc3VsdFxuICAgIH0gZWxzZSBpZiAoY2hlY2tOYW1lUmVzdWx0LndiQ29kZSAhPSBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIikge1xuICAgICAgcmV0dXJuIGNoZWNrTmFtZVJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgY3JlYXRlT3JnUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlT3JnYW5pemF0aW9uKG5hbWUsIGxhYmVsKTtcbiAgICBpZiAoIWNyZWF0ZU9yZ1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gY3JlYXRlT3JnUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgbmFtZSxcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICAgIFtjVS5pZF1cbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGNyZWF0ZU9yZ1Jlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZU9yZ2FuaXphdGlvbihuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMobmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl91c2VyXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCIsXG4gICAgXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFlcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVPcmdhbml6YXRpb24obmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpYCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb24gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uVXNlcnMoXG4gICAgbmFtZT86IHN0cmluZyxcbiAgICBpZD86IG51bWJlcixcbiAgICByb2xlcz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBpZiAobmFtZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUobmFtZSk7XG4gICAgfSBlbHNlIGlmIChpZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeUlkKGlkKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGlmIChyb2xlcyAmJiAhUm9sZS5hcmVSb2xlcyhyb2xlcykpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwib3JnYW5pemF0aW9uVXNlcnM6IHJvbGVzIGNvbnRhaW5zIG9uZSBvciBtb3JlIHVucmVjb2duaXplZCBzdHJpbmdzXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwub3JnYW5pemF0aW9uVXNlcnMobmFtZSwgaWQsIHJvbGVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHJvbGU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoJHtvcmdhbml6YXRpb25OYW1lfSwke3JvbGV9LCR7dXNlcklkc30sJHt1c2VyRW1haWxzfSlgXG4gICAgKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShvcmdhbml6YXRpb25OYW1lKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgdXNlcklkc0ZvdW5kOiBudW1iZXJbXSA9IFtdO1xuICAgIGxldCB1c2Vyc1JlcXVlc3RlZDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICB1c2Vyc1JlcXVlc3RlZCA9IHVzZXJJZHM7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlJZHModXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICB1c2Vyc1JlcXVlc3RlZCA9IHVzZXJFbWFpbHM7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHModXNlckVtYWlscyk7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MgfHwgIXJlc3VsdC5wYXlsb2FkKSByZXR1cm4gcmVzdWx0O1xuICAgIHVzZXJJZHNGb3VuZCA9IHJlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIGlmICh1c2Vyc1JlcXVlc3RlZC5sZW5ndGggIT0gdXNlcklkc0ZvdW5kLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgdmFsdWVzOiBbXG4gICAgICAgICAgYFJlcXVlc3RlZCAke3VzZXJzUmVxdWVzdGVkLmxlbmd0aH06ICR7dXNlcnNSZXF1ZXN0ZWQuam9pbihcIixcIil9YCxcbiAgICAgICAgICBgRm91bmQgJHt1c2VySWRzRm91bmQubGVuZ3RofTogJHt1c2VySWRzRm91bmQuam9pbihcIixcIil9YCxcbiAgICAgICAgXSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICB1c2VySWRzRm91bmQsXG4gICAgICByb2xlLFxuICAgICAgXCJvcmdhbml6YXRpb25cIixcbiAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VySWRzVG9CZVJlbW92ZWQ6IG51bWJlcltdID0gW107XG4gICAgaWYgKHVzZXJJZHMpIHVzZXJJZHNUb0JlUmVtb3ZlZCA9IHVzZXJJZHM7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB1c2VySWRzVG9CZVJlbW92ZWQgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gY2hlY2sgbm90IGFsbCB0aGUgYWRtaW5zIHdpbGwgYmUgcmVtb3ZlZFxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMob3JnYW5pemF0aW9uTmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBhbGxBZG1pbklkcyA9IHJlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuXG4gICAgaWYgKFxuICAgICAgYWxsQWRtaW5JZHMuZXZlcnkoKGVsZW06IG51bWJlcikgPT4gdXNlcklkc1RvQmVSZW1vdmVkLmluY2x1ZGVzKGVsZW0pKVxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShvcmdhbml6YXRpb25OYW1lKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIHVzZXJJZHNUb0JlUmVtb3ZlZCxcbiAgICAgIFwib3JnYW5pemF0aW9uXCIsXG4gICAgICBvcmdhbml6YXRpb25SZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBzY2hlbWFJZHM/OiBudW1iZXJbXSxcbiAgICBzY2hlbWFOYW1lcz86IHN0cmluZ1tdLFxuICAgIHNjaGVtYU5hbWVQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXMoXG4gICAgICBzY2hlbWFJZHMsXG4gICAgICBzY2hlbWFOYW1lcyxcbiAgICAgIHNjaGVtYU5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeUlkcyhpZHM6IG51bWJlcltdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyhpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5SWQoaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5SWRzKFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1NDSEVNQV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5TmFtZXMobmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyh1bmRlZmluZWQsIG5hbWVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlOYW1lcyhbbmFtZV0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlOYW1lUGF0dGVybihcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZVBhdHRlcm4pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICB1c2VySWQ/OiBudW1iZXIsXG4gICAgdXNlckVtYWlsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlVc2VyT3duZXIodXNlcklkLCB1c2VyRW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgIG9yZ2FuaXphdGlvbklkPzogbnVtYmVyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgICAgb3JnYW5pemF0aW9uSWQsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4odXNlcklkLCB1c2VyRW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVTY2hlbWFzKGNVOiBDdXJyZW50VXNlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzQnlVc2VycyhbY1UuaWRdKTtcbiAgfVxuXG4gIC8vIElmIG9yZ2FuaXphdGlvbk93bmVyIG9yZ2FuaXphdGlvbiBhZG1pbnMgYXJlIGltcGxpY2l0bHkgZ3JhbnRlZCBzY2hlbWEgYWRtaW4gcm9sZXNcbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIgPSBDdXJyZW50VXNlci5nZXRTeXNBZG1pbih0aGlzKSxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZyxcbiAgICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyLFxuICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgY3JlYXRlU2NoZW1hKCR7Y1UuaWR9LCR7bmFtZX0sJHtsYWJlbH0sJHtvcmdhbml6YXRpb25Pd25lcklkfSwke29yZ2FuaXphdGlvbk93bmVyTmFtZX0pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VyT3duZXJJZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIC8vIHJ1biBjaGVja3MgZm9yIG9yZ2FuaXphdGlvbiBvd25lclxuICAgIGlmIChvcmdhbml6YXRpb25Pd25lcklkIHx8IG9yZ2FuaXphdGlvbk93bmVyTmFtZSkge1xuICAgICAgaWYgKCFvcmdhbml6YXRpb25Pd25lcklkICYmIG9yZ2FuaXphdGlvbk93bmVyTmFtZSkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShvcmdhbml6YXRpb25Pd25lck5hbWUpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIGNVLmlzTm90U3lzQWRtaW4oKSAmJlxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkICYmXG4gICAgICAgIGNVLmlzTm90SW5Pcmdhbml6YXRpb24ob3JnYW5pemF0aW9uT3duZXJJZClcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfSU5fT1JHXCIsXG4gICAgICAgICAgdmFsdWVzOiBbY1UudG9TdHJpbmcoKSwgb3JnYW5pemF0aW9uT3duZXJJZC50b1N0cmluZygpXSxcbiAgICAgICAgfSkgYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdXNlck93bmVySWQgPSBjVS5pZDtcbiAgICB9XG4gICAgLy8gQ2hlY2sgbmFtZVxuICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJwZ19cIikgfHwgU2NoZW1hLlNZU19TQ0hFTUFfTkFNRVMuaW5jbHVkZXMobmFtZSkpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfQkFEX1NDSEVNQV9OQU1FXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlU2NoZW1hKFxuICAgICAgbmFtZSxcbiAgICAgIGxhYmVsLFxuICAgICAgb3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgIHVzZXJPd25lcklkXG4gICAgKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGlmIChvcmdhbml6YXRpb25Pd25lcklkKSB7XG4gICAgICAvLyBJZiBvd25lciBpcyBhbiBvcmdhbml6YXRpb24gYW5kIGN1cnJlbnQgdXNlciBpcyBub3QgYW4gYWRtaW4gb2YgdGhlIG9yZ2FuaXphdGlvbixcbiAgICAgIC8vIGFkZCB0aGUgdXNlciBhcyBhIHNjaGVtYSBhZG1pbiBzbyB0aGV5IGRvbnQgbG9zZSBhY2Nlc3NcbiAgICAgIGlmIChcbiAgICAgICAgY1UuaXNOb3RTeXNBZG1pbigpICYmXG4gICAgICAgIGNVLmlzTm90KFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIiwgb3JnYW5pemF0aW9uT3duZXJJZClcbiAgICAgICkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICAgICAgW2NVLmlkXSxcbiAgICAgICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIC8vIEV2ZXJ5IG9yZ2FuaXphdGlvbiBhZG1pbiBpcyBpbXBsaWNpdGx5IGFsc28gYSBzY2hlbWEgYWRtaW5cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICAgICAgb3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgICAgUm9sZS5PUkdBTklaQVRJT05fVE9fU0NIRU1BX1JPTEVfTUFQLFxuICAgICAgICBbc2NoZW1hUmVzdWx0LnBheWxvYWQuaWRdXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBJZiBvd25lciBpcyBhIHVzZXIsIGFkZCB0aGVtIHRvIHNjaGVtYV91c2VycyB0byBzYXZlIHNldHRpbmdzXG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICAgIFtjVS5pZF0sXG4gICAgICAgIFwic2NoZW1hX293bmVyXCIsXG4gICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlU2NoZW1hKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGByZW1vdmVPckRlbGV0ZVNjaGVtYSgke3NjaGVtYU5hbWV9LCR7ZGVsfSlgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVUYWJsZShzY2hlbWFOYW1lLCB0YWJsZS5uYW1lLCBkZWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucmVtb3ZlQWxsVXNlcnNGcm9tU2NoZW1hKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlU2NoZW1hKHNjaGVtYU5hbWUsIGRlbCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHModXNlckVtYWlscyk7XG4gICAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICAgIHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hVXNlcnMoc2NoZW1hTmFtZSwgdXNlcklkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0U2NoZW1hVXNlcnNSb2xlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXSxcbiAgICByb2xlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBpZiAodXNlcnNSZXN1bHQucGF5bG9hZC5sZW5ndGggIT0gdXNlckVtYWlscy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogdXNlckVtYWlscy5maWx0ZXIoXG4gICAgICAgICAgKHg6IHN0cmluZykgPT4gIXVzZXJzUmVzdWx0LnBheWxvYWQuaW5jbHVkZXMoeClcbiAgICAgICAgKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUodXNlcklkcywgcm9sZSwgXCJzY2hlbWFcIiwgc2NoZW1hUmVzdWx0LnBheWxvYWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVNjaGVtYVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGlmIChcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLnVzZXJfb3duZXJfaWQgJiZcbiAgICAgIHVzZXJJZHMuaW5jbHVkZXMoc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZClcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX1VTRVJfT1dORVJcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIHVzZXJJZHMsXG4gICAgICBcInNjaGVtYVwiLFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICAgICAgaWYgKCFjb2x1bW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjb2x1bW5zUmVzdWx0O1xuICAgICAgICB0YWJsZS5jb2x1bW5zID0gY29sdW1uc1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZUxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBhZGRPckNyZWF0ZVRhYmxlKCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7dGFibGVMYWJlbH0sJHtjcmVhdGV9KWBcbiAgICApO1xuICAgIGlmICghY3JlYXRlKSBjcmVhdGUgPSBmYWxzZTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgdGFibGVMYWJlbCxcbiAgICAgIGNyZWF0ZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgdGFibGVSZXN1bHQucGF5bG9hZC5zY2hlbWFOYW1lID0gc2NoZW1hTmFtZTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIC8vIDEuIHJlbW92ZS9kZWxldGUgY29sdW1uc1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgZGVsLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyAzLiByZW1vdmUgdXNlciBzZXR0aW5nc1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFRhYmxlVXNlcnModGFibGVSZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCwgdHJ1ZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyA0LiByZW1vdmUvZGVsZXRlIHRoZSB0YWJsZVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlcyhzY2hlbWFOYW1lLCBmYWxzZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdUYWJsZU5hbWVzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXhpc3RpbmdUYWJsZU5hbWVzLmluY2x1ZGVzKG5ld1RhYmxlTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9UQUJMRV9OQU1FX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVwZGF0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIG5ld1RhYmxlTmFtZSxcbiAgICAgIG5ld1RhYmxlTGFiZWxcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRBbGxFeGlzdGluZ1RhYmxlcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRpc2NvdmVyVGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgdGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHRhYmxlTmFtZXMpIHtcbiAgICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHYudGl0bGVDYXNlKHRhYmxlTmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIiBcIikpLFxuICAgICAgICBmYWxzZVxuICAgICAgKTtcbiAgICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJDb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgY29sdW1ucyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICAgIHYudGl0bGVDYXNlKGNvbHVtbi5uYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiIFwiKSksXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHJlbW92ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIFwiJVwiLFxuICAgICAgXCIlXCIsXG4gICAgICBcIkFMTFwiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHJlbGF0aW9uc2hpcHM6IENvbnN0cmFpbnRJZFtdID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgaWYgKHJlbGF0aW9uc2hpcHMubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChjb25zdCByZWxhdGlvbnNoaXAgb2YgcmVsYXRpb25zaGlwcykge1xuICAgICAgICBpZiAocmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZSAmJiByZWxhdGlvbnNoaXAucmVsQ29sdW1uTmFtZSkge1xuICAgICAgICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgICAgICAgaWYgKHJlbW92ZSkge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC50YWJsZU5hbWUsXG4gICAgICAgICAgICAgIFtyZWxhdGlvbnNoaXAuY29sdW1uTmFtZV0sXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAudGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLmNvbHVtbk5hbWVdLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWVdXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgICAgXCJhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogQ29uc3RyYWludElkIG11c3QgaGF2ZSByZWxUYWJsZU5hbWUgYW5kIHJlbENvbHVtbk5hbWVcIixcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBhZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgLy8gZG9udCBhZGQgcGVybWlzc2lvbnMgZm9yIHRhYmxlcyB3aXRoIG5vIGNvbHVtbnNcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICk7XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlIG9mIFJvbGUuaGFzdXJhVGFibGVQZXJtaXNzaW9uQ2hlY2tzQW5kVHlwZXMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlLnBlcm1pc3Npb25DaGVjayxcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrQW5kVHlwZS5wZXJtaXNzaW9uVHlwZSxcbiAgICAgICAgXCJ3YnVzZXJcIixcbiAgICAgICAgY29sdW1uTmFtZXNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgLy8gSWYgdGhpcyB0YWJsZSBubyBsb25nZXIgaGFzIGFueSBjb2x1bW5zLCB0aGVyZSB3aWxsIGJlIG5vIHBlcm1pc3Npb25zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyh0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcGF5bG9hZDogdHJ1ZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcGVybWlzc2lvbktleUFuZFR5cGUgb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kVHlwZXMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5kZWxldGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uS2V5QW5kVHlwZS50eXBlLFxuICAgICAgICBcIndidXNlclwiXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFBhc3MgZW1wdHkgY29sdW1uTmFtZXNbXSB0byBjbGVhclxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0NvbnN0cmFpbnROYW1lcyA9IE9iamVjdC52YWx1ZXMocmVzdWx0LnBheWxvYWQpO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIG11bHRpcGxlIGNvdWxtbiBwcmltYXJ5IGtleXMgd2lsbCBhbGwgaGF2ZSBzYW1lIGNvbnN0cmFpbnQgbmFtZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGV4aXN0aW5nQ29uc3RyYWludE5hbWVzWzBdIGFzIHN0cmluZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX1BLX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVQcmltYXJ5S2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBjcmVhdGU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiQ1JFQVRFXCI7XG4gICAgaWYgKCFjcmVhdGUpIG9wZXJhdGlvbiA9IFwiQUREXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiREVMRVRFXCI7XG4gICAgaWYgKCFkZWwpIG9wZXJhdGlvbiA9IFwiUkVNT1ZFXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIFtdLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIG9wZXJhdGlvbiA9IFwiQUREfENSRUFURXxSRU1PVkV8REVMRVRFXCJcbiAgcHVibGljIGFzeW5jIHNldEZvcmVpZ25LZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzWzBdLFxuICAgICAgXCJGT1JFSUdOX0tFWVNcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0ZvcmVpZ25LZXlzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgZm9yIChjb25zdCBjb25zdHJhaW50SWQgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29uc3RyYWludElkLmNvbHVtbk5hbWVdID1cbiAgICAgICAgY29uc3RyYWludElkLmNvbnN0cmFpbnROYW1lO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nRm9yZWlnbktleXMpLmluY2x1ZGVzKGNvbHVtbk5hbWUpKSB7XG4gICAgICAgIGlmIChvcGVyYXRpb24gPT0gXCJSRU1PVkVcIiB8fCBvcGVyYXRpb24gPT0gXCJERUxFVEVcIikge1xuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5kcm9wUmVsYXRpb25zaGlwcyhcbiAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICBwYXJlbnRUYWJsZU5hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiBvcGVyYXRpb24gPT0gXCJERUxFVEVcIikge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlQ29uc3RyYWludChcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgICAgICBleGlzdGluZ0ZvcmVpZ25LZXlzW2NvbHVtbk5hbWVdIGFzIHN0cmluZ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSBlbHNlIGlmIChvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgd2JDb2RlOiBcIldCX0ZLX0VYSVNUU1wiLFxuICAgICAgICAgICAgdmFsdWVzOiBbY29sdW1uTmFtZV0sXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAob3BlcmF0aW9uID09IFwiQUREXCIgfHwgb3BlcmF0aW9uID09IFwiQ1JFQVRFXCIpIHtcbiAgICAgIGlmIChvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgICBwYXJlbnRDb2x1bW5OYW1lc1xuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcChcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lc1swXSwgLy8gYXV0aG9yX2lkXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSAvLyBhdXRob3JzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVBcnJheVJlbGF0aW9uc2hpcChcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICAgIHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgY29sdW1uTmFtZXMgLy8gYXV0aG9yX2lkXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlOiBUYWJsZSk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGB0cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudHJhY2tUYWJsZSh0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKHRhYmxlKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGB1bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlRGVmYXVsdFRhYmxlUGVybWlzc2lvbnModGFibGUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZSh0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGUgVXNlcnM9PT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VycyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCB1c2VySWRzID0gdW5kZWZpbmVkO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgICAgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC50YWJsZVVzZXJzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlcklkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICB0YWJsZS5zY2hlbWFJZCxcbiAgICAgIFJvbGUuU0NIRU1BX1RPX1RBQkxFX1JPTEVfTUFQLFxuICAgICAgW3RhYmxlLmlkXVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IFtzdHJpbmddLFxuICAgIHJvbGU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBpZiAodXNlcnNSZXN1bHQucGF5bG9hZC5sZW5ndGggIT0gdXNlckVtYWlscy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogdXNlckVtYWlscy5maWx0ZXIoXG4gICAgICAgICAgKHg6IHN0cmluZykgPT4gIXVzZXJzUmVzdWx0LnBheWxvYWQuaW5jbHVkZXMoeClcbiAgICAgICAgKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUodXNlcklkcywgcm9sZSwgXCJ0YWJsZVwiLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgfVxuXG4gIC8vIG5vdCB1c2VkIHlldFxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlVXNlcnNGcm9tVGFibGUoXG4gICAgdXNlckVtYWlsczogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIC8vIFRCRCBkbyBhbnkgY2hlY2tzIGFnYWluc3Qgc2NoZW1hXG4gICAgLy8gY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgLy8gLy8gY2hlY2sgbm90IGFsbCB0aGUgYWRtaW5zIHdpbGwgYmUgcmVtb3ZlZFxuICAgIC8vIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMob3JnYW5pemF0aW9uTmFtZSwgW1xuICAgIC8vICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIC8vIF0pO1xuICAgIC8vIGlmICghYWRtaW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBhZG1pbnNSZXN1bHQ7XG4gICAgLy8gY29uc3QgYWxsQWRtaW5JZHMgPSBhZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgLy8gICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICAvLyApO1xuICAgIC8vIGlmIChhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzLmluY2x1ZGVzKGVsZW0pKSkge1xuICAgIC8vICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgLy8gICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TXCIsXG4gICAgLy8gICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIC8vIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVJvbGUoXG4gICAgICB1c2Vyc1Jlc3VsdC5wYXlsb2FkLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbDogc3RyaW5nLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICB1c2VyUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5wcmltYXJ5S2V5cyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBwS0NvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKHBLQ29sc0NvbnN0cmFpbnRzKTtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgY29sdW1uLmlzUHJpbWFyeUtleSA9IHBLQ29sdW1uTmFtZXMuaW5jbHVkZXMoY29sdW1uLm5hbWUpO1xuICAgICAgY29uc3QgZm9yZWlnbktleXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgXCJGT1JFSUdOX0tFWVNcIlxuICAgICAgKTtcbiAgICAgIGlmICghZm9yZWlnbktleXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbHVtbi5mb3JlaWduS2V5cyA9IGZvcmVpZ25LZXlzUmVzdWx0LnBheWxvYWQ7XG4gICAgICBjb25zdCByZWZlcmVuY2VzUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIFwiUkVGRVJFTkNFU1wiXG4gICAgICApO1xuICAgICAgaWYgKCFyZWZlcmVuY2VzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb2x1bW4ucmVmZXJlbmNlZEJ5ID0gcmVmZXJlbmNlc1Jlc3VsdC5wYXlsb2FkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU/OiBib29sZWFuLFxuICAgIGNvbHVtblR5cGU/OiBzdHJpbmcsXG4gICAgc2tpcFRyYWNraW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBhZGRPckNyZWF0ZUNvbHVtbigke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWV9LCR7Y29sdW1uTGFiZWx9LCR7Y3JlYXRlfSwke2NvbHVtblR5cGV9LCR7c2tpcFRyYWNraW5nfSlgXG4gICAgKTtcbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmICghc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBjb2x1bW5MYWJlbCxcbiAgICAgIGNyZWF0ZSxcbiAgICAgIGNvbHVtblR5cGVcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiAhc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBNdXN0IGVudGVyIGFuZCBleGl0IHdpdGggdHJhY2tlZCB0YWJsZSwgcmVnYXJkbGVzcyBvZiBpZiB0aGVyZSBhcmUgY29sdW1uc1xuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBkZWw/OiBib29sZWFuLFxuICAgIHNraXBUcmFja2luZz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJlbW92ZU9yRGVsZXRlQ29sdW1uKCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZX0sJHtkZWx9KWBcbiAgICApO1xuICAgIGlmICghZGVsKSBkZWwgPSBmYWxzZTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIGRlbFxuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmICFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy8gVEJEOiBpZiB0aGlzIGlzIGEgZmtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBleGlzdGluZ0NvbHVtbk5hbWVzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXhpc3RpbmdDb2x1bW5OYW1lcy5pbmNsdWRlcyhuZXdDb2x1bW5OYW1lKSkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX0NPTFVNTl9OQU1FX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld1R5cGUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICBuZXdUeXBlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld1R5cGUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuLyoqXG4gKiA9PT09PT09PT09IEVycm9yIEhhbmRsaW5nID09PT09PT09PT1cbiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gZXJyUmVzdWx0KHJlc3VsdD86IFNlcnZpY2VSZXN1bHQpOiBTZXJ2aWNlUmVzdWx0IHtcbiAgaWYgKCFyZXN1bHQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBcIlJlc3VsdCBoYXMgbm90IGJlZW4gYXNzaWduZWRcIixcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cbiAgaWYgKHJlc3VsdC5zdWNjZXNzID09IHRydWUpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiV2hpdGVicmlja0Nsb3VkIGVyclJlc3VsdDogcmVzdWx0IGlzIG5vdCBhbiBlcnJvciAoc3VjY2Vzcz09dHJ1ZSlcIixcbiAgICB9O1xuICB9IGVsc2UgaWYgKCEoXCJzdWNjZXNzXCIgaW4gcmVzdWx0KSkge1xuICAgIHJlc3VsdC5zdWNjZXNzID0gZmFsc2U7XG4gIH1cbiAgaWYgKCFyZXN1bHQubWVzc2FnZSAmJiByZXN1bHQud2JDb2RlKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSB1c2VyTWVzc2FnZXNbcmVzdWx0LndiQ29kZV1bMF07XG4gICAgaWYgKCFyZXN1bHQubWVzc2FnZSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYFdoaXRlYnJpY2tDbG91ZCBlcnJSZXN1bHQ6IENvdWxkIG5vdCBmaW5kIG1lc3NhZ2UgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICAgIH07XG4gICAgfVxuICB9XG4gIGlmIChyZXN1bHQudmFsdWVzKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSBgJHtyZXN1bHQubWVzc2FnZX0gVmFsdWVzOiAke3Jlc3VsdC52YWx1ZXMuam9pbihcIiwgXCIpfWA7XG4gICAgZGVsZXRlIHJlc3VsdC52YWx1ZXM7XG4gIH1cbiAgaWYgKFxuICAgICFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlICYmXG4gICAgcmVzdWx0LndiQ29kZSAmJlxuICAgIE9iamVjdC5rZXlzKHVzZXJNZXNzYWdlcykuaW5jbHVkZXMocmVzdWx0LndiQ29kZSkgJiZcbiAgICB1c2VyTWVzc2FnZXNbcmVzdWx0LndiQ29kZV0ubGVuZ3RoID09IDJcbiAgKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IHVzZXJNZXNzYWdlc1tyZXN1bHQud2JDb2RlXVsxXTtcbiAgfSBlbHNlIGlmIChcbiAgICAhcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSAmJlxuICAgIHJlc3VsdC53YkNvZGUgJiZcbiAgICAhT2JqZWN0LmtleXModXNlck1lc3NhZ2VzKS5pbmNsdWRlcyhyZXN1bHQud2JDb2RlKVxuICApIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IGBXaGl0ZWJyaWNrQ2xvdWQgZXJyOiBDb3VsZCBub3QgZmluZCBhcG9sbG9FcnJvckNvZGUgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdC5hcG9sbG9FcnJvckNvZGUgPSBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcG9sbG9FcnIocmVzdWx0OiBTZXJ2aWNlUmVzdWx0KTogRXJyb3Ige1xuICByZXN1bHQgPSBlcnJSZXN1bHQocmVzdWx0KTtcbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV0dXJuIG5ldyBFcnJvcihcbiAgICAgIFwiV2hpdGVicmlja0Nsb3VkLmVycjogcmVzdWx0IGlzIG5vdCBhbiBlcnJvciAoc3VjY2Vzcz09dHJ1ZSlcIlxuICAgICk7XG4gIH1cbiAgY29uc3QgZGV0YWlsczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBpZiAoIXJlc3VsdC5tZXNzYWdlKSByZXN1bHQubWVzc2FnZSA9IFwiVW5rbm93biBlcnJvci5cIjtcbiAgaWYgKHJlc3VsdC5yZWZDb2RlKSBkZXRhaWxzLnJlZkNvZGUgPSByZXN1bHQucmVmQ29kZTtcbiAgaWYgKHJlc3VsdC53YkNvZGUpIGRldGFpbHMud2JDb2RlID0gcmVzdWx0LndiQ29kZTtcbiAgcmV0dXJuIG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSwgZGV0YWlscyk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXhpb3NcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtdG9vbHNcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtdHlwZS1qc29uXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJsb2Rhc2hcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInBnXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ0c2xvZ1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwidm9jYVwiKTs7IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL3doaXRlYnJpY2stY2xvdWQudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQWVBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBO0FBQ0E7QUFDQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOzs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7O0FBWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7O0FBV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFNQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7OztBQVdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBOEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7QUFhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQU1BOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQU1BOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTs7Ozs7Ozs7OztBQVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBaHFEQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNqQkE7QUFzQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNiQTtBQUVBO0FBR0E7QUFPQTtBQUhBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFLQTs7QUFFQTtBQVFBO0FBQ0E7QUFFQTtBQUVBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQXJKQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNMQTtBQVNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUE3QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFhQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBdENBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ1VBO0FBNkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBektBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUM3REE7QUFvQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUE3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDVEE7QUFhQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBckNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0RBO0FBV0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBaENBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0hBO0FBY0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUF2Q0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDREE7QUFXQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNoRkE7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFXQTtBQXNSQTtBQXBSQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBOztBQS9SQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUEwUkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDblRBO0FBQ0E7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUEyQkE7Ozs7Ozs7Ozs7QUFVQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNqR0E7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUErREE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzVKQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEwREE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzNIQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXlKQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2pZQTtBQVFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE4QkE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFTQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFtZ0RBO0FBamdEQTtBQUNBO0FBQ0E7QUFHQTs7QUFJQTtBQU1BO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUFBO0FBQ0E7QUFFQTtBQU1BO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQU1BO0FBQUE7QUFHQTtBQU1BO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFPQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFFQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBSUE7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU9BO0FBR0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFHQTtBQUVBO0FBRUE7QUFNQTtBQUFBO0FBQ0E7QUFFQTtBQUtBO0FBQUE7QUFFQTtBQU1BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUFBO0FBTUE7O0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQVFBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQVFBO0FBQUE7QUFHQTs7QUFRQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUtBO0FBQUE7QUFFQTs7QUFNQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUtBO0FBQ0E7QUFBQTtBQWdCQTtBQUlBO0FBQUE7QUFDQTtBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQU1BOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBU0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFPQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQXBnREE7QUEwZ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWpEQTtBQW1EQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBWkE7QUFDQTtBQUNBO0E7Ozs7Ozs7O0FDbG1EQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QSIsInNvdXJjZVJvb3QiOiIifQ==