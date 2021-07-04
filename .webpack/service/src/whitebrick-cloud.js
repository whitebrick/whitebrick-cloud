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
        implied_roles.name as user_role_implied_from,
        wb.organizations.name as organization_owner_name,
        user_owners.email as user_owner_email
        FROM wb.schemas
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.schema_users.implied_from_role_id=implied_roles.id
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
        schema_user_roles.name as user_role,
        schema_user_implied_roles.name as user_role_implied_from,
        FROM wb.schemas
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.roles schema_user_roles ON wb.schema_users.role_id=schema_user_roles.id
        LEFT JOIN wb.roles schema_user_implied_roles ON wb.schema_users.implied_from_role_id=schema_user_implied_roles.id
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
        wb.roles.name as role,
        implied_roles.name as role_implied_from
        FROM wb.table_users
        JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.table_users.implied_from_role_id=implied_roles.id
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
            if (headersLowerCase["x-test-user-email"]) {
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
        if (data.user_role_implied_from) {
            schema.userRoleImpliedFrom = data.user_role_implied_from;
        }
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
        if (data.implied_from_role_id) {
            schemaUser.impliedFromRoleId = data.implied_from_role_id;
        }
        schemaUser.settings = data.settings;
        schemaUser.createdAt = data.created_at;
        schemaUser.updatedAt = data.updated_at;
        if (data.schema_name)
            schemaUser.schemaName = data.schema_name;
        if (data.user_email)
            schemaUser.userEmail = data.user_email;
        if (data.role)
            schemaUser.role = data.role;
        if (data.role_implied_from) {
            schemaUser.roleImpliedFrom = data.role_implied_from;
        }
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
        if (data.implied_from_role_id) {
            tableUser.impliedFromroleId = data.implied_from_role_id;
        }
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
        if (data.role_implied_from) {
            tableUser.roleImpliedFrom = data.role_implied_from;
        }
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
            if (type == "select") {
                payload.permission.allow_aggregations = true;
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
    userRoleImpliedFrom: String
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
    userRoleImpliedFrom: String
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
    roleImpliedFrom: String
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ3VycmVudFVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvblVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvb3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvc2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy91c2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvd2hpdGVicmljay1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2csIGVyclJlc3VsdCB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgVXNlcixcbiAgT3JnYW5pemF0aW9uLFxuICBPcmdhbml6YXRpb25Vc2VyLFxuICBTY2hlbWEsXG4gIFNjaGVtYVVzZXIsXG4gIFRhYmxlLFxuICBUYWJsZVVzZXIsXG4gIENvbHVtbixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGZpcnN0IH0gZnJvbSBcInZvY2FcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IERCID09PT09PT09PVxuICAgKi9cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBgICAgIFsgJHtxdWVyeVBhcmFtcy5wYXJhbXMgPyBxdWVyeVBhcmFtcy5wYXJhbXMuam9pbihcIiwgXCIpIDogXCJcIn0gXWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XG4gICAgICBsb2cuZXJyb3IoSlNPTi5zdHJpbmdpZnkoZXJyb3IpKTtcbiAgICAgIHJlc3VsdHMucHVzaChcbiAgICAgICAgZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgIHJlZkNvZGU6IFwiUEdfXCIgKyBlcnJvci5jb2RlLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpXG4gICAgICApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8vIHVzZWQgZm9yIERETCBpZGVudGlmaWVycyAoZWcgQ1JFQVRFIFRBQkxFIHNhbml0aXplKHRhYmxlTmFtZSkpXG4gIHB1YmxpYyBzdGF0aWMgc2FuaXRpemUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvW15cXHclXSsvZywgXCJcIik7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVzSWRMb29rdXAoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgbmFtZUlkTG9va3VwOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLmlkLCB3Yi5yb2xlcy5uYW1lXG4gICAgICAgIEZST00gd2Iucm9sZXNcbiAgICAgICAgV0hFUkUgY3VzdG9tIElTIGZhbHNlXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgbmFtZUlkTG9va3VwW3Jvdy5uYW1lXSA9IHJvdy5pZDtcbiAgICB9XG4gICAgcmVzdWx0LnBheWxvYWQgPSBuYW1lSWRMb29rdXA7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlSWRzRnJvbU5hbWVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWRcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgICAgQU5EIG5hbWU9QU5ZKCQxKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3JvbGVOYW1lc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKChyb3c6IHsgaWQ6IG51bWJlciB9KSA9PiByb3cuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJST0xFX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFR5cGljYWxseSBzZXR0aW5nIGEgcm9sZSBkaXJlY3RseSBpcyBleHBsaWNpdCxcbiAgLy8gc28gYW55IGltcGxpZWRfZnJvbV9yb2xlX2lkIGlzIGNsZWFyZWQgdW5sZXNzIGtlZXBJbXBsaWVkRnJvbVxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXIsXG4gICAga2VlcEltcGxpZWRGcm9tPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByb2xlUmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlQnlOYW1lKHJvbGVOYW1lKTtcbiAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJvbGVSZXN1bHQ7XG4gICAgbGV0IHdiVGFibGU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHdiQ29sdW1uOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcIm9yZ2FuaXphdGlvbl9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnNjaGVtYV91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwic2NoZW1hX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi50YWJsZV91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwidGFibGVfaWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHBhcmFtczogRGF0ZVtdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgbGV0IHF1ZXJ5OiBzdHJpbmcgPSBgXG4gICAgICBJTlNFUlQgSU5UTyAke3diVGFibGV9IChyb2xlX2lkLCAgdXNlcl9pZCwgJHt3YkNvbHVtbn0sIHVwZGF0ZWRfYXQpXG4gICAgICBWQUxVRVNcbiAgICBgO1xuICAgIGZvciAoY29uc3QgdXNlcklkIG9mIHVzZXJJZHMpIHtcbiAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgKFxuICAgICAgICAgICR7cm9sZVJlc3VsdC5wYXlsb2FkLmlkfSxcbiAgICAgICAgICAke3VzZXJJZH0sXG4gICAgICAgICAgJHtvYmplY3RJZH0sXG4gICAgICAgICAgJCR7cGFyYW1zLmxlbmd0aCArIDF9XG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChkYXRlKTtcbiAgICAgIGlmIChwYXJhbXMubGVuZ3RoICE9IHVzZXJJZHMubGVuZ3RoKSBxdWVyeSArPSBcIiwgXCI7XG4gICAgfVxuICAgIHF1ZXJ5ICs9IGBcbiAgICAgIE9OIENPTkZMSUNUICh1c2VyX2lkLCAke3diQ29sdW1ufSlcbiAgICAgIERPIFVQREFURSBTRVRcbiAgICAgIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCxcbiAgICAgIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgIGA7XG4gICAgaWYgKCFrZWVwSW1wbGllZEZyb20pIHF1ZXJ5ICs9IFwiLCBpbXBsaWVkX2Zyb21fcm9sZV9pZD1OVUxMXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVJvbGUoXG4gICAgdXNlcklkczogbnVtYmVyW10sXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWQ/OiBudW1iZXIsXG4gICAgcGFyZW50T2JqZWN0SWQ/OiBudW1iZXIsXG4gICAgaW1wbGllZEZyb21Sb2xlcz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IG51bWJlcltdIHwgdW5kZWZpbmVkKVtdID0gW3VzZXJJZHNdO1xuICAgIGxldCB3YlRhYmxlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCB3YldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnNcIjtcbiAgICAgICAgd2JXaGVyZSA9IFwiQU5EIG9yZ2FuaXphdGlvbl9pZD0kMlwiO1xuICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iuc2NoZW1hX3VzZXJzXCI7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBcIkFORCBzY2hlbWFfaWQ9JDJcIjtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gYFxuICAgICAgICAgICAgQU5EIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX293bmVyX2lkPSQyXG4gICAgICAgICAgICApXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXMucHVzaChwYXJlbnRPYmplY3RJZCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnRhYmxlX3VzZXJzXCI7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBcIkFORCB0YWJsZV9pZD0kMlwiO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgfSBlbHNlIGlmIChwYXJlbnRPYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBgXG4gICAgICAgICAgICBBTkQgdGFibGVfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICAgICAgV0hFUkUgc2NoZW1hX2lkPSQyXG4gICAgICAgICAgICApXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXMucHVzaChwYXJlbnRPYmplY3RJZCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBpZiAoaW1wbGllZEZyb21Sb2xlcykge1xuICAgICAgd2JXaGVyZSArPSBgQU5EIGltcGxpZWRfZnJvbV9yb2xlX2lkPUFOWSgkMylgO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlSWRzRnJvbU5hbWVzKGltcGxpZWRGcm9tUm9sZXMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gJHt3YlRhYmxlfVxuICAgICAgICBXSEVSRSB1c2VyX2lkPUFOWSgkMSlcbiAgICAgICAgJHt3YldoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhcbiAgICB0YWJsZUlkOiBudW1iZXIsXG4gICAgZGVsZXRlT25seT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3Blcm1pc3Npb25zXG4gICAgICAgICAgV0hFUkUgdGFibGVfaWQ9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbdGFibGVJZF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCFkZWxldGVPbmx5KSB7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlUm9sZSBvZiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykpIHtcbiAgICAgICAgZm9yIChjb25zdCBwZXJtaXNzaW9uUHJlZml4IG9mIFJvbGUuU1lTUk9MRVNfVEFCTEVTW3RhYmxlUm9sZV1cbiAgICAgICAgICAucGVybWlzc2lvblByZWZpeGVzKSB7XG4gICAgICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV9wZXJtaXNzaW9ucyh0YWJsZV9wZXJtaXNzaW9uX2tleSwgdXNlcl9pZCwgdGFibGVfaWQpXG4gICAgICAgICAgICAgIFNFTEVDVCAnJHtSb2xlLnRhYmxlUGVybWlzc2lvbktleShcbiAgICAgICAgICAgICAgICBwZXJtaXNzaW9uUHJlZml4LFxuICAgICAgICAgICAgICAgIHRhYmxlSWRcbiAgICAgICAgICAgICAgKX0nLCB1c2VyX2lkLCAke3RhYmxlSWR9XG4gICAgICAgICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQxIEFORCB3Yi5yb2xlcy5uYW1lPSQyXG4gICAgICAgICAgICBgLFxuICAgICAgICAgICAgcGFyYW1zOiBbdGFibGVJZCwgdGFibGVSb2xlXSxcbiAgICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFVzZXJzID09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcklkRnJvbUF1dGhJZChhdXRoSWQ6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy5pZFxuICAgICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGF1dGhfaWQ9JDFcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2F1dGhJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpZiAocmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFthdXRoSWRdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93c1swXS5pZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VycyhcbiAgICBpZHM/OiBudW1iZXJbXSxcbiAgICBlbWFpbHM/OiBzdHJpbmdbXSxcbiAgICBlbWFpbFBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdIHwgc3RyaW5nKVtdID0gW107XG4gICAgaWYgKGlkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkcyk7XG4gICAgfSBlbHNlIGlmIChlbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSBlbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbHMpO1xuICAgIH0gZWxzZSBpZiAoZW1haWxQYXR0ZXJuKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgZW1haWwgTElLRSAkMVwiO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWxQYXR0ZXJuKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAke3NxbFdoZXJlfVxuICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMpIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbD86IHN0cmluZyxcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmcsXG4gICAgbGFzdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFlbWFpbCAmJiAhZmlyc3ROYW1lICYmICFsYXN0TmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IFwiZGFsLnVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IG51bWJlciB8IHN0cmluZylbXSA9IFtkYXRlLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCkge1xuICAgICAgcXVlcnkgKz0gYGVtYWlsPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWwpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBpZiAoZmlyc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgZmlyc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGZpcnN0TmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChsYXN0TmFtZSkge1xuICAgICAgcXVlcnkgKz0gYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGxhc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgcXVlcnkgKz0gXCJ1cGRhdGVkX2F0PSQxIFdIRVJFIGlkPSQyIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGVtYWlsIGxpa2UgJ3Rlc3RfJXRlc3Qud2hpdGVicmljay5jb20nXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIG9yZ2FuaXphdGlvbklkcz86IG51bWJlcltdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKlxuICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgYDtcbiAgICBpZiAob3JnYW5pemF0aW9uSWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMuaWQ9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkcyk7XG4gICAgfSBlbHNlIGlmIChvcmdhbml6YXRpb25OYW1lcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5pZD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyB1c2VyX3JvbGUsXG4gICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5vcmdhbml6YXRpb25zLmlkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLm9yZ2FuaXphdGlvbnMoXG4gICAgICAgICAgbmFtZSwgbGFiZWxcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyKVxuICAgICAgICBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IHN0cmluZylbXSA9IFtuZXcgRGF0ZSgpXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi5vcmdhbml6YXRpb25zIFNFVCB1cGRhdGVkX2F0PSQxXCI7XG4gICAgaWYgKG5ld05hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld05hbWUpO1xuICAgICAgcXVlcnkgKz0gYCwgbmFtZT0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmIChuZXdMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TGFiZWwpO1xuICAgICAgcXVlcnkgKz0gYCwgbGFiZWw9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICBxdWVyeSArPSBgIFdIRVJFIG5hbWU9JCR7cGFyYW1zLmxlbmd0aH0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvLyBubyBwYXR0ZXJucyBhbGxvd2VkIGhlcmVcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKG5hbWUucmVwbGFjZShcIiVcIiwgXCJcIikpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRlbGV0ZU9yZ2FuaXphdGlvbnMoXCJ0ZXN0XyVcIik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9ucyhcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25faWQgSU4gKFxuICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgICApXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9uIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvblVzZXJzKFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZXM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBpZiAoaWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaChpZCk7XG4gICAgfSBlbHNlIGlmIChuYW1lKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICB9XG4gICAgaWYgKHJvbGVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIiBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChyb2xlcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMuKixcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX2VtYWlsLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVcbiAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvblVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWFzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXMoXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwZ1BhcmFtczogKHN0cmluZ1tdIHwgbnVtYmVyW10gfCBzdHJpbmcpW10gPSBbXG4gICAgICBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUyxcbiAgICBdO1xuICAgIGNvbnN0IHdiUGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxQZ1doZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXYldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMpIHtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hSWRzKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYU5hbWVzKSB7XG4gICAgICBzcWxQZ1doZXJlID0gXCJBTkQgc2NoZW1hX25hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGdQYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBuYW1lPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hTmFtZVBhdHRlcm4pIHtcbiAgICAgIHNxbFBnV2hlcmUgPSBcIkFORCBzY2hlbWFfbmFtZSBMSUtFICQyXCI7XG4gICAgICBwZ1BhcmFtcy5wdXNoKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIG5hbWUgTElLRSAkMVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhLipcbiAgICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YVxuICAgICAgICAgIFdIRVJFIHNjaGVtYV9uYW1lIE5PVCBMSUtFICdwZ18lJ1xuICAgICAgICAgIEFORCBzY2hlbWFfbmFtZSE9QU5ZKCQxKVxuICAgICAgICAgICR7c3FsUGdXaGVyZX1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBwZ1BhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICR7c3FsV2JXaGVyZX1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiB3YlBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2VzcyAmJiByZXN1bHRzWzFdLnN1Y2Nlc3MpIHtcbiAgICAgIGlmIChyZXN1bHRzWzBdLnBheWxvYWQucm93cy5sZW5ndGggIT0gcmVzdWx0c1sxXS5wYXlsb2FkLnJvd3MubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBcImRhbC5zY2hlbWFzOiB3Yi5zY2hlbWFzIG91dCBvZiBzeW5jIHdpdGggaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRzWzFdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1sxXS5wYXlsb2FkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5VXNlcnMoXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuaWQ9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlscyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgdXNlcl9yb2xlLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgdXNlcl9yb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lLFxuICAgICAgICB1c2VyX293bmVycy5lbWFpbCBhcyB1c2VyX293bmVyX2VtYWlsXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYV91c2VycyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi51c2VycyB1c2VyX293bmVycyBPTiB3Yi5zY2hlbWFzLnVzZXJfb3duZXJfaWQ9dXNlcl9vd25lcnMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5VXNlck93bmVyKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWwpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hcy4qLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX293bmVyX2VtYWlsLFxuICAgICAgICAnc2NoZW1hX293bmVyJyBhcyB1c2VyX3JvbGVcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hcy51c2VyX293bmVyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICBvcmdhbml6YXRpb25JZD86IG51bWJlcixcbiAgICBvcmdhbml6YXRpb25OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAob3JnYW5pemF0aW9uSWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25zLmlkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaChvcmdhbml6YXRpb25JZCk7XG4gICAgfSBlbHNlIGlmIChvcmdhbml6YXRpb25OYW1lKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaChvcmdhbml6YXRpb25OYW1lKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXJBZG1pbihcbiAgICB1c2VySWQ/OiBudW1iZXIsXG4gICAgdXNlckVtYWlsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnVzZXJzLmlkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWQpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlsKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnVzZXJzLmVtYWlsPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWwpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hcy4qLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25zLm5hbWUgYXMgb3JnYW5pemF0aW9uX293bmVyX25hbWVcbiAgICAgICAgc2NoZW1hX3VzZXJfcm9sZXMubmFtZSBhcyB1c2VyX3JvbGUsXG4gICAgICAgIHNjaGVtYV91c2VyX2ltcGxpZWRfcm9sZXMubmFtZSBhcyB1c2VyX3JvbGVfaW1wbGllZF9mcm9tLFxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iub3JnYW5pemF0aW9ucy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYV91c2VycyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD1zY2hlbWFfdXNlcl9yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9c2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5yb2xlcy5uYW1lPSdvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcidcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZyxcbiAgICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyLFxuICAgIHVzZXJPd25lcklkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgU0NIRU1BICR7REFMLnNhbml0aXplKG5hbWUpfWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnNjaGVtYXMoXG4gICAgICAgICAgICBuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uX293bmVyX2lkLCB1c2VyX293bmVyX2lkXG4gICAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQpIFJFVFVSTklORyAqXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25Pd25lcklkLCB1c2VyT3duZXJJZF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF0pO1xuICAgIGNvbnN0IGluc2VydFJlc3VsdDogU2VydmljZVJlc3VsdCA9IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgICBpZiAoaW5zZXJ0UmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGluc2VydFJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KGluc2VydFJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIGluc2VydFJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgZGVsOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgV0hFUkUgbmFtZT0kMVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYERST1AgU0NIRU1BIElGIEVYSVNUUyAke0RBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKX0gQ0FTQ0FERWAsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFVc2VycyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdKVtdID0gW3NjaGVtYU5hbWVdO1xuICAgIGxldCB3aGVyZVNxbCA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHdoZXJlU3FsID0gXCJBTkQgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuKixcbiAgICAgICAgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX2VtYWlsLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxXG4gICAgICAgICR7d2hlcmVTcWx9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IFNjaGVtYVVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVBbGxVc2Vyc0Zyb21TY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICBXSEVSRSBzY2hlbWFfaWQgSU4gKFxuICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnNjaGVtYXMgV0hFUkUgbmFtZT0kMVxuICAgICAgICApXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy4qXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyVGFibGVzKHNjaGVtYU5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzLnRhYmxlX25hbWVcbiAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzXG4gICAgICAgIFdIRVJFIHRhYmxlX3NjaGVtYT0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZC5yb3dzLm1hcChcbiAgICAgICAgKHJvdzogeyB0YWJsZV9uYW1lOiBzdHJpbmcgfSkgPT4gcm93LnRhYmxlX25hbWVcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyB0eXBlID0gZm9yZWlnbktleXN8cmVmZXJlbmNlc3xhbGxcbiAgcHVibGljIGFzeW5jIGZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZVBhdHRlcm46IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKHRhYmxlTmFtZVBhdHRlcm4pO1xuICAgIGNvbHVtbk5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWVQYXR0ZXJuKTtcbiAgICBsZXQgd2hlcmVTcWw6IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlIFwiRk9SRUlHTl9LRVlTXCI6XG4gICAgICAgIHdoZXJlU3FsID0gYFxuICAgICAgICAgIEFORCBmay50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIGZrLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJSRUZFUkVOQ0VTXCI6XG4gICAgICAgIHdoZXJlU3FsID0gYFxuICAgICAgICAgIEFORCByZWYudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCByZWYuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIkFMTFwiOlxuICAgICAgICB3aGVyZVNxbCA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICAtLSB1bmlxdWUgcmVmZXJlbmNlIGluZm9cbiAgICAgICAgcmVmLnRhYmxlX25hbWUgICAgICAgQVMgcmVmX3RhYmxlLFxuICAgICAgICByZWYuY29sdW1uX25hbWUgICAgICBBUyByZWZfY29sdW1uLFxuICAgICAgICByZWZkLmNvbnN0cmFpbnRfdHlwZSBBUyByZWZfdHlwZSwgLS0gZS5nLiBVTklRVUUgb3IgUFJJTUFSWSBLRVlcbiAgICAgICAgLS0gZm9yZWlnbiBrZXkgaW5mb1xuICAgICAgICBmay50YWJsZV9uYW1lICAgICAgICBBUyBma190YWJsZSxcbiAgICAgICAgZmsuY29sdW1uX25hbWUgICAgICAgQVMgZmtfY29sdW1uLFxuICAgICAgICBmay5jb25zdHJhaW50X25hbWUgICBBUyBma19uYW1lLFxuICAgICAgICBtYXAudXBkYXRlX3J1bGUgICAgICBBUyBma19vbl91cGRhdGUsXG4gICAgICAgIG1hcC5kZWxldGVfcnVsZSAgICAgIEFTIGZrX29uX2RlbGV0ZVxuICAgICAgICAtLSBsaXN0cyBmayBjb25zdHJhaW50cyBBTkQgbWFwcyB0aGVtIHRvIHBrIGNvbnN0cmFpbnRzXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnJlZmVyZW50aWFsX2NvbnN0cmFpbnRzIEFTIG1hcFxuICAgICAgICAtLSBqb2luIHVuaXF1ZSBjb25zdHJhaW50cyAoZS5nLiBQS3MgY29uc3RyYWludHMpIHRvIHJlZiBjb2x1bW5zIGluZm9cbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyByZWZcbiAgICAgICAgT04gIHJlZi5jb25zdHJhaW50X2NhdGFsb2cgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9uYW1lXG4gICAgICAgIC0tIG9wdGlvbmFsOiB0byBpbmNsdWRlIHJlZmVyZW5jZSBjb25zdHJhaW50IHR5cGVcbiAgICAgICAgTEVGVCBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyBBUyByZWZkXG4gICAgICAgIE9OICByZWZkLmNvbnN0cmFpbnRfY2F0YWxvZyA9IHJlZi5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9zY2hlbWEgPSByZWYuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9uYW1lID0gcmVmLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBqb2luIGZrIGNvbHVtbnMgdG8gdGhlIGNvcnJlY3QgcmVmIGNvbHVtbnMgdXNpbmcgb3JkaW5hbCBwb3NpdGlvbnNcbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyBma1xuICAgICAgICBPTiAgZmsuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLmNvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgZmsuY29uc3RyYWludF9zY2hlbWEgPSBtYXAuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC5jb25zdHJhaW50X25hbWVcbiAgICAgICAgQU5EIGZrLnBvc2l0aW9uX2luX3VuaXF1ZV9jb25zdHJhaW50ID0gcmVmLm9yZGluYWxfcG9zaXRpb24gLS1JTVBPUlRBTlQhXG4gICAgICAgIFdIRVJFIHJlZi50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgIEFORCBmay50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgICR7d2hlcmVTcWx9XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgY29uc3RyYWludHM6IENvbnN0cmFpbnRJZFtdID0gW107XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgY29uc3QgY29uc3RyYWludDogQ29uc3RyYWludElkID0ge1xuICAgICAgICBjb25zdHJhaW50TmFtZTogcm93LmZrX25hbWUsXG4gICAgICAgIHRhYmxlTmFtZTogcm93LmZrX3RhYmxlLFxuICAgICAgICBjb2x1bW5OYW1lOiByb3cuZmtfY29sdW1uLFxuICAgICAgICByZWxUYWJsZU5hbWU6IHJvdy5yZWZfdGFibGUsXG4gICAgICAgIHJlbENvbHVtbk5hbWU6IHJvdy5yZWZfY29sdW1uLFxuICAgICAgfTtcbiAgICAgIGNvbnN0cmFpbnRzLnB1c2goY29uc3RyYWludCk7XG4gICAgfVxuICAgIHJlc3VsdC5wYXlsb2FkID0gY29uc3RyYWludHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcmltYXJ5S2V5cyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgRElTVElOQ1QgYy5jb2x1bW5fbmFtZSwgdGMuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIHRjIFxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb25zdHJhaW50X2NvbHVtbl91c2FnZSBBUyBjY3VcbiAgICAgICAgVVNJTkcgKGNvbnN0cmFpbnRfc2NoZW1hLCBjb25zdHJhaW50X25hbWUpXG4gICAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgQVMgY1xuICAgICAgICBPTiBjLnRhYmxlX3NjaGVtYSA9IHRjLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCB0Yy50YWJsZV9uYW1lID0gYy50YWJsZV9uYW1lXG4gICAgICAgIEFORCBjY3UuY29sdW1uX25hbWUgPSBjLmNvbHVtbl9uYW1lXG4gICAgICAgIFdIRVJFIGNvbnN0cmFpbnRfdHlwZSA9ICdQUklNQVJZIEtFWSdcbiAgICAgICAgQU5EIGMudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9ICcke3RhYmxlTmFtZX0nXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgICAgcEtDb2xzQ29uc3RyYWludHNbcm93LmNvbHVtbl9uYW1lXSA9IHJvdy5jb25zdHJhaW50X25hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHBLQ29sc0NvbnN0cmFpbnRzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbnN0cmFpbnROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdHJhaW50TmFtZSA9IERBTC5zYW5pdGl6ZShjb25zdHJhaW50TmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUyAke2NvbnN0cmFpbnROYW1lfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgUFJJTUFSWSBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KTtcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuY3JlYXRlRm9yZWlnbktleSgke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgcGFyZW50VGFibGVOYW1lID0gREFMLnNhbml0aXplKHBhcmVudFRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBwYXJlbnRDb2x1bW5OYW1lIG9mIHBhcmVudENvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShwYXJlbnRDb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIEFERCBDT05TVFJBSU5UICR7dGFibGVOYW1lfV8ke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCJfXCIpfV9ma2V5XG4gICAgICAgIEZPUkVJR04gS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgUkVGRVJFTkNFUyAke3NjaGVtYU5hbWV9LiR7cGFyZW50VGFibGVOYW1lfVxuICAgICAgICAgICgke3Nhbml0aXplZFBhcmVudENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgT04gREVMRVRFIFNFVCBOVUxMXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKiwgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlVGFibGUgJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHt0YWJsZUxhYmVsfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZXMoc2NoZW1hX2lkLCBuYW1lLCBsYWJlbClcbiAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKSBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWRbMF0uaWQsIHRhYmxlTmFtZSwgdGFibGVMYWJlbF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIigpYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAoY3JlYXRlICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMSBBTkQgbmFtZT0kMlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZFswXS5pZCwgdGFibGVOYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIgQ0FTQ0FERWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi50YWJsZXMgU0VUXG4gICAgYDtcbiAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1RhYmxlTGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgVE8gJHtuZXdUYWJsZU5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXJbXSlbXSA9IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdO1xuICAgIGxldCB3aGVyZVNxbCA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHdoZXJlU3FsID0gXCJBTkQgd2IudGFibGVfdXNlcnMudXNlcl9pZD1BTlkoJDMpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLiosXG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudGFibGVzLm5hbWUgYXMgdGFibGVfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb21cbiAgICAgICAgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi50YWJsZV91c2Vycy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMlxuICAgICAgICAke3doZXJlU3FsfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZVVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICBvcmdhbml6YXRpb25JZDogbnVtYmVyLFxuICAgIHJvbGVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIGNsZWFyRXhpc3Rpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoJHtvcmdhbml6YXRpb25JZH0sIDxyb2xlTWFwPiwgJHtzY2hlbWFJZHN9LCAke3VzZXJJZHN9LCAke2NsZWFyRXhpc3Rpbmd9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVzSWRMb29rdXAoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGxldCB3aGVyZVNjaGVtYXNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVTY2hlbWFVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IG9uQ29uZmxpY3RTcWwgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMgJiYgc2NoZW1hSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlU2NoZW1hc1NxbCA9IGBBTkQgd2Iuc2NoZW1hcy5pZCBJTiAoJHtzY2hlbWFJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGlmICh1c2VySWRzICYmIHVzZXJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVTY2hlbWFVc2Vyc1NxbCA9IGBcbiAgICAgICAgQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkIElOICgke3VzZXJJZHMuam9pbihcIixcIil9KVxuICAgICAgYDtcbiAgICAgIHdoZXJlVXNlcnNTcWwgPSBgQU5EIHdiLnVzZXJzLmlkIElOICgke3VzZXJJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGNvbnN0IHJvbGVzSWRMb29rdXAgPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtdO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGlmIChjbGVhckV4aXN0aW5nKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgICBXSEVSRVxuICAgICAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9JDFcbiAgICAgICAgICAgICAgJHt3aGVyZVNjaGVtYXNTcWx9XG4gICAgICAgICAgICApXG4gICAgICAgICAgICAke3doZXJlU2NoZW1hVXNlcnNTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW29yZ2FuaXphdGlvbklkXSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVcGRhdGUgaW1wbGllZCByb2xlcyBvbmx5LCBsZWF2ZSBleHBsaWNpdCByb2xlcyBhbG9uZVxuICAgICAgb25Db25mbGljdFNxbCA9IGBcbiAgICAgICAgT04gQ09ORkxJQ1QgKHNjaGVtYV9pZCwgdXNlcl9pZClcbiAgICAgICAgRE8gVVBEQVRFIFNFVCByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQgSVMgTk9UIE5VTExcbiAgICAgIGA7XG4gICAgfVxuICAgIGZvciAoY29uc3Qgb3JnYW5pemF0aW9uUm9sZSBvZiBPYmplY3Qua2V5cyhyb2xlTWFwKSkge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hX3VzZXJzKHNjaGVtYV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgU0VMRUNUXG4gICAgICAgICAgd2Iuc2NoZW1hcy5pZCxcbiAgICAgICAgICB1c2VyX2lkLFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtyb2xlTWFwW29yZ2FuaXphdGlvblJvbGVdXX0sXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW29yZ2FuaXphdGlvblJvbGVdfSxcbiAgICAgICAgICAkMVxuICAgICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD0kMlxuICAgICAgICAgIEFORCB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD0kM1xuICAgICAgICAgICR7d2hlcmVTY2hlbWFzU3FsfVxuICAgICAgICAgICR7d2hlcmVVc2Vyc1NxbH1cbiAgICAgICAgICAke29uQ29uZmxpY3RTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW2RhdGUsIG9yZ2FuaXphdGlvbklkLCByb2xlc0lkTG9va3VwW29yZ2FuaXphdGlvblJvbGVdXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8vIGlmICF0YWJsZUlkcyBhbGwgdGFibGVzIGZvciBzY2hlbWFcbiAgLy8gaWYgIXVzZXJJZHMgYWxsIHNjaGVtYV91c2Vyc1xuICBwdWJsaWMgYXN5bmMgc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICByb2xlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCAvLyBlZyB7IHNjaGVtYV9vd25lcjogXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIgfVxuICAgIHRhYmxlSWRzPzogbnVtYmVyW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIGNsZWFyRXhpc3Rpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcygke3NjaGVtYUlkfSwgPHJvbGVNYXA+LCAke3RhYmxlSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nfSlgXG4gICAgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlc0lkTG9va3VwKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBsZXQgd2hlcmVUYWJsZXNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVUYWJsZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHRhYmxlSWRzICYmIHRhYmxlSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlVGFibGVzU3FsID0gYEFORCB3Yi50YWJsZXMuaWQgSU4gKCR7dGFibGVJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGlmICh1c2VySWRzICYmIHVzZXJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVUYWJsZVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2IudGFibGVfdXNlcnMudXNlcl9pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlcbiAgICAgIGA7XG4gICAgICB3aGVyZVVzZXJzU3FsID0gYEFORCB3Yi51c2Vycy5pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBjb25zdCByb2xlc0lkTG9va3VwID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcXVlcnlQYXJhbXM6IFF1ZXJ5UGFyYW1zW10gPSBbXTtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBpZiAoY2xlYXJFeGlzdGluZykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICBXSEVSRVxuICAgICAgICAgICAgd2IudGFibGVfdXNlcnMudGFibGVfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICAgICAgV0hFUkUgd2IudGFibGVzLnNjaGVtYV9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlVGFibGVzU3FsfVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgJHt3aGVyZVRhYmxlVXNlcnNTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3NjaGVtYUlkXSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVcGRhdGUgaW1wbGllZCByb2xlcyBvbmx5LCBsZWF2ZSBleHBsaWNpdCByb2xlcyBhbG9uZVxuICAgICAgb25Db25mbGljdFNxbCA9IGBcbiAgICAgICAgT04gQ09ORkxJQ1QgKHRhYmxlX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkIElTIE5PVCBOVUxMXG4gICAgICBgO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHNjaGVtYVJvbGUgb2YgT2JqZWN0LmtleXMocm9sZU1hcCkpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlX3VzZXJzKHRhYmxlX2lkLCB1c2VyX2lkLCByb2xlX2lkLCBpbXBsaWVkX2Zyb21fcm9sZV9pZCwgdXBkYXRlZF9hdClcbiAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICB3Yi50YWJsZXMuaWQsXG4gICAgICAgICAgdXNlcl9pZCxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbcm9sZU1hcFtzY2hlbWFSb2xlXV19LFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtzY2hlbWFSb2xlXX0sXG4gICAgICAgICAgJDFcbiAgICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnRhYmxlcy5zY2hlbWFfaWRcbiAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD0kMiBBTkQgd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAke3doZXJlVGFibGVzU3FsfVxuICAgICAgICAgICR7d2hlcmVVc2Vyc1NxbH1cbiAgICAgICAgICAke29uQ29uZmxpY3RTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW2RhdGUsIHNjaGVtYUlkLCByb2xlc0lkTG9va3VwW3NjaGVtYVJvbGVdXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVBbGxUYWJsZVVzZXJzKFxuICAgIHRhYmxlSWQ/OiBudW1iZXIsXG4gICAgc2NoZW1hSWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5V2hlcmUgPSBcIlwiO1xuICAgIGNvbnN0IHBhcmFtczogbnVtYmVyW10gPSBbXTtcbiAgICBpZiAodGFibGVJZCkge1xuICAgICAgcXVlcnlXaGVyZSA9IFwiV0hFUkUgdGFibGVfaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHRhYmxlSWQpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hSWQpIHtcbiAgICAgIHF1ZXJ5V2hlcmUgPSBgXG4gICAgICAgIFdIRVJFIHRhYmxlX2lkIElOIChcbiAgICAgICAgICBTRUxFQ1QgaWQgZnJvbSB3Yi50YWJsZXNcbiAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMuc2NoZW1hX2lkPSQxXG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFJZCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICR7cXVlcnlXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICB0YWJsZUlkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBVUERBVEUgd2IudGFibGVfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHRhYmxlX2lkPSQzXG4gICAgICAgIEFORCB1c2VyX2lkPSQ0XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2V0dGluZ3MsIG5ldyBEYXRlKCksIHRhYmxlSWQsIHVzZXJJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IENvbHVtbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY29sdW1uQnlTY2hlbWFUYWJsZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIkNPTFVNTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLmNvbHVtbnMuKiwgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuZGF0YV90eXBlIGFzIHR5cGVcbiAgICAgIEZST00gd2IuY29sdW1uc1xuICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IuY29sdW1ucy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgT04gKFxuICAgICAgICB3Yi5jb2x1bW5zLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWVcbiAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9zY2hlbWFcbiAgICAgIClcbiAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX25hbWU9JDJcbiAgICBgO1xuICAgIGxldCBwYXJhbXM6IHN0cmluZ1tdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9IEFORCB3Yi5jb2x1bW5zLm5hbWU9JDMgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lPSQzYDtcbiAgICAgIHBhcmFtcy5wdXNoKGNvbHVtbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyQ29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU6IGJvb2xlYW4sXG4gICAgY29sdW1uUEdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuYWRkT3JDcmVhdGVDb2x1bW4gJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHtjb2x1bW5OYW1lfSAke2NvbHVtbkxhYmVsfSAke2NvbHVtblBHVHlwZX0gJHtjcmVhdGV9YFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2IuY29sdW1ucyh0YWJsZV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZC5pZCwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFERCAke2NvbHVtbk5hbWV9ICR7Y29sdW1uUEdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXTtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1uQnlTY2hlbWFUYWJsZUNvbHVtbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICAgIGxldCBxdWVyeSA9IGBcbiAgICAgICAgVVBEQVRFIHdiLmNvbHVtbnMgU0VUXG4gICAgICBgO1xuICAgICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5OYW1lKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5MYWJlbCk7XG4gICAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgICAgcXVlcnkgKz0gYCR7dXBkYXRlcy5qb2luKFwiLCBcIil9IFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld1R5cGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFMVEVSIENPTFVNTiAke2NvbHVtbk5hbWV9IFRZUEUgJHtuZXdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgQ09MVU1OICR7Y29sdW1uTmFtZX0gVE8gJHtuZXdDb2x1bW5OYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IuY29sdW1uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5OYW1lfSBDQVNDQURFXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQ29sdW1uIHtcbiAgc3RhdGljIENPTU1PTl9UWVBFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBUZXh0OiBcInRleHRcIixcbiAgICBOdW1iZXI6IFwiaW50ZWdlclwiLFxuICAgIERlY2ltYWw6IFwiZGVjaW1hbFwiLFxuICAgIEJvb2xlYW46IFwiYm9vbGVhblwiLFxuICAgIERhdGU6IFwiZGF0ZVwiLFxuICAgIFwiRGF0ZSAmIFRpbWVcIjogXCJ0aW1lc3RhbXBcIixcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIHR5cGUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgaXNQcmltYXJ5S2V5ITogYm9vbGVhbjtcbiAgZm9yZWlnbktleXMhOiBbQ29uc3RyYWludElkXTtcbiAgcmVmZXJlbmNlZEJ5ITogW0NvbnN0cmFpbnRJZF07XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxDb2x1bW4+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIkNvbHVtbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBjb2x1bW5zID0gQXJyYXk8Q29sdW1uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgY29sdW1ucy5wdXNoKENvbHVtbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29sdW1ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IENvbHVtbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgIGNvbHVtbi5pZCA9IGRhdGEuaWQ7XG4gICAgY29sdW1uLnRhYmxlSWQgPSBkYXRhLnRhYmxlX2lkO1xuICAgIGNvbHVtbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIGNvbHVtbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgY29sdW1uLnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgY29sdW1uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBjb2x1bW4udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiBjb2x1bW47XG4gIH1cbn1cbiIsImltcG9ydCB7IE9yZ2FuaXphdGlvbiwgU2NoZW1hLCBUYWJsZSwgVXNlciB9IGZyb20gXCIuXCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQgeyBlcnJSZXN1bHQsIGxvZywgV2hpdGVicmlja0Nsb3VkIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFJvbGUgfSBmcm9tIFwiLi9Sb2xlXCI7XG5cbmV4cG9ydCBjbGFzcyBDdXJyZW50VXNlciB7XG4gIHdiQ2xvdWQhOiBXaGl0ZWJyaWNrQ2xvdWQ7XG4gIHVzZXIhOiBVc2VyO1xuICBpZCE6IG51bWJlcjtcbiAgb3JnYW5pemF0aW9uczogUmVjb3JkPG51bWJlciwgT3JnYW5pemF0aW9uPiA9IHt9O1xuICBhY3Rpb25IaXN0b3J5OiBzdHJpbmdbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHdiQ2xvdWQ6IFdoaXRlYnJpY2tDbG91ZCwgdXNlcjogVXNlcikge1xuICAgIHRoaXMud2JDbG91ZCA9IHdiQ2xvdWQ7XG4gICAgdGhpcy51c2VyID0gdXNlcjtcbiAgICB0aGlzLmlkID0gdXNlci5pZDtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0U3lzQWRtaW4od2JDbG91ZDogV2hpdGVicmlja0Nsb3VkKSB7XG4gICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcih3YkNsb3VkLCBVc2VyLmdldFN5c0FkbWluVXNlcigpKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0UHVibGljKHdiQ2xvdWQ6IFdoaXRlYnJpY2tDbG91ZCkge1xuICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIod2JDbG91ZCwgVXNlci5nZXRQdWJsaWNVc2VyKCkpO1xuICB9XG5cbiAgcHVibGljIGlzU2lnbmVkSW4oKSB7XG4gICAgLy90aGlzLnJlY29yZChcIklTX1NJR05FRF9JTlwiKTtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkICE9PSBVc2VyLlBVQkxJQ19JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZE91dCgpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzUHVibGljKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1NpZ25lZEluKCk7XG4gIH1cblxuICBwdWJsaWMgaXNTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09PSBVc2VyLlNZU19BRE1JTl9JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc05vdFN5c0FkbWluKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1N5c0FkbWluO1xuICB9XG5cbiAgcHVibGljIGlkSXMob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PSBvdGhlcklkO1xuICB9XG5cbiAgcHVibGljIGlkSXNOb3Qob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuICF0aGlzLmlkSXMob3RoZXJJZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdE9yZ2FuaXphdGlvbnNJZkVtcHR5KCkge1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLm9yZ2FuaXphdGlvbnMpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBjb25zdCBvcmdhbml6YXRpb25zUmVzdWx0ID0gYXdhaXQgdGhpcy53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5SWQodGhpcy5pZCk7XG4gICAgICAvLyBUQkQgdHJ5IHJhaXNlIGVycm9yIGJlbG93XG4gICAgICBpZiAoIW9yZ2FuaXphdGlvbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGZhbHNlO1xuICAgICAgZm9yIChjb25zdCBvcmdhbml6YXRpb24gb2Ygb3JnYW5pemF0aW9uc1Jlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHRoaXMub3JnYW5pemF0aW9uc1tvcmdhbml6YXRpb24uaWRdID0gb3JnYW5pemF0aW9uO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpc0luT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBhd2FpdCB0aGlzLmluaXRPcmdhbml6YXRpb25zSWZFbXB0eSgpO1xuICAgIHJldHVybiB0aGlzLm9yZ2FuaXphdGlvbnMuaGFzT3duUHJvcGVydHkob3JnYW5pemF0aW9uSWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGlzTm90SW5Pcmdhbml6YXRpb24ob3JnYW5pemF0aW9uSWQ6IG51bWJlcikge1xuICAgIHJldHVybiAhdGhpcy5pc0luT3JnYW5pemF0aW9uKG9yZ2FuaXphdGlvbklkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpcyhyb2xlOiBzdHJpbmcsIG9iamVjdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBzd2l0Y2ggKHJvbGUpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiOlxuICAgICAgICBhd2FpdCB0aGlzLmluaXRPcmdhbml6YXRpb25zSWZFbXB0eSgpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIHRoaXMub3JnYW5pemF0aW9ucy5oYXNPd25Qcm9wZXJ0eShvYmplY3RJZCkgJiZcbiAgICAgICAgICB0aGlzLm9yZ2FuaXphdGlvbnNbb2JqZWN0SWRdLnVzZXJSb2xlID09IHJvbGVcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGlzTm90KHJvbGU6IHN0cmluZywgb2JqZWN0SWQ6IGFueSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiAhdGhpcy5pcyhyb2xlLCBvYmplY3RJZCk7XG4gIH1cblxuICAvL2lmKGNVLmNhbnQoXCJlZGl0X3RhYmxlXCIsIHRhYmxlLmlkKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuXG4gIC8vIGFzeW5jIG9ubHkgcmVxdWlyZWQgZm9yIHRlc3RpbmdcbiAgcHVibGljIHN0YXRpYyBhc3luYyBmcm9tQ29udGV4dChjb250ZXh0OiBhbnkpOiBQcm9taXNlPEN1cnJlbnRVc2VyPiB7XG4gICAgLy9sb2cuaW5mbyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKFxuICAgICAgY29udGV4dC5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgICApLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChcbiAgICAgIC8vIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFRFU1QgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCByZXN1bHQucGF5bG9hZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHRlc3QgZW1haWwgeC10ZXN0LXVzZXItZW1haWw9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKGNvbnRleHQud2JDbG91ZCwgVXNlci5nZXRQdWJsaWNVc2VyKCkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgU1lTQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFN5c0FkbWluVXNlcigpKTtcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChcbiAgICAgICAgcGFyc2VJbnQoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCByZXN1bHQucGF5bG9hZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHgtaGFzdXJhLXVzZXItaWQ9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFB1YmxpY1VzZXIoKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRCRDogc3VwcG9ydCBmb3IgcHVibGljIHVzZXJzXG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGBDdXJyZW50VXNlci5mcm9tQ29udGV4dDogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBjb250ZXh0LmhlYWRlcnNcbiAgICAgICAgKX1gXG4gICAgICApO1xuICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBPcmdhbml6YXRpb24ge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb24+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25zID0gQXJyYXk8T3JnYW5pemF0aW9uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9ucy5wdXNoKE9yZ2FuaXphdGlvbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uID0gbmV3IE9yZ2FuaXphdGlvbigpO1xuICAgIG9yZ2FuaXphdGlvbi5pZCA9IGRhdGEuaWQ7XG4gICAgb3JnYW5pemF0aW9uLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgb3JnYW5pemF0aW9uLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBvcmdhbml6YXRpb24uY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvbi51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBvcmdhbml6YXRpb24udXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgT3JnYW5pemF0aW9uVXNlciB7XG4gIG9yZ2FuaXphdGlvbklkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21yb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgcm9sZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PE9yZ2FuaXphdGlvblVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvblVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uVXNlcnMgPSBBcnJheTxPcmdhbml6YXRpb25Vc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9uVXNlcnMucHVzaChPcmdhbml6YXRpb25Vc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBvcmdhbml6YXRpb25Vc2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvblVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25Vc2VyID0gbmV3IE9yZ2FuaXphdGlvblVzZXIoKTtcbiAgICBvcmdhbml6YXRpb25Vc2VyLm9yZ2FuaXphdGlvbklkID0gZGF0YS5vcmdhbml6YXRpb25faWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51c2VySWQgPSBkYXRhLnVzZXJfaWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5yb2xlSWQgPSBkYXRhLnJvbGVfaWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5pbXBsaWVkRnJvbXJvbGVJZCA9IGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgb3JnYW5pemF0aW9uVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEub3JnYW5pemF0aW9uX25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLm9yZ2FuaXphdGlvbk5hbWUgPSBkYXRhLm9yZ2FuaXphdGlvbl9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIG9yZ2FuaXphdGlvblVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnJvbGUpIG9yZ2FuaXphdGlvblVzZXIucm9sZSA9IGRhdGEucm9sZTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbHVtbiB9IGZyb20gXCIuL0NvbHVtblwiO1xuXG4vKipcbiAqIFNDSEVNQVxuICogLSBJZiBhIHNjaGVtYSBpcyBvd25lZCBieSBhbiBvcmdhbml6YXRpb25cbiAqICAgLSBBbGwgYWRtaW5pc3RyYXRvcnMgb2YgdGhlIG9yZ2FuaXphdGlvbiBoYXZlIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogICAtIFRoZXJlIGFyZSBubyBleGNlcHRpb25zXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGEgdXNlciwgdGhlIHVzZXIgaGFzIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogICAtIEFkZGl0aW9uYWwgdXNlcnMgY2FuIGJlIGdyYW50ZWQgYWRtaW4gYWNjZXNzIGV4cGxpY2l0bHlcbiAqL1xuXG5leHBvcnQgdHlwZSBSb2xlTGV2ZWwgPSBcIm9yZ2FuaXphdGlvblwiIHwgXCJzY2hlbWFcIiB8IFwidGFibGVcIjtcblxuZXhwb3J0IGNsYXNzIFJvbGUge1xuICBzdGF0aWMgU1lTUk9MRVNfT1JHQU5JWkFUSU9OUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XG4gICAgb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBBZG1pbmlzdHJhdG9yXCIsXG4gICAgfSxcbiAgICBvcmdhbml6YXRpb25fdXNlcjogeyBsYWJlbDogXCJPcmdhbml6YXRpb24gVXNlclwiIH0sXG4gICAgb3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXI6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBFeHRlcm5hbCBVc2VyXCIsXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgU1lTUk9MRVNfU0NIRU1BUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gICAgc2NoZW1hX293bmVyOiB7IGxhYmVsOiBcIkRCIE93bmVyXCIgfSxcbiAgICBzY2hlbWFfYWRtaW5pc3RyYXRvcjogeyBsYWJlbDogXCJEQiBBZG1pbmlzdHJhdG9yXCIgfSxcbiAgICBzY2hlbWFfbWFuYWdlcjogeyBsYWJlbDogXCJEQiBNYW5hZ2VyXCIgfSxcbiAgICBzY2hlbWFfZWRpdG9yOiB7IGxhYmVsOiBcIkRCIEVkaXRvclwiIH0sXG4gICAgc2NoZW1hX3JlYWRlcjogeyBsYWJlbDogXCJEQiBSZWFkZXJcIiB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19UQUJMRVM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge1xuICAgIHRhYmxlX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIEFkbWluaXN0cmF0b3JcIixcbiAgICAgIHBlcm1pc3Npb25QcmVmaXhlczogW1wic1wiLCBcImlcIiwgXCJ1XCIsIFwiZFwiXSxcbiAgICB9LFxuICAgIHRhYmxlX21hbmFnZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIE1hbmFnZXJcIixcbiAgICAgIHBlcm1pc3Npb25QcmVmaXhlczogW1wic1wiLCBcImlcIiwgXCJ1XCIsIFwiZFwiXSxcbiAgICB9LFxuICAgIHRhYmxlX2VkaXRvcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgRWRpdG9yXCIsXG4gICAgICBwZXJtaXNzaW9uUHJlZml4ZXM6IFtcInNcIiwgXCJpXCIsIFwidVwiLCBcImRcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9yZWFkZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIFJlYWRlclwiLFxuICAgICAgcGVybWlzc2lvblByZWZpeGVzOiBbXCJzXCJdLFxuICAgIH0sXG4gIH07XG5cbiAgc3RhdGljIFNDSEVNQV9UT19UQUJMRV9ST0xFX01BUDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiLFxuICAgIHNjaGVtYV9hZG1pbmlzdHJhdG9yOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIixcbiAgICBzY2hlbWFfbWFuYWdlcjogXCJ0YWJsZV9tYW5hZ2VyXCIsXG4gICAgc2NoZW1hX2VkaXRvcjogXCJ0YWJsZV9lZGl0b3JcIixcbiAgICBzY2hlbWFfcmVhZGVyOiBcInRhYmxlX3JlYWRlclwiLFxuICB9O1xuXG4gIHN0YXRpYyBPUkdBTklaQVRJT05fVE9fU0NIRU1BX1JPTEVfTUFQOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIG9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yOiBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gIH07XG5cbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHNjaGVtYUlkPzogbnVtYmVyO1xuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB0YWJsZUlkPzogbnVtYmVyO1xuICB0YWJsZU5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBpc1JvbGUocm9sZU5hbWU6IHN0cmluZywgcm9sZUxldmVsPzogUm9sZUxldmVsKTogYm9vbGVhbiB7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUykuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgICAgY2FzZSBcInNjaGVtYVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19TQ0hFTUFTKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBjYXNlIFwidGFibGVcIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUykuaW5jbHVkZXMocm9sZU5hbWUpIHx8XG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19TQ0hFTUFTKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykuaW5jbHVkZXMocm9sZU5hbWUpXG4gICAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHN0YXRpYyBhcmVSb2xlcyhyb2xlTmFtZXM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG4gICAgZm9yIChjb25zdCByb2xlTmFtZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gZWcge1xuICAvLyBwZXJtaXNzaW9uS2V5OiBzMTIzNCwgdHlwZTogXCJzZWxlY3RcIlxuICAvLyBwZXJtaXNzaW9uS2V5OiBpMTIzNCwgdHlwZTogXCJpbnNlcnRcIlxuICAvLyBwZXJtaXNzaW9uS2V5OiB1MTIzNCwgdHlwZTogXCJ1cGRhdGVcIlxuICAvLyBwZXJtaXNzaW9uS2V5OiBkMTIzNCwgdHlwZTogXCJkZWxldGVcIlxuICAvLyB9XG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uS2V5c0FuZFR5cGVzKFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10ge1xuICAgIGNvbnN0IFBFUk1JU1NJT05fUFJFRklYRVNfVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICBzOiBcInNlbGVjdFwiLFxuICAgICAgaTogXCJpbnNlcnRcIixcbiAgICAgIHU6IFwidXBkYXRlXCIsXG4gICAgICBkOiBcImRlbGV0ZVwiLFxuICAgIH07XG4gICAgY29uc3QgcGVybWlzc2lvbktleXNBbmRUeXBlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdID0gW107XG4gICAgZm9yIChjb25zdCBwcmVmaXggb2YgT2JqZWN0LmtleXMoUEVSTUlTU0lPTl9QUkVGSVhFU19UWVBFUykpIHtcbiAgICAgIHBlcm1pc3Npb25LZXlzQW5kVHlwZXMucHVzaCh7XG4gICAgICAgIHBlcm1pc3Npb25LZXk6IFJvbGUudGFibGVQZXJtaXNzaW9uS2V5KHByZWZpeCwgdGFibGVJZCksXG4gICAgICAgIHR5cGU6IFBFUk1JU1NJT05fUFJFRklYRVNfVFlQRVNbcHJlZml4XSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcGVybWlzc2lvbktleXNBbmRUeXBlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uS2V5KFxuICAgIHBlcm1pc3Npb25QcmVmaXg6IHN0cmluZyxcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7cGVybWlzc2lvblByZWZpeH0ke3RhYmxlSWR9YDtcbiAgfVxuXG4gIC8vIFVzZWQgdG8gZ2VuZXJhdGUgdGhlIEhhc3VyYSB0YWJsZSBwZXJtaXNzaW9uXG4gIHB1YmxpYyBzdGF0aWMgaGFzdXJhVGFibGVQZXJtaXNzaW9uQ2hlY2tzQW5kVHlwZXMoXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IFJlY29yZDxzdHJpbmcsIGFueT5bXSB7XG4gICAgY29uc3QgaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlczogUmVjb3JkPHN0cmluZywgYW55PltdID0gW107XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5c0FuZFR5cGUgb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kVHlwZXMoXG4gICAgICB0YWJsZUlkXG4gICAgKSkge1xuICAgICAgaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlcy5wdXNoKHtcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrOiB7XG4gICAgICAgICAgX2V4aXN0czoge1xuICAgICAgICAgICAgX3RhYmxlOiB7IHNjaGVtYTogXCJ3YlwiLCBuYW1lOiBcInRhYmxlX3Blcm1pc3Npb25zXCIgfSxcbiAgICAgICAgICAgIF93aGVyZToge1xuICAgICAgICAgICAgICBfYW5kOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgdGFibGVfcGVybWlzc2lvbl9rZXk6IHtcbiAgICAgICAgICAgICAgICAgICAgX2VxOiBwZXJtaXNzaW9uS2V5c0FuZFR5cGUucGVybWlzc2lvbktleSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7IHVzZXJfaWQ6IHsgX2VxOiBcIlgtSGFzdXJhLVVzZXItSWRcIiB9IH0sXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHBlcm1pc3Npb25UeXBlOiBwZXJtaXNzaW9uS2V5c0FuZFR5cGUudHlwZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Um9sZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiUm9sZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCByb2xlcyA9IEFycmF5PFJvbGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICByb2xlcy5wdXNoKFJvbGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJvbGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUm9sZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGUgPSBuZXcgUm9sZSgpO1xuICAgIHJvbGUuaWQgPSBkYXRhLmlkO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICByb2xlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICByb2xlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICByb2xlLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5zY2hlbWFJZCkgcm9sZS5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hSWQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hTmFtZSkgcm9sZS5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFOYW1lO1xuICAgIGlmIChkYXRhLnRhYmxlSWQpIHJvbGUudGFibGVJZCA9IGRhdGEudGFibGVJZDtcbiAgICBpZiAoZGF0YS50YWJsZU5hbWUpIHJvbGUudGFibGVOYW1lID0gZGF0YS50YWJsZU5hbWU7XG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBVc2VyLCBPcmdhbml6YXRpb24gfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgU2NoZW1hIHtcbiAgc3RhdGljIFNZU19TQ0hFTUFfTkFNRVM6IHN0cmluZ1tdID0gW1xuICAgIFwicHVibGljXCIsXG4gICAgXCJpbmZvcm1hdGlvbl9zY2hlbWFcIixcbiAgICBcImhkYl9jYXRhbG9nXCIsXG4gICAgXCJ3YlwiLFxuICBdO1xuXG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcjtcbiAgdXNlck93bmVySWQ/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG4gIHVzZXJSb2xlSW1wbGllZEZyb20/OiBzdHJpbmc7XG4gIG9yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZztcbiAgdXNlck93bmVyRW1haWw/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IGRhdGEuaWQ7XG4gICAgc2NoZW1hLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgc2NoZW1hLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBzY2hlbWEub3JnYW5pemF0aW9uT3duZXJJZCA9IGRhdGEub3JnYW5pemF0aW9uX293bmVyX2lkO1xuICAgIHNjaGVtYS51c2VyT3duZXJJZCA9IGRhdGEudXNlcl9vd25lcl9pZDtcbiAgICBzY2hlbWEuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBzY2hlbWEudXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICBpZiAoZGF0YS51c2VyX3JvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICBzY2hlbWEudXNlclJvbGVJbXBsaWVkRnJvbSA9IGRhdGEudXNlcl9yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICB9XG4gICAgaWYgKGRhdGEub3JnYW5pemF0aW9uX293bmVyX25hbWUpIHtcbiAgICAgIHNjaGVtYS5vcmdhbml6YXRpb25Pd25lck5hbWUgPSBkYXRhLm9yZ2FuaXphdGlvbl9vd25lcl9uYW1lO1xuICAgIH1cbiAgICBpZiAoZGF0YS51c2VyX293bmVyX2VtYWlsKSBzY2hlbWEudXNlck93bmVyRW1haWwgPSBkYXRhLnVzZXJfb3duZXJfZW1haWw7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYVVzZXIge1xuICBzY2hlbWFJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tUm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHJvbGU/OiBzdHJpbmc7XG4gIHJvbGVJbXBsaWVkRnJvbT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFNjaGVtYVVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYVVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hVXNlcnMgPSBBcnJheTxTY2hlbWFVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hVXNlcnMucHVzaChTY2hlbWFVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBzY2hlbWFVc2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYVVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFVc2VyID0gbmV3IFNjaGVtYVVzZXIoKTtcbiAgICBzY2hlbWFVc2VyLnNjaGVtYUlkID0gZGF0YS5zY2hlbWFfaWQ7XG4gICAgc2NoZW1hVXNlci51c2VySWQgPSBkYXRhLnVzZXJfaWQ7XG4gICAgc2NoZW1hVXNlci5yb2xlSWQgPSBkYXRhLnJvbGVfaWQ7XG4gICAgaWYgKGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpIHtcbiAgICAgIHNjaGVtYVVzZXIuaW1wbGllZEZyb21Sb2xlSWQgPSBkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkO1xuICAgIH1cbiAgICBzY2hlbWFVc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICBzY2hlbWFVc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBzY2hlbWFVc2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5zY2hlbWFfbmFtZSkgc2NoZW1hVXNlci5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2VtYWlsKSBzY2hlbWFVc2VyLnVzZXJFbWFpbCA9IGRhdGEudXNlcl9lbWFpbDtcbiAgICBpZiAoZGF0YS5yb2xlKSBzY2hlbWFVc2VyLnJvbGUgPSBkYXRhLnJvbGU7XG4gICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgIHNjaGVtYVVzZXIucm9sZUltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICB9XG4gICAgcmV0dXJuIHNjaGVtYVVzZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBDb2x1bW4gfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGUge1xuICBpZCE6IG51bWJlcjtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGNvbHVtbnMhOiBbQ29sdW1uXTtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZXMgPSBBcnJheTxUYWJsZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlcy5wdXNoKFRhYmxlLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZSA9IG5ldyBUYWJsZSgpO1xuICAgIHRhYmxlLmlkID0gZGF0YS5pZDtcbiAgICB0YWJsZS5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hX2lkO1xuICAgIHRhYmxlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgdGFibGUubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHRhYmxlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYV9uYW1lO1xuICAgIHJldHVybiB0YWJsZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFRhYmxlVXNlciB7XG4gIHRhYmxlSWQhOiBudW1iZXI7XG4gIHVzZXJJZCE6IG51bWJlcjtcbiAgcm9sZUlkITogbnVtYmVyO1xuICBpbXBsaWVkRnJvbXJvbGVJZD86IG51bWJlcjtcbiAgc2V0dGluZ3MhOiBvYmplY3Q7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdGFibGVOYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHJvbGU/OiBzdHJpbmc7XG4gIHJvbGVJbXBsaWVkRnJvbT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlcnMgPSBBcnJheTxUYWJsZVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0YWJsZVVzZXJzLnB1c2goVGFibGVVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGFibGVVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZVVzZXIgPSBuZXcgVGFibGVVc2VyKCk7XG4gICAgdGFibGVVc2VyLnRhYmxlSWQgPSBkYXRhLnRhYmxlX2lkO1xuICAgIHRhYmxlVXNlci51c2VySWQgPSBkYXRhLnVzZXJfaWQ7XG4gICAgdGFibGVVc2VyLnJvbGVJZCA9IGRhdGEucm9sZV9pZDtcbiAgICBpZiAoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCkge1xuICAgICAgdGFibGVVc2VyLmltcGxpZWRGcm9tcm9sZUlkID0gZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZDtcbiAgICB9XG4gICAgdGFibGVVc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICB0YWJsZVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHRhYmxlVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlVXNlci5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS50YWJsZV9uYW1lKSB0YWJsZVVzZXIudGFibGVOYW1lID0gZGF0YS50YWJsZV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHRhYmxlVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEucm9sZSkgdGFibGVVc2VyLnJvbGUgPSBkYXRhLnJvbGU7XG4gICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgIHRhYmxlVXNlci5yb2xlSW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgIH1cbiAgICByZXR1cm4gdGFibGVVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgdXNlck1lc3NhZ2VzIH0gZnJvbSBcIi4uL2Vudmlyb25tZW50XCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgc3RhdGljIFNZU19BRE1JTl9JRDogbnVtYmVyID0gMTtcbiAgc3RhdGljIFBVQkxJQ19JRDogbnVtYmVyID0gMTtcblxuICBpZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZT86IHN0cmluZztcbiAgbGFzdE5hbWU/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXJzID0gQXJyYXk8VXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHVzZXJzLnB1c2goVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IGRhdGEuaWQ7XG4gICAgdXNlci5lbWFpbCA9IGRhdGEuZW1haWw7XG4gICAgaWYgKGRhdGEuZmlyc3RfbmFtZSkgdXNlci5maXJzdE5hbWUgPSBkYXRhLmZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEubGFzdF9uYW1lKSB1c2VyLmxhc3ROYW1lID0gZGF0YS5sYXN0X25hbWU7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluVXNlcigpOiBVc2VyIHtcbiAgICBjb25zdCBkYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1c2VyOiBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gVXNlci5TWVNfQURNSU5fSUQ7XG4gICAgdXNlci5lbWFpbCA9IFwiU1lTX0FETUlOQGV4YW1wbGUuY29tXCI7XG4gICAgdXNlci5maXJzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0ZTtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpY1VzZXIoKTogVXNlciB7XG4gICAgY29uc3QgZGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdXNlcjogVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IFVzZXIuUFVCTElDX0lEO1xuICAgIHVzZXIuZW1haWwgPSBcIlBVQkxJQ0BleGFtcGxlLmNvbVwiO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gXCJQdWJsaWMgVXNlclwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlB1YmxpYyBVc2VyXCI7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRlO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0ZTtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vUm9sZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vT3JnYW5pemF0aW9uXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Pcmdhbml6YXRpb25Vc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1NjaGVtYVVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1RhYmxlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UYWJsZVVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL0NvbHVtblwiO1xuIiwidHlwZSBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogc3RyaW5nO1xuICBkYk5hbWU6IHN0cmluZztcbiAgZGJIb3N0OiBzdHJpbmc7XG4gIGRiUG9ydDogbnVtYmVyO1xuICBkYlVzZXI6IHN0cmluZztcbiAgZGJQYXNzd29yZDogc3RyaW5nO1xuICBkYlBvb2xNYXg6IG51bWJlcjtcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IG51bWJlcjtcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IG51bWJlcjtcbiAgaGFzdXJhSG9zdDogc3RyaW5nO1xuICBoYXN1cmFBZG1pblNlY3JldDogc3RyaW5nO1xuICB0ZXN0SWdub3JlRXJyb3JzOiBib29sZWFuO1xufTtcblxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50OiBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogcHJvY2Vzcy5lbnYuU0VDUkVUX01FU1NBR0UgYXMgc3RyaW5nLFxuICBkYk5hbWU6IHByb2Nlc3MuZW52LkRCX05BTUUgYXMgc3RyaW5nLFxuICBkYkhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgYXMgc3RyaW5nLFxuICBkYlBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgXCJcIikgYXMgbnVtYmVyLFxuICBkYlVzZXI6IHByb2Nlc3MuZW52LkRCX1VTRVIgYXMgc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCBhcyBzdHJpbmcsXG4gIGRiUG9vbE1heDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NQVggfHwgXCJcIikgYXMgbnVtYmVyLFxuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9JRExFX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBwYXJzZUludChcbiAgICBwcm9jZXNzLmVudi5EQl9QT09MX0NPTk5FQ1RJT05fVElNRU9VVF9NSUxMSVMgfHwgXCJcIlxuICApIGFzIG51bWJlcixcbiAgaGFzdXJhSG9zdDogcHJvY2Vzcy5lbnYuSEFTVVJBX0hPU1QgYXMgc3RyaW5nLFxuICBoYXN1cmFBZG1pblNlY3JldDogcHJvY2Vzcy5lbnYuSEFTVVJBX0FETUlOX1NFQ1JFVCBhcyBzdHJpbmcsXG4gIHRlc3RJZ25vcmVFcnJvcnM6IChwcm9jZXNzLmVudi5URVNUX0lHTk9SRV9FUlJPUlMgfHwgZmFsc2UpIGFzIGJvb2xlYW4sXG59O1xuXG4vLyB3YkVycm9yQ29kZSA6IFsgbWVzc2FnZSwgYXBvbGxvRXJyb3JDb2RlPyBdXG5leHBvcnQgY29uc3QgdXNlck1lc3NhZ2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gPSB7XG4gIC8vIFVzZXJzXG4gIFdCX1VTRVJfTk9UX0ZPVU5EOiBbXCJVc2VyIG5vdCBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSB1c2VycyB3ZXJlIG5vdCBmb3VuZC5cIl0sXG4gIC8vIE9yZ2FuaXphdGlvbnNcbiAgV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORDogW1wiT3JnYW5pemF0aW9uIG5vdCBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfT1JHQU5JWkFUSU9OX05BTUVfVEFLRU46IFtcbiAgICBcIlRoaXMgT3JnYW5pemF0aW9uIG5hbWUgaGFzIGFscmVhZHkgYmVlbiB0YWtlbi5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX09SR0FOSVpBVElPTl9OT1RfVVNFUl9FTVBUWTogW1xuICAgIFwiVGhpcyBvcmdhbml6YXRpb24gc3RpbGwgaGFzIG5vbi1hZG1pbmlzdHJhdGl2ZSB1c2Vycy5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX09SR0FOSVpBVElPTl9OT19BRE1JTlM6IFtcbiAgICBcIllvdSBjYW4gbm90IHJlbW92ZSBhbGwgQWRtaW5pc3RyYXRvcnMgZnJvbSBhbiBPcmdhbml6YXRpb24gLSB5b3UgbXVzdCBsZWF2ZSBhdCBsZWFzdCBvbmUuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9VU0VSX05PVF9JTl9PUkc6IFtcIlVzZXIgbXVzdCBiZSBpbiBPcmdhbml6YXRpb25cIl0sXG4gIFdCX1VTRVJfTk9UX1NDSEVNQV9PV05FUjogW1wiVGhlIGN1cnJlbnQgdXNlciBpcyBub3QgdGhlIG93bmVyLlwiXSxcbiAgLy8gU2NoZW1hc1xuICBXQl9TQ0hFTUFfTk9UX0ZPVU5EOiBbXCJEYXRhYmFzZSBjb3VsZCBub3QgYmUgZm91bmQuXCJdLFxuICBXQl9CQURfU0NIRU1BX05BTUU6IFtcbiAgICBcIkRhdGFiYXNlIG5hbWUgY2FuIG5vdCBiZWdpbiB3aXRoICdwZ18nIG9yIGJlIGluIHRoZSByZXNlcnZlZCBsaXN0LlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX1VTRVJfT1dORVI6IFtcbiAgICBcIllvdSBjYW4gbm90IHJlbW92ZSB0aGUgdXNlcl9vd25lciBmcm9tIGEgU2NoZW1hXCIsXG4gIF0sXG4gIC8vIFNjaGVtYXMgVXNlcnNcbiAgV0JfU0NIRU1BX1VTRVJTX05PVF9GT1VORDogW1wiT25lIG9yIG1vcmUgU2NoZW1hIFVzZXJzIG5vdCBmb3VuZC5cIl0sXG4gIC8vIFRhYmxlc1xuICBXQl9UQUJMRV9OT1RfRk9VTkQ6IFtcIlRhYmxlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG4gIFdCX1RBQkxFX05BTUVfRVhJU1RTOiBbXCJUaGlzIFRhYmxlIG5hbWUgYWxyZWFkeSBleGlzdHNcIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgQ09MVU1OX05PVF9GT1VORDogW1wiQ29sdW1uIGNvdWxkIG5vdCBiZSBmb3VuZFwiXSxcbiAgV0JfQ09MVU1OX05BTUVfRVhJU1RTOiBbXCJUaGlzIENvbHVtbiBuYW1lIGFscmVhZHkgZXhpc3RzLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9QS19FWElTVFM6IFtcIlJlbW92ZSBleGlzdGluZyBwcmltYXJ5IGtleSBmaXJzdC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfRktfRVhJU1RTOiBbXG4gICAgXCJSZW1vdmUgZXhpc3RpbmcgZm9yZWlnbiBrZXkgb24gdGhlIGNvbHVtbiBmaXJzdC5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIC8vIFRhYmxlIFVzZXJzLFxuICBXQl9UQUJMRV9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIFRhYmxlIFVzZXJzIG5vdCBmb3VuZC5cIl0sXG4gIC8vIFJvbGVzXG4gIFJPTEVfTk9UX0ZPVU5EOiBbXCJUaGlzIHJvbGUgY291bGQgbm90IGJlIGZvdW5kLlwiXSxcbn07XG4iLCIvLyBodHRwczovL2FsdHJpbS5pby9wb3N0cy9heGlvcy1odHRwLWNsaWVudC11c2luZy10eXBlc2NyaXB0XG5cbmltcG9ydCBheGlvcywgeyBBeGlvc0luc3RhbmNlLCBBeGlvc1Jlc3BvbnNlIH0gZnJvbSBcImF4aW9zXCI7XG5pbXBvcnQgeyBDb2x1bW4gfSBmcm9tIFwiLi9lbnRpdHlcIjtcbmltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgZXJyUmVzdWx0LCBsb2cgfSBmcm9tIFwiLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmNvbnN0IGhlYWRlcnM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW4+PiA9IHtcbiAgQWNjZXB0OiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gIFwieC1oYXN1cmEtYWRtaW4tc2VjcmV0XCI6IGVudmlyb25tZW50Lmhhc3VyYUFkbWluU2VjcmV0LFxufTtcblxuY2xhc3MgSGFzdXJhQXBpIHtcbiAgc3RhdGljIElHTk9SRV9FUlJPUlMgPSBmYWxzZTtcbiAgc3RhdGljIEhBU1VSQV9JR05PUkVfQ09ERVM6IHN0cmluZ1tdID0gW1xuICAgIFwiYWxyZWFkeS11bnRyYWNrZWRcIixcbiAgICBcImFscmVhZHktdHJhY2tlZFwiLFxuICAgIFwibm90LWV4aXN0c1wiLCAvLyBkcm9wcGluZyBhIHJlbGF0aW9uc2hpcFxuICAgIFwiYWxyZWFkeS1leGlzdHNcIixcbiAgICBcInVuZXhwZWN0ZWRcIixcbiAgICBcInBlcm1pc3Npb24tZGVuaWVkXCIsXG4gIF07XG5cbiAgcHJpdmF0ZSBpbnN0YW5jZTogQXhpb3NJbnN0YW5jZSB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZ2V0IGh0dHAoKTogQXhpb3NJbnN0YW5jZSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zdGFuY2UgIT0gbnVsbCA/IHRoaXMuaW5zdGFuY2UgOiB0aGlzLmluaXRIYXN1cmFBcGkoKTtcbiAgfVxuXG4gIGluaXRIYXN1cmFBcGkoKSB7XG4gICAgY29uc3QgaHR0cCA9IGF4aW9zLmNyZWF0ZSh7XG4gICAgICBiYXNlVVJMOiBlbnZpcm9ubWVudC5oYXN1cmFIb3N0LFxuICAgICAgaGVhZGVycyxcbiAgICAgIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXG4gICAgfSk7XG5cbiAgICB0aGlzLmluc3RhbmNlID0gaHR0cDtcbiAgICByZXR1cm4gaHR0cDtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIGVycklnbm9yZSgpIHtcbiAgICBpZiAodGhpcy5JR05PUkVfRVJST1JTIHx8IGVudmlyb25tZW50LnRlc3RJZ25vcmVFcnJvcnMpIHtcbiAgICAgIHJldHVybiB0aGlzLkhBU1VSQV9JR05PUkVfQ09ERVM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIHRyeSB7XG4gICAgICBsb2cuZGVidWcoYGhhc3VyYUFwaS5wb3N0OiB0eXBlOiAke3R5cGV9YCwgYXJncyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuaHR0cC5wb3N0PGFueSwgQXhpb3NSZXNwb25zZT4oXG4gICAgICAgIFwiL3YxL21ldGFkYXRhXCIsXG4gICAgICAgIHtcbiAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgIGFyZ3M6IGFyZ3MsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHJlc3BvbnNlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IucmVzcG9uc2UgJiYgZXJyb3IucmVzcG9uc2UuZGF0YSkge1xuICAgICAgICBpZiAoIUhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUpKSB7XG4gICAgICAgICAgbG9nLmVycm9yKFxuICAgICAgICAgICAgXCJlcnJvci5yZXNwb25zZS5kYXRhOiBcIiArIEpTT04uc3RyaW5naWZ5KGVycm9yLnJlc3BvbnNlLmRhdGEpXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXN1bHQgPSBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3IucmVzcG9uc2UuZGF0YS5lcnJvcixcbiAgICAgICAgICAgIHJlZkNvZGU6IGVycm9yLnJlc3BvbnNlLmRhdGEuY29kZSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSBlcnJSZXN1bHQoe1xuICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgIH0pIGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogVGFibGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ190cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdW50cmFja1RhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ191bnRyYWNrX3RhYmxlXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIGNhc2NhZGU6IHRydWUsXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogUmVsYXRpb25zaGlwc1xuICAgKi9cblxuICAvLyBhIHBvc3QgaGFzIG9uZSBhdXRob3IgKGNvbnN0cmFpbnQgcG9zdHMuYXV0aG9yX2lkIC0+IGF1dGhvcnMuaWQpXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIGNvbHVtbk5hbWU6IHN0cmluZywgLy8gYXV0aG9yX2lkXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcgLy8gYXV0aG9yc1xuICApIHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgaGFzdXJhQXBpLmNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcCgke3NjaGVtYU5hbWV9LCAke3RhYmxlTmFtZX0sICR7Y29sdW1uTmFtZX0sICR7cGFyZW50VGFibGVOYW1lfSlgXG4gICAgKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19jcmVhdGVfb2JqZWN0X3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICBuYW1lOiBgb2JqXyR7dGFibGVOYW1lfV8ke3BhcmVudFRhYmxlTmFtZX1gLCAvLyBvYmpfcG9zdHNfYXV0aG9yc1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICB9LFxuICAgICAgdXNpbmc6IHtcbiAgICAgICAgZm9yZWlnbl9rZXlfY29uc3RyYWludF9vbjogY29sdW1uTmFtZSwgLy8gYXV0aG9yX2lkXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gYW4gYXV0aG9yIGhhcyBtYW55IHBvc3RzIChjb25zdHJhaW50IHBvc3RzLmF1dGhvcl9pZCAtPiBhdXRob3JzLmlkKVxuICBwdWJsaWMgYXN5bmMgY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLCAvLyBhdXRob3JzXG4gICAgY2hpbGRUYWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBjaGlsZENvbHVtbk5hbWVzOiBzdHJpbmdbXSAvLyBhdXRob3JfaWRcbiAgKSB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVBcnJheVJlbGF0aW9uc2hpcCgke3NjaGVtYU5hbWV9LCAke3RhYmxlTmFtZX0sICR7Y2hpbGRUYWJsZU5hbWV9LCAke2NoaWxkQ29sdW1uTmFtZXN9KWBcbiAgICApO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2NyZWF0ZV9hcnJheV9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYGFycl8ke3RhYmxlTmFtZX1fJHtjaGlsZFRhYmxlTmFtZX1gLCAvLyBhcnJfYXV0aG9yc19wb3N0c1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgIH0sXG4gICAgICB1c2luZzoge1xuICAgICAgICBmb3JlaWduX2tleV9jb25zdHJhaW50X29uOiB7XG4gICAgICAgICAgY29sdW1uOiBjaGlsZENvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgICB0YWJsZToge1xuICAgICAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgbmFtZTogY2hpbGRUYWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZHJvcFJlbGF0aW9uc2hpcHMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nIC8vIGF1dGhvcnNcbiAgKSB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2Ryb3BfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHJlbGF0aW9uc2hpcDogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgICghcmVzdWx0LnJlZkNvZGUgfHxcbiAgICAgICAgKHJlc3VsdC5yZWZDb2RlICYmICFIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpKSlcbiAgICApIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2Ryb3BfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogcGFyZW50VGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICB9LFxuICAgICAgcmVsYXRpb25zaGlwOiBgYXJyXyR7cGFyZW50VGFibGVOYW1lfV8ke3RhYmxlTmFtZX1gLCAvLyBhcnJfYXV0aG9yc19wb3N0c1xuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFBlcm1pc3Npb25zXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVQZXJtaXNzaW9uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBwZXJtaXNzaW9uQ2hlY2s6IG9iamVjdCxcbiAgICB0eXBlOiBzdHJpbmcsXG4gICAgcm9sZTogc3RyaW5nLFxuICAgIGNvbHVtbnM6IHN0cmluZ1tdXG4gICkge1xuICAgIGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICByb2xlOiByb2xlLFxuICAgICAgcGVybWlzc2lvbjoge1xuICAgICAgICBjb2x1bW5zOiBjb2x1bW5zLFxuICAgICAgICAvLyBmaWx0ZXI6IHBlcm1pc3Npb25DaGVjayxcbiAgICAgICAgLy8gY2hlY2s6IHBlcm1pc3Npb25DaGVjayxcbiAgICAgIH0sXG4gICAgfTtcbiAgICAvLyBodHRwczovL2hhc3VyYS5pby9kb2NzL2xhdGVzdC9ncmFwaHFsL2NvcmUvYXBpLXJlZmVyZW5jZS9tZXRhZGF0YS1hcGkvcGVybWlzc2lvbi5odG1sXG4gICAgaWYgKHR5cGUgPT0gXCJpbnNlcnRcIikge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmNoZWNrID0gcGVybWlzc2lvbkNoZWNrO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXlsb2FkLnBlcm1pc3Npb24uZmlsdGVyID0gcGVybWlzc2lvbkNoZWNrO1xuICAgIH1cbiAgICBpZiAodHlwZSA9PSBcInNlbGVjdFwiKSB7XG4gICAgICBwYXlsb2FkLnBlcm1pc3Npb24uYWxsb3dfYWdncmVnYXRpb25zID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KGBwZ19jcmVhdGVfJHt0eXBlfV9wZXJtaXNzaW9uYCwgcGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVQZXJtaXNzaW9uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcsXG4gICAgcm9sZTogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChgcGdfZHJvcF8ke3R5cGV9X3Blcm1pc3Npb25gLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICByb2xlOiByb2xlLFxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhc3VyYUFwaSA9IG5ldyBIYXN1cmFBcGkoKTtcbiIsImltcG9ydCB7IHR5cGVEZWZzIGFzIFNjaGVtYSwgcmVzb2x2ZXJzIGFzIHNjaGVtYVJlc29sdmVycyB9IGZyb20gXCIuL3NjaGVtYVwiO1xuaW1wb3J0IHtcbiAgdHlwZURlZnMgYXMgT3JnYW5pemF0aW9uLFxuICByZXNvbHZlcnMgYXMgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxufSBmcm9tIFwiLi9vcmdhbml6YXRpb25cIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFVzZXIsIHJlc29sdmVycyBhcyB1c2VyUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdXNlclwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVGFibGUsIHJlc29sdmVycyBhcyB0YWJsZVJlc29sdmVycyB9IGZyb20gXCIuL3RhYmxlXCI7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gXCJsb2Rhc2hcIjtcbmltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHtcbiAgY29uc3RyYWludERpcmVjdGl2ZSxcbiAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxufSBmcm9tIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiO1xuaW1wb3J0IHsgbWFrZUV4ZWN1dGFibGVTY2hlbWEgfSBmcm9tIFwiZ3JhcGhxbC10b29sc1wiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnk7IG1lc3NhZ2U/OiBzdHJpbmcgfVxuICB8IHtcbiAgICAgIHN1Y2Nlc3M/OiBmYWxzZTtcbiAgICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gICAgICByZWZDb2RlPzogc3RyaW5nO1xuICAgICAgd2JDb2RlPzogc3RyaW5nO1xuICAgICAgYXBvbGxvRXJyb3JDb2RlPzogc3RyaW5nO1xuICAgICAgdmFsdWVzPzogc3RyaW5nW107XG4gICAgfTtcblxuZXhwb3J0IHR5cGUgUXVlcnlQYXJhbXMgPSB7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHBhcmFtcz86IGFueVtdO1xufTtcblxuZXhwb3J0IHR5cGUgQ29uc3RyYWludElkID0ge1xuICBjb25zdHJhaW50TmFtZTogc3RyaW5nO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgY29sdW1uTmFtZTogc3RyaW5nO1xuICByZWxUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIHJlbENvbHVtbk5hbWU/OiBzdHJpbmc7XG59O1xuXG5jb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogSlNPTiFcbiAgICB3YkNsb3VkQ29udGV4dDogSlNPTiFcbiAgfVxuXG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiUmVzZXRUZXN0RGF0YTogQm9vbGVhbiFcbiAgICB3YkF1dGgoc2NoZW1hTmFtZTogU3RyaW5nISwgdXNlckF1dGhJZDogU3RyaW5nISk6IEpTT04hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgIH07XG4gICAgfSxcbiAgICB3YkNsb3VkQ29udGV4dDogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gY29udGV4dC53YkNsb3VkLmNsb3VkQ29udGV4dCgpO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkF1dGg6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJBdXRoSWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmF1dGgoc2NoZW1hTmFtZSwgdXNlckF1dGhJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBzY2hlbWEgPSBtYWtlRXhlY3V0YWJsZVNjaGVtYSh7XG4gIHR5cGVEZWZzOiBbXG4gICAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxuICAgIHR5cGVEZWZzLFxuICAgIE9yZ2FuaXphdGlvbixcbiAgICBVc2VyLFxuICAgIFNjaGVtYSxcbiAgICBUYWJsZSxcbiAgXSxcbiAgcmVzb2x2ZXJzOiBtZXJnZShcbiAgICByZXNvbHZlcnMsXG4gICAgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxuICAgIHVzZXJSZXNvbHZlcnMsXG4gICAgc2NoZW1hUmVzb2x2ZXJzLFxuICAgIHRhYmxlUmVzb2x2ZXJzXG4gICksXG4gIHNjaGVtYVRyYW5zZm9ybXM6IFtjb25zdHJhaW50RGlyZWN0aXZlKCldLFxufSk7XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eS9DdXJyZW50VXNlclwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIE9yZ2FuaXphdGlvbiB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHVzZXJSb2xlOiBTdHJpbmdcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgT3JnYW5pemF0aW9uVXNlciB7XG4gICAgb3JnYW5pemF0aW9uSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nXG4gICAgdXNlckVtYWlsOiBTdHJpbmdcbiAgICByb2xlOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbnNcbiAgICBcIlwiXCJcbiAgICB3Yk9yZ2FuaXphdGlvbnModXNlckVtYWlsOiBTdHJpbmcpOiBbT3JnYW5pemF0aW9uXVxuICAgIHdiT3JnYW5pemF0aW9uQnlJZChpZDogSUQhKTogT3JnYW5pemF0aW9uXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWUoY3VycmVudFVzZXJFbWFpbDogU3RyaW5nISwgbmFtZTogU3RyaW5nISk6IE9yZ2FuaXphdGlvblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiT3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICByb2xlczogW1N0cmluZ11cbiAgICApOiBbT3JnYW5pemF0aW9uVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb25zXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVPcmdhbml6YXRpb24obmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBPcmdhbml6YXRpb25cbiAgICB3YlVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIG5ld05hbWU6IFN0cmluZ1xuICAgICAgbmV3TGFiZWw6IFN0cmluZ1xuICAgICk6IE9yZ2FuaXphdGlvblxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEpOiBCb29sZWFuXG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiT3JnYW5pemF0aW9uczogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVPcmdhbml6YXRpb25zKGN1cnJlbnRVc2VyKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiT3JnYW5pemF0aW9uQnlOYW1lOiBhc3luYyAoXywgeyBjdXJyZW50VXNlckVtYWlsLCBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25CeU5hbWUobmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk9yZ2FuaXphdGlvbkJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25CeUlkKGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIHdiT3JnYW5pemF0aW9uVXNlcnM6IGFzeW5jIChfLCB7IG9yZ2FuaXphdGlvbk5hbWUsIHJvbGVzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25Vc2VycyhcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByb2xlc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIE9yZ2FuaXphdGlvbnNcbiAgICB3YkNyZWF0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSwgbGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVPcmdhbml6YXRpb24oXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBsYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBuYW1lLFxuICAgICAgICBuZXdOYW1lLFxuICAgICAgICBuZXdMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5kZWxldGVPcmdhbml6YXRpb24obmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3YlNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgcm9sZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb246IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHVzZXJFbWFpbHMsIG9yZ2FuaXphdGlvbk5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5L0N1cnJlbnRVc2VyXCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgU2NoZW1hIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZDogSW50XG4gICAgdXNlck93bmVySWQ6IEludFxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICAgIHVzZXJSb2xlOiBTdHJpbmdcbiAgICB1c2VyUm9sZUltcGxpZWRGcm9tOiBTdHJpbmdcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU6IFN0cmluZ1xuICAgIHVzZXJPd25lckVtYWlsOiBTdHJpbmdcbiAgfVxuXG4gIHR5cGUgU2NoZW1hVXNlciB7XG4gICAgc2NoZW1hSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdXNlckVtYWlsOiBTdHJpbmdcbiAgICByb2xlOiBTdHJpbmdcbiAgICB1c2VyUm9sZUltcGxpZWRGcm9tOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YlNjaGVtYXM6IFtTY2hlbWFdXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSk6IFtTY2hlbWFVc2VyXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIGxhYmVsOiBTdHJpbmchXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkOiBJbnRcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgKTogU2NoZW1hXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSEpOiBCb29sZWFuXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiU2NoZW1hczogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFzKGN1cnJlbnRVc2VyKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFNjaGVtYSBVc2Vyc1xuICAgIHdiU2NoZW1hVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNjaGVtYVVzZXJzKHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiQ3JlYXRlU2NoZW1hOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uT3duZXJJZCwgb3JnYW5pemF0aW9uT3duZXJOYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVNjaGVtYShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lck5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBTY2hlbWEgVXNlcnNcbiAgICB3YlNldFNjaGVtYVVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldFNjaGVtYVVzZXJzUm9sZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgcm9sZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlU2NoZW1hVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZVNjaGVtYVVzZXJzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBHcmFwaFFMSlNPTiB9IGZyb20gXCJncmFwaHFsLXR5cGUtanNvblwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICBzY2FsYXIgSlNPTlxuXG4gIHR5cGUgVGFibGUge1xuICAgIGlkOiBJRCFcbiAgICBzY2hlbWFJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICAgIGNvbHVtbnM6IFtDb2x1bW5dIVxuICAgIHNjaGVtYU5hbWU6IFN0cmluZ1xuICB9XG5cbiAgdHlwZSBDb2x1bW4ge1xuICAgIGlkOiBJRCFcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgdHlwZTogU3RyaW5nIVxuICAgIGlzUHJpbWFyeUtleTogQm9vbGVhbiFcbiAgICBmb3JlaWduS2V5czogW0NvbnN0cmFpbnRJZF0hXG4gICAgcmVmZXJlbmNlZEJ5OiBbQ29uc3RyYWludElkXSFcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgQ29uc3RyYWludElkIHtcbiAgICBjb25zdHJhaW50TmFtZTogU3RyaW5nIVxuICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICByZWxUYWJsZU5hbWU6IFN0cmluZ1xuICAgIHJlbENvbHVtbk5hbWU6IFN0cmluZ1xuICB9XG5cbiAgdHlwZSBUYWJsZVVzZXIge1xuICAgIHRhYmxlSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdGFibGVOYW1lOiBTdHJpbmdcbiAgICB1c2VyRW1haWw6IFN0cmluZ1xuICAgIHJvbGU6IFN0cmluZ1xuICAgIHJvbGVJbXBsaWVkRnJvbTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBUYWJsZXNcbiAgICBcIlwiXCJcbiAgICB3YlRhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchLCB3aXRoQ29sdW1uczogQm9vbGVhbik6IFtUYWJsZV1cbiAgICBcIlwiXCJcbiAgICBUYWJsZSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiVGFibGVVc2VycyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ11cbiAgICApOiBbVGFibGVVc2VyXVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkNvbHVtbnMoc2NoZW1hTmFtZTogU3RyaW5nISwgdGFibGVOYW1lOiBTdHJpbmchKTogW0NvbHVtbl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBUYWJsZXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JVcGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgbmV3VGFibGVOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1RhYmxlTGFiZWw6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkQWxsRXhpc3RpbmdUYWJsZXMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIHBhcmVudFRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgcGFyZW50Q29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIFRhYmxlIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRUYWJsZVVzZXJzUm9sZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgQ29sdW1uc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbkxhYmVsOiBTdHJpbmchXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICAgIGNvbHVtblR5cGU6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JVcGRhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIG5ld0NvbHVtbk5hbWU6IFN0cmluZ1xuICAgICAgbmV3Q29sdW1uTGFiZWw6IFN0cmluZ1xuICAgICAgbmV3VHlwZTogU3RyaW5nXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBKU09OOiBHcmFwaFFMSlNPTixcbiAgUXVlcnk6IHtcbiAgICAvLyBUYWJsZXNcbiAgICB3YlRhYmxlczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgd2l0aENvbHVtbnMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnRhYmxlcyhzY2hlbWFOYW1lLCB3aXRoQ29sdW1ucyk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiVGFibGVVc2VyczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VyRW1haWxzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXJzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JDb2x1bW5zOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFRhYmxlc1xuICAgIHdiQWRkT3JDcmVhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB0YWJsZUxhYmVsLCBjcmVhdGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHRhYmxlTGFiZWwsXG4gICAgICAgIGNyZWF0ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiVXBkYXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgbmV3VGFibGVOYW1lLCBuZXdUYWJsZUxhYmVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVGFibGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgICBuZXdUYWJsZUxhYmVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkQWxsRXhpc3RpbmdUYWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZEFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgIHNjaGVtYU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lcywgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICAgIGNyZWF0ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5OiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgICBkZWwsXG4gICAgICB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JBZGRPckNyZWF0ZUNvbHVtbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lLCBjb2x1bW5MYWJlbCwgY3JlYXRlLCBjb2x1bW5UeXBlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgY29sdW1uTGFiZWwsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgICAgY29sdW1uVHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiVXBkYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgICBuZXdUeXBlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVDb2x1bW4oXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICAgIG5ld1R5cGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIGRlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIC8vIFRhYmxlIFVzZXJzXG4gICAgd2JTZXRUYWJsZVVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VyRW1haWxzLCByb2xlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgcm9sZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbCwgc2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlsLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuLyoqXG4gKiBPbmx5IGZpZWxkcyByZWxhdGVkIHRvIGFuIGlzb2xhdGVkIHVzZXIgb3Igcm9sZSBvYmplY3RzIGxpdmUgaGVyZVxuICogRm9yIG9yZ2FuaXphdGlvbi11c2Vycywgc2NoZW1hLXVzZXJzLCB0YWJsZS11c2VycyBzZWUgcmVzcGVjdGl2ZSBjbGFzc2VzXG4gKi9cblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFVzZXIge1xuICAgIGlkOiBJRCFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JVc2VyQnlJZChpZDogSUQhKTogVXNlclxuICAgIHdiVXNlckJ5RW1haWwoZW1haWw6IFN0cmluZyEpOiBVc2VyXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVVzZXIoZW1haWw6IFN0cmluZyEsIGZpcnN0TmFtZTogU3RyaW5nLCBsYXN0TmFtZTogU3RyaW5nKTogVXNlclxuICAgIHdiVXBkYXRlVXNlcihcbiAgICAgIGlkOiBJRCFcbiAgICAgIGVtYWlsOiBTdHJpbmdcbiAgICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgKTogVXNlclxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIC8vIFVzZXJzXG4gICAgd2JVc2VyQnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUlkKGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5RW1haWw6IGFzeW5jIChfLCB7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChlbWFpbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiQ3JlYXRlVXNlcjogYXN5bmMgKF8sIHsgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVVzZXIoXG4gICAgICAgIGVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGxhc3ROYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVVc2VyOiBhc3luYyAoXywgeyBpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZVVzZXIoXG4gICAgICAgIGlkLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IEFwb2xsb1NlcnZlciwgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCJ0c2xvZ1wiO1xuaW1wb3J0IHsgREFMIH0gZnJvbSBcIi4vZGFsXCI7XG5pbXBvcnQgeyBoYXN1cmFBcGkgfSBmcm9tIFwiLi9oYXN1cmEtYXBpXCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIHNjaGVtYSwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgdiA9IHJlcXVpcmUoXCJ2b2NhXCIpO1xuaW1wb3J0IHsgdXNlck1lc3NhZ2VzIH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcblxuaW1wb3J0IHtcbiAgQ29sdW1uLFxuICBPcmdhbml6YXRpb24sXG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgU2NoZW1hLFxuICBUYWJsZSxcbiAgVXNlcixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuL2VudGl0eS9DdXJyZW50VXNlclwiO1xuXG5leHBvcnQgY29uc3QgZ3JhcGhxbEhhbmRsZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgc2NoZW1hLFxuICBpbnRyb3NwZWN0aW9uOiB0cnVlLFxuICBjb250ZXh0OiAoeyBldmVudCwgY29udGV4dCB9KSA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGhlYWRlcnM6IGV2ZW50LmhlYWRlcnMsXG4gICAgICBtdWx0aVZhbHVlSGVhZGVyczogZXZlbnQubXVsdGlWYWx1ZUhlYWRlcnMsXG4gICAgICB3YkNsb3VkOiBuZXcgV2hpdGVicmlja0Nsb3VkKCksXG4gICAgfTtcbiAgfSxcbn0pLmNyZWF0ZUhhbmRsZXIoKTtcblxuZXhwb3J0IGNvbnN0IGxvZzogTG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gIG1pbkxldmVsOiBcImRlYnVnXCIsXG59KTtcblxuZXhwb3J0IGNsYXNzIFdoaXRlYnJpY2tDbG91ZCB7XG4gIGRhbCA9IG5ldyBEQUwoKTtcblxuICBwdWJsaWMgZXJyKHJlc3VsdDogU2VydmljZVJlc3VsdCk6IEVycm9yIHtcbiAgICByZXR1cm4gYXBvbGxvRXJyKHJlc3VsdCk7XG4gIH1cblxuICAvLyBvbmx5IGFzeW5jIGZvciB0ZXN0aW5nIC0gZm9yIHRoZSBtb3N0IHBhcnQgc3RhdGljXG4gIHB1YmxpYyBhc3luYyB1aWRGcm9tSGVhZGVycyhcbiAgICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vbG9nLmluZm8oXCI9PT09PT09PT09IEhFQURFUlM6IFwiICsgSlNPTi5zdHJpbmdpZnkoaGVhZGVycykpO1xuICAgIGNvbnN0IGhlYWRlcnNMb3dlckNhc2UgPSBPYmplY3QuZW50cmllcyhoZWFkZXJzKS5yZWR1Y2UoXG4gICAgICAoYWNjOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBba2V5LCB2YWxdKSA9PiAoXG4gICAgICAgIChhY2Nba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsKSwgYWNjXG4gICAgICApLFxuICAgICAge31cbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICAvLyBpZiB4LWhhc3VyYS1hZG1pbi1zZWNyZXQgaXMgcHJlc2VudCBhbmQgdmFsaWQgaGFzdXJhIHNldHMgcm9sZSB0byBhZG1pblxuICAgIGlmIChcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXS50b0xvd2VyQ2FzZSgpID09IFwiYWRtaW5cIlxuICAgICkge1xuICAgICAgbG9nLmRlYnVnKFwiPT09PT09PT09PSBGT1VORCBBRE1JTiBVU0VSXCIpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogVXNlci5TWVNfQURNSU5fSUQsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdXG4gICAgKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJCeUVtYWlsKGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXSk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFRFU1QgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSB7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHBhcnNlSW50KGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBgdWlkRnJvbUhlYWRlcnM6IENvdWxkIG5vdCBmaW5kIGhlYWRlcnMgZm9yIEFkbWluLCBUZXN0IG9yIFVzZXIgaW46ICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgaGVhZGVyc1xuICAgICAgICApfWAsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGNsb3VkQ29udGV4dCgpOiBvYmplY3Qge1xuICAgIHJldHVybiB7XG4gICAgICBkZWZhdWx0Q29sdW1uVHlwZXM6IENvbHVtbi5DT01NT05fVFlQRVMsXG4gICAgICByb2xlczoge1xuICAgICAgICBvcmdhbml6YXRpb25zOiBSb2xlLlNZU1JPTEVTX09SR0FOSVpBVElPTlMsXG4gICAgICAgIHNjaGVtYXM6IFJvbGUuU1lTUk9MRVNfU0NIRU1BUyxcbiAgICAgICAgdGFibGVzOiBSb2xlLlNZU1JPTEVTX1RBQkxFUyxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRlc3QgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcmVzZXRUZXN0RGF0YSgpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHJlc2V0VGVzdERhdGEoKWApO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCB1bmRlZmluZWQsIFwidGVzdF8lXCIpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVTY2hlbWEoc2NoZW1hLm5hbWUsIHRydWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlVGVzdFVzZXJzKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IEF1dGggPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYXV0aChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckF1dGhJZDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBoYXN1cmFVc2VySWQ6IG51bWJlcjtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlcklkRnJvbUF1dGhJZCh1c2VyQXV0aElkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGhhc3VyYVVzZXJJZCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICBcIlgtSGFzdXJhLUFsbG93ZWQtUm9sZXNcIjogW1wid2J1c2VyXCJdLFxuICAgICAgICBcIlgtSGFzdXJhLURlZmF1bHQtUm9sZVwiOiBcIndidXNlclwiLFxuICAgICAgICBcIlgtSGFzdXJhLVVzZXItSWRcIjogaGFzdXJhVXNlcklkLFxuICAgICAgICBcIlgtSGFzdXJhLVNjaGVtYS1OYW1lXCI6IHNjaGVtYU5hbWUsXG4gICAgICAgIFwiWC1IYXN1cmEtQXV0aGVudGljYXRlZC1BdFwiOiBEYXRlKCkudG9TdHJpbmcoKSxcbiAgICAgIH0sXG4gICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gUm9sZXMgJiBQZXJtaXNzaW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByb2xlQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC5yb2xlQnlOYW1lKG5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgdGFibGU6IFRhYmxlLFxuICAgIGRlbGV0ZU9ubHk/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKHRhYmxlLmlkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0OiBPcmdhbml6YXRpb24gfCBTY2hlbWEgfCBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBzZXRSb2xlKCR7dXNlcklkc30sJHtyb2xlTmFtZX0sJHtyb2xlTGV2ZWx9LCR7SlNPTi5zdHJpbmdpZnkob2JqZWN0KX0pYFxuICAgICk7XG4gICAgaWYgKCFSb2xlLmlzUm9sZShyb2xlTmFtZSwgcm9sZUxldmVsKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGAke3JvbGVOYW1lfSBpcyBub3QgYSB2YWxpZCBuYW1lIGZvciBhbiAke3JvbGVMZXZlbH0gUm9sZS5gLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiOlxuICAgICAgICBzd2l0Y2ggKHJvbGVOYW1lKSB7XG4gICAgICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvbl91c2VyXCI6XG4gICAgICAgICAgICAvLyBhcmUgYW55IG9mIHRoZXNlIHVzZXIgY3VycmVudGx5IGFkbWlucyBnZXR0aW5nIGRlbW90ZWQ/XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvblVzZXJzKG9iamVjdC5uYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgICAgICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBsb2cuaW5mbyhgQEBAQEBAQEBAQEBAQEBAQEBAIHJlc3VsdCAke0pTT04uc3RyaW5naWZ5KHJlc3VsdCl9YCk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAgICAgICAob3JnYW5pemF0aW9uVXNlcjogeyB1c2VySWQ6IG51bWJlciB9KSA9PiBvcmdhbml6YXRpb25Vc2VyLnVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGRlbW90ZWRBZG1pbnM6IG51bWJlcltdID0gdXNlcklkcy5maWx0ZXIoKGlkOiBudW1iZXIpID0+XG4gICAgICAgICAgICAgIGN1cnJlbnRBZG1pbklkcy5pbmNsdWRlcyhpZClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBsb2cuaW5mbyhgQEBAQEBAQEBAQEBAQEBAQEBAIHVzZXJJZHMgJHt1c2VySWRzfWApO1xuICAgICAgICAgICAgbG9nLmluZm8oYEBAQEBAQEBAQEBAQEBAQEBAQCBjdXJyZW50QWRtaW5JZHMgJHtjdXJyZW50QWRtaW5JZHN9YCk7XG4gICAgICAgICAgICBsb2cuaW5mbyhgQEBAQEBAQEBAQEBAQEBAQEBAIGRlbW90ZWRBZG1pbnMgJHtjdXJyZW50QWRtaW5JZHN9YCk7XG4gICAgICAgICAgICBpZiAoZGVtb3RlZEFkbWlucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIC8vIGNvbXBsZXRlbHkgcmVtb3ZlIHRoZW0gKHdpbGwgcmFpc2UgZXJyb3IgaWYgbm8gYWRtaW5zKVxuICAgICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgICAgICAgICAgICBvYmplY3QubmFtZSxcbiAgICAgICAgICAgICAgICBkZW1vdGVkQWRtaW5zXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBhZGQgb3JnbmFpemF0aW9uX3VzZXJcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiOlxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzISkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICAgICAgICAgICAgb2JqZWN0LmlkLFxuICAgICAgICAgICAgICBSb2xlLk9SR0FOSVpBVElPTl9UT19TQ0hFTUFfUk9MRV9NQVAsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdXNlcklkc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyEpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKG9iamVjdC5pZCk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmlkLFxuICAgICAgICAgICAgICAgIFJvbGUuU0NIRU1BX1RPX1RBQkxFX1JPTEVfTUFQLFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB1c2VySWRzXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyEpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIjpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiOlxuICAgICAgICAvLyBhZGQgc2NoZW1hX3VzZXJcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzISkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgLy8gQ2hhbmdpbmcgcm9sZSBhdCB0aGUgc2NoZW1hIGxldmVsIHJlc2V0cyBhbGxcbiAgICAgICAgLy8gdGFibGUgcm9sZXMgdG8gdGhlIHNjaGVtYSBkZWZhdWx0IGluaGVyaXRlbmNlXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgICAgICAgIG9iamVjdC5pZCxcbiAgICAgICAgICBSb2xlLlNDSEVNQV9UT19UQUJMRV9ST0xFX01BUCwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdXNlcklkc1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUodXNlcklkcywgcm9sZUxldmVsLCBvYmplY3RJZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiOlxuICAgICAgICAvLyBEZWxldGUgc2NoZW1hIGFkbWlucyBpbXBsaWNpdGx5IHNldCBmcm9tIG9yZ2FuaXphdGlvbiBhZG1pbnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIFwic2NoZW1hXCIsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIG9iamVjdElkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgb3JnYW5pemF0aW9uIGlkXG4gICAgICAgICAgW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzISkgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgLy8gRGVsZXRlIHRhYmxlIGFkbWlucyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSBhZG1pbnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihvYmplY3RJZCk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZShcbiAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICBcInRhYmxlXCIsXG4gICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICBzY2hlbWEuaWQsIC8vIHBhcmVudE9iamVjdElkIGllIHRoZSBzY2hlbWEgaWRcbiAgICAgICAgICAgIFtcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCJdXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MhKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiOlxuICAgICAgICAvLyBEZWxldGUgdGFibGUgdXNlcnMgaW1wbGljaXRseSBzZXQgZnJvbSBzY2hlbWEgdXNlcnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIFwidGFibGVcIixcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgb2JqZWN0SWQsIC8vIHBhcmVudE9iamVjdElkIGllIHRoZSBzY2hlbWEgaWRcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNDSEVNQV9UT19UQUJMRV9ST0xFX01BUClcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0VXNlcnMoKWApO1xuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5SWRzKGlkczogbnVtYmVyW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnMoaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlJZChpZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5SWRzKFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlFbWFpbHModXNlckVtYWlsczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnModW5kZWZpbmVkLCB1c2VyRW1haWxzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChlbWFpbDogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKFtlbWFpbF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbZW1haWxdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvLyBUQkQ6IGF1dGhlbnRpY2F0aW9uLCBzYXZlIHBhc3N3b3JkXG4gICAgcmV0dXJuIHRoaXMuZGFsLmNyZWF0ZVVzZXIoZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZVVzZXIoaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IE9yZ2FuaXphdGlvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9ucyhcbiAgICBvcmdhbml6YXRpb25JZHM/OiBudW1iZXJbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lcz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnMoXG4gICAgICBvcmdhbml6YXRpb25JZHMsXG4gICAgICBvcmdhbml6YXRpb25OYW1lcyxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeUlkcyhpZHM6IG51bWJlcltdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyhpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5SWQoaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uc0J5SWRzKFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uc0J5TmFtZXMobmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyh1bmRlZmluZWQsIG5hbWVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zQnlOYW1lcyhbbmFtZV0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lUGF0dGVybihcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9ucyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZVBhdHRlcm4pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVPcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwub3JnYW5pemF0aW9uc0J5VXNlcnMoW2NVLmlkXSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlciA9IEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKHRoaXMpLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IGNoZWNrTmFtZVJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG5hbWUpO1xuICAgIGlmIChjaGVja05hbWVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTkFNRV9UQUtFTlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIC8vIFdCX09SR0FOSVpBVElPTl9OT1RfRk9VTkQgaXMgdGhlIGRlc2lyZWQgcmVzdWx0XG4gICAgfSBlbHNlIGlmIChjaGVja05hbWVSZXN1bHQud2JDb2RlICE9IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiKSB7XG4gICAgICByZXR1cm4gY2hlY2tOYW1lUmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCBjcmVhdGVPcmdSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVPcmdhbml6YXRpb24obmFtZSwgbGFiZWwpO1xuICAgIGlmICghY3JlYXRlT3JnUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjcmVhdGVPcmdSZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBuYW1lLFxuICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgICAgW2NVLmlkXVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gY3JlYXRlT3JnUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbmV3TmFtZT86IHN0cmluZyxcbiAgICBuZXdMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlT3JnYW5pemF0aW9uKG5hbWUsIG5ld05hbWUsIG5ld0xhYmVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVPcmdhbml6YXRpb24obmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhuYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgIFwib3JnYW5pemF0aW9uX3VzZXJcIixcbiAgICAgIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIixcbiAgICBdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfVVNFUl9FTVBUWVwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKClgKTtcbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IE9yZ2FuaXphdGlvbiBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25Vc2VycyhcbiAgICBuYW1lPzogc3RyaW5nLFxuICAgIGlkPzogbnVtYmVyLFxuICAgIHJvbGVzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChuYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShuYW1lKTtcbiAgICB9IGVsc2UgaWYgKGlkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5SWQoaWQpO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgaWYgKHJvbGVzICYmICFSb2xlLmFyZVJvbGVzKHJvbGVzKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJvcmdhbml6YXRpb25Vc2Vyczogcm9sZXMgY29udGFpbnMgb25lIG9yIG1vcmUgdW5yZWNvZ25pemVkIHN0cmluZ3NcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5vcmdhbml6YXRpb25Vc2VycyhuYW1lLCBpZCwgcm9sZXMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgcm9sZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZSgke29yZ2FuaXphdGlvbk5hbWV9LCR7cm9sZX0sJHt1c2VySWRzfSwke3VzZXJFbWFpbHN9KWBcbiAgICApO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG9yZ2FuaXphdGlvbk5hbWUpO1xuICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VySWRzRm91bmQ6IG51bWJlcltdID0gW107XG4gICAgbGV0IHVzZXJzUmVxdWVzdGVkOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW107XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHVzZXJzUmVxdWVzdGVkID0gdXNlcklkcztcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUlkcyh1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHVzZXJzUmVxdWVzdGVkID0gdXNlckVtYWlscztcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcyB8fCAhcmVzdWx0LnBheWxvYWQpIHJldHVybiByZXN1bHQ7XG4gICAgdXNlcklkc0ZvdW5kID0gcmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgaWYgKHVzZXJzUmVxdWVzdGVkLmxlbmd0aCAhPSB1c2VySWRzRm91bmQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IFtcbiAgICAgICAgICBgUmVxdWVzdGVkICR7dXNlcnNSZXF1ZXN0ZWQubGVuZ3RofTogJHt1c2Vyc1JlcXVlc3RlZC5qb2luKFwiLFwiKX1gLFxuICAgICAgICAgIGBGb3VuZCAke3VzZXJJZHNGb3VuZC5sZW5ndGh9OiAke3VzZXJJZHNGb3VuZC5qb2luKFwiLFwiKX1gLFxuICAgICAgICBdLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgIHVzZXJJZHNGb3VuZCxcbiAgICAgIHJvbGUsXG4gICAgICBcIm9yZ2FuaXphdGlvblwiLFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgbGV0IHVzZXJJZHNUb0JlUmVtb3ZlZDogbnVtYmVyW10gPSBbXTtcbiAgICBpZiAodXNlcklkcykgdXNlcklkc1RvQmVSZW1vdmVkID0gdXNlcklkcztcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHVzZXJJZHNUb0JlUmVtb3ZlZCA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkXG4gICAgICApO1xuICAgIH1cbiAgICAvLyBjaGVjayBub3QgYWxsIHRoZSBhZG1pbnMgd2lsbCBiZSByZW1vdmVkXG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2Vycyhvcmdhbml6YXRpb25OYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGFsbEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG5cbiAgICBpZiAoXG4gICAgICBhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzVG9CZVJlbW92ZWQuaW5jbHVkZXMoZWxlbSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT19BRE1JTlNcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG9yZ2FuaXphdGlvbk5hbWUpO1xuICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgdXNlcklkc1RvQmVSZW1vdmVkLFxuICAgICAgXCJvcmdhbml6YXRpb25cIixcbiAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gU2NoZW1hcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzKFxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHNjaGVtYU5hbWVzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2NoZW1hcyhcbiAgICAgIHNjaGVtYUlkcyxcbiAgICAgIHNjaGVtYU5hbWVzLFxuICAgICAgc2NoZW1hTmFtZVBhdHRlcm5cbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5SWRzKGlkczogbnVtYmVyW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFzKGlkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlJZChpZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlJZHMoW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2lkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlOYW1lcyhuYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgbmFtZXMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXNCeU5hbWVzKFtuYW1lXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeU5hbWVQYXR0ZXJuKFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBuYW1lUGF0dGVybik7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVQYXR0ZXJuXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5VXNlck93bmVyKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJPd25lcih1c2VySWQsIHVzZXJFbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgICBvcmdhbml6YXRpb25JZCxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXJBZG1pbih1c2VySWQsIHVzZXJFbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVNjaGVtYXMoY1U6IEN1cnJlbnRVc2VyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJzKFtjVS5pZF0pO1xuICB9XG5cbiAgLy8gSWYgb3JnYW5pemF0aW9uT3duZXIgb3JnYW5pemF0aW9uIGFkbWlucyBhcmUgaW1wbGljaXRseSBncmFudGVkIHNjaGVtYSBhZG1pbiByb2xlc1xuICBwdWJsaWMgYXN5bmMgY3JlYXRlU2NoZW1hKFxuICAgIGNVOiBDdXJyZW50VXNlciA9IEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKHRoaXMpLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBjcmVhdGVTY2hlbWEoJHtjVS5pZH0sJHtuYW1lfSwke2xhYmVsfSwke29yZ2FuaXphdGlvbk93bmVySWR9LCR7b3JnYW5pemF0aW9uT3duZXJOYW1lfSlgXG4gICAgKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgbGV0IHVzZXJPd25lcklkOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgLy8gcnVuIGNoZWNrcyBmb3Igb3JnYW5pemF0aW9uIG93bmVyXG4gICAgaWYgKG9yZ2FuaXphdGlvbk93bmVySWQgfHwgb3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICBpZiAoIW9yZ2FuaXphdGlvbk93bmVySWQgJiYgb3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKG9yZ2FuaXphdGlvbk93bmVyTmFtZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgY1UuaXNOb3RTeXNBZG1pbigpICYmXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgJiZcbiAgICAgICAgY1UuaXNOb3RJbk9yZ2FuaXphdGlvbihvcmdhbml6YXRpb25Pd25lcklkKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9JTl9PUkdcIixcbiAgICAgICAgICB2YWx1ZXM6IFtjVS50b1N0cmluZygpLCBvcmdhbml6YXRpb25Pd25lcklkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB1c2VyT3duZXJJZCA9IGNVLmlkO1xuICAgIH1cbiAgICAvLyBDaGVjayBuYW1lXG4gICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcInBnX1wiKSB8fCBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5pbmNsdWRlcyhuYW1lKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9CQURfU0NIRU1BX05BTUVcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVTY2hlbWEoXG4gICAgICBuYW1lLFxuICAgICAgbGFiZWwsXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgdXNlck93bmVySWRcbiAgICApO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgaWYgKG9yZ2FuaXphdGlvbk93bmVySWQpIHtcbiAgICAgIC8vIElmIG93bmVyIGlzIGFuIG9yZ2FuaXphdGlvbiBhbmQgY3VycmVudCB1c2VyIGlzIG5vdCBhbiBhZG1pbiBvZiB0aGUgb3JnYW5pemF0aW9uLFxuICAgICAgLy8gYWRkIHRoZSB1c2VyIGFzIGEgc2NoZW1hIGFkbWluIHNvIHRoZXkgZG9udCBsb3NlIGFjY2Vzc1xuICAgICAgaWYgKFxuICAgICAgICBjVS5pc05vdFN5c0FkbWluKCkgJiZcbiAgICAgICAgY1UuaXNOb3QoXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLCBvcmdhbml6YXRpb25Pd25lcklkKVxuICAgICAgKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgICBbY1UuaWRdLFxuICAgICAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgLy8gRXZlcnkgb3JnYW5pemF0aW9uIGFkbWluIGlzIGltcGxpY2l0bHkgYWxzbyBhIHNjaGVtYSBhZG1pblxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBSb2xlLk9SR0FOSVpBVElPTl9UT19TQ0hFTUFfUk9MRV9NQVAsXG4gICAgICAgIFtzY2hlbWFSZXN1bHQucGF5bG9hZC5pZF1cbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIElmIG93bmVyIGlzIGEgdXNlciwgYWRkIHRoZW0gdG8gc2NoZW1hX3VzZXJzIHRvIHNhdmUgc2V0dGluZ3NcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgW2NVLmlkXSxcbiAgICAgICAgXCJzY2hlbWFfb3duZXJcIixcbiAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHJlbW92ZU9yRGVsZXRlU2NoZW1hKCR7c2NoZW1hTmFtZX0sJHtkZWx9KWApO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRydWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUsIGRlbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVBbGxVc2Vyc0Zyb21TY2hlbWEoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwucmVtb3ZlT3JEZWxldGVTY2hlbWEoc2NoZW1hTmFtZSwgZGVsKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFVc2VycyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCB1c2VySWRzID0gdW5kZWZpbmVkO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyh1c2VyRW1haWxzKTtcbiAgICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgICAgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFVc2VycyhzY2hlbWFOYW1lLCB1c2VySWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IHN0cmluZ1tdLFxuICAgIHJvbGU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGlmICh1c2Vyc1Jlc3VsdC5wYXlsb2FkLmxlbmd0aCAhPSB1c2VyRW1haWxzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgdmFsdWVzOiB1c2VyRW1haWxzLmZpbHRlcihcbiAgICAgICAgICAoeDogc3RyaW5nKSA9PiAhdXNlcnNSZXN1bHQucGF5bG9hZC5pbmNsdWRlcyh4KVxuICAgICAgICApLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Um9sZSh1c2VySWRzLCByb2xlLCBcInNjaGVtYVwiLCBzY2hlbWFSZXN1bHQucGF5bG9hZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlU2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKHNjaGVtYU5hbWUpO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgaWYgKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZCAmJlxuICAgICAgdXNlcklkcy5pbmNsdWRlcyhzY2hlbWFSZXN1bHQucGF5bG9hZC51c2VyX293bmVyX2lkKVxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfVVNFUl9PV05FUlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgdXNlcklkcyxcbiAgICAgIFwic2NoZW1hXCIsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHdpdGhDb2x1bW5zPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKHdpdGhDb2x1bW5zKSB7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHRhYmxlLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGFkZE9yQ3JlYXRlVGFibGUoJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHt0YWJsZUxhYmVsfSwke2NyZWF0ZX0pYFxuICAgICk7XG4gICAgaWYgKCFjcmVhdGUpIGNyZWF0ZSA9IGZhbHNlO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICB0YWJsZUxhYmVsLFxuICAgICAgY3JlYXRlXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUodGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLnNjaGVtYU5hbWUgPSBzY2hlbWFOYW1lO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgLy8gMS4gcmVtb3ZlL2RlbGV0ZSBjb2x1bW5zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBkZWwsXG4gICAgICAgIHRydWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIDMuIHJlbW92ZSB1c2VyIHNldHRpbmdzXG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucmVtb3ZlQWxsVGFibGVVc2Vycyh0YWJsZVJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkLCB0cnVlKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIDQuIHJlbW92ZS9kZWxldGUgdGhlIHRhYmxlXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBuZXdUYWJsZU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3VGFibGVMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVzKHNjaGVtYU5hbWUsIGZhbHNlKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBleGlzdGluZ1RhYmxlTmFtZXMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICAgKTtcbiAgICAgIGlmIChleGlzdGluZ1RhYmxlTmFtZXMuaW5jbHVkZXMobmV3VGFibGVOYW1lKSkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX1RBQkxFX05BTUVfRVhJU1RTXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVMYWJlbFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZEFsbEV4aXN0aW5nVGFibGVzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCB0YWJsZU5hbWVzID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgdGFibGVOYW1lcykge1xuICAgICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdi50aXRsZUNhc2UodGFibGVOYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiIFwiKSksXG4gICAgICAgIGZhbHNlXG4gICAgICApO1xuICAgICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlckNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBjb2x1bW5zID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgICAgdi50aXRsZUNhc2UoY29sdW1uLm5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCIgXCIpKSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgcmVtb3ZlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgXCIlXCIsXG4gICAgICBcIiVcIixcbiAgICAgIFwiQUxMXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcmVsYXRpb25zaGlwczogQ29uc3RyYWludElkW10gPSByZXN1bHQucGF5bG9hZDtcbiAgICBpZiAocmVsYXRpb25zaGlwcy5sZW5ndGggPiAwKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlbGF0aW9uc2hpcCBvZiByZWxhdGlvbnNoaXBzKSB7XG4gICAgICAgIGlmIChyZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lICYmIHJlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lKSB7XG4gICAgICAgICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICAgICAgICBpZiAocmVtb3ZlKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC50YWJsZU5hbWUsXG4gICAgICAgICAgICAgIFtyZWxhdGlvbnNoaXAuY29sdW1uTmFtZV0sXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWUsXG4gICAgICAgICAgICAgIFtyZWxhdGlvbnNoaXAucmVsQ29sdW1uTmFtZV1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgICAgICBcImFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzOiBDb25zdHJhaW50SWQgbXVzdCBoYXZlIHJlbFRhYmxlTmFtZSBhbmQgcmVsQ29sdW1uTmFtZVwiLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnModGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyBkb250IGFkZCBwZXJtaXNzaW9ucyBmb3IgdGFibGVzIHdpdGggbm8gY29sdW1uc1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPT0gMCkgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgY29sdW1uTmFtZXM6IHN0cmluZ1tdID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25DaGVja0FuZFR5cGUgb2YgUm9sZS5oYXN1cmFUYWJsZVBlcm1pc3Npb25DaGVja3NBbmRUeXBlcyhcbiAgICAgIHRhYmxlLmlkXG4gICAgKSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZVBlcm1pc3Npb24oXG4gICAgICAgIHRhYmxlLnNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlLm5hbWUsXG4gICAgICAgIHBlcm1pc3Npb25DaGVja0FuZFR5cGUucGVybWlzc2lvbkNoZWNrLFxuICAgICAgICBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlLnBlcm1pc3Npb25UeXBlLFxuICAgICAgICBcIndidXNlclwiLFxuICAgICAgICBjb2x1bW5OYW1lc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBhZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICAvLyBJZiB0aGlzIHRhYmxlIG5vIGxvbmdlciBoYXMgYW55IGNvbHVtbnMsIHRoZXJlIHdpbGwgYmUgbm8gcGVybWlzc2lvbnNcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBwYXlsb2FkOiB0cnVlIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5QW5kVHlwZSBvZiBSb2xlLnRhYmxlUGVybWlzc2lvbktleXNBbmRUeXBlcyhcbiAgICAgIHRhYmxlLmlkXG4gICAgKSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRlbGV0ZVBlcm1pc3Npb24oXG4gICAgICAgIHRhYmxlLnNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlLm5hbWUsXG4gICAgICAgIHBlcm1pc3Npb25LZXlBbmRUeXBlLnR5cGUsXG4gICAgICAgIFwid2J1c2VyXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gUGFzcyBlbXB0eSBjb2x1bW5OYW1lc1tdIHRvIGNsZWFyXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmICghZGVsKSBkZWwgPSBmYWxzZTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucHJpbWFyeUtleXMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nQ29uc3RyYWludE5hbWVzID0gT2JqZWN0LnZhbHVlcyhyZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKGRlbCkge1xuICAgICAgaWYgKGV4aXN0aW5nQ29uc3RyYWludE5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gbXVsdGlwbGUgY291bG1uIHByaW1hcnkga2V5cyB3aWxsIGFsbCBoYXZlIHNhbWUgY29uc3RyYWludCBuYW1lXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgZXhpc3RpbmdDb25zdHJhaW50TmFtZXNbMF0gYXMgc3RyaW5nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfUEtfRVhJU1RTXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZVByaW1hcnlLZXkoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXNcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJDUkVBVEVcIjtcbiAgICBpZiAoIWNyZWF0ZSkgb3BlcmF0aW9uID0gXCJBRERcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJERUxFVEVcIjtcbiAgICBpZiAoIWRlbCkgb3BlcmF0aW9uID0gXCJSRU1PVkVcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgW10sXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gb3BlcmF0aW9uID0gXCJBRER8Q1JFQVRFfFJFTU9WRXxERUxFVEVcIlxuICBwdWJsaWMgYXN5bmMgc2V0Rm9yZWlnbktleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXNbMF0sXG4gICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nRm9yZWlnbktleXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGNvbnN0cmFpbnRJZCBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb25zdHJhaW50SWQuY29sdW1uTmFtZV0gPVxuICAgICAgICBjb25zdHJhaW50SWQuY29uc3RyYWludE5hbWU7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdGb3JlaWduS2V5cykuaW5jbHVkZXMoY29sdW1uTmFtZSkpIHtcbiAgICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIlJFTU9WRVwiIHx8IG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRyb3BSZWxhdGlvbnNoaXBzKFxuICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgIHBhcmVudFRhYmxlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29sdW1uTmFtZV0gYXMgc3RyaW5nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgICB3YkNvZGU6IFwiV0JfRktfRVhJU1RTXCIsXG4gICAgICAgICAgICB2YWx1ZXM6IFtjb2x1bW5OYW1lXSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvcGVyYXRpb24gPT0gXCJBRERcIiB8fCBvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICAgIHBhcmVudENvbHVtbk5hbWVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgcGFyZW50VGFibGVOYW1lIC8vIGF1dGhvcnNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lcyAvLyBhdXRob3JfaWRcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGU6IFRhYmxlKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnModGFibGUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9ucyh0YWJsZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2Vycz09PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHVzZXJJZHMgPSB1bmRlZmluZWQ7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRhYmxlVXNlcnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VySWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBhZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgIHRhYmxlLnNjaGVtYUlkLFxuICAgICAgUm9sZS5TQ0hFTUFfVE9fVEFCTEVfUk9MRV9NQVAsXG4gICAgICBbdGFibGUuaWRdXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRUYWJsZVVzZXJzUm9sZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogW3N0cmluZ10sXG4gICAgcm9sZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGlmICh1c2Vyc1Jlc3VsdC5wYXlsb2FkLmxlbmd0aCAhPSB1c2VyRW1haWxzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgdmFsdWVzOiB1c2VyRW1haWxzLmZpbHRlcihcbiAgICAgICAgICAoeDogc3RyaW5nKSA9PiAhdXNlcnNSZXN1bHQucGF5bG9hZC5pbmNsdWRlcyh4KVxuICAgICAgICApLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Um9sZSh1c2VySWRzLCByb2xlLCBcInRhYmxlXCIsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICB9XG5cbiAgLy8gbm90IHVzZWQgeWV0XG4gIHB1YmxpYyBhc3luYyByZW1vdmVVc2Vyc0Zyb21UYWJsZShcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHModXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgLy8gVEJEIGRvIGFueSBjaGVja3MgYWdhaW5zdCBzY2hlbWFcbiAgICAvLyBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICAvLyAvLyBjaGVjayBub3QgYWxsIHRoZSBhZG1pbnMgd2lsbCBiZSByZW1vdmVkXG4gICAgLy8gY29uc3QgYWRtaW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2Vycyhvcmdhbml6YXRpb25OYW1lLCBbXG4gICAgLy8gICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgLy8gXSk7XG4gICAgLy8gaWYgKCFhZG1pbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGFkbWluc1Jlc3VsdDtcbiAgICAvLyBjb25zdCBhbGxBZG1pbklkcyA9IGFkbWluc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAvLyAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgIC8vICk7XG4gICAgLy8gaWYgKGFsbEFkbWluSWRzLmV2ZXJ5KChlbGVtOiBudW1iZXIpID0+IHVzZXJJZHMuaW5jbHVkZXMoZWxlbSkpKSB7XG4gICAgLy8gICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAvLyAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT19BRE1JTlNcIixcbiAgICAvLyAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgLy8gfVxuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIHVzZXJzUmVzdWx0LnBheWxvYWQsXG4gICAgICBcInRhYmxlXCIsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbCh1c2VyRW1haWwpO1xuICAgIGlmICghdXNlclJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlclJlc3VsdDtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHVzZXJSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IENvbHVtbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBwS0NvbHNDb25zdHJhaW50czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHBLQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMocEtDb2xzQ29uc3RyYWludHMpO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgY29sdW1uIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICBjb2x1bW4uaXNQcmltYXJ5S2V5ID0gcEtDb2x1bW5OYW1lcy5pbmNsdWRlcyhjb2x1bW4ubmFtZSk7XG4gICAgICBjb25zdCBmb3JlaWduS2V5c1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgICApO1xuICAgICAgaWYgKCFmb3JlaWduS2V5c1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29sdW1uLmZvcmVpZ25LZXlzID0gZm9yZWlnbktleXNSZXN1bHQucGF5bG9hZDtcbiAgICAgIGNvbnN0IHJlZmVyZW5jZXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgXCJSRUZFUkVOQ0VTXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlZmVyZW5jZXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbHVtbi5yZWZlcmVuY2VkQnkgPSByZWZlcmVuY2VzUmVzdWx0LnBheWxvYWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5MYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW4sXG4gICAgY29sdW1uVHlwZT86IHN0cmluZyxcbiAgICBza2lwVHJhY2tpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGFkZE9yQ3JlYXRlQ29sdW1uKCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZX0sJHtjb2x1bW5MYWJlbH0sJHtjcmVhdGV9LCR7Y29sdW1uVHlwZX0sJHtza2lwVHJhY2tpbmd9KWBcbiAgICApO1xuICAgIGlmICghY3JlYXRlKSBjcmVhdGUgPSBmYWxzZTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIGNvbHVtbkxhYmVsLFxuICAgICAgY3JlYXRlLFxuICAgICAgY29sdW1uVHlwZVxuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmICFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyh0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIE11c3QgZW50ZXIgYW5kIGV4aXQgd2l0aCB0cmFja2VkIHRhYmxlLCByZWdhcmRsZXNzIG9mIGlmIHRoZXJlIGFyZSBjb2x1bW5zXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW4sXG4gICAgc2tpcFRyYWNraW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlT3JEZWxldGVDb2x1bW4oJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke2RlbH0pYFxuICAgICk7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAoIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgZGVsXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIG5ld0NvbHVtbk5hbWU/OiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3VHlwZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvLyBUQkQ6IGlmIHRoaXMgaXMgYSBma1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nQ29sdW1uTmFtZXMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICAgKTtcbiAgICAgIGlmIChleGlzdGluZ0NvbHVtbk5hbWVzLmluY2x1ZGVzKG5ld0NvbHVtbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfQ09MVU1OX05BTUVfRVhJU1RTXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnModGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgIG5ld1R5cGVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuXG4vKipcbiAqID09PT09PT09PT0gRXJyb3IgSGFuZGxpbmcgPT09PT09PT09PVxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJSZXN1bHQocmVzdWx0PzogU2VydmljZVJlc3VsdCk6IFNlcnZpY2VSZXN1bHQge1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IFwiUmVzdWx0IGhhcyBub3QgYmVlbiBhc3NpZ25lZFwiLFxuICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgfVxuICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT0gdHJ1ZSkge1xuICAgIHJlc3VsdCA9IHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQgZXJyUmVzdWx0OiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiLFxuICAgIH07XG4gIH0gZWxzZSBpZiAoIShcInN1Y2Nlc3NcIiBpbiByZXN1bHQpKSB7XG4gICAgcmVzdWx0LnN1Y2Nlc3MgPSBmYWxzZTtcbiAgfVxuICBpZiAoIXJlc3VsdC5tZXNzYWdlICYmIHJlc3VsdC53YkNvZGUpIHtcbiAgICByZXN1bHQubWVzc2FnZSA9IHVzZXJNZXNzYWdlc1tyZXN1bHQud2JDb2RlXVswXTtcbiAgICBpZiAoIXJlc3VsdC5tZXNzYWdlKSB7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBgV2hpdGVicmlja0Nsb3VkIGVyclJlc3VsdDogQ291bGQgbm90IGZpbmQgbWVzc2FnZSBmb3Igd2JDb2RlPSR7cmVzdWx0LndiQ29kZX1gLFxuICAgICAgfTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlc3VsdC52YWx1ZXMpIHtcbiAgICByZXN1bHQubWVzc2FnZSA9IGAke3Jlc3VsdC5tZXNzYWdlfSBWYWx1ZXM6ICR7cmVzdWx0LnZhbHVlcy5qb2luKFwiLCBcIil9YDtcbiAgICBkZWxldGUgcmVzdWx0LnZhbHVlcztcbiAgfVxuICBpZiAoXG4gICAgIXJlc3VsdC5hcG9sbG9FcnJvckNvZGUgJiZcbiAgICByZXN1bHQud2JDb2RlICYmXG4gICAgT2JqZWN0LmtleXModXNlck1lc3NhZ2VzKS5pbmNsdWRlcyhyZXN1bHQud2JDb2RlKSAmJlxuICAgIHVzZXJNZXNzYWdlc1tyZXN1bHQud2JDb2RlXS5sZW5ndGggPT0gMlxuICApIHtcbiAgICByZXN1bHQuYXBvbGxvRXJyb3JDb2RlID0gdXNlck1lc3NhZ2VzW3Jlc3VsdC53YkNvZGVdWzFdO1xuICB9IGVsc2UgaWYgKFxuICAgICFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlICYmXG4gICAgcmVzdWx0LndiQ29kZSAmJlxuICAgICFPYmplY3Qua2V5cyh1c2VyTWVzc2FnZXMpLmluY2x1ZGVzKHJlc3VsdC53YkNvZGUpXG4gICkge1xuICAgIHJlc3VsdCA9IHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogYFdoaXRlYnJpY2tDbG91ZCBlcnI6IENvdWxkIG5vdCBmaW5kIGFwb2xsb0Vycm9yQ29kZSBmb3Igd2JDb2RlPSR7cmVzdWx0LndiQ29kZX1gLFxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCI7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwb2xsb0VycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gIHJlc3VsdCA9IGVyclJlc3VsdChyZXN1bHQpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKFxuICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQuZXJyOiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiXG4gICAgKTtcbiAgfVxuICBjb25zdCBkZXRhaWxzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGlmICghcmVzdWx0Lm1lc3NhZ2UpIHJlc3VsdC5tZXNzYWdlID0gXCJVbmtub3duIGVycm9yLlwiO1xuICBpZiAocmVzdWx0LnJlZkNvZGUpIGRldGFpbHMucmVmQ29kZSA9IHJlc3VsdC5yZWZDb2RlO1xuICBpZiAocmVzdWx0LndiQ29kZSkgZGV0YWlscy53YkNvZGUgPSByZXN1bHQud2JDb2RlO1xuICByZXR1cm4gbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCByZXN1bHQuYXBvbGxvRXJyb3JDb2RlLCBkZXRhaWxzKTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10b29sc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10eXBlLWpzb25cIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImxvZGFzaFwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ2b2NhXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2hpdGVicmljay1jbG91ZC50c1wiKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBZUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBRUE7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7OztBQWNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7QUFlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQU1BOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7O0FBV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7O0FBZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQXhxREE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDakJBO0FBc0JBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQTFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDYkE7QUFFQTtBQUdBO0FBT0E7QUFIQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBS0E7O0FBRUE7QUFRQTtBQUNBO0FBSUE7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBckpBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0xBO0FBU0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQTdCQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNGQTtBQWFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUF0Q0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDVUE7QUE2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBUUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUlBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUF6S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQzdEQTtBQXFCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQWpEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNUQTtBQWNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBM0NBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0RBO0FBV0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBaENBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0hBO0FBZUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBN0NBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0RBO0FBV0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQXREQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDaEZBO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBV0E7QUF5UkE7QUF2UkE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTs7QUFsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBNlJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3RUQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBMkJBOzs7Ozs7Ozs7O0FBVUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDakdBO0FBQ0E7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBK0RBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUM1SkE7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE0REE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzdIQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEwSkE7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNsWUE7QUFRQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBOEJBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzlFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBU0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBbWdEQTtBQWpnREE7QUFDQTtBQUNBO0FBR0E7O0FBSUE7QUFNQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFJQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBSUE7QUFBQTtBQUNBO0FBRUE7QUFNQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFNQTtBQUFBO0FBR0E7QUFNQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBT0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBRUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUlBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFPQTtBQUdBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBR0E7QUFFQTtBQUVBO0FBTUE7QUFBQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFNQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFBQTtBQU1BOztBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFRQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFRQTtBQUFBO0FBR0E7O0FBUUE7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFLQTtBQUFBO0FBRUE7O0FBTUE7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFLQTtBQUNBO0FBQUE7QUFnQkE7QUFJQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFNQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBT0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFTQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFwZ0RBO0FBMGdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFqREE7QUFtREE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQVpBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQ2xtREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0EiLCJzb3VyY2VSb290IjoiIn0=