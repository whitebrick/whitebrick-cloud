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
        wb.roles.name as user_role,
        implied_roles.name as user_role_implied_from
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
        wb.roles.name as role,
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
        wb.roles.name as user_role,
        implied_roles.name as user_role_implied_from,
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
        wb.roles.name as role,
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
        wb.roles.name as user_role,
        implied_roles.name as user_role_implied_from
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
        wb.roles.name as role,
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
            message = `You do not have permission to ${lastUAP.deniedMessage}.`;
            let userStr = `userId=${this.id}`;
            if (this.user && this.user.email) {
                userStr = `userEmail=${this.user.email}, ${userStr}`;
            }
            values = [
                userStr,
                `objectId=${lastUAP.objectId}`,
                `userAction=${lastUAP.userAction}`,
                `checkedForRole=${lastUAP.checkedForRole}`,
                `checkedAt=${lastUAP.checkedAt}`,
            ];
        }
        return whitebrick_cloud_1.errResult({
            success: false,
            message: message,
            values: values,
            apolloErrorCode: "FORBIDDEN",
        });
    }
    mustBeSignedIn() {
        return whitebrick_cloud_1.errResult({
            success: false,
            message: "You must be signed-in to perform this action.",
            apolloErrorCode: "FORBIDDEN",
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
                checkedForRole: this.objectPermissionsLookup[roleLevel][key][userAction]
                    .checkedForRole,
                permitted: this.objectPermissionsLookup[roleLevel][key][userAction].permitted,
                deniedMessage: this.objectPermissionsLookup[roleLevel][key][userAction]
                    .deniedMessage,
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
                checkedForRole: uAP.checkedForRole,
                deniedMessage: uAP.deniedMessage,
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
            const policy = CurrentUser.getUserActionPolicy(policy_1.DEFAULT_POLICY, userAction);
            whitebrick_cloud_1.log.debug(`currentUser.can(${userAction},${objectIdOrName}) policy:${JSON.stringify(policy)}`);
            if (!policy) {
                const message = `No policy found for userAction=${userAction}`;
                whitebrick_cloud_1.log.error(message);
                throw message;
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
                throw message;
            }
            if (!roleResult.payload.objectId) {
                const message = `ObjectId could not be found`;
                whitebrick_cloud_1.log.error(message);
                throw message;
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
                deniedMessage: policy.deniedMessage,
            };
            if (roleResult.payload.roleName) {
                uAP.checkedForRole = roleResult.payload.roleName;
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
        if (data.user_role_implied_from) {
            organization.userRoleImpliedFrom = data.user_role_implied_from;
        }
        if (data.settings)
            organization.settings = data.settings;
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
        if (data.user_first_name)
            organizationUser.userFirstName = data.user_first_name;
        if (data.user_last_name)
            organizationUser.userLastName = data.user_last_name;
        if (data.role)
            organizationUser.role = data.role;
        if (data.role_implied_from) {
            organizationUser.roleImpliedFrom = data.role_implied_from;
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
        if (data.settings)
            schema.settings = data.settings;
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
        if (data.user_first_name)
            schemaUser.userFirstName = data.user_first_name;
        if (data.user_last_name)
            schemaUser.userLastName = data.user_last_name;
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
        if (data.user_role)
            table.userRole = data.user_role;
        if (data.user_role_implied_from) {
            table.userRoleImpliedFrom = data.user_role_implied_from;
        }
        if (data.settings)
            table.settings = data.settings;
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
        if (data.user_first_name)
            tableUser.userFirstName = data.user_first_name;
        if (data.user_last_name)
            tableUser.userLastName = data.user_last_name;
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

/***/ "./src/policy.ts":
/*!***********************!*\
  !*** ./src/policy.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DEFAULT_POLICY = void 0;
exports.DEFAULT_POLICY = [
    {
        userAction: "access_organization",
        roleLevel: "organization",
        deniedMessage: "access this organization",
        permittedRoles: [
            "organization_external_user",
            "organization_user",
            "organization_administrator",
        ],
    },
    {
        userAction: "administer_organization",
        roleLevel: "organization",
        deniedMessage: "administer this organization",
        permittedRoles: ["organization_administrator"],
    },
    {
        userAction: "edit_organization",
        roleLevel: "organization",
        deniedMessage: "edit this Organization.",
        permittedRoles: ["organization_administrator"],
    },
    {
        userAction: "manage_access_to_organization",
        roleLevel: "organization",
        deniedMessage: "manage access to this Organization.",
        permittedRoles: ["organization_administrator"],
    },
    {
        userAction: "alter_schema",
        roleLevel: "schema",
        deniedMessage: "alter this Database.",
        permittedRoles: ["schema_manager", "schema_administrator"],
    },
    {
        userAction: "manage_access_to_schema",
        roleLevel: "schema",
        deniedMessage: "manage access to this Database.",
        permittedRoles: ["schema_manager", "schema_administrator"],
    },
    {
        userAction: "alter_table",
        roleLevel: "table",
        deniedMessage: "alter this Table.",
        permittedRoles: ["table_manager", "table_administrator"],
    },
    {
        userAction: "manage_access_to_table",
        roleLevel: "table",
        deniedMessage: "manage access to this Table.",
        permittedRoles: ["table_manager", "table_administrator"],
    },
];


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
    userRole: String
    userRoleImpliedFrom: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  type OrganizationUser {
    organizationId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    organizationName: String!
    userEmail: String!
    userFirstName: String
    userLastName: String
    role: String!
    roleImpliedFrom: String
    settings: JSON
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
      role: String!
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
        wbSetOrganizationUsersRole: (_, { organizationName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.setOrganizationUsersRole(currentUser, organizationName, role, undefined, userEmails);
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
    userRole: String
    userRoleImpliedFrom: String
    settings: JSON
    organizationOwnerName: String
    userOwnerEmail: String
    createdAt: String!
    updatedAt: String!
  }

  type SchemaUser {
    schemaId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    schemaName: String
    userEmail: String!
    userFirstName: String
    userLastName: String
    role: String!
    roleImpliedFrom: String
    settings: JSON
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
      role: String!
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
        wbSetSchemaUsersRole: (_, { schemaName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.setSchemaUsersRole(currentUser, schemaName, userEmails, role);
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
    userRole: String
    userRoleImpliedFrom: String
    settings: JSON
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
    roleId: Int!
    impliedFromRoleId: Int
    schemaName: String!
    tableName: String!
    userEmail: String!
    userFirstName: String
    userLastName: String
    role: String!
    roleImpliedFrom: String
    settings: JSON
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
      role: String!
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
        wbSetTableUsersRole: (_, { schemaName, tableName, userEmails, role }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.setTableUsersRole(currentUser, schemaName, tableName, userEmails, role);
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
                organizations: entity_1.Role.SYSROLES_ORGANIZATIONS,
                schemas: entity_1.Role.SYSROLES_SCHEMAS,
                tables: entity_1.Role.SYSROLES_TABLES,
            },
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
                            result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(object.id, entity_1.Role.ORGANIZATION_TO_SCHEMA_ROLE_MAP, undefined, userIds);
                            if (!result.success)
                                return result;
                            result = yield this.schemasByOrganizationOwner(cU, object.id);
                            if (!result.success)
                                return result;
                            for (const schema of result.payload) {
                                result = yield this.dal.setTableUserRolesFromSchemaRoles(schema.id, entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP, undefined, userIds);
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
                    result = yield this.dal.setTableUserRolesFromSchemaRoles(object.id, entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP, undefined, userIds);
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
                    result = yield this.dal.deleteRole(userIds, "table", undefined, objectId, Object.keys(entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP));
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
            if (yield cU.cant("administer_organization", name))
                return cU.denied();
            return this.dal.updateOrganization(name, newName, newLabel);
        });
    }
    deleteOrganization(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
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
    setOrganizationUsersRole(cU, organizationName, role, userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            if (yield cU.cant("administer_organization", organizationName)) {
                return cU.denied();
            }
            exports.log.debug(`setOrganizationUsersRole(${organizationName},${role},${userIds},${userEmails})`);
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
            return yield this.setRole(cU, userIdsFound, role, "organization", organizationResult.payload);
        });
    }
    removeUsersFromOrganization(cU, organizationName, userIds, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const allAdminIds = result.payload.map((user) => user.id);
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
                result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(organizationOwnerId, entity_1.Role.ORGANIZATION_TO_SCHEMA_ROLE_MAP, [schemaResult.payload.id]);
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
    setSchemaUsersRole(cU, schemaName, userEmails, role) {
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
            return yield this.setRole(cU, userIds, role, "schema", schemaResult.payload);
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
            for (const permissionKeyAndType of entity_1.Role.tablePermissionKeysAndTypes(table.id)) {
                result = yield hasura_api_1.hasuraApi.deletePermission(table.schemaName, table.name, permissionKeyAndType.type, "wbuser");
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
            return yield this.dal.setTableUserRolesFromSchemaRoles(table.schemaId, entity_1.Role.SCHEMA_TO_TABLE_ROLE_MAP, [table.id]);
        });
    }
    setTableUsersRole(cU, schemaName, tableName, userEmails, role) {
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
            return yield this.setRole(cU, userIds, role, "table", tableResult.payload);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ3VycmVudFVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvblVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3BvbGljeS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvb3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvc2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy91c2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvd2hpdGVicmljay1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2csIGVyclJlc3VsdCB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgVXNlcixcbiAgT3JnYW5pemF0aW9uLFxuICBPcmdhbml6YXRpb25Vc2VyLFxuICBTY2hlbWEsXG4gIFNjaGVtYVVzZXIsXG4gIFRhYmxlLFxuICBUYWJsZVVzZXIsXG4gIENvbHVtbixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGZpcnN0IH0gZnJvbSBcInZvY2FcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IERCID09PT09PT09PVxuICAgKi9cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBgICAgIFsgJHtxdWVyeVBhcmFtcy5wYXJhbXMgPyBxdWVyeVBhcmFtcy5wYXJhbXMuam9pbihcIiwgXCIpIDogXCJcIn0gXWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XG4gICAgICBsb2cuZXJyb3IoSlNPTi5zdHJpbmdpZnkoZXJyb3IpKTtcbiAgICAgIHJlc3VsdHMucHVzaChcbiAgICAgICAgZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgIHJlZkNvZGU6IFwiUEdfXCIgKyBlcnJvci5jb2RlLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpXG4gICAgICApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8vIHVzZWQgZm9yIERETCBpZGVudGlmaWVycyAoZWcgQ1JFQVRFIFRBQkxFIHNhbml0aXplKHRhYmxlTmFtZSkpXG4gIHB1YmxpYyBzdGF0aWMgc2FuaXRpemUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvW15cXHclXSsvZywgXCJcIik7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVzSWRMb29rdXAoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgbmFtZUlkTG9va3VwOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLmlkLCB3Yi5yb2xlcy5uYW1lXG4gICAgICAgIEZST00gd2Iucm9sZXNcbiAgICAgICAgV0hFUkUgY3VzdG9tIElTIGZhbHNlXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgbmFtZUlkTG9va3VwW3Jvdy5uYW1lXSA9IHJvdy5pZDtcbiAgICB9XG4gICAgcmVzdWx0LnBheWxvYWQgPSBuYW1lSWRMb29rdXA7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlSWRzRnJvbU5hbWVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWRcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgICAgQU5EIG5hbWU9QU5ZKCQxKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3JvbGVOYW1lc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKChyb3c6IHsgaWQ6IG51bWJlciB9KSA9PiByb3cuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJST0xFX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFR5cGljYWxseSBzZXR0aW5nIGEgcm9sZSBkaXJlY3RseSBpcyBleHBsaWNpdCxcbiAgLy8gc28gYW55IGltcGxpZWRfZnJvbV9yb2xlX2lkIGlzIGNsZWFyZWQgdW5sZXNzIGtlZXBJbXBsaWVkRnJvbVxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXIsXG4gICAga2VlcEltcGxpZWRGcm9tPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnNldFJvbGUoJHt1c2VySWRzfSwke3JvbGVOYW1lfSwke3JvbGVMZXZlbH0sJHtvYmplY3RJZH0sJHtrZWVwSW1wbGllZEZyb219KWBcbiAgICApO1xuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUocm9sZU5hbWUpO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBsZXQgd2JUYWJsZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgd2JDb2x1bW46IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vyc1wiO1xuICAgICAgICB3YkNvbHVtbiA9IFwib3JnYW5pemF0aW9uX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iuc2NoZW1hX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJzY2hlbWFfaWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnRhYmxlX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJ0YWJsZV9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgcGFyYW1zOiBEYXRlW10gPSBbXTtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBsZXQgcXVlcnk6IHN0cmluZyA9IGBcbiAgICAgIElOU0VSVCBJTlRPICR7d2JUYWJsZX0gKHJvbGVfaWQsICB1c2VyX2lkLCAke3diQ29sdW1ufSwgdXBkYXRlZF9hdClcbiAgICAgIFZBTFVFU1xuICAgIGA7XG4gICAgZm9yIChjb25zdCB1c2VySWQgb2YgdXNlcklkcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICAoXG4gICAgICAgICAgJHtyb2xlUmVzdWx0LnBheWxvYWQuaWR9LFxuICAgICAgICAgICR7dXNlcklkfSxcbiAgICAgICAgICAke29iamVjdElkfSxcbiAgICAgICAgICAkJHtwYXJhbXMubGVuZ3RoICsgMX1cbiAgICAgICAgKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGRhdGUpO1xuICAgICAgaWYgKHBhcmFtcy5sZW5ndGggIT0gdXNlcklkcy5sZW5ndGgpIHF1ZXJ5ICs9IFwiLCBcIjtcbiAgICB9XG4gICAgcXVlcnkgKz0gYFxuICAgICAgT04gQ09ORkxJQ1QgKHVzZXJfaWQsICR7d2JDb2x1bW59KVxuICAgICAgRE8gVVBEQVRFIFNFVFxuICAgICAgcm9sZV9pZD1FWENMVURFRC5yb2xlX2lkLFxuICAgICAgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgYDtcbiAgICBpZiAoIWtlZXBJbXBsaWVkRnJvbSkgcXVlcnkgKz0gXCIsIGltcGxpZWRfZnJvbV9yb2xlX2lkPU5VTExcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUm9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZD86IG51bWJlcixcbiAgICBwYXJlbnRPYmplY3RJZD86IG51bWJlcixcbiAgICBpbXBsaWVkRnJvbVJvbGVzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgbnVtYmVyW10gfCB1bmRlZmluZWQpW10gPSBbdXNlcklkc107XG4gICAgbGV0IHdiVGFibGU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHdiV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vyc1wiO1xuICAgICAgICB3YldoZXJlID0gXCJBTkQgb3JnYW5pemF0aW9uX2lkPSQyXCI7XG4gICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5zY2hlbWFfdXNlcnNcIjtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IFwiQU5EIHNjaGVtYV9pZD0kMlwiO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgfSBlbHNlIGlmIChwYXJlbnRPYmplY3RJZCkge1xuICAgICAgICAgIHdiV2hlcmUgPSBgXG4gICAgICAgICAgICBBTkQgc2NoZW1hX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25fb3duZXJfaWQ9JDJcbiAgICAgICAgICAgIClcbiAgICAgICAgICBgO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKHBhcmVudE9iamVjdElkKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2IudGFibGVfdXNlcnNcIjtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IFwiQU5EIHRhYmxlX2lkPSQyXCI7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IGBcbiAgICAgICAgICAgIEFORCB0YWJsZV9pZCBJTiAoXG4gICAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgICAgICBXSEVSRSBzY2hlbWFfaWQ9JDJcbiAgICAgICAgICAgIClcbiAgICAgICAgICBgO1xuICAgICAgICAgIHBhcmFtcy5wdXNoKHBhcmVudE9iamVjdElkKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChpbXBsaWVkRnJvbVJvbGVzKSB7XG4gICAgICB3YldoZXJlICs9IGBBTkQgaW1wbGllZF9mcm9tX3JvbGVfaWQ9QU5ZKCQzKWA7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVJZHNGcm9tTmFtZXMoaW1wbGllZEZyb21Sb2xlcyk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSAke3diVGFibGV9XG4gICAgICAgIFdIRVJFIHVzZXJfaWQ9QU5ZKCQxKVxuICAgICAgICAke3diV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgIHRhYmxlSWQ6IG51bWJlcixcbiAgICBkZWxldGVPbmx5PzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlc0lkTG9va3VwKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCByb2xlc0lkTG9va3VwID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcXVlcnlQYXJhbXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVfcGVybWlzc2lvbnNcbiAgICAgICAgICBXSEVSRSB0YWJsZV9pZD0kMVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFt0YWJsZUlkXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoIWRlbGV0ZU9ubHkpIHtcbiAgICAgIGZvciAoY29uc3QgdGFibGVSb2xlIG9mIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25QcmVmaXggb2YgUm9sZS5TWVNST0xFU19UQUJMRVNbdGFibGVSb2xlXVxuICAgICAgICAgIC5wZXJtaXNzaW9uUHJlZml4ZXMpIHtcbiAgICAgICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlX3Blcm1pc3Npb25zKHRhYmxlX3Blcm1pc3Npb25fa2V5LCB1c2VyX2lkLCB0YWJsZV9pZClcbiAgICAgICAgICAgICAgU0VMRUNUICcke1JvbGUudGFibGVQZXJtaXNzaW9uS2V5KFxuICAgICAgICAgICAgICAgIHBlcm1pc3Npb25QcmVmaXgsXG4gICAgICAgICAgICAgICAgdGFibGVJZFxuICAgICAgICAgICAgICApfScsIHVzZXJfaWQsICR7dGFibGVJZH1cbiAgICAgICAgICAgICAgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgICAgICAgV0hFUkUgd2IudGFibGVfdXNlcnMudGFibGVfaWQ9JDEgQU5EIHdiLnJvbGVzLm5hbWU9JDJcbiAgICAgICAgICAgIGAsXG4gICAgICAgICAgICBwYXJhbXM6IFt0YWJsZUlkLCB0YWJsZVJvbGVdLFxuICAgICAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKHF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVBbmRJZEZvclVzZXJPYmplY3QoXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBvYmplY3RJZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBxdWVyeU9iaklkOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxKb2luOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodHlwZW9mIG9iamVjdElkT3JOYW1lID09PSBcIm51bWJlclwiKSBvYmplY3RJZCA9IG9iamVjdElkT3JOYW1lO1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFt1c2VySWRdO1xuICAgIGNvbnN0IHBhcmFtc09iaklkOiBzdHJpbmdbXSA9IFtdO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWRcbiAgICAgICAgYDtcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDJcbiAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgICBgO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDJcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPVxuICAgICAgICAgICAgXCJTRUxFQ1QgaWQgYXMgb2JqZWN0X2lkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIjtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgc3FsSm9pbiA9IGBcbiAgICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnJvbGVzLmlkPXdiLnNjaGVtYV91c2Vycy5yb2xlX2lkXG4gICAgICAgIGA7XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9JDFcbiAgICAgICAgYDtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZE9yTmFtZSk7XG4gICAgICAgICAgc3FsSm9pbiArPSBgXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgYDtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgICBxdWVyeU9iaklkID1cbiAgICAgICAgICAgIFwiU0VMRUNUIGlkIGFzIG9iamVjdF9pZCBGUk9NIHdiLnNjaGVtYXMgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXCI7XG4gICAgICAgICAgcGFyYW1zT2JqSWQucHVzaChvYmplY3RJZE9yTmFtZS50b1N0cmluZygpKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgc3FsSm9pbiA9IGBcbiAgICAgICAgIEpPSU4gd2IudGFibGVfdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2IudGFibGVfdXNlcnMucm9sZV9pXG4gICAgICAgIGA7XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgV0hFUkUgd2IudGFibGVfdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoIXBhcmVudE9iamVjdE5hbWUpIHtcbiAgICAgICAgICAgIHRocm93IGBkYWwucm9sZU5hbWVGb3JVc2VyT2JqZWN0IHBhcmVudE9iamVjdE5hbWUgcmVxdWlyZWQgZm9yIHRhYmxlIGxldmVsYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWRPck5hbWUsIHBhcmVudE9iamVjdE5hbWUpO1xuICAgICAgICAgIHNxbEpvaW4gKz0gYFxuICAgICAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IudGFibGVfdXNlcnMudGFibGVfaWQ9d2IudGFibGVzLmlkXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgYDtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2IudGFibGVzLm5hbWU9JDJcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFzLm5hbWU9JDNcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPSBgXG4gICAgICAgICAgICBTRUxFQ1QgaWQgYXMgb2JqZWN0X2lkXG4gICAgICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICAgICAgV0hFUkUgd2IudGFibGVzLm5hbWU9JDEgQU5EIHdiLnNjaGVtYXMubmFtZT0kMlxuICAgICAgICAgICAgTElNSVQgMVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zT2JqSWQucHVzaChvYmplY3RJZE9yTmFtZS50b1N0cmluZygpLCBwYXJlbnRPYmplY3ROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgcXVlcmllczogUXVlcnlQYXJhbXNbXSA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lXG4gICAgICAgIEZST00gd2Iucm9sZXNcbiAgICAgICAgJHtzcWxKb2lufVxuICAgICAgICAke3NxbFdoZXJlfSAgXG4gICAgICAgIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmICghb2JqZWN0SWQpIHtcbiAgICAgIHF1ZXJpZXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeU9iaklkLFxuICAgICAgICBwYXJhbXM6IHBhcmFtc09iaklkLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKHF1ZXJpZXMpO1xuICAgIGlmICghcmVzdWx0c1swXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1swXTtcbiAgICBpZiAoIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgY29uc3QgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgcm9sZU5hbWU6IG51bGwsXG4gICAgICAgIG9iamVjdElkOiBudWxsLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGlmIChyZXN1bHRzWzBdLnBheWxvYWQucm93cy5sZW5ndGggPT0gMSkge1xuICAgICAgcmVzdWx0LnBheWxvYWQucm9sZU5hbWUgPSByZXN1bHRzWzBdLnBheWxvYWQucm93c1swXS5yb2xlX25hbWU7XG4gICAgfVxuICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgcmVzdWx0LnBheWxvYWQub2JqZWN0SWQgPSBvYmplY3RJZDtcbiAgICB9IGVsc2UgaWYgKHJlc3VsdHNbMV0ucGF5bG9hZC5yb3dzLmxlbmd0aCA9PSAxKSB7XG4gICAgICByZXN1bHQucGF5bG9hZC5vYmplY3RJZCA9IHJlc3VsdHNbMV0ucGF5bG9hZC5yb3dzWzBdLm9iamVjdF9pZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFVzZXJzID09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcklkRnJvbUF1dGhJZChhdXRoSWQ6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy5pZFxuICAgICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGF1dGhfaWQ9JDFcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2F1dGhJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpZiAocmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFthdXRoSWRdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93c1swXS5pZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VycyhcbiAgICBpZHM/OiBudW1iZXJbXSxcbiAgICBlbWFpbHM/OiBzdHJpbmdbXSxcbiAgICBzZWFyY2hQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgcGFyYW1zOiAobnVtYmVyW10gfCBzdHJpbmdbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGlmIChpZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgaWQ9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2goaWRzKTtcbiAgICB9IGVsc2UgaWYgKGVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCBlbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbHMpO1xuICAgIH0gZWxzZSBpZiAoc2VhcmNoUGF0dGVybikge1xuICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgIEFORCBlbWFpbCBMSUtFICQxXG4gICAgICAgIE9SIGZpcnN0X25hbWUgTElLRSAkMVxuICAgICAgICBPUiBsYXN0X25hbWUgTElLRSAkMVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKHNlYXJjaFBhdHRlcm4ucmVwbGFjZSgvXFwqL2csIFwiJVwiKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICBTRUxFQ1Qgd2IudXNlcnMuKlxuICAgICAgRlJPTSB3Yi51c2Vyc1xuICAgICAgV0hFUkUgaWQgTk9UIElOICgke1VzZXIuU1lTX0FETUlOX0lEfSlcbiAgICAgICR7c3FsV2hlcmV9XG4gICAgICBPUkRFUiBCWSBlbWFpbFxuICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMpIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbD86IHN0cmluZyxcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmcsXG4gICAgbGFzdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFlbWFpbCAmJiAhZmlyc3ROYW1lICYmICFsYXN0TmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IFwiZGFsLnVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IG51bWJlciB8IHN0cmluZylbXSA9IFtkYXRlLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCkge1xuICAgICAgcXVlcnkgKz0gYGVtYWlsPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWwpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBpZiAoZmlyc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgZmlyc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGZpcnN0TmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChsYXN0TmFtZSkge1xuICAgICAgcXVlcnkgKz0gYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGxhc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgcXVlcnkgKz0gXCJ1cGRhdGVkX2F0PSQxIFdIRVJFIGlkPSQyIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGVtYWlsIGxpa2UgJ3Rlc3RfJXRlc3Qud2hpdGVicmljay5jb20nXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIG9yZ2FuaXphdGlvbklkcz86IG51bWJlcltdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKlxuICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgYDtcbiAgICBpZiAob3JnYW5pemF0aW9uSWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMuaWQ9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkcyk7XG4gICAgfSBlbHNlIGlmIChvcmdhbml6YXRpb25OYW1lcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIHVzZXJSb2xlIGFuZCB1c2VyUm9sZUltcGxpZWRGcm9tIG9ubHkgcmV0dXJuZWQgaWYgdXNlcklkcy9FbWFpbHMubGVuZ3RoPT0xXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdKVtdID0gW107XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5pZD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgaWYgKG9yZ2FuaXphdGlvbk5hbWVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIkFORCB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZXMpO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgKz0gXCIsIHdiLnNjaGVtYV91c2Vycy5zZXR0aW5ncyBhcyBzZXR0aW5nc1wiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy4qLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHVzZXJfcm9sZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHVzZXJfcm9sZV9pbXBsaWVkX2Zyb21cbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5vcmdhbml6YXRpb25zLmlkPXdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLm9yZ2FuaXphdGlvbnMoXG4gICAgICAgICAgbmFtZSwgbGFiZWxcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyKVxuICAgICAgICBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWUsIGxhYmVsXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld05hbWU/OiBzdHJpbmcsXG4gICAgbmV3TGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IHN0cmluZylbXSA9IFtuZXcgRGF0ZSgpXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi5vcmdhbml6YXRpb25zIFNFVCB1cGRhdGVkX2F0PSQxXCI7XG4gICAgaWYgKG5ld05hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld05hbWUpO1xuICAgICAgcXVlcnkgKz0gYCwgbmFtZT0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmIChuZXdMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TGFiZWwpO1xuICAgICAgcXVlcnkgKz0gYCwgbGFiZWw9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChuYW1lKTtcbiAgICBxdWVyeSArPSBgIFdIRVJFIG5hbWU9JCR7cGFyYW1zLmxlbmd0aH0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvLyBubyBwYXR0ZXJucyBhbGxvd2VkIGhlcmVcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKG5hbWUucmVwbGFjZSgvXFwlL2csIFwiXCIpKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kZWxldGVPcmdhbml6YXRpb25zKFwidGVzdF8lXCIpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbnMoXG4gICAgbmFtZVBhdHRlcm46IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgICAgV0hFUkUgb3JnYW5pemF0aW9uX2lkIElOIChcbiAgICAgICAgICAgIFNFTEVDVCBpZCBGUk9NIHdiLm9yZ2FuaXphdGlvbnMgV0hFUkUgbmFtZSBsaWtlICQxXG4gICAgICAgICAgKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLm9yZ2FuaXphdGlvbnMgV0hFUkUgbmFtZSBsaWtlICQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXSk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IE9yZ2FuaXphdGlvbiBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25Vc2VycyhcbiAgICBuYW1lPzogc3RyaW5nLFxuICAgIGlkPzogbnVtYmVyLFxuICAgIHJvbGVzPzogc3RyaW5nW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgc3RyaW5nW10gfCBudW1iZXJbXSlbXSA9IFtdO1xuICAgIGlmIChpZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkKTtcbiAgICB9IGVsc2UgaWYgKG5hbWUpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG5hbWUpO1xuICAgIH1cbiAgICBpZiAocm9sZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiIEFORCB3Yi5yb2xlcy5uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHJvbGVzKTtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlICs9IGAgQU5EIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPUFOWSgkJHtcbiAgICAgICAgcGFyYW1zLmxlbmd0aCArIDFcbiAgICAgIH0pYDtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vycy5zZXR0aW5ncyxcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMuY3JlYXRlZF9hdCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVwZGF0ZWRfYXQsXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICB3Yi5vcmdhbml6YXRpb25zLm5hbWUgYXMgb3JnYW5pemF0aW9uX25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfZW1haWwsXG4gICAgICAgIHdiLnVzZXJzLmZpcnN0X25hbWUgYXMgdXNlcl9maXJzdF9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5sYXN0X25hbWUgYXMgdXNlcl9sYXN0X25hbWUsXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb25Vc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgb3JnYW5pemF0aW9uSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIG9yZ2FuaXphdGlvbl9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBvcmdhbml6YXRpb25JZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gU2NoZW1hcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzKFxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHNjaGVtYU5hbWVzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGdQYXJhbXM6IChzdHJpbmdbXSB8IG51bWJlcltdIHwgc3RyaW5nKVtdID0gW1xuICAgICAgU2NoZW1hLlNZU19TQ0hFTUFfTkFNRVMsXG4gICAgXTtcbiAgICBjb25zdCB3YlBhcmFtczogKHN0cmluZ1tdIHwgbnVtYmVyW10gfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsUGdXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2JXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAoc2NoZW1hSWRzKSB7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBpZD1BTlkoJDEpXCI7XG4gICAgICB3YlBhcmFtcy5wdXNoKHNjaGVtYUlkcyk7XG4gICAgfSBlbHNlIGlmIChzY2hlbWFOYW1lcykge1xuICAgICAgc3FsUGdXaGVyZSA9IFwiQU5EIHNjaGVtYV9uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBnUGFyYW1zLnB1c2goc2NoZW1hTmFtZXMpO1xuICAgICAgc3FsV2JXaGVyZSA9IFwiV0hFUkUgbmFtZT1BTlkoJDEpXCI7XG4gICAgICB3YlBhcmFtcy5wdXNoKHNjaGVtYU5hbWVzKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYU5hbWVQYXR0ZXJuKSB7XG4gICAgICBzcWxQZ1doZXJlID0gXCJBTkQgc2NoZW1hX25hbWUgTElLRSAkMlwiO1xuICAgICAgcGdQYXJhbXMucHVzaChzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBuYW1lIExJS0UgJDFcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hTmFtZVBhdHRlcm4pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YS4qXG4gICAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcbiAgICAgICAgICBXSEVSRSBzY2hlbWFfbmFtZSBOT1QgTElLRSAncGdfJSdcbiAgICAgICAgICBBTkQgc2NoZW1hX25hbWUhPUFOWSgkMSlcbiAgICAgICAgICAke3NxbFBnV2hlcmV9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogcGdQYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIFNFTEVDVCB3Yi5zY2hlbWFzLipcbiAgICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAke3NxbFdiV2hlcmV9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogd2JQYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF0pO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MgJiYgcmVzdWx0c1sxXS5zdWNjZXNzKSB7XG4gICAgICBpZiAocmVzdWx0c1swXS5wYXlsb2FkLnJvd3MubGVuZ3RoICE9IHJlc3VsdHNbMV0ucGF5bG9hZC5yb3dzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgICAgXCJkYWwuc2NoZW1hczogd2Iuc2NoZW1hcyBvdXQgb2Ygc3luYyB3aXRoIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YVwiLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0c1sxXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMV0ucGF5bG9hZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzWzFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJzKFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiQU5EIHdiLnNjaGVtYXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2Iuc2NoZW1hX3VzZXJzLnNldHRpbmdzIGFzIHNldHRpbmdzXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgdXNlcl9yb2xlLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgdXNlcl9yb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lLFxuICAgICAgICB1c2VyX293bmVycy5lbWFpbCBhcyB1c2VyX293bmVyX2VtYWlsXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iuc2NoZW1hcy5pZD13Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2IudXNlcnMgdXNlcl9vd25lcnMgT04gd2Iuc2NoZW1hcy51c2VyX293bmVyX2lkPXVzZXJfb3duZXJzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICB1c2VySWQ/OiBudW1iZXIsXG4gICAgdXNlckVtYWlsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZCk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWwpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlsKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9vd25lcl9lbWFpbCxcbiAgICAgICAgJ3NjaGVtYV9vd25lcicgYXMgdXNlcl9yb2xlXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKG9yZ2FuaXphdGlvbklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWQpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZT0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi51c2Vycy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbCkge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi51c2Vycy5lbWFpbD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlsKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lXG4gICAgICAgIHNjaGVtYV91c2VyX3JvbGVzLm5hbWUgYXMgdXNlcl9yb2xlLFxuICAgICAgICBzY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzLm5hbWUgYXMgdXNlcl9yb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9uX3VzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iuc2NoZW1hcy5pZD13Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgc2NoZW1hX3VzZXJfcm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9c2NoZW1hX3VzZXJfcm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIHNjaGVtYV91c2VyX2ltcGxpZWRfcm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPXNjaGVtYV91c2VyX2ltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iucm9sZXMubmFtZT0nb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3InXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEoXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICB1c2VyT3duZXJJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgQ1JFQVRFIFNDSEVNQSAke0RBTC5zYW5pdGl6ZShuYW1lKX1gLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi5zY2hlbWFzKFxuICAgICAgICAgICAgbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbl9vd25lcl9pZCwgdXNlcl9vd25lcl9pZFxuICAgICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uT3duZXJJZCwgdXNlck93bmVySWRdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdKTtcbiAgICBjb25zdCBpbnNlcnRSZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gICAgaWYgKGluc2VydFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpbnNlcnRSZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChpbnNlcnRSZXN1bHQucGF5bG9hZClbMF07XG4gICAgfVxuICAgIHJldHVybiBpbnNlcnRSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNDSEVNQSBJRiBFWElTVFMgJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9IENBU0NBREVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdKVtdID0gW3NjaGVtYU5hbWVdO1xuICAgIGxldCBzcWxTZWxlY3Q6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdoZXJlID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnMuc2V0dGluZ3MsXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkLFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZCxcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCxcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLmNyZWF0ZWRfYXQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy51cGRhdGVkX2F0LFxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX2VtYWlsLFxuICAgICAgICB3Yi51c2Vycy5maXJzdF9uYW1lIGFzIHVzZXJfZmlyc3RfbmFtZSxcbiAgICAgICAgd2IudXNlcnMubGFzdF9uYW1lIGFzIHVzZXJfbGFzdF9uYW1lLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBzY2hlbWFJZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGVzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLipcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMudGFibGVfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHRhYmxlX25hbWU6IHN0cmluZyB9KSA9PiByb3cudGFibGVfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXNCeVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHRhYmxlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnVzZXJzLmVtYWlsPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAodGFibGVOYW1lcykge1xuICAgICAgc3FsV2hlcmUgKz0gXCJBTkQgd2IudGFibGVzLm5hbWU9QU5ZKCQzKVwiO1xuICAgICAgcGFyYW1zLnB1c2godGFibGVOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2IudGFibGVfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlcy4qLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHVzZXJfcm9sZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHVzZXJfcm9sZV9pbXBsaWVkX2Zyb21cbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgSk9JTiB3Yi50YWJsZV91c2VycyBPTiB3Yi50YWJsZXMuaWQ9d2IudGFibGVfdXNlcnMudGFibGVfaWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi50YWJsZV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2IudGFibGVfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMVxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIHR5cGUgPSBmb3JlaWduS2V5c3xyZWZlcmVuY2VzfGFsbFxuICBwdWJsaWMgYXN5bmMgZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZVBhdHRlcm46IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lUGF0dGVybjogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZVBhdHRlcm4gPSBEQUwuc2FuaXRpemUodGFibGVOYW1lUGF0dGVybik7XG4gICAgY29sdW1uTmFtZVBhdHRlcm4gPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZVBhdHRlcm4pO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgXCJGT1JFSUdOX0tFWVNcIjpcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICAgQU5EIGZrLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgZmsuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIlJFRkVSRU5DRVNcIjpcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICAgQU5EIHJlZi50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIHJlZi5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiQUxMXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCBmay50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIGZrLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIC0tIHVuaXF1ZSByZWZlcmVuY2UgaW5mb1xuICAgICAgICByZWYudGFibGVfbmFtZSAgICAgICBBUyByZWZfdGFibGUsXG4gICAgICAgIHJlZi5jb2x1bW5fbmFtZSAgICAgIEFTIHJlZl9jb2x1bW4sXG4gICAgICAgIHJlZmQuY29uc3RyYWludF90eXBlIEFTIHJlZl90eXBlLCAtLSBlLmcuIFVOSVFVRSBvciBQUklNQVJZIEtFWVxuICAgICAgICAtLSBmb3JlaWduIGtleSBpbmZvXG4gICAgICAgIGZrLnRhYmxlX25hbWUgICAgICAgIEFTIGZrX3RhYmxlLFxuICAgICAgICBmay5jb2x1bW5fbmFtZSAgICAgICBBUyBma19jb2x1bW4sXG4gICAgICAgIGZrLmNvbnN0cmFpbnRfbmFtZSAgIEFTIGZrX25hbWUsXG4gICAgICAgIG1hcC51cGRhdGVfcnVsZSAgICAgIEFTIGZrX29uX3VwZGF0ZSxcbiAgICAgICAgbWFwLmRlbGV0ZV9ydWxlICAgICAgQVMgZmtfb25fZGVsZXRlXG4gICAgICAgIC0tIGxpc3RzIGZrIGNvbnN0cmFpbnRzIEFORCBtYXBzIHRoZW0gdG8gcGsgY29uc3RyYWludHNcbiAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEucmVmZXJlbnRpYWxfY29uc3RyYWludHMgQVMgbWFwXG4gICAgICAgIC0tIGpvaW4gdW5pcXVlIGNvbnN0cmFpbnRzIChlLmcuIFBLcyBjb25zdHJhaW50cykgdG8gcmVmIGNvbHVtbnMgaW5mb1xuICAgICAgICBJTk5FUiBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5rZXlfY29sdW1uX3VzYWdlIEFTIHJlZlxuICAgICAgICBPTiAgcmVmLmNvbnN0cmFpbnRfY2F0YWxvZyA9IG1hcC51bmlxdWVfY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCByZWYuY29uc3RyYWludF9zY2hlbWEgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCByZWYuY29uc3RyYWludF9uYW1lID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X25hbWVcbiAgICAgICAgLS0gb3B0aW9uYWw6IHRvIGluY2x1ZGUgcmVmZXJlbmNlIGNvbnN0cmFpbnQgdHlwZVxuICAgICAgICBMRUZUIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIEFTIHJlZmRcbiAgICAgICAgT04gIHJlZmQuY29uc3RyYWludF9jYXRhbG9nID0gcmVmLmNvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgcmVmZC5jb25zdHJhaW50X3NjaGVtYSA9IHJlZi5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgcmVmZC5jb25zdHJhaW50X25hbWUgPSByZWYuY29uc3RyYWludF9uYW1lXG4gICAgICAgIC0tIGpvaW4gZmsgY29sdW1ucyB0byB0aGUgY29ycmVjdCByZWYgY29sdW1ucyB1c2luZyBvcmRpbmFsIHBvc2l0aW9uc1xuICAgICAgICBJTk5FUiBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5rZXlfY29sdW1uX3VzYWdlIEFTIGZrXG4gICAgICAgIE9OICBmay5jb25zdHJhaW50X2NhdGFsb2cgPSBtYXAuY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCBmay5jb25zdHJhaW50X3NjaGVtYSA9IG1hcC5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgZmsuY29uc3RyYWludF9uYW1lID0gbWFwLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICBBTkQgZmsucG9zaXRpb25faW5fdW5pcXVlX2NvbnN0cmFpbnQgPSByZWYub3JkaW5hbF9wb3NpdGlvbiAtLUlNUE9SVEFOVCFcbiAgICAgICAgV0hFUkUgcmVmLnRhYmxlX3NjaGVtYT0nJHtzY2hlbWFOYW1lfSdcbiAgICAgICAgQU5EIGZrLnRhYmxlX3NjaGVtYT0nJHtzY2hlbWFOYW1lfSdcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBjb25zdHJhaW50czogQ29uc3RyYWludElkW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucGF5bG9hZC5yb3dzKSB7XG4gICAgICBjb25zdCBjb25zdHJhaW50OiBDb25zdHJhaW50SWQgPSB7XG4gICAgICAgIGNvbnN0cmFpbnROYW1lOiByb3cuZmtfbmFtZSxcbiAgICAgICAgdGFibGVOYW1lOiByb3cuZmtfdGFibGUsXG4gICAgICAgIGNvbHVtbk5hbWU6IHJvdy5ma19jb2x1bW4sXG4gICAgICAgIHJlbFRhYmxlTmFtZTogcm93LnJlZl90YWJsZSxcbiAgICAgICAgcmVsQ29sdW1uTmFtZTogcm93LnJlZl9jb2x1bW4sXG4gICAgICB9O1xuICAgICAgY29uc3RyYWludHMucHVzaChjb25zdHJhaW50KTtcbiAgICB9XG4gICAgcmVzdWx0LnBheWxvYWQgPSBjb25zdHJhaW50cztcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHByaW1hcnlLZXlzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCBESVNUSU5DVCBjLmNvbHVtbl9uYW1lLCB0Yy5jb25zdHJhaW50X25hbWVcbiAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVfY29uc3RyYWludHMgdGMgXG4gICAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbnN0cmFpbnRfY29sdW1uX3VzYWdlIEFTIGNjdVxuICAgICAgICBVU0lORyAoY29uc3RyYWludF9zY2hlbWEsIGNvbnN0cmFpbnRfbmFtZSlcbiAgICAgICAgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBBUyBjXG4gICAgICAgIE9OIGMudGFibGVfc2NoZW1hID0gdGMuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHRjLnRhYmxlX25hbWUgPSBjLnRhYmxlX25hbWVcbiAgICAgICAgQU5EIGNjdS5jb2x1bW5fbmFtZSA9IGMuY29sdW1uX25hbWVcbiAgICAgICAgV0hFUkUgY29uc3RyYWludF90eXBlID0gJ1BSSU1BUlkgS0VZJ1xuICAgICAgICBBTkQgYy50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgIEFORCB0Yy50YWJsZV9uYW1lID0gJyR7dGFibGVOYW1lfSdcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBjb25zdCBwS0NvbHNDb25zdHJhaW50czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgICBwS0NvbHNDb25zdHJhaW50c1tyb3cuY29sdW1uX25hbWVdID0gcm93LmNvbnN0cmFpbnRfbmFtZTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcEtDb2xzQ29uc3RyYWludHM7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlQ29uc3RyYWludChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29uc3RyYWludE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0cmFpbnROYW1lID0gREFMLnNhbml0aXplKGNvbnN0cmFpbnROYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBEUk9QIENPTlNUUkFJTlQgSUYgRVhJU1RTICR7Y29uc3RyYWludE5hbWV9XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlUHJpbWFyeUtleShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIEFERCBQUklNQVJZIEtFWSAoJHtzYW5pdGl6ZWRDb2x1bW5OYW1lcy5qb2luKFwiLFwiKX0pO1xuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGRhbC5jcmVhdGVGb3JlaWduS2V5KCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZXN9LCR7cGFyZW50VGFibGVOYW1lfSwke3BhcmVudENvbHVtbk5hbWVzfSlgXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBwYXJlbnRUYWJsZU5hbWUgPSBEQUwuc2FuaXRpemUocGFyZW50VGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHBhcmVudENvbHVtbk5hbWUgb2YgcGFyZW50Q29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZFBhcmVudENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKHBhcmVudENvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgQUREIENPTlNUUkFJTlQgJHt0YWJsZU5hbWV9XyR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIl9cIil9X2ZrZXlcbiAgICAgICAgRk9SRUlHTiBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KVxuICAgICAgICBSRUZFUkVOQ0VTICR7c2NoZW1hTmFtZX0uJHtwYXJlbnRUYWJsZU5hbWV9XG4gICAgICAgICAgKCR7c2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXMuam9pbihcIixcIil9KVxuICAgICAgICBPTiBERUxFVEUgU0VUIE5VTExcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy4qLCB3Yi5zY2hlbWFzLm5hbWUgYXMgc2NoZW1hX25hbWVcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDEgQU5EIHdiLnRhYmxlcy5uYW1lPSQyIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZUxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuYWRkT3JDcmVhdGVUYWJsZSAke3NjaGVtYU5hbWV9ICR7dGFibGVOYW1lfSAke3RhYmxlTGFiZWx9ICR7Y3JlYXRlfWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyh1bmRlZmluZWQsIFtzY2hlbWFOYW1lXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlcyhzY2hlbWFfaWQsIG5hbWUsIGxhYmVsKVxuICAgICAgICBWQUxVRVMgKCQxLCAkMiwgJDMpIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZFswXS5pZCwgdGFibGVOYW1lLCB0YWJsZUxhYmVsXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYENSRUFURSBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiKClgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIGlmIChjcmVhdGUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2Vzcykge1xuICAgICAgcmVzdWx0c1swXS5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyh1bmRlZmluZWQsIFtzY2hlbWFOYW1lXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVzXG4gICAgICAgICAgV0hFUkUgc2NoZW1hX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkWzBdLmlkLCB0YWJsZU5hbWVdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgRFJPUCBUQUJMRSBJRiBFWElTVFMgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIiBDQVNDQURFYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBuZXdUYWJsZU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3VGFibGVMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBsZXQgcGFyYW1zID0gW107XG4gICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgVVBEQVRFIHdiLnRhYmxlcyBTRVRcbiAgICBgO1xuICAgIGxldCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTmFtZSk7XG4gICAgICB1cGRhdGVzLnB1c2goXCJuYW1lPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgIH1cbiAgICBpZiAobmV3VGFibGVMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3VGFibGVMYWJlbCk7XG4gICAgICB1cGRhdGVzLnB1c2goXCJsYWJlbD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgIHF1ZXJ5ICs9IGAke3VwZGF0ZXMuam9pbihcIiwgXCIpfSBXSEVSRSBpZD0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogcXVlcnksXG4gICAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIFJFTkFNRSBUTyAke25ld1RhYmxlTmFtZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGUgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VycyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyW10pW10gPSBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZSA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudGFibGVfdXNlcnMudXNlcl9pZD1BTlkoJDMpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnMuc2V0dGluZ3MsXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi50YWJsZV91c2Vycy50YWJsZV9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMudXNlcl9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMucm9sZV9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLmNyZWF0ZWRfYXQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLnVwZGF0ZWRfYXQsXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICB3Yi5zY2hlbWFzLm5hbWUgYXMgc2NoZW1hX25hbWUsXG4gICAgICAgIHdiLnRhYmxlcy5uYW1lIGFzIHRhYmxlX25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfZW1haWwsXG4gICAgICAgIHdiLnVzZXJzLmZpcnN0X25hbWUgYXMgdXNlcl9maXJzdF9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5sYXN0X25hbWUgYXMgdXNlcl9sYXN0X25hbWUsXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IudGFibGVfdXNlcnMudGFibGVfaWQ9d2IudGFibGVzLmlkXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi50YWJsZV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2IudGFibGVfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDJcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gVGFibGVVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1RBQkxFX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaWYgIXRhYmxlSWRzIGFsbCB0YWJsZXMgZm9yIHNjaGVtYVxuICAvLyBpZiAhdXNlcklkcyBhbGwgc2NoZW1hX3VzZXJzXG4gIHB1YmxpYyBhc3luYyBzZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoXG4gICAgb3JnYW5pemF0aW9uSWQ6IG51bWJlcixcbiAgICByb2xlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCAvLyBlZyB7IHNjaGVtYV9vd25lcjogXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIgfVxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKCR7b3JnYW5pemF0aW9uSWR9LCA8cm9sZU1hcD4sICR7c2NoZW1hSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nfSlgXG4gICAgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlc0lkTG9va3VwKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBsZXQgd2hlcmVTY2hlbWFzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlU2NoZW1hVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCBvbkNvbmZsaWN0U3FsID0gXCJcIjtcbiAgICBpZiAoc2NoZW1hSWRzICYmIHNjaGVtYUlkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVNjaGVtYXNTcWwgPSBgQU5EIHdiLnNjaGVtYXMuaWQgSU4gKCR7c2NoZW1hSWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBpZiAodXNlcklkcyAmJiB1c2VySWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlU2NoZW1hVXNlcnNTcWwgPSBgXG4gICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlcbiAgICAgIGA7XG4gICAgICB3aGVyZVVzZXJzU3FsID0gYEFORCB3Yi51c2Vycy5pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBjb25zdCByb2xlc0lkTG9va3VwID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcXVlcnlQYXJhbXM6IFF1ZXJ5UGFyYW1zW10gPSBbXTtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBpZiAoY2xlYXJFeGlzdGluZykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgICAgV0hFUkVcbiAgICAgICAgICAgIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPSQxXG4gICAgICAgICAgICAgICR7d2hlcmVTY2hlbWFzU3FsfVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgJHt3aGVyZVNjaGVtYVVzZXJzU3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtvcmdhbml6YXRpb25JZF0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXBkYXRlIGltcGxpZWQgcm9sZXMgb25seSwgbGVhdmUgZXhwbGljaXQgcm9sZXMgYWxvbmVcbiAgICAgIG9uQ29uZmxpY3RTcWwgPSBgXG4gICAgICAgIE9OIENPTkZMSUNUIChzY2hlbWFfaWQsIHVzZXJfaWQpXG4gICAgICAgIERPIFVQREFURSBTRVQgcm9sZV9pZD1FWENMVURFRC5yb2xlX2lkLCB1cGRhdGVkX2F0PUVYQ0xVREVELnVwZGF0ZWRfYXRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkIElTIE5PVCBOVUxMXG4gICAgICBgO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG9yZ2FuaXphdGlvblJvbGUgb2YgT2JqZWN0LmtleXMocm9sZU1hcCkpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnNjaGVtYV91c2VycyhzY2hlbWFfaWQsIHVzZXJfaWQsIHJvbGVfaWQsIGltcGxpZWRfZnJvbV9yb2xlX2lkLCB1cGRhdGVkX2F0KVxuICAgICAgICAgIFNFTEVDVFxuICAgICAgICAgIHdiLnNjaGVtYXMuaWQsXG4gICAgICAgICAgdXNlcl9pZCxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbcm9sZU1hcFtvcmdhbml6YXRpb25Sb2xlXV19LFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtvcmdhbml6YXRpb25Sb2xlXX0sXG4gICAgICAgICAgJDFcbiAgICAgICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbl91c2Vyc1xuICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDJcbiAgICAgICAgICBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAke3doZXJlU2NoZW1hc1NxbH1cbiAgICAgICAgICAke3doZXJlVXNlcnNTcWx9XG4gICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtkYXRlLCBvcmdhbml6YXRpb25JZCwgcm9sZXNJZExvb2t1cFtvcmdhbml6YXRpb25Sb2xlXV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgIHNjaGVtYUlkOiBudW1iZXIsXG4gICAgcm9sZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICB0YWJsZUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoJHtzY2hlbWFJZH0sIDxyb2xlTWFwPiwgJHt0YWJsZUlkc30sICR7dXNlcklkc30sICR7Y2xlYXJFeGlzdGluZ30pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlVGFibGVzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVGFibGVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IG9uQ29uZmxpY3RTcWwgPSBcIlwiO1xuICAgIGlmICh0YWJsZUlkcyAmJiB0YWJsZUlkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVRhYmxlc1NxbCA9IGBBTkQgd2IudGFibGVzLmlkIElOICgke3RhYmxlSWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBpZiAodXNlcklkcyAmJiB1c2VySWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlVGFibGVVc2Vyc1NxbCA9IGBcbiAgICAgICAgQU5EIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmcpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICAgV0hFUkVcbiAgICAgICAgICAgIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlcy5zY2hlbWFfaWQ9JDFcbiAgICAgICAgICAgICAgJHt3aGVyZVRhYmxlc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICR7d2hlcmVUYWJsZVVzZXJzU3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFJZF0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXBkYXRlIGltcGxpZWQgcm9sZXMgb25seSwgbGVhdmUgZXhwbGljaXQgcm9sZXMgYWxvbmVcbiAgICAgIG9uQ29uZmxpY3RTcWwgPSBgXG4gICAgICAgIE9OIENPTkZMSUNUICh0YWJsZV9pZCwgdXNlcl9pZClcbiAgICAgICAgRE8gVVBEQVRFIFNFVCByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgICAgICBXSEVSRSB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzY2hlbWFSb2xlIG9mIE9iamVjdC5rZXlzKHJvbGVNYXApKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV91c2Vycyh0YWJsZV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgU0VMRUNUXG4gICAgICAgICAgd2IudGFibGVzLmlkLFxuICAgICAgICAgIHVzZXJfaWQsXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbc2NoZW1hUm9sZV1dfSxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbc2NoZW1hUm9sZV19LFxuICAgICAgICAgICQxXG4gICAgICAgICAgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2Iuc2NoZW1hcy5pZD13Yi50YWJsZXMuc2NoZW1hX2lkXG4gICAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9JDIgQU5EIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPSQzXG4gICAgICAgICAgJHt3aGVyZVRhYmxlc1NxbH1cbiAgICAgICAgICAke3doZXJlVXNlcnNTcWx9XG4gICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtkYXRlLCBzY2hlbWFJZCwgcm9sZXNJZExvb2t1cFtzY2hlbWFSb2xlXV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlQWxsVGFibGVVc2VycyhcbiAgICB0YWJsZUlkPzogbnVtYmVyLFxuICAgIHNjaGVtYUlkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeVdoZXJlID0gXCJcIjtcbiAgICBjb25zdCBwYXJhbXM6IG51bWJlcltdID0gW107XG4gICAgaWYgKHRhYmxlSWQpIHtcbiAgICAgIHF1ZXJ5V2hlcmUgPSBcIldIRVJFIHRhYmxlX2lkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh0YWJsZUlkKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYUlkKSB7XG4gICAgICBxdWVyeVdoZXJlID0gYFxuICAgICAgICBXSEVSRSB0YWJsZV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIGZyb20gd2IudGFibGVzXG4gICAgICAgICAgV0hFUkUgd2IudGFibGVzLnNjaGVtYV9pZD0kMVxuICAgICAgICApXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goc2NoZW1hSWQpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICAke3F1ZXJ5V2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgdGFibGVJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgVVBEQVRFIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIFNFVCBzZXR0aW5ncz0kMSwgdXBkYXRlZF9hdD0kMlxuICAgICAgICBXSEVSRSB0YWJsZV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCB0YWJsZUlkLCB1c2VySWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbkJ5U2NoZW1hVGFibGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJDT0xVTU5fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnk6IHN0cmluZyA9IGBcbiAgICAgIFNFTEVDVCB3Yi5jb2x1bW5zLiosIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICBGUk9NIHdiLmNvbHVtbnNcbiAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLmNvbHVtbnMudGFibGVfaWQ9d2IudGFibGVzLmlkXG4gICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIE9OIChcbiAgICAgICAgd2IuY29sdW1ucy5uYW1lPWluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lXG4gICAgICAgIEFORCB3Yi5zY2hlbWFzLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMudGFibGVfc2NoZW1hXG4gICAgICApXG4gICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDEgQU5EIHdiLnRhYmxlcy5uYW1lPSQyIEFORCBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9uYW1lPSQyXG4gICAgYDtcbiAgICBsZXQgcGFyYW1zOiBzdHJpbmdbXSA9IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdO1xuICAgIGlmIChjb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyeSA9IGAke3F1ZXJ5fSBBTkQgd2IuY29sdW1ucy5uYW1lPSQzIEFORCBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy5jb2x1bW5fbmFtZT0kM2A7XG4gICAgICBwYXJhbXMucHVzaChjb2x1bW5OYW1lKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IENvbHVtbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaXNjb3ZlckNvbHVtbnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCBjb2x1bW5fbmFtZSBhcyBuYW1lLCBkYXRhX3R5cGUgYXMgdHlwZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zXG4gICAgICAgIFdIRVJFIHRhYmxlX3NjaGVtYT0kMVxuICAgICAgICBBTkQgdGFibGVfbmFtZT0kMlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IENvbHVtbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbkxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlOiBib29sZWFuLFxuICAgIGNvbHVtblBHVHlwZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlQ29sdW1uICR7c2NoZW1hTmFtZX0gJHt0YWJsZU5hbWV9ICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5MYWJlbH0gJHtjb2x1bW5QR1R5cGV9ICR7Y3JlYXRlfWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLmNvbHVtbnModGFibGVfaWQsIG5hbWUsIGxhYmVsKVxuICAgICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMylcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWQuaWQsIGNvbHVtbk5hbWUsIGNvbHVtbkxhYmVsXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBBREQgJHtjb2x1bW5OYW1lfSAke2NvbHVtblBHVHlwZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIG5ld0NvbHVtbk5hbWU/OiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3VHlwZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbHVtbk5hbWUgPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZSk7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW107XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3Q29sdW1uTGFiZWwpIHtcbiAgICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbkJ5U2NoZW1hVGFibGVDb2x1bW4oXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBsZXQgcGFyYW1zID0gW107XG4gICAgICBsZXQgcXVlcnkgPSBgXG4gICAgICAgIFVQREFURSB3Yi5jb2x1bW5zIFNFVFxuICAgICAgYDtcbiAgICAgIGxldCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgICAgcGFyYW1zLnB1c2gobmV3Q29sdW1uTmFtZSk7XG4gICAgICAgIHVwZGF0ZXMucHVzaChcIm5hbWU9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgICB9XG4gICAgICBpZiAobmV3Q29sdW1uTGFiZWwpIHtcbiAgICAgICAgcGFyYW1zLnB1c2gobmV3Q29sdW1uTGFiZWwpO1xuICAgICAgICB1cGRhdGVzLnB1c2goXCJsYWJlbD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICAgIHF1ZXJ5ICs9IGAke3VwZGF0ZXMuam9pbihcIiwgXCIpfSBXSEVSRSBpZD0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogcXVlcnksXG4gICAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGlmIChuZXdUeXBlKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBBTFRFUiBDT0xVTU4gJHtjb2x1bW5OYW1lfSBUWVBFICR7bmV3VHlwZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgUkVOQU1FIENPTFVNTiAke2NvbHVtbk5hbWV9IFRPICR7bmV3Q29sdW1uTmFtZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgZGVsOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLmNvbHVtbnNcbiAgICAgICAgICBXSEVSRSB0YWJsZV9pZD0kMSBBTkQgbmFtZT0kMlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZC5pZCwgY29sdW1uTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uTmFtZX0gQ0FTQ0FERVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIENvbHVtbiB7XG4gIHN0YXRpYyBDT01NT05fVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgVGV4dDogXCJ0ZXh0XCIsXG4gICAgTnVtYmVyOiBcImludGVnZXJcIixcbiAgICBEZWNpbWFsOiBcImRlY2ltYWxcIixcbiAgICBCb29sZWFuOiBcImJvb2xlYW5cIixcbiAgICBEYXRlOiBcImRhdGVcIixcbiAgICBcIkRhdGUgJiBUaW1lXCI6IFwidGltZXN0YW1wXCIsXG4gIH07XG5cbiAgaWQhOiBudW1iZXI7XG4gIHRhYmxlSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICB0eXBlITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGlzUHJpbWFyeUtleSE6IGJvb2xlYW47XG4gIGZvcmVpZ25LZXlzITogW0NvbnN0cmFpbnRJZF07XG4gIHJlZmVyZW5jZWRCeSE6IFtDb25zdHJhaW50SWRdO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Q29sdW1uPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1ucyA9IEFycmF5PENvbHVtbj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIGNvbHVtbnMucHVzaChDb2x1bW4ucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvbHVtbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBDb2x1bW4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiQ29sdW1uLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IGNvbHVtbiA9IG5ldyBDb2x1bW4oKTtcbiAgICBjb2x1bW4uaWQgPSBkYXRhLmlkO1xuICAgIGNvbHVtbi50YWJsZUlkID0gZGF0YS50YWJsZV9pZDtcbiAgICBjb2x1bW4ubmFtZSA9IGRhdGEubmFtZTtcbiAgICBjb2x1bW4ubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIGNvbHVtbi50eXBlID0gZGF0YS50eXBlO1xuICAgIGNvbHVtbi5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgY29sdW1uLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gY29sdW1uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBVc2VyIH0gZnJvbSBcIi5cIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nLCBXaGl0ZWJyaWNrQ2xvdWQgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuaW1wb3J0IHsgUm9sZUxldmVsLCBVc2VyQWN0aW9uUGVybWlzc2lvbiB9IGZyb20gXCIuL1JvbGVcIjtcbmltcG9ydCB7IERFRkFVTFRfUE9MSUNZIH0gZnJvbSBcIi4uL3BvbGljeVwiO1xuXG5leHBvcnQgY2xhc3MgQ3VycmVudFVzZXIge1xuICB3YkNsb3VkITogV2hpdGVicmlja0Nsb3VkO1xuICB1c2VyITogVXNlcjtcbiAgaWQhOiBudW1iZXI7XG4gIGFjdGlvbkhpc3Rvcnk6IFVzZXJBY3Rpb25QZXJtaXNzaW9uW10gPSBbXTtcblxuICAvLyB7IHJvbGVMZXZlbDogeyBvYmplY3RJZDogeyB1c2VyQWN0aW9uOiB7IGNoZWNrZWRGb3JSb2xlOiBzdHJpbmcsIHBlcm1pdHRlZDogdHJ1ZS9mYWxzZX0gfSB9IH1cbiAgb2JqZWN0UGVybWlzc2lvbnNMb29rdXA6IFJlY29yZDxcbiAgICBSb2xlTGV2ZWwsXG4gICAgUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4+XG4gID4gPSB7XG4gICAgb3JnYW5pemF0aW9uOiB7fSxcbiAgICBzY2hlbWE6IHt9LFxuICAgIHRhYmxlOiB7fSxcbiAgfTtcblxuICBjb25zdHJ1Y3Rvcih3YkNsb3VkOiBXaGl0ZWJyaWNrQ2xvdWQsIHVzZXI6IFVzZXIpIHtcbiAgICB0aGlzLndiQ2xvdWQgPSB3YkNsb3VkO1xuICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgdGhpcy5pZCA9IHVzZXIuaWQ7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluKHdiQ2xvdWQ6IFdoaXRlYnJpY2tDbG91ZCkge1xuICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIod2JDbG91ZCwgVXNlci5nZXRTeXNBZG1pblVzZXIoKSk7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpYyh3YkNsb3VkOiBXaGl0ZWJyaWNrQ2xvdWQpIHtcbiAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKHdiQ2xvdWQsIFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZEluKCkge1xuICAgIHJldHVybiB0aGlzLnVzZXIuaWQgIT09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzU2lnbmVkT3V0KCkge1xuICAgIHJldHVybiB0aGlzLnVzZXIuaWQgPT0gVXNlci5QVUJMSUNfSUQ7XG4gIH1cblxuICBwdWJsaWMgaXNQdWJsaWMoKSB7XG4gICAgcmV0dXJuICF0aGlzLmlzU2lnbmVkSW4oKTtcbiAgfVxuXG4gIHB1YmxpYyBpc1N5c0FkbWluKCkge1xuICAgIHJldHVybiB0aGlzLnVzZXIuaWQgPT09IFVzZXIuU1lTX0FETUlOX0lEO1xuICB9XG5cbiAgcHVibGljIGlzTm90U3lzQWRtaW4oKSB7XG4gICAgcmV0dXJuICF0aGlzLmlzU3lzQWRtaW47XG4gIH1cblxuICBwdWJsaWMgaWRJcyhvdGhlcklkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09IG90aGVySWQ7XG4gIH1cblxuICBwdWJsaWMgaWRJc05vdChvdGhlcklkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gIXRoaXMuaWRJcyhvdGhlcklkKTtcbiAgfVxuXG4gIHB1YmxpYyBkZW5pZWQoKSB7XG4gICAgbGV0IG1lc3NhZ2UgPSBcIklOVEVSTkFMIEVSUk9SOiBMYXN0IFVzZXJBY3Rpb25QZXJtaXNzaW9uIG5vdCByZWNvcmRlZC4gXCI7XG4gICAgbGV0IHZhbHVlczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBsYXN0VUFQID0gdGhpcy5hY3Rpb25IaXN0b3J5LnBvcCgpO1xuICAgIGlmIChsYXN0VUFQKSB7XG4gICAgICBtZXNzYWdlID0gYFlvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvICR7bGFzdFVBUC5kZW5pZWRNZXNzYWdlfS5gO1xuICAgICAgbGV0IHVzZXJTdHIgPSBgdXNlcklkPSR7dGhpcy5pZH1gO1xuICAgICAgaWYgKHRoaXMudXNlciAmJiB0aGlzLnVzZXIuZW1haWwpIHtcbiAgICAgICAgdXNlclN0ciA9IGB1c2VyRW1haWw9JHt0aGlzLnVzZXIuZW1haWx9LCAke3VzZXJTdHJ9YDtcbiAgICAgIH1cbiAgICAgIHZhbHVlcyA9IFtcbiAgICAgICAgdXNlclN0cixcbiAgICAgICAgYG9iamVjdElkPSR7bGFzdFVBUC5vYmplY3RJZH1gLFxuICAgICAgICBgdXNlckFjdGlvbj0ke2xhc3RVQVAudXNlckFjdGlvbn1gLFxuICAgICAgICBgY2hlY2tlZEZvclJvbGU9JHtsYXN0VUFQLmNoZWNrZWRGb3JSb2xlfWAsXG4gICAgICAgIGBjaGVja2VkQXQ9JHtsYXN0VUFQLmNoZWNrZWRBdH1gLFxuICAgICAgXTtcbiAgICB9XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgICB2YWx1ZXM6IHZhbHVlcyxcbiAgICAgIGFwb2xsb0Vycm9yQ29kZTogXCJGT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBtdXN0QmVTaWduZWRJbigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJZb3UgbXVzdCBiZSBzaWduZWQtaW4gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbi5cIixcbiAgICAgIGFwb2xsb0Vycm9yQ29kZTogXCJGT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFRCRCBtb3ZlIHRvIEVsYXN0aUNhY2hlXG4gIHByaXZhdGUgZ2V0T2JqZWN0UGVybWlzc2lvbihcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV0gJiZcbiAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICByb2xlTGV2ZWw6IHJvbGVMZXZlbCxcbiAgICAgICAgdXNlckFjdGlvbjogdXNlckFjdGlvbixcbiAgICAgICAgb2JqZWN0S2V5OiBrZXksXG4gICAgICAgIG9iamVjdElkOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dLm9ia2VjdElkLFxuICAgICAgICBjaGVja2VkRm9yUm9sZTpcbiAgICAgICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXVxuICAgICAgICAgICAgLmNoZWNrZWRGb3JSb2xlLFxuICAgICAgICBwZXJtaXR0ZWQ6XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl0ucGVybWl0dGVkLFxuICAgICAgICBkZW5pZWRNZXNzYWdlOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dXG4gICAgICAgICAgICAuZGVuaWVkTWVzc2FnZSxcbiAgICAgIH0gYXMgVXNlckFjdGlvblBlcm1pc3Npb247XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRCRCBtb3ZlIHRvIEVsYXN0aUNhY2hlXG4gIHByaXZhdGUgc2V0T2JqZWN0UGVybWlzc2lvbih1QVA6IFVzZXJBY3Rpb25QZXJtaXNzaW9uKSB7XG4gICAgaWYgKCF0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3VBUC5yb2xlTGV2ZWxdW3VBUC5vYmplY3RJZF0pIHtcbiAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbdUFQLnJvbGVMZXZlbF1bdUFQLm9iamVjdElkXSA9IHt9O1xuICAgIH1cbiAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3VBUC5yb2xlTGV2ZWxdW3VBUC5vYmplY3RJZF1bdUFQLnVzZXJBY3Rpb25dID1cbiAgICAgIHtcbiAgICAgICAgcGVybWl0dGVkOiB1QVAucGVybWl0dGVkLFxuICAgICAgICBjaGVja2VkRm9yUm9sZTogdUFQLmNoZWNrZWRGb3JSb2xlLFxuICAgICAgICBkZW5pZWRNZXNzYWdlOiB1QVAuZGVuaWVkTWVzc2FnZSxcbiAgICAgIH07XG4gICAgcmV0dXJuIHVBUDtcbiAgfVxuXG4gIHByaXZhdGUgcmVjb3JkQWN0aW9uSGlzdG9yeSh1QVA6IFVzZXJBY3Rpb25QZXJtaXNzaW9uKSB7XG4gICAgdUFQLmNoZWNrZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgdGhpcy5hY3Rpb25IaXN0b3J5LnB1c2godUFQKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0VXNlckFjdGlvblBvbGljeShcbiAgICBwb2xpY3k6IFJlY29yZDxzdHJpbmcsIGFueT5bXSxcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmdcbiAgKSB7XG4gICAgZm9yIChjb25zdCB1c2VyQWN0aW9uUG9saWN5IG9mIHBvbGljeSkge1xuICAgICAgaWYgKHVzZXJBY3Rpb25Qb2xpY3kudXNlckFjdGlvbiA9PSB1c2VyQWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB1c2VyQWN0aW9uUG9saWN5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0T2JqZWN0TG9va3VwS2V5KFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApIHtcbiAgICBsZXQga2V5OiBzdHJpbmcgPSBvYmplY3RJZE9yTmFtZS50b1N0cmluZygpO1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0SWRPck5hbWUgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgIGtleSA9IGBpZCR7b2JqZWN0SWRPck5hbWV9YDtcbiAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdE5hbWUpIHtcbiAgICAgIGtleSA9IGAke3BhcmVudE9iamVjdE5hbWV9LiR7b2JqZWN0SWRPck5hbWV9YDtcbiAgICB9XG4gICAgcmV0dXJuIGtleTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjYW4oXG4gICAgdXNlckFjdGlvbjogc3RyaW5nLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBpZiAodGhpcy5pc1N5c0FkbWluKCkpIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHBvbGljeSA9IEN1cnJlbnRVc2VyLmdldFVzZXJBY3Rpb25Qb2xpY3koREVGQVVMVF9QT0xJQ1ksIHVzZXJBY3Rpb24pO1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBjdXJyZW50VXNlci5jYW4oJHt1c2VyQWN0aW9ufSwke29iamVjdElkT3JOYW1lfSkgcG9saWN5OiR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHBvbGljeVxuICAgICAgKX1gXG4gICAgKTtcbiAgICBpZiAoIXBvbGljeSkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBObyBwb2xpY3kgZm91bmQgZm9yIHVzZXJBY3Rpb249JHt1c2VyQWN0aW9ufWA7XG4gICAgICBsb2cuZXJyb3IobWVzc2FnZSk7XG4gICAgICB0aHJvdyBtZXNzYWdlO1xuICAgIH1cbiAgICBsZXQga2V5ID0gdGhpcy5nZXRPYmplY3RMb29rdXBLZXkob2JqZWN0SWRPck5hbWUsIHBhcmVudE9iamVjdE5hbWUpO1xuICAgIGNvbnN0IGFscmVhZHlDaGVja2VkID0gdGhpcy5nZXRPYmplY3RQZXJtaXNzaW9uKFxuICAgICAgcG9saWN5LnJvbGVMZXZlbCxcbiAgICAgIHVzZXJBY3Rpb24sXG4gICAgICBrZXlcbiAgICApO1xuICAgIGlmIChhbHJlYWR5Q2hlY2tlZCAhPT0gbnVsbCkge1xuICAgICAgdGhpcy5yZWNvcmRBY3Rpb25IaXN0b3J5KGFscmVhZHlDaGVja2VkKTtcbiAgICAgIHJldHVybiBhbHJlYWR5Q2hlY2tlZC5wZXJtaXR0ZWQ7XG4gICAgfVxuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQucm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICAgIHRoaXMuaWQsXG4gICAgICBwb2xpY3kucm9sZUxldmVsLFxuICAgICAgb2JqZWN0SWRPck5hbWUsXG4gICAgICBwYXJlbnRPYmplY3ROYW1lXG4gICAgKTtcbiAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBFcnJvciBnZXR0aW5nIHJvbGVOYW1lRm9yVXNlck9iamVjdCgke3RoaXMuaWR9LCR7XG4gICAgICAgIHBvbGljeS5yb2xlTGV2ZWxcbiAgICAgIH0sJHtvYmplY3RJZE9yTmFtZX0sJHtwYXJlbnRPYmplY3ROYW1lfSkuICR7SlNPTi5zdHJpbmdpZnkocm9sZVJlc3VsdCl9YDtcbiAgICAgIGxvZy5lcnJvcihtZXNzYWdlKTtcbiAgICAgIHRocm93IG1lc3NhZ2U7XG4gICAgfVxuICAgIGlmICghcm9sZVJlc3VsdC5wYXlsb2FkLm9iamVjdElkKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE9iamVjdElkIGNvdWxkIG5vdCBiZSBmb3VuZGA7XG4gICAgICBsb2cuZXJyb3IobWVzc2FnZSk7XG4gICAgICB0aHJvdyBtZXNzYWdlO1xuICAgIH1cbiAgICBsZXQgcGVybWl0dGVkID0gZmFsc2U7XG4gICAgaWYgKFxuICAgICAgcm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lICYmXG4gICAgICBwb2xpY3kucGVybWl0dGVkUm9sZXMuaW5jbHVkZXMocm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lKVxuICAgICkge1xuICAgICAgcGVybWl0dGVkID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgdUFQOiBVc2VyQWN0aW9uUGVybWlzc2lvbiA9IHtcbiAgICAgIHJvbGVMZXZlbDogcG9saWN5LnJvbGVMZXZlbCxcbiAgICAgIG9iamVjdEtleToga2V5LFxuICAgICAgb2JqZWN0SWQ6IHJvbGVSZXN1bHQucGF5bG9hZC5vYmplY3RJZCxcbiAgICAgIHVzZXJBY3Rpb246IHVzZXJBY3Rpb24sXG4gICAgICBwZXJtaXR0ZWQ6IHBlcm1pdHRlZCxcbiAgICAgIGRlbmllZE1lc3NhZ2U6IHBvbGljeS5kZW5pZWRNZXNzYWdlLFxuICAgIH07XG4gICAgaWYgKHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSkge1xuICAgICAgdUFQLmNoZWNrZWRGb3JSb2xlID0gcm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lO1xuICAgIH1cbiAgICB0aGlzLnNldE9iamVjdFBlcm1pc3Npb24odUFQKTtcbiAgICB0aGlzLnJlY29yZEFjdGlvbkhpc3RvcnkodUFQKTtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcm9sZTogJHtKU09OLnN0cmluZ2lmeShyb2xlUmVzdWx0LnBheWxvYWQpfSBwZXJtaXR0ZWQ6ICR7cGVybWl0dGVkfWBcbiAgICApO1xuICAgIHJldHVybiBwZXJtaXR0ZWQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY2FudChcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmcsXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNhbiA9IGF3YWl0IHRoaXMuY2FuKHVzZXJBY3Rpb24sIG9iamVjdElkT3JOYW1lLCBwYXJlbnRPYmplY3ROYW1lKTtcbiAgICByZXR1cm4gIWNhbjtcbiAgfVxuXG4gIC8vIGFzeW5jIG9ubHkgcmVxdWlyZWQgdG8gbG9va3VwIHVzZXJJZCBmcm9tIGVtYWlsIHdoZW4gdGVzdGluZ1xuICBwdWJsaWMgc3RhdGljIGFzeW5jIGZyb21Db250ZXh0KGNvbnRleHQ6IGFueSk6IFByb21pc2U8Q3VycmVudFVzZXI+IHtcbiAgICAvL2xvZy5pbmZvKFwiPT09PT09PT09PSBIRUFERVJTOiBcIiArIEpTT04uc3RyaW5naWZ5KGhlYWRlcnMpKTtcbiAgICBjb25zdCBoZWFkZXJzTG93ZXJDYXNlID0gT2JqZWN0LmVudHJpZXMoXG4gICAgICBjb250ZXh0LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICAgICkucmVkdWNlKFxuICAgICAgKGFjYzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgW2tleSwgdmFsXSkgPT4gKFxuICAgICAgICAoYWNjW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbCksIGFjY1xuICAgICAgKSxcbiAgICAgIHt9XG4gICAgKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKFxuICAgICAgLy8gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT0gXCJkZXZlbG9wbWVudFwiICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl1cbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVEVTVCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1lbWFpbFwiXX1gXG4gICAgICApO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUVtYWlsKFxuICAgICAgICB0aGlzLFxuICAgICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl1cbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnBheWxvYWQgJiYgcmVzdWx0LnBheWxvYWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIHJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkbid0IGZpbmQgdXNlciBmb3IgdGVzdCBlbWFpbCB4LXRlc3QtdXNlci1lbWFpbD0ke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1lbWFpbFwiXX1gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoY29udGV4dC53YkNsb3VkLCBVc2VyLmdldFB1YmxpY1VzZXIoKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXS50b0xvd2VyQ2FzZSgpID09IFwiYWRtaW5cIlxuICAgICkge1xuICAgICAgbG9nLmRlYnVnKFwiPT09PT09PT09PSBGT1VORCBTWVNBRE1JTiBVU0VSXCIpO1xuICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIFVzZXIuZ2V0U3lzQWRtaW5Vc2VyKCkpO1xuICAgIH0gZWxzZSBpZiAoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pIHtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICApO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUlkKFxuICAgICAgICB0aGlzLFxuICAgICAgICBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSlcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnBheWxvYWQgJiYgcmVzdWx0LnBheWxvYWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIHJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkbid0IGZpbmQgdXNlciBmb3IgeC1oYXN1cmEtdXNlci1pZD0ke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihjb250ZXh0LndiQ2xvdWQsIFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVEJEOiBzdXBwb3J0IGZvciBwdWJsaWMgdXNlcnNcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZCBub3QgZmluZCBoZWFkZXJzIGZvciBBZG1pbiwgVGVzdCBvciBVc2VyIGluOiAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGNvbnRleHQuaGVhZGVyc1xuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKGNvbnRleHQud2JDbG91ZCwgVXNlci5nZXRQdWJsaWNVc2VyKCkpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIE9yZ2FuaXphdGlvbiB7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICB1c2VyUm9sZT86IHN0cmluZztcbiAgdXNlclJvbGVJbXBsaWVkRnJvbT86IHN0cmluZztcbiAgc2V0dGluZ3M/OiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb24+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25zID0gQXJyYXk8T3JnYW5pemF0aW9uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9ucy5wdXNoKE9yZ2FuaXphdGlvbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uID0gbmV3IE9yZ2FuaXphdGlvbigpO1xuICAgIG9yZ2FuaXphdGlvbi5pZCA9IGRhdGEuaWQ7XG4gICAgb3JnYW5pemF0aW9uLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgb3JnYW5pemF0aW9uLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBvcmdhbml6YXRpb24uY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvbi51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBvcmdhbml6YXRpb24udXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICBpZiAoZGF0YS51c2VyX3JvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICBvcmdhbml6YXRpb24udXNlclJvbGVJbXBsaWVkRnJvbSA9IGRhdGEudXNlcl9yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICB9XG4gICAgaWYgKGRhdGEuc2V0dGluZ3MpIG9yZ2FuaXphdGlvbi5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvbjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIE9yZ2FuaXphdGlvblVzZXIge1xuICBvcmdhbml6YXRpb25JZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tcm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBvcmdhbml6YXRpb25OYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHVzZXJGaXJzdE5hbWU/OiBzdHJpbmc7XG4gIHVzZXJMYXN0TmFtZT86IHN0cmluZztcbiAgcm9sZT86IHN0cmluZztcbiAgcm9sZUltcGxpZWRGcm9tPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8T3JnYW5pemF0aW9uVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25Vc2VycyA9IEFycmF5PE9yZ2FuaXphdGlvblVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBvcmdhbml6YXRpb25Vc2Vycy5wdXNoKE9yZ2FuaXphdGlvblVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvblVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogT3JnYW5pemF0aW9uVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb25Vc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblVzZXIgPSBuZXcgT3JnYW5pemF0aW9uVXNlcigpO1xuICAgIG9yZ2FuaXphdGlvblVzZXIub3JnYW5pemF0aW9uSWQgPSBkYXRhLm9yZ2FuaXphdGlvbl9pZDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnVzZXJJZCA9IGRhdGEudXNlcl9pZDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGVJZCA9IGRhdGEucm9sZV9pZDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLmltcGxpZWRGcm9tcm9sZUlkID0gZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICBvcmdhbml6YXRpb25Vc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5vcmdhbml6YXRpb25fbmFtZSlcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIub3JnYW5pemF0aW9uTmFtZSA9IGRhdGEub3JnYW5pemF0aW9uX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9lbWFpbCkgb3JnYW5pemF0aW9uVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKVxuICAgICAgb3JnYW5pemF0aW9uVXNlci51c2VyRmlyc3ROYW1lID0gZGF0YS51c2VyX2ZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9sYXN0X25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnVzZXJMYXN0TmFtZSA9IGRhdGEudXNlcl9sYXN0X25hbWU7XG4gICAgaWYgKGRhdGEucm9sZSkgb3JnYW5pemF0aW9uVXNlci5yb2xlID0gZGF0YS5yb2xlO1xuICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGVJbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgfVxuICAgIHJldHVybiBvcmdhbml6YXRpb25Vc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi4vQ29sdW1uXCI7XG5cbi8qKlxuICogU0NIRU1BXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGFuIG9yZ2FuaXphdGlvblxuICogICAtIEFsbCBhZG1pbmlzdHJhdG9ycyBvZiB0aGUgb3JnYW5pemF0aW9uIGhhdmUgaW1wbGljaXQgYWRtaW4gYWNjZXNzXG4gKiAgIC0gVGhlcmUgYXJlIG5vIGV4Y2VwdGlvbnNcbiAqIC0gSWYgYSBzY2hlbWEgaXMgb3duZWQgYnkgYSB1c2VyLCB0aGUgdXNlciBoYXMgaW1wbGljaXQgYWRtaW4gYWNjZXNzXG4gKiAgIC0gQWRkaXRpb25hbCB1c2VycyBjYW4gYmUgZ3JhbnRlZCBhZG1pbiBhY2Nlc3MgZXhwbGljaXRseVxuICovXG5cbmV4cG9ydCB0eXBlIFJvbGVMZXZlbCA9IFwib3JnYW5pemF0aW9uXCIgfCBcInNjaGVtYVwiIHwgXCJ0YWJsZVwiO1xuXG5leHBvcnQgdHlwZSBVc2VyQWN0aW9uUGVybWlzc2lvbiA9IHtcbiAgcm9sZUxldmVsOiBSb2xlTGV2ZWw7XG4gIHVzZXJBY3Rpb246IHN0cmluZztcbiAgb2JqZWN0S2V5Pzogc3RyaW5nO1xuICBvYmplY3RJZDogbnVtYmVyO1xuICBjaGVja2VkRm9yUm9sZT86IHN0cmluZztcbiAgcGVybWl0dGVkOiBib29sZWFuO1xuICBkZW5pZWRNZXNzYWdlOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IERhdGU7XG59O1xuXG5leHBvcnQgY2xhc3MgUm9sZSB7XG4gIHN0YXRpYyBTWVNST0xFU19PUkdBTklaQVRJT05TOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiA9IHtcbiAgICBvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcjoge1xuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEFkbWluaXN0cmF0b3JcIixcbiAgICB9LFxuICAgIG9yZ2FuaXphdGlvbl91c2VyOiB7IGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBVc2VyXCIgfSxcbiAgICBvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlcjoge1xuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEV4dGVybmFsIFVzZXJcIixcbiAgICB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19TQ0hFTUFTOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PiA9IHtcbiAgICBzY2hlbWFfb3duZXI6IHsgbGFiZWw6IFwiREIgT3duZXJcIiB9LFxuICAgIHNjaGVtYV9hZG1pbmlzdHJhdG9yOiB7IGxhYmVsOiBcIkRCIEFkbWluaXN0cmF0b3JcIiB9LFxuICAgIHNjaGVtYV9tYW5hZ2VyOiB7IGxhYmVsOiBcIkRCIE1hbmFnZXJcIiB9LFxuICAgIHNjaGVtYV9lZGl0b3I6IHsgbGFiZWw6IFwiREIgRWRpdG9yXCIgfSxcbiAgICBzY2hlbWFfcmVhZGVyOiB7IGxhYmVsOiBcIkRCIFJlYWRlclwiIH0sXG4gIH07XG5cbiAgc3RhdGljIFNZU1JPTEVTX1RBQkxFUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gICAgdGFibGVfYWRtaW5pc3RyYXRvcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgQWRtaW5pc3RyYXRvclwiLFxuICAgICAgcGVybWlzc2lvblByZWZpeGVzOiBbXCJzXCIsIFwiaVwiLCBcInVcIiwgXCJkXCJdLFxuICAgIH0sXG4gICAgdGFibGVfbWFuYWdlcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgTWFuYWdlclwiLFxuICAgICAgcGVybWlzc2lvblByZWZpeGVzOiBbXCJzXCIsIFwiaVwiLCBcInVcIiwgXCJkXCJdLFxuICAgIH0sXG4gICAgdGFibGVfZWRpdG9yOiB7XG4gICAgICBsYWJlbDogXCJUYWJsZSBFZGl0b3JcIixcbiAgICAgIHBlcm1pc3Npb25QcmVmaXhlczogW1wic1wiLCBcImlcIiwgXCJ1XCIsIFwiZFwiXSxcbiAgICB9LFxuICAgIHRhYmxlX3JlYWRlcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgUmVhZGVyXCIsXG4gICAgICBwZXJtaXNzaW9uUHJlZml4ZXM6IFtcInNcIl0sXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgU0NIRU1BX1RPX1RBQkxFX1JPTEVfTUFQOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIHNjaGVtYV9vd25lcjogXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgc2NoZW1hX2FkbWluaXN0cmF0b3I6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiLFxuICAgIHNjaGVtYV9tYW5hZ2VyOiBcInRhYmxlX21hbmFnZXJcIixcbiAgICBzY2hlbWFfZWRpdG9yOiBcInRhYmxlX2VkaXRvclwiLFxuICAgIHNjaGVtYV9yZWFkZXI6IFwidGFibGVfcmVhZGVyXCIsXG4gIH07XG5cbiAgc3RhdGljIE9SR0FOSVpBVElPTl9UT19TQ0hFTUFfUk9MRV9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3I6IFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgc2NoZW1hSWQ/OiBudW1iZXI7XG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHRhYmxlSWQ/OiBudW1iZXI7XG4gIHRhYmxlTmFtZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIGlzUm9sZShyb2xlTmFtZTogc3RyaW5nLCByb2xlTGV2ZWw/OiBSb2xlTGV2ZWwpOiBib29sZWFuIHtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBjYXNlIFwic2NoZW1hXCI6XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1NDSEVNQVMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGNhc2UgXCJ0YWJsZVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1NDSEVNQVMpLmluY2x1ZGVzKHJvbGVOYW1lKSB8fFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKS5pbmNsdWRlcyhyb2xlTmFtZSlcbiAgICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGFyZVJvbGVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IHJvbGVOYW1lIG9mIHJvbGVOYW1lcykge1xuICAgICAgaWYgKCFSb2xlLmlzUm9sZShyb2xlTmFtZSkpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvLyBlZyB7XG4gIC8vIHBlcm1pc3Npb25LZXk6IHMxMjM0LCB0eXBlOiBcInNlbGVjdFwiXG4gIC8vIHBlcm1pc3Npb25LZXk6IGkxMjM0LCB0eXBlOiBcImluc2VydFwiXG4gIC8vIHBlcm1pc3Npb25LZXk6IHUxMjM0LCB0eXBlOiBcInVwZGF0ZVwiXG4gIC8vIHBlcm1pc3Npb25LZXk6IGQxMjM0LCB0eXBlOiBcImRlbGV0ZVwiXG4gIC8vIH1cbiAgcHVibGljIHN0YXRpYyB0YWJsZVBlcm1pc3Npb25LZXlzQW5kVHlwZXMoXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSB7XG4gICAgY29uc3QgUEVSTUlTU0lPTl9QUkVGSVhFU19UWVBFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIHM6IFwic2VsZWN0XCIsXG4gICAgICBpOiBcImluc2VydFwiLFxuICAgICAgdTogXCJ1cGRhdGVcIixcbiAgICAgIGQ6IFwiZGVsZXRlXCIsXG4gICAgfTtcbiAgICBjb25zdCBwZXJtaXNzaW9uS2V5c0FuZFR5cGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHByZWZpeCBvZiBPYmplY3Qua2V5cyhQRVJNSVNTSU9OX1BSRUZJWEVTX1RZUEVTKSkge1xuICAgICAgcGVybWlzc2lvbktleXNBbmRUeXBlcy5wdXNoKHtcbiAgICAgICAgcGVybWlzc2lvbktleTogUm9sZS50YWJsZVBlcm1pc3Npb25LZXkocHJlZml4LCB0YWJsZUlkKSxcbiAgICAgICAgdHlwZTogUEVSTUlTU0lPTl9QUkVGSVhFU19UWVBFU1twcmVmaXhdLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBwZXJtaXNzaW9uS2V5c0FuZFR5cGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyB0YWJsZVBlcm1pc3Npb25LZXkoXG4gICAgcGVybWlzc2lvblByZWZpeDogc3RyaW5nLFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHtwZXJtaXNzaW9uUHJlZml4fSR7dGFibGVJZH1gO1xuICB9XG5cbiAgLy8gVXNlZCB0byBnZW5lcmF0ZSB0aGUgSGFzdXJhIHRhYmxlIHBlcm1pc3Npb25cbiAgcHVibGljIHN0YXRpYyBoYXN1cmFUYWJsZVBlcm1pc3Npb25DaGVja3NBbmRUeXBlcyhcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogUmVjb3JkPHN0cmluZywgYW55PltdIHtcbiAgICBjb25zdCBoYXN1cmFQZXJtaXNzaW9uc0FuZFR5cGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25LZXlzQW5kVHlwZSBvZiBSb2xlLnRhYmxlUGVybWlzc2lvbktleXNBbmRUeXBlcyhcbiAgICAgIHRhYmxlSWRcbiAgICApKSB7XG4gICAgICBoYXN1cmFQZXJtaXNzaW9uc0FuZFR5cGVzLnB1c2goe1xuICAgICAgICBwZXJtaXNzaW9uQ2hlY2s6IHtcbiAgICAgICAgICBfZXhpc3RzOiB7XG4gICAgICAgICAgICBfdGFibGU6IHsgc2NoZW1hOiBcIndiXCIsIG5hbWU6IFwidGFibGVfcGVybWlzc2lvbnNcIiB9LFxuICAgICAgICAgICAgX3doZXJlOiB7XG4gICAgICAgICAgICAgIF9hbmQ6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICB0YWJsZV9wZXJtaXNzaW9uX2tleToge1xuICAgICAgICAgICAgICAgICAgICBfZXE6IHBlcm1pc3Npb25LZXlzQW5kVHlwZS5wZXJtaXNzaW9uS2V5LFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHsgdXNlcl9pZDogeyBfZXE6IFwiWC1IYXN1cmEtVXNlci1JZFwiIH0gfSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcGVybWlzc2lvblR5cGU6IHBlcm1pc3Npb25LZXlzQW5kVHlwZS50eXBlLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBoYXN1cmFQZXJtaXNzaW9uc0FuZFR5cGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxSb2xlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGVzID0gQXJyYXk8Um9sZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHJvbGVzLnB1c2goUm9sZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBSb2xlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlJvbGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBSb2xlKCk7XG4gICAgcm9sZS5pZCA9IGRhdGEuaWQ7XG4gICAgcm9sZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHJvbGUubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHJvbGUuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHJvbGUudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYUlkKSByb2xlLnNjaGVtYUlkID0gZGF0YS5zY2hlbWFJZDtcbiAgICBpZiAoZGF0YS5zY2hlbWFOYW1lKSByb2xlLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYU5hbWU7XG4gICAgaWYgKGRhdGEudGFibGVJZCkgcm9sZS50YWJsZUlkID0gZGF0YS50YWJsZUlkO1xuICAgIGlmIChkYXRhLnRhYmxlTmFtZSkgcm9sZS50YWJsZU5hbWUgPSBkYXRhLnRhYmxlTmFtZTtcbiAgICByZXR1cm4gcm9sZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFVzZXIsIE9yZ2FuaXphdGlvbiB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWEge1xuICBzdGF0aWMgU1lTX1NDSEVNQV9OQU1FUzogc3RyaW5nW10gPSBbXG4gICAgXCJwdWJsaWNcIixcbiAgICBcImluZm9ybWF0aW9uX3NjaGVtYVwiLFxuICAgIFwiaGRiX2NhdGFsb2dcIixcbiAgICBcIndiXCIsXG4gIF07XG5cbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyO1xuICB1c2VyT3duZXJJZD86IG51bWJlcjtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICB1c2VyUm9sZT86IHN0cmluZztcbiAgdXNlclJvbGVJbXBsaWVkRnJvbT86IHN0cmluZztcbiAgb3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nO1xuICB1c2VyT3duZXJFbWFpbD86IHN0cmluZztcbiAgc2V0dGluZ3M/OiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IGRhdGEuaWQ7XG4gICAgc2NoZW1hLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgc2NoZW1hLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBzY2hlbWEub3JnYW5pemF0aW9uT3duZXJJZCA9IGRhdGEub3JnYW5pemF0aW9uX293bmVyX2lkO1xuICAgIHNjaGVtYS51c2VyT3duZXJJZCA9IGRhdGEudXNlcl9vd25lcl9pZDtcbiAgICBzY2hlbWEuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSBzY2hlbWEudXNlclJvbGUgPSBkYXRhLnVzZXJfcm9sZTtcbiAgICBpZiAoZGF0YS51c2VyX3JvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICBzY2hlbWEudXNlclJvbGVJbXBsaWVkRnJvbSA9IGRhdGEudXNlcl9yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICB9XG4gICAgaWYgKGRhdGEub3JnYW5pemF0aW9uX293bmVyX25hbWUpIHtcbiAgICAgIHNjaGVtYS5vcmdhbml6YXRpb25Pd25lck5hbWUgPSBkYXRhLm9yZ2FuaXphdGlvbl9vd25lcl9uYW1lO1xuICAgIH1cbiAgICBpZiAoZGF0YS51c2VyX293bmVyX2VtYWlsKSBzY2hlbWEudXNlck93bmVyRW1haWwgPSBkYXRhLnVzZXJfb3duZXJfZW1haWw7XG4gICAgaWYgKGRhdGEuc2V0dGluZ3MpIHNjaGVtYS5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYVVzZXIge1xuICBzY2hlbWFJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tUm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHVzZXJGaXJzdE5hbWU/OiBzdHJpbmc7XG4gIHVzZXJMYXN0TmFtZT86IHN0cmluZztcbiAgcm9sZT86IHN0cmluZztcbiAgcm9sZUltcGxpZWRGcm9tPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8U2NoZW1hVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFVc2VycyA9IEFycmF5PFNjaGVtYVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBzY2hlbWFVc2Vycy5wdXNoKFNjaGVtYVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogU2NoZW1hVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWFVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYVVzZXIgPSBuZXcgU2NoZW1hVXNlcigpO1xuICAgIHNjaGVtYVVzZXIuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICBzY2hlbWFVc2VyLnVzZXJJZCA9IGRhdGEudXNlcl9pZDtcbiAgICBzY2hlbWFVc2VyLnJvbGVJZCA9IGRhdGEucm9sZV9pZDtcbiAgICBpZiAoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCkge1xuICAgICAgc2NoZW1hVXNlci5pbXBsaWVkRnJvbVJvbGVJZCA9IGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQ7XG4gICAgfVxuICAgIHNjaGVtYVVzZXIuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIHNjaGVtYVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSBzY2hlbWFVc2VyLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHNjaGVtYVVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSkgc2NoZW1hVXNlci51c2VyRmlyc3ROYW1lID0gZGF0YS51c2VyX2ZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9sYXN0X25hbWUpIHNjaGVtYVVzZXIudXNlckxhc3ROYW1lID0gZGF0YS51c2VyX2xhc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5yb2xlKSBzY2hlbWFVc2VyLnJvbGUgPSBkYXRhLnJvbGU7XG4gICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgIHNjaGVtYVVzZXIucm9sZUltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICB9XG4gICAgcmV0dXJuIHNjaGVtYVVzZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBDb2x1bW4gfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGUge1xuICBpZCE6IG51bWJlcjtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGNvbHVtbnMhOiBbQ29sdW1uXTtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdXNlclJvbGU/OiBzdHJpbmc7XG4gIHVzZXJSb2xlSW1wbGllZEZyb20/OiBzdHJpbmc7XG4gIHNldHRpbmdzPzogb2JqZWN0O1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGU+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlcyA9IEFycmF5PFRhYmxlPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdGFibGVzLnB1c2goVGFibGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFRhYmxlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlID0gbmV3IFRhYmxlKCk7XG4gICAgdGFibGUuaWQgPSBkYXRhLmlkO1xuICAgIHRhYmxlLnNjaGVtYUlkID0gZGF0YS5zY2hlbWFfaWQ7XG4gICAgdGFibGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICB0YWJsZS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgdGFibGUuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHRhYmxlLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5zY2hlbWFfbmFtZSkgdGFibGUuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9yb2xlKSB0YWJsZS51c2VyUm9sZSA9IGRhdGEudXNlcl9yb2xlO1xuICAgIGlmIChkYXRhLnVzZXJfcm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgIHRhYmxlLnVzZXJSb2xlSW1wbGllZEZyb20gPSBkYXRhLnVzZXJfcm9sZV9pbXBsaWVkX2Zyb207XG4gICAgfVxuICAgIGlmIChkYXRhLnNldHRpbmdzKSB0YWJsZS5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgcmV0dXJuIHRhYmxlO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVGFibGVVc2VyIHtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tcm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB0YWJsZU5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgdXNlckZpcnN0TmFtZT86IHN0cmluZztcbiAgdXNlckxhc3ROYW1lPzogc3RyaW5nO1xuICByb2xlPzogc3RyaW5nO1xuICByb2xlSW1wbGllZEZyb20/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxUYWJsZVVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZVVzZXJzID0gQXJyYXk8VGFibGVVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdGFibGVVc2Vycy5wdXNoKFRhYmxlVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGFibGVVc2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFRhYmxlVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZVVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVVc2VyID0gbmV3IFRhYmxlVXNlcigpO1xuICAgIHRhYmxlVXNlci50YWJsZUlkID0gZGF0YS50YWJsZV9pZDtcbiAgICB0YWJsZVVzZXIudXNlcklkID0gZGF0YS51c2VyX2lkO1xuICAgIHRhYmxlVXNlci5yb2xlSWQgPSBkYXRhLnJvbGVfaWQ7XG4gICAgaWYgKGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpIHtcbiAgICAgIHRhYmxlVXNlci5pbXBsaWVkRnJvbXJvbGVJZCA9IGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQ7XG4gICAgfVxuICAgIHRhYmxlVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgdGFibGVVc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSB0YWJsZVVzZXIuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudGFibGVfbmFtZSkgdGFibGVVc2VyLnRhYmxlTmFtZSA9IGRhdGEudGFibGVfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2VtYWlsKSB0YWJsZVVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSkgdGFibGVVc2VyLnVzZXJGaXJzdE5hbWUgPSBkYXRhLnVzZXJfZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2xhc3RfbmFtZSkgdGFibGVVc2VyLnVzZXJMYXN0TmFtZSA9IGRhdGEudXNlcl9sYXN0X25hbWU7XG4gICAgaWYgKGRhdGEucm9sZSkgdGFibGVVc2VyLnJvbGUgPSBkYXRhLnJvbGU7XG4gICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgIHRhYmxlVXNlci5yb2xlSW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgIH1cbiAgICByZXR1cm4gdGFibGVVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgdXNlck1lc3NhZ2VzIH0gZnJvbSBcIi4uL2Vudmlyb25tZW50XCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgc3RhdGljIFNZU19BRE1JTl9JRDogbnVtYmVyID0gMTtcbiAgc3RhdGljIFBVQkxJQ19JRDogbnVtYmVyID0gMTtcblxuICBpZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZT86IHN0cmluZztcbiAgbGFzdE5hbWU/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXJzID0gQXJyYXk8VXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHVzZXJzLnB1c2goVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IGRhdGEuaWQ7XG4gICAgdXNlci5lbWFpbCA9IGRhdGEuZW1haWw7XG4gICAgaWYgKGRhdGEuZmlyc3RfbmFtZSkgdXNlci5maXJzdE5hbWUgPSBkYXRhLmZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEubGFzdF9uYW1lKSB1c2VyLmxhc3ROYW1lID0gZGF0YS5sYXN0X25hbWU7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluVXNlcigpOiBVc2VyIHtcbiAgICBjb25zdCBkYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1c2VyOiBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gVXNlci5TWVNfQURNSU5fSUQ7XG4gICAgdXNlci5lbWFpbCA9IFwiU1lTX0FETUlOQGV4YW1wbGUuY29tXCI7XG4gICAgdXNlci5maXJzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0ZTtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpY1VzZXIoKTogVXNlciB7XG4gICAgY29uc3QgZGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdXNlcjogVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IFVzZXIuUFVCTElDX0lEO1xuICAgIHVzZXIuZW1haWwgPSBcIlBVQkxJQ0BleGFtcGxlLmNvbVwiO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gXCJQdWJsaWMgVXNlclwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlB1YmxpYyBVc2VyXCI7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRlO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0ZTtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vUm9sZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vQ3VycmVudFVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL09yZ2FuaXphdGlvblwiO1xuZXhwb3J0ICogZnJvbSBcIi4vT3JnYW5pemF0aW9uVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vU2NoZW1hXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UYWJsZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Db2x1bW5cIjtcbiIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmc7XG4gIGRiSG9zdDogc3RyaW5nO1xuICBkYlBvcnQ6IG51bWJlcjtcbiAgZGJVc2VyOiBzdHJpbmc7XG4gIGRiUGFzc3dvcmQ6IHN0cmluZztcbiAgZGJQb29sTWF4OiBudW1iZXI7XG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGhhc3VyYUhvc3Q6IHN0cmluZztcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHN0cmluZztcbiAgdGVzdElnbm9yZUVycm9yczogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCBjb25zdCBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHByb2Nlc3MuZW52LlNFQ1JFVF9NRVNTQUdFIGFzIHN0cmluZyxcbiAgZGJOYW1lOiBwcm9jZXNzLmVudi5EQl9OQU1FIGFzIHN0cmluZyxcbiAgZGJIb3N0OiBwcm9jZXNzLmVudi5EQl9IT1NUIGFzIHN0cmluZyxcbiAgZGJQb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT1JUIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRV9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9DT05ORUNUSU9OX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGhhc3VyYUhvc3Q6IHByb2Nlc3MuZW52LkhBU1VSQV9IT1NUIGFzIHN0cmluZyxcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHByb2Nlc3MuZW52LkhBU1VSQV9BRE1JTl9TRUNSRVQgYXMgc3RyaW5nLFxuICB0ZXN0SWdub3JlRXJyb3JzOiAocHJvY2Vzcy5lbnYuVEVTVF9JR05PUkVfRVJST1JTIHx8IGZhbHNlKSBhcyBib29sZWFuLFxufTtcblxuLy8gd2JFcnJvckNvZGUgOiBbIG1lc3NhZ2UsIGFwb2xsb0Vycm9yQ29kZT8gXVxuZXhwb3J0IGNvbnN0IHVzZXJNZXNzYWdlczogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAvLyBVc2Vyc1xuICBXQl9VU0VSX05PVF9GT1VORDogW1wiVXNlciBub3QgZm91bmQuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX1VTRVJTX05PVF9GT1VORDogW1wiT25lIG9yIG1vcmUgdXNlcnMgd2VyZSBub3QgZm91bmQuXCJdLFxuICAvLyBPcmdhbml6YXRpb25zXG4gIFdCX09SR0FOSVpBVElPTl9OT1RfRk9VTkQ6IFtcIk9yZ2FuaXphdGlvbiBub3QgZm91bmQuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX09SR0FOSVpBVElPTl9OQU1FX1RBS0VOOiBbXG4gICAgXCJUaGlzIE9yZ2FuaXphdGlvbiBuYW1lIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4uXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFk6IFtcbiAgICBcIlRoaXMgb3JnYW5pemF0aW9uIHN0aWxsIGhhcyBub24tYWRtaW5pc3RyYXRpdmUgdXNlcnMuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgYWxsIEFkbWluaXN0cmF0b3JzIGZyb20gYW4gT3JnYW5pemF0aW9uIC0geW91IG11c3QgbGVhdmUgYXQgbGVhc3Qgb25lLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfVVNFUl9OT1RfSU5fT1JHOiBbXCJVc2VyIG11c3QgYmUgaW4gT3JnYW5pemF0aW9uXCJdLFxuICBXQl9VU0VSX05PVF9TQ0hFTUFfT1dORVI6IFtcIlRoZSBjdXJyZW50IHVzZXIgaXMgbm90IHRoZSBvd25lci5cIl0sXG4gIC8vIFNjaGVtYXNcbiAgV0JfU0NIRU1BX05PVF9GT1VORDogW1wiRGF0YWJhc2UgY291bGQgbm90IGJlIGZvdW5kLlwiXSxcbiAgV0JfQkFEX1NDSEVNQV9OQU1FOiBbXG4gICAgXCJEYXRhYmFzZSBuYW1lIGNhbiBub3QgYmVnaW4gd2l0aCAncGdfJyBvciBiZSBpbiB0aGUgcmVzZXJ2ZWQgbGlzdC5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX0NBTlRfUkVNT1ZFX1NDSEVNQV9VU0VSX09XTkVSOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgdGhlIHVzZXJfb3duZXIgZnJvbSBhIFNjaGVtYVwiLFxuICBdLFxuICAvLyBTY2hlbWFzIFVzZXJzXG4gIFdCX1NDSEVNQV9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIFNjaGVtYSBVc2VycyBub3QgZm91bmQuXCJdLFxuICAvLyBUYWJsZXNcbiAgV0JfVEFCTEVfTk9UX0ZPVU5EOiBbXCJUYWJsZSBjb3VsZCBub3QgYmUgZm91bmQuXCJdLFxuICBXQl9UQUJMRV9OQU1FX0VYSVNUUzogW1wiVGhpcyBUYWJsZSBuYW1lIGFscmVhZHkgZXhpc3RzXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIENPTFVNTl9OT1RfRk9VTkQ6IFtcIkNvbHVtbiBjb3VsZCBub3QgYmUgZm91bmRcIl0sXG4gIFdCX0NPTFVNTl9OQU1FX0VYSVNUUzogW1wiVGhpcyBDb2x1bW4gbmFtZSBhbHJlYWR5IGV4aXN0cy5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfUEtfRVhJU1RTOiBbXCJSZW1vdmUgZXhpc3RpbmcgcHJpbWFyeSBrZXkgZmlyc3QuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX0ZLX0VYSVNUUzogW1xuICAgIFwiUmVtb3ZlIGV4aXN0aW5nIGZvcmVpZ24ga2V5IG9uIHRoZSBjb2x1bW4gZmlyc3QuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICAvLyBUYWJsZSBVc2VycyxcbiAgV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSBUYWJsZSBVc2VycyBub3QgZm91bmQuXCJdLFxuICAvLyBSb2xlc1xuICBST0xFX05PVF9GT1VORDogW1wiVGhpcyByb2xlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG59O1xuIiwiLy8gaHR0cHM6Ly9hbHRyaW0uaW8vcG9zdHMvYXhpb3MtaHR0cC1jbGllbnQtdXNpbmctdHlwZXNjcmlwdFxuXG5pbXBvcnQgYXhpb3MsIHsgQXhpb3NJbnN0YW5jZSwgQXhpb3NSZXNwb25zZSB9IGZyb20gXCJheGlvc1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nIH0gZnJvbSBcIi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5jb25zdCBoZWFkZXJzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPj4gPSB7XG4gIEFjY2VwdDogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICBcIngtaGFzdXJhLWFkbWluLXNlY3JldFwiOiBlbnZpcm9ubWVudC5oYXN1cmFBZG1pblNlY3JldCxcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHN0YXRpYyBJR05PUkVfRVJST1JTID0gZmFsc2U7XG4gIHN0YXRpYyBIQVNVUkFfSUdOT1JFX0NPREVTOiBzdHJpbmdbXSA9IFtcbiAgICBcImFscmVhZHktdW50cmFja2VkXCIsXG4gICAgXCJhbHJlYWR5LXRyYWNrZWRcIixcbiAgICBcIm5vdC1leGlzdHNcIiwgLy8gZHJvcHBpbmcgYSByZWxhdGlvbnNoaXBcbiAgICBcImFscmVhZHktZXhpc3RzXCIsXG4gICAgXCJ1bmV4cGVjdGVkXCIsXG4gICAgXCJwZXJtaXNzaW9uLWRlbmllZFwiLFxuICBdO1xuXG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogZW52aXJvbm1lbnQuaGFzdXJhSG9zdCxcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBlcnJJZ25vcmUoKSB7XG4gICAgaWYgKHRoaXMuSUdOT1JFX0VSUk9SUyB8fCBlbnZpcm9ubWVudC50ZXN0SWdub3JlRXJyb3JzKSB7XG4gICAgICByZXR1cm4gdGhpcy5IQVNVUkFfSUdOT1JFX0NPREVTO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwb3N0KHR5cGU6IHN0cmluZywgYXJnczogUmVjb3JkPHN0cmluZywgYW55Pikge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KFxuICAgICAgICBcIi92MS9tZXRhZGF0YVwiLFxuICAgICAgICB7XG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICBhcmdzOiBhcmdzLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yLnJlc3BvbnNlICYmIGVycm9yLnJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgaWYgKCFIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMoZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlKSkge1xuICAgICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICAgIFwiZXJyb3IucmVzcG9uc2UuZGF0YTogXCIgKyBKU09OLnN0cmluZ2lmeShlcnJvci5yZXNwb25zZS5kYXRhKVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLnJlc3BvbnNlLmRhdGEuZXJyb3IsXG4gICAgICAgICAgICByZWZDb2RlOiBlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdW50cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICBjYXNjYWRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbGF0aW9uc2hpcHNcbiAgICovXG5cbiAgLy8gYSBwb3N0IGhhcyBvbmUgYXV0aG9yIChjb25zdHJhaW50IHBvc3RzLmF1dGhvcl9pZCAtPiBhdXRob3JzLmlkKVxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsIC8vIGF1dGhvcl9pZFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nIC8vIGF1dGhvcnNcbiAgKSB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NvbHVtbk5hbWV9LCAke3BhcmVudFRhYmxlTmFtZX0pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX29iamVjdF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IGNvbHVtbk5hbWUsIC8vIGF1dGhvcl9pZFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGFuIGF1dGhvciBoYXMgbWFueSBwb3N0cyAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gYXV0aG9yc1xuICAgIGNoaWxkVGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY2hpbGRDb2x1bW5OYW1lczogc3RyaW5nW10gLy8gYXV0aG9yX2lkXG4gICkge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBoYXN1cmFBcGkuY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NoaWxkVGFibGVOYW1lfSwgJHtjaGlsZENvbHVtbk5hbWVzfSlgXG4gICAgKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19jcmVhdGVfYXJyYXlfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIG5hbWU6IGBhcnJfJHt0YWJsZU5hbWV9XyR7Y2hpbGRUYWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICB9LFxuICAgICAgdXNpbmc6IHtcbiAgICAgICAgZm9yZWlnbl9rZXlfY29uc3RyYWludF9vbjoge1xuICAgICAgICAgIGNvbHVtbjogY2hpbGRDb2x1bW5OYW1lc1swXSwgLy8gYXV0aG9yX2lkXG4gICAgICAgICAgdGFibGU6IHtcbiAgICAgICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIG5hbWU6IGNoaWxkVGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRyb3BSZWxhdGlvbnNoaXBzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgIH0sXG4gICAgICByZWxhdGlvbnNoaXA6IGBvYmpfJHt0YWJsZU5hbWV9XyR7cGFyZW50VGFibGVOYW1lfWAsIC8vIG9ial9wb3N0c19hdXRob3JzXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICAoIXJlc3VsdC5yZWZDb2RlIHx8XG4gICAgICAgIChyZXN1bHQucmVmQ29kZSAmJiAhSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHBhcmVudFRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHJlbGF0aW9uc2hpcDogYGFycl8ke3BhcmVudFRhYmxlTmFtZX1fJHt0YWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQZXJtaXNzaW9uc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlUGVybWlzc2lvbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGVybWlzc2lvbkNoZWNrOiBvYmplY3QsXG4gICAgdHlwZTogc3RyaW5nLFxuICAgIHJvbGU6IHN0cmluZyxcbiAgICBjb2x1bW5zOiBzdHJpbmdbXVxuICApIHtcbiAgICBjb25zdCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgcm9sZTogcm9sZSxcbiAgICAgIHBlcm1pc3Npb246IHtcbiAgICAgICAgY29sdW1uczogY29sdW1ucyxcbiAgICAgICAgLy8gZmlsdGVyOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICAgIC8vIGNoZWNrOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gaHR0cHM6Ly9oYXN1cmEuaW8vZG9jcy9sYXRlc3QvZ3JhcGhxbC9jb3JlL2FwaS1yZWZlcmVuY2UvbWV0YWRhdGEtYXBpL3Blcm1pc3Npb24uaHRtbFxuICAgIGlmICh0eXBlID09IFwiaW5zZXJ0XCIpIHtcbiAgICAgIHBheWxvYWQucGVybWlzc2lvbi5jaGVjayA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9IGVsc2Uge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmZpbHRlciA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9XG4gICAgaWYgKHR5cGUgPT0gXCJzZWxlY3RcIikge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmFsbG93X2FnZ3JlZ2F0aW9ucyA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChgcGdfY3JlYXRlXyR7dHlwZX1fcGVybWlzc2lvbmAsIHBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUGVybWlzc2lvbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nLFxuICAgIHJvbGU6IHN0cmluZ1xuICApIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoYHBnX2Ryb3BfJHt0eXBlfV9wZXJtaXNzaW9uYCwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgcm9sZTogcm9sZSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG5cbmV4cG9ydCBjb25zdCBoYXN1cmFBcGkgPSBuZXcgSGFzdXJhQXBpKCk7XG4iLCJleHBvcnQgY29uc3QgREVGQVVMVF9QT0xJQ1k6IFJlY29yZDxzdHJpbmcsIGFueT5bXSA9IFtcbiAgLy8gT3JnYW5pemF0aW9uc1xuICB7XG4gICAgdXNlckFjdGlvbjogXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsXG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlbmllZE1lc3NhZ2U6IFwiYWNjZXNzIHRoaXMgb3JnYW5pemF0aW9uXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcbiAgICAgIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIixcbiAgICAgIFwib3JnYW5pemF0aW9uX3VzZXJcIixcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICBdLFxuICB9LFxuICB7XG4gICAgdXNlckFjdGlvbjogXCJhZG1pbmlzdGVyX29yZ2FuaXphdGlvblwiLFxuICAgIHJvbGVMZXZlbDogXCJvcmdhbml6YXRpb25cIixcbiAgICBkZW5pZWRNZXNzYWdlOiBcImFkbWluaXN0ZXIgdGhpcyBvcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIHtcbiAgICB1c2VyQWN0aW9uOiBcImVkaXRfb3JnYW5pemF0aW9uXCIsXG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlbmllZE1lc3NhZ2U6IFwiZWRpdCB0aGlzIE9yZ2FuaXphdGlvbi5cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIHtcbiAgICB1c2VyQWN0aW9uOiBcIm1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uXCIsXG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlbmllZE1lc3NhZ2U6IFwibWFuYWdlIGFjY2VzcyB0byB0aGlzIE9yZ2FuaXphdGlvbi5cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIC8vIFNjaGVtYXNcbiAge1xuICAgIHVzZXJBY3Rpb246IFwiYWx0ZXJfc2NoZW1hXCIsXG4gICAgcm9sZUxldmVsOiBcInNjaGVtYVwiLFxuICAgIGRlbmllZE1lc3NhZ2U6IFwiYWx0ZXIgdGhpcyBEYXRhYmFzZS5cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wic2NoZW1hX21hbmFnZXJcIiwgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXSxcbiAgfSxcbiAge1xuICAgIHVzZXJBY3Rpb246IFwibWFuYWdlX2FjY2Vzc190b19zY2hlbWFcIixcbiAgICByb2xlTGV2ZWw6IFwic2NoZW1hXCIsXG4gICAgZGVuaWVkTWVzc2FnZTogXCJtYW5hZ2UgYWNjZXNzIHRvIHRoaXMgRGF0YWJhc2UuXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInNjaGVtYV9tYW5hZ2VyXCIsIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIC8vIFRhYmxlc1xuICB7XG4gICAgdXNlckFjdGlvbjogXCJhbHRlcl90YWJsZVwiLFxuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlbmllZE1lc3NhZ2U6IFwiYWx0ZXIgdGhpcyBUYWJsZS5cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1widGFibGVfbWFuYWdlclwiLCBcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIHtcbiAgICB1c2VyQWN0aW9uOiBcIm1hbmFnZV9hY2Nlc3NfdG9fdGFibGVcIixcbiAgICByb2xlTGV2ZWw6IFwidGFibGVcIixcbiAgICBkZW5pZWRNZXNzYWdlOiBcIm1hbmFnZSBhY2Nlc3MgdG8gdGhpcyBUYWJsZS5cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1widGFibGVfbWFuYWdlclwiLCBcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG5dO1xuIiwiaW1wb3J0IHsgdHlwZURlZnMgYXMgU2NoZW1hLCByZXNvbHZlcnMgYXMgc2NoZW1hUmVzb2x2ZXJzIH0gZnJvbSBcIi4vc2NoZW1hXCI7XG5pbXBvcnQge1xuICB0eXBlRGVmcyBhcyBPcmdhbml6YXRpb24sXG4gIHJlc29sdmVycyBhcyBvcmdhbml6YXRpb25SZXNvbHZlcnMsXG59IGZyb20gXCIuL29yZ2FuaXphdGlvblwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVXNlciwgcmVzb2x2ZXJzIGFzIHVzZXJSZXNvbHZlcnMgfSBmcm9tIFwiLi91c2VyXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyBhcyBUYWJsZSwgcmVzb2x2ZXJzIGFzIHRhYmxlUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdGFibGVcIjtcbmltcG9ydCB7IG1lcmdlIH0gZnJvbSBcImxvZGFzaFwiO1xuaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQge1xuICBjb25zdHJhaW50RGlyZWN0aXZlLFxuICBjb25zdHJhaW50RGlyZWN0aXZlVHlwZURlZnMsXG59IGZyb20gXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCI7XG5pbXBvcnQgeyBtYWtlRXhlY3V0YWJsZVNjaGVtYSB9IGZyb20gXCJncmFwaHFsLXRvb2xzXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuLi9lbnRpdHlcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCB0eXBlIFNlcnZpY2VSZXN1bHQgPVxuICB8IHsgc3VjY2VzczogdHJ1ZTsgcGF5bG9hZDogYW55OyBtZXNzYWdlPzogc3RyaW5nIH1cbiAgfCB7XG4gICAgICBzdWNjZXNzPzogZmFsc2U7XG4gICAgICBtZXNzYWdlPzogc3RyaW5nO1xuICAgICAgcmVmQ29kZT86IHN0cmluZztcbiAgICAgIHdiQ29kZT86IHN0cmluZztcbiAgICAgIGFwb2xsb0Vycm9yQ29kZT86IHN0cmluZztcbiAgICAgIHZhbHVlcz86IHN0cmluZ1tdO1xuICAgIH07XG5cbmV4cG9ydCB0eXBlIFF1ZXJ5UGFyYW1zID0ge1xuICBxdWVyeTogc3RyaW5nO1xuICBwYXJhbXM/OiBhbnlbXTtcbn07XG5cbmV4cG9ydCB0eXBlIENvbnN0cmFpbnRJZCA9IHtcbiAgY29uc3RyYWludE5hbWU6IHN0cmluZztcbiAgdGFibGVOYW1lOiBzdHJpbmc7XG4gIGNvbHVtbk5hbWU6IHN0cmluZztcbiAgcmVsVGFibGVOYW1lPzogc3RyaW5nO1xuICByZWxDb2x1bW5OYW1lPzogc3RyaW5nO1xufTtcblxuY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgUXVlcnkge1xuICAgIHdiSGVhbHRoQ2hlY2s6IEpTT04hXG4gICAgd2JDbG91ZENvbnRleHQ6IEpTT04hXG4gIH1cblxuICB0eXBlIE11dGF0aW9uIHtcbiAgICB3YlJlc2V0VGVzdERhdGE6IEJvb2xlYW4hXG4gICAgd2JBdXRoKHVzZXJBdXRoSWQ6IFN0cmluZyEpOiBKU09OIVxuICB9XG5gO1xuXG5jb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JIZWFsdGhDaGVjazogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBoZWFkZXJzOiBjb250ZXh0LmhlYWRlcnMsXG4gICAgICAgIG11bHRpVmFsdWVIZWFkZXJzOiBjb250ZXh0LmhlYWRlcnMsXG4gICAgICB9O1xuICAgIH0sXG4gICAgd2JDbG91ZENvbnRleHQ6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgcmV0dXJuIGNvbnRleHQud2JDbG91ZC5jbG91ZENvbnRleHQoKTtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIHdiUmVzZXRUZXN0RGF0YTogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVzZXRUZXN0RGF0YSgpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBdXRoOiBhc3luYyAoXywgeyB1c2VyQXV0aElkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hdXRoKHVzZXJBdXRoSWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG59O1xuXG5leHBvcnQgY29uc3Qgc2NoZW1hID0gbWFrZUV4ZWN1dGFibGVTY2hlbWEoe1xuICB0eXBlRGVmczogW1xuICAgIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbiAgICB0eXBlRGVmcyxcbiAgICBPcmdhbml6YXRpb24sXG4gICAgVXNlcixcbiAgICBTY2hlbWEsXG4gICAgVGFibGUsXG4gIF0sXG4gIHJlc29sdmVyczogbWVyZ2UoXG4gICAgcmVzb2x2ZXJzLFxuICAgIG9yZ2FuaXphdGlvblJlc29sdmVycyxcbiAgICB1c2VyUmVzb2x2ZXJzLFxuICAgIHNjaGVtYVJlc29sdmVycyxcbiAgICB0YWJsZVJlc29sdmVyc1xuICApLFxuICBzY2hlbWFUcmFuc2Zvcm1zOiBbY29uc3RyYWludERpcmVjdGl2ZSgpXSxcbn0pO1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuLi9lbnRpdHlcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBPcmdhbml6YXRpb24ge1xuICAgIGlkOiBJRCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICB1c2VyUm9sZTogU3RyaW5nXG4gICAgdXNlclJvbGVJbXBsaWVkRnJvbTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgT3JnYW5pemF0aW9uVXNlciB7XG4gICAgb3JnYW5pemF0aW9uSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICByb2xlSWQ6IEludCFcbiAgICBpbXBsaWVkRnJvbVJvbGVJZDogSW50XG4gICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgIHVzZXJGaXJzdE5hbWU6IFN0cmluZ1xuICAgIHVzZXJMYXN0TmFtZTogU3RyaW5nXG4gICAgcm9sZTogU3RyaW5nIVxuICAgIHJvbGVJbXBsaWVkRnJvbTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb25zXG4gICAgXCJcIlwiXG4gICAgd2JNeU9yZ2FuaXphdGlvbnMod2l0aFNldHRpbmdzOiBCb29sZWFuKTogW09yZ2FuaXphdGlvbl1cbiAgICB3Yk15T3JnYW5pemF0aW9uQnlOYW1lKG5hbWU6IFN0cmluZyEsIHdpdGhTZXR0aW5nczogQm9vbGVhbik6IE9yZ2FuaXphdGlvblxuICAgIHdiT3JnYW5pemF0aW9uQnlOYW1lKG5hbWU6IFN0cmluZyEpOiBPcmdhbml6YXRpb25cbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb24gVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3Yk9yZ2FuaXphdGlvblVzZXJzKFxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICAgcm9sZXM6IFtTdHJpbmddXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXVxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW09yZ2FuaXphdGlvblVzZXJdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uc1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEsIGxhYmVsOiBTdHJpbmchKTogT3JnYW5pemF0aW9uXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb24oXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBuZXdOYW1lOiBTdHJpbmdcbiAgICAgIG5ld0xhYmVsOiBTdHJpbmdcbiAgICApOiBPcmdhbml6YXRpb25cbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBTdHJpbmchKTogQm9vbGVhblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncyhcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiTXlPcmdhbml6YXRpb25zOiBhc3luYyAoXywgeyB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlT3JnYW5pemF0aW9ucyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlPcmdhbml6YXRpb25CeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUsIHdpdGhTZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVPcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk9yZ2FuaXphdGlvbkJ5TmFtZTogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3Yk9yZ2FuaXphdGlvblVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBvcmdhbml6YXRpb25OYW1lLCByb2xlcywgdXNlckVtYWlscywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvblVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByb2xlcyxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb246IGFzeW5jIChfLCB7IG5hbWUsIG5ld05hbWUsIG5ld0xhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3TmFtZSxcbiAgICAgICAgbmV3TGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmRlbGV0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3YlNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICByb2xlLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHVzZXJFbWFpbHNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgdXNlckVtYWlscywgb3JnYW5pemF0aW9uTmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHVzZXJFbWFpbHNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3M6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IG9yZ2FuaXphdGlvbk5hbWUsIHNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgU2NoZW1hIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZDogSW50XG4gICAgdXNlck93bmVySWQ6IEludFxuICAgIHVzZXJSb2xlOiBTdHJpbmdcbiAgICB1c2VyUm9sZUltcGxpZWRGcm9tOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgdXNlck93bmVyRW1haWw6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBTY2hlbWFVc2VyIHtcbiAgICBzY2hlbWFJZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIHJvbGVJZDogSW50IVxuICAgIGltcGxpZWRGcm9tUm9sZUlkOiBJbnRcbiAgICBzY2hlbWFOYW1lOiBTdHJpbmdcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHJvbGU6IFN0cmluZyFcbiAgICByb2xlSW1wbGllZEZyb206IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgU2NoZW1hc1xuICAgIFwiXCJcIlxuICAgIHdiTXlTY2hlbWFzKHdpdGhTZXR0aW5nczogQm9vbGVhbik6IFtTY2hlbWFdXG4gICAgd2JNeVNjaGVtYUJ5TmFtZShuYW1lOiBTdHJpbmchLCB3aXRoU2V0dGluZ3M6IEJvb2xlYW4pOiBTY2hlbWFcbiAgICBcIlwiXCJcbiAgICBTY2hlbWEgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNjaGVtYVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ11cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFtTY2hlbWFVc2VyXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIGxhYmVsOiBTdHJpbmchXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkOiBJbnRcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgKTogU2NoZW1hXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSEpOiBCb29sZWFuXG4gICAgd2JTYXZlU2NoZW1hVXNlclNldHRpbmdzKHNjaGVtYU5hbWU6IFN0cmluZyEsIHNldHRpbmdzOiBKU09OISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiTXlTY2hlbWFzOiBhc3luYyAoXywgeyB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlU2NoZW1hcyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlTY2hlbWFCeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUsIHdpdGhTZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFCeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBTY2hlbWEgVXNlcnNcbiAgICB3YlNjaGVtYVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2NoZW1hVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBTY2hlbWFzXG4gICAgd2JDcmVhdGVTY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25Pd25lcklkLCBvcmdhbml6YXRpb25Pd25lck5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlU2NoZW1hKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQsXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFNjaGVtYSBVc2Vyc1xuICAgIHdiU2V0U2NoZW1hVXNlcnNSb2xlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzLCByb2xlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldFNjaGVtYVVzZXJzUm9sZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHJvbGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZVNjaGVtYVVzZXJzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlU2NoZW1hVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlU2NoZW1hVXNlclNldHRpbmdzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCBzZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgR3JhcGhRTEpTT04gfSBmcm9tIFwiZ3JhcGhxbC10eXBlLWpzb25cIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICBzY2FsYXIgSlNPTlxuXG4gIHR5cGUgVGFibGUge1xuICAgIGlkOiBJRCFcbiAgICBzY2hlbWFJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIGNvbHVtbnM6IFtDb2x1bW5dXG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdXNlclJvbGU6IFN0cmluZ1xuICAgIHVzZXJSb2xlSW1wbGllZEZyb206IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbHVtbiB7XG4gICAgaWQ6IElEIVxuICAgIHRhYmxlSWQ6IEludCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICB0eXBlOiBTdHJpbmchXG4gICAgaXNQcmltYXJ5S2V5OiBCb29sZWFuIVxuICAgIGZvcmVpZ25LZXlzOiBbQ29uc3RyYWludElkXSFcbiAgICByZWZlcmVuY2VkQnk6IFtDb25zdHJhaW50SWRdIVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBDb25zdHJhaW50SWQge1xuICAgIGNvbnN0cmFpbnROYW1lOiBTdHJpbmchXG4gICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgIHJlbFRhYmxlTmFtZTogU3RyaW5nXG4gICAgcmVsQ29sdW1uTmFtZTogU3RyaW5nXG4gIH1cblxuICB0eXBlIFRhYmxlVXNlciB7XG4gICAgdGFibGVJZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIHJvbGVJZDogSW50IVxuICAgIGltcGxpZWRGcm9tUm9sZUlkOiBJbnRcbiAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgdXNlckZpcnN0TmFtZTogU3RyaW5nXG4gICAgdXNlckxhc3ROYW1lOiBTdHJpbmdcbiAgICByb2xlOiBTdHJpbmchXG4gICAgcm9sZUltcGxpZWRGcm9tOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFRhYmxlc1xuICAgIFwiXCJcIlxuICAgIHdiTXlUYWJsZXMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB3aXRoQ29sdW1uczogQm9vbGVhblxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW1RhYmxlXVxuICAgIHdiTXlUYWJsZUJ5TmFtZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgd2l0aENvbHVtbnM6IEJvb2xlYW5cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFRhYmxlXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlRhYmxlVXNlcnMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbVGFibGVVc2VyXVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkNvbHVtbnMoc2NoZW1hTmFtZTogU3RyaW5nISwgdGFibGVOYW1lOiBTdHJpbmchKTogW0NvbHVtbl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBUYWJsZXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JVcGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgbmV3VGFibGVOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1RhYmxlTGFiZWw6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkQWxsRXhpc3RpbmdUYWJsZXMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIHBhcmVudFRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgcGFyZW50Q29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIFRhYmxlIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRUYWJsZVVzZXJzUm9sZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5MYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgICBjb2x1bW5UeXBlOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiVXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBuZXdDb2x1bW5OYW1lOiBTdHJpbmdcbiAgICAgIG5ld0NvbHVtbkxhYmVsOiBTdHJpbmdcbiAgICAgIG5ld1R5cGU6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgSlNPTjogR3JhcGhRTEpTT04sXG4gIFF1ZXJ5OiB7XG4gICAgLy8gVGFibGVzXG4gICAgd2JNeVRhYmxlczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgd2l0aENvbHVtbnMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlUYWJsZUJ5TmFtZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB3aXRoQ29sdW1ucywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVUYWJsZUJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFRhYmxlIFVzZXJzXG4gICAgd2JUYWJsZVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbHMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JDb2x1bW5zOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFRhYmxlc1xuICAgIHdiQWRkT3JDcmVhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB0YWJsZUxhYmVsLCBjcmVhdGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdGFibGVMYWJlbCxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JVcGRhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBuZXdUYWJsZU5hbWUsIG5ld1RhYmxlTGFiZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVGFibGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTmFtZSxcbiAgICAgICAgbmV3VGFibGVMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZEFsbEV4aXN0aW5nVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIHBhcmVudFRhYmxlTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgLy8gQ29sdW1uc1xuICAgIHdiQWRkT3JDcmVhdGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWwsIGNyZWF0ZSwgY29sdW1uVHlwZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgY29sdW1uTGFiZWwsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgICAgY29sdW1uVHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiVXBkYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgICBuZXdUeXBlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlQ29sdW1uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscywgcm9sZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zZXRUYWJsZVVzZXJzUm9sZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgcm9sZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuLyoqXG4gKiBPbmx5IGZpZWxkcyByZWxhdGVkIHRvIGFuIGlzb2xhdGVkIHVzZXIgb3Igcm9sZSBvYmplY3RzIGxpdmUgaGVyZVxuICogRm9yIG9yZ2FuaXphdGlvbi11c2Vycywgc2NoZW1hLXVzZXJzLCB0YWJsZS11c2VycyBzZWUgcmVzcGVjdGl2ZSBjbGFzc2VzXG4gKi9cblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFVzZXIge1xuICAgIGlkOiBJRCFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JVc2VyQnlJZChpZDogSUQhKTogVXNlclxuICAgIHdiVXNlckJ5RW1haWwoZW1haWw6IFN0cmluZyEpOiBVc2VyXG4gICAgd2JVc2Vyc0J5U2VhcmNoUGF0dGVybihzZWFyY2hQYXR0ZXJuOiBTdHJpbmchKTogW1VzZXJdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVVzZXIoZW1haWw6IFN0cmluZyEsIGZpcnN0TmFtZTogU3RyaW5nLCBsYXN0TmFtZTogU3RyaW5nKTogVXNlclxuICAgIHdiVXBkYXRlVXNlcihcbiAgICAgIGlkOiBJRCFcbiAgICAgIGVtYWlsOiBTdHJpbmdcbiAgICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgKTogVXNlclxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIC8vIFVzZXJzXG4gICAgd2JVc2VyQnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChjdXJyZW50VXNlciwgaWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2VyQnlFbWFpbDogYXN5bmMgKF8sIHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChjdXJyZW50VXNlciwgZW1haWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2Vyc0J5U2VhcmNoUGF0dGVybjogYXN5bmMgKF8sIHsgc2VhcmNoUGF0dGVybiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJzQnlTZWFyY2hQYXR0ZXJuKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2VhcmNoUGF0dGVyblxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFVzZXJzXG4gICAgd2JDcmVhdGVVc2VyOiBhc3luYyAoXywgeyBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVVzZXIoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVXNlcjogYXN5bmMgKF8sIHsgaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVXNlcihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIGlkLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IEFwb2xsb1NlcnZlciwgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCJ0c2xvZ1wiO1xuaW1wb3J0IHsgREFMIH0gZnJvbSBcIi4vZGFsXCI7XG5pbXBvcnQgeyBoYXN1cmFBcGkgfSBmcm9tIFwiLi9oYXN1cmEtYXBpXCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIHNjaGVtYSwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgdiA9IHJlcXVpcmUoXCJ2b2NhXCIpO1xuaW1wb3J0IHsgdXNlck1lc3NhZ2VzIH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcblxuaW1wb3J0IHtcbiAgQ29sdW1uLFxuICBPcmdhbml6YXRpb24sXG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgU2NoZW1hLFxuICBUYWJsZSxcbiAgVXNlcixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuL2VudGl0eS9DdXJyZW50VXNlclwiO1xuXG5leHBvcnQgY29uc3QgZ3JhcGhxbEhhbmRsZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgc2NoZW1hLFxuICBpbnRyb3NwZWN0aW9uOiB0cnVlLFxuICBjb250ZXh0OiAoeyBldmVudCwgY29udGV4dCB9KSA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGhlYWRlcnM6IGV2ZW50LmhlYWRlcnMsXG4gICAgICBtdWx0aVZhbHVlSGVhZGVyczogZXZlbnQubXVsdGlWYWx1ZUhlYWRlcnMsXG4gICAgICB3YkNsb3VkOiBuZXcgV2hpdGVicmlja0Nsb3VkKCksXG4gICAgfTtcbiAgfSxcbn0pLmNyZWF0ZUhhbmRsZXIoKTtcblxuZXhwb3J0IGNvbnN0IGxvZzogTG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gIG1pbkxldmVsOiBcImRlYnVnXCIsXG59KTtcblxuZXhwb3J0IGNsYXNzIFdoaXRlYnJpY2tDbG91ZCB7XG4gIGRhbCA9IG5ldyBEQUwoKTtcblxuICBwdWJsaWMgZXJyKHJlc3VsdDogU2VydmljZVJlc3VsdCk6IEVycm9yIHtcbiAgICByZXR1cm4gYXBvbGxvRXJyKHJlc3VsdCk7XG4gIH1cblxuICAvLyBvbmx5IGFzeW5jIGZvciB0ZXN0aW5nIC0gZm9yIHRoZSBtb3N0IHBhcnQgc3RhdGljXG4gIHB1YmxpYyBhc3luYyB1aWRGcm9tSGVhZGVycyhcbiAgICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vbG9nLmRlYnVnKFwiPT09PT09PT09PSBIRUFERVJTOiBcIiArIEpTT04uc3RyaW5naWZ5KGhlYWRlcnMpKTtcbiAgICBjb25zdCBoZWFkZXJzTG93ZXJDYXNlID0gT2JqZWN0LmVudHJpZXMoaGVhZGVycykucmVkdWNlKFxuICAgICAgKGFjYzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgW2tleSwgdmFsXSkgPT4gKFxuICAgICAgICAoYWNjW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbCksIGFjY1xuICAgICAgKSxcbiAgICAgIHt9XG4gICAgKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgLy8gaWYgeC1oYXN1cmEtYWRtaW4tc2VjcmV0IGlzIHByZXNlbnQgYW5kIHZhbGlkIGhhc3VyYSBzZXRzIHJvbGUgdG8gYWRtaW5cbiAgICBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IFVzZXIuU1lTX0FETUlOX0lELFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5OT0RFX0VOViA9PSBcImRldmVsb3BtZW50XCIgJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXVxuICAgICkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4odGhpcyksXG4gICAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXVxuICAgICAgKTtcbiAgICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVEVTVCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXX1gXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pIHtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogcGFyc2VJbnQoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGB1aWRGcm9tSGVhZGVyczogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBoZWFkZXJzXG4gICAgICAgICl9YCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgY2xvdWRDb250ZXh0KCk6IG9iamVjdCB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRlZmF1bHRDb2x1bW5UeXBlczogQ29sdW1uLkNPTU1PTl9UWVBFUyxcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIG9yZ2FuaXphdGlvbnM6IFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUyxcbiAgICAgICAgc2NoZW1hczogUm9sZS5TWVNST0xFU19TQ0hFTUFTLFxuICAgICAgICB0YWJsZXM6IFJvbGUuU1lTUk9MRVNfVEFCTEVTLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGVzdCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgcmVzZXRUZXN0RGF0YSgpYCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyhcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKHRoaXMpLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgXCJ0ZXN0XyVcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4odGhpcyksXG4gICAgICAgIHNjaGVtYS5uYW1lLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlVGVzdFVzZXJzKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IEF1dGggPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYXV0aCh1c2VyQXV0aElkOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VySWRGcm9tQXV0aElkKHVzZXJBdXRoSWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgaGFzdXJhVXNlcklkOiBudW1iZXIgPSByZXN1bHQucGF5bG9hZDtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgXCJYLUhhc3VyYS1BbGxvd2VkLVJvbGVzXCI6IFtcIndidXNlclwiXSxcbiAgICAgICAgXCJYLUhhc3VyYS1EZWZhdWx0LVJvbGVcIjogXCJ3YnVzZXJcIixcbiAgICAgICAgXCJYLUhhc3VyYS1Vc2VyLUlkXCI6IGhhc3VyYVVzZXJJZCxcbiAgICAgICAgXCJYLUhhc3VyYS1BdXRoZW50aWNhdGVkLUF0XCI6IERhdGUoKS50b1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGUsXG4gICAgZGVsZXRlT25seT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnModGFibGUuaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFJvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0OiBPcmdhbml6YXRpb24gfCBTY2hlbWEgfCBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0Um9sZSgke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke0pTT04uc3RyaW5naWZ5KG9iamVjdCl9KWBcbiAgICApO1xuICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUsIHJvbGVMZXZlbCkpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBgJHtyb2xlTmFtZX0gaXMgbm90IGEgdmFsaWQgbmFtZSBmb3IgYW4gJHtyb2xlTGV2ZWx9IFJvbGUuYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgc3dpdGNoIChyb2xlTmFtZSkge1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fdXNlclwiOlxuICAgICAgICAgICAgLy8gYXJlIGFueSBvZiB0aGVzZSB1c2VyIGN1cnJlbnRseSBhZG1pbnMgZ2V0dGluZyBkZW1vdGVkP1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhjVSwgb2JqZWN0Lm5hbWUsIHVuZGVmaW5lZCwgW1xuICAgICAgICAgICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50QWRtaW5JZHMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICAgICAgIChvcmdhbml6YXRpb25Vc2VyOiB7IHVzZXJJZDogbnVtYmVyIH0pID0+IG9yZ2FuaXphdGlvblVzZXIudXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZGVtb3RlZEFkbWluczogbnVtYmVyW10gPSB1c2VySWRzLmZpbHRlcigoaWQ6IG51bWJlcikgPT5cbiAgICAgICAgICAgICAgY3VycmVudEFkbWluSWRzLmluY2x1ZGVzKGlkKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChkZW1vdGVkQWRtaW5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgLy8gY29tcGxldGVseSByZW1vdmUgdGhlbSAod2lsbCByYWlzZSBlcnJvciBpZiBubyBhZG1pbnMpXG4gICAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgICAgICAgICAgIGNVLFxuICAgICAgICAgICAgICAgIG9iamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIGRlbW90ZWRBZG1pbnNcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGFkZCBvcmduYWl6YXRpb25fdXNlclxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCI6XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICAgICAgICBvYmplY3QuaWQsXG4gICAgICAgICAgICAgIFJvbGUuT1JHQU5JWkFUSU9OX1RPX1NDSEVNQV9ST0xFX01BUCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1c2VySWRzXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoY1UsIG9iamVjdC5pZCk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmlkLFxuICAgICAgICAgICAgICAgIFJvbGUuU0NIRU1BX1RPX1RBQkxFX1JPTEVfTUFQLFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB1c2VySWRzXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIjpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiOlxuICAgICAgICAvLyBhZGQgc2NoZW1hX3VzZXJcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgLy8gQ2hhbmdpbmcgcm9sZSBhdCB0aGUgc2NoZW1hIGxldmVsIHJlc2V0cyBhbGxcbiAgICAgICAgLy8gdGFibGUgcm9sZXMgdG8gdGhlIHNjaGVtYSBkZWZhdWx0IGluaGVyaXRlbmNlXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgICAgICAgIG9iamVjdC5pZCxcbiAgICAgICAgICBSb2xlLlNDSEVNQV9UT19UQUJMRV9ST0xFX01BUCwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdXNlcklkc1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKHVzZXJJZHMsIHJvbGVMZXZlbCwgb2JqZWN0SWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgLy8gRGVsZXRlIHNjaGVtYSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBvcmdhbml6YXRpb24gYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICBcInNjaGVtYVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIG9yZ2FuaXphdGlvbiBpZFxuICAgICAgICAgIFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBzY2hlbWEgYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoY1UsIG9iamVjdElkKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgIFwidGFibGVcIixcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHNjaGVtYS5pZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgICAgW1wic2NoZW1hX2FkbWluaXN0cmF0b3JcIl1cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCI6XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSB1c2VycyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSB1c2Vyc1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU0NIRU1BX1RPX1RBQkxFX1JPTEVfTUFQKVxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICAgIHVzZXJJZCxcbiAgICAgIHJvbGVMZXZlbCxcbiAgICAgIG9iamVjdElkT3JOYW1lLFxuICAgICAgcGFyZW50T2JqZWN0TmFtZVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0VXNlcnMoKWApO1xuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5SWRzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZHM6IG51bWJlcltdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2VycyhpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGNVOiBDdXJyZW50VXNlciwgaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUlkcyhjVSwgW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBzZWFyY2hQYXR0ZXJuIGFjcm9zcyBtdWx0aXBsZSBmaWVsZHNcbiAgcHVibGljIGFzeW5jIHVzZXJzQnlTZWFyY2hQYXR0ZXJuKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzZWFyY2hQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZWFyY2hQYXR0ZXJuKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5RW1haWxzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnModW5kZWZpbmVkLCB1c2VyRW1haWxzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgZW1haWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIFtlbWFpbF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbZW1haWxdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy8gVEJEOiBhdXRoZW50aWNhdGlvbiwgc2F2ZSBwYXNzd29yZFxuICAgIHJldHVybiB0aGlzLmRhbC5jcmVhdGVVc2VyKGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25JZHM/OiBudW1iZXJbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lcz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnMoXG4gICAgICBvcmdhbml6YXRpb25JZHMsXG4gICAgICBvcmdhbml6YXRpb25OYW1lcyxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeUlkcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWRzOiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5vcmdhbml6YXRpb25zKGNVLCBpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5SWQoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zQnlJZHMoY1UsIFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uc0J5TmFtZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5vcmdhbml6YXRpb25zKGNVLCB1bmRlZmluZWQsIG5hbWVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnNCeU5hbWVzKGNVLCBbbmFtZV0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lUGF0dGVybihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZVBhdHRlcm46IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnMoXG4gICAgICBjVSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIG5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5vcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBbb3JnYW5pemF0aW9uTmFtZV0sXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtvcmdhbml6YXRpb25OYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZU9yZ2FuaXphdGlvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoY1UuaXNTaWduZWRPdXQoKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgY2hlY2tOYW1lUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoY1UsIG5hbWUpO1xuICAgIGlmIChjaGVja05hbWVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTkFNRV9UQUtFTlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIC8vIGllIFdCX09SR0FOSVpBVElPTl9OT1RfRk9VTkQgaXMgdGhlIGRlc2lyZWQgcmVzdWx0XG4gICAgfSBlbHNlIGlmIChjaGVja05hbWVSZXN1bHQud2JDb2RlICE9IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiKSB7XG4gICAgICByZXR1cm4gY2hlY2tOYW1lUmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVPcmdhbml6YXRpb24oXG4gICAgICBuYW1lLFxuICAgICAgbGFiZWxcbiAgICApO1xuICAgIGlmICghY3JlYXRlT3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbih0aGlzKSxcbiAgICAgIG5hbWUsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICBbY1UuaWRdXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbmV3TmFtZT86IHN0cmluZyxcbiAgICBuZXdMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFkbWluaXN0ZXJfb3JnYW5pemF0aW9uXCIsIG5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZU9yZ2FuaXphdGlvbihuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhjVSwgbmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl91c2VyXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCIsXG4gICAgXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFlcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVPcmdhbml6YXRpb24obmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygpYCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb24gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZXM/OiBzdHJpbmdbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuYW1lKTtcbiAgICB9IGVsc2UgaWYgKGlkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5SWQoY1UsIGlkKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGlmIChyb2xlcyAmJiAhUm9sZS5hcmVSb2xlcyhyb2xlcykpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwib3JnYW5pemF0aW9uVXNlcnM6IHJvbGVzIGNvbnRhaW5zIG9uZSBvciBtb3JlIHVucmVjb2duaXplZCBzdHJpbmdzXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvblVzZXJzKG5hbWUsIGlkLCByb2xlcywgdXNlcklkcywgd2l0aFNldHRpbmdzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IHN0cmluZyxcbiAgICByb2xlOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFkbWluaXN0ZXJfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoJHtvcmdhbml6YXRpb25OYW1lfSwke3JvbGV9LCR7dXNlcklkc30sJHt1c2VyRW1haWxzfSlgXG4gICAgKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgIGNVLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICk7XG4gICAgaWYgKCFvcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIG9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgbGV0IHVzZXJJZHNGb3VuZDogbnVtYmVyW10gPSBbXTtcbiAgICBsZXQgdXNlcnNSZXF1ZXN0ZWQ6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXTtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgdXNlcnNSZXF1ZXN0ZWQgPSB1c2VySWRzO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5SWRzKGNVLCB1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHVzZXJzUmVxdWVzdGVkID0gdXNlckVtYWlscztcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MgfHwgIXJlc3VsdC5wYXlsb2FkKSByZXR1cm4gcmVzdWx0O1xuICAgIHVzZXJJZHNGb3VuZCA9IHJlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIGlmICh1c2Vyc1JlcXVlc3RlZC5sZW5ndGggIT0gdXNlcklkc0ZvdW5kLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgdmFsdWVzOiBbXG4gICAgICAgICAgYFJlcXVlc3RlZCAke3VzZXJzUmVxdWVzdGVkLmxlbmd0aH06ICR7dXNlcnNSZXF1ZXN0ZWQuam9pbihcIixcIil9YCxcbiAgICAgICAgICBgRm91bmQgJHt1c2VySWRzRm91bmQubGVuZ3RofTogJHt1c2VySWRzRm91bmQuam9pbihcIixcIil9YCxcbiAgICAgICAgXSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHNGb3VuZCxcbiAgICAgIHJvbGUsXG4gICAgICBcIm9yZ2FuaXphdGlvblwiLFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VySWRzVG9CZVJlbW92ZWQ6IG51bWJlcltdID0gW107XG4gICAgaWYgKHVzZXJJZHMpIHVzZXJJZHNUb0JlUmVtb3ZlZCA9IHVzZXJJZHM7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgdXNlcklkc1RvQmVSZW1vdmVkID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIGNoZWNrIG5vdCBhbGwgdGhlIGFkbWlucyB3aWxsIGJlIHJlbW92ZWRcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvblVzZXJzKGNVLCBvcmdhbml6YXRpb25OYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGFsbEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG5cbiAgICBpZiAoXG4gICAgICBhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzVG9CZVJlbW92ZWQuaW5jbHVkZXMoZWxlbSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT19BRE1JTlNcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkc1RvQmVSZW1vdmVkLFxuICAgICAgXCJvcmdhbml6YXRpb25cIixcbiAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzKFxuICAgICAgc2NoZW1hSWRzLFxuICAgICAgc2NoZW1hTmFtZXMsXG4gICAgICBzY2hlbWFOYW1lUGF0dGVyblxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlJZHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkczogbnVtYmVyW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyhjVSwgaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeUlkKGNVOiBDdXJyZW50VXNlciwgaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5SWRzKGNVLCBbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU5hbWVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyhjVSwgdW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlOYW1lcyhjVSwgW25hbWVdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5TmFtZVBhdHRlcm4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKGNVLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZVBhdHRlcm4pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5VXNlck93bmVyKHVzZXJJZCwgdXNlckVtYWlsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgICBvcmdhbml6YXRpb25JZCxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4odXNlcklkLCB1c2VyRW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVTY2hlbWFCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFtzY2hlbWFOYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuc2NoZW1hc0J5VXNlcnMoXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIG9yZ2FuaXphdGlvbk93bmVyIG9yZ2FuaXphdGlvbiBhZG1pbnMgYXJlIGltcGxpY2l0bHkgZ3JhbnRlZCBzY2hlbWEgYWRtaW4gcm9sZXNcbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGNyZWF0ZVNjaGVtYSgke2NVLmlkfSwke25hbWV9LCR7bGFiZWx9LCR7b3JnYW5pemF0aW9uT3duZXJJZH0sJHtvcmdhbml6YXRpb25Pd25lck5hbWV9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgdXNlck93bmVySWQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICAvLyBydW4gY2hlY2tzIGZvciBvcmdhbml6YXRpb24gb3duZXJcbiAgICBpZiAob3JnYW5pemF0aW9uT3duZXJJZCB8fCBvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgIGlmICghb3JnYW5pemF0aW9uT3duZXJJZCAmJiBvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoY1UsIG9yZ2FuaXphdGlvbk93bmVyTmFtZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgY1UuaXNOb3RTeXNBZG1pbigpICYmXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgJiZcbiAgICAgICAgKGF3YWl0IGNVLmNhbnQoXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk93bmVySWQpKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9JTl9PUkdcIixcbiAgICAgICAgICB2YWx1ZXM6IFtjVS50b1N0cmluZygpLCBvcmdhbml6YXRpb25Pd25lcklkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB1c2VyT3duZXJJZCA9IGNVLmlkO1xuICAgIH1cbiAgICAvLyBDaGVjayBuYW1lXG4gICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcInBnX1wiKSB8fCBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5pbmNsdWRlcyhuYW1lKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9CQURfU0NIRU1BX05BTUVcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVTY2hlbWEoXG4gICAgICBuYW1lLFxuICAgICAgbGFiZWwsXG4gICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgdXNlck93bmVySWRcbiAgICApO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgaWYgKG9yZ2FuaXphdGlvbk93bmVySWQpIHtcbiAgICAgIC8vIElmIG93bmVyIGlzIGFuIG9yZ2FuaXphdGlvbiBhbmQgY3VycmVudCB1c2VyIGlzIG5vdCBhbiBhZG1pbiBvZiB0aGUgb3JnYW5pemF0aW9uLFxuICAgICAgLy8gYWRkIHRoZSB1c2VyIGFzIGEgc2NoZW1hIGFkbWluIHNvIHRoZXkgZG9udCBsb3NlIGFjY2Vzc1xuICAgICAgaWYgKFxuICAgICAgICBjVS5pc05vdFN5c0FkbWluKCkgJiZcbiAgICAgICAgKGF3YWl0IGNVLmNhbihcImFkbWluaXN0ZXJfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk93bmVySWQpKVxuICAgICAgKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBbY1UuaWRdLFxuICAgICAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgLy8gRXZlcnkgb3JnYW5pemF0aW9uIGFkbWluIGlzIGltcGxpY2l0bHkgYWxzbyBhIHNjaGVtYSBhZG1pblxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBSb2xlLk9SR0FOSVpBVElPTl9UT19TQ0hFTUFfUk9MRV9NQVAsXG4gICAgICAgIFtzY2hlbWFSZXN1bHQucGF5bG9hZC5pZF1cbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIElmIG93bmVyIGlzIGEgdXNlciwgYWRkIHRoZW0gdG8gc2NoZW1hX3VzZXJzIHRvIHNhdmUgc2V0dGluZ3NcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgY1UsXG4gICAgICAgIFtjVS5pZF0sXG4gICAgICAgIFwic2NoZW1hX293bmVyXCIsXG4gICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlU2NoZW1hKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgZGVsOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgcmVtb3ZlT3JEZWxldGVTY2hlbWEoJHtzY2hlbWFOYW1lfSwke2RlbH0pYCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVUYWJsZShjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSwgZGVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lLCBkZWwpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gU2NoZW1hIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHVzZXJJZHMgPSB1bmRlZmluZWQ7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgICAgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFVc2VycyhzY2hlbWFOYW1lLCB1c2VySWRzLCB3aXRoU2V0dGluZ3MpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFNjaGVtYVVzZXJzUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IHN0cmluZ1tdLFxuICAgIHJvbGU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgaWYgKHVzZXJzUmVzdWx0LnBheWxvYWQubGVuZ3RoICE9IHVzZXJFbWFpbHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IHVzZXJFbWFpbHMuZmlsdGVyKFxuICAgICAgICAgICh4OiBzdHJpbmcpID0+ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkLmluY2x1ZGVzKHgpXG4gICAgICAgICksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgcm9sZSxcbiAgICAgIFwic2NoZW1hXCIsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlU2NoZW1hVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoY1UsIHNjaGVtYU5hbWUpO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgaWYgKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZCAmJlxuICAgICAgdXNlcklkcy5pbmNsdWRlcyhzY2hlbWFSZXN1bHQucGF5bG9hZC51c2VyX293bmVyX2lkKVxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfVVNFUl9PV05FUlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgXCJzY2hlbWFcIixcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgICAgIGlmICghY29sdW1uc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gY29sdW1uc1Jlc3VsdDtcbiAgICAgICAgdGFibGUuY29sdW1ucyA9IGNvbHVtbnNSZXN1bHQucGF5bG9hZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVUYWJsZUJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHdpdGhDb2x1bW5zPzogYm9vbGVhbixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlc0J5VXNlcnMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFt0YWJsZU5hbWVdLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFt0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgcmVzdWx0LnBheWxvYWQubmFtZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHJlc3VsdC5wYXlsb2FkLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVRhYmxlcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHdpdGhDb2x1bW5zPzogYm9vbGVhbixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlc0J5VXNlcnMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHdpdGhDb2x1bW5zKSB7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKGNVLCBzY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICAgICAgaWYgKCFjb2x1bW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjb2x1bW5zUmVzdWx0O1xuICAgICAgICB0YWJsZS5jb2x1bW5zID0gY29sdW1uc1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlVGFibGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZUxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWRkT3JDcmVhdGVUYWJsZSgke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3RhYmxlTGFiZWx9LCR7Y3JlYXRlfSlgXG4gICAgKTtcbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIHRhYmxlTGFiZWwsXG4gICAgICBjcmVhdGVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZERlZmF1bHRUYWJsZVVzZXJzVG9UYWJsZShcbiAgICAgIGNVLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgdGFibGVSZXN1bHQucGF5bG9hZC5zY2hlbWFOYW1lID0gc2NoZW1hTmFtZTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgLy8gMS4gcmVtb3ZlL2RlbGV0ZSBjb2x1bW5zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBjVSxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgZGVsLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyAzLiByZW1vdmUgdXNlciBzZXR0aW5nc1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFRhYmxlVXNlcnModGFibGVSZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgICBjVSxcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIDQuIHJlbW92ZS9kZWxldGUgdGhlIHRhYmxlXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVzKGNVLCBzY2hlbWFOYW1lLCBmYWxzZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdUYWJsZU5hbWVzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXhpc3RpbmdUYWJsZU5hbWVzLmluY2x1ZGVzKG5ld1RhYmxlTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9UQUJMRV9OQU1FX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBuZXdUYWJsZU5hbWUsXG4gICAgICBuZXdUYWJsZUxhYmVsXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZEFsbEV4aXN0aW5nVGFibGVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRpc2NvdmVyVGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgdGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHRhYmxlTmFtZXMpIHtcbiAgICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgICBjVSxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB2LnRpdGxlQ2FzZSh0YWJsZU5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCIgXCIpKSxcbiAgICAgICAgZmFsc2VcbiAgICAgICk7XG4gICAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlckNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBjb2x1bW5zID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgICAgdi50aXRsZUNhc2UoY29sdW1uLm5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCIgXCIpKSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICByZW1vdmU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICBcIiVcIixcbiAgICAgIFwiJVwiLFxuICAgICAgXCJBTExcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDb25zdHJhaW50SWRbXSA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGlmIChyZWxhdGlvbnNoaXBzLmxlbmd0aCA+IDApIHtcbiAgICAgIGZvciAoY29uc3QgcmVsYXRpb25zaGlwIG9mIHJlbGF0aW9uc2hpcHMpIHtcbiAgICAgICAgaWYgKHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWUgJiYgcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWUpIHtcbiAgICAgICAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICAgIGlmIChyZW1vdmUpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgICAgIGNVLFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAudGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLmNvbHVtbk5hbWVdLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWVdXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgICAgXCJhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogQ29uc3RyYWludElkIG11c3QgaGF2ZSByZWxUYWJsZU5hbWUgYW5kIHJlbENvbHVtbk5hbWVcIixcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgLy8gZG9udCBhZGQgcGVybWlzc2lvbnMgZm9yIHRhYmxlcyB3aXRoIG5vIGNvbHVtbnNcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICk7XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlIG9mIFJvbGUuaGFzdXJhVGFibGVQZXJtaXNzaW9uQ2hlY2tzQW5kVHlwZXMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlLnBlcm1pc3Npb25DaGVjayxcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrQW5kVHlwZS5wZXJtaXNzaW9uVHlwZSxcbiAgICAgICAgXCJ3YnVzZXJcIixcbiAgICAgICAgY29sdW1uTmFtZXNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICAvLyBJZiB0aGlzIHRhYmxlIG5vIGxvbmdlciBoYXMgYW55IGNvbHVtbnMsIHRoZXJlIHdpbGwgYmUgbm8gcGVybWlzc2lvbnNcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKGNVLCB0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcGF5bG9hZDogdHJ1ZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcGVybWlzc2lvbktleUFuZFR5cGUgb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kVHlwZXMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5kZWxldGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uS2V5QW5kVHlwZS50eXBlLFxuICAgICAgICBcIndidXNlclwiXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFBhc3MgZW1wdHkgY29sdW1uTmFtZXNbXSB0byBjbGVhclxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5wcmltYXJ5S2V5cyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgZXhpc3RpbmdDb25zdHJhaW50TmFtZXMgPSBPYmplY3QudmFsdWVzKHJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBtdWx0aXBsZSBjb3VsbW4gcHJpbWFyeSBrZXlzIHdpbGwgYWxsIGhhdmUgc2FtZSBjb25zdHJhaW50IG5hbWVcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlQ29uc3RyYWludChcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICBleGlzdGluZ0NvbnN0cmFpbnROYW1lc1swXSBhcyBzdHJpbmdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGV4aXN0aW5nQ29uc3RyYWludE5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9QS19FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlUHJpbWFyeUtleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lc1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJDUkVBVEVcIjtcbiAgICBpZiAoIWNyZWF0ZSkgb3BlcmF0aW9uID0gXCJBRERcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXMsXG4gICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJERUxFVEVcIjtcbiAgICBpZiAoIWRlbCkgb3BlcmF0aW9uID0gXCJSRU1PVkVcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXMsXG4gICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICBbXSxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBvcGVyYXRpb24gPSBcIkFERHxDUkVBVEV8UkVNT1ZFfERFTEVURVwiXG4gIHB1YmxpYyBhc3luYyBzZXRGb3JlaWduS2V5KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXNbMF0sXG4gICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nRm9yZWlnbktleXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGNvbnN0cmFpbnRJZCBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb25zdHJhaW50SWQuY29sdW1uTmFtZV0gPVxuICAgICAgICBjb25zdHJhaW50SWQuY29uc3RyYWludE5hbWU7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdGb3JlaWduS2V5cykuaW5jbHVkZXMoY29sdW1uTmFtZSkpIHtcbiAgICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIlJFTU9WRVwiIHx8IG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRyb3BSZWxhdGlvbnNoaXBzKFxuICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgIHBhcmVudFRhYmxlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29sdW1uTmFtZV0gYXMgc3RyaW5nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgICB3YkNvZGU6IFwiV0JfRktfRVhJU1RTXCIsXG4gICAgICAgICAgICB2YWx1ZXM6IFtjb2x1bW5OYW1lXSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvcGVyYXRpb24gPT0gXCJBRERcIiB8fCBvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICAgIHBhcmVudENvbHVtbk5hbWVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgcGFyZW50VGFibGVOYW1lIC8vIGF1dGhvcnNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lcyAvLyBhdXRob3JfaWRcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoY1UsIHRhYmxlKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucygke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhjVSwgdGFibGUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZSh0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGUgVXNlcnM9PT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VycyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCB1c2VySWRzID0gdW5kZWZpbmVkO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICAgIHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwudGFibGVVc2VycyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJJZHMsIHdpdGhTZXR0aW5ncyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgIHRhYmxlLnNjaGVtYUlkLFxuICAgICAgUm9sZS5TQ0hFTUFfVE9fVEFCTEVfUk9MRV9NQVAsXG4gICAgICBbdGFibGUuaWRdXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRUYWJsZVVzZXJzUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IFtzdHJpbmddLFxuICAgIHJvbGU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBpZiAodXNlcnNSZXN1bHQucGF5bG9hZC5sZW5ndGggIT0gdXNlckVtYWlscy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogdXNlckVtYWlscy5maWx0ZXIoXG4gICAgICAgICAgKHg6IHN0cmluZykgPT4gIXVzZXJzUmVzdWx0LnBheWxvYWQuaW5jbHVkZXMoeClcbiAgICAgICAgKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoY1UsIHVzZXJJZHMsIHJvbGUsIFwidGFibGVcIiwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gIH1cblxuICAvLyBub3QgdXNlZCB5ZXRcbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIC8vIFRCRCBkbyBhbnkgY2hlY2tzIGFnYWluc3Qgc2NoZW1hXG4gICAgLy8gY29uc3QgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgLy8gLy8gY2hlY2sgbm90IGFsbCB0aGUgYWRtaW5zIHdpbGwgYmUgcmVtb3ZlZFxuICAgIC8vIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMob3JnYW5pemF0aW9uTmFtZSwgW1xuICAgIC8vICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIC8vIF0pO1xuICAgIC8vIGlmICghYWRtaW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBhZG1pbnNSZXN1bHQ7XG4gICAgLy8gY29uc3QgYWxsQWRtaW5JZHMgPSBhZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgLy8gICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICAvLyApO1xuICAgIC8vIGlmIChhbGxBZG1pbklkcy5ldmVyeSgoZWxlbTogbnVtYmVyKSA9PiB1c2VySWRzLmluY2x1ZGVzKGVsZW0pKSkge1xuICAgIC8vICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgLy8gICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TXCIsXG4gICAgLy8gICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIC8vIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcnNSZXN1bHQucGF5bG9hZCxcbiAgICAgIFwidGFibGVcIixcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgY1UuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucHJpbWFyeUtleXMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHBLQ29sc0NvbnN0cmFpbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcEtDb2x1bW5OYW1lczogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhwS0NvbHNDb25zdHJhaW50cyk7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW4gb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIGNvbHVtbi5pc1ByaW1hcnlLZXkgPSBwS0NvbHVtbk5hbWVzLmluY2x1ZGVzKGNvbHVtbi5uYW1lKTtcbiAgICAgIGNvbnN0IGZvcmVpZ25LZXlzUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIFwiRk9SRUlHTl9LRVlTXCJcbiAgICAgICk7XG4gICAgICBpZiAoIWZvcmVpZ25LZXlzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb2x1bW4uZm9yZWlnbktleXMgPSBmb3JlaWduS2V5c1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgY29uc3QgcmVmZXJlbmNlc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBcIlJFRkVSRU5DRVNcIlxuICAgICAgKTtcbiAgICAgIGlmICghcmVmZXJlbmNlc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29sdW1uLnJlZmVyZW5jZWRCeSA9IHJlZmVyZW5jZXNSZXN1bHQucGF5bG9hZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUNvbHVtbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5MYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW4sXG4gICAgY29sdW1uVHlwZT86IHN0cmluZyxcbiAgICBza2lwVHJhY2tpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhZGRPckNyZWF0ZUNvbHVtbigke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWV9LCR7Y29sdW1uTGFiZWx9LCR7Y3JlYXRlfSwke2NvbHVtblR5cGV9LCR7c2tpcFRyYWNraW5nfSlgXG4gICAgKTtcbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBjb2x1bW5MYWJlbCxcbiAgICAgIGNyZWF0ZSxcbiAgICAgIGNvbHVtblR5cGVcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiAhc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gTXVzdCBlbnRlciBhbmQgZXhpdCB3aXRoIHRyYWNrZWQgdGFibGUsIHJlZ2FyZGxlc3Mgb2YgaWYgdGhlcmUgYXJlIGNvbHVtbnNcbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW4sXG4gICAgc2tpcFRyYWNraW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlT3JEZWxldGVDb2x1bW4oJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke2RlbH0pYFxuICAgICk7XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmICghc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgZGVsXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIFRCRDogaWYgdGhpcyBpcyBhIGZrXG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdDb2x1bW5OYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nQ29sdW1uTmFtZXMuaW5jbHVkZXMobmV3Q29sdW1uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9DT0xVTU5fTkFNRV9FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdUeXBlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgIG5ld1R5cGVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuLyoqXG4gKiA9PT09PT09PT09IEVycm9yIEhhbmRsaW5nID09PT09PT09PT1cbiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gZXJyUmVzdWx0KHJlc3VsdD86IFNlcnZpY2VSZXN1bHQpOiBTZXJ2aWNlUmVzdWx0IHtcbiAgaWYgKCFyZXN1bHQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBcIlJlc3VsdCBoYXMgbm90IGJlZW4gYXNzaWduZWRcIixcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cbiAgaWYgKHJlc3VsdC5zdWNjZXNzID09IHRydWUpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiV2hpdGVicmlja0Nsb3VkIGVyclJlc3VsdDogcmVzdWx0IGlzIG5vdCBhbiBlcnJvciAoc3VjY2Vzcz09dHJ1ZSlcIixcbiAgICB9O1xuICB9IGVsc2UgaWYgKCEoXCJzdWNjZXNzXCIgaW4gcmVzdWx0KSkge1xuICAgIHJlc3VsdC5zdWNjZXNzID0gZmFsc2U7XG4gIH1cbiAgaWYgKCFyZXN1bHQubWVzc2FnZSAmJiByZXN1bHQud2JDb2RlKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSB1c2VyTWVzc2FnZXNbcmVzdWx0LndiQ29kZV1bMF07XG4gICAgaWYgKCFyZXN1bHQubWVzc2FnZSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYFdoaXRlYnJpY2tDbG91ZCBlcnJSZXN1bHQ6IENvdWxkIG5vdCBmaW5kIG1lc3NhZ2UgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICAgIH07XG4gICAgfVxuICB9XG4gIGlmIChyZXN1bHQudmFsdWVzKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSBgJHtyZXN1bHQubWVzc2FnZX0gVmFsdWVzOiAke3Jlc3VsdC52YWx1ZXMuam9pbihcIiwgXCIpfWA7XG4gICAgZGVsZXRlIHJlc3VsdC52YWx1ZXM7XG4gIH1cbiAgaWYgKFxuICAgICFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlICYmXG4gICAgcmVzdWx0LndiQ29kZSAmJlxuICAgIE9iamVjdC5rZXlzKHVzZXJNZXNzYWdlcykuaW5jbHVkZXMocmVzdWx0LndiQ29kZSkgJiZcbiAgICB1c2VyTWVzc2FnZXNbcmVzdWx0LndiQ29kZV0ubGVuZ3RoID09IDJcbiAgKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IHVzZXJNZXNzYWdlc1tyZXN1bHQud2JDb2RlXVsxXTtcbiAgfSBlbHNlIGlmIChcbiAgICAhcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSAmJlxuICAgIHJlc3VsdC53YkNvZGUgJiZcbiAgICAhT2JqZWN0LmtleXModXNlck1lc3NhZ2VzKS5pbmNsdWRlcyhyZXN1bHQud2JDb2RlKVxuICApIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IGBXaGl0ZWJyaWNrQ2xvdWQgZXJyOiBDb3VsZCBub3QgZmluZCBhcG9sbG9FcnJvckNvZGUgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKCFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCI7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwb2xsb0VycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gIHJlc3VsdCA9IGVyclJlc3VsdChyZXN1bHQpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKFxuICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQuZXJyOiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiXG4gICAgKTtcbiAgfVxuICBjb25zdCBkZXRhaWxzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGlmICghcmVzdWx0Lm1lc3NhZ2UpIHJlc3VsdC5tZXNzYWdlID0gXCJVbmtub3duIGVycm9yLlwiO1xuICBpZiAocmVzdWx0LnJlZkNvZGUpIGRldGFpbHMucmVmQ29kZSA9IHJlc3VsdC5yZWZDb2RlO1xuICBpZiAocmVzdWx0LndiQ29kZSkgZGV0YWlscy53YkNvZGUgPSByZXN1bHQud2JDb2RlO1xuICByZXR1cm4gbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCByZXN1bHQuYXBvbGxvRXJyb3JDb2RlLCBkZXRhaWxzKTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10b29sc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10eXBlLWpzb25cIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImxvZGFzaFwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ2b2NhXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2hpdGVicmljay1jbG91ZC50c1wiKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBZUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOzs7QUFHQTtBQUNBOzs7Ozs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7Ozs7OztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBRUE7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FBUUE7Ozs7Ozs7Ozs7OztBQVlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FBT0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7OztBQWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQVFBOzs7Ozs7Ozs7Ozs7O0FBYUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBOEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTs7Ozs7Ozs7Ozs7Ozs7O0FBZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQXY5REE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDakJBO0FBc0JBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQTFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDYkE7QUFFQTtBQUVBO0FBRUE7QUFnQkE7QUFaQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUtBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUtBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBRUE7QUFRQTtBQUNBO0FBSUE7QUFHQTtBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBcFRBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ05BO0FBV0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFuQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFnQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBaERBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3FCQTtBQTZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBSUE7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQXpLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDeEVBO0FBc0JBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQW5EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNUQTtBQWdCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBL0NBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0RBO0FBY0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUF4Q0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDSEE7QUFpQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFqREE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDREE7QUFXQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2hGQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQVdBO0FBeVJBO0FBdlJBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7O0FBbFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTZSQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUN0VEE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzFEQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBNEJBOzs7Ozs7Ozs7O0FBVUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbEdBO0FBQ0E7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEwRUE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNuTkE7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFxRUE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMzS0E7QUFDQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5S0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQVNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3ZjQTtBQUNBO0FBUUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUErQkE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBU0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBbTBEQTtBQWowREE7QUFDQTtBQUNBO0FBR0E7O0FBSUE7QUFNQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFJQTtBQUFBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQUVBO0FBS0E7QUFBQTtBQUNBO0FBRUE7QUFNQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFNQTtBQUFBO0FBR0E7QUFNQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBT0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFNQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUFBO0FBTUE7O0FBTUE7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBTUE7QUFBQTtBQUVBOztBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBRUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBTUE7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUlBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBTUE7QUFBQTtBQUdBOztBQU9BO0FBR0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFHQTtBQUVBO0FBRUE7QUFPQTtBQUFBO0FBQ0E7QUFFQTtBQUtBO0FBQUE7QUFFQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFJQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFTQTtBQUNBO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFHQTs7QUFTQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUtBO0FBQUE7QUFFQTs7QUFPQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBQ0E7QUFBQTtBQWdCQTtBQUtBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBS0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBVUE7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFRQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVVBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQXAwREE7QUEwMERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWpEQTtBQW1EQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBWkE7QUFDQTtBQUNBO0E7Ozs7Ozs7O0FDbDZEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QSIsInNvdXJjZVJvb3QiOiIifQ==