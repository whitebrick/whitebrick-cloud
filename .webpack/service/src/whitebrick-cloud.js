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
        return str.replace(/[\\"]+/g, "");
    }
    executeQuery(queryParam) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([queryParam]);
            return results[0];
        });
    }
    executeQueries(queryParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.pool.connect();
            const results = [];
            try {
                yield client.query("BEGIN");
                for (const queryParam of queryParams) {
                    whitebrick_cloud_1.log.debug(`dal.executeQuery QueryParam: ${queryParam.query}`, queryParam.params);
                    const response = yield client.query(queryParam.query, queryParam.params);
                    results.push({
                        success: true,
                        payload: response,
                    });
                }
                yield client.query("COMMIT");
            }
            catch (error) {
                yield client.query("ROLLBACK");
                whitebrick_cloud_1.log.error(error);
                results.push({
                    success: false,
                    message: error.detail,
                    code: error.code,
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
                query: "SELECT * FROM wb.tenants",
            });
            if (result.success)
                result.payload = entity_1.Tenant.parseResult(result.payload);
            return result;
        });
    }
    tenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.tenants WHERE id=$1 LIMIT 1",
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
                query: "SELECT * FROM wb.tenants WHERE name=$1 LIMIT 1",
                params: [name],
            });
            if (result.success) {
                result.payload = entity_1.Tenant.parseResult(result.payload);
                if (result.payload.length == 0) {
                    return {
                        success: false,
                        message: `Could not find tenant where name=${name}`,
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
                query: "INSERT INTO wb.tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *",
                params: [name, label, new Date(), new Date()],
            });
            if (result.success)
                result.payload = entity_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    updateTenant(id, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            if (name == null && label == null) {
                return {
                    success: false,
                    message: "updateTenant: all parameters are null",
                };
            }
            let paramCount = 3;
            const params = [new Date(), id];
            let query = "UPDATE wb.tenants SET ";
            if (name != null)
                query += `name=$${paramCount}, `;
            params.push(name);
            paramCount++;
            if (label != null)
                query += `label=$${paramCount}, `;
            params.push(label);
            paramCount++;
            query += "updated_at=$1 WHERE id=$2 RETURNING *";
            const result = yield this.executeQuery({
                query: query,
                params: [new Date(), id],
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
                    query: "DELETE FROM wb.tenant_users WHERE tenant_id IN (SELECT id FROM wb.tenants WHERE name like 'test_%')",
                },
                {
                    query: "DELETE FROM wb.tenants WHERE name like 'test_%'",
                },
            ]);
            return results[results.length - 1];
        });
    }
    addUserToTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "INSERT INTO wb.tenant_users(tenant_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)",
                params: [tenantId, userId, tenantRoleId, new Date(), new Date()],
            });
            return result;
        });
    }
    removeUserFromTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "DELETE FROM wb.tenant_users WHERE tenant_id=$1 AND user_id=$2";
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
                query: "SELECT * FROM wb.users WHERE tenant_id=$1",
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
                query: "SELECT * FROM wb.users WHERE id=$1 LIMIT 1",
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
                query: "SELECT * FROM wb.users WHERE email=$1 LIMIT 1",
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
                query: "INSERT INTO wb.users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5) RETURNING *",
                params: [email, firstName, lastName, new Date(), new Date()],
            });
            if (result.success)
                result.payload = entity_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    updateUser(id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (email == null && firstName == null && lastName == null) {
                return { success: false, message: "updateUser: all parameters are null" };
            }
            let paramCount = 3;
            const params = [new Date(), id];
            let query = "UPDATE wb.users SET ";
            if (email != null)
                query += `email=$${paramCount}, `;
            params.push(email);
            paramCount++;
            if (firstName != null)
                query += `first_name=$${paramCount}, `;
            params.push(firstName);
            paramCount++;
            if (lastName != null)
                query += `last_name=$${paramCount}, `;
            params.push(lastName);
            paramCount++;
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
                query: "DELETE FROM wb.users WHERE email like 'test_%test.whitebrick.com'",
                params: [],
            });
            return result;
        });
    }
    roleByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.roles WHERE name=$1 LIMIT 1",
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
                    query: `CREATE SCHEMA "${DAL.sanitize(name)}"`,
                },
                {
                    query: "INSERT INTO wb.schemas(name, label, tenant_owner_id, user_owner_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6) RETURNING *",
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
            const results = yield this.executeQueries([
                {
                    query: "SELECT * FROM information_schema.schemata WHERE schema_name LIKE $1;",
                    params: [schemaNamePattern],
                },
                {
                    query: "SELECT * FROM wb.schemas WHERE name LIKE $1;",
                    params: [schemaNamePattern],
                },
            ]);
            if (results[0].success && results[1].success) {
                results[0].payload = entity_1.Schema.parseResult(results[0].payload);
                results[1].payload = entity_1.Schema.parseResult(results[1].payload);
                if (results[0].payload.length != results[1].payload.length) {
                    return {
                        success: false,
                        message: "wb.schemas out of sync with information_schema.schemata",
                    };
                }
            }
            return results[1];
        });
    }
    schemaByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.schemas WHERE name=$1 LIMIT 1",
                params: [name],
            });
            if (result.success) {
                result.payload = entity_1.Schema.parseResult(result.payload);
                if (result.payload.length == 0) {
                    return {
                        success: false,
                        message: `Could not find schema where name=${name}`,
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
    deleteSchema(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: "DELETE FROM wb.schemas WHERE name=$1",
                    params: [schemaName],
                },
                {
                    query: `DROP SCHEMA IF EXISTS "${DAL.sanitize(schemaName)}" CASCADE`,
                },
            ]);
            return results[results.length - 1];
        });
    }
    addUserToSchema(schemaId, userId, schemaRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "INSERT INTO wb.schema_users(schema_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)",
                params: [schemaId, userId, schemaRoleId, new Date(), new Date()],
            });
            return result;
        });
    }
    removeUserFromSchema(schemaId, userId, schemaRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "DELETE FROM wb.schema_users WHERE schema_id=$1 AND user_id=$2";
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
                query: "DELETE FROM wb.schema_users WHERE schema_id IN (SELECT id FROM wb.schemas WHERE name=$1)",
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
    schemaTableNames(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT table_name FROM information_schema.tables WHERE table_schema=$1",
                params: [schemaName],
            });
            if (result.success) {
                result.payload = result.payload.rows.map((row) => row.table_name);
            }
            return result;
        });
    }
    createTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            const result = yield this.executeQuery({
                query: `CREATE TABLE "${schemaName}"."${tableName}"()`,
                params: [],
            });
            return result;
        });
    }
    deleteTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            schemaName = DAL.sanitize(schemaName);
            tableName = DAL.sanitize(tableName);
            const result = yield this.executeQuery({
                query: `DROP TABLE "${schemaName}"."${tableName}" CASCADE`,
                params: [],
            });
            return result;
        });
    }
}
exports.DAL = DAL;


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
const whitebrick_cloud_1 = __webpack_require__(/*! ./whitebrick-cloud */ "./src/whitebrick-cloud.ts");
const headers = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "x-hasura-admin-secret": "Ha5uraWBStaging",
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
            baseURL: "http://localhost:8080",
            headers,
            withCredentials: false,
        });
        this.instance = http;
        return http;
    }
    post(type, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let result;
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
                    whitebrick_cloud_1.log.error(error.response.data);
                }
                else {
                    whitebrick_cloud_1.log.error(error);
                }
                result = {
                    success: false,
                    message: error.response.data.error,
                    code: error.response.data.code,
                };
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
            if (!result.success && result.code == "already-untracked") {
                return {
                    success: true,
                    payload: true,
                };
            }
            return result;
        });
    }
}
exports.hasuraApi = new HasuraApi();


/***/ }),

/***/ "./src/schema/index.ts":
/*!*****************************!*\
  !*** ./src/schema/index.ts ***!
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
exports.schema = void 0;
const schema_1 = __webpack_require__(/*! ./schema */ "./src/schema/schema.ts");
const tenant_1 = __webpack_require__(/*! ./tenant */ "./src/schema/tenant.ts");
const user_1 = __webpack_require__(/*! ./user */ "./src/schema/user.ts");
const table_1 = __webpack_require__(/*! ./table */ "./src/schema/table.ts");
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
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
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

/***/ "./src/schema/schema.ts":
/*!******************************!*\
  !*** ./src/schema/schema.ts ***!
  \******************************/
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
const apollo_server_lambda_2 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Schema {
    id: ID!
    name: String!
    label: String!
    tenantOwnerId: Int
    userOwnerId: Int
    createdAt: String!
    updatedAt: String!
    userRole: String
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
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateSchema: (_, { name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail, }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createSchema(name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
    },
};


/***/ }),

/***/ "./src/schema/table.ts":
/*!*****************************!*\
  !*** ./src/schema/table.ts ***!
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
const apollo_server_lambda_2 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.typeDefs = apollo_server_lambda_1.gql `
  extend type Query {
    wbSchemaTableNames(schemaName: String!): [String]
  }

  extend type Mutation {
    wbTrackAllTables(schemaName: String!): Boolean!
    wbCreateTable(schemaName: String!, tableName: String!): Boolean!
  }
`;
exports.resolvers = {
    Query: {
        wbSchemaTableNames: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.schemaTableNames(schemaName);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateTable: (_, { schemaName, tableName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createTable(schemaName, tableName);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.success;
        }),
        wbTrackAllTables: (_, { schemaName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.trackAllTables(schemaName);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.success;
        }),
    },
};


/***/ }),

/***/ "./src/schema/tenant.ts":
/*!******************************!*\
  !*** ./src/schema/tenant.ts ***!
  \******************************/
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
const apollo_server_lambda_2 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
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
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbTenantById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenantById(id);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbTenantByName: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenantByName(name);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateTenant: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createTenant(name, label);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbUpdateTenant: (_, { id, name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateTenant(id, name, label);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
    },
};


/***/ }),

/***/ "./src/schema/user.ts":
/*!****************************!*\
  !*** ./src/schema/user.ts ***!
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
const apollo_server_lambda_2 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
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
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbUserById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.userById(id);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbUserByEmail: (_, { email }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.userByEmail(email);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
    },
    Mutation: {
        wbCreateUser: (_, { email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createUser(email, firstName, lastName);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbUpdateUser: (_, { id, email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateUser(id, email, firstName, lastName);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbAddUserToTenant: (_, { tenantName, userEmail, tenantRole }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addUserToTenant(tenantName, userEmail, tenantRole);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
            return result.payload;
        }),
        wbAddUserToSchema: (_, { schemaName, userEmail, schemaRole }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addUserToSchema(schemaName, userEmail, schemaRole);
            if (!result.success) {
                throw new apollo_server_lambda_2.ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
                    ref: result.code,
                });
            }
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
const schema_1 = __webpack_require__(/*! ./schema */ "./src/schema/index.ts");
exports.graphqlHandler = new apollo_server_lambda_1.ApolloServer({
    schema: schema_1.schema,
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
    resetTestData() {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.dal.schemas("test_%");
            if (!result.success)
                return result;
            for (const schema of result.payload) {
                result = yield this.deleteSchema(schema.name);
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
            exports.log.info(`wbCloud.createSchema name=${name}, label=${label}, tenantOwnerId=${tenantOwnerId}, tenantOwnerName=${tenantOwnerName}, userOwnerId=${userOwnerId}, userOwnerEmail=${userOwnerEmail}`);
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
                        message: "Owner could not be found",
                    };
                }
            }
            return yield this.dal.createSchema(name, label, tenantOwnerId, userOwnerId);
        });
    }
    deleteSchema(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.schemaTableNames(schemaName);
            if (!result.success)
                return result;
            for (const tableName of result.payload) {
                result = yield this.deleteTable(schemaName, tableName);
                if (!result.success)
                    return result;
            }
            result = yield this.dal.removeAllUsersFromSchema(schemaName);
            if (!result.success)
                return result;
            return yield this.dal.deleteSchema(schemaName);
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
            const result = yield this.schemasByUserOwner(userEmail);
            if (!result.success)
                return result;
            const userRolesResult = yield this.dal.schemasByUser(userEmail);
            if (!userRolesResult.success)
                return userRolesResult;
            result.payload = result.payload.concat(userRolesResult.payload);
            return result;
        });
    }
    createTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.createTable(schemaName, tableName);
            if (!result.success)
                return result;
            return yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
        });
    }
    deleteTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.dal.deleteTable(schemaName, tableName);
            if (!result.success)
                return result;
            return yield hasura_api_1.hasuraApi.untrackTable(schemaName, tableName);
        });
    }
    schemaTableNames(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dal.schemaTableNames(schemaName);
        });
    }
    trackAllTables(schemaName) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield this.schemaTableNames(schemaName);
            if (!result.success)
                return result;
            for (const tableName of result.payload) {
                result = yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
                if (!result.success)
                    return result;
            }
            return result;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3doaXRlYnJpY2stY2xvdWQuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2RhbC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9Sb2xlLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1NjaGVtYS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UZW5hbnQudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3NjaGVtYS9pbmRleC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3NjaGVtYS9zY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9zY2hlbWEvdGFibGUudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9zY2hlbWEvdGVuYW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvc2NoZW1hL3VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy93aGl0ZWJyaWNrLWNsb3VkLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJheGlvc1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcImdyYXBocWwtdG9vbHNcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwibG9kYXNoXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInBnXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC9leHRlcm5hbCBcInRzbG9nXCIiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5pbXBvcnQgeyBsb2cgfSBmcm9tIFwiLi93aGl0ZWJyaWNrLWNsb3VkXCI7XG5pbXBvcnQgeyBQb29sIH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBUZW5hbnQsIFVzZXIsIFJvbGUsIFNjaGVtYSB9IGZyb20gXCIuL2VudGl0eVwiO1xuaW1wb3J0IHsgUXVlcnlQYXJhbSwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3NjaGVtYVwiO1xuXG5leHBvcnQgY2xhc3MgREFMIHtcbiAgcHJpdmF0ZSBwb29sOiBQb29sO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMucG9vbCA9IG5ldyBQb29sKHtcbiAgICAgIGRhdGFiYXNlOiBlbnZpcm9ubWVudC5kYk5hbWUsXG4gICAgICBob3N0OiBlbnZpcm9ubWVudC5kYkhvc3QsXG4gICAgICBwb3J0OiBlbnZpcm9ubWVudC5kYlBvcnQsXG4gICAgICB1c2VyOiBlbnZpcm9ubWVudC5kYlVzZXIsXG4gICAgICBwYXNzd29yZDogZW52aXJvbm1lbnQuZGJQYXNzd29yZCxcbiAgICAgIG1heDogZW52aXJvbm1lbnQuZGJQb29sTWF4LFxuICAgICAgaWRsZVRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgICAgY29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBzYW5pdGl6ZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXFxcXFwiXSsvZywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtOiBRdWVyeVBhcmFtKSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW3F1ZXJ5UGFyYW1dKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMoXG4gICAgcXVlcnlQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW0+XG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdFtdPiB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHRzOiBBcnJheTxTZXJ2aWNlUmVzdWx0PiA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcbiAgICAgIGZvciAoY29uc3QgcXVlcnlQYXJhbSBvZiBxdWVyeVBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoXG4gICAgICAgICAgYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbTogJHtxdWVyeVBhcmFtLnF1ZXJ5fWAsXG4gICAgICAgICAgcXVlcnlQYXJhbS5wYXJhbXNcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgcXVlcnlQYXJhbS5xdWVyeSxcbiAgICAgICAgICBxdWVyeVBhcmFtLnBhcmFtc1xuICAgICAgICApO1xuICAgICAgICByZXN1bHRzLnB1c2goPFNlcnZpY2VSZXN1bHQ+e1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgcGF5bG9hZDogcmVzcG9uc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiQ09NTUlUXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcbiAgICAgIGxvZy5lcnJvcihlcnJvcik7XG4gICAgICByZXN1bHRzLnB1c2goPFNlcnZpY2VSZXN1bHQ+e1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogZXJyb3IuZGV0YWlsLFxuICAgICAgICBjb2RlOiBlcnJvci5jb2RlLFxuICAgICAgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlbmFudHNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRlbmFudHMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IFwiU0VMRUNUICogRlJPTSB3Yi50ZW5hbnRzXCIsXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRlbmFudC5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiLFxuICAgICAgcGFyYW1zOiBbaWRdLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBcIlNFTEVDVCAqIEZST00gd2IudGVuYW50cyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIixcbiAgICAgIHBhcmFtczogW25hbWVdLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiA8U2VydmljZVJlc3VsdD57XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBmaW5kIHRlbmFudCB3aGVyZSBuYW1lPSR7bmFtZX1gLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVUZW5hbnQoXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGxhYmVsOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6XG4gICAgICAgIFwiSU5TRVJUIElOVE8gd2IudGVuYW50cyhuYW1lLCBsYWJlbCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlwiLFxuICAgICAgcGFyYW1zOiBbbmFtZSwgbGFiZWwsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGVuYW50KFxuICAgIGlkOiBudW1iZXIsXG4gICAgbmFtZTogc3RyaW5nIHwgbnVsbCxcbiAgICBsYWJlbDogc3RyaW5nIHwgbnVsbFxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBpZiAobmFtZSA9PSBudWxsICYmIGxhYmVsID09IG51bGwpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBcInVwZGF0ZVRlbmFudDogYWxsIHBhcmFtZXRlcnMgYXJlIG51bGxcIixcbiAgICAgIH07XG4gICAgfVxuICAgIGxldCBwYXJhbUNvdW50ID0gMztcbiAgICBjb25zdCBwYXJhbXM6IChudW1iZXIgfCBEYXRlIHwgc3RyaW5nIHwgbnVsbClbXSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudGVuYW50cyBTRVQgXCI7XG4gICAgaWYgKG5hbWUgIT0gbnVsbCkgcXVlcnkgKz0gYG5hbWU9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgcGFyYW1zLnB1c2gobmFtZSk7XG4gICAgcGFyYW1Db3VudCsrO1xuICAgIGlmIChsYWJlbCAhPSBudWxsKSBxdWVyeSArPSBgbGFiZWw9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgcGFyYW1zLnB1c2gobGFiZWwpO1xuICAgIHBhcmFtQ291bnQrKztcbiAgICBxdWVyeSArPSBcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IFtuZXcgRGF0ZSgpLCBpZF0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRlbmFudC5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VGVuYW50cygpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OlxuICAgICAgICAgIFwiREVMRVRFIEZST00gd2IudGVuYW50X3VzZXJzIFdIRVJFIHRlbmFudF9pZCBJTiAoU0VMRUNUIGlkIEZST00gd2IudGVuYW50cyBXSEVSRSBuYW1lIGxpa2UgJ3Rlc3RfJScpXCIsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogXCJERUxFVEUgRlJPTSB3Yi50ZW5hbnRzIFdIRVJFIG5hbWUgbGlrZSAndGVzdF8lJ1wiLFxuICAgICAgfSxcbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlbmFudC1Vc2VyLVJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyVG9UZW5hbnQoXG4gICAgdGVuYW50SWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICB0ZW5hbnRSb2xlSWQ6IG51bWJlclxuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTpcbiAgICAgICAgXCJJTlNFUlQgSU5UTyB3Yi50ZW5hbnRfdXNlcnModGVuYW50X2lkLCB1c2VyX2lkLCByb2xlX2lkLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1KVwiLFxuICAgICAgcGFyYW1zOiBbdGVuYW50SWQsIHVzZXJJZCwgdGVuYW50Um9sZUlkLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJGcm9tVGVuYW50KFxuICAgIHRlbmFudElkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgdGVuYW50Um9sZUlkPzogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGxldCBxdWVyeSA9IFwiREVMRVRFIEZST00gd2IudGVuYW50X3VzZXJzIFdIRVJFIHRlbmFudF9pZD0kMSBBTkQgdXNlcl9pZD0kMlwiO1xuICAgIGNvbnN0IHBhcmFtczogKG51bWJlciB8IHVuZGVmaW5lZClbXSA9IFt0ZW5hbnRJZCwgdXNlcklkXTtcbiAgICBpZiAodGVuYW50Um9sZUlkKSBxdWVyeSArPSBcIiBBTkQgcm9sZV9pZD0kM1wiO1xuICAgIHBhcmFtcy5wdXNoKHRlbmFudFJvbGVJZCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBVc2Vyc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeVRlbmFudElkKHRlbmFudElkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnVzZXJzIFdIRVJFIHRlbmFudF9pZD0kMVwiLFxuICAgICAgcGFyYW1zOiBbdGVuYW50SWRdLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnVzZXJzIFdIRVJFIGlkPSQxIExJTUlUIDFcIixcbiAgICAgIHBhcmFtczogW2lkXSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChlbWFpbDogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IFwiU0VMRUNUICogRlJPTSB3Yi51c2VycyBXSEVSRSBlbWFpbD0kMSBMSU1JVCAxXCIsXG4gICAgICBwYXJhbXM6IFtlbWFpbF0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6XG4gICAgICAgIFwiSU5TRVJUIElOVE8gd2IudXNlcnMoZW1haWwsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSkgUkVUVVJOSU5HICpcIixcbiAgICAgIHBhcmFtczogW2VtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKFxuICAgIGlkOiBudW1iZXIsXG4gICAgZW1haWw6IHN0cmluZyB8IG51bGwsXG4gICAgZmlyc3ROYW1lOiBzdHJpbmcgfCBudWxsLFxuICAgIGxhc3ROYW1lOiBzdHJpbmcgfCBudWxsXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGlmIChlbWFpbCA9PSBudWxsICYmIGZpcnN0TmFtZSA9PSBudWxsICYmIGxhc3ROYW1lID09IG51bGwpIHtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiBcInVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCIgfTtcbiAgICB9XG4gICAgbGV0IHBhcmFtQ291bnQgPSAzO1xuICAgIGNvbnN0IHBhcmFtczogKERhdGUgfCBudW1iZXIgfCBzdHJpbmcgfCBudWxsKVtdID0gW25ldyBEYXRlKCksIGlkXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi51c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsICE9IG51bGwpIHF1ZXJ5ICs9IGBlbWFpbD0kJHtwYXJhbUNvdW50fSwgYDtcbiAgICBwYXJhbXMucHVzaChlbWFpbCk7XG4gICAgcGFyYW1Db3VudCsrO1xuICAgIGlmIChmaXJzdE5hbWUgIT0gbnVsbCkgcXVlcnkgKz0gYGZpcnN0X25hbWU9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgcGFyYW1zLnB1c2goZmlyc3ROYW1lKTtcbiAgICBwYXJhbUNvdW50Kys7XG4gICAgaWYgKGxhc3ROYW1lICE9IG51bGwpIHF1ZXJ5ICs9IGBsYXN0X25hbWU9JCR7cGFyYW1Db3VudH0sIGA7XG4gICAgcGFyYW1zLnB1c2gobGFzdE5hbWUpO1xuICAgIHBhcmFtQ291bnQrKztcbiAgICBxdWVyeSArPSBcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6XG4gICAgICAgIFwiREVMRVRFIEZST00gd2IudXNlcnMgV0hFUkUgZW1haWwgbGlrZSAndGVzdF8ldGVzdC53aGl0ZWJyaWNrLmNvbSdcIixcbiAgICAgIHBhcmFtczogW10sXG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnJvbGVzIFdIRVJFIG5hbWU9JDEgTElNSVQgMVwiLFxuICAgICAgcGFyYW1zOiBbbmFtZV0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFJvbGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogU2NoZW1hc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlU2NoZW1hKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIHRlbmFudE93bmVySWQ6IG51bWJlciB8IG51bGwsXG4gICAgdXNlck93bmVySWQ6IG51bWJlciB8IG51bGxcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYENSRUFURSBTQ0hFTUEgXCIke0RBTC5zYW5pdGl6ZShuYW1lKX1cImAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTpcbiAgICAgICAgICBcIklOU0VSVCBJTlRPIHdiLnNjaGVtYXMobmFtZSwgbGFiZWwsIHRlbmFudF9vd25lcl9pZCwgdXNlcl9vd25lcl9pZCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSwgJDYpIFJFVFVSTklORyAqXCIsXG4gICAgICAgIHBhcmFtczogW1xuICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgbGFiZWwsXG4gICAgICAgICAgdGVuYW50T3duZXJJZCxcbiAgICAgICAgICB1c2VyT3duZXJJZCxcbiAgICAgICAgICBuZXcgRGF0ZSgpLFxuICAgICAgICAgIG5ldyBEYXRlKCksXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF0pO1xuICAgIGNvbnN0IGluc2VydFJlc3VsdDogU2VydmljZVJlc3VsdCA9IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXTtcbiAgICBpZiAoaW5zZXJ0UmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIGluc2VydFJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KGluc2VydFJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIGluc2VydFJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzKFxuICAgIHNjaGVtYU5hbWVQYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgaWYgKCFzY2hlbWFOYW1lUGF0dGVybikgc2NoZW1hTmFtZVBhdHRlcm4gPSBcIiVcIjtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OlxuICAgICAgICAgIFwiU0VMRUNUICogRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGEgV0hFUkUgc2NoZW1hX25hbWUgTElLRSAkMTtcIixcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZVBhdHRlcm5dLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IFwiU0VMRUNUICogRlJPTSB3Yi5zY2hlbWFzIFdIRVJFIG5hbWUgTElLRSAkMTtcIixcbiAgICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZVBhdHRlcm5dLFxuICAgICAgfSxcbiAgICBdKTtcbiAgICBpZiAocmVzdWx0c1swXS5zdWNjZXNzICYmIHJlc3VsdHNbMV0uc3VjY2Vzcykge1xuICAgICAgcmVzdWx0c1swXS5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KHJlc3VsdHNbMF0ucGF5bG9hZCk7XG4gICAgICByZXN1bHRzWzFdLnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0c1sxXS5wYXlsb2FkKTtcbiAgICAgIGlmIChyZXN1bHRzWzBdLnBheWxvYWQubGVuZ3RoICE9IHJlc3VsdHNbMV0ucGF5bG9hZC5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIDxTZXJ2aWNlUmVzdWx0PntcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBtZXNzYWdlOiBcIndiLnNjaGVtYXMgb3V0IG9mIHN5bmMgd2l0aCBpbmZvcm1hdGlvbl9zY2hlbWEuc2NoZW1hdGFcIixcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHNbMV07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBcIlNFTEVDVCAqIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIixcbiAgICAgIHBhcmFtczogW25hbWVdLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiA8U2VydmljZVJlc3VsdD57XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBmaW5kIHNjaGVtYSB3aGVyZSBuYW1lPSR7bmFtZX1gLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LnBheWxvYWQgPSByZXN1bHQucGF5bG9hZFswXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYFxuICAgICAgICBTRUxFQ1Qgd2Iuc2NoZW1hcy4qIEZST00gd2Iuc2NoZW1hc1xuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYXMudXNlcl9vd25lcl9pZD13Yi51c2Vycy5pZFxuICAgICAgICBXSEVSRSB3Yi51c2Vycy5lbWFpbD0kMVxuICAgICAgYCxcbiAgICAgIHBhcmFtczogW3VzZXJFbWFpbF0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAvLyBUQkQ6IG1hcCB0aGlzIGluc3RlYWRcbiAgICAgIGNvbnN0IHNjaGVtYXNXaXRoUm9sZSA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICAgIGZvciAoY29uc3Qgc2NoZW1hIG9mIFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCkpIHtcbiAgICAgICAgc2NoZW1hLnVzZXJSb2xlID0gXCJzY2hlbWFfb3duZXJcIjtcbiAgICAgICAgc2NoZW1hc1dpdGhSb2xlLnB1c2goc2NoZW1hKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wYXlsb2FkID0gc2NoZW1hc1dpdGhSb2xlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcmllcyhbXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBcIkRFTEVURSBGUk9NIHdiLnNjaGVtYXMgV0hFUkUgbmFtZT0kMVwiLFxuICAgICAgICBwYXJhbXM6IFtzY2hlbWFOYW1lXSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgRFJPUCBTQ0hFTUEgSUYgRVhJU1RTIFwiJHtEQUwuc2FuaXRpemUoc2NoZW1hTmFtZSl9XCIgQ0FTQ0FERWAsXG4gICAgICB9LFxuICAgIF0pO1xuICAgIHJldHVybiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICAvKipcbiAgICogU2NoZW1hLVVzZXItUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJUb1NjaGVtYShcbiAgICBzY2hlbWFJZDogbnVtYmVyLFxuICAgIHVzZXJJZDogbnVtYmVyLFxuICAgIHNjaGVtYVJvbGVJZDogbnVtYmVyXG4gICk6IFByb21pc2U8U2VydmljZVJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OlxuICAgICAgICBcIklOU0VSVCBJTlRPIHdiLnNjaGVtYV91c2VycyhzY2hlbWFfaWQsIHVzZXJfaWQsIHJvbGVfaWQsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpIFZBTFVFUygkMSwgJDIsICQzLCAkNCwgJDUpXCIsXG4gICAgICBwYXJhbXM6IFtzY2hlbWFJZCwgdXNlcklkLCBzY2hlbWFSb2xlSWQsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldLFxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlVXNlckZyb21TY2hlbWEoXG4gICAgc2NoZW1hSWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBzY2hlbWFSb2xlSWQ/OiBudW1iZXJcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgbGV0IHF1ZXJ5ID0gXCJERUxFVEUgRlJPTSB3Yi5zY2hlbWFfdXNlcnMgV0hFUkUgc2NoZW1hX2lkPSQxIEFORCB1c2VyX2lkPSQyXCI7XG4gICAgY29uc3QgcGFyYW1zOiAobnVtYmVyIHwgdW5kZWZpbmVkKVtdID0gW3NjaGVtYUlkLCB1c2VySWRdO1xuICAgIGlmIChzY2hlbWFSb2xlSWQpIHF1ZXJ5ICs9IFwiIEFORCByb2xlX2lkPSQzXCI7XG4gICAgcGFyYW1zLnB1c2goc2NoZW1hUm9sZUlkKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogcXVlcnksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6XG4gICAgICAgIFwiREVMRVRFIEZST00gd2Iuc2NoZW1hX3VzZXJzIFdIRVJFIHNjaGVtYV9pZCBJTiAoU0VMRUNUIGlkIEZST00gd2Iuc2NoZW1hcyBXSEVSRSBuYW1lPSQxKVwiLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzY2hlbWFzQnlVc2VyKHVzZXJFbWFpbDogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBcbiAgICAgICAgU0VMRUNUIHdiLnNjaGVtYXMuKiwgd2Iucm9sZXMubmFtZSBhcyByb2xlX25hbWVcbiAgICAgICAgRlJPTSB3Yi5zY2hlbWFzXG4gICAgICAgIEpPSU4gd2Iuc2NoZW1hX3VzZXJzIE9OIHdiLnNjaGVtYXMuaWQ9d2Iuc2NoZW1hX3VzZXJzLnNjaGVtYV9pZFxuICAgICAgICBKT0lOIHdiLnVzZXJzIE9OIHdiLnNjaGVtYV91c2Vycy51c2VyX2lkPXdiLnVzZXJzLmlkXG4gICAgICAgIEpPSU4gd2Iucm9sZXMgT04gd2Iuc2NoZW1hX3VzZXJzLnJvbGVfaWQ9d2Iucm9sZXMuaWRcbiAgICAgICAgV0hFUkUgd2IudXNlcnMuZW1haWw9JDFcbiAgICAgIGAsXG4gICAgICBwYXJhbXM6IFt1c2VyRW1haWxdLFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgLy8gVEJEOiBtYXAgdGhpcyBpbnN0ZWFkXG4gICAgICBjb25zdCBzY2hlbWFzV2l0aFJvbGUgPSBBcnJheTxTY2hlbWE+KCk7XG4gICAgICBsZXQgc2NoZW1hOiBTY2hlbWE7XG4gICAgICByZXN1bHQucGF5bG9hZC5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICAgIHNjaGVtYSA9IFNjaGVtYS5wYXJzZShyb3cpO1xuICAgICAgICBzY2hlbWEudXNlclJvbGUgPSByb3cucm9sZV9uYW1lO1xuICAgICAgICBzY2hlbWFzV2l0aFJvbGUucHVzaChzY2hlbWEpO1xuICAgICAgfSk7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHNjaGVtYXNXaXRoUm9sZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUYWJsZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYVRhYmxlTmFtZXMoc2NoZW1hTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6XG4gICAgICAgIFwiU0VMRUNUIHRhYmxlX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX3NjaGVtYT0kMVwiLFxuICAgICAgcGFyYW1zOiBbc2NoZW1hTmFtZV0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXN1bHQucGF5bG9hZCA9IHJlc3VsdC5wYXlsb2FkLnJvd3MubWFwKFxuICAgICAgICAocm93OiB7IHRhYmxlX25hbWU6IHN0cmluZyB9KSA9PiByb3cudGFibGVfbmFtZVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVUYWJsZShcbiAgICBzY2hlbWFOYW1lOiBzdHJpbmcsXG4gICAgdGFibGVOYW1lOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxTZXJ2aWNlUmVzdWx0PiB7XG4gICAgc2NoZW1hTmFtZSA9IERBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKTtcbiAgICB0YWJsZU5hbWUgPSBEQUwuc2FuaXRpemUodGFibGVOYW1lKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogYENSRUFURSBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiKClgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRhYmxlKFxuICAgIHNjaGVtYU5hbWU6IHN0cmluZyxcbiAgICB0YWJsZU5hbWU6IHN0cmluZ1xuICApOiBQcm9taXNlPFNlcnZpY2VSZXN1bHQ+IHtcbiAgICBzY2hlbWFOYW1lID0gREFMLnNhbml0aXplKHNjaGVtYU5hbWUpO1xuICAgIHRhYmxlTmFtZSA9IERBTC5zYW5pdGl6ZSh0YWJsZU5hbWUpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBgRFJPUCBUQUJMRSBcIiR7c2NoZW1hTmFtZX1cIi5cIiR7dGFibGVOYW1lfVwiIENBU0NBREVgLFxuICAgICAgcGFyYW1zOiBbXSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgdHlwZSBSb2xlTmFtZSA9XG4gIHwgXCJ0ZW5hbnRfdXNlclwiXG4gIHwgXCJ0ZW5hbnRfYWRtaW5cIlxuICB8IFwic2NoZW1hX293bmVyXCJcbiAgfCBcInNjaGVtYV9hZG1pbmlzdHJhdG9yXCJcbiAgfCBcInNjaGVtYV9lZGl0b3JcIlxuICB8IFwic2NoZW1hX2NvbW1lbnRlclwiXG4gIHwgXCJzY2hlbWFfcmVhZGVyXCI7XG5cbmV4cG9ydCBjbGFzcyBSb2xlIHtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxSb2xlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJSb2xlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHJvbGVzID0gQXJyYXk8Um9sZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHJvbGVzLnB1c2goUm9sZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBSb2xlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlJvbGUucGFyc2U6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBSb2xlKCk7XG4gICAgcm9sZS5pZCA9IGRhdGEuaWQ7XG4gICAgcm9sZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHJldHVybiByb2xlO1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuaW1wb3J0IHsgUm9sZU5hbWUgfSBmcm9tIFwiLi9Sb2xlXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWEge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIHRlbmFudE93bmVySWQ6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQ7XG4gIHVzZXJPd25lcklkOiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuICB1c2VyUm9sZTogUm9sZU5hbWUgfCBudWxsIHwgdW5kZWZpbmVkO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8U2NoZW1hPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGxcIik7XG4gICAgY29uc3Qgc2NoZW1hcyA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHNjaGVtYXMucHVzaChTY2hlbWEucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBTY2hlbWEge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiU2NoZW1hLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWEoKTtcbiAgICBzY2hlbWEuaWQgPSBkYXRhLmlkO1xuICAgIHNjaGVtYS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHNjaGVtYS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgc2NoZW1hLnRlbmFudE93bmVySWQgPSBkYXRhLnRlbmFudE93bmVySWQ7XG4gICAgc2NoZW1hLnVzZXJPd25lcklkID0gZGF0YS51c2VyT3duZXJJZDtcbiAgICBzY2hlbWEuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFRlbmFudCB7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRlbmFudD4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVGVuYW50LnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHRlbmFudHMgPSBBcnJheTxUZW5hbnQ+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0ZW5hbnRzLnB1c2goVGVuYW50LnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0ZW5hbnRzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVGVuYW50IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcihcIlRlbmFudC5wYXJzZTogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB0ZW5hbnQgPSBuZXcgVGVuYW50KCk7XG4gICAgdGVuYW50LmlkID0gZGF0YS5pZDtcbiAgICB0ZW5hbnQubmFtZSA9IGRhdGEubmFtZTtcbiAgICB0ZW5hbnQubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHRlbmFudC5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdGVuYW50LnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gdGVuYW50O1xuICB9XG59XG4iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVXNlciB7XG4gIGlkITogbnVtYmVyO1xuICB0ZW5hbnRfaWQhOiBudW1iZXI7XG4gIGVtYWlsITogc3RyaW5nO1xuICBmaXJzdE5hbWUhOiBzdHJpbmc7XG4gIGxhc3ROYW1lITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbFwiKTtcbiAgICBjb25zdCB1c2VycyA9IEFycmF5PFVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB1c2Vycy5wdXNoKFVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsXCIpO1xuICAgIGNvbnN0IHVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBkYXRhLmlkO1xuICAgIHVzZXIuZW1haWwgPSBkYXRhLmVtYWlsO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gZGF0YS5maXJzdF9uYW1lO1xuICAgIHVzZXIubGFzdE5hbWUgPSBkYXRhLmxhc3RfbmFtZTtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vUm9sZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vU2NoZW1hXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9UZW5hbnRcIjtcbmV4cG9ydCAqIGZyb20gXCIuL1VzZXJcIjtcbiIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmc7XG4gIGRiSG9zdDogc3RyaW5nO1xuICBkYlBvcnQ6IG51bWJlcjtcbiAgZGJVc2VyOiBzdHJpbmc7XG4gIGRiUGFzc3dvcmQ6IHN0cmluZztcbiAgZGJQb29sTWF4OiBudW1iZXI7XG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXI7XG59O1xuXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBwcm9jZXNzLmVudi5TRUNSRVRfTUVTU0FHRSBhcyBzdHJpbmcsXG4gIGRiTmFtZTogcHJvY2Vzcy5lbnYuREJfTkFNRSBhcyBzdHJpbmcsXG4gIGRiSG9zdDogcHJvY2Vzcy5lbnYuREJfSE9TVCBhcyBzdHJpbmcsXG4gIGRiUG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9SVCB8fCBcIlwiKSBhcyBudW1iZXIsXG4gIGRiVXNlcjogcHJvY2Vzcy5lbnYuREJfVVNFUiBhcyBzdHJpbmcsXG4gIGRiUGFzc3dvcmQ6IHByb2Nlc3MuZW52LkRCX1BBU1NXT1JEIGFzIHN0cmluZyxcbiAgZGJQb29sTWF4OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX01BWCB8fCBcIlwiKSBhcyBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBwYXJzZUludChcbiAgICBwcm9jZXNzLmVudi5EQl9QT09MX0lETEVfVElNRU9VVF9NSUxMSVMgfHwgXCJcIlxuICApIGFzIG51bWJlcixcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KFxuICAgIHByb2Nlc3MuZW52LkRCX1BPT0xfQ09OTkVDVElPTl9USU1FT1VUX01JTExJUyB8fCBcIlwiXG4gICkgYXMgbnVtYmVyLFxufTtcbiIsIi8vIGh0dHBzOi8vYWx0cmltLmlvL3Bvc3RzL2F4aW9zLWh0dHAtY2xpZW50LXVzaW5nLXR5cGVzY3JpcHRcblxuaW1wb3J0IGF4aW9zLCB7IEF4aW9zSW5zdGFuY2UsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi9zY2hlbWFcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL3doaXRlYnJpY2stY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgXCJ4LWhhc3VyYS1hZG1pbi1zZWNyZXRcIjogXCJIYTV1cmFXQlN0YWdpbmdcIixcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogXCJodHRwOi8vbG9jYWxob3N0OjgwODBcIixcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSB7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KFxuICAgICAgICBcIi92MS9tZXRhZGF0YVwiLFxuICAgICAgICB7XG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICBhcmdzOiBhcmdzLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvci5yZXNwb25zZSAmJiBlcnJvci5yZXNwb25zZS5kYXRhKSB7XG4gICAgICAgIGxvZy5lcnJvcihlcnJvci5yZXNwb25zZS5kYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy5lcnJvcihlcnJvcik7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICBjb2RlOiBlcnJvci5yZXNwb25zZS5kYXRhLmNvZGUsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRyYWNrVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucG9zdChcInBnX3RyYWNrX3RhYmxlXCIsIHtcbiAgICAgIHRhYmxlOiB7XG4gICAgICAgIHNjaGVtYTogc2NoZW1hTmFtZSxcbiAgICAgICAgbmFtZTogdGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVudHJhY2tUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wb3N0KFwicGdfdW50cmFja190YWJsZVwiLCB7XG4gICAgICB0YWJsZToge1xuICAgICAgICBzY2hlbWE6IHNjaGVtYU5hbWUsXG4gICAgICAgIG5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICBjYXNjYWRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LmNvZGUgPT0gXCJhbHJlYWR5LXVudHJhY2tlZFwiKSB7XG4gICAgICByZXR1cm4gPFNlcnZpY2VSZXN1bHQ+e1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiB0cnVlLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFzdXJhQXBpID0gbmV3IEhhc3VyYUFwaSgpO1xuIiwiaW1wb3J0IHsgdHlwZURlZnMgYXMgU2NoZW1hLCByZXNvbHZlcnMgYXMgc2NoZW1hUmVzb2x2ZXJzIH0gZnJvbSBcIi4vc2NoZW1hXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyBhcyBUZW5hbnQsIHJlc29sdmVycyBhcyB0ZW5hbnRSZXNvbHZlcnMgfSBmcm9tIFwiLi90ZW5hbnRcIjtcbmltcG9ydCB7IHR5cGVEZWZzIGFzIFVzZXIsIHJlc29sdmVycyBhcyB1c2VyUmVzb2x2ZXJzIH0gZnJvbSBcIi4vdXNlclwiO1xuaW1wb3J0IHsgdHlwZURlZnMgYXMgVGFibGUsIHJlc29sdmVycyBhcyB0YWJsZVJlc29sdmVycyB9IGZyb20gXCIuL3RhYmxlXCI7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gXCJsb2Rhc2hcIjtcbmltcG9ydCB7IGdxbCwgQXBvbGxvRXJyb3IsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7XG4gIGNvbnN0cmFpbnREaXJlY3RpdmUsXG4gIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbn0gZnJvbSBcImdyYXBocWwtY29uc3RyYWludC1kaXJlY3RpdmVcIjtcbmltcG9ydCB7IG1ha2VFeGVjdXRhYmxlU2NoZW1hIH0gZnJvbSBcImdyYXBocWwtdG9vbHNcIjtcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnkgfVxuICB8IHsgc3VjY2VzczogZmFsc2U7IG1lc3NhZ2U6IHN0cmluZzsgY29kZT86IHN0cmluZyB9O1xuXG5leHBvcnQgdHlwZSBRdWVyeVBhcmFtID0ge1xuICBxdWVyeTogc3RyaW5nO1xuICBwYXJhbXM/OiBhbnlbXTtcbn07XG5cbmNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFF1ZXJ5IHtcbiAgICB3YkhlYWx0aENoZWNrOiBTdHJpbmchXG4gIH1cblxuICB0eXBlIE11dGF0aW9uIHtcbiAgICB3YlJlc2V0VGVzdERhdGE6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiAoKSA9PiBcIkFsbCBnb29kXCIsXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIiwge1xuICAgICAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gIH0sXG59O1xuXG5leHBvcnQgY29uc3Qgc2NoZW1hID0gbWFrZUV4ZWN1dGFibGVTY2hlbWEoe1xuICB0eXBlRGVmczogW1xuICAgIGNvbnN0cmFpbnREaXJlY3RpdmVUeXBlRGVmcyxcbiAgICB0eXBlRGVmcyxcbiAgICBUZW5hbnQsXG4gICAgVXNlcixcbiAgICBTY2hlbWEsXG4gICAgVGFibGUsXG4gIF0sXG4gIHJlc29sdmVyczogbWVyZ2UoXG4gICAgcmVzb2x2ZXJzLFxuICAgIHRlbmFudFJlc29sdmVycyxcbiAgICB1c2VyUmVzb2x2ZXJzLFxuICAgIHNjaGVtYVJlc29sdmVycyxcbiAgICB0YWJsZVJlc29sdmVyc1xuICApLFxuICBzY2hlbWFUcmFuc2Zvcm1zOiBbY29uc3RyYWludERpcmVjdGl2ZSgpXSxcbn0pO1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIHR5cGUgU2NoZW1hIHtcbiAgICBpZDogSUQhXG4gICAgbmFtZTogU3RyaW5nIVxuICAgIGxhYmVsOiBTdHJpbmchXG4gICAgdGVuYW50T3duZXJJZDogSW50XG4gICAgdXNlck93bmVySWQ6IEludFxuICAgIGNyZWF0ZWRBdDogU3RyaW5nIVxuICAgIHVwZGF0ZWRBdDogU3RyaW5nIVxuICAgIHVzZXJSb2xlOiBTdHJpbmdcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlNjaGVtYXModXNlckVtYWlsOiBTdHJpbmchKTogW1NjaGVtYV1cbiAgfVxuXG4gIGV4dGVuZCB0eXBlIE11dGF0aW9uIHtcbiAgICB3YkNyZWF0ZVNjaGVtYShcbiAgICAgIG5hbWU6IFN0cmluZyFcbiAgICAgIGxhYmVsOiBTdHJpbmchXG4gICAgICB0ZW5hbnRPd25lcklkOiBJbnRcbiAgICAgIHRlbmFudE93bmVyTmFtZTogU3RyaW5nXG4gICAgICB1c2VyT3duZXJJZDogSW50XG4gICAgICB1c2VyT3duZXJFbWFpbDogU3RyaW5nXG4gICAgKTogU2NoZW1hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JTY2hlbWFzOiBhc3luYyAoXywgeyB1c2VyRW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFjY2Vzc2libGVTY2hlbWFzKHVzZXJFbWFpbCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIiwge1xuICAgICAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG4gIE11dGF0aW9uOiB7XG4gICAgd2JDcmVhdGVTY2hlbWE6IGFzeW5jIChcbiAgICAgIF8sXG4gICAgICB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICB0ZW5hbnRPd25lcklkLFxuICAgICAgICB0ZW5hbnRPd25lck5hbWUsXG4gICAgICAgIHVzZXJPd25lcklkLFxuICAgICAgICB1c2VyT3duZXJFbWFpbCxcbiAgICAgIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlU2NoZW1hKFxuICAgICAgICBuYW1lLFxuICAgICAgICBsYWJlbCxcbiAgICAgICAgdGVuYW50T3duZXJJZCxcbiAgICAgICAgdGVuYW50T3duZXJOYW1lLFxuICAgICAgICB1c2VyT3duZXJJZCxcbiAgICAgICAgdXNlck93bmVyRW1haWxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIiwge1xuICAgICAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgZ3FsLCBJUmVzb2x2ZXJzIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyBBcG9sbG9FcnJvciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuXG5leHBvcnQgY29uc3QgdHlwZURlZnMgPSBncWxgXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlNjaGVtYVRhYmxlTmFtZXMoc2NoZW1hTmFtZTogU3RyaW5nISk6IFtTdHJpbmddXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JUcmFja0FsbFRhYmxlcyhzY2hlbWFOYW1lOiBTdHJpbmchKTogQm9vbGVhbiFcbiAgICB3YkNyZWF0ZVRhYmxlKHNjaGVtYU5hbWU6IFN0cmluZyEsIHRhYmxlTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JTY2hlbWFUYWJsZU5hbWVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5zY2hlbWFUYWJsZU5hbWVzKHNjaGVtYU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCIsIHtcbiAgICAgICAgICByZWY6IHJlc3VsdC5jb2RlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIHdiQ3JlYXRlVGFibGU6IGFzeW5jIChfLCB7IHNjaGVtYU5hbWUsIHRhYmxlTmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICB3YlRyYWNrQWxsVGFibGVzOiBhc3luYyAoXywgeyBzY2hlbWFOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50cmFja0FsbFRhYmxlcyhzY2hlbWFOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBUZW5hbnQge1xuICAgIGlkOiBJRCFcbiAgICBuYW1lOiBTdHJpbmchXG4gICAgbGFiZWw6IFN0cmluZyFcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlRlbmFudHM6IFtUZW5hbnRdXG4gICAgd2JUZW5hbnRCeUlkKGlkOiBJRCEpOiBUZW5hbnRcbiAgICB3YlRlbmFudEJ5TmFtZShuYW1lOiBTdHJpbmchKTogVGVuYW50XG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JDcmVhdGVUZW5hbnQobmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBUZW5hbnRcbiAgICB3YlVwZGF0ZVRlbmFudChpZDogSUQhLCBuYW1lOiBTdHJpbmcsIGxhYmVsOiBTdHJpbmcpOiBUZW5hbnRcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YlRlbmFudHM6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnRlbmFudHMoKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlRlbmFudEJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50ZW5hbnRCeUlkKGlkKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlRlbmFudEJ5TmFtZTogYXN5bmMgKF8sIHsgbmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudGVuYW50QnlOYW1lKG5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCIsIHtcbiAgICAgICAgICByZWY6IHJlc3VsdC5jb2RlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuICBNdXRhdGlvbjoge1xuICAgIHdiQ3JlYXRlVGVuYW50OiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlVGVuYW50KG5hbWUsIGxhYmVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVRlbmFudDogYXN5bmMgKF8sIHsgaWQsIG5hbWUsIGxhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVUZW5hbnQoaWQsIG5hbWUsIGxhYmVsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBncWwsIElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBVc2VyIHtcbiAgICBpZDogSUQhXG4gICAgZW1haWw6IFN0cmluZyFcbiAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgIGxhc3ROYW1lOiBTdHJpbmdcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyFcbiAgICB1cGRhdGVkQXQ6IFN0cmluZyFcbiAgfVxuXG4gIGV4dGVuZCB0eXBlIFF1ZXJ5IHtcbiAgICB3YlVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZDogSUQhKTogW1VzZXJdXG4gICAgd2JVc2VyQnlJZChpZDogSUQhKTogVXNlclxuICAgIHdiVXNlckJ5RW1haWwoZW1haWw6IFN0cmluZyEpOiBVc2VyXG4gIH1cblxuICBleHRlbmQgdHlwZSBNdXRhdGlvbiB7XG4gICAgd2JDcmVhdGVVc2VyKGVtYWlsOiBTdHJpbmchLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICB3YlVwZGF0ZVVzZXIoXG4gICAgICBpZDogSUQhXG4gICAgICBlbWFpbDogU3RyaW5nXG4gICAgICBmaXJzdE5hbWU6IFN0cmluZ1xuICAgICAgbGFzdE5hbWU6IFN0cmluZ1xuICAgICk6IFVzZXJcbiAgICBcIlwiXCJcbiAgICBUZW5hbnQtVXNlci1Sb2xlc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkVXNlclRvVGVuYW50KFxuICAgICAgdGVuYW50TmFtZTogU3RyaW5nIVxuICAgICAgdXNlckVtYWlsOiBTdHJpbmchXG4gICAgICB0ZW5hbnRSb2xlOiBTdHJpbmchXG4gICAgKTogVXNlclxuICAgIFwiXCJcIlxuICAgIFNjaGVtYS1Vc2VyLVJvbGVzXG4gICAgXCJcIlwiXG4gICAgd2JBZGRVc2VyVG9TY2hlbWEoXG4gICAgICBzY2hlbWFOYW1lOiBTdHJpbmchXG4gICAgICB1c2VyRW1haWw6IFN0cmluZyFcbiAgICAgIHNjaGVtYVJvbGU6IFN0cmluZyFcbiAgICApOiBVc2VyXG4gIH1cbmA7XG5cbmV4cG9ydCBjb25zdCByZXNvbHZlcnM6IElSZXNvbHZlcnMgPSB7XG4gIFF1ZXJ5OiB7XG4gICAgd2JVc2Vyc0J5VGVuYW50SWQ6IGFzeW5jIChfLCB7IHRlbmFudElkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2Vyc0J5VGVuYW50SWQodGVuYW50SWQpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCIsIHtcbiAgICAgICAgICByZWY6IHJlc3VsdC5jb2RlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChpZCk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIiwge1xuICAgICAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2VyQnlFbWFpbDogYXN5bmMgKF8sIHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJCeUVtYWlsKGVtYWlsKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbiAgTXV0YXRpb246IHtcbiAgICAvLyBVc2Vyc1xuICAgIHdiQ3JlYXRlVXNlcjogYXN5bmMgKF8sIHsgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVVzZXIoXG4gICAgICAgIGVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGxhc3ROYW1lXG4gICAgICApO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIFwiSU5URVJOQUxfU0VSVkVSX0VSUk9SXCIsIHtcbiAgICAgICAgICByZWY6IHJlc3VsdC5jb2RlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVXNlcjogYXN5bmMgKF8sIHsgaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVVc2VyKFxuICAgICAgICBpZCxcbiAgICAgICAgZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIiwge1xuICAgICAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVGVuYW50LVVzZXItUm9sZXNcbiAgICB3YkFkZFVzZXJUb1RlbmFudDogYXN5bmMgKFxuICAgICAgXyxcbiAgICAgIHsgdGVuYW50TmFtZSwgdXNlckVtYWlsLCB0ZW5hbnRSb2xlIH0sXG4gICAgICBjb250ZXh0XG4gICAgKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkVXNlclRvVGVuYW50KFxuICAgICAgICB0ZW5hbnROYW1lLFxuICAgICAgICB1c2VyRW1haWwsXG4gICAgICAgIHRlbmFudFJvbGVcbiAgICAgICk7XG4gICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXCJJTlRFUk5BTF9TRVJWRVJfRVJST1JcIiwge1xuICAgICAgICAgIHJlZjogcmVzdWx0LmNvZGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVGVuYW50LVNjaGVtYS1Sb2xlc1xuICAgIHdiQWRkVXNlclRvU2NoZW1hOiBhc3luYyAoXG4gICAgICBfLFxuICAgICAgeyBzY2hlbWFOYW1lLCB1c2VyRW1haWwsIHNjaGVtYVJvbGUgfSxcbiAgICAgIGNvbnRleHRcbiAgICApID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRVc2VyVG9TY2hlbWEoXG4gICAgICAgIHNjaGVtYU5hbWUsXG4gICAgICAgIHVzZXJFbWFpbCxcbiAgICAgICAgc2NoZW1hUm9sZVxuICAgICAgKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBcIklOVEVSTkFMX1NFUlZFUl9FUlJPUlwiLCB7XG4gICAgICAgICAgcmVmOiByZXN1bHQuY29kZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcbn07XG4iLCJpbXBvcnQgeyBBcG9sbG9TZXJ2ZXIgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCJ0c2xvZ1wiO1xuaW1wb3J0IHsgREFMIH0gZnJvbSBcIi4vZGFsXCI7XG5pbXBvcnQgeyBoYXN1cmFBcGkgfSBmcm9tIFwiLi9oYXN1cmEtYXBpXCI7XG5pbXBvcnQgeyBTY2hlbWEsIFJvbGVOYW1lIH0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQgeyBzY2hlbWEgfSBmcm9tIFwiLi9zY2hlbWFcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxIYW5kbGVyID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gIHNjaGVtYSxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICB3YkNsb3VkOiBuZXcgV2hpdGVicmlja0Nsb3VkKCksXG4gICAgfTtcbiAgfSxcbn0pLmNyZWF0ZUhhbmRsZXIoKTtcblxuZXhwb3J0IGNvbnN0IGxvZzogTG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gIG1pbkxldmVsOiBcImRlYnVnXCIsXG59KTtcblxuY2xhc3MgV2hpdGVicmlja0Nsb3VkIHtcbiAgZGFsID0gbmV3IERBTCgpO1xuXG4gIC8qKlxuICAgKiBUZXN0XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKCkge1xuICAgIGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5zY2hlbWFzKFwidGVzdF8lXCIpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCBzY2hlbWEgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlU2NoZW1hKHNjaGVtYS5uYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVRlc3RUZW5hbnRzKCk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRlbmFudHNcbiAgICogVEJEOiB2YWxpZGF0ZSBuYW1lIH4gW2Etel17MX1bYS16MC05XXsyLH1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRlbmFudHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRlbmFudHMoKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeUlkKGlkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudGVuYW50QnlJZChpZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC50ZW5hbnRCeU5hbWUobmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVGVuYW50KG5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC5jcmVhdGVUZW5hbnQobmFtZSwgbGFiZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRlbmFudChpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFRlbmFudHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RUZW5hbnRzKCk7XG4gIH1cblxuICAvKipcbiAgICogVGVuYW50LVVzZXItUm9sZXNcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGFkZFVzZXJUb1RlbmFudChcbiAgICB0ZW5hbnROYW1lOiBzdHJpbmcsXG4gICAgdXNlckVtYWlsOiBzdHJpbmcsXG4gICAgdGVuYW50Um9sZTogc3RyaW5nXG4gICkge1xuICAgIGxvZy5kZWJ1ZyhcbiAgICAgIGB3aGl0ZWJyaWNrQ2xvdWQuYWRkVXNlclRvVGVuYW50OiAke3RlbmFudE5hbWV9LCAke3VzZXJFbWFpbH0sICR7dGVuYW50Um9sZX1gXG4gICAgKTtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlckJ5RW1haWwodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgY29uc3QgdGVuYW50UmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGVuYW50QnlOYW1lKHRlbmFudE5hbWUpO1xuICAgIGlmICghdGVuYW50UmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0ZW5hbnRSZXN1bHQ7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJvbGVCeU5hbWUodGVuYW50Um9sZSk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZFVzZXJUb1RlbmFudChcbiAgICAgIHRlbmFudFJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgdXNlclJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgcm9sZVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiB1c2VyUmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFVzZXJzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vyc0J5VGVuYW50SWQodGVuYW50SWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGlkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlckJ5SWQoaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKGVtYWlsOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlckJ5RW1haWwoZW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoZW1haWw6IHN0cmluZywgZmlyc3ROYW1lOiBzdHJpbmcsIGxhc3ROYW1lOiBzdHJpbmcpIHtcbiAgICAvLyBUQkQ6IGF1dGhlbnRpY2F0aW9uLCBzYXZlIHBhc3N3b3JkXG4gICAgcmV0dXJuIHRoaXMuZGFsLmNyZWF0ZVVzZXIoZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoXG4gICAgaWQ6IG51bWJlcixcbiAgICBlbWFpbDogc3RyaW5nLFxuICAgIGZpcnN0TmFtZTogc3RyaW5nLFxuICAgIGxhc3ROYW1lOiBzdHJpbmdcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVwZGF0ZVVzZXIoaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwucm9sZUJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTY2hlbWFzXG4gICAqIFRCRDogdmFsaWRhdGUgbmFtZSB+IFthLXpdezF9W19hLXowLTldezIsfVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlU2NoZW1hKFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIHRlbmFudE93bmVySWQ6IG51bWJlciB8IG51bGwsXG4gICAgdGVuYW50T3duZXJOYW1lOiBzdHJpbmcgfCBudWxsLFxuICAgIHVzZXJPd25lcklkOiBudW1iZXIgfCBudWxsLFxuICAgIHVzZXJPd25lckVtYWlsOiBzdHJpbmcgfCBudWxsXG4gICkge1xuICAgIGxvZy5pbmZvKFxuICAgICAgYHdiQ2xvdWQuY3JlYXRlU2NoZW1hIG5hbWU9JHtuYW1lfSwgbGFiZWw9JHtsYWJlbH0sIHRlbmFudE93bmVySWQ9JHt0ZW5hbnRPd25lcklkfSwgdGVuYW50T3duZXJOYW1lPSR7dGVuYW50T3duZXJOYW1lfSwgdXNlck93bmVySWQ9JHt1c2VyT3duZXJJZH0sIHVzZXJPd25lckVtYWlsPSR7dXNlck93bmVyRW1haWx9YFxuICAgICk7XG4gICAgbGV0IHJlc3VsdDtcbiAgICBpZiAoIXRlbmFudE93bmVySWQgJiYgIXVzZXJPd25lcklkKSB7XG4gICAgICBpZiAodGVuYW50T3duZXJOYW1lKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRlbmFudEJ5TmFtZSh0ZW5hbnRPd25lck5hbWUpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB0ZW5hbnRPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9IGVsc2UgaWYgKHVzZXJPd25lckVtYWlsKSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJCeUVtYWlsKHVzZXJPd25lckVtYWlsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgdXNlck93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogXCJPd25lciBjb3VsZCBub3QgYmUgZm91bmRcIixcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZGFsLmNyZWF0ZVNjaGVtYShuYW1lLCBsYWJlbCwgdGVuYW50T3duZXJJZCwgdXNlck93bmVySWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVNjaGVtYShzY2hlbWFOYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFUYWJsZU5hbWVzKHNjaGVtYU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgcmVzdWx0LnBheWxvYWQpIHtcbiAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVsZXRlVGFibGUoc2NoZW1hTmFtZSwgdGFibGVOYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJlbW92ZUFsbFVzZXJzRnJvbVNjaGVtYShzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5kZWxldGVTY2hlbWEoc2NoZW1hTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2NoZW1hc0J5VXNlck93bmVyKHVzZXJFbWFpbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYXNCeVVzZXJPd25lcih1c2VyRW1haWwpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVtYS1Vc2VyLVJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyVG9TY2hlbWEoXG4gICAgc2NoZW1hTmFtZTogc3RyaW5nLFxuICAgIHVzZXJFbWFpbDogc3RyaW5nLFxuICAgIHNjaGVtYVJvbGU6IHN0cmluZ1xuICApIHtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlckJ5RW1haWwodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgY29uc3Qgc2NoZW1hUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuc2NoZW1hQnlOYW1lKHNjaGVtYU5hbWUpO1xuICAgIGlmICghc2NoZW1hUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBzY2hlbWFSZXN1bHQ7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJvbGVCeU5hbWUoc2NoZW1hUm9sZSk7XG4gICAgaWYgKCFyb2xlUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByb2xlUmVzdWx0O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmFkZFVzZXJUb1NjaGVtYShcbiAgICAgIHNjaGVtYVJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgdXNlclJlc3VsdC5wYXlsb2FkLmlkLFxuICAgICAgcm9sZVJlc3VsdC5wYXlsb2FkLmlkXG4gICAgKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiB1c2VyUmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGFjY2Vzc2libGVTY2hlbWFzKHVzZXJFbWFpbDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zY2hlbWFzQnlVc2VyT3duZXIodXNlckVtYWlsKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGNvbnN0IHVzZXJSb2xlc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnNjaGVtYXNCeVVzZXIodXNlckVtYWlsKTtcbiAgICBpZiAoIXVzZXJSb2xlc1Jlc3VsdC5zdWNjZXNzKSByZXR1cm4gdXNlclJvbGVzUmVzdWx0O1xuICAgIHJlc3VsdC5wYXlsb2FkID0gcmVzdWx0LnBheWxvYWQuY29uY2F0KHVzZXJSb2xlc1Jlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRhYmxlc1xuICAgKiBUQkQ6IHZhbGlkYXRlIG5hbWUgfiBbYS16XXsxfVtfYS16MC05XXsyLH1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVRhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5jcmVhdGVUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGFibGUoc2NoZW1hTmFtZTogc3RyaW5nLCB0YWJsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gYXdhaXQgaGFzdXJhQXBpLnVudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNjaGVtYVRhYmxlTmFtZXMoc2NoZW1hTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnNjaGVtYVRhYmxlTmFtZXMoc2NoZW1hTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdHJhY2tBbGxUYWJsZXMoc2NoZW1hTmFtZTogc3RyaW5nKSB7XG4gICAgbGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2NoZW1hVGFibGVOYW1lcyhzY2hlbWFOYW1lKTtcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHJlc3VsdC5wYXlsb2FkKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBoYXN1cmFBcGkudHJhY2tUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImF4aW9zXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJncmFwaHFsLWNvbnN0cmFpbnQtZGlyZWN0aXZlXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJncmFwaHFsLXRvb2xzXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJsb2Rhc2hcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInBnXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ0c2xvZ1wiKTs7IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL3doaXRlYnJpY2stY2xvdWQudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBSUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUtBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBS0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFHQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7OztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUtBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUdBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTs7Ozs7OztBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQWxnQkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDR0E7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFwQkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDVkE7QUFVQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBL0JBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0hBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBMUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBU0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE3QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFHQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMxQkE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUF5RUE7QUF2RUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7QUFXQTs7Ozs7Ozs7QUFRQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ25FQTtBQUNBO0FBRUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBMEJBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzFFQTtBQUNBO0FBRUE7Ozs7Ozs7OztBQVNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2hEQTtBQUNBO0FBRUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFtQkE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDNUVBO0FBQ0E7QUFFQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5Q0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFvT0E7QUE5TkE7O0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBS0E7QUFHQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFNQTtBQUNBO0FBQUE7QUFNQTs7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFRQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFNQTs7QUFLQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUtBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7QUM1UEE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBIiwic291cmNlUm9vdCI6IiJ9