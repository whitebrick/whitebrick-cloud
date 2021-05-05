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
const wb_cloud_1 = __webpack_require__(/*! ./wb-cloud */ "./src/wb-cloud.ts");
const pg_1 = __webpack_require__(/*! pg */ "pg");
const Tenant_1 = __webpack_require__(/*! ./entity/Tenant */ "./src/entity/Tenant.ts");
const User_1 = __webpack_require__(/*! ./entity/User */ "./src/entity/User.ts");
const Role_1 = __webpack_require__(/*! ./entity/Role */ "./src/entity/Role.ts");
const Schema_1 = __webpack_require__(/*! ./entity/Schema */ "./src/entity/Schema.ts");
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
        return str.replace(/[\\"]+/g, '');
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
            let results = [];
            try {
                yield client.query('BEGIN');
                for (let queryParam of queryParams) {
                    wb_cloud_1.log.debug(`dal.executeQuery QueryParam: ${queryParam.query}`, queryParam.params);
                    const response = yield client.query(queryParam.query, queryParam.params);
                    results.push({
                        success: true,
                        payload: response
                    });
                }
                yield client.query('COMMIT');
            }
            catch (error) {
                yield client.query('ROLLBACK');
                wb_cloud_1.log.error(error);
                results.push({
                    success: false,
                    message: error.detail,
                    code: error.code
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
                params: []
            });
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload);
            return result;
        });
    }
    tenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.tenants WHERE id=$1 LIMIT 1",
                params: [id]
            });
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    tenantByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.tenants WHERE name=$1 LIMIT 1",
                params: [name]
            });
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    createTenant(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "INSERT INTO wb.tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *",
                params: [name, label, new Date(), new Date()]
            });
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    updateTenant(id, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            if (name == null && label == null)
                return { success: false, message: "updateTenant: all parameters are null" };
            let paramCount = 3;
            let params = [new Date(), id];
            let query = "UPDATE wb.tenants SET ";
            if (name != null)
                query += (`name=$${paramCount}, `);
            params.push(name);
            paramCount++;
            if (label != null)
                query += (`label=$${paramCount}, `);
            params.push(label);
            paramCount++;
            query += ("updated_at=$1 WHERE id=$2 RETURNING *");
            const result = yield this.executeQuery({
                query: query,
                params: [new Date(), id]
            });
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteTestTenants() {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: "DELETE FROM wb.tenant_users WHERE tenant_id IN (SELECT id FROM wb.tenants WHERE name like 'test_tenant_%')",
                    params: []
                },
                {
                    query: "DELETE FROM wb.tenants WHERE name like 'test_tenant_%'",
                    params: []
                }
            ]);
            return results[results.length - 1];
        });
    }
    addUserToTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "INSERT INTO wb.tenant_users(tenant_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)",
                params: [tenantId, userId, tenantRoleId, new Date(), new Date()]
            });
            return result;
        });
    }
    removeUserFromTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            var query = "DELETE FROM wb.tenant_users WHERE tenant_id=$1 AND user_id=$2";
            var params = [tenantId, userId];
            if (tenantRoleId)
                query += (" AND role_id=$3");
            params.push(tenantRoleId);
            const result = yield this.executeQuery({
                query: query,
                params: params
            });
            return result;
        });
    }
    usersByTenantId(tenantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.users WHERE tenant_id=$1",
                params: [tenantId]
            });
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload);
            return result;
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.users WHERE id=$1 LIMIT 1",
                params: [id]
            });
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    userByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.users WHERE email=$1 LIMIT 1",
                params: [email]
            });
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    createUser(email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "INSERT INTO wb.users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5) RETURNING *",
                params: [email, firstName, lastName, new Date(), new Date()]
            });
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    updateUser(id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (email == null && firstName == null && lastName == null)
                return { success: false, message: "updateUser: all parameters are null" };
            let paramCount = 3;
            let params = [new Date(), id];
            let query = "UPDATE wb.users SET ";
            if (email != null)
                query += (`email=$${paramCount}, `);
            params.push(email);
            paramCount++;
            if (firstName != null)
                query += (`first_name=$${paramCount}, `);
            params.push(firstName);
            paramCount++;
            if (lastName != null)
                query += (`last_name=$${paramCount}, `);
            params.push(lastName);
            paramCount++;
            query += ("updated_at=$1 WHERE id=$2 RETURNING *");
            const result = yield this.executeQuery({
                query: query,
                params: params
            });
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteTestUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "DELETE FROM wb.users WHERE email like 'test_user_%example.com'",
                params: []
            });
            return result;
        });
    }
    roleByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: "SELECT * FROM wb.roles WHERE name=$1 LIMIT 1",
                params: [name]
            });
            if (result.success)
                result.payload = Role_1.Role.parseResult(result.payload)[0];
            return result;
        });
    }
    createSchema(name, label, tenantOwnerId, userOwnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = yield this.executeQueries([
                {
                    query: `CREATE SCHEMA "${DAL.sanitize(name)}"`,
                    params: []
                },
                {
                    query: "INSERT INTO wb.schemas(name, label, tenant_owner_id, user_owner_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6) RETURNING *",
                    params: [name, label, tenantOwnerId, userOwnerId, new Date(), new Date()]
                }
            ]);
            let insertResult = results[results.length - 1];
            if (insertResult.success)
                insertResult.payload = Schema_1.Schema.parseResult(insertResult.payload)[0];
            return insertResult;
        });
    }
    deleteTestSchemas() {
        return __awaiter(this, void 0, void 0, function* () {
            var result = yield this.executeQuery({
                query: "SELECT * FROM wb.schemas where name like 'test_%';",
                params: []
            });
            if (!result.success)
                return result;
            var results = [];
            for (let schema of Schema_1.Schema.parseResult(result.payload)) {
                results = yield this.executeQueries([
                    {
                        query: "DELETE FROM wb.schemas WHERE name=$1",
                        params: [schema.name]
                    },
                    {
                        query: `DROP SCHEMA IF EXISTS "${DAL.sanitize(schema.name)}" CASCADE`,
                        params: []
                    }
                ]);
                if (!results[results.length - 1].success)
                    break;
            }
            if (results.length == 0) {
                return result;
            }
            else {
                return results[results.length - 1];
            }
        });
    }
    createTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.executeQuery({
                query: `CREATE TABLE "${DAL.sanitize(schemaName)}"."${DAL.sanitize(tableName)}"()`,
                params: []
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
            throw new Error('Role.parseResult: input is null');
        const roles = Array();
        data.rows.forEach((row) => {
            roles.push(Role.parse(row));
        });
        return roles;
    }
    static parse(data) {
        if (!data)
            throw new Error('Role.parse: input is null');
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
            throw new Error('Schema.parseResult: input is null');
        const schemas = Array();
        data.rows.forEach((row) => {
            schemas.push(Schema.parse(row));
        });
        return schemas;
    }
    static parse(data) {
        if (!data)
            throw new Error('Schema.parse: input is null');
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
            throw new Error('Tenant.parseResult: input is null');
        const tenants = Array();
        data.rows.forEach((row) => {
            tenants.push(Tenant.parse(row));
        });
        return tenants;
    }
    static parse(data) {
        if (!data)
            throw new Error('Tenant.parse: input is null');
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
            throw new Error('User.parseResult: input is null');
        const users = Array();
        data.rows.forEach((row) => {
            users.push(User.parse(row));
        });
        return users;
    }
    static parse(data) {
        if (!data)
            throw new Error('User.parse: input is null');
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
    dbPort: parseInt(process.env.DB_PORT || ''),
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD,
    dbPoolMax: parseInt(process.env.DB_POOL_MAX || ''),
    dbPoolIdleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MILLIS || ''),
    dbPoolConnectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MILLIS || ''),
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
const wb_cloud_1 = __webpack_require__(/*! ./wb-cloud */ "./src/wb-cloud.ts");
const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "x-hasura-admin-secret": "Ha5uraWBStaging"
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
                wb_cloud_1.log.debug(`hasuraApi.post: type: ${type}`, args);
                const response = yield this.http.post('/v1/metadata', {
                    "type": type,
                    "args": args
                });
                result = {
                    success: true,
                    payload: response
                };
            }
            catch (error) {
                wb_cloud_1.log.error(error.response.data);
                result = {
                    success: false,
                    message: error.response.data.error,
                    code: error.response.status
                };
            }
            return result;
        });
    }
    trackTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.post("pg_track_table", {
                "table": {
                    "schema": schemaName,
                    "name": tableName
                }
            });
            return result;
        });
    }
}
exports.hasuraApi = new HasuraApi();


/***/ }),

/***/ "./src/resolvers.ts":
/*!**************************!*\
  !*** ./src/resolvers.ts ***!
  \**************************/
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
exports.resolvers = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.resolvers = {
    Query: {
        wbHealthCheck: () => 'All good',
        wbTenants: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenants();
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbTenantById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenantById(id);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbTenantByName: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.tenantByName(name);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbUsersByTenantId: (_, { tenantId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.usersByTenantId(tenantId);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbUserById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.userById(id);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbUserByEmail: (_, { email }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.userByEmail(email);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
    },
    Mutation: {
        wbResetTestData: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.resetTestData();
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.success;
        }),
        wbCreateTenant: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createTenant(name, label);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbUpdateTenant: (_, { id, name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateTenant(id, name, label);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbAddUserToTenant: (_, { tenantName, userEmail, tenantRole }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addUserToTenant(tenantName, userEmail, tenantRole);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbCreateUser: (_, { email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createUser(email, firstName, lastName);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbUpdateUser: (_, { id, email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.updateUser(id, email, firstName, lastName);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbCreateSchema: (_, { name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createSchema(name, label, tenantOwnerId, tenantOwnerName, userOwnerId, userOwnerEmail);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.payload;
        }),
        wbCreateTable: (_, { schemaName, tableName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createTable(schemaName, tableName);
            if (!result.success)
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            return result.success;
        })
    },
};


/***/ }),

/***/ "./src/type-defs.ts":
/*!**************************!*\
  !*** ./src/type-defs.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.typeDefs = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
exports.typeDefs = apollo_server_lambda_1.gql `
  type Tenant{
    id:         ID!,
    name:       String!,
    label:      String!,
    createdAt:  String!,
    updatedAt:  String!
  }
  type User{
    id:         ID!,
    email:      String!,
    firstName:  String,
    lastName:   String,
    createdAt:  String!,
    updatedAt:  String!
  }
  type Schema{
    id:             ID!,
    name:           String!,
    label:          String!,
    tenantOwnerId:  Int,
    userOwnerId:    Int,
    createdAt:      String!,
    updatedAt:      String!
  }
  type Query {
    wbHealthCheck: String!
    """
    Tenants
    """
    wbTenants: [Tenant]
    wbTenantById(id: ID!): Tenant
    wbTenantByName(name: String!): Tenant
    """
    Users
    """
    wbUsersByTenantId(tenantId: ID!): [User]
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
  }
  type Mutation {
    """
    Test
    """
    wbResetTestData: Boolean!
    """
    Tenants
    """
    wbCreateTenant(name: String!, label: String!): Tenant
    wbUpdateTenant(id: ID!, name: String, label: String): Tenant
    """
    Tenant-User-Roles
    """
    wbAddUserToTenant(tenantName: String!, userEmail: String!, tenantRole: String!): User
    """
    Users
    """
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(id: ID!, email: String, firstName: String, lastName: String): User
    """
    Schemas
    """
    wbCreateSchema(name: String!, label: String!, tenantOwnerId: Int, tenantOwnerName: String, userOwnerId: Int, userOwnerEmail: String): Schema
    """
    Tables
    """
    wbCreateTable(schemaName: String!, tableName: String!): Boolean!
  }
`;


/***/ }),

/***/ "./src/wb-cloud.ts":
/*!*************************!*\
  !*** ./src/wb-cloud.ts ***!
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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.log = exports.graphqlHandler = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const resolvers_1 = __webpack_require__(/*! ./resolvers */ "./src/resolvers.ts");
const type_defs_1 = __webpack_require__(/*! ./type-defs */ "./src/type-defs.ts");
const tslog_1 = __webpack_require__(/*! tslog */ "tslog");
const dal_1 = __webpack_require__(/*! ./dal */ "./src/dal.ts");
const hasura_api_1 = __webpack_require__(/*! ./hasura-api */ "./src/hasura-api.ts");
exports.graphqlHandler = new apollo_server_lambda_1.ApolloServer({
    typeDefs: type_defs_1.typeDefs,
    resolvers: resolvers_1.resolvers,
    introspection: true,
    context: function () {
        return {
            wbCloud: (new WbCloud())
        };
    }
}).createHandler();
exports.log = new tslog_1.Logger({
    minLevel: "debug"
});
class WbCloud {
    constructor() {
        this.dal = new dal_1.DAL();
    }
    resetTestData() {
        return __awaiter(this, void 0, void 0, function* () {
            var result = yield this.dal.deleteTestSchemas();
            if (!result.success)
                return result;
            result = yield this.dal.deleteTestTenants();
            if (!result.success)
                return result;
            result = yield this.dal.deleteTestUsers();
            if (!result.success)
                return result;
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
            exports.log.debug(`wbCloud.addUserToTenant: ${tenantName}, ${userEmail}, ${tenantRole}`);
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
            var result;
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
                        message: "Owner could not be found"
                    };
                }
            }
            return yield this.dal.createSchema(name, label, tenantOwnerId, userOwnerId);
        });
    }
    createTable(schemaName, tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            var result = yield this.dal.createTable(schemaName, tableName);
            if (!result.success)
                return result;
            return yield hasura_api_1.hasuraApi.trackTable(schemaName, tableName);
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
/******/ 	var __webpack_exports__ = __webpack_require__("./src/wb-cloud.ts");
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3diLWNsb3VkLmpzIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9kYWwudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGVuYW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnZpcm9ubWVudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2hhc3VyYS1hcGkudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9yZXNvbHZlcnMudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlLWRlZnMudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy93Yi1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwicGdcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwidHNsb2dcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL3diLWNsb3VkXCI7XG5pbXBvcnQgeyBQb29sIH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBUZW5hbnQgfSBmcm9tIFwiLi9lbnRpdHkvVGVuYW50XCI7XG5pbXBvcnQgeyBVc2VyIH0gZnJvbSBcIi4vZW50aXR5L1VzZXJcIjtcbmltcG9ydCB7IFJvbGUgfSBmcm9tIFwiLi9lbnRpdHkvUm9sZVwiO1xuaW1wb3J0IHsgU2NoZW1hIH0gZnJvbSBcIi4vZW50aXR5L1NjaGVtYVwiO1xuaW1wb3J0IHsgUXVlcnlQYXJhbSwgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGUtZGVmc1wiO1xuXG5leHBvcnQgY2xhc3MgREFMIHtcblxuICBwcml2YXRlIHBvb2w6IFBvb2w7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5wb29sID0gbmV3IFBvb2woe1xuICAgICAgZGF0YWJhc2U6IGVudmlyb25tZW50LmRiTmFtZSxcbiAgICAgIGhvc3Q6IGVudmlyb25tZW50LmRiSG9zdCxcbiAgICAgIHBvcnQ6IGVudmlyb25tZW50LmRiUG9ydCxcbiAgICAgIHVzZXI6IGVudmlyb25tZW50LmRiVXNlcixcbiAgICAgIHBhc3N3b3JkOiBlbnZpcm9ubWVudC5kYlBhc3N3b3JkLFxuICAgICAgbWF4OiBlbnZpcm9ubWVudC5kYlBvb2xNYXgsXG4gICAgICBpZGxlVGltZW91dE1pbGxpczogZW52aXJvbm1lbnQuZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXMsXG4gICAgICBjb25uZWN0aW9uVGltZW91dE1pbGxpczogZW52aXJvbm1lbnQuZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXMsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHNhbml0aXplKHN0cjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXFxcXFwiXSsvZywnJyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeVBhcmFtOiBRdWVyeVBhcmFtKSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW3F1ZXJ5UGFyYW1dKTtcbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIC8vIGh0dHBzOi8vbm9kZS1wb3N0Z3Jlcy5jb20vZmVhdHVyZXMvdHJhbnNhY3Rpb25zXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJpZXMocXVlcnlQYXJhbXM6IEFycmF5PFF1ZXJ5UGFyYW0+KSB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBsZXQgcmVzdWx0czogQXJyYXk8U2VydmljZVJlc3VsdD4gPSBbXTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdCRUdJTicpO1xuICAgICAgZm9yIChsZXQgcXVlcnlQYXJhbSBvZiBxdWVyeVBhcmFtcykge1xuICAgICAgICBsb2cuZGVidWcoYGRhbC5leGVjdXRlUXVlcnkgUXVlcnlQYXJhbTogJHtxdWVyeVBhcmFtLnF1ZXJ5fWAsIHF1ZXJ5UGFyYW0ucGFyYW1zKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucXVlcnkocXVlcnlQYXJhbS5xdWVyeSwgcXVlcnlQYXJhbS5wYXJhbXMpO1xuICAgICAgICByZXN1bHRzLnB1c2goPFNlcnZpY2VSZXN1bHQ+e1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgcGF5bG9hZDogcmVzcG9uc2VcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0NPTU1JVCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgICBsb2cuZXJyb3IoZXJyb3IpO1xuICAgICAgcmVzdWx0cy5wdXNoKDxTZXJ2aWNlUmVzdWx0PntcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLmRldGFpbCxcbiAgICAgICAgY29kZTogZXJyb3IuY29kZVxuICAgICAgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgXG4gIC8qKlxuICAgKiBUZW5hbnRzIFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50cygpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHNcIixcbiAgICAgIHBhcmFtczogPGFueT5bXVxuICAgIH0pO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRlbmFudC5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeUlkKGlkOiBudW1iZXIpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiLFxuICAgICAgcGFyYW1zOiA8YW55PltpZF1cbiAgICB9KTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBcIlNFTEVDVCAqIEZST00gd2IudGVuYW50cyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIixcbiAgICAgIHBhcmFtczogPGFueT5bbmFtZV1cbiAgICB9KTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVGVuYW50KG5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBcIklOU0VSVCBJTlRPIHdiLnRlbmFudHMobmFtZSwgbGFiZWwsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpIFZBTFVFUygkMSwgJDIsICQzLCAkNCkgUkVUVVJOSU5HICpcIixcbiAgICAgIHBhcmFtczogPGFueT5bbmFtZSwgbGFiZWwsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldXG4gICAgfSk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRlbmFudChpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmd8bnVsbCwgbGFiZWw6IHN0cmluZ3xudWxsKSB7XG4gICAgaWYobmFtZSA9PSBudWxsICYmIGxhYmVsID09IG51bGwpIHJldHVybiB7c3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6IFwidXBkYXRlVGVuYW50OiBhbGwgcGFyYW1ldGVycyBhcmUgbnVsbFwifVxuICAgIGxldCBwYXJhbUNvdW50ID0gMztcbiAgICBsZXQgcGFyYW1zOiBhbnkgPSBbbmV3IERhdGUoKSwgaWRdO1xuICAgIGxldCBxdWVyeSA9IFwiVVBEQVRFIHdiLnRlbmFudHMgU0VUIFwiO1xuICAgIGlmIChuYW1lICAhPSBudWxsKSAgcXVlcnkgKz0gKGBuYW1lPSQke3BhcmFtQ291bnR9LCBgKTsgIHBhcmFtcy5wdXNoKG5hbWUpOyAgIHBhcmFtQ291bnQrKzsgXG4gICAgaWYgKGxhYmVsICE9IG51bGwpICBxdWVyeSArPSAoYGxhYmVsPSQke3BhcmFtQ291bnR9LCBgKTsgcGFyYW1zLnB1c2gobGFiZWwpOyAgcGFyYW1Db3VudCsrOyBcbiAgICBxdWVyeSArPSAoXCJ1cGRhdGVkX2F0PSQxIFdIRVJFIGlkPSQyIFJFVFVSTklORyAqXCIpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBxdWVyeSxcbiAgICAgIHBhcmFtczogPGFueT5bbmV3IERhdGUoKSwgaWRdXG4gICAgfSk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RUZW5hbnRzKCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IFwiREVMRVRFIEZST00gd2IudGVuYW50X3VzZXJzIFdIRVJFIHRlbmFudF9pZCBJTiAoU0VMRUNUIGlkIEZST00gd2IudGVuYW50cyBXSEVSRSBuYW1lIGxpa2UgJ3Rlc3RfdGVuYW50XyUnKVwiLFxuICAgICAgICBwYXJhbXM6IDxhbnk+W11cbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBcIkRFTEVURSBGUk9NIHdiLnRlbmFudHMgV0hFUkUgbmFtZSBsaWtlICd0ZXN0X3RlbmFudF8lJ1wiLFxuICAgICAgICBwYXJhbXM6IDxhbnk+W11cbiAgICAgIH1cbiAgICBdKTtcbiAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aC0xXTtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIFRlbmFudC1Vc2VyLVJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyVG9UZW5hbnQodGVuYW50SWQ6IG51bWJlciwgdXNlcklkOiBudW1iZXIsIHRlbmFudFJvbGVJZDogbnVtYmVyKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IFwiSU5TRVJUIElOVE8gd2IudGVuYW50X3VzZXJzKHRlbmFudF9pZCwgdXNlcl9pZCwgcm9sZV9pZCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSlcIixcbiAgICAgIHBhcmFtczogPGFueT5bdGVuYW50SWQsIHVzZXJJZCwgdGVuYW50Um9sZUlkLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlVXNlckZyb21UZW5hbnQodGVuYW50SWQ6IG51bWJlciwgdXNlcklkOiBudW1iZXIsIHRlbmFudFJvbGVJZDogbnVtYmVyfG51bGwpIHtcbiAgICB2YXIgcXVlcnkgPSBcIkRFTEVURSBGUk9NIHdiLnRlbmFudF91c2VycyBXSEVSRSB0ZW5hbnRfaWQ9JDEgQU5EIHVzZXJfaWQ9JDJcIjtcbiAgICB2YXIgcGFyYW1zOiBhbnkgPSBbdGVuYW50SWQsIHVzZXJJZF07XG4gICAgaWYodGVuYW50Um9sZUlkKSBxdWVyeSArPSAoXCIgQU5EIHJvbGVfaWQ9JDNcIik7IHBhcmFtcy5wdXNoKHRlbmFudFJvbGVJZCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXNcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cblxuICAvKipcbiAgICogVXNlcnMgXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IG51bWJlcikge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBcIlNFTEVDVCAqIEZST00gd2IudXNlcnMgV0hFUkUgdGVuYW50X2lkPSQxXCIsXG4gICAgICBwYXJhbXM6IDxhbnk+W3RlbmFudElkXVxuICAgIH0pO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5SWQoaWQ6IG51bWJlcikge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHtcbiAgICAgIHF1ZXJ5OiBcIlNFTEVDVCAqIEZST00gd2IudXNlcnMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiLFxuICAgICAgcGFyYW1zOiA8YW55PltpZF1cbiAgICB9KTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKGVtYWlsOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnVzZXJzIFdIRVJFIGVtYWlsPSQxIExJTUlUIDFcIixcbiAgICAgIHBhcmFtczogPGFueT5bZW1haWxdXG4gICAgfSk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVVc2VyKGVtYWlsOiBzdHJpbmcsIGZpcnN0TmFtZTogc3RyaW5nLCBsYXN0TmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IFwiSU5TRVJUIElOVE8gd2IudXNlcnMoZW1haWwsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSkgUkVUVVJOSU5HICpcIixcbiAgICAgIHBhcmFtczogPGFueT5bZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldXG4gICAgfSk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKGlkOiBudW1iZXIsIGVtYWlsOiBzdHJpbmd8bnVsbCwgZmlyc3ROYW1lOiBzdHJpbmd8bnVsbCwgbGFzdE5hbWU6IHN0cmluZ3xudWxsKSB7XG4gICAgaWYoZW1haWwgPT0gbnVsbCAmJiBmaXJzdE5hbWUgPT0gbnVsbCAmJiBsYXN0TmFtZSA9PSBudWxsKSByZXR1cm4ge3N1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiBcInVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCJ9XG4gICAgbGV0IHBhcmFtQ291bnQgPSAzO1xuICAgIGxldCBwYXJhbXM6IGFueSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCAgICAgIT0gbnVsbCkgIHF1ZXJ5ICs9IChgZW1haWw9JCR7cGFyYW1Db3VudH0sIGApOyAgICAgIHBhcmFtcy5wdXNoKGVtYWlsKTsgICAgIHBhcmFtQ291bnQrKzsgXG4gICAgaWYgKGZpcnN0TmFtZSAhPSBudWxsKSAgcXVlcnkgKz0gKGBmaXJzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgKTsgcGFyYW1zLnB1c2goZmlyc3ROYW1lKTsgcGFyYW1Db3VudCsrOyBcbiAgICBpZiAobGFzdE5hbWUgICE9IG51bGwpICBxdWVyeSArPSAoYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYCk7ICBwYXJhbXMucHVzaChsYXN0TmFtZSk7ICBwYXJhbUNvdW50Kys7IFxuICAgIHF1ZXJ5ICs9IChcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIik7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgcGFyYW1zOiBwYXJhbXNcbiAgICB9KTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RVc2VycygpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJERUxFVEUgRlJPTSB3Yi51c2VycyBXSEVSRSBlbWFpbCBsaWtlICd0ZXN0X3VzZXJfJWV4YW1wbGUuY29tJ1wiLFxuICAgICAgcGFyYW1zOiA8YW55PltdXG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIFJvbGVzIFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgcm9sZUJ5TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnJvbGVzIFdIRVJFIG5hbWU9JDEgTElNSVQgMVwiLFxuICAgICAgcGFyYW1zOiA8YW55PltuYW1lXVxuICAgIH0pO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFJvbGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBTY2hlbWFzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEobmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0ZW5hbnRPd25lcklkOiBudW1iZXJ8bnVsbCwgdXNlck93bmVySWQ6IG51bWJlcnxudWxsKSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJpZXMoW1xuICAgICAge1xuICAgICAgICBxdWVyeTogYENSRUFURSBTQ0hFTUEgXCIke0RBTC5zYW5pdGl6ZShuYW1lKX1cImAsXG4gICAgICAgIHBhcmFtczogPGFueT5bXVxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgcXVlcnk6IFwiSU5TRVJUIElOVE8gd2Iuc2NoZW1hcyhuYW1lLCBsYWJlbCwgdGVuYW50X293bmVyX2lkLCB1c2VyX293bmVyX2lkLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1LCAkNikgUkVUVVJOSU5HICpcIixcbiAgICAgICAgcGFyYW1zOiA8YW55PltuYW1lLCBsYWJlbCwgdGVuYW50T3duZXJJZCwgdXNlck93bmVySWQsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldXG4gICAgICB9XG4gICAgXSk7XG4gICAgbGV0IGluc2VydFJlc3VsdDogU2VydmljZVJlc3VsdCA9IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGgtMV07XG4gICAgaWYoaW5zZXJ0UmVzdWx0LnN1Y2Nlc3MpIGluc2VydFJlc3VsdC5wYXlsb2FkID0gU2NoZW1hLnBhcnNlUmVzdWx0KGluc2VydFJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gaW5zZXJ0UmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RTY2hlbWFzKCkge1xuICAgIHZhciByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh7XG4gICAgICBxdWVyeTogXCJTRUxFQ1QgKiBGUk9NIHdiLnNjaGVtYXMgd2hlcmUgbmFtZSBsaWtlICd0ZXN0XyUnO1wiLFxuICAgICAgcGFyYW1zOiA8YW55PltdXG4gICAgfSk7XG4gICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0XG4gICAgdmFyIHJlc3VsdHM6IEFycmF5PFNlcnZpY2VSZXN1bHQ+ID0gW107XG4gICAgZm9yIChsZXQgc2NoZW1hIG9mIFNjaGVtYS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCkpIHtcbiAgICAgIHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyaWVzKFtcbiAgICAgICAge1xuICAgICAgICAgIHF1ZXJ5OiBcIkRFTEVURSBGUk9NIHdiLnNjaGVtYXMgV0hFUkUgbmFtZT0kMVwiLFxuICAgICAgICAgIHBhcmFtczogPGFueT5bc2NoZW1hLm5hbWVdXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBxdWVyeTogYERST1AgU0NIRU1BIElGIEVYSVNUUyBcIiR7REFMLnNhbml0aXplKHNjaGVtYS5uYW1lKX1cIiBDQVNDQURFYCxcbiAgICAgICAgICBwYXJhbXM6IDxhbnk+W11cbiAgICAgICAgfVxuICAgICAgXSk7XG4gICAgICBpZighcmVzdWx0c1tyZXN1bHRzLmxlbmd0aC0xXS5zdWNjZXNzKSBicmVha1xuICAgIH1cbiAgICBpZihyZXN1bHRzLmxlbmd0aD09MCl7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcmVzdWx0c1tyZXN1bHRzLmxlbmd0aC0xXTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGFibGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkoe1xuICAgICAgcXVlcnk6IGBDUkVBVEUgVEFCTEUgXCIke0RBTC5zYW5pdGl6ZShzY2hlbWFOYW1lKX1cIi5cIiR7REFMLnNhbml0aXplKHRhYmxlTmFtZSl9XCIoKWAsXG4gICAgICBwYXJhbXM6IDxhbnk+W11cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59IiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFJvbGUge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFJvbGU+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignUm9sZS5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHJvbGVzID0gQXJyYXk8Um9sZT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHJvbGVzLnB1c2goUm9sZS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcm9sZXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IGFueSk6IFJvbGUge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdSb2xlLnBhcnNlOiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBSb2xlKCk7XG4gICAgcm9sZS5pZCA9IGRhdGEuaWQ7XG4gICAgcm9sZS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHJldHVybiByb2xlO1xuICB9XG59IiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYXtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICB0ZW5hbnRPd25lcklkOiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkO1xuICB1c2VyT3duZXJJZDogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZDtcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFNjaGVtYT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdTY2hlbWEucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCBzY2hlbWFzID0gQXJyYXk8U2NoZW1hPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgc2NoZW1hcy5wdXNoKFNjaGVtYS5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2NoZW1hcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogYW55KTogU2NoZW1hIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignU2NoZW1hLnBhcnNlOiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSgpO1xuICAgIHNjaGVtYS5pZCA9IGRhdGEuaWQ7XG4gICAgc2NoZW1hLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgc2NoZW1hLmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICBzY2hlbWEudGVuYW50T3duZXJJZCA9IGRhdGEudGVuYW50T3duZXJJZDtcbiAgICBzY2hlbWEudXNlck93bmVySWQgPSBkYXRhLnVzZXJPd25lcklkO1xuICAgIHNjaGVtYS5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgc2NoZW1hLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG59IiwiaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuZXhwb3J0IGNsYXNzIFRlbmFudCB7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcblxuICBwdWJsaWMgc3RhdGljIHBhcnNlUmVzdWx0KGRhdGE6IFF1ZXJ5UmVzdWx0IHwgbnVsbCk6IEFycmF5PFRlbmFudD4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdUZW5hbnQucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB0ZW5hbnRzID0gQXJyYXk8VGVuYW50PigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdGVuYW50cy5wdXNoKFRlbmFudC5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGVuYW50cztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogYW55KTogVGVuYW50IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignVGVuYW50LnBhcnNlOiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3QgdGVuYW50ID0gbmV3IFRlbmFudCgpO1xuICAgIHRlbmFudC5pZCA9IGRhdGEuaWQ7XG4gICAgdGVuYW50Lm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgdGVuYW50LmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICB0ZW5hbnQuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHRlbmFudC51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHRlbmFudDtcbiAgfVxufSIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgaWQhOiBudW1iZXI7XG4gIHRlbmFudF9pZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZSE6IHN0cmluZztcbiAgbGFzdE5hbWUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1VzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB1c2VycyA9IEFycmF5PFVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB1c2Vycy5wdXNoKFVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBhbnkpOiBVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBkYXRhLmlkO1xuICAgIHVzZXIuZW1haWwgPSBkYXRhLmVtYWlsO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gZGF0YS5maXJzdF9uYW1lO1xuICAgIHVzZXIubGFzdE5hbWUgPSBkYXRhLmxhc3RfbmFtZTtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdDtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufSIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmcsXG4gIGRiSG9zdDogc3RyaW5nLFxuICBkYlBvcnQ6IG51bWJlcixcbiAgZGJVc2VyOiBzdHJpbmcsXG4gIGRiUGFzc3dvcmQ6IHN0cmluZyxcbiAgZGJQb29sTWF4OiBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXIsXG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXIsXG59O1xuXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBwcm9jZXNzLmVudi5TRUNSRVRfTUVTU0FHRSBhcyBzdHJpbmcsXG4gIGRiTmFtZTogcHJvY2Vzcy5lbnYuREJfTkFNRSBhcyBzdHJpbmcsXG4gIGRiSG9zdDogcHJvY2Vzcy5lbnYuREJfSE9TVCBhcyBzdHJpbmcsXG4gIGRiUG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9SVCB8fCAnJykgYXMgbnVtYmVyLFxuICBkYlVzZXI6IHByb2Nlc3MuZW52LkRCX1VTRVIgYXMgc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCBhcyBzdHJpbmcsXG4gIGRiUG9vbE1heDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NQVggfHwgJycpIGFzIG51bWJlcixcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRV9USU1FT1VUX01JTExJUyB8fCAnJykgYXMgbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9DT05ORUNUSU9OX1RJTUVPVVRfTUlMTElTIHx8ICcnKSBhcyBudW1iZXIsXG59OyIsIi8vIGh0dHBzOi8vYWx0cmltLmlvL3Bvc3RzL2F4aW9zLWh0dHAtY2xpZW50LXVzaW5nLXR5cGVzY3JpcHRcblxuaW1wb3J0IGF4aW9zLCB7IEF4aW9zSW5zdGFuY2UsIEF4aW9zUmVxdWVzdENvbmZpZywgQXhpb3NSZXNwb25zZSB9IGZyb20gXCJheGlvc1wiO1xuaW1wb3J0IHsgU2VydmljZVJlc3VsdCB9IGZyb20gXCIuL3R5cGUtZGVmc1wiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gIFwieC1oYXN1cmEtYWRtaW4tc2VjcmV0XCI6IFwiSGE1dXJhV0JTdGFnaW5nXCJcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogXCJodHRwOi8vbG9jYWxob3N0OjgwODBcIixcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiB7fSl7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KCcvdjEvbWV0YWRhdGEnLCB7XG4gICAgICAgIFwidHlwZVwiOiB0eXBlLFxuICAgICAgICBcImFyZ3NcIjogYXJnc1xuICAgICAgfSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHJlc3BvbnNlXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2cuZXJyb3IoZXJyb3IucmVzcG9uc2UuZGF0YSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICBjb2RlOiBlcnJvci5yZXNwb25zZS5zdGF0dXNcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ190cmFja190YWJsZVwiLCB7XG4gICAgICBcInRhYmxlXCI6e1xuICAgICAgICBcInNjaGVtYVwiOiBzY2hlbWFOYW1lLFxuICAgICAgICBcIm5hbWVcIjogdGFibGVOYW1lXG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG59XG5cbmV4cG9ydCBjb25zdCBoYXN1cmFBcGkgPSBuZXcgSGFzdXJhQXBpKCk7IiwiaW1wb3J0IHsgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIlxuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcbmltcG9ydCB7IGhhc3VyYUFwaSB9IGZyb20gXCIuL2hhc3VyYS1hcGlcIjtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiAoKSA9PiAnQWxsIGdvb2QnLFxuICAgIC8vIFRlbmFudHNcbiAgICB3YlRlbmFudHM6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnRlbmFudHMoKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JUZW5hbnRCeUlkOiBhc3luYyAoXywgeyBpZCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudGVuYW50QnlJZChpZCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVGVuYW50QnlOYW1lOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50ZW5hbnRCeU5hbWUobmFtZSk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFVzZXJzXG4gICAgd2JVc2Vyc0J5VGVuYW50SWQ6IGFzeW5jIChfLCB7IHRlbmFudElkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2Vyc0J5VGVuYW50SWQodGVuYW50SWQpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUlkOiBhc3luYyAoXywgeyBpZCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5SWQoaWQpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUVtYWlsOiBhc3luYyAoXywgeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXNlckJ5RW1haWwoZW1haWwpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcblxuICBNdXRhdGlvbjoge1xuICAgIC8vIFRlc3RcbiAgICB3YlJlc2V0VGVzdERhdGE6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnJlc2V0VGVzdERhdGEoKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzO1xuICAgIH0sXG4gICAgLy8gVGVuYW50c1xuICAgIHdiQ3JlYXRlVGVuYW50OiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlVGVuYW50KG5hbWUsIGxhYmVsKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVUZW5hbnQ6IGFzeW5jIChfLCB7IGlkLCBuYW1lLCBsYWJlbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFRlbmFudC1Vc2VyLVJvbGVzXG4gICAgd2JBZGRVc2VyVG9UZW5hbnQ6IGFzeW5jIChfLCB7IHRlbmFudE5hbWUsIHVzZXJFbWFpbCwgdGVuYW50Um9sZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuYWRkVXNlclRvVGVuYW50KHRlbmFudE5hbWUsIHVzZXJFbWFpbCwgdGVuYW50Um9sZSk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFVzZXJzXG4gICAgd2JDcmVhdGVVc2VyOiBhc3luYyAoXywgeyBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQuY3JlYXRlVXNlcihlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVXNlcjogYXN5bmMgKF8sIHsgaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVVc2VyKGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFNjaGVtYXNcbiAgICB3YkNyZWF0ZVNjaGVtYTogYXN5bmMgKF8sIHsgbmFtZSwgbGFiZWwsIHRlbmFudE93bmVySWQsIHRlbmFudE93bmVyTmFtZSwgdXNlck93bmVySWQsIHVzZXJPd25lckVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVTY2hlbWEobmFtZSwgbGFiZWwsIHRlbmFudE93bmVySWQsIHRlbmFudE93bmVyTmFtZSwgdXNlck93bmVySWQsIHVzZXJPd25lckVtYWlsKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVGFibGVzXG4gICAgd2JDcmVhdGVUYWJsZTogYXN5bmMgKF8sIHsgc2NoZW1hTmFtZSwgdGFibGVOYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVUYWJsZShzY2hlbWFOYW1lLCB0YWJsZU5hbWUpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfVxuICB9LFxuXG59OyIsImltcG9ydCB7IGdxbCB9IGZyb20gJ2Fwb2xsby1zZXJ2ZXItbGFtYmRhJztcblxuZXhwb3J0IHR5cGUgU2VydmljZVJlc3VsdCA9XG4gIHwgeyBzdWNjZXNzOiB0cnVlOyBwYXlsb2FkOiBhbnkgfVxuICB8IHsgc3VjY2VzczogZmFsc2U7IG1lc3NhZ2U6IHN0cmluZzsgY29kZTogc3RyaW5nfVxuICA7XG5cbmV4cG9ydCB0eXBlIFF1ZXJ5UGFyYW0gPSB7XG4gIHF1ZXJ5OiBhbnksXG4gIHBhcmFtczogW2FueV1cbn07XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBUZW5hbnR7XG4gICAgaWQ6ICAgICAgICAgSUQhLFxuICAgIG5hbWU6ICAgICAgIFN0cmluZyEsXG4gICAgbGFiZWw6ICAgICAgU3RyaW5nISxcbiAgICBjcmVhdGVkQXQ6ICBTdHJpbmchLFxuICAgIHVwZGF0ZWRBdDogIFN0cmluZyFcbiAgfVxuICB0eXBlIFVzZXJ7XG4gICAgaWQ6ICAgICAgICAgSUQhLFxuICAgIGVtYWlsOiAgICAgIFN0cmluZyEsXG4gICAgZmlyc3ROYW1lOiAgU3RyaW5nLFxuICAgIGxhc3ROYW1lOiAgIFN0cmluZyxcbiAgICBjcmVhdGVkQXQ6ICBTdHJpbmchLFxuICAgIHVwZGF0ZWRBdDogIFN0cmluZyFcbiAgfVxuICB0eXBlIFNjaGVtYXtcbiAgICBpZDogICAgICAgICAgICAgSUQhLFxuICAgIG5hbWU6ICAgICAgICAgICBTdHJpbmchLFxuICAgIGxhYmVsOiAgICAgICAgICBTdHJpbmchLFxuICAgIHRlbmFudE93bmVySWQ6ICBJbnQsXG4gICAgdXNlck93bmVySWQ6ICAgIEludCxcbiAgICBjcmVhdGVkQXQ6ICAgICAgU3RyaW5nISxcbiAgICB1cGRhdGVkQXQ6ICAgICAgU3RyaW5nIVxuICB9XG4gIHR5cGUgUXVlcnkge1xuICAgIHdiSGVhbHRoQ2hlY2s6IFN0cmluZyFcbiAgICBcIlwiXCJcbiAgICBUZW5hbnRzXG4gICAgXCJcIlwiXG4gICAgd2JUZW5hbnRzOiBbVGVuYW50XVxuICAgIHdiVGVuYW50QnlJZChpZDogSUQhKTogVGVuYW50XG4gICAgd2JUZW5hbnRCeU5hbWUobmFtZTogU3RyaW5nISk6IFRlbmFudFxuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JVc2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IElEISk6IFtVc2VyXVxuICAgIHdiVXNlckJ5SWQoaWQ6IElEISk6IFVzZXJcbiAgICB3YlVzZXJCeUVtYWlsKGVtYWlsOiBTdHJpbmchKTogVXNlclxuICB9XG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFRlc3RcbiAgICBcIlwiXCJcbiAgICB3YlJlc2V0VGVzdERhdGE6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgVGVuYW50c1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlVGVuYW50KG5hbWU6IFN0cmluZyEsIGxhYmVsOiBTdHJpbmchKTogVGVuYW50XG4gICAgd2JVcGRhdGVUZW5hbnQoaWQ6IElEISwgbmFtZTogU3RyaW5nLCBsYWJlbDogU3RyaW5nKTogVGVuYW50XG4gICAgXCJcIlwiXG4gICAgVGVuYW50LVVzZXItUm9sZXNcbiAgICBcIlwiXCJcbiAgICB3YkFkZFVzZXJUb1RlbmFudCh0ZW5hbnROYW1lOiBTdHJpbmchLCB1c2VyRW1haWw6IFN0cmluZyEsIHRlbmFudFJvbGU6IFN0cmluZyEpOiBVc2VyXG4gICAgXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVVzZXIoZW1haWw6IFN0cmluZyEsIGZpcnN0TmFtZTogU3RyaW5nLCBsYXN0TmFtZTogU3RyaW5nKTogVXNlclxuICAgIHdiVXBkYXRlVXNlcihpZDogSUQhLCBlbWFpbDogU3RyaW5nLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICBcIlwiXCJcbiAgICBTY2hlbWFzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVTY2hlbWEobmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEsIHRlbmFudE93bmVySWQ6IEludCwgdGVuYW50T3duZXJOYW1lOiBTdHJpbmcsIHVzZXJPd25lcklkOiBJbnQsIHVzZXJPd25lckVtYWlsOiBTdHJpbmcpOiBTY2hlbWFcbiAgICBcIlwiXCJcbiAgICBUYWJsZXNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVRhYmxlKHNjaGVtYU5hbWU6IFN0cmluZyEsIHRhYmxlTmFtZTogU3RyaW5nISk6IEJvb2xlYW4hXG4gIH1cbmA7XG5cblxuXG5cblxuIiwiaW1wb3J0IHsgQXBvbGxvU2VydmVyIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyByZXNvbHZlcnMgfSBmcm9tIFwiLi9yZXNvbHZlcnNcIjtcbmltcG9ydCB7IHR5cGVEZWZzIH0gZnJvbSBcIi4vdHlwZS1kZWZzXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuaW1wb3J0IHsgaGFzdXJhQXBpIH0gZnJvbSBcIi4vaGFzdXJhLWFwaVwiO1xuXG5leHBvcnQgY29uc3QgZ3JhcGhxbEhhbmRsZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgdHlwZURlZnMsXG4gIHJlc29sdmVycyxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogZnVuY3Rpb24oKXtcbiAgICByZXR1cm4ge1xuICAgICAgd2JDbG91ZDogKG5ldyBXYkNsb3VkKCkpXG4gICAgfVxuICB9XG59KS5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiXG59KTtcblxuY2xhc3MgV2JDbG91ZCB7XG4gIGRhbCA9IG5ldyBEQUwoKTtcblxuXG4gIC8qKlxuICAgKiBUZXN0XG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKCkge1xuICAgIHZhciByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0U2NoZW1hcygpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VGVuYW50cygpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIFxuICAvKipcbiAgICogVGVuYW50c1xuICAgKiBUQkQ6IHZhbGlkYXRlIG5hbWUgfiBbYS16XXsxfVthLXowLTldezIsfVxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudGVuYW50cygpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRlbmFudEJ5SWQoaWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmRhbC50ZW5hbnRCeUlkKGlkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRlbmFudEJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVUZW5hbnQobmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmNyZWF0ZVRlbmFudChuYW1lLCBsYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGVuYW50KGlkOiBudW1iZXIsIG5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVUZW5hbnQoaWQsIG5hbWUsIGxhYmVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VGVuYW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdFRlbmFudHMoKTtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIFRlbmFudC1Vc2VyLVJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyVG9UZW5hbnQodGVuYW50TmFtZTogc3RyaW5nLCB1c2VyRW1haWw6IHN0cmluZywgdGVuYW50Um9sZTogc3RyaW5nKSB7XG4gICAgbG9nLmRlYnVnKGB3YkNsb3VkLmFkZFVzZXJUb1RlbmFudDogJHt0ZW5hbnROYW1lfSwgJHt1c2VyRW1haWx9LCAke3RlbmFudFJvbGV9YCk7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJCeUVtYWlsKHVzZXJFbWFpbCk7XG4gICAgaWYoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgY29uc3QgdGVuYW50UmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGVuYW50QnlOYW1lKHRlbmFudE5hbWUpO1xuICAgIGlmKCF0ZW5hbnRSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRlbmFudFJlc3VsdDtcbiAgICBjb25zdCByb2xlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucm9sZUJ5TmFtZSh0ZW5hbnRSb2xlKTtcbiAgICBpZighcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRVc2VyVG9UZW5hbnQodGVuYW50UmVzdWx0LnBheWxvYWQuaWQsIHVzZXJSZXN1bHQucGF5bG9hZC5pZCwgcm9sZVJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBVc2VycyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5SWQoaWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2VyQnlJZChpZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5RW1haWwoZW1haWw6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2VyQnlFbWFpbChlbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihlbWFpbDogc3RyaW5nLCBmaXJzdE5hbWU6IHN0cmluZywgbGFzdE5hbWU6IHN0cmluZykge1xuICAgIC8vIFRCRDogYXV0aGVudGljYXRpb24sIHNhdmUgcGFzc3dvcmRcbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVXNlcihlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihpZDogbnVtYmVyLCBlbWFpbDogc3RyaW5nLCBmaXJzdE5hbWU6IHN0cmluZywgbGFzdE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVVc2VyKGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBSb2xlcyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnJvbGVCeU5hbWUobmFtZSk7XG4gIH1cblxuICAvKipcbiAgICogU2NoZW1hc1xuICAgKiBUQkQ6IHZhbGlkYXRlIG5hbWUgfiBbYS16XXsxfVtfYS16MC05XXsyLH1cbiAgICovXG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVNjaGVtYShuYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHRlbmFudE93bmVySWQ6IG51bWJlcnxudWxsLCB0ZW5hbnRPd25lck5hbWU6IHN0cmluZ3xudWxsLCB1c2VyT3duZXJJZDogbnVtYmVyfG51bGwsIHVzZXJPd25lckVtYWlsOiBzdHJpbmd8bnVsbCkge1xuICAgIHZhciByZXN1bHQ7XG4gICAgaWYoIXRlbmFudE93bmVySWQgJiYgIXVzZXJPd25lcklkKXtcbiAgICAgIGlmKHRlbmFudE93bmVyTmFtZSl7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRlbmFudEJ5TmFtZSh0ZW5hbnRPd25lck5hbWUpO1xuICAgICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIHRlbmFudE93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH0gZWxzZSBpZiAodXNlck93bmVyRW1haWwpe1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VyQnlFbWFpbCh1c2VyT3duZXJFbWFpbCk7XG4gICAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgdXNlck93bmVySWQgPSByZXN1bHQucGF5bG9hZC5pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogXCJPd25lciBjb3VsZCBub3QgYmUgZm91bmRcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCB0aGlzLmRhbC5jcmVhdGVTY2hlbWEobmFtZSwgbGFiZWwsIHRlbmFudE93bmVySWQsIHVzZXJPd25lcklkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVUYWJsZShzY2hlbWFOYW1lOiBzdHJpbmcsIHRhYmxlTmFtZTogc3RyaW5nKSB7XG4gICAgdmFyIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmNyZWF0ZVRhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0XG4gICAgcmV0dXJuIGF3YWl0IGhhc3VyYUFwaS50cmFja1RhYmxlKHNjaGVtYU5hbWUsIHRhYmxlTmFtZSk7XG4gIH1cblxufSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2ItY2xvdWQudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFHQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFqU0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDVEE7QUFJQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFwQkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFTQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBMUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBU0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE3QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN0QkE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFrREE7QUFoREE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbEVBO0FBSUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDN0ZBO0FBWUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBb0VBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2xGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQW9JQTtBQTdIQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFRQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQzdKQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0EiLCJzb3VyY2VSb290IjoiIn0=