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
            whitebrick_cloud_1.log.debug(`dal.setRole(${userIds},${roleName},${roleLevel},${objectId},${keepImpliedFrom})`);
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
                    for (const permissionPrefix of entity_1.Role.tablePermissionPrefixes(tableRole)) {
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
    roleAndIdForUserObject(userId, roleLevel, objectIdOrName, parentObjectName) {
        return __awaiter(this, void 0, void 0, function* () {
            let objectId = undefined;
            let queryObjId = "";
            let sqlJoin = "";
            let sqlWhere = "";
            if (typeof objectIdOrName === "number")
                objectId = objectIdOrName;
            const params = [userId];
            const paramsObjId = [];
            switch (roleLevel) {
                case "organization":
                    sqlJoin = `
         JOIN wb.organization_users ON wb.roles.id=wb.organization_users.role_id
        `;
                    sqlWhere = `
         WHERE wb.organization_users.user_id=$1
        `;
                    if (objectId) {
                        params.push(objectId);
                        sqlWhere += `
            AND wb.organization_users.organization_id=$2
          `;
                    }
                    else {
                        params.push(objectIdOrName);
                        sqlJoin += `
            JOIN wb.organizations ON wb.organization_users.organization_id=wb.organizations.id
          `;
                        sqlWhere += `
            AND wb.organizations.name=$2
          `;
                        queryObjId =
                            "SELECT id as object_id FROM wb.organizations WHERE name=$1 LIMIT 1";
                        paramsObjId.push(objectIdOrName.toString());
                    }
                    break;
                case "schema":
                    sqlJoin = `
         JOIN wb.schema_users ON wb.roles.id=wb.schema_users.role_id
        `;
                    sqlWhere = `
         WHERE wb.schema_users.user_id=$1
        `;
                    if (objectId) {
                        params.push(objectId);
                        sqlWhere += `
            AND wb.schema_users.schema_id=$2
          `;
                    }
                    else {
                        params.push(objectIdOrName);
                        sqlJoin += `
            JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
          `;
                        sqlWhere += `
            AND wb.schemas.name=$2
          `;
                        queryObjId =
                            "SELECT id as object_id FROM wb.schemas WHERE name=$1 LIMIT 1";
                        paramsObjId.push(objectIdOrName.toString());
                    }
                    break;
                case "table":
                    sqlJoin = `
         JOIN wb.table_users ON wb.roles.id=wb.table_users.role_i
        `;
                    sqlWhere = `
         WHERE wb.table_users.user_id=$1
        `;
                    if (objectId) {
                        params.push(objectId);
                        sqlWhere += `
            AND wb.table_users.table_id=$2
          `;
                    }
                    else {
                        if (!parentObjectName) {
                            throw `dal.roleNameForUserObject parentObjectName required for table level`;
                        }
                        params.push(objectIdOrName, parentObjectName);
                        sqlJoin += `
            JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
            JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
          `;
                        sqlWhere += `
            AND wb.tables.name=$2
            AND wb.schemas.name=$3
          `;
                        queryObjId = `
            SELECT id as object_id
            FROM wb.tables
            JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
            WHERE wb.tables.name=$1 AND wb.schemas.name=$2
            LIMIT 1
          `;
                        paramsObjId.push(objectIdOrName.toString(), parentObjectName);
                    }
                    break;
            }
            const queries = [
                {
                    query: `
        SELECT wb.roles.name as role_name
        FROM wb.roles
        ${sqlJoin}
        ${sqlWhere}  
        LIMIT 1
      `,
                    params: params,
                },
            ];
            if (!objectId) {
                queries.push({
                    query: queryObjId,
                    params: paramsObjId,
                });
            }
            const results = yield this.executeQueries(queries);
            if (!results[0].success)
                return results[0];
            if (!results[1].success)
                return results[1];
            const result = {
                success: true,
                payload: {
                    roleName: null,
                    objectId: null,
                },
            };
            if (results[0].payload.rows.length == 1) {
                result.payload.roleName = results[0].payload.rows[0].role_name;
            }
            if (objectId) {
                result.payload.objectId = objectId;
            }
            else if (results[1].payload.rows.length == 1) {
                result.payload.objectId = results[1].payload.rows[0].object_id;
            }
            return result;
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
    users(ids, emails, searchPattern) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlWhere = "";
            let params = [];
            if (ids) {
                sqlWhere = "AND id=ANY($1)";
                params.push(ids);
            }
            else if (emails) {
                sqlWhere = "AND email=ANY($1)";
                params.push(emails);
            }
            else if (searchPattern) {
                sqlWhere = `
        AND email LIKE $1
        OR first_name LIKE $1
        OR last_name LIKE $1
      `;
                params.push(searchPattern.replace(/\*/g, "%"));
            }
            const result = yield this.executeQuery({
                query: `
      SELECT wb.users.*
      FROM wb.users
      WHERE id NOT IN (${entity_1.User.SYS_ADMIN_ID})
      ${sqlWhere}
      ORDER BY email
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
    organizationsByUsers(userIds, userEmails, organizationNames, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlSelect = "";
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "WHERE wb.users.id=ANY($1)";
                params.push(userIds);
            }
            else if (userEmails) {
                sqlWhere = "WHERE wb.users.email=ANY($1)";
                params.push(userEmails);
            }
            if (organizationNames) {
                sqlWhere += "AND wb.organizations.name=ANY($2)";
                params.push(organizationNames);
            }
            if (withSettings) {
                sqlSelect += ", wb.schema_users.settings as settings";
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.organizations.*,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        ${sqlSelect}
        FROM wb.organizations
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.organization_users.implied_from_role_id=implied_roles.id
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
            return yield this.deleteOrganizations(name.replace(/\%/g, ""));
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
    organizationUsers(name, id, roles, userIds, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlSelect = "";
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
            if (userIds) {
                sqlWhere += ` AND wb.organization_users.user_id=ANY($${params.length + 1})`;
                params.push(userIds);
            }
            if (withSettings) {
                sqlSelect = "wb.organization_users.settings,";
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.organization_users.organization_id,
        wb.organization_users.user_id,
        wb.organization_users.role_id,
        wb.organization_users.implied_from_role_id,
        wb.organization_users.created_at,
        wb.organization_users.updated_at,
        ${sqlSelect}
        wb.organizations.name as organization_name,
        wb.users.email as user_email,
        wb.users.first_name as user_first_name,
        wb.users.last_name as user_last_name,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        FROM wb.organization_users
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.organizations ON wb.organization_users.organization_id=wb.organizations.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.organization_users.implied_from_role_id=implied_roles.id
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.OrganizationUser.parseResult(result.payload);
            return result;
        });
    }
    saveOrganizationUserSettings(organizationId, userId, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        UPDATE wb.organization_users
        SET settings=$1, updated_at=$2
        WHERE organization_id=$3
        AND user_id=$4
      `,
                params: [settings, new Date(), organizationId, userId],
            });
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
    schemasByUsers(userIds, userEmails, schemaNames, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlSelect = "";
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "WHERE wb.users.id=ANY($1)";
                params.push(userIds);
            }
            else if (userEmails) {
                sqlWhere = "WHERE wb.users.email=ANY($1)";
                params.push(userEmails);
            }
            if (schemaNames) {
                sqlWhere += "AND wb.schemas.name=ANY($2)";
                params.push(schemaNames);
            }
            if (withSettings) {
                sqlSelect += ", wb.schema_users.settings as settings";
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schemas.*,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from,
        wb.organizations.name as organization_owner_name,
        user_owners.email as user_owner_email
        ${sqlSelect}
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
        'schema_owner' as role_name
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
        schema_user_roles.name as role_name,
        schema_user_implied_roles.name as role_implied_from,
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
    schemaUsers(schemaName, userIds, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [schemaName];
            let sqlSelect = "";
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "AND wb.schema_users.user_id=ANY($2)";
                params.push(userIds);
            }
            if (withSettings) {
                sqlSelect = "wb.organization_users.settings,";
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schema_users.schema_id,
        wb.schema_users.user_id,
        wb.schema_users.role_id,
        wb.schema_users.implied_from_role_id,
        wb.schema_users.created_at,
        wb.schema_users.updated_at,
        ${sqlSelect}
        wb.schemas.name as schema_name,
        wb.users.email as user_email,
        wb.users.first_name as user_first_name,
        wb.users.last_name as user_last_name,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        FROM wb.schema_users
        JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.schema_users.implied_from_role_id=implied_roles.id
        WHERE wb.schemas.name=$1
        ${sqlWhere}
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
    saveSchemaUserSettings(schemaId, userId, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        UPDATE wb.schema_users
        SET settings=$1, updated_at=$2
        WHERE schema_id=$3
        AND user_id=$4
      `,
                params: [settings, new Date(), schemaId, userId],
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
    tablesByUsers(schemaName, userIds, userEmails, tableNames, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [schemaName];
            let sqlSelect = "";
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "AND wb.users.id=ANY($2)";
                params.push(userIds);
            }
            else if (userEmails) {
                sqlWhere = "AND wb.users.email=ANY($2)";
                params.push(userEmails);
            }
            if (tableNames) {
                sqlWhere += "AND wb.tables.name=ANY($3)";
                params.push(tableNames);
            }
            if (withSettings) {
                sqlSelect += ", wb.table_users.settings as settings";
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.tables.*,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        ${sqlSelect}
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.table_users ON wb.tables.id=wb.table_users.table_id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.table_users.implied_from_role_id=implied_roles.id
        WHERE wb.schemas.name=$1
        ${sqlWhere}
      `,
                params: params,
            });
            if (result.success)
                result.payload = entity_1.Table.parseResult(result.payload);
            return result;
        });
    }
    foreignKeysOrReferences(schemaName, tableNamePattern, columnNamePattern, type) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableNamePattern = DAL.sanitize(tableNamePattern);
            columnNamePattern = DAL.sanitize(columnNamePattern);
            let sqlWhere = "";
            switch (type) {
                case "FOREIGN_KEYS":
                    sqlWhere = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
                    break;
                case "REFERENCES":
                    sqlWhere = `
          AND ref.table_name LIKE '${tableNamePattern}'
          AND ref.column_name LIKE '${columnNamePattern}'
        `;
                    break;
                case "ALL":
                    sqlWhere = `
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
        ${sqlWhere}
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
    tableUsers(schemaName, tableName, userIds, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [schemaName, tableName];
            let sqlSelect = "";
            let sqlWhere = "";
            if (userIds) {
                sqlWhere = "AND wb.table_users.user_id=ANY($3)";
                params.push(userIds);
            }
            if (withSettings) {
                sqlSelect = "wb.organization_users.settings,";
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.table_users.table_id,
        wb.table_users.user_id,
        wb.table_users.role_id,
        wb.table_users.implied_from_role_id,
        wb.table_users.created_at,
        wb.table_users.updated_at,
        ${sqlSelect}
        wb.schemas.name as schema_name,
        wb.tables.name as table_name,
        wb.users.email as user_email,
        wb.users.first_name as user_first_name,
        wb.users.last_name as user_last_name,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        FROM wb.table_users
        JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.table_users.implied_from_role_id=implied_roles.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2
        ${sqlWhere}
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
            whitebrick_cloud_1.log.debug(`dal.setSchemaUserRolesFromOrganizationRoles(${organizationId}, <roleMap>, ${schemaIds}, ${userIds}, ${clearExisting})`);
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
        column.id = parseInt(data.id);
        column.tableId = parseInt(data.table_id);
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
const policy_1 = __webpack_require__(/*! ../policy */ "./src/policy.ts");
class CurrentUser {
    constructor(wbCloud, user) {
        this.actionHistory = [];
        this.objectPermissionsLookup = {
            organization: {},
            schema: {},
            table: {},
        };
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
    denied() {
        let message = "INTERNAL ERROR: Last UserActionPermission not recorded. ";
        let values = [];
        const lastUAP = this.actionHistory.pop();
        if (lastUAP) {
            message = `You do not have permission to ${lastUAP.description}.`;
            let userStr = `userId=${this.id}`;
            if (this.user && this.user.email) {
                userStr = `userEmail=${this.user.email}, ${userStr}`;
            }
            values = [
                userStr,
                `objectId=${lastUAP.objectId}`,
                `userAction=${lastUAP.userAction}`,
                `checkedForRoleName=${lastUAP.checkedForRoleName}`,
                `checkedAt=${lastUAP.checkedAt}`,
            ];
        }
        return whitebrick_cloud_1.errResult({
            success: false,
            message: message,
            values: values,
            wbCode: "WB_FORBIDDEN",
        });
    }
    mustBeSignedIn() {
        return whitebrick_cloud_1.errResult({
            success: false,
            message: "You must be signed-in to perform this action.",
            wbCode: "WB_FORBIDDEN",
        });
    }
    getObjectPermission(roleLevel, userAction, key) {
        if (this.objectPermissionsLookup[roleLevel][key] &&
            this.objectPermissionsLookup[roleLevel][key][userAction]) {
            return {
                roleLevel: roleLevel,
                userAction: userAction,
                objectKey: key,
                objectId: this.objectPermissionsLookup[roleLevel][key][userAction].obkectId,
                checkedForRoleName: this.objectPermissionsLookup[roleLevel][key][userAction]
                    .checkedForRoleName,
                permitted: this.objectPermissionsLookup[roleLevel][key][userAction].permitted,
                description: this.objectPermissionsLookup[roleLevel][key][userAction].description,
            };
        }
        else {
            return null;
        }
    }
    setObjectPermission(uAP) {
        if (!this.objectPermissionsLookup[uAP.roleLevel][uAP.objectId]) {
            this.objectPermissionsLookup[uAP.roleLevel][uAP.objectId] = {};
        }
        this.objectPermissionsLookup[uAP.roleLevel][uAP.objectId][uAP.userAction] =
            {
                permitted: uAP.permitted,
                checkedForRoleName: uAP.checkedForRoleName,
                description: uAP.description,
            };
        return uAP;
    }
    recordActionHistory(uAP) {
        uAP.checkedAt = new Date();
        this.actionHistory.push(uAP);
    }
    static getUserActionPolicy(policy, userAction) {
        for (const userActionPolicy of policy) {
            if (userActionPolicy.userAction == userAction) {
                return userActionPolicy;
            }
        }
    }
    getObjectLookupKey(objectIdOrName, parentObjectName) {
        let key = objectIdOrName.toString();
        if (typeof objectIdOrName === "number") {
            key = `id${objectIdOrName}`;
        }
        else if (parentObjectName) {
            key = `${parentObjectName}.${objectIdOrName}`;
        }
        return key;
    }
    can(userAction, objectIdOrName, parentObjectName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isSysAdmin())
                return true;
            const policy = policy_1.DEFAULT_POLICY[userAction];
            whitebrick_cloud_1.log.debug(`currentUser.can(${userAction},${objectIdOrName}) policy:${JSON.stringify(policy)}`);
            if (!policy) {
                const message = `No policy found for userAction=${userAction}`;
                whitebrick_cloud_1.log.error(message);
                throw new Error(message);
            }
            let key = this.getObjectLookupKey(objectIdOrName, parentObjectName);
            const alreadyChecked = this.getObjectPermission(policy.roleLevel, userAction, key);
            if (alreadyChecked !== null) {
                this.recordActionHistory(alreadyChecked);
                return alreadyChecked.permitted;
            }
            const roleResult = yield this.wbCloud.roleAndIdForUserObject(this.id, policy.roleLevel, objectIdOrName, parentObjectName);
            if (!roleResult.success) {
                const message = `Error getting roleNameForUserObject(${this.id},${policy.roleLevel},${objectIdOrName},${parentObjectName}). ${JSON.stringify(roleResult)}`;
                whitebrick_cloud_1.log.error(message);
                throw new Error(message);
            }
            if (!roleResult.payload.objectId) {
                const message = `ObjectId could not be found`;
                whitebrick_cloud_1.log.error(message);
                throw new Error(message);
            }
            let permitted = false;
            if (roleResult.payload.roleName &&
                policy.permittedRoles.includes(roleResult.payload.roleName)) {
                permitted = true;
            }
            const uAP = {
                roleLevel: policy.roleLevel,
                objectKey: key,
                objectId: roleResult.payload.objectId,
                userAction: userAction,
                permitted: permitted,
                description: policy.description,
            };
            if (roleResult.payload.roleName) {
                uAP.checkedForRoleName = roleResult.payload.roleName;
            }
            this.setObjectPermission(uAP);
            this.recordActionHistory(uAP);
            whitebrick_cloud_1.log.debug(`role: ${JSON.stringify(roleResult.payload)} permitted: ${permitted}`);
            return permitted;
        });
    }
    cant(userAction, objectIdOrName, parentObjectName) {
        return __awaiter(this, void 0, void 0, function* () {
            const can = yield this.can(userAction, objectIdOrName, parentObjectName);
            return !can;
        });
    }
    static fromContext(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const headersLowerCase = Object.entries(context.headers).reduce((acc, [key, val]) => ((acc[key.toLowerCase()] = val), acc), {});
            let result = whitebrick_cloud_1.errResult();
            if (headersLowerCase["x-test-user-email"]) {
                whitebrick_cloud_1.log.debug(`========== FOUND TEST USER: ${headersLowerCase["x-test-user-email"]}`);
                result = yield context.wbCloud.userByEmail(this, headersLowerCase["x-test-user-email"]);
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
                const result = yield context.wbCloud.userById(this, parseInt(headersLowerCase["x-hasura-user-id"]));
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
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Organization = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
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
        organization.id = parseInt(data.id);
        organization.name = data.name;
        organization.label = data.label;
        organization.createdAt = data.created_at;
        organization.updatedAt = data.updated_at;
        if (data.settings)
            organization.settings = data.settings;
        if (data.role_name) {
            organization.role = new _1.Role(data.role_name, "organization");
            if (data.role_implied_from) {
                organization.role.impliedFrom = data.role_implied_from;
            }
        }
        return organization;
    }
}
exports.Organization = Organization;


/***/ }),

/***/ "./src/entity/OrganizationUser.ts":
/*!****************************************!*\
  !*** ./src/entity/OrganizationUser.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrganizationUser = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
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
        organizationUser.userId = parseInt(data.user_id);
        organizationUser.roleId = parseInt(data.role_id);
        if (data.implied_from_role_id) {
            organizationUser.impliedFromroleId = parseInt(data.implied_from_role_id);
        }
        organizationUser.settings = data.settings;
        organizationUser.createdAt = data.created_at;
        organizationUser.updatedAt = data.updated_at;
        organizationUser.role = new _1.Role(data.role_id);
        if (data.organization_name)
            organizationUser.organizationName = data.organization_name;
        if (data.user_email)
            organizationUser.userEmail = data.user_email;
        if (data.user_first_name)
            organizationUser.userFirstName = data.user_first_name;
        if (data.user_last_name)
            organizationUser.userLastName = data.user_last_name;
        if (data.role_name) {
            organizationUser.role = new _1.Role(data.role_name, "organization");
            if (data.role_implied_from) {
                organizationUser.role.impliedFrom = data.role_implied_from;
            }
        }
        return organizationUser;
    }
}
exports.OrganizationUser = OrganizationUser;


/***/ }),

/***/ "./src/entity/Role.ts":
/*!****************************!*\
  !*** ./src/entity/Role.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Role = void 0;
const policy_1 = __webpack_require__(/*! ../policy */ "./src/policy.ts");
class Role {
    constructor(name, roleLevel) {
        this.name = name;
        this.permissions = Role.getPermissions(policy_1.DEFAULT_POLICY, this.name, roleLevel);
    }
    static sysRoleMap(from, to) {
        let toRoleDefinitions = {};
        let map = {};
        switch (to) {
            case "table":
                toRoleDefinitions = Role.SYSROLES_TABLES;
            case "schema":
                toRoleDefinitions = Role.SYSROLES_SCHEMAS;
        }
        for (const toRoleName of Object.keys(toRoleDefinitions)) {
            if (toRoleDefinitions[toRoleName].impliedFrom) {
                for (const fromRoleName of toRoleDefinitions[toRoleName].impliedFrom) {
                    map[fromRoleName] = toRoleName;
                }
            }
        }
        return map;
    }
    static getPermissions(policy, roleName, roleLevel) {
        const permissions = {};
        for (const userAction of Object.keys(policy)) {
            if (roleLevel &&
                policy[userAction].roleLevel != roleLevel) {
                continue;
            }
            permissions[userAction] =
                policy[userAction].permittedRoles.includes(roleName);
        }
        return permissions;
    }
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
    static tablePermissionPrefixes(roleName) {
        let actions = [];
        let prefixes = [];
        if (policy_1.DEFAULT_POLICY["read_and_write_table_records"].permittedRoles.includes(roleName)) {
            actions = policy_1.DEFAULT_POLICY["read_and_write_table_records"].hasuraActions;
        }
        else if (policy_1.DEFAULT_POLICY["read_table_records"].permittedRoles.includes(roleName)) {
            actions = policy_1.DEFAULT_POLICY["read_table_records"].hasuraActions;
        }
        for (const action of actions) {
            const prefix = Object.keys(Role.HASURA_PREFIXES_ACTIONS).find((key) => Role.HASURA_PREFIXES_ACTIONS[key] === action);
            if (prefix)
                prefixes.push(prefix);
        }
        return prefixes;
    }
    static tablePermissionKeysAndActions(tableId) {
        const permissionKeysAndActions = [];
        for (const prefix of Object.keys(Role.HASURA_PREFIXES_ACTIONS)) {
            permissionKeysAndActions.push({
                permissionKey: Role.tablePermissionKey(prefix, tableId),
                action: Role.HASURA_PREFIXES_ACTIONS[prefix],
            });
        }
        return permissionKeysAndActions;
    }
    static tablePermissionKey(permissionPrefix, tableId) {
        return `${permissionPrefix}${tableId}`;
    }
    static hasuraTablePermissionChecksAndTypes(tableId) {
        const hasuraPermissionsAndTypes = [];
        for (const permissionKeysAndType of Role.tablePermissionKeysAndActions(tableId)) {
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
        const role = new Role(data.name);
        role.id = parseInt(data.id);
        role.name = data.name;
        role.label = data.label;
        role.createdAt = data.created_at;
        role.updatedAt = data.updated_at;
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
    schema_administrator: {
        label: "DB Administrator",
        impliedFrom: ["organization_administrator"],
    },
    schema_manager: { label: "DB Manager" },
    schema_editor: { label: "DB Editor" },
    schema_reader: { label: "DB Reader" },
};
Role.SYSROLES_TABLES = {
    table_administrator: {
        label: "Table Administrator",
        impliedFrom: ["schema_owner", "schema_administrator"],
    },
    table_manager: {
        label: "Table Manager",
        impliedFrom: ["schema_manager"],
    },
    table_editor: {
        label: "Table Editor",
        impliedFrom: ["schema_editor"],
    },
    table_reader: {
        label: "Table Reader",
        impliedFrom: ["schema_reader"],
    },
};
Role.HASURA_PREFIXES_ACTIONS = {
    s: "select",
    i: "insert",
    u: "update",
    d: "delete",
};


/***/ }),

/***/ "./src/entity/Schema.ts":
/*!******************************!*\
  !*** ./src/entity/Schema.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Schema = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
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
        schema.id = parseInt(data.id);
        schema.name = data.name;
        schema.label = data.label;
        schema.organizationOwnerId = data.organization_owner_id;
        schema.userOwnerId = data.user_owner_id;
        schema.createdAt = data.created_at;
        schema.updatedAt = data.updated_at;
        if (data.organization_owner_name) {
            schema.organizationOwnerName = data.organization_owner_name;
        }
        if (data.user_owner_email)
            schema.userOwnerEmail = data.user_owner_email;
        if (data.settings)
            schema.settings = data.settings;
        if (data.role_name) {
            schema.role = new _1.Role(data.role_name, "schema");
            if (data.role_implied_from) {
                schema.role.impliedFrom = data.role_implied_from;
            }
        }
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
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SchemaUser = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
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
        schemaUser.userId = parseInt(data.user_id);
        schemaUser.roleId = parseInt(data.role_id);
        if (data.implied_from_role_id) {
            schemaUser.impliedFromRoleId = parseInt(data.implied_from_role_id);
        }
        schemaUser.settings = data.settings;
        schemaUser.createdAt = data.created_at;
        schemaUser.updatedAt = data.updated_at;
        if (data.schema_name)
            schemaUser.schemaName = data.schema_name;
        if (data.user_email)
            schemaUser.userEmail = data.user_email;
        if (data.user_first_name)
            schemaUser.userFirstName = data.user_first_name;
        if (data.user_last_name)
            schemaUser.userLastName = data.user_last_name;
        if (data.role_name) {
            schemaUser.role = new _1.Role(data.role_name, "schema");
            if (data.role_implied_from) {
                schemaUser.role.impliedFrom = data.role_implied_from;
            }
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
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Table = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
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
        table.id = parseInt(data.id);
        table.schemaId = data.schema_id;
        table.name = data.name;
        table.label = data.label;
        table.createdAt = data.created_at;
        table.updatedAt = data.updated_at;
        if (data.schema_name)
            table.schemaName = data.schema_name;
        if (data.settings)
            table.settings = data.settings;
        if (data.role_name) {
            table.role = new _1.Role(data.role_name, "table");
            if (data.role_implied_from) {
                table.role.impliedFrom = data.role_implied_from;
            }
        }
        return table;
    }
}
exports.Table = Table;


/***/ }),

/***/ "./src/entity/TableUser.ts":
/*!*********************************!*\
  !*** ./src/entity/TableUser.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TableUser = void 0;
const _1 = __webpack_require__(/*! . */ "./src/entity/index.ts");
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
        tableUser.tableId = parseInt(data.table_id);
        tableUser.userId = parseInt(data.user_id);
        tableUser.roleId = parseInt(data.role_id);
        if (data.implied_from_role_id) {
            tableUser.impliedFromroleId = parseInt(data.implied_from_role_id);
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
        if (data.user_first_name)
            tableUser.userFirstName = data.user_first_name;
        if (data.user_last_name)
            tableUser.userLastName = data.user_last_name;
        if (data.role_name) {
            tableUser.role = new _1.Role(data.role_name, "table");
            if (data.role_implied_from) {
                tableUser.role.impliedFrom = data.role_implied_from;
            }
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
        user.id = parseInt(data.id);
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
__exportStar(__webpack_require__(/*! ./CurrentUser */ "./src/entity/CurrentUser.ts"), exports);
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
    WB_FORBIDDEN: ["You do not permitted to perform this action.", "FORBIDDEN"],
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
    createPermission(schemaName, tableName, permissionCheck, type, roleName, columns) {
        return __awaiter(this, void 0, void 0, function* () {
            const payload = {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                role: roleName,
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
    deletePermission(schemaName, tableName, type, roleName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.post(`pg_drop_${type}_permission`, {
                table: {
                    schema: schemaName,
                    name: tableName,
                },
                role: roleName,
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

/***/ "./src/policy.ts":
/*!***********************!*\
  !*** ./src/policy.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DEFAULT_POLICY = void 0;
exports.DEFAULT_POLICY = {
    access_organization: {
        roleLevel: "organization",
        description: "Access this Organization",
        permittedRoles: [
            "organization_external_user",
            "organization_user",
            "organization_administrator",
        ],
    },
    administer_organization: {
        roleLevel: "organization",
        description: "Administer this Organization",
        permittedRoles: ["organization_administrator"],
    },
    edit_organization: {
        roleLevel: "organization",
        description: "Edit this Organization",
        permittedRoles: ["organization_administrator"],
    },
    manage_access_to_organization: {
        roleLevel: "organization",
        description: "Manage Access to this Organization",
        permittedRoles: ["organization_administrator"],
    },
    alter_schema: {
        roleLevel: "schema",
        description: "Alter this Database",
        permittedRoles: ["schema_manager", "schema_administrator"],
    },
    manage_access_to_schema: {
        roleLevel: "schema",
        description: "Manage Access to this Database",
        permittedRoles: ["schema_administrator"],
    },
    alter_table: {
        roleLevel: "table",
        description: "Alter this Table",
        permittedRoles: ["table_manager", "table_administrator"],
    },
    manage_access_to_table: {
        roleLevel: "table",
        description: "Manage Access to this Table",
        permittedRoles: ["table_administrator"],
    },
    read_table_records: {
        roleLevel: "table",
        description: "Read Records from this Table",
        permittedRoles: [
            "table_reader",
            "table_editor",
            "table_manager",
            "table_administrator",
        ],
        hasuraActions: ["select"],
    },
    read_and_write_table_records: {
        roleLevel: "table",
        description: "Read and Write Records to this Table",
        permittedRoles: ["table_editor", "table_manager", "table_administrator"],
        hasuraActions: ["select", "insert", "update", "delete"],
    },
};


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
    wbAuth(userAuthId: String!): JSON!
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
        wbAuth: (_, { userAuthId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.auth(userAuthId);
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
const entity_1 = __webpack_require__(/*! ../entity */ "./src/entity/index.ts");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Organization {
    id: ID!
    name: String!
    label: String!
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  type OrganizationUser {
    organizationId: Int!
    userId: Int!
    organizationName: String!
    userEmail: String!
    userFirstName: String
    userLastName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Organizations
    """
    wbMyOrganizations(withSettings: Boolean): [Organization]
    wbMyOrganizationByName(name: String!, withSettings: Boolean): Organization
    wbOrganizationByName(name: String!): Organization
    """
    Organization Users
    """
    wbOrganizationUsers(
      organizationName: String!
      roles: [String]
      userEmails: [String]
      withSettings: Boolean
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
      roleName: String!
    ): Boolean
    wbRemoveUsersFromOrganization(
      userEmails: [String]!
      organizationName: String!
    ): Boolean
    wbSaveOrganizationUserSettings(
      organizationName: String!
      settings: JSON!
    ): Boolean!
  }
`;
exports.resolvers = {
    Query: {
        wbMyOrganizations: (_, { withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleOrganizations(currentUser, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbMyOrganizationByName: (_, { name, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleOrganizationByName(currentUser, name, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbOrganizationByName: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.organizationByName(currentUser, name);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbOrganizationUsers: (_, { organizationName, roles, userEmails, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.organizationUsers(currentUser, organizationName, undefined, roles, userEmails, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateOrganization: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createOrganization(currentUser, name, label);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateOrganization: (_, { name, newName, newLabel }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateOrganization(currentUser, name, newName, newLabel);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbDeleteOrganization: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.deleteOrganization(currentUser, name);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbSetOrganizationUsersRole: (_, { organizationName, userEmails, roleName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.setOrganizationUsersRole(currentUser, organizationName, roleName, undefined, userEmails);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveUsersFromOrganization: (_, { userEmails, organizationName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeUsersFromOrganization(currentUser, organizationName, undefined, userEmails);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbSaveOrganizationUserSettings: (_, { organizationName, settings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.saveSchemaUserSettings(currentUser, organizationName, settings);
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
const entity_1 = __webpack_require__(/*! ../entity */ "./src/entity/index.ts");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    organizationOwnerName: String
    userOwnerEmail: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  type SchemaUser {
    schemaId: Int!
    userId: Int!
    schemaName: String
    userEmail: String!
    userFirstName: String
    userLastName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Schemas
    """
    wbMySchemas(withSettings: Boolean): [Schema]
    wbMySchemaByName(name: String!, withSettings: Boolean): Schema
    """
    Schema Users
    """
    wbSchemaUsers(
      schemaName: String!
      userEmails: [String]
      withSettings: Boolean
    ): [SchemaUser]
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
      roleName: String!
    ): Boolean
    wbRemoveSchemaUsers(schemaName: String!, userEmails: [String]!): Boolean
    wbSaveSchemaUserSettings(schemaName: String!, settings: JSON!): Boolean!
  }
`;
exports.resolvers = {
    Query: {
        wbMySchemas: (_, { withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleSchemas(currentUser, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbMySchemaByName: (_, { name, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleSchemaByName(currentUser, name, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSchemaUsers: (_, { schemaName, userEmails, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.schemaUsers(currentUser, schemaName, userEmails, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateSchema: (_, { name, label, organizationOwnerId, organizationOwnerName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createSchema(currentUser, name, label, organizationOwnerId, organizationOwnerName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSetSchemaUsersRole: (_, { schemaName, userEmails, roleName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.setSchemaUsersRole(currentUser, schemaName, userEmails, roleName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveSchemaUsers: (_, { schemaName, userEmails }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeSchemaUsers(currentUser, schemaName, userEmails);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbSaveSchemaUserSettings: (_, { schemaName, settings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.saveSchemaUserSettings(currentUser, schemaName, settings);
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
const entity_1 = __webpack_require__(/*! ../entity */ "./src/entity/index.ts");
exports.typeDefs = apollo_server_lambda_1.gql `
  scalar JSON

  type Table {
    id: ID!
    schemaId: Int!
    name: String!
    label: String!
    columns: [Column]
    schemaName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
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
    schemaName: String!
    tableName: String!
    userEmail: String!
    userFirstName: String
    userLastName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Tables
    """
    wbMyTables(
      schemaName: String!
      withColumns: Boolean
      withSettings: Boolean
    ): [Table]
    wbMyTableByName(
      schemaName: String!
      tableName: String!
      withColumns: Boolean
      withSettings: Boolean
    ): Table
    """
    Table Users
    """
    wbTableUsers(
      schemaName: String!
      tableName: String!
      userEmails: [String]
      withSettings: Boolean
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
      roleName: String!
    ): Boolean
    wbSaveTableUserSettings(
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
        wbMyTables: (_, { schemaName, withColumns, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleTables(currentUser, schemaName, withColumns, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbMyTableByName: (_, { schemaName, tableName, withColumns, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleTableByName(currentUser, schemaName, tableName, withColumns, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbTableUsers: (_, { schemaName, tableName, userEmails, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.tableUsers(currentUser, schemaName, tableName, userEmails, withSettings);
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
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrCreateTable(currentUser, schemaName, tableName, tableLabel, create);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbUpdateTable: (_, { schemaName, tableName, newTableName, newTableLabel }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateTable(currentUser, schemaName, tableName, newTableName, newTableLabel);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteTable: (_, { schemaName, tableName, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeOrDeleteTable(currentUser, schemaName, tableName, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddAllExistingTables: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addAllExistingTables(currentUser, schemaName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddAllExistingRelationships: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrRemoveAllExistingRelationships(currentUser, schemaName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbCreateOrDeletePrimaryKey: (_, { schemaName, tableName, columnNames, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createOrDeletePrimaryKey(currentUser, schemaName, tableName, columnNames, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddOrCreateForeignKey: (_, { schemaName, tableName, columnNames, parentTableName, parentColumnNames, create, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrCreateForeignKey(currentUser, schemaName, tableName, columnNames, parentTableName, parentColumnNames, create);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteForeignKey: (_, { schemaName, tableName, columnNames, parentTableName, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeOrDeleteForeignKey(currentUser, schemaName, tableName, columnNames, parentTableName, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAddOrCreateColumn: (_, { schemaName, tableName, columnName, columnLabel, create, columnType }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrCreateColumn(currentUser, schemaName, tableName, columnName, columnLabel, create, columnType);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbUpdateColumn: (_, { schemaName, tableName, columnName, newColumnName, newColumnLabel, newType, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateColumn(currentUser, schemaName, tableName, columnName, newColumnName, newColumnLabel, newType);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteColumn: (_, { schemaName, tableName, columnName, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeOrDeleteColumn(currentUser, schemaName, tableName, columnName, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbSetTableUsersRole: (_, { schemaName, tableName, userEmails, roleName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.setTableUsersRole(currentUser, schemaName, tableName, userEmails, roleName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbSaveTableUserSettings: (_, { schemaName, tableName, settings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.saveTableUserSettings(currentUser, schemaName, tableName, settings);
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
const entity_1 = __webpack_require__(/*! ../entity */ "./src/entity/index.ts");
exports.typeDefs = apollo_server_lambda_1.gql `
  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    createdAt: String!
    updatedAt: String!
  }

  type Role {
    name: String!
    impliedFrom: String
    permissions: JSON
  }

  extend type Query {
    """
    Users
    """
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
    wbUsersBySearchPattern(searchPattern: String!): [User]
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
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.userById(currentUser, id);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUserByEmail: (_, { email }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.userByEmail(currentUser, email);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUsersBySearchPattern: (_, { searchPattern }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.usersBySearchPattern(currentUser, searchPattern);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateUser: (_, { email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createUser(currentUser, email, firstName, lastName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateUser: (_, { id, email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateUser(currentUser, id, email, firstName, lastName);
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
const policy_1 = __webpack_require__(/*! ./policy */ "./src/policy.ts");
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
                result = yield this.userByEmail(CurrentUser_1.CurrentUser.getSysAdmin(this), headersLowerCase["x-test-user-id"]);
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
                organization: entity_1.Role.SYSROLES_ORGANIZATIONS,
                schema: entity_1.Role.SYSROLES_SCHEMAS,
                table: entity_1.Role.SYSROLES_TABLES,
            },
            policy: policy_1.DEFAULT_POLICY,
        };
    }
    resetTestData() {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`resetTestData()`);
            let result = yield this.schemas(CurrentUser_1.CurrentUser.getSysAdmin(this), undefined, undefined, "test_%");
            if (!result.success)
                return result;
            for (const schema of result.payload) {
                result = yield this.removeOrDeleteSchema(CurrentUser_1.CurrentUser.getSysAdmin(this), schema.name, true);
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
    auth(userAuthId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.userIdFromAuthId(userAuthId);
            if (!result.success)
                return result;
            const hasuraUserId = result.payload;
            return {
                success: true,
                payload: {
                    "X-Hasura-Allowed-Roles": ["wbuser"],
                    "X-Hasura-Default-Role": "wbuser",
                    "X-Hasura-User-Id": hasuraUserId,
                    "X-Hasura-Authenticated-At": Date().toString(),
                },
            };
        });
    }
    roleByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.roleByName(name);
        });
    }
    deleteAndSetTablePermissions(cU, table, deleteOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.deleteAndSetTablePermissions(table.id);
        });
    }
    setRole(cU, userIds, roleName, roleLevel, object) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`setRole(${userIds},${roleName},${roleLevel},${JSON.stringify(object)})`);
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
                            result = yield this.organizationUsers(cU, object.name, undefined, [
                                "organization_administrator",
                            ]);
                            if (!result.success)
                                return result;
                            const currentAdminIds = result.payload.map((organizationUser) => organizationUser.userId);
                            const demotedAdmins = userIds.filter((id) => currentAdminIds.includes(id));
                            if (demotedAdmins.length > 0) {
                                result = yield this.removeUsersFromOrganization(cU, object.name, demotedAdmins);
                                if (!result.success)
                                    return result;
                            }
                            result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                            break;
                        case "organization_administrator":
                            result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                            if (!result.success)
                                return result;
                            result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(object.id, entity_1.Role.sysRoleMap("organization", "schema"), undefined, userIds);
                            if (!result.success)
                                return result;
                            result = yield this.schemasByOrganizationOwner(cU, object.id);
                            if (!result.success)
                                return result;
                            for (const schema of result.payload) {
                                result = yield this.dal.setTableUserRolesFromSchemaRoles(schema.id, entity_1.Role.sysRoleMap("schema", "table"), undefined, userIds);
                                if (!result.success)
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
                    if (!result.success)
                        return result;
                    result = yield this.dal.setTableUserRolesFromSchemaRoles(object.id, entity_1.Role.sysRoleMap("schema", "table"), undefined, userIds);
                    break;
                case "table":
                    result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                    break;
            }
            return result;
        });
    }
    deleteRole(cU, userIds, roleLevel, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.deleteRole(userIds, roleLevel, objectId);
            if (!result.success)
                return result;
            switch (roleLevel) {
                case "organization":
                    result = yield this.dal.deleteRole(userIds, "schema", undefined, objectId, ["organization_administrator"]);
                    if (!result.success)
                        return result;
                    result = yield this.schemasByOrganizationOwner(cU, objectId);
                    if (!result.success)
                        return result;
                    for (const schema of result.payload) {
                        result = yield this.dal.deleteRole(userIds, "table", undefined, schema.id, ["schema_administrator"]);
                        if (!result.success)
                            return result;
                    }
                    break;
                case "schema":
                    result = yield this.dal.deleteRole(userIds, "table", undefined, objectId, Object.keys(entity_1.Role.sysRoleMap("schema", "table")));
                    break;
            }
            return result;
        });
    }
    roleAndIdForUserObject(userId, roleLevel, objectIdOrName, parentObjectName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.roleAndIdForUserObject(userId, roleLevel, objectIdOrName, parentObjectName);
        });
    }
    deleteTestUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteTestUsers()`);
            return this.dal.deleteTestUsers();
        });
    }
    usersByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.users(ids);
        });
    }
    userById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.usersByIds(cU, [id]);
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
    usersBySearchPattern(cU, searchPattern) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.users(undefined, undefined, searchPattern);
        });
    }
    usersByEmails(cU, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.users(undefined, userEmails);
        });
    }
    userByEmail(cU, email) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.usersByEmails(cU, [email]);
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
    createUser(cU, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.createUser(email, firstName, lastName);
        });
    }
    updateUser(cU, id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.updateUser(id, email, firstName, lastName);
        });
    }
    organizations(cU, organizationIds, organizationNames, organizationNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.organizations(organizationIds, organizationNames, organizationNamePattern);
            return result;
        });
    }
    organizationsByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.organizations(cU, ids);
        });
    }
    organizationById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationsByIds(cU, [id]);
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
    organizationsByNames(cU, names) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.organizations(cU, undefined, names);
        });
    }
    organizationByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizationsByNames(cU, [name]);
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
    organizationByNamePattern(cU, namePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.organizations(cU, undefined, undefined, namePattern);
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
    accessibleOrganizationByName(cU, organizationName, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.organizationsByUsers([cU.id], undefined, [organizationName], withSettings);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_ORGANIZATION_NOT_FOUND",
                        values: [organizationName],
                    });
                }
            }
            return result;
        });
    }
    accessibleOrganizations(cU, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.organizationsByUsers([cU.id], undefined, undefined, withSettings);
        });
    }
    createOrganization(cU, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`createOrganization(${cU.id}, ${name}, ${label})`);
            if (cU.isSignedOut())
                return cU.mustBeSignedIn();
            const checkNameResult = yield this.organizationByName(cU, name);
            if (checkNameResult.success) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NAME_TAKEN",
                });
            }
            else if (checkNameResult.wbCode != "WB_ORGANIZATION_NOT_FOUND") {
                return checkNameResult;
            }
            const createOrganizationResult = yield this.dal.createOrganization(name, label);
            if (!createOrganizationResult.success)
                return createOrganizationResult;
            const result = yield this.setOrganizationUsersRole(CurrentUser_1.CurrentUser.getSysAdmin(this), name, "organization_administrator", [cU.id]);
            if (!result.success)
                return result;
            return createOrganizationResult;
        });
    }
    updateOrganization(cU, name, newName, newLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            if (yield cU.cant("edit_organization", name))
                return cU.denied();
            return this.dal.updateOrganization(name, newName, newLabel);
        });
    }
    deleteOrganization(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteOrganization(${cU.id},${name})`);
            if (yield cU.cant("edit_organization", name)) {
                return cU.denied();
            }
            const result = yield this.organizationUsers(cU, name, undefined, [
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
    organizationUsers(cU, name, id, roles, userEmails, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = errResult();
            if (name) {
                result = yield this.organizationByName(cU, name);
            }
            else if (id) {
                result = yield this.organizationById(cU, id);
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
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(cU, userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
            }
            return this.dal.organizationUsers(name, id, roles, userIds, withSettings);
        });
    }
    setOrganizationUsersRole(cU, organizationName, roleName, userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`setOrganizationUsersRole(${cU.id},${organizationName},${roleName},${userIds},${userEmails})`);
            if (yield cU.cant("manage_access_to_organization", organizationName)) {
                return cU.denied();
            }
            const organizationResult = yield this.organizationByName(cU, organizationName);
            if (!organizationResult.success)
                return organizationResult;
            let result = errResult();
            let userIdsFound = [];
            let usersRequested = [];
            if (userIds) {
                usersRequested = userIds;
                result = yield this.usersByIds(cU, userIds);
            }
            else if (userEmails) {
                usersRequested = userEmails;
                result = yield this.usersByEmails(cU, userEmails);
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
            return yield this.setRole(cU, userIdsFound, roleName, "organization", organizationResult.payload);
        });
    }
    removeUsersFromOrganization(cU, organizationName, userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeUsersFromOrganization(${cU.id},${organizationName},${userIds},${userEmails})`);
            if (yield cU.cant("manage_access_to_organization", organizationName)) {
                return cU.denied();
            }
            let result = errResult();
            let userIdsToBeRemoved = [];
            if (userIds)
                userIdsToBeRemoved = userIds;
            if (userEmails) {
                result = yield this.usersByEmails(cU, userEmails);
                if (!result.success)
                    return result;
                userIdsToBeRemoved = result.payload.map((user) => user.id);
            }
            result = yield this.organizationUsers(cU, organizationName, undefined, [
                "organization_administrator",
            ]);
            if (!result.success)
                return result;
            const allAdminIds = result.payload.map((organizationUser) => organizationUser.userId);
            if (allAdminIds.every((elem) => userIdsToBeRemoved.includes(elem))) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NO_ADMINS",
                });
            }
            const organizationResult = yield this.organizationByName(cU, organizationName);
            if (!organizationResult.success)
                return organizationResult;
            result = yield this.deleteRole(cU, userIdsToBeRemoved, "organization", organizationResult.payload.id);
            return result;
        });
    }
    saveSchemaUserSettings(cU, schemaName, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const schemaResult = yield this.schemaByName(cU, schemaName);
            if (!schemaResult.success)
                return schemaResult;
            return this.dal.saveSchemaUserSettings(schemaResult.payload.id, cU.id, settings);
        });
    }
    schemas(cU, schemaIds, schemaNames, schemaNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.schemas(schemaIds, schemaNames, schemaNamePattern);
            return result;
        });
    }
    schemasByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.schemas(cU, ids);
        });
    }
    schemaById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.schemasByIds(cU, [id]);
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
    schemasByNames(cU, names) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.schemas(cU, undefined, names);
        });
    }
    schemaByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.schemasByNames(cU, [name]);
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
    schemaByNamePattern(cU, namePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.schemas(cU, undefined, undefined, namePattern);
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
    schemasByUserOwner(cU, userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByUserOwner(userId, userEmail);
        });
    }
    schemasByOrganizationOwner(cU, organizationId, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByOrganizationOwner(organizationId, organizationName);
        });
    }
    schemasByOrganizationOwnerAdmin(cU, userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemasByOrganizationOwnerAdmin(userId, userEmail);
        });
    }
    accessibleSchemaByName(cU, schemaName, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.schemasByUsers([cU.id], undefined, [schemaName], withSettings);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_SCHEMA_NOT_FOUND",
                        values: [schemaName],
                    });
                }
            }
            return result;
        });
    }
    accessibleSchemas(cU, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.schemasByUsers([cU.id], undefined, undefined, withSettings);
        });
    }
    createSchema(cU, name, label, organizationOwnerId, organizationOwnerName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`createSchema(${cU.id},${name},${label},${organizationOwnerId},${organizationOwnerName})`);
            let result = errResult();
            let userOwnerId = undefined;
            if (organizationOwnerId || organizationOwnerName) {
                if (!organizationOwnerId && organizationOwnerName) {
                    result = yield this.organizationByName(cU, organizationOwnerName);
                    if (!result.success)
                        return result;
                    organizationOwnerId = result.payload.id;
                }
                if (cU.isNotSysAdmin() &&
                    organizationOwnerId &&
                    (yield cU.cant("access_organization", organizationOwnerId))) {
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
                    (yield cU.can("administer_organization", organizationOwnerId))) {
                    result = yield this.setRole(cU, [cU.id], "schema_administrator", "schema", schemaResult.payload);
                    if (!result.success)
                        return result;
                }
                result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(organizationOwnerId, entity_1.Role.sysRoleMap("organization", "schema"), [schemaResult.payload.id]);
            }
            else {
                result = yield this.setRole(cU, [cU.id], "schema_owner", "schema", schemaResult.payload);
            }
            if (!result.success)
                return result;
            return schemaResult;
        });
    }
    removeOrDeleteSchema(cU, schemaName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteSchema(${schemaName},${del})`);
            let result = yield this.addOrRemoveAllExistingRelationships(cU, schemaName, true);
            if (!result.success)
                return result;
            result = yield this.dal.tables(schemaName);
            if (!result.success)
                return result;
            for (const table of result.payload) {
                result = yield this.removeOrDeleteTable(cU, schemaName, table.name, del);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeAllUsersFromSchema(schemaName);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteSchema(schemaName, del);
        });
    }
    schemaUsers(cU, schemaName, userEmails, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(cU, userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
            }
            return this.dal.schemaUsers(schemaName, userIds, withSettings);
        });
    }
    setSchemaUsersRole(cU, schemaName, userEmails, roleName) {
        return __awaiter(this, void 0, void 0, function* () {
            const schemaResult = yield this.schemaByName(cU, schemaName);
            if (!schemaResult.success)
                return schemaResult;
            const usersResult = yield this.usersByEmails(cU, userEmails);
            if (!usersResult.success || !usersResult.payload)
                return usersResult;
            if (usersResult.payload.length != userEmails.length) {
                return errResult({
                    wbCode: "WB_USERS_NOT_FOUND",
                    values: userEmails.filter((x) => !usersResult.payload.includes(x)),
                });
            }
            const userIds = usersResult.payload.map((user) => user.id);
            return yield this.setRole(cU, userIds, roleName, "schema", schemaResult.payload);
        });
    }
    removeSchemaUsers(cU, schemaName, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            const usersResult = yield this.usersByEmails(cU, userEmails);
            if (!usersResult.success)
                return usersResult;
            const userIds = usersResult.payload.map((user) => user.id);
            const schemaResult = yield this.schemaByName(cU, schemaName);
            if (!schemaResult.success)
                return schemaResult;
            if (schemaResult.payload.user_owner_id &&
                userIds.includes(schemaResult.payload.user_owner_id)) {
                return errResult({
                    wbCode: "WB_CANT_REMOVE_SCHEMA_USER_OWNER",
                });
            }
            const result = yield this.deleteRole(cU, userIds, "schema", schemaResult.payload.id);
            return result;
        });
    }
    saveOrganizationUserSettings(cU, organizationName, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const organizationResult = yield this.organizationByName(cU, organizationName);
            if (!organizationResult.success)
                return organizationResult;
            return this.dal.saveOrganizationUserSettings(organizationResult.payload.id, cU.id, settings);
        });
    }
    tables(cU, schemaName, withColumns) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.tables(schemaName);
            if (withColumns) {
                if (!result.success)
                    return result;
                for (const table of result.payload) {
                    const columnsResult = yield this.columns(cU, schemaName, table.name);
                    if (!columnsResult.success)
                        return columnsResult;
                    table.columns = columnsResult.payload;
                }
            }
            return result;
        });
    }
    tableBySchemaNameTableName(cU, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dal.tableBySchemaNameTableName(schemaName, tableName);
        });
    }
    accessibleTableByName(cU, schemaName, tableName, withColumns, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.tablesByUsers(schemaName, [cU.id], undefined, [tableName], withSettings);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_TABLE_NOT_FOUND",
                        values: [tableName],
                    });
                }
                if (withColumns) {
                    const columnsResult = yield this.columns(cU, schemaName, result.payload.name);
                    if (!columnsResult.success)
                        return columnsResult;
                    result.payload.columns = columnsResult.payload;
                }
            }
            return result;
        });
    }
    accessibleTables(cU, schemaName, withColumns, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.tablesByUsers(schemaName, [cU.id], undefined, undefined, withSettings);
            if (withColumns) {
                if (!result.success)
                    return result;
                for (const table of result.payload) {
                    const columnsResult = yield this.columns(cU, schemaName, table.name);
                    if (!columnsResult.success)
                        return columnsResult;
                    table.columns = columnsResult.payload;
                }
            }
            return result;
        });
    }
    addOrCreateTable(cU, schemaName, tableName, tableLabel, create) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addOrCreateTable(${schemaName},${tableName},${tableLabel},${create})`);
            if (!create)
                create = false;
            const tableResult = yield this.dal.addOrCreateTable(schemaName, tableName, tableLabel, create);
            if (!tableResult.success)
                return tableResult;
            let result = yield this.addDefaultTableUsersToTable(cU, tableResult.payload);
            if (!result.success)
                return result;
            result = yield this.deleteAndSetTablePermissions(cU, tableResult.payload);
            if (!result.success)
                return result;
            tableResult.payload.schemaName = schemaName;
            return yield this.trackTableWithPermissions(cU, tableResult.payload);
        });
    }
    removeOrDeleteTable(cU, schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!del)
                del = false;
            let result = yield this.dal.columns(schemaName, tableName);
            if (!result.success)
                return result;
            const columns = result.payload;
            for (const column of columns) {
                result = yield this.removeOrDeleteColumn(cU, schemaName, tableName, column.name, del, true);
                if (!result.success)
                    return result;
            }
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            result = yield this.untrackTableWithPermissions(cU, tableResult.payload);
            if (!result.success)
                return result;
            result = yield this.dal.removeAllTableUsers(tableResult.payload.id);
            if (!result.success)
                return result;
            result = yield this.deleteAndSetTablePermissions(cU, tableResult.payload, true);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteTable(schemaName, tableName, del);
        });
    }
    updateTable(cU, schemaName, tableName, newTableName, newTableLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (newTableName) {
                result = yield this.tables(cU, schemaName, false);
                if (!result.success)
                    return result;
                const existingTableNames = result.payload.map((table) => table.name);
                if (existingTableNames.includes(newTableName)) {
                    return errResult({ wbCode: "WB_TABLE_NAME_EXISTS" });
                }
                result = yield this.untrackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateTable(schemaName, tableName, newTableName, newTableLabel);
            if (!result.success)
                return result;
            if (newTableName) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    addAllExistingTables(cU, schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.discoverTables(schemaName);
            if (!result.success)
                return result;
            const tableNames = result.payload;
            for (const tableName of tableNames) {
                const tableResult = yield this.addOrCreateTable(cU, schemaName, tableName, v.titleCase(tableName.replaceAll("_", " ")), false);
                if (!tableResult.success)
                    return tableResult;
                result = yield this.untrackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
                result = yield this.dal.discoverColumns(schemaName, tableName);
                if (!result.success)
                    return result;
                const columns = result.payload;
                for (const column of columns) {
                    result = yield this.addOrCreateColumn(cU, schemaName, tableName, column.name, v.titleCase(column.name.replaceAll("_", " ")), false, undefined, true);
                    if (!result.success)
                        return result;
                }
                result = yield this.trackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    addOrRemoveAllExistingRelationships(cU, schemaName, remove) {
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
                            result = yield this.removeOrDeleteForeignKey(cU, schemaName, relationship.tableName, [relationship.columnName], relationship.relTableName);
                        }
                        else {
                            result = yield this.addOrCreateForeignKey(cU, schemaName, relationship.tableName, [relationship.columnName], relationship.relTableName, [relationship.relColumnName]);
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
    addDefaultTablePermissions(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addDefaultTablePermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.columns(cU, table.schemaName, table.name);
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
    removeDefaultTablePermissions(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addDefaultTablePermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.columns(cU, table.schemaName, table.name);
            if (!result.success)
                return result;
            if (result.payload.length == 0) {
                return { success: true, payload: true };
            }
            for (const permissionKeyAndType of entity_1.Role.tablePermissionKeysAndActions(table.id)) {
                result = yield hasura_api_1.hasuraApi.deletePermission(table.schemaName, table.name, permissionKeyAndType.action, "wbuser");
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    createOrDeletePrimaryKey(cU, schemaName, tableName, columnNames, del) {
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
    addOrCreateForeignKey(cU, schemaName, tableName, columnNames, parentTableName, parentColumnNames, create) {
        return __awaiter(this, void 0, void 0, function* () {
            let operation = "CREATE";
            if (!create)
                operation = "ADD";
            return yield this.setForeignKey(cU, schemaName, tableName, columnNames, parentTableName, parentColumnNames, operation);
        });
    }
    removeOrDeleteForeignKey(cU, schemaName, tableName, columnNames, parentTableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            let operation = "DELETE";
            if (!del)
                operation = "REMOVE";
            return yield this.setForeignKey(cU, schemaName, tableName, columnNames, parentTableName, [], operation);
        });
    }
    setForeignKey(cU, schemaName, tableName, columnNames, parentTableName, parentColumnNames, operation) {
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
    trackTableWithPermissions(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`trackTableWithPermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield hasura_api_1.hasuraApi.trackTable(table.schemaName, table.name);
            if (!result.success)
                return result;
            return yield this.addDefaultTablePermissions(cU, table);
        });
    }
    untrackTableWithPermissions(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`untrackTableWithPermissions(${JSON.stringify(table)})`);
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.removeDefaultTablePermissions(cU, table);
            if (!result.success)
                return result;
            result = yield hasura_api_1.hasuraApi.untrackTable(table.schemaName, table.name);
            return result;
        });
    }
    tableUsers(cU, schemaName, tableName, userEmails, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(cU, userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
            }
            return this.dal.tableUsers(schemaName, tableName, userIds, withSettings);
        });
    }
    addDefaultTableUsersToTable(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addDefaultTableUsersToTable(${JSON.stringify(table)})`);
            return yield this.dal.setTableUserRolesFromSchemaRoles(table.schemaId, entity_1.Role.sysRoleMap("schema", "table"), [table.id]);
        });
    }
    setTableUsersRole(cU, schemaName, tableName, userEmails, roleName) {
        return __awaiter(this, void 0, void 0, function* () {
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const usersResult = yield this.usersByEmails(cU, userEmails);
            if (!usersResult.success || !usersResult.payload)
                return usersResult;
            if (usersResult.payload.length != userEmails.length) {
                return errResult({
                    wbCode: "WB_USERS_NOT_FOUND",
                    values: userEmails.filter((x) => !usersResult.payload.includes(x)),
                });
            }
            const userIds = usersResult.payload.map((user) => user.id);
            return yield this.setRole(cU, userIds, roleName, "table", tableResult.payload);
        });
    }
    removeUsersFromTable(cU, userEmails, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const usersResult = yield this.usersByEmails(cU, userEmails);
            if (!usersResult.success)
                return usersResult;
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const result = yield this.deleteRole(cU, usersResult.payload, "table", tableResult.payload.id);
            return result;
        });
    }
    saveTableUserSettings(cU, schemaName, tableName, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            return this.dal.saveTableUserSettings(tableResult.payload.id, cU.id, settings);
        });
    }
    columns(cU, schemaName, tableName) {
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
    addOrCreateColumn(cU, schemaName, tableName, columnName, columnLabel, create, columnType, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addOrCreateColumn(${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${skipTracking})`);
            if (!create)
                create = false;
            let result = errResult();
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (!skipTracking) {
                result = yield this.untrackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType);
            if (result.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload);
            }
            return result;
        });
    }
    removeOrDeleteColumn(cU, schemaName, tableName, columnName, del, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteColumn(${schemaName},${tableName},${columnName},${del})`);
            if (!del)
                del = false;
            let result = errResult();
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (!skipTracking) {
                result = yield this.untrackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeOrDeleteColumn(schemaName, tableName, columnName, del);
            if (result.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload);
            }
            return result;
        });
    }
    updateColumn(cU, schemaName, tableName, columnName, newColumnName, newColumnLabel, newType) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (newColumnName) {
                result = yield this.columns(cU, schemaName, tableName);
                if (!result.success)
                    return result;
                const existingColumnNames = result.payload.map((table) => table.name);
                if (existingColumnNames.includes(newColumnName)) {
                    return errResult({ wbCode: "WB_COLUMN_NAME_EXISTS" });
                }
            }
            if (newColumnName || newType) {
                result = yield this.untrackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType);
            if (!result.success)
                return result;
            if (newColumnName || newType) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload);
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
    else if (!result.apolloErrorCode) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ3VycmVudFVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvblVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3BvbGljeS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvb3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvc2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy91c2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvd2hpdGVicmljay1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2csIGVyclJlc3VsdCB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgVXNlcixcbiAgT3JnYW5pemF0aW9uLFxuICBPcmdhbml6YXRpb25Vc2VyLFxuICBTY2hlbWEsXG4gIFNjaGVtYVVzZXIsXG4gIFRhYmxlLFxuICBUYWJsZVVzZXIsXG4gIENvbHVtbixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGZpcnN0IH0gZnJvbSBcInZvY2FcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IERCID09PT09PT09PVxuICAgKi9cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBgICAgIFsgJHtxdWVyeVBhcmFtcy5wYXJhbXMgPyBxdWVyeVBhcmFtcy5wYXJhbXMuam9pbihcIiwgXCIpIDogXCJcIn0gXWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XG4gICAgICBsb2cuZXJyb3IoSlNPTi5zdHJpbmdpZnkoZXJyb3IpKTtcbiAgICAgIHJlc3VsdHMucHVzaChcbiAgICAgICAgZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgIHJlZkNvZGU6IFwiUEdfXCIgKyBlcnJvci5jb2RlLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpXG4gICAgICApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8vIHVzZWQgZm9yIERETCBpZGVudGlmaWVycyAoZWcgQ1JFQVRFIFRBQkxFIHNhbml0aXplKHRhYmxlTmFtZSkpXG4gIHB1YmxpYyBzdGF0aWMgc2FuaXRpemUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvW15cXHclXSsvZywgXCJcIik7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVzSWRMb29rdXAoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgbmFtZUlkTG9va3VwOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLmlkLCB3Yi5yb2xlcy5uYW1lXG4gICAgICAgIEZST00gd2Iucm9sZXNcbiAgICAgICAgV0hFUkUgY3VzdG9tIElTIGZhbHNlXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgbmFtZUlkTG9va3VwW3Jvdy5uYW1lXSA9IHJvdy5pZDtcbiAgICB9XG4gICAgcmVzdWx0LnBheWxvYWQgPSBuYW1lSWRMb29rdXA7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlSWRzRnJvbU5hbWVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWRcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgICAgQU5EIG5hbWU9QU5ZKCQxKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3JvbGVOYW1lc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKChyb3c6IHsgaWQ6IG51bWJlciB9KSA9PiByb3cuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJST0xFX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFR5cGljYWxseSBzZXR0aW5nIGEgcm9sZSBkaXJlY3RseSBpcyBleHBsaWNpdCxcbiAgLy8gc28gYW55IGltcGxpZWRfZnJvbV9yb2xlX2lkIGlzIGNsZWFyZWQgdW5sZXNzIGtlZXBJbXBsaWVkRnJvbVxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXIsXG4gICAga2VlcEltcGxpZWRGcm9tPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnNldFJvbGUoJHt1c2VySWRzfSwke3JvbGVOYW1lfSwke3JvbGVMZXZlbH0sJHtvYmplY3RJZH0sJHtrZWVwSW1wbGllZEZyb219KWBcbiAgICApO1xuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUocm9sZU5hbWUpO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBsZXQgd2JUYWJsZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgd2JDb2x1bW46IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwib3JnYW5pemF0aW9uX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iuc2NoZW1hX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJzY2hlbWFfaWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnRhYmxlX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJ0YWJsZV9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgcGFyYW1zOiBEYXRlW10gPSBbXTtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBsZXQgcXVlcnk6IHN0cmluZyA9IGBcbiAgICAgIElOU0VSVCBJTlRPICR7d2JUYWJsZX0gKHJvbGVfaWQsICB1c2VyX2lkLCAke3diQ29sdW1ufSwgdXBkYXRlZF9hdClcbiAgICAgIFZBTFVFU1xuICAgIGA7XG4gICAgZm9yIChjb25zdCB1c2VySWQgb2YgdXNlcklkcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICAoXG4gICAgICAgICAgJHtyb2xlUmVzdWx0LnBheWxvYWQuaWR9LFxuICAgICAgICAgICR7dXNlcklkfSxcbiAgICAgICAgICAke29iamVjdElkfSxcbiAgICAgICAgICAkJHtwYXJhbXMubGVuZ3RoICsgMX1cbiAgICAgICAgKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGRhdGUpO1xuICAgICAgaWYgKHBhcmFtcy5sZW5ndGggIT0gdXNlcklkcy5sZW5ndGgpIHF1ZXJ5ICs9IFwiLCBcIjtcbiAgICB9XG4gICAgcXVlcnkgKz0gYFxuICAgICAgT04gQ09ORkxJQ1QgKHVzZXJfaWQsICR7d2JDb2x1bW59KVxuICAgICAgRE8gVVBEQVRFIFNFVFxuICAgICAgcm9sZV9pZD1FWENMVURFRC5yb2xlX2lkLFxuICAgICAgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgYDtcbiAgICBpZiAoIWtlZXBJbXBsaWVkRnJvbSkgcXVlcnkgKz0gXCIsIGltcGxpZWRfZnJvbV9yb2xlX2lkPU5VTExcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUm9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZD86IG51bWJlcixcbiAgICBwYXJlbnRPYmplY3RJZD86IG51bWJlcixcbiAgICBpbXBsaWVkRnJvbVJvbGVzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgbnVtYmVyW10gfCB1bmRlZmluZWQpW10gPSBbdXNlcklkc107XG4gICAgbGV0IHdiVGFibGU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHdiV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vyc1wiO1xuICAgICAgICB3YldoZXJlID0gXCJBTkQgb3JnYW5pemF0aW9uX2lkPSQyXCI7XG4gICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5zY2hlbWFfdXNlcnNcIjtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IFwiQU5EIHNjaGVtYV9pZD0kMlwiO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgfSBlbHNlIGlmIChwYXJlbnRPYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBgXG4gICAgICAgICAgICBBTkQgc2NoZW1hX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25fb3duZXJfaWQ9JDJcbiAgICAgICAgICAgIClcbiAgICAgICAgICBgO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKHBhcmVudE9iamVjdElkKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2IudGFibGVfdXNlcnNcIjtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IFwiQU5EIHRhYmxlX2lkPSQyXCI7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IGBcbiAgICAgICAgICAgIEFORCB0YWJsZV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgICAgICBXSEVSRSBzY2hlbWFfaWQ9JDJcbiAgICAgICAgICAgIClcbiAgICAgICAgICBgO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKHBhcmVudE9iamVjdElkKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChpbXBsaWVkRnJvbVJvbGVzKSB7XG4gICAgICB3YldoZXJlICs9IGBBTkQgaW1wbGllZF9mcm9tX3JvbGVfaWQ9QU5ZKCQzKWA7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVJZHNGcm9tTmFtZXMoaW1wbGllZEZyb21Sb2xlcyk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSAke3diVGFibGV9XG4gICAgICAgIFdIRVJFIHVzZXJfaWQ9QU5ZKCQxKVxuICAgICAgICAke3diV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgIHRhYmxlSWQ6IG51bWJlcixcbiAgICBkZWxldGVPbmx5PzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlc0lkTG9va3VwKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCByb2xlc0lkTG9va3VwID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcXVlcnlQYXJhbXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVfcGVybWlzc2lvbnNcbiAgICAgICAgICBXSEVSRSB0YWJsZV9pZD0kMVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFt0YWJsZUlkXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoIWRlbGV0ZU9ubHkpIHtcbiAgICAgIGZvciAoY29uc3QgdGFibGVSb2xlIG9mIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25QcmVmaXggb2YgUm9sZS50YWJsZVBlcm1pc3Npb25QcmVmaXhlcyhcbiAgICAgICAgICB0YWJsZVJvbGVcbiAgICAgICAgKSkge1xuICAgICAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICAgICAgSU5TRVJUIElOVE8gd2IudGFibGVfcGVybWlzc2lvbnModGFibGVfcGVybWlzc2lvbl9rZXksIHVzZXJfaWQsIHRhYmxlX2lkKVxuICAgICAgICAgICAgICBTRUxFQ1QgJyR7Um9sZS50YWJsZVBlcm1pc3Npb25LZXkoXG4gICAgICAgICAgICAgICAgcGVybWlzc2lvblByZWZpeCxcbiAgICAgICAgICAgICAgICB0YWJsZUlkXG4gICAgICAgICAgICAgICl9JywgdXNlcl9pZCwgJHt0YWJsZUlkfVxuICAgICAgICAgICAgICBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2IudGFibGVfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICAgICAgICBXSEVSRSB3Yi50YWJsZV91c2Vycy50YWJsZV9pZD0kMSBBTkQgd2Iucm9sZXMubmFtZT0kMlxuICAgICAgICAgICAgYCxcbiAgICAgICAgICAgIHBhcmFtczogW3RhYmxlSWQsIHRhYmxlUm9sZV0sXG4gICAgICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZE9yTmFtZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIHBhcmVudE9iamVjdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9iamVjdElkOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHF1ZXJ5T2JqSWQ6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbEpvaW46IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0SWRPck5hbWUgPT09IFwibnVtYmVyXCIpIG9iamVjdElkID0gb2JqZWN0SWRPck5hbWU7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW3VzZXJJZF07XG4gICAgY29uc3QgcGFyYW1zT2JqSWQ6IHN0cmluZ1tdID0gW107XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHNxbEpvaW4gPSBgXG4gICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5yb2xlcy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZFxuICAgICAgICBgO1xuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPSQxXG4gICAgICAgIGA7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD0kMlxuICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWRPck5hbWUpO1xuICAgICAgICAgIHNxbEpvaW4gKz0gYFxuICAgICAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICAgIGA7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLm9yZ2FuaXphdGlvbnMubmFtZT0kMlxuICAgICAgICAgIGA7XG4gICAgICAgICAgcXVlcnlPYmpJZCA9XG4gICAgICAgICAgICBcIlNFTEVDVCBpZCBhcyBvYmplY3RfaWQgRlJPTSB3Yi5vcmdhbml6YXRpb25zIFdIRVJFIG5hbWU9JDEgTElNSVQgMVwiO1xuICAgICAgICAgIHBhcmFtc09iaklkLnB1c2gob2JqZWN0SWRPck5hbWUudG9TdHJpbmcoKSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWRcbiAgICAgICAgYDtcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICBXSEVSRSB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9JDJcbiAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICBgO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFzLm5hbWU9JDJcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPVxuICAgICAgICAgICAgXCJTRUxFQ1QgaWQgYXMgb2JqZWN0X2lkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIjtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi50YWJsZV91c2VycyBPTiB3Yi5yb2xlcy5pZD13Yi50YWJsZV91c2Vycy5yb2xlX2lcbiAgICAgICAgYDtcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICBXSEVSRSB3Yi50YWJsZV91c2Vycy51c2VyX2lkPSQxXG4gICAgICAgIGA7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2IudGFibGVfdXNlcnMudGFibGVfaWQ9JDJcbiAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICghcGFyZW50T2JqZWN0TmFtZSkge1xuICAgICAgICAgICAgdGhyb3cgYGRhbC5yb2xlTmFtZUZvclVzZXJPYmplY3QgcGFyZW50T2JqZWN0TmFtZSByZXF1aXJlZCBmb3IgdGFibGUgbGV2ZWxgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZE9yTmFtZSwgcGFyZW50T2JqZWN0TmFtZSk7XG4gICAgICAgICAgc3FsSm9pbiArPSBgXG4gICAgICAgICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi50YWJsZV91c2Vycy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICBgO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi50YWJsZXMubmFtZT0kMlxuICAgICAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT0kM1xuICAgICAgICAgIGA7XG4gICAgICAgICAgcXVlcnlPYmpJZCA9IGBcbiAgICAgICAgICAgIFNFTEVDVCBpZCBhcyBvYmplY3RfaWRcbiAgICAgICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMubmFtZT0kMSBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyXG4gICAgICAgICAgICBMSU1JVCAxXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCksIHBhcmVudE9iamVjdE5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWVcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICAke3NxbEpvaW59XG4gICAgICAgICR7c3FsV2hlcmV9ICBcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCFvYmplY3RJZCkge1xuICAgICAgcXVlcmllcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5T2JqSWQsXG4gICAgICAgIHBhcmFtczogcGFyYW1zT2JqSWQsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIGlmICghcmVzdWx0c1sxXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1sxXTtcbiAgICBjb25zdCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICByb2xlTmFtZTogbnVsbCxcbiAgICAgICAgb2JqZWN0SWQ6IG51bGwsXG4gICAgICB9LFxuICAgIH07XG4gICAgaWYgKHJlc3VsdHNbMF0ucGF5bG9hZC5yb3dzLmxlbmd0aCA9PSAxKSB7XG4gICAgICByZXN1bHQucGF5bG9hZC5yb2xlTmFtZSA9IHJlc3VsdHNbMF0ucGF5bG9hZC5yb3dzWzBdLnJvbGVfbmFtZTtcbiAgICB9XG4gICAgaWYgKG9iamVjdElkKSB7XG4gICAgICByZXN1bHQucGF5bG9hZC5vYmplY3RJZCA9IG9iamVjdElkO1xuICAgIH0gZWxzZSBpZiAocmVzdWx0c1sxXS5wYXlsb2FkLnJvd3MubGVuZ3RoID09IDEpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLm9iamVjdElkID0gcmVzdWx0c1sxXS5wYXlsb2FkLnJvd3NbMF0ub2JqZWN0X2lkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVXNlcnMgPT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1c2VySWRGcm9tQXV0aElkKGF1dGhJZDogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnVzZXJzLmlkXG4gICAgICAgIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgYXV0aF9pZD0kMVxuICAgICAgICBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbYXV0aElkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGlmIChyZXN1bHQucGF5bG9hZC5yb3dzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2F1dGhJZF0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZC5yb3dzWzBdLmlkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJzKFxuICAgIGlkcz86IG51bWJlcltdLFxuICAgIGVtYWlscz86IHN0cmluZ1tdLFxuICAgIHNlYXJjaFBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdIHwgc3RyaW5nKVtdID0gW107XG4gICAgaWYgKGlkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCBpZD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaChpZHMpO1xuICAgIH0gZWxzZSBpZiAoZW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIGVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGVtYWlscyk7XG4gICAgfSBlbHNlIGlmIChzZWFyY2hQYXR0ZXJuKSB7XG4gICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgQU5EIGVtYWlsIExJS0UgJDFcbiAgICAgICAgT1IgZmlyc3RfbmFtZSBMSUtFICQxXG4gICAgICAgIE9SIGxhc3RfbmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goc2VhcmNoUGF0dGVybi5yZXBsYWNlKC9cXCovZywgXCIlXCIpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICBXSEVSRSBpZCBOT1QgSU4gKCR7VXNlci5TWVNfQURNSU5fSUR9KVxuICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIE9SREVSIEJZIGVtYWlsXG4gICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoXG4gICAgZW1haWw6IHN0cmluZyxcbiAgICBmaXJzdE5hbWU6IHN0cmluZyxcbiAgICBsYXN0TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnVzZXJzKFxuICAgICAgICAgIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWVcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMykgUkVUVVJOSU5HICpcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsPzogc3RyaW5nLFxuICAgIGZpcnN0TmFtZT86IHN0cmluZyxcbiAgICBsYXN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWVtYWlsICYmICFmaXJzdE5hbWUgJiYgIWxhc3ROYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogXCJkYWwudXBkYXRlVXNlcjogYWxsIHBhcmFtZXRlcnMgYXJlIG51bGxcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCBwYXJhbUNvdW50ID0gMztcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBwYXJhbXM6IChEYXRlIHwgbnVtYmVyIHwgc3RyaW5nKVtdID0gW2RhdGUsIGlkXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi51c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsKSB7XG4gICAgICBxdWVyeSArPSBgZW1haWw9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbCk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChmaXJzdE5hbWUpIHtcbiAgICAgIHF1ZXJ5ICs9IGBmaXJzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZmlyc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgaWYgKGxhc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgbGFzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2gobGFzdE5hbWUpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBxdWVyeSArPSBcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgZW1haWwgbGlrZSAndGVzdF8ldGVzdC53aGl0ZWJyaWNrLmNvbSdcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnMoXG4gICAgb3JnYW5pemF0aW9uSWRzPzogbnVtYmVyW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmdbXSB8IG51bWJlcltdIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHF1ZXJ5OiBzdHJpbmcgPSBgXG4gICAgICBTRUxFQ1Qgd2Iub3JnYW5pemF0aW9ucy4qXG4gICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbnNcbiAgICBgO1xuICAgIGlmIChvcmdhbml6YXRpb25JZHMpIHtcbiAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD1BTlkoJDEpXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWRzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZT1BTlkoJDEpXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pIHtcbiAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lIExJS0UgJDFcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChvcmdhbml6YXRpb25OYW1lUGF0dGVybik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gdXNlclJvbGUgYW5kIHVzZXJSb2xlSW1wbGllZEZyb20gb25seSByZXR1cm5lZCBpZiB1c2VySWRzL0VtYWlscy5sZW5ndGg9PTFcbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeVVzZXJzKFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAob3JnYW5pemF0aW9uTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiQU5EIHdiLm9yZ2FuaXphdGlvbnMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChvcmdhbml6YXRpb25OYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2Iuc2NoZW1hX3VzZXJzLnNldHRpbmdzIGFzIHNldHRpbmdzXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25zLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb21cbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5vcmdhbml6YXRpb25zLmlkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLm9yZ2FuaXphdGlvbnMoXG4gICAgICAgICAgbmFtZSwgbGFiZWxcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyKVxuICAgICAgICBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IHN0cmluZylbXSA9IFtuZXcgRGF0ZSgpXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi5vcmdhbml6YXRpb25zIFNFVCB1cGRhdGVkX2F0PSQxXCI7XG4gICAgaWYgKG5ld05hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld05hbWUpO1xuICAgICAgcXVlcnkgKz0gYCwgbmFtZT0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmIChuZXdMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TGFiZWwpO1xuICAgICAgcXVlcnkgKz0gYCwgbGFiZWw9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICBxdWVyeSArPSBgIFdIRVJFIG5hbWU9JCR7cGFyYW1zLmxlbmd0aH0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvLyBubyBwYXR0ZXJucyBhbGxvd2VkIGhlcmVcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKG5hbWUucmVwbGFjZSgvXFwlL2csIFwiXCIpKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKFwidGVzdF8lXCIpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbnMoXG4gICAgbmFtZVBhdHRlcm46IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX2lkIElOIChcbiAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLm9yZ2FuaXphdGlvbnMgV0hFUkUgbmFtZSBsaWtlICQxXG4gICAgICAgICAgKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLm9yZ2FuaXphdGlvbnMgV0hFUkUgbmFtZSBsaWtlICQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IE9yZ2FuaXphdGlvbiBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25Vc2VycyhcbiAgICBuYW1lPzogc3RyaW5nLFxuICAgIGlkPzogbnVtYmVyLFxuICAgIHJvbGVzPzogc3RyaW5nW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgc3RyaW5nW10gfCBudW1iZXJbXSlbXSA9IFtdO1xuICAgIGlmIChpZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkKTtcbiAgICB9IGVsc2UgaWYgKG5hbWUpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG5hbWUpO1xuICAgIH1cbiAgICBpZiAocm9sZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiIEFORCB3Yi5yb2xlcy5uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHJvbGVzKTtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlICs9IGAgQU5EIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPUFOWSgkJHtcbiAgICAgICAgcGFyYW1zLmxlbmd0aCArIDFcbiAgICAgIH0pYDtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vycy5zZXR0aW5ncyxcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMuY3JlYXRlZF9hdCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVwZGF0ZWRfYXQsXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICB3Yi5vcmdhbml6YXRpb25zLm5hbWUgYXMgb3JnYW5pemF0aW9uX25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfZW1haWwsXG4gICAgICAgIHdiLnVzZXJzLmZpcnN0X25hbWUgYXMgdXNlcl9maXJzdF9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5sYXN0X25hbWUgYXMgdXNlcl9sYXN0X25hbWUsXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb21cbiAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvblVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncyhcbiAgICBvcmdhbml6YXRpb25JZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgVVBEQVRFIHdiLm9yZ2FuaXphdGlvbl91c2Vyc1xuICAgICAgICBTRVQgc2V0dGluZ3M9JDEsIHVwZGF0ZWRfYXQ9JDJcbiAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX2lkPSQzXG4gICAgICAgIEFORCB1c2VyX2lkPSQ0XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2V0dGluZ3MsIG5ldyBEYXRlKCksIG9yZ2FuaXphdGlvbklkLCB1c2VySWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWFzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXMoXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwZ1BhcmFtczogKHN0cmluZ1tdIHwgbnVtYmVyW10gfCBzdHJpbmcpW10gPSBbXG4gICAgICBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUyxcbiAgICBdO1xuICAgIGNvbnN0IHdiUGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxQZ1doZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXYldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMpIHtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hSWRzKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYU5hbWVzKSB7XG4gICAgICBzcWxQZ1doZXJlID0gXCJBTkQgc2NoZW1hX25hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGdQYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBuYW1lPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hTmFtZVBhdHRlcm4pIHtcbiAgICAgIHNxbFBnV2hlcmUgPSBcIkFORCBzY2hlbWFfbmFtZSBMSUtFICQyXCI7XG4gICAgICBwZ1BhcmFtcy5wdXNoKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIG5hbWUgTElLRSAkMVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhLipcbiAgICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YVxuICAgICAgICAgIFdIRVJFIHNjaGVtYV9uYW1lIE5PVCBMSUtFICdwZ18lJ1xuICAgICAgICAgIEFORCBzY2hlbWFfbmFtZSE9QU5ZKCQxKVxuICAgICAgICAgICR7c3FsUGdXaGVyZX1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBwZ1BhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICR7c3FsV2JXaGVyZX1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiB3YlBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2VzcyAmJiByZXN1bHRzWzFdLnN1Y2Nlc3MpIHtcbiAgICAgIGlmIChyZXN1bHRzWzBdLnBheWxvYWQucm93cy5sZW5ndGggIT0gcmVzdWx0c1sxXS5wYXlsb2FkLnJvd3MubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBcImRhbC5zY2hlbWFzOiB3Yi5zY2hlbWFzIG91dCBvZiBzeW5jIHdpdGggaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRzWzFdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1sxXS5wYXlsb2FkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5VXNlcnMoXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lcz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyW10gfCBzdHJpbmdbXSlbXSA9IFtdO1xuICAgIGxldCBzcWxTZWxlY3Q6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuaWQ9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlscyk7XG4gICAgfVxuICAgIGlmIChzY2hlbWFOYW1lcykge1xuICAgICAgc3FsV2hlcmUgKz0gXCJBTkQgd2Iuc2NoZW1hcy5uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHNjaGVtYU5hbWVzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ICs9IFwiLCB3Yi5zY2hlbWFfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lLFxuICAgICAgICB1c2VyX293bmVycy5lbWFpbCBhcyB1c2VyX293bmVyX2VtYWlsXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iuc2NoZW1hcy5pZD13Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2IudXNlcnMgdXNlcl9vd25lcnMgT04gd2Iuc2NoZW1hcy51c2VyX293bmVyX2lkPXVzZXJfb3duZXJzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICB1c2VySWQ/OiBudW1iZXIsXG4gICAgdXNlckVtYWlsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZCk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWwpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlsKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9vd25lcl9lbWFpbCxcbiAgICAgICAgJ3NjaGVtYV9vd25lcicgYXMgcm9sZV9uYW1lXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKG9yZ2FuaXphdGlvbklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWQpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZT0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi51c2Vycy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbCkge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi51c2Vycy5lbWFpbD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlsKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lXG4gICAgICAgIHNjaGVtYV91c2VyX3JvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBzY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb20sXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5vcmdhbml6YXRpb25zLmlkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIHNjaGVtYV91c2VyX3JvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPXNjaGVtYV91c2VyX3JvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1zY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgIFdIRVJFIHdiLnJvbGVzLm5hbWU9J29yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yJ1xuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlU2NoZW1hKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYENSRUFURSBTQ0hFTUEgJHtEQUwuc2FuaXRpemUobmFtZSl9YCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hcyhcbiAgICAgICAgICAgIG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25fb3duZXJfaWQsIHVzZXJfb3duZXJfaWRcbiAgICAgICAgICApIFZBTFVFUygkMSwgJDIsICQzLCAkNCkgUkVUVVJOSU5HICpcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbk93bmVySWQsIHVzZXJPd25lcklkXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgY29uc3QgaW5zZXJ0UmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICAgIGlmIChpbnNlcnRSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgaW5zZXJ0UmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQoaW5zZXJ0UmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gaW5zZXJ0UmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlU2NoZW1hKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICBXSEVSRSBuYW1lPSQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3NjaGVtYU5hbWVdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgRFJPUCBTQ0hFTUEgSUYgRVhJU1RTICR7REFMLnNhbml0aXplKHNjaGVtYU5hbWUpfSBDQVNDQURFYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gU2NoZW1hIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXJbXSlbXSA9IFtzY2hlbWFOYW1lXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZSA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZCxcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBzY2hlbWFJZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGVzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLipcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMudGFibGVfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHRhYmxlX25hbWU6IHN0cmluZyB9KSA9PiByb3cudGFibGVfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXNCeVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHRhYmxlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnVzZXJzLmVtYWlsPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAodGFibGVOYW1lcykge1xuICAgICAgc3FsV2hlcmUgKz0gXCJBTkQgd2IudGFibGVzLm5hbWU9QU5ZKCQzKVwiO1xuICAgICAgcGFyYW1zLnB1c2godGFibGVOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2IudGFibGVfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlcy4qLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudGFibGVfdXNlcnMgT04gd2IudGFibGVzLmlkPXdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyB0eXBlID0gZm9yZWlnbktleXN8cmVmZXJlbmNlc3xhbGxcbiAgcHVibGljIGFzeW5jIGZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZVBhdHRlcm46IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKHRhYmxlTmFtZVBhdHRlcm4pO1xuICAgIGNvbHVtbk5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWVQYXR0ZXJuKTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlIFwiRk9SRUlHTl9LRVlTXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCBmay50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIGZrLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJSRUZFUkVOQ0VTXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCByZWYudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCByZWYuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIkFMTFwiOlxuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICAtLSB1bmlxdWUgcmVmZXJlbmNlIGluZm9cbiAgICAgICAgcmVmLnRhYmxlX25hbWUgICAgICAgQVMgcmVmX3RhYmxlLFxuICAgICAgICByZWYuY29sdW1uX25hbWUgICAgICBBUyByZWZfY29sdW1uLFxuICAgICAgICByZWZkLmNvbnN0cmFpbnRfdHlwZSBBUyByZWZfdHlwZSwgLS0gZS5nLiBVTklRVUUgb3IgUFJJTUFSWSBLRVlcbiAgICAgICAgLS0gZm9yZWlnbiBrZXkgaW5mb1xuICAgICAgICBmay50YWJsZV9uYW1lICAgICAgICBBUyBma190YWJsZSxcbiAgICAgICAgZmsuY29sdW1uX25hbWUgICAgICAgQVMgZmtfY29sdW1uLFxuICAgICAgICBmay5jb25zdHJhaW50X25hbWUgICBBUyBma19uYW1lLFxuICAgICAgICBtYXAudXBkYXRlX3J1bGUgICAgICBBUyBma19vbl91cGRhdGUsXG4gICAgICAgIG1hcC5kZWxldGVfcnVsZSAgICAgIEFTIGZrX29uX2RlbGV0ZVxuICAgICAgICAtLSBsaXN0cyBmayBjb25zdHJhaW50cyBBTkQgbWFwcyB0aGVtIHRvIHBrIGNvbnN0cmFpbnRzXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnJlZmVyZW50aWFsX2NvbnN0cmFpbnRzIEFTIG1hcFxuICAgICAgICAtLSBqb2luIHVuaXF1ZSBjb25zdHJhaW50cyAoZS5nLiBQS3MgY29uc3RyYWludHMpIHRvIHJlZiBjb2x1bW5zIGluZm9cbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyByZWZcbiAgICAgICAgT04gIHJlZi5jb25zdHJhaW50X2NhdGFsb2cgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9uYW1lXG4gICAgICAgIC0tIG9wdGlvbmFsOiB0byBpbmNsdWRlIHJlZmVyZW5jZSBjb25zdHJhaW50IHR5cGVcbiAgICAgICAgTEVGVCBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyBBUyByZWZkXG4gICAgICAgIE9OICByZWZkLmNvbnN0cmFpbnRfY2F0YWxvZyA9IHJlZi5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9zY2hlbWEgPSByZWYuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9uYW1lID0gcmVmLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBqb2luIGZrIGNvbHVtbnMgdG8gdGhlIGNvcnJlY3QgcmVmIGNvbHVtbnMgdXNpbmcgb3JkaW5hbCBwb3NpdGlvbnNcbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyBma1xuICAgICAgICBPTiAgZmsuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLmNvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgZmsuY29uc3RyYWludF9zY2hlbWEgPSBtYXAuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC5jb25zdHJhaW50X25hbWVcbiAgICAgICAgQU5EIGZrLnBvc2l0aW9uX2luX3VuaXF1ZV9jb25zdHJhaW50ID0gcmVmLm9yZGluYWxfcG9zaXRpb24gLS1JTVBPUlRBTlQhXG4gICAgICAgIFdIRVJFIHJlZi50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgIEFORCBmay50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgY29uc3RyYWludHM6IENvbnN0cmFpbnRJZFtdID0gW107XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgY29uc3QgY29uc3RyYWludDogQ29uc3RyYWludElkID0ge1xuICAgICAgICBjb25zdHJhaW50TmFtZTogcm93LmZrX25hbWUsXG4gICAgICAgIHRhYmxlTmFtZTogcm93LmZrX3RhYmxlLFxuICAgICAgICBjb2x1bW5OYW1lOiByb3cuZmtfY29sdW1uLFxuICAgICAgICByZWxUYWJsZU5hbWU6IHJvdy5yZWZfdGFibGUsXG4gICAgICAgIHJlbENvbHVtbk5hbWU6IHJvdy5yZWZfY29sdW1uLFxuICAgICAgfTtcbiAgICAgIGNvbnN0cmFpbnRzLnB1c2goY29uc3RyYWludCk7XG4gICAgfVxuICAgIHJlc3VsdC5wYXlsb2FkID0gY29uc3RyYWludHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcmltYXJ5S2V5cyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgRElTVElOQ1QgYy5jb2x1bW5fbmFtZSwgdGMuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIHRjIFxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb25zdHJhaW50X2NvbHVtbl91c2FnZSBBUyBjY3VcbiAgICAgICAgVVNJTkcgKGNvbnN0cmFpbnRfc2NoZW1hLCBjb25zdHJhaW50X25hbWUpXG4gICAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgQVMgY1xuICAgICAgICBPTiBjLnRhYmxlX3NjaGVtYSA9IHRjLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCB0Yy50YWJsZV9uYW1lID0gYy50YWJsZV9uYW1lXG4gICAgICAgIEFORCBjY3UuY29sdW1uX25hbWUgPSBjLmNvbHVtbl9uYW1lXG4gICAgICAgIFdIRVJFIGNvbnN0cmFpbnRfdHlwZSA9ICdQUklNQVJZIEtFWSdcbiAgICAgICAgQU5EIGMudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9ICcke3RhYmxlTmFtZX0nXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgICAgcEtDb2xzQ29uc3RyYWludHNbcm93LmNvbHVtbl9uYW1lXSA9IHJvdy5jb25zdHJhaW50X25hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHBLQ29sc0NvbnN0cmFpbnRzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbnN0cmFpbnROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdHJhaW50TmFtZSA9IERBTC5zYW5pdGl6ZShjb25zdHJhaW50TmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUyAke2NvbnN0cmFpbnROYW1lfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgUFJJTUFSWSBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KTtcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuY3JlYXRlRm9yZWlnbktleSgke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgcGFyZW50VGFibGVOYW1lID0gREFMLnNhbml0aXplKHBhcmVudFRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBwYXJlbnRDb2x1bW5OYW1lIG9mIHBhcmVudENvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShwYXJlbnRDb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIEFERCBDT05TVFJBSU5UICR7dGFibGVOYW1lfV8ke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCJfXCIpfV9ma2V5XG4gICAgICAgIEZPUkVJR04gS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgUkVGRVJFTkNFUyAke3NjaGVtYU5hbWV9LiR7cGFyZW50VGFibGVOYW1lfVxuICAgICAgICAgICgke3Nhbml0aXplZFBhcmVudENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgT04gREVMRVRFIFNFVCBOVUxMXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKiwgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlVGFibGUgJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHt0YWJsZUxhYmVsfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZXMoc2NoZW1hX2lkLCBuYW1lLCBsYWJlbClcbiAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKSBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWRbMF0uaWQsIHRhYmxlTmFtZSwgdGFibGVMYWJlbF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIigpYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAoY3JlYXRlICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMSBBTkQgbmFtZT0kMlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZFswXS5pZCwgdGFibGVOYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIgQ0FTQ0FERWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi50YWJsZXMgU0VUXG4gICAgYDtcbiAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1RhYmxlTGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgVE8gJHtuZXdUYWJsZU5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdKVtdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmUgPSBcIlwiO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9QU5ZKCQzKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2IudGFibGVfdXNlcnMudGFibGVfaWQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi50YWJsZV91c2Vycy51cGRhdGVkX2F0LFxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lLFxuICAgICAgICB3Yi50YWJsZXMubmFtZSBhcyB0YWJsZV9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX2VtYWlsLFxuICAgICAgICB3Yi51c2Vycy5maXJzdF9uYW1lIGFzIHVzZXJfZmlyc3RfbmFtZSxcbiAgICAgICAgd2IudXNlcnMubGFzdF9uYW1lIGFzIHVzZXJfbGFzdF9uYW1lLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IudGFibGVfdXNlcnMudGFibGVfaWQ9d2IudGFibGVzLmlkXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi50YWJsZV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2IudGFibGVfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDJcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gVGFibGVVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1RBQkxFX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaWYgIXRhYmxlSWRzIGFsbCB0YWJsZXMgZm9yIHNjaGVtYVxuICAvLyBpZiAhdXNlcklkcyBhbGwgc2NoZW1hX3VzZXJzXG4gIHB1YmxpYyBhc3luYyBzZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoXG4gICAgb3JnYW5pemF0aW9uSWQ6IG51bWJlcixcbiAgICByb2xlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCAvLyBlZyB7IHNjaGVtYV9vd25lcjogXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIgfVxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcygke29yZ2FuaXphdGlvbklkfSwgPHJvbGVNYXA+LCAke3NjaGVtYUlkc30sICR7dXNlcklkc30sICR7Y2xlYXJFeGlzdGluZ30pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlU2NoZW1hc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVNjaGVtYVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHNjaGVtYUlkcyAmJiBzY2hlbWFJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVTY2hlbWFzU3FsID0gYEFORCB3Yi5zY2hlbWFzLmlkIElOICgke3NjaGVtYUlkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMgJiYgdXNlcklkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVNjaGVtYVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmcpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIFdIRVJFXG4gICAgICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlU2NoZW1hc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFVc2Vyc1NxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbb3JnYW5pemF0aW9uSWRdLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVwZGF0ZSBpbXBsaWVkIHJvbGVzIG9ubHksIGxlYXZlIGV4cGxpY2l0IHJvbGVzIGFsb25lXG4gICAgICBvbkNvbmZsaWN0U3FsID0gYFxuICAgICAgICBPTiBDT05GTElDVCAoc2NoZW1hX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBvcmdhbml6YXRpb25Sb2xlIG9mIE9iamVjdC5rZXlzKHJvbGVNYXApKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi5zY2hlbWFfdXNlcnMoc2NoZW1hX2lkLCB1c2VyX2lkLCByb2xlX2lkLCBpbXBsaWVkX2Zyb21fcm9sZV9pZCwgdXBkYXRlZF9hdClcbiAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICB3Yi5zY2hlbWFzLmlkLFxuICAgICAgICAgIHVzZXJfaWQsXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbb3JnYW5pemF0aW9uUm9sZV1dfSxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbb3JnYW5pemF0aW9uUm9sZV19LFxuICAgICAgICAgICQxXG4gICAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPSQyXG4gICAgICAgICAgQU5EIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPSQzXG4gICAgICAgICAgJHt3aGVyZVNjaGVtYXNTcWx9XG4gICAgICAgICAgJHt3aGVyZVVzZXJzU3FsfVxuICAgICAgICAgICR7b25Db25mbGljdFNxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbZGF0ZSwgb3JnYW5pemF0aW9uSWQsIHJvbGVzSWRMb29rdXBbb3JnYW5pemF0aW9uUm9sZV1dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKHF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLy8gaWYgIXRhYmxlSWRzIGFsbCB0YWJsZXMgZm9yIHNjaGVtYVxuICAvLyBpZiAhdXNlcklkcyBhbGwgc2NoZW1hX3VzZXJzXG4gIHB1YmxpYyBhc3luYyBzZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIHJvbGVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgdGFibGVJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgY2xlYXJFeGlzdGluZz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKCR7c2NoZW1hSWR9LCA8cm9sZU1hcD4sICR7dGFibGVJZHN9LCAke3VzZXJJZHN9LCAke2NsZWFyRXhpc3Rpbmd9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVzSWRMb29rdXAoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGxldCB3aGVyZVRhYmxlc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVRhYmxlVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCBvbkNvbmZsaWN0U3FsID0gXCJcIjtcbiAgICBpZiAodGFibGVJZHMgJiYgdGFibGVJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVUYWJsZXNTcWwgPSBgQU5EIHdiLnRhYmxlcy5pZCBJTiAoJHt0YWJsZUlkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMgJiYgdXNlcklkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVRhYmxlVXNlcnNTcWwgPSBgXG4gICAgICAgIEFORCB3Yi50YWJsZV91c2Vycy51c2VyX2lkIElOICgke3VzZXJJZHMuam9pbihcIixcIil9KVxuICAgICAgYDtcbiAgICAgIHdoZXJlVXNlcnNTcWwgPSBgQU5EIHdiLnVzZXJzLmlkIElOICgke3VzZXJJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGNvbnN0IHJvbGVzSWRMb29rdXAgPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtdO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGlmIChjbGVhckV4aXN0aW5nKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICAgIFdIRVJFXG4gICAgICAgICAgICB3Yi50YWJsZV91c2Vycy50YWJsZV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMuc2NoZW1hX2lkPSQxXG4gICAgICAgICAgICAgICR7d2hlcmVUYWJsZXNTcWx9XG4gICAgICAgICAgICApXG4gICAgICAgICAgICAke3doZXJlVGFibGVVc2Vyc1NxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hSWRdLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVwZGF0ZSBpbXBsaWVkIHJvbGVzIG9ubHksIGxlYXZlIGV4cGxpY2l0IHJvbGVzIGFsb25lXG4gICAgICBvbkNvbmZsaWN0U3FsID0gYFxuICAgICAgICBPTiBDT05GTElDVCAodGFibGVfaWQsIHVzZXJfaWQpXG4gICAgICAgIERPIFVQREFURSBTRVQgcm9sZV9pZD1FWENMVURFRC5yb2xlX2lkLCB1cGRhdGVkX2F0PUVYQ0xVREVELnVwZGF0ZWRfYXRcbiAgICAgICAgV0hFUkUgd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQgSVMgTk9UIE5VTExcbiAgICAgIGA7XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc2NoZW1hUm9sZSBvZiBPYmplY3Qua2V5cyhyb2xlTWFwKSkge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2IudGFibGVfdXNlcnModGFibGVfaWQsIHVzZXJfaWQsIHJvbGVfaWQsIGltcGxpZWRfZnJvbV9yb2xlX2lkLCB1cGRhdGVkX2F0KVxuICAgICAgICAgIFNFTEVDVFxuICAgICAgICAgIHdiLnRhYmxlcy5pZCxcbiAgICAgICAgICB1c2VyX2lkLFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtyb2xlTWFwW3NjaGVtYVJvbGVdXX0sXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3NjaGVtYVJvbGVdfSxcbiAgICAgICAgICAkMVxuICAgICAgICAgIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnNjaGVtYXMuaWQ9d2IudGFibGVzLnNjaGVtYV9pZFxuICAgICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgICBXSEVSRSB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPSQyIEFORCB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD0kM1xuICAgICAgICAgICR7d2hlcmVUYWJsZXNTcWx9XG4gICAgICAgICAgJHt3aGVyZVVzZXJzU3FsfVxuICAgICAgICAgICR7b25Db25mbGljdFNxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbZGF0ZSwgc2NoZW1hSWQsIHJvbGVzSWRMb29rdXBbc2NoZW1hUm9sZV1dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKHF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFRhYmxlVXNlcnMoXG4gICAgdGFibGVJZD86IG51bWJlcixcbiAgICBzY2hlbWFJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnlXaGVyZSA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiBudW1iZXJbXSA9IFtdO1xuICAgIGlmICh0YWJsZUlkKSB7XG4gICAgICBxdWVyeVdoZXJlID0gXCJXSEVSRSB0YWJsZV9pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godGFibGVJZCk7XG4gICAgfSBlbHNlIGlmIChzY2hlbWFJZCkge1xuICAgICAgcXVlcnlXaGVyZSA9IGBcbiAgICAgICAgV0hFUkUgdGFibGVfaWQgSU4gKFxuICAgICAgICAgIFNFTEVDVCBpZCBmcm9tIHdiLnRhYmxlc1xuICAgICAgICAgIFdIRVJFIHdiLnRhYmxlcy5zY2hlbWFfaWQ9JDFcbiAgICAgICAgKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKHNjaGVtYUlkKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgJHtxdWVyeVdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIHRhYmxlSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICBTRVQgc2V0dGluZ3M9JDEsIHVwZGF0ZWRfYXQ9JDJcbiAgICAgICAgV0hFUkUgdGFibGVfaWQ9JDNcbiAgICAgICAgQU5EIHVzZXJfaWQ9JDRcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzZXR0aW5ncywgbmV3IERhdGUoKSwgdGFibGVJZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gQ29sdW1ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5CeVNjaGVtYVRhYmxlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiQ09MVU1OX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5OiBzdHJpbmcgPSBgXG4gICAgICBTRUxFQ1Qgd2IuY29sdW1ucy4qLCBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy5kYXRhX3R5cGUgYXMgdHlwZVxuICAgICAgRlJPTSB3Yi5jb2x1bW5zXG4gICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi5jb2x1bW5zLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBPTiAoXG4gICAgICAgIHdiLmNvbHVtbnMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy5jb2x1bW5fbmFtZVxuICAgICAgICBBTkQgd2Iuc2NoZW1hcy5uYW1lPWluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX3NjaGVtYVxuICAgICAgKVxuICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBBTkQgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMudGFibGVfbmFtZT0kMlxuICAgIGA7XG4gICAgbGV0IHBhcmFtczogc3RyaW5nW10gPSBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXTtcbiAgICBpZiAoY29sdW1uTmFtZSkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyeX0gQU5EIHdiLmNvbHVtbnMubmFtZT0kMyBBTkQgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWU9JDNgO1xuICAgICAgcGFyYW1zLnB1c2goY29sdW1uTmFtZSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBDb2x1bW4ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJDb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgY29sdW1uX25hbWUgYXMgbmFtZSwgZGF0YV90eXBlIGFzIHR5cGVcbiAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1uc1xuICAgICAgICBXSEVSRSB0YWJsZV9zY2hlbWE9JDFcbiAgICAgICAgQU5EIHRhYmxlX25hbWU9JDJcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBDb2x1bW4ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5MYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhbixcbiAgICBjb2x1bW5QR1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGRhbC5hZGRPckNyZWF0ZUNvbHVtbiAke3NjaGVtYU5hbWV9ICR7dGFibGVOYW1lfSAke2NvbHVtbk5hbWV9ICR7Y29sdW1uTGFiZWx9ICR7Y29sdW1uUEdUeXBlfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbHVtbk5hbWUgPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi5jb2x1bW5zKHRhYmxlX2lkLCBuYW1lLCBsYWJlbClcbiAgICAgICAgICBWQUxVRVMgKCQxLCAkMiwgJDMpXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lLCBjb2x1bW5MYWJlbF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgQUREICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5QR1R5cGV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtdO1xuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld0NvbHVtbkxhYmVsKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5CeVNjaGVtYVRhYmxlQ29sdW1uKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgICBVUERBVEUgd2IuY29sdW1ucyBTRVRcbiAgICAgIGA7XG4gICAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICAgIHBhcmFtcy5wdXNoKG5ld0NvbHVtbk5hbWUpO1xuICAgICAgICB1cGRhdGVzLnB1c2goXCJuYW1lPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgaWYgKG5ld0NvbHVtbkxhYmVsKSB7XG4gICAgICAgIHBhcmFtcy5wdXNoKG5ld0NvbHVtbkxhYmVsKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgICBxdWVyeSArPSBgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX0gV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBpZiAobmV3VHlwZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgQUxURVIgQ09MVU1OICR7Y29sdW1uTmFtZX0gVFlQRSAke25ld1R5cGV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIFJFTkFNRSBDT0xVTU4gJHtjb2x1bW5OYW1lfSBUTyAke25ld0NvbHVtbk5hbWV9XG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbHVtbk5hbWUgPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5jb2x1bW5zXG4gICAgICAgICAgV0hFUkUgdGFibGVfaWQ9JDEgQU5EIG5hbWU9JDJcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWQuaWQsIGNvbHVtbk5hbWVdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbk5hbWV9IENBU0NBREVcbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29uc3RyYWludElkLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBDb2x1bW4ge1xuICBzdGF0aWMgQ09NTU9OX1RZUEVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIFRleHQ6IFwidGV4dFwiLFxuICAgIE51bWJlcjogXCJpbnRlZ2VyXCIsXG4gICAgRGVjaW1hbDogXCJkZWNpbWFsXCIsXG4gICAgQm9vbGVhbjogXCJib29sZWFuXCIsXG4gICAgRGF0ZTogXCJkYXRlXCIsXG4gICAgXCJEYXRlICYgVGltZVwiOiBcInRpbWVzdGFtcFwiLFxuICB9O1xuXG4gIGlkITogbnVtYmVyO1xuICB0YWJsZUlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgdHlwZSE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBpc1ByaW1hcnlLZXkhOiBib29sZWFuO1xuICBmb3JlaWduS2V5cyE6IFtDb25zdHJhaW50SWRdO1xuICByZWZlcmVuY2VkQnkhOiBbQ29uc3RyYWludElkXTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PENvbHVtbj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiQ29sdW1uLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBBcnJheTxDb2x1bW4+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBjb2x1bW5zLnB1c2goQ29sdW1uLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBjb2x1bW5zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogQ29sdW1uIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIkNvbHVtbi5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBjb2x1bW4gPSBuZXcgQ29sdW1uKCk7XG4gICAgY29sdW1uLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgY29sdW1uLnRhYmxlSWQgPSBwYXJzZUludChkYXRhLnRhYmxlX2lkKTtcbiAgICBjb2x1bW4ubmFtZSA9IGRhdGEubmFtZTtcbiAgICBjb2x1bW4ubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIGNvbHVtbi50eXBlID0gZGF0YS50eXBlO1xuICAgIGNvbHVtbi5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgY29sdW1uLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gY29sdW1uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBVc2VyIH0gZnJvbSBcIi5cIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nLCBXaGl0ZWJyaWNrQ2xvdWQgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuaW1wb3J0IHsgUm9sZUxldmVsLCBVc2VyQWN0aW9uUGVybWlzc2lvbiB9IGZyb20gXCIuL1JvbGVcIjtcbmltcG9ydCB7IERFRkFVTFRfUE9MSUNZIH0gZnJvbSBcIi4uL3BvbGljeVwiO1xuXG5leHBvcnQgY2xhc3MgQ3VycmVudFVzZXIge1xuICB3YkNsb3VkITogV2hpdGVicmlja0Nsb3VkO1xuICB1c2VyITogVXNlcjtcbiAgaWQhOiBudW1iZXI7XG4gIGFjdGlvbkhpc3Rvcnk6IFVzZXJBY3Rpb25QZXJtaXNzaW9uW10gPSBbXTtcblxuICAvLyB7IHJvbGVMZXZlbDogeyBvYmplY3RJZDogeyB1c2VyQWN0aW9uOiB7IGNoZWNrZWRGb3JSb2xlTmFtZTogc3RyaW5nLCBwZXJtaXR0ZWQ6IHRydWUvZmFsc2V9IH0gfSB9XG4gIG9iamVjdFBlcm1pc3Npb25zTG9va3VwOiBSZWNvcmQ8XG4gICAgUm9sZUxldmVsLFxuICAgIFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+PlxuICA+ID0ge1xuICAgIG9yZ2FuaXphdGlvbjoge30sXG4gICAgc2NoZW1hOiB7fSxcbiAgICB0YWJsZToge30sXG4gIH07XG5cbiAgY29uc3RydWN0b3Iod2JDbG91ZDogV2hpdGVicmlja0Nsb3VkLCB1c2VyOiBVc2VyKSB7XG4gICAgdGhpcy53YkNsb3VkID0gd2JDbG91ZDtcbiAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgIHRoaXMuaWQgPSB1c2VyLmlkO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRTeXNBZG1pbih3YkNsb3VkOiBXaGl0ZWJyaWNrQ2xvdWQpIHtcbiAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKHdiQ2xvdWQsIFVzZXIuZ2V0U3lzQWRtaW5Vc2VyKCkpO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRQdWJsaWMod2JDbG91ZDogV2hpdGVicmlja0Nsb3VkKSB7XG4gICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcih3YkNsb3VkLCBVc2VyLmdldFB1YmxpY1VzZXIoKSk7XG4gIH1cblxuICBwdWJsaWMgaXNTaWduZWRJbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkICE9PSBVc2VyLlBVQkxJQ19JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZE91dCgpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzUHVibGljKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1NpZ25lZEluKCk7XG4gIH1cblxuICBwdWJsaWMgaXNTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09PSBVc2VyLlNZU19BRE1JTl9JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc05vdFN5c0FkbWluKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1N5c0FkbWluO1xuICB9XG5cbiAgcHVibGljIGlkSXMob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PSBvdGhlcklkO1xuICB9XG5cbiAgcHVibGljIGlkSXNOb3Qob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuICF0aGlzLmlkSXMob3RoZXJJZCk7XG4gIH1cblxuICBwdWJsaWMgZGVuaWVkKCkge1xuICAgIGxldCBtZXNzYWdlID0gXCJJTlRFUk5BTCBFUlJPUjogTGFzdCBVc2VyQWN0aW9uUGVybWlzc2lvbiBub3QgcmVjb3JkZWQuIFwiO1xuICAgIGxldCB2YWx1ZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgbGFzdFVBUCA9IHRoaXMuYWN0aW9uSGlzdG9yeS5wb3AoKTtcbiAgICBpZiAobGFzdFVBUCkge1xuICAgICAgbWVzc2FnZSA9IGBZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byAke2xhc3RVQVAuZGVzY3JpcHRpb259LmA7XG4gICAgICBsZXQgdXNlclN0ciA9IGB1c2VySWQ9JHt0aGlzLmlkfWA7XG4gICAgICBpZiAodGhpcy51c2VyICYmIHRoaXMudXNlci5lbWFpbCkge1xuICAgICAgICB1c2VyU3RyID0gYHVzZXJFbWFpbD0ke3RoaXMudXNlci5lbWFpbH0sICR7dXNlclN0cn1gO1xuICAgICAgfVxuICAgICAgdmFsdWVzID0gW1xuICAgICAgICB1c2VyU3RyLFxuICAgICAgICBgb2JqZWN0SWQ9JHtsYXN0VUFQLm9iamVjdElkfWAsXG4gICAgICAgIGB1c2VyQWN0aW9uPSR7bGFzdFVBUC51c2VyQWN0aW9ufWAsXG4gICAgICAgIGBjaGVja2VkRm9yUm9sZU5hbWU9JHtsYXN0VUFQLmNoZWNrZWRGb3JSb2xlTmFtZX1gLFxuICAgICAgICBgY2hlY2tlZEF0PSR7bGFzdFVBUC5jaGVja2VkQXR9YCxcbiAgICAgIF07XG4gICAgfVxuICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgICAgdmFsdWVzOiB2YWx1ZXMsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU2lnbmVkSW4oKSB7XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IFwiWW91IG11c3QgYmUgc2lnbmVkLWluIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICAvLyBUQkQgbW92ZSB0byBFbGFzdGlDYWNoZVxuICBwcml2YXRlIGdldE9iamVjdFBlcm1pc3Npb24oXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgdXNlckFjdGlvbjogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nXG4gICkge1xuICAgIGlmIChcbiAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldICYmXG4gICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcm9sZUxldmVsOiByb2xlTGV2ZWwsXG4gICAgICAgIHVzZXJBY3Rpb246IHVzZXJBY3Rpb24sXG4gICAgICAgIG9iamVjdEtleToga2V5LFxuICAgICAgICBvYmplY3RJZDpcbiAgICAgICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXS5vYmtlY3RJZCxcbiAgICAgICAgY2hlY2tlZEZvclJvbGVOYW1lOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dXG4gICAgICAgICAgICAuY2hlY2tlZEZvclJvbGVOYW1lLFxuICAgICAgICBwZXJtaXR0ZWQ6XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl0ucGVybWl0dGVkLFxuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXS5kZXNjcmlwdGlvbixcbiAgICAgIH0gYXMgVXNlckFjdGlvblBlcm1pc3Npb247XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRCRCBtb3ZlIHRvIEVsYXN0aUNhY2hlXG4gIHByaXZhdGUgc2V0T2JqZWN0UGVybWlzc2lvbih1QVA6IFVzZXJBY3Rpb25QZXJtaXNzaW9uKSB7XG4gICAgaWYgKCF0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3VBUC5yb2xlTGV2ZWxdW3VBUC5vYmplY3RJZF0pIHtcbiAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbdUFQLnJvbGVMZXZlbF1bdUFQLm9iamVjdElkXSA9IHt9O1xuICAgIH1cbiAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3VBUC5yb2xlTGV2ZWxdW3VBUC5vYmplY3RJZF1bdUFQLnVzZXJBY3Rpb25dID1cbiAgICAgIHtcbiAgICAgICAgcGVybWl0dGVkOiB1QVAucGVybWl0dGVkLFxuICAgICAgICBjaGVja2VkRm9yUm9sZU5hbWU6IHVBUC5jaGVja2VkRm9yUm9sZU5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiB1QVAuZGVzY3JpcHRpb24sXG4gICAgICB9O1xuICAgIHJldHVybiB1QVA7XG4gIH1cblxuICBwcml2YXRlIHJlY29yZEFjdGlvbkhpc3RvcnkodUFQOiBVc2VyQWN0aW9uUGVybWlzc2lvbikge1xuICAgIHVBUC5jaGVja2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgIHRoaXMuYWN0aW9uSGlzdG9yeS5wdXNoKHVBUCk7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFVzZXJBY3Rpb25Qb2xpY3koXG4gICAgcG9saWN5OiBSZWNvcmQ8c3RyaW5nLCBhbnk+W10sXG4gICAgdXNlckFjdGlvbjogc3RyaW5nXG4gICkge1xuICAgIGZvciAoY29uc3QgdXNlckFjdGlvblBvbGljeSBvZiBwb2xpY3kpIHtcbiAgICAgIGlmICh1c2VyQWN0aW9uUG9saWN5LnVzZXJBY3Rpb24gPT0gdXNlckFjdGlvbikge1xuICAgICAgICByZXR1cm4gdXNlckFjdGlvblBvbGljeTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldE9iamVjdExvb2t1cEtleShcbiAgICBvYmplY3RJZE9yTmFtZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIHBhcmVudE9iamVjdE5hbWU/OiBzdHJpbmdcbiAgKSB7XG4gICAgbGV0IGtleTogc3RyaW5nID0gb2JqZWN0SWRPck5hbWUudG9TdHJpbmcoKTtcbiAgICBpZiAodHlwZW9mIG9iamVjdElkT3JOYW1lID09PSBcIm51bWJlclwiKSB7XG4gICAgICBrZXkgPSBgaWQke29iamVjdElkT3JOYW1lfWA7XG4gICAgfSBlbHNlIGlmIChwYXJlbnRPYmplY3ROYW1lKSB7XG4gICAgICBrZXkgPSBgJHtwYXJlbnRPYmplY3ROYW1lfS4ke29iamVjdElkT3JOYW1lfWA7XG4gICAgfVxuICAgIHJldHVybiBrZXk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY2FuKFxuICAgIHVzZXJBY3Rpb246IHN0cmluZyxcbiAgICBvYmplY3RJZE9yTmFtZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIHBhcmVudE9iamVjdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKHRoaXMuaXNTeXNBZG1pbigpKSByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCBwb2xpY3kgPSBERUZBVUxUX1BPTElDWVt1c2VyQWN0aW9uXTtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgY3VycmVudFVzZXIuY2FuKCR7dXNlckFjdGlvbn0sJHtvYmplY3RJZE9yTmFtZX0pIHBvbGljeToke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICBwb2xpY3lcbiAgICAgICl9YFxuICAgICk7XG4gICAgaWYgKCFwb2xpY3kpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTm8gcG9saWN5IGZvdW5kIGZvciB1c2VyQWN0aW9uPSR7dXNlckFjdGlvbn1gO1xuICAgICAgbG9nLmVycm9yKG1lc3NhZ2UpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgIH1cbiAgICBsZXQga2V5ID0gdGhpcy5nZXRPYmplY3RMb29rdXBLZXkob2JqZWN0SWRPck5hbWUsIHBhcmVudE9iamVjdE5hbWUpO1xuICAgIGNvbnN0IGFscmVhZHlDaGVja2VkID0gdGhpcy5nZXRPYmplY3RQZXJtaXNzaW9uKFxuICAgICAgcG9saWN5LnJvbGVMZXZlbCxcbiAgICAgIHVzZXJBY3Rpb24sXG4gICAgICBrZXlcbiAgICApO1xuICAgIGlmIChhbHJlYWR5Q2hlY2tlZCAhPT0gbnVsbCkge1xuICAgICAgdGhpcy5yZWNvcmRBY3Rpb25IaXN0b3J5KGFscmVhZHlDaGVja2VkKTtcbiAgICAgIHJldHVybiBhbHJlYWR5Q2hlY2tlZC5wZXJtaXR0ZWQ7XG4gICAgfVxuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQucm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICAgIHRoaXMuaWQsXG4gICAgICBwb2xpY3kucm9sZUxldmVsLFxuICAgICAgb2JqZWN0SWRPck5hbWUsXG4gICAgICBwYXJlbnRPYmplY3ROYW1lXG4gICAgKTtcbiAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBFcnJvciBnZXR0aW5nIHJvbGVOYW1lRm9yVXNlck9iamVjdCgke3RoaXMuaWR9LCR7XG4gICAgICAgIHBvbGljeS5yb2xlTGV2ZWxcbiAgICAgIH0sJHtvYmplY3RJZE9yTmFtZX0sJHtwYXJlbnRPYmplY3ROYW1lfSkuICR7SlNPTi5zdHJpbmdpZnkocm9sZVJlc3VsdCl9YDtcbiAgICAgIGxvZy5lcnJvcihtZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICB9XG4gICAgaWYgKCFyb2xlUmVzdWx0LnBheWxvYWQub2JqZWN0SWQpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgT2JqZWN0SWQgY291bGQgbm90IGJlIGZvdW5kYDtcbiAgICAgIGxvZy5lcnJvcihtZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICB9XG4gICAgbGV0IHBlcm1pdHRlZCA9IGZhbHNlO1xuICAgIGlmIChcbiAgICAgIHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSAmJlxuICAgICAgcG9saWN5LnBlcm1pdHRlZFJvbGVzLmluY2x1ZGVzKHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSlcbiAgICApIHtcbiAgICAgIHBlcm1pdHRlZCA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHVBUDogVXNlckFjdGlvblBlcm1pc3Npb24gPSB7XG4gICAgICByb2xlTGV2ZWw6IHBvbGljeS5yb2xlTGV2ZWwsXG4gICAgICBvYmplY3RLZXk6IGtleSxcbiAgICAgIG9iamVjdElkOiByb2xlUmVzdWx0LnBheWxvYWQub2JqZWN0SWQsXG4gICAgICB1c2VyQWN0aW9uOiB1c2VyQWN0aW9uLFxuICAgICAgcGVybWl0dGVkOiBwZXJtaXR0ZWQsXG4gICAgICBkZXNjcmlwdGlvbjogcG9saWN5LmRlc2NyaXB0aW9uLFxuICAgIH07XG4gICAgaWYgKHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSkge1xuICAgICAgdUFQLmNoZWNrZWRGb3JSb2xlTmFtZSA9IHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZTtcbiAgICB9XG4gICAgdGhpcy5zZXRPYmplY3RQZXJtaXNzaW9uKHVBUCk7XG4gICAgdGhpcy5yZWNvcmRBY3Rpb25IaXN0b3J5KHVBUCk7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJvbGU6ICR7SlNPTi5zdHJpbmdpZnkocm9sZVJlc3VsdC5wYXlsb2FkKX0gcGVybWl0dGVkOiAke3Blcm1pdHRlZH1gXG4gICAgKTtcbiAgICByZXR1cm4gcGVybWl0dGVkO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNhbnQoXG4gICAgdXNlckFjdGlvbjogc3RyaW5nLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjYW4gPSBhd2FpdCB0aGlzLmNhbih1c2VyQWN0aW9uLCBvYmplY3RJZE9yTmFtZSwgcGFyZW50T2JqZWN0TmFtZSk7XG4gICAgcmV0dXJuICFjYW47XG4gIH1cblxuICAvLyBhc3luYyBvbmx5IHJlcXVpcmVkIHRvIGxvb2t1cCB1c2VySWQgZnJvbSBlbWFpbCB3aGVuIHRlc3RpbmdcbiAgcHVibGljIHN0YXRpYyBhc3luYyBmcm9tQ29udGV4dChjb250ZXh0OiBhbnkpOiBQcm9taXNlPEN1cnJlbnRVc2VyPiB7XG4gICAgLy9sb2cuaW5mbyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKFxuICAgICAgY29udGV4dC5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgICApLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChcbiAgICAgIC8vIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFRFU1QgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChcbiAgICAgICAgdGhpcyxcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCByZXN1bHQucGF5bG9hZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHRlc3QgZW1haWwgeC10ZXN0LXVzZXItZW1haWw9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKGNvbnRleHQud2JDbG91ZCwgVXNlci5nZXRQdWJsaWNVc2VyKCkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgU1lTQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFN5c0FkbWluVXNlcigpKTtcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChcbiAgICAgICAgdGhpcyxcbiAgICAgICAgcGFyc2VJbnQoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCByZXN1bHQucGF5bG9hZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHgtaGFzdXJhLXVzZXItaWQ9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFB1YmxpY1VzZXIoKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRCRDogc3VwcG9ydCBmb3IgcHVibGljIHVzZXJzXG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGBDdXJyZW50VXNlci5mcm9tQ29udGV4dDogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBjb250ZXh0LmhlYWRlcnNcbiAgICAgICAgKX1gXG4gICAgICApO1xuICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgT3JnYW5pemF0aW9uIHtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHJvbGU/OiBSb2xlO1xuICBzZXR0aW5ncz86IG9iamVjdDtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PE9yZ2FuaXphdGlvbj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvbnMgPSBBcnJheTxPcmdhbml6YXRpb24+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBvcmdhbml6YXRpb25zLnB1c2goT3JnYW5pemF0aW9uLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBvcmdhbml6YXRpb25zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogT3JnYW5pemF0aW9uIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb24gPSBuZXcgT3JnYW5pemF0aW9uKCk7XG4gICAgb3JnYW5pemF0aW9uLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgb3JnYW5pemF0aW9uLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgb3JnYW5pemF0aW9uLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBvcmdhbml6YXRpb24uY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvbi51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2V0dGluZ3MpIG9yZ2FuaXphdGlvbi5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICBvcmdhbml6YXRpb24ucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbCk7XG4gICAgICBpZiAoZGF0YS5yb2xlX2ltcGxpZWRfZnJvbSkge1xuICAgICAgICBvcmdhbml6YXRpb24ucm9sZS5pbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvcmdhbml6YXRpb247XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgT3JnYW5pemF0aW9uVXNlciB7XG4gIG9yZ2FuaXphdGlvbklkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21yb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHJvbGUhOiBSb2xlO1xuICBvcmdhbml6YXRpb25OYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHVzZXJGaXJzdE5hbWU/OiBzdHJpbmc7XG4gIHVzZXJMYXN0TmFtZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PE9yZ2FuaXphdGlvblVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvblVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uVXNlcnMgPSBBcnJheTxPcmdhbml6YXRpb25Vc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9uVXNlcnMucHVzaChPcmdhbml6YXRpb25Vc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBvcmdhbml6YXRpb25Vc2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvblVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25Vc2VyID0gbmV3IE9yZ2FuaXphdGlvblVzZXIoKTtcbiAgICBvcmdhbml6YXRpb25Vc2VyLm9yZ2FuaXphdGlvbklkID0gZGF0YS5vcmdhbml6YXRpb25faWQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51c2VySWQgPSBwYXJzZUludChkYXRhLnVzZXJfaWQpO1xuICAgIG9yZ2FuaXphdGlvblVzZXIucm9sZUlkID0gcGFyc2VJbnQoZGF0YS5yb2xlX2lkKTtcbiAgICBpZiAoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCkge1xuICAgICAgb3JnYW5pemF0aW9uVXNlci5pbXBsaWVkRnJvbXJvbGVJZCA9IHBhcnNlSW50KGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpO1xuICAgIH1cbiAgICBvcmdhbml6YXRpb25Vc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICBvcmdhbml6YXRpb25Vc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGUgPSBuZXcgUm9sZShkYXRhLnJvbGVfaWQpO1xuICAgIGlmIChkYXRhLm9yZ2FuaXphdGlvbl9uYW1lKVxuICAgICAgb3JnYW5pemF0aW9uVXNlci5vcmdhbml6YXRpb25OYW1lID0gZGF0YS5vcmdhbml6YXRpb25fbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2VtYWlsKSBvcmdhbml6YXRpb25Vc2VyLnVzZXJFbWFpbCA9IGRhdGEudXNlcl9lbWFpbDtcbiAgICBpZiAoZGF0YS51c2VyX2ZpcnN0X25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnVzZXJGaXJzdE5hbWUgPSBkYXRhLnVzZXJfZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2xhc3RfbmFtZSlcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIudXNlckxhc3ROYW1lID0gZGF0YS51c2VyX2xhc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIucm9sZSA9IG5ldyBSb2xlKFxuICAgICAgICBkYXRhLnJvbGVfbmFtZSxcbiAgICAgICAgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWxcbiAgICAgICk7XG4gICAgICBpZiAoZGF0YS5yb2xlX2ltcGxpZWRfZnJvbSkge1xuICAgICAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3JnYW5pemF0aW9uVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IERFRkFVTFRfUE9MSUNZIH0gZnJvbSBcIi4uL3BvbGljeVwiO1xuXG4vKipcbiAqIFNDSEVNQVxuICogLSBJZiBhIHNjaGVtYSBpcyBvd25lZCBieSBhbiBvcmdhbml6YXRpb25cbiAqICAgLSBBbGwgYWRtaW5pc3RyYXRvcnMgb2YgdGhlIG9yZ2FuaXphdGlvbiBoYXZlIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogLSBJZiBhIHNjaGVtYSBpcyBvd25lZCBieSBhIHVzZXIsIHRoZSB1c2VyIGhhcyBpbXBsaWNpdCBhZG1pbiBhY2Nlc3NcbiAqICAgLSBBZGRpdGlvbmFsIHVzZXJzIGNhbiBiZSBncmFudGVkIGFkbWluIGFjY2VzcyBleHBsaWNpdGx5XG4gKi9cblxuZXhwb3J0IHR5cGUgUm9sZUxldmVsID0gXCJvcmdhbml6YXRpb25cIiB8IFwic2NoZW1hXCIgfCBcInRhYmxlXCI7XG5cbmV4cG9ydCB0eXBlIFVzZXJBY3Rpb25QZXJtaXNzaW9uID0ge1xuICByb2xlTGV2ZWw6IFJvbGVMZXZlbDtcbiAgdXNlckFjdGlvbjogc3RyaW5nO1xuICBvYmplY3RLZXk/OiBzdHJpbmc7XG4gIG9iamVjdElkOiBudW1iZXI7XG4gIGNoZWNrZWRGb3JSb2xlTmFtZT86IHN0cmluZztcbiAgcGVybWl0dGVkOiBib29sZWFuO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBjaGVja2VkQXQ/OiBEYXRlO1xufTtcblxuZXhwb3J0IGNsYXNzIFJvbGUge1xuICBzdGF0aWMgU1lTUk9MRVNfT1JHQU5JWkFUSU9OUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XG4gICAgb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBBZG1pbmlzdHJhdG9yXCIsXG4gICAgfSxcbiAgICBvcmdhbml6YXRpb25fdXNlcjogeyBsYWJlbDogXCJPcmdhbml6YXRpb24gVXNlclwiIH0sXG4gICAgb3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXI6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBFeHRlcm5hbCBVc2VyXCIsXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgU1lTUk9MRVNfU0NIRU1BUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gICAgc2NoZW1hX293bmVyOiB7IGxhYmVsOiBcIkRCIE93bmVyXCIgfSxcbiAgICBzY2hlbWFfYWRtaW5pc3RyYXRvcjoge1xuICAgICAgbGFiZWw6IFwiREIgQWRtaW5pc3RyYXRvclwiLFxuICAgICAgaW1wbGllZEZyb206IFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdLFxuICAgIH0sXG4gICAgc2NoZW1hX21hbmFnZXI6IHsgbGFiZWw6IFwiREIgTWFuYWdlclwiIH0sXG4gICAgc2NoZW1hX2VkaXRvcjogeyBsYWJlbDogXCJEQiBFZGl0b3JcIiB9LFxuICAgIHNjaGVtYV9yZWFkZXI6IHsgbGFiZWw6IFwiREIgUmVhZGVyXCIgfSxcbiAgfTtcblxuICBzdGF0aWMgU1lTUk9MRVNfVEFCTEVTOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PiA9IHtcbiAgICB0YWJsZV9hZG1pbmlzdHJhdG9yOiB7XG4gICAgICBsYWJlbDogXCJUYWJsZSBBZG1pbmlzdHJhdG9yXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX293bmVyXCIsIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9tYW5hZ2VyOiB7XG4gICAgICBsYWJlbDogXCJUYWJsZSBNYW5hZ2VyXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX21hbmFnZXJcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9lZGl0b3I6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIEVkaXRvclwiLFxuICAgICAgaW1wbGllZEZyb206IFtcInNjaGVtYV9lZGl0b3JcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9yZWFkZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIFJlYWRlclwiLFxuICAgICAgaW1wbGllZEZyb206IFtcInNjaGVtYV9yZWFkZXJcIl0sXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgc3lzUm9sZU1hcChmcm9tOiBSb2xlTGV2ZWwsIHRvOiBSb2xlTGV2ZWwpIHtcbiAgICBsZXQgdG9Sb2xlRGVmaW5pdGlvbnM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge307XG4gICAgbGV0IG1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHN3aXRjaCAodG8pIHtcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgdG9Sb2xlRGVmaW5pdGlvbnMgPSBSb2xlLlNZU1JPTEVTX1RBQkxFUztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHRvUm9sZURlZmluaXRpb25zID0gUm9sZS5TWVNST0xFU19TQ0hFTUFTO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHRvUm9sZU5hbWUgb2YgT2JqZWN0LmtleXModG9Sb2xlRGVmaW5pdGlvbnMpKSB7XG4gICAgICBpZiAodG9Sb2xlRGVmaW5pdGlvbnNbdG9Sb2xlTmFtZV0uaW1wbGllZEZyb20pIHtcbiAgICAgICAgZm9yIChjb25zdCBmcm9tUm9sZU5hbWUgb2YgdG9Sb2xlRGVmaW5pdGlvbnNbdG9Sb2xlTmFtZV0uaW1wbGllZEZyb20pIHtcbiAgICAgICAgICBtYXBbZnJvbVJvbGVOYW1lXSA9IHRvUm9sZU5hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1hcDtcbiAgfVxuXG4gIHN0YXRpYyBIQVNVUkFfUFJFRklYRVNfQUNUSU9OUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBzOiBcInNlbGVjdFwiLFxuICAgIGk6IFwiaW5zZXJ0XCIsXG4gICAgdTogXCJ1cGRhdGVcIixcbiAgICBkOiBcImRlbGV0ZVwiLFxuICB9O1xuXG4gIGlkPzogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbD86IHN0cmluZztcbiAgY3JlYXRlZEF0PzogRGF0ZTtcbiAgdXBkYXRlZEF0PzogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBpbXBsaWVkRnJvbT86IFN0cmluZztcbiAgcGVybWlzc2lvbnM/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcblxuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHJvbGVMZXZlbD86IFJvbGVMZXZlbCkge1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5wZXJtaXNzaW9ucyA9IFJvbGUuZ2V0UGVybWlzc2lvbnMoXG4gICAgICBERUZBVUxUX1BPTElDWSxcbiAgICAgIHRoaXMubmFtZSxcbiAgICAgIHJvbGVMZXZlbFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFBlcm1pc3Npb25zKFxuICAgIHBvbGljeTogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4sXG4gICAgcm9sZU5hbWU6IHN0cmluZyxcbiAgICByb2xlTGV2ZWw/OiBSb2xlTGV2ZWxcbiAgKSB7XG4gICAgY29uc3QgcGVybWlzc2lvbnM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG4gICAgZm9yIChjb25zdCB1c2VyQWN0aW9uIG9mIE9iamVjdC5rZXlzKHBvbGljeSkpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcm9sZUxldmVsICYmXG4gICAgICAgIChwb2xpY3lbdXNlckFjdGlvbl0ucm9sZUxldmVsIGFzIFJvbGVMZXZlbCkgIT0gcm9sZUxldmVsXG4gICAgICApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBwZXJtaXNzaW9uc1t1c2VyQWN0aW9uXSA9XG4gICAgICAgIHBvbGljeVt1c2VyQWN0aW9uXS5wZXJtaXR0ZWRSb2xlcy5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgfVxuICAgIHJldHVybiBwZXJtaXNzaW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgaXNSb2xlKHJvbGVOYW1lOiBzdHJpbmcsIHJvbGVMZXZlbD86IFJvbGVMZXZlbCk6IGJvb2xlYW4ge1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCI6XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX09SR0FOSVpBVElPTlMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGNhc2UgXCJzY2hlbWFcIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfU0NIRU1BUykuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgICAgY2FzZSBcInRhYmxlXCI6XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX09SR0FOSVpBVElPTlMpLmluY2x1ZGVzKHJvbGVOYW1lKSB8fFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfU0NIRU1BUykuaW5jbHVkZXMocm9sZU5hbWUpIHx8XG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpLmluY2x1ZGVzKHJvbGVOYW1lKVxuICAgICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgYXJlUm9sZXMocm9sZU5hbWVzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuICAgIGZvciAoY29uc3Qgcm9sZU5hbWUgb2Ygcm9sZU5hbWVzKSB7XG4gICAgICBpZiAoIVJvbGUuaXNSb2xlKHJvbGVOYW1lKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uUHJlZml4ZXMocm9sZU5hbWU6IHN0cmluZykge1xuICAgIGxldCBhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBwcmVmaXhlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoXG4gICAgICBERUZBVUxUX1BPTElDWVtcInJlYWRfYW5kX3dyaXRlX3RhYmxlX3JlY29yZHNcIl0ucGVybWl0dGVkUm9sZXMuaW5jbHVkZXMoXG4gICAgICAgIHJvbGVOYW1lXG4gICAgICApXG4gICAgKSB7XG4gICAgICBhY3Rpb25zID0gREVGQVVMVF9QT0xJQ1lbXCJyZWFkX2FuZF93cml0ZV90YWJsZV9yZWNvcmRzXCJdLmhhc3VyYUFjdGlvbnM7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIERFRkFVTFRfUE9MSUNZW1wicmVhZF90YWJsZV9yZWNvcmRzXCJdLnBlcm1pdHRlZFJvbGVzLmluY2x1ZGVzKHJvbGVOYW1lKVxuICAgICkge1xuICAgICAgYWN0aW9ucyA9IERFRkFVTFRfUE9MSUNZW1wicmVhZF90YWJsZV9yZWNvcmRzXCJdLmhhc3VyYUFjdGlvbnM7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHByZWZpeCA9IE9iamVjdC5rZXlzKFJvbGUuSEFTVVJBX1BSRUZJWEVTX0FDVElPTlMpLmZpbmQoXG4gICAgICAgIChrZXkpID0+IFJvbGUuSEFTVVJBX1BSRUZJWEVTX0FDVElPTlNba2V5XSA9PT0gYWN0aW9uXG4gICAgICApO1xuICAgICAgaWYgKHByZWZpeCkgcHJlZml4ZXMucHVzaChwcmVmaXgpO1xuICAgIH1cbiAgICByZXR1cm4gcHJlZml4ZXM7XG4gIH1cblxuICAvLyBlZyBbeyBwZXJtaXNzaW9uS2V5OiBzMTIzNCwgYWN0aW9uOiBcInNlbGVjdFwifSxcbiAgLy8geyBwZXJtaXNzaW9uS2V5OiBpMTIzNCwgYWN0aW9uOiBcImluc2VydFwifS4uLlxuICBwdWJsaWMgc3RhdGljIHRhYmxlUGVybWlzc2lvbktleXNBbmRBY3Rpb25zKFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10ge1xuICAgIGNvbnN0IHBlcm1pc3Npb25LZXlzQW5kQWN0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdID0gW107XG4gICAgZm9yIChjb25zdCBwcmVmaXggb2YgT2JqZWN0LmtleXMoUm9sZS5IQVNVUkFfUFJFRklYRVNfQUNUSU9OUykpIHtcbiAgICAgIHBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucy5wdXNoKHtcbiAgICAgICAgcGVybWlzc2lvbktleTogUm9sZS50YWJsZVBlcm1pc3Npb25LZXkocHJlZml4LCB0YWJsZUlkKSxcbiAgICAgICAgYWN0aW9uOiBSb2xlLkhBU1VSQV9QUkVGSVhFU19BQ1RJT05TW3ByZWZpeF0sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uS2V5KFxuICAgIHBlcm1pc3Npb25QcmVmaXg6IHN0cmluZyxcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7cGVybWlzc2lvblByZWZpeH0ke3RhYmxlSWR9YDtcbiAgfVxuXG4gIC8vIFVzZWQgdG8gZ2VuZXJhdGUgdGhlIEhhc3VyYSB0YWJsZSBwZXJtaXNzaW9uXG4gIHB1YmxpYyBzdGF0aWMgaGFzdXJhVGFibGVQZXJtaXNzaW9uQ2hlY2tzQW5kVHlwZXMoXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IFJlY29yZDxzdHJpbmcsIGFueT5bXSB7XG4gICAgY29uc3QgaGFzdXJhUGVybWlzc2lvbnNBbmRUeXBlczogUmVjb3JkPHN0cmluZywgYW55PltdID0gW107XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5c0FuZFR5cGUgb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucyhcbiAgICAgIHRhYmxlSWRcbiAgICApKSB7XG4gICAgICBoYXN1cmFQZXJtaXNzaW9uc0FuZFR5cGVzLnB1c2goe1xuICAgICAgICBwZXJtaXNzaW9uQ2hlY2s6IHtcbiAgICAgICAgICBfZXhpc3RzOiB7XG4gICAgICAgICAgICBfdGFibGU6IHsgc2NoZW1hOiBcIndiXCIsIG5hbWU6IFwidGFibGVfcGVybWlzc2lvbnNcIiB9LFxuICAgICAgICAgICAgX3doZXJlOiB7XG4gICAgICAgICAgICAgIF9hbmQ6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICB0YWJsZV9wZXJtaXNzaW9uX2tleToge1xuICAgICAgICAgICAgICAgICAgICBfZXE6IHBlcm1pc3Npb25LZXlzQW5kVHlwZS5wZXJtaXNzaW9uS2V5LFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHsgdXNlcl9pZDogeyBfZXE6IFwiWC1IYXN1cmEtVXNlci1JZFwiIH0gfSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcGVybWlzc2lvblR5cGU6IHBlcm1pc3Npb25LZXlzQW5kVHlwZS50eXBlLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBoYXN1cmFQZXJtaXNzaW9uc0FuZFR5cGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxSb2xlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGVzID0gQXJyYXk8Um9sZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHJvbGVzLnB1c2goUm9sZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBSb2xlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlJvbGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBSb2xlKGRhdGEubmFtZSk7XG4gICAgcm9sZS5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICByb2xlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICByb2xlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICByb2xlLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gcm9sZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWEge1xuICBzdGF0aWMgU1lTX1NDSEVNQV9OQU1FUzogc3RyaW5nW10gPSBbXG4gICAgXCJwdWJsaWNcIixcbiAgICBcImluZm9ybWF0aW9uX3NjaGVtYVwiLFxuICAgIFwiaGRiX2NhdGFsb2dcIixcbiAgICBcIndiXCIsXG4gIF07XG5cbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyO1xuICB1c2VyT3duZXJJZD86IG51bWJlcjtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogUm9sZTtcbiAgb3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nO1xuICB1c2VyT3duZXJFbWFpbD86IHN0cmluZztcbiAgc2V0dGluZ3M/OiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIHNjaGVtYS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHNjaGVtYS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgc2NoZW1hLm9yZ2FuaXphdGlvbk93bmVySWQgPSBkYXRhLm9yZ2FuaXphdGlvbl9vd25lcl9pZDtcbiAgICBzY2hlbWEudXNlck93bmVySWQgPSBkYXRhLnVzZXJfb3duZXJfaWQ7XG4gICAgc2NoZW1hLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBzY2hlbWEudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLm9yZ2FuaXphdGlvbl9vd25lcl9uYW1lKSB7XG4gICAgICBzY2hlbWEub3JnYW5pemF0aW9uT3duZXJOYW1lID0gZGF0YS5vcmdhbml6YXRpb25fb3duZXJfbmFtZTtcbiAgICB9XG4gICAgaWYgKGRhdGEudXNlcl9vd25lcl9lbWFpbCkgc2NoZW1hLnVzZXJPd25lckVtYWlsID0gZGF0YS51c2VyX293bmVyX2VtYWlsO1xuICAgIGlmIChkYXRhLnNldHRpbmdzKSBzY2hlbWEuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgc2NoZW1hLnJvbGUgPSBuZXcgUm9sZShkYXRhLnJvbGVfbmFtZSwgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgc2NoZW1hLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYVVzZXIge1xuICBzY2hlbWFJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tUm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlITogUm9sZTtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdXNlckVtYWlsPzogc3RyaW5nO1xuICB1c2VyRmlyc3ROYW1lPzogc3RyaW5nO1xuICB1c2VyTGFzdE5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWFVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWFVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYVVzZXJzID0gQXJyYXk8U2NoZW1hVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHNjaGVtYVVzZXJzLnB1c2goU2NoZW1hVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBTY2hlbWFVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYVVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hVXNlciA9IG5ldyBTY2hlbWFVc2VyKCk7XG4gICAgc2NoZW1hVXNlci5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hX2lkO1xuICAgIHNjaGVtYVVzZXIudXNlcklkID0gcGFyc2VJbnQoZGF0YS51c2VyX2lkKTtcbiAgICBzY2hlbWFVc2VyLnJvbGVJZCA9IHBhcnNlSW50KGRhdGEucm9sZV9pZCk7XG4gICAgaWYgKGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpIHtcbiAgICAgIHNjaGVtYVVzZXIuaW1wbGllZEZyb21Sb2xlSWQgPSBwYXJzZUludChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKTtcbiAgICB9XG4gICAgc2NoZW1hVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgc2NoZW1hVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHNjaGVtYVVzZXIuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9lbWFpbCkgc2NoZW1hVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKSBzY2hlbWFVc2VyLnVzZXJGaXJzdE5hbWUgPSBkYXRhLnVzZXJfZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2xhc3RfbmFtZSkgc2NoZW1hVXNlci51c2VyTGFzdE5hbWUgPSBkYXRhLnVzZXJfbGFzdF9uYW1lO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgc2NoZW1hVXNlci5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHNjaGVtYVVzZXIucm9sZS5pbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzY2hlbWFVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29sdW1uLCBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGUge1xuICBpZCE6IG51bWJlcjtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHJvbGU/OiBSb2xlO1xuICBjb2x1bW5zITogW0NvbHVtbl07XG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHNldHRpbmdzPzogb2JqZWN0O1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGU+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlcyA9IEFycmF5PFRhYmxlPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdGFibGVzLnB1c2goVGFibGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFRhYmxlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlID0gbmV3IFRhYmxlKCk7XG4gICAgdGFibGUuaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICB0YWJsZS5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hX2lkO1xuICAgIHRhYmxlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgdGFibGUubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHRhYmxlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYV9uYW1lO1xuICAgIGlmIChkYXRhLnNldHRpbmdzKSB0YWJsZS5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICB0YWJsZS5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgdGFibGUucm9sZS5pbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0YWJsZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBUYWJsZVVzZXIge1xuICB0YWJsZUlkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21yb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHJvbGUhOiBSb2xlO1xuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB0YWJsZU5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgdXNlckZpcnN0TmFtZT86IHN0cmluZztcbiAgdXNlckxhc3ROYW1lPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGVVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZVVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVVc2VycyA9IEFycmF5PFRhYmxlVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlVXNlcnMucHVzaChUYWJsZVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZVVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlciA9IG5ldyBUYWJsZVVzZXIoKTtcbiAgICB0YWJsZVVzZXIudGFibGVJZCA9IHBhcnNlSW50KGRhdGEudGFibGVfaWQpO1xuICAgIHRhYmxlVXNlci51c2VySWQgPSBwYXJzZUludChkYXRhLnVzZXJfaWQpO1xuICAgIHRhYmxlVXNlci5yb2xlSWQgPSBwYXJzZUludChkYXRhLnJvbGVfaWQpO1xuICAgIGlmIChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKSB7XG4gICAgICB0YWJsZVVzZXIuaW1wbGllZEZyb21yb2xlSWQgPSBwYXJzZUludChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKTtcbiAgICB9XG4gICAgdGFibGVVc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICB0YWJsZVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHRhYmxlVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlVXNlci5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS50YWJsZV9uYW1lKSB0YWJsZVVzZXIudGFibGVOYW1lID0gZGF0YS50YWJsZV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHRhYmxlVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKSB0YWJsZVVzZXIudXNlckZpcnN0TmFtZSA9IGRhdGEudXNlcl9maXJzdF9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfbGFzdF9uYW1lKSB0YWJsZVVzZXIudXNlckxhc3ROYW1lID0gZGF0YS51c2VyX2xhc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIHRhYmxlVXNlci5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgdGFibGVVc2VyLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGFibGVVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgdXNlck1lc3NhZ2VzIH0gZnJvbSBcIi4uL2Vudmlyb25tZW50XCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgc3RhdGljIFNZU19BRE1JTl9JRDogbnVtYmVyID0gMTtcbiAgc3RhdGljIFBVQkxJQ19JRDogbnVtYmVyID0gMTtcblxuICBpZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZT86IHN0cmluZztcbiAgbGFzdE5hbWU/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXJzID0gQXJyYXk8VXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHVzZXJzLnB1c2goVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIHVzZXIuZW1haWwgPSBkYXRhLmVtYWlsO1xuICAgIGlmIChkYXRhLmZpcnN0X25hbWUpIHVzZXIuZmlyc3ROYW1lID0gZGF0YS5maXJzdF9uYW1lO1xuICAgIGlmIChkYXRhLmxhc3RfbmFtZSkgdXNlci5sYXN0TmFtZSA9IGRhdGEubGFzdF9uYW1lO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB1c2VyO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRTeXNBZG1pblVzZXIoKTogVXNlciB7XG4gICAgY29uc3QgZGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdXNlcjogVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IFVzZXIuU1lTX0FETUlOX0lEO1xuICAgIHVzZXIuZW1haWwgPSBcIlNZU19BRE1JTkBleGFtcGxlLmNvbVwiO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gXCJTWVMgQWRtaW5cIjtcbiAgICB1c2VyLmxhc3ROYW1lID0gXCJTWVMgQWRtaW5cIjtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGU7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRlO1xuICAgIHJldHVybiB1c2VyO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRQdWJsaWNVc2VyKCk6IFVzZXIge1xuICAgIGNvbnN0IGRhdGU6IERhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHVzZXI6IFVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBVc2VyLlBVQkxJQ19JRDtcbiAgICB1c2VyLmVtYWlsID0gXCJQVUJMSUNAZXhhbXBsZS5jb21cIjtcbiAgICB1c2VyLmZpcnN0TmFtZSA9IFwiUHVibGljIFVzZXJcIjtcbiAgICB1c2VyLmxhc3ROYW1lID0gXCJQdWJsaWMgVXNlclwiO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0ZTtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cbn1cbiIsImV4cG9ydCAqIGZyb20gXCIuL1JvbGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1VzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL0N1cnJlbnRVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Pcmdhbml6YXRpb25cIjtcbmV4cG9ydCAqIGZyb20gXCIuL09yZ2FuaXphdGlvblVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1NjaGVtYVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vU2NoZW1hVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1RhYmxlVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vQ29sdW1uXCI7XG4iLCJ0eXBlIEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBzdHJpbmc7XG4gIGRiTmFtZTogc3RyaW5nO1xuICBkYkhvc3Q6IHN0cmluZztcbiAgZGJQb3J0OiBudW1iZXI7XG4gIGRiVXNlcjogc3RyaW5nO1xuICBkYlBhc3N3b3JkOiBzdHJpbmc7XG4gIGRiUG9vbE1heDogbnVtYmVyO1xuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBoYXN1cmFIb3N0OiBzdHJpbmc7XG4gIGhhc3VyYUFkbWluU2VjcmV0OiBzdHJpbmc7XG4gIHRlc3RJZ25vcmVFcnJvcnM6IGJvb2xlYW47XG59O1xuXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBwcm9jZXNzLmVudi5TRUNSRVRfTUVTU0FHRSBhcyBzdHJpbmcsXG4gIGRiTmFtZTogcHJvY2Vzcy5lbnYuREJfTkFNRSBhcyBzdHJpbmcsXG4gIGRiSG9zdDogcHJvY2Vzcy5lbnYuREJfSE9TVCBhcyBzdHJpbmcsXG4gIGRiUG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9SVCB8fCBcIlwiKSBhcyBudW1iZXIsXG4gIGRiVXNlcjogcHJvY2Vzcy5lbnYuREJfVVNFUiBhcyBzdHJpbmcsXG4gIGRiUGFzc3dvcmQ6IHByb2Nlc3MuZW52LkRCX1BBU1NXT1JEIGFzIHN0cmluZyxcbiAgZGJQb29sTWF4OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX01BWCB8fCBcIlwiKSBhcyBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBwYXJzZUludChcbiAgICBwcm9jZXNzLmVudi5EQl9QT09MX0lETEVfVElNRU9VVF9NSUxMSVMgfHwgXCJcIlxuICApIGFzIG51bWJlcixcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfQ09OTkVDVElPTl9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxuICBoYXN1cmFIb3N0OiBwcm9jZXNzLmVudi5IQVNVUkFfSE9TVCBhcyBzdHJpbmcsXG4gIGhhc3VyYUFkbWluU2VjcmV0OiBwcm9jZXNzLmVudi5IQVNVUkFfQURNSU5fU0VDUkVUIGFzIHN0cmluZyxcbiAgdGVzdElnbm9yZUVycm9yczogKHByb2Nlc3MuZW52LlRFU1RfSUdOT1JFX0VSUk9SUyB8fCBmYWxzZSkgYXMgYm9vbGVhbixcbn07XG5cbi8vIHdiRXJyb3JDb2RlIDogWyBtZXNzYWdlLCBhcG9sbG9FcnJvckNvZGU/IF1cbmV4cG9ydCBjb25zdCB1c2VyTWVzc2FnZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgLy8gVXNlcnNcbiAgV0JfVVNFUl9OT1RfRk9VTkQ6IFtcIlVzZXIgbm90IGZvdW5kLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIHVzZXJzIHdlcmUgbm90IGZvdW5kLlwiXSxcbiAgLy8gT3JnYW5pemF0aW9uc1xuICBXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EOiBbXCJPcmdhbml6YXRpb24gbm90IGZvdW5kLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9PUkdBTklaQVRJT05fTkFNRV9UQUtFTjogW1xuICAgIFwiVGhpcyBPcmdhbml6YXRpb24gbmFtZSBoYXMgYWxyZWFkeSBiZWVuIHRha2VuLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfT1JHQU5JWkFUSU9OX05PVF9VU0VSX0VNUFRZOiBbXG4gICAgXCJUaGlzIG9yZ2FuaXphdGlvbiBzdGlsbCBoYXMgbm9uLWFkbWluaXN0cmF0aXZlIHVzZXJzLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfT1JHQU5JWkFUSU9OX05PX0FETUlOUzogW1xuICAgIFwiWW91IGNhbiBub3QgcmVtb3ZlIGFsbCBBZG1pbmlzdHJhdG9ycyBmcm9tIGFuIE9yZ2FuaXphdGlvbiAtIHlvdSBtdXN0IGxlYXZlIGF0IGxlYXN0IG9uZS5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX1VTRVJfTk9UX0lOX09SRzogW1wiVXNlciBtdXN0IGJlIGluIE9yZ2FuaXphdGlvblwiXSxcbiAgV0JfVVNFUl9OT1RfU0NIRU1BX09XTkVSOiBbXCJUaGUgY3VycmVudCB1c2VyIGlzIG5vdCB0aGUgb3duZXIuXCJdLFxuICAvLyBTY2hlbWFzXG4gIFdCX1NDSEVNQV9OT1RfRk9VTkQ6IFtcIkRhdGFiYXNlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG4gIFdCX0JBRF9TQ0hFTUFfTkFNRTogW1xuICAgIFwiRGF0YWJhc2UgbmFtZSBjYW4gbm90IGJlZ2luIHdpdGggJ3BnXycgb3IgYmUgaW4gdGhlIHJlc2VydmVkIGxpc3QuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfVVNFUl9PV05FUjogW1xuICAgIFwiWW91IGNhbiBub3QgcmVtb3ZlIHRoZSB1c2VyX293bmVyIGZyb20gYSBTY2hlbWFcIixcbiAgXSxcbiAgLy8gU2NoZW1hcyBVc2Vyc1xuICBXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSBTY2hlbWEgVXNlcnMgbm90IGZvdW5kLlwiXSxcbiAgLy8gVGFibGVzXG4gIFdCX1RBQkxFX05PVF9GT1VORDogW1wiVGFibGUgY291bGQgbm90IGJlIGZvdW5kLlwiXSxcbiAgV0JfVEFCTEVfTkFNRV9FWElTVFM6IFtcIlRoaXMgVGFibGUgbmFtZSBhbHJlYWR5IGV4aXN0c1wiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBDT0xVTU5fTk9UX0ZPVU5EOiBbXCJDb2x1bW4gY291bGQgbm90IGJlIGZvdW5kXCJdLFxuICBXQl9DT0xVTU5fTkFNRV9FWElTVFM6IFtcIlRoaXMgQ29sdW1uIG5hbWUgYWxyZWFkeSBleGlzdHMuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX1BLX0VYSVNUUzogW1wiUmVtb3ZlIGV4aXN0aW5nIHByaW1hcnkga2V5IGZpcnN0LlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9GS19FWElTVFM6IFtcbiAgICBcIlJlbW92ZSBleGlzdGluZyBmb3JlaWduIGtleSBvbiB0aGUgY29sdW1uIGZpcnN0LlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgLy8gVGFibGUgVXNlcnMsXG4gIFdCX1RBQkxFX1VTRVJTX05PVF9GT1VORDogW1wiT25lIG9yIG1vcmUgVGFibGUgVXNlcnMgbm90IGZvdW5kLlwiXSxcbiAgLy8gUm9sZXNcbiAgUk9MRV9OT1RfRk9VTkQ6IFtcIlRoaXMgcm9sZSBjb3VsZCBub3QgYmUgZm91bmQuXCJdLFxuICBXQl9GT1JCSURERU46IFtcIllvdSBkbyBub3QgcGVybWl0dGVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsIFwiRk9SQklEREVOXCJdLFxufTtcbiIsIi8vIGh0dHBzOi8vYWx0cmltLmlvL3Bvc3RzL2F4aW9zLWh0dHAtY2xpZW50LXVzaW5nLXR5cGVzY3JpcHRcblxuaW1wb3J0IGF4aW9zLCB7IEF4aW9zSW5zdGFuY2UsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IENvbHVtbiB9IGZyb20gXCIuL2VudGl0eVwiO1xuaW1wb3J0IHsgZW52aXJvbm1lbnQgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuaW1wb3J0IHsgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBlcnJSZXN1bHQsIGxvZyB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgXCJ4LWhhc3VyYS1hZG1pbi1zZWNyZXRcIjogZW52aXJvbm1lbnQuaGFzdXJhQWRtaW5TZWNyZXQsXG59O1xuXG5jbGFzcyBIYXN1cmFBcGkge1xuICBzdGF0aWMgSUdOT1JFX0VSUk9SUyA9IGZhbHNlO1xuICBzdGF0aWMgSEFTVVJBX0lHTk9SRV9DT0RFUzogc3RyaW5nW10gPSBbXG4gICAgXCJhbHJlYWR5LXVudHJhY2tlZFwiLFxuICAgIFwiYWxyZWFkeS10cmFja2VkXCIsXG4gICAgXCJub3QtZXhpc3RzXCIsIC8vIGRyb3BwaW5nIGEgcmVsYXRpb25zaGlwXG4gICAgXCJhbHJlYWR5LWV4aXN0c1wiLFxuICAgIFwidW5leHBlY3RlZFwiLFxuICAgIFwicGVybWlzc2lvbi1kZW5pZWRcIixcbiAgXTtcblxuICBwcml2YXRlIGluc3RhbmNlOiBBeGlvc0luc3RhbmNlIHwgbnVsbCA9IG51bGw7XG5cbiAgcHJpdmF0ZSBnZXQgaHR0cCgpOiBBeGlvc0luc3RhbmNlIHtcbiAgICByZXR1cm4gdGhpcy5pbnN0YW5jZSAhPSBudWxsID8gdGhpcy5pbnN0YW5jZSA6IHRoaXMuaW5pdEhhc3VyYUFwaSgpO1xuICB9XG5cbiAgaW5pdEhhc3VyYUFwaSgpIHtcbiAgICBjb25zdCBodHRwID0gYXhpb3MuY3JlYXRlKHtcbiAgICAgIGJhc2VVUkw6IGVudmlyb25tZW50Lmhhc3VyYUhvc3QsXG4gICAgICBoZWFkZXJzLFxuICAgICAgd2l0aENyZWRlbnRpYWxzOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIHRoaXMuaW5zdGFuY2UgPSBodHRwO1xuICAgIHJldHVybiBodHRwO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aWMgZXJySWdub3JlKCkge1xuICAgIGlmICh0aGlzLklHTk9SRV9FUlJPUlMgfHwgZW52aXJvbm1lbnQudGVzdElnbm9yZUVycm9ycykge1xuICAgICAgcmV0dXJuIHRoaXMuSEFTVVJBX0lHTk9SRV9DT0RFUztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcG9zdCh0eXBlOiBzdHJpbmcsIGFyZ3M6IFJlY29yZDxzdHJpbmcsIGFueT4pIHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgdHJ5IHtcbiAgICAgIGxvZy5kZWJ1ZyhgaGFzdXJhQXBpLnBvc3Q6IHR5cGU6ICR7dHlwZX1gLCBhcmdzKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5odHRwLnBvc3Q8YW55LCBBeGlvc1Jlc3BvbnNlPihcbiAgICAgICAgXCIvdjEvbWV0YWRhdGFcIixcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgYXJnczogYXJncyxcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogcmVzcG9uc2UsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvci5yZXNwb25zZSAmJiBlcnJvci5yZXNwb25zZS5kYXRhKSB7XG4gICAgICAgIGlmICghSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKGVycm9yLnJlc3BvbnNlLmRhdGEuY29kZSkpIHtcbiAgICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgICBcImVycm9yLnJlc3BvbnNlLmRhdGE6IFwiICsgSlNPTi5zdHJpbmdpZnkoZXJyb3IucmVzcG9uc2UuZGF0YSlcbiAgICAgICAgICApO1xuICAgICAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICAgICAgcmVmQ29kZTogZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0ID0ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgfSkgYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3RyYWNrX3RhYmxlXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3VudHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgY2FzY2FkZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWxhdGlvbnNoaXBzXG4gICAqL1xuXG4gIC8vIGEgcG9zdCBoYXMgb25lIGF1dGhvciAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLCAvLyBhdXRob3JfaWRcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKCR7c2NoZW1hTmFtZX0sICR7dGFibGVOYW1lfSwgJHtjb2x1bW5OYW1lfSwgJHtwYXJlbnRUYWJsZU5hbWV9KWBcbiAgICApO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2NyZWF0ZV9vYmplY3RfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIG5hbWU6IGBvYmpfJHt0YWJsZU5hbWV9XyR7cGFyZW50VGFibGVOYW1lfWAsIC8vIG9ial9wb3N0c19hdXRob3JzXG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgIH0sXG4gICAgICB1c2luZzoge1xuICAgICAgICBmb3JlaWduX2tleV9jb25zdHJhaW50X29uOiBjb2x1bW5OYW1lLCAvLyBhdXRob3JfaWRcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBhbiBhdXRob3IgaGFzIG1hbnkgcG9zdHMgKGNvbnN0cmFpbnQgcG9zdHMuYXV0aG9yX2lkIC0+IGF1dGhvcnMuaWQpXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVBcnJheVJlbGF0aW9uc2hpcChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIGF1dGhvcnNcbiAgICBjaGlsZFRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIGNoaWxkQ29sdW1uTmFtZXM6IHN0cmluZ1tdIC8vIGF1dGhvcl9pZFxuICApIHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKCR7c2NoZW1hTmFtZX0sICR7dGFibGVOYW1lfSwgJHtjaGlsZFRhYmxlTmFtZX0sICR7Y2hpbGRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX2FycmF5X3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICBuYW1lOiBgYXJyXyR7dGFibGVOYW1lfV8ke2NoaWxkVGFibGVOYW1lfWAsIC8vIGFycl9hdXRob3JzX3Bvc3RzXG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IHtcbiAgICAgICAgICBjb2x1bW46IGNoaWxkQ29sdW1uTmFtZXNbMF0sIC8vIGF1dGhvcl9pZFxuICAgICAgICAgIHRhYmxlOiB7XG4gICAgICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgICAgICBuYW1lOiBjaGlsZFRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkcm9wUmVsYXRpb25zaGlwcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcgLy8gYXV0aG9yc1xuICApIHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfZHJvcF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICB9LFxuICAgICAgcmVsYXRpb25zaGlwOiBgb2JqXyR7dGFibGVOYW1lfV8ke3BhcmVudFRhYmxlTmFtZX1gLCAvLyBvYmpfcG9zdHNfYXV0aG9yc1xuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgKCFyZXN1bHQucmVmQ29kZSB8fFxuICAgICAgICAocmVzdWx0LnJlZkNvZGUgJiYgIUhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSkpKVxuICAgICkge1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfZHJvcF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgIH0sXG4gICAgICByZWxhdGlvbnNoaXA6IGBhcnJfJHtwYXJlbnRUYWJsZU5hbWV9XyR7dGFibGVOYW1lfWAsIC8vIGFycl9hdXRob3JzX3Bvc3RzXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogUGVybWlzc2lvbnNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVBlcm1pc3Npb24oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBlcm1pc3Npb25DaGVjazogb2JqZWN0LFxuICAgIHR5cGU6IHN0cmluZyxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbnM6IHN0cmluZ1tdXG4gICkge1xuICAgIGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICByb2xlOiByb2xlTmFtZSxcbiAgICAgIHBlcm1pc3Npb246IHtcbiAgICAgICAgY29sdW1uczogY29sdW1ucyxcbiAgICAgICAgLy8gZmlsdGVyOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICAgIC8vIGNoZWNrOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gaHR0cHM6Ly9oYXN1cmEuaW8vZG9jcy9sYXRlc3QvZ3JhcGhxbC9jb3JlL2FwaS1yZWZlcmVuY2UvbWV0YWRhdGEtYXBpL3Blcm1pc3Npb24uaHRtbFxuICAgIGlmICh0eXBlID09IFwiaW5zZXJ0XCIpIHtcbiAgICAgIHBheWxvYWQucGVybWlzc2lvbi5jaGVjayA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9IGVsc2Uge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmZpbHRlciA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9XG4gICAgaWYgKHR5cGUgPT0gXCJzZWxlY3RcIikge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmFsbG93X2FnZ3JlZ2F0aW9ucyA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChgcGdfY3JlYXRlXyR7dHlwZX1fcGVybWlzc2lvbmAsIHBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUGVybWlzc2lvbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lOiBzdHJpbmdcbiAgKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KGBwZ19kcm9wXyR7dHlwZX1fcGVybWlzc2lvbmAsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IHJvbGVOYW1lLFxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhc3VyYUFwaSA9IG5ldyBIYXN1cmFBcGkoKTtcbiIsImV4cG9ydCBjb25zdCBERUZBVUxUX1BPTElDWTogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gIC8vIE9yZ2FuaXphdGlvbnNcbiAgYWNjZXNzX29yZ2FuaXphdGlvbjoge1xuICAgIHJvbGVMZXZlbDogXCJvcmdhbml6YXRpb25cIixcbiAgICBkZXNjcmlwdGlvbjogXCJBY2Nlc3MgdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlclwiLFxuICAgICAgXCJvcmdhbml6YXRpb25fdXNlclwiLFxuICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIF0sXG4gIH0sXG4gIGFkbWluaXN0ZXJfb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFkbWluaXN0ZXIgdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIGVkaXRfb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkVkaXQgdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIG1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIk1hbmFnZSBBY2Nlc3MgdG8gdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIC8vIFNjaGVtYXNcbiAgYWx0ZXJfc2NoZW1hOiB7XG4gICAgcm9sZUxldmVsOiBcInNjaGVtYVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFsdGVyIHRoaXMgRGF0YWJhc2VcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wic2NoZW1hX21hbmFnZXJcIiwgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXSxcbiAgfSxcbiAgbWFuYWdlX2FjY2Vzc190b19zY2hlbWE6IHtcbiAgICByb2xlTGV2ZWw6IFwic2NoZW1hXCIsXG4gICAgZGVzY3JpcHRpb246IFwiTWFuYWdlIEFjY2VzcyB0byB0aGlzIERhdGFiYXNlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICAvLyBUYWJsZXNcbiAgYWx0ZXJfdGFibGU6IHtcbiAgICByb2xlTGV2ZWw6IFwidGFibGVcIixcbiAgICBkZXNjcmlwdGlvbjogXCJBbHRlciB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX21hbmFnZXJcIiwgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICBtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiTWFuYWdlIEFjY2VzcyB0byB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIHJlYWRfdGFibGVfcmVjb3Jkczoge1xuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgUmVjb3JkcyBmcm9tIHRoaXMgVGFibGVcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJ0YWJsZV9yZWFkZXJcIixcbiAgICAgIFwidGFibGVfZWRpdG9yXCIsXG4gICAgICBcInRhYmxlX21hbmFnZXJcIixcbiAgICAgIFwidGFibGVfYWRtaW5pc3RyYXRvclwiLFxuICAgIF0sXG4gICAgaGFzdXJhQWN0aW9uczogW1wic2VsZWN0XCJdLFxuICB9LFxuICByZWFkX2FuZF93cml0ZV90YWJsZV9yZWNvcmRzOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiUmVhZCBhbmQgV3JpdGUgUmVjb3JkcyB0byB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX2VkaXRvclwiLCBcInRhYmxlX21hbmFnZXJcIiwgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCJdLFxuICAgIGhhc3VyYUFjdGlvbnM6IFtcInNlbGVjdFwiLCBcImluc2VydFwiLCBcInVwZGF0ZVwiLCBcImRlbGV0ZVwiXSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyB0eXBlRGVmcyBhcyBTY2hlbWEsIHJlc29sdmVycyBhcyBzY2hlbWFSZXNvbHZlcnMgfSBmcm9tIFwiLi9zY2hlbWFcIjtcbmltcG9ydCB7XG4gIHR5cGVEZWZzIGFzIE9yZ2FuaXphdGlvbixcbiAgcmVzb2x2ZXJzIGFzIG9yZ2FuaXphdGlvblJlc29sdmVycyxcbn0gZnJvbSBcIi4vb3JnYW5pemF0aW9uXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyBhcyBVc2VyLCByZXNvbHZlcnMgYXMgdXNlclJlc29sdmVycyB9IGZyb20gXCIuL3VzZXJcIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFRhYmxlLCByZXNvbHZlcnMgYXMgdGFibGVSZXNvbHZlcnMgfSBmcm9tIFwiLi90YWJsZVwiO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tIFwibG9kYXNoXCI7XG5pbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7XG4gIGNvbnN0cmFpbnREaXJlY3RpdmUsXG4gIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbn0gZnJvbSBcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIjtcbmltcG9ydCB7IG1ha2VFeGVjdXRhYmxlU2NoZW1hIH0gZnJvbSBcImdyYXBocWwtdG9vbHNcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnk7IG1lc3NhZ2U/OiBzdHJpbmcgfVxuICB8IHtcbiAgICAgIHN1Y2Nlc3M/OiBmYWxzZTtcbiAgICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gICAgICByZWZDb2RlPzogc3RyaW5nO1xuICAgICAgd2JDb2RlPzogc3RyaW5nO1xuICAgICAgYXBvbGxvRXJyb3JDb2RlPzogc3RyaW5nO1xuICAgICAgdmFsdWVzPzogc3RyaW5nW107XG4gICAgfTtcblxuZXhwb3J0IHR5cGUgUXVlcnlQYXJhbXMgPSB7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHBhcmFtcz86IGFueVtdO1xufTtcblxuZXhwb3J0IHR5cGUgQ29uc3RyYWludElkID0ge1xuICBjb25zdHJhaW50TmFtZTogc3RyaW5nO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgY29sdW1uTmFtZTogc3RyaW5nO1xuICByZWxUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIHJlbENvbHVtbk5hbWU/OiBzdHJpbmc7XG59O1xuXG5jb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogSlNPTiFcbiAgICB3YkNsb3VkQ29udGV4dDogSlNPTiFcbiAgfVxuXG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiUmVzZXRUZXN0RGF0YTogQm9vbGVhbiFcbiAgICB3YkF1dGgodXNlckF1dGhJZDogU3RyaW5nISk6IEpTT04hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgIH07XG4gICAgfSxcbiAgICB3YkNsb3VkQ29udGV4dDogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gY29udGV4dC53YkNsb3VkLmNsb3VkQ29udGV4dCgpO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkF1dGg6IGFzeW5jIChfLCB7IHVzZXJBdXRoSWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmF1dGgodXNlckF1dGhJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBzY2hlbWEgPSBtYWtlRXhlY3V0YWJsZVNjaGVtYSh7XG4gIHR5cGVEZWZzOiBbXG4gICAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxuICAgIHR5cGVEZWZzLFxuICAgIE9yZ2FuaXphdGlvbixcbiAgICBVc2VyLFxuICAgIFNjaGVtYSxcbiAgICBUYWJsZSxcbiAgXSxcbiAgcmVzb2x2ZXJzOiBtZXJnZShcbiAgICByZXNvbHZlcnMsXG4gICAgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxuICAgIHVzZXJSZXNvbHZlcnMsXG4gICAgc2NoZW1hUmVzb2x2ZXJzLFxuICAgIHRhYmxlUmVzb2x2ZXJzXG4gICksXG4gIHNjaGVtYVRyYW5zZm9ybXM6IFtjb25zdHJhaW50RGlyZWN0aXZlKCldLFxufSk7XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIE9yZ2FuaXphdGlvbiB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBPcmdhbml6YXRpb25Vc2VyIHtcbiAgICBvcmdhbml6YXRpb25JZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbnNcbiAgICBcIlwiXCJcbiAgICB3Yk15T3JnYW5pemF0aW9ucyh3aXRoU2V0dGluZ3M6IEJvb2xlYW4pOiBbT3JnYW5pemF0aW9uXVxuICAgIHdiTXlPcmdhbml6YXRpb25CeU5hbWUobmFtZTogU3RyaW5nISwgd2l0aFNldHRpbmdzOiBCb29sZWFuKTogT3JnYW5pemF0aW9uXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWUobmFtZTogU3RyaW5nISk6IE9yZ2FuaXphdGlvblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiT3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICByb2xlczogW1N0cmluZ11cbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbT3JnYW5pemF0aW9uVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb25zXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVPcmdhbml6YXRpb24obmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBPcmdhbml6YXRpb25cbiAgICB3YlVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIG5ld05hbWU6IFN0cmluZ1xuICAgICAgbmV3TGFiZWw6IFN0cmluZ1xuICAgICk6IE9yZ2FuaXphdGlvblxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEpOiBCb29sZWFuXG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGVOYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncyhcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiTXlPcmdhbml6YXRpb25zOiBhc3luYyAoXywgeyB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlT3JnYW5pemF0aW9ucyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlPcmdhbml6YXRpb25CeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUsIHdpdGhTZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVPcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk9yZ2FuaXphdGlvbkJ5TmFtZTogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3Yk9yZ2FuaXphdGlvblVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBvcmdhbml6YXRpb25OYW1lLCByb2xlcywgdXNlckVtYWlscywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvblVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByb2xlcyxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb246IGFzeW5jIChfLCB7IG5hbWUsIG5ld05hbWUsIG5ld0xhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3TmFtZSxcbiAgICAgICAgbmV3TGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmRlbGV0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3YlNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyB1c2VyRW1haWxzLCBvcmdhbml6YXRpb25OYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5nczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgc2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuLi9lbnRpdHlcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBTY2hlbWEge1xuICAgIGlkOiBJRCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICBvcmdhbml6YXRpb25Pd25lcklkOiBJbnRcbiAgICB1c2VyT3duZXJJZDogSW50XG4gICAgb3JnYW5pemF0aW9uT3duZXJOYW1lOiBTdHJpbmdcbiAgICB1c2VyT3duZXJFbWFpbDogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIFNjaGVtYVVzZXIge1xuICAgIHNjaGVtYUlkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgdXNlckZpcnN0TmFtZTogU3RyaW5nXG4gICAgdXNlckxhc3ROYW1lOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIHJvbGU6IFJvbGVcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBTY2hlbWFzXG4gICAgXCJcIlwiXG4gICAgd2JNeVNjaGVtYXMod2l0aFNldHRpbmdzOiBCb29sZWFuKTogW1NjaGVtYV1cbiAgICB3Yk15U2NoZW1hQnlOYW1lKG5hbWU6IFN0cmluZyEsIHdpdGhTZXR0aW5nczogQm9vbGVhbik6IFNjaGVtYVxuICAgIFwiXCJcIlxuICAgIFNjaGVtYSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2NoZW1hVXNlcnMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXVxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW1NjaGVtYVVzZXJdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgU2NoZW1hc1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlU2NoZW1hKFxuICAgICAgbmFtZTogU3RyaW5nIVxuICAgICAgbGFiZWw6IFN0cmluZyFcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQ6IEludFxuICAgICAgb3JnYW5pemF0aW9uT3duZXJOYW1lOiBTdHJpbmdcbiAgICApOiBTY2hlbWFcbiAgICBcIlwiXCJcbiAgICBTY2hlbWEgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNldFNjaGVtYVVzZXJzUm9sZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddIVxuICAgICAgcm9sZU5hbWU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSEpOiBCb29sZWFuXG4gICAgd2JTYXZlU2NoZW1hVXNlclNldHRpbmdzKHNjaGVtYU5hbWU6IFN0cmluZyEsIHNldHRpbmdzOiBKU09OISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiTXlTY2hlbWFzOiBhc3luYyAoXywgeyB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlU2NoZW1hcyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlTY2hlbWFCeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUsIHdpdGhTZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFCeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBTY2hlbWEgVXNlcnNcbiAgICB3YlNjaGVtYVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2NoZW1hVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBTY2hlbWFzXG4gICAgd2JDcmVhdGVTY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25Pd25lcklkLCBvcmdhbml6YXRpb25Pd25lck5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlU2NoZW1hKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQsXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFNjaGVtYSBVc2Vyc1xuICAgIHdiU2V0U2NoZW1hVXNlcnNSb2xlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzLCByb2xlTmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICByb2xlTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlU2NoZW1hVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVTY2hlbWFVc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlNhdmVTY2hlbWFVc2VyU2V0dGluZ3M6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHNldHRpbmdzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBHcmFwaFFMSlNPTiB9IGZyb20gXCJncmFwaHFsLXR5cGUtanNvblwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHNjYWxhciBKU09OXG5cbiAgdHlwZSBUYWJsZSB7XG4gICAgaWQ6IElEIVxuICAgIHNjaGVtYUlkOiBJbnQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgY29sdW1uczogW0NvbHVtbl1cbiAgICBzY2hlbWFOYW1lOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIHJvbGU6IFJvbGVcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgQ29sdW1uIHtcbiAgICBpZDogSUQhXG4gICAgdGFibGVJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHR5cGU6IFN0cmluZyFcbiAgICBpc1ByaW1hcnlLZXk6IEJvb2xlYW4hXG4gICAgZm9yZWlnbktleXM6IFtDb25zdHJhaW50SWRdIVxuICAgIHJlZmVyZW5jZWRCeTogW0NvbnN0cmFpbnRJZF0hXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbnN0cmFpbnRJZCB7XG4gICAgY29uc3RyYWludE5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgcmVsVGFibGVOYW1lOiBTdHJpbmdcbiAgICByZWxDb2x1bW5OYW1lOiBTdHJpbmdcbiAgfVxuXG4gIHR5cGUgVGFibGVVc2VyIHtcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgIHVzZXJGaXJzdE5hbWU6IFN0cmluZ1xuICAgIHVzZXJMYXN0TmFtZTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgVGFibGVzXG4gICAgXCJcIlwiXG4gICAgd2JNeVRhYmxlcyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHdpdGhDb2x1bW5zOiBCb29sZWFuXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbVGFibGVdXG4gICAgd2JNeVRhYmxlQnlOYW1lKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB3aXRoQ29sdW1uczogQm9vbGVhblxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogVGFibGVcbiAgICBcIlwiXCJcbiAgICBUYWJsZSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiVGFibGVVc2VycyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ11cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFtUYWJsZVVzZXJdXG4gICAgXCJcIlwiXG4gICAgQ29sdW1uc1xuICAgIFwiXCJcIlxuICAgIHdiQ29sdW1ucyhzY2hlbWFOYW1lOiBTdHJpbmchLCB0YWJsZU5hbWU6IFN0cmluZyEpOiBbQ29sdW1uXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFRhYmxlc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkT3JDcmVhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVMYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlVwZGF0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBuZXdUYWJsZU5hbWU6IFN0cmluZ1xuICAgICAgbmV3VGFibGVMYWJlbDogU3RyaW5nXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkFkZEFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBwYXJlbnRDb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBwYXJlbnRUYWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNldFRhYmxlVXNlcnNSb2xlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGVOYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5MYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgICBjb2x1bW5UeXBlOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiVXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBuZXdDb2x1bW5OYW1lOiBTdHJpbmdcbiAgICAgIG5ld0NvbHVtbkxhYmVsOiBTdHJpbmdcbiAgICAgIG5ld1R5cGU6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgSlNPTjogR3JhcGhRTEpTT04sXG4gIFF1ZXJ5OiB7XG4gICAgLy8gVGFibGVzXG4gICAgd2JNeVRhYmxlczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgd2l0aENvbHVtbnMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlUYWJsZUJ5TmFtZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB3aXRoQ29sdW1ucywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVUYWJsZUJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFRhYmxlIFVzZXJzXG4gICAgd2JUYWJsZVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbHMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JDb2x1bW5zOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFRhYmxlc1xuICAgIHdiQWRkT3JDcmVhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB0YWJsZUxhYmVsLCBjcmVhdGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdGFibGVMYWJlbCxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JVcGRhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBuZXdUYWJsZU5hbWUsIG5ld1RhYmxlTGFiZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVGFibGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTmFtZSxcbiAgICAgICAgbmV3VGFibGVMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZEFsbEV4aXN0aW5nVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIHBhcmVudFRhYmxlTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgLy8gQ29sdW1uc1xuICAgIHdiQWRkT3JDcmVhdGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWwsIGNyZWF0ZSwgY29sdW1uVHlwZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgY29sdW1uTGFiZWwsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgICAgY29sdW1uVHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiVXBkYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgICBuZXdUeXBlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlQ29sdW1uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlVGFibGVVc2VyU2V0dGluZ3M6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgc2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG4vKipcbiAqIE9ubHkgZmllbGRzIHJlbGF0ZWQgdG8gYW4gaXNvbGF0ZWQgdXNlciBvciByb2xlIG9iamVjdHMgbGl2ZSBoZXJlXG4gKiBGb3Igb3JnYW5pemF0aW9uLXVzZXJzLCBzY2hlbWEtdXNlcnMsIHRhYmxlLXVzZXJzIHNlZSByZXNwZWN0aXZlIGNsYXNzZXNcbiAqL1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgVXNlciB7XG4gICAgaWQ6IElEIVxuICAgIGVtYWlsOiBTdHJpbmchXG4gICAgZmlyc3ROYW1lOiBTdHJpbmdcbiAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIFJvbGUge1xuICAgIG5hbWU6IFN0cmluZyFcbiAgICBpbXBsaWVkRnJvbTogU3RyaW5nXG4gICAgcGVybWlzc2lvbnM6IEpTT05cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiVXNlckJ5SWQoaWQ6IElEISk6IFVzZXJcbiAgICB3YlVzZXJCeUVtYWlsKGVtYWlsOiBTdHJpbmchKTogVXNlclxuICAgIHdiVXNlcnNCeVNlYXJjaFBhdHRlcm4oc2VhcmNoUGF0dGVybjogU3RyaW5nISk6IFtVc2VyXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVVc2VyKGVtYWlsOiBTdHJpbmchLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICB3YlVwZGF0ZVVzZXIoXG4gICAgICBpZDogSUQhXG4gICAgICBlbWFpbDogU3RyaW5nXG4gICAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgICk6IFVzZXJcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5SWQoY3VycmVudFVzZXIsIGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5RW1haWw6IGFzeW5jIChfLCB7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5RW1haWwoY3VycmVudFVzZXIsIGVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlcnNCeVNlYXJjaFBhdHRlcm46IGFzeW5jIChfLCB7IHNlYXJjaFBhdHRlcm4gfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2Vyc0J5U2VhcmNoUGF0dGVybihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNlYXJjaFBhdHRlcm5cbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiQ3JlYXRlVXNlcjogYXN5bmMgKF8sIHsgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVVzZXI6IGFzeW5jIChfLCB7IGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZVVzZXIoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBpZCxcbiAgICAgICAgZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBBcG9sbG9TZXJ2ZXIsIEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuaW1wb3J0IHsgaGFzdXJhQXBpIH0gZnJvbSBcIi4vaGFzdXJhLWFwaVwiO1xuaW1wb3J0IHsgQ29uc3RyYWludElkLCBzY2hlbWEsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHYgPSByZXF1aXJlKFwidm9jYVwiKTtcbmltcG9ydCB7IHVzZXJNZXNzYWdlcyB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5cbmltcG9ydCB7XG4gIENvbHVtbixcbiAgT3JnYW5pemF0aW9uLFxuICBSb2xlLFxuICBSb2xlTGV2ZWwsXG4gIFNjaGVtYSxcbiAgVGFibGUsXG4gIFVzZXIsXG59IGZyb20gXCIuL2VudGl0eVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi9lbnRpdHkvQ3VycmVudFVzZXJcIjtcbmltcG9ydCB7IERFRkFVTFRfUE9MSUNZIH0gZnJvbSBcIi4vcG9saWN5XCI7XG5cbmV4cG9ydCBjb25zdCBncmFwaHFsSGFuZGxlciA9IG5ldyBBcG9sbG9TZXJ2ZXIoe1xuICBzY2hlbWEsXG4gIGludHJvc3BlY3Rpb246IHRydWUsXG4gIGNvbnRleHQ6ICh7IGV2ZW50LCBjb250ZXh0IH0pID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgaGVhZGVyczogZXZlbnQuaGVhZGVycyxcbiAgICAgIG11bHRpVmFsdWVIZWFkZXJzOiBldmVudC5tdWx0aVZhbHVlSGVhZGVycyxcbiAgICAgIHdiQ2xvdWQ6IG5ldyBXaGl0ZWJyaWNrQ2xvdWQoKSxcbiAgICB9O1xuICB9LFxufSkuY3JlYXRlSGFuZGxlcigpO1xuXG5leHBvcnQgY29uc3QgbG9nOiBMb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgbWluTGV2ZWw6IFwiZGVidWdcIixcbn0pO1xuXG5leHBvcnQgY2xhc3MgV2hpdGVicmlja0Nsb3VkIHtcbiAgZGFsID0gbmV3IERBTCgpO1xuXG4gIHB1YmxpYyBlcnIocmVzdWx0OiBTZXJ2aWNlUmVzdWx0KTogRXJyb3Ige1xuICAgIHJldHVybiBhcG9sbG9FcnIocmVzdWx0KTtcbiAgfVxuXG4gIC8vIG9ubHkgYXN5bmMgZm9yIHRlc3RpbmcgLSBmb3IgdGhlIG1vc3QgcGFydCBzdGF0aWNcbiAgcHVibGljIGFzeW5jIHVpZEZyb21IZWFkZXJzKFxuICAgIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy9sb2cuZGVidWcoXCI9PT09PT09PT09IEhFQURFUlM6IFwiICsgSlNPTi5zdHJpbmdpZnkoaGVhZGVycykpO1xuICAgIGNvbnN0IGhlYWRlcnNMb3dlckNhc2UgPSBPYmplY3QuZW50cmllcyhoZWFkZXJzKS5yZWR1Y2UoXG4gICAgICAoYWNjOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBba2V5LCB2YWxdKSA9PiAoXG4gICAgICAgIChhY2Nba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsKSwgYWNjXG4gICAgICApLFxuICAgICAge31cbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICAvLyBpZiB4LWhhc3VyYS1hZG1pbi1zZWNyZXQgaXMgcHJlc2VudCBhbmQgdmFsaWQgaGFzdXJhIHNldHMgcm9sZSB0byBhZG1pblxuICAgIGlmIChcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXS50b0xvd2VyQ2FzZSgpID09IFwiYWRtaW5cIlxuICAgICkge1xuICAgICAgbG9nLmRlYnVnKFwiPT09PT09PT09PSBGT1VORCBBRE1JTiBVU0VSXCIpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogVXNlci5TWVNfQURNSU5fSUQsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdXG4gICAgKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJCeUVtYWlsKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbih0aGlzKSxcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBURVNUIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogYHVpZEZyb21IZWFkZXJzOiBDb3VsZCBub3QgZmluZCBoZWFkZXJzIGZvciBBZG1pbiwgVGVzdCBvciBVc2VyIGluOiAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGhlYWRlcnNcbiAgICAgICAgKX1gLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBjbG91ZENvbnRleHQoKTogb2JqZWN0IHtcbiAgICByZXR1cm4ge1xuICAgICAgZGVmYXVsdENvbHVtblR5cGVzOiBDb2x1bW4uQ09NTU9OX1RZUEVTLFxuICAgICAgcm9sZXM6IHtcbiAgICAgICAgb3JnYW5pemF0aW9uOiBSb2xlLlNZU1JPTEVTX09SR0FOSVpBVElPTlMsXG4gICAgICAgIHNjaGVtYTogUm9sZS5TWVNST0xFU19TQ0hFTUFTLFxuICAgICAgICB0YWJsZTogUm9sZS5TWVNST0xFU19UQUJMRVMsXG4gICAgICB9LFxuICAgICAgcG9saWN5OiBERUZBVUxUX1BPTElDWSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGVzdCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgcmVzZXRUZXN0RGF0YSgpYCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyhcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKHRoaXMpLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgXCJ0ZXN0XyVcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4odGhpcyksXG4gICAgICAgIHNjaGVtYS5uYW1lLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlVGVzdFVzZXJzKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IEF1dGggPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYXV0aCh1c2VyQXV0aElkOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VySWRGcm9tQXV0aElkKHVzZXJBdXRoSWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgaGFzdXJhVXNlcklkOiBudW1iZXIgPSByZXN1bHQucGF5bG9hZDtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgXCJYLUhhc3VyYS1BbGxvd2VkLVJvbGVzXCI6IFtcIndidXNlclwiXSxcbiAgICAgICAgXCJYLUhhc3VyYS1EZWZhdWx0LVJvbGVcIjogXCJ3YnVzZXJcIixcbiAgICAgICAgXCJYLUhhc3VyYS1Vc2VyLUlkXCI6IGhhc3VyYVVzZXJJZCxcbiAgICAgICAgXCJYLUhhc3VyYS1BdXRoZW50aWNhdGVkLUF0XCI6IERhdGUoKS50b1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGUsXG4gICAgZGVsZXRlT25seT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnModGFibGUuaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFJvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0OiBPcmdhbml6YXRpb24gfCBTY2hlbWEgfCBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0Um9sZSgke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke0pTT04uc3RyaW5naWZ5KG9iamVjdCl9KWBcbiAgICApO1xuICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUsIHJvbGVMZXZlbCkpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBgJHtyb2xlTmFtZX0gaXMgbm90IGEgdmFsaWQgbmFtZSBmb3IgYW4gJHtyb2xlTGV2ZWx9IFJvbGUuYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgc3dpdGNoIChyb2xlTmFtZSkge1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fdXNlclwiOlxuICAgICAgICAgICAgLy8gYXJlIGFueSBvZiB0aGVzZSB1c2VyIGN1cnJlbnRseSBhZG1pbnMgZ2V0dGluZyBkZW1vdGVkP1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhjVSwgb2JqZWN0Lm5hbWUsIHVuZGVmaW5lZCwgW1xuICAgICAgICAgICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QWRtaW5JZHMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICAgICAgIChvcmdhbml6YXRpb25Vc2VyOiB7IHVzZXJJZDogbnVtYmVyIH0pID0+IG9yZ2FuaXphdGlvblVzZXIudXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZGVtb3RlZEFkbWluczogbnVtYmVyW10gPSB1c2VySWRzLmZpbHRlcigoaWQ6IG51bWJlcikgPT5cbiAgICAgICAgICAgICAgY3VycmVudEFkbWluSWRzLmluY2x1ZGVzKGlkKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChkZW1vdGVkQWRtaW5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgLy8gY29tcGxldGVseSByZW1vdmUgdGhlbSAod2lsbCByYWlzZSBlcnJvciBpZiBubyBhZG1pbnMpXG4gICAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgICAgICAgICAgIGNVLFxuICAgICAgICAgICAgICAgIG9iamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIGRlbW90ZWRBZG1pbnNcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGFkZCBvcmduYWl6YXRpb25fdXNlclxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCI6XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICAgICAgICBvYmplY3QuaWQsXG4gICAgICAgICAgICAgIFJvbGUuc3lzUm9sZU1hcChcbiAgICAgICAgICAgICAgICBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVzZXJJZHNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihjVSwgb2JqZWN0LmlkKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgICAgICAgICAgICBzY2hlbWEuaWQsXG4gICAgICAgICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKSxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgdXNlcklkc1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCI6XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIjpcbiAgICAgICAgLy8gYWRkIHNjaGVtYV91c2VyXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIENoYW5naW5nIHJvbGUgYXQgdGhlIHNjaGVtYSBsZXZlbCByZXNldHMgYWxsXG4gICAgICAgIC8vIHRhYmxlIHJvbGVzIHRvIHRoZSBzY2hlbWEgZGVmYXVsdCBpbmhlcml0ZW5jZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgICAgICBvYmplY3QuaWQsXG4gICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKSwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdXNlcklkc1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKHVzZXJJZHMsIHJvbGVMZXZlbCwgb2JqZWN0SWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgLy8gRGVsZXRlIHNjaGVtYSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBvcmdhbml6YXRpb24gYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICBcInNjaGVtYVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIG9yZ2FuaXphdGlvbiBpZFxuICAgICAgICAgIFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBzY2hlbWEgYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoY1UsIG9iamVjdElkKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgIFwidGFibGVcIixcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHNjaGVtYS5pZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgICAgW1wic2NoZW1hX2FkbWluaXN0cmF0b3JcIl1cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCI6XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSB1c2VycyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSB1c2Vyc1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgIE9iamVjdC5rZXlzKFxuICAgICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZE9yTmFtZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIHBhcmVudE9iamVjdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnJvbGVBbmRJZEZvclVzZXJPYmplY3QoXG4gICAgICB1c2VySWQsXG4gICAgICByb2xlTGV2ZWwsXG4gICAgICBvYmplY3RJZE9yTmFtZSxcbiAgICAgIHBhcmVudE9iamVjdE5hbWVcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgZGVsZXRlVGVzdFVzZXJzKClgKTtcbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdFVzZXJzKCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUlkcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWRzOiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnMoaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlJZChjVTogQ3VycmVudFVzZXIsIGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlJZHMoY1UsIFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gc2VhcmNoUGF0dGVybiBhY3Jvc3MgbXVsdGlwbGUgZmllbGRzXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5U2VhcmNoUGF0dGVybihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2VhcmNoUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vycyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2VhcmNoUGF0dGVybik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUVtYWlscyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzKHVuZGVmaW5lZCwgdXNlckVtYWlscyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5RW1haWwoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGVtYWlsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCBbZW1haWxdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2VtYWlsXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgZW1haWw6IHN0cmluZyxcbiAgICBmaXJzdE5hbWU6IHN0cmluZyxcbiAgICBsYXN0TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIFRCRDogYXV0aGVudGljYXRpb24sIHNhdmUgcGFzc3dvcmRcbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVXNlcihlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZVVzZXIoaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IE9yZ2FuaXphdGlvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uSWRzPzogbnVtYmVyW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5vcmdhbml6YXRpb25zKFxuICAgICAgb3JnYW5pemF0aW9uSWRzLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZXMsXG4gICAgICBvcmdhbml6YXRpb25OYW1lUGF0dGVyblxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlJZHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkczogbnVtYmVyW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyhjVSwgaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeUlkKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uc0J5SWRzKGNVLCBbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeU5hbWVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyhjVSwgdW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zQnlOYW1lcyhjVSwgW25hbWVdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5TmFtZVBhdHRlcm4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zKFxuICAgICAgY1UsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBuYW1lUGF0dGVyblxuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVQYXR0ZXJuXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZU9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwub3JnYW5pemF0aW9uc0J5VXNlcnMoXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgW29yZ2FuaXphdGlvbk5hbWVdLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbb3JnYW5pemF0aW9uTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVPcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5vcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBjcmVhdGVPcmdhbml6YXRpb24oJHtjVS5pZH0sICR7bmFtZX0sICR7bGFiZWx9KWApO1xuICAgIGlmIChjVS5pc1NpZ25lZE91dCgpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCBjaGVja05hbWVSZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShjVSwgbmFtZSk7XG4gICAgaWYgKGNoZWNrTmFtZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OQU1FX1RBS0VOXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgLy8gaWUgV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORCBpcyB0aGUgZGVzaXJlZCByZXN1bHRcbiAgICB9IGVsc2UgaWYgKGNoZWNrTmFtZVJlc3VsdC53YkNvZGUgIT0gXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIpIHtcbiAgICAgIHJldHVybiBjaGVja05hbWVSZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IGNyZWF0ZU9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICAgIG5hbWUsXG4gICAgICBsYWJlbFxuICAgICk7XG4gICAgaWYgKCFjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNyZWF0ZU9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKHRoaXMpLFxuICAgICAgbmFtZSxcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICAgIFtjVS5pZF1cbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGNyZWF0ZU9yZ2FuaXphdGlvblJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBuZXdOYW1lPzogc3RyaW5nLFxuICAgIG5ld0xhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiZWRpdF9vcmdhbml6YXRpb25cIiwgbmFtZSkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlT3JnYW5pemF0aW9uKG5hbWUsIG5ld05hbWUsIG5ld0xhYmVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVPcmdhbml6YXRpb24oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGRlbGV0ZU9yZ2FuaXphdGlvbigke2NVLmlkfSwke25hbWV9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiZWRpdF9vcmdhbml6YXRpb25cIiwgbmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhjVSwgbmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl91c2VyXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCIsXG4gICAgXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFlcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVPcmdhbml6YXRpb24obmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpYCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb24gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZXM/OiBzdHJpbmdbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuYW1lKTtcbiAgICB9IGVsc2UgaWYgKGlkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5SWQoY1UsIGlkKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGlmIChyb2xlcyAmJiAhUm9sZS5hcmVSb2xlcyhyb2xlcykpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwib3JnYW5pemF0aW9uVXNlcnM6IHJvbGVzIGNvbnRhaW5zIG9uZSBvciBtb3JlIHVucmVjb2duaXplZCBzdHJpbmdzXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvblVzZXJzKG5hbWUsIGlkLCByb2xlcywgdXNlcklkcywgd2l0aFNldHRpbmdzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IHN0cmluZyxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZSgke2NVLmlkfSwke29yZ2FuaXphdGlvbk5hbWV9LCR7cm9sZU5hbWV9LCR7dXNlcklkc30sJHt1c2VyRW1haWxzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgdXNlcklkc0ZvdW5kOiBudW1iZXJbXSA9IFtdO1xuICAgIGxldCB1c2Vyc1JlcXVlc3RlZDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICB1c2Vyc1JlcXVlc3RlZCA9IHVzZXJJZHM7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlJZHMoY1UsIHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgdXNlcnNSZXF1ZXN0ZWQgPSB1c2VyRW1haWxzO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcyB8fCAhcmVzdWx0LnBheWxvYWQpIHJldHVybiByZXN1bHQ7XG4gICAgdXNlcklkc0ZvdW5kID0gcmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgaWYgKHVzZXJzUmVxdWVzdGVkLmxlbmd0aCAhPSB1c2VySWRzRm91bmQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IFtcbiAgICAgICAgICBgUmVxdWVzdGVkICR7dXNlcnNSZXF1ZXN0ZWQubGVuZ3RofTogJHt1c2Vyc1JlcXVlc3RlZC5qb2luKFwiLFwiKX1gLFxuICAgICAgICAgIGBGb3VuZCAke3VzZXJJZHNGb3VuZC5sZW5ndGh9OiAke3VzZXJJZHNGb3VuZC5qb2luKFwiLFwiKX1gLFxuICAgICAgICBdLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkc0ZvdW5kLFxuICAgICAgcm9sZU5hbWUsXG4gICAgICBcIm9yZ2FuaXphdGlvblwiLFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbigke2NVLmlkfSwke29yZ2FuaXphdGlvbk5hbWV9LCR7dXNlcklkc30sJHt1c2VyRW1haWxzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgdXNlcklkc1RvQmVSZW1vdmVkOiBudW1iZXJbXSA9IFtdO1xuICAgIGlmICh1c2VySWRzKSB1c2VySWRzVG9CZVJlbW92ZWQgPSB1c2VySWRzO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHVzZXJJZHNUb0JlUmVtb3ZlZCA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkXG4gICAgICApO1xuICAgIH1cbiAgICAvLyBjaGVjayBub3QgYWxsIHRoZSBhZG1pbnMgd2lsbCBiZSByZW1vdmVkXG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhjVSwgb3JnYW5pemF0aW9uTmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBhbGxBZG1pbklkcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgIChvcmdhbml6YXRpb25Vc2VyOiB7IHVzZXJJZDogbnVtYmVyIH0pID0+IG9yZ2FuaXphdGlvblVzZXIudXNlcklkXG4gICAgKTtcbiAgICBpZiAoXG4gICAgICBhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzVG9CZVJlbW92ZWQuaW5jbHVkZXMoZWxlbSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT19BRE1JTlNcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkc1RvQmVSZW1vdmVkLFxuICAgICAgXCJvcmdhbml6YXRpb25cIixcbiAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzKFxuICAgICAgc2NoZW1hSWRzLFxuICAgICAgc2NoZW1hTmFtZXMsXG4gICAgICBzY2hlbWFOYW1lUGF0dGVyblxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlJZHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkczogbnVtYmVyW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyhjVSwgaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeUlkKGNVOiBDdXJyZW50VXNlciwgaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5SWRzKGNVLCBbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU5hbWVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyhjVSwgdW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlOYW1lcyhjVSwgW25hbWVdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5TmFtZVBhdHRlcm4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKGNVLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZVBhdHRlcm4pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5VXNlck93bmVyKHVzZXJJZCwgdXNlckVtYWlsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgICBvcmdhbml6YXRpb25JZCxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4odXNlcklkLCB1c2VyRW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVTY2hlbWFCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFtzY2hlbWFOYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuc2NoZW1hc0J5VXNlcnMoXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIG9yZ2FuaXphdGlvbk93bmVyIG9yZ2FuaXphdGlvbiBhZG1pbnMgYXJlIGltcGxpY2l0bHkgZ3JhbnRlZCBzY2hlbWEgYWRtaW4gcm9sZXNcbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGNyZWF0ZVNjaGVtYSgke2NVLmlkfSwke25hbWV9LCR7bGFiZWx9LCR7b3JnYW5pemF0aW9uT3duZXJJZH0sJHtvcmdhbml6YXRpb25Pd25lck5hbWV9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgdXNlck93bmVySWQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICAvLyBydW4gY2hlY2tzIGZvciBvcmdhbml6YXRpb24gb3duZXJcbiAgICBpZiAob3JnYW5pemF0aW9uT3duZXJJZCB8fCBvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgIGlmICghb3JnYW5pemF0aW9uT3duZXJJZCAmJiBvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoY1UsIG9yZ2FuaXphdGlvbk93bmVyTmFtZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgY1UuaXNOb3RTeXNBZG1pbigpICYmXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgJiZcbiAgICAgICAgKGF3YWl0IGNVLmNhbnQoXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk93bmVySWQpKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9JTl9PUkdcIixcbiAgICAgICAgICB2YWx1ZXM6IFtjVS50b1N0cmluZygpLCBvcmdhbml6YXRpb25Pd25lcklkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB1c2VyT3duZXJJZCA9IGNVLmlkO1xuICAgIH1cbiAgICAvLyBDaGVjayBuYW1lXG4gICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcInBnX1wiKSB8fCBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5pbmNsdWRlcyhuYW1lKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9CQURfU0NIRU1BX05BTUVcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVTY2hlbWEoXG4gICAgICBuYW1lLFxuICAgICAgbGFiZWwsXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgdXNlck93bmVySWRcbiAgICApO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgaWYgKG9yZ2FuaXphdGlvbk93bmVySWQpIHtcbiAgICAgIC8vIElmIG93bmVyIGlzIGFuIG9yZ2FuaXphdGlvbiBhbmQgY3VycmVudCB1c2VyIGlzIG5vdCBhbiBhZG1pbiBvZiB0aGUgb3JnYW5pemF0aW9uLFxuICAgICAgLy8gYWRkIHRoZSB1c2VyIGFzIGEgc2NoZW1hIGFkbWluIHNvIHRoZXkgZG9udCBsb3NlIGFjY2Vzc1xuICAgICAgaWYgKFxuICAgICAgICBjVS5pc05vdFN5c0FkbWluKCkgJiZcbiAgICAgICAgKGF3YWl0IGNVLmNhbihcImFkbWluaXN0ZXJfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk93bmVySWQpKVxuICAgICAgKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBbY1UuaWRdLFxuICAgICAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgLy8gRXZlcnkgb3JnYW5pemF0aW9uIGFkbWluIGlzIGltcGxpY2l0bHkgYWxzbyBhIHNjaGVtYSBhZG1pblxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKSxcbiAgICAgICAgW3NjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSWYgb3duZXIgaXMgYSB1c2VyLCBhZGQgdGhlbSB0byBzY2hlbWFfdXNlcnMgdG8gc2F2ZSBzZXR0aW5nc1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgICBjVSxcbiAgICAgICAgW2NVLmlkXSxcbiAgICAgICAgXCJzY2hlbWFfb3duZXJcIixcbiAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGByZW1vdmVPckRlbGV0ZVNjaGVtYSgke3NjaGVtYU5hbWV9LCR7ZGVsfSlgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRydWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVRhYmxlKGNVLCBzY2hlbWFOYW1lLCB0YWJsZS5uYW1lLCBkZWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucmVtb3ZlQWxsVXNlcnNGcm9tU2NoZW1hKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlU2NoZW1hKHNjaGVtYU5hbWUsIGRlbCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYVVzZXJzKHNjaGVtYU5hbWUsIHVzZXJJZHMsIHdpdGhTZXR0aW5ncyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0U2NoZW1hVXNlcnNSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW10sXG4gICAgcm9sZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgaWYgKHVzZXJzUmVzdWx0LnBheWxvYWQubGVuZ3RoICE9IHVzZXJFbWFpbHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IHVzZXJFbWFpbHMuZmlsdGVyKFxuICAgICAgICAgICh4OiBzdHJpbmcpID0+ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkLmluY2x1ZGVzKHgpXG4gICAgICAgICksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgcm9sZU5hbWUsXG4gICAgICBcInNjaGVtYVwiLFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVNjaGVtYVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGlmIChcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLnVzZXJfb3duZXJfaWQgJiZcbiAgICAgIHVzZXJJZHMuaW5jbHVkZXMoc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZClcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX1VTRVJfT1dORVJcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkcyxcbiAgICAgIFwic2NoZW1hXCIsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgIGNVLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICk7XG4gICAgaWYgKCFvcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIG9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncyhcbiAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgY1UuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgd2l0aENvbHVtbnM/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAod2l0aENvbHVtbnMpIHtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnNSZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHRhYmxlLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlVGFibGVCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW4sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXNCeVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBbdGFibGVOYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAod2l0aENvbHVtbnMpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHJlc3VsdC5wYXlsb2FkLm5hbWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFjb2x1bW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjb2x1bW5zUmVzdWx0O1xuICAgICAgICByZXN1bHQucGF5bG9hZC5jb2x1bW5zID0gY29sdW1uc1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVUYWJsZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW4sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXNCeVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgICAgIGlmICghY29sdW1uc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gY29sdW1uc1Jlc3VsdDtcbiAgICAgICAgdGFibGUuY29sdW1ucyA9IGNvbHVtbnNSZXN1bHQucGF5bG9hZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGFkZE9yQ3JlYXRlVGFibGUoJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHt0YWJsZUxhYmVsfSwke2NyZWF0ZX0pYFxuICAgICk7XG4gICAgaWYgKCFjcmVhdGUpIGNyZWF0ZSA9IGZhbHNlO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICB0YWJsZUxhYmVsLFxuICAgICAgY3JlYXRlXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoXG4gICAgICBjVSxcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuc2NoZW1hTmFtZSA9IHNjaGVtYU5hbWU7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIC8vIDEuIHJlbW92ZS9kZWxldGUgY29sdW1uc1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgICAgY1UsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIGRlbCxcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgLy8gMy4gcmVtb3ZlIHVzZXIgc2V0dGluZ3NcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVBbGxUYWJsZVVzZXJzKHRhYmxlUmVzdWx0LnBheWxvYWQuaWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgICAgY1UsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyA0LiByZW1vdmUvZGVsZXRlIHRoZSB0YWJsZVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIG5ld1RhYmxlTmFtZT86IHN0cmluZyxcbiAgICBuZXdUYWJsZUxhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlcyhjVSwgc2NoZW1hTmFtZSwgZmFsc2UpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nVGFibGVOYW1lcy5pbmNsdWRlcyhuZXdUYWJsZU5hbWUpKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfVEFCTEVfTkFNRV9FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVMYWJlbFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRBbGxFeGlzdGluZ1RhYmxlcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlclRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHRhYmxlTmFtZXMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IHRhYmxlTmFtZSBvZiB0YWJsZU5hbWVzKSB7XG4gICAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgICAgY1UsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdi50aXRsZUNhc2UodGFibGVOYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiIFwiKSksXG4gICAgICAgIGZhbHNlXG4gICAgICApO1xuICAgICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJDb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgY29sdW1ucyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICAgIHYudGl0bGVDYXNlKGNvbHVtbi5uYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiIFwiKSksXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgcmVtb3ZlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgXCIlXCIsXG4gICAgICBcIiVcIixcbiAgICAgIFwiQUxMXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcmVsYXRpb25zaGlwczogQ29uc3RyYWludElkW10gPSByZXN1bHQucGF5bG9hZDtcbiAgICBpZiAocmVsYXRpb25zaGlwcy5sZW5ndGggPiAwKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlbGF0aW9uc2hpcCBvZiByZWxhdGlvbnNoaXBzKSB7XG4gICAgICAgIGlmIChyZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lICYmIHJlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lKSB7XG4gICAgICAgICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICAgICAgICBpZiAocmVtb3ZlKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgICAgICAgY1UsXG4gICAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC50YWJsZU5hbWUsXG4gICAgICAgICAgICAgIFtyZWxhdGlvbnNoaXAuY29sdW1uTmFtZV0sXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lXVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICAgIFwiYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHM6IENvbnN0cmFpbnRJZCBtdXN0IGhhdmUgcmVsVGFibGVOYW1lIGFuZCByZWxDb2x1bW5OYW1lXCIsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKGNVLCB0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIGRvbnQgYWRkIHBlcm1pc3Npb25zIGZvciB0YWJsZXMgd2l0aCBubyBjb2x1bW5zXG4gICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA9PSAwKSByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCBjb2x1bW5OYW1lczogc3RyaW5nW10gPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICApO1xuICAgIGZvciAoY29uc3QgcGVybWlzc2lvbkNoZWNrQW5kVHlwZSBvZiBSb2xlLmhhc3VyYVRhYmxlUGVybWlzc2lvbkNoZWNrc0FuZFR5cGVzKFxuICAgICAgdGFibGUuaWRcbiAgICApKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlUGVybWlzc2lvbihcbiAgICAgICAgdGFibGUuc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGUubmFtZSxcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrQW5kVHlwZS5wZXJtaXNzaW9uQ2hlY2ssXG4gICAgICAgIHBlcm1pc3Npb25DaGVja0FuZFR5cGUucGVybWlzc2lvblR5cGUsXG4gICAgICAgIFwid2J1c2VyXCIsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgLy8gSWYgdGhpcyB0YWJsZSBubyBsb25nZXIgaGFzIGFueSBjb2x1bW5zLCB0aGVyZSB3aWxsIGJlIG5vIHBlcm1pc3Npb25zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgdGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHBheWxvYWQ6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25LZXlBbmRUeXBlIG9mIFJvbGUudGFibGVQZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5kZWxldGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uS2V5QW5kVHlwZS5hY3Rpb24sXG4gICAgICAgIFwid2J1c2VyXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gUGFzcyBlbXB0eSBjb2x1bW5OYW1lc1tdIHRvIGNsZWFyXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0NvbnN0cmFpbnROYW1lcyA9IE9iamVjdC52YWx1ZXMocmVzdWx0LnBheWxvYWQpO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIG11bHRpcGxlIGNvdWxtbiBwcmltYXJ5IGtleXMgd2lsbCBhbGwgaGF2ZSBzYW1lIGNvbnN0cmFpbnQgbmFtZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGV4aXN0aW5nQ29uc3RyYWludE5hbWVzWzBdIGFzIHN0cmluZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX1BLX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVQcmltYXJ5S2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgb3BlcmF0aW9uOiBzdHJpbmcgPSBcIkNSRUFURVwiO1xuICAgIGlmICghY3JlYXRlKSBvcGVyYXRpb24gPSBcIkFERFwiO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldEZvcmVpZ25LZXkoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgb3BlcmF0aW9uOiBzdHJpbmcgPSBcIkRFTEVURVwiO1xuICAgIGlmICghZGVsKSBvcGVyYXRpb24gPSBcIlJFTU9WRVwiO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldEZvcmVpZ25LZXkoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIFtdLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIG9wZXJhdGlvbiA9IFwiQUREfENSRUFURXxSRU1PVkV8REVMRVRFXCJcbiAgcHVibGljIGFzeW5jIHNldEZvcmVpZ25LZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lc1swXSxcbiAgICAgIFwiRk9SRUlHTl9LRVlTXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgZXhpc3RpbmdGb3JlaWduS2V5czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIGZvciAoY29uc3QgY29uc3RyYWludElkIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICBleGlzdGluZ0ZvcmVpZ25LZXlzW2NvbnN0cmFpbnRJZC5jb2x1bW5OYW1lXSA9XG4gICAgICAgIGNvbnN0cmFpbnRJZC5jb25zdHJhaW50TmFtZTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0ZvcmVpZ25LZXlzKS5pbmNsdWRlcyhjb2x1bW5OYW1lKSkge1xuICAgICAgICBpZiAob3BlcmF0aW9uID09IFwiUkVNT1ZFXCIgfHwgb3BlcmF0aW9uID09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuZHJvcFJlbGF0aW9uc2hpcHMoXG4gICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgICAgcGFyZW50VGFibGVOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgb3BlcmF0aW9uID09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb2x1bW5OYW1lXSBhcyBzdHJpbmdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gZWxzZSBpZiAob3BlcmF0aW9uID09IFwiQ1JFQVRFXCIpIHtcbiAgICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIHdiQ29kZTogXCJXQl9GS19FWElTVFNcIixcbiAgICAgICAgICAgIHZhbHVlczogW2NvbHVtbk5hbWVdLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9wZXJhdGlvbiA9PSBcIkFERFwiIHx8IG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICBpZiAob3BlcmF0aW9uID09IFwiQ1JFQVRFXCIpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlRm9yZWlnbktleShcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgICAgcGFyZW50Q29sdW1uTmFtZXNcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgY29sdW1uTmFtZXNbMF0sIC8vIGF1dGhvcl9pZFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUgLy8gYXV0aG9yc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzIC8vIGF1dGhvcl9pZFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUodGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhjVSwgdGFibGUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKGNVLCB0YWJsZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2Vycz09PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHVzZXJJZHMgPSB1bmRlZmluZWQ7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgICAgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC50YWJsZVVzZXJzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlcklkcywgd2l0aFNldHRpbmdzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGFkZERlZmF1bHRUYWJsZVVzZXJzVG9UYWJsZSgke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgICAgdGFibGUuc2NoZW1hSWQsXG4gICAgICBSb2xlLnN5c1JvbGVNYXAoXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpLFxuICAgICAgW3RhYmxlLmlkXVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBbc3RyaW5nXSxcbiAgICByb2xlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGlmICh1c2Vyc1Jlc3VsdC5wYXlsb2FkLmxlbmd0aCAhPSB1c2VyRW1haWxzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgdmFsdWVzOiB1c2VyRW1haWxzLmZpbHRlcihcbiAgICAgICAgICAoeDogc3RyaW5nKSA9PiAhdXNlcnNSZXN1bHQucGF5bG9hZC5pbmNsdWRlcyh4KVxuICAgICAgICApLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkcyxcbiAgICAgIHJvbGVOYW1lLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZFxuICAgICk7XG4gIH1cblxuICAvLyBub3QgdXNlZCB5ZXRcbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIC8vIFRCRCBkbyBhbnkgY2hlY2tzIGFnYWluc3Qgc2NoZW1hXG4gICAgLy8gY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgLy8gLy8gY2hlY2sgbm90IGFsbCB0aGUgYWRtaW5zIHdpbGwgYmUgcmVtb3ZlZFxuICAgIC8vIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMob3JnYW5pemF0aW9uTmFtZSwgW1xuICAgIC8vICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIC8vIF0pO1xuICAgIC8vIGlmICghYWRtaW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBhZG1pbnNSZXN1bHQ7XG4gICAgLy8gY29uc3QgYWxsQWRtaW5JZHMgPSBhZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgLy8gICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICAvLyApO1xuICAgIC8vIGlmIChhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzLmluY2x1ZGVzKGVsZW0pKSkge1xuICAgIC8vICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgLy8gICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TXCIsXG4gICAgLy8gICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIC8vIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcnNSZXN1bHQucGF5bG9hZCxcbiAgICAgIFwidGFibGVcIixcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgY1UuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucHJpbWFyeUtleXMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHBLQ29sc0NvbnN0cmFpbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcEtDb2x1bW5OYW1lczogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhwS0NvbHNDb25zdHJhaW50cyk7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW4gb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIGNvbHVtbi5pc1ByaW1hcnlLZXkgPSBwS0NvbHVtbk5hbWVzLmluY2x1ZGVzKGNvbHVtbi5uYW1lKTtcbiAgICAgIGNvbnN0IGZvcmVpZ25LZXlzUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIFwiRk9SRUlHTl9LRVlTXCJcbiAgICAgICk7XG4gICAgICBpZiAoIWZvcmVpZ25LZXlzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb2x1bW4uZm9yZWlnbktleXMgPSBmb3JlaWduS2V5c1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgY29uc3QgcmVmZXJlbmNlc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBcIlJFRkVSRU5DRVNcIlxuICAgICAgKTtcbiAgICAgIGlmICghcmVmZXJlbmNlc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29sdW1uLnJlZmVyZW5jZWRCeSA9IHJlZmVyZW5jZXNSZXN1bHQucGF5bG9hZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUNvbHVtbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5MYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW4sXG4gICAgY29sdW1uVHlwZT86IHN0cmluZyxcbiAgICBza2lwVHJhY2tpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhZGRPckNyZWF0ZUNvbHVtbigke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWV9LCR7Y29sdW1uTGFiZWx9LCR7Y3JlYXRlfSwke2NvbHVtblR5cGV9LCR7c2tpcFRyYWNraW5nfSlgXG4gICAgKTtcbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBjb2x1bW5MYWJlbCxcbiAgICAgIGNyZWF0ZSxcbiAgICAgIGNvbHVtblR5cGVcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiAhc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gTXVzdCBlbnRlciBhbmQgZXhpdCB3aXRoIHRyYWNrZWQgdGFibGUsIHJlZ2FyZGxlc3Mgb2YgaWYgdGhlcmUgYXJlIGNvbHVtbnNcbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW4sXG4gICAgc2tpcFRyYWNraW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlT3JEZWxldGVDb2x1bW4oJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke2RlbH0pYFxuICAgICk7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmICghc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgZGVsXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIFRCRDogaWYgdGhpcyBpcyBhIGZrXG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdDb2x1bW5OYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nQ29sdW1uTmFtZXMuaW5jbHVkZXMobmV3Q29sdW1uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9DT0xVTU5fTkFNRV9FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdUeXBlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgIG5ld1R5cGVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuLyoqXG4gKiA9PT09PT09PT09IEVycm9yIEhhbmRsaW5nID09PT09PT09PT1cbiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gZXJyUmVzdWx0KHJlc3VsdD86IFNlcnZpY2VSZXN1bHQpOiBTZXJ2aWNlUmVzdWx0IHtcbiAgaWYgKCFyZXN1bHQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBcIlJlc3VsdCBoYXMgbm90IGJlZW4gYXNzaWduZWRcIixcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cbiAgaWYgKHJlc3VsdC5zdWNjZXNzID09IHRydWUpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiV2hpdGVicmlja0Nsb3VkIGVyclJlc3VsdDogcmVzdWx0IGlzIG5vdCBhbiBlcnJvciAoc3VjY2Vzcz09dHJ1ZSlcIixcbiAgICB9O1xuICB9IGVsc2UgaWYgKCEoXCJzdWNjZXNzXCIgaW4gcmVzdWx0KSkge1xuICAgIHJlc3VsdC5zdWNjZXNzID0gZmFsc2U7XG4gIH1cbiAgaWYgKCFyZXN1bHQubWVzc2FnZSAmJiByZXN1bHQud2JDb2RlKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSB1c2VyTWVzc2FnZXNbcmVzdWx0LndiQ29kZV1bMF07XG4gICAgaWYgKCFyZXN1bHQubWVzc2FnZSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYFdoaXRlYnJpY2tDbG91ZCBlcnJSZXN1bHQ6IENvdWxkIG5vdCBmaW5kIG1lc3NhZ2UgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICAgIH07XG4gICAgfVxuICB9XG4gIGlmIChyZXN1bHQudmFsdWVzKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSBgJHtyZXN1bHQubWVzc2FnZX0gVmFsdWVzOiAke3Jlc3VsdC52YWx1ZXMuam9pbihcIiwgXCIpfWA7XG4gICAgZGVsZXRlIHJlc3VsdC52YWx1ZXM7XG4gIH1cbiAgaWYgKFxuICAgICFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlICYmXG4gICAgcmVzdWx0LndiQ29kZSAmJlxuICAgIE9iamVjdC5rZXlzKHVzZXJNZXNzYWdlcykuaW5jbHVkZXMocmVzdWx0LndiQ29kZSkgJiZcbiAgICB1c2VyTWVzc2FnZXNbcmVzdWx0LndiQ29kZV0ubGVuZ3RoID09IDJcbiAgKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IHVzZXJNZXNzYWdlc1tyZXN1bHQud2JDb2RlXVsxXTtcbiAgfSBlbHNlIGlmIChcbiAgICAhcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSAmJlxuICAgIHJlc3VsdC53YkNvZGUgJiZcbiAgICAhT2JqZWN0LmtleXModXNlck1lc3NhZ2VzKS5pbmNsdWRlcyhyZXN1bHQud2JDb2RlKVxuICApIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IGBXaGl0ZWJyaWNrQ2xvdWQgZXJyOiBDb3VsZCBub3QgZmluZCBhcG9sbG9FcnJvckNvZGUgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKCFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCI7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwb2xsb0VycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gIHJlc3VsdCA9IGVyclJlc3VsdChyZXN1bHQpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKFxuICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQuZXJyOiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiXG4gICAgKTtcbiAgfVxuICBjb25zdCBkZXRhaWxzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGlmICghcmVzdWx0Lm1lc3NhZ2UpIHJlc3VsdC5tZXNzYWdlID0gXCJVbmtub3duIGVycm9yLlwiO1xuICBpZiAocmVzdWx0LnJlZkNvZGUpIGRldGFpbHMucmVmQ29kZSA9IHJlc3VsdC5yZWZDb2RlO1xuICBpZiAocmVzdWx0LndiQ29kZSkgZGV0YWlscy53YkNvZGUgPSByZXN1bHQud2JDb2RlO1xuICByZXR1cm4gbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCByZXN1bHQuYXBvbGxvRXJyb3JDb2RlLCBkZXRhaWxzKTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10b29sc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10eXBlLWpzb25cIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImxvZGFzaFwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ2b2NhXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2hpdGVicmljay1jbG91ZC50c1wiKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBZUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7O0FBRUE7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7O0FBR0E7QUFDQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBOzs7Ozs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQVFBOzs7Ozs7Ozs7Ozs7QUFZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQU9BOzs7Ozs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7QUFlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTs7Ozs7Ozs7Ozs7OztBQWFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBOzs7Ozs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQThCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7O0FBVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFNQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FBUUE7Ozs7Ozs7Ozs7Ozs7OztBQWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBSUE7O0FBT0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FBTUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7Ozs7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBSUE7O0FBT0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FBTUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7Ozs7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBOzs7Ozs7Ozs7O0FBVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUF4OURBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ2pCQTtBQXNCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUExQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2JBO0FBRUE7QUFFQTtBQUVBO0FBZ0JBO0FBWkE7QUFHQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFLQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFFQTtBQVFBO0FBQ0E7QUFJQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFJQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFuVEE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDUEE7QUFFQTtBQVVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFwQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDSkE7QUFFQTtBQWVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdkRBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0pBO0FBdUJBO0FBNEVBO0FBQ0E7QUFDQTtBQUtBO0FBMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTJCQTtBQUtBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFBQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUE3TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDMUZBO0FBRUE7QUFxQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDVkE7QUFFQTtBQWVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWhEQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNKQTtBQUVBO0FBYUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXpDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNKQTtBQUVBO0FBZ0JBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFsREE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFXQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDakZBO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBV0E7QUF5UkE7QUF2UkE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTs7QUFsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBNlJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3RUQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbkVBO0FBQ0E7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUE0QkE7Ozs7Ozs7Ozs7QUFVQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNsR0E7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBc0VBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDL01BO0FBQ0E7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFpRUE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2S0E7QUFDQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXFLQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbmNBO0FBQ0E7QUFRQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDckdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFTQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQTIxREE7QUF6MURBO0FBQ0E7QUFDQTtBQUdBOztBQUlBO0FBTUE7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUVBO0FBSUE7QUFBQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQUVBO0FBS0E7QUFBQTtBQUNBO0FBRUE7QUFNQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFNQTtBQUFBO0FBR0E7QUFNQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBT0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFTQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFNQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUFBO0FBTUE7O0FBTUE7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBTUE7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBTUE7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUlBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBTUE7QUFBQTtBQUdBOztBQU9BO0FBR0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFHQTtBQUVBO0FBRUE7QUFPQTtBQUFBO0FBQ0E7QUFFQTtBQUtBO0FBQUE7QUFFQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFJQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFTQTtBQUNBO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFHQTs7QUFTQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUtBO0FBQUE7QUFFQTs7QUFPQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUdBOztBQU1BO0FBQ0E7QUFBQTtBQWdCQTtBQUtBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBS0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBVUE7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFRQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVVBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQTUxREE7QUFrMkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWpEQTtBQW1EQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBWkE7QUFDQTtBQUNBO0E7Ozs7Ozs7O0FDMzdEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QSIsInNvdXJjZVJvb3QiOiIifQ==