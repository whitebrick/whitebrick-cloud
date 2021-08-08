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
    removeSequenceFromColumn(schema, table, column) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!column.default) {
                return whitebrick_cloud_1.errResult({
                    wbCode: "WB_NO_DEFAULT_ON_COLUMN",
                    values: [schema.name, table.name, column.name],
                });
            }
            const sequencNameSplitA = column.default.split("wbseq_");
            const sequencNameSplitB = sequencNameSplitA[1].split("::");
            const sequencName = `wbseq_${sequencNameSplitB[0].slice(0, -1)}`;
            const results = yield this.executeQueries([
                {
                    query: `ALTER TABLE ${schema.name}.${table.name} ALTER COLUMN ${column.name} DROP DEFAULT`,
                },
                {
                    query: `DROP SEQUENCE IF EXISTS ${schema.name}.${sequencName}`,
                },
            ]);
            return results[0];
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
        "Remove existing foreign key on the column first",
        "BAD_USER_INPUT",
    ],
    WB_NO_DEFAULT_ON_COLUMN: ["This column does not have a default value set"],
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
    wbAddOrRemoveColumnSequence(
      schemaName: String!
      tableName: String!
      columnName: String!
      nextSeqNumber: Int
      remove: Boolean
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
        wbAddOrRemoveColumnSequence: (_, { schemaName, tableName, columnName, nextSeqNumber, remove }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrRemoveColumnSequence(currentUser, schemaName, tableName, columnName, nextSeqNumber, remove);
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
                result = yield this.dal.removeSequenceFromColumn(schema, table, column);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Db2x1bW4udHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ3VycmVudFVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvT3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvblVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UYWJsZVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3BvbGljeS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL2luZGV4LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvb3JnYW5pemF0aW9uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvc2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy91c2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvd2hpdGVicmljay1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2csIGVyclJlc3VsdCB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7XG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgVXNlcixcbiAgT3JnYW5pemF0aW9uLFxuICBPcmdhbml6YXRpb25Vc2VyLFxuICBTY2hlbWEsXG4gIFNjaGVtYVVzZXIsXG4gIFRhYmxlLFxuICBUYWJsZVVzZXIsXG4gIENvbHVtbixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFF1ZXJ5UGFyYW1zLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGZpcnN0IH0gZnJvbSBcInZvY2FcIjtcblxuZXhwb3J0IGNsYXNzIERBTCB7XG4gIHByaXZhdGUgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IERCID09PT09PT09PVxuICAgKi9cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtczogUXVlcnlQYXJhbXMpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbcXVlcnlQYXJhbXNdKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbXMgb2YgcXVlcmllc0FuZFBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7cXVlcnlQYXJhbXMucXVlcnl9YCxcbiAgICAgICAgICBgICAgIFsgJHtxdWVyeVBhcmFtcy5wYXJhbXMgPyBxdWVyeVBhcmFtcy5wYXJhbXMuam9pbihcIiwgXCIpIDogXCJcIn0gXWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbXMucXVlcnksXG4gICAgICAgICAgcXVlcnlQYXJhbXMucGFyYW1zXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcbiAgICAgIGxvZy5lcnJvcihKU09OLnN0cmluZ2lmeShlcnJvcikpO1xuICAgICAgcmVzdWx0cy5wdXNoKFxuICAgICAgICBlcnJSZXN1bHQoe1xuICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgcmVmQ29kZTogXCJQR19cIiArIGVycm9yLmNvZGUsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdClcbiAgICAgICk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLy8gdXNlZCBmb3IgRERMIGlkZW50aWZpZXJzIChlZyBDUkVBVEUgVEFCTEUgc2FuaXRpemUodGFibGVOYW1lKSlcbiAgcHVibGljIHN0YXRpYyBzYW5pdGl6ZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXlxcdyVdKy9nLCBcIlwiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFJvbGVzICYgUGVybWlzc2lvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZXNJZExvb2t1cCgpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBuYW1lSWRMb29rdXA6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWQsIHdiLnJvbGVzLm5hbWVcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucGF5bG9hZC5yb3dzKSB7XG4gICAgICBuYW1lSWRMb29rdXBbcm93Lm5hbWVdID0gcm93LmlkO1xuICAgIH1cbiAgICByZXN1bHQucGF5bG9hZCA9IG5hbWVJZExvb2t1cDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVJZHNGcm9tTmFtZXMocm9sZU5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi5yb2xlcy5pZFxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgIFdIRVJFIGN1c3RvbSBJUyBmYWxzZVxuICAgICAgICBBTkQgbmFtZT1BTlkoJDEpXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbcm9sZU5hbWVzXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93cy5tYXAoKHJvdzogeyBpZDogbnVtYmVyIH0pID0+IHJvdy5pZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuKlxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgIFdIRVJFIG5hbWU9JDEgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW25hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBSb2xlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIlJPTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gVHlwaWNhbGx5IHNldHRpbmcgYSByb2xlIGRpcmVjdGx5IGlzIGV4cGxpY2l0LFxuICAvLyBzbyBhbnkgaW1wbGllZF9mcm9tX3JvbGVfaWQgaXMgY2xlYXJlZCB1bmxlc3Mga2VlcEltcGxpZWRGcm9tXG4gIHB1YmxpYyBhc3luYyBzZXRSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWQ6IG51bWJlcixcbiAgICBrZWVwSW1wbGllZEZyb20/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuc2V0Um9sZSgke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke29iamVjdElkfSwke2tlZXBJbXBsaWVkRnJvbX0pYFxuICAgICk7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUJ5TmFtZShyb2xlTmFtZSk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgIGxldCB3YlRhYmxlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCB3YkNvbHVtbjogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJvcmdhbml6YXRpb25faWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5zY2hlbWFfdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcInNjaGVtYV9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2IudGFibGVfdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcInRhYmxlX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBwYXJhbXM6IERhdGVbXSA9IFtdO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgSU5TRVJUIElOVE8gJHt3YlRhYmxlfSAocm9sZV9pZCwgIHVzZXJfaWQsICR7d2JDb2x1bW59LCB1cGRhdGVkX2F0KVxuICAgICAgVkFMVUVTXG4gICAgYDtcbiAgICBmb3IgKGNvbnN0IHVzZXJJZCBvZiB1c2VySWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIChcbiAgICAgICAgICAke3JvbGVSZXN1bHQucGF5bG9hZC5pZH0sXG4gICAgICAgICAgJHt1c2VySWR9LFxuICAgICAgICAgICR7b2JqZWN0SWR9LFxuICAgICAgICAgICQke3BhcmFtcy5sZW5ndGggKyAxfVxuICAgICAgICApXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goZGF0ZSk7XG4gICAgICBpZiAocGFyYW1zLmxlbmd0aCAhPSB1c2VySWRzLmxlbmd0aCkgcXVlcnkgKz0gXCIsIFwiO1xuICAgIH1cbiAgICBxdWVyeSArPSBgXG4gICAgICBPTiBDT05GTElDVCAodXNlcl9pZCwgJHt3YkNvbHVtbn0pXG4gICAgICBETyBVUERBVEUgU0VUXG4gICAgICByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsXG4gICAgICB1cGRhdGVkX2F0PUVYQ0xVREVELnVwZGF0ZWRfYXRcbiAgICBgO1xuICAgIGlmICgha2VlcEltcGxpZWRGcm9tKSBxdWVyeSArPSBcIiwgaW1wbGllZF9mcm9tX3JvbGVfaWQ9TlVMTFwiO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkPzogbnVtYmVyLFxuICAgIHBhcmVudE9iamVjdElkPzogbnVtYmVyLFxuICAgIGltcGxpZWRGcm9tUm9sZXM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBudW1iZXJbXSB8IHVuZGVmaW5lZClbXSA9IFt1c2VySWRzXTtcbiAgICBsZXQgd2JUYWJsZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgd2JXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzXCI7XG4gICAgICAgIHdiV2hlcmUgPSBcIkFORCBvcmdhbml6YXRpb25faWQ9JDJcIjtcbiAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnNjaGVtYV91c2Vyc1wiO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gXCJBTkQgc2NoZW1hX2lkPSQyXCI7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IGBcbiAgICAgICAgICAgIEFORCBzY2hlbWFfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgICAgIFdIRVJFIG9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMlxuICAgICAgICAgICAgKVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zLnB1c2gocGFyZW50T2JqZWN0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi50YWJsZV91c2Vyc1wiO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gXCJBTkQgdGFibGVfaWQ9JDJcIjtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gYFxuICAgICAgICAgICAgQU5EIHRhYmxlX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMlxuICAgICAgICAgICAgKVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zLnB1c2gocGFyZW50T2JqZWN0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKGltcGxpZWRGcm9tUm9sZXMpIHtcbiAgICAgIHdiV2hlcmUgKz0gYEFORCBpbXBsaWVkX2Zyb21fcm9sZV9pZD1BTlkoJDMpYDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUlkc0Zyb21OYW1lcyhpbXBsaWVkRnJvbVJvbGVzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NICR7d2JUYWJsZX1cbiAgICAgICAgV0hFUkUgdXNlcl9pZD1BTlkoJDEpXG4gICAgICAgICR7d2JXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgdGFibGVJZDogbnVtYmVyLFxuICAgIGRlbGV0ZU9ubHk/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVzSWRMb29rdXAoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHJvbGVzSWRMb29rdXAgPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV9wZXJtaXNzaW9uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3RhYmxlSWRdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmICghZGVsZXRlT25seSkge1xuICAgICAgZm9yIChjb25zdCB0YWJsZVJvbGUgb2YgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpKSB7XG4gICAgICAgIGZvciAoY29uc3QgcGVybWlzc2lvblByZWZpeCBvZiBSb2xlLnRhYmxlUGVybWlzc2lvblByZWZpeGVzKFxuICAgICAgICAgIHRhYmxlUm9sZVxuICAgICAgICApKSB7XG4gICAgICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV9wZXJtaXNzaW9ucyh0YWJsZV9wZXJtaXNzaW9uX2tleSwgdXNlcl9pZCwgdGFibGVfaWQpXG4gICAgICAgICAgICAgIFNFTEVDVCAnJHtSb2xlLnRhYmxlUGVybWlzc2lvbktleShcbiAgICAgICAgICAgICAgICBwZXJtaXNzaW9uUHJlZml4LFxuICAgICAgICAgICAgICAgIHRhYmxlSWRcbiAgICAgICAgICAgICAgKX0nLCB1c2VyX2lkLCAke3RhYmxlSWR9XG4gICAgICAgICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQxIEFORCB3Yi5yb2xlcy5uYW1lPSQyXG4gICAgICAgICAgICBgLFxuICAgICAgICAgICAgcGFyYW1zOiBbdGFibGVJZCwgdGFibGVSb2xlXSxcbiAgICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnJvbGVBbmRJZEZvclVzZXJPYmplY3QoJHt1c2VySWR9LCR7cm9sZUxldmVsfSwke29iamVjdElkT3JOYW1lfSwke3BhcmVudE9iamVjdE5hbWV9KWBcbiAgICApO1xuICAgIGxldCBvYmplY3RJZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBxdWVyeU9iaklkOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxKb2luOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodHlwZW9mIG9iamVjdElkT3JOYW1lID09PSBcIm51bWJlclwiKSBvYmplY3RJZCA9IG9iamVjdElkT3JOYW1lO1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHN0cmluZylbXSA9IFt1c2VySWRdO1xuICAgIGNvbnN0IHBhcmFtc09iaklkOiBzdHJpbmdbXSA9IFtdO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWRcbiAgICAgICAgYDtcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDJcbiAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgICBgO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDJcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPVxuICAgICAgICAgICAgXCJTRUxFQ1QgaWQgYXMgb2JqZWN0X2lkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIjtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgc3FsSm9pbiA9IGBcbiAgICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnJvbGVzLmlkPXdiLnNjaGVtYV91c2Vycy5yb2xlX2lkXG4gICAgICAgIGA7XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9JDFcbiAgICAgICAgYDtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZE9yTmFtZSk7XG4gICAgICAgICAgc3FsSm9pbiArPSBgXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgYDtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgICBxdWVyeU9iaklkID1cbiAgICAgICAgICAgIFwiU0VMRUNUIGlkIGFzIG9iamVjdF9pZCBGUk9NIHdiLnNjaGVtYXMgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXCI7XG4gICAgICAgICAgcGFyYW1zT2JqSWQucHVzaChvYmplY3RJZE9yTmFtZS50b1N0cmluZygpKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgc3FsSm9pbiA9IGBcbiAgICAgICAgIEpPSU4gd2IudGFibGVfdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2IudGFibGVfdXNlcnMucm9sZV9pZFxuICAgICAgICBgO1xuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9JDFcbiAgICAgICAgYDtcbiAgICAgICAgaWYgKG9iamVjdElkKSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi50YWJsZV91c2Vycy50YWJsZV9pZD0kMlxuICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCFwYXJlbnRPYmplY3ROYW1lKSB7XG4gICAgICAgICAgICB0aHJvdyBgZGFsLnJvbGVOYW1lRm9yVXNlck9iamVjdCBwYXJlbnRPYmplY3ROYW1lIHJlcXVpcmVkIGZvciB0YWJsZSBsZXZlbGA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lLCBwYXJlbnRPYmplY3ROYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICAgIGA7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLnRhYmxlcy5uYW1lPSQyXG4gICAgICAgICAgICBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQzXG4gICAgICAgICAgYDtcbiAgICAgICAgICBxdWVyeU9iaklkID0gYFxuICAgICAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy5pZCBhcyBvYmplY3RfaWRcbiAgICAgICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMubmFtZT0kMSBBTkQgd2Iuc2NoZW1hcy5uYW1lPSQyXG4gICAgICAgICAgICBMSU1JVCAxXG4gICAgICAgICAgYDtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCksIHBhcmVudE9iamVjdE5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWVcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICAke3NxbEpvaW59XG4gICAgICAgICR7c3FsV2hlcmV9ICBcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCFvYmplY3RJZCkge1xuICAgICAgcXVlcmllcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5T2JqSWQsXG4gICAgICAgIHBhcmFtczogcGFyYW1zT2JqSWQsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIGlmIChyZXN1bHRzWzFdICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGNvbnN0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIHJvbGVOYW1lOiBudWxsLFxuICAgICAgICBvYmplY3RJZDogbnVsbCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBpZiAocmVzdWx0c1swXS5wYXlsb2FkLnJvd3MubGVuZ3RoID09IDEpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lID0gcmVzdWx0c1swXS5wYXlsb2FkLnJvd3NbMF0ucm9sZV9uYW1lO1xuICAgIH1cbiAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkLm9iamVjdElkID0gb2JqZWN0SWQ7XG4gICAgfSBlbHNlIGlmIChyZXN1bHRzWzFdLnBheWxvYWQucm93cy5sZW5ndGggPT0gMSkge1xuICAgICAgcmVzdWx0LnBheWxvYWQub2JqZWN0SWQgPSByZXN1bHRzWzFdLnBheWxvYWQucm93c1swXS5vYmplY3RfaWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBVc2VycyA9PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHVzZXJJZEZyb21BdXRoSWQoYXV0aElkOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudXNlcnMuaWRcbiAgICAgICAgRlJPTSB3Yi51c2Vyc1xuICAgICAgICBXSEVSRSBhdXRoX2lkPSQxXG4gICAgICAgIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFthdXRoSWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLnJvd3MubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbYXV0aElkXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3NbMF0uaWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlcnMoXG4gICAgaWRzPzogbnVtYmVyW10sXG4gICAgZW1haWxzPzogc3RyaW5nW10sXG4gICAgc2VhcmNoUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10gfCBzdHJpbmcpW10gPSBbXTtcbiAgICBpZiAoaWRzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIGlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkcyk7XG4gICAgfSBlbHNlIGlmIChlbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgZW1haWw9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWxzLm1hcCgodikgPT4gdi50b0xvd2VyQ2FzZSgpKSk7XG4gICAgfSBlbHNlIGlmIChzZWFyY2hQYXR0ZXJuKSB7XG4gICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgQU5EIGVtYWlsIExJS0UgJDFcbiAgICAgICAgT1IgZmlyc3RfbmFtZSBMSUtFICQxXG4gICAgICAgIE9SIGxhc3RfbmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goc2VhcmNoUGF0dGVybi5yZXBsYWNlKC9cXCovZywgXCIlXCIpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgIFNFTEVDVCB3Yi51c2Vycy4qXG4gICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICBXSEVSRSBpZCBOT1QgSU4gKCR7VXNlci5TWVNfQURNSU5fSUR9KVxuICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIE9SREVSIEJZIGVtYWlsXG4gICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoXG4gICAgYXV0aElkPzogc3RyaW5nLFxuICAgIGVtYWlsPzogc3RyaW5nLFxuICAgIGZpcnN0TmFtZT86IHN0cmluZyxcbiAgICBsYXN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi51c2VycyhcbiAgICAgICAgICBhdXRoX2lkLCBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2F1dGhJZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbD86IHN0cmluZyxcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmcsXG4gICAgbGFzdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFlbWFpbCAmJiAhZmlyc3ROYW1lICYmICFsYXN0TmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IFwiZGFsLnVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgcGFyYW1zOiAoRGF0ZSB8IG51bWJlciB8IHN0cmluZylbXSA9IFtkYXRlLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCkge1xuICAgICAgcXVlcnkgKz0gYGVtYWlsPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZW1haWwpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBpZiAoZmlyc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgZmlyc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGZpcnN0TmFtZSk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChsYXN0TmFtZSkge1xuICAgICAgcXVlcnkgKz0gYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICAgIHBhcmFtcy5wdXNoKGxhc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgcXVlcnkgKz0gXCJ1cGRhdGVkX2F0PSQxIFdIRVJFIGlkPSQyIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFVzZXJzKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGVtYWlsIGxpa2UgJ3Rlc3RfJSR7ZW52aXJvbm1lbnQudGVzdFVzZXJFbWFpbERvbWFpbn0nXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIG9yZ2FuaXphdGlvbklkcz86IG51bWJlcltdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLm9yZ2FuaXphdGlvbnMuKlxuICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgYDtcbiAgICBpZiAob3JnYW5pemF0aW9uSWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMuaWQ9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbklkcyk7XG4gICAgfSBlbHNlIGlmIChvcmdhbml6YXRpb25OYW1lcykge1xuICAgICAgcXVlcnkgKz0gYFxuICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQxKVxuICAgICAgYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBMSUtFICQxXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIHVzZXJSb2xlIGFuZCB1c2VyUm9sZUltcGxpZWRGcm9tIG9ubHkgcmV0dXJuZWQgaWYgdXNlcklkcy9FbWFpbHMubGVuZ3RoPT0xXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zQnlVc2VycyhcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXJbXSB8IHN0cmluZ1tdKVtdID0gW107XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5pZD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi51c2Vycy5lbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgaWYgKG9yZ2FuaXphdGlvbk5hbWVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIiBBTkQgd2Iub3JnYW5pemF0aW9ucy5uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWVzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ICs9IFwiLCB3Yi5zY2hlbWFfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25zXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9uX3VzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbnMuaWQ9d2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPcmdhbml6YXRpb24oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2Iub3JnYW5pemF0aW9ucyhcbiAgICAgICAgICBuYW1lLCBsYWJlbFxuICAgICAgICApIFZBTFVFUygkMSwgJDIpXG4gICAgICAgIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWxdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZU9yZ2FuaXphdGlvbihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbmV3TmFtZT86IHN0cmluZyxcbiAgICBuZXdMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChEYXRlIHwgc3RyaW5nKVtdID0gW25ldyBEYXRlKCldO1xuICAgIGxldCBxdWVyeSA9IFwiVVBEQVRFIHdiLm9yZ2FuaXphdGlvbnMgU0VUIHVwZGF0ZWRfYXQ9JDFcIjtcbiAgICBpZiAobmV3TmFtZSkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3TmFtZSk7XG4gICAgICBxdWVyeSArPSBgLCBuYW1lPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICB9XG4gICAgaWYgKG5ld0xhYmVsKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdMYWJlbCk7XG4gICAgICBxdWVyeSArPSBgLCBsYWJlbD0kJHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKG5hbWUpO1xuICAgIHF1ZXJ5ICs9IGAgV0hFUkUgbmFtZT0kJHtwYXJhbXMubGVuZ3RofSBSRVRVUk5JTkcgKmA7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vIG5vIHBhdHRlcm5zIGFsbG93ZWQgaGVyZVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRlbGV0ZU9yZ2FuaXphdGlvbnMobmFtZS5yZXBsYWNlKC9cXCUvZywgXCJcIikpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRlbGV0ZU9yZ2FuaXphdGlvbnMoXCJ0ZXN0XyVcIik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9ucyhcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25faWQgSU4gKFxuICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgICApXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW25hbWVQYXR0ZXJuXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iub3JnYW5pemF0aW9ucyBXSEVSRSBuYW1lIGxpa2UgJDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9uIFVzZXJzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvblVzZXJzKFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZU5hbWVzPzogc3RyaW5nW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgc3RyaW5nW10gfCBudW1iZXJbXSlbXSA9IFtdO1xuICAgIGlmIChpZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKGlkKTtcbiAgICB9IGVsc2UgaWYgKG5hbWUpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJXSEVSRSB3Yi5vcmdhbml6YXRpb25zLm5hbWU9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKG5hbWUpO1xuICAgIH1cbiAgICBpZiAocm9sZU5hbWVzKSB7XG4gICAgICBzcWxXaGVyZSArPSBcIiBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChyb2xlTmFtZXMpO1xuICAgIH1cbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgKz0gYCBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9QU5ZKCQke1xuICAgICAgICBwYXJhbXMubGVuZ3RoICsgMVxuICAgICAgfSlgO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbl91c2Vyc1xuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gT3JnYW5pemF0aW9uVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBVUERBVEUgd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgIFNFVCBzZXR0aW5ncz0kMSwgdXBkYXRlZF9hdD0kMlxuICAgICAgICBXSEVSRSBvcmdhbml6YXRpb25faWQ9JDNcbiAgICAgICAgQU5EIHVzZXJfaWQ9JDRcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzZXR0aW5ncywgbmV3IERhdGUoKSwgb3JnYW5pemF0aW9uSWQsIHVzZXJJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBzY2hlbWFJZHM/OiBudW1iZXJbXSxcbiAgICBzY2hlbWFOYW1lcz86IHN0cmluZ1tdLFxuICAgIHNjaGVtYU5hbWVQYXR0ZXJuPzogc3RyaW5nLFxuICAgIG9yZGVyQnk/OiBzdHJpbmcsXG4gICAgbGltaXQ/OiBudW1iZXIsXG4gICAgd2JPbmx5PzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwZ1BhcmFtczogKHN0cmluZ1tdIHwgbnVtYmVyW10gfCBzdHJpbmcpW10gPSBbXG4gICAgICBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUyxcbiAgICBdO1xuICAgIGNvbnN0IHdiUGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGxldCBzcWxQZ1doZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXYldoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChzY2hlbWFJZHMpIHtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIGlkPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hSWRzKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYU5hbWVzKSB7XG4gICAgICBzcWxQZ1doZXJlID0gXCJBTkQgc2NoZW1hX25hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGdQYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgICBzcWxXYldoZXJlID0gXCJXSEVSRSBuYW1lPUFOWSgkMSlcIjtcbiAgICAgIHdiUGFyYW1zLnB1c2goc2NoZW1hTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hTmFtZVBhdHRlcm4pIHtcbiAgICAgIHNxbFBnV2hlcmUgPSBcIkFORCBzY2hlbWFfbmFtZSBMSUtFICQyXCI7XG4gICAgICBwZ1BhcmFtcy5wdXNoKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIG5hbWUgTElLRSAkMVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFOYW1lUGF0dGVybik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIFwiZGFsLnNjaGVtYXM6IE9uZSBvZiBzY2hlbWFJZHMsIHNjaGVtYU5hbWVzIG9yIHNjaGVtYU5hbWVQYXR0ZXJuIG11c3QgYmUgc3BlY2lmaWVkLlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHNxbE9yZGVyQnkgPSBcIk9SREVSIEJZIG5hbWVcIjtcbiAgICBpZiAob3JkZXJCeSkge1xuICAgICAgY29uc3Qgc3BsaXQgPSBvcmRlckJ5LnNwbGl0KFwiIFwiKTtcbiAgICAgIHNxbE9yZGVyQnkgPSBgT1JERVIgQlkgJHtEQUwuc2FuaXRpemUoc3BsaXRbMF0pfWA7XG4gICAgICBpZiAoc3BsaXQubGVuZ3RoID09IDIpIHNxbE9yZGVyQnkgKz0gYCAke0RBTC5zYW5pdGl6ZShzcGxpdFsxXSl9YDtcbiAgICB9XG4gICAgbGV0IHNxbExpbWl0ID0gXCJcIjtcbiAgICBpZiAobGltaXQpIHNxbExpbWl0ID0gYExJTUlUICR7bGltaXR9YDtcbiAgICBjb25zdCBxdWVyaWVzOiBRdWVyeVBhcmFtc1tdID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIFNFTEVDVCB3Yi5zY2hlbWFzLipcbiAgICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgICAke3NxbFdiV2hlcmV9XG4gICAgICAgICAgJHtzcWxPcmRlckJ5fVxuICAgICAgICAgICR7c3FsTGltaXR9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogd2JQYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKCF3Yk9ubHkgJiYgIWxpbWl0KSB7XG4gICAgICBxdWVyaWVzLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIFNFTEVDVCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGEuKlxuICAgICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXG4gICAgICAgICAgV0hFUkUgc2NoZW1hX25hbWUgTk9UIExJS0UgJ3BnXyUnXG4gICAgICAgICAgQU5EIHNjaGVtYV9uYW1lIT1BTlkoJDEpXG4gICAgICAgICAgJHtzcWxQZ1doZXJlfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IHBnUGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKHF1ZXJpZXMpO1xuICAgIGlmICghcmVzdWx0c1swXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1swXTtcbiAgICBpZiAoIXdiT25seSkge1xuICAgICAgaWYgKCFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgICAgaWYgKHJlc3VsdHNbMF0ucGF5bG9hZC5yb3dzLmxlbmd0aCAhPSByZXN1bHRzWzFdLnBheWxvYWQucm93cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgIFwiZGFsLnNjaGVtYXM6IHdiLnNjaGVtYXMgb3V0IG9mIHN5bmMgd2l0aCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmVzdWx0c1swXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJTY2hlbWFzKFxuICAgIHNjaGVtYU5hbWVQYXR0ZXJuPzogc3RyaW5nLFxuICAgIG9yZGVyQnk/OiBzdHJpbmcsXG4gICAgbGltaXQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFzY2hlbWFOYW1lUGF0dGVybikgc2NoZW1hTmFtZVBhdHRlcm4gPSBcIiVcIjtcbiAgICBpZiAoIW9yZGVyQnkpIG9yZGVyQnkgPSBcInNjaGVtYV9uYW1lXCI7XG4gICAgbGV0IHNxbExpbWl0ID0gXCJcIjtcbiAgICBpZiAobGltaXQpIHNxbExpbWl0ID0gYExJTUlUICR7bGltaXR9YDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhLnNjaGVtYV9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnNjaGVtYXRhXG4gICAgICAgIFdIRVJFIHNjaGVtYV9uYW1lIE5PVCBMSUtFICdwZ18lJ1xuICAgICAgICBBTkQgc2NoZW1hX25hbWUhPUFOWSgkMSlcbiAgICAgICAgQU5EIHNjaGVtYV9uYW1lIExJS0UgJyR7c2NoZW1hTmFtZVBhdHRlcm59J1xuICAgICAgICBPUkRFUiBCWSAke29yZGVyQnl9XG4gICAgICAgICR7c3FsTGltaXR9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbU2NoZW1hLlNZU19TQ0hFTUFfTkFNRVNdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZC5yb3dzLm1hcChcbiAgICAgICAgKHJvdzogeyBzY2hlbWFfbmFtZTogc3RyaW5nIH0pID0+IHJvdy5zY2hlbWFfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBuZXh0VW5hc3NpZ25lZERlbW9TY2hlbWEoc2NoZW1hTmFtZVBhdHRlcm46IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi5zY2hlbWFzLipcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWUgTElLRSAnJHtzY2hlbWFOYW1lUGF0dGVybn0nXG4gICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0ke1VzZXIuU1lTX0FETUlOX0lEfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJzKFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiQU5EIHdiLnNjaGVtYXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2Iuc2NoZW1hX3VzZXJzLnNldHRpbmdzIGFzIHNldHRpbmdzXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb20sXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZSxcbiAgICAgICAgdXNlcl9vd25lcnMuZW1haWwgYXMgdXNlcl9vd25lcl9lbWFpbFxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnVzZXJzIHVzZXJfb3duZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD11c2VyX293bmVycy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIoXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWQpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlsKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfb3duZXJfZW1haWwsXG4gICAgICAgICdzY2hlbWFfb3duZXInIGFzIHJvbGVfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFzLnVzZXJfb3duZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgIGN1cnJlbnRVc2VySWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKG9yZ2FuaXphdGlvbklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWQpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgc3FsV2hlcmUgPSBgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWUpO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgKz0gYEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0kMmA7XG4gICAgICBwYXJhbXMucHVzaChjdXJyZW50VXNlcklkKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIHNjaGVtYV91c2VyX2ltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIG9uIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1zY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZCk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWwpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZVxuICAgICAgICBzY2hlbWFfdXNlcl9yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tLFxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iub3JnYW5pemF0aW9ucy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYV91c2VycyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD1zY2hlbWFfdXNlcl9yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9c2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5yb2xlcy5uYW1lPSdvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcidcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXIsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBuYW1lID0gREFMLnNhbml0aXplKG5hbWUpO1xuICAgIGNvbnN0IHF1ZXJpZXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hcyhcbiAgICAgICAgICAgIG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25fb3duZXJfaWQsIHVzZXJfb3duZXJfaWRcbiAgICAgICAgICApIFZBTFVFUygkMSwgJDIsICQzLCAkNCkgUkVUVVJOSU5HICpcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbk93bmVySWQsIHVzZXJPd25lcklkXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICBxdWVyaWVzLnB1c2goe1xuICAgICAgICBxdWVyeTogYENSRUFURSBTQ0hFTUEgJHtuYW1lfWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIGlmIChjcmVhdGUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgcmVzdWx0c1swXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlU2NoZW1hKFxuICAgIHNjaGVtYTogU2NoZW1hLFxuICAgIG5ld1NjaGVtYU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3U2NoZW1hTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3T3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBuZXdVc2VyT3duZXJJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnVwZGF0ZVNjaGVtYSgke3NjaGVtYX0sJHtuZXdTY2hlbWFOYW1lfSwke25ld1NjaGVtYUxhYmVsfSwke25ld09yZ2FuaXphdGlvbk93bmVySWR9LCR7bmV3VXNlck93bmVySWR9KWBcbiAgICApO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSBuZXdTY2hlbWFOYW1lID0gREFMLnNhbml0aXplKG5ld1NjaGVtYU5hbWUpO1xuICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBVUERBVEUgd2Iuc2NoZW1hcyBTRVRcbiAgICBgO1xuICAgIGxldCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdTY2hlbWFOYW1lKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm5hbWU9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChuZXdTY2hlbWFMYWJlbCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3U2NoZW1hTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChuZXdPcmdhbml6YXRpb25Pd25lcklkKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdPcmdhbml6YXRpb25Pd25lcklkKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm9yZ2FuaXphdGlvbl9vd25lcl9pZD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm9yZ2FuaXphdGlvbl91c2VyX2lkPU5VTExcIik7XG4gICAgfVxuICAgIGlmIChuZXdVc2VyT3duZXJJZCkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3VXNlck93bmVySWQpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwidXNlcl9vd25lcl9pZD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm9yZ2FuaXphdGlvbl9vd25lcl9pZD1OVUxMXCIpO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChzY2hlbWEuaWQpO1xuICAgIHF1ZXJ5ICs9IGBcbiAgICAgICR7dXBkYXRlcy5qb2luKFwiLCBcIil9XG4gICAgICBXSEVSRSBpZD0kJHtwYXJhbXMubGVuZ3RofVxuICAgICAgUkVUVVJOSU5HICpcbiAgICBgO1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAobmV3U2NoZW1hTmFtZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBTQ0hFTUEgXCIke3NjaGVtYS5uYW1lfVwiXG4gICAgICAgICAgUkVOQU1FIFRPICR7bmV3U2NoZW1hTmFtZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAobmV3U2NoZW1hTmFtZSAmJiAhcmVzdWx0c1sxXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1sxXTtcbiAgICBpZiAocmVzdWx0c1swXS5zdWNjZXNzKSB7XG4gICAgICByZXN1bHRzWzBdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNDSEVNQSBJRiBFWElTVFMgJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9IENBU0NBREVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lcz86IHN0cmluZ1tdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBpbXBsaWVkRnJvbVJvbGVJZD86IG51bWJlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IHN0cmluZ1tdIHwgbnVtYmVyIHwgbnVtYmVyW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmUgPSBcIlwiO1xuICAgIGlmIChyb2xlTmFtZXMpIHtcbiAgICAgIHBhcmFtcy5wdXNoKHJvbGVOYW1lcyk7XG4gICAgICBzcWxXaGVyZSA9IGBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJCR7cGFyYW1zLmxlbmd0aH0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgICAgc3FsV2hlcmUgPSBgQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPUFOWSgkJHtwYXJhbXMubGVuZ3RofSlgO1xuICAgIH1cbiAgICBpZiAoaW1wbGllZEZyb21Sb2xlSWQpIHtcbiAgICAgIHBhcmFtcy5wdXNoKGltcGxpZWRGcm9tUm9sZUlkKTtcbiAgICAgIHNxbFdoZXJlID0gYEFORCB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9JHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZCxcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBzY2hlbWFJZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGVzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLipcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMudGFibGVfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHRhYmxlX25hbWU6IHN0cmluZyB9KSA9PiByb3cudGFibGVfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXNCeVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHRhYmxlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiQU5EIHdiLnVzZXJzLmVtYWlsPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAodGFibGVOYW1lcykge1xuICAgICAgc3FsV2hlcmUgKz0gXCJBTkQgd2IudGFibGVzLm5hbWU9QU5ZKCQzKVwiO1xuICAgICAgcGFyYW1zLnB1c2godGFibGVOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2IudGFibGVfdXNlcnMuc2V0dGluZ3MgYXMgc2V0dGluZ3NcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlcy4qLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICBGUk9NIHdiLnRhYmxlc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudGFibGVfdXNlcnMgT04gd2IudGFibGVzLmlkPXdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyB0eXBlID0gZm9yZWlnbktleXN8cmVmZXJlbmNlc3xhbGxcbiAgcHVibGljIGFzeW5jIGZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZVBhdHRlcm46IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKHRhYmxlTmFtZVBhdHRlcm4pO1xuICAgIGNvbHVtbk5hbWVQYXR0ZXJuID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWVQYXR0ZXJuKTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlIFwiRk9SRUlHTl9LRVlTXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCBmay50YWJsZV9uYW1lIExJS0UgJyR7dGFibGVOYW1lUGF0dGVybn0nXG4gICAgICAgICAgQU5EIGZrLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJSRUZFUkVOQ0VTXCI6XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgIEFORCByZWYudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCByZWYuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIkFMTFwiOlxuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICAtLSB1bmlxdWUgcmVmZXJlbmNlIGluZm9cbiAgICAgICAgcmVmLnRhYmxlX25hbWUgICAgICAgQVMgcmVmX3RhYmxlLFxuICAgICAgICByZWYuY29sdW1uX25hbWUgICAgICBBUyByZWZfY29sdW1uLFxuICAgICAgICByZWZkLmNvbnN0cmFpbnRfdHlwZSBBUyByZWZfdHlwZSwgLS0gZS5nLiBVTklRVUUgb3IgUFJJTUFSWSBLRVlcbiAgICAgICAgLS0gZm9yZWlnbiBrZXkgaW5mb1xuICAgICAgICBmay50YWJsZV9uYW1lICAgICAgICBBUyBma190YWJsZSxcbiAgICAgICAgZmsuY29sdW1uX25hbWUgICAgICAgQVMgZmtfY29sdW1uLFxuICAgICAgICBmay5jb25zdHJhaW50X25hbWUgICBBUyBma19uYW1lLFxuICAgICAgICBtYXAudXBkYXRlX3J1bGUgICAgICBBUyBma19vbl91cGRhdGUsXG4gICAgICAgIG1hcC5kZWxldGVfcnVsZSAgICAgIEFTIGZrX29uX2RlbGV0ZVxuICAgICAgICAtLSBsaXN0cyBmayBjb25zdHJhaW50cyBBTkQgbWFwcyB0aGVtIHRvIHBrIGNvbnN0cmFpbnRzXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnJlZmVyZW50aWFsX2NvbnN0cmFpbnRzIEFTIG1hcFxuICAgICAgICAtLSBqb2luIHVuaXF1ZSBjb25zdHJhaW50cyAoZS5nLiBQS3MgY29uc3RyYWludHMpIHRvIHJlZiBjb2x1bW5zIGluZm9cbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyByZWZcbiAgICAgICAgT04gIHJlZi5jb25zdHJhaW50X2NhdGFsb2cgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfc2NoZW1hID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgcmVmLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC51bmlxdWVfY29uc3RyYWludF9uYW1lXG4gICAgICAgIC0tIG9wdGlvbmFsOiB0byBpbmNsdWRlIHJlZmVyZW5jZSBjb25zdHJhaW50IHR5cGVcbiAgICAgICAgTEVGVCBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZV9jb25zdHJhaW50cyBBUyByZWZkXG4gICAgICAgIE9OICByZWZkLmNvbnN0cmFpbnRfY2F0YWxvZyA9IHJlZi5jb25zdHJhaW50X2NhdGFsb2dcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9zY2hlbWEgPSByZWYuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIHJlZmQuY29uc3RyYWludF9uYW1lID0gcmVmLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICAtLSBqb2luIGZrIGNvbHVtbnMgdG8gdGhlIGNvcnJlY3QgcmVmIGNvbHVtbnMgdXNpbmcgb3JkaW5hbCBwb3NpdGlvbnNcbiAgICAgICAgSU5ORVIgSk9JTiBpbmZvcm1hdGlvbl9zY2hlbWEua2V5X2NvbHVtbl91c2FnZSBBUyBma1xuICAgICAgICBPTiAgZmsuY29uc3RyYWludF9jYXRhbG9nID0gbWFwLmNvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgZmsuY29uc3RyYWludF9zY2hlbWEgPSBtYXAuY29uc3RyYWludF9zY2hlbWFcbiAgICAgICAgQU5EIGZrLmNvbnN0cmFpbnRfbmFtZSA9IG1hcC5jb25zdHJhaW50X25hbWVcbiAgICAgICAgQU5EIGZrLnBvc2l0aW9uX2luX3VuaXF1ZV9jb25zdHJhaW50ID0gcmVmLm9yZGluYWxfcG9zaXRpb24gLS1JTVBPUlRBTlQhXG4gICAgICAgIFdIRVJFIHJlZi50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgIEFORCBmay50YWJsZV9zY2hlbWE9JyR7c2NoZW1hTmFtZX0nXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgY29uc3RyYWludHM6IENvbnN0cmFpbnRJZFtdID0gW107XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgY29uc3QgY29uc3RyYWludDogQ29uc3RyYWludElkID0ge1xuICAgICAgICBjb25zdHJhaW50TmFtZTogcm93LmZrX25hbWUsXG4gICAgICAgIHRhYmxlTmFtZTogcm93LmZrX3RhYmxlLFxuICAgICAgICBjb2x1bW5OYW1lOiByb3cuZmtfY29sdW1uLFxuICAgICAgICByZWxUYWJsZU5hbWU6IHJvdy5yZWZfdGFibGUsXG4gICAgICAgIHJlbENvbHVtbk5hbWU6IHJvdy5yZWZfY29sdW1uLFxuICAgICAgfTtcbiAgICAgIGNvbnN0cmFpbnRzLnB1c2goY29uc3RyYWludCk7XG4gICAgfVxuICAgIHJlc3VsdC5wYXlsb2FkID0gY29uc3RyYWludHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcmltYXJ5S2V5cyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgRElTVElOQ1QgYy5jb2x1bW5fbmFtZSwgdGMuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIHRjIFxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb25zdHJhaW50X2NvbHVtbl91c2FnZSBBUyBjY3VcbiAgICAgICAgVVNJTkcgKGNvbnN0cmFpbnRfc2NoZW1hLCBjb25zdHJhaW50X25hbWUpXG4gICAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgQVMgY1xuICAgICAgICBPTiBjLnRhYmxlX3NjaGVtYSA9IHRjLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCB0Yy50YWJsZV9uYW1lID0gYy50YWJsZV9uYW1lXG4gICAgICAgIEFORCBjY3UuY29sdW1uX25hbWUgPSBjLmNvbHVtbl9uYW1lXG4gICAgICAgIFdIRVJFIGNvbnN0cmFpbnRfdHlwZSA9ICdQUklNQVJZIEtFWSdcbiAgICAgICAgQU5EIGMudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9ICcke3RhYmxlTmFtZX0nXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgICAgcEtDb2xzQ29uc3RyYWludHNbcm93LmNvbHVtbl9uYW1lXSA9IHJvdy5jb25zdHJhaW50X25hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHBLQ29sc0NvbnN0cmFpbnRzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbnN0cmFpbnROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdHJhaW50TmFtZSA9IERBTC5zYW5pdGl6ZShjb25zdHJhaW50TmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUyAke2NvbnN0cmFpbnROYW1lfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgUFJJTUFSWSBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KTtcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuY3JlYXRlRm9yZWlnbktleSgke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKGNvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgcGFyZW50VGFibGVOYW1lID0gREFMLnNhbml0aXplKHBhcmVudFRhYmxlTmFtZSk7XG4gICAgY29uc3Qgc2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBwYXJlbnRDb2x1bW5OYW1lIG9mIHBhcmVudENvbHVtbk5hbWVzKSB7XG4gICAgICBzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lcy5wdXNoKERBTC5zYW5pdGl6ZShwYXJlbnRDb2x1bW5OYW1lKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIEFMVEVSIFRBQkxFICR7c2NoZW1hTmFtZX0uJHt0YWJsZU5hbWV9XG4gICAgICAgIEFERCBDT05TVFJBSU5UICR7dGFibGVOYW1lfV8ke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCJfXCIpfV9ma2V5XG4gICAgICAgIEZPUkVJR04gS0VZICgke3Nhbml0aXplZENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgUkVGRVJFTkNFUyAke3NjaGVtYU5hbWV9LiR7cGFyZW50VGFibGVOYW1lfVxuICAgICAgICAgICgke3Nhbml0aXplZFBhcmVudENvbHVtbk5hbWVzLmpvaW4oXCIsXCIpfSlcbiAgICAgICAgT04gREVMRVRFIFNFVCBOVUxMXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi50YWJsZXMuKiwgd2Iuc2NoZW1hcy5uYW1lIGFzIHNjaGVtYV9uYW1lXG4gICAgICAgIEZST00gd2IudGFibGVzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMiBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlVGFibGUgJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHt0YWJsZUxhYmVsfSAke2NyZWF0ZX1gXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZXMoc2NoZW1hX2lkLCBuYW1lLCBsYWJlbClcbiAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKSBSRVRVUk5JTkcgKlxuICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWRbMF0uaWQsIHRhYmxlTmFtZSwgdGFibGVMYWJlbF0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGNyZWF0ZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBDUkVBVEUgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIigpYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAoY3JlYXRlICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXModW5kZWZpbmVkLCBbc2NoZW1hTmFtZV0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlc1xuICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMSBBTkQgbmFtZT0kMlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZFswXS5pZCwgdGFibGVOYW1lXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoZGVsKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIgQ0FTQ0FERWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi50YWJsZXMgU0VUXG4gICAgYDtcbiAgICBsZXQgdXBkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1RhYmxlTGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1RhYmxlTGFiZWwpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibGFiZWw9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBxdWVyeSArPSBgXG4gICAgICAke3VwZGF0ZXMuam9pbihcIiwgXCIpfVxuICAgICAgV0hFUkUgaWQ9JCR7cGFyYW1zLmxlbmd0aH1cbiAgICAgIFJFVFVSTklORyAqXG4gICAgYDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgUkVOQU1FIFRPICR7bmV3VGFibGVOYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIGlmIChuZXdUYWJsZU5hbWUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgaWYgKHJlc3VsdHNbMF0uc3VjY2Vzcykge1xuICAgICAgcmVzdWx0c1swXS5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKVswXTtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZC5zY2hlbWFOYW1lID0gc2NoZW1hTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXJbXSlbXSA9IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdO1xuICAgIGxldCBzcWxTZWxlY3Q6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdoZXJlID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCB3Yi50YWJsZV91c2Vycy51c2VyX2lkPUFOWSgkMylcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgPSBcIndiLm9yZ2FuaXphdGlvbl91c2Vycy5zZXR0aW5ncyxcIjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy51c2VyX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMuY3JlYXRlZF9hdCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudGFibGVzLm5hbWUgYXMgdGFibGVfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPXdiLnRhYmxlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2IudGFibGVfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDEgQU5EIHdiLnRhYmxlcy5uYW1lPSQyXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IFRhYmxlVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmICF0YWJsZUlkcyBhbGwgdGFibGVzIGZvciBzY2hlbWFcbiAgLy8gaWYgIXVzZXJJZHMgYWxsIHNjaGVtYV91c2Vyc1xuICBwdWJsaWMgYXN5bmMgc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgIG9yZ2FuaXphdGlvbklkOiBudW1iZXIsXG4gICAgcm9sZU1hcD86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIC8vIGVnIHsgc2NoZW1hX293bmVyOiBcInRhYmxlX2FkbWluaXN0cmF0b3JcIiB9XG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKCR7b3JnYW5pemF0aW9uSWR9LCA8cm9sZU1hcD4sICR7c2NoZW1hSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nSW1wbGllZEZyb21Sb2xlTmFtZX0pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlU2NoZW1hc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVNjaGVtYVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHNjaGVtYUlkcyAmJiBzY2hlbWFJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVTY2hlbWFzU3FsID0gYEFORCB3Yi5zY2hlbWFzLmlkIElOICgke3NjaGVtYUlkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMgJiYgdXNlcklkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVNjaGVtYVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lKSB7XG4gICAgICBjb25zdCBpbXBsaWVkRnJvbVJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUoXG4gICAgICAgIGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFpbXBsaWVkRnJvbVJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGltcGxpZWRGcm9tUm9sZVJlc3VsdDtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIFdIRVJFXG4gICAgICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlU2NoZW1hc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9JHtpbXBsaWVkRnJvbVJvbGVSZXN1bHQucGF5bG9hZC5pZH1cbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFVc2Vyc1NxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbb3JnYW5pemF0aW9uSWRdLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVwZGF0ZSBpbXBsaWVkIHJvbGVzIG9ubHksIGxlYXZlIGV4cGxpY2l0IHJvbGVzIGFsb25lXG4gICAgICBvbkNvbmZsaWN0U3FsID0gYFxuICAgICAgICBPTiBDT05GTElDVCAoc2NoZW1hX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgaWYgKHJvbGVNYXApIHtcbiAgICAgIGZvciAoY29uc3Qgb3JnYW5pemF0aW9uUm9sZSBvZiBPYmplY3Qua2V5cyhyb2xlTWFwKSkge1xuICAgICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hX3VzZXJzKHNjaGVtYV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICAgIHdiLnNjaGVtYXMuaWQsXG4gICAgICAgICAgICB1c2VyX2lkLFxuICAgICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbb3JnYW5pemF0aW9uUm9sZV1dfSxcbiAgICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtvcmdhbml6YXRpb25Sb2xlXX0sXG4gICAgICAgICAgICAkMVxuICAgICAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPSQyXG4gICAgICAgICAgICBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFzU3FsfVxuICAgICAgICAgICAgJHt3aGVyZVVzZXJzU3FsfVxuICAgICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICAgIGAsXG4gICAgICAgICAgcGFyYW1zOiBbZGF0ZSwgb3JnYW5pemF0aW9uSWQsIHJvbGVzSWRMb29rdXBbb3JnYW5pemF0aW9uUm9sZV1dLFxuICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgIHNjaGVtYUlkOiBudW1iZXIsXG4gICAgcm9sZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICB0YWJsZUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKCR7c2NoZW1hSWR9LCAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICByb2xlTWFwXG4gICAgICApfSwgJHt0YWJsZUlkc30sICR7dXNlcklkc30sICR7Y2xlYXJFeGlzdGluZ30pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlVGFibGVzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVGFibGVVc2Vyc1NxbCA9IFwiXCI7XG4gICAgbGV0IG9uQ29uZmxpY3RTcWwgPSBcIlwiO1xuICAgIGlmICh0YWJsZUlkcyAmJiB0YWJsZUlkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVRhYmxlc1NxbCA9IGBBTkQgd2IudGFibGVzLmlkIElOICgke3RhYmxlSWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBpZiAodXNlcklkcyAmJiB1c2VySWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlVGFibGVVc2Vyc1NxbCA9IGBcbiAgICAgICAgQU5EIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmcpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICAgV0hFUkVcbiAgICAgICAgICAgIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlcy5zY2hlbWFfaWQ9JDFcbiAgICAgICAgICAgICAgJHt3aGVyZVRhYmxlc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICR7d2hlcmVUYWJsZVVzZXJzU3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFJZF0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXBkYXRlIGltcGxpZWQgcm9sZXMgb25seSwgbGVhdmUgZXhwbGljaXQgcm9sZXMgYWxvbmVcbiAgICAgIG9uQ29uZmxpY3RTcWwgPSBgXG4gICAgICAgIE9OIENPTkZMSUNUICh0YWJsZV9pZCwgdXNlcl9pZClcbiAgICAgICAgRE8gVVBEQVRFIFNFVCByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsIHVwZGF0ZWRfYXQ9RVhDTFVERUQudXBkYXRlZF9hdFxuICAgICAgICBXSEVSRSB3Yi50YWJsZV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzY2hlbWFSb2xlIG9mIE9iamVjdC5rZXlzKHJvbGVNYXApKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV91c2Vycyh0YWJsZV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgU0VMRUNUXG4gICAgICAgICAgd2IudGFibGVzLmlkLFxuICAgICAgICAgIHVzZXJfaWQsXG4gICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbc2NoZW1hUm9sZV1dfSxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbc2NoZW1hUm9sZV19LFxuICAgICAgICAgICQxXG4gICAgICAgICAgRlJPTSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2Iuc2NoZW1hcy5pZD13Yi50YWJsZXMuc2NoZW1hX2lkXG4gICAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9JDIgQU5EIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPSQzXG4gICAgICAgICAgJHt3aGVyZVRhYmxlc1NxbH1cbiAgICAgICAgICAke3doZXJlVXNlcnNTcWx9XG4gICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtkYXRlLCBzY2hlbWFJZCwgcm9sZXNJZExvb2t1cFtzY2hlbWFSb2xlXV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlQWxsVGFibGVVc2VycyhcbiAgICB0YWJsZUlkPzogbnVtYmVyLFxuICAgIHNjaGVtYUlkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeVdoZXJlID0gXCJcIjtcbiAgICBjb25zdCBwYXJhbXM6IG51bWJlcltdID0gW107XG4gICAgaWYgKHRhYmxlSWQpIHtcbiAgICAgIHF1ZXJ5V2hlcmUgPSBcIldIRVJFIHRhYmxlX2lkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh0YWJsZUlkKTtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYUlkKSB7XG4gICAgICBxdWVyeVdoZXJlID0gYFxuICAgICAgICBXSEVSRSB0YWJsZV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIGZyb20gd2IudGFibGVzXG4gICAgICAgICAgV0hFUkUgd2IudGFibGVzLnNjaGVtYV9pZD0kMVxuICAgICAgICApXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goc2NoZW1hSWQpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICAke3F1ZXJ5V2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgdGFibGVJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgVVBEQVRFIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgIFNFVCBzZXR0aW5ncz0kMSwgdXBkYXRlZF9hdD0kMlxuICAgICAgICBXSEVSRSB0YWJsZV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCB0YWJsZUlkLCB1c2VySWRdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbkJ5U2NoZW1hTmFtZVRhYmxlTmFtZUNvbHVtbk5hbWUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJDT0xVTU5fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcXVlcnk6IHN0cmluZyA9IGBcbiAgICAgIFNFTEVDVCB3Yi5jb2x1bW5zLiosXG4gICAgICBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy5kYXRhX3R5cGUgYXMgdHlwZSxcbiAgICAgIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9kZWZhdWx0IGFzIGRlZmF1bHRcbiAgICAgIEZST00gd2IuY29sdW1uc1xuICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IuY29sdW1ucy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgT04gKFxuICAgICAgICB3Yi5jb2x1bW5zLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX25hbWVcbiAgICAgICAgQU5EIHdiLnNjaGVtYXMubmFtZT1pbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9zY2hlbWFcbiAgICAgIClcbiAgICAgIFdIRVJFIHdiLnNjaGVtYXMubmFtZT0kMSBBTkQgd2IudGFibGVzLm5hbWU9JDIgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLnRhYmxlX25hbWU9JDJcbiAgICBgO1xuICAgIGxldCBwYXJhbXM6IHN0cmluZ1tdID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9IEFORCB3Yi5jb2x1bW5zLm5hbWU9JDMgQU5EIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lPSQzYDtcbiAgICAgIHBhcmFtcy5wdXNoKGNvbHVtbk5hbWUpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRpc2NvdmVyQ29sdW1ucyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gQ29sdW1uLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU6IGJvb2xlYW4sXG4gICAgY29sdW1uUEdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBkYWwuYWRkT3JDcmVhdGVDb2x1bW4gJHtzY2hlbWFOYW1lfSAke3RhYmxlTmFtZX0gJHtjb2x1bW5OYW1lfSAke2NvbHVtbkxhYmVsfSAke2NvbHVtblBHVHlwZX0gJHtjcmVhdGV9YFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb2x1bW5OYW1lID0gREFMLnNhbml0aXplKGNvbHVtbk5hbWUpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2IuY29sdW1ucyh0YWJsZV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgICAgVkFMVUVTICgkMSwgJDIsICQzKVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZC5pZCwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFERCAke2NvbHVtbk5hbWV9ICR7Y29sdW1uUEdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIGlmIChjcmVhdGUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXTtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1uQnlTY2hlbWFOYW1lVGFibGVOYW1lQ29sdW1uTmFtZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICAgIGxldCBxdWVyeSA9IGBcbiAgICAgICAgVVBEQVRFIHdiLmNvbHVtbnMgU0VUXG4gICAgICBgO1xuICAgICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5OYW1lKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5MYWJlbCk7XG4gICAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgICAgcXVlcnkgKz0gYCR7dXBkYXRlcy5qb2luKFwiLCBcIil9IFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld1R5cGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFMVEVSIENPTFVNTiAke2NvbHVtbk5hbWV9IFRZUEUgJHtuZXdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgQ09MVU1OICR7Y29sdW1uTmFtZX0gVE8gJHtuZXdDb2x1bW5OYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkU2VxdWVuY2VUb0NvbHVtbihcbiAgICBzY2hlbWE6IFNjaGVtYSxcbiAgICB0YWJsZTogVGFibGUsXG4gICAgY29sdW1uOiBDb2x1bW4sXG4gICAgbmV4dFNlcU51bWJlcj86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIW5leHRTZXFOdW1iZXIpIHtcbiAgICAgIGNvbnN0IG5leHRTZXFOdW1iZXJSZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUICR7Y29sdW1uLm5hbWV9IGFzIG1heF92YWxcbiAgICAgICAgICBGUk9NICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX1cbiAgICAgICAgICBPUkRFUiBCWSAke2NvbHVtbi5uYW1lfSBERVNDXG4gICAgICAgICAgTElNSVQgMVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgICBpZiAoXG4gICAgICAgIG5leHRTZXFOdW1iZXJSZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgICBuZXh0U2VxTnVtYmVyUmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMVxuICAgICAgKSB7XG4gICAgICAgIG5leHRTZXFOdW1iZXIgPVxuICAgICAgICAgIHBhcnNlSW50KG5leHRTZXFOdW1iZXJSZXN1bHQucGF5bG9hZC5yb3dzWzBdLm1heF92YWwpICsgMTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFuZXh0U2VxTnVtYmVyIHx8IG5leHRTZXFOdW1iZXIgPCAxKSBuZXh0U2VxTnVtYmVyID0gMTtcbiAgICBjb25zdCBzZXF1ZW5jTmFtZSA9IGB3YnNlcV9zJHtzY2hlbWEuaWR9X3Qke3RhYmxlLmlkfV9jJHtjb2x1bW4uaWR9YDtcbiAgICBsb2cud2FybihcIm5leHRTZXFOdW1iZXJcIiArIG5leHRTZXFOdW1iZXIpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYENSRUFURSBTRVFVRU5DRSAke3NjaGVtYS5uYW1lfS4ke3NlcXVlbmNOYW1lfTtgLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBBTFRFUiBUQUJMRSAke3NjaGVtYS5uYW1lfS4ke3RhYmxlLm5hbWV9IEFMVEVSIENPTFVNTiAke2NvbHVtbi5uYW1lfSBTRVQgREVGQVVMVCBuZXh0dmFsKCcke3NjaGVtYS5uYW1lfS5cIiR7c2VxdWVuY05hbWV9XCInKWAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYEFMVEVSIFNFUVVFTkNFICR7c2NoZW1hLm5hbWV9LiR7c2VxdWVuY05hbWV9IE9XTkVEIEJZICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX0uJHtjb2x1bW4ubmFtZX1gLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBTRUxFQ1Qgc2V0dmFsKCcke3NjaGVtYS5uYW1lfS5cIiR7c2VxdWVuY05hbWV9XCInLCAke1xuICAgICAgICAgIG5leHRTZXFOdW1iZXIgLSAxXG4gICAgICAgIH0pYCxcbiAgICAgIH0sXG4gICAgXSk7XG4gICAgcmV0dXJuIHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlU2VxdWVuY2VGcm9tQ29sdW1uKFxuICAgIHNjaGVtYTogU2NoZW1hLFxuICAgIHRhYmxlOiBUYWJsZSxcbiAgICBjb2x1bW46IENvbHVtblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWNvbHVtbi5kZWZhdWx0KSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX05PX0RFRkFVTFRfT05fQ09MVU1OXCIsXG4gICAgICAgIHZhbHVlczogW3NjaGVtYS5uYW1lLCB0YWJsZS5uYW1lLCBjb2x1bW4ubmFtZV0sXG4gICAgICB9KTtcbiAgICB9XG4gICAgLy8gZWcgY29sdW1uLmRlZmF1bHQ9XCJuZXh0dmFsKCd0ZXN0X3RoZV9kYWlzeV9ibG9nLndic2VxX3MzMDgyNl90NDEyMDlfYzUzNjAwJzo6cmVnY2xhc3MpXCJcbiAgICBjb25zdCBzZXF1ZW5jTmFtZVNwbGl0QSA9IGNvbHVtbi5kZWZhdWx0LnNwbGl0KFwid2JzZXFfXCIpO1xuICAgIGNvbnN0IHNlcXVlbmNOYW1lU3BsaXRCID0gc2VxdWVuY05hbWVTcGxpdEFbMV0uc3BsaXQoXCI6OlwiKTtcbiAgICBjb25zdCBzZXF1ZW5jTmFtZSA9IGB3YnNlcV8ke3NlcXVlbmNOYW1lU3BsaXRCWzBdLnNsaWNlKDAsIC0xKX1gO1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBBTFRFUiBUQUJMRSAke3NjaGVtYS5uYW1lfS4ke3RhYmxlLm5hbWV9IEFMVEVSIENPTFVNTiAke2NvbHVtbi5uYW1lfSBEUk9QIERFRkFVTFRgLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNFUVVFTkNFIElGIEVYSVNUUyAke3NjaGVtYS5uYW1lfS4ke3NlcXVlbmNOYW1lfWAsXG4gICAgICB9LFxuICAgIF0pO1xuICAgIHJldHVybiByZXN1bHRzWzBdOyAvLyBxdWVyeSAyIHdpbGwgYWx3YXlzIHN1Y2NlZWRcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbHVtbk5hbWUgPSBEQUwuc2FuaXRpemUoY29sdW1uTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5jb2x1bW5zXG4gICAgICAgICAgV0hFUkUgdGFibGVfaWQ9JDEgQU5EIG5hbWU9JDJcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWQuaWQsIGNvbHVtbk5hbWVdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbk5hbWV9IENBU0NBREVcbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29uc3RyYWludElkLCBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBDb2x1bW4ge1xuICBzdGF0aWMgQ09NTU9OX1RZUEVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIFRleHQ6IFwidGV4dFwiLFxuICAgIE51bWJlcjogXCJpbnRlZ2VyXCIsXG4gICAgRGVjaW1hbDogXCJkZWNpbWFsXCIsXG4gICAgQm9vbGVhbjogXCJib29sZWFuXCIsXG4gICAgRGF0ZTogXCJkYXRlXCIsXG4gICAgXCJEYXRlICYgVGltZVwiOiBcInRpbWVzdGFtcFwiLFxuICB9O1xuXG4gIGlkITogbnVtYmVyO1xuICB0YWJsZUlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gcGcgZGF0YVxuICB0eXBlITogc3RyaW5nO1xuICBkZWZhdWx0Pzogc3RyaW5nO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGlzUHJpbWFyeUtleSE6IGJvb2xlYW47XG4gIGZvcmVpZ25LZXlzITogW0NvbnN0cmFpbnRJZF07XG4gIHJlZmVyZW5jZWRCeSE6IFtDb25zdHJhaW50SWRdO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Q29sdW1uPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1ucyA9IEFycmF5PENvbHVtbj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIGNvbHVtbnMucHVzaChDb2x1bW4ucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvbHVtbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBDb2x1bW4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiQ29sdW1uLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IGNvbHVtbiA9IG5ldyBDb2x1bW4oKTtcbiAgICBjb2x1bW4uaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICBjb2x1bW4udGFibGVJZCA9IHBhcnNlSW50KGRhdGEudGFibGVfaWQpO1xuICAgIGNvbHVtbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIGNvbHVtbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgY29sdW1uLnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgY29sdW1uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBjb2x1bW4udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLmRlZmF1bHQpIGNvbHVtbi5kZWZhdWx0ID0gZGF0YS5kZWZhdWx0O1xuICAgIHJldHVybiBjb2x1bW47XG4gIH1cbn1cbiIsImltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLlwiO1xuaW1wb3J0IHsgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgZXJyUmVzdWx0LCBsb2csIFdoaXRlYnJpY2tDbG91ZCB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5pbXBvcnQgeyBSb2xlTGV2ZWwsIFVzZXJBY3Rpb25QZXJtaXNzaW9uIH0gZnJvbSBcIi4vUm9sZVwiO1xuaW1wb3J0IHsgREVGQVVMVF9QT0xJQ1kgfSBmcm9tIFwiLi4vcG9saWN5XCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuLi9lbnZpcm9ubWVudFwiO1xuXG5leHBvcnQgY2xhc3MgQ3VycmVudFVzZXIge1xuICB3YkNsb3VkITogV2hpdGVicmlja0Nsb3VkO1xuICB1c2VyITogVXNlcjtcbiAgaWQhOiBudW1iZXI7XG4gIGFjdGlvbkhpc3Rvcnk6IFVzZXJBY3Rpb25QZXJtaXNzaW9uW10gPSBbXTtcblxuICAvLyB7IHJvbGVMZXZlbDogeyBvYmplY3RJZDogeyB1c2VyQWN0aW9uOiB7IGNoZWNrZWRGb3JSb2xlTmFtZTogc3RyaW5nLCBwZXJtaXR0ZWQ6IHRydWUvZmFsc2V9IH0gfSB9XG4gIG9iamVjdFBlcm1pc3Npb25zTG9va3VwOiBSZWNvcmQ8XG4gICAgUm9sZUxldmVsLFxuICAgIFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+PlxuICA+ID0ge1xuICAgIG9yZ2FuaXphdGlvbjoge30sXG4gICAgc2NoZW1hOiB7fSxcbiAgICB0YWJsZToge30sXG4gIH07XG5cbiAgY29uc3RydWN0b3IodXNlcjogVXNlciwgd2JDbG91ZD86IFdoaXRlYnJpY2tDbG91ZCkge1xuICAgIGlmICh3YkNsb3VkKSB0aGlzLndiQ2xvdWQgPSB3YkNsb3VkO1xuICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgdGhpcy5pZCA9IHVzZXIuaWQ7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluKCkge1xuICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoVXNlci5nZXRTeXNBZG1pblVzZXIoKSk7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpYygpIHtcbiAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZEluKCkge1xuICAgIHJldHVybiB0aGlzLnVzZXIuaWQgIT09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzbnRTaWduZWRJbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzU2lnbmVkT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmlzbnRTaWduZWRJbigpO1xuICB9XG5cbiAgcHVibGljIGlzUHVibGljKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1NpZ25lZEluKCk7XG4gIH1cblxuICBwdWJsaWMgaXNTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09PSBVc2VyLlNZU19BRE1JTl9JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc250U3lzQWRtaW4oKSB7XG4gICAgcmV0dXJuICF0aGlzLmlzU3lzQWRtaW47XG4gIH1cblxuICBwdWJsaWMgaXNUZXN0VXNlcigpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy51c2VyLmVtYWlsICYmXG4gICAgICB0aGlzLnVzZXIuZW1haWwudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChlbnZpcm9ubWVudC50ZXN0VXNlckVtYWlsRG9tYWluKVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgaXNudFRlc3RVc2VyKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1Rlc3RVc2VyO1xuICB9XG5cbiAgcHVibGljIGlkSXMob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PSBvdGhlcklkO1xuICB9XG5cbiAgcHVibGljIGlkSXNudChvdGhlcklkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gIXRoaXMuaWRJcyhvdGhlcklkKTtcbiAgfVxuXG4gIHB1YmxpYyBkZW5pZWQoKSB7XG4gICAgbGV0IG1lc3NhZ2UgPSBcIklOVEVSTkFMIEVSUk9SOiBMYXN0IFVzZXJBY3Rpb25QZXJtaXNzaW9uIG5vdCByZWNvcmRlZC4gXCI7XG4gICAgbGV0IHZhbHVlczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBsYXN0VUFQID0gdGhpcy5hY3Rpb25IaXN0b3J5LnBvcCgpO1xuICAgIGlmIChsYXN0VUFQKSB7XG4gICAgICBtZXNzYWdlID0gYFlvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvICR7bGFzdFVBUC5kZXNjcmlwdGlvbn0uYDtcbiAgICAgIGxldCB1c2VyU3RyID0gYHVzZXJJZD0ke3RoaXMuaWR9YDtcbiAgICAgIGlmICh0aGlzLnVzZXIgJiYgdGhpcy51c2VyLmVtYWlsKSB7XG4gICAgICAgIHVzZXJTdHIgPSBgdXNlckVtYWlsPSR7dGhpcy51c2VyLmVtYWlsfSwgJHt1c2VyU3RyfWA7XG4gICAgICB9XG4gICAgICB2YWx1ZXMgPSBbXG4gICAgICAgIHVzZXJTdHIsXG4gICAgICAgIGBvYmplY3RJZD0ke2xhc3RVQVAub2JqZWN0SWR9YCxcbiAgICAgICAgYHVzZXJBY3Rpb249JHtsYXN0VUFQLnVzZXJBY3Rpb259YCxcbiAgICAgICAgYGNoZWNrZWRGb3JSb2xlTmFtZT0ke2xhc3RVQVAuY2hlY2tlZEZvclJvbGVOYW1lfWAsXG4gICAgICAgIGBjaGVja2VkQXQ9JHtsYXN0VUFQLmNoZWNrZWRBdH1gLFxuICAgICAgXTtcbiAgICB9XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgICB2YWx1ZXM6IHZhbHVlcyxcbiAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBtdXN0QmVTaWduZWRJbigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJZb3UgbXVzdCBiZSBzaWduZWQtaW4gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbi5cIixcbiAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBtdXN0QmVTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJZb3UgbXVzdCBiZSBhIFN5c3RlbSBBZG1pbmlzdHJhdG9yIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU3lzQWRtaW5PclRlc3RVc2VyKCkge1xuICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIllvdSBtdXN0IGJlIGEgU3lzdGVtIEFkbWluaXN0cmF0b3Igb3IgVGVzdCBVc2VyIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU2VsZigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJUaGlzIGFjdGlvbiBjYW4gb25seSBiZSBwZXJmb3JtZWQgb24geW91cnNlbGYgYXMgdGhlIHVzZXIuXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU3lzQWRtaW5PclNlbGYoKSB7XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiWW91IG11c3QgYmUgYSBTeXN0ZW0gQWRtaW5pc3RyYXRvciBvciB5b3Vyc2VsZiBhcyB0aGUgdXNlciB0byBwZXJmb3JtIHRoaXMgYWN0aW9uLlwiLFxuICAgICAgd2JDb2RlOiBcIldCX0ZPUkJJRERFTlwiLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gVEJEIG1vdmUgdG8gRWxhc3RpQ2FjaGVcbiAgcHJpdmF0ZSBnZXRPYmplY3RQZXJtaXNzaW9uKFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIHVzZXJBY3Rpb246IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZ1xuICApIHtcbiAgICBpZiAoXG4gICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XSAmJlxuICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl1cbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJvbGVMZXZlbDogcm9sZUxldmVsLFxuICAgICAgICB1c2VyQWN0aW9uOiB1c2VyQWN0aW9uLFxuICAgICAgICBvYmplY3RLZXk6IGtleSxcbiAgICAgICAgb2JqZWN0SWQ6XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl0ub2JrZWN0SWQsXG4gICAgICAgIGNoZWNrZWRGb3JSb2xlTmFtZTpcbiAgICAgICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXVxuICAgICAgICAgICAgLmNoZWNrZWRGb3JSb2xlTmFtZSxcbiAgICAgICAgcGVybWl0dGVkOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dLnBlcm1pdHRlZCxcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl0uZGVzY3JpcHRpb24sXG4gICAgICB9IGFzIFVzZXJBY3Rpb25QZXJtaXNzaW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyBUQkQgbW92ZSB0byBFbGFzdGlDYWNoZVxuICBwcml2YXRlIHNldE9iamVjdFBlcm1pc3Npb24odUFQOiBVc2VyQWN0aW9uUGVybWlzc2lvbikge1xuICAgIGlmICghdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFt1QVAucm9sZUxldmVsXVt1QVAub2JqZWN0SWRdKSB7XG4gICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3VBUC5yb2xlTGV2ZWxdW3VBUC5vYmplY3RJZF0gPSB7fTtcbiAgICB9XG4gICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFt1QVAucm9sZUxldmVsXVt1QVAub2JqZWN0SWRdW3VBUC51c2VyQWN0aW9uXSA9XG4gICAgICB7XG4gICAgICAgIHBlcm1pdHRlZDogdUFQLnBlcm1pdHRlZCxcbiAgICAgICAgY2hlY2tlZEZvclJvbGVOYW1lOiB1QVAuY2hlY2tlZEZvclJvbGVOYW1lLFxuICAgICAgICBkZXNjcmlwdGlvbjogdUFQLmRlc2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICByZXR1cm4gdUFQO1xuICB9XG5cbiAgcHJpdmF0ZSByZWNvcmRBY3Rpb25IaXN0b3J5KHVBUDogVXNlckFjdGlvblBlcm1pc3Npb24pIHtcbiAgICB1QVAuY2hlY2tlZEF0ID0gbmV3IERhdGUoKTtcbiAgICB0aGlzLmFjdGlvbkhpc3RvcnkucHVzaCh1QVApO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRVc2VyQWN0aW9uUG9saWN5KFxuICAgIHBvbGljeTogUmVjb3JkPHN0cmluZywgYW55PltdLFxuICAgIHVzZXJBY3Rpb246IHN0cmluZ1xuICApIHtcbiAgICBmb3IgKGNvbnN0IHVzZXJBY3Rpb25Qb2xpY3kgb2YgcG9saWN5KSB7XG4gICAgICBpZiAodXNlckFjdGlvblBvbGljeS51c2VyQWN0aW9uID09IHVzZXJBY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBY3Rpb25Qb2xpY3k7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRPYmplY3RMb29rdXBLZXkoXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICkge1xuICAgIGxldCBrZXk6IHN0cmluZyA9IG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCk7XG4gICAgaWYgKHR5cGVvZiBvYmplY3RJZE9yTmFtZSA9PT0gXCJudW1iZXJcIikge1xuICAgICAga2V5ID0gYGlkJHtvYmplY3RJZE9yTmFtZX1gO1xuICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0TmFtZSkge1xuICAgICAga2V5ID0gYCR7cGFyZW50T2JqZWN0TmFtZX0uJHtvYmplY3RJZE9yTmFtZX1gO1xuICAgIH1cbiAgICByZXR1cm4ga2V5O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNhbihcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmcsXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGlmICh0aGlzLmlzU3lzQWRtaW4oKSkgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcG9saWN5ID0gREVGQVVMVF9QT0xJQ1lbdXNlckFjdGlvbl07XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGN1cnJlbnRVc2VyLmNhbigke3VzZXJBY3Rpb259LCR7b2JqZWN0SWRPck5hbWV9KSBwb2xpY3k6JHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgcG9saWN5XG4gICAgICApfWBcbiAgICApO1xuICAgIGlmICghcG9saWN5KSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE5vIHBvbGljeSBmb3VuZCBmb3IgdXNlckFjdGlvbj0ke3VzZXJBY3Rpb259YDtcbiAgICAgIGxvZy5lcnJvcihtZXNzYWdlKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICB9XG4gICAgbGV0IGtleSA9IHRoaXMuZ2V0T2JqZWN0TG9va3VwS2V5KG9iamVjdElkT3JOYW1lLCBwYXJlbnRPYmplY3ROYW1lKTtcbiAgICBjb25zdCBhbHJlYWR5Q2hlY2tlZCA9IHRoaXMuZ2V0T2JqZWN0UGVybWlzc2lvbihcbiAgICAgIHBvbGljeS5yb2xlTGV2ZWwsXG4gICAgICB1c2VyQWN0aW9uLFxuICAgICAga2V5XG4gICAgKTtcbiAgICBpZiAoYWxyZWFkeUNoZWNrZWQgIT09IG51bGwpIHtcbiAgICAgIHRoaXMucmVjb3JkQWN0aW9uSGlzdG9yeShhbHJlYWR5Q2hlY2tlZCk7XG4gICAgICByZXR1cm4gYWxyZWFkeUNoZWNrZWQucGVybWl0dGVkO1xuICAgIH1cbiAgICBjb25zdCByb2xlUmVzdWx0ID0gYXdhaXQgdGhpcy53YkNsb3VkLnJvbGVBbmRJZEZvclVzZXJPYmplY3QoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgdGhpcy5pZCxcbiAgICAgIHBvbGljeS5yb2xlTGV2ZWwsXG4gICAgICBvYmplY3RJZE9yTmFtZSxcbiAgICAgIHBhcmVudE9iamVjdE5hbWVcbiAgICApO1xuICAgIGlmICghcm9sZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYEVycm9yIGdldHRpbmcgcm9sZU5hbWVGb3JVc2VyT2JqZWN0KCR7dGhpcy5pZH0sJHtcbiAgICAgICAgcG9saWN5LnJvbGVMZXZlbFxuICAgICAgfSwke29iamVjdElkT3JOYW1lfSwke3BhcmVudE9iamVjdE5hbWV9KS4gJHtKU09OLnN0cmluZ2lmeShyb2xlUmVzdWx0KX1gO1xuICAgICAgbG9nLmVycm9yKG1lc3NhZ2UpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgIH1cbiAgICBpZiAoIXJvbGVSZXN1bHQucGF5bG9hZC5vYmplY3RJZCkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBPYmplY3RJZCBjb3VsZCBub3QgYmUgZm91bmRgO1xuICAgICAgbG9nLmVycm9yKG1lc3NhZ2UpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgIH1cbiAgICBsZXQgcGVybWl0dGVkID0gZmFsc2U7XG4gICAgaWYgKFxuICAgICAgcm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lICYmXG4gICAgICBwb2xpY3kucGVybWl0dGVkUm9sZXMuaW5jbHVkZXMocm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lKVxuICAgICkge1xuICAgICAgcGVybWl0dGVkID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgdUFQOiBVc2VyQWN0aW9uUGVybWlzc2lvbiA9IHtcbiAgICAgIHJvbGVMZXZlbDogcG9saWN5LnJvbGVMZXZlbCxcbiAgICAgIG9iamVjdEtleToga2V5LFxuICAgICAgb2JqZWN0SWQ6IHJvbGVSZXN1bHQucGF5bG9hZC5vYmplY3RJZCxcbiAgICAgIHVzZXJBY3Rpb246IHVzZXJBY3Rpb24sXG4gICAgICBwZXJtaXR0ZWQ6IHBlcm1pdHRlZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBwb2xpY3kuZGVzY3JpcHRpb24sXG4gICAgfTtcbiAgICBpZiAocm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lKSB7XG4gICAgICB1QVAuY2hlY2tlZEZvclJvbGVOYW1lID0gcm9sZVJlc3VsdC5wYXlsb2FkLnJvbGVOYW1lO1xuICAgIH1cbiAgICB0aGlzLnNldE9iamVjdFBlcm1pc3Npb24odUFQKTtcbiAgICB0aGlzLnJlY29yZEFjdGlvbkhpc3RvcnkodUFQKTtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcm9sZTogJHtKU09OLnN0cmluZ2lmeShyb2xlUmVzdWx0LnBheWxvYWQpfSBwZXJtaXR0ZWQ6ICR7cGVybWl0dGVkfWBcbiAgICApO1xuICAgIHJldHVybiBwZXJtaXR0ZWQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY2FudChcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmcsXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGNhbiA9IGF3YWl0IHRoaXMuY2FuKHVzZXJBY3Rpb24sIG9iamVjdElkT3JOYW1lLCBwYXJlbnRPYmplY3ROYW1lKTtcbiAgICByZXR1cm4gIWNhbjtcbiAgfVxuXG4gIC8vIGFzeW5jIG9ubHkgcmVxdWlyZWQgdG8gbG9va3VwIHVzZXJJZCBmcm9tIGVtYWlsIHdoZW4gdGVzdGluZ1xuICBwdWJsaWMgc3RhdGljIGFzeW5jIGZyb21Db250ZXh0KGNvbnRleHQ6IGFueSk6IFByb21pc2U8Q3VycmVudFVzZXI+IHtcbiAgICAvL2xvZy5pbmZvKFwiPT09PT09PT09PSBIRUFERVJTOiBcIiArIEpTT04uc3RyaW5naWZ5KGhlYWRlcnMpKTtcbiAgICBjb25zdCBoZWFkZXJzTG93ZXJDYXNlID0gT2JqZWN0LmVudHJpZXMoXG4gICAgICBjb250ZXh0LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICAgICkucmVkdWNlKFxuICAgICAgKGFjYzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgW2tleSwgdmFsXSkgPT4gKFxuICAgICAgICAoYWNjW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbCksIGFjY1xuICAgICAgKSxcbiAgICAgIHt9XG4gICAgKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKFxuICAgICAgLy8gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT0gXCJkZXZlbG9wbWVudFwiICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl1cbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVEVTVCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1lbWFpbFwiXX1gXG4gICAgICApO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUVtYWlsKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl1cbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnBheWxvYWQgJiYgcmVzdWx0LnBheWxvYWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihyZXN1bHQucGF5bG9hZCwgY29udGV4dC53YkNsb3VkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkbid0IGZpbmQgdXNlciBmb3IgdGVzdCBlbWFpbCB4LXRlc3QtdXNlci1lbWFpbD0ke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1lbWFpbFwiXX1gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoVXNlci5nZXRQdWJsaWNVc2VyKCksIGNvbnRleHQud2JDbG91ZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXS50b0xvd2VyQ2FzZSgpID09IFwiYWRtaW5cIlxuICAgICkge1xuICAgICAgbG9nLmRlYnVnKFwiPT09PT09PT09PSBGT1VORCBTWVNBRE1JTiBVU0VSXCIpO1xuICAgICAgcmV0dXJuIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCk7XG4gICAgfSBlbHNlIGlmIChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSkge1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5SWQoXG4gICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgIHBhcnNlSW50KGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKVxuICAgICAgKTtcbiAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiByZXN1bHQucGF5bG9hZCAmJiByZXN1bHQucGF5bG9hZC5pZCkge1xuICAgICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKHJlc3VsdC5wYXlsb2FkLCBjb250ZXh0LndiQ2xvdWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nLmVycm9yKFxuICAgICAgICAgIGBDdXJyZW50VXNlci5mcm9tQ29udGV4dDogQ291bGRuJ3QgZmluZCB1c2VyIGZvciB4LWhhc3VyYS11c2VyLWlkPSR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKFVzZXIuZ2V0UHVibGljVXNlcigpLCBjb250ZXh0LndiQ2xvdWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUQkQ6IHN1cHBvcnQgZm9yIHB1YmxpYyB1c2Vyc1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkIG5vdCBmaW5kIGhlYWRlcnMgZm9yIEFkbWluLCBUZXN0IG9yIFVzZXIgaW46ICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgY29udGV4dC5oZWFkZXJzXG4gICAgICAgICl9YFxuICAgICAgKTtcbiAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoVXNlci5nZXRQdWJsaWNVc2VyKCksIGNvbnRleHQud2JDbG91ZCk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIE9yZ2FuaXphdGlvbiB7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogUm9sZTtcbiAgc2V0dGluZ3M/OiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb24+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25zID0gQXJyYXk8T3JnYW5pemF0aW9uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9ucy5wdXNoKE9yZ2FuaXphdGlvbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uID0gbmV3IE9yZ2FuaXphdGlvbigpO1xuICAgIG9yZ2FuaXphdGlvbi5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIG9yZ2FuaXphdGlvbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIG9yZ2FuaXphdGlvbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgb3JnYW5pemF0aW9uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBvcmdhbml6YXRpb24udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNldHRpbmdzKSBvcmdhbml6YXRpb24uc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgb3JnYW5pemF0aW9uLnJvbGUgPSBuZXcgUm9sZShkYXRhLnJvbGVfbmFtZSwgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgb3JnYW5pemF0aW9uLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3JnYW5pemF0aW9uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIE9yZ2FuaXphdGlvblVzZXIge1xuICBvcmdhbml6YXRpb25JZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tcm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlITogUm9sZTtcbiAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZztcbiAgdXNlckVtYWlsPzogc3RyaW5nO1xuICB1c2VyRmlyc3ROYW1lPzogc3RyaW5nO1xuICB1c2VyTGFzdE5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb25Vc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb25Vc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblVzZXJzID0gQXJyYXk8T3JnYW5pemF0aW9uVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIG9yZ2FuaXphdGlvblVzZXJzLnB1c2goT3JnYW5pemF0aW9uVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBPcmdhbml6YXRpb25Vc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvblVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uVXNlciA9IG5ldyBPcmdhbml6YXRpb25Vc2VyKCk7XG4gICAgb3JnYW5pemF0aW9uVXNlci5vcmdhbml6YXRpb25JZCA9IGRhdGEub3JnYW5pemF0aW9uX2lkO1xuICAgIG9yZ2FuaXphdGlvblVzZXIudXNlcklkID0gcGFyc2VJbnQoZGF0YS51c2VyX2lkKTtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGVJZCA9IHBhcnNlSW50KGRhdGEucm9sZV9pZCk7XG4gICAgaWYgKGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpIHtcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIuaW1wbGllZEZyb21yb2xlSWQgPSBwYXJzZUludChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKTtcbiAgICB9XG4gICAgb3JnYW5pemF0aW9uVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgb3JnYW5pemF0aW9uVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX2lkKTtcbiAgICBpZiAoZGF0YS5vcmdhbml6YXRpb25fbmFtZSlcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIub3JnYW5pemF0aW9uTmFtZSA9IGRhdGEub3JnYW5pemF0aW9uX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9lbWFpbCkgb3JnYW5pemF0aW9uVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKVxuICAgICAgb3JnYW5pemF0aW9uVXNlci51c2VyRmlyc3ROYW1lID0gZGF0YS51c2VyX2ZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9sYXN0X25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnVzZXJMYXN0TmFtZSA9IGRhdGEudXNlcl9sYXN0X25hbWU7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGUgPSBuZXcgUm9sZShcbiAgICAgICAgZGF0YS5yb2xlX25hbWUsXG4gICAgICAgIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsXG4gICAgICApO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgb3JnYW5pemF0aW9uVXNlci5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvblVzZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBERUZBVUxUX1BPTElDWSB9IGZyb20gXCIuLi9wb2xpY3lcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbi8qKlxuICogU0NIRU1BXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGFuIG9yZ2FuaXphdGlvblxuICogICAtIEFsbCBhZG1pbmlzdHJhdG9ycyBvZiB0aGUgb3JnYW5pemF0aW9uIGhhdmUgaW1wbGljaXQgYWRtaW4gYWNjZXNzXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGEgdXNlciwgdGhlIHVzZXIgaGFzIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogICAtIEFkZGl0aW9uYWwgdXNlcnMgY2FuIGJlIGdyYW50ZWQgYWRtaW4gYWNjZXNzIGV4cGxpY2l0bHlcbiAqL1xuXG5leHBvcnQgdHlwZSBSb2xlTGV2ZWwgPSBcIm9yZ2FuaXphdGlvblwiIHwgXCJzY2hlbWFcIiB8IFwidGFibGVcIjtcblxuZXhwb3J0IHR5cGUgVXNlckFjdGlvblBlcm1pc3Npb24gPSB7XG4gIHJvbGVMZXZlbDogUm9sZUxldmVsO1xuICB1c2VyQWN0aW9uOiBzdHJpbmc7XG4gIG9iamVjdEtleT86IHN0cmluZztcbiAgb2JqZWN0SWQ6IG51bWJlcjtcbiAgY2hlY2tlZEZvclJvbGVOYW1lPzogc3RyaW5nO1xuICBwZXJtaXR0ZWQ6IGJvb2xlYW47XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IERhdGU7XG59O1xuXG5leHBvcnQgY2xhc3MgUm9sZSB7XG4gIHN0YXRpYyBTWVNST0xFU19PUkdBTklaQVRJT05TOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiA9IHtcbiAgICBvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcjoge1xuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEFkbWluaXN0cmF0b3JcIixcbiAgICB9LFxuICAgIG9yZ2FuaXphdGlvbl91c2VyOiB7IGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBVc2VyXCIgfSxcbiAgICBvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlcjoge1xuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEV4dGVybmFsIFVzZXJcIixcbiAgICB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19TQ0hFTUFTOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PiA9IHtcbiAgICBzY2hlbWFfb3duZXI6IHsgbGFiZWw6IFwiREIgT3duZXJcIiB9LFxuICAgIHNjaGVtYV9hZG1pbmlzdHJhdG9yOiB7XG4gICAgICBsYWJlbDogXCJEQiBBZG1pbmlzdHJhdG9yXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gICAgfSxcbiAgICBzY2hlbWFfbWFuYWdlcjogeyBsYWJlbDogXCJEQiBNYW5hZ2VyXCIgfSxcbiAgICBzY2hlbWFfZWRpdG9yOiB7IGxhYmVsOiBcIkRCIEVkaXRvclwiIH0sXG4gICAgc2NoZW1hX3JlYWRlcjogeyBsYWJlbDogXCJEQiBSZWFkZXJcIiB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19UQUJMRVM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge1xuICAgIHRhYmxlX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIEFkbWluaXN0cmF0b3JcIixcbiAgICAgIGltcGxpZWRGcm9tOiBbXCJzY2hlbWFfb3duZXJcIiwgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXSxcbiAgICB9LFxuICAgIHRhYmxlX21hbmFnZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIE1hbmFnZXJcIixcbiAgICAgIGltcGxpZWRGcm9tOiBbXCJzY2hlbWFfbWFuYWdlclwiXSxcbiAgICB9LFxuICAgIHRhYmxlX2VkaXRvcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgRWRpdG9yXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX2VkaXRvclwiXSxcbiAgICB9LFxuICAgIHRhYmxlX3JlYWRlcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgUmVhZGVyXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX3JlYWRlclwiXSxcbiAgICB9LFxuICB9O1xuXG4gIHN0YXRpYyBzeXNSb2xlTWFwKGZyb206IFJvbGVMZXZlbCwgdG86IFJvbGVMZXZlbCkge1xuICAgIGxldCB0b1JvbGVEZWZpbml0aW9uczogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7fTtcbiAgICBsZXQgbWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgc3dpdGNoICh0bykge1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB0b1JvbGVEZWZpbml0aW9ucyA9IFJvbGUuU1lTUk9MRVNfVEFCTEVTO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHRvUm9sZURlZmluaXRpb25zID0gUm9sZS5TWVNST0xFU19TQ0hFTUFTO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgZm9yIChjb25zdCB0b1JvbGVOYW1lIG9mIE9iamVjdC5rZXlzKHRvUm9sZURlZmluaXRpb25zKSkge1xuICAgICAgaWYgKHRvUm9sZURlZmluaXRpb25zW3RvUm9sZU5hbWVdLmltcGxpZWRGcm9tKSB7XG4gICAgICAgIGZvciAoY29uc3QgZnJvbVJvbGVOYW1lIG9mIHRvUm9sZURlZmluaXRpb25zW3RvUm9sZU5hbWVdLmltcGxpZWRGcm9tKSB7XG4gICAgICAgICAgbWFwW2Zyb21Sb2xlTmFtZV0gPSB0b1JvbGVOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtYXA7XG4gIH1cblxuICBzdGF0aWMgSEFTVVJBX1BSRUZJWEVTX0FDVElPTlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgczogXCJzZWxlY3RcIixcbiAgICBpOiBcImluc2VydFwiLFxuICAgIHU6IFwidXBkYXRlXCIsXG4gICAgZDogXCJkZWxldGVcIixcbiAgfTtcblxuICBpZD86IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdD86IERhdGU7XG4gIHVwZGF0ZWRBdD86IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgaW1wbGllZEZyb20/OiBTdHJpbmc7XG4gIHBlcm1pc3Npb25zPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCByb2xlTGV2ZWw/OiBSb2xlTGV2ZWwpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMucGVybWlzc2lvbnMgPSBSb2xlLmdldFBlcm1pc3Npb25zKFxuICAgICAgREVGQVVMVF9QT0xJQ1ksXG4gICAgICB0aGlzLm5hbWUsXG4gICAgICByb2xlTGV2ZWxcbiAgICApO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRQZXJtaXNzaW9ucyhcbiAgICBwb2xpY3k6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+LFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsPzogUm9sZUxldmVsXG4gICkge1xuICAgIGNvbnN0IHBlcm1pc3Npb25zOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICAgIGZvciAoY29uc3QgdXNlckFjdGlvbiBvZiBPYmplY3Qua2V5cyhwb2xpY3kpKSB7XG4gICAgICBpZiAoXG4gICAgICAgIHJvbGVMZXZlbCAmJlxuICAgICAgICAocG9saWN5W3VzZXJBY3Rpb25dLnJvbGVMZXZlbCBhcyBSb2xlTGV2ZWwpICE9IHJvbGVMZXZlbFxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcGVybWlzc2lvbnNbdXNlckFjdGlvbl0gPVxuICAgICAgICBwb2xpY3lbdXNlckFjdGlvbl0ucGVybWl0dGVkUm9sZXMuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgIH1cbiAgICByZXR1cm4gcGVybWlzc2lvbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGlzUm9sZShyb2xlTmFtZTogc3RyaW5nLCByb2xlTGV2ZWw/OiBSb2xlTGV2ZWwpOiBib29sZWFuIHtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBjYXNlIFwic2NoZW1hXCI6XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1NDSEVNQVMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGNhc2UgXCJ0YWJsZVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1NDSEVNQVMpLmluY2x1ZGVzKHJvbGVOYW1lKSB8fFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKS5pbmNsdWRlcyhyb2xlTmFtZSlcbiAgICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGFyZVJvbGVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IHJvbGVOYW1lIG9mIHJvbGVOYW1lcykge1xuICAgICAgaWYgKCFSb2xlLmlzUm9sZShyb2xlTmFtZSkpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHRhYmxlUGVybWlzc2lvblByZWZpeGVzKHJvbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgcHJlZml4ZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKFxuICAgICAgREVGQVVMVF9QT0xJQ1lbXCJyZWFkX2FuZF93cml0ZV90YWJsZV9yZWNvcmRzXCJdLnBlcm1pdHRlZFJvbGVzLmluY2x1ZGVzKFxuICAgICAgICByb2xlTmFtZVxuICAgICAgKVxuICAgICkge1xuICAgICAgYWN0aW9ucyA9IERFRkFVTFRfUE9MSUNZW1wicmVhZF9hbmRfd3JpdGVfdGFibGVfcmVjb3Jkc1wiXS5oYXN1cmFBY3Rpb25zO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBERUZBVUxUX1BPTElDWVtcInJlYWRfdGFibGVfcmVjb3Jkc1wiXS5wZXJtaXR0ZWRSb2xlcy5pbmNsdWRlcyhyb2xlTmFtZSlcbiAgICApIHtcbiAgICAgIGFjdGlvbnMgPSBERUZBVUxUX1BPTElDWVtcInJlYWRfdGFibGVfcmVjb3Jkc1wiXS5oYXN1cmFBY3Rpb25zO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG4gICAgICBjb25zdCBwcmVmaXggPSBPYmplY3Qua2V5cyhSb2xlLkhBU1VSQV9QUkVGSVhFU19BQ1RJT05TKS5maW5kKFxuICAgICAgICAoa2V5KSA9PiBSb2xlLkhBU1VSQV9QUkVGSVhFU19BQ1RJT05TW2tleV0gPT09IGFjdGlvblxuICAgICAgKTtcbiAgICAgIGlmIChwcmVmaXgpIHByZWZpeGVzLnB1c2gocHJlZml4KTtcbiAgICB9XG4gICAgcmV0dXJuIHByZWZpeGVzO1xuICB9XG5cbiAgLy8gZWcgW3sgcGVybWlzc2lvbktleTogczEyMzQsIGFjdGlvbjogXCJzZWxlY3RcIn0sXG4gIC8vIHsgcGVybWlzc2lvbktleTogaTEyMzQsIGFjdGlvbjogXCJpbnNlcnRcIn0uLi5cbiAgcHVibGljIHN0YXRpYyB0YWJsZVBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucyhcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdIHtcbiAgICBjb25zdCBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgcHJlZml4IG9mIE9iamVjdC5rZXlzKFJvbGUuSEFTVVJBX1BSRUZJWEVTX0FDVElPTlMpKSB7XG4gICAgICBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnMucHVzaCh7XG4gICAgICAgIHBlcm1pc3Npb25LZXk6IFJvbGUudGFibGVQZXJtaXNzaW9uS2V5KHByZWZpeCwgdGFibGVJZCksXG4gICAgICAgIGFjdGlvbjogUm9sZS5IQVNVUkFfUFJFRklYRVNfQUNUSU9OU1twcmVmaXhdLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHRhYmxlUGVybWlzc2lvbktleShcbiAgICBwZXJtaXNzaW9uUHJlZml4OiBzdHJpbmcsXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3Blcm1pc3Npb25QcmVmaXh9JHt0YWJsZUlkfWA7XG4gIH1cblxuICAvLyBVc2VkIHRvIGdlbmVyYXRlIHRoZSBIYXN1cmEgdGFibGUgcGVybWlzc2lvblxuICBwdWJsaWMgc3RhdGljIGhhc3VyYVRhYmxlUGVybWlzc2lvbkNoZWNrc0FuZFR5cGVzKFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBSZWNvcmQ8c3RyaW5nLCBhbnk+W10ge1xuICAgIGNvbnN0IGhhc3VyYVBlcm1pc3Npb25zQW5kQWN0aW9uczogUmVjb3JkPHN0cmluZywgYW55PltdID0gW107XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbiBvZiBSb2xlLnRhYmxlUGVybWlzc2lvbktleXNBbmRBY3Rpb25zKFxuICAgICAgdGFibGVJZFxuICAgICkpIHtcbiAgICAgIGhhc3VyYVBlcm1pc3Npb25zQW5kQWN0aW9ucy5wdXNoKHtcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrOiB7XG4gICAgICAgICAgX2V4aXN0czoge1xuICAgICAgICAgICAgX3RhYmxlOiB7IHNjaGVtYTogXCJ3YlwiLCBuYW1lOiBcInRhYmxlX3Blcm1pc3Npb25zXCIgfSxcbiAgICAgICAgICAgIF93aGVyZToge1xuICAgICAgICAgICAgICBfYW5kOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgdGFibGVfcGVybWlzc2lvbl9rZXk6IHtcbiAgICAgICAgICAgICAgICAgICAgX2VxOiBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbi5wZXJtaXNzaW9uS2V5LFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHsgdXNlcl9pZDogeyBfZXE6IFwiWC1IYXN1cmEtVXNlci1JZFwiIH0gfSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcGVybWlzc2lvblR5cGU6IHBlcm1pc3Npb25LZXlzQW5kQWN0aW9uLmFjdGlvbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gaGFzdXJhUGVybWlzc2lvbnNBbmRBY3Rpb25zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxSb2xlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGVzID0gQXJyYXk8Um9sZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHJvbGVzLnB1c2goUm9sZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBSb2xlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlJvbGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBSb2xlKGRhdGEubmFtZSk7XG4gICAgcm9sZS5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICByb2xlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICByb2xlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICByb2xlLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gcm9sZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWEge1xuICBzdGF0aWMgU1lTX1NDSEVNQV9OQU1FUzogc3RyaW5nW10gPSBbXG4gICAgXCJwdWJsaWNcIixcbiAgICBcImluZm9ybWF0aW9uX3NjaGVtYVwiLFxuICAgIFwiaGRiX2NhdGFsb2dcIixcbiAgICBcIndiXCIsXG4gIF07XG5cbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyO1xuICB1c2VyT3duZXJJZD86IG51bWJlcjtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogUm9sZTtcbiAgb3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nO1xuICB1c2VyT3duZXJFbWFpbD86IHN0cmluZztcbiAgc2V0dGluZ3M/OiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIHNjaGVtYS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHNjaGVtYS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgc2NoZW1hLm9yZ2FuaXphdGlvbk93bmVySWQgPSBkYXRhLm9yZ2FuaXphdGlvbl9vd25lcl9pZDtcbiAgICBzY2hlbWEudXNlck93bmVySWQgPSBkYXRhLnVzZXJfb3duZXJfaWQ7XG4gICAgc2NoZW1hLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBzY2hlbWEudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLm9yZ2FuaXphdGlvbl9vd25lcl9uYW1lKSB7XG4gICAgICBzY2hlbWEub3JnYW5pemF0aW9uT3duZXJOYW1lID0gZGF0YS5vcmdhbml6YXRpb25fb3duZXJfbmFtZTtcbiAgICB9XG4gICAgaWYgKGRhdGEudXNlcl9vd25lcl9lbWFpbCkgc2NoZW1hLnVzZXJPd25lckVtYWlsID0gZGF0YS51c2VyX293bmVyX2VtYWlsO1xuICAgIGlmIChkYXRhLnNldHRpbmdzKSBzY2hlbWEuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgc2NoZW1hLnJvbGUgPSBuZXcgUm9sZShkYXRhLnJvbGVfbmFtZSwgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgc2NoZW1hLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYVVzZXIge1xuICBzY2hlbWFJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tUm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlITogUm9sZTtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdXNlckVtYWlsPzogc3RyaW5nO1xuICB1c2VyRmlyc3ROYW1lPzogc3RyaW5nO1xuICB1c2VyTGFzdE5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWFVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWFVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYVVzZXJzID0gQXJyYXk8U2NoZW1hVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHNjaGVtYVVzZXJzLnB1c2goU2NoZW1hVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBTY2hlbWFVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYVVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hVXNlciA9IG5ldyBTY2hlbWFVc2VyKCk7XG4gICAgc2NoZW1hVXNlci5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hX2lkO1xuICAgIHNjaGVtYVVzZXIudXNlcklkID0gcGFyc2VJbnQoZGF0YS51c2VyX2lkKTtcbiAgICBzY2hlbWFVc2VyLnJvbGVJZCA9IHBhcnNlSW50KGRhdGEucm9sZV9pZCk7XG4gICAgaWYgKGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpIHtcbiAgICAgIHNjaGVtYVVzZXIuaW1wbGllZEZyb21Sb2xlSWQgPSBwYXJzZUludChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKTtcbiAgICB9XG4gICAgc2NoZW1hVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgc2NoZW1hVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHNjaGVtYVVzZXIuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9lbWFpbCkgc2NoZW1hVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKSBzY2hlbWFVc2VyLnVzZXJGaXJzdE5hbWUgPSBkYXRhLnVzZXJfZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2xhc3RfbmFtZSkgc2NoZW1hVXNlci51c2VyTGFzdE5hbWUgPSBkYXRhLnVzZXJfbGFzdF9uYW1lO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgc2NoZW1hVXNlci5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHNjaGVtYVVzZXIucm9sZS5pbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzY2hlbWFVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgQ29sdW1uLCBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGUge1xuICBpZCE6IG51bWJlcjtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHJvbGU/OiBSb2xlO1xuICBjb2x1bW5zITogW0NvbHVtbl07XG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHNldHRpbmdzPzogb2JqZWN0O1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGU+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlcyA9IEFycmF5PFRhYmxlPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdGFibGVzLnB1c2goVGFibGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFRhYmxlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlID0gbmV3IFRhYmxlKCk7XG4gICAgdGFibGUuaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICB0YWJsZS5zY2hlbWFJZCA9IGRhdGEuc2NoZW1hX2lkO1xuICAgIHRhYmxlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgdGFibGUubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHRhYmxlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYV9uYW1lO1xuICAgIGlmIChkYXRhLnNldHRpbmdzKSB0YWJsZS5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICB0YWJsZS5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgdGFibGUucm9sZS5pbXBsaWVkRnJvbSA9IGRhdGEucm9sZV9pbXBsaWVkX2Zyb207XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0YWJsZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBUYWJsZVVzZXIge1xuICB0YWJsZUlkITogbnVtYmVyO1xuICB1c2VySWQhOiBudW1iZXI7XG4gIHJvbGVJZCE6IG51bWJlcjtcbiAgaW1wbGllZEZyb21yb2xlSWQ/OiBudW1iZXI7XG4gIHNldHRpbmdzITogb2JqZWN0O1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIHJvbGUhOiBSb2xlO1xuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICB0YWJsZU5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgdXNlckZpcnN0TmFtZT86IHN0cmluZztcbiAgdXNlckxhc3ROYW1lPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGFibGVVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZVVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdGFibGVVc2VycyA9IEFycmF5PFRhYmxlVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlVXNlcnMucHVzaChUYWJsZVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRhYmxlVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZVVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlciA9IG5ldyBUYWJsZVVzZXIoKTtcbiAgICB0YWJsZVVzZXIudGFibGVJZCA9IHBhcnNlSW50KGRhdGEudGFibGVfaWQpO1xuICAgIHRhYmxlVXNlci51c2VySWQgPSBwYXJzZUludChkYXRhLnVzZXJfaWQpO1xuICAgIHRhYmxlVXNlci5yb2xlSWQgPSBwYXJzZUludChkYXRhLnJvbGVfaWQpO1xuICAgIGlmIChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKSB7XG4gICAgICB0YWJsZVVzZXIuaW1wbGllZEZyb21yb2xlSWQgPSBwYXJzZUludChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKTtcbiAgICB9XG4gICAgdGFibGVVc2VyLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICB0YWJsZVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHRhYmxlVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgaWYgKGRhdGEuc2NoZW1hX25hbWUpIHRhYmxlVXNlci5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS50YWJsZV9uYW1lKSB0YWJsZVVzZXIudGFibGVOYW1lID0gZGF0YS50YWJsZV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHRhYmxlVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKSB0YWJsZVVzZXIudXNlckZpcnN0TmFtZSA9IGRhdGEudXNlcl9maXJzdF9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfbGFzdF9uYW1lKSB0YWJsZVVzZXIudXNlckxhc3ROYW1lID0gZGF0YS51c2VyX2xhc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIHRhYmxlVXNlci5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgdGFibGVVc2VyLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGFibGVVc2VyO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgVVNFUl9NRVNTQUdFUyB9IGZyb20gXCIuLi9lbnZpcm9ubWVudFwiO1xuXG5leHBvcnQgY2xhc3MgVXNlciB7XG4gIHN0YXRpYyBTWVNfQURNSU5fSUQ6IG51bWJlciA9IDE7XG4gIHN0YXRpYyBQVUJMSUNfSUQ6IG51bWJlciA9IDI7XG5cbiAgaWQhOiBudW1iZXI7XG4gIGVtYWlsITogc3RyaW5nO1xuICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gIGxhc3ROYW1lPzogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB1c2VycyA9IEFycmF5PFVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB1c2Vycy5wdXNoKFVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICB1c2VyLmVtYWlsID0gZGF0YS5lbWFpbDtcbiAgICBpZiAoZGF0YS5maXJzdF9uYW1lKSB1c2VyLmZpcnN0TmFtZSA9IGRhdGEuZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5sYXN0X25hbWUpIHVzZXIubGFzdE5hbWUgPSBkYXRhLmxhc3RfbmFtZTtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0U3lzQWRtaW5Vc2VyKCk6IFVzZXIge1xuICAgIGNvbnN0IGRhdGU6IERhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHVzZXI6IFVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBVc2VyLlNZU19BRE1JTl9JRDtcbiAgICB1c2VyLmVtYWlsID0gXCJTWVNfQURNSU5AZXhhbXBsZS5jb21cIjtcbiAgICB1c2VyLmZpcnN0TmFtZSA9IFwiU1lTIEFkbWluXCI7XG4gICAgdXNlci5sYXN0TmFtZSA9IFwiU1lTIEFkbWluXCI7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRlO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0ZTtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0UHVibGljVXNlcigpOiBVc2VyIHtcbiAgICBjb25zdCBkYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1c2VyOiBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gVXNlci5QVUJMSUNfSUQ7XG4gICAgdXNlci5lbWFpbCA9IFwiUFVCTElDQGV4YW1wbGUuY29tXCI7XG4gICAgdXNlci5maXJzdE5hbWUgPSBcIlB1YmxpYyBVc2VyXCI7XG4gICAgdXNlci5sYXN0TmFtZSA9IFwiUHVibGljIFVzZXJcIjtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGU7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRlO1xuICAgIHJldHVybiB1c2VyO1xuICB9XG59XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9Sb2xlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Vc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9DdXJyZW50VXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vT3JnYW5pemF0aW9uXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Pcmdhbml6YXRpb25Vc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1NjaGVtYVVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1RhYmxlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UYWJsZVVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL0NvbHVtblwiO1xuIiwidHlwZSBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogc3RyaW5nO1xuICBkYk5hbWU6IHN0cmluZztcbiAgZGJIb3N0OiBzdHJpbmc7XG4gIGRiUG9ydDogbnVtYmVyO1xuICBkYlVzZXI6IHN0cmluZztcbiAgZGJQYXNzd29yZDogc3RyaW5nO1xuICBkYlBvb2xNYXg6IG51bWJlcjtcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IG51bWJlcjtcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IG51bWJlcjtcbiAgaGFzdXJhSG9zdDogc3RyaW5nO1xuICBoYXN1cmFBZG1pblNlY3JldDogc3RyaW5nO1xuICB0ZXN0SWdub3JlRXJyb3JzOiBib29sZWFuO1xuICB0ZXN0VXNlckVtYWlsRG9tYWluOiBzdHJpbmc7XG4gIGRlbW9EQlByZWZpeDogc3RyaW5nO1xuICBkZW1vREJMYWJlbDogc3RyaW5nO1xufTtcblxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50OiBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogcHJvY2Vzcy5lbnYuU0VDUkVUX01FU1NBR0UgYXMgc3RyaW5nLFxuICBkYk5hbWU6IHByb2Nlc3MuZW52LkRCX05BTUUgYXMgc3RyaW5nLFxuICBkYkhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgYXMgc3RyaW5nLFxuICBkYlBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgXCJcIikgYXMgbnVtYmVyLFxuICBkYlVzZXI6IHByb2Nlc3MuZW52LkRCX1VTRVIgYXMgc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCBhcyBzdHJpbmcsXG4gIGRiUG9vbE1heDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NQVggfHwgXCJcIikgYXMgbnVtYmVyLFxuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9JRExFX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBwYXJzZUludChcbiAgICBwcm9jZXNzLmVudi5EQl9QT09MX0NPTk5FQ1RJT05fVElNRU9VVF9NSUxMSVMgfHwgXCJcIlxuICApIGFzIG51bWJlcixcbiAgaGFzdXJhSG9zdDogcHJvY2Vzcy5lbnYuSEFTVVJBX0hPU1QgYXMgc3RyaW5nLFxuICBoYXN1cmFBZG1pblNlY3JldDogcHJvY2Vzcy5lbnYuSEFTVVJBX0FETUlOX1NFQ1JFVCBhcyBzdHJpbmcsXG4gIHRlc3RJZ25vcmVFcnJvcnM6IChwcm9jZXNzLmVudi5URVNUX0lHTk9SRV9FUlJPUlMgfHwgZmFsc2UpIGFzIGJvb2xlYW4sXG4gIHRlc3RVc2VyRW1haWxEb21haW46IChcbiAgICAocHJvY2Vzcy5lbnYuVEVTVF9VU0VSX0VNQUlMX0RPTUFJTiB8fCBcIlwiKSBhcyBzdHJpbmdcbiAgKS50b0xvY2FsZUxvd2VyQ2FzZSgpLFxuICBkZW1vREJQcmVmaXg6IHByb2Nlc3MuZW52LkRFTU9fREJfUFJFRklYIGFzIHN0cmluZyxcbiAgZGVtb0RCTGFiZWw6IHByb2Nlc3MuZW52LkRFTU9fREJfTEFCRUwgYXMgc3RyaW5nLFxufTtcblxuLy8gd2JFcnJvckNvZGUgOiBbIG1lc3NhZ2UsIGFwb2xsb0Vycm9yQ29kZT8gXVxuZXhwb3J0IGNvbnN0IFVTRVJfTUVTU0FHRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgLy8gVXNlcnNcbiAgV0JfVVNFUl9FWElTVFM6IFtcIlRoaXMgdXNlciBhbHJlYWR5IGV4aXN0c1wiXSxcbiAgV0JfVVNFUl9OT1RfRk9VTkQ6IFtcIlVzZXIgbm90IGZvdW5kLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIHVzZXJzIHdlcmUgbm90IGZvdW5kLlwiXSxcbiAgV0JfUEFTU1dPUkRfUkVTRVRfSU5TVFJVQ1RJT05TX1NFTlQ6IFtcbiAgICBcIlBhc3N3b3JkIHJlc2V0IGluc3RydWN0aW9ucyBoYXZlIGJlZW4gc2VudCB0byB5b3VyIEUtbWFpbC5cIixcbiAgXSxcbiAgLy8gT3JnYW5pemF0aW9uc1xuICBXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EOiBbXCJPcmdhbml6YXRpb24gbm90IGZvdW5kLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9PUkdBTklaQVRJT05fVVJMX05PVF9GT1VORDogW1xuICAgIFwiVGhpcyBPcmdhbml6YXRpb24gVVJMIGNvdWxkIG5vdCBiZSBmb3VuZC4gUGxlYXNlIENoZWNrIHRoZSBzcGVsbGluZyBvdGhlcndpc2UgY29udGFjdCB5b3VyIFN5c3RlbSBBZG1pbmlzdHJhdG9yLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfT1JHQU5JWkFUSU9OX05BTUVfVEFLRU46IFtcbiAgICBcIlRoaXMgT3JnYW5pemF0aW9uIG5hbWUgaGFzIGFscmVhZHkgYmVlbiB0YWtlbi5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX09SR0FOSVpBVElPTl9OT1RfVVNFUl9FTVBUWTogW1xuICAgIFwiVGhpcyBvcmdhbml6YXRpb24gc3RpbGwgaGFzIG5vbi1hZG1pbmlzdHJhdGl2ZSB1c2Vycy5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX09SR0FOSVpBVElPTl9OT19BRE1JTlM6IFtcbiAgICBcIllvdSBjYW4gbm90IHJlbW92ZSBhbGwgQWRtaW5pc3RyYXRvcnMgZnJvbSBhbiBPcmdhbml6YXRpb24gLSB5b3UgbXVzdCBsZWF2ZSBhdCBsZWFzdCBvbmUuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9VU0VSX05PVF9JTl9PUkc6IFtcIlVzZXIgbXVzdCBiZSBpbiBPcmdhbml6YXRpb25cIl0sXG4gIFdCX1VTRVJfTk9UX1NDSEVNQV9PV05FUjogW1wiVGhlIGN1cnJlbnQgdXNlciBpcyBub3QgdGhlIG93bmVyLlwiXSxcbiAgV0JfT1JHQU5JWkFUSU9OX1VSTF9GT1JCSURERU46IFtcbiAgICBcIlNvcnJ5IHlvdSBkbyBub3QgaGF2ZSBhY2Nlc3MgdG8gdGhpcyBPcmdhbml6YXRpb24uIFBsZWFzZSBjb250YWN0IHlvdXIgU3lzdGVtIEFkbWluaXN0cmF0b3IuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICAvLyBTY2hlbWFzXG4gIFdCX05PX1NDSEVNQVNfRk9VTkQ6IFtcbiAgICBcIllvdSBkb27igJl0IGhhdmUgYWNjZXNzIHRvIGFueSBEYXRhYmFzZXMuIFBsZWFzZSBjb250YWN0IHlvdSBTeXN0ZW0gQWRtaW5pc3RyYXRvciBmb3IgYWNjZXNzIHRvIGFuIGV4aXN0aW5nIERhdGFiYXNlIG9yIGNyZWF0ZSBhIG5ldyBEYXRhYmFzZSBiZWxvdy5cIixcbiAgXSxcbiAgV0JfU0NIRU1BX05PVF9GT1VORDogW1wiRGF0YWJhc2UgY291bGQgbm90IGJlIGZvdW5kLlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9TQ0hFTUFfVVJMX05PVF9GT1VORDogW1xuICAgIFwiVGhpcyBEYXRhYmFzZSBVUkwgY291bGQgbm90IGJlIGZvdW5kLiBQbGVhc2UgQ2hlY2sgdGhlIHNwZWxsaW5nIG90aGVyd2lzZSBjb250YWN0IHlvdXIgU3lzdGVtIEFkbWluaXN0cmF0b3IuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9TQ0hFTUFfVVJMX0ZPUkJJRERFTjogW1xuICAgIFwiU29ycnkgeW91IGRvIG5vdCBoYXZlIGFjY2VzcyB0byB0aGlzIERhdGFiYXNlLiBQbGVhc2UgY29udGFjdCB5b3VyIFN5c3RlbSBBZG1pbmlzdHJhdG9yLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfQkFEX1NDSEVNQV9OQU1FOiBbXG4gICAgXCJEYXRhYmFzZSBuYW1lIGNhbiBub3QgYmVnaW4gd2l0aCAncGdfJyBvciBiZSBpbiB0aGUgcmVzZXJ2ZWQgbGlzdC5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX1NDSEVNQV9OQU1FX0VYSVNUUzogW1wiVGhpcyBTY2hlbWEgbmFtZSBhbHJlYWR5IGV4aXN0c1wiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfVVNFUl9PV05FUjogW1wiWW91IGNhbiBub3QgcmVtb3ZlIHRoZSBEQiBVc2VyIE93bmVyXCJdLFxuICBXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfQURNSU46IFtcbiAgICBcIllvdSBjYW4gbm90IHJlbW92ZSBhIERCIEFkbWluaXN0cmF0b3IgZnJvbSBvbmUgb3IgbW9yZSBpbmRpdmlkdWFsIHRhYmxlcy5cIixcbiAgXSxcbiAgLy8gU2NoZW1hcyBVc2Vyc1xuICBXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSBTY2hlbWEgVXNlcnMgbm90IGZvdW5kLlwiXSxcbiAgV0JfU0NIRU1BX05PX0FETUlOUzogW1xuICAgIFwiWW91IGNhbiBub3QgcmVtb3ZlIGFsbCBBZG1pbmlzdHJhdG9ycyBmcm9tIGEgc2NoZW1hIC0geW91IG11c3QgbGVhdmUgYXQgbGVhc3Qgb25lLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgLy8gVGFibGVzXG4gIFdCX1RBQkxFX05PVF9GT1VORDogW1wiVGFibGUgY291bGQgbm90IGJlIGZvdW5kLlwiXSxcbiAgV0JfVEFCTEVfTkFNRV9FWElTVFM6IFtcIlRoaXMgVGFibGUgbmFtZSBhbHJlYWR5IGV4aXN0c1wiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBDT0xVTU5fTk9UX0ZPVU5EOiBbXCJDb2x1bW4gY291bGQgbm90IGJlIGZvdW5kXCJdLFxuICBXQl9DT0xVTU5fTkFNRV9FWElTVFM6IFtcIlRoaXMgQ29sdW1uIG5hbWUgYWxyZWFkeSBleGlzdHMuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX1BLX0VYSVNUUzogW1wiUmVtb3ZlIGV4aXN0aW5nIHByaW1hcnkga2V5IGZpcnN0LlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9GS19FWElTVFM6IFtcbiAgICBcIlJlbW92ZSBleGlzdGluZyBmb3JlaWduIGtleSBvbiB0aGUgY29sdW1uIGZpcnN0XCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9OT19ERUZBVUxUX09OX0NPTFVNTjogW1wiVGhpcyBjb2x1bW4gZG9lcyBub3QgaGF2ZSBhIGRlZmF1bHQgdmFsdWUgc2V0XCJdLFxuICAvLyBUYWJsZSBVc2VycyxcbiAgV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSBUYWJsZSBVc2VycyBub3QgZm91bmQuXCJdLFxuICAvLyBSb2xlc1xuICBST0xFX05PVF9GT1VORDogW1wiVGhpcyByb2xlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG4gIFdCX0ZPUkJJRERFTjogW1wiWW91IGFyZSBub3QgcGVybWl0dGVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsIFwiRk9SQklEREVOXCJdLFxufTtcbiIsIi8vIGh0dHBzOi8vYWx0cmltLmlvL3Bvc3RzL2F4aW9zLWh0dHAtY2xpZW50LXVzaW5nLXR5cGVzY3JpcHRcblxuaW1wb3J0IGF4aW9zLCB7IEF4aW9zSW5zdGFuY2UsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IENvbHVtbiB9IGZyb20gXCIuL2VudGl0eVwiO1xuaW1wb3J0IHsgZW52aXJvbm1lbnQgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuaW1wb3J0IHsgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBlcnJSZXN1bHQsIGxvZyB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgXCJ4LWhhc3VyYS1hZG1pbi1zZWNyZXRcIjogZW52aXJvbm1lbnQuaGFzdXJhQWRtaW5TZWNyZXQsXG59O1xuXG5jbGFzcyBIYXN1cmFBcGkge1xuICBzdGF0aWMgSUdOT1JFX0VSUk9SUyA9IGZhbHNlO1xuICBzdGF0aWMgSEFTVVJBX0lHTk9SRV9DT0RFUzogc3RyaW5nW10gPSBbXG4gICAgXCJhbHJlYWR5LXVudHJhY2tlZFwiLFxuICAgIFwiYWxyZWFkeS10cmFja2VkXCIsXG4gICAgXCJub3QtZXhpc3RzXCIsIC8vIGRyb3BwaW5nIGEgcmVsYXRpb25zaGlwXG4gICAgXCJhbHJlYWR5LWV4aXN0c1wiLFxuICAgIFwidW5leHBlY3RlZFwiLFxuICAgIFwicGVybWlzc2lvbi1kZW5pZWRcIixcbiAgXTtcblxuICBwcml2YXRlIGluc3RhbmNlOiBBeGlvc0luc3RhbmNlIHwgbnVsbCA9IG51bGw7XG5cbiAgcHJpdmF0ZSBnZXQgaHR0cCgpOiBBeGlvc0luc3RhbmNlIHtcbiAgICByZXR1cm4gdGhpcy5pbnN0YW5jZSAhPSBudWxsID8gdGhpcy5pbnN0YW5jZSA6IHRoaXMuaW5pdEhhc3VyYUFwaSgpO1xuICB9XG5cbiAgaW5pdEhhc3VyYUFwaSgpIHtcbiAgICBjb25zdCBodHRwID0gYXhpb3MuY3JlYXRlKHtcbiAgICAgIGJhc2VVUkw6IGVudmlyb25tZW50Lmhhc3VyYUhvc3QsXG4gICAgICBoZWFkZXJzLFxuICAgICAgd2l0aENyZWRlbnRpYWxzOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIHRoaXMuaW5zdGFuY2UgPSBodHRwO1xuICAgIHJldHVybiBodHRwO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aWMgZXJySWdub3JlKCkge1xuICAgIGlmICh0aGlzLklHTk9SRV9FUlJPUlMgfHwgZW52aXJvbm1lbnQudGVzdElnbm9yZUVycm9ycykge1xuICAgICAgcmV0dXJuIHRoaXMuSEFTVVJBX0lHTk9SRV9DT0RFUztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcG9zdCh0eXBlOiBzdHJpbmcsIGFyZ3M6IFJlY29yZDxzdHJpbmcsIGFueT4pIHtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgdHJ5IHtcbiAgICAgIGxvZy5kZWJ1ZyhgaGFzdXJhQXBpLnBvc3Q6IHR5cGU6ICR7dHlwZX1gLCBhcmdzKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5odHRwLnBvc3Q8YW55LCBBeGlvc1Jlc3BvbnNlPihcbiAgICAgICAgXCIvdjEvbWV0YWRhdGFcIixcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgYXJnczogYXJncyxcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogcmVzcG9uc2UsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvci5yZXNwb25zZSAmJiBlcnJvci5yZXNwb25zZS5kYXRhKSB7XG4gICAgICAgIGlmICghSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKGVycm9yLnJlc3BvbnNlLmRhdGEuY29kZSkpIHtcbiAgICAgICAgICBsb2cuZXJyb3IoXG4gICAgICAgICAgICBcImVycm9yLnJlc3BvbnNlLmRhdGE6IFwiICsgSlNPTi5zdHJpbmdpZnkoZXJyb3IucmVzcG9uc2UuZGF0YSlcbiAgICAgICAgICApO1xuICAgICAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICAgICAgcmVmQ29kZTogZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0ID0ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgfSkgYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3RyYWNrX3RhYmxlXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3VudHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgY2FzY2FkZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWxhdGlvbnNoaXBzXG4gICAqL1xuXG4gIC8vIGEgcG9zdCBoYXMgb25lIGF1dGhvciAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLCAvLyBhdXRob3JfaWRcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKCR7c2NoZW1hTmFtZX0sICR7dGFibGVOYW1lfSwgJHtjb2x1bW5OYW1lfSwgJHtwYXJlbnRUYWJsZU5hbWV9KWBcbiAgICApO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2NyZWF0ZV9vYmplY3RfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIG5hbWU6IGBvYmpfJHt0YWJsZU5hbWV9XyR7cGFyZW50VGFibGVOYW1lfWAsIC8vIG9ial9wb3N0c19hdXRob3JzXG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgIH0sXG4gICAgICB1c2luZzoge1xuICAgICAgICBmb3JlaWduX2tleV9jb25zdHJhaW50X29uOiBjb2x1bW5OYW1lLCAvLyBhdXRob3JfaWRcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBhbiBhdXRob3IgaGFzIG1hbnkgcG9zdHMgKGNvbnN0cmFpbnQgcG9zdHMuYXV0aG9yX2lkIC0+IGF1dGhvcnMuaWQpXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVBcnJheVJlbGF0aW9uc2hpcChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIGF1dGhvcnNcbiAgICBjaGlsZFRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIGNoaWxkQ29sdW1uTmFtZXM6IHN0cmluZ1tdIC8vIGF1dGhvcl9pZFxuICApIHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKCR7c2NoZW1hTmFtZX0sICR7dGFibGVOYW1lfSwgJHtjaGlsZFRhYmxlTmFtZX0sICR7Y2hpbGRDb2x1bW5OYW1lc30pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX2FycmF5X3JlbGF0aW9uc2hpcFwiLCB7XG4gICAgICBuYW1lOiBgYXJyXyR7dGFibGVOYW1lfV8ke2NoaWxkVGFibGVOYW1lfWAsIC8vIGFycl9hdXRob3JzX3Bvc3RzXG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSwgLy8gYXV0aG9yc1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IHtcbiAgICAgICAgICBjb2x1bW46IGNoaWxkQ29sdW1uTmFtZXNbMF0sIC8vIGF1dGhvcl9pZFxuICAgICAgICAgIHRhYmxlOiB7XG4gICAgICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgICAgICBuYW1lOiBjaGlsZFRhYmxlTmFtZSwgLy8gcG9zdHNcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkcm9wUmVsYXRpb25zaGlwcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcgLy8gYXV0aG9yc1xuICApIHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfZHJvcF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICB9LFxuICAgICAgcmVsYXRpb25zaGlwOiBgb2JqXyR7dGFibGVOYW1lfV8ke3BhcmVudFRhYmxlTmFtZX1gLCAvLyBvYmpfcG9zdHNfYXV0aG9yc1xuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgKCFyZXN1bHQucmVmQ29kZSB8fFxuICAgICAgICAocmVzdWx0LnJlZkNvZGUgJiYgIUhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSkpKVxuICAgICkge1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfZHJvcF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgIH0sXG4gICAgICByZWxhdGlvbnNoaXA6IGBhcnJfJHtwYXJlbnRUYWJsZU5hbWV9XyR7dGFibGVOYW1lfWAsIC8vIGFycl9hdXRob3JzX3Bvc3RzXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogUGVybWlzc2lvbnNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVBlcm1pc3Npb24oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBlcm1pc3Npb25DaGVjazogb2JqZWN0LFxuICAgIHR5cGU6IHN0cmluZyxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbnM6IHN0cmluZ1tdXG4gICkge1xuICAgIGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICByb2xlOiByb2xlTmFtZSxcbiAgICAgIHBlcm1pc3Npb246IHtcbiAgICAgICAgY29sdW1uczogY29sdW1ucyxcbiAgICAgICAgLy8gZmlsdGVyOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICAgIC8vIGNoZWNrOiBwZXJtaXNzaW9uQ2hlY2ssXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gaHR0cHM6Ly9oYXN1cmEuaW8vZG9jcy9sYXRlc3QvZ3JhcGhxbC9jb3JlL2FwaS1yZWZlcmVuY2UvbWV0YWRhdGEtYXBpL3Blcm1pc3Npb24uaHRtbFxuICAgIGlmICh0eXBlID09IFwiaW5zZXJ0XCIpIHtcbiAgICAgIHBheWxvYWQucGVybWlzc2lvbi5jaGVjayA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9IGVsc2Uge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmZpbHRlciA9IHBlcm1pc3Npb25DaGVjaztcbiAgICB9XG4gICAgaWYgKHR5cGUgPT0gXCJzZWxlY3RcIikge1xuICAgICAgcGF5bG9hZC5wZXJtaXNzaW9uLmFsbG93X2FnZ3JlZ2F0aW9ucyA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChgcGdfY3JlYXRlXyR7dHlwZX1fcGVybWlzc2lvbmAsIHBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUGVybWlzc2lvbihcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lOiBzdHJpbmdcbiAgKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KGBwZ19kcm9wXyR7dHlwZX1fcGVybWlzc2lvbmAsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IHJvbGVOYW1lLFxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhc3VyYUFwaSA9IG5ldyBIYXN1cmFBcGkoKTtcbiIsImV4cG9ydCBjb25zdCBERUZBVUxUX1BPTElDWTogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7XG4gIC8vIE9yZ2FuaXphdGlvbnNcbiAgYWNjZXNzX29yZ2FuaXphdGlvbjoge1xuICAgIHJvbGVMZXZlbDogXCJvcmdhbml6YXRpb25cIixcbiAgICBkZXNjcmlwdGlvbjogXCJBY2Nlc3MgdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlclwiLFxuICAgICAgXCJvcmdhbml6YXRpb25fdXNlclwiLFxuICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIF0sXG4gIH0sXG4gIGFkbWluaXN0ZXJfb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFkbWluaXN0ZXIgdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIGVkaXRfb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkVkaXQgdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIG1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uOiB7XG4gICAgcm9sZUxldmVsOiBcIm9yZ2FuaXphdGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIk1hbmFnZSBBY2Nlc3MgdG8gdGhpcyBPcmdhbml6YXRpb25cIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIC8vIFNjaGVtYXNcbiAgcmVhZF9zY2hlbWE6IHtcbiAgICByb2xlTGV2ZWw6IFwic2NoZW1hXCIsXG4gICAgZGVzY3JpcHRpb246IFwiUmVhZCB0aGlzIFNjaGVtYVwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXG4gICAgICBcInNjaGVtYV9yZWFkZXJcIixcbiAgICAgIFwic2NoZW1hX21hbmFnZXJcIixcbiAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICAgIFwic2NoZW1hX293bmVyXCIsXG4gICAgXSxcbiAgfSxcbiAgYWx0ZXJfc2NoZW1hOiB7XG4gICAgcm9sZUxldmVsOiBcInNjaGVtYVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFsdGVyIHRoaXMgRGF0YWJhc2VcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1wic2NoZW1hX21hbmFnZXJcIiwgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiLCBcInNjaGVtYV9vd25lclwiXSxcbiAgfSxcbiAgbWFuYWdlX2FjY2Vzc190b19zY2hlbWE6IHtcbiAgICByb2xlTGV2ZWw6IFwic2NoZW1hXCIsXG4gICAgZGVzY3JpcHRpb246IFwiTWFuYWdlIEFjY2VzcyB0byB0aGlzIERhdGFiYXNlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsIFwic2NoZW1hX293bmVyXCJdLFxuICB9LFxuICAvLyBUYWJsZXNcbiAgcmVhZF90YWJsZToge1xuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgdGhpcyBUYWJsZVwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXG4gICAgICBcInRhYmxlX3JlYWRlclwiLFxuICAgICAgXCJ0YWJsZV9lZGl0b3JcIixcbiAgICAgIFwidGFibGVfbWFuYWdlclwiLFxuICAgICAgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSxcbiAgfSxcbiAgYWx0ZXJfdGFibGU6IHtcbiAgICByb2xlTGV2ZWw6IFwidGFibGVcIixcbiAgICBkZXNjcmlwdGlvbjogXCJBbHRlciB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX21hbmFnZXJcIiwgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICBtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiTWFuYWdlIEFjY2VzcyB0byB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIHJlYWRfdGFibGVfcmVjb3Jkczoge1xuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgUmVjb3JkcyBmcm9tIHRoaXMgVGFibGVcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJ0YWJsZV9yZWFkZXJcIixcbiAgICAgIFwidGFibGVfZWRpdG9yXCIsXG4gICAgICBcInRhYmxlX21hbmFnZXJcIixcbiAgICAgIFwidGFibGVfYWRtaW5pc3RyYXRvclwiLFxuICAgIF0sXG4gICAgaGFzdXJhQWN0aW9uczogW1wic2VsZWN0XCJdLFxuICB9LFxuICByZWFkX2FuZF93cml0ZV90YWJsZV9yZWNvcmRzOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiUmVhZCBhbmQgV3JpdGUgUmVjb3JkcyB0byB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX2VkaXRvclwiLCBcInRhYmxlX21hbmFnZXJcIiwgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCJdLFxuICAgIGhhc3VyYUFjdGlvbnM6IFtcInNlbGVjdFwiLCBcImluc2VydFwiLCBcInVwZGF0ZVwiLCBcImRlbGV0ZVwiXSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyB0eXBlRGVmcyBhcyBTY2hlbWEsIHJlc29sdmVycyBhcyBzY2hlbWFSZXNvbHZlcnMgfSBmcm9tIFwiLi9zY2hlbWFcIjtcbmltcG9ydCB7XG4gIHR5cGVEZWZzIGFzIE9yZ2FuaXphdGlvbixcbiAgcmVzb2x2ZXJzIGFzIG9yZ2FuaXphdGlvblJlc29sdmVycyxcbn0gZnJvbSBcIi4vb3JnYW5pemF0aW9uXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyBhcyBVc2VyLCByZXNvbHZlcnMgYXMgdXNlclJlc29sdmVycyB9IGZyb20gXCIuL3VzZXJcIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFRhYmxlLCByZXNvbHZlcnMgYXMgdGFibGVSZXNvbHZlcnMgfSBmcm9tIFwiLi90YWJsZVwiO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tIFwibG9kYXNoXCI7XG5pbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7XG4gIGNvbnN0cmFpbnREaXJlY3RpdmUsXG4gIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbn0gZnJvbSBcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIjtcbmltcG9ydCB7IG1ha2VFeGVjdXRhYmxlU2NoZW1hIH0gZnJvbSBcImdyYXBocWwtdG9vbHNcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnk7IG1lc3NhZ2U/OiBzdHJpbmcgfVxuICB8IHtcbiAgICAgIHN1Y2Nlc3M/OiBmYWxzZTtcbiAgICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gICAgICByZWZDb2RlPzogc3RyaW5nO1xuICAgICAgd2JDb2RlPzogc3RyaW5nO1xuICAgICAgYXBvbGxvRXJyb3JDb2RlPzogc3RyaW5nO1xuICAgICAgdmFsdWVzPzogc3RyaW5nW107XG4gICAgfTtcblxuZXhwb3J0IHR5cGUgUXVlcnlQYXJhbXMgPSB7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHBhcmFtcz86IGFueVtdO1xufTtcblxuZXhwb3J0IHR5cGUgQ29uc3RyYWludElkID0ge1xuICBjb25zdHJhaW50TmFtZTogc3RyaW5nO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgY29sdW1uTmFtZTogc3RyaW5nO1xuICByZWxUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIHJlbENvbHVtbk5hbWU/OiBzdHJpbmc7XG59O1xuXG5jb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogSlNPTiFcbiAgICB3YkNsb3VkQ29udGV4dDogSlNPTiFcbiAgfVxuXG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiVXRpbChmbjogU3RyaW5nISwgdmFsczogSlNPTik6IEpTT04hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGNvbnRleHQuaGVhZGVycyxcbiAgICAgIH07XG4gICAgfSxcbiAgICB3YkNsb3VkQ29udGV4dDogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gY29udGV4dC53YkNsb3VkLmNsb3VkQ29udGV4dCgpO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JVdGlsOiBhc3luYyAoXywgeyBmbiwgdmFscyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnV0aWwoY3VycmVudFVzZXIsIGZuLCB2YWxzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcbiAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBzY2hlbWEgPSBtYWtlRXhlY3V0YWJsZVNjaGVtYSh7XG4gIHR5cGVEZWZzOiBbXG4gICAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxuICAgIHR5cGVEZWZzLFxuICAgIE9yZ2FuaXphdGlvbixcbiAgICBVc2VyLFxuICAgIFNjaGVtYSxcbiAgICBUYWJsZSxcbiAgXSxcbiAgcmVzb2x2ZXJzOiBtZXJnZShcbiAgICByZXNvbHZlcnMsXG4gICAgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxuICAgIHVzZXJSZXNvbHZlcnMsXG4gICAgc2NoZW1hUmVzb2x2ZXJzLFxuICAgIHRhYmxlUmVzb2x2ZXJzXG4gICksXG4gIHNjaGVtYVRyYW5zZm9ybXM6IFtjb25zdHJhaW50RGlyZWN0aXZlKCldLFxufSk7XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIE9yZ2FuaXphdGlvbiB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBPcmdhbml6YXRpb25Vc2VyIHtcbiAgICBvcmdhbml6YXRpb25JZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbnNcbiAgICBcIlwiXCJcbiAgICB3Yk15T3JnYW5pemF0aW9ucyh3aXRoU2V0dGluZ3M6IEJvb2xlYW4pOiBbT3JnYW5pemF0aW9uXVxuICAgIHdiTXlPcmdhbml6YXRpb25CeU5hbWUobmFtZTogU3RyaW5nISwgd2l0aFNldHRpbmdzOiBCb29sZWFuKTogT3JnYW5pemF0aW9uXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWUobmFtZTogU3RyaW5nISk6IE9yZ2FuaXphdGlvblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiT3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICByb2xlTmFtZXM6IFtTdHJpbmddXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXVxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW09yZ2FuaXphdGlvblVzZXJdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uc1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEsIGxhYmVsOiBTdHJpbmchKTogT3JnYW5pemF0aW9uXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb24oXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBuZXdOYW1lOiBTdHJpbmdcbiAgICAgIG5ld0xhYmVsOiBTdHJpbmdcbiAgICApOiBPcmdhbml6YXRpb25cbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBTdHJpbmchKTogQm9vbGVhblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlTmFtZTogU3RyaW5nIVxuICAgICk6IEJvb2xlYW5cbiAgICB3YlJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddIVxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICk6IEJvb2xlYW5cbiAgICB3YlNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIC8vIE9yZ2FuaXphdGlvbnNcbiAgICB3Yk15T3JnYW5pemF0aW9uczogYXN5bmMgKF8sIHsgd2l0aFNldHRpbmdzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWNjZXNzaWJsZU9yZ2FuaXphdGlvbnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk15T3JnYW5pemF0aW9uQnlOYW1lOiBhc3luYyAoXywgeyBuYW1lLCB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgd2JPcmdhbml6YXRpb25Vc2VyczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgcm9sZU5hbWVzLCB1c2VyRW1haWxzLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQub3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHJvbGVOYW1lcyxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb246IGFzeW5jIChfLCB7IG5hbWUsIG5ld05hbWUsIG5ld0xhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3TmFtZSxcbiAgICAgICAgbmV3TGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmRlbGV0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3YlNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyB1c2VyRW1haWxzLCBvcmdhbml6YXRpb25OYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5nczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgc2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuLi9lbnRpdHlcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBTY2hlbWEge1xuICAgIGlkOiBJRCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICBvcmdhbml6YXRpb25Pd25lcklkOiBJbnRcbiAgICB1c2VyT3duZXJJZDogSW50XG4gICAgb3JnYW5pemF0aW9uT3duZXJOYW1lOiBTdHJpbmdcbiAgICB1c2VyT3duZXJFbWFpbDogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIFNjaGVtYVVzZXIge1xuICAgIHNjaGVtYUlkOiBJbnQhXG4gICAgdXNlcklkOiBJbnQhXG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgdXNlckZpcnN0TmFtZTogU3RyaW5nXG4gICAgdXNlckxhc3ROYW1lOiBTdHJpbmdcbiAgICBzZXR0aW5nczogSlNPTlxuICAgIHJvbGU6IFJvbGVcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBTY2hlbWFzXG4gICAgXCJcIlwiXG4gICAgd2JNeVNjaGVtYXMod2l0aFNldHRpbmdzOiBCb29sZWFuKTogW1NjaGVtYV1cbiAgICB3Yk15U2NoZW1hQnlOYW1lKFxuICAgICAgbmFtZTogU3RyaW5nIVxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBTY2hlbWFcbiAgICB3YlNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyEpOiBbU2NoZW1hXVxuICAgIFwiXCJcIlxuICAgIFNjaGVtYSBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2NoZW1hVXNlcnMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICByb2xlTmFtZXM6IFtTdHJpbmddXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXVxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW1NjaGVtYVVzZXJdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgU2NoZW1hc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkT3JDcmVhdGVTY2hlbWEoXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBsYWJlbDogU3RyaW5nIVxuICAgICAgb3JnYW5pemF0aW9uT3duZXJOYW1lOiBTdHJpbmdcbiAgICAgIHVzZXJPd25lckVtYWlsOiBTdHJpbmdcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IFNjaGVtYVxuICAgIHdiVXBkYXRlU2NoZW1hKFxuICAgICAgbmFtZTogU3RyaW5nIVxuICAgICAgbmV3U2NoZW1hTmFtZTogU3RyaW5nXG4gICAgICBuZXdTY2hlbWFMYWJlbDogU3RyaW5nXG4gICAgICBuZXdPcmdhbml6YXRpb25Pd25lck5hbWU6IFN0cmluZ1xuICAgICAgbmV3VXNlck93bmVyRW1haWw6IFN0cmluZ1xuICAgICk6IFNjaGVtYVxuICAgIHdiUmVtb3ZlT3JEZWxldGVTY2hlbWEobmFtZTogU3RyaW5nISwgZGVsOiBCb29sZWFuKTogQm9vbGVhbiFcbiAgICBcIlwiXCJcbiAgICBTY2hlbWEgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNldFNjaGVtYVVzZXJzUm9sZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddIVxuICAgICAgcm9sZU5hbWU6IFN0cmluZyFcbiAgICApOiBCb29sZWFuXG4gICAgd2JSZW1vdmVTY2hlbWFVc2VycyhzY2hlbWFOYW1lOiBTdHJpbmchLCB1c2VyRW1haWxzOiBbU3RyaW5nXSEpOiBCb29sZWFuXG4gICAgd2JTYXZlU2NoZW1hVXNlclNldHRpbmdzKHNjaGVtYU5hbWU6IFN0cmluZyEsIHNldHRpbmdzOiBKU09OISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgLy8gU2NoZW1hc1xuICAgIHdiTXlTY2hlbWFzOiBhc3luYyAoXywgeyB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlU2NoZW1hcyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlTY2hlbWFCeU5hbWU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IG5hbWUsIG9yZ2FuaXphdGlvbk5hbWUsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlU2NoZW1hQnlOYW1lKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JTY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcjogYXN5bmMgKF8sIHsgb3JnYW5pemF0aW9uTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gU2NoZW1hIFVzZXJzXG4gICAgd2JTY2hlbWFVc2VyczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgcm9sZU5hbWVzLCB1c2VyRW1haWxzLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2NoZW1hVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICByb2xlTmFtZXMsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFNjaGVtYXNcbiAgICB3YkFkZE9yQ3JlYXRlU2NoZW1hOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBuYW1lLCBsYWJlbCwgb3JnYW5pemF0aW9uT3duZXJOYW1lLCB1c2VyT3duZXJFbWFpbCwgY3JlYXRlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgb3JnYW5pemF0aW9uT3duZXJOYW1lLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHVzZXJPd25lckVtYWlsLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVNjaGVtYTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3U2NoZW1hTmFtZSxcbiAgICAgICAgbmV3U2NoZW1hTGFiZWwsXG4gICAgICAgIG5ld09yZ2FuaXphdGlvbk93bmVyTmFtZSxcbiAgICAgICAgbmV3VXNlck93bmVyRW1haWwsXG4gICAgICB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVTY2hlbWEoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBuZXdTY2hlbWFOYW1lLFxuICAgICAgICBuZXdTY2hlbWFMYWJlbCxcbiAgICAgICAgbmV3T3JnYW5pemF0aW9uT3duZXJOYW1lLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIG5ld1VzZXJPd25lckVtYWlsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZVNjaGVtYTogYXN5bmMgKF8sIHsgbmFtZSwgZGVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBTY2hlbWEgVXNlcnNcbiAgICB3YlNldFNjaGVtYVVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0U2NoZW1hVXNlcnNSb2xlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgcm9sZU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZVNjaGVtYVVzZXJzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWxzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlU2NoZW1hVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlU2NoZW1hVXNlclNldHRpbmdzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCBzZXR0aW5ncyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgR3JhcGhRTEpTT04gfSBmcm9tIFwiZ3JhcGhxbC10eXBlLWpzb25cIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICBzY2FsYXIgSlNPTlxuXG4gIHR5cGUgVGFibGUge1xuICAgIGlkOiBJRCFcbiAgICBzY2hlbWFJZDogSW50IVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIGNvbHVtbnM6IFtDb2x1bW5dXG4gICAgc2NoZW1hTmFtZTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbHVtbiB7XG4gICAgaWQ6IElEIVxuICAgIHRhYmxlSWQ6IEludCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICB0eXBlOiBTdHJpbmchXG4gICAgZGVmYXVsdDogU3RyaW5nXG4gICAgaXNQcmltYXJ5S2V5OiBCb29sZWFuIVxuICAgIGZvcmVpZ25LZXlzOiBbQ29uc3RyYWludElkXSFcbiAgICByZWZlcmVuY2VkQnk6IFtDb25zdHJhaW50SWRdIVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBDb25zdHJhaW50SWQge1xuICAgIGNvbnN0cmFpbnROYW1lOiBTdHJpbmchXG4gICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgIHJlbFRhYmxlTmFtZTogU3RyaW5nXG4gICAgcmVsQ29sdW1uTmFtZTogU3RyaW5nXG4gIH1cblxuICB0eXBlIFRhYmxlVXNlciB7XG4gICAgdGFibGVJZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFRhYmxlc1xuICAgIFwiXCJcIlxuICAgIHdiTXlUYWJsZXMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB3aXRoQ29sdW1uczogQm9vbGVhblxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW1RhYmxlXVxuICAgIHdiTXlUYWJsZUJ5TmFtZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgd2l0aENvbHVtbnM6IEJvb2xlYW5cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFRhYmxlXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlRhYmxlVXNlcnMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbVGFibGVVc2VyXVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkNvbHVtbnMoc2NoZW1hTmFtZTogU3RyaW5nISwgdGFibGVOYW1lOiBTdHJpbmchKTogW0NvbHVtbl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBUYWJsZXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IFRhYmxlIVxuICAgIHdiVXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIG5ld1RhYmxlTmFtZTogU3RyaW5nXG4gICAgICBuZXdUYWJsZUxhYmVsOiBTdHJpbmdcbiAgICApOiBUYWJsZSFcbiAgICB3YlJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkFkZEFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBwYXJlbnRDb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBwYXJlbnRUYWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNldFRhYmxlVXNlcnNSb2xlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGVOYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlVGFibGVVc2VycyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5MYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgICBjb2x1bW5UeXBlOiBTdHJpbmdcbiAgICApOiBCb29sZWFuIVxuICAgIHdiVXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBuZXdDb2x1bW5OYW1lOiBTdHJpbmdcbiAgICAgIG5ld0NvbHVtbkxhYmVsOiBTdHJpbmdcbiAgICAgIG5ld1R5cGU6IFN0cmluZ1xuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZE9yUmVtb3ZlQ29sdW1uU2VxdWVuY2UoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIG5leHRTZXFOdW1iZXI6IEludFxuICAgICAgcmVtb3ZlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgSlNPTjogR3JhcGhRTEpTT04sXG4gIFF1ZXJ5OiB7XG4gICAgLy8gVGFibGVzXG4gICAgd2JNeVRhYmxlczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgd2l0aENvbHVtbnMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlUYWJsZUJ5TmFtZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB3aXRoQ29sdW1ucywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVUYWJsZUJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFRhYmxlIFVzZXJzXG4gICAgd2JUYWJsZVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbHMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JDb2x1bW5zOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIC8vIFRhYmxlc1xuICAgIHdiQWRkT3JDcmVhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB0YWJsZUxhYmVsLCBjcmVhdGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdGFibGVMYWJlbCxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBuZXdUYWJsZU5hbWUsIG5ld1RhYmxlTGFiZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVGFibGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIG5ld1RhYmxlTmFtZSxcbiAgICAgICAgbmV3VGFibGVMYWJlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVUYWJsZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZEFsbEV4aXN0aW5nVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JDcmVhdGVPckRlbGV0ZVByaW1hcnlLZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVGb3JlaWduS2V5KFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXk6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZXMsIHBhcmVudFRhYmxlTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIHBhcmVudFRhYmxlTmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgLy8gQ29sdW1uc1xuICAgIHdiQWRkT3JDcmVhdGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgY29sdW1uTGFiZWwsIGNyZWF0ZSwgY29sdW1uVHlwZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgY29sdW1uTGFiZWwsXG4gICAgICAgIGNyZWF0ZSxcbiAgICAgICAgY29sdW1uVHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiVXBkYXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbk5hbWUsXG4gICAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgICBuZXdUeXBlLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlQ29sdW1uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVDb2x1bW46IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZE9yUmVtb3ZlQ29sdW1uU2VxdWVuY2U6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgY29sdW1uTmFtZSwgbmV4dFNlcU51bWJlciwgcmVtb3ZlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZE9yUmVtb3ZlQ29sdW1uU2VxdWVuY2UoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIG5leHRTZXFOdW1iZXIsXG4gICAgICAgIHJlbW92ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIC8vIFRhYmxlIFVzZXJzXG4gICAgd2JTZXRUYWJsZVVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB1c2VyRW1haWxzLCByb2xlTmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zZXRUYWJsZVVzZXJzUm9sZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgcm9sZU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZVRhYmxlVXNlcnM6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVUYWJsZVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWxzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JTYXZlVGFibGVVc2VyU2V0dGluZ3M6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgc2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBzZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IGdxbCwgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQ3VycmVudFVzZXIgfSBmcm9tIFwiLi4vZW50aXR5XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi4vd2hpdGVicmljay1jbG91ZFwiO1xuXG4vKipcbiAqIE9ubHkgZmllbGRzIHJlbGF0ZWQgdG8gYW4gaXNvbGF0ZWQgdXNlciBvciByb2xlIG9iamVjdHMgbGl2ZSBoZXJlXG4gKiBGb3Igb3JnYW5pemF0aW9uLXVzZXJzLCBzY2hlbWEtdXNlcnMsIHRhYmxlLXVzZXJzIHNlZSByZXNwZWN0aXZlIGNsYXNzZXNcbiAqL1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgVXNlciB7XG4gICAgaWQ6IElEIVxuICAgIGVtYWlsOiBTdHJpbmchXG4gICAgZmlyc3ROYW1lOiBTdHJpbmdcbiAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIFJvbGUge1xuICAgIG5hbWU6IFN0cmluZyFcbiAgICBpbXBsaWVkRnJvbTogU3RyaW5nXG4gICAgcGVybWlzc2lvbnM6IEpTT05cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICBcIlwiXCJcbiAgICBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiVXNlckJ5SWQoaWQ6IElEISk6IFVzZXJcbiAgICB3YlVzZXJCeUVtYWlsKGVtYWlsOiBTdHJpbmchKTogVXNlclxuICAgIHdiVXNlcnNCeVNlYXJjaFBhdHRlcm4oc2VhcmNoUGF0dGVybjogU3RyaW5nISk6IFtVc2VyXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTaWduVXAodXNlckF1dGhJZDogU3RyaW5nISwgdXNlck9iajogSlNPTiEpOiBCb29sZWFuXG4gICAgd2JBdXRoKHVzZXJBdXRoSWQ6IFN0cmluZyEpOiBKU09OXG4gICAgd2JDcmVhdGVVc2VyKFxuICAgICAgYXV0aElkOiBTdHJpbmdcbiAgICAgIGVtYWlsOiBTdHJpbmdcbiAgICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgICBsYXN0TmFtZTogU3RyaW5nXG4gICAgKTogVXNlclxuICAgIHdiVXBkYXRlTXlQcm9maWxlKGZpcnN0TmFtZTogU3RyaW5nLCBsYXN0TmFtZTogU3RyaW5nKTogVXNlclxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIC8vIFVzZXJzXG4gICAgd2JVc2VyQnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChjdXJyZW50VXNlciwgaWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2VyQnlFbWFpbDogYXN5bmMgKF8sIHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChjdXJyZW50VXNlciwgZW1haWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2Vyc0J5U2VhcmNoUGF0dGVybjogYXN5bmMgKF8sIHsgc2VhcmNoUGF0dGVybiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJzQnlTZWFyY2hQYXR0ZXJuKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2VhcmNoUGF0dGVyblxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIHdiU2lnblVwOiBhc3luYyAoXywgeyB1c2VyQXV0aElkLCB1c2VyT2JqIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2lnblVwKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgdXNlckF1dGhJZCxcbiAgICAgICAgdXNlck9ialxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQXV0aDogYXN5bmMgKF8sIHsgdXNlckF1dGhJZCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmF1dGgoY3VycmVudFVzZXIsIHVzZXJBdXRoSWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JDcmVhdGVVc2VyOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBhdXRoSWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVVzZXIoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBhdXRoSWQsXG4gICAgICAgIGVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGxhc3ROYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVNeVByb2ZpbGU6IGFzeW5jIChfLCB7IGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVVc2VyKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgY3VycmVudFVzZXIuaWQsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxufTtcbiIsImltcG9ydCB7IEFwb2xsb1NlcnZlciwgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCJ0c2xvZ1wiO1xuaW1wb3J0IHsgREFMIH0gZnJvbSBcIi4vZGFsXCI7XG5pbXBvcnQgeyBoYXN1cmFBcGkgfSBmcm9tIFwiLi9oYXN1cmEtYXBpXCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIHNjaGVtYSwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgdiA9IHJlcXVpcmUoXCJ2b2NhXCIpO1xuaW1wb3J0IHsgZW52aXJvbm1lbnQsIFVTRVJfTUVTU0FHRVMgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuXG5pbXBvcnQge1xuICBDb2x1bW4sXG4gIE9yZ2FuaXphdGlvbixcbiAgUm9sZSxcbiAgUm9sZUxldmVsLFxuICBTY2hlbWEsXG4gIFRhYmxlLFxuICBVc2VyLFxufSBmcm9tIFwiLi9lbnRpdHlcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4vZW50aXR5L0N1cnJlbnRVc2VyXCI7XG5pbXBvcnQgeyBERUZBVUxUX1BPTElDWSB9IGZyb20gXCIuL3BvbGljeVwiO1xuXG5leHBvcnQgY29uc3QgZ3JhcGhxbEhhbmRsZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgc2NoZW1hLFxuICBpbnRyb3NwZWN0aW9uOiB0cnVlLFxuICBjb250ZXh0OiAoeyBldmVudCwgY29udGV4dCB9KSA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGhlYWRlcnM6IGV2ZW50LmhlYWRlcnMsXG4gICAgICBtdWx0aVZhbHVlSGVhZGVyczogZXZlbnQubXVsdGlWYWx1ZUhlYWRlcnMsXG4gICAgICB3YkNsb3VkOiBuZXcgV2hpdGVicmlja0Nsb3VkKCksXG4gICAgfTtcbiAgfSxcbn0pLmNyZWF0ZUhhbmRsZXIoKTtcblxuZXhwb3J0IGNvbnN0IGxvZzogTG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gIG1pbkxldmVsOiBcImRlYnVnXCIsXG59KTtcblxuZXhwb3J0IGNsYXNzIFdoaXRlYnJpY2tDbG91ZCB7XG4gIGRhbCA9IG5ldyBEQUwoKTtcblxuICBwdWJsaWMgZXJyKHJlc3VsdDogU2VydmljZVJlc3VsdCk6IEVycm9yIHtcbiAgICByZXR1cm4gYXBvbGxvRXJyKHJlc3VsdCk7XG4gIH1cblxuICAvLyBvbmx5IGFzeW5jIGZvciB0ZXN0aW5nIC0gZm9yIHRoZSBtb3N0IHBhcnQgc3RhdGljXG4gIHB1YmxpYyBhc3luYyB1aWRGcm9tSGVhZGVycyhcbiAgICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIC8vbG9nLmRlYnVnKFwiPT09PT09PT09PSBIRUFERVJTOiBcIiArIEpTT04uc3RyaW5naWZ5KGhlYWRlcnMpKTtcbiAgICBjb25zdCBoZWFkZXJzTG93ZXJDYXNlID0gT2JqZWN0LmVudHJpZXMoaGVhZGVycykucmVkdWNlKFxuICAgICAgKGFjYzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgW2tleSwgdmFsXSkgPT4gKFxuICAgICAgICAoYWNjW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbCksIGFjY1xuICAgICAgKSxcbiAgICAgIHt9XG4gICAgKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgLy8gaWYgeC1oYXN1cmEtYWRtaW4tc2VjcmV0IGhhc3VyYSBzZXRzIHJvbGUgdG8gYWRtaW5cbiAgICBpZiAoXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXSAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0udG9Mb3dlckNhc2UoKSA9PSBcImFkbWluXCJcbiAgICApIHtcbiAgICAgIGxvZy5kZWJ1ZyhcIj09PT09PT09PT0gRk9VTkQgQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IFVzZXIuU1lTX0FETUlOX0lELFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5OT0RFX0VOViA9PSBcImRldmVsb3BtZW50XCIgJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXVxuICAgICkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgICAgbG9nLmRlYnVnKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBURVNUIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICBsb2cuZGVidWcoXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFVTRVI6ICR7aGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogYHVpZEZyb21IZWFkZXJzOiBDb3VsZCBub3QgZmluZCBoZWFkZXJzIGZvciBBZG1pbiwgVGVzdCBvciBVc2VyIGluOiAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGhlYWRlcnNcbiAgICAgICAgKX1gLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBjbG91ZENvbnRleHQoKTogb2JqZWN0IHtcbiAgICByZXR1cm4ge1xuICAgICAgZGVmYXVsdENvbHVtblR5cGVzOiBDb2x1bW4uQ09NTU9OX1RZUEVTLFxuICAgICAgcm9sZXM6IHtcbiAgICAgICAgb3JnYW5pemF0aW9uOiBSb2xlLlNZU1JPTEVTX09SR0FOSVpBVElPTlMsXG4gICAgICAgIHNjaGVtYTogUm9sZS5TWVNST0xFU19TQ0hFTUFTLFxuICAgICAgICB0YWJsZTogUm9sZS5TWVNST0xFU19UQUJMRVMsXG4gICAgICB9LFxuICAgICAgcG9saWN5OiBERUZBVUxUX1BPTElDWSxcbiAgICAgIHVzZXJNZXNzYWdlczogVVNFUl9NRVNTQUdFUyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gQXV0aCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhdXRoKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyQXV0aElkOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhdXRoKCR7dXNlckF1dGhJZH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpKSByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VySWRGcm9tQXV0aElkKHVzZXJBdXRoSWQpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgaGFzdXJhVXNlcklkOiBudW1iZXIgPSByZXN1bHQucGF5bG9hZDtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgXCJYLUhhc3VyYS1BbGxvd2VkLVJvbGVzXCI6IFtcIndidXNlclwiXSxcbiAgICAgICAgXCJYLUhhc3VyYS1EZWZhdWx0LVJvbGVcIjogXCJ3YnVzZXJcIixcbiAgICAgICAgXCJYLUhhc3VyYS1Vc2VyLUlkXCI6IGhhc3VyYVVzZXJJZCxcbiAgICAgICAgXCJYLUhhc3VyYS1BdXRoZW50aWNhdGVkLUF0XCI6IERhdGUoKS50b1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2lnblVwKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyQXV0aElkOiBzdHJpbmcsXG4gICAgdXNlck9iajogUmVjb3JkPHN0cmluZywgYW55PlxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHNpZ25VcCgke3VzZXJBdXRoSWR9LCR7SlNPTi5zdHJpbmdpZnkodXNlck9iail9KWApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSkgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluKCk7XG4gICAgbGV0IGVtYWlsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgbGV0IGZpcnN0TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBsYXN0TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIC8vIGh0dHBzOi8vYXV0aDAuY29tL2RvY3MvcnVsZXMvdXNlci1vYmplY3QtaW4tcnVsZXNcbiAgICBpZiAodXNlck9iai5lbWFpbCAmJiB1c2VyT2JqLmVtYWlsLmxlbmd0aCA+IDApIGVtYWlsID0gdXNlck9iai5lbWFpbDtcbiAgICBpZiAodXNlck9iai5naXZlbl9uYW1lICYmIHVzZXJPYmouZ2l2ZW5fbmFtZS5sZW5ndGggPiAwKSB7XG4gICAgICBmaXJzdE5hbWUgPSB1c2VyT2JqLmdpdmVuX25hbWU7XG4gICAgfVxuICAgIGlmICh1c2VyT2JqLmZhbWlseV9uYW1lICYmIHVzZXJPYmouZmFtaWx5X25hbWUubGVuZ3RoID4gMCkge1xuICAgICAgbGFzdE5hbWUgPSB1c2VyT2JqLmZhbWlseV9uYW1lO1xuICAgIH1cbiAgICBpZiAoIWZpcnN0TmFtZSAmJiAhbGFzdE5hbWUpIHtcbiAgICAgIGlmICh1c2VyT2JqLm5hbWUgJiYgdXNlck9iai5uYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3Qgc3BsaXQ6IHN0cmluZ1tdID0gdXNlck9iai5uYW1lLnNwbGl0KFwiIFwiKTtcbiAgICAgICAgZmlyc3ROYW1lID0gc3BsaXQuc2hpZnQoKTtcbiAgICAgICAgbGFzdE5hbWUgPSBzcGxpdC5qb2luKFwiIFwiKTtcbiAgICAgIH0gZWxzZSBpZiAodXNlck9iai5uaWNrbmFtZSAmJiB1c2VyT2JqLm5pY2tuYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZmlyc3ROYW1lID0gdXNlck9iai5uaWNrbmFtZTtcbiAgICAgIH1cbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY3JlYXRlVXNlcihcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICB1c2VyQXV0aElkLFxuICAgICAgZW1haWwsXG4gICAgICBmaXJzdE5hbWUsXG4gICAgICBsYXN0TmFtZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoZW52aXJvbm1lbnQuZGVtb0RCUHJlZml4KSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFzc2lnbkRlbW9TY2hlbWEocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gUm9sZXMgJiBQZXJtaXNzaW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByb2xlQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGByb2xlQnlOYW1lKCR7Y1UuaWR9LCR7bmFtZX0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZE9yTmFtZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIHBhcmVudE9iamVjdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHJvbGVBbmRJZEZvclVzZXJPYmplY3QoJHtjVS5pZH0sJHt1c2VySWR9LCR7cm9sZUxldmVsfSwke29iamVjdElkT3JOYW1lfSwke3BhcmVudE9iamVjdE5hbWV9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSkgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnJvbGVBbmRJZEZvclVzZXJPYmplY3QoXG4gICAgICB1c2VySWQsXG4gICAgICByb2xlTGV2ZWwsXG4gICAgICBvYmplY3RJZE9yTmFtZSxcbiAgICAgIHBhcmVudE9iamVjdE5hbWVcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZSxcbiAgICBkZWxldGVPbmx5PzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoJHtjVS5pZH0sJHt0YWJsZX0sJHtkZWxldGVPbmx5fSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fdGFibGVcIiwgdGFibGUuaWQpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnModGFibGUuaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFJvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0OiBPcmdhbml6YXRpb24gfCBTY2hlbWEgfCBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0Um9sZSgke2NVLmlkfSwke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICBvYmplY3RcbiAgICAgICl9KWBcbiAgICApO1xuICAgIC8vIFJCQUMgaW4gc3dpdGNoIGJlbG93XG4gICAgaWYgKCFSb2xlLmlzUm9sZShyb2xlTmFtZSwgcm9sZUxldmVsKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGAke3JvbGVOYW1lfSBpcyBub3QgYSB2YWxpZCBuYW1lIGZvciBhbiAke3JvbGVMZXZlbH0gUm9sZS5gLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX29yZ2FuaXphdGlvblwiLCBvYmplY3QuaWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAocm9sZU5hbWUpIHtcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX3VzZXJcIjpcbiAgICAgICAgICAgIC8vIGFyZSBhbnkgb2YgdGhlc2UgdXNlciBjdXJyZW50bHkgYWRtaW5zIGdldHRpbmcgZGVtb3RlZD9cbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMoY1UsIG9iamVjdC5uYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgICAgICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAgICAgICAob3JnYW5pemF0aW9uVXNlcjogeyB1c2VySWQ6IG51bWJlciB9KSA9PiBvcmdhbml6YXRpb25Vc2VyLnVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGRlbW90ZWRBZG1pbnM6IG51bWJlcltdID0gdXNlcklkcy5maWx0ZXIoKGlkOiBudW1iZXIpID0+XG4gICAgICAgICAgICAgIGN1cnJlbnRBZG1pbklkcy5pbmNsdWRlcyhpZClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoZGVtb3RlZEFkbWlucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIC8vIGNvbXBsZXRlbHkgcmVtb3ZlIHRoZW0gKHdpbGwgcmFpc2UgZXJyb3IgaWYgbm8gYWRtaW5zKVxuICAgICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgICBvYmplY3QubmFtZSxcbiAgICAgICAgICAgICAgICBkZW1vdGVkQWRtaW5zXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBhZGQgb3JnbmFpemF0aW9uX3VzZXJcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiOlxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICAgICAgICAgICAgb2JqZWN0LmlkLFxuICAgICAgICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXG4gICAgICAgICAgICAgICAgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1c2VySWRzXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoY1UsIG9iamVjdC5pZCk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmlkLFxuICAgICAgICAgICAgICAgIFJvbGUuc3lzUm9sZU1hcChcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCwgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbCksXG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHVzZXJJZHNcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlclwiOlxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIG9iamVjdC5pZCkpIHtcbiAgICAgICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYWRkIHNjaGVtYV91c2VyXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIENoYW5naW5nIHJvbGUgYXQgdGhlIHNjaGVtYSBsZXZlbCByZXNldHMgYWxsXG4gICAgICAgIC8vIHRhYmxlIHJvbGVzIHRvIHRoZSBzY2hlbWEgZGVmYXVsdCBpbmhlcml0ZW5jZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgICAgICBvYmplY3QuaWQsXG4gICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKSwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdXNlcklkc1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlXCIsIG9iamVjdC5pZCkpIHtcbiAgICAgICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICBvYmplY3QuaWRcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlcklkczogbnVtYmVyW10sXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0SWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGRlbGV0ZVJvbGUoJHtjVS5pZH0sJHt1c2VySWRzfSwke3JvbGVMZXZlbH0sJHtvYmplY3RJZH0pYCk7XG4gICAgLy8gcGVybWlzc2lvbiBjaGVja3MgaW4gc3dpdGNoIGJlbG93XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uXCIsIG9iamVjdElkKSkge1xuICAgICAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWxldGUgc2NoZW1hIGFkbWlucyBpbXBsaWNpdGx5IHNldCBmcm9tIG9yZ2FuaXphdGlvbiBhZG1pbnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIFwic2NoZW1hXCIsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIG9iamVjdElkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgb3JnYW5pemF0aW9uIGlkXG4gICAgICAgICAgW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgLy8gRGVsZXRlIHRhYmxlIGFkbWlucyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSBhZG1pbnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihjVSwgb2JqZWN0SWQpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgc2NoZW1hLmlkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgc2NoZW1hIGlkXG4gICAgICAgICAgICBbXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKHVzZXJJZHMsIHJvbGVMZXZlbCwgb2JqZWN0SWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19zY2hlbWFcIiwgb2JqZWN0SWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSB1c2VycyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSB1c2Vyc1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgIE9iamVjdC5rZXlzKFxuICAgICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZSh1c2VySWRzLCByb2xlTGV2ZWwsIG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCBvYmplY3RJZCkpIHtcbiAgICAgICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZSh1c2VySWRzLCByb2xlTGV2ZWwsIG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVUZXN0VXNlcnMoKWApO1xuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5SWRzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZHM6IG51bWJlcltdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdXNlcnNCeUlkcygke2NVLmlkfSwke2lkc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICAvLyBUQkQ6IG1hc2sgc2Vuc2l0aXZlIGluZm9ybWF0aW9uXG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzKGlkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5SWQoY1U6IEN1cnJlbnRVc2VyLCBpZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB1c2VyQnlJZCgke2NVLmlkfSwke2lkfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUlkcyhjVSwgW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBzZWFyY2hQYXR0ZXJuIGFjcm9zcyBtdWx0aXBsZSBmaWVsZHNcbiAgcHVibGljIGFzeW5jIHVzZXJzQnlTZWFyY2hQYXR0ZXJuKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzZWFyY2hQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB1c2Vyc0J5U2VhcmNoUGF0dGVybigke2NVLmlkfSwke3NlYXJjaFBhdHRlcm59KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZWFyY2hQYXR0ZXJuKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5RW1haWxzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHVzZXJzQnlFbWFpbHMoJHtjVS5pZH0sJHt1c2VyRW1haWxzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vycyh1bmRlZmluZWQsIHVzZXJFbWFpbHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBlbWFpbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdXNlckJ5RW1haWwoJHtjVS5pZH0sJHtlbWFpbH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIFtlbWFpbF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbZW1haWxdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBhdXRoSWQ/OiBzdHJpbmcsXG4gICAgZW1haWw/OiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lPzogc3RyaW5nLFxuICAgIGxhc3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBjcmVhdGVVc2VyKCR7Y1UuaWR9LCR7YXV0aElkfSwke2VtYWlsfSwke2ZpcnN0TmFtZX0sJHtsYXN0TmFtZX0pYFxuICAgICk7XG4gICAgLy8gYSB0ZXN0IHVzZXIgY2FuIG9ubHkgY3JlYXRlIGFub2h0ZXIgdGVzdCB1c2VyXG4gICAgaWYgKFxuICAgICAgZW1haWwgJiZcbiAgICAgIGVtYWlsLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoZW52aXJvbm1lbnQudGVzdFVzZXJFbWFpbERvbWFpbikgJiZcbiAgICAgIGNVLmlzbnRUZXN0VXNlcigpICYmXG4gICAgICBjVS5pc250U3lzQWRtaW4oKVxuICAgICkge1xuICAgICAgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluT3JUZXN0VXNlcigpO1xuICAgIH0gZWxzZSBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIH1cbiAgICBsZXQgZXhpc3RpbmdVc2VyUmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgbGV0IGVyclZhbHVlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmIChhdXRoSWQpIHtcbiAgICAgIGV4aXN0aW5nVXNlclJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJJZEZyb21BdXRoSWQoYXV0aElkKTtcbiAgICAgIGVyclZhbHVlID0gYXV0aElkO1xuICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgIGV4aXN0aW5nVXNlclJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwoXG4gICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgIGVtYWlsXG4gICAgICApO1xuICAgICAgZXJyVmFsdWUgPSBlbWFpbDtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3Qgd2FudCB0byBmaW5kIGFueSBleGlzdGluZyB1c2Vyc1xuICAgIGlmIChleGlzdGluZ1VzZXJSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX0VYSVNUU1wiLFxuICAgICAgICB2YWx1ZXM6IFtlcnJWYWx1ZV0sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLmNyZWF0ZVVzZXIoYXV0aElkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB1cGRhdGVVc2VyKCR7Y1UuaWR9LCR7aWR9LCR7ZW1haWx9LCR7Zmlyc3ROYW1lfSwke2xhc3ROYW1lfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkgJiYgY1UuaWRJc250KGlkKSkge1xuICAgICAgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluT3JTZWxmKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVVc2VyKGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbklkcz86IG51bWJlcltdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm4/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYG9yZ2FuaXphdGlvbnMoJHtjVS5pZH0sJHtvcmdhbml6YXRpb25JZHN9LCR7b3JnYW5pemF0aW9uTmFtZXN9LCR7b3JnYW5pemF0aW9uTmFtZVBhdHRlcm59KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwub3JnYW5pemF0aW9ucyhcbiAgICAgIG9yZ2FuaXphdGlvbklkcyxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVzLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm5cbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uc0J5SWRzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZHM6IG51bWJlcltdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgb3JnYW5pemF0aW9uc0J5SWRzKCR7Y1UuaWR9LCR7aWRzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLm9yZ2FuaXphdGlvbnMoY1UsIGlkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlJZChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYG9yZ2FuaXphdGlvbkJ5SWRzKCR7Y1UuaWR9LCR7aWR9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zQnlJZHMoY1UsIFtpZF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uc0J5TmFtZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYG9yZ2FuaXphdGlvbnNCeU5hbWVzKCR7Y1UuaWR9LCR7bmFtZXN9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyhjVSwgdW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBvcmdhbml6YXRpb25CeU5hbWUoJHtjVS5pZH0sJHtuYW1lfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uc0J5TmFtZXMoY1UsIFtuYW1lXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeU5hbWVQYXR0ZXJuKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgb3JnYW5pemF0aW9uQnlOYW1lUGF0dGVybigke2NVLmlkfSwke25hbWVQYXR0ZXJufSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9ucyhcbiAgICAgIGNVLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgbmFtZVBhdHRlcm5cbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVPcmdhbml6YXRpb25CeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IHN0cmluZyxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uTmFtZX0sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFtvcmdhbml6YXRpb25OYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIC8vIGRvZXMgdGhpcyBvcmdhbml6YXRpb24gZXhpc3QgYXQgYWxsIChyZWdhcmRsZXNzIG9mIGFjY2VzcylcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgICApO1xuICAgICAgLy8gcmV0dXJuIG9yZ2FuaXphdGlvbiBub3QgZm91bmRcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAvLyBvdGhlcndpc2UgcmV0dXJuIGZvcmJpZGRlblxuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICAgICAgdmFsdWVzOiBbb3JnYW5pemF0aW9uTmFtZV0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVPcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgYWNjZXNzaWJsZU9yZ2FuaXphdGlvbnMoJHtjVS5pZH0sJHt3aXRoU2V0dGluZ3N9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGNyZWF0ZU9yZ2FuaXphdGlvbigke2NVLmlkfSwke25hbWV9LCR7bGFiZWx9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgY2hlY2tOYW1lUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoY1UsIG5hbWUpO1xuICAgIGlmIChjaGVja05hbWVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTkFNRV9UQUtFTlwiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIC8vIGllIFdCX09SR0FOSVpBVElPTl9OT1RfRk9VTkQgaXMgdGhlIGRlc2lyZWQgcmVzdWx0XG4gICAgfSBlbHNlIGlmIChjaGVja05hbWVSZXN1bHQud2JDb2RlICE9IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORFwiKSB7XG4gICAgICByZXR1cm4gY2hlY2tOYW1lUmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVPcmdhbml6YXRpb24oXG4gICAgICBuYW1lLFxuICAgICAgbGFiZWxcbiAgICApO1xuICAgIGlmICghY3JlYXRlT3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgbmFtZSxcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICAgIFtjVS5pZF1cbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGNyZWF0ZU9yZ2FuaXphdGlvblJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVPcmdhbml6YXRpb24oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBuZXdOYW1lPzogc3RyaW5nLFxuICAgIG5ld0xhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgdXBkYXRlT3JnYW5pemF0aW9uKCR7Y1UuaWR9LCR7bmFtZX0sJHtuZXdOYW1lfSwke25ld0xhYmVsfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImVkaXRfb3JnYW5pemF0aW9uXCIsIG5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZU9yZ2FuaXphdGlvbihuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBkZWxldGVPcmdhbml6YXRpb24oJHtjVS5pZH0sJHtuYW1lfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImVkaXRfb3JnYW5pemF0aW9uXCIsIG5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMoY1UsIG5hbWUsIHVuZGVmaW5lZCwgW1xuICAgICAgXCJvcmdhbml6YXRpb25fdXNlclwiLFxuICAgICAgXCJvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlclwiLFxuICAgIF0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PVF9VU0VSX0VNUFRZXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlT3JnYW5pemF0aW9uKG5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCR7Y1UuaWR9KWApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSAmJiBjVS5pc250VGVzdFVzZXIoKSkge1xuICAgICAgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluT3JUZXN0VXNlcigpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IE9yZ2FuaXphdGlvbiBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25Vc2VycyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZT86IHN0cmluZyxcbiAgICBpZD86IG51bWJlcixcbiAgICByb2xlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgb3JnYW5pemF0aW9uVXNlcnMoJHtjVS5pZH0sJHtuYW1lfSwke2lkfSwke3JvbGVOYW1lc30sJHt1c2VyRW1haWxzfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgbGV0IG9yZ2FuaXphdGlvblJlZjogc3RyaW5nIHwgbnVtYmVyID0gXCJcIjtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuYW1lKTtcbiAgICAgIG9yZ2FuaXphdGlvblJlZiA9IG5hbWU7XG4gICAgfSBlbHNlIGlmIChpZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeUlkKGNVLCBpZCk7XG4gICAgICBvcmdhbml6YXRpb25SZWYgPSBpZDtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFjY2Vzc19vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uUmVmKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGlmIChyb2xlTmFtZXMgJiYgIVJvbGUuYXJlUm9sZXMocm9sZU5hbWVzKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJvcmdhbml6YXRpb25Vc2Vyczogcm9sZXMgY29udGFpbnMgb25lIG9yIG1vcmUgdW5yZWNvZ25pemVkIHN0cmluZ3NcIixcbiAgICAgICAgdmFsdWVzOiByb2xlTmFtZXMsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvblVzZXJzKFxuICAgICAgbmFtZSxcbiAgICAgIGlkLFxuICAgICAgcm9sZU5hbWVzLFxuICAgICAgdXNlcklkcyxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgcm9sZU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzZXRPcmdhbml6YXRpb25Vc2Vyc1JvbGUoJHtjVS5pZH0sJHtvcmdhbml6YXRpb25OYW1lfSwke3JvbGVOYW1lfSwke3VzZXJJZHN9LCR7dXNlckVtYWlsc30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX29yZ2FuaXphdGlvblwiLCBvcmdhbml6YXRpb25OYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgIGNVLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICk7XG4gICAgaWYgKCFvcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIG9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgbGV0IHVzZXJJZHNGb3VuZDogbnVtYmVyW10gPSBbXTtcbiAgICBsZXQgdXNlcnNSZXF1ZXN0ZWQ6IChzdHJpbmcgfCBudW1iZXIpW10gPSBbXTtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgdXNlcnNSZXF1ZXN0ZWQgPSB1c2VySWRzO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5SWRzKGNVLCB1c2VySWRzKTtcbiAgICB9IGVsc2UgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHVzZXJzUmVxdWVzdGVkID0gdXNlckVtYWlscztcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MgfHwgIXJlc3VsdC5wYXlsb2FkKSByZXR1cm4gcmVzdWx0O1xuICAgIHVzZXJJZHNGb3VuZCA9IHJlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIGlmICh1c2Vyc1JlcXVlc3RlZC5sZW5ndGggIT0gdXNlcklkc0ZvdW5kLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgdmFsdWVzOiBbXG4gICAgICAgICAgYFJlcXVlc3RlZCAke3VzZXJzUmVxdWVzdGVkLmxlbmd0aH06ICR7dXNlcnNSZXF1ZXN0ZWQuam9pbihcIixcIil9YCxcbiAgICAgICAgICBgRm91bmQgJHt1c2VySWRzRm91bmQubGVuZ3RofTogJHt1c2VySWRzRm91bmQuam9pbihcIixcIil9YCxcbiAgICAgICAgXSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHNGb3VuZCxcbiAgICAgIHJvbGVOYW1lLFxuICAgICAgXCJvcmdhbml6YXRpb25cIixcbiAgICAgIG9yZ2FuaXphdGlvblJlc3VsdC5wYXlsb2FkXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGByZW1vdmVVc2Vyc0Zyb21Pcmdhbml6YXRpb24oJHtjVS5pZH0sJHtvcmdhbml6YXRpb25OYW1lfSwke3VzZXJJZHN9LCR7dXNlckVtYWlsc30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX29yZ2FuaXphdGlvblwiLCBvcmdhbml6YXRpb25OYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgbGV0IHVzZXJJZHNUb0JlUmVtb3ZlZDogbnVtYmVyW10gPSBbXTtcbiAgICBpZiAodXNlcklkcykgdXNlcklkc1RvQmVSZW1vdmVkID0gdXNlcklkcztcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB1c2VySWRzVG9CZVJlbW92ZWQgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gY2hlY2sgbm90IGFsbCB0aGUgYWRtaW5zIHdpbGwgYmUgcmVtb3ZlZFxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMoY1UsIG9yZ2FuaXphdGlvbk5hbWUsIHVuZGVmaW5lZCwgW1xuICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgIF0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgYWxsQWRtaW5JZHMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAob3JnYW5pemF0aW9uVXNlcjogeyB1c2VySWQ6IG51bWJlciB9KSA9PiBvcmdhbml6YXRpb25Vc2VyLnVzZXJJZFxuICAgICk7XG4gICAgaWYgKFxuICAgICAgYWxsQWRtaW5JZHMuZXZlcnkoKGVsZW06IG51bWJlcikgPT4gdXNlcklkc1RvQmVSZW1vdmVkLmluY2x1ZGVzKGVsZW0pKVxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgIGNVLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICk7XG4gICAgaWYgKCFvcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIG9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHNUb0JlUmVtb3ZlZCxcbiAgICAgIFwib3JnYW5pemF0aW9uXCIsXG4gICAgICBvcmdhbml6YXRpb25SZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3NldHRpbmdzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2NoZW1hcygke2NVLmlkfSwke3NjaGVtYUlkc30sJHtzY2hlbWFOYW1lc30sJHtzY2hlbWFOYW1lUGF0dGVybn0pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzKFxuICAgICAgc2NoZW1hSWRzLFxuICAgICAgc2NoZW1hTmFtZXMsXG4gICAgICBzY2hlbWFOYW1lUGF0dGVyblxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlJZHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkczogbnVtYmVyW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzY2hlbWFzKCR7Y1UuaWR9LCR7aWRzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLnNjaGVtYXMoY1UsIGlkcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlJZChjVTogQ3VycmVudFVzZXIsIGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHNjaGVtYUJ5SWQoJHtjVS5pZH0sJHtpZH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXNCeUlkcyhjVSwgW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2lkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlOYW1lcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1Zyhgc2NoZW1hc0J5TmFtZXMoJHtjVS5pZH0sJHtuYW1lc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFzKGNVLCB1bmRlZmluZWQsIG5hbWVzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHNjaGVtYUJ5TmFtZSgke2NVLmlkfSwke25hbWV9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlOYW1lcyhjVSwgW25hbWVdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5TmFtZVBhdHRlcm4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBzY2hlbWFCeU5hbWVQYXR0ZXJuKCR7Y1UuaWR9LCR7bmFtZVBhdHRlcm59KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKGNVLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZVBhdHRlcm4pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHNjaGVtYXNCeVVzZXJPd25lcigke2NVLmlkfSwke3VzZXJJZH0sJHt1c2VyRW1haWx9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJPd25lcih1c2VySWQsIHVzZXJFbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbklkPzogbnVtYmVyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uSWR9LCR7b3JnYW5pemF0aW9uTmFtZX0pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCBvcmdhbml6YXRpb25SZWY6IG51bWJlciB8IHN0cmluZyA9IFwiXCI7XG4gICAgLy8gZG9lcyB0aGlzIG9yZ2FuaXphdGlvbiBleGlzdCBhdCBhbGwgKHJlZ2FyZGxlc3Mgb2YgYWNjZXNzKVxuICAgIGlmIChvcmdhbml6YXRpb25JZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeUlkKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBvcmdhbml6YXRpb25JZFxuICAgICAgKTtcbiAgICAgIG9yZ2FuaXphdGlvblJlZiA9IG9yZ2FuaXphdGlvbklkO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgb3JnYW5pemF0aW9uUmVmID0gb3JnYW5pemF0aW9uTmFtZTtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgICApO1xuICAgIH1cbiAgICAvLyByZXR1cm4gb3JnYW5pemF0aW9uIG5vdCBmb3VuZFxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvblJlZikpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgICAgY1UuaWQsXG4gICAgICBvcmdhbml6YXRpb25JZCxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oJHtjVS5pZH0sJHt1c2VySWR9LCR7dXNlckVtYWlsfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKHVzZXJJZCwgdXNlckVtYWlsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZyxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhY2Nlc3NpYmxlU2NoZW1hQnlOYW1lKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHtvcmdhbml6YXRpb25OYW1lfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgLy8gaWYgaXQncyBmcm9tIGFuIG9yZ2FuaXphdGlvbiBVUkwsIGNoZWNrIGl0IGV4aXN0c1xuICAgIGlmIChvcmdhbml6YXRpb25OYW1lKSB7XG4gICAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICAgKTtcbiAgICAgIC8vIHJldHVybnMgb3JnYW5pemF0aW9uIG5vdCBmb3VuZFxuICAgICAgaWYgKCFvcmdhbml6YXRpb25SZXN1bHQuc3VjY2VzcykgcmV0dXJuIG9yZ2FuaXphdGlvblJlc3VsdDtcbiAgICB9XG4gICAgLy8gbm93IGNoZWNrIHNjaGVtYSBleGlzdHNcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICBzY2hlbWFOYW1lXG4gICAgKTtcbiAgICAvLyByZXR1cm5zIHNjaGVtYSBub3QgZm91bmRcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIC8vIG5vdyBpZiBpdCdzIGZyb20gYW4gb3JnYW5pemF0aW9uIFVSTCwgY2hlY2sgZm9yIGNvcnJlY3Qgb3duZXJcbiAgICBpZiAob3JnYW5pemF0aW9uTmFtZSAmJiBvcmdhbml6YXRpb25SZXN1bHQuc3VjY2Vzcykge1xuICAgICAgaWYgKFxuICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5vcmdhbml6YXRpb25fb3duZXJfaWQgIT1cbiAgICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWRcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW1xuICAgICAgICAgICAgYCR7c2NoZW1hTmFtZX0gbm90IGZvdW5kIGZvciBvcmdhbml6YXRpb24gb3duZXIgJHtvcmdhbml6YXRpb25OYW1lfS5gLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2NoZW1hc0J5VXNlcnMoXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgW3NjaGVtYU5hbWVdLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVNjaGVtYXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhY2Nlc3NpYmxlU2NoZW1hcygke2NVLmlkfSwke3dpdGhTZXR0aW5nc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuc2NoZW1hc0J5VXNlcnMoXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIG9yZ2FuaXphdGlvbk93bmVyIG9yZ2FuaXphdGlvbiBhZG1pbnMgYXJlIGltcGxpY2l0bHkgZ3JhbnRlZCBzY2hlbWEgYWRtaW4gcm9sZXNcbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZyxcbiAgICBvcmdhbml6YXRpb25Pd25lcklkPzogbnVtYmVyLFxuICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZyxcbiAgICB1c2VyT3duZXJJZD86IG51bWJlcixcbiAgICB1c2VyT3duZXJFbWFpbD86IHN0cmluZyxcbiAgICBjcmVhdGU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhZGRPckNyZWF0ZVNjaGVtYSgke2NVLmlkfSwke25hbWV9LCR7bGFiZWx9LCR7b3JnYW5pemF0aW9uT3duZXJJZH0sJHtvcmdhbml6YXRpb25Pd25lck5hbWV9LCR7dXNlck93bmVySWR9LCR7dXNlck93bmVyRW1haWx9LCR7Y3JlYXRlfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICAvLyBydW4gY2hlY2tzIGZvciBvcmdhbml6YXRpb24gb3duZXJcbiAgICBpZiAob3JnYW5pemF0aW9uT3duZXJJZCB8fCBvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgIGlmICghb3JnYW5pemF0aW9uT3duZXJJZCAmJiBvcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoY1UsIG9yZ2FuaXphdGlvbk93bmVyTmFtZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgb3JnYW5pemF0aW9uT3duZXJJZCAmJlxuICAgICAgICAoYXdhaXQgY1UuY2FudChcImFjY2Vzc19vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uT3duZXJJZCkpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0lOX09SR1wiLFxuICAgICAgICAgIHZhbHVlczogW2NVLnRvU3RyaW5nKCksIG9yZ2FuaXphdGlvbk93bmVySWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pIGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh1c2VyT3duZXJFbWFpbCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChjVSwgdXNlck93bmVyRW1haWwpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHVzZXJPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgfSBlbHNlIGlmICghdXNlck93bmVySWQpIHtcbiAgICAgIHVzZXJPd25lcklkID0gY1UuaWQ7XG4gICAgfVxuICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJwZ19cIikgfHwgU2NoZW1hLlNZU19TQ0hFTUFfTkFNRVMuaW5jbHVkZXMobmFtZSkpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfQkFEX1NDSEVNQV9OQU1FXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoY1UsIG5hbWUpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTkFNRV9FWElTVFNcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgICAgbmFtZSxcbiAgICAgIGxhYmVsLFxuICAgICAgb3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgIHVzZXJPd25lcklkLFxuICAgICAgY3JlYXRlXG4gICAgKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGlmIChvcmdhbml6YXRpb25Pd25lcklkKSB7XG4gICAgICAvLyBJZiBvd25lciBpcyBhbiBvcmdhbml6YXRpb24gYW5kIGN1cnJlbnQgdXNlciBpcyBub3QgYW4gYWRtaW4gb2YgdGhlIG9yZ2FuaXphdGlvblxuICAgICAgLy8gYWRkIHRoZSB1c2VyIGFzIGEgc2NoZW1hIGFkbWluIHNvIHRoZXkgZG9udCBsb3NlIGFjY2Vzc1xuICAgICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhZG1pbmlzdGVyX29yZ2FuaXphdGlvblwiLCBvcmdhbml6YXRpb25Pd25lcklkKSkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgICBbY1UuaWRdLFxuICAgICAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgLy8gRXZlcnkgb3JnYW5pemF0aW9uIGFkbWluIGlzIGltcGxpY2l0bHkgYWxzbyBhIHNjaGVtYSBhZG1pblxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKSxcbiAgICAgICAgW3NjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSWYgb3duZXIgaXMgYSB1c2VyLCBhZGQgdGhlbSB0byBzY2hlbWFfdXNlcnMgdG8gc2F2ZSBzZXR0aW5nc1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBbY1UuaWRdLFxuICAgICAgICBcInNjaGVtYV9vd25lclwiLFxuICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWRcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbDogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHJlbW92ZU9yRGVsZXRlU2NoZW1hKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHtkZWx9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVUYWJsZShjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSwgZGVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld1NjaGVtYU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3U2NoZW1hTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3T3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nLFxuICAgIG5ld09yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgbmV3VXNlck93bmVyRW1haWw/OiBzdHJpbmcsXG4gICAgbmV3VXNlck93bmVySWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHVwZGF0ZVNjaGVtYSgke2NVLmlkfSwke25hbWV9LCR7bmV3U2NoZW1hTmFtZX0sJHtuZXdTY2hlbWFMYWJlbH0sJHtuZXdPcmdhbml6YXRpb25Pd25lck5hbWV9LCR7bmV3T3JnYW5pemF0aW9uT3duZXJJZH0sJHtuZXdVc2VyT3duZXJFbWFpbH0sJHtuZXdVc2VyT3duZXJJZH0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl9zY2hlbWFcIiwgbmFtZSkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBuYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGxldCBzY2hlbWFUYWJsZXMgPSBbXTtcbiAgICBpZiAobmV3U2NoZW1hTmFtZSkge1xuICAgICAgaWYgKFxuICAgICAgICBuZXdTY2hlbWFOYW1lLnN0YXJ0c1dpdGgoXCJwZ19cIikgfHxcbiAgICAgICAgU2NoZW1hLlNZU19TQ0hFTUFfTkFNRVMuaW5jbHVkZXMobmV3U2NoZW1hTmFtZSlcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX0JBRF9TQ0hFTUFfTkFNRVwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgbmV3U2NoZW1hTmFtZSk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1NDSEVNQV9OQU1FX0VYSVNUU1wiLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZXMoY1UsIG5hbWUsIGZhbHNlKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBzY2hlbWFUYWJsZXMgPSByZXN1bHQucGF5bG9hZDtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2Ygc2NoZW1hVGFibGVzKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXdPcmdhbml6YXRpb25Pd25lck5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuZXdPcmdhbml6YXRpb25Pd25lck5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIG5ld09yZ2FuaXphdGlvbk93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICB9XG4gICAgaWYgKG5ld1VzZXJPd25lckVtYWlsKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJCeUVtYWlsKGNVLCBuZXdVc2VyT3duZXJFbWFpbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgbmV3VXNlck93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICB9XG4gICAgLy8gVEJEIGNoZWNrcyBzbyB1c2VyIGRvZXNuJ3QgbG9zZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IHVwZGF0ZWRTY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVTY2hlbWEoXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZCxcbiAgICAgIG5ld1NjaGVtYU5hbWUsXG4gICAgICBuZXdTY2hlbWFMYWJlbCxcbiAgICAgIG5ld09yZ2FuaXphdGlvbk93bmVySWQsXG4gICAgICBuZXdVc2VyT3duZXJJZFxuICAgICk7XG4gICAgaWYgKCF1cGRhdGVkU2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1cGRhdGVkU2NoZW1hUmVzdWx0O1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSB7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHNjaGVtYVRhYmxlcykge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5ld09yZ2FuaXphdGlvbk93bmVySWQgfHwgbmV3VXNlck93bmVySWQpIHtcbiAgICAgIC8vIGlmIHRoZSBvbGQgc2NoZW1hIHdhcyBvd25lZCBieSBhbiBvcmdcbiAgICAgIGlmIChzY2hlbWFSZXN1bHQucGF5bG9hZC5vcmdhbml6YXRpb25fb3duZXJfaWQpIHtcbiAgICAgICAgLy8gQ2xlYXIgb2xkIGltcGxpZWQgYWRtaW5zXG4gICAgICAgIGNvbnN0IGltcGxpZWRBZG1pbnNSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYVVzZXJzKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIHVwZGF0ZWRTY2hlbWFSZXN1bHQucGF5bG9hZC5uYW1lLFxuICAgICAgICAgIFtcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCJdLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFpbXBsaWVkQWRtaW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBpbXBsaWVkQWRtaW5zUmVzdWx0O1xuICAgICAgICBjb25zdCBvbGRJbXBsaWVkQWRtaW5Vc2VySWRzID0gaW1wbGllZEFkbWluc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgICAoc2NoZW1hVXNlcjogeyB1c2VyX2lkOiBudW1iZXIgfSkgPT4gc2NoZW1hVXNlci51c2VyX2lkXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBvbGRJbXBsaWVkQWRtaW5Vc2VySWRzLFxuICAgICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgICAgICk7XG4gICAgICAgIC8vIG90aGVyd2lzZSBvbGQgc2NoZW1hIHdhcyBvd25lZCBieSB1c2VyXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgW3NjaGVtYVJlc3VsdC5wYXlsb2FkLnVzZXJfb3duZXJfaWRdLFxuICAgICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgaWYgKG5ld09yZ2FuaXphdGlvbk93bmVySWQpIHtcbiAgICAgICAgLy8gRXZlcnkgb3JnYW5pemF0aW9uIGFkbWluIGlzIGltcGxpY2l0bHkgYWxzbyBhIHNjaGVtYSBhZG1pblxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRTY2hlbWFVc2VyUm9sZXNGcm9tT3JnYW5pemF0aW9uUm9sZXMoXG4gICAgICAgICAgbmV3T3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKSxcbiAgICAgICAgICBbc2NoZW1hUmVzdWx0LnBheWxvYWQuaWRdXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKG5ld1VzZXJPd25lcklkKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICAgIFtuZXdVc2VyT3duZXJJZF0sXG4gICAgICAgICAgXCJzY2hlbWFfb3duZXJcIixcbiAgICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHVwZGF0ZWRTY2hlbWFSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYXNzaWduRGVtb1NjaGVtYSh1c2VySWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5uZXh0VW5hc3NpZ25lZERlbW9TY2hlbWEoXG4gICAgICBgJHtlbnZpcm9ubWVudC5kZW1vREJQcmVmaXh9JWBcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgcmVzdWx0LnBheWxvYWQubmFtZSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVzZXJJZFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVSb2xlKFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIFtVc2VyLlNZU19BRE1JTl9JRF0sXG4gICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgIHJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGROZXh0RGVtb1NjaGVtYShjVTogQ3VycmVudFVzZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGFkZE5leHREZW1vU2NoZW1hKCR7Y1UuaWR9KWApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSkgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluKCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXMoXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBgJHtlbnZpcm9ubWVudC5kZW1vREJQcmVmaXh9JWAsXG4gICAgICBcIm5hbWUgZGVzY1wiLFxuICAgICAgMSxcbiAgICAgIHRydWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCAhPT0gMSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGBhZGROZXh0RGVtb1NjaGVtYTogY2FuIG5vdCBmaW5kIGRlbW8gREIgbWF0Y2hpbmcgJHtlbnZpcm9ubWVudC5kZW1vREJQcmVmaXh9JWAsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBzcGxpdCA9IHJlc3VsdC5wYXlsb2FkWzBdLm5hbWUuc3BsaXQoXCJfZGVtb1wiKTtcbiAgICBjb25zdCBsYXN0RGVtb051bWJlciA9IHBhcnNlSW50KHNwbGl0WzFdKTtcbiAgICBjb25zdCBzY2hlbWFOYW1lID0gYCR7ZW52aXJvbm1lbnQuZGVtb0RCUHJlZml4fSR7bGFzdERlbW9OdW1iZXIgKyAxfWA7XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZVNjaGVtYShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIGVudmlyb25tZW50LmRlbW9EQkxhYmVsLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgY1UuaWRcbiAgICApO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRBbGxFeGlzdGluZ1RhYmxlcyhjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gU2NoZW1hIFVzZXJzID09PT09PT09PT1cbiAgICovXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFVc2VycyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lcz86IHN0cmluZ1tdLFxuICAgIHVzZXJFbWFpbHM/OiBzdHJpbmdbXSxcbiAgICBpbXBsaWVkRnJvbVJvbGVOYW1lPzogc3RyaW5nLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHNjaGVtYVVzZXJzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHtyb2xlTmFtZXN9LCR7dXNlckVtYWlsc30sJHtpbXBsaWVkRnJvbVJvbGVOYW1lfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBpZiAocm9sZU5hbWVzICYmICFSb2xlLmFyZVJvbGVzKHJvbGVOYW1lcykpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBcInNjaGVtYVVzZXJzOiByb2xlcyBjb250YWlucyBvbmUgb3IgbW9yZSB1bnJlY29nbml6ZWQgc3RyaW5nc1wiLFxuICAgICAgICB2YWx1ZXM6IHJvbGVOYW1lcyxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCB1c2VySWRzID0gdW5kZWZpbmVkO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICAgIHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgICAgaWYgKHVzZXJJZHMubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICBsZXQgaW1wbGllZEZyb21Sb2xlSWQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBpZiAoaW1wbGllZEZyb21Sb2xlTmFtZSkge1xuICAgICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUJ5TmFtZShjVSwgaW1wbGllZEZyb21Sb2xlTmFtZSk7XG4gICAgICBpZiAoIXJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJvbGVSZXN1bHQ7XG4gICAgICBpbXBsaWVkRnJvbVJvbGVJZCA9IHJvbGVSZXN1bHQucGF5bG9hZC5pZDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHJvbGVOYW1lcyxcbiAgICAgIHVzZXJJZHMsXG4gICAgICBpbXBsaWVkRnJvbVJvbGVJZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0U2NoZW1hVXNlcnNSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW10sXG4gICAgcm9sZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0U2NoZW1hVXNlcnNSb2xlKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt1c2VyRW1haWxzfSwke3JvbGVOYW1lfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBpZiAodXNlcnNSZXN1bHQucGF5bG9hZC5sZW5ndGggIT0gdXNlckVtYWlscy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogdXNlckVtYWlscy5maWx0ZXIoXG4gICAgICAgICAgKHg6IHN0cmluZykgPT4gIXVzZXJzUmVzdWx0LnBheWxvYWQuaW5jbHVkZXMoeClcbiAgICAgICAgKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHMsXG4gICAgICByb2xlTmFtZSxcbiAgICAgIFwic2NoZW1hXCIsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlU2NoZW1hVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHJlbW92ZVNjaGVtYVVzZXJzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt1c2VyRW1haWxzfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBjb25zdCB1c2VySWRzOiBudW1iZXJbXSA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkXG4gICAgKTtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICAvLyBjYW4ndCByZW1vdmUgc2NoZW1hIHVzZXIgb3duZXJcbiAgICBpZiAoXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC51c2VyX293bmVyX2lkICYmXG4gICAgICB1c2VySWRzLmluY2x1ZGVzKHNjaGVtYVJlc3VsdC5wYXlsb2FkLnVzZXJfb3duZXJfaWQpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX0NBTlRfUkVNT1ZFX1NDSEVNQV9VU0VSX09XTkVSXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICAvLyBjYW4ndCByZW1vdmUgYWxsIGFkbWlucyAobXVzdCBiZSBhdGxlYXN0IG9uZSlcbiAgICBjb25zdCBhZG1pbnNSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYVVzZXJzKGNVLCBzY2hlbWFOYW1lLCBbXG4gICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSk7XG4gICAgaWYgKCFhZG1pbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGFkbWluc1Jlc3VsdDtcbiAgICBjb25zdCBzY2hlbWFBZG1pbklkczogbnVtYmVyW10gPSBhZG1pbnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICApO1xuICAgIGlmIChcbiAgICAgIHVzZXJJZHMuZmlsdGVyKCh1c2VySWQpID0+IHNjaGVtYUFkbWluSWRzLmluY2x1ZGVzKHVzZXJJZCkpLmxlbmd0aCA9PVxuICAgICAgc2NoZW1hQWRtaW5JZHMubGVuZ3RoXG4gICAgKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1NDSEVNQV9OT19BRE1JTlNcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkcyxcbiAgICAgIFwic2NoZW1hXCIsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5ncygke2NVLmlkfSwke29yZ2FuaXphdGlvbk5hbWV9LCR7c2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICBjVSxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgICBvcmdhbml6YXRpb25SZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIGNVLmlkLFxuICAgICAgc2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGVzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHdpdGhDb2x1bW5zPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHRhYmxlcygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7d2l0aENvbHVtbnN9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwicmVhZF9zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGFibGVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgICAgIGlmICghY29sdW1uc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gY29sdW1uc1Jlc3VsdDtcbiAgICAgICAgdGFibGUuY29sdW1ucyA9IGNvbHVtbnNSZXN1bHQucGF5bG9hZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB0YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlVGFibGVCeU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB3aXRoQ29sdW1ucz86IGJvb2xlYW4sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWNjZXNzaWJsZVRhYmxlQnlOYW1lKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7d2l0aENvbHVtbnN9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlc0J5VXNlcnMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFt0YWJsZU5hbWVdLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFt0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgcmVzdWx0LnBheWxvYWQubmFtZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHJlc3VsdC5wYXlsb2FkLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVRhYmxlcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHdpdGhDb2x1bW5zPzogYm9vbGVhbixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBhY2Nlc3NpYmxlVGFibGVzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt3aXRoQ29sdW1uc30sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwicmVhZF9zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50YWJsZXNCeVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc1Jlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgICAgIGlmICghY29sdW1uc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gY29sdW1uc1Jlc3VsdDtcbiAgICAgICAgdGFibGUuY29sdW1ucyA9IGNvbHVtbnNSZXN1bHQucGF5bG9hZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVMYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGFkZE9yQ3JlYXRlVGFibGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHt0YWJsZUxhYmVsfSwke2NyZWF0ZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl9zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCFjcmVhdGUpIGNyZWF0ZSA9IGZhbHNlO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkT3JDcmVhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICB0YWJsZUxhYmVsLFxuICAgICAgY3JlYXRlXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoXG4gICAgICBjVSxcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuc2NoZW1hTmFtZSA9IHNjaGVtYU5hbWU7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlT3JEZWxldGVUYWJsZSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2RlbH0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGlmICghZGVsKSBkZWwgPSBmYWxzZTtcbiAgICAvLyAxLiByZW1vdmUvZGVsZXRlIGNvbHVtbnNcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGZvciAoY29uc3QgY29sdW1uIG9mIGNvbHVtbnMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgICAgIGNVLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBkZWwsXG4gICAgICAgIHRydWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIDMuIHJlbW92ZSB1c2VyIHNldHRpbmdzXG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucmVtb3ZlQWxsVGFibGVVc2Vycyh0YWJsZVJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyA0LiByZW1vdmUvZGVsZXRlIHRoZSB0YWJsZVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgZGVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIG5ld1RhYmxlTmFtZT86IHN0cmluZyxcbiAgICBuZXdUYWJsZUxhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB1cGRhdGVUYWJsZSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke25ld1RhYmxlTmFtZX0sJHtuZXdUYWJsZUxhYmVsfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVzKGNVLCBzY2hlbWFOYW1lLCBmYWxzZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29uc3QgZXhpc3RpbmdUYWJsZU5hbWVzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXhpc3RpbmdUYWJsZU5hbWVzLmluY2x1ZGVzKG5ld1RhYmxlTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IHdiQ29kZTogXCJXQl9UQUJMRV9OQU1FX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCB1cGRhdGVkVGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51cGRhdGVUYWJsZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBuZXdUYWJsZU5hbWUsXG4gICAgICBuZXdUYWJsZUxhYmVsXG4gICAgKTtcbiAgICBpZiAoIXVwZGF0ZWRUYWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXBkYXRlZFRhYmxlUmVzdWx0O1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICAgICAgY1UsXG4gICAgICAgIHVwZGF0ZWRUYWJsZVJlc3VsdC5wYXlsb2FkXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHVwZGF0ZWRUYWJsZVJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRBbGxFeGlzdGluZ1RhYmxlcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhgYWRkQWxsRXhpc3RpbmdUYWJsZXMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCB0YWJsZU5hbWVzID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgdGFibGVOYW1lcykge1xuICAgICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICAgIGNVLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHYudGl0bGVDYXNlKHRhYmxlTmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIiBcIikpLFxuICAgICAgICBmYWxzZVxuICAgICAgKTtcbiAgICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRpc2NvdmVyQ29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICAgIGZvciAoY29uc3QgY29sdW1uIG9mIGNvbHVtbnMpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgICB2LnRpdGxlQ2FzZShjb2x1bW4ubmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIiBcIikpLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHJlbW92ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYGFkZE9yUmVtb3ZlQWxsRXhpc3RpbmdSZWxhdGlvbnNoaXBzKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHtyZW1vdmV9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICBcIiVcIixcbiAgICAgIFwiJVwiLFxuICAgICAgXCJBTExcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDb25zdHJhaW50SWRbXSA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGlmIChyZWxhdGlvbnNoaXBzLmxlbmd0aCA+IDApIHtcbiAgICAgIGZvciAoY29uc3QgcmVsYXRpb25zaGlwIG9mIHJlbGF0aW9uc2hpcHMpIHtcbiAgICAgICAgaWYgKHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWUgJiYgcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWUpIHtcbiAgICAgICAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICAgIGlmIChyZW1vdmUpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgICAgIGNVLFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAudGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLmNvbHVtbk5hbWVdLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWVdXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgICAgXCJhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogQ29uc3RyYWludElkIG11c3QgaGF2ZSByZWxUYWJsZU5hbWUgYW5kIHJlbENvbHVtbk5hbWVcIixcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKCR7Y1UuaWR9LCR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlLmlkKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgdGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyBkb250IGFkZCBwZXJtaXNzaW9ucyBmb3IgdGFibGVzIHdpdGggbm8gY29sdW1uc1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPT0gMCkgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgY29sdW1uTmFtZXM6IHN0cmluZ1tdID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25DaGVja0FuZFR5cGUgb2YgUm9sZS5oYXN1cmFUYWJsZVBlcm1pc3Npb25DaGVja3NBbmRUeXBlcyhcbiAgICAgIHRhYmxlLmlkXG4gICAgKSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZVBlcm1pc3Npb24oXG4gICAgICAgIHRhYmxlLnNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlLm5hbWUsXG4gICAgICAgIHBlcm1pc3Npb25DaGVja0FuZFR5cGUucGVybWlzc2lvbkNoZWNrLFxuICAgICAgICBwZXJtaXNzaW9uQ2hlY2tBbmRUeXBlLnBlcm1pc3Npb25UeXBlLFxuICAgICAgICBcIndidXNlclwiLFxuICAgICAgICBjb2x1bW5OYW1lc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoJHtjVS5pZH0sJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGUuaWQpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICAvLyBJZiB0aGlzIHRhYmxlIG5vIGxvbmdlciBoYXMgYW55IGNvbHVtbnMsIHRoZXJlIHdpbGwgYmUgbm8gcGVybWlzc2lvbnNcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKGNVLCB0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChyZXN1bHQucGF5bG9hZC5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcGF5bG9hZDogdHJ1ZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcGVybWlzc2lvbktleUFuZFR5cGUgb2YgUm9sZS50YWJsZVBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucyhcbiAgICAgIHRhYmxlLmlkXG4gICAgKSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRlbGV0ZVBlcm1pc3Npb24oXG4gICAgICAgIHRhYmxlLnNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlLm5hbWUsXG4gICAgICAgIHBlcm1pc3Npb25LZXlBbmRUeXBlLmFjdGlvbixcbiAgICAgICAgXCJ3YnVzZXJcIlxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBQYXNzIGVtcHR5IGNvbHVtbk5hbWVzW10gdG8gY2xlYXJcbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtkZWx9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0NvbnN0cmFpbnROYW1lcyA9IE9iamVjdC52YWx1ZXMocmVzdWx0LnBheWxvYWQpO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIG11bHRpcGxlIGNvdWxtbiBwcmltYXJ5IGtleXMgd2lsbCBhbGwgaGF2ZSBzYW1lIGNvbnN0cmFpbnQgbmFtZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGV4aXN0aW5nQ29uc3RyYWludE5hbWVzWzBdIGFzIHN0cmluZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX1BLX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVQcmltYXJ5S2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWRkT3JDcmVhdGVGb3JlaWduS2V5KCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZXN9LCR7cGFyZW50VGFibGVOYW1lfSwke3BhcmVudENvbHVtbk5hbWVzfSwke2NyZWF0ZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiQ1JFQVRFXCI7XG4gICAgaWYgKCFjcmVhdGUpIG9wZXJhdGlvbiA9IFwiQUREXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgcGFyZW50Q29sdW1uTmFtZXMsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlRm9yZWlnbktleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGByZW1vdmVPckRlbGV0ZUZvcmVpZ25LZXkoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtwYXJlbnRUYWJsZU5hbWV9LCR7ZGVsfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJERUxFVEVcIjtcbiAgICBpZiAoIWRlbCkgb3BlcmF0aW9uID0gXCJSRU1PVkVcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXMsXG4gICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICBbXSxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBvcGVyYXRpb24gPSBcIkFERHxDUkVBVEV8UkVNT1ZFfERFTEVURVwiXG4gIHB1YmxpYyBhc3luYyBzZXRGb3JlaWduS2V5KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHBhcmVudENvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0Rm9yZWlnbktleSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30sJHtvcGVyYXRpb259KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXNbMF0sXG4gICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nRm9yZWlnbktleXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGNvbnN0cmFpbnRJZCBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb25zdHJhaW50SWQuY29sdW1uTmFtZV0gPVxuICAgICAgICBjb25zdHJhaW50SWQuY29uc3RyYWludE5hbWU7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdGb3JlaWduS2V5cykuaW5jbHVkZXMoY29sdW1uTmFtZSkpIHtcbiAgICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIlJFTU9WRVwiIHx8IG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRyb3BSZWxhdGlvbnNoaXBzKFxuICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgIHBhcmVudFRhYmxlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29sdW1uTmFtZV0gYXMgc3RyaW5nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgICB3YkNvZGU6IFwiV0JfRktfRVhJU1RTXCIsXG4gICAgICAgICAgICB2YWx1ZXM6IFtjb2x1bW5OYW1lXSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvcGVyYXRpb24gPT0gXCJBRERcIiB8fCBvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICAgIHBhcmVudENvbHVtbk5hbWVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgcGFyZW50VGFibGVOYW1lIC8vIGF1dGhvcnNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lcyAvLyBhdXRob3JfaWRcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtjVS5pZH0sICR7SlNPTi5zdHJpbmdpZnkodGFibGUpfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlLmlkKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIXRhYmxlLnNjaGVtYU5hbWUpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoeyBtZXNzYWdlOiBcInNjaGVtYU5hbWUgbm90IHNldFwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudHJhY2tUYWJsZSh0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zKGNVLCB0YWJsZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHVudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucygke2NVLmlkfSwgJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGUuaWQpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGlmICghdGFibGUuc2NoZW1hTmFtZSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7IG1lc3NhZ2U6IFwic2NoZW1hTmFtZSBub3Qgc2V0XCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoY1UsIHRhYmxlKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS51bnRyYWNrVGFibGUodGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRhYmxlIFVzZXJzPT09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgdGFibGVVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3VzZXJFbWFpbHN9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGxldCB1c2VySWRzID0gdW5kZWZpbmVkO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICAgIHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwudGFibGVVc2VycyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJJZHMsIHdpdGhTZXR0aW5ncyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGBhZGREZWZhdWx0VGFibGVVc2Vyc1RvVGFibGUoJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9KWApO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgIHRhYmxlLnNjaGVtYUlkLFxuICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKSxcbiAgICAgIFt0YWJsZS5pZF1cbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFRhYmxlVXNlcnNSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogW3N0cmluZ10sXG4gICAgcm9sZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgc2V0VGFibGVVc2Vyc1JvbGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHt1c2VyRW1haWxzfSwke3JvbGVOYW1lfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBpZiAodXNlcnNSZXN1bHQucGF5bG9hZC5sZW5ndGggIT0gdXNlckVtYWlscy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogdXNlckVtYWlscy5maWx0ZXIoXG4gICAgICAgICAgKHg6IHN0cmluZykgPT4gIXVzZXJzUmVzdWx0LnBheWxvYWQuaW5jbHVkZXMoeClcbiAgICAgICAgKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHMsXG4gICAgICByb2xlTmFtZSxcbiAgICAgIFwidGFibGVcIixcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVRhYmxlVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlVGFibGVVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3VzZXJFbWFpbHN9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBjb25zdCB1c2VySWRzOiBudW1iZXJbXSA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkXG4gICAgKTtcbiAgICAvLyBjYW4ndCByZW1vdmUgc2NoZW1hIGFkbWluaXN0cmF0b3JzIGZyb20gaW5kaXZpZHVhbCB0YWJsZXNcbiAgICAvLyByZW1vdmUgdGhlbSBmcm9tIHRoZSB3aG9sZSBzY2hlbWEgb25seVxuICAgIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hVXNlcnMoY1UsIHNjaGVtYU5hbWUsIFtcbiAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIWFkbWluc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gYWRtaW5zUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYUFkbWluSWRzOiBudW1iZXJbXSA9IGFkbWluc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICk7XG4gICAgaWYgKFxuICAgICAgdXNlcklkcy5maWx0ZXIoKHVzZXJJZCkgPT4gc2NoZW1hQWRtaW5JZHMuaW5jbHVkZXModXNlcklkKSkubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfQURNSU5cIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGBzYXZlVGFibGVVc2VyU2V0dGluZ3MoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtzZXR0aW5nc30pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgY1UuaWQsXG4gICAgICBzZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBDb2x1bW5zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNvbHVtbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYGNvbHVtbnMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBwS0NvbHNDb25zdHJhaW50czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHBLQ29sdW1uTmFtZXM6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMocEtDb2xzQ29uc3RyYWludHMpO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgY29sdW1uIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICBjb2x1bW4uaXNQcmltYXJ5S2V5ID0gcEtDb2x1bW5OYW1lcy5pbmNsdWRlcyhjb2x1bW4ubmFtZSk7XG4gICAgICBjb25zdCBmb3JlaWduS2V5c1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmZvcmVpZ25LZXlzT3JSZWZlcmVuY2VzKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbi5uYW1lLFxuICAgICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgICApO1xuICAgICAgaWYgKCFmb3JlaWduS2V5c1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgY29sdW1uLmZvcmVpZ25LZXlzID0gZm9yZWlnbktleXNSZXN1bHQucGF5bG9hZDtcbiAgICAgIGNvbnN0IHJlZmVyZW5jZXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgXCJSRUZFUkVOQ0VTXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlZmVyZW5jZXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbHVtbi5yZWZlcmVuY2VkQnkgPSByZWZlcmVuY2VzUmVzdWx0LnBheWxvYWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTGFiZWw6IHN0cmluZyxcbiAgICBjcmVhdGU/OiBib29sZWFuLFxuICAgIGNvbHVtblR5cGU/OiBzdHJpbmcsXG4gICAgc2tpcFRyYWNraW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgYWRkT3JDcmVhdGVDb2x1bW4oJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke2NvbHVtbkxhYmVsfSwke2NyZWF0ZX0sJHtjb2x1bW5UeXBlfSwke3NraXBUcmFja2luZ30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGlmICghY3JlYXRlKSBjcmVhdGUgPSBmYWxzZTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAoIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgY29sdW1uUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZSxcbiAgICAgIGNvbHVtbkxhYmVsLFxuICAgICAgY3JlYXRlLFxuICAgICAgY29sdW1uVHlwZVxuICAgICk7XG4gICAgaWYgKGNvbHVtblJlc3VsdC5zdWNjZXNzICYmICFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gY29sdW1uUmVzdWx0O1xuICB9XG5cbiAgLy8gTXVzdCBlbnRlciBhbmQgZXhpdCB3aXRoIHRyYWNrZWQgdGFibGUsIHJlZ2FyZGxlc3Mgb2YgaWYgdGhlcmUgYXJlIGNvbHVtbnNcbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW4sXG4gICAgc2tpcFRyYWNraW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoXG4gICAgICBgcmVtb3ZlT3JEZWxldGVDb2x1bW4oJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke2RlbH0sJHtza2lwVHJhY2tpbmd9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBkZWxcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiAhc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZUNvbHVtbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKFxuICAgICAgYHVwZGF0ZUNvbHVtbigke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWV9LCR7bmV3Q29sdW1uTmFtZX0sJHtuZXdDb2x1bW5MYWJlbH0sJHtuZXdUeXBlfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgLy8gVEJEOiBpZiB0aGlzIGlzIGEgZmtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb25zdCBleGlzdGluZ0NvbHVtbk5hbWVzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXhpc3RpbmdDb2x1bW5OYW1lcy5pbmNsdWRlcyhuZXdDb2x1bW5OYW1lKSkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX0NPTFVNTl9OQU1FX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld1R5cGUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVwZGF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgIG5ld0NvbHVtbkxhYmVsLFxuICAgICAgbmV3VHlwZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdUeXBlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPclJlbW92ZUNvbHVtblNlcXVlbmNlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIG5leHRTZXFOdW1iZXI/OiBudW1iZXIsXG4gICAgcmVtb3ZlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoY1UsIHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3Qgc2NoZW1hID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShjVSwgc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHRhYmxlID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY29sdW1uQnlTY2hlbWFOYW1lVGFibGVOYW1lQ29sdW1uTmFtZShcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbiA9IHJlc3VsdC5wYXlsb2FkO1xuXG4gICAgaWYgKHJlbW92ZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucmVtb3ZlU2VxdWVuY2VGcm9tQ29sdW1uKHNjaGVtYSwgdGFibGUsIGNvbHVtbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZFNlcXVlbmNlVG9Db2x1bW4oXG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgdGFibGUsXG4gICAgICAgIGNvbHVtbixcbiAgICAgICAgbmV4dFNlcU51bWJlclxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFV0aWwgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXRpbChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgZm46IHN0cmluZyxcbiAgICB2YWxzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmRlYnVnKGB1dGlsKCR7Y1UuaWR9LCR7Zm59LCR7SlNPTi5zdHJpbmdpZnkodmFscyl9KWApO1xuICAgIC8vIGRlZmVyIGFjY2VzcyBjb250cm9sIHRvIGNhbGxlZCBtZXRob2RzXG4gICAgbGV0IHJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIHN3aXRjaCAoZm4pIHtcbiAgICAgIGNhc2UgXCJhZGROZXh0RGVtb1NjaGVtYVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE5leHREZW1vU2NoZW1hKGNVKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicmVzZXRUZXN0RGF0YVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlc2V0VGVzdERhdGEoY1UpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFRlc3QgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcmVzZXRUZXN0RGF0YShjVTogQ3VycmVudFVzZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuZGVidWcoYHJlc2V0VGVzdERhdGEoKWApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSAmJiBjVS5pc250VGVzdFVzZXIoKSkge1xuICAgICAgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluT3JUZXN0VXNlcigpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFwidGVzdF8lXCJcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVTY2hlbWEoXG4gICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgIHNjaGVtYS5uYW1lLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVUZXN0T3JnYW5pemF0aW9ucyhDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlVGVzdFVzZXJzKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuXG4vKipcbiAqID09PT09PT09PT0gRXJyb3IgSGFuZGxpbmcgPT09PT09PT09PVxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJSZXN1bHQocmVzdWx0PzogU2VydmljZVJlc3VsdCk6IFNlcnZpY2VSZXN1bHQge1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IFwiUmVzdWx0IGhhcyBub3QgYmVlbiBhc3NpZ25lZFwiLFxuICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgfVxuICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT0gdHJ1ZSkge1xuICAgIHJlc3VsdCA9IHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJXaGl0ZWJyaWNrQ2xvdWQgZXJyUmVzdWx0OiByZXN1bHQgaXMgbm90IGFuIGVycm9yIChzdWNjZXNzPT10cnVlKVwiLFxuICAgIH07XG4gIH0gZWxzZSBpZiAoIShcInN1Y2Nlc3NcIiBpbiByZXN1bHQpKSB7XG4gICAgcmVzdWx0LnN1Y2Nlc3MgPSBmYWxzZTtcbiAgfVxuICBpZiAoIXJlc3VsdC5tZXNzYWdlICYmIHJlc3VsdC53YkNvZGUpIHtcbiAgICByZXN1bHQubWVzc2FnZSA9IFVTRVJfTUVTU0FHRVNbcmVzdWx0LndiQ29kZV1bMF07XG4gICAgaWYgKCFyZXN1bHQubWVzc2FnZSkge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYFdoaXRlYnJpY2tDbG91ZCBlcnJSZXN1bHQ6IENvdWxkIG5vdCBmaW5kIG1lc3NhZ2UgZm9yIHdiQ29kZT0ke3Jlc3VsdC53YkNvZGV9YCxcbiAgICAgIH07XG4gICAgfVxuICB9XG4gIGlmIChyZXN1bHQudmFsdWVzKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSBgJHtyZXN1bHQubWVzc2FnZX0gVmFsdWVzOiAke3Jlc3VsdC52YWx1ZXMuam9pbihcIiwgXCIpfWA7XG4gICAgZGVsZXRlIHJlc3VsdC52YWx1ZXM7XG4gIH1cbiAgaWYgKFxuICAgICFyZXN1bHQuYXBvbGxvRXJyb3JDb2RlICYmXG4gICAgcmVzdWx0LndiQ29kZSAmJlxuICAgIE9iamVjdC5rZXlzKFVTRVJfTUVTU0FHRVMpLmluY2x1ZGVzKHJlc3VsdC53YkNvZGUpICYmXG4gICAgVVNFUl9NRVNTQUdFU1tyZXN1bHQud2JDb2RlXS5sZW5ndGggPT0gMlxuICApIHtcbiAgICByZXN1bHQuYXBvbGxvRXJyb3JDb2RlID0gVVNFUl9NRVNTQUdFU1tyZXN1bHQud2JDb2RlXVsxXTtcbiAgfSBlbHNlIGlmIChcbiAgICAhcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSAmJlxuICAgIHJlc3VsdC53YkNvZGUgJiZcbiAgICAhT2JqZWN0LmtleXMoVVNFUl9NRVNTQUdFUykuaW5jbHVkZXMocmVzdWx0LndiQ29kZSlcbiAgKSB7XG4gICAgcmVzdWx0ID0ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBgV2hpdGVicmlja0Nsb3VkIGVycjogQ291bGQgbm90IGZpbmQgYXBvbGxvRXJyb3JDb2RlIGZvciB3YkNvZGU9JHtyZXN1bHQud2JDb2RlfWAsXG4gICAgfTtcbiAgfSBlbHNlIGlmICghcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSkge1xuICAgIHJlc3VsdC5hcG9sbG9FcnJvckNvZGUgPSBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcG9sbG9FcnIocmVzdWx0OiBTZXJ2aWNlUmVzdWx0KTogRXJyb3Ige1xuICByZXN1bHQgPSBlcnJSZXN1bHQocmVzdWx0KTtcbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV0dXJuIG5ldyBFcnJvcihcbiAgICAgIFwiV2hpdGVicmlja0Nsb3VkLmVycjogcmVzdWx0IGlzIG5vdCBhbiBlcnJvciAoc3VjY2Vzcz09dHJ1ZSlcIlxuICAgICk7XG4gIH1cbiAgY29uc3QgZGV0YWlsczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBpZiAoIXJlc3VsdC5tZXNzYWdlKSByZXN1bHQubWVzc2FnZSA9IFwiVW5rbm93biBlcnJvci5cIjtcbiAgaWYgKHJlc3VsdC5yZWZDb2RlKSBkZXRhaWxzLnJlZkNvZGUgPSByZXN1bHQucmVmQ29kZTtcbiAgaWYgKHJlc3VsdC53YkNvZGUpIGRldGFpbHMud2JDb2RlID0gcmVzdWx0LndiQ29kZTtcbiAgcmV0dXJuIG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSwgZGV0YWlscyk7XG59XG5cbmV4cG9ydCBjb25zdCBiZ0hhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IGFueSA9IHt9KTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgbG9nLmluZm8oXCI9PSBiZ0hhbmRsZXIgPT1cXG5DYWxsIGFzeW5jIGV2ZW50IGhlcmUuLi5cIik7XG4gIC8vIENhbiBiZSB1c2VkIHRvIGNhbGwgYXN5bmMgZXZlbnRzIHdpdGhvdXQgd2FpdGluZyBmb3IgcmV0dXJuLCBlZyBmcm9tIGVsc2V3aGVyZTpcbiAgLy8gaW1wb3J0IExhbWJkYSBmcm9tIFwiYXdzLXNkay9jbGllbnRzL2xhbWJkYVwiO1xuICAvLyBpbXBvcnQgQVdTIGZyb20gXCJhd3Mtc2RrXCI7XG4gIC8vIGNvbnN0IGxhbWJkYSA9IG5ldyBMYW1iZGEoe1xuICAvLyAgIGVuZHBvaW50OiBuZXcgQVdTLkVuZHBvaW50KFwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCIpLFxuICAvLyB9KTtcbiAgLy8gY29uc3QgcGFyYW1zID0ge1xuICAvLyAgIEZ1bmN0aW9uTmFtZTogXCJ3aGl0ZWJyaWNrLWNsb3VkLWRldi1iZ1wiLFxuICAvLyAgIEludm9jYXRpb25UeXBlOiBcIkV2ZW50XCIsXG4gIC8vICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkoeyBoZWxsbzogXCJXb3JsZFwiIH0pLFxuICAvLyB9O1xuICAvLyBjb25zdCByID0gYXdhaXQgbGFtYmRhLmludm9rZShwYXJhbXMpLnByb21pc2UoKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXhpb3NcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtdG9vbHNcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtdHlwZS1qc29uXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJsb2Rhc2hcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInBnXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ0c2xvZ1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwidm9jYVwiKTs7IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL3doaXRlYnJpY2stY2xvdWQudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQWVBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBO0FBQ0E7QUFDQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBOztBQUVBOzs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7O0FBR0E7QUFDQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTs7Ozs7Ozs7Ozs7O0FBWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FBT0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7O0FBV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7QUFlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFNQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQVFBOzs7Ozs7Ozs7Ozs7O0FBYUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBOEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FBUUE7Ozs7Ozs7Ozs7Ozs7OztBQWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBSUE7O0FBT0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTs7Ozs7O0FBTUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBSUE7O0FBT0E7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FBTUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7Ozs7Ozs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBOzs7Ozs7Ozs7Ozs7QUFZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFqdEVBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ2pCQTtBQXdCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNiQTtBQUVBO0FBRUE7QUFDQTtBQUVBO0FBZ0JBO0FBWkE7QUFHQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBR0E7QUFLQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFFQTtBQVFBO0FBQ0E7QUFJQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFJQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFyV0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDUkE7QUFFQTtBQVVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFwQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDSkE7QUFFQTtBQWVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdkRBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0pBO0FBd0JBO0FBOEVBO0FBQ0E7QUFDQTtBQUtBO0FBNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUEyQkE7QUFLQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBSUE7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUF1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQzdGQTtBQUVBO0FBcUJBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ1ZBO0FBRUE7QUFlQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFoREE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDSkE7QUFFQTtBQWFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUF6Q0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDSkE7QUFFQTtBQWdCQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBbERBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBV0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQXREQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3ZIQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQVdBO0FBeVJBO0FBdlJBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7O0FBbFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTZSQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUN0VEE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2RkE7QUFDQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUNBO0FBMkJBOzs7Ozs7Ozs7QUFTQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzdGQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFzRUE7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMvTUE7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWdGQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBV0E7QUFDQTtBQVNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzNPQTtBQUNBO0FBQ0E7QUFHQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWtMQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2hmQTtBQUNBO0FBUUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXVDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBU0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFxaEZBO0FBbmhGQTtBQUNBO0FBQ0E7QUFHQTs7QUFJQTtBQU1BO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFFQTtBQUlBO0FBQUE7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFFQTtBQUtBO0FBQUE7QUFDQTtBQUVBO0FBTUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBTUE7QUFBQTtBQUdBO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFPQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFJQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBSUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBTUE7QUFHQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBUUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBTUE7QUFHQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQ0E7QUFFQTtBQUNBO0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUlBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUVBOztBQUtBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUdBOztBQVVBO0FBR0E7QUFBQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBVUE7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBT0E7QUFBQTtBQUNBO0FBR0E7QUFPQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQUE7QUFDQTtBQUVBO0FBS0E7QUFBQTtBQUNBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQVVBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBS0E7O0FBUUE7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFHQTtBQUFBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUFBO0FBQ0E7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFTQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBU0E7QUFBQTtBQUVBOztBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFTQTtBQUFBO0FBR0E7O0FBU0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU9BO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUtBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBS0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFVQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQVFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVNBO0FBR0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQXRoRkE7QUE0aEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWpEQTtBQW1EQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBWkE7QUFjQTtBQUNBO0FBYUE7QUFkQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7QUNub0ZBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBIiwic291cmNlUm9vdCI6IiJ9