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
            whitebrick_cloud_1.log.debug(`dal.roleAndIdForUserObject(${userId},${roleLevel},${objectIdOrName},${parentObjectName})`);
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
         JOIN wb.table_users ON wb.roles.id=wb.table_users.role_id
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
            SELECT wb.tables.id as object_id
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
            if (results[1] && !results[1].success)
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
                params.push(emails.map((v) => v.toLowerCase()));
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
    createUser(authId, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.users(
          auth_id, email, first_name, last_name
        ) VALUES($1, $2, $3, $4) RETURNING *
      `,
                params: [authId, email, firstName, lastName],
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
        WHERE email like 'test_%${environment_1.environment.testUserEmailDomain}'
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
                sqlWhere += " AND wb.organizations.name=ANY($2)";
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
    organizationUsers(name, id, roleNames, userIds, withSettings) {
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
            if (roleNames) {
                sqlWhere += " AND wb.roles.name=ANY($2)";
                params.push(roleNames);
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
    schemas(schemaIds, schemaNames, schemaNamePattern, orderBy, limit, wbOnly) {
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
            else {
                return whitebrick_cloud_1.errResult({
                    message: "dal.schemas: One of schemaIds, schemaNames or schemaNamePattern must be specified.",
                });
            }
            let sqlOrderBy = "ORDER BY name";
            if (orderBy) {
                const split = orderBy.split(" ");
                sqlOrderBy = `ORDER BY ${DAL.sanitize(split[0])}`;
                if (split.length == 2)
                    sqlOrderBy += ` ${DAL.sanitize(split[1])}`;
            }
            let sqlLimit = "";
            if (limit)
                sqlLimit = `LIMIT ${limit}`;
            const queries = [
                {
                    query: `
          SELECT wb.schemas.*
          FROM wb.schemas
          ${sqlWbWhere}
          ${sqlOrderBy}
          ${sqlLimit}
        `,
                    params: wbParams,
                },
            ];
            if (!wbOnly && !limit) {
                queries.push({
                    query: `
          SELECT information_schema.schemata.*
          FROM information_schema.schemata
          WHERE schema_name NOT LIKE 'pg_%'
          AND schema_name!=ANY($1)
          ${sqlPgWhere}
        `,
                    params: pgParams,
                });
            }
            const results = yield this.executeQueries(queries);
            if (!results[0].success)
                return results[0];
            if (!wbOnly) {
                if (!results[1].success)
                    return results[1];
                if (results[0].payload.rows.length != results[1].payload.rows.length) {
                    return whitebrick_cloud_1.errResult({
                        message: "dal.schemas: wb.schemas out of sync with information_schema.schemata",
                    });
                }
            }
            results[0].payload = entity_1.Schema.parseResult(results[0].payload);
            return results[0];
        });
    }
    discoverSchemas(schemaNamePattern, orderBy, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!schemaNamePattern)
                schemaNamePattern = "%";
            if (!orderBy)
                orderBy = "schema_name";
            let sqlLimit = "";
            if (limit)
                sqlLimit = `LIMIT ${limit}`;
            const result = yield this.executeQuery({
                query: `
        SELECT information_schema.schemata.schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT LIKE 'pg_%'
        AND schema_name!=ANY($1)
        AND schema_name LIKE '${schemaNamePattern}'
        ORDER BY ${orderBy}
        ${sqlLimit}
      `,
                params: [entity_1.Schema.SYS_SCHEMA_NAMES],
            });
            if (result.success) {
                result.payload = result.payload.rows.map((row) => row.schema_name);
            }
            return result;
        });
    }
    nextUnassignedDemoSchema(schemaNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `
        SELECT wb.schemas.*
        FROM wb.schemas
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        WHERE wb.schemas.name LIKE '${schemaNamePattern}'
        AND wb.schema_users.user_id=${entity_1.User.SYS_ADMIN_ID}
      `,
            });
            if (result.success)
                result.payload = entity_1.Schema.parseResult(result.payload)[0];
            return result;
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
    schemasByOrganizationOwner(currentUserId, organizationId, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [];
            let sqlWhere = "";
            if (organizationId) {
                sqlWhere = "WHERE wb.organizations.id=$1";
                params.push(organizationId);
            }
            else if (organizationName) {
                sqlWhere = `WHERE wb.organizations.name=$1`;
                params.push(organizationName);
            }
            if (currentUserId) {
                sqlWhere += `AND wb.schema_users.user_id=$2`;
                params.push(currentUserId);
            }
            const result = yield this.executeQuery({
                query: `
        SELECT
        wb.schemas.*,
        wb.roles.name as role_name,
        schema_user_implied_roles.name as role_implied_from,
        wb.organizations.name as organization_owner_name
        FROM wb.schemas
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        LEFT JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.roles on wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.roles schema_user_implied_roles ON wb.schema_users.implied_from_role_id=schema_user_implied_roles.id
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
    addOrCreateSchema(name, label, organizationOwnerId, userOwnerId, create) {
        return __awaiter(this, void 0, void 0, function* () {
            name = DAL.sanitize(name);
            const queries = [
                {
                    query: `
          INSERT INTO wb.schemas(
            name, label, organization_owner_id, user_owner_id
          ) VALUES($1, $2, $3, $4) RETURNING *
        `,
                    params: [name, label, organizationOwnerId, userOwnerId],
                },
            ];
            if (create) {
                queries.push({
                    query: `CREATE SCHEMA ${name}`,
                });
            }
            const results = yield this.executeQueries(queries);
            if (!results[0].success)
                return results[0];
            if (create && !results[1].success)
                return results[1];
            results[0].payload = entity_1.Schema.parseResult(results[0].payload)[0];
            return results[0];
        });
    }
    updateSchema(schema, newSchemaName, newSchemaLabel, newOrganizationOwnerId, newUserOwnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.updateSchema(${schema},${newSchemaName},${newSchemaLabel},${newOrganizationOwnerId},${newUserOwnerId})`);
            if (newSchemaName)
                newSchemaName = DAL.sanitize(newSchemaName);
            let params = [];
            let query = `
      UPDATE wb.schemas SET
    `;
            let updates = [];
            if (newSchemaName) {
                params.push(newSchemaName);
                updates.push("name=$" + params.length);
            }
            if (newSchemaLabel) {
                params.push(newSchemaLabel);
                updates.push("label=$" + params.length);
            }
            if (newOrganizationOwnerId) {
                params.push(newOrganizationOwnerId);
                updates.push("organization_owner_id=$" + params.length);
                updates.push("organization_user_id=NULL");
            }
            if (newUserOwnerId) {
                params.push(newUserOwnerId);
                updates.push("user_owner_id=$" + params.length);
                updates.push("organization_owner_id=NULL");
            }
            params.push(schema.id);
            query += `
      ${updates.join(", ")}
      WHERE id=$${params.length}
      RETURNING *
    `;
            const queriesAndParams = [
                {
                    query: query,
                    params: params,
                },
            ];
            if (newSchemaName) {
                queriesAndParams.push({
                    query: `
          ALTER SCHEMA "${schema.name}"
          RENAME TO ${newSchemaName}
        `,
                });
            }
            const results = yield this.executeQueries(queriesAndParams);
            if (newSchemaName && !results[1].success)
                return results[1];
            if (results[0].success) {
                results[0].payload = entity_1.Schema.parseResult(results[0].payload)[0];
            }
            return results[0];
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
    schemaUsers(schemaName, roleNames, userIds, impliedFromRoleId, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = [schemaName];
            let sqlSelect = "";
            let sqlWhere = "";
            if (roleNames) {
                params.push(roleNames);
                sqlWhere = `AND wb.roles.name=ANY($${params.length})`;
            }
            if (userIds) {
                params.push(userIds);
                sqlWhere = `AND wb.schema_users.user_id=ANY($${params.length})`;
            }
            if (impliedFromRoleId) {
                params.push(impliedFromRoleId);
                sqlWhere = `AND wb.schema_users.implied_from_role_id=${params.length}`;
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
            query += `
      ${updates.join(", ")}
      WHERE id=$${params.length}
      RETURNING *
    `;
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
            if (newTableName && !results[1].success)
                return results[1];
            if (results[0].success) {
                results[0].payload = entity_1.Table.parseResult(results[0].payload)[0];
                results[0].payload.schemaName = schemaName;
            }
            return results[0];
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
    setSchemaUserRolesFromOrganizationRoles(organizationId, roleMap, schemaIds, userIds, clearExistingImpliedFromRoleName) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.setSchemaUserRolesFromOrganizationRoles(${organizationId}, <roleMap>, ${schemaIds}, ${userIds}, ${clearExistingImpliedFromRoleName})`);
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
            if (clearExistingImpliedFromRoleName) {
                const impliedFromRoleResult = yield this.roleByName(clearExistingImpliedFromRoleName);
                if (!impliedFromRoleResult.success)
                    return impliedFromRoleResult;
                queryParams.push({
                    query: `
          DELETE FROM wb.schema_users
          WHERE
            wb.schema_users.schema_id IN (
              SELECT id FROM wb.schemas
              WHERE wb.schemas.organization_owner_id=$1
              ${whereSchemasSql}
            )
            AND wb.schema_users.implied_from_role_id=${impliedFromRoleResult.payload.id}
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
            if (roleMap) {
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
            }
            const results = yield this.executeQueries(queryParams);
            return results[results.length - 1];
        });
    }
    setTableUserRolesFromSchemaRoles(schemaId, roleMap, tableIds, userIds, clearExisting) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.debug(`dal.setTableUserRolesFromSchemaRoles(${schemaId}, ${JSON.stringify(roleMap)}, ${tableIds}, ${userIds}, ${clearExisting})`);
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
    columnBySchemaNameTableNameColumnName(schemaName, tableName, columnName) {
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
      SELECT wb.columns.*,
      information_schema.columns.data_type as type,
      information_schema.columns.column_default as default
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
            if (create && !results[1].success)
                return results[1];
            return results[0];
        });
    }
    updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            columnName = DAL.sanitize(columnName);
            const queriesAndParams = [];
            if (newColumnName || newColumnLabel) {
                let result = yield this.columnBySchemaNameTableNameColumnName(schemaName, tableName, columnName);
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
    addSequenceToColumn(schema, table, column, nextSeqNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!nextSeqNumber) {
                const nextSeqNumberResult = yield this.executeQuery({
                    query: `
          SELECT ${column.name} as max_val
          FROM ${schema.name}.${table.name}
          ORDER BY ${column.name} DESC
          LIMIT 1
        `,
                });
                if (nextSeqNumberResult.success &&
                    nextSeqNumberResult.payload.rows.length == 1) {
                    nextSeqNumber =
                        parseInt(nextSeqNumberResult.payload.rows[0].max_val) + 1;
                }
            }
            if (!nextSeqNumber || nextSeqNumber < 1)
                nextSeqNumber = 1;
            const sequencName = `wbseq_s${schema.id}_t${table.id}_c${column.id}`;
            whitebrick_cloud_1.log.warn("nextSeqNumber" + nextSeqNumber);
            const result = yield this.executeQueries([
                {
                    query: `CREATE SEQUENCE ${schema.name}.${sequencName};`,
                },
                {
                    query: `ALTER TABLE ${schema.name}.${table.name} ALTER COLUMN ${column.name} SET DEFAULT nextval('${schema.name}."${sequencName}"')`,
                },
                {
                    query: `ALTER SEQUENCE ${schema.name}.${sequencName} OWNED BY ${schema.name}.${table.name}.${column.name}`,
                },
                {
                    query: `SELECT setval('${schema.name}."${sequencName}"', ${nextSeqNumber - 1})`,
                },
            ]);
            return result[result.length - 1];
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
        if (data.default)
            column.default = data.default;
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
const environment_1 = __webpack_require__(/*! ../environment */ "./src/environment.ts");
class CurrentUser {
    constructor(user, wbCloud) {
        this.actionHistory = [];
        this.objectPermissionsLookup = {
            organization: {},
            schema: {},
            table: {},
        };
        if (wbCloud)
            this.wbCloud = wbCloud;
        this.user = user;
        this.id = user.id;
    }
    static getSysAdmin() {
        return new CurrentUser(_1.User.getSysAdminUser());
    }
    static getPublic() {
        return new CurrentUser(_1.User.getPublicUser());
    }
    isSignedIn() {
        return this.user.id !== _1.User.PUBLIC_ID;
    }
    isntSignedIn() {
        return this.user.id == _1.User.PUBLIC_ID;
    }
    isSignedOut() {
        return this.isntSignedIn();
    }
    isPublic() {
        return !this.isSignedIn();
    }
    isSysAdmin() {
        return this.user.id === _1.User.SYS_ADMIN_ID;
    }
    isntSysAdmin() {
        return !this.isSysAdmin;
    }
    isTestUser() {
        return (this.user.email &&
            this.user.email.toLowerCase().endsWith(environment_1.environment.testUserEmailDomain));
    }
    isntTestUser() {
        return !this.isTestUser;
    }
    idIs(otherId) {
        return this.user.id == otherId;
    }
    idIsnt(otherId) {
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
    mustBeSysAdmin() {
        return whitebrick_cloud_1.errResult({
            success: false,
            message: "You must be a System Administrator to perform this action.",
            wbCode: "WB_FORBIDDEN",
        });
    }
    mustBeSysAdminOrTestUser() {
        return whitebrick_cloud_1.errResult({
            success: false,
            message: "You must be a System Administrator or Test User to perform this action.",
            wbCode: "WB_FORBIDDEN",
        });
    }
    mustBeSelf() {
        return whitebrick_cloud_1.errResult({
            success: false,
            message: "This action can only be performed on yourself as the user.",
            wbCode: "WB_FORBIDDEN",
        });
    }
    mustBeSysAdminOrSelf() {
        return whitebrick_cloud_1.errResult({
            success: false,
            message: "You must be a System Administrator or yourself as the user to perform this action.",
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
            const roleResult = yield this.wbCloud.roleAndIdForUserObject(CurrentUser.getSysAdmin(), this.id, policy.roleLevel, objectIdOrName, parentObjectName);
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
                result = yield context.wbCloud.userByEmail(CurrentUser.getSysAdmin(), headersLowerCase["x-test-user-email"]);
                if (result.success && result.payload && result.payload.id) {
                    return new CurrentUser(result.payload, context.wbCloud);
                }
                else {
                    whitebrick_cloud_1.log.error(`CurrentUser.fromContext: Couldn't find user for test email x-test-user-email=${headersLowerCase["x-test-user-email"]}`);
                    return new CurrentUser(_1.User.getPublicUser(), context.wbCloud);
                }
            }
            else if (headersLowerCase["x-hasura-role"] &&
                headersLowerCase["x-hasura-role"].toLowerCase() == "admin") {
                whitebrick_cloud_1.log.debug("========== FOUND SYSADMIN USER");
                return CurrentUser.getSysAdmin();
            }
            else if (headersLowerCase["x-hasura-user-id"]) {
                whitebrick_cloud_1.log.debug(`========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`);
                const result = yield context.wbCloud.userById(CurrentUser.getSysAdmin(), parseInt(headersLowerCase["x-hasura-user-id"]));
                if (result.success && result.payload && result.payload.id) {
                    return new CurrentUser(result.payload, context.wbCloud);
                }
                else {
                    whitebrick_cloud_1.log.error(`CurrentUser.fromContext: Couldn't find user for x-hasura-user-id=${headersLowerCase["x-hasura-user-id"]}`);
                    return new CurrentUser(_1.User.getPublicUser(), context.wbCloud);
                }
            }
            else {
                whitebrick_cloud_1.log.debug(`CurrentUser.fromContext: Could not find headers for Admin, Test or User in: ${JSON.stringify(context.headers)}`);
                return new CurrentUser(_1.User.getPublicUser(), context.wbCloud);
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
                break;
            case "schema":
                toRoleDefinitions = Role.SYSROLES_SCHEMAS;
                break;
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
        const hasuraPermissionsAndActions = [];
        for (const permissionKeysAndAction of Role.tablePermissionKeysAndActions(tableId)) {
            hasuraPermissionsAndActions.push({
                permissionCheck: {
                    _exists: {
                        _table: { schema: "wb", name: "table_permissions" },
                        _where: {
                            _and: [
                                {
                                    table_permission_key: {
                                        _eq: permissionKeysAndAction.permissionKey,
                                    },
                                },
                                { user_id: { _eq: "X-Hasura-User-Id" } },
                            ],
                        },
                    },
                },
                permissionType: permissionKeysAndAction.action,
            });
        }
        return hasuraPermissionsAndActions;
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
User.PUBLIC_ID = 2;


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
exports.USER_MESSAGES = exports.environment = void 0;
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
    testUserEmailDomain: (process.env.TEST_USER_EMAIL_DOMAIN || "").toLocaleLowerCase(),
    demoDBPrefix: process.env.DEMO_DB_PREFIX,
    demoDBLabel: process.env.DEMO_DB_LABEL,
};
exports.USER_MESSAGES = {
    WB_USER_EXISTS: ["This user already exists"],
    WB_USER_NOT_FOUND: ["User not found.", "BAD_USER_INPUT"],
    WB_USERS_NOT_FOUND: ["One or more users were not found."],
    WB_PASSWORD_RESET_INSTRUCTIONS_SENT: [
        "Password reset instructions have been sent to your E-mail.",
    ],
    WB_ORGANIZATION_NOT_FOUND: ["Organization not found.", "BAD_USER_INPUT"],
    WB_ORGANIZATION_URL_NOT_FOUND: [
        "This Organization URL could not be found. Please Check the spelling otherwise contact your System Administrator.",
        "BAD_USER_INPUT",
    ],
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
    WB_ORGANIZATION_URL_FORBIDDEN: [
        "Sorry you do not have access to this Organization. Please contact your System Administrator.",
        "BAD_USER_INPUT",
    ],
    WB_NO_SCHEMAS_FOUND: [
        "You don’t have access to any Databases. Please contact you System Administrator for access to an existing Database or create a new Database below.",
    ],
    WB_SCHEMA_NOT_FOUND: ["Database could not be found.", "BAD_USER_INPUT"],
    WB_SCHEMA_URL_NOT_FOUND: [
        "This Database URL could not be found. Please Check the spelling otherwise contact your System Administrator.",
        "BAD_USER_INPUT",
    ],
    WB_SCHEMA_URL_FORBIDDEN: [
        "Sorry you do not have access to this Database. Please contact your System Administrator.",
        "BAD_USER_INPUT",
    ],
    WB_BAD_SCHEMA_NAME: [
        "Database name can not begin with 'pg_' or be in the reserved list.",
        "BAD_USER_INPUT",
    ],
    WB_SCHEMA_NAME_EXISTS: ["This Schema name already exists", "BAD_USER_INPUT"],
    WB_CANT_REMOVE_SCHEMA_USER_OWNER: ["You can not remove the DB User Owner"],
    WB_CANT_REMOVE_SCHEMA_ADMIN: [
        "You can not remove a DB Administrator from one or more individual tables.",
    ],
    WB_SCHEMA_USERS_NOT_FOUND: ["One or more Schema Users not found."],
    WB_SCHEMA_NO_ADMINS: [
        "You can not remove all Administrators from a schema - you must leave at least one.",
        "BAD_USER_INPUT",
    ],
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
    WB_FORBIDDEN: ["You are not permitted to perform this action.", "FORBIDDEN"],
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
    read_schema: {
        roleLevel: "schema",
        description: "Read this Schema",
        permittedRoles: [
            "schema_reader",
            "schema_manager",
            "schema_administrator",
            "schema_owner",
        ],
    },
    alter_schema: {
        roleLevel: "schema",
        description: "Alter this Database",
        permittedRoles: ["schema_manager", "schema_administrator", "schema_owner"],
    },
    manage_access_to_schema: {
        roleLevel: "schema",
        description: "Manage Access to this Database",
        permittedRoles: ["schema_administrator", "schema_owner"],
    },
    read_table: {
        roleLevel: "table",
        description: "Read this Table",
        permittedRoles: [
            "table_reader",
            "table_editor",
            "table_manager",
            "table_administrator",
        ],
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
const entity_1 = __webpack_require__(/*! ../entity */ "./src/entity/index.ts");
const typeDefs = apollo_server_lambda_1.gql `
  type Query {
    wbHealthCheck: JSON!
    wbCloudContext: JSON!
  }

  type Mutation {
    wbUtil(fn: String!, vals: JSON): JSON!
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
        wbUtil: (_, { fn, vals }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.util(currentUser, fn, vals);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result;
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
      roleNames: [String]
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
        wbOrganizationUsers: (_, { organizationName, roleNames, userEmails, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.organizationUsers(currentUser, organizationName, undefined, roleNames, userEmails, withSettings);
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
    wbMySchemaByName(
      name: String!
      organizationName: String
      withSettings: Boolean
    ): Schema
    wbSchemasByOrganizationOwner(organizationName: String!): [Schema]
    """
    Schema Users
    """
    wbSchemaUsers(
      schemaName: String!
      roleNames: [String]
      userEmails: [String]
      withSettings: Boolean
    ): [SchemaUser]
  }

  extend type Mutation {
    """
    Schemas
    """
    wbAddOrCreateSchema(
      name: String!
      label: String!
      organizationOwnerName: String
      userOwnerEmail: String
      create: Boolean
    ): Schema
    wbUpdateSchema(
      name: String!
      newSchemaName: String
      newSchemaLabel: String
      newOrganizationOwnerName: String
      newUserOwnerEmail: String
    ): Schema
    wbRemoveOrDeleteSchema(name: String!, del: Boolean): Boolean!
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
        wbMySchemaByName: (_, { name, organizationName, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.accessibleSchemaByName(currentUser, name, organizationName, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSchemasByOrganizationOwner: (_, { organizationName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.schemasByOrganizationOwner(currentUser, undefined, organizationName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbSchemaUsers: (_, { schemaName, roleNames, userEmails, withSettings }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.schemaUsers(currentUser, schemaName, roleNames, userEmails, withSettings);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
    },
    Mutation: {
        wbAddOrCreateSchema: (_, { name, label, organizationOwnerName, userOwnerEmail, create }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrCreateSchema(currentUser, name, label, undefined, organizationOwnerName, undefined, userOwnerEmail, create);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateSchema: (_, { name, newSchemaName, newSchemaLabel, newOrganizationOwnerName, newUserOwnerEmail, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateSchema(currentUser, name, newSchemaName, newSchemaLabel, newOrganizationOwnerName, undefined, newUserOwnerEmail);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbRemoveOrDeleteSchema: (_, { name, del }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeOrDeleteSchema(currentUser, name, del);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
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
    default: String
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
    ): Table!
    wbUpdateTable(
      schemaName: String!
      tableName: String!
      newTableName: String
      newTableLabel: String
    ): Table!
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
    wbRemoveTableUsers(
      schemaName: String!
      tableName: String!
      userEmails: [String]!
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
    wbAddColumnSequence(
      schemaName: String!
      tableName: String!
      columnName: String!
      nextSeqNumber: Int
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
            return result.payload;
        }),
        wbUpdateTable: (_, { schemaName, tableName, newTableName, newTableLabel }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateTable(currentUser, schemaName, tableName, newTableName, newTableLabel);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
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
        wbAddColumnSequence: (_, { schemaName, tableName, columnName, nextSeqNumber }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrRemoveColumnSequence(currentUser, schemaName, tableName, columnName, nextSeqNumber);
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
        wbRemoveTableUsers: (_, { schemaName, tableName, userEmails }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeTableUsers(currentUser, schemaName, tableName, userEmails);
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
    wbSignUp(userAuthId: String!, userObj: JSON!): Boolean
    wbAuth(userAuthId: String!): JSON
    wbCreateUser(
      authId: String
      email: String
      firstName: String
      lastName: String
    ): User
    wbUpdateMyProfile(firstName: String, lastName: String): User
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
        wbSignUp: (_, { userAuthId, userObj }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.signUp(currentUser, userAuthId, userObj);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbAuth: (_, { userAuthId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.auth(currentUser, userAuthId);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbCreateUser: (_, { authId, email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.createUser(currentUser, authId, email, firstName, lastName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.payload;
        }),
        wbUpdateMyProfile: (_, { firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateUser(currentUser, currentUser.id, undefined, firstName, lastName);
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
exports.bgHandler = exports.apolloErr = exports.errResult = exports.WhitebrickCloud = exports.log = exports.graphqlHandler = void 0;
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
                result = yield this.userByEmail(CurrentUser_1.CurrentUser.getSysAdmin(), headersLowerCase["x-test-user-id"]);
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
            userMessages: environment_1.USER_MESSAGES,
        };
    }
    auth(cU, userAuthId) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`auth(${userAuthId})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
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
    signUp(cU, userAuthId, userObj) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`signUp(${userAuthId},${JSON.stringify(userObj)})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            let email = undefined;
            let firstName = undefined;
            let lastName = undefined;
            if (userObj.email && userObj.email.length > 0)
                email = userObj.email;
            if (userObj.given_name && userObj.given_name.length > 0) {
                firstName = userObj.given_name;
            }
            if (userObj.family_name && userObj.family_name.length > 0) {
                lastName = userObj.family_name;
            }
            if (!firstName && !lastName) {
                if (userObj.name && userObj.name.length > 0) {
                    const split = userObj.name.split(" ");
                    firstName = split.shift();
                    lastName = split.join(" ");
                }
                else if (userObj.nickname && userObj.nickname.length > 0) {
                    firstName = userObj.nickname;
                }
            }
            let result = yield this.createUser(CurrentUser_1.CurrentUser.getSysAdmin(), userAuthId, email, firstName, lastName);
            if (!result.success)
                return result;
            if (environment_1.environment.demoDBPrefix) {
                result = yield this.assignDemoSchema(result.payload.id);
            }
            return result;
        });
    }
    roleByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`roleByName(${cU.id},${name})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.roleByName(name);
        });
    }
    roleAndIdForUserObject(cU, userId, roleLevel, objectIdOrName, parentObjectName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`roleAndIdForUserObject(${cU.id},${userId},${roleLevel},${objectIdOrName},${parentObjectName})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            return this.dal.roleAndIdForUserObject(userId, roleLevel, objectIdOrName, parentObjectName);
        });
    }
    deleteAndSetTablePermissions(cU, table, deleteOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteAndSetTablePermissions(${cU.id},${table},${deleteOnly})`);
            if (yield cU.cant("manage_access_to_table", table.id))
                return cU.denied();
            return yield this.dal.deleteAndSetTablePermissions(table.id);
        });
    }
    setRole(cU, userIds, roleName, roleLevel, object) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`setRole(${cU.id},${userIds},${roleName},${roleLevel},${JSON.stringify(object)})`);
            if (!entity_1.Role.isRole(roleName, roleLevel)) {
                return errResult({
                    message: `${roleName} is not a valid name for an ${roleLevel} Role.`,
                });
            }
            let result = errResult();
            switch (roleLevel) {
                case "organization":
                    if (yield cU.cant("manage_access_to_organization", object.id)) {
                        return cU.denied();
                    }
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
                    if (yield cU.cant("manage_access_to_schema", object.id)) {
                        return cU.denied();
                    }
                    result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                    if (!result.success)
                        return result;
                    result = yield this.dal.setTableUserRolesFromSchemaRoles(object.id, entity_1.Role.sysRoleMap("schema", "table"), undefined, userIds);
                    break;
                case "table":
                    if (yield cU.cant("manage_access_to_table", object.id)) {
                        return cU.denied();
                    }
                    result = yield this.dal.setRole(userIds, roleName, roleLevel, object.id);
                    break;
            }
            return result;
        });
    }
    deleteRole(cU, userIds, roleLevel, objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteRole(${cU.id},${userIds},${roleLevel},${objectId})`);
            let result = errResult();
            switch (roleLevel) {
                case "organization":
                    if (yield cU.cant("manage_access_to_organization", objectId)) {
                        return cU.denied();
                    }
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
                    result = yield this.dal.deleteRole(userIds, roleLevel, objectId);
                    break;
                case "schema":
                    if (yield cU.cant("manage_access_to_schema", objectId)) {
                        return cU.denied();
                    }
                    result = yield this.dal.deleteRole(userIds, "table", undefined, objectId, Object.keys(entity_1.Role.sysRoleMap("schema", "table")));
                    result = yield this.dal.deleteRole(userIds, roleLevel, objectId);
                    break;
                case "table":
                    if (yield cU.cant("manage_access_to_table", objectId)) {
                        return cU.denied();
                    }
                    result = yield this.dal.deleteRole(userIds, roleLevel, objectId);
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
    usersByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`usersByIds(${cU.id},${ids})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.users(ids);
        });
    }
    userById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`userById(${cU.id},${id})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
            exports.log.debug(`usersBySearchPattern(${cU.id},${searchPattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.users(undefined, undefined, searchPattern);
        });
    }
    usersByEmails(cU, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`usersByEmails(${cU.id},${userEmails})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.users(undefined, userEmails);
        });
    }
    userByEmail(cU, email) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`userByEmail(${cU.id},${email})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
    createUser(cU, authId, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`createUser(${cU.id},${authId},${email},${firstName},${lastName})`);
            if (email &&
                email.toLowerCase().endsWith(environment_1.environment.testUserEmailDomain) &&
                cU.isntTestUser() &&
                cU.isntSysAdmin()) {
                return cU.mustBeSysAdminOrTestUser();
            }
            else if (cU.isntSysAdmin()) {
                return cU.mustBeSysAdmin();
            }
            let existingUserResult = errResult();
            let errValue = "";
            if (authId) {
                existingUserResult = yield this.dal.userIdFromAuthId(authId);
                errValue = authId;
            }
            else if (email) {
                existingUserResult = yield this.userByEmail(CurrentUser_1.CurrentUser.getSysAdmin(), email);
                errValue = email;
            }
            if (existingUserResult.success) {
                return errResult({
                    wbCode: "WB_USER_EXISTS",
                    values: [errValue],
                });
            }
            return this.dal.createUser(authId, email, firstName, lastName);
        });
    }
    updateUser(cU, id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`updateUser(${cU.id},${id},${email},${firstName},${lastName})`);
            if (cU.isntSysAdmin() && cU.idIsnt(id)) {
                return cU.mustBeSysAdminOrSelf();
            }
            return this.dal.updateUser(id, email, firstName, lastName);
        });
    }
    organizations(cU, organizationIds, organizationNames, organizationNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`organizations(${cU.id},${organizationIds},${organizationNames},${organizationNamePattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const result = yield this.dal.organizations(organizationIds, organizationNames, organizationNamePattern);
            return result;
        });
    }
    organizationsByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`organizationsByIds(${cU.id},${ids})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.organizations(cU, ids);
        });
    }
    organizationById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`organizationByIds(${cU.id},${id})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
            exports.log.debug(`organizationsByNames(${cU.id},${names})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.organizations(cU, undefined, names);
        });
    }
    organizationByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`organizationByName(${cU.id},${name})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
            exports.log.debug(`organizationByNamePattern(${cU.id},${namePattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
            exports.log.debug(`accessibleOrganizationByName(${cU.id},${organizationName},${withSettings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            let result = yield this.dal.organizationsByUsers([cU.id], undefined, [organizationName], withSettings);
            if (!result.success)
                return result;
            result.payload = result.payload[0];
            if (!result.payload) {
                result = yield this.organizationByName(CurrentUser_1.CurrentUser.getSysAdmin(), organizationName);
                if (!result.success)
                    return result;
                return errResult({
                    wbCode: "WB_FORBIDDEN",
                    values: [organizationName],
                });
            }
            return result;
        });
    }
    accessibleOrganizations(cU, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`accessibleOrganizations(${cU.id},${withSettings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return yield this.dal.organizationsByUsers([cU.id], undefined, undefined, withSettings);
        });
    }
    createOrganization(cU, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`createOrganization(${cU.id},${name},${label})`);
            if (cU.isntSignedIn())
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
            const result = yield this.setOrganizationUsersRole(CurrentUser_1.CurrentUser.getSysAdmin(), name, "organization_administrator", [cU.id]);
            if (!result.success)
                return result;
            return createOrganizationResult;
        });
    }
    updateOrganization(cU, name, newName, newLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`updateOrganization(${cU.id},${name},${newName},${newLabel})`);
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
    deleteTestOrganizations(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`deleteTestOrganizations(${cU.id})`);
            if (cU.isntSysAdmin() && cU.isntTestUser()) {
                return cU.mustBeSysAdminOrTestUser();
            }
            return this.dal.deleteTestOrganizations();
        });
    }
    organizationUsers(cU, name, id, roleNames, userEmails, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`organizationUsers(${cU.id},${name},${id},${roleNames},${userEmails},${withSettings})`);
            let organizationRef = "";
            let result = errResult();
            if (name) {
                result = yield this.organizationByName(cU, name);
                organizationRef = name;
            }
            else if (id) {
                result = yield this.organizationById(cU, id);
                organizationRef = id;
            }
            if (!result.success)
                return result;
            if (yield cU.cant("access_organization", organizationRef)) {
                return cU.denied();
            }
            if (!result.payload) {
                return errResult({
                    wbCode: "WB_ORGANIZATION_NOT_FOUND",
                });
            }
            if (roleNames && !entity_1.Role.areRoles(roleNames)) {
                return errResult({
                    message: "organizationUsers: roles contains one or more unrecognized strings",
                    values: roleNames,
                });
            }
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(cU, userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
            }
            return this.dal.organizationUsers(name, id, roleNames, userIds, withSettings);
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
            exports.log.debug(`saveSchemaUserSettings(${cU.id},${schemaName},${settings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const schemaResult = yield this.schemaByName(cU, schemaName);
            if (!schemaResult.success)
                return schemaResult;
            return this.dal.saveSchemaUserSettings(schemaResult.payload.id, cU.id, settings);
        });
    }
    schemas(cU, schemaIds, schemaNames, schemaNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemas(${cU.id},${schemaIds},${schemaNames},${schemaNamePattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const result = yield this.dal.schemas(schemaIds, schemaNames, schemaNamePattern);
            return result;
        });
    }
    schemasByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemas(${cU.id},${ids})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.schemas(cU, ids);
        });
    }
    schemaById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemaById(${cU.id},${id})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
            exports.log.debug(`schemasByNames(${cU.id},${names})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.schemas(cU, undefined, names);
        });
    }
    schemaByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemaByName(${cU.id},${name})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const result = yield this.schemasByNames(cU, [name]);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_SCHEMA_NOT_FOUND",
                        values: [name],
                    });
                }
            }
            return result;
        });
    }
    schemaByNamePattern(cU, namePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemaByNamePattern(${cU.id},${namePattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
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
            exports.log.debug(`schemasByUserOwner(${cU.id},${userId},${userEmail})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.schemasByUserOwner(userId, userEmail);
        });
    }
    schemasByOrganizationOwner(cU, organizationId, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemasByOrganizationOwner(${cU.id},${organizationId},${organizationName})`);
            let result = errResult();
            let organizationRef = "";
            if (organizationId) {
                result = yield this.organizationById(CurrentUser_1.CurrentUser.getSysAdmin(), organizationId);
                organizationRef = organizationId;
            }
            else if (organizationName) {
                organizationRef = organizationName;
                result = yield this.organizationByName(CurrentUser_1.CurrentUser.getSysAdmin(), organizationName);
            }
            if (!result.success)
                return result;
            if (yield cU.cant("access_organization", organizationRef)) {
                return cU.denied();
            }
            return this.dal.schemasByOrganizationOwner(cU.id, organizationId, organizationName);
        });
    }
    schemasByOrganizationOwnerAdmin(cU, userId, userEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemasByOrganizationOwnerAdmin(${cU.id},${userId},${userEmail})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.schemasByOrganizationOwnerAdmin(userId, userEmail);
        });
    }
    accessibleSchemaByName(cU, schemaName, organizationName, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`accessibleSchemaByName(${cU.id},${schemaName},${organizationName},${withSettings})`);
            const organizationResult = errResult();
            if (organizationName) {
                const organizationResult = yield this.organizationByName(CurrentUser_1.CurrentUser.getSysAdmin(), organizationName);
                if (!organizationResult.success)
                    return organizationResult;
            }
            const schemaResult = yield this.schemaByName(CurrentUser_1.CurrentUser.getSysAdmin(), schemaName);
            if (!schemaResult.success)
                return schemaResult;
            if (organizationName && organizationResult.success) {
                if (schemaResult.payload.organization_owner_id !=
                    organizationResult.payload.id) {
                    return errResult({
                        wbCode: "WB_SCHEMA_NOT_FOUND",
                        values: [
                            `${schemaName} not found for organization owner ${organizationName}.`,
                        ],
                    });
                }
            }
            if (yield cU.cant("read_schema", schemaName))
                return cU.denied();
            const result = yield this.dal.schemasByUsers([cU.id], undefined, [schemaName], withSettings);
            if (result.success) {
                result.payload = result.payload[0];
                if (!result.payload) {
                    return errResult({
                        wbCode: "WB_FORBIDDEN",
                        values: [schemaName],
                    });
                }
            }
            return result;
        });
    }
    accessibleSchemas(cU, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`accessibleSchemas(${cU.id},${withSettings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return yield this.dal.schemasByUsers([cU.id], undefined, undefined, withSettings);
        });
    }
    addOrCreateSchema(cU, name, label, organizationOwnerId, organizationOwnerName, userOwnerId, userOwnerEmail, create) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addOrCreateSchema(${cU.id},${name},${label},${organizationOwnerId},${organizationOwnerName},${userOwnerId},${userOwnerEmail},${create})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            let result = errResult();
            if (organizationOwnerId || organizationOwnerName) {
                if (!organizationOwnerId && organizationOwnerName) {
                    result = yield this.organizationByName(cU, organizationOwnerName);
                    if (!result.success)
                        return result;
                    organizationOwnerId = result.payload.id;
                }
                if (organizationOwnerId &&
                    (yield cU.cant("access_organization", organizationOwnerId))) {
                    return errResult({
                        wbCode: "WB_USER_NOT_IN_ORG",
                        values: [cU.toString(), organizationOwnerId.toString()],
                    });
                }
            }
            else if (userOwnerEmail) {
                result = yield this.userByEmail(cU, userOwnerEmail);
                if (!result.success)
                    return result;
                userOwnerId = result.payload.id;
            }
            else if (!userOwnerId) {
                userOwnerId = cU.id;
            }
            if (name.startsWith("pg_") || entity_1.Schema.SYS_SCHEMA_NAMES.includes(name)) {
                return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" });
            }
            result = yield this.schemaByName(cU, name);
            if (result.success) {
                return errResult({
                    wbCode: "WB_SCHEMA_NAME_EXISTS",
                });
            }
            const schemaResult = yield this.dal.addOrCreateSchema(name, label, organizationOwnerId, userOwnerId, create);
            if (!schemaResult.success)
                return schemaResult;
            if (organizationOwnerId) {
                if (yield cU.cant("administer_organization", organizationOwnerId)) {
                    result = yield this.setRole(CurrentUser_1.CurrentUser.getSysAdmin(), [cU.id], "schema_administrator", "schema", schemaResult.payload);
                    if (!result.success)
                        return result;
                }
                result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(organizationOwnerId, entity_1.Role.sysRoleMap("organization", "schema"), [schemaResult.payload.id]);
            }
            else {
                result = yield this.setRole(CurrentUser_1.CurrentUser.getSysAdmin(), [cU.id], "schema_owner", "schema", schemaResult.payload);
            }
            if (!result.success)
                return result;
            return schemaResult;
        });
    }
    removeOrDeleteSchema(cU, schemaName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteSchema(${cU.id},${schemaName},${del})`);
            if (yield cU.cant("alter_schema", schemaName))
                return cU.denied();
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
    updateSchema(cU, name, newSchemaName, newSchemaLabel, newOrganizationOwnerName, newOrganizationOwnerId, newUserOwnerEmail, newUserOwnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`updateSchema(${cU.id},${name},${newSchemaName},${newSchemaLabel},${newOrganizationOwnerName},${newOrganizationOwnerId},${newUserOwnerEmail},${newUserOwnerId})`);
            if (yield cU.cant("alter_schema", name))
                return cU.denied();
            let result;
            const schemaResult = yield this.schemaByName(cU, name);
            if (!schemaResult.success)
                return schemaResult;
            let schemaTables = [];
            if (newSchemaName) {
                if (newSchemaName.startsWith("pg_") ||
                    entity_1.Schema.SYS_SCHEMA_NAMES.includes(newSchemaName)) {
                    return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" });
                }
                result = yield this.schemaByName(cU, newSchemaName);
                if (result.success) {
                    return errResult({
                        wbCode: "WB_SCHEMA_NAME_EXISTS",
                    });
                }
                result = yield this.tables(cU, name, false);
                if (!result.success)
                    return result;
                schemaTables = result.payload;
                for (const table of schemaTables) {
                    result = yield this.untrackTableWithPermissions(cU, table);
                    if (!result.success)
                        return result;
                }
            }
            if (newOrganizationOwnerName) {
                result = yield this.organizationByName(cU, newOrganizationOwnerName);
                if (!result.success)
                    return result;
                newOrganizationOwnerId = result.payload.id;
            }
            if (newUserOwnerEmail) {
                result = yield this.userByEmail(cU, newUserOwnerEmail);
                if (!result.success)
                    return result;
                newUserOwnerId = result.payload.id;
            }
            const updatedSchemaResult = yield this.dal.updateSchema(schemaResult.payload, newSchemaName, newSchemaLabel, newOrganizationOwnerId, newUserOwnerId);
            if (!updatedSchemaResult.success)
                return updatedSchemaResult;
            if (newSchemaName) {
                for (const table of schemaTables) {
                    result = yield this.trackTableWithPermissions(cU, table);
                    if (!result.success)
                        return result;
                }
            }
            if (newOrganizationOwnerId || newUserOwnerId) {
                if (schemaResult.payload.organization_owner_id) {
                    const impliedAdminsResult = yield this.schemaUsers(cU, updatedSchemaResult.payload.name, ["schema_administrator"], undefined, "organization_administrator");
                    if (!impliedAdminsResult.success)
                        return impliedAdminsResult;
                    const oldImpliedAdminUserIds = impliedAdminsResult.payload.map((schemaUser) => schemaUser.user_id);
                    result = yield this.deleteRole(cU, oldImpliedAdminUserIds, "schema", schemaResult.payload.id);
                }
                else {
                    result = yield this.deleteRole(cU, [schemaResult.payload.user_owner_id], "schema", schemaResult.payload.id);
                }
                if (!result.success)
                    return result;
                if (newOrganizationOwnerId) {
                    result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(newOrganizationOwnerId, entity_1.Role.sysRoleMap("organization", "schema"), [schemaResult.payload.id]);
                }
                else if (newUserOwnerId) {
                    result = yield this.setRole(CurrentUser_1.CurrentUser.getSysAdmin(), [newUserOwnerId], "schema_owner", "schema", schemaResult.payload);
                }
                if (!result.success)
                    return result;
            }
            return updatedSchemaResult;
        });
    }
    assignDemoSchema(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.nextUnassignedDemoSchema(`${environment_1.environment.demoDBPrefix}%`);
            if (!result.success)
                return result;
            result = yield this.updateSchema(CurrentUser_1.CurrentUser.getSysAdmin(), result.payload.name, undefined, undefined, undefined, undefined, undefined, userId);
            if (!result.success)
                return result;
            return this.deleteRole(CurrentUser_1.CurrentUser.getSysAdmin(), [entity_1.User.SYS_ADMIN_ID], "schema", result.payload.id);
        });
    }
    addNextDemoSchema(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addNextDemoSchema(${cU.id})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            let result = yield this.dal.schemas(undefined, undefined, `${environment_1.environment.demoDBPrefix}%`, "name desc", 1, true);
            if (!result.success)
                return result;
            if (result.payload.length !== 1) {
                return errResult({
                    message: `addNextDemoSchema: can not find demo DB matching ${environment_1.environment.demoDBPrefix}%`,
                });
            }
            const split = result.payload[0].name.split("_demo");
            const lastDemoNumber = parseInt(split[1]);
            const schemaName = `${environment_1.environment.demoDBPrefix}${lastDemoNumber + 1}`;
            const schemaResult = yield this.addOrCreateSchema(cU, schemaName, environment_1.environment.demoDBLabel, undefined, undefined, cU.id);
            if (!schemaResult.success)
                return schemaResult;
            result = yield this.addAllExistingTables(cU, schemaName);
            if (!result.success)
                return result;
            return schemaResult;
        });
    }
    schemaUsers(cU, schemaName, roleNames, userEmails, impliedFromRoleName, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`schemaUsers(${cU.id},${schemaName},${roleNames},${userEmails},${impliedFromRoleName},${withSettings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            if (roleNames && !entity_1.Role.areRoles(roleNames)) {
                return errResult({
                    message: "schemaUsers: roles contains one or more unrecognized strings",
                    values: roleNames,
                });
            }
            let userIds = undefined;
            if (userEmails) {
                const usersResult = yield this.usersByEmails(cU, userEmails);
                if (!usersResult.success || !usersResult.payload)
                    return usersResult;
                userIds = usersResult.payload.map((user) => user.id);
                if (userIds.length == 0) {
                    return errResult({
                        wbCode: "WB_USERS_NOT_FOUND",
                    });
                }
            }
            let impliedFromRoleId = undefined;
            if (impliedFromRoleName) {
                const roleResult = yield this.roleByName(cU, impliedFromRoleName);
                if (!roleResult.success)
                    return roleResult;
                impliedFromRoleId = roleResult.payload.id;
            }
            return this.dal.schemaUsers(schemaName, roleNames, userIds, impliedFromRoleId, withSettings);
        });
    }
    setSchemaUsersRole(cU, schemaName, userEmails, roleName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`setSchemaUsersRole(${cU.id},${schemaName},${userEmails},${roleName})`);
            if (yield cU.cant("manage_access_to_schema", schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`removeSchemaUsers(${cU.id},${schemaName},${userEmails})`);
            if (yield cU.cant("manage_access_to_schema", schemaName)) {
                return cU.denied();
            }
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
            const adminsResult = yield this.schemaUsers(cU, schemaName, [
                "schema_administrator",
            ]);
            if (!adminsResult.success)
                return adminsResult;
            const schemaAdminIds = adminsResult.payload.map((user) => user.id);
            if (userIds.filter((userId) => schemaAdminIds.includes(userId)).length ==
                schemaAdminIds.length) {
                return errResult({
                    wbCode: "WB_SCHEMA_NO_ADMINS",
                });
            }
            const result = yield this.deleteRole(cU, userIds, "schema", schemaResult.payload.id);
            return result;
        });
    }
    saveOrganizationUserSettings(cU, organizationName, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`saveOrganizationUserSettings(${cU.id},${organizationName},${settings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const organizationResult = yield this.organizationByName(cU, organizationName);
            if (!organizationResult.success)
                return organizationResult;
            return this.dal.saveOrganizationUserSettings(organizationResult.payload.id, cU.id, settings);
        });
    }
    tables(cU, schemaName, withColumns) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`tables(${cU.id},${schemaName},${withColumns})`);
            if (yield cU.cant("read_schema", schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`tableBySchemaNameTableName(${cU.id},${schemaName},${tableName})`);
            if (yield cU.cant("read_table", tableName, schemaName)) {
                return cU.denied();
            }
            return yield this.dal.tableBySchemaNameTableName(schemaName, tableName);
        });
    }
    accessibleTableByName(cU, schemaName, tableName, withColumns, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`accessibleTableByName(${cU.id},${schemaName},${tableName},${withColumns},${withSettings})`);
            if (yield cU.cant("read_schema", schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`accessibleTables(${cU.id},${schemaName},${withColumns},${withSettings})`);
            if (yield cU.cant("read_schema", schemaName))
                return cU.denied();
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
            exports.log.debug(`addOrCreateTable(${cU.id},${schemaName},${tableName},${tableLabel},${create})`);
            if (yield cU.cant("alter_schema", schemaName)) {
                return cU.denied();
            }
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
            result = yield this.trackTableWithPermissions(cU, tableResult.payload);
            if (!result.success)
                return result;
            return tableResult;
        });
    }
    removeOrDeleteTable(cU, schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteTable(${cU.id},${schemaName},${tableName},${del})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            result = yield this.deleteAndSetTablePermissions(CurrentUser_1.CurrentUser.getSysAdmin(), tableResult.payload, true);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteTable(schemaName, tableName, del);
        });
    }
    updateTable(cU, schemaName, tableName, newTableName, newTableLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`updateTable(${cU.id},${schemaName},${tableName},${newTableName},${newTableLabel})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            const updatedTableResult = yield this.dal.updateTable(schemaName, tableName, newTableName, newTableLabel);
            if (!updatedTableResult.success)
                return updatedTableResult;
            if (newTableName) {
                result = yield this.trackTableWithPermissions(cU, updatedTableResult.payload);
                if (!result.success)
                    return result;
            }
            return updatedTableResult;
        });
    }
    addAllExistingTables(cU, schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`addAllExistingTables(${cU.id},${schemaName})`);
            if (yield cU.cant("alter_schema", schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`addOrRemoveAllExistingRelationships(${cU.id},${schemaName},${remove})`);
            if (yield cU.cant("alter_schema", schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`addDefaultTablePermissions(${cU.id},${JSON.stringify(table)})`);
            if (yield cU.cant("alter_table", table.id))
                return cU.denied();
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
            exports.log.debug(`removeDefaultTablePermissions(${cU.id},${JSON.stringify(table)})`);
            if (yield cU.cant("alter_table", table.id))
                return cU.denied();
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
            exports.log.debug(`createOrDeletePrimaryKey(${cU.id},${schemaName},${tableName},${columnNames},${del})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`addOrCreateForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames},${create})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
            let operation = "CREATE";
            if (!create)
                operation = "ADD";
            return yield this.setForeignKey(cU, schemaName, tableName, columnNames, parentTableName, parentColumnNames, operation);
        });
    }
    removeOrDeleteForeignKey(cU, schemaName, tableName, columnNames, parentTableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${del})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
            let operation = "DELETE";
            if (!del)
                operation = "REMOVE";
            return yield this.setForeignKey(cU, schemaName, tableName, columnNames, parentTableName, [], operation);
        });
    }
    setForeignKey(cU, schemaName, tableName, columnNames, parentTableName, parentColumnNames, operation) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`setForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames},${operation})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`trackTableWithPermissions(${cU.id}, ${JSON.stringify(table)})`);
            if (yield cU.cant("alter_table", table.id)) {
                return cU.denied();
            }
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
            exports.log.debug(`untrackTableWithPermissions(${cU.id}, ${JSON.stringify(table)})`);
            if (yield cU.cant("alter_table", table.id)) {
                return cU.denied();
            }
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
            exports.log.debug(`tableUsers(${cU.id},${schemaName},${tableName},${userEmails},${withSettings})`);
            if (yield cU.cant("read_table", tableName, schemaName))
                return cU.denied();
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
            exports.log.debug(`setTableUsersRole(${cU.id},${schemaName},${tableName},${userEmails},${roleName})`);
            if (yield cU.cant("manage_access_to_table", tableName, schemaName)) {
                return cU.denied();
            }
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
    removeTableUsers(cU, schemaName, tableName, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeTableUsers(${cU.id},${schemaName},${tableName},${userEmails})`);
            if (yield cU.cant("manage_access_to_table", tableName, schemaName)) {
                return cU.denied();
            }
            const usersResult = yield this.usersByEmails(cU, userEmails);
            if (!usersResult.success)
                return usersResult;
            const userIds = usersResult.payload.map((user) => user.id);
            const adminsResult = yield this.schemaUsers(cU, schemaName, [
                "schema_administrator",
            ]);
            if (!adminsResult.success)
                return adminsResult;
            const schemaAdminIds = adminsResult.payload.map((user) => user.id);
            if (userIds.filter((userId) => schemaAdminIds.includes(userId)).length > 0) {
                return errResult({
                    wbCode: "WB_CANT_REMOVE_SCHEMA_ADMIN",
                });
            }
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            const result = yield this.deleteRole(cU, userIds, "table", tableResult.payload.id);
            return result;
        });
    }
    saveTableUserSettings(cU, schemaName, tableName, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`saveTableUserSettings(${cU.id},${schemaName},${tableName},${settings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            return this.dal.saveTableUserSettings(tableResult.payload.id, cU.id, settings);
        });
    }
    columns(cU, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`columns(${cU.id},${schemaName},${tableName})`);
            if (yield cU.cant("read_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`addOrCreateColumn(${cU.id},${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${skipTracking})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            const columnResult = yield this.dal.addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType);
            if (columnResult.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            return columnResult;
        });
    }
    removeOrDeleteColumn(cU, schemaName, tableName, columnName, del, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`removeOrDeleteColumn(${cU.id},${schemaName},${tableName},${columnName},${del},${skipTracking})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
            exports.log.debug(`updateColumn(${cU.id},${schemaName},${tableName},${columnName},${newColumnName},${newColumnLabel},${newType})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
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
    addOrRemoveColumnSequence(cU, schemaName, tableName, columnName, nextSeqNumber, remove) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.schemaByName(cU, schemaName);
            if (!result.success)
                return result;
            const schema = result.payload;
            result = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!result.success)
                return result;
            const table = result.payload;
            result = yield this.dal.columnBySchemaNameTableNameColumnName(schemaName, tableName, columnName);
            if (!result.success)
                return result;
            const column = result.payload;
            if (remove) {
            }
            else {
                result = yield this.dal.addSequenceToColumn(schema, table, column, nextSeqNumber);
            }
            return result;
        });
    }
    util(cU, fn, vals) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`util(${cU.id},${fn},${JSON.stringify(vals)})`);
            let result = errResult();
            switch (fn) {
                case "addNextDemoSchema":
                    result = yield this.addNextDemoSchema(cU);
                    break;
                case "resetTestData":
                    result = yield this.resetTestData(cU);
                    break;
            }
            return result;
        });
    }
    resetTestData(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.debug(`resetTestData()`);
            if (cU.isntSysAdmin() && cU.isntTestUser()) {
                return cU.mustBeSysAdminOrTestUser();
            }
            let result = yield this.schemas(CurrentUser_1.CurrentUser.getSysAdmin(), undefined, undefined, "test_%");
            if (!result.success)
                return result;
            for (const schema of result.payload) {
                result = yield this.removeOrDeleteSchema(CurrentUser_1.CurrentUser.getSysAdmin(), schema.name, true);
                if (!result.success)
                    return result;
            }
            result = yield this.deleteTestOrganizations(CurrentUser_1.CurrentUser.getSysAdmin());
            if (!result.success)
                return result;
            result = yield this.deleteTestUsers();
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
        result.message = environment_1.USER_MESSAGES[result.wbCode][0];
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
        Object.keys(environment_1.USER_MESSAGES).includes(result.wbCode) &&
        environment_1.USER_MESSAGES[result.wbCode].length == 2) {
        result.apolloErrorCode = environment_1.USER_MESSAGES[result.wbCode][1];
    }
    else if (!result.apolloErrorCode &&
        result.wbCode &&
        !Object.keys(environment_1.USER_MESSAGES).includes(result.wbCode)) {
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
const bgHandler = (event = {}) => __awaiter(void 0, void 0, void 0, function* () {
    exports.log.info("== bgHandler ==\nCall async event here...");
});
exports.bgHandler = bgHandler;


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ3VycmVudFVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvblVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3BvbGljeS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvb3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvc2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy91c2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvd2hpdGVicmljay1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2csIGVyclJlc3VsdCB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgVXNlcixcbiAgT3JnYW5pemF0aW9uLFxuICBPcmdhbml6YXRpb25Vc2VyLFxuICBTY2hlbWEsXG4gIFNjaGVtYVVzZXIsXG4gIFRhYmxlLFxuICBUYWJsZVVzZXIsXG4gIENvbHVtbixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGZpcnN0IH0gZnJvbSBcInZvY2FcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IERCID09PT09PT09PVxuICAgKi9cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBgICAgIFsgJHtxdWVyeVBhcmFtcy5wYXJhbXMgPyBxdWVyeVBhcmFtcy5wYXJhbXMuam9pbihcIiwgXCIpIDogXCJcIn0gXWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcbiAgICAgIGxvZy5lcnJvcihKU09OLnN0cmluZ2lmeShlcnJvcikpO1xuICAgICAgcmVzdWx0cy5wdXNoKFxuICAgICAgICBlcnJSZXN1bHQoe1xuICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgcmVmQ29kZTogXCJQR19cIiArIGVycm9yLmNvZGUsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdClcbiAgICAgICk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLy8gdXNlZCBmb3IgRERMIGlkZW50aWZpZXJzIChlZyBDUkVBVEUgVEFCTEUgc2FuaXRpemUodGFibGVOYW1lKSlcbiAgcHVibGljIHN0YXRpYyBzYW5pdGl6ZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXlxcdyVdKy9nLCBcIlwiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFJvbGVzICYgUGVybWlzc2lvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZXNJZExvb2t1cCgpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBuYW1lSWRMb29rdXA6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWQsIHdiLnJvbGVzLm5hbWVcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucGF5bG9hZC5yb3dzKSB7XG4gICAgICBuYW1lSWRMb29rdXBbcm93Lm5hbWVdID0gcm93LmlkO1xuICAgIH1cbiAgICByZXN1bHQucGF5bG9hZCA9IG5hbWVJZExvb2t1cDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVJZHNGcm9tTmFtZXMocm9sZU5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi5yb2xlcy5pZFxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgIFdIRVJFIGN1c3RvbSBJUyBmYWxzZVxuICAgICAgICBBTkQgbmFtZT1BTlkoJDEpXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbcm9sZU5hbWVzXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93cy5tYXAoKHJvdzogeyBpZDogbnVtYmVyIH0pID0+IHJvdy5pZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuKlxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgIFdIRVJFIG5hbWU9JDEgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBSb2xlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIlJPTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gVHlwaWNhbGx5IHNldHRpbmcgYSByb2xlIGRpcmVjdGx5IGlzIGV4cGxpY2l0LFxuICAvLyBzbyBhbnkgaW1wbGllZF9mcm9tX3JvbGVfaWQgaXMgY2xlYXJlZCB1bmxlc3Mga2VlcEltcGxpZWRGcm9tXG4gIHB1YmxpYyBhc3luYyBzZXRSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWQ6IG51bWJlcixcbiAgICBrZWVwSW1wbGllZEZyb20/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuc2V0Um9sZSgke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke29iamVjdElkfSwke2tlZXBJbXBsaWVkRnJvbX0pYFxuICAgICk7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUJ5TmFtZShyb2xlTmFtZSk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgIGxldCB3YlRhYmxlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCB3YkNvbHVtbjogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJvcmdhbml6YXRpb25faWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5zY2hlbWFfdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcInNjaGVtYV9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2IudGFibGVfdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcInRhYmxlX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBwYXJhbXM6IERhdGVbXSA9IFtdO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgSU5TRVJUIElOVE8gJHt3YlRhYmxlfSAocm9sZV9pZCwgIHVzZXJfaWQsICR7d2JDb2x1bW59LCB1cGRhdGVkX2F0KVxuICAgICAgVkFMVUVTXG4gICAgYDtcbiAgICBmb3IgKGNvbnN0IHVzZXJJZCBvZiB1c2VySWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIChcbiAgICAgICAgICAke3JvbGVSZXN1bHQucGF5bG9hZC5pZH0sXG4gICAgICAgICAgJHt1c2VySWR9LFxuICAgICAgICAgICR7b2JqZWN0SWR9LFxuICAgICAgICAgICQke3BhcmFtcy5sZW5ndGggKyAxfVxuICAgICAgICApXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goZGF0ZSk7XG4gICAgICBpZiAocGFyYW1zLmxlbmd0aCAhPSB1c2VySWRzLmxlbmd0aCkgcXVlcnkgKz0gXCIsIFwiO1xuICAgIH1cbiAgICBxdWVyeSArPSBgXG4gICAgICBPTiBDT05GTElDVCAodXNlcl9pZCwgJHt3YkNvbHVtbn0pXG4gICAgICBETyBVUERBVEUgU0VUXG4gICAgICByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsXG4gICAgICB1cGRhdGVkX2F0PUVYQ0xVREVELnVwZGF0ZWRfYXRcbiAgICBgO1xuICAgIGlmICgha2VlcEltcGxpZWRGcm9tKSBxdWVyeSArPSBcIiwgaW1wbGllZF9mcm9tX3JvbGVfaWQ9TlVMTFwiO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkPzogbnVtYmVyLFxuICAgIHBhcmVudE9iamVjdElkPzogbnVtYmVyLFxuICAgIGltcGxpZWRGcm9tUm9sZXM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBudW1iZXJbXSB8IHVuZGVmaW5lZClbXSA9IFt1c2VySWRzXTtcbiAgICBsZXQgd2JUYWJsZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgd2JXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzXCI7XG4gICAgICAgIHdiV2hlcmUgPSBcIkFORCBvcmdhbml6YXRpb25faWQ9JDJcIjtcbiAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnNjaGVtYV91c2Vyc1wiO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gXCJBTkQgc2NoZW1hX2lkPSQyXCI7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IGBcbiAgICAgICAgICAgIEFORCBzY2hlbWFfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgICAgIFdIRVJFIG9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMlxuICAgICAgICAgICAgKVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zLnB1c2gocGFyZW50T2JqZWN0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi50YWJsZV91c2Vyc1wiO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gXCJBTkQgdGFibGVfaWQ9JDJcIjtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gYFxuICAgICAgICAgICAgQU5EIHRhYmxlX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMlxuICAgICAgICAgICAgKVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zLnB1c2gocGFyZW50T2JqZWN0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKGltcGxpZWRGcm9tUm9sZXMpIHtcbiAgICAgIHdiV2hlcmUgKz0gYEFORCBpbXBsaWVkX2Zyb21fcm9sZV9pZD1BTlkoJDMpYDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUlkc0Zyb21OYW1lcyhpbXBsaWVkRnJvbVJvbGVzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NICR7d2JUYWJsZX1cbiAgICAgICAgV0hFUkUgdXNlcl9pZD1BTlkoJDEpXG4gICAgICAgICR7d2JXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgdGFibGVJZDogbnVtYmVyLFxuICAgIGRlbGV0ZU9ubHk/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVzSWRMb29rdXAoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHJvbGVzSWRMb29rdXAgPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV9wZXJtaXNzaW9uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3RhYmxlSWRdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmICghZGVsZXRlT25seSkge1xuICAgICAgZm9yIChjb25zdCB0YWJsZVJvbGUgb2YgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpKSB7XG4gICAgICAgIGZvciAoY29uc3QgcGVybWlzc2lvblByZWZpeCBvZiBSb2xlLnRhYmxlUGVybWlzc2lvblByZWZpeGVzKFxuICAgICAgICAgIHRhYmxlUm9sZVxuICAgICAgICApKSB7XG4gICAgICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV9wZXJtaXNzaW9ucyh0YWJsZV9wZXJtaXNzaW9uX2tleSwgdXNlcl9pZCwgdGFibGVfaWQpXG4gICAgICAgICAgICAgIFNFTEVDVCAnJHtSb2xlLnRhYmxlUGVybWlzc2lvbktleShcbiAgICAgICAgICAgICAgICBwZXJtaXNzaW9uUHJlZml4LFxuICAgICAgICAgICAgICAgIHRhYmxlSWRcbiAgICAgICAgICAgICAgKX0nLCB1c2VyX2lkLCAke3RhYmxlSWR9XG4gICAgICAgICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQxIEFORCB3Yi5yb2xlcy5uYW1lPSQyXG4gICAgICAgICAgICBgLFxuICAgICAgICAgICAgcGFyYW1zOiBbdGFibGVJZCwgdGFibGVSb2xlXSxcbiAgICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnJvbGVBbmRJZEZvclVzZXJPYmplY3QoJHt1c2VySWR9LCR7cm9sZUxldmVsfSwke29iamVjdElkT3JOYW1lfSwke3BhcmVudE9iamVjdE5hbWV9KWBcbiAgICApO1xuICAgIGxldCBvYmplY3RJZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBxdWVyeU9iaklkOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxKb2luOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodHlwZW9mIG9iamVjdElkT3JOYW1lID09PSBcIm51bWJlclwiKSBvYmplY3RJZCA9IG9iamVjdElkT3JOYW1lO1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFt1c2VySWRdO1xuICAgIGNvbnN0IHBhcmFtc09iaklkOiBzdHJpbmdbXSA9IFtdO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWRcbiAgICAgICAgYDtcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDJcbiAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgICBgO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDJcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPVxuICAgICAgICAgICAgXCJTRUxFQ1QgaWQgYXMgb2JqZWN0X2lkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIjtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgc3FsSm9pbiA9IGBcbiAgICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnJvbGVzLmlkPXdiLnNjaGVtYV91c2Vycy5yb2xlX2lkXG4gICAgICAgIGA7XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9JDFcbiAgICAgICAgYDtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZE9yTmFtZSk7XG4gICAgICAgICAgc3FsSm9pbiArPSBgXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgYDtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgICBxdWVyeU9iaklkID1cbiAgICAgICAgICAgIFwiU0VMRUNUIGlkIGFzIG9iamVjdF9pZCBGUk9NIHdiLnNjaGVtYXMgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXCI7XG4gICAgICAgICAgcGFyYW1zT2JqSWQucHVzaChvYmplY3RJZE9yTmFtZS50b1N0cmluZygpKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgc3FsSm9pbiA9IGBcbiAgICAgICAgIEpPSU4gd2IudGFibGVfdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2IudGFibGVfdXNlcnMucm9sZV9pZFxuICAgICAgICBgO1xuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9JDFcbiAgICAgICAgYDtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi50YWJsZV91c2Vycy50YWJsZV9pZD0kMlxuICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCFwYXJlbnRPYmplY3ROYW1lKSB7XG4gICAgICAgICAgICB0aHJvdyBgZGFsLnJvbGVOYW1lRm9yVXNlck9iamVjdCBwYXJlbnRPYmplY3ROYW1lIHJlcXVpcmVkIGZvciB0YWJsZSBsZXZlbGA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lLCBwYXJlbnRPYmplY3ROYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICAgIGA7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLnRhYmxlcy5uYW1lPSQyXG4gICAgICAgICAgICBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQzXG4gICAgICAgICAgYDtcbiAgICAgICAgICBxdWVyeU9iaklkID0gYFxuICAgICAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy5pZCBhcyBvYmplY3RfaWRcbiAgICAgICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMubmFtZT0kMSBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyXG4gICAgICAgICAgICBMSU1JVCAxXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCksIHBhcmVudE9iamVjdE5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWVcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICAke3NxbEpvaW59XG4gICAgICAgICR7c3FsV2hlcmV9ICBcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCFvYmplY3RJZCkge1xuICAgICAgcXVlcmllcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5T2JqSWQsXG4gICAgICAgIHBhcmFtczogcGFyYW1zT2JqSWQsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIGlmIChyZXN1bHRzWzFdICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGNvbnN0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIHJvbGVOYW1lOiBudWxsLFxuICAgICAgICBvYmplY3RJZDogbnVsbCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBpZiAocmVzdWx0c1swXS5wYXlsb2FkLnJvd3MubGVuZ3RoID09IDEpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lID0gcmVzdWx0c1swXS5wYXlsb2FkLnJvd3NbMF0ucm9sZV9uYW1lO1xuICAgIH1cbiAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLm9iamVjdElkID0gb2JqZWN0SWQ7XG4gICAgfSBlbHNlIGlmIChyZXN1bHRzWzFdLnBheWxvYWQucm93cy5sZW5ndGggPT0gMSkge1xuICAgICAgcmVzdWx0LnBheWxvYWQub2JqZWN0SWQgPSByZXN1bHRzWzFdLnBheWxvYWQucm93c1swXS5vYmplY3RfaWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBVc2VycyA9PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHVzZXJJZEZyb21BdXRoSWQoYXV0aElkOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudXNlcnMuaWRcbiAgICAgICAgRlJPTSB3Yi51c2Vyc1xuICAgICAgICBXSEVSRSBhdXRoX2lkPSQxXG4gICAgICAgIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFthdXRoSWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLnJvd3MubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbYXV0aElkXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3NbMF0uaWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnMoXG4gICAgaWRzPzogbnVtYmVyW10sXG4gICAgZW1haWxzPzogc3RyaW5nW10sXG4gICAgc2VhcmNoUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10gfCBzdHJpbmcpW10gPSBbXTtcbiAgICBpZiAoaWRzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIGlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkcyk7XG4gICAgfSBlbHNlIGlmIChlbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgZW1haWw9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWxzLm1hcCgodikgPT4gdi50b0xvd2VyQ2FzZSgpKSk7XG4gICAgfSBlbHNlIGlmIChzZWFyY2hQYXR0ZXJuKSB7XG4gICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgQU5EIGVtYWlsIExJS0UgJDFcbiAgICAgICAgT1IgZmlyc3RfbmFtZSBMSUtFICQxXG4gICAgICAgIE9SIGxhc3RfbmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goc2VhcmNoUGF0dGVybi5yZXBsYWNlKC9cXCovZywgXCIlXCIpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICBXSEVSRSBpZCBOT1QgSU4gKCR7VXNlci5TWVNfQURNSU5fSUR9KVxuICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIE9SREVSIEJZIGVtYWlsXG4gICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoXG4gICAgYXV0aElkPzogc3RyaW5nLFxuICAgIGVtYWlsPzogc3RyaW5nLFxuICAgIGZpcnN0TmFtZT86IHN0cmluZyxcbiAgICBsYXN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBhdXRoX2lkLCBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2F1dGhJZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbD86IHN0cmluZyxcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmcsXG4gICAgbGFzdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFlbWFpbCAmJiAhZmlyc3ROYW1lICYmICFsYXN0TmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IFwiZGFsLnVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IG51bWJlciB8IHN0cmluZylbXSA9IFtkYXRlLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCkge1xuICAgICAgcXVlcnkgKz0gYGVtYWlsPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWwpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBpZiAoZmlyc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgZmlyc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGZpcnN0TmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChsYXN0TmFtZSkge1xuICAgICAgcXVlcnkgKz0gYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGxhc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgcXVlcnkgKz0gXCJ1cGRhdGVkX2F0PSQxIFdIRVJFIGlkPSQyIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGVtYWlsIGxpa2UgJ3Rlc3RfJSR7ZW52aXJvbm1lbnQudGVzdFVzZXJFbWFpbERvbWFpbn0nXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIG9yZ2FuaXphdGlvbklkcz86IG51bWJlcltdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKlxuICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgYDtcbiAgICBpZiAob3JnYW5pemF0aW9uSWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMuaWQ9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkcyk7XG4gICAgfSBlbHNlIGlmIChvcmdhbml6YXRpb25OYW1lcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIHVzZXJSb2xlIGFuZCB1c2VyUm9sZUltcGxpZWRGcm9tIG9ubHkgcmV0dXJuZWQgaWYgdXNlcklkcy9FbWFpbHMubGVuZ3RoPT0xXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdKVtdID0gW107XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5pZD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgaWYgKG9yZ2FuaXphdGlvbk5hbWVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIiBBTkQgd2Iub3JnYW5pemF0aW9ucy5uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ICs9IFwiLCB3Yi5zY2hlbWFfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9uX3VzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2Iub3JnYW5pemF0aW9ucyhcbiAgICAgICAgICBuYW1lLCBsYWJlbFxuICAgICAgICApIFZBTFVFUygkMSwgJDIpXG4gICAgICAgIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWxdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbmV3TmFtZT86IHN0cmluZyxcbiAgICBuZXdMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChEYXRlIHwgc3RyaW5nKVtdID0gW25ldyBEYXRlKCldO1xuICAgIGxldCBxdWVyeSA9IFwiVVBEQVRFIHdiLm9yZ2FuaXphdGlvbnMgU0VUIHVwZGF0ZWRfYXQ9JDFcIjtcbiAgICBpZiAobmV3TmFtZSkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TmFtZSk7XG4gICAgICBxdWVyeSArPSBgLCBuYW1lPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICB9XG4gICAgaWYgKG5ld0xhYmVsKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdMYWJlbCk7XG4gICAgICBxdWVyeSArPSBgLCBsYWJlbD0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKG5hbWUpO1xuICAgIHF1ZXJ5ICs9IGAgV0hFUkUgbmFtZT0kJHtwYXJhbXMubGVuZ3RofSBSRVRVUk5JTkcgKmA7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIG5vIHBhdHRlcm5zIGFsbG93ZWQgaGVyZVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRlbGV0ZU9yZ2FuaXphdGlvbnMobmFtZS5yZXBsYWNlKC9cXCUvZywgXCJcIikpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRlbGV0ZU9yZ2FuaXphdGlvbnMoXCJ0ZXN0XyVcIik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9ucyhcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25faWQgSU4gKFxuICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgICApXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9uIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvblVzZXJzKFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZU5hbWVzPzogc3RyaW5nW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgc3RyaW5nW10gfCBudW1iZXJbXSlbXSA9IFtdO1xuICAgIGlmIChpZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkKTtcbiAgICB9IGVsc2UgaWYgKG5hbWUpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG5hbWUpO1xuICAgIH1cbiAgICBpZiAocm9sZU5hbWVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIiBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChyb2xlTmFtZXMpO1xuICAgIH1cbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgKz0gYCBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9QU5ZKCQke1xuICAgICAgICBwYXJhbXMubGVuZ3RoICsgMVxuICAgICAgfSlgO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbl91c2Vyc1xuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBVUERBVEUgd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgIFNFVCBzZXR0aW5ncz0kMSwgdXBkYXRlZF9hdD0kMlxuICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25faWQ9JDNcbiAgICAgICAgQU5EIHVzZXJfaWQ9JDRcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzZXR0aW5ncywgbmV3IERhdGUoKSwgb3JnYW5pemF0aW9uSWQsIHVzZXJJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBzY2hlbWFJZHM/OiBudW1iZXJbXSxcbiAgICBzY2hlbWFOYW1lcz86IHN0cmluZ1tdLFxuICAgIHNjaGVtYU5hbWVQYXR0ZXJuPzogc3RyaW5nLFxuICAgIG9yZGVyQnk/OiBzdHJpbmcsXG4gICAgbGltaXQ/OiBudW1iZXIsXG4gICAgd2JPbmx5PzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwZ1BhcmFtczogKHN0cmluZ1tdIHwgbnVtYmVyW10gfCBzdHJpbmcpW10gPSBbXG4gICAgICBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUyxcbiAgICBdO1xuICAgIGNvbnN0IHdiUGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxQZ1doZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXYldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMpIHtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hSWRzKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYU5hbWVzKSB7XG4gICAgICBzcWxQZ1doZXJlID0gXCJBTkQgc2NoZW1hX25hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGdQYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBuYW1lPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hTmFtZVBhdHRlcm4pIHtcbiAgICAgIHNxbFBnV2hlcmUgPSBcIkFORCBzY2hlbWFfbmFtZSBMSUtFICQyXCI7XG4gICAgICBwZ1BhcmFtcy5wdXNoKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIG5hbWUgTElLRSAkMVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwiZGFsLnNjaGVtYXM6IE9uZSBvZiBzY2hlbWFJZHMsIHNjaGVtYU5hbWVzIG9yIHNjaGVtYU5hbWVQYXR0ZXJuIG11c3QgYmUgc3BlY2lmaWVkLlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHNxbE9yZGVyQnkgPSBcIk9SREVSIEJZIG5hbWVcIjtcbiAgICBpZiAob3JkZXJCeSkge1xuICAgICAgY29uc3Qgc3BsaXQgPSBvcmRlckJ5LnNwbGl0KFwiIFwiKTtcbiAgICAgIHNxbE9yZGVyQnkgPSBgT1JERVIgQlkgJHtEQUwuc2FuaXRpemUoc3BsaXRbMF0pfWA7XG4gICAgICBpZiAoc3BsaXQubGVuZ3RoID09IDIpIHNxbE9yZGVyQnkgKz0gYCAke0RBTC5zYW5pdGl6ZShzcGxpdFsxXSl9YDtcbiAgICB9XG4gICAgbGV0IHNxbExpbWl0ID0gXCJcIjtcbiAgICBpZiAobGltaXQpIHNxbExpbWl0ID0gYExJTUlUICR7bGltaXR9YDtcbiAgICBjb25zdCBxdWVyaWVzOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIFNFTEVDVCB3Yi5zY2hlbWFzLipcbiAgICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAke3NxbFdiV2hlcmV9XG4gICAgICAgICAgJHtzcWxPcmRlckJ5fVxuICAgICAgICAgICR7c3FsTGltaXR9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogd2JQYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCF3Yk9ubHkgJiYgIWxpbWl0KSB7XG4gICAgICBxdWVyaWVzLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIFNFTEVDVCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGEuKlxuICAgICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXG4gICAgICAgICAgV0hFUkUgc2NoZW1hX25hbWUgTk9UIExJS0UgJ3BnXyUnXG4gICAgICAgICAgQU5EIHNjaGVtYV9uYW1lIT1BTlkoJDEpXG4gICAgICAgICAgJHtzcWxQZ1doZXJlfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IHBnUGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKHF1ZXJpZXMpO1xuICAgIGlmICghcmVzdWx0c1swXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1swXTtcbiAgICBpZiAoIXdiT25seSkge1xuICAgICAgaWYgKCFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgICAgaWYgKHJlc3VsdHNbMF0ucGF5bG9hZC5yb3dzLmxlbmd0aCAhPSByZXN1bHRzWzFdLnBheWxvYWQucm93cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgIFwiZGFsLnNjaGVtYXM6IHdiLnNjaGVtYXMgb3V0IG9mIHN5bmMgd2l0aCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmVzdWx0c1swXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJTY2hlbWFzKFxuICAgIHNjaGVtYU5hbWVQYXR0ZXJuPzogc3RyaW5nLFxuICAgIG9yZGVyQnk/OiBzdHJpbmcsXG4gICAgbGltaXQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFzY2hlbWFOYW1lUGF0dGVybikgc2NoZW1hTmFtZVBhdHRlcm4gPSBcIiVcIjtcbiAgICBpZiAoIW9yZGVyQnkpIG9yZGVyQnkgPSBcInNjaGVtYV9uYW1lXCI7XG4gICAgbGV0IHNxbExpbWl0ID0gXCJcIjtcbiAgICBpZiAobGltaXQpIHNxbExpbWl0ID0gYExJTUlUICR7bGltaXR9YDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhLnNjaGVtYV9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXG4gICAgICAgIFdIRVJFIHNjaGVtYV9uYW1lIE5PVCBMSUtFICdwZ18lJ1xuICAgICAgICBBTkQgc2NoZW1hX25hbWUhPUFOWSgkMSlcbiAgICAgICAgQU5EIHNjaGVtYV9uYW1lIExJS0UgJyR7c2NoZW1hTmFtZVBhdHRlcm59J1xuICAgICAgICBPUkRFUiBCWSAke29yZGVyQnl9XG4gICAgICAgICR7c3FsTGltaXR9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbU2NoZW1hLlNZU19TQ0hFTUFfTkFNRVNdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZC5yb3dzLm1hcChcbiAgICAgICAgKHJvdzogeyBzY2hlbWFfbmFtZTogc3RyaW5nIH0pID0+IHJvdy5zY2hlbWFfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBuZXh0VW5hc3NpZ25lZERlbW9TY2hlbWEoc2NoZW1hTmFtZVBhdHRlcm46IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi5zY2hlbWFzLipcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWUgTElLRSAnJHtzY2hlbWFOYW1lUGF0dGVybn0nXG4gICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0ke1VzZXIuU1lTX0FETUlOX0lEfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJzKFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiQU5EIHdiLnNjaGVtYXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2Iuc2NoZW1hX3VzZXJzLnNldHRpbmdzIGFzIHNldHRpbmdzXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb20sXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZSxcbiAgICAgICAgdXNlcl9vd25lcnMuZW1haWwgYXMgdXNlcl9vd25lcl9lbWFpbFxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnVzZXJzIHVzZXJfb3duZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD11c2VyX293bmVycy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIoXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWQpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlsKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfb3duZXJfZW1haWwsXG4gICAgICAgICdzY2hlbWFfb3duZXInIGFzIHJvbGVfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFzLnVzZXJfb3duZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgIGN1cnJlbnRVc2VySWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKG9yZ2FuaXphdGlvbklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWQpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgc3FsV2hlcmUgPSBgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWUpO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgKz0gYEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0kMmA7XG4gICAgICBwYXJhbXMucHVzaChjdXJyZW50VXNlcklkKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIHNjaGVtYV91c2VyX2ltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIG9uIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1zY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZCk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWwpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZVxuICAgICAgICBzY2hlbWFfdXNlcl9yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tLFxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iub3JnYW5pemF0aW9ucy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYV91c2VycyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD1zY2hlbWFfdXNlcl9yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9c2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5yb2xlcy5uYW1lPSdvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcidcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXIsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBuYW1lID0gREFMLnNhbml0aXplKG5hbWUpO1xuICAgIGNvbnN0IHF1ZXJpZXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hcyhcbiAgICAgICAgICAgIG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25fb3duZXJfaWQsIHVzZXJfb3duZXJfaWRcbiAgICAgICAgICApIFZBTFVFUygkMSwgJDIsICQzLCAkNCkgUkVUVVJOSU5HICpcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbk93bmVySWQsIHVzZXJPd25lcklkXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICBxdWVyaWVzLnB1c2goe1xuICAgICAgICBxdWVyeTogYENSRUFURSBTQ0hFTUEgJHtuYW1lfWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIGlmIChjcmVhdGUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgcmVzdWx0c1swXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlU2NoZW1hKFxuICAgIHNjaGVtYTogU2NoZW1hLFxuICAgIG5ld1NjaGVtYU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3U2NoZW1hTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3T3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBuZXdVc2VyT3duZXJJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnVwZGF0ZVNjaGVtYSgke3NjaGVtYX0sJHtuZXdTY2hlbWFOYW1lfSwke25ld1NjaGVtYUxhYmVsfSwke25ld09yZ2FuaXphdGlvbk93bmVySWR9LCR7bmV3VXNlck93bmVySWR9KWBcbiAgICApO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSBuZXdTY2hlbWFOYW1lID0gREFMLnNhbml0aXplKG5ld1NjaGVtYU5hbWUpO1xuICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBVUERBVEUgd2Iuc2NoZW1hcyBTRVRcbiAgICBgO1xuICAgIGxldCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdTY2hlbWFOYW1lKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm5hbWU9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChuZXdTY2hlbWFMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3U2NoZW1hTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChuZXdPcmdhbml6YXRpb25Pd25lcklkKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdPcmdhbml6YXRpb25Pd25lcklkKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm9yZ2FuaXphdGlvbl9vd25lcl9pZD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm9yZ2FuaXphdGlvbl91c2VyX2lkPU5VTExcIik7XG4gICAgfVxuICAgIGlmIChuZXdVc2VyT3duZXJJZCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3VXNlck93bmVySWQpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwidXNlcl9vd25lcl9pZD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm9yZ2FuaXphdGlvbl9vd25lcl9pZD1OVUxMXCIpO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChzY2hlbWEuaWQpO1xuICAgIHF1ZXJ5ICs9IGBcbiAgICAgICR7dXBkYXRlcy5qb2luKFwiLCBcIil9XG4gICAgICBXSEVSRSBpZD0kJHtwYXJhbXMubGVuZ3RofVxuICAgICAgUkVUVVJOSU5HICpcbiAgICBgO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAobmV3U2NoZW1hTmFtZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBTQ0hFTUEgXCIke3NjaGVtYS5uYW1lfVwiXG4gICAgICAgICAgUkVOQU1FIFRPICR7bmV3U2NoZW1hTmFtZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAobmV3U2NoZW1hTmFtZSAmJiAhcmVzdWx0c1sxXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1sxXTtcbiAgICBpZiAocmVzdWx0c1swXS5zdWNjZXNzKSB7XG4gICAgICByZXN1bHRzWzBdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNDSEVNQSBJRiBFWElTVFMgJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9IENBU0NBREVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lcz86IHN0cmluZ1tdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBpbXBsaWVkRnJvbVJvbGVJZD86IG51bWJlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IHN0cmluZ1tdIHwgbnVtYmVyIHwgbnVtYmVyW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmUgPSBcIlwiO1xuICAgIGlmIChyb2xlTmFtZXMpIHtcbiAgICAgIHBhcmFtcy5wdXNoKHJvbGVOYW1lcyk7XG4gICAgICBzcWxXaGVyZSA9IGBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJCR7cGFyYW1zLmxlbmd0aH0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgICAgc3FsV2hlcmUgPSBgQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPUFOWSgkJHtwYXJhbXMubGVuZ3RofSlgO1xuICAgIH1cbiAgICBpZiAoaW1wbGllZEZyb21Sb2xlSWQpIHtcbiAgICAgIHBhcmFtcy5wdXNoKGltcGxpZWRGcm9tUm9sZUlkKTtcbiAgICAgIHNxbFdoZXJlID0gYEFORCB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9JHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZCxcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBzY2hlbWFJZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGVzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLipcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMudGFibGVfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHRhYmxlX25hbWU6IHN0cmluZyB9KSA9PiByb3cudGFibGVfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXNCeVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHRhYmxlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnVzZXJzLmVtYWlsPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAodGFibGVOYW1lcykge1xuICAgICAgc3FsV2hlcmUgKz0gXCJBTkQgd2IudGFibGVzLm5hbWU9QU5ZKCQzKVwiO1xuICAgICAgcGFyYW1zLnB1c2godGFibGVOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2IudGFibGVfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlcy4qLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudGFibGVfdXNlcnMgT04gd2IudGFibGVzLmlkPXdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyB0eXBlID0gZm9yZWlnbktleXN8cmVmZXJlbmNlc3xhbGxcbiAgcHVibGljIGFzeW5jIGZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZVBhdHRlcm46IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKHRhYmxlTmFtZVBhdHRlcm4pO1xuICAgIGNvbHVtbk5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWVQYXR0ZXJuKTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlIFwiRk9SRUlHTl9LRVlTXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCBmay50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIGZrLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJSRUZFUkVOQ0VTXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCByZWYudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCByZWYuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIkFMTFwiOlxuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICAtLSB1bmlxdWUgcmVmZXJlbmNlIGluZm9cbiAgICAgICAgcmVmLnRhYmxlX25hbWUgICAgICAgQVMgcmVmX3RhYmxlLFxuICAgICAgICByZWYuY29sdW1uX25hbWUgICAgICBBUyByZWZfY29sdW1uLFxuICAgICAgICByZWZkLmNvbnN0cmFpbnRfdHlwZSBBUyByZWZfdHlwZSwgLS0gZS5nLiBVTklRVUUgb3IgUFJJTUFSWSBLRVlcbiAgICAgICAgLS0gZm9yZWlnbiBrZXkgaW5mb1xuICAgICAgICBmay50YWJsZV9uYW1lICAgICAgICBBUyBma190YWJsZSxcbiAgICAgICAgZmsuY29sdW1uX25hbWUgICAgICAgQVMgZmtfY29sdW1uLFxuICAgICAgICBmay5jb25zdHJhaW50X25hbWUgICBBUyBma19uYW1lLFxuICAgICAgICBtYXAudXBkYXRlX3J1bGUgICAgICBBUyBma19vbl91cGRhdGUsXG4gICAgICAgIG1hcC5kZWxldGVfcnVsZSAgICAgIEFTIGZrX29uX2RlbGV0ZVxuICAgICAgICAtLSBsaXN0cyBmayBjb25zdHJhaW50cyBBTkQgbWFwcyB0aGVtIHRvIHBrIGNvbnN0cmFpbnRzXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnJlZmVyZW50aWFsX2NvbnN0cmFpbnRzIEFTIG1hcFxuICAgICAgICAtLSBqb2luIHVuaXF1ZSBjb25zdHJhaW50cyAoZS5nLiBQS3MgY29uc3RyYWludHMpIHRvIHJlZiBjb2x1bW5zIGluZm9cbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyByZWZcbiAgICAgICAgT04gIHJlZi5jb25zdHJhaW50X2NhdGFsb2cgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9uYW1lXG4gICAgICAgIC0tIG9wdGlvbmFsOiB0byBpbmNsdWRlIHJlZmVyZW5jZSBjb25zdHJhaW50IHR5cGVcbiAgICAgICAgTEVGVCBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyBBUyByZWZkXG4gICAgICAgIE9OICByZWZkLmNvbnN0cmFpbnRfY2F0YWxvZyA9IHJlZi5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9zY2hlbWEgPSByZWYuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9uYW1lID0gcmVmLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBqb2luIGZrIGNvbHVtbnMgdG8gdGhlIGNvcnJlY3QgcmVmIGNvbHVtbnMgdXNpbmcgb3JkaW5hbCBwb3NpdGlvbnNcbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyBma1xuICAgICAgICBPTiAgZmsuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLmNvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgZmsuY29uc3RyYWludF9zY2hlbWEgPSBtYXAuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC5jb25zdHJhaW50X25hbWVcbiAgICAgICAgQU5EIGZrLnBvc2l0aW9uX2luX3VuaXF1ZV9jb25zdHJhaW50ID0gcmVmLm9yZGluYWxfcG9zaXRpb24gLS1JTVBPUlRBTlQhXG4gICAgICAgIFdIRVJFIHJlZi50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgIEFORCBmay50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgY29uc3RyYWludHM6IENvbnN0cmFpbnRJZFtdID0gW107XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgY29uc3QgY29uc3RyYWludDogQ29uc3RyYWludElkID0ge1xuICAgICAgICBjb25zdHJhaW50TmFtZTogcm93LmZrX25hbWUsXG4gICAgICAgIHRhYmxlTmFtZTogcm93LmZrX3RhYmxlLFxuICAgICAgICBjb2x1bW5OYW1lOiByb3cuZmtfY29sdW1uLFxuICAgICAgICByZWxUYWJsZU5hbWU6IHJvdy5yZWZfdGFibGUsXG4gICAgICAgIHJlbENvbHVtbk5hbWU6IHJvdy5yZWZfY29sdW1uLFxuICAgICAgfTtcbiAgICAgIGNvbnN0cmFpbnRzLnB1c2goY29uc3RyYWludCk7XG4gICAgfVxuICAgIHJlc3VsdC5wYXlsb2FkID0gY29uc3RyYWludHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcmltYXJ5S2V5cyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgRElTVElOQ1QgYy5jb2x1bW5fbmFtZSwgdGMuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIHRjIFxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb25zdHJhaW50X2NvbHVtbl91c2FnZSBBUyBjY3VcbiAgICAgICAgVVNJTkcgKGNvbnN0cmFpbnRfc2NoZW1hLCBjb25zdHJhaW50X25hbWUpXG4gICAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgQVMgY1xuICAgICAgICBPTiBjLnRhYmxlX3NjaGVtYSA9IHRjLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCB0Yy50YWJsZV9uYW1lID0gYy50YWJsZV9uYW1lXG4gICAgICAgIEFORCBjY3UuY29sdW1uX25hbWUgPSBjLmNvbHVtbl9uYW1lXG4gICAgICAgIFdIRVJFIGNvbnN0cmFpbnRfdHlwZSA9ICdQUklNQVJZIEtFWSdcbiAgICAgICAgQU5EIGMudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9ICcke3RhYmxlTmFtZX0nXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgICAgcEtDb2xzQ29uc3RyYWludHNbcm93LmNvbHVtbl9uYW1lXSA9IHJvdy5jb25zdHJhaW50X25hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHBLQ29sc0NvbnN0cmFpbnRzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbnN0cmFpbnROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdHJhaW50TmFtZSA9IERBTC5zYW5pdGl6ZShjb25zdHJhaW50TmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUyAke2NvbnN0cmFpbnROYW1lfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgUFJJTUFSWSBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KTtcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuY3JlYXRlRm9yZWlnbktleSgke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgcGFyZW50VGFibGVOYW1lID0gREFMLnNhbml0aXplKHBhcmVudFRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBwYXJlbnRDb2x1bW5OYW1lIG9mIHBhcmVudENvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShwYXJlbnRDb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIEFERCBDT05TVFJBSU5UICR7dGFibGVOYW1lfV8ke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCJfXCIpfV9ma2V5XG4gICAgICAgIEZPUkVJR04gS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgUkVGRVJFTkNFUyAke3NjaGVtYU5hbWV9LiR7cGFyZW50VGFibGVOYW1lfVxuICAgICAgICAgICgke3Nhbml0aXplZFBhcmVudENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgT04gREVMRVRFIFNFVCBOVUxMXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKiwgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlVGFibGUgJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHt0YWJsZUxhYmVsfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZXMoc2NoZW1hX2lkLCBuYW1lLCBsYWJlbClcbiAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKSBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWRbMF0uaWQsIHRhYmxlTmFtZSwgdGFibGVMYWJlbF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIigpYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAoY3JlYXRlICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMSBBTkQgbmFtZT0kMlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZFswXS5pZCwgdGFibGVOYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIgQ0FTQ0FERWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi50YWJsZXMgU0VUXG4gICAgYDtcbiAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1RhYmxlTGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBxdWVyeSArPSBgXG4gICAgICAke3VwZGF0ZXMuam9pbihcIiwgXCIpfVxuICAgICAgV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1cbiAgICAgIFJFVFVSTklORyAqXG4gICAgYDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgUkVOQU1FIFRPICR7bmV3VGFibGVOYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIGlmIChuZXdUYWJsZU5hbWUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2Vzcykge1xuICAgICAgcmVzdWx0c1swXS5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKVswXTtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZC5zY2hlbWFOYW1lID0gc2NoZW1hTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXJbXSlbXSA9IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdO1xuICAgIGxldCBzcWxTZWxlY3Q6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdoZXJlID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi50YWJsZV91c2Vycy51c2VyX2lkPUFOWSgkMylcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vycy5zZXR0aW5ncyxcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy51c2VyX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMuY3JlYXRlZF9hdCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudGFibGVzLm5hbWUgYXMgdGFibGVfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDEgQU5EIHdiLnRhYmxlcy5uYW1lPSQyXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IFRhYmxlVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmICF0YWJsZUlkcyBhbGwgdGFibGVzIGZvciBzY2hlbWFcbiAgLy8gaWYgIXVzZXJJZHMgYWxsIHNjaGVtYV91c2Vyc1xuICBwdWJsaWMgYXN5bmMgc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXIsXG4gICAgcm9sZU1hcD86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKCR7b3JnYW5pemF0aW9uSWR9LCA8cm9sZU1hcD4sICR7c2NoZW1hSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nSW1wbGllZEZyb21Sb2xlTmFtZX0pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlU2NoZW1hc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVNjaGVtYVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHNjaGVtYUlkcyAmJiBzY2hlbWFJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVTY2hlbWFzU3FsID0gYEFORCB3Yi5zY2hlbWFzLmlkIElOICgke3NjaGVtYUlkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMgJiYgdXNlcklkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVNjaGVtYVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lKSB7XG4gICAgICBjb25zdCBpbXBsaWVkRnJvbVJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUoXG4gICAgICAgIGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFpbXBsaWVkRnJvbVJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGltcGxpZWRGcm9tUm9sZVJlc3VsdDtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIFdIRVJFXG4gICAgICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlU2NoZW1hc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9JHtpbXBsaWVkRnJvbVJvbGVSZXN1bHQucGF5bG9hZC5pZH1cbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFVc2Vyc1NxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbb3JnYW5pemF0aW9uSWRdLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVwZGF0ZSBpbXBsaWVkIHJvbGVzIG9ubHksIGxlYXZlIGV4cGxpY2l0IHJvbGVzIGFsb25lXG4gICAgICBvbkNvbmZsaWN0U3FsID0gYFxuICAgICAgICBPTiBDT05GTElDVCAoc2NoZW1hX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgaWYgKHJvbGVNYXApIHtcbiAgICAgIGZvciAoY29uc3Qgb3JnYW5pemF0aW9uUm9sZSBvZiBPYmplY3Qua2V5cyhyb2xlTWFwKSkge1xuICAgICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hX3VzZXJzKHNjaGVtYV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICAgIHdiLnNjaGVtYXMuaWQsXG4gICAgICAgICAgICB1c2VyX2lkLFxuICAgICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbb3JnYW5pemF0aW9uUm9sZV1dfSxcbiAgICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtvcmdhbml6YXRpb25Sb2xlXX0sXG4gICAgICAgICAgICAkMVxuICAgICAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPSQyXG4gICAgICAgICAgICBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFzU3FsfVxuICAgICAgICAgICAgJHt3aGVyZVVzZXJzU3FsfVxuICAgICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICAgIGAsXG4gICAgICAgICAgcGFyYW1zOiBbZGF0ZSwgb3JnYW5pemF0aW9uSWQsIHJvbGVzSWRMb29rdXBbb3JnYW5pemF0aW9uUm9sZV1dLFxuICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgIHNjaGVtYUlkOiBudW1iZXIsXG4gICAgcm9sZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICB0YWJsZUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKCR7c2NoZW1hSWR9LCAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICByb2xlTWFwXG4gICAgICApfSwgJHt0YWJsZUlkc30sICR7dXNlcklkc30sICR7Y2xlYXJFeGlzdGluZ30pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlVGFibGVzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVGFibGVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IG9uQ29uZmxpY3RTcWwgPSBcIlwiO1xuICAgIGlmICh0YWJsZUlkcyAmJiB0YWJsZUlkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVRhYmxlc1NxbCA9IGBBTkQgd2IudGFibGVzLmlkIElOICgke3RhYmxlSWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBpZiAodXNlcklkcyAmJiB1c2VySWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlVGFibGVVc2Vyc1NxbCA9IGBcbiAgICAgICAgQU5EIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmcpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICAgV0hFUkVcbiAgICAgICAgICAgIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlcy5zY2hlbWFfaWQ9JDFcbiAgICAgICAgICAgICAgJHt3aGVyZVRhYmxlc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICR7d2hlcmVUYWJsZVVzZXJzU3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFJZF0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXBkYXRlIGltcGxpZWQgcm9sZXMgb25seSwgbGVhdmUgZXhwbGljaXQgcm9sZXMgYWxvbmVcbiAgICAgIG9uQ29uZmxpY3RTcWwgPSBgXG4gICAgICAgIE9OIENPTkZMSUNUICh0YWJsZV9pZCwgdXNlcl9pZClcbiAgICAgICAgRE8gVVBEQVRFIFNFVCByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgICAgICBXSEVSRSB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzY2hlbWFSb2xlIG9mIE9iamVjdC5rZXlzKHJvbGVNYXApKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV91c2Vycyh0YWJsZV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgU0VMRUNUXG4gICAgICAgICAgd2IudGFibGVzLmlkLFxuICAgICAgICAgIHVzZXJfaWQsXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbc2NoZW1hUm9sZV1dfSxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbc2NoZW1hUm9sZV19LFxuICAgICAgICAgICQxXG4gICAgICAgICAgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2Iuc2NoZW1hcy5pZD13Yi50YWJsZXMuc2NoZW1hX2lkXG4gICAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9JDIgQU5EIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPSQzXG4gICAgICAgICAgJHt3aGVyZVRhYmxlc1NxbH1cbiAgICAgICAgICAke3doZXJlVXNlcnNTcWx9XG4gICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtkYXRlLCBzY2hlbWFJZCwgcm9sZXNJZExvb2t1cFtzY2hlbWFSb2xlXV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlQWxsVGFibGVVc2VycyhcbiAgICB0YWJsZUlkPzogbnVtYmVyLFxuICAgIHNjaGVtYUlkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeVdoZXJlID0gXCJcIjtcbiAgICBjb25zdCBwYXJhbXM6IG51bWJlcltdID0gW107XG4gICAgaWYgKHRhYmxlSWQpIHtcbiAgICAgIHF1ZXJ5V2hlcmUgPSBcIldIRVJFIHRhYmxlX2lkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh0YWJsZUlkKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYUlkKSB7XG4gICAgICBxdWVyeVdoZXJlID0gYFxuICAgICAgICBXSEVSRSB0YWJsZV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIGZyb20gd2IudGFibGVzXG4gICAgICAgICAgV0hFUkUgd2IudGFibGVzLnNjaGVtYV9pZD0kMVxuICAgICAgICApXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goc2NoZW1hSWQpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICAke3F1ZXJ5V2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgdGFibGVJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgVVBEQVRFIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIFNFVCBzZXR0aW5ncz0kMSwgdXBkYXRlZF9hdD0kMlxuICAgICAgICBXSEVSRSB0YWJsZV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCB0YWJsZUlkLCB1c2VySWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbkJ5U2NoZW1hTmFtZVRhYmxlTmFtZUNvbHVtbk5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJDT0xVTU5fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnk6IHN0cmluZyA9IGBcbiAgICAgIFNFTEVDVCB3Yi5jb2x1bW5zLiosXG4gICAgICBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy5kYXRhX3R5cGUgYXMgdHlwZSxcbiAgICAgIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9kZWZhdWx0IGFzIGRlZmF1bHRcbiAgICAgIEZST00gd2IuY29sdW1uc1xuICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IuY29sdW1ucy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgT04gKFxuICAgICAgICB3Yi5jb2x1bW5zLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWVcbiAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9zY2hlbWFcbiAgICAgIClcbiAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX25hbWU9JDJcbiAgICBgO1xuICAgIGxldCBwYXJhbXM6IHN0cmluZ1tdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9IEFORCB3Yi5jb2x1bW5zLm5hbWU9JDMgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lPSQzYDtcbiAgICAgIHBhcmFtcy5wdXNoKGNvbHVtbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyQ29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU6IGJvb2xlYW4sXG4gICAgY29sdW1uUEdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuYWRkT3JDcmVhdGVDb2x1bW4gJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHtjb2x1bW5OYW1lfSAke2NvbHVtbkxhYmVsfSAke2NvbHVtblBHVHlwZX0gJHtjcmVhdGV9YFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2IuY29sdW1ucyh0YWJsZV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZC5pZCwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFERCAke2NvbHVtbk5hbWV9ICR7Y29sdW1uUEdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIGlmIChjcmVhdGUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXTtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1uQnlTY2hlbWFOYW1lVGFibGVOYW1lQ29sdW1uTmFtZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICAgIGxldCBxdWVyeSA9IGBcbiAgICAgICAgVVBEQVRFIHdiLmNvbHVtbnMgU0VUXG4gICAgICBgO1xuICAgICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5OYW1lKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5MYWJlbCk7XG4gICAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgICAgcXVlcnkgKz0gYCR7dXBkYXRlcy5qb2luKFwiLCBcIil9IFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld1R5cGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFMVEVSIENPTFVNTiAke2NvbHVtbk5hbWV9IFRZUEUgJHtuZXdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgQ09MVU1OICR7Y29sdW1uTmFtZX0gVE8gJHtuZXdDb2x1bW5OYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkU2VxdWVuY2VUb0NvbHVtbihcbiAgICBzY2hlbWE6IFNjaGVtYSxcbiAgICB0YWJsZTogVGFibGUsXG4gICAgY29sdW1uOiBDb2x1bW4sXG4gICAgbmV4dFNlcU51bWJlcj86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIW5leHRTZXFOdW1iZXIpIHtcbiAgICAgIGNvbnN0IG5leHRTZXFOdW1iZXJSZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUICR7Y29sdW1uLm5hbWV9IGFzIG1heF92YWxcbiAgICAgICAgICBGUk9NICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX1cbiAgICAgICAgICBPUkRFUiBCWSAke2NvbHVtbi5uYW1lfSBERVNDXG4gICAgICAgICAgTElNSVQgMVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgICBpZiAoXG4gICAgICAgIG5leHRTZXFOdW1iZXJSZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgICBuZXh0U2VxTnVtYmVyUmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMVxuICAgICAgKSB7XG4gICAgICAgIG5leHRTZXFOdW1iZXIgPVxuICAgICAgICAgIHBhcnNlSW50KG5leHRTZXFOdW1iZXJSZXN1bHQucGF5bG9hZC5yb3dzWzBdLm1heF92YWwpICsgMTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFuZXh0U2VxTnVtYmVyIHx8IG5leHRTZXFOdW1iZXIgPCAxKSBuZXh0U2VxTnVtYmVyID0gMTtcbiAgICBjb25zdCBzZXF1ZW5jTmFtZSA9IGB3YnNlcV9zJHtzY2hlbWEuaWR9X3Qke3RhYmxlLmlkfV9jJHtjb2x1bW4uaWR9YDtcbiAgICBsb2cud2FybihcIm5leHRTZXFOdW1iZXJcIiArIG5leHRTZXFOdW1iZXIpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYENSRUFURSBTRVFVRU5DRSAke3NjaGVtYS5uYW1lfS4ke3NlcXVlbmNOYW1lfTtgLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBBTFRFUiBUQUJMRSAke3NjaGVtYS5uYW1lfS4ke3RhYmxlLm5hbWV9IEFMVEVSIENPTFVNTiAke2NvbHVtbi5uYW1lfSBTRVQgREVGQVVMVCBuZXh0dmFsKCcke3NjaGVtYS5uYW1lfS5cIiR7c2VxdWVuY05hbWV9XCInKWAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYEFMVEVSIFNFUVVFTkNFICR7c2NoZW1hLm5hbWV9LiR7c2VxdWVuY05hbWV9IE9XTkVEIEJZICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX0uJHtjb2x1bW4ubmFtZX1gLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBTRUxFQ1Qgc2V0dmFsKCcke3NjaGVtYS5uYW1lfS5cIiR7c2VxdWVuY05hbWV9XCInLCAke1xuICAgICAgICAgIG5leHRTZXFOdW1iZXIgLSAxXG4gICAgICAgIH0pYCxcbiAgICAgIH0sXG4gICAgXSk7XG4gICAgcmV0dXJuIHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IuY29sdW1uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxIEFORCBuYW1lPSQyXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkLmlkLCBjb2x1bW5OYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5OYW1lfSBDQVNDQURFXG4gICAgICAgIGAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQ29sdW1uIHtcbiAgc3RhdGljIENPTU1PTl9UWVBFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBUZXh0OiBcInRleHRcIixcbiAgICBOdW1iZXI6IFwiaW50ZWdlclwiLFxuICAgIERlY2ltYWw6IFwiZGVjaW1hbFwiLFxuICAgIEJvb2xlYW46IFwiYm9vbGVhblwiLFxuICAgIERhdGU6IFwiZGF0ZVwiLFxuICAgIFwiRGF0ZSAmIFRpbWVcIjogXCJ0aW1lc3RhbXBcIixcbiAgfTtcblxuICBpZCE6IG51bWJlcjtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIHBnIGRhdGFcbiAgdHlwZSE6IHN0cmluZztcbiAgZGVmYXVsdD86IHN0cmluZztcbiAgLy8gbm90IHBlcnNpc3RlZFxuICBpc1ByaW1hcnlLZXkhOiBib29sZWFuO1xuICBmb3JlaWduS2V5cyE6IFtDb25zdHJhaW50SWRdO1xuICByZWZlcmVuY2VkQnkhOiBbQ29uc3RyYWludElkXTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PENvbHVtbj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiQ29sdW1uLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBBcnJheTxDb2x1bW4+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBjb2x1bW5zLnB1c2goQ29sdW1uLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiBjb2x1bW5zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogQ29sdW1uIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIkNvbHVtbi5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBjb2x1bW4gPSBuZXcgQ29sdW1uKCk7XG4gICAgY29sdW1uLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgY29sdW1uLnRhYmxlSWQgPSBwYXJzZUludChkYXRhLnRhYmxlX2lkKTtcbiAgICBjb2x1bW4ubmFtZSA9IGRhdGEubmFtZTtcbiAgICBjb2x1bW4ubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIGNvbHVtbi50eXBlID0gZGF0YS50eXBlO1xuICAgIGNvbHVtbi5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgY29sdW1uLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5kZWZhdWx0KSBjb2x1bW4uZGVmYXVsdCA9IGRhdGEuZGVmYXVsdDtcbiAgICByZXR1cm4gY29sdW1uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBVc2VyIH0gZnJvbSBcIi5cIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nLCBXaGl0ZWJyaWNrQ2xvdWQgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuaW1wb3J0IHsgUm9sZUxldmVsLCBVc2VyQWN0aW9uUGVybWlzc2lvbiB9IGZyb20gXCIuL1JvbGVcIjtcbmltcG9ydCB7IERFRkFVTFRfUE9MSUNZIH0gZnJvbSBcIi4uL3BvbGljeVwiO1xuaW1wb3J0IHsgZW52aXJvbm1lbnQgfSBmcm9tIFwiLi4vZW52aXJvbm1lbnRcIjtcblxuZXhwb3J0IGNsYXNzIEN1cnJlbnRVc2VyIHtcbiAgd2JDbG91ZCE6IFdoaXRlYnJpY2tDbG91ZDtcbiAgdXNlciE6IFVzZXI7XG4gIGlkITogbnVtYmVyO1xuICBhY3Rpb25IaXN0b3J5OiBVc2VyQWN0aW9uUGVybWlzc2lvbltdID0gW107XG5cbiAgLy8geyByb2xlTGV2ZWw6IHsgb2JqZWN0SWQ6IHsgdXNlckFjdGlvbjogeyBjaGVja2VkRm9yUm9sZU5hbWU6IHN0cmluZywgcGVybWl0dGVkOiB0cnVlL2ZhbHNlfSB9IH0gfVxuICBvYmplY3RQZXJtaXNzaW9uc0xvb2t1cDogUmVjb3JkPFxuICAgIFJvbGVMZXZlbCxcbiAgICBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+Pj5cbiAgPiA9IHtcbiAgICBvcmdhbml6YXRpb246IHt9LFxuICAgIHNjaGVtYToge30sXG4gICAgdGFibGU6IHt9LFxuICB9O1xuXG4gIGNvbnN0cnVjdG9yKHVzZXI6IFVzZXIsIHdiQ2xvdWQ/OiBXaGl0ZWJyaWNrQ2xvdWQpIHtcbiAgICBpZiAod2JDbG91ZCkgdGhpcy53YkNsb3VkID0gd2JDbG91ZDtcbiAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgIHRoaXMuaWQgPSB1c2VyLmlkO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKFVzZXIuZ2V0U3lzQWRtaW5Vc2VyKCkpO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRQdWJsaWMoKSB7XG4gICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihVc2VyLmdldFB1YmxpY1VzZXIoKSk7XG4gIH1cblxuICBwdWJsaWMgaXNTaWduZWRJbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkICE9PSBVc2VyLlBVQkxJQ19JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc250U2lnbmVkSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PSBVc2VyLlBVQkxJQ19JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZE91dCgpIHtcbiAgICByZXR1cm4gdGhpcy5pc250U2lnbmVkSW4oKTtcbiAgfVxuXG4gIHB1YmxpYyBpc1B1YmxpYygpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNTaWduZWRJbigpO1xuICB9XG5cbiAgcHVibGljIGlzU3lzQWRtaW4oKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PT0gVXNlci5TWVNfQURNSU5fSUQ7XG4gIH1cblxuICBwdWJsaWMgaXNudFN5c0FkbWluKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1N5c0FkbWluO1xuICB9XG5cbiAgcHVibGljIGlzVGVzdFVzZXIoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMudXNlci5lbWFpbCAmJlxuICAgICAgdGhpcy51c2VyLmVtYWlsLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoZW52aXJvbm1lbnQudGVzdFVzZXJFbWFpbERvbWFpbilcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGlzbnRUZXN0VXNlcigpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNUZXN0VXNlcjtcbiAgfVxuXG4gIHB1YmxpYyBpZElzKG90aGVySWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLnVzZXIuaWQgPT0gb3RoZXJJZDtcbiAgfVxuXG4gIHB1YmxpYyBpZElzbnQob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuICF0aGlzLmlkSXMob3RoZXJJZCk7XG4gIH1cblxuICBwdWJsaWMgZGVuaWVkKCkge1xuICAgIGxldCBtZXNzYWdlID0gXCJJTlRFUk5BTCBFUlJPUjogTGFzdCBVc2VyQWN0aW9uUGVybWlzc2lvbiBub3QgcmVjb3JkZWQuIFwiO1xuICAgIGxldCB2YWx1ZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgbGFzdFVBUCA9IHRoaXMuYWN0aW9uSGlzdG9yeS5wb3AoKTtcbiAgICBpZiAobGFzdFVBUCkge1xuICAgICAgbWVzc2FnZSA9IGBZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byAke2xhc3RVQVAuZGVzY3JpcHRpb259LmA7XG4gICAgICBsZXQgdXNlclN0ciA9IGB1c2VySWQ9JHt0aGlzLmlkfWA7XG4gICAgICBpZiAodGhpcy51c2VyICYmIHRoaXMudXNlci5lbWFpbCkge1xuICAgICAgICB1c2VyU3RyID0gYHVzZXJFbWFpbD0ke3RoaXMudXNlci5lbWFpbH0sICR7dXNlclN0cn1gO1xuICAgICAgfVxuICAgICAgdmFsdWVzID0gW1xuICAgICAgICB1c2VyU3RyLFxuICAgICAgICBgb2JqZWN0SWQ9JHtsYXN0VUFQLm9iamVjdElkfWAsXG4gICAgICAgIGB1c2VyQWN0aW9uPSR7bGFzdFVBUC51c2VyQWN0aW9ufWAsXG4gICAgICAgIGBjaGVja2VkRm9yUm9sZU5hbWU9JHtsYXN0VUFQLmNoZWNrZWRGb3JSb2xlTmFtZX1gLFxuICAgICAgICBgY2hlY2tlZEF0PSR7bGFzdFVBUC5jaGVja2VkQXR9YCxcbiAgICAgIF07XG4gICAgfVxuICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgICAgdmFsdWVzOiB2YWx1ZXMsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU2lnbmVkSW4oKSB7XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IFwiWW91IG11c3QgYmUgc2lnbmVkLWluIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU3lzQWRtaW4oKSB7XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IFwiWW91IG11c3QgYmUgYSBTeXN0ZW0gQWRtaW5pc3RyYXRvciB0byBwZXJmb3JtIHRoaXMgYWN0aW9uLlwiLFxuICAgICAgd2JDb2RlOiBcIldCX0ZPUkJJRERFTlwiLFxuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIG11c3RCZVN5c0FkbWluT3JUZXN0VXNlcigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJZb3UgbXVzdCBiZSBhIFN5c3RlbSBBZG1pbmlzdHJhdG9yIG9yIFRlc3QgVXNlciB0byBwZXJmb3JtIHRoaXMgYWN0aW9uLlwiLFxuICAgICAgd2JDb2RlOiBcIldCX0ZPUkJJRERFTlwiLFxuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIG11c3RCZVNlbGYoKSB7XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IFwiVGhpcyBhY3Rpb24gY2FuIG9ubHkgYmUgcGVyZm9ybWVkIG9uIHlvdXJzZWxmIGFzIHRoZSB1c2VyLlwiLFxuICAgICAgd2JDb2RlOiBcIldCX0ZPUkJJRERFTlwiLFxuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIG11c3RCZVN5c0FkbWluT3JTZWxmKCkge1xuICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIllvdSBtdXN0IGJlIGEgU3lzdGVtIEFkbWluaXN0cmF0b3Igb3IgeW91cnNlbGYgYXMgdGhlIHVzZXIgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbi5cIixcbiAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFRCRCBtb3ZlIHRvIEVsYXN0aUNhY2hlXG4gIHByaXZhdGUgZ2V0T2JqZWN0UGVybWlzc2lvbihcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV0gJiZcbiAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICByb2xlTGV2ZWw6IHJvbGVMZXZlbCxcbiAgICAgICAgdXNlckFjdGlvbjogdXNlckFjdGlvbixcbiAgICAgICAgb2JqZWN0S2V5OiBrZXksXG4gICAgICAgIG9iamVjdElkOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dLm9ia2VjdElkLFxuICAgICAgICBjaGVja2VkRm9yUm9sZU5hbWU6XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl1cbiAgICAgICAgICAgIC5jaGVja2VkRm9yUm9sZU5hbWUsXG4gICAgICAgIHBlcm1pdHRlZDpcbiAgICAgICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXS5wZXJtaXR0ZWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dLmRlc2NyaXB0aW9uLFxuICAgICAgfSBhcyBVc2VyQWN0aW9uUGVybWlzc2lvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLy8gVEJEIG1vdmUgdG8gRWxhc3RpQ2FjaGVcbiAgcHJpdmF0ZSBzZXRPYmplY3RQZXJtaXNzaW9uKHVBUDogVXNlckFjdGlvblBlcm1pc3Npb24pIHtcbiAgICBpZiAoIXRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbdUFQLnJvbGVMZXZlbF1bdUFQLm9iamVjdElkXSkge1xuICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFt1QVAucm9sZUxldmVsXVt1QVAub2JqZWN0SWRdID0ge307XG4gICAgfVxuICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbdUFQLnJvbGVMZXZlbF1bdUFQLm9iamVjdElkXVt1QVAudXNlckFjdGlvbl0gPVxuICAgICAge1xuICAgICAgICBwZXJtaXR0ZWQ6IHVBUC5wZXJtaXR0ZWQsXG4gICAgICAgIGNoZWNrZWRGb3JSb2xlTmFtZTogdUFQLmNoZWNrZWRGb3JSb2xlTmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246IHVBUC5kZXNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgcmV0dXJuIHVBUDtcbiAgfVxuXG4gIHByaXZhdGUgcmVjb3JkQWN0aW9uSGlzdG9yeSh1QVA6IFVzZXJBY3Rpb25QZXJtaXNzaW9uKSB7XG4gICAgdUFQLmNoZWNrZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgdGhpcy5hY3Rpb25IaXN0b3J5LnB1c2godUFQKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0VXNlckFjdGlvblBvbGljeShcbiAgICBwb2xpY3k6IFJlY29yZDxzdHJpbmcsIGFueT5bXSxcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmdcbiAgKSB7XG4gICAgZm9yIChjb25zdCB1c2VyQWN0aW9uUG9saWN5IG9mIHBvbGljeSkge1xuICAgICAgaWYgKHVzZXJBY3Rpb25Qb2xpY3kudXNlckFjdGlvbiA9PSB1c2VyQWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB1c2VyQWN0aW9uUG9saWN5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0T2JqZWN0TG9va3VwS2V5KFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApIHtcbiAgICBsZXQga2V5OiBzdHJpbmcgPSBvYmplY3RJZE9yTmFtZS50b1N0cmluZygpO1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0SWRPck5hbWUgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgIGtleSA9IGBpZCR7b2JqZWN0SWRPck5hbWV9YDtcbiAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdE5hbWUpIHtcbiAgICAgIGtleSA9IGAke3BhcmVudE9iamVjdE5hbWV9LiR7b2JqZWN0SWRPck5hbWV9YDtcbiAgICB9XG4gICAgcmV0dXJuIGtleTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjYW4oXG4gICAgdXNlckFjdGlvbjogc3RyaW5nLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBpZiAodGhpcy5pc1N5c0FkbWluKCkpIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHBvbGljeSA9IERFRkFVTFRfUE9MSUNZW3VzZXJBY3Rpb25dO1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBjdXJyZW50VXNlci5jYW4oJHt1c2VyQWN0aW9ufSwke29iamVjdElkT3JOYW1lfSkgcG9saWN5OiR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHBvbGljeVxuICAgICAgKX1gXG4gICAgKTtcbiAgICBpZiAoIXBvbGljeSkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBObyBwb2xpY3kgZm91bmQgZm9yIHVzZXJBY3Rpb249JHt1c2VyQWN0aW9ufWA7XG4gICAgICBsb2cuZXJyb3IobWVzc2FnZSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgfVxuICAgIGxldCBrZXkgPSB0aGlzLmdldE9iamVjdExvb2t1cEtleShvYmplY3RJZE9yTmFtZSwgcGFyZW50T2JqZWN0TmFtZSk7XG4gICAgY29uc3QgYWxyZWFkeUNoZWNrZWQgPSB0aGlzLmdldE9iamVjdFBlcm1pc3Npb24oXG4gICAgICBwb2xpY3kucm9sZUxldmVsLFxuICAgICAgdXNlckFjdGlvbixcbiAgICAgIGtleVxuICAgICk7XG4gICAgaWYgKGFscmVhZHlDaGVja2VkICE9PSBudWxsKSB7XG4gICAgICB0aGlzLnJlY29yZEFjdGlvbkhpc3RvcnkoYWxyZWFkeUNoZWNrZWQpO1xuICAgICAgcmV0dXJuIGFscmVhZHlDaGVja2VkLnBlcm1pdHRlZDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMud2JDbG91ZC5yb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIHRoaXMuaWQsXG4gICAgICBwb2xpY3kucm9sZUxldmVsLFxuICAgICAgb2JqZWN0SWRPck5hbWUsXG4gICAgICBwYXJlbnRPYmplY3ROYW1lXG4gICAgKTtcbiAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBFcnJvciBnZXR0aW5nIHJvbGVOYW1lRm9yVXNlck9iamVjdCgke3RoaXMuaWR9LCR7XG4gICAgICAgIHBvbGljeS5yb2xlTGV2ZWxcbiAgICAgIH0sJHtvYmplY3RJZE9yTmFtZX0sJHtwYXJlbnRPYmplY3ROYW1lfSkuICR7SlNPTi5zdHJpbmdpZnkocm9sZVJlc3VsdCl9YDtcbiAgICAgIGxvZy5lcnJvcihtZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICB9XG4gICAgaWYgKCFyb2xlUmVzdWx0LnBheWxvYWQub2JqZWN0SWQpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgT2JqZWN0SWQgY291bGQgbm90IGJlIGZvdW5kYDtcbiAgICAgIGxvZy5lcnJvcihtZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICB9XG4gICAgbGV0IHBlcm1pdHRlZCA9IGZhbHNlO1xuICAgIGlmIChcbiAgICAgIHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSAmJlxuICAgICAgcG9saWN5LnBlcm1pdHRlZFJvbGVzLmluY2x1ZGVzKHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSlcbiAgICApIHtcbiAgICAgIHBlcm1pdHRlZCA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHVBUDogVXNlckFjdGlvblBlcm1pc3Npb24gPSB7XG4gICAgICByb2xlTGV2ZWw6IHBvbGljeS5yb2xlTGV2ZWwsXG4gICAgICBvYmplY3RLZXk6IGtleSxcbiAgICAgIG9iamVjdElkOiByb2xlUmVzdWx0LnBheWxvYWQub2JqZWN0SWQsXG4gICAgICB1c2VyQWN0aW9uOiB1c2VyQWN0aW9uLFxuICAgICAgcGVybWl0dGVkOiBwZXJtaXR0ZWQsXG4gICAgICBkZXNjcmlwdGlvbjogcG9saWN5LmRlc2NyaXB0aW9uLFxuICAgIH07XG4gICAgaWYgKHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZSkge1xuICAgICAgdUFQLmNoZWNrZWRGb3JSb2xlTmFtZSA9IHJvbGVSZXN1bHQucGF5bG9hZC5yb2xlTmFtZTtcbiAgICB9XG4gICAgdGhpcy5zZXRPYmplY3RQZXJtaXNzaW9uKHVBUCk7XG4gICAgdGhpcy5yZWNvcmRBY3Rpb25IaXN0b3J5KHVBUCk7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJvbGU6ICR7SlNPTi5zdHJpbmdpZnkocm9sZVJlc3VsdC5wYXlsb2FkKX0gcGVybWl0dGVkOiAke3Blcm1pdHRlZH1gXG4gICAgKTtcbiAgICByZXR1cm4gcGVybWl0dGVkO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNhbnQoXG4gICAgdXNlckFjdGlvbjogc3RyaW5nLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjYW4gPSBhd2FpdCB0aGlzLmNhbih1c2VyQWN0aW9uLCBvYmplY3RJZE9yTmFtZSwgcGFyZW50T2JqZWN0TmFtZSk7XG4gICAgcmV0dXJuICFjYW47XG4gIH1cblxuICAvLyBhc3luYyBvbmx5IHJlcXVpcmVkIHRvIGxvb2t1cCB1c2VySWQgZnJvbSBlbWFpbCB3aGVuIHRlc3RpbmdcbiAgcHVibGljIHN0YXRpYyBhc3luYyBmcm9tQ29udGV4dChjb250ZXh0OiBhbnkpOiBQcm9taXNlPEN1cnJlbnRVc2VyPiB7XG4gICAgLy9sb2cuaW5mbyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKFxuICAgICAgY29udGV4dC5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgICApLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChcbiAgICAgIC8vIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgKSB7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFRFU1QgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5wYXlsb2FkICYmIHJlc3VsdC5wYXlsb2FkLmlkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIocmVzdWx0LnBheWxvYWQsIGNvbnRleHQud2JDbG91ZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZG4ndCBmaW5kIHVzZXIgZm9yIHRlc3QgZW1haWwgeC10ZXN0LXVzZXItZW1haWw9JHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl19YFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKFVzZXIuZ2V0UHVibGljVXNlcigpLCBjb250ZXh0LndiQ2xvdWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgU1lTQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpO1xuICAgIH0gZWxzZSBpZiAoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pIHtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICApO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUlkKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSlcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnBheWxvYWQgJiYgcmVzdWx0LnBheWxvYWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihyZXN1bHQucGF5bG9hZCwgY29udGV4dC53YkNsb3VkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkbid0IGZpbmQgdXNlciBmb3IgeC1oYXN1cmEtdXNlci1pZD0ke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihVc2VyLmdldFB1YmxpY1VzZXIoKSwgY29udGV4dC53YkNsb3VkKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVEJEOiBzdXBwb3J0IGZvciBwdWJsaWMgdXNlcnNcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYEN1cnJlbnRVc2VyLmZyb21Db250ZXh0OiBDb3VsZCBub3QgZmluZCBoZWFkZXJzIGZvciBBZG1pbiwgVGVzdCBvciBVc2VyIGluOiAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGNvbnRleHQuaGVhZGVyc1xuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKFVzZXIuZ2V0UHVibGljVXNlcigpLCBjb250ZXh0LndiQ2xvdWQpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBPcmdhbml6YXRpb24ge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgcm9sZT86IFJvbGU7XG4gIHNldHRpbmdzPzogb2JqZWN0O1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8T3JnYW5pemF0aW9uPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9ucyA9IEFycmF5PE9yZ2FuaXphdGlvbj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIG9yZ2FuaXphdGlvbnMucHVzaChPcmdhbml6YXRpb24ucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBPcmdhbml6YXRpb24ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvbiA9IG5ldyBPcmdhbml6YXRpb24oKTtcbiAgICBvcmdhbml6YXRpb24uaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICBvcmdhbml6YXRpb24ubmFtZSA9IGRhdGEubmFtZTtcbiAgICBvcmdhbml6YXRpb24ubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIG9yZ2FuaXphdGlvbi5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5zZXR0aW5ncykgb3JnYW5pemF0aW9uLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIG9yZ2FuaXphdGlvbi5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIG9yZ2FuaXphdGlvbi5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvbjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBPcmdhbml6YXRpb25Vc2VyIHtcbiAgb3JnYW5pemF0aW9uSWQhOiBudW1iZXI7XG4gIHVzZXJJZCE6IG51bWJlcjtcbiAgcm9sZUlkITogbnVtYmVyO1xuICBpbXBsaWVkRnJvbXJvbGVJZD86IG51bWJlcjtcbiAgc2V0dGluZ3MhOiBvYmplY3Q7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgcm9sZSE6IFJvbGU7XG4gIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgdXNlckZpcnN0TmFtZT86IHN0cmluZztcbiAgdXNlckxhc3ROYW1lPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8T3JnYW5pemF0aW9uVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiT3JnYW5pemF0aW9uVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25Vc2VycyA9IEFycmF5PE9yZ2FuaXphdGlvblVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBvcmdhbml6YXRpb25Vc2Vycy5wdXNoKE9yZ2FuaXphdGlvblVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvblVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogT3JnYW5pemF0aW9uVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb25Vc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblVzZXIgPSBuZXcgT3JnYW5pemF0aW9uVXNlcigpO1xuICAgIG9yZ2FuaXphdGlvblVzZXIub3JnYW5pemF0aW9uSWQgPSBkYXRhLm9yZ2FuaXphdGlvbl9pZDtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnVzZXJJZCA9IHBhcnNlSW50KGRhdGEudXNlcl9pZCk7XG4gICAgb3JnYW5pemF0aW9uVXNlci5yb2xlSWQgPSBwYXJzZUludChkYXRhLnJvbGVfaWQpO1xuICAgIGlmIChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKSB7XG4gICAgICBvcmdhbml6YXRpb25Vc2VyLmltcGxpZWRGcm9tcm9sZUlkID0gcGFyc2VJbnQoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCk7XG4gICAgfVxuICAgIG9yZ2FuaXphdGlvblVzZXIuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIG9yZ2FuaXphdGlvblVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvblVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIG9yZ2FuaXphdGlvblVzZXIucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9pZCk7XG4gICAgaWYgKGRhdGEub3JnYW5pemF0aW9uX25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLm9yZ2FuaXphdGlvbk5hbWUgPSBkYXRhLm9yZ2FuaXphdGlvbl9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIG9yZ2FuaXphdGlvblVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSlcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIudXNlckZpcnN0TmFtZSA9IGRhdGEudXNlcl9maXJzdF9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfbGFzdF9uYW1lKVxuICAgICAgb3JnYW5pemF0aW9uVXNlci51c2VyTGFzdE5hbWUgPSBkYXRhLnVzZXJfbGFzdF9uYW1lO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgb3JnYW5pemF0aW9uVXNlci5yb2xlID0gbmV3IFJvbGUoXG4gICAgICAgIGRhdGEucm9sZV9uYW1lLFxuICAgICAgICBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbFxuICAgICAgKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIG9yZ2FuaXphdGlvblVzZXIucm9sZS5pbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvcmdhbml6YXRpb25Vc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgREVGQVVMVF9QT0xJQ1kgfSBmcm9tIFwiLi4vcG9saWN5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG4vKipcbiAqIFNDSEVNQVxuICogLSBJZiBhIHNjaGVtYSBpcyBvd25lZCBieSBhbiBvcmdhbml6YXRpb25cbiAqICAgLSBBbGwgYWRtaW5pc3RyYXRvcnMgb2YgdGhlIG9yZ2FuaXphdGlvbiBoYXZlIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogLSBJZiBhIHNjaGVtYSBpcyBvd25lZCBieSBhIHVzZXIsIHRoZSB1c2VyIGhhcyBpbXBsaWNpdCBhZG1pbiBhY2Nlc3NcbiAqICAgLSBBZGRpdGlvbmFsIHVzZXJzIGNhbiBiZSBncmFudGVkIGFkbWluIGFjY2VzcyBleHBsaWNpdGx5XG4gKi9cblxuZXhwb3J0IHR5cGUgUm9sZUxldmVsID0gXCJvcmdhbml6YXRpb25cIiB8IFwic2NoZW1hXCIgfCBcInRhYmxlXCI7XG5cbmV4cG9ydCB0eXBlIFVzZXJBY3Rpb25QZXJtaXNzaW9uID0ge1xuICByb2xlTGV2ZWw6IFJvbGVMZXZlbDtcbiAgdXNlckFjdGlvbjogc3RyaW5nO1xuICBvYmplY3RLZXk/OiBzdHJpbmc7XG4gIG9iamVjdElkOiBudW1iZXI7XG4gIGNoZWNrZWRGb3JSb2xlTmFtZT86IHN0cmluZztcbiAgcGVybWl0dGVkOiBib29sZWFuO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBjaGVja2VkQXQ/OiBEYXRlO1xufTtcblxuZXhwb3J0IGNsYXNzIFJvbGUge1xuICBzdGF0aWMgU1lTUk9MRVNfT1JHQU5JWkFUSU9OUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XG4gICAgb3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBBZG1pbmlzdHJhdG9yXCIsXG4gICAgfSxcbiAgICBvcmdhbml6YXRpb25fdXNlcjogeyBsYWJlbDogXCJPcmdhbml6YXRpb24gVXNlclwiIH0sXG4gICAgb3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXI6IHtcbiAgICAgIGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBFeHRlcm5hbCBVc2VyXCIsXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgU1lTUk9MRVNfU0NIRU1BUzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gICAgc2NoZW1hX293bmVyOiB7IGxhYmVsOiBcIkRCIE93bmVyXCIgfSxcbiAgICBzY2hlbWFfYWRtaW5pc3RyYXRvcjoge1xuICAgICAgbGFiZWw6IFwiREIgQWRtaW5pc3RyYXRvclwiLFxuICAgICAgaW1wbGllZEZyb206IFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdLFxuICAgIH0sXG4gICAgc2NoZW1hX21hbmFnZXI6IHsgbGFiZWw6IFwiREIgTWFuYWdlclwiIH0sXG4gICAgc2NoZW1hX2VkaXRvcjogeyBsYWJlbDogXCJEQiBFZGl0b3JcIiB9LFxuICAgIHNjaGVtYV9yZWFkZXI6IHsgbGFiZWw6IFwiREIgUmVhZGVyXCIgfSxcbiAgfTtcblxuICBzdGF0aWMgU1lTUk9MRVNfVEFCTEVTOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PiA9IHtcbiAgICB0YWJsZV9hZG1pbmlzdHJhdG9yOiB7XG4gICAgICBsYWJlbDogXCJUYWJsZSBBZG1pbmlzdHJhdG9yXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX293bmVyXCIsIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9tYW5hZ2VyOiB7XG4gICAgICBsYWJlbDogXCJUYWJsZSBNYW5hZ2VyXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX21hbmFnZXJcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9lZGl0b3I6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIEVkaXRvclwiLFxuICAgICAgaW1wbGllZEZyb206IFtcInNjaGVtYV9lZGl0b3JcIl0sXG4gICAgfSxcbiAgICB0YWJsZV9yZWFkZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIFJlYWRlclwiLFxuICAgICAgaW1wbGllZEZyb206IFtcInNjaGVtYV9yZWFkZXJcIl0sXG4gICAgfSxcbiAgfTtcblxuICBzdGF0aWMgc3lzUm9sZU1hcChmcm9tOiBSb2xlTGV2ZWwsIHRvOiBSb2xlTGV2ZWwpIHtcbiAgICBsZXQgdG9Sb2xlRGVmaW5pdGlvbnM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge307XG4gICAgbGV0IG1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHN3aXRjaCAodG8pIHtcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgdG9Sb2xlRGVmaW5pdGlvbnMgPSBSb2xlLlNZU1JPTEVTX1RBQkxFUztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB0b1JvbGVEZWZpbml0aW9ucyA9IFJvbGUuU1lTUk9MRVNfU0NIRU1BUztcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGZvciAoY29uc3QgdG9Sb2xlTmFtZSBvZiBPYmplY3Qua2V5cyh0b1JvbGVEZWZpbml0aW9ucykpIHtcbiAgICAgIGlmICh0b1JvbGVEZWZpbml0aW9uc1t0b1JvbGVOYW1lXS5pbXBsaWVkRnJvbSkge1xuICAgICAgICBmb3IgKGNvbnN0IGZyb21Sb2xlTmFtZSBvZiB0b1JvbGVEZWZpbml0aW9uc1t0b1JvbGVOYW1lXS5pbXBsaWVkRnJvbSkge1xuICAgICAgICAgIG1hcFtmcm9tUm9sZU5hbWVdID0gdG9Sb2xlTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWFwO1xuICB9XG5cbiAgc3RhdGljIEhBU1VSQV9QUkVGSVhFU19BQ1RJT05TOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIHM6IFwic2VsZWN0XCIsXG4gICAgaTogXCJpbnNlcnRcIixcbiAgICB1OiBcInVwZGF0ZVwiLFxuICAgIGQ6IFwiZGVsZXRlXCIsXG4gIH07XG5cbiAgaWQ/OiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsPzogc3RyaW5nO1xuICBjcmVhdGVkQXQ/OiBEYXRlO1xuICB1cGRhdGVkQXQ/OiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGltcGxpZWRGcm9tPzogU3RyaW5nO1xuICBwZXJtaXNzaW9ucz86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuXG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgcm9sZUxldmVsPzogUm9sZUxldmVsKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB0aGlzLnBlcm1pc3Npb25zID0gUm9sZS5nZXRQZXJtaXNzaW9ucyhcbiAgICAgIERFRkFVTFRfUE9MSUNZLFxuICAgICAgdGhpcy5uYW1lLFxuICAgICAgcm9sZUxldmVsXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0UGVybWlzc2lvbnMoXG4gICAgcG9saWN5OiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PixcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbD86IFJvbGVMZXZlbFxuICApIHtcbiAgICBjb25zdCBwZXJtaXNzaW9uczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IHVzZXJBY3Rpb24gb2YgT2JqZWN0LmtleXMocG9saWN5KSkge1xuICAgICAgaWYgKFxuICAgICAgICByb2xlTGV2ZWwgJiZcbiAgICAgICAgKHBvbGljeVt1c2VyQWN0aW9uXS5yb2xlTGV2ZWwgYXMgUm9sZUxldmVsKSAhPSByb2xlTGV2ZWxcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHBlcm1pc3Npb25zW3VzZXJBY3Rpb25dID1cbiAgICAgICAgcG9saWN5W3VzZXJBY3Rpb25dLnBlcm1pdHRlZFJvbGVzLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICB9XG4gICAgcmV0dXJuIHBlcm1pc3Npb25zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBpc1JvbGUocm9sZU5hbWU6IHN0cmluZywgcm9sZUxldmVsPzogUm9sZUxldmVsKTogYm9vbGVhbiB7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUykuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgICAgY2FzZSBcInNjaGVtYVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19TQ0hFTUFTKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBjYXNlIFwidGFibGVcIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfT1JHQU5JWkFUSU9OUykuaW5jbHVkZXMocm9sZU5hbWUpIHx8XG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19TQ0hFTUFTKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1RBQkxFUykuaW5jbHVkZXMocm9sZU5hbWUpXG4gICAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHN0YXRpYyBhcmVSb2xlcyhyb2xlTmFtZXM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG4gICAgZm9yIChjb25zdCByb2xlTmFtZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyB0YWJsZVBlcm1pc3Npb25QcmVmaXhlcyhyb2xlTmFtZTogc3RyaW5nKSB7XG4gICAgbGV0IGFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IHByZWZpeGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChcbiAgICAgIERFRkFVTFRfUE9MSUNZW1wicmVhZF9hbmRfd3JpdGVfdGFibGVfcmVjb3Jkc1wiXS5wZXJtaXR0ZWRSb2xlcy5pbmNsdWRlcyhcbiAgICAgICAgcm9sZU5hbWVcbiAgICAgIClcbiAgICApIHtcbiAgICAgIGFjdGlvbnMgPSBERUZBVUxUX1BPTElDWVtcInJlYWRfYW5kX3dyaXRlX3RhYmxlX3JlY29yZHNcIl0uaGFzdXJhQWN0aW9ucztcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgREVGQVVMVF9QT0xJQ1lbXCJyZWFkX3RhYmxlX3JlY29yZHNcIl0ucGVybWl0dGVkUm9sZXMuaW5jbHVkZXMocm9sZU5hbWUpXG4gICAgKSB7XG4gICAgICBhY3Rpb25zID0gREVGQVVMVF9QT0xJQ1lbXCJyZWFkX3RhYmxlX3JlY29yZHNcIl0uaGFzdXJhQWN0aW9ucztcbiAgICB9XG4gICAgZm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuICAgICAgY29uc3QgcHJlZml4ID0gT2JqZWN0LmtleXMoUm9sZS5IQVNVUkFfUFJFRklYRVNfQUNUSU9OUykuZmluZChcbiAgICAgICAgKGtleSkgPT4gUm9sZS5IQVNVUkFfUFJFRklYRVNfQUNUSU9OU1trZXldID09PSBhY3Rpb25cbiAgICAgICk7XG4gICAgICBpZiAocHJlZml4KSBwcmVmaXhlcy5wdXNoKHByZWZpeCk7XG4gICAgfVxuICAgIHJldHVybiBwcmVmaXhlcztcbiAgfVxuXG4gIC8vIGVnIFt7IHBlcm1pc3Npb25LZXk6IHMxMjM0LCBhY3Rpb246IFwic2VsZWN0XCJ9LFxuICAvLyB7IHBlcm1pc3Npb25LZXk6IGkxMjM0LCBhY3Rpb246IFwiaW5zZXJ0XCJ9Li4uXG4gIHB1YmxpYyBzdGF0aWMgdGFibGVQZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnMoXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSB7XG4gICAgY29uc3QgcGVybWlzc2lvbktleXNBbmRBY3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHByZWZpeCBvZiBPYmplY3Qua2V5cyhSb2xlLkhBU1VSQV9QUkVGSVhFU19BQ1RJT05TKSkge1xuICAgICAgcGVybWlzc2lvbktleXNBbmRBY3Rpb25zLnB1c2goe1xuICAgICAgICBwZXJtaXNzaW9uS2V5OiBSb2xlLnRhYmxlUGVybWlzc2lvbktleShwcmVmaXgsIHRhYmxlSWQpLFxuICAgICAgICBhY3Rpb246IFJvbGUuSEFTVVJBX1BSRUZJWEVTX0FDVElPTlNbcHJlZml4XSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcGVybWlzc2lvbktleXNBbmRBY3Rpb25zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyB0YWJsZVBlcm1pc3Npb25LZXkoXG4gICAgcGVybWlzc2lvblByZWZpeDogc3RyaW5nLFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHtwZXJtaXNzaW9uUHJlZml4fSR7dGFibGVJZH1gO1xuICB9XG5cbiAgLy8gVXNlZCB0byBnZW5lcmF0ZSB0aGUgSGFzdXJhIHRhYmxlIHBlcm1pc3Npb25cbiAgcHVibGljIHN0YXRpYyBoYXN1cmFUYWJsZVBlcm1pc3Npb25DaGVja3NBbmRUeXBlcyhcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogUmVjb3JkPHN0cmluZywgYW55PltdIHtcbiAgICBjb25zdCBoYXN1cmFQZXJtaXNzaW9uc0FuZEFjdGlvbnM6IFJlY29yZDxzdHJpbmcsIGFueT5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgcGVybWlzc2lvbktleXNBbmRBY3Rpb24gb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucyhcbiAgICAgIHRhYmxlSWRcbiAgICApKSB7XG4gICAgICBoYXN1cmFQZXJtaXNzaW9uc0FuZEFjdGlvbnMucHVzaCh7XG4gICAgICAgIHBlcm1pc3Npb25DaGVjazoge1xuICAgICAgICAgIF9leGlzdHM6IHtcbiAgICAgICAgICAgIF90YWJsZTogeyBzY2hlbWE6IFwid2JcIiwgbmFtZTogXCJ0YWJsZV9wZXJtaXNzaW9uc1wiIH0sXG4gICAgICAgICAgICBfd2hlcmU6IHtcbiAgICAgICAgICAgICAgX2FuZDogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIHRhYmxlX3Blcm1pc3Npb25fa2V5OiB7XG4gICAgICAgICAgICAgICAgICAgIF9lcTogcGVybWlzc2lvbktleXNBbmRBY3Rpb24ucGVybWlzc2lvbktleSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7IHVzZXJfaWQ6IHsgX2VxOiBcIlgtSGFzdXJhLVVzZXItSWRcIiB9IH0sXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHBlcm1pc3Npb25UeXBlOiBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbi5hY3Rpb24sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGhhc3VyYVBlcm1pc3Npb25zQW5kQWN0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Um9sZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiUm9sZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCByb2xlcyA9IEFycmF5PFJvbGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICByb2xlcy5wdXNoKFJvbGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJvbGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUm9sZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGUgPSBuZXcgUm9sZShkYXRhLm5hbWUpO1xuICAgIHJvbGUuaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICByb2xlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgcm9sZS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgcm9sZS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgcm9sZS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgU2NoZW1hIHtcbiAgc3RhdGljIFNZU19TQ0hFTUFfTkFNRVM6IHN0cmluZ1tdID0gW1xuICAgIFwicHVibGljXCIsXG4gICAgXCJpbmZvcm1hdGlvbl9zY2hlbWFcIixcbiAgICBcImhkYl9jYXRhbG9nXCIsXG4gICAgXCJ3YlwiLFxuICBdO1xuXG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcjtcbiAgdXNlck93bmVySWQ/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgcm9sZT86IFJvbGU7XG4gIG9yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZztcbiAgdXNlck93bmVyRW1haWw/OiBzdHJpbmc7XG4gIHNldHRpbmdzPzogb2JqZWN0O1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8U2NoZW1hPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hcyA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHNjaGVtYXMucHVzaChTY2hlbWEucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBTY2hlbWEge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWEoKTtcbiAgICBzY2hlbWEuaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICBzY2hlbWEubmFtZSA9IGRhdGEubmFtZTtcbiAgICBzY2hlbWEubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHNjaGVtYS5vcmdhbml6YXRpb25Pd25lcklkID0gZGF0YS5vcmdhbml6YXRpb25fb3duZXJfaWQ7XG4gICAgc2NoZW1hLnVzZXJPd25lcklkID0gZGF0YS51c2VyX293bmVyX2lkO1xuICAgIHNjaGVtYS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5vcmdhbml6YXRpb25fb3duZXJfbmFtZSkge1xuICAgICAgc2NoZW1hLm9yZ2FuaXphdGlvbk93bmVyTmFtZSA9IGRhdGEub3JnYW5pemF0aW9uX293bmVyX25hbWU7XG4gICAgfVxuICAgIGlmIChkYXRhLnVzZXJfb3duZXJfZW1haWwpIHNjaGVtYS51c2VyT3duZXJFbWFpbCA9IGRhdGEudXNlcl9vd25lcl9lbWFpbDtcbiAgICBpZiAoZGF0YS5zZXR0aW5ncykgc2NoZW1hLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIHNjaGVtYS5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHNjaGVtYS5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWFVc2VyIHtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIHVzZXJJZCE6IG51bWJlcjtcbiAgcm9sZUlkITogbnVtYmVyO1xuICBpbXBsaWVkRnJvbVJvbGVJZD86IG51bWJlcjtcbiAgc2V0dGluZ3MhOiBvYmplY3Q7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgcm9sZSE6IFJvbGU7XG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgdXNlckZpcnN0TmFtZT86IHN0cmluZztcbiAgdXNlckxhc3ROYW1lPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8U2NoZW1hVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFVc2VycyA9IEFycmF5PFNjaGVtYVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBzY2hlbWFVc2Vycy5wdXNoKFNjaGVtYVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogU2NoZW1hVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWFVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYVVzZXIgPSBuZXcgU2NoZW1hVXNlcigpO1xuICAgIHNjaGVtYVVzZXIuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICBzY2hlbWFVc2VyLnVzZXJJZCA9IHBhcnNlSW50KGRhdGEudXNlcl9pZCk7XG4gICAgc2NoZW1hVXNlci5yb2xlSWQgPSBwYXJzZUludChkYXRhLnJvbGVfaWQpO1xuICAgIGlmIChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKSB7XG4gICAgICBzY2hlbWFVc2VyLmltcGxpZWRGcm9tUm9sZUlkID0gcGFyc2VJbnQoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCk7XG4gICAgfVxuICAgIHNjaGVtYVVzZXIuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIHNjaGVtYVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSBzY2hlbWFVc2VyLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHNjaGVtYVVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSkgc2NoZW1hVXNlci51c2VyRmlyc3ROYW1lID0gZGF0YS51c2VyX2ZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9sYXN0X25hbWUpIHNjaGVtYVVzZXIudXNlckxhc3ROYW1lID0gZGF0YS51c2VyX2xhc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIHNjaGVtYVVzZXIucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCk7XG4gICAgICBpZiAoZGF0YS5yb2xlX2ltcGxpZWRfZnJvbSkge1xuICAgICAgICBzY2hlbWFVc2VyLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2NoZW1hVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbHVtbiwgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIFRhYmxlIHtcbiAgaWQhOiBudW1iZXI7XG4gIHNjaGVtYUlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogUm9sZTtcbiAgY29sdW1ucyE6IFtDb2x1bW5dO1xuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICBzZXR0aW5ncz86IG9iamVjdDtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZXMgPSBBcnJheTxUYWJsZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlcy5wdXNoKFRhYmxlLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZSA9IG5ldyBUYWJsZSgpO1xuICAgIHRhYmxlLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgdGFibGUuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICB0YWJsZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRhYmxlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICB0YWJsZS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdGFibGUudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSB0YWJsZS5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS5zZXR0aW5ncykgdGFibGUuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgdGFibGUucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHRhYmxlLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGFibGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGVVc2VyIHtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tcm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlITogUm9sZTtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdGFibGVOYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHVzZXJGaXJzdE5hbWU/OiBzdHJpbmc7XG4gIHVzZXJMYXN0TmFtZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlcnMgPSBBcnJheTxUYWJsZVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0YWJsZVVzZXJzLnB1c2goVGFibGVVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGFibGVVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZVVzZXIgPSBuZXcgVGFibGVVc2VyKCk7XG4gICAgdGFibGVVc2VyLnRhYmxlSWQgPSBwYXJzZUludChkYXRhLnRhYmxlX2lkKTtcbiAgICB0YWJsZVVzZXIudXNlcklkID0gcGFyc2VJbnQoZGF0YS51c2VyX2lkKTtcbiAgICB0YWJsZVVzZXIucm9sZUlkID0gcGFyc2VJbnQoZGF0YS5yb2xlX2lkKTtcbiAgICBpZiAoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCkge1xuICAgICAgdGFibGVVc2VyLmltcGxpZWRGcm9tcm9sZUlkID0gcGFyc2VJbnQoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCk7XG4gICAgfVxuICAgIHRhYmxlVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgdGFibGVVc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSB0YWJsZVVzZXIuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudGFibGVfbmFtZSkgdGFibGVVc2VyLnRhYmxlTmFtZSA9IGRhdGEudGFibGVfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2VtYWlsKSB0YWJsZVVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSkgdGFibGVVc2VyLnVzZXJGaXJzdE5hbWUgPSBkYXRhLnVzZXJfZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2xhc3RfbmFtZSkgdGFibGVVc2VyLnVzZXJMYXN0TmFtZSA9IGRhdGEudXNlcl9sYXN0X25hbWU7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICB0YWJsZVVzZXIucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHRhYmxlVXNlci5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRhYmxlVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFVTRVJfTUVTU0FHRVMgfSBmcm9tIFwiLi4vZW52aXJvbm1lbnRcIjtcblxuZXhwb3J0IGNsYXNzIFVzZXIge1xuICBzdGF0aWMgU1lTX0FETUlOX0lEOiBudW1iZXIgPSAxO1xuICBzdGF0aWMgUFVCTElDX0lEOiBudW1iZXIgPSAyO1xuXG4gIGlkITogbnVtYmVyO1xuICBlbWFpbCE6IHN0cmluZztcbiAgZmlyc3ROYW1lPzogc3RyaW5nO1xuICBsYXN0TmFtZT86IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlcnMgPSBBcnJheTxVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdXNlcnMucHVzaChVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB1c2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB1c2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgdXNlci5lbWFpbCA9IGRhdGEuZW1haWw7XG4gICAgaWYgKGRhdGEuZmlyc3RfbmFtZSkgdXNlci5maXJzdE5hbWUgPSBkYXRhLmZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEubGFzdF9uYW1lKSB1c2VyLmxhc3ROYW1lID0gZGF0YS5sYXN0X25hbWU7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluVXNlcigpOiBVc2VyIHtcbiAgICBjb25zdCBkYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1c2VyOiBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gVXNlci5TWVNfQURNSU5fSUQ7XG4gICAgdXNlci5lbWFpbCA9IFwiU1lTX0FETUlOQGV4YW1wbGUuY29tXCI7XG4gICAgdXNlci5maXJzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0ZTtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpY1VzZXIoKTogVXNlciB7XG4gICAgY29uc3QgZGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdXNlcjogVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IFVzZXIuUFVCTElDX0lEO1xuICAgIHVzZXIuZW1haWwgPSBcIlBVQkxJQ0BleGFtcGxlLmNvbVwiO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gXCJQdWJsaWMgVXNlclwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlB1YmxpYyBVc2VyXCI7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRlO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0ZTtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vUm9sZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vQ3VycmVudFVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL09yZ2FuaXphdGlvblwiO1xuZXhwb3J0ICogZnJvbSBcIi4vT3JnYW5pemF0aW9uVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vU2NoZW1hXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UYWJsZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Db2x1bW5cIjtcbiIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmc7XG4gIGRiSG9zdDogc3RyaW5nO1xuICBkYlBvcnQ6IG51bWJlcjtcbiAgZGJVc2VyOiBzdHJpbmc7XG4gIGRiUGFzc3dvcmQ6IHN0cmluZztcbiAgZGJQb29sTWF4OiBudW1iZXI7XG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGhhc3VyYUhvc3Q6IHN0cmluZztcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHN0cmluZztcbiAgdGVzdElnbm9yZUVycm9yczogYm9vbGVhbjtcbiAgdGVzdFVzZXJFbWFpbERvbWFpbjogc3RyaW5nO1xuICBkZW1vREJQcmVmaXg6IHN0cmluZztcbiAgZGVtb0RCTGFiZWw6IHN0cmluZztcbn07XG5cbmV4cG9ydCBjb25zdCBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHByb2Nlc3MuZW52LlNFQ1JFVF9NRVNTQUdFIGFzIHN0cmluZyxcbiAgZGJOYW1lOiBwcm9jZXNzLmVudi5EQl9OQU1FIGFzIHN0cmluZyxcbiAgZGJIb3N0OiBwcm9jZXNzLmVudi5EQl9IT1NUIGFzIHN0cmluZyxcbiAgZGJQb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT1JUIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8IFwiXCIpIGFzIG51bWJlcixcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRV9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9DT05ORUNUSU9OX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGhhc3VyYUhvc3Q6IHByb2Nlc3MuZW52LkhBU1VSQV9IT1NUIGFzIHN0cmluZyxcbiAgaGFzdXJhQWRtaW5TZWNyZXQ6IHByb2Nlc3MuZW52LkhBU1VSQV9BRE1JTl9TRUNSRVQgYXMgc3RyaW5nLFxuICB0ZXN0SWdub3JlRXJyb3JzOiAocHJvY2Vzcy5lbnYuVEVTVF9JR05PUkVfRVJST1JTIHx8IGZhbHNlKSBhcyBib29sZWFuLFxuICB0ZXN0VXNlckVtYWlsRG9tYWluOiAoXG4gICAgKHByb2Nlc3MuZW52LlRFU1RfVVNFUl9FTUFJTF9ET01BSU4gfHwgXCJcIikgYXMgc3RyaW5nXG4gICkudG9Mb2NhbGVMb3dlckNhc2UoKSxcbiAgZGVtb0RCUHJlZml4OiBwcm9jZXNzLmVudi5ERU1PX0RCX1BSRUZJWCBhcyBzdHJpbmcsXG4gIGRlbW9EQkxhYmVsOiBwcm9jZXNzLmVudi5ERU1PX0RCX0xBQkVMIGFzIHN0cmluZyxcbn07XG5cbi8vIHdiRXJyb3JDb2RlIDogWyBtZXNzYWdlLCBhcG9sbG9FcnJvckNvZGU/IF1cbmV4cG9ydCBjb25zdCBVU0VSX01FU1NBR0VTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gPSB7XG4gIC8vIFVzZXJzXG4gIFdCX1VTRVJfRVhJU1RTOiBbXCJUaGlzIHVzZXIgYWxyZWFkeSBleGlzdHNcIl0sXG4gIFdCX1VTRVJfTk9UX0ZPVU5EOiBbXCJVc2VyIG5vdCBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSB1c2VycyB3ZXJlIG5vdCBmb3VuZC5cIl0sXG4gIFdCX1BBU1NXT1JEX1JFU0VUX0lOU1RSVUNUSU9OU19TRU5UOiBbXG4gICAgXCJQYXNzd29yZCByZXNldCBpbnN0cnVjdGlvbnMgaGF2ZSBiZWVuIHNlbnQgdG8geW91ciBFLW1haWwuXCIsXG4gIF0sXG4gIC8vIE9yZ2FuaXphdGlvbnNcbiAgV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORDogW1wiT3JnYW5pemF0aW9uIG5vdCBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfT1JHQU5JWkFUSU9OX1VSTF9OT1RfRk9VTkQ6IFtcbiAgICBcIlRoaXMgT3JnYW5pemF0aW9uIFVSTCBjb3VsZCBub3QgYmUgZm91bmQuIFBsZWFzZSBDaGVjayB0aGUgc3BlbGxpbmcgb3RoZXJ3aXNlIGNvbnRhY3QgeW91ciBTeXN0ZW0gQWRtaW5pc3RyYXRvci5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX09SR0FOSVpBVElPTl9OQU1FX1RBS0VOOiBbXG4gICAgXCJUaGlzIE9yZ2FuaXphdGlvbiBuYW1lIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4uXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFk6IFtcbiAgICBcIlRoaXMgb3JnYW5pemF0aW9uIHN0aWxsIGhhcyBub24tYWRtaW5pc3RyYXRpdmUgdXNlcnMuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgYWxsIEFkbWluaXN0cmF0b3JzIGZyb20gYW4gT3JnYW5pemF0aW9uIC0geW91IG11c3QgbGVhdmUgYXQgbGVhc3Qgb25lLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfVVNFUl9OT1RfSU5fT1JHOiBbXCJVc2VyIG11c3QgYmUgaW4gT3JnYW5pemF0aW9uXCJdLFxuICBXQl9VU0VSX05PVF9TQ0hFTUFfT1dORVI6IFtcIlRoZSBjdXJyZW50IHVzZXIgaXMgbm90IHRoZSBvd25lci5cIl0sXG4gIFdCX09SR0FOSVpBVElPTl9VUkxfRk9SQklEREVOOiBbXG4gICAgXCJTb3JyeSB5b3UgZG8gbm90IGhhdmUgYWNjZXNzIHRvIHRoaXMgT3JnYW5pemF0aW9uLiBQbGVhc2UgY29udGFjdCB5b3VyIFN5c3RlbSBBZG1pbmlzdHJhdG9yLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgLy8gU2NoZW1hc1xuICBXQl9OT19TQ0hFTUFTX0ZPVU5EOiBbXG4gICAgXCJZb3UgZG9u4oCZdCBoYXZlIGFjY2VzcyB0byBhbnkgRGF0YWJhc2VzLiBQbGVhc2UgY29udGFjdCB5b3UgU3lzdGVtIEFkbWluaXN0cmF0b3IgZm9yIGFjY2VzcyB0byBhbiBleGlzdGluZyBEYXRhYmFzZSBvciBjcmVhdGUgYSBuZXcgRGF0YWJhc2UgYmVsb3cuXCIsXG4gIF0sXG4gIFdCX1NDSEVNQV9OT1RfRk9VTkQ6IFtcIkRhdGFiYXNlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfU0NIRU1BX1VSTF9OT1RfRk9VTkQ6IFtcbiAgICBcIlRoaXMgRGF0YWJhc2UgVVJMIGNvdWxkIG5vdCBiZSBmb3VuZC4gUGxlYXNlIENoZWNrIHRoZSBzcGVsbGluZyBvdGhlcndpc2UgY29udGFjdCB5b3VyIFN5c3RlbSBBZG1pbmlzdHJhdG9yLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfU0NIRU1BX1VSTF9GT1JCSURERU46IFtcbiAgICBcIlNvcnJ5IHlvdSBkbyBub3QgaGF2ZSBhY2Nlc3MgdG8gdGhpcyBEYXRhYmFzZS4gUGxlYXNlIGNvbnRhY3QgeW91ciBTeXN0ZW0gQWRtaW5pc3RyYXRvci5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX0JBRF9TQ0hFTUFfTkFNRTogW1xuICAgIFwiRGF0YWJhc2UgbmFtZSBjYW4gbm90IGJlZ2luIHdpdGggJ3BnXycgb3IgYmUgaW4gdGhlIHJlc2VydmVkIGxpc3QuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9TQ0hFTUFfTkFNRV9FWElTVFM6IFtcIlRoaXMgU2NoZW1hIG5hbWUgYWxyZWFkeSBleGlzdHNcIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX1VTRVJfT1dORVI6IFtcIllvdSBjYW4gbm90IHJlbW92ZSB0aGUgREIgVXNlciBPd25lclwiXSxcbiAgV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX0FETUlOOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgYSBEQiBBZG1pbmlzdHJhdG9yIGZyb20gb25lIG9yIG1vcmUgaW5kaXZpZHVhbCB0YWJsZXMuXCIsXG4gIF0sXG4gIC8vIFNjaGVtYXMgVXNlcnNcbiAgV0JfU0NIRU1BX1VTRVJTX05PVF9GT1VORDogW1wiT25lIG9yIG1vcmUgU2NoZW1hIFVzZXJzIG5vdCBmb3VuZC5cIl0sXG4gIFdCX1NDSEVNQV9OT19BRE1JTlM6IFtcbiAgICBcIllvdSBjYW4gbm90IHJlbW92ZSBhbGwgQWRtaW5pc3RyYXRvcnMgZnJvbSBhIHNjaGVtYSAtIHlvdSBtdXN0IGxlYXZlIGF0IGxlYXN0IG9uZS5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIC8vIFRhYmxlc1xuICBXQl9UQUJMRV9OT1RfRk9VTkQ6IFtcIlRhYmxlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG4gIFdCX1RBQkxFX05BTUVfRVhJU1RTOiBbXCJUaGlzIFRhYmxlIG5hbWUgYWxyZWFkeSBleGlzdHNcIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgQ09MVU1OX05PVF9GT1VORDogW1wiQ29sdW1uIGNvdWxkIG5vdCBiZSBmb3VuZFwiXSxcbiAgV0JfQ09MVU1OX05BTUVfRVhJU1RTOiBbXCJUaGlzIENvbHVtbiBuYW1lIGFscmVhZHkgZXhpc3RzLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9QS19FWElTVFM6IFtcIlJlbW92ZSBleGlzdGluZyBwcmltYXJ5IGtleSBmaXJzdC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfRktfRVhJU1RTOiBbXG4gICAgXCJSZW1vdmUgZXhpc3RpbmcgZm9yZWlnbiBrZXkgb24gdGhlIGNvbHVtbiBmaXJzdC5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIC8vIFRhYmxlIFVzZXJzLFxuICBXQl9UQUJMRV9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIFRhYmxlIFVzZXJzIG5vdCBmb3VuZC5cIl0sXG4gIC8vIFJvbGVzXG4gIFJPTEVfTk9UX0ZPVU5EOiBbXCJUaGlzIHJvbGUgY291bGQgbm90IGJlIGZvdW5kLlwiXSxcbiAgV0JfRk9SQklEREVOOiBbXCJZb3UgYXJlIG5vdCBwZXJtaXR0ZWQgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbi5cIiwgXCJGT1JCSURERU5cIl0sXG59O1xuIiwiLy8gaHR0cHM6Ly9hbHRyaW0uaW8vcG9zdHMvYXhpb3MtaHR0cC1jbGllbnQtdXNpbmctdHlwZXNjcmlwdFxuXG5pbXBvcnQgYXhpb3MsIHsgQXhpb3NJbnN0YW5jZSwgQXhpb3NSZXNwb25zZSB9IGZyb20gXCJheGlvc1wiO1xuaW1wb3J0IHsgQ29sdW1uIH0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nIH0gZnJvbSBcIi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5jb25zdCBoZWFkZXJzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPj4gPSB7XG4gIEFjY2VwdDogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICBcIngtaGFzdXJhLWFkbWluLXNlY3JldFwiOiBlbnZpcm9ubWVudC5oYXN1cmFBZG1pblNlY3JldCxcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHN0YXRpYyBJR05PUkVfRVJST1JTID0gZmFsc2U7XG4gIHN0YXRpYyBIQVNVUkFfSUdOT1JFX0NPREVTOiBzdHJpbmdbXSA9IFtcbiAgICBcImFscmVhZHktdW50cmFja2VkXCIsXG4gICAgXCJhbHJlYWR5LXRyYWNrZWRcIixcbiAgICBcIm5vdC1leGlzdHNcIiwgLy8gZHJvcHBpbmcgYSByZWxhdGlvbnNoaXBcbiAgICBcImFscmVhZHktZXhpc3RzXCIsXG4gICAgXCJ1bmV4cGVjdGVkXCIsXG4gICAgXCJwZXJtaXNzaW9uLWRlbmllZFwiLFxuICBdO1xuXG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogZW52aXJvbm1lbnQuaGFzdXJhSG9zdCxcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBlcnJJZ25vcmUoKSB7XG4gICAgaWYgKHRoaXMuSUdOT1JFX0VSUk9SUyB8fCBlbnZpcm9ubWVudC50ZXN0SWdub3JlRXJyb3JzKSB7XG4gICAgICByZXR1cm4gdGhpcy5IQVNVUkFfSUdOT1JFX0NPREVTO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwb3N0KHR5cGU6IHN0cmluZywgYXJnczogUmVjb3JkPHN0cmluZywgYW55Pikge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KFxuICAgICAgICBcIi92MS9tZXRhZGF0YVwiLFxuICAgICAgICB7XG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICBhcmdzOiBhcmdzLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yLnJlc3BvbnNlICYmIGVycm9yLnJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgaWYgKCFIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMoZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlKSkge1xuICAgICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICAgIFwiZXJyb3IucmVzcG9uc2UuZGF0YTogXCIgKyBKU09OLnN0cmluZ2lmeShlcnJvci5yZXNwb25zZS5kYXRhKVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLnJlc3BvbnNlLmRhdGEuZXJyb3IsXG4gICAgICAgICAgICByZWZDb2RlOiBlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdW50cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICBjYXNjYWRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbGF0aW9uc2hpcHNcbiAgICovXG5cbiAgLy8gYSBwb3N0IGhhcyBvbmUgYXV0aG9yIChjb25zdHJhaW50IHBvc3RzLmF1dGhvcl9pZCAtPiBhdXRob3JzLmlkKVxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsIC8vIGF1dGhvcl9pZFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nIC8vIGF1dGhvcnNcbiAgKSB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NvbHVtbk5hbWV9LCAke3BhcmVudFRhYmxlTmFtZX0pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX29iamVjdF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IGNvbHVtbk5hbWUsIC8vIGF1dGhvcl9pZFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGFuIGF1dGhvciBoYXMgbWFueSBwb3N0cyAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gYXV0aG9yc1xuICAgIGNoaWxkVGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY2hpbGRDb2x1bW5OYW1lczogc3RyaW5nW10gLy8gYXV0aG9yX2lkXG4gICkge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBoYXN1cmFBcGkuY3JlYXRlQXJyYXlSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NoaWxkVGFibGVOYW1lfSwgJHtjaGlsZENvbHVtbk5hbWVzfSlgXG4gICAgKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19jcmVhdGVfYXJyYXlfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIG5hbWU6IGBhcnJfJHt0YWJsZU5hbWV9XyR7Y2hpbGRUYWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICB9LFxuICAgICAgdXNpbmc6IHtcbiAgICAgICAgZm9yZWlnbl9rZXlfY29uc3RyYWludF9vbjoge1xuICAgICAgICAgIGNvbHVtbjogY2hpbGRDb2x1bW5OYW1lc1swXSwgLy8gYXV0aG9yX2lkXG4gICAgICAgICAgdGFibGU6IHtcbiAgICAgICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIG5hbWU6IGNoaWxkVGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRyb3BSZWxhdGlvbnNoaXBzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gcG9zdHNcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgIH0sXG4gICAgICByZWxhdGlvbnNoaXA6IGBvYmpfJHt0YWJsZU5hbWV9XyR7cGFyZW50VGFibGVOYW1lfWAsIC8vIG9ial9wb3N0c19hdXRob3JzXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICAoIXJlc3VsdC5yZWZDb2RlIHx8XG4gICAgICAgIChyZXN1bHQucmVmQ29kZSAmJiAhSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ19kcm9wX3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHBhcmVudFRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHJlbGF0aW9uc2hpcDogYGFycl8ke3BhcmVudFRhYmxlTmFtZX1fJHt0YWJsZU5hbWV9YCwgLy8gYXJyX2F1dGhvcnNfcG9zdHNcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQZXJtaXNzaW9uc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlUGVybWlzc2lvbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGVybWlzc2lvbkNoZWNrOiBvYmplY3QsXG4gICAgdHlwZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uczogc3RyaW5nW11cbiAgKSB7XG4gICAgY29uc3QgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgYW55PiA9IHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IHJvbGVOYW1lLFxuICAgICAgcGVybWlzc2lvbjoge1xuICAgICAgICBjb2x1bW5zOiBjb2x1bW5zLFxuICAgICAgICAvLyBmaWx0ZXI6IHBlcm1pc3Npb25DaGVjayxcbiAgICAgICAgLy8gY2hlY2s6IHBlcm1pc3Npb25DaGVjayxcbiAgICAgIH0sXG4gICAgfTtcbiAgICAvLyBodHRwczovL2hhc3VyYS5pby9kb2NzL2xhdGVzdC9ncmFwaHFsL2NvcmUvYXBpLXJlZmVyZW5jZS9tZXRhZGF0YS1hcGkvcGVybWlzc2lvbi5odG1sXG4gICAgaWYgKHR5cGUgPT0gXCJpbnNlcnRcIikge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmNoZWNrID0gcGVybWlzc2lvbkNoZWNrO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXlsb2FkLnBlcm1pc3Npb24uZmlsdGVyID0gcGVybWlzc2lvbkNoZWNrO1xuICAgIH1cbiAgICBpZiAodHlwZSA9PSBcInNlbGVjdFwiKSB7XG4gICAgICBwYXlsb2FkLnBlcm1pc3Npb24uYWxsb3dfYWdncmVnYXRpb25zID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KGBwZ19jcmVhdGVfJHt0eXBlfV9wZXJtaXNzaW9uYCwgcGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVQZXJtaXNzaW9uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcsXG4gICAgcm9sZU5hbWU6IHN0cmluZ1xuICApIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoYHBnX2Ryb3BfJHt0eXBlfV9wZXJtaXNzaW9uYCwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgcm9sZTogcm9sZU5hbWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFzdXJhQXBpID0gbmV3IEhhc3VyYUFwaSgpO1xuIiwiZXhwb3J0IGNvbnN0IERFRkFVTFRfUE9MSUNZOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PiA9IHtcbiAgLy8gT3JnYW5pemF0aW9uc1xuICBhY2Nlc3Nfb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFjY2VzcyB0aGlzIE9yZ2FuaXphdGlvblwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbl91c2VyXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSxcbiAgfSxcbiAgYWRtaW5pc3Rlcl9vcmdhbml6YXRpb246IHtcbiAgICByb2xlTGV2ZWw6IFwib3JnYW5pemF0aW9uXCIsXG4gICAgZGVzY3JpcHRpb246IFwiQWRtaW5pc3RlciB0aGlzIE9yZ2FuaXphdGlvblwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiXSxcbiAgfSxcbiAgZWRpdF9vcmdhbml6YXRpb246IHtcbiAgICByb2xlTGV2ZWw6IFwib3JnYW5pemF0aW9uXCIsXG4gICAgZGVzY3JpcHRpb246IFwiRWRpdCB0aGlzIE9yZ2FuaXphdGlvblwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiXSxcbiAgfSxcbiAgbWFuYWdlX2FjY2Vzc190b19vcmdhbml6YXRpb246IHtcbiAgICByb2xlTGV2ZWw6IFwib3JnYW5pemF0aW9uXCIsXG4gICAgZGVzY3JpcHRpb246IFwiTWFuYWdlIEFjY2VzcyB0byB0aGlzIE9yZ2FuaXphdGlvblwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiXSxcbiAgfSxcbiAgLy8gU2NoZW1hc1xuICByZWFkX3NjaGVtYToge1xuICAgIHJvbGVMZXZlbDogXCJzY2hlbWFcIixcbiAgICBkZXNjcmlwdGlvbjogXCJSZWFkIHRoaXMgU2NoZW1hXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcbiAgICAgIFwic2NoZW1hX3JlYWRlclwiLFxuICAgICAgXCJzY2hlbWFfbWFuYWdlclwiLFxuICAgICAgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiLFxuICAgICAgXCJzY2hlbWFfb3duZXJcIixcbiAgICBdLFxuICB9LFxuICBhbHRlcl9zY2hlbWE6IHtcbiAgICByb2xlTGV2ZWw6IFwic2NoZW1hXCIsXG4gICAgZGVzY3JpcHRpb246IFwiQWx0ZXIgdGhpcyBEYXRhYmFzZVwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXCJzY2hlbWFfbWFuYWdlclwiLCBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsIFwic2NoZW1hX293bmVyXCJdLFxuICB9LFxuICBtYW5hZ2VfYWNjZXNzX3RvX3NjaGVtYToge1xuICAgIHJvbGVMZXZlbDogXCJzY2hlbWFcIixcbiAgICBkZXNjcmlwdGlvbjogXCJNYW5hZ2UgQWNjZXNzIHRvIHRoaXMgRGF0YWJhc2VcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wic2NoZW1hX2FkbWluaXN0cmF0b3JcIiwgXCJzY2hlbWFfb3duZXJcIl0sXG4gIH0sXG4gIC8vIFRhYmxlc1xuICByZWFkX3RhYmxlOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiUmVhZCB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcbiAgICAgIFwidGFibGVfcmVhZGVyXCIsXG4gICAgICBcInRhYmxlX2VkaXRvclwiLFxuICAgICAgXCJ0YWJsZV9tYW5hZ2VyXCIsXG4gICAgICBcInRhYmxlX2FkbWluaXN0cmF0b3JcIixcbiAgICBdLFxuICB9LFxuICBhbHRlcl90YWJsZToge1xuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFsdGVyIHRoaXMgVGFibGVcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1widGFibGVfbWFuYWdlclwiLCBcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIG1hbmFnZV9hY2Nlc3NfdG9fdGFibGU6IHtcbiAgICByb2xlTGV2ZWw6IFwidGFibGVcIixcbiAgICBkZXNjcmlwdGlvbjogXCJNYW5hZ2UgQWNjZXNzIHRvIHRoaXMgVGFibGVcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1widGFibGVfYWRtaW5pc3RyYXRvclwiXSxcbiAgfSxcbiAgcmVhZF90YWJsZV9yZWNvcmRzOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiUmVhZCBSZWNvcmRzIGZyb20gdGhpcyBUYWJsZVwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXG4gICAgICBcInRhYmxlX3JlYWRlclwiLFxuICAgICAgXCJ0YWJsZV9lZGl0b3JcIixcbiAgICAgIFwidGFibGVfbWFuYWdlclwiLFxuICAgICAgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSxcbiAgICBoYXN1cmFBY3Rpb25zOiBbXCJzZWxlY3RcIl0sXG4gIH0sXG4gIHJlYWRfYW5kX3dyaXRlX3RhYmxlX3JlY29yZHM6IHtcbiAgICByb2xlTGV2ZWw6IFwidGFibGVcIixcbiAgICBkZXNjcmlwdGlvbjogXCJSZWFkIGFuZCBXcml0ZSBSZWNvcmRzIHRvIHRoaXMgVGFibGVcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1widGFibGVfZWRpdG9yXCIsIFwidGFibGVfbWFuYWdlclwiLCBcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gICAgaGFzdXJhQWN0aW9uczogW1wic2VsZWN0XCIsIFwiaW5zZXJ0XCIsIFwidXBkYXRlXCIsIFwiZGVsZXRlXCJdLFxuICB9LFxufTtcbiIsImltcG9ydCB7IHR5cGVEZWZzIGFzIFNjaGVtYSwgcmVzb2x2ZXJzIGFzIHNjaGVtYVJlc29sdmVycyB9IGZyb20gXCIuL3NjaGVtYVwiO1xuaW1wb3J0IHtcbiAgdHlwZURlZnMgYXMgT3JnYW5pemF0aW9uLFxuICByZXNvbHZlcnMgYXMgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxufSBmcm9tIFwiLi9vcmdhbml6YXRpb25cIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFVzZXIsIHJlc29sdmVycyBhcyB1c2VyUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdXNlclwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVGFibGUsIHJlc29sdmVycyBhcyB0YWJsZVJlc29sdmVycyB9IGZyb20gXCIuL3RhYmxlXCI7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gXCJsb2Rhc2hcIjtcbmltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHtcbiAgY29uc3RyYWludERpcmVjdGl2ZSxcbiAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxufSBmcm9tIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiO1xuaW1wb3J0IHsgbWFrZUV4ZWN1dGFibGVTY2hlbWEgfSBmcm9tIFwiZ3JhcGhxbC10b29sc1wiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgdHlwZSBTZXJ2aWNlUmVzdWx0ID1cbiAgfCB7IHN1Y2Nlc3M6IHRydWU7IHBheWxvYWQ6IGFueTsgbWVzc2FnZT86IHN0cmluZyB9XG4gIHwge1xuICAgICAgc3VjY2Vzcz86IGZhbHNlO1xuICAgICAgbWVzc2FnZT86IHN0cmluZztcbiAgICAgIHJlZkNvZGU/OiBzdHJpbmc7XG4gICAgICB3YkNvZGU/OiBzdHJpbmc7XG4gICAgICBhcG9sbG9FcnJvckNvZGU/OiBzdHJpbmc7XG4gICAgICB2YWx1ZXM/OiBzdHJpbmdbXTtcbiAgICB9O1xuXG5leHBvcnQgdHlwZSBRdWVyeVBhcmFtcyA9IHtcbiAgcXVlcnk6IHN0cmluZztcbiAgcGFyYW1zPzogYW55W107XG59O1xuXG5leHBvcnQgdHlwZSBDb25zdHJhaW50SWQgPSB7XG4gIGNvbnN0cmFpbnROYW1lOiBzdHJpbmc7XG4gIHRhYmxlTmFtZTogc3RyaW5nO1xuICBjb2x1bW5OYW1lOiBzdHJpbmc7XG4gIHJlbFRhYmxlTmFtZT86IHN0cmluZztcbiAgcmVsQ29sdW1uTmFtZT86IHN0cmluZztcbn07XG5cbmNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFF1ZXJ5IHtcbiAgICB3YkhlYWx0aENoZWNrOiBKU09OIVxuICAgIHdiQ2xvdWRDb250ZXh0OiBKU09OIVxuICB9XG5cbiAgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JVdGlsKGZuOiBTdHJpbmchLCB2YWxzOiBKU09OKTogSlNPTiFcbiAgfVxuYDtcblxuY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIHdiSGVhbHRoQ2hlY2s6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaGVhZGVyczogY29udGV4dC5oZWFkZXJzLFxuICAgICAgICBtdWx0aVZhbHVlSGVhZGVyczogY29udGV4dC5oZWFkZXJzLFxuICAgICAgfTtcbiAgICB9LFxuICAgIHdiQ2xvdWRDb250ZXh0OiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiBjb250ZXh0LndiQ2xvdWQuY2xvdWRDb250ZXh0KCk7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICB3YlV0aWw6IGFzeW5jIChfLCB7IGZuLCB2YWxzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXRpbChjdXJyZW50VXNlciwgZm4sIHZhbHMpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuICB9LFxufTtcblxuZXhwb3J0IGNvbnN0IHNjaGVtYSA9IG1ha2VFeGVjdXRhYmxlU2NoZW1hKHtcbiAgdHlwZURlZnM6IFtcbiAgICBjb25zdHJhaW50RGlyZWN0aXZlVHlwZURlZnMsXG4gICAgdHlwZURlZnMsXG4gICAgT3JnYW5pemF0aW9uLFxuICAgIFVzZXIsXG4gICAgU2NoZW1hLFxuICAgIFRhYmxlLFxuICBdLFxuICByZXNvbHZlcnM6IG1lcmdlKFxuICAgIHJlc29sdmVycyxcbiAgICBvcmdhbml6YXRpb25SZXNvbHZlcnMsXG4gICAgdXNlclJlc29sdmVycyxcbiAgICBzY2hlbWFSZXNvbHZlcnMsXG4gICAgdGFibGVSZXNvbHZlcnNcbiAgKSxcbiAgc2NoZW1hVHJhbnNmb3JtczogW2NvbnN0cmFpbnREaXJlY3RpdmUoKV0sXG59KTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgT3JnYW5pemF0aW9uIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIE9yZ2FuaXphdGlvblVzZXIge1xuICAgIG9yZ2FuaXphdGlvbklkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgIHVzZXJGaXJzdE5hbWU6IFN0cmluZ1xuICAgIHVzZXJMYXN0TmFtZTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uc1xuICAgIFwiXCJcIlxuICAgIHdiTXlPcmdhbml6YXRpb25zKHdpdGhTZXR0aW5nczogQm9vbGVhbik6IFtPcmdhbml6YXRpb25dXG4gICAgd2JNeU9yZ2FuaXphdGlvbkJ5TmFtZShuYW1lOiBTdHJpbmchLCB3aXRoU2V0dGluZ3M6IEJvb2xlYW4pOiBPcmdhbml6YXRpb25cbiAgICB3Yk9yZ2FuaXphdGlvbkJ5TmFtZShuYW1lOiBTdHJpbmchKTogT3JnYW5pemF0aW9uXG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JPcmdhbml6YXRpb25Vc2VycyhcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICAgIHJvbGVOYW1lczogW1N0cmluZ11cbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbT3JnYW5pemF0aW9uVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBPcmdhbml6YXRpb25zXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVPcmdhbml6YXRpb24obmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBPcmdhbml6YXRpb25cbiAgICB3YlVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIG5ld05hbWU6IFN0cmluZ1xuICAgICAgbmV3TGFiZWw6IFN0cmluZ1xuICAgICk6IE9yZ2FuaXphdGlvblxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEpOiBCb29sZWFuXG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGVOYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncyhcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiTXlPcmdhbml6YXRpb25zOiBhc3luYyAoXywgeyB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlT3JnYW5pemF0aW9ucyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlPcmdhbml6YXRpb25CeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUsIHdpdGhTZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVPcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk9yZ2FuaXphdGlvbkJ5TmFtZTogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3Yk9yZ2FuaXphdGlvblVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBvcmdhbml6YXRpb25OYW1lLCByb2xlTmFtZXMsIHVzZXJFbWFpbHMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25Vc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgcm9sZU5hbWVzLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBPcmdhbml6YXRpb25zXG4gICAgd2JDcmVhdGVPcmdhbml6YXRpb246IGFzeW5jIChfLCB7IG5hbWUsIGxhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSwgbmV3TmFtZSwgbmV3TGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVPcmdhbml6YXRpb24oXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBuZXdOYW1lLFxuICAgICAgICBuZXdMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiRGVsZXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuZGVsZXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIC8vIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIHdiU2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBvcmdhbml6YXRpb25OYW1lLCB1c2VyRW1haWxzLCByb2xlTmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb246IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHVzZXJFbWFpbHMsIG9yZ2FuaXphdGlvbk5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBvcmdhbml6YXRpb25OYW1lLCBzZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFNjaGVtYSB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ6IEludFxuICAgIHVzZXJPd25lcklkOiBJbnRcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU6IFN0cmluZ1xuICAgIHVzZXJPd25lckVtYWlsOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIHJvbGU6IFJvbGVcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgU2NoZW1hVXNlciB7XG4gICAgc2NoZW1hSWQ6IEludCFcbiAgICB1c2VySWQ6IEludCFcbiAgICBzY2hlbWFOYW1lOiBTdHJpbmdcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3Yk15U2NoZW1hcyh3aXRoU2V0dGluZ3M6IEJvb2xlYW4pOiBbU2NoZW1hXVxuICAgIHdiTXlTY2hlbWFCeU5hbWUoXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmdcbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFNjaGVtYVxuICAgIHdiU2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIob3JnYW5pemF0aW9uTmFtZTogU3RyaW5nISk6IFtTY2hlbWFdXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTY2hlbWFVc2VycyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHJvbGVOYW1lczogW1N0cmluZ11cbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbU2NoZW1hVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBTY2hlbWFzXG4gICAgXCJcIlwiXG4gICAgd2JBZGRPckNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIGxhYmVsOiBTdHJpbmchXG4gICAgICBvcmdhbml6YXRpb25Pd25lck5hbWU6IFN0cmluZ1xuICAgICAgdXNlck93bmVyRW1haWw6IFN0cmluZ1xuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogU2NoZW1hXG4gICAgd2JVcGRhdGVTY2hlbWEoXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBuZXdTY2hlbWFOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1NjaGVtYUxhYmVsOiBTdHJpbmdcbiAgICAgIG5ld09yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgICBuZXdVc2VyT3duZXJFbWFpbDogU3RyaW5nXG4gICAgKTogU2NoZW1hXG4gICAgd2JSZW1vdmVPckRlbGV0ZVNjaGVtYShuYW1lOiBTdHJpbmchLCBkZWw6IEJvb2xlYW4pOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIFNjaGVtYSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0U2NoZW1hVXNlcnNSb2xlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlTmFtZTogU3RyaW5nIVxuICAgICk6IEJvb2xlYW5cbiAgICB3YlJlbW92ZVNjaGVtYVVzZXJzKHNjaGVtYU5hbWU6IFN0cmluZyEsIHVzZXJFbWFpbHM6IFtTdHJpbmddISk6IEJvb2xlYW5cbiAgICB3YlNhdmVTY2hlbWFVc2VyU2V0dGluZ3Moc2NoZW1hTmFtZTogU3RyaW5nISwgc2V0dGluZ3M6IEpTT04hKTogQm9vbGVhbiFcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICAvLyBTY2hlbWFzXG4gICAgd2JNeVNjaGVtYXM6IGFzeW5jIChfLCB7IHdpdGhTZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JNeVNjaGVtYUJ5TmFtZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgbmFtZSwgb3JnYW5pemF0aW9uTmFtZSwgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFCeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyOiBhc3luYyAoXywgeyBvcmdhbml6YXRpb25OYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBTY2hlbWEgVXNlcnNcbiAgICB3YlNjaGVtYVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCByb2xlTmFtZXMsIHVzZXJFbWFpbHMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zY2hlbWFVc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHJvbGVOYW1lcyxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiQWRkT3JDcmVhdGVTY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25Pd25lck5hbWUsIHVzZXJPd25lckVtYWlsLCBjcmVhdGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVTY2hlbWEoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBsYWJlbCxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lck5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlck93bmVyRW1haWwsXG4gICAgICAgIGNyZWF0ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlU2NoZW1hOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBuYW1lLFxuICAgICAgICBuZXdTY2hlbWFOYW1lLFxuICAgICAgICBuZXdTY2hlbWFMYWJlbCxcbiAgICAgICAgbmV3T3JnYW5pemF0aW9uT3duZXJOYW1lLFxuICAgICAgICBuZXdVc2VyT3duZXJFbWFpbCxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZVNjaGVtYShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIG5ld1NjaGVtYU5hbWUsXG4gICAgICAgIG5ld1NjaGVtYUxhYmVsLFxuICAgICAgICBuZXdPcmdhbml6YXRpb25Pd25lck5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgbmV3VXNlck93bmVyRW1haWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlU2NoZW1hOiBhc3luYyAoXywgeyBuYW1lLCBkZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGRlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIC8vIFNjaGVtYSBVc2Vyc1xuICAgIHdiU2V0U2NoZW1hVXNlcnNSb2xlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzLCByb2xlTmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICByb2xlTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlU2NoZW1hVXNlcnM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVTY2hlbWFVc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlNhdmVTY2hlbWFVc2VyU2V0dGluZ3M6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHNldHRpbmdzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBHcmFwaFFMSlNPTiB9IGZyb20gXCJncmFwaHFsLXR5cGUtanNvblwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHNjYWxhciBKU09OXG5cbiAgdHlwZSBUYWJsZSB7XG4gICAgaWQ6IElEIVxuICAgIHNjaGVtYUlkOiBJbnQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgY29sdW1uczogW0NvbHVtbl1cbiAgICBzY2hlbWFOYW1lOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIHJvbGU6IFJvbGVcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIHR5cGUgQ29sdW1uIHtcbiAgICBpZDogSUQhXG4gICAgdGFibGVJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHR5cGU6IFN0cmluZyFcbiAgICBkZWZhdWx0OiBTdHJpbmdcbiAgICBpc1ByaW1hcnlLZXk6IEJvb2xlYW4hXG4gICAgZm9yZWlnbktleXM6IFtDb25zdHJhaW50SWRdIVxuICAgIHJlZmVyZW5jZWRCeTogW0NvbnN0cmFpbnRJZF0hXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbnN0cmFpbnRJZCB7XG4gICAgY29uc3RyYWludE5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgcmVsVGFibGVOYW1lOiBTdHJpbmdcbiAgICByZWxDb2x1bW5OYW1lOiBTdHJpbmdcbiAgfVxuXG4gIHR5cGUgVGFibGVVc2VyIHtcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgIHVzZXJGaXJzdE5hbWU6IFN0cmluZ1xuICAgIHVzZXJMYXN0TmFtZTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgVGFibGVzXG4gICAgXCJcIlwiXG4gICAgd2JNeVRhYmxlcyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHdpdGhDb2x1bW5zOiBCb29sZWFuXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbVGFibGVdXG4gICAgd2JNeVRhYmxlQnlOYW1lKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB3aXRoQ29sdW1uczogQm9vbGVhblxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogVGFibGVcbiAgICBcIlwiXCJcbiAgICBUYWJsZSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiVGFibGVVc2VycyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ11cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFtUYWJsZVVzZXJdXG4gICAgXCJcIlwiXG4gICAgQ29sdW1uc1xuICAgIFwiXCJcIlxuICAgIHdiQ29sdW1ucyhzY2hlbWFOYW1lOiBTdHJpbmchLCB0YWJsZU5hbWU6IFN0cmluZyEpOiBbQ29sdW1uXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFRhYmxlc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkT3JDcmVhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVMYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgKTogVGFibGUhXG4gICAgd2JVcGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgbmV3VGFibGVOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1RhYmxlTGFiZWw6IFN0cmluZ1xuICAgICk6IFRhYmxlIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZEFsbEV4aXN0aW5nVGFibGVzKHNjaGVtYU5hbWU6IFN0cmluZyEpOiBCb29sZWFuIVxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKHNjaGVtYU5hbWU6IFN0cmluZyEpOiBCb29sZWFuIVxuICAgIHdiQ3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBwYXJlbnRUYWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHBhcmVudENvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWVzOiBbU3RyaW5nXSFcbiAgICAgIHBhcmVudFRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICBcIlwiXCJcbiAgICBUYWJsZSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddIVxuICAgICAgcm9sZU5hbWU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVUYWJsZVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICApOiBCb29sZWFuXG4gICAgd2JTYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHNldHRpbmdzOiBKU09OIVxuICAgICk6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgQ29sdW1uc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbkxhYmVsOiBTdHJpbmchXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICAgIGNvbHVtblR5cGU6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JVcGRhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIG5ld0NvbHVtbk5hbWU6IFN0cmluZ1xuICAgICAgbmV3Q29sdW1uTGFiZWw6IFN0cmluZ1xuICAgICAgbmV3VHlwZTogU3RyaW5nXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YlJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBkZWw6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiQWRkQ29sdW1uU2VxdWVuY2UoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIG5leHRTZXFOdW1iZXI6IEludFxuICAgICk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIEpTT046IEdyYXBoUUxKU09OLFxuICBRdWVyeToge1xuICAgIC8vIFRhYmxlc1xuICAgIHdiTXlUYWJsZXM6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHdpdGhDb2x1bW5zLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWNjZXNzaWJsZVRhYmxlcyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHdpdGhDb2x1bW5zLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk15VGFibGVCeU5hbWU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgd2l0aENvbHVtbnMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlVGFibGVCeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHdpdGhDb2x1bW5zLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiVGFibGVVc2VyczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VyRW1haWxzLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudGFibGVVc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gQ29sdW1uc1xuICAgIHdiQ29sdW1uczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBUYWJsZXNcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdGFibGVMYWJlbCwgY3JlYXRlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHRhYmxlTGFiZWwsXG4gICAgICAgIGNyZWF0ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgbmV3VGFibGVOYW1lLCBuZXdUYWJsZUxhYmVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZVRhYmxlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBuZXdUYWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlVGFibGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGRlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdUYWJsZXM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRBbGxFeGlzdGluZ1RhYmxlcyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZEFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQ3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5OiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWVzLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRPckNyZWF0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICAgIGNyZWF0ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5OiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWVzLCBwYXJlbnRUYWJsZU5hbWUsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIGRlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIC8vIENvbHVtbnNcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIGNvbHVtbkxhYmVsLCBjcmVhdGUsIGNvbHVtblR5cGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIGNvbHVtbkxhYmVsLFxuICAgICAgICBjcmVhdGUsXG4gICAgICAgIGNvbHVtblR5cGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlVwZGF0ZUNvbHVtbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZSxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICAgIG5ld1R5cGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRDb2x1bW5TZXF1ZW5jZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lLCBuZXh0U2VxTnVtYmVyIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yUmVtb3ZlQ29sdW1uU2VxdWVuY2UoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5leHRTZXFOdW1iZXJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVUYWJsZVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbHMgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlVGFibGVVc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuLyoqXG4gKiBPbmx5IGZpZWxkcyByZWxhdGVkIHRvIGFuIGlzb2xhdGVkIHVzZXIgb3Igcm9sZSBvYmplY3RzIGxpdmUgaGVyZVxuICogRm9yIG9yZ2FuaXphdGlvbi11c2Vycywgc2NoZW1hLXVzZXJzLCB0YWJsZS11c2VycyBzZWUgcmVzcGVjdGl2ZSBjbGFzc2VzXG4gKi9cblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFVzZXIge1xuICAgIGlkOiBJRCFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBSb2xlIHtcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgaW1wbGllZEZyb206IFN0cmluZ1xuICAgIHBlcm1pc3Npb25zOiBKU09OXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlVzZXJCeUlkKGlkOiBJRCEpOiBVc2VyXG4gICAgd2JVc2VyQnlFbWFpbChlbWFpbDogU3RyaW5nISk6IFVzZXJcbiAgICB3YlVzZXJzQnlTZWFyY2hQYXR0ZXJuKHNlYXJjaFBhdHRlcm46IFN0cmluZyEpOiBbVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2lnblVwKHVzZXJBdXRoSWQ6IFN0cmluZyEsIHVzZXJPYmo6IEpTT04hKTogQm9vbGVhblxuICAgIHdiQXV0aCh1c2VyQXV0aElkOiBTdHJpbmchKTogSlNPTlxuICAgIHdiQ3JlYXRlVXNlcihcbiAgICAgIGF1dGhJZDogU3RyaW5nXG4gICAgICBlbWFpbDogU3RyaW5nXG4gICAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgICk6IFVzZXJcbiAgICB3YlVwZGF0ZU15UHJvZmlsZShmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5SWQoY3VycmVudFVzZXIsIGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5RW1haWw6IGFzeW5jIChfLCB7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5RW1haWwoY3VycmVudFVzZXIsIGVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlcnNCeVNlYXJjaFBhdHRlcm46IGFzeW5jIChfLCB7IHNlYXJjaFBhdHRlcm4gfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2Vyc0J5U2VhcmNoUGF0dGVybihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNlYXJjaFBhdHRlcm5cbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICB3YlNpZ25VcDogYXN5bmMgKF8sIHsgdXNlckF1dGhJZCwgdXNlck9iaiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNpZ25VcChcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHVzZXJBdXRoSWQsXG4gICAgICAgIHVzZXJPYmpcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkF1dGg6IGFzeW5jIChfLCB7IHVzZXJBdXRoSWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hdXRoKGN1cnJlbnRVc2VyLCB1c2VyQXV0aElkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiQ3JlYXRlVXNlcjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgYXV0aElkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgYXV0aElkLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlTXlQcm9maWxlOiBhc3luYyAoXywgeyBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVXNlcihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIGN1cnJlbnRVc2VyLmlkLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBBcG9sbG9TZXJ2ZXIsIEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuaW1wb3J0IHsgaGFzdXJhQXBpIH0gZnJvbSBcIi4vaGFzdXJhLWFwaVwiO1xuaW1wb3J0IHsgQ29uc3RyYWludElkLCBzY2hlbWEsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHYgPSByZXF1aXJlKFwidm9jYVwiKTtcbmltcG9ydCB7IGVudmlyb25tZW50LCBVU0VSX01FU1NBR0VTIH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcblxuaW1wb3J0IHtcbiAgQ29sdW1uLFxuICBPcmdhbml6YXRpb24sXG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgU2NoZW1hLFxuICBUYWJsZSxcbiAgVXNlcixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuL2VudGl0eS9DdXJyZW50VXNlclwiO1xuaW1wb3J0IHsgREVGQVVMVF9QT0xJQ1kgfSBmcm9tIFwiLi9wb2xpY3lcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxIYW5kbGVyID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gIHNjaGVtYSxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogKHsgZXZlbnQsIGNvbnRleHQgfSkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBoZWFkZXJzOiBldmVudC5oZWFkZXJzLFxuICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGV2ZW50Lm11bHRpVmFsdWVIZWFkZXJzLFxuICAgICAgd2JDbG91ZDogbmV3IFdoaXRlYnJpY2tDbG91ZCgpLFxuICAgIH07XG4gIH0sXG59KS5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBXaGl0ZWJyaWNrQ2xvdWQge1xuICBkYWwgPSBuZXcgREFMKCk7XG5cbiAgcHVibGljIGVycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gICAgcmV0dXJuIGFwb2xsb0VycihyZXN1bHQpO1xuICB9XG5cbiAgLy8gb25seSBhc3luYyBmb3IgdGVzdGluZyAtIGZvciB0aGUgbW9zdCBwYXJ0IHN0YXRpY1xuICBwdWJsaWMgYXN5bmMgdWlkRnJvbUhlYWRlcnMoXG4gICAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICAvL2xvZy5kZWJ1ZyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIC8vIGlmIHgtaGFzdXJhLWFkbWluLXNlY3JldCBoYXN1cmEgc2V0cyByb2xlIHRvIGFkbWluXG4gICAgaWYgKFxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0gJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdLnRvTG93ZXJDYXNlKCkgPT0gXCJhZG1pblwiXG4gICAgKSB7XG4gICAgICBsb2cuZGVidWcoXCI9PT09PT09PT09IEZPVU5EIEFETUlOIFVTRVJcIik7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiBVc2VyLlNZU19BRE1JTl9JRCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT0gXCJkZXZlbG9wbWVudFwiICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItaWRcIl1cbiAgICApIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwoXG4gICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXVxuICAgICAgKTtcbiAgICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVEVTVCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXX1gXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pIHtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogcGFyc2VJbnQoaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl0pLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGB1aWRGcm9tSGVhZGVyczogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBoZWFkZXJzXG4gICAgICAgICl9YCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgY2xvdWRDb250ZXh0KCk6IG9iamVjdCB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRlZmF1bHRDb2x1bW5UeXBlczogQ29sdW1uLkNPTU1PTl9UWVBFUyxcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIG9yZ2FuaXphdGlvbjogUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TLFxuICAgICAgICBzY2hlbWE6IFJvbGUuU1lTUk9MRVNfU0NIRU1BUyxcbiAgICAgICAgdGFibGU6IFJvbGUuU1lTUk9MRVNfVEFCTEVTLFxuICAgICAgfSxcbiAgICAgIHBvbGljeTogREVGQVVMVF9QT0xJQ1ksXG4gICAgICB1c2VyTWVzc2FnZXM6IFVTRVJfTUVTU0FHRVMsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IEF1dGggPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYXV0aChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlckF1dGhJZDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgYXV0aCgke3VzZXJBdXRoSWR9KWApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSkgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlcklkRnJvbUF1dGhJZCh1c2VyQXV0aElkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGhhc3VyYVVzZXJJZDogbnVtYmVyID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIFwiWC1IYXN1cmEtQWxsb3dlZC1Sb2xlc1wiOiBbXCJ3YnVzZXJcIl0sXG4gICAgICAgIFwiWC1IYXN1cmEtRGVmYXVsdC1Sb2xlXCI6IFwid2J1c2VyXCIsXG4gICAgICAgIFwiWC1IYXN1cmEtVXNlci1JZFwiOiBoYXN1cmFVc2VySWQsXG4gICAgICAgIFwiWC1IYXN1cmEtQXV0aGVudGljYXRlZC1BdFwiOiBEYXRlKCkudG9TdHJpbmcoKSxcbiAgICAgIH0sXG4gICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNpZ25VcChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlckF1dGhJZDogc3RyaW5nLFxuICAgIHVzZXJPYmo6IFJlY29yZDxzdHJpbmcsIGFueT5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzaWduVXAoJHt1c2VyQXV0aElkfSwke0pTT04uc3RyaW5naWZ5KHVzZXJPYmopfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGxldCBlbWFpbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBmaXJzdE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBsZXQgbGFzdE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICAvLyBodHRwczovL2F1dGgwLmNvbS9kb2NzL3J1bGVzL3VzZXItb2JqZWN0LWluLXJ1bGVzXG4gICAgaWYgKHVzZXJPYmouZW1haWwgJiYgdXNlck9iai5lbWFpbC5sZW5ndGggPiAwKSBlbWFpbCA9IHVzZXJPYmouZW1haWw7XG4gICAgaWYgKHVzZXJPYmouZ2l2ZW5fbmFtZSAmJiB1c2VyT2JqLmdpdmVuX25hbWUubGVuZ3RoID4gMCkge1xuICAgICAgZmlyc3ROYW1lID0gdXNlck9iai5naXZlbl9uYW1lO1xuICAgIH1cbiAgICBpZiAodXNlck9iai5mYW1pbHlfbmFtZSAmJiB1c2VyT2JqLmZhbWlseV9uYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgIGxhc3ROYW1lID0gdXNlck9iai5mYW1pbHlfbmFtZTtcbiAgICB9XG4gICAgaWYgKCFmaXJzdE5hbWUgJiYgIWxhc3ROYW1lKSB7XG4gICAgICBpZiAodXNlck9iai5uYW1lICYmIHVzZXJPYmoubmFtZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHNwbGl0OiBzdHJpbmdbXSA9IHVzZXJPYmoubmFtZS5zcGxpdChcIiBcIik7XG4gICAgICAgIGZpcnN0TmFtZSA9IHNwbGl0LnNoaWZ0KCk7XG4gICAgICAgIGxhc3ROYW1lID0gc3BsaXQuam9pbihcIiBcIik7XG4gICAgICB9IGVsc2UgaWYgKHVzZXJPYmoubmlja25hbWUgJiYgdXNlck9iai5uaWNrbmFtZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZpcnN0TmFtZSA9IHVzZXJPYmoubmlja25hbWU7XG4gICAgICB9XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNyZWF0ZVVzZXIoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgdXNlckF1dGhJZCxcbiAgICAgIGVtYWlsLFxuICAgICAgZmlyc3ROYW1lLFxuICAgICAgbGFzdE5hbWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKGVudmlyb25tZW50LmRlbW9EQlByZWZpeCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hc3NpZ25EZW1vU2NoZW1hKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFJvbGVzICYgUGVybWlzc2lvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgcm9sZUJ5TmFtZSgke2NVLmlkfSwke25hbWV9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnJvbGVCeU5hbWUobmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KCR7Y1UuaWR9LCR7dXNlcklkfSwke3JvbGVMZXZlbH0sJHtvYmplY3RJZE9yTmFtZX0sJHtwYXJlbnRPYmplY3ROYW1lfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIHJldHVybiB0aGlzLmRhbC5yb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgICAgdXNlcklkLFxuICAgICAgcm9sZUxldmVsLFxuICAgICAgb2JqZWN0SWRPck5hbWUsXG4gICAgICBwYXJlbnRPYmplY3ROYW1lXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGUsXG4gICAgZGVsZXRlT25seT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKCR7Y1UuaWR9LCR7dGFibGV9LCR7ZGVsZXRlT25seX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlXCIsIHRhYmxlLmlkKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKHRhYmxlLmlkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdDogT3JnYW5pemF0aW9uIHwgU2NoZW1hIHwgVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldFJvbGUoJHtjVS5pZH0sJHt1c2VySWRzfSwke3JvbGVOYW1lfSwke3JvbGVMZXZlbH0sJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgb2JqZWN0XG4gICAgICApfSlgXG4gICAgKTtcbiAgICAvLyBSQkFDIGluIHN3aXRjaCBiZWxvd1xuICAgIGlmICghUm9sZS5pc1JvbGUocm9sZU5hbWUsIHJvbGVMZXZlbCkpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBgJHtyb2xlTmFtZX0gaXMgbm90IGEgdmFsaWQgbmFtZSBmb3IgYW4gJHtyb2xlTGV2ZWx9IFJvbGUuYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19vcmdhbml6YXRpb25cIiwgb2JqZWN0LmlkKSkge1xuICAgICAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKHJvbGVOYW1lKSB7XG4gICAgICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvbl91c2VyXCI6XG4gICAgICAgICAgICAvLyBhcmUgYW55IG9mIHRoZXNlIHVzZXIgY3VycmVudGx5IGFkbWlucyBnZXR0aW5nIGRlbW90ZWQ/XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvblVzZXJzKGNVLCBvYmplY3QubmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICAgICAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBZG1pbklkcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgICAgICAgKG9yZ2FuaXphdGlvblVzZXI6IHsgdXNlcklkOiBudW1iZXIgfSkgPT4gb3JnYW5pemF0aW9uVXNlci51c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBkZW1vdGVkQWRtaW5zOiBudW1iZXJbXSA9IHVzZXJJZHMuZmlsdGVyKChpZDogbnVtYmVyKSA9PlxuICAgICAgICAgICAgICBjdXJyZW50QWRtaW5JZHMuaW5jbHVkZXMoaWQpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKGRlbW90ZWRBZG1pbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAvLyBjb21wbGV0ZWx5IHJlbW92ZSB0aGVtICh3aWxsIHJhaXNlIGVycm9yIGlmIG5vIGFkbWlucylcbiAgICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgICAgICAgICAgICAgY1UsXG4gICAgICAgICAgICAgICAgb2JqZWN0Lm5hbWUsXG4gICAgICAgICAgICAgICAgZGVtb3RlZEFkbWluc1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gYWRkIG9yZ25haXphdGlvbl91c2VyXG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIjpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoXG4gICAgICAgICAgICAgIG9iamVjdC5pZCxcbiAgICAgICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFxuICAgICAgICAgICAgICAgIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICAgICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsXG4gICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdXNlcklkc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKGNVLCBvYmplY3QuaWQpO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5pZCxcbiAgICAgICAgICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpLFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB1c2VySWRzXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIjpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3NjaGVtYVwiLCBvYmplY3QuaWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGFkZCBzY2hlbWFfdXNlclxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgcm9sZUxldmVsLFxuICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAvLyBDaGFuZ2luZyByb2xlIGF0IHRoZSBzY2hlbWEgbGV2ZWwgcmVzZXRzIGFsbFxuICAgICAgICAvLyB0YWJsZSByb2xlcyB0byB0aGUgc2NoZW1hIGRlZmF1bHQgaW5oZXJpdGVuY2VcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICAgICAgb2JqZWN0LmlkLFxuICAgICAgICAgIFJvbGUuc3lzUm9sZU1hcChcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCwgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbCksIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHVzZXJJZHNcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCBvYmplY3QuaWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVJvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVSb2xlKCR7Y1UuaWR9LCR7dXNlcklkc30sJHtyb2xlTGV2ZWx9LCR7b2JqZWN0SWR9KWApO1xuICAgIC8vIHBlcm1pc3Npb24gY2hlY2tzIGluIHN3aXRjaCBiZWxvd1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX29yZ2FuaXphdGlvblwiLCBvYmplY3RJZCkpIHtcbiAgICAgICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVsZXRlIHNjaGVtYSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBvcmdhbml6YXRpb24gYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICBcInNjaGVtYVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIG9yZ2FuaXphdGlvbiBpZFxuICAgICAgICAgIFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSBhZG1pbnMgaW1wbGljaXRseSBzZXQgZnJvbSBzY2hlbWEgYWRtaW5zXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoY1UsIG9iamVjdElkKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgIFwidGFibGVcIixcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHNjaGVtYS5pZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgICAgW1wic2NoZW1hX2FkbWluaXN0cmF0b3JcIl1cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZSh1c2VySWRzLCByb2xlTGV2ZWwsIG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIG9iamVjdElkKSkge1xuICAgICAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWxldGUgdGFibGUgdXNlcnMgaW1wbGljaXRseSBzZXQgZnJvbSBzY2hlbWEgdXNlcnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIFwidGFibGVcIixcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgb2JqZWN0SWQsIC8vIHBhcmVudE9iamVjdElkIGllIHRoZSBzY2hlbWEgaWRcbiAgICAgICAgICBPYmplY3Qua2V5cyhcbiAgICAgICAgICAgIFJvbGUuc3lzUm9sZU1hcChcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCwgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbClcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUodXNlcklkcywgcm9sZUxldmVsLCBvYmplY3RJZCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fdGFibGVcIiwgb2JqZWN0SWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUodXNlcklkcywgcm9sZUxldmVsLCBvYmplY3RJZCk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgZGVsZXRlVGVzdFVzZXJzKClgKTtcbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdFVzZXJzKCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUlkcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWRzOiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHVzZXJzQnlJZHMoJHtjVS5pZH0sJHtpZHN9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgLy8gVEJEOiBtYXNrIHNlbnNpdGl2ZSBpbmZvcm1hdGlvblxuICAgIHJldHVybiB0aGlzLmRhbC51c2VycyhpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGNVOiBDdXJyZW50VXNlciwgaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdXNlckJ5SWQoJHtjVS5pZH0sJHtpZH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlJZHMoY1UsIFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gc2VhcmNoUGF0dGVybiBhY3Jvc3MgbXVsdGlwbGUgZmllbGRzXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5U2VhcmNoUGF0dGVybihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2VhcmNoUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdXNlcnNCeVNlYXJjaFBhdHRlcm4oJHtjVS5pZH0sJHtzZWFyY2hQYXR0ZXJufSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vycyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2VhcmNoUGF0dGVybik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeUVtYWlscyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB1c2Vyc0J5RW1haWxzKCR7Y1UuaWR9LCR7dXNlckVtYWlsc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnModW5kZWZpbmVkLCB1c2VyRW1haWxzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgZW1haWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHVzZXJCeUVtYWlsKCR7Y1UuaWR9LCR7ZW1haWx9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCBbZW1haWxdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2VtYWlsXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgYXV0aElkPzogc3RyaW5nLFxuICAgIGVtYWlsPzogc3RyaW5nLFxuICAgIGZpcnN0TmFtZT86IHN0cmluZyxcbiAgICBsYXN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgY3JlYXRlVXNlcigke2NVLmlkfSwke2F1dGhJZH0sJHtlbWFpbH0sJHtmaXJzdE5hbWV9LCR7bGFzdE5hbWV9KWBcbiAgICApO1xuICAgIC8vIGEgdGVzdCB1c2VyIGNhbiBvbmx5IGNyZWF0ZSBhbm9odGVyIHRlc3QgdXNlclxuICAgIGlmIChcbiAgICAgIGVtYWlsICYmXG4gICAgICBlbWFpbC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKGVudmlyb25tZW50LnRlc3RVc2VyRW1haWxEb21haW4pICYmXG4gICAgICBjVS5pc250VGVzdFVzZXIoKSAmJlxuICAgICAgY1UuaXNudFN5c0FkbWluKClcbiAgICApIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbk9yVGVzdFVzZXIoKTtcbiAgICB9IGVsc2UgaWYgKGNVLmlzbnRTeXNBZG1pbigpKSB7XG4gICAgICByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW4oKTtcbiAgICB9XG4gICAgbGV0IGV4aXN0aW5nVXNlclJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCBlcnJWYWx1ZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAoYXV0aElkKSB7XG4gICAgICBleGlzdGluZ1VzZXJSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VySWRGcm9tQXV0aElkKGF1dGhJZCk7XG4gICAgICBlcnJWYWx1ZSA9IGF1dGhJZDtcbiAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICBleGlzdGluZ1VzZXJSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJCeUVtYWlsKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBlbWFpbFxuICAgICAgKTtcbiAgICAgIGVyclZhbHVlID0gZW1haWw7XG4gICAgfVxuICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gZmluZCBhbnkgZXhpc3RpbmcgdXNlcnNcbiAgICBpZiAoZXhpc3RpbmdVc2VyUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9FWElTVFNcIixcbiAgICAgICAgdmFsdWVzOiBbZXJyVmFsdWVdLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5jcmVhdGVVc2VyKGF1dGhJZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkOiBudW1iZXIsXG4gICAgZW1haWw6IHN0cmluZyxcbiAgICBmaXJzdE5hbWU6IHN0cmluZyxcbiAgICBsYXN0TmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdXBkYXRlVXNlcigke2NVLmlkfSwke2lkfSwke2VtYWlsfSwke2ZpcnN0TmFtZX0sJHtsYXN0TmFtZX0pYCk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpICYmIGNVLmlkSXNudChpZCkpIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbk9yU2VsZigpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25JZHM/OiBudW1iZXJbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lcz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBvcmdhbml6YXRpb25zKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uSWRzfSwke29yZ2FuaXphdGlvbk5hbWVzfSwke29yZ2FuaXphdGlvbk5hbWVQYXR0ZXJufSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnMoXG4gICAgICBvcmdhbml6YXRpb25JZHMsXG4gICAgICBvcmdhbml6YXRpb25OYW1lcyxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeUlkcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWRzOiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYG9yZ2FuaXphdGlvbnNCeUlkcygke2NVLmlkfSwke2lkc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5vcmdhbml6YXRpb25zKGNVLCBpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5SWQoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBvcmdhbml6YXRpb25CeUlkcygke2NVLmlkfSwke2lkfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uc0J5SWRzKGNVLCBbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeU5hbWVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBvcmdhbml6YXRpb25zQnlOYW1lcygke2NVLmlkfSwke25hbWVzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLm9yZ2FuaXphdGlvbnMoY1UsIHVuZGVmaW5lZCwgbmFtZXMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgb3JnYW5pemF0aW9uQnlOYW1lKCR7Y1UuaWR9LCR7bmFtZX0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnNCeU5hbWVzKGNVLCBbbmFtZV0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lUGF0dGVybihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZVBhdHRlcm46IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYG9yZ2FuaXphdGlvbkJ5TmFtZVBhdHRlcm4oJHtjVS5pZH0sJHtuYW1lUGF0dGVybn0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnMoXG4gICAgICBjVSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIG5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWNjZXNzaWJsZU9yZ2FuaXphdGlvbkJ5TmFtZSgke2NVLmlkfSwke29yZ2FuaXphdGlvbk5hbWV9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5vcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBbb3JnYW5pemF0aW9uTmFtZV0sXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAvLyBkb2VzIHRoaXMgb3JnYW5pemF0aW9uIGV4aXN0IGF0IGFsbCAocmVnYXJkbGVzcyBvZiBhY2Nlc3MpXG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICAgKTtcbiAgICAgIC8vIHJldHVybiBvcmdhbml6YXRpb24gbm90IGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgLy8gb3RoZXJ3aXNlIHJldHVybiBmb3JiaWRkZW5cbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgICAgIHZhbHVlczogW29yZ2FuaXphdGlvbk5hbWVdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlT3JnYW5pemF0aW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGFjY2Vzc2libGVPcmdhbml6YXRpb25zKCR7Y1UuaWR9LCR7d2l0aFNldHRpbmdzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5vcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBjcmVhdGVPcmdhbml6YXRpb24oJHtjVS5pZH0sJHtuYW1lfSwke2xhYmVsfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IGNoZWNrTmFtZVJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuYW1lKTtcbiAgICBpZiAoY2hlY2tOYW1lUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05BTUVfVEFLRU5cIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAvLyBpZSBXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EIGlzIHRoZSBkZXNpcmVkIHJlc3VsdFxuICAgIH0gZWxzZSBpZiAoY2hlY2tOYW1lUmVzdWx0LndiQ29kZSAhPSBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIikge1xuICAgICAgcmV0dXJuIGNoZWNrTmFtZVJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgY3JlYXRlT3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgICAgbmFtZSxcbiAgICAgIGxhYmVsXG4gICAgKTtcbiAgICBpZiAoIWNyZWF0ZU9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gY3JlYXRlT3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIG5hbWUsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICBbY1UuaWRdXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbmV3TmFtZT86IHN0cmluZyxcbiAgICBuZXdMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHVwZGF0ZU9yZ2FuaXphdGlvbigke2NVLmlkfSwke25hbWV9LCR7bmV3TmFtZX0sJHtuZXdMYWJlbH0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJlZGl0X29yZ2FuaXphdGlvblwiLCBuYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVPcmdhbml6YXRpb24obmFtZSwgbmV3TmFtZSwgbmV3TGFiZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgZGVsZXRlT3JnYW5pemF0aW9uKCR7Y1UuaWR9LCR7bmFtZX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJlZGl0X29yZ2FuaXphdGlvblwiLCBuYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvblVzZXJzKGNVLCBuYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgIFwib3JnYW5pemF0aW9uX3VzZXJcIixcbiAgICAgIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIixcbiAgICBdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfVVNFUl9FTVBUWVwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0T3JnYW5pemF0aW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygke2NVLmlkfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkgJiYgY1UuaXNudFRlc3RVc2VyKCkpIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbk9yVGVzdFVzZXIoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb24gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZU5hbWVzPzogc3RyaW5nW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYG9yZ2FuaXphdGlvblVzZXJzKCR7Y1UuaWR9LCR7bmFtZX0sJHtpZH0sJHtyb2xlTmFtZXN9LCR7dXNlckVtYWlsc30sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGxldCBvcmdhbml6YXRpb25SZWY6IHN0cmluZyB8IG51bWJlciA9IFwiXCI7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChuYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShjVSwgbmFtZSk7XG4gICAgICBvcmdhbml6YXRpb25SZWYgPSBuYW1lO1xuICAgIH0gZWxzZSBpZiAoaWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlJZChjVSwgaWQpO1xuICAgICAgb3JnYW5pemF0aW9uUmVmID0gaWQ7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvblJlZikpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBpZiAocm9sZU5hbWVzICYmICFSb2xlLmFyZVJvbGVzKHJvbGVOYW1lcykpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwib3JnYW5pemF0aW9uVXNlcnM6IHJvbGVzIGNvbnRhaW5zIG9uZSBvciBtb3JlIHVucmVjb2duaXplZCBzdHJpbmdzXCIsXG4gICAgICAgIHZhbHVlczogcm9sZU5hbWVzLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHVzZXJJZHMgPSB1bmRlZmluZWQ7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcyB8fCAhdXNlcnNSZXN1bHQucGF5bG9hZCkgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgICAgdXNlcklkcyA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5vcmdhbml6YXRpb25Vc2VycyhcbiAgICAgIG5hbWUsXG4gICAgICBpZCxcbiAgICAgIHJvbGVOYW1lcyxcbiAgICAgIHVzZXJJZHMsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uTmFtZX0sJHtyb2xlTmFtZX0sJHt1c2VySWRzfSwke3VzZXJFbWFpbHN9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICBjVSxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VySWRzRm91bmQ6IG51bWJlcltdID0gW107XG4gICAgbGV0IHVzZXJzUmVxdWVzdGVkOiAoc3RyaW5nIHwgbnVtYmVyKVtdID0gW107XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHVzZXJzUmVxdWVzdGVkID0gdXNlcklkcztcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUlkcyhjVSwgdXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICB1c2Vyc1JlcXVlc3RlZCA9IHVzZXJFbWFpbHM7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzIHx8ICFyZXN1bHQucGF5bG9hZCkgcmV0dXJuIHJlc3VsdDtcbiAgICB1c2VySWRzRm91bmQgPSByZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICBpZiAodXNlcnNSZXF1ZXN0ZWQubGVuZ3RoICE9IHVzZXJJZHNGb3VuZC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogW1xuICAgICAgICAgIGBSZXF1ZXN0ZWQgJHt1c2Vyc1JlcXVlc3RlZC5sZW5ndGh9OiAke3VzZXJzUmVxdWVzdGVkLmpvaW4oXCIsXCIpfWAsXG4gICAgICAgICAgYEZvdW5kICR7dXNlcklkc0ZvdW5kLmxlbmd0aH06ICR7dXNlcklkc0ZvdW5kLmpvaW4oXCIsXCIpfWAsXG4gICAgICAgIF0sXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzRm91bmQsXG4gICAgICByb2xlTmFtZSxcbiAgICAgIFwib3JnYW5pemF0aW9uXCIsXG4gICAgICBvcmdhbml6YXRpb25SZXN1bHQucGF5bG9hZFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uTmFtZX0sJHt1c2VySWRzfSwke3VzZXJFbWFpbHN9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VySWRzVG9CZVJlbW92ZWQ6IG51bWJlcltdID0gW107XG4gICAgaWYgKHVzZXJJZHMpIHVzZXJJZHNUb0JlUmVtb3ZlZCA9IHVzZXJJZHM7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgdXNlcklkc1RvQmVSZW1vdmVkID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIGNoZWNrIG5vdCBhbGwgdGhlIGFkbWlucyB3aWxsIGJlIHJlbW92ZWRcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvblVzZXJzKGNVLCBvcmdhbml6YXRpb25OYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGFsbEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKG9yZ2FuaXphdGlvblVzZXI6IHsgdXNlcklkOiBudW1iZXIgfSkgPT4gb3JnYW5pemF0aW9uVXNlci51c2VySWRcbiAgICApO1xuICAgIGlmIChcbiAgICAgIGFsbEFkbWluSWRzLmV2ZXJ5KChlbGVtOiBudW1iZXIpID0+IHVzZXJJZHNUb0JlUmVtb3ZlZC5pbmNsdWRlcyhlbGVtKSlcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PX0FETUlOU1wiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICBjVSxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzVG9CZVJlbW92ZWQsXG4gICAgICBcIm9yZ2FuaXphdGlvblwiLFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzYXZlU2NoZW1hVXNlclNldHRpbmdzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHtzZXR0aW5nc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgY1UuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWFzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHNjaGVtYU5hbWVzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNjaGVtYXMoJHtjVS5pZH0sJHtzY2hlbWFJZHN9LCR7c2NoZW1hTmFtZXN9LCR7c2NoZW1hTmFtZVBhdHRlcm59KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2NoZW1hcyhcbiAgICAgIHNjaGVtYUlkcyxcbiAgICAgIHNjaGVtYU5hbWVzLFxuICAgICAgc2NoZW1hTmFtZVBhdHRlcm5cbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5SWRzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZHM6IG51bWJlcltdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgc2NoZW1hcygke2NVLmlkfSwke2lkc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFzKGNVLCBpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5SWQoY1U6IEN1cnJlbnRVc2VyLCBpZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzY2hlbWFCeUlkKCR7Y1UuaWR9LCR7aWR9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlJZHMoY1UsIFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1NDSEVNQV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5TmFtZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHNjaGVtYXNCeU5hbWVzKCR7Y1UuaWR9LCR7bmFtZXN9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hcyhjVSwgdW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzY2hlbWFCeU5hbWUoJHtjVS5pZH0sJHtuYW1lfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5TmFtZXMoY1UsIFtuYW1lXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeU5hbWVQYXR0ZXJuKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgc2NoZW1hQnlOYW1lUGF0dGVybigke2NVLmlkfSwke25hbWVQYXR0ZXJufSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyhjVSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG5hbWVQYXR0ZXJuKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzY2hlbWFzQnlVc2VyT3duZXIoJHtjVS5pZH0sJHt1c2VySWR9LCR7dXNlckVtYWlsfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlVc2VyT3duZXIodXNlcklkLCB1c2VyRW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25JZD86IG51bWJlcixcbiAgICBvcmdhbml6YXRpb25OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcigke2NVLmlkfSwke29yZ2FuaXphdGlvbklkfSwke29yZ2FuaXphdGlvbk5hbWV9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgb3JnYW5pemF0aW9uUmVmOiBudW1iZXIgfCBzdHJpbmcgPSBcIlwiO1xuICAgIC8vIGRvZXMgdGhpcyBvcmdhbml6YXRpb24gZXhpc3QgYXQgYWxsIChyZWdhcmRsZXNzIG9mIGFjY2VzcylcbiAgICBpZiAob3JnYW5pemF0aW9uSWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlJZChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgb3JnYW5pemF0aW9uSWRcbiAgICAgICk7XG4gICAgICBvcmdhbml6YXRpb25SZWYgPSBvcmdhbml6YXRpb25JZDtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWUpIHtcbiAgICAgIG9yZ2FuaXphdGlvblJlZiA9IG9yZ2FuaXphdGlvbk5hbWU7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gcmV0dXJuIG9yZ2FuaXphdGlvbiBub3QgZm91bmRcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWNjZXNzX29yZ2FuaXphdGlvblwiLCBvcmdhbml6YXRpb25SZWYpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICAgIGNVLmlkLFxuICAgICAgb3JnYW5pemF0aW9uSWQsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWQ/OiBudW1iZXIsXG4gICAgdXNlckVtYWlsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKCR7Y1UuaWR9LCR7dXNlcklkfSwke3VzZXJFbWFpbH0pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXJBZG1pbih1c2VySWQsIHVzZXJFbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVNjaGVtYUJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmcsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWNjZXNzaWJsZVNjaGVtYUJ5TmFtZSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7b3JnYW5pemF0aW9uTmFtZX0sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIC8vIGlmIGl0J3MgZnJvbSBhbiBvcmdhbml6YXRpb24gVVJMLCBjaGVjayBpdCBleGlzdHNcbiAgICBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICAgICk7XG4gICAgICAvLyByZXR1cm5zIG9yZ2FuaXphdGlvbiBub3QgZm91bmRcbiAgICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgfVxuICAgIC8vIG5vdyBjaGVjayBzY2hlbWEgZXhpc3RzXG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgc2NoZW1hTmFtZVxuICAgICk7XG4gICAgLy8gcmV0dXJucyBzY2hlbWEgbm90IGZvdW5kXG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICAvLyBub3cgaWYgaXQncyBmcm9tIGFuIG9yZ2FuaXphdGlvbiBVUkwsIGNoZWNrIGZvciBjb3JyZWN0IG93bmVyXG4gICAgaWYgKG9yZ2FuaXphdGlvbk5hbWUgJiYgb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGlmIChcbiAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQub3JnYW5pemF0aW9uX293bmVyX2lkICE9XG4gICAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkLmlkXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1NDSEVNQV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtcbiAgICAgICAgICAgIGAke3NjaGVtYU5hbWV9IG5vdCBmb3VuZCBmb3Igb3JnYW5pemF0aW9uIG93bmVyICR7b3JnYW5pemF0aW9uTmFtZX0uYCxcbiAgICAgICAgICBdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFtzY2hlbWFOYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVTY2hlbWFzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgYWNjZXNzaWJsZVNjaGVtYXMoJHtjVS5pZH0sJHt3aXRoU2V0dGluZ3N9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvLyBJZiBvcmdhbml6YXRpb25Pd25lciBvcmdhbml6YXRpb24gYWRtaW5zIGFyZSBpbXBsaWNpdGx5IGdyYW50ZWQgc2NoZW1hIGFkbWluIHJvbGVzXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBvcmdhbml6YXRpb25Pd25lck5hbWU/OiBzdHJpbmcsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVyRW1haWw/OiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWRkT3JDcmVhdGVTY2hlbWEoJHtjVS5pZH0sJHtuYW1lfSwke2xhYmVsfSwke29yZ2FuaXphdGlvbk93bmVySWR9LCR7b3JnYW5pemF0aW9uT3duZXJOYW1lfSwke3VzZXJPd25lcklkfSwke3VzZXJPd25lckVtYWlsfSwke2NyZWF0ZX0pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgLy8gcnVuIGNoZWNrcyBmb3Igb3JnYW5pemF0aW9uIG93bmVyXG4gICAgaWYgKG9yZ2FuaXphdGlvbk93bmVySWQgfHwgb3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICBpZiAoIW9yZ2FuaXphdGlvbk93bmVySWQgJiYgb3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBvcmdhbml6YXRpb25Pd25lck5hbWUpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgJiZcbiAgICAgICAgKGF3YWl0IGNVLmNhbnQoXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk93bmVySWQpKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9JTl9PUkdcIixcbiAgICAgICAgICB2YWx1ZXM6IFtjVS50b1N0cmluZygpLCBvcmdhbml6YXRpb25Pd25lcklkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodXNlck93bmVyRW1haWwpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwoY1UsIHVzZXJPd25lckVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB1c2VyT3duZXJJZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgIH0gZWxzZSBpZiAoIXVzZXJPd25lcklkKSB7XG4gICAgICB1c2VyT3duZXJJZCA9IGNVLmlkO1xuICAgIH1cbiAgICBpZiAobmFtZS5zdGFydHNXaXRoKFwicGdfXCIpIHx8IFNjaGVtYS5TWVNfU0NIRU1BX05BTUVTLmluY2x1ZGVzKG5hbWUpKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX0JBRF9TQ0hFTUFfTkFNRVwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBuYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05BTUVfRVhJU1RTXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRPckNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWUsXG4gICAgICBsYWJlbCxcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQsXG4gICAgICB1c2VyT3duZXJJZCxcbiAgICAgIGNyZWF0ZVxuICAgICk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBpZiAob3JnYW5pemF0aW9uT3duZXJJZCkge1xuICAgICAgLy8gSWYgb3duZXIgaXMgYW4gb3JnYW5pemF0aW9uIGFuZCBjdXJyZW50IHVzZXIgaXMgbm90IGFuIGFkbWluIG9mIHRoZSBvcmdhbml6YXRpb25cbiAgICAgIC8vIGFkZCB0aGUgdXNlciBhcyBhIHNjaGVtYSBhZG1pbiBzbyB0aGV5IGRvbnQgbG9zZSBhY2Nlc3NcbiAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWRtaW5pc3Rlcl9vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uT3duZXJJZCkpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgICAgW2NVLmlkXSxcbiAgICAgICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIC8vIEV2ZXJ5IG9yZ2FuaXphdGlvbiBhZG1pbiBpcyBpbXBsaWNpdGx5IGFsc28gYSBzY2hlbWEgYWRtaW5cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICAgICAgb3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsLCBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCksXG4gICAgICAgIFtzY2hlbWFSZXN1bHQucGF5bG9hZC5pZF1cbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIElmIG93bmVyIGlzIGEgdXNlciwgYWRkIHRoZW0gdG8gc2NoZW1hX3VzZXJzIHRvIHNhdmUgc2V0dGluZ3NcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgW2NVLmlkXSxcbiAgICAgICAgXCJzY2hlbWFfb3duZXJcIixcbiAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGByZW1vdmVPckRlbGV0ZVNjaGVtYSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7ZGVsfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlVGFibGUoY1UsIHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUsIGRlbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVBbGxVc2Vyc0Zyb21TY2hlbWEoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwucmVtb3ZlT3JEZWxldGVTY2hlbWEoc2NoZW1hTmFtZSwgZGVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVTY2hlbWEoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBuZXdTY2hlbWFOYW1lPzogc3RyaW5nLFxuICAgIG5ld1NjaGVtYUxhYmVsPzogc3RyaW5nLFxuICAgIG5ld09yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZyxcbiAgICBuZXdPcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyLFxuICAgIG5ld1VzZXJPd25lckVtYWlsPzogc3RyaW5nLFxuICAgIG5ld1VzZXJPd25lcklkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB1cGRhdGVTY2hlbWEoJHtjVS5pZH0sJHtuYW1lfSwke25ld1NjaGVtYU5hbWV9LCR7bmV3U2NoZW1hTGFiZWx9LCR7bmV3T3JnYW5pemF0aW9uT3duZXJOYW1lfSwke25ld09yZ2FuaXphdGlvbk93bmVySWR9LCR7bmV3VXNlck93bmVyRW1haWx9LCR7bmV3VXNlck93bmVySWR9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfc2NoZW1hXCIsIG5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgbmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBsZXQgc2NoZW1hVGFibGVzID0gW107XG4gICAgaWYgKG5ld1NjaGVtYU5hbWUpIHtcbiAgICAgIGlmIChcbiAgICAgICAgbmV3U2NoZW1hTmFtZS5zdGFydHNXaXRoKFwicGdfXCIpIHx8XG4gICAgICAgIFNjaGVtYS5TWVNfU0NIRU1BX05BTUVTLmluY2x1ZGVzKG5ld1NjaGVtYU5hbWUpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9CQURfU0NIRU1BX05BTUVcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoY1UsIG5ld1NjaGVtYU5hbWUpO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTkFNRV9FWElTVFNcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVzKGNVLCBuYW1lLCBmYWxzZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgc2NoZW1hVGFibGVzID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHNjaGVtYVRhYmxlcykge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGUpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV3T3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShjVSwgbmV3T3JnYW5pemF0aW9uT3duZXJOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBuZXdPcmdhbml6YXRpb25Pd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgfVxuICAgIGlmIChuZXdVc2VyT3duZXJFbWFpbCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChjVSwgbmV3VXNlck93bmVyRW1haWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIG5ld1VzZXJPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgfVxuICAgIC8vIFRCRCBjaGVja3Mgc28gdXNlciBkb2Vzbid0IGxvc2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCB1cGRhdGVkU2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlU2NoZW1hKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQsXG4gICAgICBuZXdTY2hlbWFOYW1lLFxuICAgICAgbmV3U2NoZW1hTGFiZWwsXG4gICAgICBuZXdPcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgbmV3VXNlck93bmVySWRcbiAgICApO1xuICAgIGlmICghdXBkYXRlZFNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXBkYXRlZFNjaGVtYVJlc3VsdDtcbiAgICBpZiAobmV3U2NoZW1hTmFtZSkge1xuICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiBzY2hlbWFUYWJsZXMpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXdPcmdhbml6YXRpb25Pd25lcklkIHx8IG5ld1VzZXJPd25lcklkKSB7XG4gICAgICAvLyBpZiB0aGUgb2xkIHNjaGVtYSB3YXMgb3duZWQgYnkgYW4gb3JnXG4gICAgICBpZiAoc2NoZW1hUmVzdWx0LnBheWxvYWQub3JnYW5pemF0aW9uX293bmVyX2lkKSB7XG4gICAgICAgIC8vIENsZWFyIG9sZCBpbXBsaWVkIGFkbWluc1xuICAgICAgICBjb25zdCBpbXBsaWVkQWRtaW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFVc2VycyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICB1cGRhdGVkU2NoZW1hUmVzdWx0LnBheWxvYWQubmFtZSxcbiAgICAgICAgICBbXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiXG4gICAgICAgICk7XG4gICAgICAgIGlmICghaW1wbGllZEFkbWluc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gaW1wbGllZEFkbWluc1Jlc3VsdDtcbiAgICAgICAgY29uc3Qgb2xkSW1wbGllZEFkbWluVXNlcklkcyA9IGltcGxpZWRBZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICAgKHNjaGVtYVVzZXI6IHsgdXNlcl9pZDogbnVtYmVyIH0pID0+IHNjaGVtYVVzZXIudXNlcl9pZFxuICAgICAgICApO1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgb2xkSW1wbGllZEFkbWluVXNlcklkcyxcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZFxuICAgICAgICApO1xuICAgICAgICAvLyBvdGhlcndpc2Ugb2xkIHNjaGVtYSB3YXMgb3duZWQgYnkgdXNlclxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIFtzY2hlbWFSZXN1bHQucGF5bG9hZC51c2VyX293bmVyX2lkXSxcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGlmIChuZXdPcmdhbml6YXRpb25Pd25lcklkKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9yZ2FuaXphdGlvbiBhZG1pbiBpcyBpbXBsaWNpdGx5IGFsc28gYSBzY2hlbWEgYWRtaW5cbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICAgIG5ld09yZ2FuaXphdGlvbk93bmVySWQsXG4gICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsLCBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCksXG4gICAgICAgICAgW3NjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChuZXdVc2VyT3duZXJJZCkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgICBbbmV3VXNlck93bmVySWRdLFxuICAgICAgICAgIFwic2NoZW1hX293bmVyXCIsXG4gICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWRcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiB1cGRhdGVkU2NoZW1hUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFzc2lnbkRlbW9TY2hlbWEodXNlcklkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwubmV4dFVuYXNzaWduZWREZW1vU2NoZW1hKFxuICAgICAgYCR7ZW52aXJvbm1lbnQuZGVtb0RCUHJlZml4fSVgXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hKFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIHJlc3VsdC5wYXlsb2FkLm5hbWUsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1c2VySWRcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICBbVXNlci5TWVNfQURNSU5fSURdLFxuICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICByZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkTmV4dERlbW9TY2hlbWEoY1U6IEN1cnJlbnRVc2VyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhZGROZXh0RGVtb1NjaGVtYSgke2NVLmlkfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzKFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgYCR7ZW52aXJvbm1lbnQuZGVtb0RCUHJlZml4fSVgLFxuICAgICAgXCJuYW1lIGRlc2NcIixcbiAgICAgIDEsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggIT09IDEpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBgYWRkTmV4dERlbW9TY2hlbWE6IGNhbiBub3QgZmluZCBkZW1vIERCIG1hdGNoaW5nICR7ZW52aXJvbm1lbnQuZGVtb0RCUHJlZml4fSVgLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3Qgc3BsaXQgPSByZXN1bHQucGF5bG9hZFswXS5uYW1lLnNwbGl0KFwiX2RlbW9cIik7XG4gICAgY29uc3QgbGFzdERlbW9OdW1iZXIgPSBwYXJzZUludChzcGxpdFsxXSk7XG4gICAgY29uc3Qgc2NoZW1hTmFtZSA9IGAke2Vudmlyb25tZW50LmRlbW9EQlByZWZpeH0ke2xhc3REZW1vTnVtYmVyICsgMX1gO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVTY2hlbWEoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICBlbnZpcm9ubWVudC5kZW1vREJMYWJlbCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIGNVLmlkXG4gICAgKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkQWxsRXhpc3RpbmdUYWJsZXMoY1UsIHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICByb2xlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgaW1wbGllZEZyb21Sb2xlTmFtZT86IHN0cmluZyxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzY2hlbWFVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7cm9sZU5hbWVzfSwke3VzZXJFbWFpbHN9LCR7aW1wbGllZEZyb21Sb2xlTmFtZX0sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgaWYgKHJvbGVOYW1lcyAmJiAhUm9sZS5hcmVSb2xlcyhyb2xlTmFtZXMpKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogXCJzY2hlbWFVc2Vyczogcm9sZXMgY29udGFpbnMgb25lIG9yIG1vcmUgdW5yZWNvZ25pemVkIHN0cmluZ3NcIixcbiAgICAgICAgdmFsdWVzOiByb2xlTmFtZXMsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICAgIGlmICh1c2VySWRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgbGV0IGltcGxpZWRGcm9tUm9sZUlkOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgaWYgKGltcGxpZWRGcm9tUm9sZU5hbWUpIHtcbiAgICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUoY1UsIGltcGxpZWRGcm9tUm9sZU5hbWUpO1xuICAgICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgICAgaW1wbGllZEZyb21Sb2xlSWQgPSByb2xlUmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFVc2VycyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICByb2xlTmFtZXMsXG4gICAgICB1c2VySWRzLFxuICAgICAgaW1wbGllZEZyb21Sb2xlSWQsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFNjaGVtYVVzZXJzUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IHN0cmluZ1tdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldFNjaGVtYVVzZXJzUm9sZSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dXNlckVtYWlsc30sJHtyb2xlTmFtZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgaWYgKHVzZXJzUmVzdWx0LnBheWxvYWQubGVuZ3RoICE9IHVzZXJFbWFpbHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IHVzZXJFbWFpbHMuZmlsdGVyKFxuICAgICAgICAgICh4OiBzdHJpbmcpID0+ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkLmluY2x1ZGVzKHgpXG4gICAgICAgICksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgcm9sZU5hbWUsXG4gICAgICBcInNjaGVtYVwiLFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVNjaGVtYVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGByZW1vdmVTY2hlbWFVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dXNlckVtYWlsc30pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgY29uc3QgdXNlcklkczogbnVtYmVyW10gPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICk7XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoY1UsIHNjaGVtYU5hbWUpO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgLy8gY2FuJ3QgcmVtb3ZlIHNjaGVtYSB1c2VyIG93bmVyXG4gICAgaWYgKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZCAmJlxuICAgICAgdXNlcklkcy5pbmNsdWRlcyhzY2hlbWFSZXN1bHQucGF5bG9hZC51c2VyX293bmVyX2lkKVxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfVVNFUl9PV05FUlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgLy8gY2FuJ3QgcmVtb3ZlIGFsbCBhZG1pbnMgKG11c3QgYmUgYXRsZWFzdCBvbmUpXG4gICAgY29uc3QgYWRtaW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFVc2VycyhjVSwgc2NoZW1hTmFtZSwgW1xuICAgICAgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiLFxuICAgIF0pO1xuICAgIGlmICghYWRtaW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBhZG1pbnNSZXN1bHQ7XG4gICAgY29uc3Qgc2NoZW1hQWRtaW5JZHM6IG51bWJlcltdID0gYWRtaW5zUmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkXG4gICAgKTtcbiAgICBpZiAoXG4gICAgICB1c2VySWRzLmZpbHRlcigodXNlcklkKSA9PiBzY2hlbWFBZG1pbklkcy5pbmNsdWRlcyh1c2VySWQpKS5sZW5ndGggPT1cbiAgICAgIHNjaGVtYUFkbWluSWRzLmxlbmd0aFxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTk9fQURNSU5TXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHMsXG4gICAgICBcInNjaGVtYVwiLFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoJHtjVS5pZH0sJHtvcmdhbml6YXRpb25OYW1lfSwke3NldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB0YWJsZXMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3dpdGhDb2x1bW5zfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAod2l0aENvbHVtbnMpIHtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnNSZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHRhYmxlLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVRhYmxlQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgd2l0aENvbHVtbnM/OiBib29sZWFuLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGFjY2Vzc2libGVUYWJsZUJ5TmFtZSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3dpdGhDb2x1bW5zfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXNCeVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBbdGFibGVOYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAod2l0aENvbHVtbnMpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHJlc3VsdC5wYXlsb2FkLm5hbWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFjb2x1bW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjb2x1bW5zUmVzdWx0O1xuICAgICAgICByZXN1bHQucGF5bG9hZC5jb2x1bW5zID0gY29sdW1uc1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVUYWJsZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW4sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWNjZXNzaWJsZVRhYmxlcygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7d2l0aENvbHVtbnN9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzQnlVc2VycyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgICBpZiAod2l0aENvbHVtbnMpIHtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnNSZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHRhYmxlLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhZGRPckNyZWF0ZVRhYmxlKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7dGFibGVMYWJlbH0sJHtjcmVhdGV9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGlmICghY3JlYXRlKSBjcmVhdGUgPSBmYWxzZTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgdGFibGVMYWJlbCxcbiAgICAgIGNyZWF0ZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKFxuICAgICAgY1UsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLnNjaGVtYU5hbWUgPSBzY2hlbWFOYW1lO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gdGFibGVSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJlbW92ZU9yRGVsZXRlVGFibGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtkZWx9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgLy8gMS4gcmVtb3ZlL2RlbGV0ZSBjb2x1bW5zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBjVSxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgZGVsLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyAzLiByZW1vdmUgdXNlciBzZXR0aW5nc1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFRhYmxlVXNlcnModGFibGVSZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZCxcbiAgICAgIHRydWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgLy8gNC4gcmVtb3ZlL2RlbGV0ZSB0aGUgdGFibGVcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwucmVtb3ZlT3JEZWxldGVUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGRlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGFibGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBuZXdUYWJsZU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3VGFibGVMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgdXBkYXRlVGFibGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtuZXdUYWJsZU5hbWV9LCR7bmV3VGFibGVMYWJlbH0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlcyhjVSwgc2NoZW1hTmFtZSwgZmFsc2UpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nVGFibGVOYW1lcy5pbmNsdWRlcyhuZXdUYWJsZU5hbWUpKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfVEFCTEVfTkFNRV9FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgdXBkYXRlZFRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVMYWJlbFxuICAgICk7XG4gICAgaWYgKCF1cGRhdGVkVGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVwZGF0ZWRUYWJsZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgICAgIGNVLFxuICAgICAgICB1cGRhdGVkVGFibGVSZXN1bHQucGF5bG9hZFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiB1cGRhdGVkVGFibGVSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkQWxsRXhpc3RpbmdUYWJsZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGFkZEFsbEV4aXN0aW5nVGFibGVzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl9zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRpc2NvdmVyVGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgdGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHRhYmxlTmFtZXMpIHtcbiAgICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgICBjVSxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB2LnRpdGxlQ2FzZSh0YWJsZU5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCIgXCIpKSxcbiAgICAgICAgZmFsc2VcbiAgICAgICk7XG4gICAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlckNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBjb2x1bW5zID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgICAgdi50aXRsZUNhc2UoY29sdW1uLm5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCIgXCIpKSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICByZW1vdmU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7cmVtb3ZlfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgXCIlXCIsXG4gICAgICBcIiVcIixcbiAgICAgIFwiQUxMXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcmVsYXRpb25zaGlwczogQ29uc3RyYWludElkW10gPSByZXN1bHQucGF5bG9hZDtcbiAgICBpZiAocmVsYXRpb25zaGlwcy5sZW5ndGggPiAwKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlbGF0aW9uc2hpcCBvZiByZWxhdGlvbnNoaXBzKSB7XG4gICAgICAgIGlmIChyZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lICYmIHJlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lKSB7XG4gICAgICAgICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICAgICAgICBpZiAocmVtb3ZlKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgICAgICAgY1UsXG4gICAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC50YWJsZU5hbWUsXG4gICAgICAgICAgICAgIFtyZWxhdGlvbnNoaXAuY29sdW1uTmFtZV0sXG4gICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5yZWxDb2x1bW5OYW1lXVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICAgIFwiYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHM6IENvbnN0cmFpbnRJZCBtdXN0IGhhdmUgcmVsVGFibGVOYW1lIGFuZCByZWxDb2x1bW5OYW1lXCIsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucygke2NVLmlkfSwke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZS5pZCkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgLy8gZG9udCBhZGQgcGVybWlzc2lvbnMgZm9yIHRhYmxlcyB3aXRoIG5vIGNvbHVtbnNcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICk7XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlIG9mIFJvbGUuaGFzdXJhVGFibGVQZXJtaXNzaW9uQ2hlY2tzQW5kVHlwZXMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlLnBlcm1pc3Npb25DaGVjayxcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrQW5kVHlwZS5wZXJtaXNzaW9uVHlwZSxcbiAgICAgICAgXCJ3YnVzZXJcIixcbiAgICAgICAgY29sdW1uTmFtZXNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKCR7Y1UuaWR9LCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlLmlkKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgLy8gSWYgdGhpcyB0YWJsZSBubyBsb25nZXIgaGFzIGFueSBjb2x1bW5zLCB0aGVyZSB3aWxsIGJlIG5vIHBlcm1pc3Npb25zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgdGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHBheWxvYWQ6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25LZXlBbmRUeXBlIG9mIFJvbGUudGFibGVQZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnMoXG4gICAgICB0YWJsZS5pZFxuICAgICkpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5kZWxldGVQZXJtaXNzaW9uKFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lLFxuICAgICAgICBwZXJtaXNzaW9uS2V5QW5kVHlwZS5hY3Rpb24sXG4gICAgICAgIFwid2J1c2VyXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gUGFzcyBlbXB0eSBjb2x1bW5OYW1lc1tdIHRvIGNsZWFyXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgY3JlYXRlT3JEZWxldGVQcmltYXJ5S2V5KCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZXN9LCR7ZGVsfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5wcmltYXJ5S2V5cyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgZXhpc3RpbmdDb25zdHJhaW50TmFtZXMgPSBPYmplY3QudmFsdWVzKHJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBtdWx0aXBsZSBjb3VsbW4gcHJpbWFyeSBrZXlzIHdpbGwgYWxsIGhhdmUgc2FtZSBjb25zdHJhaW50IG5hbWVcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlQ29uc3RyYWludChcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICBleGlzdGluZ0NvbnN0cmFpbnROYW1lc1swXSBhcyBzdHJpbmdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGV4aXN0aW5nQ29uc3RyYWludE5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9QS19FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlUHJpbWFyeUtleShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lc1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGFkZE9yQ3JlYXRlRm9yZWlnbktleSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30sJHtjcmVhdGV9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgb3BlcmF0aW9uOiBzdHJpbmcgPSBcIkNSRUFURVwiO1xuICAgIGlmICghY3JlYXRlKSBvcGVyYXRpb24gPSBcIkFERFwiO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldEZvcmVpZ25LZXkoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lcyxcbiAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZXN9LCR7cGFyZW50VGFibGVOYW1lfSwke2RlbH0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiREVMRVRFXCI7XG4gICAgaWYgKCFkZWwpIG9wZXJhdGlvbiA9IFwiUkVNT1ZFXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgW10sXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gb3BlcmF0aW9uID0gXCJBRER8Q1JFQVRFfFJFTU9WRXxERUxFVEVcIlxuICBwdWJsaWMgYXN5bmMgc2V0Rm9yZWlnbktleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldEZvcmVpZ25LZXkoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtwYXJlbnRUYWJsZU5hbWV9LCR7cGFyZW50Q29sdW1uTmFtZXN9LCR7b3BlcmF0aW9ufSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzWzBdLFxuICAgICAgXCJGT1JFSUdOX0tFWVNcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0ZvcmVpZ25LZXlzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgZm9yIChjb25zdCBjb25zdHJhaW50SWQgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29uc3RyYWludElkLmNvbHVtbk5hbWVdID1cbiAgICAgICAgY29uc3RyYWludElkLmNvbnN0cmFpbnROYW1lO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nRm9yZWlnbktleXMpLmluY2x1ZGVzKGNvbHVtbk5hbWUpKSB7XG4gICAgICAgIGlmIChvcGVyYXRpb24gPT0gXCJSRU1PVkVcIiB8fCBvcGVyYXRpb24gPT0gXCJERUxFVEVcIikge1xuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5kcm9wUmVsYXRpb25zaGlwcyhcbiAgICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICBwYXJlbnRUYWJsZU5hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiBvcGVyYXRpb24gPT0gXCJERUxFVEVcIikge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlQ29uc3RyYWludChcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgICAgICBleGlzdGluZ0ZvcmVpZ25LZXlzW2NvbHVtbk5hbWVdIGFzIHN0cmluZ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSBlbHNlIGlmIChvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgd2JDb2RlOiBcIldCX0ZLX0VYSVNUU1wiLFxuICAgICAgICAgICAgdmFsdWVzOiBbY29sdW1uTmFtZV0sXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAob3BlcmF0aW9uID09IFwiQUREXCIgfHwgb3BlcmF0aW9uID09IFwiQ1JFQVRFXCIpIHtcbiAgICAgIGlmIChvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgICBwYXJlbnRDb2x1bW5OYW1lc1xuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcChcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lc1swXSwgLy8gYXV0aG9yX2lkXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSAvLyBhdXRob3JzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5jcmVhdGVBcnJheVJlbGF0aW9uc2hpcChcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICAgIHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgY29sdW1uTmFtZXMgLy8gYXV0aG9yX2lkXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB0cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKCR7Y1UuaWR9LCAke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZS5pZCkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUodGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhjVSwgdGFibGUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB1bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtjVS5pZH0sICR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlLmlkKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKGNVLCB0YWJsZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudW50cmFja1RhYmxlKHRhYmxlLnNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2Vycz09PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHRhYmxlVXNlcnMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHt1c2VyRW1haWxzfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRhYmxlVXNlcnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VySWRzLCB3aXRoU2V0dGluZ3MpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZERlZmF1bHRUYWJsZVVzZXJzVG9UYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU6IFRhYmxlXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICB0YWJsZS5zY2hlbWFJZCxcbiAgICAgIFJvbGUuc3lzUm9sZU1hcChcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCwgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbCksXG4gICAgICBbdGFibGUuaWRdXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRUYWJsZVVzZXJzUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IFtzdHJpbmddLFxuICAgIHJvbGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNldFRhYmxlVXNlcnNSb2xlKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7dXNlckVtYWlsc30sJHtyb2xlTmFtZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgaWYgKHVzZXJzUmVzdWx0LnBheWxvYWQubGVuZ3RoICE9IHVzZXJFbWFpbHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IHVzZXJFbWFpbHMuZmlsdGVyKFxuICAgICAgICAgICh4OiBzdHJpbmcpID0+ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkLmluY2x1ZGVzKHgpXG4gICAgICAgICksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgcm9sZU5hbWUsXG4gICAgICBcInRhYmxlXCIsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVUYWJsZVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJlbW92ZVRhYmxlVXNlcnMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHt1c2VyRW1haWxzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgY29uc3QgdXNlcklkczogbnVtYmVyW10gPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICk7XG4gICAgLy8gY2FuJ3QgcmVtb3ZlIHNjaGVtYSBhZG1pbmlzdHJhdG9ycyBmcm9tIGluZGl2aWR1YWwgdGFibGVzXG4gICAgLy8gcmVtb3ZlIHRoZW0gZnJvbSB0aGUgd2hvbGUgc2NoZW1hIG9ubHlcbiAgICBjb25zdCBhZG1pbnNSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYVVzZXJzKGNVLCBzY2hlbWFOYW1lLCBbXG4gICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSk7XG4gICAgaWYgKCFhZG1pbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGFkbWluc1Jlc3VsdDtcbiAgICBjb25zdCBzY2hlbWFBZG1pbklkczogbnVtYmVyW10gPSBhZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICApO1xuICAgIGlmIChcbiAgICAgIHVzZXJJZHMuZmlsdGVyKCh1c2VySWQpID0+IHNjaGVtYUFkbWluSWRzLmluY2x1ZGVzKHVzZXJJZCkpLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX0FETUlOXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkcyxcbiAgICAgIFwidGFibGVcIixcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2F2ZVRhYmxlVXNlclNldHRpbmdzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7c2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIGNVLmlkLFxuICAgICAgc2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gQ29sdW1ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBjb2x1bW5zKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwicmVhZF90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5wcmltYXJ5S2V5cyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBwS0NvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKHBLQ29sc0NvbnN0cmFpbnRzKTtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgY29sdW1uLmlzUHJpbWFyeUtleSA9IHBLQ29sdW1uTmFtZXMuaW5jbHVkZXMoY29sdW1uLm5hbWUpO1xuICAgICAgY29uc3QgZm9yZWlnbktleXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgXCJGT1JFSUdOX0tFWVNcIlxuICAgICAgKTtcbiAgICAgIGlmICghZm9yZWlnbktleXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbHVtbi5mb3JlaWduS2V5cyA9IGZvcmVpZ25LZXlzUmVzdWx0LnBheWxvYWQ7XG4gICAgICBjb25zdCByZWZlcmVuY2VzUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIFwiUkVGRVJFTkNFU1wiXG4gICAgICApO1xuICAgICAgaWYgKCFyZWZlcmVuY2VzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb2x1bW4ucmVmZXJlbmNlZEJ5ID0gcmVmZXJlbmNlc1Jlc3VsdC5wYXlsb2FkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbkxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhbixcbiAgICBjb2x1bW5UeXBlPzogc3RyaW5nLFxuICAgIHNraXBUcmFja2luZz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGFkZE9yQ3JlYXRlQ29sdW1uKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZX0sJHtjb2x1bW5MYWJlbH0sJHtjcmVhdGV9LCR7Y29sdW1uVHlwZX0sJHtza2lwVHJhY2tpbmd9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWNyZWF0ZSkgY3JlYXRlID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IGNvbHVtblJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBjb2x1bW5MYWJlbCxcbiAgICAgIGNyZWF0ZSxcbiAgICAgIGNvbHVtblR5cGVcbiAgICApO1xuICAgIGlmIChjb2x1bW5SZXN1bHQuc3VjY2VzcyAmJiAhc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIGNvbHVtblJlc3VsdDtcbiAgfVxuXG4gIC8vIE11c3QgZW50ZXIgYW5kIGV4aXQgd2l0aCB0cmFja2VkIHRhYmxlLCByZWdhcmRsZXNzIG9mIGlmIHRoZXJlIGFyZSBjb2x1bW5zXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBkZWw/OiBib29sZWFuLFxuICAgIHNraXBUcmFja2luZz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJlbW92ZU9yRGVsZXRlQ29sdW1uKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZX0sJHtkZWx9LCR7c2tpcFRyYWNraW5nfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCFkZWwpIGRlbCA9IGZhbHNlO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmICghc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgZGVsXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVDb2x1bW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB1cGRhdGVDb2x1bW4oJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke25ld0NvbHVtbk5hbWV9LCR7bmV3Q29sdW1uTGFiZWx9LCR7bmV3VHlwZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIC8vIFRCRDogaWYgdGhpcyBpcyBhIGZrXG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdDb2x1bW5OYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nQ29sdW1uTmFtZXMuaW5jbHVkZXMobmV3Q29sdW1uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9DT0xVTU5fTkFNRV9FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdUeXBlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgIG5ld1R5cGVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JSZW1vdmVDb2x1bW5TZXF1ZW5jZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXh0U2VxTnVtYmVyPzogbnVtYmVyLFxuICAgIHJlbW92ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYSA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoY1UsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCB0YWJsZSA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbkJ5U2NoZW1hTmFtZVRhYmxlTmFtZUNvbHVtbk5hbWUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBjb2x1bW4gPSByZXN1bHQucGF5bG9hZDtcblxuICAgIGlmIChyZW1vdmUpIHtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkU2VxdWVuY2VUb0NvbHVtbihcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICB0YWJsZSxcbiAgICAgICAgY29sdW1uLFxuICAgICAgICBuZXh0U2VxTnVtYmVyXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVXRpbCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1dGlsKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBmbjogc3RyaW5nLFxuICAgIHZhbHM6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHV0aWwoJHtjVS5pZH0sJHtmbn0sJHtKU09OLnN0cmluZ2lmeSh2YWxzKX0pYCk7XG4gICAgLy8gZGVmZXIgYWNjZXNzIGNvbnRyb2wgdG8gY2FsbGVkIG1ldGhvZHNcbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgc3dpdGNoIChmbikge1xuICAgICAgY2FzZSBcImFkZE5leHREZW1vU2NoZW1hXCI6XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkTmV4dERlbW9TY2hlbWEoY1UpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJyZXNldFRlc3REYXRhXCI6XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVzZXRUZXN0RGF0YShjVSk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGVzdCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKGNVOiBDdXJyZW50VXNlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgcmVzZXRUZXN0RGF0YSgpYCk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpICYmIGNVLmlzbnRUZXN0VXNlcigpKSB7XG4gICAgICByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW5PclRlc3RVc2VyKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXMoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgXCJ0ZXN0XyVcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgc2NoZW1hLm5hbWUsXG4gICAgICAgIHRydWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCkpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVUZXN0VXNlcnMoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG5cbi8qKlxuICogPT09PT09PT09PSBFcnJvciBIYW5kbGluZyA9PT09PT09PT09XG4gKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGVyclJlc3VsdChyZXN1bHQ/OiBTZXJ2aWNlUmVzdWx0KTogU2VydmljZVJlc3VsdCB7XG4gIGlmICghcmVzdWx0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJSZXN1bHQgaGFzIG5vdCBiZWVuIGFzc2lnbmVkXCIsXG4gICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICB9XG4gIGlmIChyZXN1bHQuc3VjY2VzcyA9PSB0cnVlKSB7XG4gICAgcmVzdWx0ID0ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIldoaXRlYnJpY2tDbG91ZCBlcnJSZXN1bHQ6IHJlc3VsdCBpcyBub3QgYW4gZXJyb3IgKHN1Y2Nlc3M9PXRydWUpXCIsXG4gICAgfTtcbiAgfSBlbHNlIGlmICghKFwic3VjY2Vzc1wiIGluIHJlc3VsdCkpIHtcbiAgICByZXN1bHQuc3VjY2VzcyA9IGZhbHNlO1xuICB9XG4gIGlmICghcmVzdWx0Lm1lc3NhZ2UgJiYgcmVzdWx0LndiQ29kZSkge1xuICAgIHJlc3VsdC5tZXNzYWdlID0gVVNFUl9NRVNTQUdFU1tyZXN1bHQud2JDb2RlXVswXTtcbiAgICBpZiAoIXJlc3VsdC5tZXNzYWdlKSB7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBgV2hpdGVicmlja0Nsb3VkIGVyclJlc3VsdDogQ291bGQgbm90IGZpbmQgbWVzc2FnZSBmb3Igd2JDb2RlPSR7cmVzdWx0LndiQ29kZX1gLFxuICAgICAgfTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlc3VsdC52YWx1ZXMpIHtcbiAgICByZXN1bHQubWVzc2FnZSA9IGAke3Jlc3VsdC5tZXNzYWdlfSBWYWx1ZXM6ICR7cmVzdWx0LnZhbHVlcy5qb2luKFwiLCBcIil9YDtcbiAgICBkZWxldGUgcmVzdWx0LnZhbHVlcztcbiAgfVxuICBpZiAoXG4gICAgIXJlc3VsdC5hcG9sbG9FcnJvckNvZGUgJiZcbiAgICByZXN1bHQud2JDb2RlICYmXG4gICAgT2JqZWN0LmtleXMoVVNFUl9NRVNTQUdFUykuaW5jbHVkZXMocmVzdWx0LndiQ29kZSkgJiZcbiAgICBVU0VSX01FU1NBR0VTW3Jlc3VsdC53YkNvZGVdLmxlbmd0aCA9PSAyXG4gICkge1xuICAgIHJlc3VsdC5hcG9sbG9FcnJvckNvZGUgPSBVU0VSX01FU1NBR0VTW3Jlc3VsdC53YkNvZGVdWzFdO1xuICB9IGVsc2UgaWYgKFxuICAgICFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlICYmXG4gICAgcmVzdWx0LndiQ29kZSAmJlxuICAgICFPYmplY3Qua2V5cyhVU0VSX01FU1NBR0VTKS5pbmNsdWRlcyhyZXN1bHQud2JDb2RlKVxuICApIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IGBXaGl0ZWJyaWNrQ2xvdWQgZXJyOiBDb3VsZCBub3QgZmluZCBhcG9sbG9FcnJvckNvZGUgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKCFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCI7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwb2xsb0VycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gIHJlc3VsdCA9IGVyclJlc3VsdChyZXN1bHQpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKFxuICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQuZXJyOiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiXG4gICAgKTtcbiAgfVxuICBjb25zdCBkZXRhaWxzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGlmICghcmVzdWx0Lm1lc3NhZ2UpIHJlc3VsdC5tZXNzYWdlID0gXCJVbmtub3duIGVycm9yLlwiO1xuICBpZiAocmVzdWx0LnJlZkNvZGUpIGRldGFpbHMucmVmQ29kZSA9IHJlc3VsdC5yZWZDb2RlO1xuICBpZiAocmVzdWx0LndiQ29kZSkgZGV0YWlscy53YkNvZGUgPSByZXN1bHQud2JDb2RlO1xuICByZXR1cm4gbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCByZXN1bHQuYXBvbGxvRXJyb3JDb2RlLCBkZXRhaWxzKTtcbn1cblxuZXhwb3J0IGNvbnN0IGJnSGFuZGxlciA9IGFzeW5jIChldmVudDogYW55ID0ge30pOiBQcm9taXNlPGFueT4gPT4ge1xuICBsb2cuaW5mbyhcIj09IGJnSGFuZGxlciA9PVxcbkNhbGwgYXN5bmMgZXZlbnQgaGVyZS4uLlwiKTtcbiAgLy8gQ2FuIGJlIHVzZWQgdG8gY2FsbCBhc3luYyBldmVudHMgd2l0aG91dCB3YWl0aW5nIGZvciByZXR1cm4sIGVnIGZyb20gZWxzZXdoZXJlOlxuICAvLyBpbXBvcnQgTGFtYmRhIGZyb20gXCJhd3Mtc2RrL2NsaWVudHMvbGFtYmRhXCI7XG4gIC8vIGltcG9ydCBBV1MgZnJvbSBcImF3cy1zZGtcIjtcbiAgLy8gY29uc3QgbGFtYmRhID0gbmV3IExhbWJkYSh7XG4gIC8vICAgZW5kcG9pbnQ6IG5ldyBBV1MuRW5kcG9pbnQoXCJodHRwOi8vbG9jYWxob3N0OjMwMDBcIiksXG4gIC8vIH0pO1xuICAvLyBjb25zdCBwYXJhbXMgPSB7XG4gIC8vICAgRnVuY3Rpb25OYW1lOiBcIndoaXRlYnJpY2stY2xvdWQtZGV2LWJnXCIsXG4gIC8vICAgSW52b2NhdGlvblR5cGU6IFwiRXZlbnRcIixcbiAgLy8gICBQYXlsb2FkOiBKU09OLnN0cmluZ2lmeSh7IGhlbGxvOiBcIldvcmxkXCIgfSksXG4gIC8vIH07XG4gIC8vIGNvbnN0IHIgPSBhd2FpdCBsYW1iZGEuaW52b2tlKHBhcmFtcykucHJvbWlzZSgpO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10b29sc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10eXBlLWpzb25cIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImxvZGFzaFwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ2b2NhXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2hpdGVicmljay1jbG91ZC50c1wiKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBZUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7O0FBRUE7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOzs7QUFHQTtBQUNBOzs7Ozs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBOzs7Ozs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQVFBOzs7Ozs7Ozs7Ozs7QUFZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUFPQTs7Ozs7Ozs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7QUFXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7OztBQWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQU1BOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FBUUE7Ozs7Ozs7Ozs7Ozs7QUFhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTs7Ozs7Ozs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTs7Ozs7Ozs7Ozs7Ozs7O0FBZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBOzs7Ozs7QUFNQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7Ozs7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUFNQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7Ozs7Ozs7Ozs7OztBQVlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBdnJFQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNqQkE7QUF3QkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQTdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDYkE7QUFFQTtBQUVBO0FBQ0E7QUFFQTtBQWdCQTtBQVpBO0FBR0E7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUdBO0FBS0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUtBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBRUE7QUFRQTtBQUNBO0FBSUE7QUFHQTtBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBcldBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ1JBO0FBRUE7QUFVQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBcENBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0pBO0FBRUE7QUFlQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXZEQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNKQTtBQXdCQTtBQThFQTtBQUNBO0FBQ0E7QUFLQTtBQTVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBMkJBO0FBS0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUlBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQS9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUM3RkE7QUFFQTtBQXFCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQXBEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNWQTtBQUVBO0FBZUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBaERBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0pBO0FBRUE7QUFhQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBekNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0pBO0FBRUE7QUFnQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWxEQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNGQTtBQVdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUF0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ09BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFHQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDdEhBO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBV0E7QUF5UkE7QUF2UkE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTs7QUFsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBNlJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3RUQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3ZGQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUEyQkE7Ozs7Ozs7OztBQVNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDN0ZBO0FBQ0E7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXNFQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQy9NQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBZ0ZBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQVVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFXQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDM09BO0FBQ0E7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFpTEE7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQVNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFZQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUM5ZUE7QUFDQTtBQVFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF1Q0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMzSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQVNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBb2hGQTtBQWxoRkE7QUFDQTtBQUNBO0FBR0E7O0FBSUE7QUFNQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFJQTtBQUFBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUdBO0FBRUE7QUFLQTtBQUFBO0FBQ0E7QUFFQTtBQU1BO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQU1BO0FBQUE7QUFHQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBT0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBSUE7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUlBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBR0E7QUFBQTtBQUNBO0FBS0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFHQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQU1BOztBQU1BO0FBR0E7QUFBQTtBQUNBO0FBS0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFHQTtBQUNBO0FBRUE7QUFDQTtBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFJQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBRUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUVBO0FBS0E7QUFBQTtBQUVBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFHQTs7QUFVQTtBQUdBO0FBQUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUVBO0FBS0E7QUFBQTtBQUVBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVVBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQU9BO0FBQUE7QUFDQTtBQUdBO0FBT0E7QUFBQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBQ0E7QUFFQTtBQUtBO0FBQUE7QUFDQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUtBOztBQVFBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBR0E7QUFBQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFBQTtBQUNBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBVUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBU0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFFQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBU0E7QUFBQTtBQUdBOztBQVNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFPQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFLQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBVUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBUUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFTQTtBQUdBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBcmhGQTtBQTJoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBakRBO0FBbURBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFaQTtBQWNBO0FBQ0E7QUFhQTtBQWRBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQ2xvRkE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0EiLCJzb3VyY2VSb290IjoiIn0=