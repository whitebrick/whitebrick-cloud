/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/bg-queue.ts":
/*!*************************!*\
  !*** ./src/bg-queue.ts ***!
  \*************************/
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
exports.BgQueue = void 0;
const environment_1 = __webpack_require__(/*! ./environment */ "./src/environment.ts");
const whitebrick_cloud_1 = __webpack_require__(/*! ./whitebrick-cloud */ "./src/whitebrick-cloud.ts");
const CurrentUser_1 = __webpack_require__(/*! ./entity/CurrentUser */ "./src/entity/CurrentUser.ts");
const lambda_1 = __importDefault(__webpack_require__(/*! aws-sdk/clients/lambda */ "aws-sdk/clients/lambda"));
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
class BgQueue {
    constructor(wbCloud, dal) {
        this.dal = dal;
        this.wbCloud = wbCloud;
    }
    queue(userId, schemaId, key, data) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.info(`bgQueue.queue(${key},${data})`);
            return yield this.dal.bgQueueInsert(userId, schemaId, BgQueue.BG_STATUS.pending, key, data);
        });
    }
    invoke(schemaId) {
        return __awaiter(this, void 0, void 0, function* () {
            let invokationResult;
            whitebrick_cloud_1.log.info(`bgQueue.invoke(${schemaId})`);
            try {
                if (environment_1.environment.lambdaBgFunctionName) {
                    const lambda = new lambda_1.default({
                        region: environment_1.environment.awsRegion,
                    });
                    const params = {
                        FunctionName: environment_1.environment.lambdaBgFunctionName,
                        InvocationType: "Event",
                        Payload: JSON.stringify({
                            schemaId: schemaId,
                        }),
                    };
                    whitebrick_cloud_1.log.info(`Invoking lambda with params: ${params}`);
                    invokationResult = yield lambda.invoke(params).promise();
                }
                else {
                    whitebrick_cloud_1.log.info(`Posting to ${environment_1.environment.localBgFunctionUrl}`);
                    invokationResult = axios_1.default
                        .create()
                        .post(environment_1.environment.localBgFunctionUrl, {
                        query: `mutation { wbUtil(fn: "invokeBg", vals: {schemaId: ${schemaId}}) }`,
                    });
                }
            }
            catch (error) {
                whitebrick_cloud_1.log.error(error);
                return whitebrick_cloud_1.errResult({
                    message: error.message,
                });
            }
            return { success: true, payload: invokationResult };
        });
    }
    process(schemaId) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.info(`bgQueue.process(${schemaId})`);
            const isRunningResult = yield this.dal.bgQueueSelect(["id"], schemaId, BgQueue.BG_STATUS.running, 1);
            if (!isRunningResult.success)
                return isRunningResult;
            if (isRunningResult.payload.rows.length == 1) {
                whitebrick_cloud_1.log.info(`bgQueue.process - already running`);
                return { success: true };
            }
            const setRunningResult = yield this.dal.bgQueueUpdateStatus(BgQueue.BG_STATUS.running, undefined, schemaId, BgQueue.BG_STATUS.pending);
            if (!setRunningResult.success)
                return setRunningResult;
            let running = true;
            while (running) {
                const bgJobFetchResult = yield this.dal.bgQueueSelect(["id", "key", "data"], schemaId, BgQueue.BG_STATUS.running, 1);
                if (!bgJobFetchResult.success)
                    return bgJobFetchResult;
                whitebrick_cloud_1.log.info(`  - bgJobFetchResult=${JSON.stringify(bgJobFetchResult)}`);
                if (bgJobFetchResult.payload.rows.length == 0) {
                    whitebrick_cloud_1.log.info(`  - no jobs left to run`);
                    return { success: true };
                }
                const bgJobProcessResult = yield this.bgRun(bgJobFetchResult.payload.rows[0].id, bgJobFetchResult.payload.rows[0].key, bgJobFetchResult.payload.rows[0].data);
                if (!bgJobProcessResult.success) {
                    const setErrorResult = yield this.dal.bgQueueUpdateStatus(BgQueue.BG_STATUS.error, bgJobFetchResult.payload.rows[0].id, undefined, undefined, {
                        data: bgJobFetchResult.payload.rows[0].data,
                        error: bgJobProcessResult,
                    });
                    if (!setErrorResult.success)
                        return setErrorResult;
                    whitebrick_cloud_1.log.info(`  - job returned error, added to data.error`);
                }
                const setSuccessResult = yield this.dal.bgQueueUpdateStatus(BgQueue.BG_STATUS.success, bgJobFetchResult.payload.rows[0].id);
                if (!setSuccessResult.success)
                    return setSuccessResult;
            }
            return { success: true };
        });
    }
    bgRun(id, key, data) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.info(`  bgQueue.bgRun - running job id=${id} key=${key} data=${data}`);
            let result = whitebrick_cloud_1.errResult();
            const cU = CurrentUser_1.CurrentUser.getSysAdmin();
            switch (key) {
                case "bgImportSchema":
                    result = yield this.wbCloud.addAllExistingTables(cU, data.schemaName);
                    if (!result.success)
                        break;
                    result = yield this.wbCloud.addOrRemoveAllExistingRelationships(cU, data.schemaName);
                    if (!result.success)
                        break;
                    result = yield this.wbCloud.deleteAndSetTablePermissions(cU, undefined, data.schemaName);
                    break;
                case "bgRemoveSchema":
                    result = yield this.wbCloud.removeOrDeleteSchema(cU, data.schemaName);
                    break;
                case "bgAddDefaultTablePermissions":
                    result = yield this.wbCloud.addDefaultTablePermissions(cU, data.schemaName, data.tableName);
                    if (!result.success)
                        break;
                    result = yield this.wbCloud.addOrRemoveAllExistingRelationships(cU, data.schemaName, data.tableName);
                    break;
                case "bgRemoveDefaultTablePermissions":
                    result = yield this.wbCloud.removeDefaultTablePermissions(cU, data.schemaName, data.tableName);
                    break;
                case "bgRemoveAndAddDefaultTablePermissions":
                    result = yield this.wbCloud.removeDefaultTablePermissions(cU, data.schemaName, data.tableName);
                    if (!result.success)
                        break;
                    result = yield this.wbCloud.addDefaultTablePermissions(cU, data.schemaName, data.tableName);
                    if (!result.success)
                        break;
                    result = yield this.wbCloud.addOrRemoveAllExistingRelationships(cU, data.schemaName, data.tableName);
                    break;
                case "bgReloadRemoteSchemasAndMetadata":
                    result = yield this.wbCloud.setRemoteSchemas(cU);
                    if (!result.success)
                        break;
                    result = yield this.wbCloud.reloadMetadata(cU);
                    break;
                default:
                    whitebrick_cloud_1.log.error(`== bgHandler ERROR: no case for event.fn ${key}`);
            }
            whitebrick_cloud_1.log.info(`  bgQueue.bgRun - returning result=${result}`);
            return result;
        });
    }
}
exports.BgQueue = BgQueue;
BgQueue.BG_STATUS = {
    pending: "Pending",
    running: "Running",
    success: "Success",
    error: "Error",
};


/***/ }),

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
                    let logTxt = queryParams.query;
                    if (logTxt.startsWith("--SKIPLOG"))
                        logTxt = logTxt.substring(0, 30);
                    whitebrick_cloud_1.log.info(`dal.executeQuery QueryParams: ${logTxt}`, `    [ ${queryParams.params ? queryParams.params.join(", ") : ""} ]`);
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
    healthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.discoverSchemas("%", "schema_name", 1);
        });
    }
    bgQueueSelect(columns, schemaId, status, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      SELECT ${columns.join(",")}
      FROM wb.bg_queue
      WHERE schema_id=$1
      AND status=$2
      ORDER BY id
    `;
            if (limit)
                query += ` LIMIT ${limit}`;
            return yield this.executeQuery({
                query: query,
                params: [schemaId, status],
            });
        });
    }
    bgQueueInsert(userId, schemaId, status, key, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!data)
                data = null;
            const result = yield this.executeQuery({
                query: `
        INSERT INTO wb.bg_queue(
          user_id, schema_id, status, key, data
        ) VALUES($1, $2, $3, $4, $5) RETURNING *
      `,
                params: [userId, schemaId, status, key, data],
            });
            return result;
        });
    }
    bgQueueUpdateStatus(newStatus, id, schemaId, currentStatus, data) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      UPDATE wb.bg_queue
      SET status=$1, updated_at=$2
      WHERE
    `;
            const whereSql = [];
            if (id)
                whereSql.push(`id=${id}`);
            if (schemaId)
                whereSql.push(`schema_id=${schemaId}`);
            if (currentStatus)
                whereSql.push(`status='${currentStatus}'`);
            const result = yield this.executeQuery({
                query: (query += whereSql.join(" AND ")),
                params: [newStatus, new Date()],
            });
            return result;
        });
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
            whitebrick_cloud_1.log.info(`dal.setRole(${userIds},${roleName},${roleLevel},${objectId},${keepImpliedFrom})`);
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
            whitebrick_cloud_1.log.info(`dal.roleAndIdForUserObject(${userId},${roleLevel},${objectIdOrName},${parentObjectName})`);
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
        WHERE wb.schemas.name LIKE '${schemaNamePattern}'
        AND wb.schemas.user_owner_id=${entity_1.User.SYS_ADMIN_ID}
        ORDER BY name
        LIMIT 1
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
            whitebrick_cloud_1.log.info(`dal.updateSchema(${schema},${newSchemaName},${newSchemaLabel},${newOrganizationOwnerId},${newUserOwnerId})`);
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
            let onlyAdminUser = false;
            if (userIds && userIds.length == 1 && userIds[0] == entity_1.User.SYS_ADMIN_ID) {
                onlyAdminUser = true;
            }
            if (userIds && !onlyAdminUser) {
                params.push(userIds);
                sqlWhere = `AND wb.users.id=ANY($${params.length}) `;
            }
            else if (userEmails) {
                params.push(userEmails);
                sqlWhere = `AND wb.users.email=ANY($${params.length}) `;
            }
            if (tableNames) {
                params.push(tableNames);
                sqlWhere += `AND wb.tables.name=ANY($${params.length})`;
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
                query: `--SKIPLOG foreignKeysOrReferences
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
        map.delete_rule      AS fk_on_delete,
        -- add labels
        tables_ref.label     AS ref_table_label,
        columns_ref.label    AS ref_column_label,
        tables_fk.label      AS fk_table_label,
        columns_fk.label     AS fk_column_label
        -- lists fk constraints AND maps them to pk constraints
        FROM information_schema.referential_constraints AS map
        -- join unique constraints (e.g. PKs constraints) to ref columns info
        JOIN information_schema.key_column_usage AS ref
        ON  ref.constraint_catalog = map.unique_constraint_catalog
        AND ref.constraint_schema = map.unique_constraint_schema
        AND ref.constraint_name = map.unique_constraint_name
        -- optional: to include reference constraint type
        LEFT JOIN information_schema.table_constraints AS refd
        ON  refd.constraint_catalog = ref.constraint_catalog
        AND refd.constraint_schema = ref.constraint_schema
        AND refd.constraint_name = ref.constraint_name
        -- join fk columns to the correct ref columns using ordinal positions
        JOIN information_schema.key_column_usage AS fk
        ON  fk.constraint_catalog = map.constraint_catalog
        AND fk.constraint_schema = map.constraint_schema
        AND fk.constraint_name = map.constraint_name
        AND fk.position_in_unique_constraint = ref.ordinal_position --IMPORTANT!
        -- add labels
        JOIN wb.schemas ON schemas.name=ref.table_schema
        JOIN wb.tables tables_ref ON (tables_ref.schema_id=wb.schemas.id AND tables_ref.name=ref.table_name)
        JOIN wb.columns columns_ref ON (columns_ref.table_id=tables_ref.id AND columns_ref.name=ref.column_name)
        JOIN wb.tables tables_fk ON (tables_fk.schema_id=wb.schemas.id AND tables_fk.name=fk.table_name )
        JOIN wb.columns columns_fk ON (columns_fk.table_id=tables_fk.id AND columns_fk.name=fk.column_name)
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
                    tableLabel: row.fk_table_label,
                    columnName: row.fk_column,
                    columnLabel: row.fk_column_label,
                    relTableName: row.ref_table,
                    relTableLabel: row.ref_table_label,
                    relColumnName: row.ref_column,
                    relColumnLabel: row.ref_column_label,
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
            whitebrick_cloud_1.log.info(`dal.createForeignKey(${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames})`);
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
            whitebrick_cloud_1.log.info(`dal.addOrCreateTable ${schemaName} ${tableName} ${tableLabel} ${create}`);
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
            whitebrick_cloud_1.log.info(`dal.setSchemaUserRolesFromOrganizationRoles(${organizationId}, <roleMap>, ${schemaIds}, ${userIds}, ${clearExistingImpliedFromRoleName})`);
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
            whitebrick_cloud_1.log.info(`dal.setTableUserRolesFromSchemaRoles(${schemaId}, ${JSON.stringify(roleMap)}, ${tableIds}, ${userIds}, ${clearExisting})`);
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
                        wbCode: "WB_COLUMN_NOT_FOUND",
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
      information_schema.columns.column_default as default,
      information_schema.columns.is_nullable as is_nullable
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
    discoverColumns(schemaName, tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = `
      SELECT column_name as name, data_type as type
      FROM information_schema.columns
      WHERE table_schema=$1
      AND table_name=$2
    `;
            let params = [schemaName, tableName];
            if (columnName) {
                query += " AND column_name=$3";
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
    addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnPGType) {
        return __awaiter(this, void 0, void 0, function* () {
            whitebrick_cloud_1.log.info(`dal.addOrCreateColumn ${schemaName} ${tableName} ${columnName} ${columnLabel} ${columnPGType} ${create}`);
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
            if (create && results[1] && !results[1].success)
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
                    query: `CREATE SEQUENCE ${schema.name}.${sequencName}`,
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
        if (data.is_nullable)
            column.isNullable = data.is_nullable != "NO";
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
            whitebrick_cloud_1.log.info(`currentUser.can(${userAction},${objectIdOrName}) policy:${JSON.stringify(policy)}`);
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
            whitebrick_cloud_1.log.info(`role: ${JSON.stringify(roleResult.payload)} permitted: ${permitted}`);
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
                whitebrick_cloud_1.log.info(`========== FOUND TEST USER: ${headersLowerCase["x-test-user-email"]}`);
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
                whitebrick_cloud_1.log.info("========== FOUND SYSADMIN USER");
                return CurrentUser.getSysAdmin();
            }
            else if (headersLowerCase["x-hasura-user-id"]) {
                whitebrick_cloud_1.log.info(`========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`);
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
                whitebrick_cloud_1.log.info(`CurrentUser.fromContext: Could not find headers for Admin, Test or User in: ${JSON.stringify(context.headers)}`);
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
Schema.WB_SYS_SCHEMA_ID = 1;
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
    localBgFunctionUrl: process.env.LOCAL_BG_FUNCTION_URL,
    lambdaBgFunctionName: process.env.LAMBDA_BG_FUNCTION_NAME,
    awsRegion: process.env.WB_AWS_REGION,
    wbRemoteSchemaName: process.env.WB_REMOTE_SCHEMA_NAME,
    wbRemoteSchemaURL: process.env.WB_REMOTE_SCHEMA_URL,
    wbaRemoteSchemaName: process.env.WBA_REMOTE_SCHEMA_NAME,
    wbaRemoteSchemaURL: process.env.WBA_REMOTE_SCHEMA_URL,
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
        "You don’t have access to any Databases. Please contact your System Administrator for access to an existing Database or create a new Database below.",
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
    WB_COLUMN_NAME_EXISTS: ["This Column name already exists.", "BAD_USER_INPUT"],
    WB_COLUMN_NOT_FOUND: ["This Column does not exist.", "BAD_USER_INPUT"],
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
                whitebrick_cloud_1.log.info(`hasuraApi.post: type: ${type}`, args);
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
            whitebrick_cloud_1.log.info(`hasuraApi.createObjectRelationship(${schemaName}, ${tableName}, ${columnName}, ${parentTableName})`);
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
            whitebrick_cloud_1.log.info(`hasuraApi.createArrayRelationship(${schemaName}, ${tableName}, ${childTableName}, ${childColumnNames})`);
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
    healthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            let result = whitebrick_cloud_1.errResult();
            try {
                whitebrick_cloud_1.log.info("hasuraApi.healthCheck()");
                const response = yield this.http.get("/healthz", {
                    timeout: 3000,
                });
                result = {
                    success: true,
                    payload: {
                        status: response.status,
                        statusText: response.statusText,
                    },
                };
            }
            catch (error) {
                result = whitebrick_cloud_1.errResult({
                    message: error.message,
                    values: [JSON.stringify(error)],
                });
            }
            return result;
        });
    }
    setRemoteSchema(remoteSchemaName, remoteSchemaURL) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.post("remove_remote_schema", {
                name: remoteSchemaName,
            });
            if (!result.success && result.refCode && result.refCode == "not-exists") {
                result = {
                    success: true,
                    payload: true,
                    message: `ignored: ${result.refCode}`,
                };
            }
            if (!result.success)
                return result;
            result = yield this.post("add_remote_schema", {
                name: remoteSchemaName,
                definition: {
                    url: remoteSchemaURL,
                    headers: [],
                    forward_client_headers: true,
                    timeout_seconds: 1200,
                },
            });
            return result;
        });
    }
    reloadMetadata() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.post("reload_metadata", {});
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
            "schema_editor",
            "schema_manager",
            "schema_administrator",
            "schema_owner",
        ],
    },
    alter_schema: {
        roleLevel: "schema",
        description: "Alter this Database",
        permittedRoles: [
            "schema_editor",
            "schema_manager",
            "schema_administrator",
            "schema_owner",
        ],
    },
    manage_access_to_schema: {
        roleLevel: "schema",
        description: "Manage Access to this Database",
        permittedRoles: ["schema_manager", "schema_administrator", "schema_owner"],
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
const isPortReachable = __webpack_require__(/*! is-port-reachable */ "is-port-reachable");
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
                googlePortReachable: yield isPortReachable(80, { host: "google.com" }),
                hasuraHealthCheck: yield context.wbCloud.hasuraHealthCheck(),
                dbSelect: yield context.wbCloud.dbHealthCheck(),
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
    wbImportSchema(schemaName: String!): Boolean!
    wbRemoveSchema(schemaName: String!): Boolean!
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
        wbImportSchema: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.importSchema(currentUser, schemaName);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveSchema: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeSchema(currentUser, schemaName);
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
    isNullable: Boolean
    isPrimaryKey: Boolean!
    foreignKeys: [ConstraintId]!
    referencedBy: [ConstraintId]!
    createdAt: String!
    updatedAt: String!
  }

  type ConstraintId {
    constraintName: String!
    tableName: String!
    tableLabel: String!
    columnName: String!
    columnLabel: String!
    relTableName: String
    relTableLabel: String
    relColumnName: String
    relColumnLabel: String
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
    wbAddExistingTable(schemaName: String!, tableName: String!): Boolean!
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
      sync: Boolean
    ): Boolean!
    wbUpdateColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      newColumnName: String
      newColumnLabel: String
      newType: String
      sync: Boolean
    ): Boolean!
    wbRemoveOrDeleteColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      del: Boolean
      sync: Boolean
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
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.columns(currentUser, schemaName, tableName);
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
        wbAddExistingTable: (_, { schemaName, tableName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addExistingTable(currentUser, schemaName, tableName);
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
        wbAddOrCreateColumn: (_, { schemaName, tableName, columnName, columnLabel, create, columnType, sync, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.addOrCreateColumn(currentUser, schemaName, tableName, columnName, columnLabel, create, columnType, sync);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbUpdateColumn: (_, { schemaName, tableName, columnName, newColumnName, newColumnLabel, newType, sync, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.updateColumn(currentUser, schemaName, tableName, columnName, newColumnName, newColumnLabel, newType, sync);
            if (!result.success)
                throw context.wbCloud.err(result);
            return result.success;
        }),
        wbRemoveOrDeleteColumn: (_, { schemaName, tableName, columnName, del, sync }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const currentUser = yield entity_1.CurrentUser.fromContext(context);
            const result = yield context.wbCloud.removeOrDeleteColumn(currentUser, schemaName, tableName, columnName, del, sync);
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
const bg_queue_1 = __webpack_require__(/*! ./bg-queue */ "./src/bg-queue.ts");
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
        this.bgQueue = new bg_queue_1.BgQueue(this, this.dal);
    }
    err(result) {
        return apolloErr(result);
    }
    auth(cU, userAuthId) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`auth(${userAuthId})`);
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
            exports.log.info(`signUp(${userAuthId},${JSON.stringify(userObj)})`);
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
            exports.log.info(`roleByName(${cU.id},${name})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.roleByName(name);
        });
    }
    roleAndIdForUserObject(cU, userId, roleLevel, objectIdOrName, parentObjectName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`roleAndIdForUserObject(${cU.id},${userId},${roleLevel},${objectIdOrName},${parentObjectName})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            return this.dal.roleAndIdForUserObject(userId, roleLevel, objectIdOrName, parentObjectName);
        });
    }
    deleteAndSetTablePermissions(cU, table, schemaName, deleteOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`deleteAndSetTablePermissions(${cU.id},${table},${schemaName},${deleteOnly})`);
            let tables = [];
            if (table) {
                if (yield cU.cant("manage_access_to_table", table.id))
                    return cU.denied();
                tables = [table];
            }
            else if (schemaName) {
                if (yield cU.cant("manage_access_to_schema", schemaName)) {
                    return cU.denied();
                }
                const tablesResult = yield this.tables(cU, schemaName);
                if (!tablesResult.success)
                    return tablesResult;
                tables = tablesResult.payload;
            }
            if (tables.length == 0) {
                return errResult({
                    message: `tables.length==0 for deleteAndSetTablePermissions`,
                });
            }
            let result = errResult();
            for (const table of tables) {
                result = yield this.dal.deleteAndSetTablePermissions(table.id);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    setRole(cU, userIds, roleName, roleLevel, object, doNotPropogate) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`setRole(${cU.id},${userIds},${roleName},${roleLevel},${JSON.stringify(object)},${doNotPropogate})`);
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
                    if (!doNotPropogate) {
                        result = yield this.deleteAndSetTablePermissions(cU, undefined, object.name);
                    }
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
            exports.log.info(`deleteRole(${cU.id},${userIds},${roleLevel},${objectId})`);
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
            exports.log.info(`deleteTestUsers()`);
            return this.dal.deleteTestUsers();
        });
    }
    usersByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`usersByIds(${cU.id},${ids})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.users(ids);
        });
    }
    userById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`userById(${cU.id},${id})`);
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
            exports.log.info(`usersBySearchPattern(${cU.id},${searchPattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.users(undefined, undefined, searchPattern);
        });
    }
    usersByEmails(cU, userEmails) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`usersByEmails(${cU.id},${userEmails})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.users(undefined, userEmails);
        });
    }
    userByEmail(cU, email) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`userByEmail(${cU.id},${email})`);
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
            exports.log.info(`createUser(${cU.id},${authId},${email},${firstName},${lastName})`);
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
            exports.log.info(`updateUser(${cU.id},${id},${email},${firstName},${lastName})`);
            if (cU.isntSysAdmin() && cU.idIsnt(id)) {
                return cU.mustBeSysAdminOrSelf();
            }
            return this.dal.updateUser(id, email, firstName, lastName);
        });
    }
    organizations(cU, organizationIds, organizationNames, organizationNamePattern) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`organizations(${cU.id},${organizationIds},${organizationNames},${organizationNamePattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const result = yield this.dal.organizations(organizationIds, organizationNames, organizationNamePattern);
            return result;
        });
    }
    organizationsByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`organizationsByIds(${cU.id},${ids})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.organizations(cU, ids);
        });
    }
    organizationById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`organizationByIds(${cU.id},${id})`);
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
            exports.log.info(`organizationsByNames(${cU.id},${names})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.organizations(cU, undefined, names);
        });
    }
    organizationByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`organizationByName(${cU.id},${name})`);
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
            exports.log.info(`organizationByNamePattern(${cU.id},${namePattern})`);
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
            exports.log.info(`accessibleOrganizationByName(${cU.id},${organizationName},${withSettings})`);
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
            exports.log.info(`accessibleOrganizations(${cU.id},${withSettings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return yield this.dal.organizationsByUsers([cU.id], undefined, undefined, withSettings);
        });
    }
    createOrganization(cU, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`createOrganization(${cU.id},${name},${label})`);
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
            exports.log.info(`updateOrganization(${cU.id},${name},${newName},${newLabel})`);
            if (yield cU.cant("edit_organization", name))
                return cU.denied();
            return this.dal.updateOrganization(name, newName, newLabel);
        });
    }
    deleteOrganization(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`deleteOrganization(${cU.id},${name})`);
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
            exports.log.info(`deleteTestOrganizations(${cU.id})`);
            if (cU.isntSysAdmin() && cU.isntTestUser()) {
                return cU.mustBeSysAdminOrTestUser();
            }
            return this.dal.deleteTestOrganizations();
        });
    }
    organizationUsers(cU, name, id, roleNames, userEmails, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`organizationUsers(${cU.id},${name},${id},${roleNames},${userEmails},${withSettings})`);
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
            exports.log.info(`setOrganizationUsersRole(${cU.id},${organizationName},${roleName},${userIds},${userEmails})`);
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
            exports.log.info(`removeUsersFromOrganization(${cU.id},${organizationName},${userIds},${userEmails})`);
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
            exports.log.info(`saveSchemaUserSettings(${cU.id},${schemaName},${settings})`);
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
            exports.log.info(`schemas(${cU.id},${schemaIds},${schemaNames},${schemaNamePattern})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const result = yield this.dal.schemas(schemaIds, schemaNames, schemaNamePattern);
            return result;
        });
    }
    schemasByIds(cU, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`schemas(${cU.id},${ids})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.schemas(cU, ids);
        });
    }
    schemaById(cU, id) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`schemaById(${cU.id},${id})`);
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
            exports.log.info(`schemasByNames(${cU.id},${names})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.schemas(cU, undefined, names);
        });
    }
    schemaByName(cU, name) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`schemaByName(${cU.id},${name})`);
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
            exports.log.info(`schemaByNamePattern(${cU.id},${namePattern})`);
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
            exports.log.info(`schemasByUserOwner(${cU.id},${userId},${userEmail})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.schemasByUserOwner(userId, userEmail);
        });
    }
    schemasByOrganizationOwner(cU, organizationId, organizationName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`schemasByOrganizationOwner(${cU.id},${organizationId},${organizationName})`);
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
            exports.log.info(`schemasByOrganizationOwnerAdmin(${cU.id},${userId},${userEmail})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return this.dal.schemasByOrganizationOwnerAdmin(userId, userEmail);
        });
    }
    accessibleSchemaByName(cU, schemaName, organizationName, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`accessibleSchemaByName(${cU.id},${schemaName},${organizationName},${withSettings})`);
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
            exports.log.info(`accessibleSchemas(${cU.id},${withSettings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            return yield this.dal.schemasByUsers([cU.id], undefined, undefined, withSettings);
        });
    }
    addOrCreateSchema(cU, name, label, organizationOwnerId, organizationOwnerName, userOwnerId, userOwnerEmail, create) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addOrCreateSchema(${cU.id},${name},${label},${organizationOwnerId},${organizationOwnerName},${userOwnerId},${userOwnerEmail},${create})`);
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
                    result = yield this.setRole(CurrentUser_1.CurrentUser.getSysAdmin(), [cU.id], "schema_administrator", "schema", schemaResult.payload, true);
                    if (!result.success)
                        return result;
                }
                result = yield this.dal.setSchemaUserRolesFromOrganizationRoles(organizationOwnerId, entity_1.Role.sysRoleMap("organization", "schema"), [schemaResult.payload.id]);
            }
            else {
                result = yield this.setRole(CurrentUser_1.CurrentUser.getSysAdmin(), [cU.id], "schema_owner", "schema", schemaResult.payload, true);
            }
            if (!result.success)
                return result;
            return schemaResult;
        });
    }
    removeOrDeleteSchema(cU, schemaName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`removeOrDeleteSchema(${cU.id},${schemaName},${del})`);
            if (yield cU.cant("alter_schema", schemaName))
                return cU.denied();
            let result = yield this.addOrRemoveAllExistingRelationships(cU, schemaName, undefined, true);
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
            exports.log.info(`updateSchema(${cU.id},${name},${newSchemaName},${newSchemaLabel},${newOrganizationOwnerName},${newOrganizationOwnerId},${newUserOwnerEmail},${newUserOwnerId})`);
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
                    result = yield this.untrackTable(cU, table);
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
                    result = yield this.trackTableWithPermissions(cU, table, true);
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
    addDemoSchema(cU, schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addDemoSchema(${cU.id}, ${schemaName})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            let result = yield this.dal.discoverSchemas(schemaName);
            if (!result.success)
                return result;
            if (result.payload.length !== 1) {
                return errResult({
                    message: `addNextDemoSchema: can not find demo DB matching ${environment_1.environment.demoDBPrefix}%`,
                });
            }
            return yield this.addOrCreateSchema(cU, schemaName, environment_1.environment.demoDBLabel, undefined, undefined, cU.id);
        });
    }
    schemaUsers(cU, schemaName, roleNames, userEmails, impliedFromRoleName, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`schemaUsers(${cU.id},${schemaName},${roleNames},${userEmails},${impliedFromRoleName},${withSettings})`);
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
            exports.log.info(`setSchemaUsersRole(${cU.id},${schemaName},${userEmails},${roleName})`);
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
            exports.log.info(`removeSchemaUsers(${cU.id},${schemaName},${userEmails})`);
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
            exports.log.info(`saveOrganizationUserSettings(${cU.id},${organizationName},${settings})`);
            if (cU.isntSignedIn())
                return cU.mustBeSignedIn();
            const organizationResult = yield this.organizationByName(cU, organizationName);
            if (!organizationResult.success)
                return organizationResult;
            return this.dal.saveOrganizationUserSettings(organizationResult.payload.id, cU.id, settings);
        });
    }
    importSchema(cU, schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`importSchema(${cU.id},${schemaName})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            const schemaResult = yield this.schemaByName(cU, schemaName);
            if (!schemaResult.success)
                return schemaResult;
            let result = yield this.bgQueue.queue(cU.id, schemaResult.payload.id, "bgImportSchema", {
                schemaName: schemaName,
            });
            if (!result.success)
                return result;
            return yield this.bgQueue.invoke(schemaResult.payload.id);
        });
    }
    removeSchema(cU, schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`removeSchema(${cU.id},${schemaName})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            const schemaResult = yield this.schemaByName(cU, schemaName);
            if (!schemaResult.success)
                return schemaResult;
            let result = yield this.bgQueue.queue(cU.id, schemaResult.payload.id, "bgRemoveSchema", {
                schemaName: schemaName,
            });
            if (!result.success)
                return result;
            return yield this.bgQueue.invoke(schemaResult.payload.id);
        });
    }
    tables(cU, schemaName, withColumns) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`tables(${cU.id},${schemaName},${withColumns})`);
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
            exports.log.info(`tableBySchemaNameTableName(${cU.id},${schemaName},${tableName})`);
            if (yield cU.cant("read_table", tableName, schemaName)) {
                return cU.denied();
            }
            return yield this.dal.tableBySchemaNameTableName(schemaName, tableName);
        });
    }
    accessibleTableByName(cU, schemaName, tableName, withColumns, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`accessibleTableByName(${cU.id},${schemaName},${tableName},${withColumns},${withSettings})`);
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
            exports.log.info(`accessibleTables(${cU.id},${schemaName},${withColumns},${withSettings})`);
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
            exports.log.info(`addOrCreateTable(${cU.id},${schemaName},${tableName},${tableLabel},${create})`);
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
            result = yield this.trackTableWithPermissions(cU, tableResult.payload, false, true);
            if (!result.success)
                return result;
            return tableResult;
        });
    }
    removeOrDeleteTable(cU, schemaName, tableName, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`removeOrDeleteTable(${cU.id},${schemaName},${tableName},${del})`);
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
                result = yield this.removeOrDeleteColumn(cU, schemaName, tableName, column.name, del, false, true);
                if (!result.success)
                    return result;
            }
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            result = yield this.untrackTableWithPermissions(cU, tableResult.payload, true);
            if (!result.success)
                return result;
            result = yield this.dal.removeAllTableUsers(tableResult.payload.id);
            if (!result.success)
                return result;
            result = yield this.deleteAndSetTablePermissions(CurrentUser_1.CurrentUser.getSysAdmin(), tableResult.payload, undefined, true);
            if (!result.success)
                return result;
            return yield this.dal.removeOrDeleteTable(schemaName, tableName, del);
        });
    }
    addAllExistingTables(cU, schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addAllExistingTables(${cU.id},${schemaName})`);
            if (yield cU.cant("alter_schema", schemaName)) {
                return cU.denied();
            }
            let result = yield this.dal.discoverTables(schemaName);
            if (!result.success)
                return result;
            const tableNames = result.payload;
            for (const tableName of tableNames) {
                result = yield this.addExistingTable(cU, schemaName, tableName);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    addExistingTable(cU, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addExistingTable(${cU.id},${schemaName},${tableName})`);
            if (yield cU.cant("alter_schema", schemaName)) {
                return cU.denied();
            }
            const tableResult = yield this.addOrCreateTable(cU, schemaName, tableName, v.titleCase(tableName.toString().replace(/_/g, " ")), false);
            if (!tableResult.success)
                return tableResult;
            let result = yield this.untrackTableWithPermissions(cU, tableResult.payload, true);
            if (!result.success)
                return result;
            result = yield this.dal.discoverColumns(schemaName, tableName);
            if (!result.success)
                return result;
            const columns = result.payload;
            for (const column of columns) {
                result = yield this.addOrCreateColumn(cU, schemaName, tableName, column.name, v.titleCase(column.name.toString().replace(/_/g, " ")), false, undefined, false, true);
                if (!result.success)
                    return result;
            }
            result = yield this.trackTableWithPermissions(cU, tableResult.payload, false, true);
            return result;
        });
    }
    updateTable(cU, schemaName, tableName, newTableName, newTableLabel) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`updateTable(${cU.id},${schemaName},${tableName},${newTableName},${newTableLabel})`);
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
                result = yield this.untrackTable(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            const updatedTableResult = yield this.dal.updateTable(schemaName, tableName, newTableName, newTableLabel);
            if (!updatedTableResult.success)
                return updatedTableResult;
            if (newTableName) {
                result = yield this.trackTable(cU, updatedTableResult.payload);
                if (!result.success)
                    return result;
            }
            return updatedTableResult;
        });
    }
    addOrRemoveAllExistingRelationships(cU, schemaName, tableNamePattern, remove) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addOrRemoveAllExistingRelationships(${cU.id},${schemaName},${tableNamePattern},${remove})`);
            if (yield cU.cant("alter_schema", schemaName)) {
                return cU.denied();
            }
            if (!tableNamePattern)
                tableNamePattern = "%";
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
    addDefaultTablePermissions(cU, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addDefaultTablePermissions(${cU.id},${schemaName},${tableName})`);
            if (yield cU.cant("alter_table", tableName, schemaName))
                return cU.denied();
            let result = yield this.columns(cU, schemaName, tableName);
            if (!result.success)
                return result;
            if (result.payload.length == 0)
                return { success: true };
            const columnNames = result.payload.map((table) => table.name);
            result = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!result.success)
                return result;
            for (const permissionCheckAndType of entity_1.Role.hasuraTablePermissionChecksAndTypes(result.payload.id)) {
                result = yield hasura_api_1.hasuraApi.createPermission(schemaName, tableName, permissionCheckAndType.permissionCheck, permissionCheckAndType.permissionType, "wbuser", columnNames);
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    removeDefaultTablePermissions(cU, schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`removeDefaultTablePermissions(${cU.id},${schemaName},${tableName})`);
            if (yield cU.cant("alter_table", tableName, schemaName))
                return cU.denied();
            let result = yield this.columns(cU, schemaName, tableName);
            if (!result.success)
                return result;
            if (result.payload.length == 0) {
                return { success: true, payload: true };
            }
            result = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!result.success)
                return result;
            for (const permissionKeyAndType of entity_1.Role.tablePermissionKeysAndActions(result.payload.id)) {
                result = yield hasura_api_1.hasuraApi.deletePermission(schemaName, tableName, permissionKeyAndType.action, "wbuser");
                if (!result.success)
                    return result;
            }
            return result;
        });
    }
    createOrDeletePrimaryKey(cU, schemaName, tableName, columnNames, del) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`createOrDeletePrimaryKey(${cU.id},${schemaName},${tableName},${columnNames},${del})`);
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
            exports.log.info(`addOrCreateForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames},${create})`);
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
            exports.log.info(`removeOrDeleteForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${del})`);
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
            exports.log.info(`setForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames},${operation})`);
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
    trackTable(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`trackTable(${cU.id},${JSON.stringify(table)})`);
            if (yield cU.cant("alter_table", table.id)) {
                return cU.denied();
            }
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield hasura_api_1.hasuraApi.trackTable(table.schemaName, table.name);
            if (!result.success)
                return result;
            return result;
        });
    }
    trackTableWithPermissions(cU, table, resetPermissions, sync) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`trackTableWithPermissions(${cU.id}, ${JSON.stringify(table)},${resetPermissions},${sync})`);
            if (yield cU.cant("alter_table", table.id)) {
                return cU.denied();
            }
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.trackTable(cU, table);
            if (!result.success)
                return result;
            if (sync) {
                if (resetPermissions) {
                    result = yield this.removeDefaultTablePermissions(cU, table.schemaName, table.name);
                    if (!result.success)
                        return result;
                }
                result = yield this.addDefaultTablePermissions(cU, table.schemaName, table.name);
            }
            else {
                let fn = "bgAddDefaultTablePermissions";
                if (resetPermissions)
                    fn = "bgRemoveAndAddDefaultTablePermissions";
                result = yield this.bgQueue.queue(cU.id, table.schemaId, fn, {
                    schemaName: table.schemaName,
                    tableName: table.name,
                });
                if (!result.success)
                    return result;
                result = yield this.bgQueue.invoke(table.schemaId);
            }
            return result;
        });
    }
    untrackTable(cU, table) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`untrackTable(${cU.id},${JSON.stringify(table)})`);
            if (yield cU.cant("alter_table", table.id)) {
                return cU.denied();
            }
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            return yield hasura_api_1.hasuraApi.untrackTable(table.schemaName, table.name);
        });
    }
    untrackTableWithPermissions(cU, table, sync) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`untrackTableWithPermissions(${cU.id},${JSON.stringify(table)},${sync})`);
            if (yield cU.cant("alter_table", table.id)) {
                return cU.denied();
            }
            if (!table.schemaName) {
                return errResult({ message: "schemaName not set" });
            }
            let result = yield this.untrackTable(cU, table);
            if (!result.success)
                return result;
            if (sync) {
                result = yield this.removeDefaultTablePermissions(cU, table.schemaName, table.name);
            }
            else {
                result = yield this.bgQueue.queue(cU.id, table.schemaId, "bgRemoveDefaultTablePermissions", {
                    schemaName: table.schemaName,
                    tableName: table.name,
                });
                if (!result.success)
                    return result;
                result = yield this.bgQueue.invoke(table.schemaId);
            }
            return result;
        });
    }
    tableUsers(cU, schemaName, tableName, userEmails, withSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`tableUsers(${cU.id},${schemaName},${tableName},${userEmails},${withSettings})`);
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
            exports.log.info(`addDefaultTableUsersToTable(${JSON.stringify(table)})`);
            return yield this.dal.setTableUserRolesFromSchemaRoles(table.schemaId, entity_1.Role.sysRoleMap("schema", "table"), [table.id]);
        });
    }
    setTableUsersRole(cU, schemaName, tableName, userEmails, roleName) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`setTableUsersRole(${cU.id},${schemaName},${tableName},${userEmails},${roleName})`);
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
            exports.log.info(`removeTableUsers(${cU.id},${schemaName},${tableName},${userEmails})`);
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
            exports.log.info(`saveTableUserSettings(${cU.id},${schemaName},${tableName},${settings})`);
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
            exports.log.info(`columns(${cU.id},${schemaName},${tableName})`);
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
    addOrCreateColumn(cU, schemaName, tableName, columnName, columnLabel, create, columnType, sync, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`addOrCreateColumn(${cU.id},${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${sync},${skipTracking})`);
            if (yield cU.cant("alter_table", tableName, schemaName)) {
                return cU.denied();
            }
            const checkColNotAlreadyAddedResult = yield this.dal.columnBySchemaNameTableNameColumnName(schemaName, tableName, columnName);
            if (!checkColNotAlreadyAddedResult.success) {
                if (checkColNotAlreadyAddedResult.wbCode != "WB_COLUMN_NOT_FOUND") {
                    return checkColNotAlreadyAddedResult;
                }
            }
            else {
                return errResult({
                    wbCode: "WB_COLUMN_NAME_EXISTS",
                });
            }
            if (!create) {
                create = false;
                const checkColExistsResult = yield this.dal.discoverColumns(schemaName, tableName, columnName);
                if (!checkColExistsResult.success)
                    return checkColExistsResult;
                if (checkColExistsResult.payload.length == 0) {
                    return errResult({
                        wbCode: "WB_COLUMN_NOT_FOUND",
                    });
                }
            }
            else if (!columnType) {
                columnType = "TEXT";
            }
            let result = errResult();
            const tableResult = yield this.tableBySchemaNameTableName(cU, schemaName, tableName);
            if (!tableResult.success)
                return tableResult;
            if (!skipTracking) {
                result = yield this.untrackTable(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            const columnResult = yield this.dal.addOrCreateColumn(schemaName, tableName, columnName, columnLabel, create, columnType);
            if (columnResult.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload, true, sync);
                if (!result.success)
                    return result;
            }
            return columnResult;
        });
    }
    removeOrDeleteColumn(cU, schemaName, tableName, columnName, del, sync, skipTracking) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`removeOrDeleteColumn(${cU.id},${schemaName},${tableName},${columnName},${del},${sync},${skipTracking})`);
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
                result = yield this.untrackTable(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeOrDeleteColumn(schemaName, tableName, columnName, del);
            if (result.success && !skipTracking) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload, true, sync);
            }
            return result;
        });
    }
    updateColumn(cU, schemaName, tableName, columnName, newColumnName, newColumnLabel, newType, sync) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`updateColumn(${cU.id},${schemaName},${tableName},${columnName},${newColumnName},${newColumnLabel},${newType})`);
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
                result = yield this.untrackTable(cU, tableResult.payload);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.updateColumn(schemaName, tableName, columnName, newColumnName, newColumnLabel, newType);
            if (!result.success)
                return result;
            if (newColumnName || newType) {
                result = yield this.trackTableWithPermissions(cU, tableResult.payload, true, sync);
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
    uidFromHeaders(headers) {
        return __awaiter(this, void 0, void 0, function* () {
            const headersLowerCase = Object.entries(headers).reduce((acc, [key, val]) => ((acc[key.toLowerCase()] = val), acc), {});
            let result = errResult();
            if (headersLowerCase["x-hasura-role"] &&
                headersLowerCase["x-hasura-role"].toLowerCase() == "admin") {
                exports.log.info("========== FOUND ADMIN USER");
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
                exports.log.info(`========== FOUND TEST USER: ${headersLowerCase["x-test-user-id"]}`);
            }
            else if (headersLowerCase["x-hasura-user-id"]) {
                result = {
                    success: true,
                    payload: parseInt(headersLowerCase["x-hasura-user-id"]),
                };
                exports.log.info(`========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`);
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
    hasuraHealthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            let result = errResult();
            try {
                result = yield hasura_api_1.hasuraApi.healthCheck();
            }
            catch (error) {
                result = errResult({
                    message: error.message,
                    values: [JSON.stringify(error)],
                });
            }
            return result;
        });
    }
    dbHealthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            let result = errResult();
            try {
                result = yield this.dal.healthCheck();
            }
            catch (error) {
                result = errResult({
                    message: error.message,
                    values: [JSON.stringify(error)],
                });
            }
            return result;
        });
    }
    util(cU, fn, vals) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`util(${cU.id},${fn},${JSON.stringify(vals)})`);
            let result = errResult();
            switch (fn) {
                case "addDemoSchema":
                    result = yield this.addDemoSchema(cU, vals.schemaName);
                    break;
                case "resetTestData":
                    result = yield this.resetTestData(cU);
                    break;
                case "processDbRestore":
                    result = yield this.processDbRestore(cU);
                    break;
                case "invokeBg":
                    result = yield this.bgQueue.process(vals.schemaId);
                    break;
                default:
                    exports.log.error(`Can not find fn ${fn}`);
            }
            return result;
        });
    }
    processDbRestore(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`processDbRestore(${cU.id})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            let result = yield this.bgQueue.queue(cU.id, entity_1.Schema.WB_SYS_SCHEMA_ID, "bgReloadRemoteSchemasAndMetadata");
            if (!result.success)
                return result;
            return yield this.bgQueue.invoke(entity_1.Schema.WB_SYS_SCHEMA_ID);
        });
    }
    setRemoteSchemas(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`setRemoteSchemas(${cU.id})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            let result = errResult();
            if (environment_1.environment.wbRemoteSchemaName) {
                result = yield hasura_api_1.hasuraApi.setRemoteSchema(environment_1.environment.wbRemoteSchemaName, environment_1.environment.wbRemoteSchemaURL);
            }
            if (!result.success)
                return result;
            if (environment_1.environment.wbaRemoteSchemaName) {
                result = yield hasura_api_1.hasuraApi.setRemoteSchema(environment_1.environment.wbaRemoteSchemaName, environment_1.environment.wbaRemoteSchemaURL);
            }
            return result;
        });
    }
    reloadMetadata(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`reloadMetadata(${cU.id})`);
            if (cU.isntSysAdmin())
                return cU.mustBeSysAdmin();
            return yield hasura_api_1.hasuraApi.reloadMetadata();
        });
    }
    resetTestData(cU) {
        return __awaiter(this, void 0, void 0, function* () {
            exports.log.info(`resetTestData()`);
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
    exports.log.info(`== bgHandler event: ${JSON.stringify(event)}`);
    const wbCloud = new WhitebrickCloud();
    const result = yield wbCloud.bgQueue.process(event.schemaId);
    exports.log.info(`== bgHandler result: ${JSON.stringify(result)}`);
    return result;
});
exports.bgHandler = bgHandler;


/***/ }),

/***/ "apollo-server-lambda":
/*!***************************************!*\
  !*** external "apollo-server-lambda" ***!
  \***************************************/
/***/ ((module) => {

module.exports = require("apollo-server-lambda");

/***/ }),

/***/ "aws-sdk/clients/lambda":
/*!*****************************************!*\
  !*** external "aws-sdk/clients/lambda" ***!
  \*****************************************/
/***/ ((module) => {

module.exports = require("aws-sdk/clients/lambda");

/***/ }),

/***/ "axios":
/*!************************!*\
  !*** external "axios" ***!
  \************************/
/***/ ((module) => {

module.exports = require("axios");

/***/ }),

/***/ "graphql-constraint-directive":
/*!***********************************************!*\
  !*** external "graphql-constraint-directive" ***!
  \***********************************************/
/***/ ((module) => {

module.exports = require("graphql-constraint-directive");

/***/ }),

/***/ "graphql-tools":
/*!********************************!*\
  !*** external "graphql-tools" ***!
  \********************************/
/***/ ((module) => {

module.exports = require("graphql-tools");

/***/ }),

/***/ "graphql-type-json":
/*!************************************!*\
  !*** external "graphql-type-json" ***!
  \************************************/
/***/ ((module) => {

module.exports = require("graphql-type-json");

/***/ }),

/***/ "is-port-reachable":
/*!************************************!*\
  !*** external "is-port-reachable" ***!
  \************************************/
/***/ ((module) => {

module.exports = require("is-port-reachable");

/***/ }),

/***/ "lodash":
/*!*************************!*\
  !*** external "lodash" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("lodash");

/***/ }),

/***/ "pg":
/*!*********************!*\
  !*** external "pg" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("pg");

/***/ }),

/***/ "tslog":
/*!************************!*\
  !*** external "tslog" ***!
  \************************/
/***/ ((module) => {

module.exports = require("tslog");

/***/ }),

/***/ "voca":
/*!***********************!*\
  !*** external "voca" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("voca");

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQVdBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBTUE7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFFQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBTUE7QUFBQTtBQUdBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUlBO0FBQUE7QUFFQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7O0FBak5BO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQWVBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFJQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFBQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFJQTs7QUFPQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBOztBQUVBOzs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7O0FBR0E7QUFDQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTs7Ozs7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTs7Ozs7Ozs7Ozs7O0FBWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQVVBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQU9BOzs7Ozs7OztBQVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7OztBQVdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7O0FBZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUFBO0FBTUE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUFRQTs7Ozs7Ozs7Ozs7OztBQWFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBR0E7QUFDQTs7Ozs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7Ozs7Ozs7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7O0FBVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQVFBOzs7Ozs7Ozs7Ozs7Ozs7QUFlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBR0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7Ozs7OztBQU1BOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FBS0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQU9BO0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQU1BOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOzs7O0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFLQTtBQUNBOzs7Ozs7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7Ozs7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTs7Ozs7Ozs7Ozs7OztBQWFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBOzs7OztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQVFBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBOzs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQXJ6RUE7Ozs7Ozs7Ozs7Ozs7O0FDZkE7QUF5QkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTs7QUEvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ1hBO0FBRUE7QUFFQTtBQUNBO0FBRUE7QUFnQkE7QUFaQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFHQTtBQUtBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUVBO0FBUUE7QUFDQTtBQUlBO0FBR0E7QUFJQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUlBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQXJXQTs7Ozs7Ozs7Ozs7Ozs7QUNOQTtBQUVBO0FBVUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXBDQTs7Ozs7Ozs7Ozs7Ozs7QUNGQTtBQUVBO0FBZUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUF2REE7Ozs7Ozs7Ozs7Ozs7O0FDRkE7QUF3QkE7QUE4RUE7QUFDQTtBQUNBO0FBS0E7QUE1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTJCQTtBQUtBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFBQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUEvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FDM0ZBO0FBRUE7QUFzQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUNUQTtBQUVBO0FBZUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBaERBOzs7Ozs7Ozs7Ozs7OztBQ0ZBO0FBRUE7QUFhQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBekNBOzs7Ozs7Ozs7Ozs7OztBQ0ZBO0FBRUE7QUFnQkE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWxEQTs7Ozs7Ozs7Ozs7Ozs7QUNBQTtBQVdBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUF0REE7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7OztBQ2VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNqSUE7QUFHQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFXQTtBQW9WQTtBQWxWQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTs7QUE3VkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBd1ZBOzs7Ozs7Ozs7Ozs7OztBQ2hYQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzNGQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUFFQTtBQThCQTs7Ozs7Ozs7O0FBU0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNyR0E7QUFDQTtBQUdBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBc0VBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDN01BO0FBQ0E7QUFNQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWtGQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBV0E7QUFDQTtBQVNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNoUUE7QUFDQTtBQUNBO0FBR0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEyTEE7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFDQTtBQVNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQWFBO0FBQ0E7QUFVQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBYUE7QUFDQTtBQVVBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbGhCQTtBQUNBO0FBUUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXVDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFTQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBdTBGQTtBQXIwRkE7QUFDQTtBQUNBO0FBTUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBRUE7O0FBTUE7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBSUE7O0FBUUE7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBR0E7QUFFQTtBQUtBO0FBQUE7QUFDQTtBQUVBO0FBTUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBU0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBTUE7QUFBQTtBQUdBO0FBTUE7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFPQTtBQUFBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFJQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBSUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBTUE7QUFHQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBUUE7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFBQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBTUE7O0FBTUE7QUFHQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQ0E7QUFFQTtBQUNBO0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUlBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUVBOztBQUtBO0FBR0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBTUE7QUFBQTtBQUlBOztBQVVBO0FBR0E7QUFBQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBUUE7QUFBQTtBQUNBO0FBRUE7QUFLQTtBQUFBO0FBRUE7QUFRQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBVUE7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBT0E7QUFBQTtBQUNBO0FBR0E7QUFPQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQUE7QUFDQTtBQUVBO0FBS0E7QUFBQTtBQUNBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQVVBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFRQTtBQUFBO0FBS0E7O0FBUUE7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQU9BO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFHQTtBQUFBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBR0E7O0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBS0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU9BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQUE7QUFDQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFJQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFTQTtBQUFBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFFQTtBQUtBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUFBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBV0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQUE7QUFFQTs7QUFPQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQUE7QUFDQTtBQUdBO0FBQ0E7QUFBQTtBQUNBO0FBR0E7QUFRQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUdBO0FBQUE7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUdBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBR0E7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBU0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQVNBO0FBQUE7QUFFQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBU0E7QUFBQTtBQUdBOztBQVNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BO0FBQ0E7QUFBQTtBQUVBOztBQU1BO0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBS0E7QUFDQTtBQUNBO0FBRUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFPQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUlBO0FBQ0E7QUFLQTtBQUFBO0FBRUE7O0FBT0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFBQTtBQUVBOztBQU1BO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFNQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUdBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUFBO0FBQ0E7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBV0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQU1BO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBUUE7QUFDQTtBQU1BO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUdBOztBQVNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBVUE7QUFHQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQVFBO0FBQUE7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBUUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBS0E7QUFBQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQU1BO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBSUE7QUFNQTtBQUVBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFJQTtBQUFBO0FBQ0E7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQUE7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFLQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBSUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFBQTtBQUNBO0FBQ0E7QUFLQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBejBGQTtBQSswRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBakRBO0FBbURBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFaQTtBQWNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTkE7Ozs7Ozs7Ozs7O0FDcDdGQTs7Ozs7Ozs7OztBQ0FBOzs7Ozs7Ozs7O0FDQUE7Ozs7Ozs7Ozs7QUNBQTs7Ozs7Ozs7OztBQ0FBOzs7Ozs7Ozs7O0FDQUE7Ozs7Ozs7Ozs7QUNBQTs7Ozs7Ozs7OztBQ0FBOzs7Ozs7Ozs7O0FDQUE7Ozs7Ozs7Ozs7QUNBQTs7Ozs7Ozs7OztBQ0FBOzs7Ozs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBRXZCQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvYmctcXVldWUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9kYWwudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvQ29sdW1uLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L0N1cnJlbnRVc2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L09yZ2FuaXphdGlvbi50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Pcmdhbml6YXRpb25Vc2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1JvbGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvU2NoZW1hLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1NjaGVtYVVzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGFibGVVc2VyLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvaW5kZXgudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnZpcm9ubWVudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2hhc3VyYS1hcGkudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9wb2xpY3kudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlcy9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL29yZ2FuaXphdGlvbi50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL3NjaGVtYS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGVzL3RhYmxlLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvdHlwZXMvdXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3doaXRlYnJpY2stY2xvdWQudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImF3cy1zZGsvY2xpZW50cy9sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiZ3JhcGhxbC1jb25zdHJhaW50LWRpcmVjdGl2ZVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLXRvb2xzXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdHlwZS1qc29uXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImlzLXBvcnQtcmVhY2hhYmxlXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImxvZGFzaFwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ2b2NhXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYmVmb3JlLXN0YXJ0dXAiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL3N0YXJ0dXAiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2FmdGVyLXN0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgREFMIH0gZnJvbSBcIi4vZGFsXCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGVyclJlc3VsdCwgbG9nLCBXaGl0ZWJyaWNrQ2xvdWQgfSBmcm9tIFwiLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuL2VudGl0eS9DdXJyZW50VXNlclwiO1xuaW1wb3J0IExhbWJkYSBmcm9tIFwiYXdzLXNkay9jbGllbnRzL2xhbWJkYVwiO1xuaW1wb3J0IGF4aW9zLCB7IEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcblxuZXhwb3J0IGNsYXNzIEJnUXVldWUge1xuICBkYWw6IERBTDtcbiAgd2JDbG91ZDogV2hpdGVicmlja0Nsb3VkO1xuXG4gIHN0YXRpYyBCR19TVEFUVVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgcGVuZGluZzogXCJQZW5kaW5nXCIsXG4gICAgcnVubmluZzogXCJSdW5uaW5nXCIsXG4gICAgc3VjY2VzczogXCJTdWNjZXNzXCIsXG4gICAgZXJyb3I6IFwiRXJyb3JcIixcbiAgfTtcblxuICBjb25zdHJ1Y3Rvcih3YkNsb3VkOiBXaGl0ZWJyaWNrQ2xvdWQsIGRhbDogREFMKSB7XG4gICAgdGhpcy5kYWwgPSBkYWw7XG4gICAgdGhpcy53YkNsb3VkID0gd2JDbG91ZDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBxdWV1ZShcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIGtleTogc3RyaW5nLFxuICAgIGRhdGE/OiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGJnUXVldWUucXVldWUoJHtrZXl9LCR7ZGF0YX0pYCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLmJnUXVldWVJbnNlcnQoXG4gICAgICB1c2VySWQsXG4gICAgICBzY2hlbWFJZCxcbiAgICAgIEJnUXVldWUuQkdfU1RBVFVTLnBlbmRpbmcsXG4gICAgICBrZXksXG4gICAgICBkYXRhXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbnZva2Uoc2NoZW1hSWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBpbnZva2F0aW9uUmVzdWx0O1xuICAgIGxvZy5pbmZvKGBiZ1F1ZXVlLmludm9rZSgke3NjaGVtYUlkfSlgKTtcbiAgICB0cnkge1xuICAgICAgaWYgKGVudmlyb25tZW50LmxhbWJkYUJnRnVuY3Rpb25OYW1lKSB7XG4gICAgICAgIGNvbnN0IGxhbWJkYSA9IG5ldyBMYW1iZGEoe1xuICAgICAgICAgIHJlZ2lvbjogZW52aXJvbm1lbnQuYXdzUmVnaW9uLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogZW52aXJvbm1lbnQubGFtYmRhQmdGdW5jdGlvbk5hbWUsXG4gICAgICAgICAgSW52b2NhdGlvblR5cGU6IFwiRXZlbnRcIixcbiAgICAgICAgICBQYXlsb2FkOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzY2hlbWFJZDogc2NoZW1hSWQsXG4gICAgICAgICAgfSksXG4gICAgICAgIH07XG4gICAgICAgIGxvZy5pbmZvKGBJbnZva2luZyBsYW1iZGEgd2l0aCBwYXJhbXM6ICR7cGFyYW1zfWApO1xuICAgICAgICBpbnZva2F0aW9uUmVzdWx0ID0gYXdhaXQgbGFtYmRhLmludm9rZShwYXJhbXMpLnByb21pc2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5pbmZvKGBQb3N0aW5nIHRvICR7ZW52aXJvbm1lbnQubG9jYWxCZ0Z1bmN0aW9uVXJsfWApO1xuICAgICAgICAvLyBkb24ndCB3YWl0IGZvciByZXNwb25zZVxuICAgICAgICBpbnZva2F0aW9uUmVzdWx0ID0gYXhpb3NcbiAgICAgICAgICAuY3JlYXRlKClcbiAgICAgICAgICAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KGVudmlyb25tZW50LmxvY2FsQmdGdW5jdGlvblVybCwge1xuICAgICAgICAgICAgcXVlcnk6IGBtdXRhdGlvbiB7IHdiVXRpbChmbjogXCJpbnZva2VCZ1wiLCB2YWxzOiB7c2NoZW1hSWQ6ICR7c2NoZW1hSWR9fSkgfWAsXG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgbG9nLmVycm9yKGVycm9yKTtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgfSkgYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcGF5bG9hZDogaW52b2thdGlvblJlc3VsdCB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcHJvY2VzcyhzY2hlbWFJZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGJnUXVldWUucHJvY2Vzcygke3NjaGVtYUlkfSlgKTtcbiAgICAvLyAxLiBJcyBwcm9jZXNzIGFscmVhZHkgcnVubmluZz9cbiAgICBjb25zdCBpc1J1bm5pbmdSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5iZ1F1ZXVlU2VsZWN0KFxuICAgICAgW1wiaWRcIl0sXG4gICAgICBzY2hlbWFJZCxcbiAgICAgIEJnUXVldWUuQkdfU1RBVFVTLnJ1bm5pbmcsXG4gICAgICAxXG4gICAgKTtcbiAgICBpZiAoIWlzUnVubmluZ1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gaXNSdW5uaW5nUmVzdWx0O1xuICAgIGlmIChpc1J1bm5pbmdSZXN1bHQucGF5bG9hZC5yb3dzLmxlbmd0aCA9PSAxKSB7XG4gICAgICBsb2cuaW5mbyhgYmdRdWV1ZS5wcm9jZXNzIC0gYWxyZWFkeSBydW5uaW5nYCk7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgLy8gMi4gTG9jayBwZW5kaW5nIGpvYnMgd2l0aCBzdGF0dXM9cnVubmluZyBzbyBubyBvdGhlciBwcm9jZXNzIHN0YXJ0c1xuICAgIGNvbnN0IHNldFJ1bm5pbmdSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5iZ1F1ZXVlVXBkYXRlU3RhdHVzKFxuICAgICAgQmdRdWV1ZS5CR19TVEFUVVMucnVubmluZyxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHNjaGVtYUlkLFxuICAgICAgQmdRdWV1ZS5CR19TVEFUVVMucGVuZGluZ1xuICAgICk7XG4gICAgaWYgKCFzZXRSdW5uaW5nUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzZXRSdW5uaW5nUmVzdWx0O1xuICAgIC8vIDMuIFByb2Nlc3MgZWFjaCBydW5uaW5nIGpvYiBidXQgbG9va3VwIGFmdGVyIGVhY2ggaXRlcmF0aW9uXG4gICAgLy8gaW4gY2FzZSBtb3JlIGpvYnMgYXJlIGFkZGVkIHdoaWxlIHJ1bm5pbmdcbiAgICBsZXQgcnVubmluZyA9IHRydWU7XG4gICAgd2hpbGUgKHJ1bm5pbmcpIHtcbiAgICAgIGNvbnN0IGJnSm9iRmV0Y2hSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5iZ1F1ZXVlU2VsZWN0KFxuICAgICAgICBbXCJpZFwiLCBcImtleVwiLCBcImRhdGFcIl0sXG4gICAgICAgIHNjaGVtYUlkLFxuICAgICAgICBCZ1F1ZXVlLkJHX1NUQVRVUy5ydW5uaW5nLFxuICAgICAgICAxXG4gICAgICApO1xuICAgICAgaWYgKCFiZ0pvYkZldGNoUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBiZ0pvYkZldGNoUmVzdWx0O1xuICAgICAgbG9nLmluZm8oYCAgLSBiZ0pvYkZldGNoUmVzdWx0PSR7SlNPTi5zdHJpbmdpZnkoYmdKb2JGZXRjaFJlc3VsdCl9YCk7XG4gICAgICBpZiAoYmdKb2JGZXRjaFJlc3VsdC5wYXlsb2FkLnJvd3MubGVuZ3RoID09IDApIHtcbiAgICAgICAgbG9nLmluZm8oYCAgLSBubyBqb2JzIGxlZnQgdG8gcnVuYCk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgICAgY29uc3QgYmdKb2JQcm9jZXNzUmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1J1bihcbiAgICAgICAgYmdKb2JGZXRjaFJlc3VsdC5wYXlsb2FkLnJvd3NbMF0uaWQsXG4gICAgICAgIGJnSm9iRmV0Y2hSZXN1bHQucGF5bG9hZC5yb3dzWzBdLmtleSxcbiAgICAgICAgYmdKb2JGZXRjaFJlc3VsdC5wYXlsb2FkLnJvd3NbMF0uZGF0YVxuICAgICAgKTtcbiAgICAgIGlmICghYmdKb2JQcm9jZXNzUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgY29uc3Qgc2V0RXJyb3JSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5iZ1F1ZXVlVXBkYXRlU3RhdHVzKFxuICAgICAgICAgIEJnUXVldWUuQkdfU1RBVFVTLmVycm9yLFxuICAgICAgICAgIGJnSm9iRmV0Y2hSZXN1bHQucGF5bG9hZC5yb3dzWzBdLmlkLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAge1xuICAgICAgICAgICAgZGF0YTogYmdKb2JGZXRjaFJlc3VsdC5wYXlsb2FkLnJvd3NbMF0uZGF0YSxcbiAgICAgICAgICAgIGVycm9yOiBiZ0pvYlByb2Nlc3NSZXN1bHQsXG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBpZiAoIXNldEVycm9yUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzZXRFcnJvclJlc3VsdDtcbiAgICAgICAgbG9nLmluZm8oYCAgLSBqb2IgcmV0dXJuZWQgZXJyb3IsIGFkZGVkIHRvIGRhdGEuZXJyb3JgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHNldFN1Y2Nlc3NSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5iZ1F1ZXVlVXBkYXRlU3RhdHVzKFxuICAgICAgICBCZ1F1ZXVlLkJHX1NUQVRVUy5zdWNjZXNzLFxuICAgICAgICBiZ0pvYkZldGNoUmVzdWx0LnBheWxvYWQucm93c1swXS5pZFxuICAgICAgKTtcbiAgICAgIGlmICghc2V0U3VjY2Vzc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2V0U3VjY2Vzc1Jlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYmdSdW4oXG4gICAgaWQ6IG51bWJlcixcbiAgICBrZXk6IHN0cmluZyxcbiAgICBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGAgIGJnUXVldWUuYmdSdW4gLSBydW5uaW5nIGpvYiBpZD0ke2lkfSBrZXk9JHtrZXl9IGRhdGE9JHtkYXRhfWApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBjb25zdCBjVSA9IEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCk7XG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgIGNhc2UgXCJiZ0ltcG9ydFNjaGVtYVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQuYWRkQWxsRXhpc3RpbmdUYWJsZXMoY1UsIGRhdGEuc2NoZW1hTmFtZSk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIGJyZWFrO1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgZGF0YS5zY2hlbWFOYW1lXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIGJyZWFrO1xuICAgICAgICAvLyByZXNldCB0aGUgcm9sZXMgbm93IHRoYXQgbmV3IHRhYmxlcyBleGlzdFxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQuZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgZGF0YS5zY2hlbWFOYW1lXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImJnUmVtb3ZlU2NoZW1hXCI6XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMud2JDbG91ZC5yZW1vdmVPckRlbGV0ZVNjaGVtYShjVSwgZGF0YS5zY2hlbWFOYW1lKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiYmdBZGREZWZhdWx0VGFibGVQZXJtaXNzaW9uc1wiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQuYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgZGF0YS5zY2hlbWFOYW1lLFxuICAgICAgICAgIGRhdGEudGFibGVOYW1lXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIGJyZWFrO1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgZGF0YS5zY2hlbWFOYW1lLFxuICAgICAgICAgIGRhdGEudGFibGVOYW1lXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImJnUmVtb3ZlRGVmYXVsdFRhYmxlUGVybWlzc2lvbnNcIjpcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy53YkNsb3VkLnJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIGRhdGEuc2NoZW1hTmFtZSxcbiAgICAgICAgICBkYXRhLnRhYmxlTmFtZVxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJiZ1JlbW92ZUFuZEFkZERlZmF1bHRUYWJsZVBlcm1pc3Npb25zXCI6XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMud2JDbG91ZC5yZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBkYXRhLnNjaGVtYU5hbWUsXG4gICAgICAgICAgZGF0YS50YWJsZU5hbWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgYnJlYWs7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMud2JDbG91ZC5hZGREZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBkYXRhLnNjaGVtYU5hbWUsXG4gICAgICAgICAgZGF0YS50YWJsZU5hbWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgYnJlYWs7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMud2JDbG91ZC5hZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBkYXRhLnNjaGVtYU5hbWUsXG4gICAgICAgICAgZGF0YS50YWJsZU5hbWVcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiYmdSZWxvYWRSZW1vdGVTY2hlbWFzQW5kTWV0YWRhdGFcIjpcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy53YkNsb3VkLnNldFJlbW90ZVNjaGVtYXMoY1UpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSBicmVhaztcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy53YkNsb3VkLnJlbG9hZE1ldGFkYXRhKGNVKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsb2cuZXJyb3IoYD09IGJnSGFuZGxlciBFUlJPUjogbm8gY2FzZSBmb3IgZXZlbnQuZm4gJHtrZXl9YCk7XG4gICAgfVxuICAgIGxvZy5pbmZvKGAgIGJnUXVldWUuYmdSdW4gLSByZXR1cm5pbmcgcmVzdWx0PSR7cmVzdWx0fWApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cbiIsImltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IGxvZywgZXJyUmVzdWx0IH0gZnJvbSBcIi4vd2hpdGVicmljay1jbG91ZFwiO1xuaW1wb3J0IHsgUG9vbCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHtcbiAgUm9sZSxcbiAgUm9sZUxldmVsLFxuICBVc2VyLFxuICBPcmdhbml6YXRpb24sXG4gIE9yZ2FuaXphdGlvblVzZXIsXG4gIFNjaGVtYSxcbiAgU2NoZW1hVXNlcixcbiAgVGFibGUsXG4gIFRhYmxlVXNlcixcbiAgQ29sdW1uLFxufSBmcm9tIFwiLi9lbnRpdHlcIjtcbmltcG9ydCB7IENvbnN0cmFpbnRJZCwgUXVlcnlQYXJhbXMsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgZmlyc3QgfSBmcm9tIFwidm9jYVwiO1xuXG5leHBvcnQgY2xhc3MgREFMIHtcbiAgcHJpdmF0ZSBwb29sOiBQb29sO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMucG9vbCA9IG5ldyBQb29sKHtcbiAgICAgIGRhdGFiYXNlOiBlbnZpcm9ubWVudC5kYk5hbWUsXG4gICAgICBob3N0OiBlbnZpcm9ubWVudC5kYkhvc3QsXG4gICAgICBwb3J0OiBlbnZpcm9ubWVudC5kYlBvcnQsXG4gICAgICB1c2VyOiBlbnZpcm9ubWVudC5kYlVzZXIsXG4gICAgICBwYXNzd29yZDogZW52aXJvbm1lbnQuZGJQYXNzd29yZCxcbiAgICAgIG1heDogZW52aXJvbm1lbnQuZGJQb29sTWF4LFxuICAgICAgaWRsZVRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgICAgY29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gREIgPT09PT09PT09XG4gICAqL1xuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtcyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtxdWVyeVBhcmFtc10pO1xuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBleGVjdXRlUXVlcmllcyhcbiAgICBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0W10+IHtcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLnBvb2wuY29ubmVjdCgpO1xuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gW107XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkJFR0lOXCIpO1xuICAgICAgZm9yIChjb25zdCBxdWVyeVBhcmFtcyBvZiBxdWVyaWVzQW5kUGFyYW1zKSB7XG4gICAgICAgIGxldCBsb2dUeHQgPSBxdWVyeVBhcmFtcy5xdWVyeTtcbiAgICAgICAgaWYgKGxvZ1R4dC5zdGFydHNXaXRoKFwiLS1TS0lQTE9HXCIpKSBsb2dUeHQgPSBsb2dUeHQuc3Vic3RyaW5nKDAsIDMwKTtcbiAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbXM6ICR7bG9nVHh0fWAsXG4gICAgICAgICAgYCAgICBbICR7cXVlcnlQYXJhbXMucGFyYW1zID8gcXVlcnlQYXJhbXMucGFyYW1zLmpvaW4oXCIsIFwiKSA6IFwiXCJ9IF1gXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnF1ZXJ5KFxuICAgICAgICAgIHF1ZXJ5UGFyYW1zLnF1ZXJ5LFxuICAgICAgICAgIHF1ZXJ5UGFyYW1zLnBhcmFtc1xuICAgICAgICApO1xuICAgICAgICByZXN1bHRzLnB1c2goe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgcGF5bG9hZDogcmVzcG9uc2UsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJDT01NSVRcIik7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XG4gICAgICBsb2cuZXJyb3IoSlNPTi5zdHJpbmdpZnkoZXJyb3IpKTtcbiAgICAgIHJlc3VsdHMucHVzaChcbiAgICAgICAgZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgIHJlZkNvZGU6IFwiUEdfXCIgKyBlcnJvci5jb2RlLFxuICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpXG4gICAgICApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8vIHVzZWQgZm9yIERETCBpZGVudGlmaWVycyAoZWcgQ1JFQVRFIFRBQkxFIHNhbml0aXplKHRhYmxlTmFtZSkpXG4gIHB1YmxpYyBzdGF0aWMgc2FuaXRpemUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvW15cXHclXSsvZywgXCJcIik7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaGVhbHRoQ2hlY2soKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGlzY292ZXJTY2hlbWFzKFwiJVwiLCBcInNjaGVtYV9uYW1lXCIsIDEpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gQkcgUVVFVUUgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYmdRdWV1ZVNlbGVjdChcbiAgICBjb2x1bW5zOiBzdHJpbmdbXSxcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIHN0YXR1czogc3RyaW5nLFxuICAgIGxpbWl0PzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFNFTEVDVCAke2NvbHVtbnMuam9pbihcIixcIil9XG4gICAgICBGUk9NIHdiLmJnX3F1ZXVlXG4gICAgICBXSEVSRSBzY2hlbWFfaWQ9JDFcbiAgICAgIEFORCBzdGF0dXM9JDJcbiAgICAgIE9SREVSIEJZIGlkXG4gICAgYDtcbiAgICBpZiAobGltaXQpIHF1ZXJ5ICs9IGAgTElNSVQgJHtsaW1pdH1gO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IFtzY2hlbWFJZCwgc3RhdHVzXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBiZ1F1ZXVlSW5zZXJ0KFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNjaGVtYUlkOiBudW1iZXIsXG4gICAgc3RhdHVzOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgZGF0YT86IG9iamVjdCB8IG51bGxcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFkYXRhKSBkYXRhID0gbnVsbDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi5iZ19xdWV1ZShcbiAgICAgICAgICB1c2VyX2lkLCBzY2hlbWFfaWQsIHN0YXR1cywga2V5LCBkYXRhXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSkgUkVUVVJOSU5HICpcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFt1c2VySWQsIHNjaGVtYUlkLCBzdGF0dXMsIGtleSwgZGF0YV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBiZ1F1ZXVlVXBkYXRlU3RhdHVzKFxuICAgIG5ld1N0YXR1czogc3RyaW5nLFxuICAgIGlkPzogbnVtYmVyLFxuICAgIHNjaGVtYUlkPzogbnVtYmVyLFxuICAgIGN1cnJlbnRTdGF0dXM/OiBzdHJpbmcsXG4gICAgZGF0YT86IFJlY29yZDxzdHJpbmcsIGFueT5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgVVBEQVRFIHdiLmJnX3F1ZXVlXG4gICAgICBTRVQgc3RhdHVzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICBXSEVSRVxuICAgIGA7XG4gICAgY29uc3Qgd2hlcmVTcWw6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGlkKSB3aGVyZVNxbC5wdXNoKGBpZD0ke2lkfWApO1xuICAgIGlmIChzY2hlbWFJZCkgd2hlcmVTcWwucHVzaChgc2NoZW1hX2lkPSR7c2NoZW1hSWR9YCk7XG4gICAgaWYgKGN1cnJlbnRTdGF0dXMpIHdoZXJlU3FsLnB1c2goYHN0YXR1cz0nJHtjdXJyZW50U3RhdHVzfSdgKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogKHF1ZXJ5ICs9IHdoZXJlU3FsLmpvaW4oXCIgQU5EIFwiKSksXG4gICAgICBwYXJhbXM6IFtuZXdTdGF0dXMsIG5ldyBEYXRlKCldLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBSb2xlcyAmIFBlcm1pc3Npb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVzSWRMb29rdXAoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgbmFtZUlkTG9va3VwOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLmlkLCB3Yi5yb2xlcy5uYW1lXG4gICAgICAgIEZST00gd2Iucm9sZXNcbiAgICAgICAgV0hFUkUgY3VzdG9tIElTIGZhbHNlXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCByb3cgb2YgcmVzdWx0LnBheWxvYWQucm93cykge1xuICAgICAgbmFtZUlkTG9va3VwW3Jvdy5uYW1lXSA9IHJvdy5pZDtcbiAgICB9XG4gICAgcmVzdWx0LnBheWxvYWQgPSBuYW1lSWRMb29rdXA7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlSWRzRnJvbU5hbWVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iucm9sZXMuaWRcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBjdXN0b20gSVMgZmFsc2VcbiAgICAgICAgQU5EIG5hbWU9QU5ZKCQxKVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3JvbGVOYW1lc10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKChyb3c6IHsgaWQ6IG51bWJlciB9KSA9PiByb3cuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnJvbGVzLipcbiAgICAgICAgRlJPTSB3Yi5yb2xlc1xuICAgICAgICBXSEVSRSBuYW1lPSQxIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJST0xFX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFR5cGljYWxseSBzZXR0aW5nIGEgcm9sZSBkaXJlY3RseSBpcyBleHBsaWNpdCxcbiAgLy8gc28gYW55IGltcGxpZWRfZnJvbV9yb2xlX2lkIGlzIGNsZWFyZWQgdW5sZXNzIGtlZXBJbXBsaWVkRnJvbVxuICBwdWJsaWMgYXN5bmMgc2V0Um9sZShcbiAgICB1c2VySWRzOiBudW1iZXJbXSxcbiAgICByb2xlTmFtZTogc3RyaW5nLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXIsXG4gICAga2VlcEltcGxpZWRGcm9tPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBkYWwuc2V0Um9sZSgke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke29iamVjdElkfSwke2tlZXBJbXBsaWVkRnJvbX0pYFxuICAgICk7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUJ5TmFtZShyb2xlTmFtZSk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgIGxldCB3YlRhYmxlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCB3YkNvbHVtbjogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzXCI7XG4gICAgICAgIHdiQ29sdW1uID0gXCJvcmdhbml6YXRpb25faWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi5zY2hlbWFfdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcInNjaGVtYV9pZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2IudGFibGVfdXNlcnNcIjtcbiAgICAgICAgd2JDb2x1bW4gPSBcInRhYmxlX2lkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBwYXJhbXM6IERhdGVbXSA9IFtdO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgSU5TRVJUIElOVE8gJHt3YlRhYmxlfSAocm9sZV9pZCwgIHVzZXJfaWQsICR7d2JDb2x1bW59LCB1cGRhdGVkX2F0KVxuICAgICAgVkFMVUVTXG4gICAgYDtcbiAgICBmb3IgKGNvbnN0IHVzZXJJZCBvZiB1c2VySWRzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIChcbiAgICAgICAgICAke3JvbGVSZXN1bHQucGF5bG9hZC5pZH0sXG4gICAgICAgICAgJHt1c2VySWR9LFxuICAgICAgICAgICR7b2JqZWN0SWR9LFxuICAgICAgICAgICQke3BhcmFtcy5sZW5ndGggKyAxfVxuICAgICAgICApXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2goZGF0ZSk7XG4gICAgICBpZiAocGFyYW1zLmxlbmd0aCAhPSB1c2VySWRzLmxlbmd0aCkgcXVlcnkgKz0gXCIsIFwiO1xuICAgIH1cbiAgICBxdWVyeSArPSBgXG4gICAgICBPTiBDT05GTElDVCAodXNlcl9pZCwgJHt3YkNvbHVtbn0pXG4gICAgICBETyBVUERBVEUgU0VUXG4gICAgICByb2xlX2lkPUVYQ0xVREVELnJvbGVfaWQsXG4gICAgICB1cGRhdGVkX2F0PUVYQ0xVREVELnVwZGF0ZWRfYXRcbiAgICBgO1xuICAgIGlmICgha2VlcEltcGxpZWRGcm9tKSBxdWVyeSArPSBcIiwgaW1wbGllZF9mcm9tX3JvbGVfaWQ9TlVMTFwiO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVSb2xlKFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkPzogbnVtYmVyLFxuICAgIHBhcmVudE9iamVjdElkPzogbnVtYmVyLFxuICAgIGltcGxpZWRGcm9tUm9sZXM/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBudW1iZXJbXSB8IHVuZGVmaW5lZClbXSA9IFt1c2VySWRzXTtcbiAgICBsZXQgd2JUYWJsZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgd2JXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgd2JUYWJsZSA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzXCI7XG4gICAgICAgIHdiV2hlcmUgPSBcIkFORCBvcmdhbml6YXRpb25faWQ9JDJcIjtcbiAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHdiVGFibGUgPSBcIndiLnNjaGVtYV91c2Vyc1wiO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gXCJBTkQgc2NoZW1hX2lkPSQyXCI7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWQpO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcmVudE9iamVjdElkKSB7XG4gICAgICAgICAgd2JXaGVyZSA9IGBcbiAgICAgICAgICAgIEFORCBzY2hlbWFfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgICAgICAgIFdIRVJFIG9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMlxuICAgICAgICAgICAgKVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zLnB1c2gocGFyZW50T2JqZWN0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB3YlRhYmxlID0gXCJ3Yi50YWJsZV91c2Vyc1wiO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gXCJBTkQgdGFibGVfaWQ9JDJcIjtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0SWQpIHtcbiAgICAgICAgICB3YldoZXJlID0gYFxuICAgICAgICAgICAgQU5EIHRhYmxlX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2IudGFibGVzXG4gICAgICAgICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kMlxuICAgICAgICAgICAgKVxuICAgICAgICAgIGA7XG4gICAgICAgICAgcGFyYW1zLnB1c2gocGFyZW50T2JqZWN0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKGltcGxpZWRGcm9tUm9sZXMpIHtcbiAgICAgIHdiV2hlcmUgKz0gYEFORCBpbXBsaWVkX2Zyb21fcm9sZV9pZD1BTlkoJDMpYDtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZUlkc0Zyb21OYW1lcyhpbXBsaWVkRnJvbVJvbGVzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZCk7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NICR7d2JUYWJsZX1cbiAgICAgICAgV0hFUkUgdXNlcl9pZD1BTlkoJDEpXG4gICAgICAgICR7d2JXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgdGFibGVJZDogbnVtYmVyLFxuICAgIGRlbGV0ZU9ubHk/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVzSWRMb29rdXAoKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHJvbGVzSWRMb29rdXAgPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBxdWVyeVBhcmFtczogUXVlcnlQYXJhbXNbXSA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZV9wZXJtaXNzaW9uc1xuICAgICAgICAgIFdIRVJFIHRhYmxlX2lkPSQxXG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3RhYmxlSWRdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmICghZGVsZXRlT25seSkge1xuICAgICAgZm9yIChjb25zdCB0YWJsZVJvbGUgb2YgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpKSB7XG4gICAgICAgIGZvciAoY29uc3QgcGVybWlzc2lvblByZWZpeCBvZiBSb2xlLnRhYmxlUGVybWlzc2lvblByZWZpeGVzKFxuICAgICAgICAgIHRhYmxlUm9sZVxuICAgICAgICApKSB7XG4gICAgICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgICBJTlNFUlQgSU5UTyB3Yi50YWJsZV9wZXJtaXNzaW9ucyh0YWJsZV9wZXJtaXNzaW9uX2tleSwgdXNlcl9pZCwgdGFibGVfaWQpXG4gICAgICAgICAgICAgIFNFTEVDVCAnJHtSb2xlLnRhYmxlUGVybWlzc2lvbktleShcbiAgICAgICAgICAgICAgICBwZXJtaXNzaW9uUHJlZml4LFxuICAgICAgICAgICAgICAgIHRhYmxlSWRcbiAgICAgICAgICAgICAgKX0nLCB1c2VyX2lkLCAke3RhYmxlSWR9XG4gICAgICAgICAgICAgIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQxIEFORCB3Yi5yb2xlcy5uYW1lPSQyXG4gICAgICAgICAgICBgLFxuICAgICAgICAgICAgcGFyYW1zOiBbdGFibGVJZCwgdGFibGVSb2xlXSxcbiAgICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBkYWwucm9sZUFuZElkRm9yVXNlck9iamVjdCgke3VzZXJJZH0sJHtyb2xlTGV2ZWx9LCR7b2JqZWN0SWRPck5hbWV9LCR7cGFyZW50T2JqZWN0TmFtZX0pYFxuICAgICk7XG4gICAgbGV0IG9iamVjdElkOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHF1ZXJ5T2JqSWQ6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbEpvaW46IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0SWRPck5hbWUgPT09IFwibnVtYmVyXCIpIG9iamVjdElkID0gb2JqZWN0SWRPck5hbWU7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW3VzZXJJZF07XG4gICAgY29uc3QgcGFyYW1zT2JqSWQ6IHN0cmluZ1tdID0gW107XG4gICAgc3dpdGNoIChyb2xlTGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHNxbEpvaW4gPSBgXG4gICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbl91c2VycyBPTiB3Yi5yb2xlcy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZFxuICAgICAgICBgO1xuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPSQxXG4gICAgICAgIGA7XG4gICAgICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkKTtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD0kMlxuICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWRPck5hbWUpO1xuICAgICAgICAgIHNxbEpvaW4gKz0gYFxuICAgICAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICAgIGA7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLm9yZ2FuaXphdGlvbnMubmFtZT0kMlxuICAgICAgICAgIGA7XG4gICAgICAgICAgcXVlcnlPYmpJZCA9XG4gICAgICAgICAgICBcIlNFTEVDVCBpZCBhcyBvYmplY3RfaWQgRlJPTSB3Yi5vcmdhbml6YXRpb25zIFdIRVJFIG5hbWU9JDEgTElNSVQgMVwiO1xuICAgICAgICAgIHBhcmFtc09iaklkLnB1c2gob2JqZWN0SWRPck5hbWUudG9TdHJpbmcoKSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi5zY2hlbWFfdXNlcnMgT04gd2Iucm9sZXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWRcbiAgICAgICAgYDtcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICBXSEVSRSB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWQ9JDJcbiAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmFtcy5wdXNoKG9iamVjdElkT3JOYW1lKTtcbiAgICAgICAgICBzcWxKb2luICs9IGBcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICBgO1xuICAgICAgICAgIHNxbFdoZXJlICs9IGBcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFzLm5hbWU9JDJcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPVxuICAgICAgICAgICAgXCJTRUxFQ1QgaWQgYXMgb2JqZWN0X2lkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIjtcbiAgICAgICAgICBwYXJhbXNPYmpJZC5wdXNoKG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBzcWxKb2luID0gYFxuICAgICAgICAgSk9JTiB3Yi50YWJsZV91c2VycyBPTiB3Yi5yb2xlcy5pZD13Yi50YWJsZV91c2Vycy5yb2xlX2lkXG4gICAgICAgIGA7XG4gICAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICAgV0hFUkUgd2IudGFibGVfdXNlcnMudXNlcl9pZD0kMVxuICAgICAgICBgO1xuICAgICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgICBwYXJhbXMucHVzaChvYmplY3RJZCk7XG4gICAgICAgICAgc3FsV2hlcmUgKz0gYFxuICAgICAgICAgICAgQU5EIHdiLnRhYmxlX3VzZXJzLnRhYmxlX2lkPSQyXG4gICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoIXBhcmVudE9iamVjdE5hbWUpIHtcbiAgICAgICAgICAgIHRocm93IGBkYWwucm9sZU5hbWVGb3JVc2VyT2JqZWN0IHBhcmVudE9iamVjdE5hbWUgcmVxdWlyZWQgZm9yIHRhYmxlIGxldmVsYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcGFyYW1zLnB1c2gob2JqZWN0SWRPck5hbWUsIHBhcmVudE9iamVjdE5hbWUpO1xuICAgICAgICAgIHNxbEpvaW4gKz0gYFxuICAgICAgICAgICAgSk9JTiB3Yi50YWJsZXMgT04gd2IudGFibGVfdXNlcnMudGFibGVfaWQ9d2IudGFibGVzLmlkXG4gICAgICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgICAgYDtcbiAgICAgICAgICBzcWxXaGVyZSArPSBgXG4gICAgICAgICAgICBBTkQgd2IudGFibGVzLm5hbWU9JDJcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFzLm5hbWU9JDNcbiAgICAgICAgICBgO1xuICAgICAgICAgIHF1ZXJ5T2JqSWQgPSBgXG4gICAgICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLmlkIGFzIG9iamVjdF9pZFxuICAgICAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi50YWJsZXMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICAgIFdIRVJFIHdiLnRhYmxlcy5uYW1lPSQxIEFORCB3Yi5zY2hlbWFzLm5hbWU9JDJcbiAgICAgICAgICAgIExJTUlUIDFcbiAgICAgICAgICBgO1xuICAgICAgICAgIHBhcmFtc09iaklkLnB1c2gob2JqZWN0SWRPck5hbWUudG9TdHJpbmcoKSwgcGFyZW50T2JqZWN0TmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZVxuICAgICAgICBGUk9NIHdiLnJvbGVzXG4gICAgICAgICR7c3FsSm9pbn1cbiAgICAgICAgJHtzcWxXaGVyZX0gIFxuICAgICAgICBMSU1JVCAxXG4gICAgICBgLFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoIW9iamVjdElkKSB7XG4gICAgICBxdWVyaWVzLnB1c2goe1xuICAgICAgICBxdWVyeTogcXVlcnlPYmpJZCxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXNPYmpJZCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyaWVzKTtcbiAgICBpZiAoIXJlc3VsdHNbMF0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMF07XG4gICAgaWYgKHJlc3VsdHNbMV0gJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgY29uc3QgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgcm9sZU5hbWU6IG51bGwsXG4gICAgICAgIG9iamVjdElkOiBudWxsLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGlmIChyZXN1bHRzWzBdLnBheWxvYWQucm93cy5sZW5ndGggPT0gMSkge1xuICAgICAgcmVzdWx0LnBheWxvYWQucm9sZU5hbWUgPSByZXN1bHRzWzBdLnBheWxvYWQucm93c1swXS5yb2xlX25hbWU7XG4gICAgfVxuICAgIGlmIChvYmplY3RJZCkge1xuICAgICAgcmVzdWx0LnBheWxvYWQub2JqZWN0SWQgPSBvYmplY3RJZDtcbiAgICB9IGVsc2UgaWYgKHJlc3VsdHNbMV0ucGF5bG9hZC5yb3dzLmxlbmd0aCA9PSAxKSB7XG4gICAgICByZXN1bHQucGF5bG9hZC5vYmplY3RJZCA9IHJlc3VsdHNbMV0ucGF5bG9hZC5yb3dzWzBdLm9iamVjdF9pZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFVzZXJzID09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcklkRnJvbUF1dGhJZChhdXRoSWQ6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCB3Yi51c2Vycy5pZFxuICAgICAgICBGUk9NIHdiLnVzZXJzXG4gICAgICAgIFdIRVJFIGF1dGhfaWQ9JDFcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW2F1dGhJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpZiAocmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFthdXRoSWRdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQucm93c1swXS5pZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VycyhcbiAgICBpZHM/OiBudW1iZXJbXSxcbiAgICBlbWFpbHM/OiBzdHJpbmdbXSxcbiAgICBzZWFyY2hQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgcGFyYW1zOiAobnVtYmVyW10gfCBzdHJpbmdbXSB8IHN0cmluZylbXSA9IFtdO1xuICAgIGlmIChpZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgaWQ9QU5ZKCQxKVwiO1xuICAgICAgcGFyYW1zLnB1c2goaWRzKTtcbiAgICB9IGVsc2UgaWYgKGVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIkFORCBlbWFpbD1BTlkoJDEpXCI7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbHMubWFwKCh2KSA9PiB2LnRvTG93ZXJDYXNlKCkpKTtcbiAgICB9IGVsc2UgaWYgKHNlYXJjaFBhdHRlcm4pIHtcbiAgICAgIHNxbFdoZXJlID0gYFxuICAgICAgICBBTkQgZW1haWwgTElLRSAkMVxuICAgICAgICBPUiBmaXJzdF9uYW1lIExJS0UgJDFcbiAgICAgICAgT1IgbGFzdF9uYW1lIExJS0UgJDFcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChzZWFyY2hQYXR0ZXJuLnJlcGxhY2UoL1xcKi9nLCBcIiVcIikpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgU0VMRUNUIHdiLnVzZXJzLipcbiAgICAgIEZST00gd2IudXNlcnNcbiAgICAgIFdIRVJFIGlkIE5PVCBJTiAoJHtVc2VyLlNZU19BRE1JTl9JRH0pXG4gICAgICAke3NxbFdoZXJlfVxuICAgICAgT1JERVIgQlkgZW1haWxcbiAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihcbiAgICBhdXRoSWQ/OiBzdHJpbmcsXG4gICAgZW1haWw/OiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lPzogc3RyaW5nLFxuICAgIGxhc3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIElOU0VSVCBJTlRPIHdiLnVzZXJzKFxuICAgICAgICAgIGF1dGhfaWQsIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWVcbiAgICAgICAgKSBWQUxVRVMoJDEsICQyLCAkMywgJDQpIFJFVFVSTklORyAqXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbYXV0aElkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsPzogc3RyaW5nLFxuICAgIGZpcnN0TmFtZT86IHN0cmluZyxcbiAgICBsYXN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIWVtYWlsICYmICFmaXJzdE5hbWUgJiYgIWxhc3ROYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogXCJkYWwudXBkYXRlVXNlcjogYWxsIHBhcmFtZXRlcnMgYXJlIG51bGxcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGxldCBwYXJhbUNvdW50ID0gMztcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBwYXJhbXM6IChEYXRlIHwgbnVtYmVyIHwgc3RyaW5nKVtdID0gW2RhdGUsIGlkXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi51c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsKSB7XG4gICAgICBxdWVyeSArPSBgZW1haWw9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgICBwYXJhbXMucHVzaChlbWFpbCk7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgfVxuICAgIGlmIChmaXJzdE5hbWUpIHtcbiAgICAgIHF1ZXJ5ICs9IGBmaXJzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2goZmlyc3ROYW1lKTtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICB9XG4gICAgaWYgKGxhc3ROYW1lKSB7XG4gICAgICBxdWVyeSArPSBgbGFzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgO1xuICAgICAgcGFyYW1zLnB1c2gobGFzdE5hbWUpO1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgIH1cbiAgICBxdWVyeSArPSBcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2IudXNlcnNcbiAgICAgICAgV0hFUkUgZW1haWwgbGlrZSAndGVzdF8lJHtlbnZpcm9ubWVudC50ZXN0VXNlckVtYWlsRG9tYWlufSdcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb25zID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnMoXG4gICAgb3JnYW5pemF0aW9uSWRzPzogbnVtYmVyW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmdbXSB8IG51bWJlcltdIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHF1ZXJ5OiBzdHJpbmcgPSBgXG4gICAgICBTRUxFQ1Qgd2Iub3JnYW5pemF0aW9ucy4qXG4gICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbnNcbiAgICBgO1xuICAgIGlmIChvcmdhbml6YXRpb25JZHMpIHtcbiAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD1BTlkoJDEpXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWRzKTtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWVzKSB7XG4gICAgICBxdWVyeSArPSBgXG4gICAgICAgIFdIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZT1BTlkoJDEpXG4gICAgICBgO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZXMpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZVBhdHRlcm4pIHtcbiAgICAgIHF1ZXJ5ICs9IGBcbiAgICAgICAgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lIExJS0UgJDFcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChvcmdhbml6YXRpb25OYW1lUGF0dGVybik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gdXNlclJvbGUgYW5kIHVzZXJSb2xlSW1wbGllZEZyb20gb25seSByZXR1cm5lZCBpZiB1c2VySWRzL0VtYWlscy5sZW5ndGg9PTFcbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeVVzZXJzKFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgb3JnYW5pemF0aW9uTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAob3JnYW5pemF0aW9uTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiIEFORCB3Yi5vcmdhbml6YXRpb25zLm5hbWU9QU5ZKCQyKVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uTmFtZXMpO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgKz0gXCIsIHdiLnNjaGVtYV91c2Vycy5zZXR0aW5ncyBhcyBzZXR0aW5nc1wiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy4qLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICBGUk9NIHdiLm9yZ2FuaXphdGlvbnNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iub3JnYW5pemF0aW9ucy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbGFiZWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBJTlNFUlQgSU5UTyB3Yi5vcmdhbml6YXRpb25zKFxuICAgICAgICAgIG5hbWUsIGxhYmVsXG4gICAgICAgICkgVkFMVUVTKCQxLCAkMilcbiAgICAgICAgUkVUVVJOSU5HICpcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtuYW1lLCBsYWJlbF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb24ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlT3JnYW5pemF0aW9uKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBuZXdOYW1lPzogc3RyaW5nLFxuICAgIG5ld0xhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKERhdGUgfCBzdHJpbmcpW10gPSBbbmV3IERhdGUoKV07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2Iub3JnYW5pemF0aW9ucyBTRVQgdXBkYXRlZF9hdD0kMVwiO1xuICAgIGlmIChuZXdOYW1lKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdOYW1lKTtcbiAgICAgIHF1ZXJ5ICs9IGAsIG5hbWU9JCR7cGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cbiAgICBpZiAobmV3TGFiZWwpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld0xhYmVsKTtcbiAgICAgIHF1ZXJ5ICs9IGAsIGxhYmVsPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICB9XG4gICAgcGFyYW1zLnB1c2gobmFtZSk7XG4gICAgcXVlcnkgKz0gYCBXSEVSRSBuYW1lPSQke3BhcmFtcy5sZW5ndGh9IFJFVFVSTklORyAqYDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICByZXN1bHQucGF5bG9hZCA9IE9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVPcmdhbml6YXRpb24obmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy8gbm8gcGF0dGVybnMgYWxsb3dlZCBoZXJlXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGVsZXRlT3JnYW5pemF0aW9ucyhuYW1lLnJlcGxhY2UoL1xcJS9nLCBcIlwiKSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGVsZXRlT3JnYW5pemF0aW9ucyhcInRlc3RfJVwiKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVPcmdhbml6YXRpb25zKFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLm9yZ2FuaXphdGlvbl91c2Vyc1xuICAgICAgICAgIFdIRVJFIG9yZ2FuaXphdGlvbl9pZCBJTiAoXG4gICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi5vcmdhbml6YXRpb25zIFdIRVJFIG5hbWUgbGlrZSAkMVxuICAgICAgICAgIClcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi5vcmdhbml6YXRpb25zIFdIRVJFIG5hbWUgbGlrZSAkMVxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF0pO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb24gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uVXNlcnMoXG4gICAgbmFtZT86IHN0cmluZyxcbiAgICBpZD86IG51bWJlcixcbiAgICByb2xlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXIgfCBzdHJpbmdbXSB8IG51bWJlcltdKVtdID0gW107XG4gICAgaWYgKGlkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9uX3VzZXJzLm9yZ2FuaXphdGlvbl9pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2goaWQpO1xuICAgIH0gZWxzZSBpZiAobmFtZSkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLm9yZ2FuaXphdGlvbnMubmFtZT0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gobmFtZSk7XG4gICAgfVxuICAgIGlmIChyb2xlTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiIEFORCB3Yi5yb2xlcy5uYW1lPUFOWSgkMilcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHJvbGVOYW1lcyk7XG4gICAgfVxuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICBzcWxXaGVyZSArPSBgIEFORCB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZD1BTlkoJCR7XG4gICAgICAgIHBhcmFtcy5sZW5ndGggKyAxXG4gICAgICB9KWA7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnMuc2V0dGluZ3MsXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkLFxuICAgICAgICB3Yi5vcmdhbml6YXRpb25fdXNlcnMudXNlcl9pZCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9uX3VzZXJzLmNyZWF0ZWRfYXQsXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51cGRhdGVkX2F0LFxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5lbWFpbCBhcyB1c2VyX2VtYWlsLFxuICAgICAgICB3Yi51c2Vycy5maXJzdF9uYW1lIGFzIHVzZXJfZmlyc3RfbmFtZSxcbiAgICAgICAgd2IudXNlcnMubGFzdF9uYW1lIGFzIHVzZXJfbGFzdF9uYW1lLFxuICAgICAgICB3Yi5yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tXG4gICAgICAgIEZST00gd2Iub3JnYW5pemF0aW9uX3VzZXJzXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5vcmdhbml6YXRpb25faWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgcmVzdWx0LnBheWxvYWQgPSBPcmdhbml6YXRpb25Vc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgb3JnYW5pemF0aW9uSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIG9yZ2FuaXphdGlvbl9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBvcmdhbml6YXRpb25JZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gU2NoZW1hcyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzKFxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHNjaGVtYU5hbWVzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZVBhdHRlcm4/OiBzdHJpbmcsXG4gICAgb3JkZXJCeT86IHN0cmluZyxcbiAgICBsaW1pdD86IG51bWJlcixcbiAgICB3Yk9ubHk/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBnUGFyYW1zOiAoc3RyaW5nW10gfCBudW1iZXJbXSB8IHN0cmluZylbXSA9IFtcbiAgICAgIFNjaGVtYS5TWVNfU0NIRU1BX05BTUVTLFxuICAgIF07XG4gICAgY29uc3Qgd2JQYXJhbXM6IChzdHJpbmdbXSB8IG51bWJlcltdIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFBnV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IHNxbFdiV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHNjaGVtYUlkcykge1xuICAgICAgc3FsV2JXaGVyZSA9IFwiV0hFUkUgaWQ9QU5ZKCQxKVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFJZHMpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hTmFtZXMpIHtcbiAgICAgIHNxbFBnV2hlcmUgPSBcIkFORCBzY2hlbWFfbmFtZT1BTlkoJDIpXCI7XG4gICAgICBwZ1BhcmFtcy5wdXNoKHNjaGVtYU5hbWVzKTtcbiAgICAgIHNxbFdiV2hlcmUgPSBcIldIRVJFIG5hbWU9QU5ZKCQxKVwiO1xuICAgICAgd2JQYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgfSBlbHNlIGlmIChzY2hlbWFOYW1lUGF0dGVybikge1xuICAgICAgc3FsUGdXaGVyZSA9IFwiQU5EIHNjaGVtYV9uYW1lIExJS0UgJDJcIjtcbiAgICAgIHBnUGFyYW1zLnB1c2goc2NoZW1hTmFtZVBhdHRlcm4pO1xuICAgICAgc3FsV2JXaGVyZSA9IFwiV0hFUkUgbmFtZSBMSUtFICQxXCI7XG4gICAgICB3YlBhcmFtcy5wdXNoKHNjaGVtYU5hbWVQYXR0ZXJuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJkYWwuc2NoZW1hczogT25lIG9mIHNjaGVtYUlkcywgc2NoZW1hTmFtZXMgb3Igc2NoZW1hTmFtZVBhdHRlcm4gbXVzdCBiZSBzcGVjaWZpZWQuXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgc3FsT3JkZXJCeSA9IFwiT1JERVIgQlkgbmFtZVwiO1xuICAgIGlmIChvcmRlckJ5KSB7XG4gICAgICBjb25zdCBzcGxpdCA9IG9yZGVyQnkuc3BsaXQoXCIgXCIpO1xuICAgICAgc3FsT3JkZXJCeSA9IGBPUkRFUiBCWSAke0RBTC5zYW5pdGl6ZShzcGxpdFswXSl9YDtcbiAgICAgIGlmIChzcGxpdC5sZW5ndGggPT0gMikgc3FsT3JkZXJCeSArPSBgICR7REFMLnNhbml0aXplKHNwbGl0WzFdKX1gO1xuICAgIH1cbiAgICBsZXQgc3FsTGltaXQgPSBcIlwiO1xuICAgIGlmIChsaW1pdCkgc3FsTGltaXQgPSBgTElNSVQgJHtsaW1pdH1gO1xuICAgIGNvbnN0IHF1ZXJpZXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICR7c3FsV2JXaGVyZX1cbiAgICAgICAgICAke3NxbE9yZGVyQnl9XG4gICAgICAgICAgJHtzcWxMaW1pdH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiB3YlBhcmFtcyxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoIXdiT25seSAmJiAhbGltaXQpIHtcbiAgICAgIHF1ZXJpZXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YS4qXG4gICAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcbiAgICAgICAgICBXSEVSRSBzY2hlbWFfbmFtZSBOT1QgTElLRSAncGdfJSdcbiAgICAgICAgICBBTkQgc2NoZW1hX25hbWUhPUFOWSgkMSlcbiAgICAgICAgICAke3NxbFBnV2hlcmV9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogcGdQYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIC8vIGlmICghd2JPbmx5KSB7XG4gICAgLy8gICBpZiAoIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgLy8gICBpZiAocmVzdWx0c1swXS5wYXlsb2FkLnJvd3MubGVuZ3RoICE9IHJlc3VsdHNbMV0ucGF5bG9hZC5yb3dzLmxlbmd0aCkge1xuICAgIC8vICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAvLyAgICAgICBtZXNzYWdlOlxuICAgIC8vICAgICAgICAgXCJkYWwuc2NoZW1hczogd2Iuc2NoZW1hcyBvdXQgb2Ygc3luYyB3aXRoIGluZm9ybWF0aW9uX3NjaGVtYS5zY2hlbWF0YVwiLFxuICAgIC8vICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIC8vICAgfVxuICAgIC8vIH1cbiAgICByZXN1bHRzWzBdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1swXS5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaXNjb3ZlclNjaGVtYXMoXG4gICAgc2NoZW1hTmFtZVBhdHRlcm4/OiBzdHJpbmcsXG4gICAgb3JkZXJCeT86IHN0cmluZyxcbiAgICBsaW1pdD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIXNjaGVtYU5hbWVQYXR0ZXJuKSBzY2hlbWFOYW1lUGF0dGVybiA9IFwiJVwiO1xuICAgIGlmICghb3JkZXJCeSkgb3JkZXJCeSA9IFwic2NoZW1hX25hbWVcIjtcbiAgICBsZXQgc3FsTGltaXQgPSBcIlwiO1xuICAgIGlmIChsaW1pdCkgc3FsTGltaXQgPSBgTElNSVQgJHtsaW1pdH1gO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGEuc2NoZW1hX25hbWVcbiAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcbiAgICAgICAgV0hFUkUgc2NoZW1hX25hbWUgTk9UIExJS0UgJ3BnXyUnXG4gICAgICAgIEFORCBzY2hlbWFfbmFtZSE9QU5ZKCQxKVxuICAgICAgICBBTkQgc2NoZW1hX25hbWUgTElLRSAnJHtzY2hlbWFOYW1lUGF0dGVybn0nXG4gICAgICAgIE9SREVSIEJZICR7b3JkZXJCeX1cbiAgICAgICAgJHtzcWxMaW1pdH1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtTY2hlbWEuU1lTX1NDSEVNQV9OQU1FU10sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHNjaGVtYV9uYW1lOiBzdHJpbmcgfSkgPT4gcm93LnNjaGVtYV9uYW1lXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG5leHRVbmFzc2lnbmVkRGVtb1NjaGVtYShzY2hlbWFOYW1lUGF0dGVybjogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKlxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lIExJS0UgJyR7c2NoZW1hTmFtZVBhdHRlcm59J1xuICAgICAgICBBTkQgd2Iuc2NoZW1hcy51c2VyX293bmVyX2lkPSR7VXNlci5TWVNfQURNSU5fSUR9XG4gICAgICAgIE9SREVSIEJZIG5hbWVcbiAgICAgICAgTElNSVQgMVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJzKFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZTogc3RyaW5nID0gXCJcIjtcbiAgICBpZiAodXNlcklkcykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmVtYWlsPUFOWSgkMSlcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbHMpO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hTmFtZXMpIHtcbiAgICAgIHNxbFdoZXJlICs9IFwiQU5EIHdiLnNjaGVtYXMubmFtZT1BTlkoJDIpXCI7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFOYW1lcyk7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCArPSBcIiwgd2Iuc2NoZW1hX3VzZXJzLnNldHRpbmdzIGFzIHNldHRpbmdzXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb20sXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZSxcbiAgICAgICAgdXNlcl9vd25lcnMuZW1haWwgYXMgdXNlcl9vd25lcl9lbWFpbFxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnJvbGVzIGltcGxpZWRfcm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgTEVGVCBKT0lOIHdiLnVzZXJzIHVzZXJfb3duZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD11c2VyX293bmVycy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iub3JnYW5pemF0aW9ucyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25zLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIoXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgPSBcIldIRVJFIHdiLnVzZXJzLmlkPSQxXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWQpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlsKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfb3duZXJfZW1haWwsXG4gICAgICAgICdzY2hlbWFfb3duZXInIGFzIHJvbGVfbmFtZVxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi51c2VycyBPTiB3Yi5zY2hlbWFzLnVzZXJfb3duZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyKFxuICAgIGN1cnJlbnRVc2VySWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBzdHJpbmcpW10gPSBbXTtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKG9yZ2FuaXphdGlvbklkKSB7XG4gICAgICBzcWxXaGVyZSA9IFwiV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5pZD0kMVwiO1xuICAgICAgcGFyYW1zLnB1c2gob3JnYW5pemF0aW9uSWQpO1xuICAgIH0gZWxzZSBpZiAob3JnYW5pemF0aW9uTmFtZSkge1xuICAgICAgc3FsV2hlcmUgPSBgV0hFUkUgd2Iub3JnYW5pemF0aW9ucy5uYW1lPSQxYDtcbiAgICAgIHBhcmFtcy5wdXNoKG9yZ2FuaXphdGlvbk5hbWUpO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFVzZXJJZCkge1xuICAgICAgc3FsV2hlcmUgKz0gYEFORCB3Yi5zY2hlbWFfdXNlcnMudXNlcl9pZD0kMmA7XG4gICAgICBwYXJhbXMucHVzaChjdXJyZW50VXNlcklkKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUXG4gICAgICAgIHdiLnNjaGVtYXMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIHNjaGVtYV91c2VyX2ltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbSxcbiAgICAgICAgd2Iub3JnYW5pemF0aW9ucy5uYW1lIGFzIG9yZ2FuaXphdGlvbl9vd25lcl9uYW1lXG4gICAgICAgIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLm9yZ2FuaXphdGlvbnMgT04gd2Iuc2NoZW1hcy5vcmdhbml6YXRpb25fb3duZXJfaWQ9d2Iub3JnYW5pemF0aW9ucy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnJvbGVzIG9uIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzIE9OIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZD1zY2hlbWFfdXNlcl9pbXBsaWVkX3JvbGVzLmlkXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIHVzZXJJZD86IG51bWJlcixcbiAgICB1c2VyRW1haWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIGlmICh1c2VySWQpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZCk7XG4gICAgfSBlbHNlIGlmICh1c2VyRW1haWwpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudXNlcnMuZW1haWw9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJFbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi5zY2hlbWFzLiosXG4gICAgICAgIHdiLm9yZ2FuaXphdGlvbnMubmFtZSBhcyBvcmdhbml6YXRpb25fb3duZXJfbmFtZVxuICAgICAgICBzY2hlbWFfdXNlcl9yb2xlcy5uYW1lIGFzIHJvbGVfbmFtZSxcbiAgICAgICAgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5uYW1lIGFzIHJvbGVfaW1wbGllZF9mcm9tLFxuICAgICAgICBGUk9NIHdiLnNjaGVtYXNcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25zIE9OIHdiLnNjaGVtYXMub3JnYW5pemF0aW9uX293bmVyX2lkPXdiLm9yZ2FuaXphdGlvbnMuaWRcbiAgICAgICAgSk9JTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMgT04gd2Iub3JnYW5pemF0aW9ucy5pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iub3JnYW5pemF0aW9uX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5vcmdhbml6YXRpb25fdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBKT0lOIHdiLnNjaGVtYV91c2VycyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnNjaGVtYV91c2Vycy5zY2hlbWFfaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBzY2hlbWFfdXNlcl9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD1zY2hlbWFfdXNlcl9yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgc2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9c2NoZW1hX3VzZXJfaW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5yb2xlcy5uYW1lPSdvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcidcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgdXNlck93bmVySWQ/OiBudW1iZXIsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBuYW1lID0gREFMLnNhbml0aXplKG5hbWUpO1xuICAgIGNvbnN0IHF1ZXJpZXM6IFF1ZXJ5UGFyYW1zW10gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hcyhcbiAgICAgICAgICAgIG5hbWUsIGxhYmVsLCBvcmdhbml6YXRpb25fb3duZXJfaWQsIHVzZXJfb3duZXJfaWRcbiAgICAgICAgICApIFZBTFVFUygkMSwgJDIsICQzLCAkNCkgUkVUVVJOSU5HICpcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbk93bmVySWQsIHVzZXJPd25lcklkXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICBxdWVyaWVzLnB1c2goe1xuICAgICAgICBxdWVyeTogYENSRUFURSBTQ0hFTUEgJHtuYW1lfWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcmllcyk7XG4gICAgaWYgKCFyZXN1bHRzWzBdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzBdO1xuICAgIGlmIChjcmVhdGUgJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgcmVzdWx0c1swXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlU2NoZW1hKFxuICAgIHNjaGVtYTogU2NoZW1hLFxuICAgIG5ld1NjaGVtYU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3U2NoZW1hTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3T3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcixcbiAgICBuZXdVc2VyT3duZXJJZD86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBkYWwudXBkYXRlU2NoZW1hKCR7c2NoZW1hfSwke25ld1NjaGVtYU5hbWV9LCR7bmV3U2NoZW1hTGFiZWx9LCR7bmV3T3JnYW5pemF0aW9uT3duZXJJZH0sJHtuZXdVc2VyT3duZXJJZH0pYFxuICAgICk7XG4gICAgaWYgKG5ld1NjaGVtYU5hbWUpIG5ld1NjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUobmV3U2NoZW1hTmFtZSk7XG4gICAgbGV0IHBhcmFtcyA9IFtdO1xuICAgIGxldCBxdWVyeSA9IGBcbiAgICAgIFVQREFURSB3Yi5zY2hlbWFzIFNFVFxuICAgIGA7XG4gICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKG5ld1NjaGVtYU5hbWUpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld1NjaGVtYU5hbWUpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld1NjaGVtYUxhYmVsKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdTY2hlbWFMYWJlbCk7XG4gICAgICB1cGRhdGVzLnB1c2goXCJsYWJlbD0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKG5ld09yZ2FuaXphdGlvbk93bmVySWQpIHtcbiAgICAgIHBhcmFtcy5wdXNoKG5ld09yZ2FuaXphdGlvbk93bmVySWQpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwib3JnYW5pemF0aW9uX293bmVyX2lkPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwib3JnYW5pemF0aW9uX3VzZXJfaWQ9TlVMTFwiKTtcbiAgICB9XG4gICAgaWYgKG5ld1VzZXJPd25lcklkKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdVc2VyT3duZXJJZCk7XG4gICAgICB1cGRhdGVzLnB1c2goXCJ1c2VyX293bmVyX2lkPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgdXBkYXRlcy5wdXNoKFwib3JnYW5pemF0aW9uX293bmVyX2lkPU5VTExcIik7XG4gICAgfVxuICAgIHBhcmFtcy5wdXNoKHNjaGVtYS5pZCk7XG4gICAgcXVlcnkgKz0gYFxuICAgICAgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX1cbiAgICAgIFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9XG4gICAgICBSRVRVUk5JTkcgKlxuICAgIGA7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogcXVlcnksXG4gICAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFNDSEVNQSBcIiR7c2NoZW1hLm5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgVE8gJHtuZXdTY2hlbWFOYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHRzWzBdLnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgIFdIRVJFIG5hbWU9JDFcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFNDSEVNQSBJRiBFWElTVFMgJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9IENBU0NBREVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hVXNlcnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHJvbGVOYW1lcz86IHN0cmluZ1tdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBpbXBsaWVkRnJvbVJvbGVJZD86IG51bWJlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IHN0cmluZ1tdIHwgbnVtYmVyIHwgbnVtYmVyW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmUgPSBcIlwiO1xuICAgIGlmIChyb2xlTmFtZXMpIHtcbiAgICAgIHBhcmFtcy5wdXNoKHJvbGVOYW1lcyk7XG4gICAgICBzcWxXaGVyZSA9IGBBTkQgd2Iucm9sZXMubmFtZT1BTlkoJCR7cGFyYW1zLmxlbmd0aH0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHBhcmFtcy5wdXNoKHVzZXJJZHMpO1xuICAgICAgc3FsV2hlcmUgPSBgQU5EIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPUFOWSgkJHtwYXJhbXMubGVuZ3RofSlgO1xuICAgIH1cbiAgICBpZiAoaW1wbGllZEZyb21Sb2xlSWQpIHtcbiAgICAgIHBhcmFtcy5wdXNoKGltcGxpZWRGcm9tUm9sZUlkKTtcbiAgICAgIHNxbFdoZXJlID0gYEFORCB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9JHtwYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuICAgIGlmICh3aXRoU2V0dGluZ3MpIHtcbiAgICAgIHNxbFNlbGVjdCA9IFwid2Iub3JnYW5pemF0aW9uX3VzZXJzLnNldHRpbmdzLFwiO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1RcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZCxcbiAgICAgICAgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5yb2xlX2lkLFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLnNjaGVtYV91c2Vycy5jcmVhdGVkX2F0LFxuICAgICAgICB3Yi5zY2hlbWFfdXNlcnMudXBkYXRlZF9hdCxcbiAgICAgICAgJHtzcWxTZWxlY3R9XG4gICAgICAgIHdiLnNjaGVtYXMubmFtZSBhcyBzY2hlbWFfbmFtZSxcbiAgICAgICAgd2IudXNlcnMuZW1haWwgYXMgdXNlcl9lbWFpbCxcbiAgICAgICAgd2IudXNlcnMuZmlyc3RfbmFtZSBhcyB1c2VyX2ZpcnN0X25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmxhc3RfbmFtZSBhcyB1c2VyX2xhc3RfbmFtZSxcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICAgIEpPSU4gd2IudXNlcnMgT04gd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMucm9sZV9pZD13Yi5yb2xlcy5pZFxuICAgICAgICBMRUZUIEpPSU4gd2Iucm9sZXMgaW1wbGllZF9yb2xlcyBPTiB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9aW1wbGllZF9yb2xlcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgICAgJHtzcWxXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gU2NoZW1hVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZCBJTiAoXG4gICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxXG4gICAgICAgIClcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFVQREFURSB3Yi5zY2hlbWFfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHNjaGVtYV9pZD0kM1xuICAgICAgICBBTkQgdXNlcl9pZD0kNFxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3NldHRpbmdzLCBuZXcgRGF0ZSgpLCBzY2hlbWFJZCwgdXNlcklkXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGVzID09PT09PT09PT1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRhYmxlcyhzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2IudGFibGVzLipcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGFibGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMudGFibGVfbmFtZVxuICAgICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXNcbiAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hPSQxXG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHRhYmxlX25hbWU6IHN0cmluZyB9KSA9PiByb3cudGFibGVfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZXNCeVVzZXJzKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHRhYmxlTmFtZXM/OiBzdHJpbmdbXSxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcltdIHwgc3RyaW5nW10pW10gPSBbc2NoZW1hTmFtZV07XG4gICAgbGV0IHNxbFNlbGVjdDogc3RyaW5nID0gXCJcIjtcbiAgICBsZXQgc3FsV2hlcmU6IHN0cmluZyA9IFwiXCI7XG4gICAgbGV0IG9ubHlBZG1pblVzZXI6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBpZiAodXNlcklkcyAmJiB1c2VySWRzLmxlbmd0aCA9PSAxICYmIHVzZXJJZHNbMF0gPT0gVXNlci5TWVNfQURNSU5fSUQpIHtcbiAgICAgIG9ubHlBZG1pblVzZXIgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAodXNlcklkcyAmJiAhb25seUFkbWluVXNlcikge1xuICAgICAgcGFyYW1zLnB1c2godXNlcklkcyk7XG4gICAgICBzcWxXaGVyZSA9IGBBTkQgd2IudXNlcnMuaWQ9QU5ZKCQke3BhcmFtcy5sZW5ndGh9KSBgO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgcGFyYW1zLnB1c2godXNlckVtYWlscyk7XG4gICAgICBzcWxXaGVyZSA9IGBBTkQgd2IudXNlcnMuZW1haWw9QU5ZKCQke3BhcmFtcy5sZW5ndGh9KSBgO1xuICAgIH1cbiAgICBpZiAodGFibGVOYW1lcykge1xuICAgICAgcGFyYW1zLnB1c2godGFibGVOYW1lcyk7XG4gICAgICBzcWxXaGVyZSArPSBgQU5EIHdiLnRhYmxlcy5uYW1lPUFOWSgkJHtwYXJhbXMubGVuZ3RofSlgO1xuICAgIH1cbiAgICBpZiAod2l0aFNldHRpbmdzKSB7XG4gICAgICBzcWxTZWxlY3QgKz0gXCIsIHdiLnRhYmxlX3VzZXJzLnNldHRpbmdzIGFzIHNldHRpbmdzXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi50YWJsZXMuKixcbiAgICAgICAgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWUsXG4gICAgICAgIGltcGxpZWRfcm9sZXMubmFtZSBhcyByb2xlX2ltcGxpZWRfZnJvbVxuICAgICAgICAke3NxbFNlbGVjdH1cbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBKT0lOIHdiLnRhYmxlX3VzZXJzIE9OIHdiLnRhYmxlcy5pZD13Yi50YWJsZV91c2Vycy50YWJsZV9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxXG4gICAgICAgICR7c3FsV2hlcmV9XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gdHlwZSA9IGZvcmVpZ25LZXlzfHJlZmVyZW5jZXN8YWxsXG4gIHB1YmxpYyBhc3luYyBmb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lUGF0dGVybjogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVQYXR0ZXJuOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWVQYXR0ZXJuKTtcbiAgICBjb2x1bW5OYW1lUGF0dGVybiA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lUGF0dGVybik7XG4gICAgbGV0IHNxbFdoZXJlOiBzdHJpbmcgPSBcIlwiO1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSBcIkZPUkVJR05fS0VZU1wiOlxuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgICBBTkQgZmsudGFibGVfbmFtZSBMSUtFICcke3RhYmxlTmFtZVBhdHRlcm59J1xuICAgICAgICAgIEFORCBmay5jb2x1bW5fbmFtZSBMSUtFICcke2NvbHVtbk5hbWVQYXR0ZXJufSdcbiAgICAgICAgYDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiUkVGRVJFTkNFU1wiOlxuICAgICAgICBzcWxXaGVyZSA9IGBcbiAgICAgICAgICBBTkQgcmVmLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgcmVmLmNvbHVtbl9uYW1lIExJS0UgJyR7Y29sdW1uTmFtZVBhdHRlcm59J1xuICAgICAgICBgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJBTExcIjpcbiAgICAgICAgc3FsV2hlcmUgPSBgXG4gICAgICAgICAgQU5EIGZrLnRhYmxlX25hbWUgTElLRSAnJHt0YWJsZU5hbWVQYXR0ZXJufSdcbiAgICAgICAgICBBTkQgZmsuY29sdW1uX25hbWUgTElLRSAnJHtjb2x1bW5OYW1lUGF0dGVybn0nXG4gICAgICAgIGA7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYC0tU0tJUExPRyBmb3JlaWduS2V5c09yUmVmZXJlbmNlc1xuICAgICAgICBTRUxFQ1RcbiAgICAgICAgLS0gdW5pcXVlIHJlZmVyZW5jZSBpbmZvXG4gICAgICAgIHJlZi50YWJsZV9uYW1lICAgICAgIEFTIHJlZl90YWJsZSxcbiAgICAgICAgcmVmLmNvbHVtbl9uYW1lICAgICAgQVMgcmVmX2NvbHVtbixcbiAgICAgICAgcmVmZC5jb25zdHJhaW50X3R5cGUgQVMgcmVmX3R5cGUsIC0tIGUuZy4gVU5JUVVFIG9yIFBSSU1BUlkgS0VZXG4gICAgICAgIC0tIGZvcmVpZ24ga2V5IGluZm9cbiAgICAgICAgZmsudGFibGVfbmFtZSAgICAgICAgQVMgZmtfdGFibGUsXG4gICAgICAgIGZrLmNvbHVtbl9uYW1lICAgICAgIEFTIGZrX2NvbHVtbixcbiAgICAgICAgZmsuY29uc3RyYWludF9uYW1lICAgQVMgZmtfbmFtZSxcbiAgICAgICAgbWFwLnVwZGF0ZV9ydWxlICAgICAgQVMgZmtfb25fdXBkYXRlLFxuICAgICAgICBtYXAuZGVsZXRlX3J1bGUgICAgICBBUyBma19vbl9kZWxldGUsXG4gICAgICAgIC0tIGFkZCBsYWJlbHNcbiAgICAgICAgdGFibGVzX3JlZi5sYWJlbCAgICAgQVMgcmVmX3RhYmxlX2xhYmVsLFxuICAgICAgICBjb2x1bW5zX3JlZi5sYWJlbCAgICBBUyByZWZfY29sdW1uX2xhYmVsLFxuICAgICAgICB0YWJsZXNfZmsubGFiZWwgICAgICBBUyBma190YWJsZV9sYWJlbCxcbiAgICAgICAgY29sdW1uc19may5sYWJlbCAgICAgQVMgZmtfY29sdW1uX2xhYmVsXG4gICAgICAgIC0tIGxpc3RzIGZrIGNvbnN0cmFpbnRzIEFORCBtYXBzIHRoZW0gdG8gcGsgY29uc3RyYWludHNcbiAgICAgICAgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEucmVmZXJlbnRpYWxfY29uc3RyYWludHMgQVMgbWFwXG4gICAgICAgIC0tIGpvaW4gdW5pcXVlIGNvbnN0cmFpbnRzIChlLmcuIFBLcyBjb25zdHJhaW50cykgdG8gcmVmIGNvbHVtbnMgaW5mb1xuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5rZXlfY29sdW1uX3VzYWdlIEFTIHJlZlxuICAgICAgICBPTiAgcmVmLmNvbnN0cmFpbnRfY2F0YWxvZyA9IG1hcC51bmlxdWVfY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCByZWYuY29uc3RyYWludF9zY2hlbWEgPSBtYXAudW5pcXVlX2NvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCByZWYuY29uc3RyYWludF9uYW1lID0gbWFwLnVuaXF1ZV9jb25zdHJhaW50X25hbWVcbiAgICAgICAgLS0gb3B0aW9uYWw6IHRvIGluY2x1ZGUgcmVmZXJlbmNlIGNvbnN0cmFpbnQgdHlwZVxuICAgICAgICBMRUZUIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIEFTIHJlZmRcbiAgICAgICAgT04gIHJlZmQuY29uc3RyYWludF9jYXRhbG9nID0gcmVmLmNvbnN0cmFpbnRfY2F0YWxvZ1xuICAgICAgICBBTkQgcmVmZC5jb25zdHJhaW50X3NjaGVtYSA9IHJlZi5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgcmVmZC5jb25zdHJhaW50X25hbWUgPSByZWYuY29uc3RyYWludF9uYW1lXG4gICAgICAgIC0tIGpvaW4gZmsgY29sdW1ucyB0byB0aGUgY29ycmVjdCByZWYgY29sdW1ucyB1c2luZyBvcmRpbmFsIHBvc2l0aW9uc1xuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5rZXlfY29sdW1uX3VzYWdlIEFTIGZrXG4gICAgICAgIE9OICBmay5jb25zdHJhaW50X2NhdGFsb2cgPSBtYXAuY29uc3RyYWludF9jYXRhbG9nXG4gICAgICAgIEFORCBmay5jb25zdHJhaW50X3NjaGVtYSA9IG1hcC5jb25zdHJhaW50X3NjaGVtYVxuICAgICAgICBBTkQgZmsuY29uc3RyYWludF9uYW1lID0gbWFwLmNvbnN0cmFpbnRfbmFtZVxuICAgICAgICBBTkQgZmsucG9zaXRpb25faW5fdW5pcXVlX2NvbnN0cmFpbnQgPSByZWYub3JkaW5hbF9wb3NpdGlvbiAtLUlNUE9SVEFOVCFcbiAgICAgICAgLS0gYWRkIGxhYmVsc1xuICAgICAgICBKT0lOIHdiLnNjaGVtYXMgT04gc2NoZW1hcy5uYW1lPXJlZi50YWJsZV9zY2hlbWFcbiAgICAgICAgSk9JTiB3Yi50YWJsZXMgdGFibGVzX3JlZiBPTiAodGFibGVzX3JlZi5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZCBBTkQgdGFibGVzX3JlZi5uYW1lPXJlZi50YWJsZV9uYW1lKVxuICAgICAgICBKT0lOIHdiLmNvbHVtbnMgY29sdW1uc19yZWYgT04gKGNvbHVtbnNfcmVmLnRhYmxlX2lkPXRhYmxlc19yZWYuaWQgQU5EIGNvbHVtbnNfcmVmLm5hbWU9cmVmLmNvbHVtbl9uYW1lKVxuICAgICAgICBKT0lOIHdiLnRhYmxlcyB0YWJsZXNfZmsgT04gKHRhYmxlc19may5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZCBBTkQgdGFibGVzX2ZrLm5hbWU9ZmsudGFibGVfbmFtZSApXG4gICAgICAgIEpPSU4gd2IuY29sdW1ucyBjb2x1bW5zX2ZrIE9OIChjb2x1bW5zX2ZrLnRhYmxlX2lkPXRhYmxlc19may5pZCBBTkQgY29sdW1uc19may5uYW1lPWZrLmNvbHVtbl9uYW1lKVxuICAgICAgICBXSEVSRSByZWYudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgZmsudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRzOiBDb25zdHJhaW50SWRbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnQ6IENvbnN0cmFpbnRJZCA9IHtcbiAgICAgICAgY29uc3RyYWludE5hbWU6IHJvdy5ma19uYW1lLFxuICAgICAgICB0YWJsZU5hbWU6IHJvdy5ma190YWJsZSxcbiAgICAgICAgdGFibGVMYWJlbDogcm93LmZrX3RhYmxlX2xhYmVsLFxuICAgICAgICBjb2x1bW5OYW1lOiByb3cuZmtfY29sdW1uLFxuICAgICAgICBjb2x1bW5MYWJlbDogcm93LmZrX2NvbHVtbl9sYWJlbCxcbiAgICAgICAgcmVsVGFibGVOYW1lOiByb3cucmVmX3RhYmxlLFxuICAgICAgICByZWxUYWJsZUxhYmVsOiByb3cucmVmX3RhYmxlX2xhYmVsLFxuICAgICAgICByZWxDb2x1bW5OYW1lOiByb3cucmVmX2NvbHVtbixcbiAgICAgICAgcmVsQ29sdW1uTGFiZWw6IHJvdy5yZWZfY29sdW1uX2xhYmVsLFxuICAgICAgfTtcbiAgICAgIGNvbnN0cmFpbnRzLnB1c2goY29uc3RyYWludCk7XG4gICAgfVxuICAgIHJlc3VsdC5wYXlsb2FkID0gY29uc3RyYWludHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcmltYXJ5S2V5cyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1QgRElTVElOQ1QgYy5jb2x1bW5fbmFtZSwgdGMuY29uc3RyYWludF9uYW1lXG4gICAgICAgIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlX2NvbnN0cmFpbnRzIHRjIFxuICAgICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb25zdHJhaW50X2NvbHVtbl91c2FnZSBBUyBjY3VcbiAgICAgICAgVVNJTkcgKGNvbnN0cmFpbnRfc2NoZW1hLCBjb25zdHJhaW50X25hbWUpXG4gICAgICAgIEpPSU4gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgQVMgY1xuICAgICAgICBPTiBjLnRhYmxlX3NjaGVtYSA9IHRjLmNvbnN0cmFpbnRfc2NoZW1hXG4gICAgICAgIEFORCB0Yy50YWJsZV9uYW1lID0gYy50YWJsZV9uYW1lXG4gICAgICAgIEFORCBjY3UuY29sdW1uX25hbWUgPSBjLmNvbHVtbl9uYW1lXG4gICAgICAgIFdIRVJFIGNvbnN0cmFpbnRfdHlwZSA9ICdQUklNQVJZIEtFWSdcbiAgICAgICAgQU5EIGMudGFibGVfc2NoZW1hPScke3NjaGVtYU5hbWV9J1xuICAgICAgICBBTkQgdGMudGFibGVfbmFtZSA9ICcke3RhYmxlTmFtZX0nXG4gICAgICBgLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3Qgcm93IG9mIHJlc3VsdC5wYXlsb2FkLnJvd3MpIHtcbiAgICAgICAgcEtDb2xzQ29uc3RyYWludHNbcm93LmNvbHVtbl9uYW1lXSA9IHJvdy5jb25zdHJhaW50X25hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHBLQ29sc0NvbnN0cmFpbnRzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZUNvbnN0cmFpbnQoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbnN0cmFpbnROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdHJhaW50TmFtZSA9IERBTC5zYW5pdGl6ZShjb25zdHJhaW50TmFtZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgRFJPUCBDT05TVFJBSU5UIElGIEVYSVNUUyAke2NvbnN0cmFpbnROYW1lfVxuICAgICAgYCxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVByaW1hcnlLZXkoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBBTFRFUiBUQUJMRSAke3NjaGVtYU5hbWV9LiR7dGFibGVOYW1lfVxuICAgICAgICBBREQgUFJJTUFSWSBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KTtcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVGb3JlaWduS2V5KFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgcGFyZW50VGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcGFyZW50Q29sdW1uTmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGRhbC5jcmVhdGVGb3JlaWduS2V5KCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZXN9LCR7cGFyZW50VGFibGVOYW1lfSwke3BhcmVudENvbHVtbk5hbWVzfSlgXG4gICAgKTtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHNhbml0aXplZENvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgc2FuaXRpemVkQ29sdW1uTmFtZXMucHVzaChEQUwuc2FuaXRpemUoY29sdW1uTmFtZSkpO1xuICAgIH1cbiAgICBwYXJlbnRUYWJsZU5hbWUgPSBEQUwuc2FuaXRpemUocGFyZW50VGFibGVOYW1lKTtcbiAgICBjb25zdCBzYW5pdGl6ZWRQYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHBhcmVudENvbHVtbk5hbWUgb2YgcGFyZW50Q29sdW1uTmFtZXMpIHtcbiAgICAgIHNhbml0aXplZFBhcmVudENvbHVtbk5hbWVzLnB1c2goREFMLnNhbml0aXplKHBhcmVudENvbHVtbk5hbWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgQUxURVIgVEFCTEUgJHtzY2hlbWFOYW1lfS4ke3RhYmxlTmFtZX1cbiAgICAgICAgQUREIENPTlNUUkFJTlQgJHt0YWJsZU5hbWV9XyR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIl9cIil9X2ZrZXlcbiAgICAgICAgRk9SRUlHTiBLRVkgKCR7c2FuaXRpemVkQ29sdW1uTmFtZXMuam9pbihcIixcIil9KVxuICAgICAgICBSRUZFUkVOQ0VTICR7c2NoZW1hTmFtZX0uJHtwYXJlbnRUYWJsZU5hbWV9XG4gICAgICAgICAgKCR7c2FuaXRpemVkUGFyZW50Q29sdW1uTmFtZXMuam9pbihcIixcIil9KVxuICAgICAgICBPTiBERUxFVEUgU0VUIE5VTExcbiAgICAgIGAsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnRhYmxlcy4qLCB3Yi5zY2hlbWFzLm5hbWUgYXMgc2NoZW1hX25hbWVcbiAgICAgICAgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDEgQU5EIHdiLnRhYmxlcy5uYW1lPSQyIExJTUlUIDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRPckNyZWF0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZUxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGRhbC5hZGRPckNyZWF0ZVRhYmxlICR7c2NoZW1hTmFtZX0gJHt0YWJsZU5hbWV9ICR7dGFibGVMYWJlbH0gJHtjcmVhdGV9YFxuICAgICk7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgW3NjaGVtYU5hbWVdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgSU5TRVJUIElOVE8gd2IudGFibGVzKHNjaGVtYV9pZCwgbmFtZSwgbGFiZWwpXG4gICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMykgUkVUVVJOSU5HICpcbiAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3Jlc3VsdC5wYXlsb2FkWzBdLmlkLCB0YWJsZU5hbWUsIHRhYmxlTGFiZWxdLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChjcmVhdGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgQ1JFQVRFIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCIoKWAsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFxuICAgICAgcXVlcmllc0FuZFBhcmFtc1xuICAgICk7XG4gICAgaWYgKGNyZWF0ZSAmJiAhcmVzdWx0c1sxXS5zdWNjZXNzKSByZXR1cm4gcmVzdWx0c1sxXTtcbiAgICBpZiAocmVzdWx0c1swXS5zdWNjZXNzKSB7XG4gICAgICByZXN1bHRzWzBdLnBheWxvYWQgPSBUYWJsZS5wYXJzZVJlc3VsdChyZXN1bHRzWzBdLnBheWxvYWQpWzBdO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBkZWw6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKHVuZGVmaW5lZCwgW3NjaGVtYU5hbWVdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHF1ZXJpZXNBbmRQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW1zPiA9IFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBERUxFVEUgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICBXSEVSRSBzY2hlbWFfaWQ9JDEgQU5EIG5hbWU9JDJcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWRbMF0uaWQsIHRhYmxlTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiIENBU0NBREVgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGFibGUoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIG5ld1RhYmxlTmFtZT86IHN0cmluZyxcbiAgICBuZXdUYWJsZUxhYmVsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICBsZXQgcXVlcnkgPSBgXG4gICAgICBVUERBVEUgd2IudGFibGVzIFNFVFxuICAgIGA7XG4gICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKG5ld1RhYmxlTmFtZSkge1xuICAgICAgcGFyYW1zLnB1c2gobmV3VGFibGVOYW1lKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcIm5hbWU9JFwiICsgcGFyYW1zLmxlbmd0aCk7XG4gICAgfVxuICAgIGlmIChuZXdUYWJsZUxhYmVsKSB7XG4gICAgICBwYXJhbXMucHVzaChuZXdUYWJsZUxhYmVsKTtcbiAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgIH1cbiAgICBwYXJhbXMucHVzaChyZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgcXVlcnkgKz0gYFxuICAgICAgJHt1cGRhdGVzLmpvaW4oXCIsIFwiKX1cbiAgICAgIFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9XG4gICAgICBSRVRVUk5JTkcgKlxuICAgIGA7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogcXVlcnksXG4gICAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyxcbiAgICBdO1xuICAgIGlmIChuZXdUYWJsZU5hbWUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIFJFTkFNRSBUTyAke25ld1RhYmxlTmFtZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAobmV3VGFibGVOYW1lICYmICFyZXN1bHRzWzFdLnN1Y2Nlc3MpIHJldHVybiByZXN1bHRzWzFdO1xuICAgIGlmIChyZXN1bHRzWzBdLnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdHNbMF0ucGF5bG9hZCA9IFRhYmxlLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZClbMF07XG4gICAgICByZXN1bHRzWzBdLnBheWxvYWQuc2NoZW1hTmFtZSA9IHNjaGVtYU5hbWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzWzBdO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGFibGUgVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVVc2VycyhcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlcklkcz86IG51bWJlcltdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyW10pW10gPSBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXTtcbiAgICBsZXQgc3FsU2VsZWN0OiBzdHJpbmcgPSBcIlwiO1xuICAgIGxldCBzcWxXaGVyZSA9IFwiXCI7XG4gICAgaWYgKHVzZXJJZHMpIHtcbiAgICAgIHNxbFdoZXJlID0gXCJBTkQgd2IudGFibGVfdXNlcnMudXNlcl9pZD1BTlkoJDMpXCI7XG4gICAgICBwYXJhbXMucHVzaCh1c2VySWRzKTtcbiAgICB9XG4gICAgaWYgKHdpdGhTZXR0aW5ncykge1xuICAgICAgc3FsU2VsZWN0ID0gXCJ3Yi5vcmdhbml6YXRpb25fdXNlcnMuc2V0dGluZ3MsXCI7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICB3Yi50YWJsZV91c2Vycy50YWJsZV9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMudXNlcl9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMucm9sZV9pZCxcbiAgICAgICAgd2IudGFibGVfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLmNyZWF0ZWRfYXQsXG4gICAgICAgIHdiLnRhYmxlX3VzZXJzLnVwZGF0ZWRfYXQsXG4gICAgICAgICR7c3FsU2VsZWN0fVxuICAgICAgICB3Yi5zY2hlbWFzLm5hbWUgYXMgc2NoZW1hX25hbWUsXG4gICAgICAgIHdiLnRhYmxlcy5uYW1lIGFzIHRhYmxlX25hbWUsXG4gICAgICAgIHdiLnVzZXJzLmVtYWlsIGFzIHVzZXJfZW1haWwsXG4gICAgICAgIHdiLnVzZXJzLmZpcnN0X25hbWUgYXMgdXNlcl9maXJzdF9uYW1lLFxuICAgICAgICB3Yi51c2Vycy5sYXN0X25hbWUgYXMgdXNlcl9sYXN0X25hbWUsXG4gICAgICAgIHdiLnJvbGVzLm5hbWUgYXMgcm9sZV9uYW1lLFxuICAgICAgICBpbXBsaWVkX3JvbGVzLm5hbWUgYXMgcm9sZV9pbXBsaWVkX2Zyb21cbiAgICAgICAgRlJPTSB3Yi50YWJsZV91c2Vyc1xuICAgICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi50YWJsZV91c2Vycy50YWJsZV9pZD13Yi50YWJsZXMuaWRcbiAgICAgICAgSk9JTiB3Yi5zY2hlbWFzIE9OIHdiLnRhYmxlcy5zY2hlbWFfaWQ9d2Iuc2NoZW1hcy5pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnRhYmxlX3VzZXJzLnVzZXJfaWQ9d2IudXNlcnMuaWRcbiAgICAgICAgSk9JTiB3Yi5yb2xlcyBPTiB3Yi50YWJsZV91c2Vycy5yb2xlX2lkPXdiLnJvbGVzLmlkXG4gICAgICAgIExFRlQgSk9JTiB3Yi5yb2xlcyBpbXBsaWVkX3JvbGVzIE9OIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkPWltcGxpZWRfcm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2Iuc2NoZW1hcy5uYW1lPSQxIEFORCB3Yi50YWJsZXMubmFtZT0kMlxuICAgICAgICAke3NxbFdoZXJlfVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUYWJsZVVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbc2NoZW1hTmFtZSwgdGFibGVOYW1lXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICBvcmdhbml6YXRpb25JZDogbnVtYmVyLFxuICAgIHJvbGVNYXA/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCAvLyBlZyB7IHNjaGVtYV9vd25lcjogXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIgfVxuICAgIHNjaGVtYUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nSW1wbGllZEZyb21Sb2xlTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBkYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKCR7b3JnYW5pemF0aW9uSWR9LCA8cm9sZU1hcD4sICR7c2NoZW1hSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nSW1wbGllZEZyb21Sb2xlTmFtZX0pYFxuICAgICk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucm9sZXNJZExvb2t1cCgpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgbGV0IHdoZXJlU2NoZW1hc1NxbCA9IFwiXCI7XG4gICAgbGV0IHdoZXJlVXNlcnNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVNjaGVtYVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHNjaGVtYUlkcyAmJiBzY2hlbWFJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVTY2hlbWFzU3FsID0gYEFORCB3Yi5zY2hlbWFzLmlkIElOICgke3NjaGVtYUlkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgaWYgKHVzZXJJZHMgJiYgdXNlcklkcy5sZW5ndGggPiAwKSB7XG4gICAgICB3aGVyZVNjaGVtYVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2Iuc2NoZW1hX3VzZXJzLnVzZXJfaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pXG4gICAgICBgO1xuICAgICAgd2hlcmVVc2Vyc1NxbCA9IGBBTkQgd2IudXNlcnMuaWQgSU4gKCR7dXNlcklkcy5qb2luKFwiLFwiKX0pYDtcbiAgICB9XG4gICAgY29uc3Qgcm9sZXNJZExvb2t1cCA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBRdWVyeVBhcmFtc1tdID0gW107XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgaWYgKGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lKSB7XG4gICAgICBjb25zdCBpbXBsaWVkRnJvbVJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUoXG4gICAgICAgIGNsZWFyRXhpc3RpbmdJbXBsaWVkRnJvbVJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFpbXBsaWVkRnJvbVJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGltcGxpZWRGcm9tUm9sZVJlc3VsdDtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIFdIRVJFXG4gICAgICAgICAgICB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkIElOIChcbiAgICAgICAgICAgICAgU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICAgICAgICBXSEVSRSB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlU2NoZW1hc1NxbH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIEFORCB3Yi5zY2hlbWFfdXNlcnMuaW1wbGllZF9mcm9tX3JvbGVfaWQ9JHtpbXBsaWVkRnJvbVJvbGVSZXN1bHQucGF5bG9hZC5pZH1cbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFVc2Vyc1NxbH1cbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbb3JnYW5pemF0aW9uSWRdLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVwZGF0ZSBpbXBsaWVkIHJvbGVzIG9ubHksIGxlYXZlIGV4cGxpY2l0IHJvbGVzIGFsb25lXG4gICAgICBvbkNvbmZsaWN0U3FsID0gYFxuICAgICAgICBPTiBDT05GTElDVCAoc2NoZW1hX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnNjaGVtYV91c2Vycy5pbXBsaWVkX2Zyb21fcm9sZV9pZCBJUyBOT1QgTlVMTFxuICAgICAgYDtcbiAgICB9XG4gICAgaWYgKHJvbGVNYXApIHtcbiAgICAgIGZvciAoY29uc3Qgb3JnYW5pemF0aW9uUm9sZSBvZiBPYmplY3Qua2V5cyhyb2xlTWFwKSkge1xuICAgICAgICBxdWVyeVBhcmFtcy5wdXNoKHtcbiAgICAgICAgICBxdWVyeTogYFxuICAgICAgICAgICAgSU5TRVJUIElOVE8gd2Iuc2NoZW1hX3VzZXJzKHNjaGVtYV9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgaW1wbGllZF9mcm9tX3JvbGVfaWQsIHVwZGF0ZWRfYXQpXG4gICAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICAgIHdiLnNjaGVtYXMuaWQsXG4gICAgICAgICAgICB1c2VyX2lkLFxuICAgICAgICAgICAgJHtyb2xlc0lkTG9va3VwW3JvbGVNYXBbb3JnYW5pemF0aW9uUm9sZV1dfSxcbiAgICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtvcmdhbml6YXRpb25Sb2xlXX0sXG4gICAgICAgICAgICAkMVxuICAgICAgICAgICAgRlJPTSB3Yi5vcmdhbml6YXRpb25fdXNlcnNcbiAgICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFzLm9yZ2FuaXphdGlvbl9vd25lcl9pZD13Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkXG4gICAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLm9yZ2FuaXphdGlvbl91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgICBXSEVSRSB3Yi5vcmdhbml6YXRpb25fdXNlcnMub3JnYW5pemF0aW9uX2lkPSQyXG4gICAgICAgICAgICBBTkQgd2Iub3JnYW5pemF0aW9uX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAgICR7d2hlcmVTY2hlbWFzU3FsfVxuICAgICAgICAgICAgJHt3aGVyZVVzZXJzU3FsfVxuICAgICAgICAgICAgJHtvbkNvbmZsaWN0U3FsfVxuICAgICAgICAgIGAsXG4gICAgICAgICAgcGFyYW1zOiBbZGF0ZSwgb3JnYW5pemF0aW9uSWQsIHJvbGVzSWRMb29rdXBbb3JnYW5pemF0aW9uUm9sZV1dLFxuICAgICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvLyBpZiAhdGFibGVJZHMgYWxsIHRhYmxlcyBmb3Igc2NoZW1hXG4gIC8vIGlmICF1c2VySWRzIGFsbCBzY2hlbWFfdXNlcnNcbiAgcHVibGljIGFzeW5jIHNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgIHNjaGVtYUlkOiBudW1iZXIsXG4gICAgcm9sZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICB0YWJsZUlkcz86IG51bWJlcltdLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICBjbGVhckV4aXN0aW5nPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBkYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoJHtzY2hlbWFJZH0sICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHJvbGVNYXBcbiAgICAgICl9LCAke3RhYmxlSWRzfSwgJHt1c2VySWRzfSwgJHtjbGVhckV4aXN0aW5nfSlgXG4gICAgKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5yb2xlc0lkTG9va3VwKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBsZXQgd2hlcmVUYWJsZXNTcWwgPSBcIlwiO1xuICAgIGxldCB3aGVyZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgd2hlcmVUYWJsZVVzZXJzU3FsID0gXCJcIjtcbiAgICBsZXQgb25Db25mbGljdFNxbCA9IFwiXCI7XG4gICAgaWYgKHRhYmxlSWRzICYmIHRhYmxlSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdoZXJlVGFibGVzU3FsID0gYEFORCB3Yi50YWJsZXMuaWQgSU4gKCR7dGFibGVJZHMuam9pbihcIixcIil9KWA7XG4gICAgfVxuICAgIGlmICh1c2VySWRzICYmIHVzZXJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgd2hlcmVUYWJsZVVzZXJzU3FsID0gYFxuICAgICAgICBBTkQgd2IudGFibGVfdXNlcnMudXNlcl9pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlcbiAgICAgIGA7XG4gICAgICB3aGVyZVVzZXJzU3FsID0gYEFORCB3Yi51c2Vycy5pZCBJTiAoJHt1c2VySWRzLmpvaW4oXCIsXCIpfSlgO1xuICAgIH1cbiAgICBjb25zdCByb2xlc0lkTG9va3VwID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgY29uc3QgcXVlcnlQYXJhbXM6IFF1ZXJ5UGFyYW1zW10gPSBbXTtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBpZiAoY2xlYXJFeGlzdGluZykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgREVMRVRFIEZST00gd2IudGFibGVfdXNlcnNcbiAgICAgICAgICBXSEVSRVxuICAgICAgICAgICAgd2IudGFibGVfdXNlcnMudGFibGVfaWQgSU4gKFxuICAgICAgICAgICAgICBTRUxFQ1QgaWQgRlJPTSB3Yi50YWJsZXNcbiAgICAgICAgICAgICAgV0hFUkUgd2IudGFibGVzLnNjaGVtYV9pZD0kMVxuICAgICAgICAgICAgICAke3doZXJlVGFibGVzU3FsfVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgJHt3aGVyZVRhYmxlVXNlcnNTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW3NjaGVtYUlkXSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVcGRhdGUgaW1wbGllZCByb2xlcyBvbmx5LCBsZWF2ZSBleHBsaWNpdCByb2xlcyBhbG9uZVxuICAgICAgb25Db25mbGljdFNxbCA9IGBcbiAgICAgICAgT04gQ09ORkxJQ1QgKHRhYmxlX2lkLCB1c2VyX2lkKVxuICAgICAgICBETyBVUERBVEUgU0VUIHJvbGVfaWQ9RVhDTFVERUQucm9sZV9pZCwgdXBkYXRlZF9hdD1FWENMVURFRC51cGRhdGVkX2F0XG4gICAgICAgIFdIRVJFIHdiLnRhYmxlX3VzZXJzLmltcGxpZWRfZnJvbV9yb2xlX2lkIElTIE5PVCBOVUxMXG4gICAgICBgO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHNjaGVtYVJvbGUgb2YgT2JqZWN0LmtleXMocm9sZU1hcCkpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLnRhYmxlX3VzZXJzKHRhYmxlX2lkLCB1c2VyX2lkLCByb2xlX2lkLCBpbXBsaWVkX2Zyb21fcm9sZV9pZCwgdXBkYXRlZF9hdClcbiAgICAgICAgICBTRUxFQ1RcbiAgICAgICAgICB3Yi50YWJsZXMuaWQsXG4gICAgICAgICAgdXNlcl9pZCxcbiAgICAgICAgICAke3JvbGVzSWRMb29rdXBbcm9sZU1hcFtzY2hlbWFSb2xlXV19LFxuICAgICAgICAgICR7cm9sZXNJZExvb2t1cFtzY2hlbWFSb2xlXX0sXG4gICAgICAgICAgJDFcbiAgICAgICAgICBGUk9NIHdiLnNjaGVtYV91c2Vyc1xuICAgICAgICAgIEpPSU4gd2Iuc2NoZW1hcyBPTiB3Yi5zY2hlbWFfdXNlcnMuc2NoZW1hX2lkPXdiLnNjaGVtYXMuaWRcbiAgICAgICAgICBKT0lOIHdiLnRhYmxlcyBPTiB3Yi5zY2hlbWFzLmlkPXdiLnRhYmxlcy5zY2hlbWFfaWRcbiAgICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgICAgV0hFUkUgd2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZD0kMiBBTkQgd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9JDNcbiAgICAgICAgICAke3doZXJlVGFibGVzU3FsfVxuICAgICAgICAgICR7d2hlcmVVc2Vyc1NxbH1cbiAgICAgICAgICAke29uQ29uZmxpY3RTcWx9XG4gICAgICAgIGAsXG4gICAgICAgIHBhcmFtczogW2RhdGUsIHNjaGVtYUlkLCByb2xlc0lkTG9va3VwW3NjaGVtYVJvbGVdXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhxdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVBbGxUYWJsZVVzZXJzKFxuICAgIHRhYmxlSWQ/OiBudW1iZXIsXG4gICAgc2NoZW1hSWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5V2hlcmUgPSBcIlwiO1xuICAgIGNvbnN0IHBhcmFtczogbnVtYmVyW10gPSBbXTtcbiAgICBpZiAodGFibGVJZCkge1xuICAgICAgcXVlcnlXaGVyZSA9IFwiV0hFUkUgdGFibGVfaWQ9JDFcIjtcbiAgICAgIHBhcmFtcy5wdXNoKHRhYmxlSWQpO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hSWQpIHtcbiAgICAgIHF1ZXJ5V2hlcmUgPSBgXG4gICAgICAgIFdIRVJFIHRhYmxlX2lkIElOIChcbiAgICAgICAgICBTRUxFQ1QgaWQgZnJvbSB3Yi50YWJsZXNcbiAgICAgICAgICBXSEVSRSB3Yi50YWJsZXMuc2NoZW1hX2lkPSQxXG4gICAgICAgIClcbiAgICAgIGA7XG4gICAgICBwYXJhbXMucHVzaChzY2hlbWFJZCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgXG4gICAgICAgIERFTEVURSBGUk9NIHdiLnRhYmxlX3VzZXJzXG4gICAgICAgICR7cXVlcnlXaGVyZX1cbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICB0YWJsZUlkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgc2V0dGluZ3M6IG9iamVjdFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBVUERBVEUgd2IudGFibGVfdXNlcnNcbiAgICAgICAgU0VUIHNldHRpbmdzPSQxLCB1cGRhdGVkX2F0PSQyXG4gICAgICAgIFdIRVJFIHRhYmxlX2lkPSQzXG4gICAgICAgIEFORCB1c2VyX2lkPSQ0XG4gICAgICBgLFxuICAgICAgcGFyYW1zOiBbc2V0dGluZ3MsIG5ldyBEYXRlKCksIHRhYmxlSWQsIHVzZXJJZF0sXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IENvbHVtbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY29sdW1uQnlTY2hlbWFOYW1lVGFibGVOYW1lQ29sdW1uTmFtZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUpO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX0NPTFVNTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb2x1bW5zKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeTogc3RyaW5nID0gYFxuICAgICAgU0VMRUNUIHdiLmNvbHVtbnMuKixcbiAgICAgIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmRhdGFfdHlwZSBhcyB0eXBlLFxuICAgICAgaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMuY29sdW1uX2RlZmF1bHQgYXMgZGVmYXVsdCxcbiAgICAgIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmlzX251bGxhYmxlIGFzIGlzX251bGxhYmxlXG4gICAgICBGUk9NIHdiLmNvbHVtbnNcbiAgICAgIEpPSU4gd2IudGFibGVzIE9OIHdiLmNvbHVtbnMudGFibGVfaWQ9d2IudGFibGVzLmlkXG4gICAgICBKT0lOIHdiLnNjaGVtYXMgT04gd2IudGFibGVzLnNjaGVtYV9pZD13Yi5zY2hlbWFzLmlkXG4gICAgICBKT0lOIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIE9OIChcbiAgICAgICAgd2IuY29sdW1ucy5uYW1lPWluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zLmNvbHVtbl9uYW1lXG4gICAgICAgIEFORCB3Yi5zY2hlbWFzLm5hbWU9aW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMudGFibGVfc2NoZW1hXG4gICAgICApXG4gICAgICBXSEVSRSB3Yi5zY2hlbWFzLm5hbWU9JDEgQU5EIHdiLnRhYmxlcy5uYW1lPSQyIEFORCBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy50YWJsZV9uYW1lPSQyXG4gICAgYDtcbiAgICBsZXQgcGFyYW1zOiBzdHJpbmdbXSA9IFtzY2hlbWFOYW1lLCB0YWJsZU5hbWVdO1xuICAgIGlmIChjb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyeSA9IGAke3F1ZXJ5fSBBTkQgd2IuY29sdW1ucy5uYW1lPSQzIEFORCBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucy5jb2x1bW5fbmFtZT0kM2A7XG4gICAgICBwYXJhbXMucHVzaChjb2x1bW5OYW1lKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IENvbHVtbi5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaXNjb3ZlckNvbHVtbnMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIGNvbHVtbl9uYW1lIGFzIG5hbWUsIGRhdGFfdHlwZSBhcyB0eXBlXG4gICAgICBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zXG4gICAgICBXSEVSRSB0YWJsZV9zY2hlbWE9JDFcbiAgICAgIEFORCB0YWJsZV9uYW1lPSQyXG4gICAgYDtcbiAgICBsZXQgcGFyYW1zID0gW3NjaGVtYU5hbWUsIHRhYmxlTmFtZV07XG4gICAgaWYgKGNvbHVtbk5hbWUpIHtcbiAgICAgIHF1ZXJ5ICs9IFwiIEFORCBjb2x1bW5fbmFtZT0kM1wiO1xuICAgICAgcGFyYW1zLnB1c2goY29sdW1uTmFtZSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBDb2x1bW4ucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5MYWJlbDogc3RyaW5nLFxuICAgIGNyZWF0ZTogYm9vbGVhbixcbiAgICBjb2x1bW5QR1R5cGU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgZGFsLmFkZE9yQ3JlYXRlQ29sdW1uICR7c2NoZW1hTmFtZX0gJHt0YWJsZU5hbWV9ICR7Y29sdW1uTmFtZX0gJHtjb2x1bW5MYWJlbH0gJHtjb2x1bW5QR1R5cGV9ICR7Y3JlYXRlfWBcbiAgICApO1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIElOU0VSVCBJTlRPIHdiLmNvbHVtbnModGFibGVfaWQsIG5hbWUsIGxhYmVsKVxuICAgICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMylcbiAgICAgICAgYCxcbiAgICAgICAgcGFyYW1zOiBbcmVzdWx0LnBheWxvYWQuaWQsIGNvbHVtbk5hbWUsIGNvbHVtbkxhYmVsXSxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMsXG4gICAgXTtcbiAgICBpZiAoY3JlYXRlKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBBREQgJHtjb2x1bW5OYW1lfSAke2NvbHVtblBHVHlwZX1cbiAgICAgICAgYCxcbiAgICAgIH0gYXMgUXVlcnlQYXJhbXMpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoXG4gICAgICBxdWVyaWVzQW5kUGFyYW1zXG4gICAgKTtcbiAgICBpZiAoY3JlYXRlICYmIHJlc3VsdHNbMV0gJiYgIXJlc3VsdHNbMV0uc3VjY2VzcykgcmV0dXJuIHJlc3VsdHNbMV07XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV3Q29sdW1uTmFtZT86IHN0cmluZyxcbiAgICBuZXdDb2x1bW5MYWJlbD86IHN0cmluZyxcbiAgICBuZXdUeXBlPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBjb25zdCBxdWVyaWVzQW5kUGFyYW1zOiBBcnJheTxRdWVyeVBhcmFtcz4gPSBbXTtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSB8fCBuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1uQnlTY2hlbWFOYW1lVGFibGVOYW1lQ29sdW1uTmFtZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGxldCBwYXJhbXMgPSBbXTtcbiAgICAgIGxldCBxdWVyeSA9IGBcbiAgICAgICAgVVBEQVRFIHdiLmNvbHVtbnMgU0VUXG4gICAgICBgO1xuICAgICAgbGV0IHVwZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5OYW1lKTtcbiAgICAgICAgdXBkYXRlcy5wdXNoKFwibmFtZT0kXCIgKyBwYXJhbXMubGVuZ3RoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdDb2x1bW5MYWJlbCkge1xuICAgICAgICBwYXJhbXMucHVzaChuZXdDb2x1bW5MYWJlbCk7XG4gICAgICAgIHVwZGF0ZXMucHVzaChcImxhYmVsPSRcIiArIHBhcmFtcy5sZW5ndGgpO1xuICAgICAgfVxuICAgICAgcGFyYW1zLnB1c2gocmVzdWx0LnBheWxvYWQuaWQpO1xuICAgICAgcXVlcnkgKz0gYCR7dXBkYXRlcy5qb2luKFwiLCBcIil9IFdIRVJFIGlkPSQke3BhcmFtcy5sZW5ndGh9YDtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zKTtcbiAgICB9XG4gICAgaWYgKG5ld1R5cGUpIHtcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXMucHVzaCh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgQUxURVIgVEFCTEUgXCIke3NjaGVtYU5hbWV9XCIuXCIke3RhYmxlTmFtZX1cIlxuICAgICAgICAgIEFMVEVSIENPTFVNTiAke2NvbHVtbk5hbWV9IFRZUEUgJHtuZXdUeXBlfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGlmIChuZXdDb2x1bW5OYW1lKSB7XG4gICAgICBxdWVyaWVzQW5kUGFyYW1zLnB1c2goe1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIEFMVEVSIFRBQkxFIFwiJHtzY2hlbWFOYW1lfVwiLlwiJHt0YWJsZU5hbWV9XCJcbiAgICAgICAgICBSRU5BTUUgQ09MVU1OICR7Y29sdW1uTmFtZX0gVE8gJHtuZXdDb2x1bW5OYW1lfVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkU2VxdWVuY2VUb0NvbHVtbihcbiAgICBzY2hlbWE6IFNjaGVtYSxcbiAgICB0YWJsZTogVGFibGUsXG4gICAgY29sdW1uOiBDb2x1bW4sXG4gICAgbmV4dFNlcU51bWJlcj86IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAoIW5leHRTZXFOdW1iZXIpIHtcbiAgICAgIGNvbnN0IG5leHRTZXFOdW1iZXJSZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICAgIHF1ZXJ5OiBgXG4gICAgICAgICAgU0VMRUNUICR7Y29sdW1uLm5hbWV9IGFzIG1heF92YWxcbiAgICAgICAgICBGUk9NICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX1cbiAgICAgICAgICBPUkRFUiBCWSAke2NvbHVtbi5uYW1lfSBERVNDXG4gICAgICAgICAgTElNSVQgMVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgICBpZiAoXG4gICAgICAgIG5leHRTZXFOdW1iZXJSZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgICBuZXh0U2VxTnVtYmVyUmVzdWx0LnBheWxvYWQucm93cy5sZW5ndGggPT0gMVxuICAgICAgKSB7XG4gICAgICAgIG5leHRTZXFOdW1iZXIgPVxuICAgICAgICAgIHBhcnNlSW50KG5leHRTZXFOdW1iZXJSZXN1bHQucGF5bG9hZC5yb3dzWzBdLm1heF92YWwpICsgMTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFuZXh0U2VxTnVtYmVyIHx8IG5leHRTZXFOdW1iZXIgPCAxKSBuZXh0U2VxTnVtYmVyID0gMTtcbiAgICBjb25zdCBzZXF1ZW5jTmFtZSA9IGB3YnNlcV9zJHtzY2hlbWEuaWR9X3Qke3RhYmxlLmlkfV9jJHtjb2x1bW4uaWR9YDtcbiAgICBsb2cud2FybihcIm5leHRTZXFOdW1iZXJcIiArIG5leHRTZXFOdW1iZXIpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYENSRUFURSBTRVFVRU5DRSAke3NjaGVtYS5uYW1lfS4ke3NlcXVlbmNOYW1lfWAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYEFMVEVSIFRBQkxFICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX0gQUxURVIgQ09MVU1OICR7Y29sdW1uLm5hbWV9IFNFVCBERUZBVUxUIG5leHR2YWwoJyR7c2NoZW1hLm5hbWV9LlwiJHtzZXF1ZW5jTmFtZX1cIicpYCxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgQUxURVIgU0VRVUVOQ0UgJHtzY2hlbWEubmFtZX0uJHtzZXF1ZW5jTmFtZX0gT1dORUQgQlkgJHtzY2hlbWEubmFtZX0uJHt0YWJsZS5uYW1lfS4ke2NvbHVtbi5uYW1lfWAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYFNFTEVDVCBzZXR2YWwoJyR7c2NoZW1hLm5hbWV9LlwiJHtzZXF1ZW5jTmFtZX1cIicsICR7XG4gICAgICAgICAgbmV4dFNlcU51bWJlciAtIDFcbiAgICAgICAgfSlgLFxuICAgICAgfSxcbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVTZXF1ZW5jZUZyb21Db2x1bW4oXG4gICAgc2NoZW1hOiBTY2hlbWEsXG4gICAgdGFibGU6IFRhYmxlLFxuICAgIGNvbHVtbjogQ29sdW1uXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmICghY29sdW1uLmRlZmF1bHQpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfTk9fREVGQVVMVF9PTl9DT0xVTU5cIixcbiAgICAgICAgdmFsdWVzOiBbc2NoZW1hLm5hbWUsIHRhYmxlLm5hbWUsIGNvbHVtbi5uYW1lXSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBlZyBjb2x1bW4uZGVmYXVsdD1cIm5leHR2YWwoJ3Rlc3RfdGhlX2RhaXN5X2Jsb2cud2JzZXFfczMwODI2X3Q0MTIwOV9jNTM2MDAnOjpyZWdjbGFzcylcIlxuICAgIGNvbnN0IHNlcXVlbmNOYW1lU3BsaXRBID0gY29sdW1uLmRlZmF1bHQuc3BsaXQoXCJ3YnNlcV9cIik7XG4gICAgY29uc3Qgc2VxdWVuY05hbWVTcGxpdEIgPSBzZXF1ZW5jTmFtZVNwbGl0QVsxXS5zcGxpdChcIjo6XCIpO1xuICAgIGNvbnN0IHNlcXVlbmNOYW1lID0gYHdic2VxXyR7c2VxdWVuY05hbWVTcGxpdEJbMF0uc2xpY2UoMCwgLTEpfWA7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYEFMVEVSIFRBQkxFICR7c2NoZW1hLm5hbWV9LiR7dGFibGUubmFtZX0gQUxURVIgQ09MVU1OICR7Y29sdW1uLm5hbWV9IERST1AgREVGQVVMVGAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERST1AgU0VRVUVOQ0UgSUYgRVhJU1RTICR7c2NoZW1hLm5hbWV9LiR7c2VxdWVuY05hbWV9YCxcbiAgICAgIH0sXG4gICAgXSk7XG4gICAgcmV0dXJuIHJlc3VsdHNbMF07IC8vIHF1ZXJ5IDIgd2lsbCBhbHdheXMgc3VjY2VlZFxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgZGVsOiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIHNjaGVtYU5hbWUgPSBEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSk7XG4gICAgdGFibGVOYW1lID0gREFMLnNhbml0aXplKHRhYmxlTmFtZSk7XG4gICAgY29sdW1uTmFtZSA9IERBTC5zYW5pdGl6ZShjb2x1bW5OYW1lKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcXVlcmllc0FuZFBhcmFtczogQXJyYXk8UXVlcnlQYXJhbXM+ID0gW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYFxuICAgICAgICAgIERFTEVURSBGUk9NIHdiLmNvbHVtbnNcbiAgICAgICAgICBXSEVSRSB0YWJsZV9pZD0kMSBBTkQgbmFtZT0kMlxuICAgICAgICBgLFxuICAgICAgICBwYXJhbXM6IFtyZXN1bHQucGF5bG9hZC5pZCwgY29sdW1uTmFtZV0sXG4gICAgICB9IGFzIFF1ZXJ5UGFyYW1zLFxuICAgIF07XG4gICAgaWYgKGRlbCkge1xuICAgICAgcXVlcmllc0FuZFBhcmFtcy5wdXNoKHtcbiAgICAgICAgcXVlcnk6IGBcbiAgICAgICAgICBBTFRFUiBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiXG4gICAgICAgICAgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uTmFtZX0gQ0FTQ0FERVxuICAgICAgICBgLFxuICAgICAgfSBhcyBRdWVyeVBhcmFtcyk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhcbiAgICAgIHF1ZXJpZXNBbmRQYXJhbXNcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIENvbHVtbiB7XG4gIHN0YXRpYyBDT01NT05fVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgVGV4dDogXCJ0ZXh0XCIsXG4gICAgTnVtYmVyOiBcImludGVnZXJcIixcbiAgICBEZWNpbWFsOiBcImRlY2ltYWxcIixcbiAgICBCb29sZWFuOiBcImJvb2xlYW5cIixcbiAgICBEYXRlOiBcImRhdGVcIixcbiAgICBcIkRhdGUgJiBUaW1lXCI6IFwidGltZXN0YW1wXCIsXG4gIH07XG5cbiAgaWQhOiBudW1iZXI7XG4gIHRhYmxlSWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICAvLyBwZyBkYXRhXG4gIHR5cGUhOiBzdHJpbmc7XG4gIGRlZmF1bHQ/OiBzdHJpbmc7XG4gIGlzTnVsbGFibGU/OiBib29sZWFuO1xuICAvLyBub3QgcGVyc2lzdGVkXG4gIGlzUHJpbWFyeUtleSE6IGJvb2xlYW47XG4gIGZvcmVpZ25LZXlzITogW0NvbnN0cmFpbnRJZF07XG4gIHJlZmVyZW5jZWRCeSE6IFtDb25zdHJhaW50SWRdO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Q29sdW1uPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJDb2x1bW4ucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgY29sdW1ucyA9IEFycmF5PENvbHVtbj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIGNvbHVtbnMucHVzaChDb2x1bW4ucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvbHVtbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBDb2x1bW4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiQ29sdW1uLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IGNvbHVtbiA9IG5ldyBDb2x1bW4oKTtcbiAgICBjb2x1bW4uaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICBjb2x1bW4udGFibGVJZCA9IHBhcnNlSW50KGRhdGEudGFibGVfaWQpO1xuICAgIGNvbHVtbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIGNvbHVtbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgY29sdW1uLnR5cGUgPSBkYXRhLnR5cGU7XG4gICAgY29sdW1uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBjb2x1bW4udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLmRlZmF1bHQpIGNvbHVtbi5kZWZhdWx0ID0gZGF0YS5kZWZhdWx0O1xuICAgIGlmIChkYXRhLmlzX251bGxhYmxlKSBjb2x1bW4uaXNOdWxsYWJsZSA9IGRhdGEuaXNfbnVsbGFibGUgIT0gXCJOT1wiO1xuICAgIHJldHVybiBjb2x1bW47XG4gIH1cbn1cbiIsImltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLlwiO1xuaW1wb3J0IHsgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgZXJyUmVzdWx0LCBsb2csIFdoaXRlYnJpY2tDbG91ZCB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5pbXBvcnQgeyBSb2xlTGV2ZWwsIFVzZXJBY3Rpb25QZXJtaXNzaW9uIH0gZnJvbSBcIi4vUm9sZVwiO1xuaW1wb3J0IHsgREVGQVVMVF9QT0xJQ1kgfSBmcm9tIFwiLi4vcG9saWN5XCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuLi9lbnZpcm9ubWVudFwiO1xuXG5leHBvcnQgY2xhc3MgQ3VycmVudFVzZXIge1xuICB3YkNsb3VkITogV2hpdGVicmlja0Nsb3VkO1xuICB1c2VyITogVXNlcjtcbiAgaWQhOiBudW1iZXI7XG4gIGFjdGlvbkhpc3Rvcnk6IFVzZXJBY3Rpb25QZXJtaXNzaW9uW10gPSBbXTtcblxuICAvLyB7IHJvbGVMZXZlbDogeyBvYmplY3RJZDogeyB1c2VyQWN0aW9uOiB7IGNoZWNrZWRGb3JSb2xlTmFtZTogc3RyaW5nLCBwZXJtaXR0ZWQ6IHRydWUvZmFsc2V9IH0gfSB9XG4gIG9iamVjdFBlcm1pc3Npb25zTG9va3VwOiBSZWNvcmQ8XG4gICAgUm9sZUxldmVsLFxuICAgIFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+PlxuICA+ID0ge1xuICAgIG9yZ2FuaXphdGlvbjoge30sXG4gICAgc2NoZW1hOiB7fSxcbiAgICB0YWJsZToge30sXG4gIH07XG5cbiAgY29uc3RydWN0b3IodXNlcjogVXNlciwgd2JDbG91ZD86IFdoaXRlYnJpY2tDbG91ZCkge1xuICAgIGlmICh3YkNsb3VkKSB0aGlzLndiQ2xvdWQgPSB3YkNsb3VkO1xuICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgdGhpcy5pZCA9IHVzZXIuaWQ7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluKCkge1xuICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoVXNlci5nZXRTeXNBZG1pblVzZXIoKSk7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpYygpIHtcbiAgICByZXR1cm4gbmV3IEN1cnJlbnRVc2VyKFVzZXIuZ2V0UHVibGljVXNlcigpKTtcbiAgfVxuXG4gIHB1YmxpYyBpc1NpZ25lZEluKCkge1xuICAgIHJldHVybiB0aGlzLnVzZXIuaWQgIT09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzbnRTaWduZWRJbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09IFVzZXIuUFVCTElDX0lEO1xuICB9XG5cbiAgcHVibGljIGlzU2lnbmVkT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmlzbnRTaWduZWRJbigpO1xuICB9XG5cbiAgcHVibGljIGlzUHVibGljKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1NpZ25lZEluKCk7XG4gIH1cblxuICBwdWJsaWMgaXNTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gdGhpcy51c2VyLmlkID09PSBVc2VyLlNZU19BRE1JTl9JRDtcbiAgfVxuXG4gIHB1YmxpYyBpc250U3lzQWRtaW4oKSB7XG4gICAgcmV0dXJuICF0aGlzLmlzU3lzQWRtaW47XG4gIH1cblxuICBwdWJsaWMgaXNUZXN0VXNlcigpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy51c2VyLmVtYWlsICYmXG4gICAgICB0aGlzLnVzZXIuZW1haWwudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChlbnZpcm9ubWVudC50ZXN0VXNlckVtYWlsRG9tYWluKVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgaXNudFRlc3RVc2VyKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1Rlc3RVc2VyO1xuICB9XG5cbiAgcHVibGljIGlkSXMob3RoZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMudXNlci5pZCA9PSBvdGhlcklkO1xuICB9XG5cbiAgcHVibGljIGlkSXNudChvdGhlcklkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gIXRoaXMuaWRJcyhvdGhlcklkKTtcbiAgfVxuXG4gIHB1YmxpYyBkZW5pZWQoKSB7XG4gICAgbGV0IG1lc3NhZ2UgPSBcIklOVEVSTkFMIEVSUk9SOiBMYXN0IFVzZXJBY3Rpb25QZXJtaXNzaW9uIG5vdCByZWNvcmRlZC4gXCI7XG4gICAgbGV0IHZhbHVlczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBsYXN0VUFQID0gdGhpcy5hY3Rpb25IaXN0b3J5LnBvcCgpO1xuICAgIGlmIChsYXN0VUFQKSB7XG4gICAgICBtZXNzYWdlID0gYFlvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvICR7bGFzdFVBUC5kZXNjcmlwdGlvbn0uYDtcbiAgICAgIGxldCB1c2VyU3RyID0gYHVzZXJJZD0ke3RoaXMuaWR9YDtcbiAgICAgIGlmICh0aGlzLnVzZXIgJiYgdGhpcy51c2VyLmVtYWlsKSB7XG4gICAgICAgIHVzZXJTdHIgPSBgdXNlckVtYWlsPSR7dGhpcy51c2VyLmVtYWlsfSwgJHt1c2VyU3RyfWA7XG4gICAgICB9XG4gICAgICB2YWx1ZXMgPSBbXG4gICAgICAgIHVzZXJTdHIsXG4gICAgICAgIGBvYmplY3RJZD0ke2xhc3RVQVAub2JqZWN0SWR9YCxcbiAgICAgICAgYHVzZXJBY3Rpb249JHtsYXN0VUFQLnVzZXJBY3Rpb259YCxcbiAgICAgICAgYGNoZWNrZWRGb3JSb2xlTmFtZT0ke2xhc3RVQVAuY2hlY2tlZEZvclJvbGVOYW1lfWAsXG4gICAgICAgIGBjaGVja2VkQXQ9JHtsYXN0VUFQLmNoZWNrZWRBdH1gLFxuICAgICAgXTtcbiAgICB9XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgICB2YWx1ZXM6IHZhbHVlcyxcbiAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBtdXN0QmVTaWduZWRJbigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJZb3UgbXVzdCBiZSBzaWduZWQtaW4gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbi5cIixcbiAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBtdXN0QmVTeXNBZG1pbigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJZb3UgbXVzdCBiZSBhIFN5c3RlbSBBZG1pbmlzdHJhdG9yIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU3lzQWRtaW5PclRlc3RVc2VyKCkge1xuICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIllvdSBtdXN0IGJlIGEgU3lzdGVtIEFkbWluaXN0cmF0b3Igb3IgVGVzdCBVc2VyIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU2VsZigpIHtcbiAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogXCJUaGlzIGFjdGlvbiBjYW4gb25seSBiZSBwZXJmb3JtZWQgb24geW91cnNlbGYgYXMgdGhlIHVzZXIuXCIsXG4gICAgICB3YkNvZGU6IFwiV0JfRk9SQklEREVOXCIsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbXVzdEJlU3lzQWRtaW5PclNlbGYoKSB7XG4gICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiWW91IG11c3QgYmUgYSBTeXN0ZW0gQWRtaW5pc3RyYXRvciBvciB5b3Vyc2VsZiBhcyB0aGUgdXNlciB0byBwZXJmb3JtIHRoaXMgYWN0aW9uLlwiLFxuICAgICAgd2JDb2RlOiBcIldCX0ZPUkJJRERFTlwiLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gVEJEIG1vdmUgdG8gRWxhc3RpQ2FjaGVcbiAgcHJpdmF0ZSBnZXRPYmplY3RQZXJtaXNzaW9uKFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIHVzZXJBY3Rpb246IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZ1xuICApIHtcbiAgICBpZiAoXG4gICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XSAmJlxuICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl1cbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJvbGVMZXZlbDogcm9sZUxldmVsLFxuICAgICAgICB1c2VyQWN0aW9uOiB1c2VyQWN0aW9uLFxuICAgICAgICBvYmplY3RLZXk6IGtleSxcbiAgICAgICAgb2JqZWN0SWQ6XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl0ub2JrZWN0SWQsXG4gICAgICAgIGNoZWNrZWRGb3JSb2xlTmFtZTpcbiAgICAgICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3JvbGVMZXZlbF1ba2V5XVt1c2VyQWN0aW9uXVxuICAgICAgICAgICAgLmNoZWNrZWRGb3JSb2xlTmFtZSxcbiAgICAgICAgcGVybWl0dGVkOlxuICAgICAgICAgIHRoaXMub2JqZWN0UGVybWlzc2lvbnNMb29rdXBbcm9sZUxldmVsXVtrZXldW3VzZXJBY3Rpb25dLnBlcm1pdHRlZCxcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFtyb2xlTGV2ZWxdW2tleV1bdXNlckFjdGlvbl0uZGVzY3JpcHRpb24sXG4gICAgICB9IGFzIFVzZXJBY3Rpb25QZXJtaXNzaW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyBUQkQgbW92ZSB0byBFbGFzdGlDYWNoZVxuICBwcml2YXRlIHNldE9iamVjdFBlcm1pc3Npb24odUFQOiBVc2VyQWN0aW9uUGVybWlzc2lvbikge1xuICAgIGlmICghdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFt1QVAucm9sZUxldmVsXVt1QVAub2JqZWN0SWRdKSB7XG4gICAgICB0aGlzLm9iamVjdFBlcm1pc3Npb25zTG9va3VwW3VBUC5yb2xlTGV2ZWxdW3VBUC5vYmplY3RJZF0gPSB7fTtcbiAgICB9XG4gICAgdGhpcy5vYmplY3RQZXJtaXNzaW9uc0xvb2t1cFt1QVAucm9sZUxldmVsXVt1QVAub2JqZWN0SWRdW3VBUC51c2VyQWN0aW9uXSA9XG4gICAgICB7XG4gICAgICAgIHBlcm1pdHRlZDogdUFQLnBlcm1pdHRlZCxcbiAgICAgICAgY2hlY2tlZEZvclJvbGVOYW1lOiB1QVAuY2hlY2tlZEZvclJvbGVOYW1lLFxuICAgICAgICBkZXNjcmlwdGlvbjogdUFQLmRlc2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICByZXR1cm4gdUFQO1xuICB9XG5cbiAgcHJpdmF0ZSByZWNvcmRBY3Rpb25IaXN0b3J5KHVBUDogVXNlckFjdGlvblBlcm1pc3Npb24pIHtcbiAgICB1QVAuY2hlY2tlZEF0ID0gbmV3IERhdGUoKTtcbiAgICB0aGlzLmFjdGlvbkhpc3RvcnkucHVzaCh1QVApO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRVc2VyQWN0aW9uUG9saWN5KFxuICAgIHBvbGljeTogUmVjb3JkPHN0cmluZywgYW55PltdLFxuICAgIHVzZXJBY3Rpb246IHN0cmluZ1xuICApIHtcbiAgICBmb3IgKGNvbnN0IHVzZXJBY3Rpb25Qb2xpY3kgb2YgcG9saWN5KSB7XG4gICAgICBpZiAodXNlckFjdGlvblBvbGljeS51c2VyQWN0aW9uID09IHVzZXJBY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBY3Rpb25Qb2xpY3k7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRPYmplY3RMb29rdXBLZXkoXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICkge1xuICAgIGxldCBrZXk6IHN0cmluZyA9IG9iamVjdElkT3JOYW1lLnRvU3RyaW5nKCk7XG4gICAgaWYgKHR5cGVvZiBvYmplY3RJZE9yTmFtZSA9PT0gXCJudW1iZXJcIikge1xuICAgICAga2V5ID0gYGlkJHtvYmplY3RJZE9yTmFtZX1gO1xuICAgIH0gZWxzZSBpZiAocGFyZW50T2JqZWN0TmFtZSkge1xuICAgICAga2V5ID0gYCR7cGFyZW50T2JqZWN0TmFtZX0uJHtvYmplY3RJZE9yTmFtZX1gO1xuICAgIH1cbiAgICByZXR1cm4ga2V5O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNhbihcbiAgICB1c2VyQWN0aW9uOiBzdHJpbmcsXG4gICAgb2JqZWN0SWRPck5hbWU6IG51bWJlciB8IHN0cmluZyxcbiAgICBwYXJlbnRPYmplY3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGlmICh0aGlzLmlzU3lzQWRtaW4oKSkgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcG9saWN5ID0gREVGQVVMVF9QT0xJQ1lbdXNlckFjdGlvbl07XG4gICAgbG9nLmluZm8oXG4gICAgICBgY3VycmVudFVzZXIuY2FuKCR7dXNlckFjdGlvbn0sJHtvYmplY3RJZE9yTmFtZX0pIHBvbGljeToke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICBwb2xpY3lcbiAgICAgICl9YFxuICAgICk7XG4gICAgaWYgKCFwb2xpY3kpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTm8gcG9saWN5IGZvdW5kIGZvciB1c2VyQWN0aW9uPSR7dXNlckFjdGlvbn1gO1xuICAgICAgbG9nLmVycm9yKG1lc3NhZ2UpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgIH1cbiAgICBsZXQga2V5ID0gdGhpcy5nZXRPYmplY3RMb29rdXBLZXkob2JqZWN0SWRPck5hbWUsIHBhcmVudE9iamVjdE5hbWUpO1xuICAgIGNvbnN0IGFscmVhZHlDaGVja2VkID0gdGhpcy5nZXRPYmplY3RQZXJtaXNzaW9uKFxuICAgICAgcG9saWN5LnJvbGVMZXZlbCxcbiAgICAgIHVzZXJBY3Rpb24sXG4gICAgICBrZXlcbiAgICApO1xuICAgIGlmIChhbHJlYWR5Q2hlY2tlZCAhPT0gbnVsbCkge1xuICAgICAgdGhpcy5yZWNvcmRBY3Rpb25IaXN0b3J5KGFscmVhZHlDaGVja2VkKTtcbiAgICAgIHJldHVybiBhbHJlYWR5Q2hlY2tlZC5wZXJtaXR0ZWQ7XG4gICAgfVxuICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLndiQ2xvdWQucm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICB0aGlzLmlkLFxuICAgICAgcG9saWN5LnJvbGVMZXZlbCxcbiAgICAgIG9iamVjdElkT3JOYW1lLFxuICAgICAgcGFyZW50T2JqZWN0TmFtZVxuICAgICk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgRXJyb3IgZ2V0dGluZyByb2xlTmFtZUZvclVzZXJPYmplY3QoJHt0aGlzLmlkfSwke1xuICAgICAgICBwb2xpY3kucm9sZUxldmVsXG4gICAgICB9LCR7b2JqZWN0SWRPck5hbWV9LCR7cGFyZW50T2JqZWN0TmFtZX0pLiAke0pTT04uc3RyaW5naWZ5KHJvbGVSZXN1bHQpfWA7XG4gICAgICBsb2cuZXJyb3IobWVzc2FnZSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgfVxuICAgIGlmICghcm9sZVJlc3VsdC5wYXlsb2FkLm9iamVjdElkKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE9iamVjdElkIGNvdWxkIG5vdCBiZSBmb3VuZGA7XG4gICAgICBsb2cuZXJyb3IobWVzc2FnZSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgfVxuICAgIGxldCBwZXJtaXR0ZWQgPSBmYWxzZTtcbiAgICBpZiAoXG4gICAgICByb2xlUmVzdWx0LnBheWxvYWQucm9sZU5hbWUgJiZcbiAgICAgIHBvbGljeS5wZXJtaXR0ZWRSb2xlcy5pbmNsdWRlcyhyb2xlUmVzdWx0LnBheWxvYWQucm9sZU5hbWUpXG4gICAgKSB7XG4gICAgICBwZXJtaXR0ZWQgPSB0cnVlO1xuICAgIH1cbiAgICBjb25zdCB1QVA6IFVzZXJBY3Rpb25QZXJtaXNzaW9uID0ge1xuICAgICAgcm9sZUxldmVsOiBwb2xpY3kucm9sZUxldmVsLFxuICAgICAgb2JqZWN0S2V5OiBrZXksXG4gICAgICBvYmplY3RJZDogcm9sZVJlc3VsdC5wYXlsb2FkLm9iamVjdElkLFxuICAgICAgdXNlckFjdGlvbjogdXNlckFjdGlvbixcbiAgICAgIHBlcm1pdHRlZDogcGVybWl0dGVkLFxuICAgICAgZGVzY3JpcHRpb246IHBvbGljeS5kZXNjcmlwdGlvbixcbiAgICB9O1xuICAgIGlmIChyb2xlUmVzdWx0LnBheWxvYWQucm9sZU5hbWUpIHtcbiAgICAgIHVBUC5jaGVja2VkRm9yUm9sZU5hbWUgPSByb2xlUmVzdWx0LnBheWxvYWQucm9sZU5hbWU7XG4gICAgfVxuICAgIHRoaXMuc2V0T2JqZWN0UGVybWlzc2lvbih1QVApO1xuICAgIHRoaXMucmVjb3JkQWN0aW9uSGlzdG9yeSh1QVApO1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHJvbGU6ICR7SlNPTi5zdHJpbmdpZnkocm9sZVJlc3VsdC5wYXlsb2FkKX0gcGVybWl0dGVkOiAke3Blcm1pdHRlZH1gXG4gICAgKTtcbiAgICByZXR1cm4gcGVybWl0dGVkO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNhbnQoXG4gICAgdXNlckFjdGlvbjogc3RyaW5nLFxuICAgIG9iamVjdElkT3JOYW1lOiBudW1iZXIgfCBzdHJpbmcsXG4gICAgcGFyZW50T2JqZWN0TmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjYW4gPSBhd2FpdCB0aGlzLmNhbih1c2VyQWN0aW9uLCBvYmplY3RJZE9yTmFtZSwgcGFyZW50T2JqZWN0TmFtZSk7XG4gICAgcmV0dXJuICFjYW47XG4gIH1cblxuICAvLyBhc3luYyBvbmx5IHJlcXVpcmVkIHRvIGxvb2t1cCB1c2VySWQgZnJvbSBlbWFpbCB3aGVuIHRlc3RpbmdcbiAgcHVibGljIHN0YXRpYyBhc3luYyBmcm9tQ29udGV4dChjb250ZXh0OiBhbnkpOiBQcm9taXNlPEN1cnJlbnRVc2VyPiB7XG4gICAgLy9sb2cuaW5mbyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKFxuICAgICAgY29udGV4dC5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgICApLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGlmIChcbiAgICAgIC8vIHByb2Nlc3MuZW52Lk5PREVfRU5WID09IFwiZGV2ZWxvcG1lbnRcIiAmJlxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWVtYWlsXCJdXG4gICAgKSB7XG4gICAgICBsb2cuaW5mbyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVEVTVCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1lbWFpbFwiXX1gXG4gICAgICApO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUVtYWlsKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItZW1haWxcIl1cbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnBheWxvYWQgJiYgcmVzdWx0LnBheWxvYWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihyZXN1bHQucGF5bG9hZCwgY29udGV4dC53YkNsb3VkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkbid0IGZpbmQgdXNlciBmb3IgdGVzdCBlbWFpbCB4LXRlc3QtdXNlci1lbWFpbD0ke2hlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1lbWFpbFwiXX1gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoVXNlci5nZXRQdWJsaWNVc2VyKCksIGNvbnRleHQud2JDbG91ZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdICYmXG4gICAgICBoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtcm9sZVwiXS50b0xvd2VyQ2FzZSgpID09IFwiYWRtaW5cIlxuICAgICkge1xuICAgICAgbG9nLmluZm8oXCI9PT09PT09PT09IEZPVU5EIFNZU0FETUlOIFVTRVJcIik7XG4gICAgICByZXR1cm4gQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKTtcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSB7XG4gICAgICBsb2cuaW5mbyhcbiAgICAgICAgYD09PT09PT09PT0gRk9VTkQgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXX1gXG4gICAgICApO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUlkKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBwYXJzZUludChoZWFkZXJzTG93ZXJDYXNlW1wieC1oYXN1cmEtdXNlci1pZFwiXSlcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnBheWxvYWQgJiYgcmVzdWx0LnBheWxvYWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihyZXN1bHQucGF5bG9hZCwgY29udGV4dC53YkNsb3VkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkbid0IGZpbmQgdXNlciBmb3IgeC1oYXN1cmEtdXNlci1pZD0ke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIG5ldyBDdXJyZW50VXNlcihVc2VyLmdldFB1YmxpY1VzZXIoKSwgY29udGV4dC53YkNsb3VkKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVEJEOiBzdXBwb3J0IGZvciBwdWJsaWMgdXNlcnNcbiAgICAgIGxvZy5pbmZvKFxuICAgICAgICBgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQ6IENvdWxkIG5vdCBmaW5kIGhlYWRlcnMgZm9yIEFkbWluLCBUZXN0IG9yIFVzZXIgaW46ICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgY29udGV4dC5oZWFkZXJzXG4gICAgICAgICl9YFxuICAgICAgKTtcbiAgICAgIHJldHVybiBuZXcgQ3VycmVudFVzZXIoVXNlci5nZXRQdWJsaWNVc2VyKCksIGNvbnRleHQud2JDbG91ZCk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIE9yZ2FuaXphdGlvbiB7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogUm9sZTtcbiAgc2V0dGluZ3M/OiBvYmplY3Q7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb24+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvbi5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25zID0gQXJyYXk8T3JnYW5pemF0aW9uPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgb3JnYW5pemF0aW9ucy5wdXNoKE9yZ2FuaXphdGlvbi5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IE9yZ2FuaXphdGlvbiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb24ucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uID0gbmV3IE9yZ2FuaXphdGlvbigpO1xuICAgIG9yZ2FuaXphdGlvbi5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIG9yZ2FuaXphdGlvbi5uYW1lID0gZGF0YS5uYW1lO1xuICAgIG9yZ2FuaXphdGlvbi5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgb3JnYW5pemF0aW9uLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICBvcmdhbml6YXRpb24udXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNldHRpbmdzKSBvcmdhbml6YXRpb24uc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgb3JnYW5pemF0aW9uLnJvbGUgPSBuZXcgUm9sZShkYXRhLnJvbGVfbmFtZSwgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwpO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgb3JnYW5pemF0aW9uLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3JnYW5pemF0aW9uO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIE9yZ2FuaXphdGlvblVzZXIge1xuICBvcmdhbml6YXRpb25JZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tcm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlITogUm9sZTtcbiAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZztcbiAgdXNlckVtYWlsPzogc3RyaW5nO1xuICB1c2VyRmlyc3ROYW1lPzogc3RyaW5nO1xuICB1c2VyTGFzdE5hbWU/OiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxPcmdhbml6YXRpb25Vc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJPcmdhbml6YXRpb25Vc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblVzZXJzID0gQXJyYXk8T3JnYW5pemF0aW9uVXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIG9yZ2FuaXphdGlvblVzZXJzLnB1c2goT3JnYW5pemF0aW9uVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gb3JnYW5pemF0aW9uVXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBPcmdhbml6YXRpb25Vc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIk9yZ2FuaXphdGlvblVzZXIucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uVXNlciA9IG5ldyBPcmdhbml6YXRpb25Vc2VyKCk7XG4gICAgb3JnYW5pemF0aW9uVXNlci5vcmdhbml6YXRpb25JZCA9IGRhdGEub3JnYW5pemF0aW9uX2lkO1xuICAgIG9yZ2FuaXphdGlvblVzZXIudXNlcklkID0gcGFyc2VJbnQoZGF0YS51c2VyX2lkKTtcbiAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGVJZCA9IHBhcnNlSW50KGRhdGEucm9sZV9pZCk7XG4gICAgaWYgKGRhdGEuaW1wbGllZF9mcm9tX3JvbGVfaWQpIHtcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIuaW1wbGllZEZyb21yb2xlSWQgPSBwYXJzZUludChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKTtcbiAgICB9XG4gICAgb3JnYW5pemF0aW9uVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgb3JnYW5pemF0aW9uVXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgb3JnYW5pemF0aW9uVXNlci5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX2lkKTtcbiAgICBpZiAoZGF0YS5vcmdhbml6YXRpb25fbmFtZSlcbiAgICAgIG9yZ2FuaXphdGlvblVzZXIub3JnYW5pemF0aW9uTmFtZSA9IGRhdGEub3JnYW5pemF0aW9uX25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9lbWFpbCkgb3JnYW5pemF0aW9uVXNlci51c2VyRW1haWwgPSBkYXRhLnVzZXJfZW1haWw7XG4gICAgaWYgKGRhdGEudXNlcl9maXJzdF9uYW1lKVxuICAgICAgb3JnYW5pemF0aW9uVXNlci51c2VyRmlyc3ROYW1lID0gZGF0YS51c2VyX2ZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9sYXN0X25hbWUpXG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnVzZXJMYXN0TmFtZSA9IGRhdGEudXNlcl9sYXN0X25hbWU7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICBvcmdhbml6YXRpb25Vc2VyLnJvbGUgPSBuZXcgUm9sZShcbiAgICAgICAgZGF0YS5yb2xlX25hbWUsXG4gICAgICAgIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsXG4gICAgICApO1xuICAgICAgaWYgKGRhdGEucm9sZV9pbXBsaWVkX2Zyb20pIHtcbiAgICAgICAgb3JnYW5pemF0aW9uVXNlci5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9yZ2FuaXphdGlvblVzZXI7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBERUZBVUxUX1BPTElDWSB9IGZyb20gXCIuLi9wb2xpY3lcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbi8qKlxuICogU0NIRU1BXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGFuIG9yZ2FuaXphdGlvblxuICogICAtIEFsbCBhZG1pbmlzdHJhdG9ycyBvZiB0aGUgb3JnYW5pemF0aW9uIGhhdmUgaW1wbGljaXQgYWRtaW4gYWNjZXNzXG4gKiAtIElmIGEgc2NoZW1hIGlzIG93bmVkIGJ5IGEgdXNlciwgdGhlIHVzZXIgaGFzIGltcGxpY2l0IGFkbWluIGFjY2Vzc1xuICogICAtIEFkZGl0aW9uYWwgdXNlcnMgY2FuIGJlIGdyYW50ZWQgYWRtaW4gYWNjZXNzIGV4cGxpY2l0bHlcbiAqL1xuXG5leHBvcnQgdHlwZSBSb2xlTGV2ZWwgPSBcIm9yZ2FuaXphdGlvblwiIHwgXCJzY2hlbWFcIiB8IFwidGFibGVcIjtcblxuZXhwb3J0IHR5cGUgVXNlckFjdGlvblBlcm1pc3Npb24gPSB7XG4gIHJvbGVMZXZlbDogUm9sZUxldmVsO1xuICB1c2VyQWN0aW9uOiBzdHJpbmc7XG4gIG9iamVjdEtleT86IHN0cmluZztcbiAgb2JqZWN0SWQ6IG51bWJlcjtcbiAgY2hlY2tlZEZvclJvbGVOYW1lPzogc3RyaW5nO1xuICBwZXJtaXR0ZWQ6IGJvb2xlYW47XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IERhdGU7XG59O1xuXG5leHBvcnQgY2xhc3MgUm9sZSB7XG4gIHN0YXRpYyBTWVNST0xFU19PUkdBTklaQVRJT05TOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiA9IHtcbiAgICBvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvcjoge1xuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEFkbWluaXN0cmF0b3JcIixcbiAgICB9LFxuICAgIG9yZ2FuaXphdGlvbl91c2VyOiB7IGxhYmVsOiBcIk9yZ2FuaXphdGlvbiBVc2VyXCIgfSxcbiAgICBvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlcjoge1xuICAgICAgbGFiZWw6IFwiT3JnYW5pemF0aW9uIEV4dGVybmFsIFVzZXJcIixcbiAgICB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19TQ0hFTUFTOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBhbnk+PiA9IHtcbiAgICBzY2hlbWFfb3duZXI6IHsgbGFiZWw6IFwiREIgT3duZXJcIiB9LFxuICAgIHNjaGVtYV9hZG1pbmlzdHJhdG9yOiB7XG4gICAgICBsYWJlbDogXCJEQiBBZG1pbmlzdHJhdG9yXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl0sXG4gICAgfSxcbiAgICBzY2hlbWFfbWFuYWdlcjogeyBsYWJlbDogXCJEQiBNYW5hZ2VyXCIgfSxcbiAgICBzY2hlbWFfZWRpdG9yOiB7IGxhYmVsOiBcIkRCIEVkaXRvclwiIH0sXG4gICAgc2NoZW1hX3JlYWRlcjogeyBsYWJlbDogXCJEQiBSZWFkZXJcIiB9LFxuICB9O1xuXG4gIHN0YXRpYyBTWVNST0xFU19UQUJMRVM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge1xuICAgIHRhYmxlX2FkbWluaXN0cmF0b3I6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIEFkbWluaXN0cmF0b3JcIixcbiAgICAgIGltcGxpZWRGcm9tOiBbXCJzY2hlbWFfb3duZXJcIiwgXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXSxcbiAgICB9LFxuICAgIHRhYmxlX21hbmFnZXI6IHtcbiAgICAgIGxhYmVsOiBcIlRhYmxlIE1hbmFnZXJcIixcbiAgICAgIGltcGxpZWRGcm9tOiBbXCJzY2hlbWFfbWFuYWdlclwiXSxcbiAgICB9LFxuICAgIHRhYmxlX2VkaXRvcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgRWRpdG9yXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX2VkaXRvclwiXSxcbiAgICB9LFxuICAgIHRhYmxlX3JlYWRlcjoge1xuICAgICAgbGFiZWw6IFwiVGFibGUgUmVhZGVyXCIsXG4gICAgICBpbXBsaWVkRnJvbTogW1wic2NoZW1hX3JlYWRlclwiXSxcbiAgICB9LFxuICB9O1xuXG4gIHN0YXRpYyBzeXNSb2xlTWFwKGZyb206IFJvbGVMZXZlbCwgdG86IFJvbGVMZXZlbCkge1xuICAgIGxldCB0b1JvbGVEZWZpbml0aW9uczogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgYW55Pj4gPSB7fTtcbiAgICBsZXQgbWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgc3dpdGNoICh0bykge1xuICAgICAgY2FzZSBcInRhYmxlXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICB0b1JvbGVEZWZpbml0aW9ucyA9IFJvbGUuU1lTUk9MRVNfVEFCTEVTO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIHRvUm9sZURlZmluaXRpb25zID0gUm9sZS5TWVNST0xFU19TQ0hFTUFTO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgZm9yIChjb25zdCB0b1JvbGVOYW1lIG9mIE9iamVjdC5rZXlzKHRvUm9sZURlZmluaXRpb25zKSkge1xuICAgICAgaWYgKHRvUm9sZURlZmluaXRpb25zW3RvUm9sZU5hbWVdLmltcGxpZWRGcm9tKSB7XG4gICAgICAgIGZvciAoY29uc3QgZnJvbVJvbGVOYW1lIG9mIHRvUm9sZURlZmluaXRpb25zW3RvUm9sZU5hbWVdLmltcGxpZWRGcm9tKSB7XG4gICAgICAgICAgbWFwW2Zyb21Sb2xlTmFtZV0gPSB0b1JvbGVOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtYXA7XG4gIH1cblxuICBzdGF0aWMgSEFTVVJBX1BSRUZJWEVTX0FDVElPTlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgczogXCJzZWxlY3RcIixcbiAgICBpOiBcImluc2VydFwiLFxuICAgIHU6IFwidXBkYXRlXCIsXG4gICAgZDogXCJkZWxldGVcIixcbiAgfTtcblxuICBpZD86IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdD86IERhdGU7XG4gIHVwZGF0ZWRBdD86IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgaW1wbGllZEZyb20/OiBTdHJpbmc7XG4gIHBlcm1pc3Npb25zPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCByb2xlTGV2ZWw/OiBSb2xlTGV2ZWwpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMucGVybWlzc2lvbnMgPSBSb2xlLmdldFBlcm1pc3Npb25zKFxuICAgICAgREVGQVVMVF9QT0xJQ1ksXG4gICAgICB0aGlzLm5hbWUsXG4gICAgICByb2xlTGV2ZWxcbiAgICApO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRQZXJtaXNzaW9ucyhcbiAgICBwb2xpY3k6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+LFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsPzogUm9sZUxldmVsXG4gICkge1xuICAgIGNvbnN0IHBlcm1pc3Npb25zOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICAgIGZvciAoY29uc3QgdXNlckFjdGlvbiBvZiBPYmplY3Qua2V5cyhwb2xpY3kpKSB7XG4gICAgICBpZiAoXG4gICAgICAgIHJvbGVMZXZlbCAmJlxuICAgICAgICAocG9saWN5W3VzZXJBY3Rpb25dLnJvbGVMZXZlbCBhcyBSb2xlTGV2ZWwpICE9IHJvbGVMZXZlbFxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcGVybWlzc2lvbnNbdXNlckFjdGlvbl0gPVxuICAgICAgICBwb2xpY3lbdXNlckFjdGlvbl0ucGVybWl0dGVkUm9sZXMuaW5jbHVkZXMocm9sZU5hbWUpO1xuICAgIH1cbiAgICByZXR1cm4gcGVybWlzc2lvbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGlzUm9sZShyb2xlTmFtZTogc3RyaW5nLCByb2xlTGV2ZWw/OiBSb2xlTGV2ZWwpOiBib29sZWFuIHtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSk7XG4gICAgICBjYXNlIFwic2NoZW1hXCI6XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1NDSEVNQVMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGNhc2UgXCJ0YWJsZVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19UQUJMRVMpLmluY2x1ZGVzKHJvbGVOYW1lKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgT2JqZWN0LmtleXMoUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TKS5pbmNsdWRlcyhyb2xlTmFtZSkgfHxcbiAgICAgICAgICBPYmplY3Qua2V5cyhSb2xlLlNZU1JPTEVTX1NDSEVNQVMpLmluY2x1ZGVzKHJvbGVOYW1lKSB8fFxuICAgICAgICAgIE9iamVjdC5rZXlzKFJvbGUuU1lTUk9MRVNfVEFCTEVTKS5pbmNsdWRlcyhyb2xlTmFtZSlcbiAgICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGFyZVJvbGVzKHJvbGVOYW1lczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IHJvbGVOYW1lIG9mIHJvbGVOYW1lcykge1xuICAgICAgaWYgKCFSb2xlLmlzUm9sZShyb2xlTmFtZSkpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHRhYmxlUGVybWlzc2lvblByZWZpeGVzKHJvbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgcHJlZml4ZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKFxuICAgICAgREVGQVVMVF9QT0xJQ1lbXCJyZWFkX2FuZF93cml0ZV90YWJsZV9yZWNvcmRzXCJdLnBlcm1pdHRlZFJvbGVzLmluY2x1ZGVzKFxuICAgICAgICByb2xlTmFtZVxuICAgICAgKVxuICAgICkge1xuICAgICAgYWN0aW9ucyA9IERFRkFVTFRfUE9MSUNZW1wicmVhZF9hbmRfd3JpdGVfdGFibGVfcmVjb3Jkc1wiXS5oYXN1cmFBY3Rpb25zO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBERUZBVUxUX1BPTElDWVtcInJlYWRfdGFibGVfcmVjb3Jkc1wiXS5wZXJtaXR0ZWRSb2xlcy5pbmNsdWRlcyhyb2xlTmFtZSlcbiAgICApIHtcbiAgICAgIGFjdGlvbnMgPSBERUZBVUxUX1BPTElDWVtcInJlYWRfdGFibGVfcmVjb3Jkc1wiXS5oYXN1cmFBY3Rpb25zO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG4gICAgICBjb25zdCBwcmVmaXggPSBPYmplY3Qua2V5cyhSb2xlLkhBU1VSQV9QUkVGSVhFU19BQ1RJT05TKS5maW5kKFxuICAgICAgICAoa2V5KSA9PiBSb2xlLkhBU1VSQV9QUkVGSVhFU19BQ1RJT05TW2tleV0gPT09IGFjdGlvblxuICAgICAgKTtcbiAgICAgIGlmIChwcmVmaXgpIHByZWZpeGVzLnB1c2gocHJlZml4KTtcbiAgICB9XG4gICAgcmV0dXJuIHByZWZpeGVzO1xuICB9XG5cbiAgLy8gZWcgW3sgcGVybWlzc2lvbktleTogczEyMzQsIGFjdGlvbjogXCJzZWxlY3RcIn0sXG4gIC8vIHsgcGVybWlzc2lvbktleTogaTEyMzQsIGFjdGlvbjogXCJpbnNlcnRcIn0uLi5cbiAgcHVibGljIHN0YXRpYyB0YWJsZVBlcm1pc3Npb25LZXlzQW5kQWN0aW9ucyhcbiAgICB0YWJsZUlkOiBudW1iZXJcbiAgKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdIHtcbiAgICBjb25zdCBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgcHJlZml4IG9mIE9iamVjdC5rZXlzKFJvbGUuSEFTVVJBX1BSRUZJWEVTX0FDVElPTlMpKSB7XG4gICAgICBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnMucHVzaCh7XG4gICAgICAgIHBlcm1pc3Npb25LZXk6IFJvbGUudGFibGVQZXJtaXNzaW9uS2V5KHByZWZpeCwgdGFibGVJZCksXG4gICAgICAgIGFjdGlvbjogUm9sZS5IQVNVUkFfUFJFRklYRVNfQUNUSU9OU1twcmVmaXhdLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHRhYmxlUGVybWlzc2lvbktleShcbiAgICBwZXJtaXNzaW9uUHJlZml4OiBzdHJpbmcsXG4gICAgdGFibGVJZDogbnVtYmVyXG4gICk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3Blcm1pc3Npb25QcmVmaXh9JHt0YWJsZUlkfWA7XG4gIH1cblxuICAvLyBVc2VkIHRvIGdlbmVyYXRlIHRoZSBIYXN1cmEgdGFibGUgcGVybWlzc2lvblxuICBwdWJsaWMgc3RhdGljIGhhc3VyYVRhYmxlUGVybWlzc2lvbkNoZWNrc0FuZFR5cGVzKFxuICAgIHRhYmxlSWQ6IG51bWJlclxuICApOiBSZWNvcmQ8c3RyaW5nLCBhbnk+W10ge1xuICAgIGNvbnN0IGhhc3VyYVBlcm1pc3Npb25zQW5kQWN0aW9uczogUmVjb3JkPHN0cmluZywgYW55PltdID0gW107XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbiBvZiBSb2xlLnRhYmxlUGVybWlzc2lvbktleXNBbmRBY3Rpb25zKFxuICAgICAgdGFibGVJZFxuICAgICkpIHtcbiAgICAgIGhhc3VyYVBlcm1pc3Npb25zQW5kQWN0aW9ucy5wdXNoKHtcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrOiB7XG4gICAgICAgICAgX2V4aXN0czoge1xuICAgICAgICAgICAgX3RhYmxlOiB7IHNjaGVtYTogXCJ3YlwiLCBuYW1lOiBcInRhYmxlX3Blcm1pc3Npb25zXCIgfSxcbiAgICAgICAgICAgIF93aGVyZToge1xuICAgICAgICAgICAgICBfYW5kOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgdGFibGVfcGVybWlzc2lvbl9rZXk6IHtcbiAgICAgICAgICAgICAgICAgICAgX2VxOiBwZXJtaXNzaW9uS2V5c0FuZEFjdGlvbi5wZXJtaXNzaW9uS2V5LFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHsgdXNlcl9pZDogeyBfZXE6IFwiWC1IYXN1cmEtVXNlci1JZFwiIH0gfSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcGVybWlzc2lvblR5cGU6IHBlcm1pc3Npb25LZXlzQW5kQWN0aW9uLmFjdGlvbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gaGFzdXJhUGVybWlzc2lvbnNBbmRBY3Rpb25zO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxSb2xlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGVzID0gQXJyYXk8Um9sZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHJvbGVzLnB1c2goUm9sZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBSb2xlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlJvbGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBSb2xlKGRhdGEubmFtZSk7XG4gICAgcm9sZS5pZCA9IHBhcnNlSW50KGRhdGEuaWQpO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICByb2xlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICByb2xlLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICByb2xlLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gcm9sZTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWEge1xuICBzdGF0aWMgV0JfU1lTX1NDSEVNQV9JRDogbnVtYmVyID0gMTtcbiAgc3RhdGljIFNZU19TQ0hFTUFfTkFNRVM6IHN0cmluZ1tdID0gW1xuICAgIFwicHVibGljXCIsXG4gICAgXCJpbmZvcm1hdGlvbl9zY2hlbWFcIixcbiAgICBcImhkYl9jYXRhbG9nXCIsXG4gICAgXCJ3YlwiLFxuICBdO1xuXG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgb3JnYW5pemF0aW9uT3duZXJJZD86IG51bWJlcjtcbiAgdXNlck93bmVySWQ/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgcm9sZT86IFJvbGU7XG4gIG9yZ2FuaXphdGlvbk93bmVyTmFtZT86IHN0cmluZztcbiAgdXNlck93bmVyRW1haWw/OiBzdHJpbmc7XG4gIHNldHRpbmdzPzogb2JqZWN0O1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8U2NoZW1hPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hcyA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHNjaGVtYXMucHVzaChTY2hlbWEucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBTY2hlbWEge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWEoKTtcbiAgICBzY2hlbWEuaWQgPSBwYXJzZUludChkYXRhLmlkKTtcbiAgICBzY2hlbWEubmFtZSA9IGRhdGEubmFtZTtcbiAgICBzY2hlbWEubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHNjaGVtYS5vcmdhbml6YXRpb25Pd25lcklkID0gZGF0YS5vcmdhbml6YXRpb25fb3duZXJfaWQ7XG4gICAgc2NoZW1hLnVzZXJPd25lcklkID0gZGF0YS51c2VyX293bmVyX2lkO1xuICAgIHNjaGVtYS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICBpZiAoZGF0YS5vcmdhbml6YXRpb25fb3duZXJfbmFtZSkge1xuICAgICAgc2NoZW1hLm9yZ2FuaXphdGlvbk93bmVyTmFtZSA9IGRhdGEub3JnYW5pemF0aW9uX293bmVyX25hbWU7XG4gICAgfVxuICAgIGlmIChkYXRhLnVzZXJfb3duZXJfZW1haWwpIHNjaGVtYS51c2VyT3duZXJFbWFpbCA9IGRhdGEudXNlcl9vd25lcl9lbWFpbDtcbiAgICBpZiAoZGF0YS5zZXR0aW5ncykgc2NoZW1hLnNldHRpbmdzID0gZGF0YS5zZXR0aW5ncztcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIHNjaGVtYS5yb2xlID0gbmV3IFJvbGUoZGF0YS5yb2xlX25hbWUsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHNjaGVtYS5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFJvbGUsIFJvbGVMZXZlbCB9IGZyb20gXCIuXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWFVc2VyIHtcbiAgc2NoZW1hSWQhOiBudW1iZXI7XG4gIHVzZXJJZCE6IG51bWJlcjtcbiAgcm9sZUlkITogbnVtYmVyO1xuICBpbXBsaWVkRnJvbVJvbGVJZD86IG51bWJlcjtcbiAgc2V0dGluZ3MhOiBvYmplY3Q7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG4gIC8vIG5vdCBwZXJzaXN0ZWRcbiAgcm9sZSE6IFJvbGU7XG4gIHNjaGVtYU5hbWU/OiBzdHJpbmc7XG4gIHVzZXJFbWFpbD86IHN0cmluZztcbiAgdXNlckZpcnN0TmFtZT86IHN0cmluZztcbiAgdXNlckxhc3ROYW1lPzogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8U2NoZW1hVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCBzY2hlbWFVc2VycyA9IEFycmF5PFNjaGVtYVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICBzY2hlbWFVc2Vycy5wdXNoKFNjaGVtYVVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogU2NoZW1hVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWFVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYVVzZXIgPSBuZXcgU2NoZW1hVXNlcigpO1xuICAgIHNjaGVtYVVzZXIuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICBzY2hlbWFVc2VyLnVzZXJJZCA9IHBhcnNlSW50KGRhdGEudXNlcl9pZCk7XG4gICAgc2NoZW1hVXNlci5yb2xlSWQgPSBwYXJzZUludChkYXRhLnJvbGVfaWQpO1xuICAgIGlmIChkYXRhLmltcGxpZWRfZnJvbV9yb2xlX2lkKSB7XG4gICAgICBzY2hlbWFVc2VyLmltcGxpZWRGcm9tUm9sZUlkID0gcGFyc2VJbnQoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCk7XG4gICAgfVxuICAgIHNjaGVtYVVzZXIuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIHNjaGVtYVVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSBzY2hlbWFVc2VyLnNjaGVtYU5hbWUgPSBkYXRhLnNjaGVtYV9uYW1lO1xuICAgIGlmIChkYXRhLnVzZXJfZW1haWwpIHNjaGVtYVVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSkgc2NoZW1hVXNlci51c2VyRmlyc3ROYW1lID0gZGF0YS51c2VyX2ZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEudXNlcl9sYXN0X25hbWUpIHNjaGVtYVVzZXIudXNlckxhc3ROYW1lID0gZGF0YS51c2VyX2xhc3RfbmFtZTtcbiAgICBpZiAoZGF0YS5yb2xlX25hbWUpIHtcbiAgICAgIHNjaGVtYVVzZXIucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCk7XG4gICAgICBpZiAoZGF0YS5yb2xlX2ltcGxpZWRfZnJvbSkge1xuICAgICAgICBzY2hlbWFVc2VyLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2NoZW1hVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IENvbHVtbiwgUm9sZSwgUm9sZUxldmVsIH0gZnJvbSBcIi5cIjtcblxuZXhwb3J0IGNsYXNzIFRhYmxlIHtcbiAgaWQhOiBudW1iZXI7XG4gIHNjaGVtYUlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlPzogUm9sZTtcbiAgY29sdW1ucyE6IFtDb2x1bW5dO1xuICBzY2hlbWFOYW1lPzogc3RyaW5nO1xuICBzZXR0aW5ncz86IG9iamVjdDtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZXMgPSBBcnJheTxUYWJsZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRhYmxlcy5wdXNoKFRhYmxlLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBUYWJsZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJUYWJsZS5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZSA9IG5ldyBUYWJsZSgpO1xuICAgIHRhYmxlLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgdGFibGUuc2NoZW1hSWQgPSBkYXRhLnNjaGVtYV9pZDtcbiAgICB0YWJsZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRhYmxlLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICB0YWJsZS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdGFibGUudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSB0YWJsZS5zY2hlbWFOYW1lID0gZGF0YS5zY2hlbWFfbmFtZTtcbiAgICBpZiAoZGF0YS5zZXR0aW5ncykgdGFibGUuc2V0dGluZ3MgPSBkYXRhLnNldHRpbmdzO1xuICAgIGlmIChkYXRhLnJvbGVfbmFtZSkge1xuICAgICAgdGFibGUucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHRhYmxlLnJvbGUuaW1wbGllZEZyb20gPSBkYXRhLnJvbGVfaW1wbGllZF9mcm9tO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGFibGU7XG4gIH1cbn1cbiIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBSb2xlLCBSb2xlTGV2ZWwgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgY2xhc3MgVGFibGVVc2VyIHtcbiAgdGFibGVJZCE6IG51bWJlcjtcbiAgdXNlcklkITogbnVtYmVyO1xuICByb2xlSWQhOiBudW1iZXI7XG4gIGltcGxpZWRGcm9tcm9sZUlkPzogbnVtYmVyO1xuICBzZXR0aW5ncyE6IG9iamVjdDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbiAgLy8gbm90IHBlcnNpc3RlZFxuICByb2xlITogUm9sZTtcbiAgc2NoZW1hTmFtZT86IHN0cmluZztcbiAgdGFibGVOYW1lPzogc3RyaW5nO1xuICB1c2VyRW1haWw/OiBzdHJpbmc7XG4gIHVzZXJGaXJzdE5hbWU/OiBzdHJpbmc7XG4gIHVzZXJMYXN0TmFtZT86IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRhYmxlVXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGFibGVVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRhYmxlVXNlcnMgPSBBcnJheTxUYWJsZVVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0YWJsZVVzZXJzLnB1c2goVGFibGVVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0YWJsZVVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGFibGVVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRhYmxlVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0YWJsZVVzZXIgPSBuZXcgVGFibGVVc2VyKCk7XG4gICAgdGFibGVVc2VyLnRhYmxlSWQgPSBwYXJzZUludChkYXRhLnRhYmxlX2lkKTtcbiAgICB0YWJsZVVzZXIudXNlcklkID0gcGFyc2VJbnQoZGF0YS51c2VyX2lkKTtcbiAgICB0YWJsZVVzZXIucm9sZUlkID0gcGFyc2VJbnQoZGF0YS5yb2xlX2lkKTtcbiAgICBpZiAoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCkge1xuICAgICAgdGFibGVVc2VyLmltcGxpZWRGcm9tcm9sZUlkID0gcGFyc2VJbnQoZGF0YS5pbXBsaWVkX2Zyb21fcm9sZV9pZCk7XG4gICAgfVxuICAgIHRhYmxlVXNlci5zZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3M7XG4gICAgdGFibGVVc2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0YWJsZVVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIGlmIChkYXRhLnNjaGVtYV9uYW1lKSB0YWJsZVVzZXIuc2NoZW1hTmFtZSA9IGRhdGEuc2NoZW1hX25hbWU7XG4gICAgaWYgKGRhdGEudGFibGVfbmFtZSkgdGFibGVVc2VyLnRhYmxlTmFtZSA9IGRhdGEudGFibGVfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2VtYWlsKSB0YWJsZVVzZXIudXNlckVtYWlsID0gZGF0YS51c2VyX2VtYWlsO1xuICAgIGlmIChkYXRhLnVzZXJfZmlyc3RfbmFtZSkgdGFibGVVc2VyLnVzZXJGaXJzdE5hbWUgPSBkYXRhLnVzZXJfZmlyc3RfbmFtZTtcbiAgICBpZiAoZGF0YS51c2VyX2xhc3RfbmFtZSkgdGFibGVVc2VyLnVzZXJMYXN0TmFtZSA9IGRhdGEudXNlcl9sYXN0X25hbWU7XG4gICAgaWYgKGRhdGEucm9sZV9uYW1lKSB7XG4gICAgICB0YWJsZVVzZXIucm9sZSA9IG5ldyBSb2xlKGRhdGEucm9sZV9uYW1lLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKTtcbiAgICAgIGlmIChkYXRhLnJvbGVfaW1wbGllZF9mcm9tKSB7XG4gICAgICAgIHRhYmxlVXNlci5yb2xlLmltcGxpZWRGcm9tID0gZGF0YS5yb2xlX2ltcGxpZWRfZnJvbTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRhYmxlVXNlcjtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFVTRVJfTUVTU0FHRVMgfSBmcm9tIFwiLi4vZW52aXJvbm1lbnRcIjtcblxuZXhwb3J0IGNsYXNzIFVzZXIge1xuICBzdGF0aWMgU1lTX0FETUlOX0lEOiBudW1iZXIgPSAxO1xuICBzdGF0aWMgUFVCTElDX0lEOiBudW1iZXIgPSAyO1xuXG4gIGlkITogbnVtYmVyO1xuICBlbWFpbCE6IHN0cmluZztcbiAgZmlyc3ROYW1lPzogc3RyaW5nO1xuICBsYXN0TmFtZT86IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFVzZXI+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlVzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3QgdXNlcnMgPSBBcnJheTxVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdXNlcnMucHVzaChVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB1c2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pik6IFVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB1c2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gcGFyc2VJbnQoZGF0YS5pZCk7XG4gICAgdXNlci5lbWFpbCA9IGRhdGEuZW1haWw7XG4gICAgaWYgKGRhdGEuZmlyc3RfbmFtZSkgdXNlci5maXJzdE5hbWUgPSBkYXRhLmZpcnN0X25hbWU7XG4gICAgaWYgKGRhdGEubGFzdF9uYW1lKSB1c2VyLmxhc3ROYW1lID0gZGF0YS5sYXN0X25hbWU7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFN5c0FkbWluVXNlcigpOiBVc2VyIHtcbiAgICBjb25zdCBkYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1c2VyOiBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gVXNlci5TWVNfQURNSU5fSUQ7XG4gICAgdXNlci5lbWFpbCA9IFwiU1lTX0FETUlOQGV4YW1wbGUuY29tXCI7XG4gICAgdXNlci5maXJzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlNZUyBBZG1pblwiO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0ZTtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGU7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGdldFB1YmxpY1VzZXIoKTogVXNlciB7XG4gICAgY29uc3QgZGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdXNlcjogVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IFVzZXIuUFVCTElDX0lEO1xuICAgIHVzZXIuZW1haWwgPSBcIlBVQkxJQ0BleGFtcGxlLmNvbVwiO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gXCJQdWJsaWMgVXNlclwiO1xuICAgIHVzZXIubGFzdE5hbWUgPSBcIlB1YmxpYyBVc2VyXCI7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRlO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0ZTtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vUm9sZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vQ3VycmVudFVzZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL09yZ2FuaXphdGlvblwiO1xuZXhwb3J0ICogZnJvbSBcIi4vT3JnYW5pemF0aW9uVXNlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vU2NoZW1hXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9TY2hlbWFVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UYWJsZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vVGFibGVVc2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9Db2x1bW5cIjtcbiIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIGRiTmFtZTogc3RyaW5nO1xuICBkYkhvc3Q6IHN0cmluZztcbiAgZGJQb3J0OiBudW1iZXI7XG4gIGRiVXNlcjogc3RyaW5nO1xuICBkYlBhc3N3b3JkOiBzdHJpbmc7XG4gIGRiUG9vbE1heDogbnVtYmVyO1xuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBoYXN1cmFIb3N0OiBzdHJpbmc7XG4gIGhhc3VyYUFkbWluU2VjcmV0OiBzdHJpbmc7XG4gIHRlc3RJZ25vcmVFcnJvcnM6IGJvb2xlYW47XG4gIHRlc3RVc2VyRW1haWxEb21haW46IHN0cmluZztcbiAgZGVtb0RCUHJlZml4OiBzdHJpbmc7XG4gIGRlbW9EQkxhYmVsOiBzdHJpbmc7XG4gIGxvY2FsQmdGdW5jdGlvblVybDogc3RyaW5nO1xuICBsYW1iZGFCZ0Z1bmN0aW9uTmFtZTogc3RyaW5nO1xuICBhd3NSZWdpb246IHN0cmluZztcbiAgd2JSZW1vdGVTY2hlbWFOYW1lOiBzdHJpbmc7XG4gIHdiUmVtb3RlU2NoZW1hVVJMOiBzdHJpbmc7XG4gIHdiYVJlbW90ZVNjaGVtYU5hbWU6IHN0cmluZztcbiAgd2JhUmVtb3RlU2NoZW1hVVJMOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50ID0ge1xuICBkYk5hbWU6IHByb2Nlc3MuZW52LkRCX05BTUUgYXMgc3RyaW5nLFxuICBkYkhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgYXMgc3RyaW5nLFxuICBkYlBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgXCJcIikgYXMgbnVtYmVyLFxuICBkYlVzZXI6IHByb2Nlc3MuZW52LkRCX1VTRVIgYXMgc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCBhcyBzdHJpbmcsXG4gIGRiUG9vbE1heDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NQVggfHwgXCJcIikgYXMgbnVtYmVyLFxuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogcGFyc2VJbnQoXG4gICAgcHJvY2Vzcy5lbnYuREJfUE9PTF9JRExFX1RJTUVPVVRfTUlMTElTIHx8IFwiXCJcbiAgKSBhcyBudW1iZXIsXG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBwYXJzZUludChcbiAgICBwcm9jZXNzLmVudi5EQl9QT09MX0NPTk5FQ1RJT05fVElNRU9VVF9NSUxMSVMgfHwgXCJcIlxuICApIGFzIG51bWJlcixcbiAgaGFzdXJhSG9zdDogcHJvY2Vzcy5lbnYuSEFTVVJBX0hPU1QgYXMgc3RyaW5nLFxuICBoYXN1cmFBZG1pblNlY3JldDogcHJvY2Vzcy5lbnYuSEFTVVJBX0FETUlOX1NFQ1JFVCBhcyBzdHJpbmcsXG4gIHRlc3RJZ25vcmVFcnJvcnM6IChwcm9jZXNzLmVudi5URVNUX0lHTk9SRV9FUlJPUlMgfHwgZmFsc2UpIGFzIGJvb2xlYW4sXG4gIHRlc3RVc2VyRW1haWxEb21haW46IChcbiAgICAocHJvY2Vzcy5lbnYuVEVTVF9VU0VSX0VNQUlMX0RPTUFJTiB8fCBcIlwiKSBhcyBzdHJpbmdcbiAgKS50b0xvY2FsZUxvd2VyQ2FzZSgpLFxuICBkZW1vREJQcmVmaXg6IHByb2Nlc3MuZW52LkRFTU9fREJfUFJFRklYIGFzIHN0cmluZyxcbiAgZGVtb0RCTGFiZWw6IHByb2Nlc3MuZW52LkRFTU9fREJfTEFCRUwgYXMgc3RyaW5nLFxuICBsb2NhbEJnRnVuY3Rpb25Vcmw6IHByb2Nlc3MuZW52LkxPQ0FMX0JHX0ZVTkNUSU9OX1VSTCBhcyBzdHJpbmcsXG4gIGxhbWJkYUJnRnVuY3Rpb25OYW1lOiBwcm9jZXNzLmVudi5MQU1CREFfQkdfRlVOQ1RJT05fTkFNRSBhcyBzdHJpbmcsXG4gIGF3c1JlZ2lvbjogcHJvY2Vzcy5lbnYuV0JfQVdTX1JFR0lPTiBhcyBzdHJpbmcsXG4gIHdiUmVtb3RlU2NoZW1hTmFtZTogcHJvY2Vzcy5lbnYuV0JfUkVNT1RFX1NDSEVNQV9OQU1FIGFzIHN0cmluZyxcbiAgd2JSZW1vdGVTY2hlbWFVUkw6IHByb2Nlc3MuZW52LldCX1JFTU9URV9TQ0hFTUFfVVJMIGFzIHN0cmluZyxcbiAgd2JhUmVtb3RlU2NoZW1hTmFtZTogcHJvY2Vzcy5lbnYuV0JBX1JFTU9URV9TQ0hFTUFfTkFNRSBhcyBzdHJpbmcsXG4gIHdiYVJlbW90ZVNjaGVtYVVSTDogcHJvY2Vzcy5lbnYuV0JBX1JFTU9URV9TQ0hFTUFfVVJMIGFzIHN0cmluZyxcbn07XG5cbi8vIHdiRXJyb3JDb2RlIDogWyBtZXNzYWdlLCBhcG9sbG9FcnJvckNvZGU/IF1cbmV4cG9ydCBjb25zdCBVU0VSX01FU1NBR0VTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gPSB7XG4gIC8vIFVzZXJzXG4gIFdCX1VTRVJfRVhJU1RTOiBbXCJUaGlzIHVzZXIgYWxyZWFkeSBleGlzdHNcIl0sXG4gIFdCX1VTRVJfTk9UX0ZPVU5EOiBbXCJVc2VyIG5vdCBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSB1c2VycyB3ZXJlIG5vdCBmb3VuZC5cIl0sXG4gIFdCX1BBU1NXT1JEX1JFU0VUX0lOU1RSVUNUSU9OU19TRU5UOiBbXG4gICAgXCJQYXNzd29yZCByZXNldCBpbnN0cnVjdGlvbnMgaGF2ZSBiZWVuIHNlbnQgdG8geW91ciBFLW1haWwuXCIsXG4gIF0sXG4gIC8vIE9yZ2FuaXphdGlvbnNcbiAgV0JfT1JHQU5JWkFUSU9OX05PVF9GT1VORDogW1wiT3JnYW5pemF0aW9uIG5vdCBmb3VuZC5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfT1JHQU5JWkFUSU9OX1VSTF9OT1RfRk9VTkQ6IFtcbiAgICBcIlRoaXMgT3JnYW5pemF0aW9uIFVSTCBjb3VsZCBub3QgYmUgZm91bmQuIFBsZWFzZSBDaGVjayB0aGUgc3BlbGxpbmcgb3RoZXJ3aXNlIGNvbnRhY3QgeW91ciBTeXN0ZW0gQWRtaW5pc3RyYXRvci5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX09SR0FOSVpBVElPTl9OQU1FX1RBS0VOOiBbXG4gICAgXCJUaGlzIE9yZ2FuaXphdGlvbiBuYW1lIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4uXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFk6IFtcbiAgICBcIlRoaXMgb3JnYW5pemF0aW9uIHN0aWxsIGhhcyBub24tYWRtaW5pc3RyYXRpdmUgdXNlcnMuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9PUkdBTklaQVRJT05fTk9fQURNSU5TOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgYWxsIEFkbWluaXN0cmF0b3JzIGZyb20gYW4gT3JnYW5pemF0aW9uIC0geW91IG11c3QgbGVhdmUgYXQgbGVhc3Qgb25lLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfVVNFUl9OT1RfSU5fT1JHOiBbXCJVc2VyIG11c3QgYmUgaW4gT3JnYW5pemF0aW9uXCJdLFxuICBXQl9VU0VSX05PVF9TQ0hFTUFfT1dORVI6IFtcIlRoZSBjdXJyZW50IHVzZXIgaXMgbm90IHRoZSBvd25lci5cIl0sXG4gIFdCX09SR0FOSVpBVElPTl9VUkxfRk9SQklEREVOOiBbXG4gICAgXCJTb3JyeSB5b3UgZG8gbm90IGhhdmUgYWNjZXNzIHRvIHRoaXMgT3JnYW5pemF0aW9uLiBQbGVhc2UgY29udGFjdCB5b3VyIFN5c3RlbSBBZG1pbmlzdHJhdG9yLlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgLy8gU2NoZW1hc1xuICBXQl9OT19TQ0hFTUFTX0ZPVU5EOiBbXG4gICAgXCJZb3UgZG9u4oCZdCBoYXZlIGFjY2VzcyB0byBhbnkgRGF0YWJhc2VzLiBQbGVhc2UgY29udGFjdCB5b3VyIFN5c3RlbSBBZG1pbmlzdHJhdG9yIGZvciBhY2Nlc3MgdG8gYW4gZXhpc3RpbmcgRGF0YWJhc2Ugb3IgY3JlYXRlIGEgbmV3IERhdGFiYXNlIGJlbG93LlwiLFxuICBdLFxuICBXQl9TQ0hFTUFfTk9UX0ZPVU5EOiBbXCJEYXRhYmFzZSBjb3VsZCBub3QgYmUgZm91bmQuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX1NDSEVNQV9VUkxfTk9UX0ZPVU5EOiBbXG4gICAgXCJUaGlzIERhdGFiYXNlIFVSTCBjb3VsZCBub3QgYmUgZm91bmQuIFBsZWFzZSBDaGVjayB0aGUgc3BlbGxpbmcgb3RoZXJ3aXNlIGNvbnRhY3QgeW91ciBTeXN0ZW0gQWRtaW5pc3RyYXRvci5cIixcbiAgICBcIkJBRF9VU0VSX0lOUFVUXCIsXG4gIF0sXG4gIFdCX1NDSEVNQV9VUkxfRk9SQklEREVOOiBbXG4gICAgXCJTb3JyeSB5b3UgZG8gbm90IGhhdmUgYWNjZXNzIHRvIHRoaXMgRGF0YWJhc2UuIFBsZWFzZSBjb250YWN0IHlvdXIgU3lzdGVtIEFkbWluaXN0cmF0b3IuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9CQURfU0NIRU1BX05BTUU6IFtcbiAgICBcIkRhdGFiYXNlIG5hbWUgY2FuIG5vdCBiZWdpbiB3aXRoICdwZ18nIG9yIGJlIGluIHRoZSByZXNlcnZlZCBsaXN0LlwiLFxuICAgIFwiQkFEX1VTRVJfSU5QVVRcIixcbiAgXSxcbiAgV0JfU0NIRU1BX05BTUVfRVhJU1RTOiBbXCJUaGlzIFNjaGVtYSBuYW1lIGFscmVhZHkgZXhpc3RzXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX0NBTlRfUkVNT1ZFX1NDSEVNQV9VU0VSX09XTkVSOiBbXCJZb3UgY2FuIG5vdCByZW1vdmUgdGhlIERCIFVzZXIgT3duZXJcIl0sXG4gIFdCX0NBTlRfUkVNT1ZFX1NDSEVNQV9BRE1JTjogW1xuICAgIFwiWW91IGNhbiBub3QgcmVtb3ZlIGEgREIgQWRtaW5pc3RyYXRvciBmcm9tIG9uZSBvciBtb3JlIGluZGl2aWR1YWwgdGFibGVzLlwiLFxuICBdLFxuICAvLyBTY2hlbWFzIFVzZXJzXG4gIFdCX1NDSEVNQV9VU0VSU19OT1RfRk9VTkQ6IFtcIk9uZSBvciBtb3JlIFNjaGVtYSBVc2VycyBub3QgZm91bmQuXCJdLFxuICBXQl9TQ0hFTUFfTk9fQURNSU5TOiBbXG4gICAgXCJZb3UgY2FuIG5vdCByZW1vdmUgYWxsIEFkbWluaXN0cmF0b3JzIGZyb20gYSBzY2hlbWEgLSB5b3UgbXVzdCBsZWF2ZSBhdCBsZWFzdCBvbmUuXCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICAvLyBUYWJsZXNcbiAgV0JfVEFCTEVfTk9UX0ZPVU5EOiBbXCJUYWJsZSBjb3VsZCBub3QgYmUgZm91bmQuXCJdLFxuICBXQl9UQUJMRV9OQU1FX0VYSVNUUzogW1wiVGhpcyBUYWJsZSBuYW1lIGFscmVhZHkgZXhpc3RzXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX0NPTFVNTl9OQU1FX0VYSVNUUzogW1wiVGhpcyBDb2x1bW4gbmFtZSBhbHJlYWR5IGV4aXN0cy5cIiwgXCJCQURfVVNFUl9JTlBVVFwiXSxcbiAgV0JfQ09MVU1OX05PVF9GT1VORDogW1wiVGhpcyBDb2x1bW4gZG9lcyBub3QgZXhpc3QuXCIsIFwiQkFEX1VTRVJfSU5QVVRcIl0sXG4gIFdCX1BLX0VYSVNUUzogW1wiUmVtb3ZlIGV4aXN0aW5nIHByaW1hcnkga2V5IGZpcnN0LlwiLCBcIkJBRF9VU0VSX0lOUFVUXCJdLFxuICBXQl9GS19FWElTVFM6IFtcbiAgICBcIlJlbW92ZSBleGlzdGluZyBmb3JlaWduIGtleSBvbiB0aGUgY29sdW1uIGZpcnN0XCIsXG4gICAgXCJCQURfVVNFUl9JTlBVVFwiLFxuICBdLFxuICBXQl9OT19ERUZBVUxUX09OX0NPTFVNTjogW1wiVGhpcyBjb2x1bW4gZG9lcyBub3QgaGF2ZSBhIGRlZmF1bHQgdmFsdWUgc2V0XCJdLFxuICAvLyBUYWJsZSBVc2VycyxcbiAgV0JfVEFCTEVfVVNFUlNfTk9UX0ZPVU5EOiBbXCJPbmUgb3IgbW9yZSBUYWJsZSBVc2VycyBub3QgZm91bmQuXCJdLFxuICAvLyBSb2xlc1xuICBST0xFX05PVF9GT1VORDogW1wiVGhpcyByb2xlIGNvdWxkIG5vdCBiZSBmb3VuZC5cIl0sXG4gIFdCX0ZPUkJJRERFTjogW1wiWW91IGFyZSBub3QgcGVybWl0dGVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uXCIsIFwiRk9SQklEREVOXCJdLFxufTtcbiIsIi8vIGh0dHBzOi8vYWx0cmltLmlvL3Bvc3RzL2F4aW9zLWh0dHAtY2xpZW50LXVzaW5nLXR5cGVzY3JpcHRcblxuaW1wb3J0IGF4aW9zLCB7IEF4aW9zSW5zdGFuY2UsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IGVudiB9IGZyb20gXCJwcm9jZXNzXCI7XG5pbXBvcnQgeyBDb2x1bW4gfSBmcm9tIFwiLi9lbnRpdHlcIjtcbmltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgZXJyUmVzdWx0LCBsb2cgfSBmcm9tIFwiLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmNvbnN0IGhlYWRlcnM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW4+PiA9IHtcbiAgQWNjZXB0OiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gIFwieC1oYXN1cmEtYWRtaW4tc2VjcmV0XCI6IGVudmlyb25tZW50Lmhhc3VyYUFkbWluU2VjcmV0LFxufTtcblxuY2xhc3MgSGFzdXJhQXBpIHtcbiAgc3RhdGljIElHTk9SRV9FUlJPUlMgPSBmYWxzZTtcbiAgc3RhdGljIEhBU1VSQV9JR05PUkVfQ09ERVM6IHN0cmluZ1tdID0gW1xuICAgIFwiYWxyZWFkeS11bnRyYWNrZWRcIixcbiAgICBcImFscmVhZHktdHJhY2tlZFwiLFxuICAgIFwibm90LWV4aXN0c1wiLCAvLyBkcm9wcGluZyBhIHJlbGF0aW9uc2hpcFxuICAgIFwiYWxyZWFkeS1leGlzdHNcIixcbiAgICBcInVuZXhwZWN0ZWRcIixcbiAgICBcInBlcm1pc3Npb24tZGVuaWVkXCIsXG4gIF07XG5cbiAgcHJpdmF0ZSBpbnN0YW5jZTogQXhpb3NJbnN0YW5jZSB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZ2V0IGh0dHAoKTogQXhpb3NJbnN0YW5jZSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zdGFuY2UgIT0gbnVsbCA/IHRoaXMuaW5zdGFuY2UgOiB0aGlzLmluaXRIYXN1cmFBcGkoKTtcbiAgfVxuXG4gIGluaXRIYXN1cmFBcGkoKSB7XG4gICAgY29uc3QgaHR0cCA9IGF4aW9zLmNyZWF0ZSh7XG4gICAgICBiYXNlVVJMOiBlbnZpcm9ubWVudC5oYXN1cmFIb3N0LFxuICAgICAgaGVhZGVycyxcbiAgICAgIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXG4gICAgfSk7XG5cbiAgICB0aGlzLmluc3RhbmNlID0gaHR0cDtcbiAgICByZXR1cm4gaHR0cDtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIGVycklnbm9yZSgpIHtcbiAgICBpZiAodGhpcy5JR05PUkVfRVJST1JTIHx8IGVudmlyb25tZW50LnRlc3RJZ25vcmVFcnJvcnMpIHtcbiAgICAgIHJldHVybiB0aGlzLkhBU1VSQV9JR05PUkVfQ09ERVM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIHRyeSB7XG4gICAgICBsb2cuaW5mbyhgaGFzdXJhQXBpLnBvc3Q6IHR5cGU6ICR7dHlwZX1gLCBhcmdzKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5odHRwLnBvc3Q8YW55LCBBeGlvc1Jlc3BvbnNlPihcbiAgICAgICAgXCIvdjEvbWV0YWRhdGFcIixcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgYXJnczogYXJncyxcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogcmVzcG9uc2UsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgaWYgKGVycm9yLnJlc3BvbnNlICYmIGVycm9yLnJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgaWYgKCFIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMoZXJyb3IucmVzcG9uc2UuZGF0YS5jb2RlKSkge1xuICAgICAgICAgIGxvZy5lcnJvcihcbiAgICAgICAgICAgIFwiZXJyb3IucmVzcG9uc2UuZGF0YTogXCIgKyBKU09OLnN0cmluZ2lmeShlcnJvci5yZXNwb25zZS5kYXRhKVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLnJlc3BvbnNlLmRhdGEuZXJyb3IsXG4gICAgICAgICAgICByZWZDb2RlOiBlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUsXG4gICAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gZXJyUmVzdWx0KHtcbiAgICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICAvL2xvZy5pbmZvKGBoYXN1cmFBcGkucG9zdDogcmVzdWx0OiAke0pTT04uc3RyaW5naWZ5KHJlc3VsdCl9YCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3RyYWNrX3RhYmxlXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3VudHJhY2tfdGFibGVcIiwge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgY2FzY2FkZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWxhdGlvbnNoaXBzXG4gICAqL1xuXG4gIC8vIGEgcG9zdCBoYXMgb25lIGF1dGhvciAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZU9iamVjdFJlbGF0aW9uc2hpcChcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLCAvLyBhdXRob3JfaWRcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyAvLyBhdXRob3JzXG4gICkge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVPYmplY3RSZWxhdGlvbnNoaXAoJHtzY2hlbWFOYW1lfSwgJHt0YWJsZU5hbWV9LCAke2NvbHVtbk5hbWV9LCAke3BhcmVudFRhYmxlTmFtZX0pYFxuICAgICk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfY3JlYXRlX29iamVjdF9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHVzaW5nOiB7XG4gICAgICAgIGZvcmVpZ25fa2V5X2NvbnN0cmFpbnRfb246IGNvbHVtbk5hbWUsIC8vIGF1dGhvcl9pZFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgIHJlc3VsdC5yZWZDb2RlICYmXG4gICAgICBIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiByZXN1bHQucmVmQ29kZSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGFuIGF1dGhvciBoYXMgbWFueSBwb3N0cyAoY29uc3RyYWludCBwb3N0cy5hdXRob3JfaWQgLT4gYXV0aG9ycy5pZClcbiAgcHVibGljIGFzeW5jIGNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZywgLy8gYXV0aG9yc1xuICAgIGNoaWxkVGFibGVOYW1lOiBzdHJpbmcsIC8vIHBvc3RzXG4gICAgY2hpbGRDb2x1bW5OYW1lczogc3RyaW5nW10gLy8gYXV0aG9yX2lkXG4gICkge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGhhc3VyYUFwaS5jcmVhdGVBcnJheVJlbGF0aW9uc2hpcCgke3NjaGVtYU5hbWV9LCAke3RhYmxlTmFtZX0sICR7Y2hpbGRUYWJsZU5hbWV9LCAke2NoaWxkQ29sdW1uTmFtZXN9KWBcbiAgICApO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2NyZWF0ZV9hcnJheV9yZWxhdGlvbnNoaXBcIiwge1xuICAgICAgbmFtZTogYGFycl8ke3RhYmxlTmFtZX1fJHtjaGlsZFRhYmxlTmFtZX1gLCAvLyBhcnJfYXV0aG9yc19wb3N0c1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgIH0sXG4gICAgICB1c2luZzoge1xuICAgICAgICBmb3JlaWduX2tleV9jb25zdHJhaW50X29uOiB7XG4gICAgICAgICAgY29sdW1uOiBjaGlsZENvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgICB0YWJsZToge1xuICAgICAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgbmFtZTogY2hpbGRUYWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgIXJlc3VsdC5zdWNjZXNzICYmXG4gICAgICByZXN1bHQucmVmQ29kZSAmJlxuICAgICAgSGFzdXJhQXBpLmVycklnbm9yZSgpLmluY2x1ZGVzKHJlc3VsdC5yZWZDb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcGF5bG9hZDogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzdWx0LnJlZkNvZGUsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZHJvcFJlbGF0aW9uc2hpcHMoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLCAvLyBwb3N0c1xuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nIC8vIGF1dGhvcnNcbiAgKSB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2Ryb3BfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgfSxcbiAgICAgIHJlbGF0aW9uc2hpcDogYG9ial8ke3RhYmxlTmFtZX1fJHtwYXJlbnRUYWJsZU5hbWV9YCwgLy8gb2JqX3Bvc3RzX2F1dGhvcnNcbiAgICB9KTtcbiAgICBpZiAoXG4gICAgICAhcmVzdWx0LnN1Y2Nlc3MgJiZcbiAgICAgICghcmVzdWx0LnJlZkNvZGUgfHxcbiAgICAgICAgKHJlc3VsdC5yZWZDb2RlICYmICFIYXN1cmFBcGkuZXJySWdub3JlKCkuaW5jbHVkZXMocmVzdWx0LnJlZkNvZGUpKSlcbiAgICApIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX2Ryb3BfcmVsYXRpb25zaGlwXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogcGFyZW50VGFibGVOYW1lLCAvLyBhdXRob3JzXG4gICAgICB9LFxuICAgICAgcmVsYXRpb25zaGlwOiBgYXJyXyR7cGFyZW50VGFibGVOYW1lfV8ke3RhYmxlTmFtZX1gLCAvLyBhcnJfYXV0aG9yc19wb3N0c1xuICAgIH0pO1xuICAgIGlmIChcbiAgICAgICFyZXN1bHQuc3VjY2VzcyAmJlxuICAgICAgcmVzdWx0LnJlZkNvZGUgJiZcbiAgICAgIEhhc3VyYUFwaS5lcnJJZ25vcmUoKS5pbmNsdWRlcyhyZXN1bHQucmVmQ29kZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5yZWZDb2RlLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFBlcm1pc3Npb25zXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVQZXJtaXNzaW9uKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBwZXJtaXNzaW9uQ2hlY2s6IG9iamVjdCxcbiAgICB0eXBlOiBzdHJpbmcsXG4gICAgcm9sZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5zOiBzdHJpbmdbXVxuICApIHtcbiAgICBjb25zdCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xuICAgICAgdGFibGU6IHtcbiAgICAgICAgc2NoZW1hOiBzY2hlbWFOYW1lLFxuICAgICAgICBuYW1lOiB0YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgcm9sZTogcm9sZU5hbWUsXG4gICAgICBwZXJtaXNzaW9uOiB7XG4gICAgICAgIGNvbHVtbnM6IGNvbHVtbnMsXG4gICAgICAgIC8vIGZpbHRlcjogcGVybWlzc2lvbkNoZWNrLFxuICAgICAgICAvLyBjaGVjazogcGVybWlzc2lvbkNoZWNrLFxuICAgICAgfSxcbiAgICB9O1xuICAgIC8vIGh0dHBzOi8vaGFzdXJhLmlvL2RvY3MvbGF0ZXN0L2dyYXBocWwvY29yZS9hcGktcmVmZXJlbmNlL21ldGFkYXRhLWFwaS9wZXJtaXNzaW9uLmh0bWxcbiAgICBpZiAodHlwZSA9PSBcImluc2VydFwiKSB7XG4gICAgICBwYXlsb2FkLnBlcm1pc3Npb24uY2hlY2sgPSBwZXJtaXNzaW9uQ2hlY2s7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBheWxvYWQucGVybWlzc2lvbi5maWx0ZXIgPSBwZXJtaXNzaW9uQ2hlY2s7XG4gICAgfVxuICAgIGlmICh0eXBlID09IFwic2VsZWN0XCIpIHtcbiAgICAgIHBheWxvYWQucGVybWlzc2lvbi5hbGxvd19hZ2dyZWdhdGlvbnMgPSB0cnVlO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoYHBnX2NyZWF0ZV8ke3R5cGV9X3Blcm1pc3Npb25gLCBwYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVBlcm1pc3Npb24oXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyxcbiAgICByb2xlTmFtZTogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChgcGdfZHJvcF8ke3R5cGV9X3Blcm1pc3Npb25gLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICByb2xlOiByb2xlTmFtZSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFV0aWxcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGhlYWx0aENoZWNrKCkge1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICB0cnkge1xuICAgICAgbG9nLmluZm8oXCJoYXN1cmFBcGkuaGVhbHRoQ2hlY2soKVwiKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5odHRwLmdldDxhbnksIEF4aW9zUmVzcG9uc2U+KFwiL2hlYWx0aHpcIiwge1xuICAgICAgICB0aW1lb3V0OiAzMDAwLFxuICAgICAgfSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgICAgICBzdGF0dXNUZXh0OiByZXNwb25zZS5zdGF0dXNUZXh0LFxuICAgICAgICB9LFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgIHZhbHVlczogW0pTT04uc3RyaW5naWZ5KGVycm9yKV0sXG4gICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFJlbW90ZVNjaGVtYShcbiAgICByZW1vdGVTY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgcmVtb3RlU2NoZW1hVVJMOiBzdHJpbmdcbiAgKSB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInJlbW92ZV9yZW1vdGVfc2NoZW1hXCIsIHtcbiAgICAgIG5hbWU6IHJlbW90ZVNjaGVtYU5hbWUsXG4gICAgfSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcyAmJiByZXN1bHQucmVmQ29kZSAmJiByZXN1bHQucmVmQ29kZSA9PSBcIm5vdC1leGlzdHNcIikge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiBgaWdub3JlZDogJHtyZXN1bHQucmVmQ29kZX1gLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcImFkZF9yZW1vdGVfc2NoZW1hXCIsIHtcbiAgICAgIG5hbWU6IHJlbW90ZVNjaGVtYU5hbWUsXG4gICAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIHVybDogcmVtb3RlU2NoZW1hVVJMLFxuICAgICAgICBoZWFkZXJzOiBbXSxcbiAgICAgICAgZm9yd2FyZF9jbGllbnRfaGVhZGVyczogdHJ1ZSxcbiAgICAgICAgdGltZW91dF9zZWNvbmRzOiAxMjAwLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbG9hZE1ldGFkYXRhKCkge1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnBvc3QoXCJyZWxvYWRfbWV0YWRhdGFcIiwge30pO1xuICB9XG59XG5cbmV4cG9ydCBjb25zdCBoYXN1cmFBcGkgPSBuZXcgSGFzdXJhQXBpKCk7XG4iLCJleHBvcnQgY29uc3QgREVGQVVMVF9QT0xJQ1k6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGFueT4+ID0ge1xuICAvLyBPcmdhbml6YXRpb25zXG4gIGFjY2Vzc19vcmdhbml6YXRpb246IHtcbiAgICByb2xlTGV2ZWw6IFwib3JnYW5pemF0aW9uXCIsXG4gICAgZGVzY3JpcHRpb246IFwiQWNjZXNzIHRoaXMgT3JnYW5pemF0aW9uXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcbiAgICAgIFwib3JnYW5pemF0aW9uX2V4dGVybmFsX3VzZXJcIixcbiAgICAgIFwib3JnYW5pemF0aW9uX3VzZXJcIixcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICBdLFxuICB9LFxuICBhZG1pbmlzdGVyX29yZ2FuaXphdGlvbjoge1xuICAgIHJvbGVMZXZlbDogXCJvcmdhbml6YXRpb25cIixcbiAgICBkZXNjcmlwdGlvbjogXCJBZG1pbmlzdGVyIHRoaXMgT3JnYW5pemF0aW9uXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICBlZGl0X29yZ2FuaXphdGlvbjoge1xuICAgIHJvbGVMZXZlbDogXCJvcmdhbml6YXRpb25cIixcbiAgICBkZXNjcmlwdGlvbjogXCJFZGl0IHRoaXMgT3JnYW5pemF0aW9uXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICBtYW5hZ2VfYWNjZXNzX3RvX29yZ2FuaXphdGlvbjoge1xuICAgIHJvbGVMZXZlbDogXCJvcmdhbml6YXRpb25cIixcbiAgICBkZXNjcmlwdGlvbjogXCJNYW5hZ2UgQWNjZXNzIHRvIHRoaXMgT3JnYW5pemF0aW9uXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICAvLyBTY2hlbWFzXG4gIHJlYWRfc2NoZW1hOiB7XG4gICAgcm9sZUxldmVsOiBcInNjaGVtYVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgdGhpcyBTY2hlbWFcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJzY2hlbWFfcmVhZGVyXCIsXG4gICAgICBcInNjaGVtYV9lZGl0b3JcIixcbiAgICAgIFwic2NoZW1hX21hbmFnZXJcIixcbiAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICAgIFwic2NoZW1hX293bmVyXCIsXG4gICAgXSxcbiAgfSxcbiAgYWx0ZXJfc2NoZW1hOiB7XG4gICAgcm9sZUxldmVsOiBcInNjaGVtYVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkFsdGVyIHRoaXMgRGF0YWJhc2VcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJzY2hlbWFfZWRpdG9yXCIsXG4gICAgICBcInNjaGVtYV9tYW5hZ2VyXCIsXG4gICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICBcInNjaGVtYV9vd25lclwiLFxuICAgIF0sXG4gIH0sXG4gIG1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hOiB7XG4gICAgcm9sZUxldmVsOiBcInNjaGVtYVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIk1hbmFnZSBBY2Nlc3MgdG8gdGhpcyBEYXRhYmFzZVwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXCJzY2hlbWFfbWFuYWdlclwiLCBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsIFwic2NoZW1hX293bmVyXCJdLFxuICB9LFxuICAvLyBUYWJsZXNcbiAgcmVhZF90YWJsZToge1xuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgdGhpcyBUYWJsZVwiLFxuICAgIHBlcm1pdHRlZFJvbGVzOiBbXG4gICAgICBcInRhYmxlX3JlYWRlclwiLFxuICAgICAgXCJ0YWJsZV9lZGl0b3JcIixcbiAgICAgIFwidGFibGVfbWFuYWdlclwiLFxuICAgICAgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgXSxcbiAgfSxcbiAgYWx0ZXJfdGFibGU6IHtcbiAgICByb2xlTGV2ZWw6IFwidGFibGVcIixcbiAgICBkZXNjcmlwdGlvbjogXCJBbHRlciB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX21hbmFnZXJcIiwgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCJdLFxuICB9LFxuICBtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiTWFuYWdlIEFjY2VzcyB0byB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX2FkbWluaXN0cmF0b3JcIl0sXG4gIH0sXG4gIHJlYWRfdGFibGVfcmVjb3Jkczoge1xuICAgIHJvbGVMZXZlbDogXCJ0YWJsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgUmVjb3JkcyBmcm9tIHRoaXMgVGFibGVcIixcbiAgICBwZXJtaXR0ZWRSb2xlczogW1xuICAgICAgXCJ0YWJsZV9yZWFkZXJcIixcbiAgICAgIFwidGFibGVfZWRpdG9yXCIsXG4gICAgICBcInRhYmxlX21hbmFnZXJcIixcbiAgICAgIFwidGFibGVfYWRtaW5pc3RyYXRvclwiLFxuICAgIF0sXG4gICAgaGFzdXJhQWN0aW9uczogW1wic2VsZWN0XCJdLFxuICB9LFxuICByZWFkX2FuZF93cml0ZV90YWJsZV9yZWNvcmRzOiB7XG4gICAgcm9sZUxldmVsOiBcInRhYmxlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiUmVhZCBhbmQgV3JpdGUgUmVjb3JkcyB0byB0aGlzIFRhYmxlXCIsXG4gICAgcGVybWl0dGVkUm9sZXM6IFtcInRhYmxlX2VkaXRvclwiLCBcInRhYmxlX21hbmFnZXJcIiwgXCJ0YWJsZV9hZG1pbmlzdHJhdG9yXCJdLFxuICAgIGhhc3VyYUFjdGlvbnM6IFtcInNlbGVjdFwiLCBcImluc2VydFwiLCBcInVwZGF0ZVwiLCBcImRlbGV0ZVwiXSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyB0eXBlRGVmcyBhcyBTY2hlbWEsIHJlc29sdmVycyBhcyBzY2hlbWFSZXNvbHZlcnMgfSBmcm9tIFwiLi9zY2hlbWFcIjtcbmltcG9ydCB7XG4gIHR5cGVEZWZzIGFzIE9yZ2FuaXphdGlvbixcbiAgcmVzb2x2ZXJzIGFzIG9yZ2FuaXphdGlvblJlc29sdmVycyxcbn0gZnJvbSBcIi4vb3JnYW5pemF0aW9uXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyBhcyBVc2VyLCByZXNvbHZlcnMgYXMgdXNlclJlc29sdmVycyB9IGZyb20gXCIuL3VzZXJcIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFRhYmxlLCByZXNvbHZlcnMgYXMgdGFibGVSZXNvbHZlcnMgfSBmcm9tIFwiLi90YWJsZVwiO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tIFwibG9kYXNoXCI7XG5pbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7XG4gIGNvbnN0cmFpbnREaXJlY3RpdmUsXG4gIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbn0gZnJvbSBcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIjtcbmltcG9ydCB7IG1ha2VFeGVjdXRhYmxlU2NoZW1hIH0gZnJvbSBcImdyYXBocWwtdG9vbHNcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcbmNvbnN0IGlzUG9ydFJlYWNoYWJsZSA9IHJlcXVpcmUoXCJpcy1wb3J0LXJlYWNoYWJsZVwiKTtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnk7IG1lc3NhZ2U/OiBzdHJpbmcgfVxuICB8IHtcbiAgICAgIHN1Y2Nlc3M/OiBmYWxzZTtcbiAgICAgIG1lc3NhZ2U/OiBzdHJpbmc7XG4gICAgICByZWZDb2RlPzogc3RyaW5nO1xuICAgICAgd2JDb2RlPzogc3RyaW5nO1xuICAgICAgYXBvbGxvRXJyb3JDb2RlPzogc3RyaW5nO1xuICAgICAgdmFsdWVzPzogc3RyaW5nW107XG4gICAgfTtcblxuZXhwb3J0IHR5cGUgUXVlcnlQYXJhbXMgPSB7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHBhcmFtcz86IGFueVtdO1xufTtcblxuZXhwb3J0IHR5cGUgQ29uc3RyYWludElkID0ge1xuICBjb25zdHJhaW50TmFtZTogc3RyaW5nO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgdGFibGVMYWJlbDogc3RyaW5nO1xuICBjb2x1bW5OYW1lOiBzdHJpbmc7XG4gIGNvbHVtbkxhYmVsOiBzdHJpbmc7XG4gIHJlbFRhYmxlTmFtZT86IHN0cmluZztcbiAgcmVsVGFibGVMYWJlbD86IHN0cmluZztcbiAgcmVsQ29sdW1uTmFtZT86IHN0cmluZztcbiAgcmVsQ29sdW1uTGFiZWw/OiBzdHJpbmc7XG59O1xuXG5jb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogSlNPTiFcbiAgICB3YkNsb3VkQ29udGV4dDogSlNPTiFcbiAgfVxuXG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIHdiVXRpbChmbjogU3RyaW5nISwgdmFsczogSlNPTik6IEpTT04hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdvb2dsZVBvcnRSZWFjaGFibGU6IGF3YWl0IGlzUG9ydFJlYWNoYWJsZSg4MCwgeyBob3N0OiBcImdvb2dsZS5jb21cIiB9KSxcbiAgICAgICAgaGFzdXJhSGVhbHRoQ2hlY2s6IGF3YWl0IGNvbnRleHQud2JDbG91ZC5oYXN1cmFIZWFsdGhDaGVjaygpLFxuICAgICAgICBkYlNlbGVjdDogYXdhaXQgY29udGV4dC53YkNsb3VkLmRiSGVhbHRoQ2hlY2soKSxcbiAgICAgICAgaGVhZGVyczogY29udGV4dC5oZWFkZXJzLFxuICAgICAgICBtdWx0aVZhbHVlSGVhZGVyczogY29udGV4dC5oZWFkZXJzLFxuICAgICAgfTtcbiAgICB9LFxuICAgIHdiQ2xvdWRDb250ZXh0OiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIC8vIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hc3NpZ25EZW1vU2NoZW1hKDIxODc1KTtcbiAgICAgIC8vIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXR1cm4gY29udGV4dC53YkNsb3VkLmNsb3VkQ29udGV4dCgpO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JVdGlsOiBhc3luYyAoXywgeyBmbiwgdmFscyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnV0aWwoY3VycmVudFVzZXIsIGZuLCB2YWxzKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcbiAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBzY2hlbWEgPSBtYWtlRXhlY3V0YWJsZVNjaGVtYSh7XG4gIHR5cGVEZWZzOiBbXG4gICAgY29uc3RyYWludERpcmVjdGl2ZVR5cGVEZWZzLFxuICAgIHR5cGVEZWZzLFxuICAgIE9yZ2FuaXphdGlvbixcbiAgICBVc2VyLFxuICAgIFNjaGVtYSxcbiAgICBUYWJsZSxcbiAgXSxcbiAgcmVzb2x2ZXJzOiBtZXJnZShcbiAgICByZXNvbHZlcnMsXG4gICAgb3JnYW5pemF0aW9uUmVzb2x2ZXJzLFxuICAgIHVzZXJSZXNvbHZlcnMsXG4gICAgc2NoZW1hUmVzb2x2ZXJzLFxuICAgIHRhYmxlUmVzb2x2ZXJzXG4gICksXG4gIHNjaGVtYVRyYW5zZm9ybXM6IFtjb25zdHJhaW50RGlyZWN0aXZlKCldLFxufSk7XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIE9yZ2FuaXphdGlvbiB7XG4gICAgaWQ6IElEIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBsYWJlbDogU3RyaW5nIVxuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBPcmdhbml6YXRpb25Vc2VyIHtcbiAgICBvcmdhbml6YXRpb25JZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZyFcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbnNcbiAgICBcIlwiXCJcbiAgICB3Yk15T3JnYW5pemF0aW9ucyh3aXRoU2V0dGluZ3M6IEJvb2xlYW4pOiBbT3JnYW5pemF0aW9uXVxuICAgIHdiTXlPcmdhbml6YXRpb25CeU5hbWUobmFtZTogU3RyaW5nISwgd2l0aFNldHRpbmdzOiBCb29sZWFuKTogT3JnYW5pemF0aW9uXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWUobmFtZTogU3RyaW5nISk6IE9yZ2FuaXphdGlvblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiT3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICByb2xlTmFtZXM6IFtTdHJpbmddXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXVxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW09yZ2FuaXphdGlvblVzZXJdXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgT3JnYW5pemF0aW9uc1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uKG5hbWU6IFN0cmluZyEsIGxhYmVsOiBTdHJpbmchKTogT3JnYW5pemF0aW9uXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb24oXG4gICAgICBuYW1lOiBTdHJpbmchXG4gICAgICBuZXdOYW1lOiBTdHJpbmdcbiAgICAgIG5ld0xhYmVsOiBTdHJpbmdcbiAgICApOiBPcmdhbml6YXRpb25cbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbihuYW1lOiBTdHJpbmchKTogQm9vbGVhblxuICAgIFwiXCJcIlxuICAgIE9yZ2FuaXphdGlvbiBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgICByb2xlTmFtZTogU3RyaW5nIVxuICAgICk6IEJvb2xlYW5cbiAgICB3YlJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddIVxuICAgICAgb3JnYW5pemF0aW9uTmFtZTogU3RyaW5nIVxuICAgICk6IEJvb2xlYW5cbiAgICB3YlNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgICBvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIC8vIE9yZ2FuaXphdGlvbnNcbiAgICB3Yk15T3JnYW5pemF0aW9uczogYXN5bmMgKF8sIHsgd2l0aFNldHRpbmdzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWNjZXNzaWJsZU9yZ2FuaXphdGlvbnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk15T3JnYW5pemF0aW9uQnlOYW1lOiBhc3luYyAoXywgeyBuYW1lLCB3aXRoU2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JPcmdhbml6YXRpb25CeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBuYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gT3JnYW5pemF0aW9uIFVzZXJzXG4gICAgd2JPcmdhbml6YXRpb25Vc2VyczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgcm9sZU5hbWVzLCB1c2VyRW1haWxzLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQub3JnYW5pemF0aW9uVXNlcnMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHJvbGVOYW1lcyxcbiAgICAgICAgdXNlckVtYWlscyxcbiAgICAgICAgd2l0aFNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gT3JnYW5pemF0aW9uc1xuICAgIHdiQ3JlYXRlT3JnYW5pemF0aW9uOiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVPcmdhbml6YXRpb246IGFzeW5jIChfLCB7IG5hbWUsIG5ld05hbWUsIG5ld0xhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlT3JnYW5pemF0aW9uKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3TmFtZSxcbiAgICAgICAgbmV3TGFiZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YkRlbGV0ZU9yZ2FuaXphdGlvbjogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmRlbGV0ZU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBPcmdhbml6YXRpb24gVXNlcnNcbiAgICB3YlNldE9yZ2FuaXphdGlvblVzZXJzUm9sZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZSxcbiAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiUmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyB1c2VyRW1haWxzLCBvcmdhbml6YXRpb25OYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZU9yZ2FuaXphdGlvblVzZXJTZXR0aW5nczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgb3JnYW5pemF0aW9uTmFtZSwgc2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHNldHRpbmdzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuLi9lbnRpdHlcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5pbXBvcnQgTGFtYmRhIGZyb20gXCJhd3Mtc2RrL2NsaWVudHMvbGFtYmRhXCI7XG5pbXBvcnQgQVdTIGZyb20gXCJhd3Mtc2RrXCI7XG5pbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuLi9lbnZpcm9ubWVudFwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgU2NoZW1hIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgb3JnYW5pemF0aW9uT3duZXJJZDogSW50XG4gICAgdXNlck93bmVySWQ6IEludFxuICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgdXNlck93bmVyRW1haWw6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBTY2hlbWFVc2VyIHtcbiAgICBzY2hlbWFJZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIHNjaGVtYU5hbWU6IFN0cmluZ1xuICAgIHVzZXJFbWFpbDogU3RyaW5nIVxuICAgIHVzZXJGaXJzdE5hbWU6IFN0cmluZ1xuICAgIHVzZXJMYXN0TmFtZTogU3RyaW5nXG4gICAgc2V0dGluZ3M6IEpTT05cbiAgICByb2xlOiBSb2xlXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgU2NoZW1hc1xuICAgIFwiXCJcIlxuICAgIHdiTXlTY2hlbWFzKHdpdGhTZXR0aW5nczogQm9vbGVhbik6IFtTY2hlbWFdXG4gICAgd2JNeVNjaGVtYUJ5TmFtZShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWU6IFN0cmluZ1xuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogU2NoZW1hXG4gICAgd2JTY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihvcmdhbml6YXRpb25OYW1lOiBTdHJpbmchKTogW1NjaGVtYV1cbiAgICBcIlwiXCJcbiAgICBTY2hlbWEgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNjaGVtYVVzZXJzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgcm9sZU5hbWVzOiBbU3RyaW5nXVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ11cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFtTY2hlbWFVc2VyXVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgICAgbmFtZTogU3RyaW5nIVxuICAgICAgbGFiZWw6IFN0cmluZyFcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZTogU3RyaW5nXG4gICAgICB1c2VyT3duZXJFbWFpbDogU3RyaW5nXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICApOiBTY2hlbWFcbiAgICB3YlVwZGF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIG5ld1NjaGVtYU5hbWU6IFN0cmluZ1xuICAgICAgbmV3U2NoZW1hTGFiZWw6IFN0cmluZ1xuICAgICAgbmV3T3JnYW5pemF0aW9uT3duZXJOYW1lOiBTdHJpbmdcbiAgICAgIG5ld1VzZXJPd25lckVtYWlsOiBTdHJpbmdcbiAgICApOiBTY2hlbWFcbiAgICB3YlJlbW92ZU9yRGVsZXRlU2NoZW1hKG5hbWU6IFN0cmluZyEsIGRlbDogQm9vbGVhbik6IEJvb2xlYW4hXG4gICAgd2JJbXBvcnRTY2hlbWEoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVTY2hlbWEoc2NoZW1hTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgU2NoZW1hIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JTZXRTY2hlbWFVc2Vyc1JvbGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGVOYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlU2NoZW1hVXNlcnMoc2NoZW1hTmFtZTogU3RyaW5nISwgdXNlckVtYWlsczogW1N0cmluZ10hKTogQm9vbGVhblxuICAgIHdiU2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhzY2hlbWFOYW1lOiBTdHJpbmchLCBzZXR0aW5nczogSlNPTiEpOiBCb29sZWFuIVxuICB9XG5gO1xuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIC8vIFNjaGVtYXNcbiAgICB3Yk15U2NoZW1hczogYXN5bmMgKF8sIHsgd2l0aFNldHRpbmdzIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWNjZXNzaWJsZVNjaGVtYXMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3Yk15U2NoZW1hQnlOYW1lOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBuYW1lLCBvcmdhbml6YXRpb25OYW1lLCB3aXRoU2V0dGluZ3MgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWNjZXNzaWJsZVNjaGVtYUJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIG9yZ2FuaXphdGlvbk5hbWUsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiU2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXI6IGFzeW5jIChfLCB7IG9yZ2FuaXphdGlvbk5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFNjaGVtYSBVc2Vyc1xuICAgIHdiU2NoZW1hVXNlcnM6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHJvbGVOYW1lcywgdXNlckVtYWlscywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNjaGVtYVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgcm9sZU5hbWVzLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBTY2hlbWFzXG4gICAgd2JBZGRPckNyZWF0ZVNjaGVtYTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgbmFtZSwgbGFiZWwsIG9yZ2FuaXphdGlvbk93bmVyTmFtZSwgdXNlck93bmVyRW1haWwsIGNyZWF0ZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZVNjaGVtYShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVyTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1c2VyT3duZXJFbWFpbCxcbiAgICAgICAgY3JlYXRlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVTY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIG5ld1NjaGVtYU5hbWUsXG4gICAgICAgIG5ld1NjaGVtYUxhYmVsLFxuICAgICAgICBuZXdPcmdhbml6YXRpb25Pd25lck5hbWUsXG4gICAgICAgIG5ld1VzZXJPd25lckVtYWlsLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlU2NoZW1hKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbmV3U2NoZW1hTmFtZSxcbiAgICAgICAgbmV3U2NoZW1hTGFiZWwsXG4gICAgICAgIG5ld09yZ2FuaXphdGlvbk93bmVyTmFtZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICBuZXdVc2VyT3duZXJFbWFpbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiUmVtb3ZlT3JEZWxldGVTY2hlbWE6IGFzeW5jIChfLCB7IG5hbWUsIGRlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZU9yRGVsZXRlU2NoZW1hKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgZGVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JJbXBvcnRTY2hlbWE6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5pbXBvcnRTY2hlbWEoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVTY2hlbWE6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVTY2hlbWEoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgLy8gU2NoZW1hIFVzZXJzXG4gICAgd2JTZXRTY2hlbWFVc2Vyc1JvbGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHVzZXJFbWFpbHMsIHJvbGVOYW1lIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNldFNjaGVtYVVzZXJzUm9sZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVTY2hlbWFVc2VyczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgdXNlckVtYWlscyB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlbW92ZVNjaGVtYVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZVNjaGVtYVVzZXJTZXR0aW5nczogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgc2V0dGluZ3MgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEdyYXBoUUxKU09OIH0gZnJvbSBcImdyYXBocWwtdHlwZS1qc29uXCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuLi9lbnRpdHlcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgc2NhbGFyIEpTT05cblxuICB0eXBlIFRhYmxlIHtcbiAgICBpZDogSUQhXG4gICAgc2NoZW1hSWQ6IEludCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICBjb2x1bW5zOiBbQ29sdW1uXVxuICAgIHNjaGVtYU5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBDb2x1bW4ge1xuICAgIGlkOiBJRCFcbiAgICB0YWJsZUlkOiBJbnQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgdHlwZTogU3RyaW5nIVxuICAgIGRlZmF1bHQ6IFN0cmluZ1xuICAgIGlzTnVsbGFibGU6IEJvb2xlYW5cbiAgICBpc1ByaW1hcnlLZXk6IEJvb2xlYW4hXG4gICAgZm9yZWlnbktleXM6IFtDb25zdHJhaW50SWRdIVxuICAgIHJlZmVyZW5jZWRCeTogW0NvbnN0cmFpbnRJZF0hXG4gICAgY3JlYXRlZEF0OiBTdHJpbmchXG4gICAgdXBkYXRlZEF0OiBTdHJpbmchXG4gIH1cblxuICB0eXBlIENvbnN0cmFpbnRJZCB7XG4gICAgY29uc3RyYWludE5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICB0YWJsZUxhYmVsOiBTdHJpbmchXG4gICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgIGNvbHVtbkxhYmVsOiBTdHJpbmchXG4gICAgcmVsVGFibGVOYW1lOiBTdHJpbmdcbiAgICByZWxUYWJsZUxhYmVsOiBTdHJpbmdcbiAgICByZWxDb2x1bW5OYW1lOiBTdHJpbmdcbiAgICByZWxDb2x1bW5MYWJlbDogU3RyaW5nXG4gIH1cblxuICB0eXBlIFRhYmxlVXNlciB7XG4gICAgdGFibGVJZDogSW50IVxuICAgIHVzZXJJZDogSW50IVxuICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICB1c2VyRmlyc3ROYW1lOiBTdHJpbmdcbiAgICB1c2VyTGFzdE5hbWU6IFN0cmluZ1xuICAgIHNldHRpbmdzOiBKU09OXG4gICAgcm9sZTogUm9sZVxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgZXh0ZW5kIHR5cGUgUXVlcnkge1xuICAgIFwiXCJcIlxuICAgIFRhYmxlc1xuICAgIFwiXCJcIlxuICAgIHdiTXlUYWJsZXMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB3aXRoQ29sdW1uczogQm9vbGVhblxuICAgICAgd2l0aFNldHRpbmdzOiBCb29sZWFuXG4gICAgKTogW1RhYmxlXVxuICAgIHdiTXlUYWJsZUJ5TmFtZShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgd2l0aENvbHVtbnM6IEJvb2xlYW5cbiAgICAgIHdpdGhTZXR0aW5nczogQm9vbGVhblxuICAgICk6IFRhYmxlXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlRhYmxlVXNlcnMoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHVzZXJFbWFpbHM6IFtTdHJpbmddXG4gICAgICB3aXRoU2V0dGluZ3M6IEJvb2xlYW5cbiAgICApOiBbVGFibGVVc2VyXVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkNvbHVtbnMoc2NoZW1hTmFtZTogU3RyaW5nISwgdGFibGVOYW1lOiBTdHJpbmchKTogW0NvbHVtbl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBUYWJsZXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTGFiZWw6IFN0cmluZyFcbiAgICAgIGNyZWF0ZTogQm9vbGVhblxuICAgICk6IFRhYmxlIVxuICAgIHdiVXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIG5ld1RhYmxlTmFtZTogU3RyaW5nXG4gICAgICBuZXdUYWJsZUxhYmVsOiBTdHJpbmdcbiAgICApOiBUYWJsZSFcbiAgICB3YlJlbW92ZU9yRGVsZXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JBZGRBbGxFeGlzdGluZ1RhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkFkZEV4aXN0aW5nVGFibGUoc2NoZW1hTmFtZTogU3RyaW5nISwgdGFibGVOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkFkZEFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZXM6IFtTdHJpbmddIVxuICAgICAgcGFyZW50VGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBwYXJlbnRDb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBjcmVhdGU6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiUmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lczogW1N0cmluZ10hXG4gICAgICBwYXJlbnRUYWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGRlbDogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgVGFibGUgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlNldFRhYmxlVXNlcnNSb2xlKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWxzOiBbU3RyaW5nXSFcbiAgICAgIHJvbGVOYW1lOiBTdHJpbmchXG4gICAgKTogQm9vbGVhblxuICAgIHdiUmVtb3ZlVGFibGVVc2VycyhcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsczogW1N0cmluZ10hXG4gICAgKTogQm9vbGVhblxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBzZXR0aW5nczogSlNPTiFcbiAgICApOiBCb29sZWFuIVxuICAgIFwiXCJcIlxuICAgIENvbHVtbnNcbiAgICBcIlwiXCJcbiAgICB3YkFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5MYWJlbDogU3RyaW5nIVxuICAgICAgY3JlYXRlOiBCb29sZWFuXG4gICAgICBjb2x1bW5UeXBlOiBTdHJpbmdcbiAgICAgIHN5bmM6IEJvb2xlYW5cbiAgICApOiBCb29sZWFuIVxuICAgIHdiVXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZTogU3RyaW5nIVxuICAgICAgdGFibGVOYW1lOiBTdHJpbmchXG4gICAgICBjb2x1bW5OYW1lOiBTdHJpbmchXG4gICAgICBuZXdDb2x1bW5OYW1lOiBTdHJpbmdcbiAgICAgIG5ld0NvbHVtbkxhYmVsOiBTdHJpbmdcbiAgICAgIG5ld1R5cGU6IFN0cmluZ1xuICAgICAgc3luYzogQm9vbGVhblxuICAgICk6IEJvb2xlYW4hXG4gICAgd2JSZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWU6IFN0cmluZyFcbiAgICAgIHRhYmxlTmFtZTogU3RyaW5nIVxuICAgICAgY29sdW1uTmFtZTogU3RyaW5nIVxuICAgICAgZGVsOiBCb29sZWFuXG4gICAgICBzeW5jOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgICB3YkFkZE9yUmVtb3ZlQ29sdW1uU2VxdWVuY2UoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB0YWJsZU5hbWU6IFN0cmluZyFcbiAgICAgIGNvbHVtbk5hbWU6IFN0cmluZyFcbiAgICAgIG5leHRTZXFOdW1iZXI6IEludFxuICAgICAgcmVtb3ZlOiBCb29sZWFuXG4gICAgKTogQm9vbGVhbiFcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgSlNPTjogR3JhcGhRTEpTT04sXG4gIFF1ZXJ5OiB7XG4gICAgLy8gVGFibGVzXG4gICAgd2JNeVRhYmxlczogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgd2l0aENvbHVtbnMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hY2Nlc3NpYmxlVGFibGVzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiTXlUYWJsZUJ5TmFtZTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCB3aXRoQ29sdW1ucywgd2l0aFNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVUYWJsZUJ5TmFtZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgd2l0aENvbHVtbnMsXG4gICAgICAgIHdpdGhTZXR0aW5nc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFRhYmxlIFVzZXJzXG4gICAgd2JUYWJsZVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbHMsIHdpdGhTZXR0aW5ncyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50YWJsZVVzZXJzKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB1c2VyRW1haWxzLFxuICAgICAgICB3aXRoU2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JDb2x1bW5zOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jb2x1bW5zKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gVGFibGVzXG4gICAgd2JBZGRPckNyZWF0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHRhYmxlTGFiZWwsIGNyZWF0ZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZVRhYmxlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICB0YWJsZUxhYmVsLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIG5ld1RhYmxlTmFtZSwgbmV3VGFibGVMYWJlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVUYWJsZShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgICBuZXdUYWJsZUxhYmVsXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JSZW1vdmVPckRlbGV0ZVRhYmxlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGRlbCB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZVRhYmxlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkFkZEFsbEV4aXN0aW5nVGFibGVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkQWxsRXhpc3RpbmdUYWJsZXMoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRFeGlzdGluZ1RhYmxlOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRFeGlzdGluZ1RhYmxlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHM6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lcywgZGVsIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZU9yRGVsZXRlUHJpbWFyeUtleShcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgIGRlbFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiQWRkT3JDcmVhdGVGb3JlaWduS2V5OiBhc3luYyAoXG4gICAgICBfLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgICBjcmVhdGUsXG4gICAgICB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICAgIHBhcmVudENvbHVtbk5hbWVzLFxuICAgICAgICBjcmVhdGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlRm9yZWlnbktleTogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lLCBjb2x1bW5OYW1lcywgcGFyZW50VGFibGVOYW1lLCBkZWwgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lcyxcbiAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICBkZWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBDb2x1bW5zXG4gICAgd2JBZGRPckNyZWF0ZUNvbHVtbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBjb2x1bW5MYWJlbCxcbiAgICAgICAgY3JlYXRlLFxuICAgICAgICBjb2x1bW5UeXBlLFxuICAgICAgICBzeW5jLFxuICAgICAgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkT3JDcmVhdGVDb2x1bW4oXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWUsXG4gICAgICAgIGNvbHVtbkxhYmVsLFxuICAgICAgICBjcmVhdGUsXG4gICAgICAgIGNvbHVtblR5cGUsXG4gICAgICAgIHN5bmNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlVwZGF0ZUNvbHVtbjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgICBuZXdDb2x1bW5MYWJlbCxcbiAgICAgICAgbmV3VHlwZSxcbiAgICAgICAgc3luYyxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTmFtZSxcbiAgICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICAgIG5ld1R5cGUsXG4gICAgICAgIHN5bmNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlJlbW92ZU9yRGVsZXRlQ29sdW1uOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIGRlbCwgc3luYyB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZW1vdmVPckRlbGV0ZUNvbHVtbihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZSxcbiAgICAgICAgZGVsLFxuICAgICAgICBzeW5jXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JBZGRPclJlbW92ZUNvbHVtblNlcXVlbmNlOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGNvbHVtbk5hbWUsIG5leHRTZXFOdW1iZXIsIHJlbW92ZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRPclJlbW92ZUNvbHVtblNlcXVlbmNlKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lLFxuICAgICAgICBuZXh0U2VxTnVtYmVyLFxuICAgICAgICByZW1vdmVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBUYWJsZSBVc2Vyc1xuICAgIHdiU2V0VGFibGVVc2Vyc1JvbGU6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSwgdXNlckVtYWlscywgcm9sZU5hbWUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgICAgIGN1cnJlbnRVc2VyLFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbHMsXG4gICAgICAgIHJvbGVOYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgY29udGV4dC53YkNsb3VkLmVycihyZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgd2JSZW1vdmVUYWJsZVVzZXJzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJFbWFpbHMgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVtb3ZlVGFibGVVc2VycyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgdXNlckVtYWlsc1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuICAgIHdiU2F2ZVRhYmxlVXNlclNldHRpbmdzOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHNldHRpbmdzIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgc2V0dGluZ3NcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEN1cnJlbnRVc2VyIH0gZnJvbSBcIi4uL2VudGl0eVwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4uL3doaXRlYnJpY2stY2xvdWRcIjtcblxuLyoqXG4gKiBPbmx5IGZpZWxkcyByZWxhdGVkIHRvIGFuIGlzb2xhdGVkIHVzZXIgb3Igcm9sZSBvYmplY3RzIGxpdmUgaGVyZVxuICogRm9yIG9yZ2FuaXphdGlvbi11c2Vycywgc2NoZW1hLXVzZXJzLCB0YWJsZS11c2VycyBzZWUgcmVzcGVjdGl2ZSBjbGFzc2VzXG4gKi9cblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFVzZXIge1xuICAgIGlkOiBJRCFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIGZpcnN0TmFtZTogU3RyaW5nXG4gICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICB9XG5cbiAgdHlwZSBSb2xlIHtcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgaW1wbGllZEZyb206IFN0cmluZ1xuICAgIHBlcm1pc3Npb25zOiBKU09OXG4gIH1cblxuICBleHRlbmQgdHlwZSBRdWVyeSB7XG4gICAgXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlVzZXJCeUlkKGlkOiBJRCEpOiBVc2VyXG4gICAgd2JVc2VyQnlFbWFpbChlbWFpbDogU3RyaW5nISk6IFVzZXJcbiAgICB3YlVzZXJzQnlTZWFyY2hQYXR0ZXJuKHNlYXJjaFBhdHRlcm46IFN0cmluZyEpOiBbVXNlcl1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICBcIlwiXCJcbiAgICBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiU2lnblVwKHVzZXJBdXRoSWQ6IFN0cmluZyEsIHVzZXJPYmo6IEpTT04hKTogQm9vbGVhblxuICAgIHdiQXV0aCh1c2VyQXV0aElkOiBTdHJpbmchKTogSlNPTlxuICAgIHdiQ3JlYXRlVXNlcihcbiAgICAgIGF1dGhJZDogU3RyaW5nXG4gICAgICBlbWFpbDogU3RyaW5nXG4gICAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgICk6IFVzZXJcbiAgICB3YlVwZGF0ZU15UHJvZmlsZShmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5SWQoY3VycmVudFVzZXIsIGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5RW1haWw6IGFzeW5jIChfLCB7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5RW1haWwoY3VycmVudFVzZXIsIGVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlcnNCeVNlYXJjaFBhdHRlcm46IGFzeW5jIChfLCB7IHNlYXJjaFBhdHRlcm4gfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2Vyc0J5U2VhcmNoUGF0dGVybihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHNlYXJjaFBhdHRlcm5cbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICB3YlNpZ25VcDogYXN5bmMgKF8sIHsgdXNlckF1dGhJZCwgdXNlck9iaiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VXNlciA9IGF3YWl0IEN1cnJlbnRVc2VyLmZyb21Db250ZXh0KGNvbnRleHQpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnNpZ25VcChcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIHVzZXJBdXRoSWQsXG4gICAgICAgIHVzZXJPYmpcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YkF1dGg6IGFzeW5jIChfLCB7IHVzZXJBdXRoSWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hdXRoKGN1cnJlbnRVc2VyLCB1c2VyQXV0aElkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiQ3JlYXRlVXNlcjogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgYXV0aElkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LFxuICAgICAgY29udGV4dFxuICAgICkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBhd2FpdCBDdXJyZW50VXNlci5mcm9tQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKFxuICAgICAgICBjdXJyZW50VXNlcixcbiAgICAgICAgYXV0aElkLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBsYXN0TmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHRocm93IGNvbnRleHQud2JDbG91ZC5lcnIocmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlTXlQcm9maWxlOiBhc3luYyAoXywgeyBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXdhaXQgQ3VycmVudFVzZXIuZnJvbUNvbnRleHQoY29udGV4dCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVXNlcihcbiAgICAgICAgY3VycmVudFVzZXIsXG4gICAgICAgIGN1cnJlbnRVc2VyLmlkLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBjb250ZXh0LndiQ2xvdWQuZXJyKHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBBcG9sbG9TZXJ2ZXIsIEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuaW1wb3J0IHsgQmdRdWV1ZSB9IGZyb20gXCIuL2JnLXF1ZXVlXCI7XG5pbXBvcnQgeyBoYXN1cmFBcGkgfSBmcm9tIFwiLi9oYXN1cmEtYXBpXCI7XG5pbXBvcnQgeyBDb25zdHJhaW50SWQsIHNjaGVtYSwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgdiA9IHJlcXVpcmUoXCJ2b2NhXCIpO1xuaW1wb3J0IHsgZW52aXJvbm1lbnQsIFVTRVJfTUVTU0FHRVMgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuaW1wb3J0IHtcbiAgQ29sdW1uLFxuICBPcmdhbml6YXRpb24sXG4gIFJvbGUsXG4gIFJvbGVMZXZlbCxcbiAgU2NoZW1hLFxuICBUYWJsZSxcbiAgVXNlcixcbn0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBDdXJyZW50VXNlciB9IGZyb20gXCIuL2VudGl0eS9DdXJyZW50VXNlclwiO1xuaW1wb3J0IHsgREVGQVVMVF9QT0xJQ1kgfSBmcm9tIFwiLi9wb2xpY3lcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxIYW5kbGVyID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gIHNjaGVtYSxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogKHsgZXZlbnQsIGNvbnRleHQgfSkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBoZWFkZXJzOiBldmVudC5oZWFkZXJzLFxuICAgICAgbXVsdGlWYWx1ZUhlYWRlcnM6IGV2ZW50Lm11bHRpVmFsdWVIZWFkZXJzLFxuICAgICAgd2JDbG91ZDogbmV3IFdoaXRlYnJpY2tDbG91ZCgpLFxuICAgIH07XG4gIH0sXG59KS5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBXaGl0ZWJyaWNrQ2xvdWQge1xuICBkYWwgPSBuZXcgREFMKCk7XG4gIGJnUXVldWUgPSBuZXcgQmdRdWV1ZSh0aGlzLCB0aGlzLmRhbCk7XG5cbiAgcHVibGljIGVycihyZXN1bHQ6IFNlcnZpY2VSZXN1bHQpOiBFcnJvciB7XG4gICAgcmV0dXJuIGFwb2xsb0VycihyZXN1bHQpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gQXV0aCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhdXRoKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VyQXV0aElkOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGF1dGgoJHt1c2VyQXV0aElkfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJJZEZyb21BdXRoSWQodXNlckF1dGhJZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBoYXN1cmFVc2VySWQ6IG51bWJlciA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICBcIlgtSGFzdXJhLUFsbG93ZWQtUm9sZXNcIjogW1wid2J1c2VyXCJdLFxuICAgICAgICBcIlgtSGFzdXJhLURlZmF1bHQtUm9sZVwiOiBcIndidXNlclwiLFxuICAgICAgICBcIlgtSGFzdXJhLVVzZXItSWRcIjogaGFzdXJhVXNlcklkLFxuICAgICAgICBcIlgtSGFzdXJhLUF1dGhlbnRpY2F0ZWQtQXRcIjogRGF0ZSgpLnRvU3RyaW5nKCksXG4gICAgICB9LFxuICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzaWduVXAoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJBdXRoSWQ6IHN0cmluZyxcbiAgICB1c2VyT2JqOiBSZWNvcmQ8c3RyaW5nLCBhbnk+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBzaWduVXAoJHt1c2VyQXV0aElkfSwke0pTT04uc3RyaW5naWZ5KHVzZXJPYmopfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGxldCBlbWFpbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBmaXJzdE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBsZXQgbGFzdE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICAvLyBodHRwczovL2F1dGgwLmNvbS9kb2NzL3J1bGVzL3VzZXItb2JqZWN0LWluLXJ1bGVzXG4gICAgaWYgKHVzZXJPYmouZW1haWwgJiYgdXNlck9iai5lbWFpbC5sZW5ndGggPiAwKSBlbWFpbCA9IHVzZXJPYmouZW1haWw7XG4gICAgaWYgKHVzZXJPYmouZ2l2ZW5fbmFtZSAmJiB1c2VyT2JqLmdpdmVuX25hbWUubGVuZ3RoID4gMCkge1xuICAgICAgZmlyc3ROYW1lID0gdXNlck9iai5naXZlbl9uYW1lO1xuICAgIH1cbiAgICBpZiAodXNlck9iai5mYW1pbHlfbmFtZSAmJiB1c2VyT2JqLmZhbWlseV9uYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgIGxhc3ROYW1lID0gdXNlck9iai5mYW1pbHlfbmFtZTtcbiAgICB9XG4gICAgaWYgKCFmaXJzdE5hbWUgJiYgIWxhc3ROYW1lKSB7XG4gICAgICBpZiAodXNlck9iai5uYW1lICYmIHVzZXJPYmoubmFtZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHNwbGl0OiBzdHJpbmdbXSA9IHVzZXJPYmoubmFtZS5zcGxpdChcIiBcIik7XG4gICAgICAgIGZpcnN0TmFtZSA9IHNwbGl0LnNoaWZ0KCk7XG4gICAgICAgIGxhc3ROYW1lID0gc3BsaXQuam9pbihcIiBcIik7XG4gICAgICB9IGVsc2UgaWYgKHVzZXJPYmoubmlja25hbWUgJiYgdXNlck9iai5uaWNrbmFtZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZpcnN0TmFtZSA9IHVzZXJPYmoubmlja25hbWU7XG4gICAgICB9XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNyZWF0ZVVzZXIoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgdXNlckF1dGhJZCxcbiAgICAgIGVtYWlsLFxuICAgICAgZmlyc3ROYW1lLFxuICAgICAgbGFzdE5hbWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKGVudmlyb25tZW50LmRlbW9EQlByZWZpeCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hc3NpZ25EZW1vU2NoZW1hKHJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFJvbGVzICYgUGVybWlzc2lvbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGByb2xlQnlOYW1lKCR7Y1UuaWR9LCR7bmFtZX0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByb2xlQW5kSWRGb3JVc2VyT2JqZWN0KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICByb2xlTGV2ZWw6IFJvbGVMZXZlbCxcbiAgICBvYmplY3RJZE9yTmFtZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIHBhcmVudE9iamVjdE5hbWU/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgcm9sZUFuZElkRm9yVXNlck9iamVjdCgke2NVLmlkfSwke3VzZXJJZH0sJHtyb2xlTGV2ZWx9LCR7b2JqZWN0SWRPck5hbWV9LCR7cGFyZW50T2JqZWN0TmFtZX0pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpKSByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUFuZElkRm9yVXNlck9iamVjdChcbiAgICAgIHVzZXJJZCxcbiAgICAgIHJvbGVMZXZlbCxcbiAgICAgIG9iamVjdElkT3JOYW1lLFxuICAgICAgcGFyZW50T2JqZWN0TmFtZVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU/OiBUYWJsZSxcbiAgICBzY2hlbWFOYW1lPzogc3RyaW5nLFxuICAgIGRlbGV0ZU9ubHk/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoJHtjVS5pZH0sJHt0YWJsZX0sJHtzY2hlbWFOYW1lfSwke2RlbGV0ZU9ubHl9KWBcbiAgICApO1xuICAgIGxldCB0YWJsZXM6IFRhYmxlW10gPSBbXTtcbiAgICBpZiAodGFibGUpIHtcbiAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCB0YWJsZS5pZCkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICAgIHRhYmxlcyA9IFt0YWJsZV07XG4gICAgfSBlbHNlIGlmIChzY2hlbWFOYW1lKSB7XG4gICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRhYmxlc1Jlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVzKGNVLCBzY2hlbWFOYW1lKTtcbiAgICAgIGlmICghdGFibGVzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZXNSZXN1bHQ7XG4gICAgICB0YWJsZXMgPSB0YWJsZXNSZXN1bHQucGF5bG9hZDtcbiAgICB9XG4gICAgaWYgKHRhYmxlcy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGB0YWJsZXMubGVuZ3RoPT0wIGZvciBkZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiB0YWJsZXMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnModGFibGUuaWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIHNvbWV0aW1lcyB3aGVuIHNldHRpbmcgc2NoZW1hIHJvbGVzLCBjaGlsZCB0YWJsZXMgYXJlIGFkZGVkIGFzeW5jaHJvbm91c2x5IGluIHRoZSBiYWNrZ3JvdW5kXG4gIC8vIGluIHRoaXMgY2FzZSB1c2UgZG9Ob3RQcm9wb2dhdGUgYW5kIHJlLWNhbGwgYWdhaW5zdCB0YWJsZXMgYWZ0ZXIgYmcgcHJvY2VzcyBjb21wbGV0ZXNcbiAgcHVibGljIGFzeW5jIHNldFJvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmcsXG4gICAgcm9sZUxldmVsOiBSb2xlTGV2ZWwsXG4gICAgb2JqZWN0OiBPcmdhbml6YXRpb24gfCBTY2hlbWEgfCBUYWJsZSxcbiAgICBkb05vdFByb3BvZ2F0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgc2V0Um9sZSgke2NVLmlkfSwke3VzZXJJZHN9LCR7cm9sZU5hbWV9LCR7cm9sZUxldmVsfSwke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICBvYmplY3RcbiAgICAgICl9LCR7ZG9Ob3RQcm9wb2dhdGV9KWBcbiAgICApO1xuICAgIC8vIFJCQUMgaW4gc3dpdGNoIGJlbG93XG4gICAgaWYgKCFSb2xlLmlzUm9sZShyb2xlTmFtZSwgcm9sZUxldmVsKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGAke3JvbGVOYW1lfSBpcyBub3QgYSB2YWxpZCBuYW1lIGZvciBhbiAke3JvbGVMZXZlbH0gUm9sZS5gLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBzd2l0Y2ggKHJvbGVMZXZlbCkge1xuICAgICAgY2FzZSBcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbDpcbiAgICAgICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX29yZ2FuaXphdGlvblwiLCBvYmplY3QuaWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAocm9sZU5hbWUpIHtcbiAgICAgICAgICBjYXNlIFwib3JnYW5pemF0aW9uX3VzZXJcIjpcbiAgICAgICAgICAgIC8vIGFyZSBhbnkgb2YgdGhlc2UgdXNlciBjdXJyZW50bHkgYWRtaW5zIGdldHRpbmcgZGVtb3RlZD9cbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uVXNlcnMoY1UsIG9iamVjdC5uYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgICAgICAgICAgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAgICAgICAob3JnYW5pemF0aW9uVXNlcjogeyB1c2VySWQ6IG51bWJlciB9KSA9PiBvcmdhbml6YXRpb25Vc2VyLnVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGRlbW90ZWRBZG1pbnM6IG51bWJlcltdID0gdXNlcklkcy5maWx0ZXIoKGlkOiBudW1iZXIpID0+XG4gICAgICAgICAgICAgIGN1cnJlbnRBZG1pbklkcy5pbmNsdWRlcyhpZClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoZGVtb3RlZEFkbWlucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIC8vIGNvbXBsZXRlbHkgcmVtb3ZlIHRoZW0gKHdpbGwgcmFpc2UgZXJyb3IgaWYgbm8gYWRtaW5zKVxuICAgICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgICBvYmplY3QubmFtZSxcbiAgICAgICAgICAgICAgICBkZW1vdGVkQWRtaW5zXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBhZGQgb3JnbmFpemF0aW9uX3VzZXJcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgICAgIHJvbGVOYW1lLFxuICAgICAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgICAgIG9iamVjdC5pZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fYWRtaW5pc3RyYXRvclwiOlxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICAgICAgICAgICAgb2JqZWN0LmlkLFxuICAgICAgICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXG4gICAgICAgICAgICAgICAgXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1c2VySWRzXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5T3JnYW5pemF0aW9uT3duZXIoY1UsIG9iamVjdC5pZCk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0VGFibGVVc2VyUm9sZXNGcm9tU2NoZW1hUm9sZXMoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmlkLFxuICAgICAgICAgICAgICAgIFJvbGUuc3lzUm9sZU1hcChcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCwgXCJ0YWJsZVwiIGFzIFJvbGVMZXZlbCksXG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHVzZXJJZHNcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJvcmdhbml6YXRpb25fZXh0ZXJuYWxfdXNlclwiOlxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0Um9sZShcbiAgICAgICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICAgICAgcm9sZU5hbWUsXG4gICAgICAgICAgICAgIHJvbGVMZXZlbCxcbiAgICAgICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIG9iamVjdC5pZCkpIHtcbiAgICAgICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYWRkIHNjaGVtYV91c2VyXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIC8vIENoYW5naW5nIHJvbGUgYXQgdGhlIHNjaGVtYSBsZXZlbCByZXNldHMgYWxsXG4gICAgICAgIC8vIHRhYmxlIHJvbGVzIHRvIHRoZSBzY2hlbWEgZGVmYXVsdCBpbmhlcml0ZW5jZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zZXRUYWJsZVVzZXJSb2xlc0Zyb21TY2hlbWFSb2xlcyhcbiAgICAgICAgICBvYmplY3QuaWQsXG4gICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKSwgLy8gZWcgeyBzY2hlbWFfb3duZXI6IFwidGFibGVfYWRtaW5pc3RyYXRvclwiIH1cbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdXNlcklkc1xuICAgICAgICApO1xuICAgICAgICBpZiAoIWRvTm90UHJvcG9nYXRlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVBbmRTZXRUYWJsZVBlcm1pc3Npb25zKFxuICAgICAgICAgICAgY1UsXG4gICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICBvYmplY3QubmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCBvYmplY3QuaWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFJvbGUoXG4gICAgICAgICAgdXNlcklkcyxcbiAgICAgICAgICByb2xlTmFtZSxcbiAgICAgICAgICByb2xlTGV2ZWwsXG4gICAgICAgICAgb2JqZWN0LmlkXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVJvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJJZHM6IG51bWJlcltdLFxuICAgIHJvbGVMZXZlbDogUm9sZUxldmVsLFxuICAgIG9iamVjdElkOiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGRlbGV0ZVJvbGUoJHtjVS5pZH0sJHt1c2VySWRzfSwke3JvbGVMZXZlbH0sJHtvYmplY3RJZH0pYCk7XG4gICAgLy8gcGVybWlzc2lvbiBjaGVja3MgaW4gc3dpdGNoIGJlbG93XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIHN3aXRjaCAocm9sZUxldmVsKSB7XG4gICAgICBjYXNlIFwib3JnYW5pemF0aW9uXCIgYXMgUm9sZUxldmVsOlxuICAgICAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uXCIsIG9iamVjdElkKSkge1xuICAgICAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWxldGUgc2NoZW1hIGFkbWlucyBpbXBsaWNpdGx5IHNldCBmcm9tIG9yZ2FuaXphdGlvbiBhZG1pbnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZShcbiAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgIFwic2NoZW1hXCIsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIG9iamVjdElkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgb3JnYW5pemF0aW9uIGlkXG4gICAgICAgICAgW1wib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIl1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgLy8gRGVsZXRlIHRhYmxlIGFkbWlucyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSBhZG1pbnNcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihjVSwgb2JqZWN0SWQpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBmb3IgKGNvbnN0IHNjaGVtYSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVJvbGUoXG4gICAgICAgICAgICB1c2VySWRzLFxuICAgICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgc2NoZW1hLmlkLCAvLyBwYXJlbnRPYmplY3RJZCBpZSB0aGUgc2NoZW1hIGlkXG4gICAgICAgICAgICBbXCJzY2hlbWFfYWRtaW5pc3RyYXRvclwiXVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKHVzZXJJZHMsIHJvbGVMZXZlbCwgb2JqZWN0SWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19zY2hlbWFcIiwgb2JqZWN0SWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlbGV0ZSB0YWJsZSB1c2VycyBpbXBsaWNpdGx5IHNldCBmcm9tIHNjaGVtYSB1c2Vyc1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVSb2xlKFxuICAgICAgICAgIHVzZXJJZHMsXG4gICAgICAgICAgXCJ0YWJsZVwiLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBvYmplY3RJZCwgLy8gcGFyZW50T2JqZWN0SWQgaWUgdGhlIHNjaGVtYSBpZFxuICAgICAgICAgIE9iamVjdC5rZXlzKFxuICAgICAgICAgICAgUm9sZS5zeXNSb2xlTWFwKFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLCBcInRhYmxlXCIgYXMgUm9sZUxldmVsKVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZSh1c2VySWRzLCByb2xlTGV2ZWwsIG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidGFibGVcIiBhcyBSb2xlTGV2ZWw6XG4gICAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCBvYmplY3RJZCkpIHtcbiAgICAgICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGVsZXRlUm9sZSh1c2VySWRzLCByb2xlTGV2ZWwsIG9iamVjdElkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBVc2VycyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGRlbGV0ZVRlc3RVc2VycygpYCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RVc2VycygpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlJZHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIGlkczogbnVtYmVyW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHVzZXJzQnlJZHMoJHtjVS5pZH0sJHtpZHN9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgLy8gVEJEOiBtYXNrIHNlbnNpdGl2ZSBpbmZvcm1hdGlvblxuICAgIHJldHVybiB0aGlzLmRhbC51c2VycyhpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGNVOiBDdXJyZW50VXNlciwgaWQ6IG51bWJlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGB1c2VyQnlJZCgke2NVLmlkfSwke2lkfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUlkcyhjVSwgW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtpZC50b1N0cmluZygpXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBzZWFyY2hQYXR0ZXJuIGFjcm9zcyBtdWx0aXBsZSBmaWVsZHNcbiAgcHVibGljIGFzeW5jIHVzZXJzQnlTZWFyY2hQYXR0ZXJuKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzZWFyY2hQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHVzZXJzQnlTZWFyY2hQYXR0ZXJuKCR7Y1UuaWR9LCR7c2VhcmNoUGF0dGVybn0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnModW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlYXJjaFBhdHRlcm4pO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlFbWFpbHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHVzZXJFbWFpbHM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGB1c2Vyc0J5RW1haWxzKCR7Y1UuaWR9LCR7dXNlckVtYWlsc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlcnModW5kZWZpbmVkLCB1c2VyRW1haWxzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgZW1haWw6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgdXNlckJ5RW1haWwoJHtjVS5pZH0sJHtlbWFpbH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIFtlbWFpbF0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbZW1haWxdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBhdXRoSWQ/OiBzdHJpbmcsXG4gICAgZW1haWw/OiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lPzogc3RyaW5nLFxuICAgIGxhc3ROYW1lPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGNyZWF0ZVVzZXIoJHtjVS5pZH0sJHthdXRoSWR9LCR7ZW1haWx9LCR7Zmlyc3ROYW1lfSwke2xhc3ROYW1lfSlgXG4gICAgKTtcbiAgICAvLyBhIHRlc3QgdXNlciBjYW4gb25seSBjcmVhdGUgYW5vaHRlciB0ZXN0IHVzZXJcbiAgICBpZiAoXG4gICAgICBlbWFpbCAmJlxuICAgICAgZW1haWwudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChlbnZpcm9ubWVudC50ZXN0VXNlckVtYWlsRG9tYWluKSAmJlxuICAgICAgY1UuaXNudFRlc3RVc2VyKCkgJiZcbiAgICAgIGNVLmlzbnRTeXNBZG1pbigpXG4gICAgKSB7XG4gICAgICByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW5PclRlc3RVc2VyKCk7XG4gICAgfSBlbHNlIGlmIChjVS5pc250U3lzQWRtaW4oKSkge1xuICAgICAgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluKCk7XG4gICAgfVxuICAgIGxldCBleGlzdGluZ1VzZXJSZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgZXJyVmFsdWU6IHN0cmluZyA9IFwiXCI7XG4gICAgaWYgKGF1dGhJZCkge1xuICAgICAgZXhpc3RpbmdVc2VyUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlcklkRnJvbUF1dGhJZChhdXRoSWQpO1xuICAgICAgZXJyVmFsdWUgPSBhdXRoSWQ7XG4gICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgZXhpc3RpbmdVc2VyUmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgZW1haWxcbiAgICAgICk7XG4gICAgICBlcnJWYWx1ZSA9IGVtYWlsO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCB3YW50IHRvIGZpbmQgYW55IGV4aXN0aW5nIHVzZXJzXG4gICAgaWYgKGV4aXN0aW5nVXNlclJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJfRVhJU1RTXCIsXG4gICAgICAgIHZhbHVlczogW2VyclZhbHVlXSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVXNlcihhdXRoSWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZDogbnVtYmVyLFxuICAgIGVtYWlsOiBzdHJpbmcsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcsXG4gICAgbGFzdE5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgdXBkYXRlVXNlcigke2NVLmlkfSwke2lkfSwke2VtYWlsfSwke2ZpcnN0TmFtZX0sJHtsYXN0TmFtZX0pYCk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpICYmIGNVLmlkSXNudChpZCkpIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbk9yU2VsZigpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gT3JnYW5pemF0aW9ucyA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25JZHM/OiBudW1iZXJbXSxcbiAgICBvcmdhbml6YXRpb25OYW1lcz86IHN0cmluZ1tdLFxuICAgIG9yZ2FuaXphdGlvbk5hbWVQYXR0ZXJuPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYG9yZ2FuaXphdGlvbnMoJHtjVS5pZH0sJHtvcmdhbml6YXRpb25JZHN9LCR7b3JnYW5pemF0aW9uTmFtZXN9LCR7b3JnYW5pemF0aW9uTmFtZVBhdHRlcm59KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwub3JnYW5pemF0aW9ucyhcbiAgICAgIG9yZ2FuaXphdGlvbklkcyxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVzLFxuICAgICAgb3JnYW5pemF0aW9uTmFtZVBhdHRlcm5cbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uc0J5SWRzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZHM6IG51bWJlcltdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBvcmdhbml6YXRpb25zQnlJZHMoJHtjVS5pZH0sJHtpZHN9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyhjVSwgaWRzKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBvcmdhbml6YXRpb25CeUlkKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBpZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBvcmdhbml6YXRpb25CeUlkcygke2NVLmlkfSwke2lkfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uc0J5SWRzKGNVLCBbaWRdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbaWQudG9TdHJpbmcoKV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbnNCeU5hbWVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYG9yZ2FuaXphdGlvbnNCeU5hbWVzKCR7Y1UuaWR9LCR7bmFtZXN9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIHRoaXMub3JnYW5pemF0aW9ucyhjVSwgdW5kZWZpbmVkLCBuYW1lcyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYG9yZ2FuaXphdGlvbkJ5TmFtZSgke2NVLmlkfSwke25hbWV9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25zQnlOYW1lcyhjVSwgW25hbWVdKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG9yZ2FuaXphdGlvbkJ5TmFtZVBhdHRlcm4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWVQYXR0ZXJuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYG9yZ2FuaXphdGlvbkJ5TmFtZVBhdHRlcm4oJHtjVS5pZH0sJHtuYW1lUGF0dGVybn0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbnMoXG4gICAgICBjVSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIG5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbbmFtZVBhdHRlcm5dLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBhY2Nlc3NpYmxlT3JnYW5pemF0aW9uQnlOYW1lKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uTmFtZX0sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm9yZ2FuaXphdGlvbnNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFtvcmdhbml6YXRpb25OYW1lXSxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIC8vIGRvZXMgdGhpcyBvcmdhbml6YXRpb24gZXhpc3QgYXQgYWxsIChyZWdhcmRsZXNzIG9mIGFjY2VzcylcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgICApO1xuICAgICAgLy8gcmV0dXJuIG9yZ2FuaXphdGlvbiBub3QgZm91bmRcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAvLyBvdGhlcndpc2UgcmV0dXJuIGZvcmJpZGRlblxuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9GT1JCSURERU5cIixcbiAgICAgICAgdmFsdWVzOiBbb3JnYW5pemF0aW9uTmFtZV0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVPcmdhbml6YXRpb25zKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBhY2Nlc3NpYmxlT3JnYW5pemF0aW9ucygke2NVLmlkfSwke3dpdGhTZXR0aW5nc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwub3JnYW5pemF0aW9uc0J5VXNlcnMoXG4gICAgICBbY1UuaWRdLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPcmdhbml6YXRpb24oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBjcmVhdGVPcmdhbml6YXRpb24oJHtjVS5pZH0sJHtuYW1lfSwke2xhYmVsfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IGNoZWNrTmFtZVJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuYW1lKTtcbiAgICBpZiAoY2hlY2tOYW1lUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05BTUVfVEFLRU5cIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICAvLyBpZSBXQl9PUkdBTklaQVRJT05fTk9UX0ZPVU5EIGlzIHRoZSBkZXNpcmVkIHJlc3VsdFxuICAgIH0gZWxzZSBpZiAoY2hlY2tOYW1lUmVzdWx0LndiQ29kZSAhPSBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIikge1xuICAgICAgcmV0dXJuIGNoZWNrTmFtZVJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgY3JlYXRlT3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuY3JlYXRlT3JnYW5pemF0aW9uKFxuICAgICAgbmFtZSxcbiAgICAgIGxhYmVsXG4gICAgKTtcbiAgICBpZiAoIWNyZWF0ZU9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gY3JlYXRlT3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIG5hbWUsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICBbY1UuaWRdXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBjcmVhdGVPcmdhbml6YXRpb25SZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgbmV3TmFtZT86IHN0cmluZyxcbiAgICBuZXdMYWJlbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgdXBkYXRlT3JnYW5pemF0aW9uKCR7Y1UuaWR9LCR7bmFtZX0sJHtuZXdOYW1lfSwke25ld0xhYmVsfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImVkaXRfb3JnYW5pemF0aW9uXCIsIG5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZU9yZ2FuaXphdGlvbihuYW1lLCBuZXdOYW1lLCBuZXdMYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlT3JnYW5pemF0aW9uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGRlbGV0ZU9yZ2FuaXphdGlvbigke2NVLmlkfSwke25hbWV9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiZWRpdF9vcmdhbml6YXRpb25cIiwgbmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25Vc2VycyhjVSwgbmFtZSwgdW5kZWZpbmVkLCBbXG4gICAgICBcIm9yZ2FuaXphdGlvbl91c2VyXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbl9leHRlcm5hbF91c2VyXCIsXG4gICAgXSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9PUkdBTklaQVRJT05fTk9UX1VTRVJfRU1QVFlcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5kZWxldGVPcmdhbml6YXRpb24obmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBkZWxldGVUZXN0T3JnYW5pemF0aW9ucygke2NVLmlkfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkgJiYgY1UuaXNudFRlc3RVc2VyKCkpIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbk9yVGVzdFVzZXIoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RPcmdhbml6YXRpb25zKCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBPcmdhbml6YXRpb24gVXNlcnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgb3JnYW5pemF0aW9uVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgaWQ/OiBudW1iZXIsXG4gICAgcm9sZU5hbWVzPzogc3RyaW5nW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgb3JnYW5pemF0aW9uVXNlcnMoJHtjVS5pZH0sJHtuYW1lfSwke2lkfSwke3JvbGVOYW1lc30sJHt1c2VyRW1haWxzfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgbGV0IG9yZ2FuaXphdGlvblJlZjogc3RyaW5nIHwgbnVtYmVyID0gXCJcIjtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBuYW1lKTtcbiAgICAgIG9yZ2FuaXphdGlvblJlZiA9IG5hbWU7XG4gICAgfSBlbHNlIGlmIChpZCkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeUlkKGNVLCBpZCk7XG4gICAgICBvcmdhbml6YXRpb25SZWYgPSBpZDtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFjY2Vzc19vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uUmVmKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGlmIChyb2xlTmFtZXMgJiYgIVJvbGUuYXJlUm9sZXMocm9sZU5hbWVzKSkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgXCJvcmdhbml6YXRpb25Vc2Vyczogcm9sZXMgY29udGFpbnMgb25lIG9yIG1vcmUgdW5yZWNvZ25pemVkIHN0cmluZ3NcIixcbiAgICAgICAgdmFsdWVzOiByb2xlTmFtZXMsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGFsLm9yZ2FuaXphdGlvblVzZXJzKFxuICAgICAgbmFtZSxcbiAgICAgIGlkLFxuICAgICAgcm9sZU5hbWVzLFxuICAgICAgdXNlcklkcyxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0T3JnYW5pemF0aW9uVXNlcnNSb2xlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBvcmdhbml6YXRpb25OYW1lOiBzdHJpbmcsXG4gICAgcm9sZU5hbWU6IHN0cmluZyxcbiAgICB1c2VySWRzPzogbnVtYmVyW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHNldE9yZ2FuaXphdGlvblVzZXJzUm9sZSgke2NVLmlkfSwke29yZ2FuaXphdGlvbk5hbWV9LCR7cm9sZU5hbWV9LCR7dXNlcklkc30sJHt1c2VyRW1haWxzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgdXNlcklkc0ZvdW5kOiBudW1iZXJbXSA9IFtdO1xuICAgIGxldCB1c2Vyc1JlcXVlc3RlZDogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdO1xuICAgIGlmICh1c2VySWRzKSB7XG4gICAgICB1c2Vyc1JlcXVlc3RlZCA9IHVzZXJJZHM7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlJZHMoY1UsIHVzZXJJZHMpO1xuICAgIH0gZWxzZSBpZiAodXNlckVtYWlscykge1xuICAgICAgdXNlcnNSZXF1ZXN0ZWQgPSB1c2VyRW1haWxzO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICB9XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcyB8fCAhcmVzdWx0LnBheWxvYWQpIHJldHVybiByZXN1bHQ7XG4gICAgdXNlcklkc0ZvdW5kID0gcmVzdWx0LnBheWxvYWQubWFwKCh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZCk7XG4gICAgaWYgKHVzZXJzUmVxdWVzdGVkLmxlbmd0aCAhPSB1c2VySWRzRm91bmQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IFtcbiAgICAgICAgICBgUmVxdWVzdGVkICR7dXNlcnNSZXF1ZXN0ZWQubGVuZ3RofTogJHt1c2Vyc1JlcXVlc3RlZC5qb2luKFwiLFwiKX1gLFxuICAgICAgICAgIGBGb3VuZCAke3VzZXJJZHNGb3VuZC5sZW5ndGh9OiAke3VzZXJJZHNGb3VuZC5qb2luKFwiLFwiKX1gLFxuICAgICAgICBdLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Um9sZShcbiAgICAgIGNVLFxuICAgICAgdXNlcklkc0ZvdW5kLFxuICAgICAgcm9sZU5hbWUsXG4gICAgICBcIm9yZ2FuaXphdGlvblwiLFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJzRnJvbU9yZ2FuaXphdGlvbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZTogc3RyaW5nLFxuICAgIHVzZXJJZHM/OiBudW1iZXJbXSxcbiAgICB1c2VyRW1haWxzPzogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgcmVtb3ZlVXNlcnNGcm9tT3JnYW5pemF0aW9uKCR7Y1UuaWR9LCR7b3JnYW5pemF0aW9uTmFtZX0sJHt1c2VySWRzfSwke3VzZXJFbWFpbHN9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGxldCB1c2VySWRzVG9CZVJlbW92ZWQ6IG51bWJlcltdID0gW107XG4gICAgaWYgKHVzZXJJZHMpIHVzZXJJZHNUb0JlUmVtb3ZlZCA9IHVzZXJJZHM7XG4gICAgaWYgKHVzZXJFbWFpbHMpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgdXNlcklkc1RvQmVSZW1vdmVkID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIGNoZWNrIG5vdCBhbGwgdGhlIGFkbWlucyB3aWxsIGJlIHJlbW92ZWRcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvblVzZXJzKGNVLCBvcmdhbml6YXRpb25OYW1lLCB1bmRlZmluZWQsIFtcbiAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGFsbEFkbWluSWRzID0gcmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKG9yZ2FuaXphdGlvblVzZXI6IHsgdXNlcklkOiBudW1iZXIgfSkgPT4gb3JnYW5pemF0aW9uVXNlci51c2VySWRcbiAgICApO1xuICAgIGlmIChcbiAgICAgIGFsbEFkbWluSWRzLmV2ZXJ5KChlbGVtOiBudW1iZXIpID0+IHVzZXJJZHNUb0JlUmVtb3ZlZC5pbmNsdWRlcyhlbGVtKSlcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfT1JHQU5JWkFUSU9OX05PX0FETUlOU1wiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3Qgb3JnYW5pemF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoXG4gICAgICBjVSxcbiAgICAgIG9yZ2FuaXphdGlvbk5hbWVcbiAgICApO1xuICAgIGlmICghb3JnYW5pemF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBvcmdhbml6YXRpb25SZXN1bHQ7XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzVG9CZVJlbW92ZWQsXG4gICAgICBcIm9yZ2FuaXphdGlvblwiLFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVNjaGVtYVVzZXJTZXR0aW5ncyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHNldHRpbmdzOiBvYmplY3RcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHNhdmVTY2hlbWFVc2VyU2V0dGluZ3MoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3NldHRpbmdzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlU2NoZW1hVXNlclNldHRpbmdzKFxuICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IFNjaGVtYXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hSWRzPzogbnVtYmVyW10sXG4gICAgc2NoZW1hTmFtZXM/OiBzdHJpbmdbXSxcbiAgICBzY2hlbWFOYW1lUGF0dGVybj86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBzY2hlbWFzKCR7Y1UuaWR9LCR7c2NoZW1hSWRzfSwke3NjaGVtYU5hbWVzfSwke3NjaGVtYU5hbWVQYXR0ZXJufSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXMoXG4gICAgICBzY2hlbWFJZHMsXG4gICAgICBzY2hlbWFOYW1lcyxcbiAgICAgIHNjaGVtYU5hbWVQYXR0ZXJuXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeUlkcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgaWRzOiBudW1iZXJbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgc2NoZW1hcygke2NVLmlkfSwke2lkc30pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFzKGNVLCBpZHMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5SWQoY1U6IEN1cnJlbnRVc2VyLCBpZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHNjaGVtYUJ5SWQoJHtjVS5pZH0sJHtpZH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYXNCeUlkcyhjVSwgW2lkXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW2lkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlOYW1lcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZXM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBzY2hlbWFzQnlOYW1lcygke2NVLmlkfSwke25hbWVzfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLnNjaGVtYXMoY1UsIHVuZGVmaW5lZCwgbmFtZXMpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYUJ5TmFtZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBzY2hlbWFCeU5hbWUoJHtjVS5pZH0sJHtuYW1lfSlgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hc0J5TmFtZXMoY1UsIFtuYW1lXSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkWzBdO1xuICAgICAgaWYgKCFyZXN1bHQucGF5bG9hZCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PVF9GT1VORFwiLFxuICAgICAgICAgIHZhbHVlczogW25hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFCeU5hbWVQYXR0ZXJuKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBuYW1lUGF0dGVybjogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBzY2hlbWFCeU5hbWVQYXR0ZXJuKCR7Y1UuaWR9LCR7bmFtZVBhdHRlcm59KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzKGNVLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZVBhdHRlcm4pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX09SR0FOSVpBVElPTl9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFtuYW1lUGF0dGVybl0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYXNCeVVzZXJPd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdXNlcklkPzogbnVtYmVyLFxuICAgIHVzZXJFbWFpbD86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgc2NoZW1hc0J5VXNlck93bmVyKCR7Y1UuaWR9LCR7dXNlcklkfSwke3VzZXJFbWFpbH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICByZXR1cm4gdGhpcy5kYWwuc2NoZW1hc0J5VXNlck93bmVyKHVzZXJJZCwgdXNlckVtYWlsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgb3JnYW5pemF0aW9uSWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcigke2NVLmlkfSwke29yZ2FuaXphdGlvbklkfSwke29yZ2FuaXphdGlvbk5hbWV9KWBcbiAgICApO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBsZXQgb3JnYW5pemF0aW9uUmVmOiBudW1iZXIgfCBzdHJpbmcgPSBcIlwiO1xuICAgIC8vIGRvZXMgdGhpcyBvcmdhbml6YXRpb24gZXhpc3QgYXQgYWxsIChyZWdhcmRsZXNzIG9mIGFjY2VzcylcbiAgICBpZiAob3JnYW5pemF0aW9uSWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlJZChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgb3JnYW5pemF0aW9uSWRcbiAgICAgICk7XG4gICAgICBvcmdhbml6YXRpb25SZWYgPSBvcmdhbml6YXRpb25JZDtcbiAgICB9IGVsc2UgaWYgKG9yZ2FuaXphdGlvbk5hbWUpIHtcbiAgICAgIG9yZ2FuaXphdGlvblJlZiA9IG9yZ2FuaXphdGlvbk5hbWU7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLm9yZ2FuaXphdGlvbkJ5TmFtZShcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgb3JnYW5pemF0aW9uTmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gcmV0dXJuIG9yZ2FuaXphdGlvbiBub3QgZm91bmRcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWNjZXNzX29yZ2FuaXphdGlvblwiLCBvcmdhbml6YXRpb25SZWYpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lcihcbiAgICAgIGNVLmlkLFxuICAgICAgb3JnYW5pemF0aW9uSWQsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB1c2VySWQ/OiBudW1iZXIsXG4gICAgdXNlckVtYWlsPzogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHNjaGVtYXNCeU9yZ2FuaXphdGlvbk93bmVyQWRtaW4oJHtjVS5pZH0sJHt1c2VySWR9LCR7dXNlckVtYWlsfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFzQnlPcmdhbml6YXRpb25Pd25lckFkbWluKHVzZXJJZCwgdXNlckVtYWlsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgb3JnYW5pemF0aW9uTmFtZT86IHN0cmluZyxcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGFjY2Vzc2libGVTY2hlbWFCeU5hbWUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke29yZ2FuaXphdGlvbk5hbWV9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBjb25zdCBvcmdhbml6YXRpb25SZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICAvLyBpZiBpdCdzIGZyb20gYW4gb3JnYW5pemF0aW9uIFVSTCwgY2hlY2sgaXQgZXhpc3RzXG4gICAgaWYgKG9yZ2FuaXphdGlvbk5hbWUpIHtcbiAgICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgICApO1xuICAgICAgLy8gcmV0dXJucyBvcmdhbml6YXRpb24gbm90IGZvdW5kXG4gICAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIH1cbiAgICAvLyBub3cgY2hlY2sgc2NoZW1hIGV4aXN0c1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKFxuICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgIHNjaGVtYU5hbWVcbiAgICApO1xuICAgIC8vIHJldHVybnMgc2NoZW1hIG5vdCBmb3VuZFxuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgLy8gbm93IGlmIGl0J3MgZnJvbSBhbiBvcmdhbml6YXRpb24gVVJMLCBjaGVjayBmb3IgY29ycmVjdCBvd25lclxuICAgIGlmIChvcmdhbml6YXRpb25OYW1lICYmIG9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBpZiAoXG4gICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLm9yZ2FuaXphdGlvbl9vd25lcl9pZCAhPVxuICAgICAgICBvcmdhbml6YXRpb25SZXN1bHQucGF5bG9hZC5pZFxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9TQ0hFTUFfTk9UX0ZPVU5EXCIsXG4gICAgICAgICAgdmFsdWVzOiBbXG4gICAgICAgICAgICBgJHtzY2hlbWFOYW1lfSBub3QgZm91bmQgZm9yIG9yZ2FuaXphdGlvbiBvd25lciAke29yZ2FuaXphdGlvbk5hbWV9LmAsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChhd2FpdCBjVS5jYW50KFwicmVhZF9zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzQnlVc2VycyhcbiAgICAgIFtjVS5pZF0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBbc2NoZW1hTmFtZV0sXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIGlmICghcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX0ZPUkJJRERFTlwiLFxuICAgICAgICAgIHZhbHVlczogW3NjaGVtYU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2Nlc3NpYmxlU2NoZW1hcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgYWNjZXNzaWJsZVNjaGVtYXMoJHtjVS5pZH0sJHt3aXRoU2V0dGluZ3N9KWApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJzKFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICAvLyBJZiBvcmdhbml6YXRpb25Pd25lciBvcmdhbml6YXRpb24gYWRtaW5zIGFyZSBpbXBsaWNpdGx5IGdyYW50ZWQgc2NoZW1hIGFkbWluIHJvbGVzXG4gIC8vIEFkZGluZyBhIHNjaGVtYSBkb2VzIG5vIGF1dG9tYXRpY2FsbHkgYXNzaWduIHJvbGVzIGZvciBjaGlsZCB0YWJsZXMgc2V0Um9sZShkb05vdFByb3BhZ2F0ZT10cnVlKVxuICBwdWJsaWMgYXN5bmMgYWRkT3JDcmVhdGVTY2hlbWEoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIG9yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgb3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nLFxuICAgIHVzZXJPd25lcklkPzogbnVtYmVyLFxuICAgIHVzZXJPd25lckVtYWlsPzogc3RyaW5nLFxuICAgIGNyZWF0ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgYWRkT3JDcmVhdGVTY2hlbWEoJHtjVS5pZH0sJHtuYW1lfSwke2xhYmVsfSwke29yZ2FuaXphdGlvbk93bmVySWR9LCR7b3JnYW5pemF0aW9uT3duZXJOYW1lfSwke3VzZXJPd25lcklkfSwke3VzZXJPd25lckVtYWlsfSwke2NyZWF0ZX0pYFxuICAgICk7XG4gICAgaWYgKGNVLmlzbnRTaWduZWRJbigpKSByZXR1cm4gY1UubXVzdEJlU2lnbmVkSW4oKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgLy8gcnVuIGNoZWNrcyBmb3Igb3JnYW5pemF0aW9uIG93bmVyXG4gICAgaWYgKG9yZ2FuaXphdGlvbk93bmVySWQgfHwgb3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICBpZiAoIW9yZ2FuaXphdGlvbk93bmVySWQgJiYgb3JnYW5pemF0aW9uT3duZXJOYW1lKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKGNVLCBvcmdhbml6YXRpb25Pd25lck5hbWUpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQgJiZcbiAgICAgICAgKGF3YWl0IGNVLmNhbnQoXCJhY2Nlc3Nfb3JnYW5pemF0aW9uXCIsIG9yZ2FuaXphdGlvbk93bmVySWQpKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSX05PVF9JTl9PUkdcIixcbiAgICAgICAgICB2YWx1ZXM6IFtjVS50b1N0cmluZygpLCBvcmdhbml6YXRpb25Pd25lcklkLnRvU3RyaW5nKCldLFxuICAgICAgICB9KSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodXNlck93bmVyRW1haWwpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwoY1UsIHVzZXJPd25lckVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB1c2VyT3duZXJJZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgIH0gZWxzZSBpZiAoIXVzZXJPd25lcklkKSB7XG4gICAgICB1c2VyT3duZXJJZCA9IGNVLmlkO1xuICAgIH1cbiAgICBpZiAobmFtZS5zdGFydHNXaXRoKFwicGdfXCIpIHx8IFNjaGVtYS5TWVNfU0NIRU1BX05BTUVTLmluY2x1ZGVzKG5hbWUpKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX0JBRF9TQ0hFTUFfTkFNRVwiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBuYW1lKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05BTUVfRVhJU1RTXCIsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRPckNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWUsXG4gICAgICBsYWJlbCxcbiAgICAgIG9yZ2FuaXphdGlvbk93bmVySWQsXG4gICAgICB1c2VyT3duZXJJZCxcbiAgICAgIGNyZWF0ZVxuICAgICk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBpZiAob3JnYW5pemF0aW9uT3duZXJJZCkge1xuICAgICAgLy8gSWYgb3duZXIgaXMgYW4gb3JnYW5pemF0aW9uIGFuZCBjdXJyZW50IHVzZXIgaXMgbm90IGFuIGFkbWluIG9mIHRoZSBvcmdhbml6YXRpb25cbiAgICAgIC8vIGFkZCB0aGUgdXNlciBhcyBhIHNjaGVtYSBhZG1pbiBzbyB0aGV5IGRvbnQgbG9zZSBhY2Nlc3NcbiAgICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWRtaW5pc3Rlcl9vcmdhbml6YXRpb25cIiwgb3JnYW5pemF0aW9uT3duZXJJZCkpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgICAgW2NVLmlkXSxcbiAgICAgICAgICBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCIsXG4gICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgLy8gRXZlcnkgb3JnYW5pemF0aW9uIGFkbWluIGlzIGltcGxpY2l0bHkgYWxzbyBhIHNjaGVtYSBhZG1pblxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2V0U2NoZW1hVXNlclJvbGVzRnJvbU9yZ2FuaXphdGlvblJvbGVzKFxuICAgICAgICBvcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICBSb2xlLnN5c1JvbGVNYXAoXCJvcmdhbml6YXRpb25cIiBhcyBSb2xlTGV2ZWwsIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsKSxcbiAgICAgICAgW3NjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSWYgb3duZXIgaXMgYSB1c2VyLCBhZGQgdGhlbSB0byBzY2hlbWFfdXNlcnMgdG8gc2F2ZSBzZXR0aW5nc1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBbY1UuaWRdLFxuICAgICAgICBcInNjaGVtYV9vd25lclwiLFxuICAgICAgICBcInNjaGVtYVwiIGFzIFJvbGVMZXZlbCxcbiAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQsXG4gICAgICAgIHRydWVcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVPckRlbGV0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHJlbW92ZU9yRGVsZXRlU2NoZW1hKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHtkZWx9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgdGFibGUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVUYWJsZShjVSwgc2NoZW1hTmFtZSwgdGFibGUubmFtZSwgZGVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5yZW1vdmVPckRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lLCBkZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIG5ld1NjaGVtYU5hbWU/OiBzdHJpbmcsXG4gICAgbmV3U2NoZW1hTGFiZWw/OiBzdHJpbmcsXG4gICAgbmV3T3JnYW5pemF0aW9uT3duZXJOYW1lPzogc3RyaW5nLFxuICAgIG5ld09yZ2FuaXphdGlvbk93bmVySWQ/OiBudW1iZXIsXG4gICAgbmV3VXNlck93bmVyRW1haWw/OiBzdHJpbmcsXG4gICAgbmV3VXNlck93bmVySWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgdXBkYXRlU2NoZW1hKCR7Y1UuaWR9LCR7bmFtZX0sJHtuZXdTY2hlbWFOYW1lfSwke25ld1NjaGVtYUxhYmVsfSwke25ld09yZ2FuaXphdGlvbk93bmVyTmFtZX0sJHtuZXdPcmdhbml6YXRpb25Pd25lcklkfSwke25ld1VzZXJPd25lckVtYWlsfSwke25ld1VzZXJPd25lcklkfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3NjaGVtYVwiLCBuYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFCeU5hbWUoY1UsIG5hbWUpO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgbGV0IHNjaGVtYVRhYmxlcyA9IFtdO1xuICAgIGlmIChuZXdTY2hlbWFOYW1lKSB7XG4gICAgICBpZiAoXG4gICAgICAgIG5ld1NjaGVtYU5hbWUuc3RhcnRzV2l0aChcInBnX1wiKSB8fFxuICAgICAgICBTY2hlbWEuU1lTX1NDSEVNQV9OQU1FUy5pbmNsdWRlcyhuZXdTY2hlbWFOYW1lKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfQkFEX1NDSEVNQV9OQU1FXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBuZXdTY2hlbWFOYW1lKTtcbiAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05BTUVfRVhJU1RTXCIsXG4gICAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlcyhjVSwgbmFtZSwgZmFsc2UpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHNjaGVtYVRhYmxlcyA9IHJlc3VsdC5wYXlsb2FkO1xuICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiBzY2hlbWFUYWJsZXMpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGUoY1UsIHRhYmxlKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5ld09yZ2FuaXphdGlvbk93bmVyTmFtZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5vcmdhbml6YXRpb25CeU5hbWUoY1UsIG5ld09yZ2FuaXphdGlvbk93bmVyTmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgbmV3T3JnYW5pemF0aW9uT3duZXJJZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgIH1cbiAgICBpZiAobmV3VXNlck93bmVyRW1haWwpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudXNlckJ5RW1haWwoY1UsIG5ld1VzZXJPd25lckVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBuZXdVc2VyT3duZXJJZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgIH1cbiAgICAvLyBUQkQgY2hlY2tzIHNvIHVzZXIgZG9lc24ndCBsb3NlIHBlcm1pc3Npb25zXG4gICAgY29uc3QgdXBkYXRlZFNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVwZGF0ZVNjaGVtYShcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLFxuICAgICAgbmV3U2NoZW1hTmFtZSxcbiAgICAgIG5ld1NjaGVtYUxhYmVsLFxuICAgICAgbmV3T3JnYW5pemF0aW9uT3duZXJJZCxcbiAgICAgIG5ld1VzZXJPd25lcklkXG4gICAgKTtcbiAgICBpZiAoIXVwZGF0ZWRTY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVwZGF0ZWRTY2hlbWFSZXN1bHQ7XG4gICAgaWYgKG5ld1NjaGVtYU5hbWUpIHtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2Ygc2NoZW1hVGFibGVzKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhjVSwgdGFibGUsIHRydWUpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV3T3JnYW5pemF0aW9uT3duZXJJZCB8fCBuZXdVc2VyT3duZXJJZCkge1xuICAgICAgLy8gaWYgdGhlIG9sZCBzY2hlbWEgd2FzIG93bmVkIGJ5IGFuIG9yZ1xuICAgICAgaWYgKHNjaGVtYVJlc3VsdC5wYXlsb2FkLm9yZ2FuaXphdGlvbl9vd25lcl9pZCkge1xuICAgICAgICAvLyBDbGVhciBvbGQgaW1wbGllZCBhZG1pbnNcbiAgICAgICAgY29uc3QgaW1wbGllZEFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hVXNlcnMoXG4gICAgICAgICAgY1UsXG4gICAgICAgICAgdXBkYXRlZFNjaGVtYVJlc3VsdC5wYXlsb2FkLm5hbWUsXG4gICAgICAgICAgW1wic2NoZW1hX2FkbWluaXN0cmF0b3JcIl0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIFwib3JnYW5pemF0aW9uX2FkbWluaXN0cmF0b3JcIlxuICAgICAgICApO1xuICAgICAgICBpZiAoIWltcGxpZWRBZG1pbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGltcGxpZWRBZG1pbnNSZXN1bHQ7XG4gICAgICAgIGNvbnN0IG9sZEltcGxpZWRBZG1pblVzZXJJZHMgPSBpbXBsaWVkQWRtaW5zUmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgICAgIChzY2hlbWFVc2VyOiB7IHVzZXJfaWQ6IG51bWJlciB9KSA9PiBzY2hlbWFVc2VyLnVzZXJfaWRcbiAgICAgICAgKTtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIG9sZEltcGxpZWRBZG1pblVzZXJJZHMsXG4gICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWRcbiAgICAgICAgKTtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIG9sZCBzY2hlbWEgd2FzIG93bmVkIGJ5IHVzZXJcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlUm9sZShcbiAgICAgICAgICBjVSxcbiAgICAgICAgICBbc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZF0sXG4gICAgICAgICAgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsXG4gICAgICAgICAgc2NoZW1hUmVzdWx0LnBheWxvYWQuaWRcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBpZiAobmV3T3JnYW5pemF0aW9uT3duZXJJZCkge1xuICAgICAgICAvLyBFdmVyeSBvcmdhbml6YXRpb24gYWRtaW4gaXMgaW1wbGljaXRseSBhbHNvIGEgc2NoZW1hIGFkbWluXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNldFNjaGVtYVVzZXJSb2xlc0Zyb21Pcmdhbml6YXRpb25Sb2xlcyhcbiAgICAgICAgICBuZXdPcmdhbml6YXRpb25Pd25lcklkLFxuICAgICAgICAgIFJvbGUuc3lzUm9sZU1hcChcIm9yZ2FuaXphdGlvblwiIGFzIFJvbGVMZXZlbCwgXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwpLFxuICAgICAgICAgIFtzY2hlbWFSZXN1bHQucGF5bG9hZC5pZF1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobmV3VXNlck93bmVySWQpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICAgICAgW25ld1VzZXJPd25lcklkXSxcbiAgICAgICAgICBcInNjaGVtYV9vd25lclwiLFxuICAgICAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gdXBkYXRlZFNjaGVtYVJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhc3NpZ25EZW1vU2NoZW1hKHVzZXJJZDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLm5leHRVbmFzc2lnbmVkRGVtb1NjaGVtYShcbiAgICAgIGAke2Vudmlyb25tZW50LmRlbW9EQlByZWZpeH0lYFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYShcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICByZXN1bHQucGF5bG9hZC5uYW1lLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgdXNlcklkXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRlbGV0ZVJvbGUoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgW1VzZXIuU1lTX0FETUlOX0lEXSxcbiAgICAgIFwic2NoZW1hXCIgYXMgUm9sZUxldmVsLFxuICAgICAgcmVzdWx0LnBheWxvYWQuaWRcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZERlbW9TY2hlbWEoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgYWRkRGVtb1NjaGVtYSgke2NVLmlkfSwgJHtzY2hlbWFOYW1lfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlclNjaGVtYXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoICE9PSAxKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogYGFkZE5leHREZW1vU2NoZW1hOiBjYW4gbm90IGZpbmQgZGVtbyBEQiBtYXRjaGluZyAke2Vudmlyb25tZW50LmRlbW9EQlByZWZpeH0lYCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlU2NoZW1hKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgZW52aXJvbm1lbnQuZGVtb0RCTGFiZWwsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBjVS5pZFxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBTY2hlbWEgVXNlcnMgPT09PT09PT09PVxuICAgKi9cbiAgcHVibGljIGFzeW5jIHNjaGVtYVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgcm9sZU5hbWVzPzogc3RyaW5nW10sXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIGltcGxpZWRGcm9tUm9sZU5hbWU/OiBzdHJpbmcsXG4gICAgd2l0aFNldHRpbmdzPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBzY2hlbWFVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7cm9sZU5hbWVzfSwke3VzZXJFbWFpbHN9LCR7aW1wbGllZEZyb21Sb2xlTmFtZX0sJHt3aXRoU2V0dGluZ3N9KWBcbiAgICApO1xuICAgIGlmIChjVS5pc250U2lnbmVkSW4oKSkgcmV0dXJuIGNVLm11c3RCZVNpZ25lZEluKCk7XG4gICAgaWYgKHJvbGVOYW1lcyAmJiAhUm9sZS5hcmVSb2xlcyhyb2xlTmFtZXMpKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgbWVzc2FnZTogXCJzY2hlbWFVc2Vyczogcm9sZXMgY29udGFpbnMgb25lIG9yIG1vcmUgdW5yZWNvZ25pemVkIHN0cmluZ3NcIixcbiAgICAgICAgdmFsdWVzOiByb2xlTmFtZXMsXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgdXNlcklkcyA9IHVuZGVmaW5lZDtcbiAgICBpZiAodXNlckVtYWlscykge1xuICAgICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgICB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICAgIGlmICh1c2VySWRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9VU0VSU19OT1RfRk9VTkRcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgbGV0IGltcGxpZWRGcm9tUm9sZUlkOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgaWYgKGltcGxpZWRGcm9tUm9sZU5hbWUpIHtcbiAgICAgIGNvbnN0IHJvbGVSZXN1bHQgPSBhd2FpdCB0aGlzLnJvbGVCeU5hbWUoY1UsIGltcGxpZWRGcm9tUm9sZU5hbWUpO1xuICAgICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgICAgaW1wbGllZEZyb21Sb2xlSWQgPSByb2xlUmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhbC5zY2hlbWFVc2VycyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICByb2xlTmFtZXMsXG4gICAgICB1c2VySWRzLFxuICAgICAgaW1wbGllZEZyb21Sb2xlSWQsXG4gICAgICB3aXRoU2V0dGluZ3NcbiAgICApO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldFNjaGVtYVVzZXJzUm9sZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbHM6IHN0cmluZ1tdLFxuICAgIHJvbGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgc2V0U2NoZW1hVXNlcnNSb2xlKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt1c2VyRW1haWxzfSwke3JvbGVOYW1lfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcIm1hbmFnZV9hY2Nlc3NfdG9fc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBpZiAodXNlcnNSZXN1bHQucGF5bG9hZC5sZW5ndGggIT0gdXNlckVtYWlscy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfVVNFUlNfTk9UX0ZPVU5EXCIsXG4gICAgICAgIHZhbHVlczogdXNlckVtYWlscy5maWx0ZXIoXG4gICAgICAgICAgKHg6IHN0cmluZykgPT4gIXVzZXJzUmVzdWx0LnBheWxvYWQuaW5jbHVkZXMoeClcbiAgICAgICAgKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJvbGUoXG4gICAgICBjVSxcbiAgICAgIHVzZXJJZHMsXG4gICAgICByb2xlTmFtZSxcbiAgICAgIFwic2NoZW1hXCIsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlU2NoZW1hVXNlcnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgcmVtb3ZlU2NoZW1hVXNlcnMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3VzZXJFbWFpbHN9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b19zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgdXNlcnNSZXN1bHQgPSBhd2FpdCB0aGlzLnVzZXJzQnlFbWFpbHMoY1UsIHVzZXJFbWFpbHMpO1xuICAgIGlmICghdXNlcnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJzUmVzdWx0O1xuICAgIGNvbnN0IHVzZXJJZHM6IG51bWJlcltdID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWRcbiAgICApO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIC8vIGNhbid0IHJlbW92ZSBzY2hlbWEgdXNlciBvd25lclxuICAgIGlmIChcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLnVzZXJfb3duZXJfaWQgJiZcbiAgICAgIHVzZXJJZHMuaW5jbHVkZXMoc2NoZW1hUmVzdWx0LnBheWxvYWQudXNlcl9vd25lcl9pZClcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfQ0FOVF9SRU1PVkVfU0NIRU1BX1VTRVJfT1dORVJcIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIC8vIGNhbid0IHJlbW92ZSBhbGwgYWRtaW5zIChtdXN0IGJlIGF0bGVhc3Qgb25lKVxuICAgIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hVXNlcnMoY1UsIHNjaGVtYU5hbWUsIFtcbiAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIWFkbWluc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gYWRtaW5zUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYUFkbWluSWRzOiBudW1iZXJbXSA9IGFkbWluc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICk7XG4gICAgaWYgKFxuICAgICAgdXNlcklkcy5maWx0ZXIoKHVzZXJJZCkgPT4gc2NoZW1hQWRtaW5JZHMuaW5jbHVkZXModXNlcklkKSkubGVuZ3RoID09XG4gICAgICBzY2hlbWFBZG1pbklkcy5sZW5ndGhcbiAgICApIHtcbiAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICB3YkNvZGU6IFwiV0JfU0NIRU1BX05PX0FETUlOU1wiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgXCJzY2hlbWFcIixcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIG9yZ2FuaXphdGlvbk5hbWU6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHNhdmVPcmdhbml6YXRpb25Vc2VyU2V0dGluZ3MoJHtjVS5pZH0sJHtvcmdhbml6YXRpb25OYW1lfSwke3NldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IG9yZ2FuaXphdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMub3JnYW5pemF0aW9uQnlOYW1lKFxuICAgICAgY1UsXG4gICAgICBvcmdhbml6YXRpb25OYW1lXG4gICAgKTtcbiAgICBpZiAoIW9yZ2FuaXphdGlvblJlc3VsdC5zdWNjZXNzKSByZXR1cm4gb3JnYW5pemF0aW9uUmVzdWx0O1xuICAgIHJldHVybiB0aGlzLmRhbC5zYXZlT3JnYW5pemF0aW9uVXNlclNldHRpbmdzKFxuICAgICAgb3JnYW5pemF0aW9uUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8vIGJhY2tncm91bmQgam9iXG4gIHB1YmxpYyBhc3luYyBpbXBvcnRTY2hlbWEoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgaW1wb3J0U2NoZW1hKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0pYCk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpKSByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW4oKTtcbiAgICBjb25zdCBzY2hlbWFSZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFzY2hlbWFSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHNjaGVtYVJlc3VsdDtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1F1ZXVlLnF1ZXVlKFxuICAgICAgY1UuaWQsXG4gICAgICBzY2hlbWFSZXN1bHQucGF5bG9hZC5pZCxcbiAgICAgIFwiYmdJbXBvcnRTY2hlbWFcIixcbiAgICAgIHtcbiAgICAgICAgc2NoZW1hTmFtZTogc2NoZW1hTmFtZSxcbiAgICAgIH1cbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuYmdRdWV1ZS5pbnZva2Uoc2NoZW1hUmVzdWx0LnBheWxvYWQuaWQpO1xuICB9XG5cbiAgLy8gYmFja2dyb3VuZCBqb2JcbiAgcHVibGljIGFzeW5jIHJlbW92ZVNjaGVtYShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGByZW1vdmVTY2hlbWEoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGNvbnN0IHNjaGVtYVJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hQnlOYW1lKGNVLCBzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXNjaGVtYVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gc2NoZW1hUmVzdWx0O1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmJnUXVldWUucXVldWUoXG4gICAgICBjVS5pZCxcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgXCJiZ1JlbW92ZVNjaGVtYVwiLFxuICAgICAge1xuICAgICAgICBzY2hlbWFOYW1lOiBzY2hlbWFOYW1lLFxuICAgICAgfVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5iZ1F1ZXVlLmludm9rZShzY2hlbWFSZXN1bHQucGF5bG9hZC5pZCk7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZXMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGFibGVzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgd2l0aENvbHVtbnM/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGB0YWJsZXMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3dpdGhDb2x1bW5zfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAod2l0aENvbHVtbnMpIHtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnNSZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlLm5hbWUpO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHRhYmxlLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgdGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVRhYmxlQnlOYW1lKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgd2l0aENvbHVtbnM/OiBib29sZWFuLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgYWNjZXNzaWJsZVRhYmxlQnlOYW1lKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7d2l0aENvbHVtbnN9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlc0J5VXNlcnMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIFt0YWJsZU5hbWVdLFxuICAgICAgd2l0aFNldHRpbmdzXG4gICAgKTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWRbMF07XG4gICAgICBpZiAoIXJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgIHdiQ29kZTogXCJXQl9UQUJMRV9OT1RfRk9VTkRcIixcbiAgICAgICAgICB2YWx1ZXM6IFt0YWJsZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICh3aXRoQ29sdW1ucykge1xuICAgICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKFxuICAgICAgICAgIGNVLFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgcmVzdWx0LnBheWxvYWQubmFtZVxuICAgICAgICApO1xuICAgICAgICBpZiAoIWNvbHVtbnNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNvbHVtbnNSZXN1bHQ7XG4gICAgICAgIHJlc3VsdC5wYXlsb2FkLmNvbHVtbnMgPSBjb2x1bW5zUmVzdWx0LnBheWxvYWQ7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWNjZXNzaWJsZVRhYmxlcyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHdpdGhDb2x1bW5zPzogYm9vbGVhbixcbiAgICB3aXRoU2V0dGluZ3M/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYGFjY2Vzc2libGVUYWJsZXMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3dpdGhDb2x1bW5zfSwke3dpdGhTZXR0aW5nc30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJyZWFkX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRhYmxlc0J5VXNlcnMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgW2NVLmlkXSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHdpdGhTZXR0aW5nc1xuICAgICk7XG4gICAgaWYgKHdpdGhDb2x1bW5zKSB7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgZm9yIChjb25zdCB0YWJsZSBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgICBjb25zdCBjb2x1bW5zUmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKGNVLCBzY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgICAgICAgaWYgKCFjb2x1bW5zUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjb2x1bW5zUmVzdWx0O1xuICAgICAgICB0YWJsZS5jb2x1bW5zID0gY29sdW1uc1Jlc3VsdC5wYXlsb2FkO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlVGFibGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZUxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBhZGRPckNyZWF0ZVRhYmxlKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7dGFibGVMYWJlbH0sJHtjcmVhdGV9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfc2NoZW1hXCIsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGlmICghY3JlYXRlKSBjcmVhdGUgPSBmYWxzZTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgdGFibGVMYWJlbCxcbiAgICAgIGNyZWF0ZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKFxuICAgICAgY1UsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlQW5kU2V0VGFibGVQZXJtaXNzaW9ucyhjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLnNjaGVtYU5hbWUgPSBzY2hlbWFOYW1lO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICAgIGNVLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZCxcbiAgICAgIGZhbHNlLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gdGFibGVSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVUYWJsZShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHJlbW92ZU9yRGVsZXRlVGFibGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtkZWx9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgLy8gMS4gcmVtb3ZlL2RlbGV0ZSBjb2x1bW5zXG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgICBjVSxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgZGVsLFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgLy8gVEJEIG1vdmUgdGhpcyB0byBiZ1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKFxuICAgICAgY1UsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyAzLiByZW1vdmUgdXNlciBzZXR0aW5nc1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFRhYmxlVXNlcnModGFibGVSZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZUFuZFNldFRhYmxlUGVybWlzc2lvbnMoXG4gICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZCxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHRydWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgLy8gNC4gcmVtb3ZlL2RlbGV0ZSB0aGUgdGFibGVcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwucmVtb3ZlT3JEZWxldGVUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIGRlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkQWxsRXhpc3RpbmdUYWJsZXMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgYWRkQWxsRXhpc3RpbmdUYWJsZXMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSlgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZGlzY292ZXJUYWJsZXMoc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCB0YWJsZU5hbWVzID0gcmVzdWx0LnBheWxvYWQ7XG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgdGFibGVOYW1lcykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRFeGlzdGluZ1RhYmxlKGNVLCBzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRFeGlzdGluZ1RhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGFkZEV4aXN0aW5nVGFibGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl9zY2hlbWFcIiwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlVGFibGUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICB2LnRpdGxlQ2FzZSh0YWJsZU5hbWUudG9TdHJpbmcoKS5yZXBsYWNlKC9fL2csIFwiIFwiKSksXG4gICAgICBmYWxzZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKFxuICAgICAgY1UsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlckNvbHVtbnMoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXN1bHQucGF5bG9hZDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiBjb2x1bW5zKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgICAgICBjVSxcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgdi50aXRsZUNhc2UoY29sdW1uLm5hbWUudG9TdHJpbmcoKS5yZXBsYWNlKC9fL2csIFwiIFwiKSksXG4gICAgICAgIGZhbHNlLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICB0cnVlXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKFxuICAgICAgY1UsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLFxuICAgICAgZmFsc2UsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgbmV3VGFibGVOYW1lPzogc3RyaW5nLFxuICAgIG5ld1RhYmxlTGFiZWw/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgdXBkYXRlVGFibGUoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtuZXdUYWJsZU5hbWV9LCR7bmV3VGFibGVMYWJlbH0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlcyhjVSwgc2NoZW1hTmFtZSwgZmFsc2UpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVOYW1lcyA9IHJlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICAgKHRhYmxlOiB7IG5hbWU6IHN0cmluZyB9KSA9PiB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgICAgaWYgKGV4aXN0aW5nVGFibGVOYW1lcy5pbmNsdWRlcyhuZXdUYWJsZU5hbWUpKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfVEFCTEVfTkFNRV9FWElTVFNcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGUoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgY29uc3QgdXBkYXRlZFRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlVGFibGUoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVOYW1lLFxuICAgICAgbmV3VGFibGVMYWJlbFxuICAgICk7XG4gICAgaWYgKCF1cGRhdGVkVGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVwZGF0ZWRUYWJsZVJlc3VsdDtcbiAgICBpZiAobmV3VGFibGVOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGUoY1UsIHVwZGF0ZWRUYWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiB1cGRhdGVkVGFibGVSZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWVQYXR0ZXJuPzogc3RyaW5nLFxuICAgIHJlbW92ZT86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgYWRkT3JSZW1vdmVBbGxFeGlzdGluZ1JlbGF0aW9uc2hpcHMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZVBhdHRlcm59LCR7cmVtb3ZlfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3NjaGVtYVwiLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIXRhYmxlTmFtZVBhdHRlcm4pIHRhYmxlTmFtZVBhdHRlcm4gPSBcIiVcIjtcbiAgICAvLyBUQkQ6IGRpc2NvdmVyIHBlciB0YWJsZVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICBcIiVcIixcbiAgICAgIFwiJVwiLFxuICAgICAgXCJBTExcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDb25zdHJhaW50SWRbXSA9IHJlc3VsdC5wYXlsb2FkO1xuICAgIGlmIChyZWxhdGlvbnNoaXBzLmxlbmd0aCA+IDApIHtcbiAgICAgIGZvciAoY29uc3QgcmVsYXRpb25zaGlwIG9mIHJlbGF0aW9uc2hpcHMpIHtcbiAgICAgICAgaWYgKHJlbGF0aW9uc2hpcC5yZWxUYWJsZU5hbWUgJiYgcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWUpIHtcbiAgICAgICAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgICAgICAgIGlmIChyZW1vdmUpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgICAgICAgICAgICBjVSxcbiAgICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnRhYmxlTmFtZSxcbiAgICAgICAgICAgICAgW3JlbGF0aW9uc2hpcC5jb2x1bW5OYW1lXSxcbiAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLnJlbFRhYmxlTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5hZGRPckNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgICAgIGNVLFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAudGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLmNvbHVtbk5hbWVdLFxuICAgICAgICAgICAgICByZWxhdGlvbnNoaXAucmVsVGFibGVOYW1lLFxuICAgICAgICAgICAgICBbcmVsYXRpb25zaGlwLnJlbENvbHVtbk5hbWVdXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlcnJSZXN1bHQoe1xuICAgICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgICAgXCJhZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwczogQ29uc3RyYWludElkIG11c3QgaGF2ZSByZWxUYWJsZU5hbWUgYW5kIHJlbENvbHVtbk5hbWVcIixcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29sdW1ucyhjVSwgc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIC8vIGRvbnQgYWRkIHBlcm1pc3Npb25zIGZvciB0YWJsZXMgd2l0aCBubyBjb2x1bW5zXG4gICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA9PSAwKSByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICBjb25zdCBjb2x1bW5OYW1lczogc3RyaW5nW10gPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAodGFibGU6IHsgbmFtZTogc3RyaW5nIH0pID0+IHRhYmxlLm5hbWVcbiAgICApO1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoY1UsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IHBlcm1pc3Npb25DaGVja0FuZFR5cGUgb2YgUm9sZS5oYXN1cmFUYWJsZVBlcm1pc3Npb25DaGVja3NBbmRUeXBlcyhcbiAgICAgIHJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZVBlcm1pc3Npb24oXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgcGVybWlzc2lvbkNoZWNrQW5kVHlwZS5wZXJtaXNzaW9uQ2hlY2ssXG4gICAgICAgIHBlcm1pc3Npb25DaGVja0FuZFR5cGUucGVybWlzc2lvblR5cGUsXG4gICAgICAgIFwid2J1c2VyXCIsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIC8vIElmIHRoaXMgdGFibGUgbm8gbG9uZ2VyIGhhcyBhbnkgY29sdW1ucywgdGhlcmUgd2lsbCBiZSBubyBwZXJtaXNzaW9uc1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbHVtbnMoY1UsIHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAocmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHBheWxvYWQ6IHRydWUgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH1cbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKGNVLCBzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBwZXJtaXNzaW9uS2V5QW5kVHlwZSBvZiBSb2xlLnRhYmxlUGVybWlzc2lvbktleXNBbmRBY3Rpb25zKFxuICAgICAgcmVzdWx0LnBheWxvYWQuaWRcbiAgICApKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuZGVsZXRlUGVybWlzc2lvbihcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBwZXJtaXNzaW9uS2V5QW5kVHlwZS5hY3Rpb24sXG4gICAgICAgIFwid2J1c2VyXCJcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gUGFzcyBlbXB0eSBjb2x1bW5OYW1lc1tdIHRvIGNsZWFyXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgZGVsPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBjcmVhdGVPckRlbGV0ZVByaW1hcnlLZXkoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtkZWx9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnByaW1hcnlLZXlzKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBleGlzdGluZ0NvbnN0cmFpbnROYW1lcyA9IE9iamVjdC52YWx1ZXMocmVzdWx0LnBheWxvYWQpO1xuICAgIGlmIChkZWwpIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbnN0cmFpbnROYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIG11bHRpcGxlIGNvdWxtbiBwcmltYXJ5IGtleXMgd2lsbCBhbGwgaGF2ZSBzYW1lIGNvbnN0cmFpbnQgbmFtZVxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICAgIGV4aXN0aW5nQ29uc3RyYWludE5hbWVzWzBdIGFzIHN0cmluZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZXhpc3RpbmdDb25zdHJhaW50TmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gZXJyUmVzdWx0KHsgd2JDb2RlOiBcIldCX1BLX0VYSVNUU1wiIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVQcmltYXJ5S2V5KFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgIGNvbHVtbk5hbWVzXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlRm9yZWlnbktleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgY3JlYXRlPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGBhZGRPckNyZWF0ZUZvcmVpZ25LZXkoJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lc30sJHtwYXJlbnRUYWJsZU5hbWV9LCR7cGFyZW50Q29sdW1uTmFtZXN9LCR7Y3JlYXRlfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgbGV0IG9wZXJhdGlvbjogc3RyaW5nID0gXCJDUkVBVEVcIjtcbiAgICBpZiAoIWNyZWF0ZSkgb3BlcmF0aW9uID0gXCJBRERcIjtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRGb3JlaWduS2V5KFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXMsXG4gICAgICBwYXJlbnRUYWJsZU5hbWUsXG4gICAgICBwYXJlbnRDb2x1bW5OYW1lcyxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZXM6IHN0cmluZ1tdLFxuICAgIHBhcmVudFRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGRlbD86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgcmVtb3ZlT3JEZWxldGVGb3JlaWduS2V5KCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZXN9LCR7cGFyZW50VGFibGVOYW1lfSwke2RlbH0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCBvcGVyYXRpb246IHN0cmluZyA9IFwiREVMRVRFXCI7XG4gICAgaWYgKCFkZWwpIG9wZXJhdGlvbiA9IFwiUkVNT1ZFXCI7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Rm9yZWlnbktleShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVzLFxuICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgW10sXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gb3BlcmF0aW9uID0gXCJBRER8Q1JFQVRFfFJFTU9WRXxERUxFVEVcIlxuICBwdWJsaWMgYXN5bmMgc2V0Rm9yZWlnbktleShcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWVzOiBzdHJpbmdbXSxcbiAgICBwYXJlbnRUYWJsZU5hbWU6IHN0cmluZyxcbiAgICBwYXJlbnRDb2x1bW5OYW1lczogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgc2V0Rm9yZWlnbktleSgke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke2NvbHVtbk5hbWVzfSwke3BhcmVudFRhYmxlTmFtZX0sJHtwYXJlbnRDb2x1bW5OYW1lc30sJHtvcGVyYXRpb259KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lLFxuICAgICAgY29sdW1uTmFtZXNbMF0sXG4gICAgICBcIkZPUkVJR05fS0VZU1wiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IGV4aXN0aW5nRm9yZWlnbktleXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGNvbnN0cmFpbnRJZCBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgZXhpc3RpbmdGb3JlaWduS2V5c1tjb25zdHJhaW50SWQuY29sdW1uTmFtZV0gPVxuICAgICAgICBjb25zdHJhaW50SWQuY29uc3RyYWludE5hbWU7XG4gICAgfVxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBjb2x1bW5OYW1lIG9mIGNvbHVtbk5hbWVzKSB7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdGb3JlaWduS2V5cykuaW5jbHVkZXMoY29sdW1uTmFtZSkpIHtcbiAgICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIlJFTU9WRVwiIHx8IG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmRyb3BSZWxhdGlvbnNoaXBzKFxuICAgICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgICAgIHBhcmVudFRhYmxlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIG9wZXJhdGlvbiA9PSBcIkRFTEVURVwiKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVDb25zdHJhaW50KFxuICAgICAgICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgICAgIGV4aXN0aW5nRm9yZWlnbktleXNbY29sdW1uTmFtZV0gYXMgc3RyaW5nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgICB3YkNvZGU6IFwiV0JfRktfRVhJU1RTXCIsXG4gICAgICAgICAgICB2YWx1ZXM6IFtjb2x1bW5OYW1lXSxcbiAgICAgICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvcGVyYXRpb24gPT0gXCJBRERcIiB8fCBvcGVyYXRpb24gPT0gXCJDUkVBVEVcIikge1xuICAgICAgaWYgKG9wZXJhdGlvbiA9PSBcIkNSRUFURVwiKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZUZvcmVpZ25LZXkoXG4gICAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWUsXG4gICAgICAgICAgY29sdW1uTmFtZXMsXG4gICAgICAgICAgcGFyZW50VGFibGVOYW1lLFxuICAgICAgICAgIHBhcmVudENvbHVtbk5hbWVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuY3JlYXRlT2JqZWN0UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZU5hbWUsIC8vIHBvc3RzXG4gICAgICAgIGNvbHVtbk5hbWVzWzBdLCAvLyBhdXRob3JfaWRcbiAgICAgICAgcGFyZW50VGFibGVOYW1lIC8vIGF1dGhvcnNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLmNyZWF0ZUFycmF5UmVsYXRpb25zaGlwKFxuICAgICAgICBzY2hlbWFOYW1lLFxuICAgICAgICBwYXJlbnRUYWJsZU5hbWUsIC8vIGF1dGhvcnNcbiAgICAgICAgdGFibGVOYW1lLCAvLyBwb3N0c1xuICAgICAgICBjb2x1bW5OYW1lcyAvLyBhdXRob3JfaWRcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZVxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgdHJhY2tUYWJsZSgke2NVLmlkfSwke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZS5pZCkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUodGFibGUuc2NoZW1hTmFtZSwgdGFibGUubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAvLyByZXR1cm4gYXdhaXQgdGhpcy5hZGRPclJlbW92ZUFsbEV4aXN0aW5nUmVsYXRpb25zaGlwcyhcbiAgICAvLyAgIGNVLFxuICAgIC8vICAgdGFibGUuc2NoZW1hTmFtZSxcbiAgICAvLyAgIHRhYmxlLm5hbWVcbiAgICAvLyApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgdGFibGU6IFRhYmxlLFxuICAgIHJlc2V0UGVybWlzc2lvbnM/OiBib29sZWFuLFxuICAgIHN5bmM/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtjVS5pZH0sICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHRhYmxlXG4gICAgICApfSwke3Jlc2V0UGVybWlzc2lvbnN9LCR7c3luY30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZS5pZCkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlKGNVLCB0YWJsZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoc3luYykge1xuICAgICAgaWYgKHJlc2V0UGVybWlzc2lvbnMpIHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9ucyhcbiAgICAgICAgICBjVSxcbiAgICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICAgIHRhYmxlLm5hbWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnMoXG4gICAgICAgIGNVLFxuICAgICAgICB0YWJsZS5zY2hlbWFOYW1lLFxuICAgICAgICB0YWJsZS5uYW1lXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZm4gPSBcImJnQWRkRGVmYXVsdFRhYmxlUGVybWlzc2lvbnNcIjtcbiAgICAgIGlmIChyZXNldFBlcm1pc3Npb25zKSBmbiA9IFwiYmdSZW1vdmVBbmRBZGREZWZhdWx0VGFibGVQZXJtaXNzaW9uc1wiO1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1F1ZXVlLnF1ZXVlKGNVLmlkLCB0YWJsZS5zY2hlbWFJZCwgZm4sIHtcbiAgICAgICAgc2NoZW1hTmFtZTogdGFibGUuc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lOiB0YWJsZS5uYW1lLFxuICAgICAgfSk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1F1ZXVlLmludm9rZSh0YWJsZS5zY2hlbWFJZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdW50cmFja1RhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHVudHJhY2tUYWJsZSgke2NVLmlkfSwke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZS5pZCkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZSh0YWJsZS5zY2hlbWFOYW1lLCB0YWJsZS5uYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHRhYmxlOiBUYWJsZSxcbiAgICBzeW5jPzogYm9vbGVhblxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhcbiAgICAgIGB1bnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoJHtjVS5pZH0sJHtKU09OLnN0cmluZ2lmeSh0YWJsZSl9LCR7c3luY30pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJhbHRlcl90YWJsZVwiLCB0YWJsZS5pZCkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgaWYgKCF0YWJsZS5zY2hlbWFOYW1lKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHsgbWVzc2FnZTogXCJzY2hlbWFOYW1lIG5vdCBzZXRcIiB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGUoY1UsIHRhYmxlKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChzeW5jKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZURlZmF1bHRUYWJsZVBlcm1pc3Npb25zKFxuICAgICAgICBjVSxcbiAgICAgICAgdGFibGUuc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGUubmFtZVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1F1ZXVlLnF1ZXVlKFxuICAgICAgICBjVS5pZCxcbiAgICAgICAgdGFibGUuc2NoZW1hSWQsXG4gICAgICAgIFwiYmdSZW1vdmVEZWZhdWx0VGFibGVQZXJtaXNzaW9uc1wiLFxuICAgICAgICB7XG4gICAgICAgICAgc2NoZW1hTmFtZTogdGFibGUuc2NoZW1hTmFtZSxcbiAgICAgICAgICB0YWJsZU5hbWU6IHRhYmxlLm5hbWUsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1F1ZXVlLmludm9rZSh0YWJsZS5zY2hlbWFJZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogPT09PT09PT09PSBUYWJsZSBVc2Vycz09PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB0YWJsZVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlscz86IHN0cmluZ1tdLFxuICAgIHdpdGhTZXR0aW5ncz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgdGFibGVVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3VzZXJFbWFpbHN9LCR7d2l0aFNldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcInJlYWRfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIGxldCB1c2VySWRzID0gdW5kZWZpbmVkO1xuICAgIGlmICh1c2VyRW1haWxzKSB7XG4gICAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MgfHwgIXVzZXJzUmVzdWx0LnBheWxvYWQpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICAgIHVzZXJJZHMgPSB1c2Vyc1Jlc3VsdC5wYXlsb2FkLm1hcCgodXNlcjogeyBpZDogbnVtYmVyIH0pID0+IHVzZXIuaWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5kYWwudGFibGVVc2VycyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUsIHVzZXJJZHMsIHdpdGhTZXR0aW5ncyk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgYWRkRGVmYXVsdFRhYmxlVXNlcnNUb1RhYmxlKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICB0YWJsZTogVGFibGVcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYGFkZERlZmF1bHRUYWJsZVVzZXJzVG9UYWJsZSgke0pTT04uc3RyaW5naWZ5KHRhYmxlKX0pYCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLnNldFRhYmxlVXNlclJvbGVzRnJvbVNjaGVtYVJvbGVzKFxuICAgICAgdGFibGUuc2NoZW1hSWQsXG4gICAgICBSb2xlLnN5c1JvbGVNYXAoXCJzY2hlbWFcIiBhcyBSb2xlTGV2ZWwsIFwidGFibGVcIiBhcyBSb2xlTGV2ZWwpLFxuICAgICAgW3RhYmxlLmlkXVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0VGFibGVVc2Vyc1JvbGUoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICB1c2VyRW1haWxzOiBbc3RyaW5nXSxcbiAgICByb2xlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHNldFRhYmxlVXNlcnNSb2xlKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7dXNlckVtYWlsc30sJHtyb2xlTmFtZX0pYFxuICAgICk7XG4gICAgaWYgKGF3YWl0IGNVLmNhbnQoXCJtYW5hZ2VfYWNjZXNzX3RvX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBjb25zdCB1c2Vyc1Jlc3VsdCA9IGF3YWl0IHRoaXMudXNlcnNCeUVtYWlscyhjVSwgdXNlckVtYWlscyk7XG4gICAgaWYgKCF1c2Vyc1Jlc3VsdC5zdWNjZXNzIHx8ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkKSByZXR1cm4gdXNlcnNSZXN1bHQ7XG4gICAgaWYgKHVzZXJzUmVzdWx0LnBheWxvYWQubGVuZ3RoICE9IHVzZXJFbWFpbHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX1VTRVJTX05PVF9GT1VORFwiLFxuICAgICAgICB2YWx1ZXM6IHVzZXJFbWFpbHMuZmlsdGVyKFxuICAgICAgICAgICh4OiBzdHJpbmcpID0+ICF1c2Vyc1Jlc3VsdC5wYXlsb2FkLmluY2x1ZGVzKHgpXG4gICAgICAgICksXG4gICAgICB9IGFzIFNlcnZpY2VSZXN1bHQpO1xuICAgIH1cbiAgICBjb25zdCB1c2VySWRzID0gdXNlcnNSZXN1bHQucGF5bG9hZC5tYXAoKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXRSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgcm9sZU5hbWUsXG4gICAgICBcInRhYmxlXCIsXG4gICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZW1vdmVUYWJsZVVzZXJzKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgcmVtb3ZlVGFibGVVc2Vycygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3VzZXJFbWFpbHN9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwibWFuYWdlX2FjY2Vzc190b190YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJzUmVzdWx0ID0gYXdhaXQgdGhpcy51c2Vyc0J5RW1haWxzKGNVLCB1c2VyRW1haWxzKTtcbiAgICBpZiAoIXVzZXJzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2Vyc1Jlc3VsdDtcbiAgICBjb25zdCB1c2VySWRzOiBudW1iZXJbXSA9IHVzZXJzUmVzdWx0LnBheWxvYWQubWFwKFxuICAgICAgKHVzZXI6IHsgaWQ6IG51bWJlciB9KSA9PiB1c2VyLmlkXG4gICAgKTtcbiAgICAvLyBjYW4ndCByZW1vdmUgc2NoZW1hIGFkbWluaXN0cmF0b3JzIGZyb20gaW5kaXZpZHVhbCB0YWJsZXNcbiAgICAvLyByZW1vdmUgdGhlbSBmcm9tIHRoZSB3aG9sZSBzY2hlbWEgb25seVxuICAgIGNvbnN0IGFkbWluc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hVXNlcnMoY1UsIHNjaGVtYU5hbWUsIFtcbiAgICAgIFwic2NoZW1hX2FkbWluaXN0cmF0b3JcIixcbiAgICBdKTtcbiAgICBpZiAoIWFkbWluc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gYWRtaW5zUmVzdWx0O1xuICAgIGNvbnN0IHNjaGVtYUFkbWluSWRzOiBudW1iZXJbXSA9IGFkbWluc1Jlc3VsdC5wYXlsb2FkLm1hcChcbiAgICAgICh1c2VyOiB7IGlkOiBudW1iZXIgfSkgPT4gdXNlci5pZFxuICAgICk7XG4gICAgaWYgKFxuICAgICAgdXNlcklkcy5maWx0ZXIoKHVzZXJJZCkgPT4gc2NoZW1hQWRtaW5JZHMuaW5jbHVkZXModXNlcklkKSkubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgIHdiQ29kZTogXCJXQl9DQU5UX1JFTU9WRV9TQ0hFTUFfQURNSU5cIixcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWxldGVSb2xlKFxuICAgICAgY1UsXG4gICAgICB1c2VySWRzLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgdGFibGVSZXN1bHQucGF5bG9hZC5pZFxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlVGFibGVVc2VyU2V0dGluZ3MoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBzZXR0aW5nczogb2JqZWN0XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHNhdmVUYWJsZVVzZXJTZXR0aW5ncygke2NVLmlkfSwke3NjaGVtYU5hbWV9LCR7dGFibGVOYW1lfSwke3NldHRpbmdzfSlgXG4gICAgKTtcbiAgICBpZiAoY1UuaXNudFNpZ25lZEluKCkpIHJldHVybiBjVS5tdXN0QmVTaWduZWRJbigpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNhdmVUYWJsZVVzZXJTZXR0aW5ncyhcbiAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQuaWQsXG4gICAgICBjVS5pZCxcbiAgICAgIHNldHRpbmdzXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiA9PT09PT09PT09IENvbHVtbnMgPT09PT09PT09PVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY29sdW1ucyhcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGBjb2x1bW5zKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9KWApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwicmVhZF90YWJsZVwiLCB0YWJsZU5hbWUsIHNjaGVtYU5hbWUpKSB7XG4gICAgICByZXR1cm4gY1UuZGVuaWVkKCk7XG4gICAgfVxuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5wcmltYXJ5S2V5cyhzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgcEtDb2xzQ29uc3RyYWludHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSByZXN1bHQucGF5bG9hZDtcbiAgICBjb25zdCBwS0NvbHVtbk5hbWVzOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKHBLQ29sc0NvbnN0cmFpbnRzKTtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5zKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGNvbnN0IGNvbHVtbiBvZiByZXN1bHQucGF5bG9hZCkge1xuICAgICAgY29sdW1uLmlzUHJpbWFyeUtleSA9IHBLQ29sdW1uTmFtZXMuaW5jbHVkZXMoY29sdW1uLm5hbWUpO1xuICAgICAgY29uc3QgZm9yZWlnbktleXNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5mb3JlaWduS2V5c09yUmVmZXJlbmNlcyhcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW4ubmFtZSxcbiAgICAgICAgXCJGT1JFSUdOX0tFWVNcIlxuICAgICAgKTtcbiAgICAgIGlmICghZm9yZWlnbktleXNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbHVtbi5mb3JlaWduS2V5cyA9IGZvcmVpZ25LZXlzUmVzdWx0LnBheWxvYWQ7XG4gICAgICBjb25zdCByZWZlcmVuY2VzUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuZm9yZWlnbktleXNPclJlZmVyZW5jZXMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uLm5hbWUsXG4gICAgICAgIFwiUkVGRVJFTkNFU1wiXG4gICAgICApO1xuICAgICAgaWYgKCFyZWZlcmVuY2VzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICBjb2x1bW4ucmVmZXJlbmNlZEJ5ID0gcmVmZXJlbmNlc1Jlc3VsdC5wYXlsb2FkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yQ3JlYXRlQ29sdW1uKFxuICAgIGNVOiBDdXJyZW50VXNlcixcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgY29sdW1uTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbkxhYmVsOiBzdHJpbmcsXG4gICAgY3JlYXRlPzogYm9vbGVhbixcbiAgICBjb2x1bW5UeXBlPzogc3RyaW5nLFxuICAgIHN5bmM/OiBib29sZWFuLFxuICAgIHNraXBUcmFja2luZz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgYWRkT3JDcmVhdGVDb2x1bW4oJHtjVS5pZH0sJHtzY2hlbWFOYW1lfSwke3RhYmxlTmFtZX0sJHtjb2x1bW5OYW1lfSwke2NvbHVtbkxhYmVsfSwke2NyZWF0ZX0sJHtjb2x1bW5UeXBlfSwke3N5bmN9LCR7c2tpcFRyYWNraW5nfSlgXG4gICAgKTtcbiAgICBpZiAoYXdhaXQgY1UuY2FudChcImFsdGVyX3RhYmxlXCIsIHRhYmxlTmFtZSwgc2NoZW1hTmFtZSkpIHtcbiAgICAgIHJldHVybiBjVS5kZW5pZWQoKTtcbiAgICB9XG4gICAgY29uc3QgY2hlY2tDb2xOb3RBbHJlYWR5QWRkZWRSZXN1bHQgPVxuICAgICAgYXdhaXQgdGhpcy5kYWwuY29sdW1uQnlTY2hlbWFOYW1lVGFibGVOYW1lQ29sdW1uTmFtZShcbiAgICAgICAgc2NoZW1hTmFtZSxcbiAgICAgICAgdGFibGVOYW1lLFxuICAgICAgICBjb2x1bW5OYW1lXG4gICAgICApO1xuICAgIGlmICghY2hlY2tDb2xOb3RBbHJlYWR5QWRkZWRSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgLy8gbG9va2luZyBmb3IgdGhlIGNvbHVtbiB0byBiZSBub3QgZm91bmRcbiAgICAgIGlmIChjaGVja0NvbE5vdEFscmVhZHlBZGRlZFJlc3VsdC53YkNvZGUgIT0gXCJXQl9DT0xVTU5fTk9UX0ZPVU5EXCIpIHtcbiAgICAgICAgcmV0dXJuIGNoZWNrQ29sTm90QWxyZWFkeUFkZGVkUmVzdWx0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZXJyUmVzdWx0KHtcbiAgICAgICAgd2JDb2RlOiBcIldCX0NPTFVNTl9OQU1FX0VYSVNUU1wiLFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICB9XG4gICAgaWYgKCFjcmVhdGUpIHtcbiAgICAgIGNyZWF0ZSA9IGZhbHNlO1xuICAgICAgLy8gaWYgaXRzIG5vdCBiZWluZyBjcmVhdGVkIGNoZWNrIGl0IGV4aXN0c1xuICAgICAgY29uc3QgY2hlY2tDb2xFeGlzdHNSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kaXNjb3ZlckNvbHVtbnMoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHRhYmxlTmFtZSxcbiAgICAgICAgY29sdW1uTmFtZVxuICAgICAgKTtcbiAgICAgIGlmICghY2hlY2tDb2xFeGlzdHNSZXN1bHQuc3VjY2VzcykgcmV0dXJuIGNoZWNrQ29sRXhpc3RzUmVzdWx0O1xuICAgICAgaWYgKGNoZWNrQ29sRXhpc3RzUmVzdWx0LnBheWxvYWQubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuIGVyclJlc3VsdCh7XG4gICAgICAgICAgd2JDb2RlOiBcIldCX0NPTFVNTl9OT1RfRk9VTkRcIixcbiAgICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFjb2x1bW5UeXBlKSB7XG4gICAgICBjb2x1bW5UeXBlID0gXCJURVhUXCI7XG4gICAgfVxuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBjb25zdCB0YWJsZVJlc3VsdCA9IGF3YWl0IHRoaXMudGFibGVCeVNjaGVtYU5hbWVUYWJsZU5hbWUoXG4gICAgICBjVSxcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWVcbiAgICApO1xuICAgIGlmICghdGFibGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRhYmxlUmVzdWx0O1xuICAgIGlmICghc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnVudHJhY2tUYWJsZShjVSwgdGFibGVSZXN1bHQucGF5bG9hZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCBjb2x1bW5SZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRPckNyZWF0ZUNvbHVtbihcbiAgICAgIHNjaGVtYU5hbWUsXG4gICAgICB0YWJsZU5hbWUsXG4gICAgICBjb2x1bW5OYW1lLFxuICAgICAgY29sdW1uTGFiZWwsXG4gICAgICBjcmVhdGUsXG4gICAgICBjb2x1bW5UeXBlXG4gICAgKTtcbiAgICBpZiAoY29sdW1uUmVzdWx0LnN1Y2Nlc3MgJiYgIXNraXBUcmFja2luZykge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy50cmFja1RhYmxlV2l0aFBlcm1pc3Npb25zKFxuICAgICAgICBjVSxcbiAgICAgICAgdGFibGVSZXN1bHQucGF5bG9hZCxcbiAgICAgICAgdHJ1ZSxcbiAgICAgICAgc3luY1xuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiBjb2x1bW5SZXN1bHQ7XG4gIH1cblxuICAvLyBNdXN0IGVudGVyIGFuZCBleGl0IHdpdGggdHJhY2tlZCB0YWJsZSwgcmVnYXJkbGVzcyBvZiBpZiB0aGVyZSBhcmUgY29sdW1uc1xuICBwdWJsaWMgYXN5bmMgcmVtb3ZlT3JEZWxldGVDb2x1bW4oXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgZGVsPzogYm9vbGVhbixcbiAgICBzeW5jPzogYm9vbGVhbixcbiAgICBza2lwVHJhY2tpbmc/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHJlbW92ZU9yRGVsZXRlQ29sdW1uKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZX0sJHtkZWx9LCR7c3luY30sJHtza2lwVHJhY2tpbmd9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICBpZiAoIWRlbCkgZGVsID0gZmFsc2U7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIGNvbnN0IHRhYmxlUmVzdWx0ID0gYXdhaXQgdGhpcy50YWJsZUJ5U2NoZW1hTmFtZVRhYmxlTmFtZShcbiAgICAgIGNVLFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZVxuICAgICk7XG4gICAgaWYgKCF0YWJsZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gdGFibGVSZXN1bHQ7XG4gICAgaWYgKCFza2lwVHJhY2tpbmcpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudW50cmFja1RhYmxlKGNVLCB0YWJsZVJlc3VsdC5wYXlsb2FkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZU9yRGVsZXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBkZWxcbiAgICApO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiAhc2tpcFRyYWNraW5nKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRyYWNrVGFibGVXaXRoUGVybWlzc2lvbnMoXG4gICAgICAgIGNVLFxuICAgICAgICB0YWJsZVJlc3VsdC5wYXlsb2FkLFxuICAgICAgICB0cnVlLFxuICAgICAgICBzeW5jXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZUNvbHVtbihcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGNvbHVtbk5hbWU6IHN0cmluZyxcbiAgICBuZXdDb2x1bW5OYW1lPzogc3RyaW5nLFxuICAgIG5ld0NvbHVtbkxhYmVsPzogc3RyaW5nLFxuICAgIG5ld1R5cGU/OiBzdHJpbmcsXG4gICAgc3luYz86IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oXG4gICAgICBgdXBkYXRlQ29sdW1uKCR7Y1UuaWR9LCR7c2NoZW1hTmFtZX0sJHt0YWJsZU5hbWV9LCR7Y29sdW1uTmFtZX0sJHtuZXdDb2x1bW5OYW1lfSwke25ld0NvbHVtbkxhYmVsfSwke25ld1R5cGV9KWBcbiAgICApO1xuICAgIGlmIChhd2FpdCBjVS5jYW50KFwiYWx0ZXJfdGFibGVcIiwgdGFibGVOYW1lLCBzY2hlbWFOYW1lKSkge1xuICAgICAgcmV0dXJuIGNVLmRlbmllZCgpO1xuICAgIH1cbiAgICAvLyBUQkQ6IGlmIHRoaXMgaXMgYSBma1xuICAgIGxldCByZXN1bHQ6IFNlcnZpY2VSZXN1bHQ7XG4gICAgY29uc3QgdGFibGVSZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKFxuICAgICAgY1UsXG4gICAgICBzY2hlbWFOYW1lLFxuICAgICAgdGFibGVOYW1lXG4gICAgKTtcbiAgICBpZiAoIXRhYmxlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0YWJsZVJlc3VsdDtcbiAgICBpZiAobmV3Q29sdW1uTmFtZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2x1bW5zKGNVLCBzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgIGNvbnN0IGV4aXN0aW5nQ29sdW1uTmFtZXMgPSByZXN1bHQucGF5bG9hZC5tYXAoXG4gICAgICAgICh0YWJsZTogeyBuYW1lOiBzdHJpbmcgfSkgPT4gdGFibGUubmFtZVxuICAgICAgKTtcbiAgICAgIGlmIChleGlzdGluZ0NvbHVtbk5hbWVzLmluY2x1ZGVzKG5ld0NvbHVtbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiBlcnJSZXN1bHQoeyB3YkNvZGU6IFwiV0JfQ09MVU1OX05BTUVfRVhJU1RTXCIgfSBhcyBTZXJ2aWNlUmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5ld0NvbHVtbk5hbWUgfHwgbmV3VHlwZSkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51bnRyYWNrVGFibGUoY1UsIHRhYmxlUmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXBkYXRlQ29sdW1uKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWUsXG4gICAgICBuZXdDb2x1bW5OYW1lLFxuICAgICAgbmV3Q29sdW1uTGFiZWwsXG4gICAgICBuZXdUeXBlXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChuZXdDb2x1bW5OYW1lIHx8IG5ld1R5cGUpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHJhY2tUYWJsZVdpdGhQZXJtaXNzaW9ucyhcbiAgICAgICAgY1UsXG4gICAgICAgIHRhYmxlUmVzdWx0LnBheWxvYWQsXG4gICAgICAgIHRydWUsXG4gICAgICAgIHN5bmNcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZE9yUmVtb3ZlQ29sdW1uU2VxdWVuY2UoXG4gICAgY1U6IEN1cnJlbnRVc2VyLFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICBjb2x1bW5OYW1lOiBzdHJpbmcsXG4gICAgbmV4dFNlcU51bWJlcj86IG51bWJlcixcbiAgICByZW1vdmU/OiBib29sZWFuXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLnNjaGVtYUJ5TmFtZShjVSwgc2NoZW1hTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBjb25zdCBzY2hlbWEgPSByZXN1bHQucGF5bG9hZDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnRhYmxlQnlTY2hlbWFOYW1lVGFibGVOYW1lKGNVLCBzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgdGFibGUgPSByZXN1bHQucGF5bG9hZDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jb2x1bW5CeVNjaGVtYU5hbWVUYWJsZU5hbWVDb2x1bW5OYW1lKFxuICAgICAgc2NoZW1hTmFtZSxcbiAgICAgIHRhYmxlTmFtZSxcbiAgICAgIGNvbHVtbk5hbWVcbiAgICApO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgY29uc3QgY29sdW1uID0gcmVzdWx0LnBheWxvYWQ7XG5cbiAgICBpZiAocmVtb3ZlKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5yZW1vdmVTZXF1ZW5jZUZyb21Db2x1bW4oc2NoZW1hLCB0YWJsZSwgY29sdW1uKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkU2VxdWVuY2VUb0NvbHVtbihcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICB0YWJsZSxcbiAgICAgICAgY29sdW1uLFxuICAgICAgICBuZXh0U2VxTnVtYmVyXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVXRpbCA9PT09PT09PT09XG4gICAqL1xuXG4gIC8vIG9ubHkgYXN5bmMgZm9yIHRlc3RpbmcgLSBmb3IgdGhlIG1vc3QgcGFydCBzdGF0aWNcbiAgcHVibGljIGFzeW5jIHVpZEZyb21IZWFkZXJzKFxuICAgIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgLy9sb2cuaW5mbyhcIj09PT09PT09PT0gSEVBREVSUzogXCIgKyBKU09OLnN0cmluZ2lmeShoZWFkZXJzKSk7XG4gICAgY29uc3QgaGVhZGVyc0xvd2VyQ2FzZSA9IE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpLnJlZHVjZShcbiAgICAgIChhY2M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIFtrZXksIHZhbF0pID0+IChcbiAgICAgICAgKGFjY1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWwpLCBhY2NcbiAgICAgICksXG4gICAgICB7fVxuICAgICk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIC8vIGlmIHgtaGFzdXJhLWFkbWluLXNlY3JldCBoYXN1cmEgc2V0cyByb2xlIHRvIGFkbWluXG4gICAgaWYgKFxuICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtaGFzdXJhLXJvbGVcIl0gJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS1yb2xlXCJdLnRvTG93ZXJDYXNlKCkgPT0gXCJhZG1pblwiXG4gICAgKSB7XG4gICAgICBsb2cuaW5mbyhcIj09PT09PT09PT0gRk9VTkQgQURNSU4gVVNFUlwiKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IFVzZXIuU1lTX0FETUlOX0lELFxuICAgICAgfSBhcyBTZXJ2aWNlUmVzdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5OT0RFX0VOViA9PSBcImRldmVsb3BtZW50XCIgJiZcbiAgICAgIGhlYWRlcnNMb3dlckNhc2VbXCJ4LXRlc3QtdXNlci1pZFwiXVxuICAgICkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy51c2VyQnlFbWFpbChcbiAgICAgICAgQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSxcbiAgICAgICAgaGVhZGVyc0xvd2VyQ2FzZVtcIngtdGVzdC11c2VyLWlkXCJdXG4gICAgICApO1xuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLmlkO1xuICAgICAgbG9nLmluZm8oXG4gICAgICAgIGA9PT09PT09PT09IEZPVU5EIFRFU1QgVVNFUjogJHtoZWFkZXJzTG93ZXJDYXNlW1wieC10ZXN0LXVzZXItaWRcIl19YFxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSB7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHBhcnNlSW50KGhlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdKSxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdDtcbiAgICAgIGxvZy5pbmZvKFxuICAgICAgICBgPT09PT09PT09PSBGT1VORCBVU0VSOiAke2hlYWRlcnNMb3dlckNhc2VbXCJ4LWhhc3VyYS11c2VyLWlkXCJdfWBcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGB1aWRGcm9tSGVhZGVyczogQ291bGQgbm90IGZpbmQgaGVhZGVycyBmb3IgQWRtaW4sIFRlc3Qgb3IgVXNlciBpbjogJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICBoZWFkZXJzXG4gICAgICAgICl9YCxcbiAgICAgIH0gYXMgU2VydmljZVJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgY2xvdWRDb250ZXh0KCk6IG9iamVjdCB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRlZmF1bHRDb2x1bW5UeXBlczogQ29sdW1uLkNPTU1PTl9UWVBFUyxcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIG9yZ2FuaXphdGlvbjogUm9sZS5TWVNST0xFU19PUkdBTklaQVRJT05TLFxuICAgICAgICBzY2hlbWE6IFJvbGUuU1lTUk9MRVNfU0NIRU1BUyxcbiAgICAgICAgdGFibGU6IFJvbGUuU1lTUk9MRVNfVEFCTEVTLFxuICAgICAgfSxcbiAgICAgIHBvbGljeTogREVGQVVMVF9QT0xJQ1ksXG4gICAgICB1c2VyTWVzc2FnZXM6IFVTRVJfTUVTU0FHRVMsXG4gICAgfTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBoYXN1cmFIZWFsdGhDaGVjaygpIHtcbiAgICBsZXQgcmVzdWx0ID0gZXJyUmVzdWx0KCk7XG4gICAgdHJ5IHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IGhhc3VyYUFwaS5oZWFsdGhDaGVjaygpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHJlc3VsdCA9IGVyclJlc3VsdCh7XG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgIHZhbHVlczogW0pTT04uc3RyaW5naWZ5KGVycm9yKV0sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkYkhlYWx0aENoZWNrKCkge1xuICAgIGxldCByZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICB0cnkge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuaGVhbHRoQ2hlY2soKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICByZXN1bHQgPSBlcnJSZXN1bHQoe1xuICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICB2YWx1ZXM6IFtKU09OLnN0cmluZ2lmeShlcnJvcildLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXRpbChcbiAgICBjVTogQ3VycmVudFVzZXIsXG4gICAgZm46IHN0cmluZyxcbiAgICB2YWxzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGB1dGlsKCR7Y1UuaWR9LCR7Zm59LCR7SlNPTi5zdHJpbmdpZnkodmFscyl9KWApO1xuICAgIC8vIGRlZmVyIGFjY2VzcyBjb250cm9sIHRvIGNhbGxlZCBtZXRob2RzXG4gICAgbGV0IHJlc3VsdCA9IGVyclJlc3VsdCgpO1xuICAgIHN3aXRjaCAoZm4pIHtcbiAgICAgIGNhc2UgXCJhZGREZW1vU2NoZW1hXCI6XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkRGVtb1NjaGVtYShjVSwgdmFscy5zY2hlbWFOYW1lIGFzIHN0cmluZyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInJlc2V0VGVzdERhdGFcIjpcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZXNldFRlc3REYXRhKGNVKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicHJvY2Vzc0RiUmVzdG9yZVwiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnByb2Nlc3NEYlJlc3RvcmUoY1UpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJpbnZva2VCZ1wiOlxuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmJnUXVldWUucHJvY2Vzcyh2YWxzLnNjaGVtYUlkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsb2cuZXJyb3IoYENhbiBub3QgZmluZCBmbiAke2ZufWApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3NEYlJlc3RvcmUoY1U6IEN1cnJlbnRVc2VyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHByb2Nlc3NEYlJlc3RvcmUoJHtjVS5pZH0pYCk7XG4gICAgaWYgKGNVLmlzbnRTeXNBZG1pbigpKSByZXR1cm4gY1UubXVzdEJlU3lzQWRtaW4oKTtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5iZ1F1ZXVlLnF1ZXVlKFxuICAgICAgY1UuaWQsXG4gICAgICBTY2hlbWEuV0JfU1lTX1NDSEVNQV9JRCxcbiAgICAgIFwiYmdSZWxvYWRSZW1vdGVTY2hlbWFzQW5kTWV0YWRhdGFcIlxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5iZ1F1ZXVlLmludm9rZShTY2hlbWEuV0JfU1lTX1NDSEVNQV9JRCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2V0UmVtb3RlU2NoZW1hcyhjVTogQ3VycmVudFVzZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBsb2cuaW5mbyhgc2V0UmVtb3RlU2NoZW1hcygke2NVLmlkfSlgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkpIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbigpO1xuICAgIGxldCByZXN1bHQgPSBlcnJSZXN1bHQoKTtcbiAgICBpZiAoZW52aXJvbm1lbnQud2JSZW1vdGVTY2hlbWFOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuc2V0UmVtb3RlU2NoZW1hKFxuICAgICAgICBlbnZpcm9ubWVudC53YlJlbW90ZVNjaGVtYU5hbWUsXG4gICAgICAgIGVudmlyb25tZW50LndiUmVtb3RlU2NoZW1hVVJMXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChlbnZpcm9ubWVudC53YmFSZW1vdGVTY2hlbWFOYW1lKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkuc2V0UmVtb3RlU2NoZW1hKFxuICAgICAgICBlbnZpcm9ubWVudC53YmFSZW1vdGVTY2hlbWFOYW1lLFxuICAgICAgICBlbnZpcm9ubWVudC53YmFSZW1vdGVTY2hlbWFVUkxcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVsb2FkTWV0YWRhdGEoY1U6IEN1cnJlbnRVc2VyKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbG9nLmluZm8oYHJlbG9hZE1ldGFkYXRhKCR7Y1UuaWR9KWApO1xuICAgIGlmIChjVS5pc250U3lzQWRtaW4oKSkgcmV0dXJuIGNVLm11c3RCZVN5c0FkbWluKCk7XG4gICAgcmV0dXJuIGF3YWl0IGhhc3VyYUFwaS5yZWxvYWRNZXRhZGF0YSgpO1xuICB9XG5cbiAgLyoqXG4gICAqID09PT09PT09PT0gVGVzdCA9PT09PT09PT09XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKGNVOiBDdXJyZW50VXNlcik6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxvZy5pbmZvKGByZXNldFRlc3REYXRhKClgKTtcbiAgICBpZiAoY1UuaXNudFN5c0FkbWluKCkgJiYgY1UuaXNudFRlc3RVc2VyKCkpIHtcbiAgICAgIHJldHVybiBjVS5tdXN0QmVTeXNBZG1pbk9yVGVzdFVzZXIoKTtcbiAgICB9XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hcyhcbiAgICAgIEN1cnJlbnRVc2VyLmdldFN5c0FkbWluKCksXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBcInRlc3RfJVwiXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW92ZU9yRGVsZXRlU2NoZW1hKFxuICAgICAgICBDdXJyZW50VXNlci5nZXRTeXNBZG1pbigpLFxuICAgICAgICBzY2hlbWEubmFtZSxcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlVGVzdE9yZ2FuaXphdGlvbnMoQ3VycmVudFVzZXIuZ2V0U3lzQWRtaW4oKSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRlbGV0ZVRlc3RVc2VycygpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cblxuLyoqXG4gKiA9PT09PT09PT09IEVycm9yIEhhbmRsaW5nID09PT09PT09PT1cbiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gZXJyUmVzdWx0KHJlc3VsdD86IFNlcnZpY2VSZXN1bHQpOiBTZXJ2aWNlUmVzdWx0IHtcbiAgaWYgKCFyZXN1bHQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiBcIlJlc3VsdCBoYXMgbm90IGJlZW4gYXNzaWduZWRcIixcbiAgICB9IGFzIFNlcnZpY2VSZXN1bHQ7XG4gIH1cbiAgaWYgKHJlc3VsdC5zdWNjZXNzID09IHRydWUpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6XG4gICAgICAgIFwiV2hpdGVicmlja0Nsb3VkIGVyclJlc3VsdDogcmVzdWx0IGlzIG5vdCBhbiBlcnJvciAoc3VjY2Vzcz09dHJ1ZSlcIixcbiAgICB9O1xuICB9IGVsc2UgaWYgKCEoXCJzdWNjZXNzXCIgaW4gcmVzdWx0KSkge1xuICAgIHJlc3VsdC5zdWNjZXNzID0gZmFsc2U7XG4gIH1cbiAgaWYgKCFyZXN1bHQubWVzc2FnZSAmJiByZXN1bHQud2JDb2RlKSB7XG4gICAgcmVzdWx0Lm1lc3NhZ2UgPSBVU0VSX01FU1NBR0VTW3Jlc3VsdC53YkNvZGVdWzBdO1xuICAgIGlmICghcmVzdWx0Lm1lc3NhZ2UpIHtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGBXaGl0ZWJyaWNrQ2xvdWQgZXJyUmVzdWx0OiBDb3VsZCBub3QgZmluZCBtZXNzYWdlIGZvciB3YkNvZGU9JHtyZXN1bHQud2JDb2RlfWAsXG4gICAgICB9O1xuICAgIH1cbiAgfVxuICBpZiAocmVzdWx0LnZhbHVlcykge1xuICAgIHJlc3VsdC5tZXNzYWdlID0gYCR7cmVzdWx0Lm1lc3NhZ2V9IFZhbHVlczogJHtyZXN1bHQudmFsdWVzLmpvaW4oXCIsIFwiKX1gO1xuICAgIGRlbGV0ZSByZXN1bHQudmFsdWVzO1xuICB9XG4gIGlmIChcbiAgICAhcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSAmJlxuICAgIHJlc3VsdC53YkNvZGUgJiZcbiAgICBPYmplY3Qua2V5cyhVU0VSX01FU1NBR0VTKS5pbmNsdWRlcyhyZXN1bHQud2JDb2RlKSAmJlxuICAgIFVTRVJfTUVTU0FHRVNbcmVzdWx0LndiQ29kZV0ubGVuZ3RoID09IDJcbiAgKSB7XG4gICAgcmVzdWx0LmFwb2xsb0Vycm9yQ29kZSA9IFVTRVJfTUVTU0FHRVNbcmVzdWx0LndiQ29kZV1bMV07XG4gIH0gZWxzZSBpZiAoXG4gICAgIXJlc3VsdC5hcG9sbG9FcnJvckNvZGUgJiZcbiAgICByZXN1bHQud2JDb2RlICYmXG4gICAgIU9iamVjdC5rZXlzKFVTRVJfTUVTU0FHRVMpLmluY2x1ZGVzKHJlc3VsdC53YkNvZGUpXG4gICkge1xuICAgIHJlc3VsdCA9IHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogYFdoaXRlYnJpY2tDbG91ZCBlcnI6IENvdWxkIG5vdCBmaW5kIGFwb2xsb0Vycm9yQ29kZSBmb3Igd2JDb2RlPSR7cmVzdWx0LndiQ29kZX1gLFxuICAgIH07XG4gIH0gZWxzZSBpZiAoIXJlc3VsdC5hcG9sbG9FcnJvckNvZGUpIHtcbiAgICByZXN1bHQuYXBvbGxvRXJyb3JDb2RlID0gXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIjtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBvbGxvRXJyKHJlc3VsdDogU2VydmljZVJlc3VsdCk6IEVycm9yIHtcbiAgcmVzdWx0ID0gZXJyUmVzdWx0KHJlc3VsdCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldHVybiBuZXcgRXJyb3IoXG4gICAgICBcIldoaXRlYnJpY2tDbG91ZC5lcnI6IHJlc3VsdCBpcyBub3QgYW4gZXJyb3IgKHN1Y2Nlc3M9PXRydWUpXCJcbiAgICApO1xuICB9XG4gIGNvbnN0IGRldGFpbHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgaWYgKCFyZXN1bHQubWVzc2FnZSkgcmVzdWx0Lm1lc3NhZ2UgPSBcIlVua25vd24gZXJyb3IuXCI7XG4gIGlmIChyZXN1bHQucmVmQ29kZSkgZGV0YWlscy5yZWZDb2RlID0gcmVzdWx0LnJlZkNvZGU7XG4gIGlmIChyZXN1bHQud2JDb2RlKSBkZXRhaWxzLndiQ29kZSA9IHJlc3VsdC53YkNvZGU7XG4gIHJldHVybiBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIHJlc3VsdC5hcG9sbG9FcnJvckNvZGUsIGRldGFpbHMpO1xufVxuXG5leHBvcnQgY29uc3QgYmdIYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkgPSB7fSk6IFByb21pc2U8YW55PiA9PiB7XG4gIGxvZy5pbmZvKGA9PSBiZ0hhbmRsZXIgZXZlbnQ6ICR7SlNPTi5zdHJpbmdpZnkoZXZlbnQpfWApO1xuICBjb25zdCB3YkNsb3VkID0gbmV3IFdoaXRlYnJpY2tDbG91ZCgpO1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YkNsb3VkLmJnUXVldWUucHJvY2VzcyhldmVudC5zY2hlbWFJZCk7XG4gIGxvZy5pbmZvKGA9PSBiZ0hhbmRsZXIgcmVzdWx0OiAke0pTT04uc3RyaW5naWZ5KHJlc3VsdCl9YCk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIik7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXdzLXNkay9jbGllbnRzL2xhbWJkYVwiKTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCIpOyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImdyYXBocWwtdG9vbHNcIik7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiZ3JhcGhxbC10eXBlLWpzb25cIik7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiaXMtcG9ydC1yZWFjaGFibGVcIik7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwibG9kYXNoXCIpOyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInBnXCIpOyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInZvY2FcIik7IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL3doaXRlYnJpY2stY2xvdWQudHNcIik7XG4iLCIiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=