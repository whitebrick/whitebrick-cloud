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
    executeQuery(query, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.pool.connect();
            let result;
            try {
                wb_cloud_1.log.debug(`dal.executeQuery: ${query}`, params);
                const response = yield client.query(query, params);
                result = {
                    success: true,
                    payload: response
                };
            }
            catch (error) {
                wb_cloud_1.log.error(error);
                result = {
                    success: false,
                    message: error.detail,
                    code: error.code
                };
            }
            finally {
                client.release();
            }
            return result;
        });
    }
    tenants() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.tenants";
            const params = [];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload);
            return result;
        });
    }
    tenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.tenants WHERE id=$1 LIMIT 1";
            const params = [id];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    tenantByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.tenants WHERE name=$1 LIMIT 1";
            const params = [name];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    createTenant(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO wb.tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *";
            const params = [name, label, new Date(), new Date()];
            const result = yield this.executeQuery(query, params);
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
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteTestTenants() {
        return __awaiter(this, void 0, void 0, function* () {
            const tenantUsersQuery = "DELETE FROM wb.tenant_users WHERE tenant_id IN (SELECT id FROM wb.tenants WHERE name like 'test_tenant_%')";
            const tenantsQuery = "DELETE FROM wb.tenants WHERE name like 'test_tenant_%'";
            const params = [];
            var result = yield this.executeQuery(tenantUsersQuery, params);
            if (!result.success)
                return result;
            result = yield this.executeQuery(tenantsQuery, params);
            if (!result.success)
                return result;
            return result;
        });
    }
    addUserToTenant(tenantId, userId, tenantRoleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO wb.tenant_users(tenant_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)";
            const params = [tenantId, userId, tenantRoleId, new Date(), new Date()];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
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
            const result = yield this.executeQuery(query, params);
            return result;
        });
    }
    usersByTenantId(tenantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.users WHERE tenant_id=$1";
            const params = [tenantId];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload);
            return result;
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.users WHERE id=$1 LIMIT 1";
            const params = [id];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    userByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.users WHERE email=$1 LIMIT 1";
            const params = [email];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    createUser(email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO wb.users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5) RETURNING *";
            const params = [email, firstName, lastName, new Date(), new Date()];
            const result = yield this.executeQuery(query, params);
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
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    deleteTestUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "DELETE FROM wb.users WHERE email like 'test_user_%example.com'";
            const params = [];
            const result = yield this.executeQuery(query, params);
            return result;
        });
    }
    roleByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM wb.roles WHERE name=$1 LIMIT 1";
            const params = [name];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Role_1.Role.parseResult(result.payload)[0];
            return result;
        });
    }
    createSchema(name, label, tenantOwnerId, userOwnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            var query = `CREATE SCHEMA ${name.replace(/[^\w-]+/g, '')}`;
            var params = [];
            var result = yield this.executeQuery(query, params);
            if (!result.success)
                return result;
            query = "INSERT INTO wb.schemas(name, label, tenant_owner_id, user_owner_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6) RETURNING *";
            params = [name, label, tenantOwnerId, userOwnerId, new Date(), new Date()];
            result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Schema_1.Schema.parseResult(result.payload)[0];
            return result;
        });
    }
}
exports.DAL = DAL;
;


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
const wb_cloud_1 = __webpack_require__(/*! ./wb-cloud */ "./src/wb-cloud.ts");
const hasura_api_1 = __webpack_require__(/*! ./hasura-api */ "./src/hasura-api.ts");
exports.resolvers = {
    Query: {
        wbHealthCheck: () => 'All good',
        wbTenants: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const hasuraResult = yield hasura_api_1.hasuraApi.trackTable('northwind', 'categories');
            wb_cloud_1.log.info(hasuraResult);
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
exports.graphqlHandler = new apollo_server_lambda_1.ApolloServer({
    typeDefs: type_defs_1.typeDefs,
    resolvers: resolvers_1.resolvers,
    introspection: true,
    context: function () {
        return {
            dal: (new dal_1.DAL()),
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
            var result = yield this.dal.deleteTestTenants();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3diLWNsb3VkLmpzIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9kYWwudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9TY2hlbWEudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGVuYW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnZpcm9ubWVudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2hhc3VyYS1hcGkudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9yZXNvbHZlcnMudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy90eXBlLWRlZnMudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy93Yi1jbG91ZC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXhpb3NcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwicGdcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwidHNsb2dcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL3diLWNsb3VkXCI7XG5pbXBvcnQgeyBQb29sIH0gZnJvbSBcInBnXCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vc2VydmljZS1yZXN1bHRcIjtcbmltcG9ydCB7IFRlbmFudCB9IGZyb20gXCIuL2VudGl0eS9UZW5hbnRcIjtcbmltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLi9lbnRpdHkvVXNlclwiO1xuaW1wb3J0IHsgUm9sZSB9IGZyb20gXCIuL2VudGl0eS9Sb2xlXCI7XG5pbXBvcnQgeyBTY2hlbWEgfSBmcm9tIFwiLi9lbnRpdHkvU2NoZW1hXCI7XG5cblxuZXhwb3J0IGNsYXNzIERBTCB7XG5cbiAgcHJpdmF0ZSBwb29sOiBQb29sO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMucG9vbCA9IG5ldyBQb29sKHtcbiAgICAgIGRhdGFiYXNlOiBlbnZpcm9ubWVudC5kYk5hbWUsXG4gICAgICBob3N0OiBlbnZpcm9ubWVudC5kYkhvc3QsXG4gICAgICBwb3J0OiBlbnZpcm9ubWVudC5kYlBvcnQsXG4gICAgICB1c2VyOiBlbnZpcm9ubWVudC5kYlVzZXIsXG4gICAgICBwYXNzd29yZDogZW52aXJvbm1lbnQuZGJQYXNzd29yZCxcbiAgICAgIG1heDogZW52aXJvbm1lbnQuZGJQb29sTWF4LFxuICAgICAgaWRsZVRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgICAgY29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IGVudmlyb25tZW50LmRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gVEJEOiBtYWtlIHRyYW5zYWN0aW9uYWwgYW5kIGxvb3AgbXVsdGlwbGUgcXVlcmllc1xuICAvLyBodHRwczovL25vZGUtcG9zdGdyZXMuY29tL2ZlYXR1cmVzL3RyYW5zYWN0aW9uc1xuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeTogc3RyaW5nLCBwYXJhbXM6IFthbnldKSB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIHRyeSB7XG4gICAgICBsb2cuZGVidWcoYGRhbC5leGVjdXRlUXVlcnk6ICR7cXVlcnl9YCwgcGFyYW1zKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nLmVycm9yKGVycm9yKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLmRldGFpbCxcbiAgICAgICAgY29kZTogZXJyb3IuY29kZVxuICAgICAgfTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIFxuICAvKipcbiAgICogVGVuYW50cyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRlbmFudHMoKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gd2IudGVuYW50c1wiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW107XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRlbmFudEJ5SWQoaWQ6IG51bWJlcikge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2lkXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHMgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbbmFtZV07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVRlbmFudChuYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiSU5TRVJUIElOVE8gd2IudGVuYW50cyhuYW1lLCBsYWJlbCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW25hbWUsIGxhYmVsLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGVuYW50KGlkOiBudW1iZXIsIG5hbWU6IHN0cmluZ3xudWxsLCBsYWJlbDogc3RyaW5nfG51bGwpIHtcbiAgICBpZihuYW1lID09IG51bGwgJiYgbGFiZWwgPT0gbnVsbCkgcmV0dXJuIHtzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogXCJ1cGRhdGVUZW5hbnQ6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCJ9XG4gICAgbGV0IHBhcmFtQ291bnQgPSAzO1xuICAgIGxldCBwYXJhbXM6IGFueSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudGVuYW50cyBTRVQgXCI7XG4gICAgaWYgKG5hbWUgICE9IG51bGwpICBxdWVyeSArPSAoYG5hbWU9JCR7cGFyYW1Db3VudH0sIGApOyAgcGFyYW1zLnB1c2gobmFtZSk7ICAgcGFyYW1Db3VudCsrOyBcbiAgICBpZiAobGFiZWwgIT0gbnVsbCkgIHF1ZXJ5ICs9IChgbGFiZWw9JCR7cGFyYW1Db3VudH0sIGApOyBwYXJhbXMucHVzaChsYWJlbCk7ICBwYXJhbUNvdW50Kys7IFxuICAgIHF1ZXJ5ICs9IChcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIik7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VGVuYW50cygpIHtcbiAgICBjb25zdCB0ZW5hbnRVc2Vyc1F1ZXJ5ID0gXCJERUxFVEUgRlJPTSB3Yi50ZW5hbnRfdXNlcnMgV0hFUkUgdGVuYW50X2lkIElOIChTRUxFQ1QgaWQgRlJPTSB3Yi50ZW5hbnRzIFdIRVJFIG5hbWUgbGlrZSAndGVzdF90ZW5hbnRfJScpXCI7XG4gICAgY29uc3QgdGVuYW50c1F1ZXJ5ID0gXCJERUxFVEUgRlJPTSB3Yi50ZW5hbnRzIFdIRVJFIG5hbWUgbGlrZSAndGVzdF90ZW5hbnRfJSdcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtdO1xuICAgIHZhciByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh0ZW5hbnRVc2Vyc1F1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh0ZW5hbnRzUXVlcnksIHBhcmFtcyk7XG4gICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBUZW5hbnQtVXNlci1Sb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYWRkVXNlclRvVGVuYW50KHRlbmFudElkOiBudW1iZXIsIHVzZXJJZDogbnVtYmVyLCB0ZW5hbnRSb2xlSWQ6IG51bWJlcikge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJJTlNFUlQgSU5UTyB3Yi50ZW5hbnRfdXNlcnModGVuYW50X2lkLCB1c2VyX2lkLCByb2xlX2lkLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1KVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW3RlbmFudElkLCB1c2VySWQsIHRlbmFudFJvbGVJZCwgbmV3IERhdGUoKSwgbmV3IERhdGUoKV07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHJlbW92ZVVzZXJGcm9tVGVuYW50KHRlbmFudElkOiBudW1iZXIsIHVzZXJJZDogbnVtYmVyLCB0ZW5hbnRSb2xlSWQ6IG51bWJlcnxudWxsKSB7XG4gICAgdmFyIHF1ZXJ5ID0gXCJERUxFVEUgRlJPTSB3Yi50ZW5hbnRfdXNlcnMgV0hFUkUgdGVuYW50X2lkPSQxIEFORCB1c2VyX2lkPSQyXCI7XG4gICAgdmFyIHBhcmFtczogYW55ID0gW3RlbmFudElkLCB1c2VySWRdO1xuICAgIGlmKHRlbmFudFJvbGVJZCkgcXVlcnkgKz0gKFwiIEFORCByb2xlX2lkPSQzXCIpOyBwYXJhbXMucHVzaCh0ZW5hbnRSb2xlSWQpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBVc2VycyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZDogbnVtYmVyKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gd2IudXNlcnMgV0hFUkUgdGVuYW50X2lkPSQxXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbdGVuYW50SWRdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5SWQoaWQ6IG51bWJlcikge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHdiLnVzZXJzIFdIRVJFIGlkPSQxIExJTUlUIDFcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtpZF07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlFbWFpbChlbWFpbDogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gd2IudXNlcnMgV0hFUkUgZW1haWw9JDEgTElNSVQgMVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2VtYWlsXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoZW1haWw6IHN0cmluZywgZmlyc3ROYW1lOiBzdHJpbmcsIGxhc3ROYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiSU5TRVJUIElOVE8gd2IudXNlcnMoZW1haWwsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSkgUkVUVVJOSU5HICpcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSwgbmV3IERhdGUoKSwgbmV3IERhdGUoKV07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKGlkOiBudW1iZXIsIGVtYWlsOiBzdHJpbmd8bnVsbCwgZmlyc3ROYW1lOiBzdHJpbmd8bnVsbCwgbGFzdE5hbWU6IHN0cmluZ3xudWxsKSB7XG4gICAgaWYoZW1haWwgPT0gbnVsbCAmJiBmaXJzdE5hbWUgPT0gbnVsbCAmJiBsYXN0TmFtZSA9PSBudWxsKSByZXR1cm4ge3N1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiBcInVwZGF0ZVVzZXI6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCJ9XG4gICAgbGV0IHBhcmFtQ291bnQgPSAzO1xuICAgIGxldCBwYXJhbXM6IGFueSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudXNlcnMgU0VUIFwiO1xuICAgIGlmIChlbWFpbCAgICAgIT0gbnVsbCkgIHF1ZXJ5ICs9IChgZW1haWw9JCR7cGFyYW1Db3VudH0sIGApOyAgICAgIHBhcmFtcy5wdXNoKGVtYWlsKTsgICAgIHBhcmFtQ291bnQrKzsgXG4gICAgaWYgKGZpcnN0TmFtZSAhPSBudWxsKSAgcXVlcnkgKz0gKGBmaXJzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgKTsgcGFyYW1zLnB1c2goZmlyc3ROYW1lKTsgcGFyYW1Db3VudCsrOyBcbiAgICBpZiAobGFzdE5hbWUgICE9IG51bGwpICBxdWVyeSArPSAoYGxhc3RfbmFtZT0kJHtwYXJhbUNvdW50fSwgYCk7ICBwYXJhbXMucHVzaChsYXN0TmFtZSk7ICBwYXJhbUNvdW50Kys7IFxuICAgIHF1ZXJ5ICs9IChcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIik7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VXNlcnMoKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIkRFTEVURSBGUk9NIHdiLnVzZXJzIFdIRVJFIGVtYWlsIGxpa2UgJ3Rlc3RfdXNlcl8lZXhhbXBsZS5jb20nXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cblxuICAvKipcbiAgICogUm9sZXMgXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByb2xlQnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHdiLnJvbGVzIFdIRVJFIG5hbWU9JDEgTElNSVQgMVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW25hbWVdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFJvbGUucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBTY2hlbWFzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEobmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0ZW5hbnRPd25lcklkOiBudW1iZXIsIHVzZXJPd25lcklkOiBudW1iZXIpIHtcbiAgICAvLyBUQkQ6IG1ha2UgdHJhbnNhY3Rpb25hbFxuICAgIHZhciBxdWVyeSA9IGBDUkVBVEUgU0NIRU1BICR7bmFtZS5yZXBsYWNlKC9bXlxcdy1dKy9nLCcnKX1gOyAvLyBwYXJhbWF0aXphdGlvbiBub3Qgc3VwcG9ydGVkXG4gICAgdmFyIHBhcmFtczogYW55ID0gW107XG4gICAgdmFyIHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICBxdWVyeSA9IFwiSU5TRVJUIElOVE8gd2Iuc2NoZW1hcyhuYW1lLCBsYWJlbCwgdGVuYW50X293bmVyX2lkLCB1c2VyX293bmVyX2lkLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1LCAkNikgUkVUVVJOSU5HICpcIjtcbiAgICBwYXJhbXMgPSBbbmFtZSwgbGFiZWwsIHRlbmFudE93bmVySWQsIHVzZXJPd25lcklkLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBTY2hlbWEucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG59OyIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBSb2xlIHtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxSb2xlPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1JvbGUucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCByb2xlcyA9IEFycmF5PFJvbGU+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICByb2xlcy5wdXNoKFJvbGUucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJvbGVzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBhbnkpOiBSb2xlIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignUm9sZS5wYXJzZTogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHJvbGUgPSBuZXcgUm9sZSgpO1xuICAgIHJvbGUuaWQgPSBkYXRhLmlkO1xuICAgIHJvbGUubmFtZSA9IGRhdGEubmFtZTtcbiAgICByZXR1cm4gcm9sZTtcbiAgfVxufSIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBTY2hlbWF7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuICBsYWJlbCE6IHN0cmluZztcbiAgdGVuYW50T3duZXJJZDogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZDtcbiAgdXNlck93bmVySWQ6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQ7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxTY2hlbWE+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignU2NoZW1hLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3Qgc2NoZW1hcyA9IEFycmF5PFNjaGVtYT4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHNjaGVtYXMucHVzaChTY2hlbWEucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNjaGVtYXM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IGFueSk6IFNjaGVtYSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1NjaGVtYS5wYXJzZTogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWEoKTtcbiAgICBzY2hlbWEuaWQgPSBkYXRhLmlkO1xuICAgIHNjaGVtYS5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHNjaGVtYS5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgc2NoZW1hLnRlbmFudE93bmVySWQgPSBkYXRhLnRlbmFudE93bmVySWQ7XG4gICAgc2NoZW1hLnVzZXJPd25lcklkID0gZGF0YS51c2VyT3duZXJJZDtcbiAgICBzY2hlbWEuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0O1xuICAgIHNjaGVtYS51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxufSIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBUZW5hbnQge1xuICBpZCE6IG51bWJlcjtcbiAgbmFtZSE6IHN0cmluZztcbiAgbGFiZWwhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxUZW5hbnQ+IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignVGVuYW50LnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3QgdGVuYW50cyA9IEFycmF5PFRlbmFudD4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHRlbmFudHMucHVzaChUZW5hbnQucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRlbmFudHM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IGFueSk6IFRlbmFudCB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1RlbmFudC5wYXJzZTogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHRlbmFudCA9IG5ldyBUZW5hbnQoKTtcbiAgICB0ZW5hbnQuaWQgPSBkYXRhLmlkO1xuICAgIHRlbmFudC5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRlbmFudC5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgdGVuYW50LmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdDtcbiAgICB0ZW5hbnQudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0O1xuICAgIHJldHVybiB0ZW5hbnQ7XG4gIH1cbn0iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVXNlciB7XG4gIGlkITogbnVtYmVyO1xuICB0ZW5hbnRfaWQhOiBudW1iZXI7XG4gIGVtYWlsITogc3RyaW5nO1xuICBmaXJzdE5hbWUhOiBzdHJpbmc7XG4gIGxhc3ROYW1lITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VXNlcj4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdVc2VyLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3QgdXNlcnMgPSBBcnJheTxVc2VyPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdXNlcnMucHVzaChVc2VyLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB1c2VycztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogYW55KTogVXNlciB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1VzZXIucGFyc2U6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB1c2VyID0gbmV3IFVzZXIoKTtcbiAgICB1c2VyLmlkID0gZGF0YS5pZDtcbiAgICB1c2VyLmVtYWlsID0gZGF0YS5lbWFpbDtcbiAgICB1c2VyLmZpcnN0TmFtZSA9IGRhdGEuZmlyc3RfbmFtZTtcbiAgICB1c2VyLmxhc3ROYW1lID0gZGF0YS5sYXN0X25hbWU7XG4gICAgdXNlci5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQ7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQ7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cbn0iLCJ0eXBlIEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBzdHJpbmc7XG4gIGRiTmFtZTogc3RyaW5nLFxuICBkYkhvc3Q6IHN0cmluZyxcbiAgZGJQb3J0OiBudW1iZXIsXG4gIGRiVXNlcjogc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBzdHJpbmcsXG4gIGRiUG9vbE1heDogbnVtYmVyLFxuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyLFxufTtcblxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50OiBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogcHJvY2Vzcy5lbnYuU0VDUkVUX01FU1NBR0UgYXMgc3RyaW5nLFxuICBkYk5hbWU6IHByb2Nlc3MuZW52LkRCX05BTUUgYXMgc3RyaW5nLFxuICBkYkhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgYXMgc3RyaW5nLFxuICBkYlBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgJycpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8ICcnKSBhcyBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX0lETEVfVElNRU9VVF9NSUxMSVMgfHwgJycpIGFzIG51bWJlcixcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfQ09OTkVDVElPTl9USU1FT1VUX01JTExJUyB8fCAnJykgYXMgbnVtYmVyLFxufTsiLCIvLyBodHRwczovL2FsdHJpbS5pby9wb3N0cy9heGlvcy1odHRwLWNsaWVudC11c2luZy10eXBlc2NyaXB0XG5cbmltcG9ydCBheGlvcywgeyBBeGlvc0luc3RhbmNlLCBBeGlvc1JlcXVlc3RDb25maWcsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi9zZXJ2aWNlLXJlc3VsdFwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gIFwieC1oYXN1cmEtYWRtaW4tc2VjcmV0XCI6IFwiSGE1dXJhV0JTdGFnaW5nXCJcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogXCJodHRwOi8vbG9jYWxob3N0OjgwODBcIixcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiB7fSl7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KCcvdjEvbWV0YWRhdGEnLCB7XG4gICAgICAgIFwidHlwZVwiOiB0eXBlLFxuICAgICAgICBcImFyZ3NcIjogYXJnc1xuICAgICAgfSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHJlc3BvbnNlXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2cuZXJyb3IoZXJyb3IucmVzcG9uc2UuZGF0YSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICBjb2RlOiBlcnJvci5yZXNwb25zZS5zdGF0dXNcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ190cmFja190YWJsZVwiLCB7XG4gICAgICBcInRhYmxlXCI6e1xuICAgICAgICBcInNjaGVtYVwiOiBzY2hlbWFOYW1lLFxuICAgICAgICBcIm5hbWVcIjogdGFibGVOYW1lXG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG59XG5cbmV4cG9ydCBjb25zdCBoYXN1cmFBcGkgPSBuZXcgSGFzdXJhQXBpKCk7IiwiaW1wb3J0IHsgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIlxuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcbmltcG9ydCB7IGhhc3VyYUFwaSB9IGZyb20gXCIuL2hhc3VyYS1hcGlcIjtcblxuZXhwb3J0IGNvbnN0IHJlc29sdmVyczogSVJlc29sdmVycyA9IHtcbiAgUXVlcnk6IHtcbiAgICB3YkhlYWx0aENoZWNrOiAoKSA9PiAnQWxsIGdvb2QnLFxuICAgIC8vIFRlbmFudHNcbiAgICB3YlRlbmFudHM6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgaGFzdXJhUmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUoJ25vcnRod2luZCcsJ2NhdGVnb3JpZXMnKTtcbiAgICAgIGxvZy5pbmZvKGhhc3VyYVJlc3VsdCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQudGVuYW50cygpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlRlbmFudEJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC50ZW5hbnRCeUlkKGlkKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JUZW5hbnRCeU5hbWU6IGFzeW5jIChfLCB7IG5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnRlbmFudEJ5TmFtZShuYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVXNlcnNcbiAgICB3YlVzZXJzQnlUZW5hbnRJZDogYXN5bmMgKF8sIHsgdGVuYW50SWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5SWQ6IGFzeW5jIChfLCB7IGlkIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlJZChpZCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXNlckJ5RW1haWw6IGFzeW5jIChfLCB7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51c2VyQnlFbWFpbChlbWFpbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTtcbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gVGVzdFxuICAgIHdiUmVzZXRUZXN0RGF0YTogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LndiQ2xvdWQucmVzZXRUZXN0RGF0YSgpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3M7XG4gICAgfSxcbiAgICAvLyBUZW5hbnRzXG4gICAgd2JDcmVhdGVUZW5hbnQ6IGFzeW5jIChfLCB7IG5hbWUsIGxhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVUZW5hbnQobmFtZSwgbGFiZWwpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVwZGF0ZVRlbmFudDogYXN5bmMgKF8sIHsgaWQsIG5hbWUsIGxhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC51cGRhdGVUZW5hbnQoaWQsIG5hbWUsIGxhYmVsKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVGVuYW50LVVzZXItUm9sZXNcbiAgICB3YkFkZFVzZXJUb1RlbmFudDogYXN5bmMgKF8sIHsgdGVuYW50TmFtZSwgdXNlckVtYWlsLCB0ZW5hbnRSb2xlIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5hZGRVc2VyVG9UZW5hbnQodGVuYW50TmFtZSwgdXNlckVtYWlsLCB0ZW5hbnRSb2xlKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVXNlcnNcbiAgICB3YkNyZWF0ZVVzZXI6IGFzeW5jIChfLCB7IGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVVc2VyOiBhc3luYyAoXywgeyBpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLnVwZGF0ZVVzZXIoaWQsIGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gU2NoZW1hc1xuICAgIHdiQ3JlYXRlU2NoZW1hOiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCwgdGVuYW50T3duZXJJZCwgdGVuYW50T3duZXJOYW1lLCB1c2VyT3duZXJJZCwgdXNlck93bmVyRW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVNjaGVtYShuYW1lLCBsYWJlbCwgdGVuYW50T3duZXJJZCwgdGVuYW50T3duZXJOYW1lLCB1c2VyT3duZXJJZCwgdXNlck93bmVyRW1haWwpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfVxuICB9LFxuXG59OyIsImltcG9ydCB7IGdxbCB9IGZyb20gJ2Fwb2xsby1zZXJ2ZXItbGFtYmRhJztcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFRlbmFudHtcbiAgICBpZDogICAgICAgICBJRCEsXG4gICAgbmFtZTogICAgICAgU3RyaW5nISxcbiAgICBsYWJlbDogICAgICBTdHJpbmchLFxuICAgIGNyZWF0ZWRBdDogIFN0cmluZyEsXG4gICAgdXBkYXRlZEF0OiAgU3RyaW5nIVxuICB9XG4gIHR5cGUgVXNlcntcbiAgICBpZDogICAgICAgICBJRCEsXG4gICAgZW1haWw6ICAgICAgU3RyaW5nISxcbiAgICBmaXJzdE5hbWU6ICBTdHJpbmcsXG4gICAgbGFzdE5hbWU6ICAgU3RyaW5nLFxuICAgIGNyZWF0ZWRBdDogIFN0cmluZyEsXG4gICAgdXBkYXRlZEF0OiAgU3RyaW5nIVxuICB9XG4gIHR5cGUgU2NoZW1he1xuICAgIGlkOiAgICAgICAgICAgICBJRCEsXG4gICAgbmFtZTogICAgICAgICAgIFN0cmluZyEsXG4gICAgbGFiZWw6ICAgICAgICAgIFN0cmluZyEsXG4gICAgdGVuYW50T3duZXJJZDogIEludCxcbiAgICB1c2VyT3duZXJJZDogICAgSW50LFxuICAgIGNyZWF0ZWRBdDogICAgICBTdHJpbmchLFxuICAgIHVwZGF0ZWRBdDogICAgICBTdHJpbmchXG4gIH1cbiAgdHlwZSBRdWVyeSB7XG4gICAgd2JIZWFsdGhDaGVjazogU3RyaW5nIVxuICAgIFwiXCJcIlxuICAgIFRlbmFudHNcbiAgICBcIlwiXCJcbiAgICB3YlRlbmFudHM6IFtUZW5hbnRdXG4gICAgd2JUZW5hbnRCeUlkKGlkOiBJRCEpOiBUZW5hbnRcbiAgICB3YlRlbmFudEJ5TmFtZShuYW1lOiBTdHJpbmchKTogVGVuYW50XG4gICAgXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZDogSUQhKTogW1VzZXJdXG4gICAgd2JVc2VyQnlJZChpZDogSUQhKTogVXNlclxuICAgIHdiVXNlckJ5RW1haWwoZW1haWw6IFN0cmluZyEpOiBVc2VyXG4gIH1cbiAgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXG4gICAgVGVzdFxuICAgIFwiXCJcIlxuICAgIHdiUmVzZXRUZXN0RGF0YTogQm9vbGVhbiFcbiAgICBcIlwiXCJcbiAgICBUZW5hbnRzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVUZW5hbnQobmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBUZW5hbnRcbiAgICB3YlVwZGF0ZVRlbmFudChpZDogSUQhLCBuYW1lOiBTdHJpbmcsIGxhYmVsOiBTdHJpbmcpOiBUZW5hbnRcbiAgICBcIlwiXCJcbiAgICBUZW5hbnQtVXNlci1Sb2xlc1xuICAgIFwiXCJcIlxuICAgIHdiQWRkVXNlclRvVGVuYW50KHRlbmFudE5hbWU6IFN0cmluZyEsIHVzZXJFbWFpbDogU3RyaW5nISwgdGVuYW50Um9sZTogU3RyaW5nISk6IFVzZXJcbiAgICBcIlwiXCJcbiAgICBVc2Vyc1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlVXNlcihlbWFpbDogU3RyaW5nISwgZmlyc3ROYW1lOiBTdHJpbmcsIGxhc3ROYW1lOiBTdHJpbmcpOiBVc2VyXG4gICAgd2JVcGRhdGVVc2VyKGlkOiBJRCEsIGVtYWlsOiBTdHJpbmcsIGZpcnN0TmFtZTogU3RyaW5nLCBsYXN0TmFtZTogU3RyaW5nKTogVXNlclxuICAgIFwiXCJcIlxuICAgIFNjaGVtYXNcbiAgICBcIlwiXCJcbiAgICB3YkNyZWF0ZVNjaGVtYShuYW1lOiBTdHJpbmchLCBsYWJlbDogU3RyaW5nISwgdGVuYW50T3duZXJJZDogSW50LCB0ZW5hbnRPd25lck5hbWU6IFN0cmluZywgdXNlck93bmVySWQ6IEludCwgdXNlck93bmVyRW1haWw6IFN0cmluZyk6IFNjaGVtYVxuICB9XG5gO1xuXG5cblxuXG5cbiIsImltcG9ydCB7IEFwb2xsb1NlcnZlciB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgcmVzb2x2ZXJzIH0gZnJvbSBcIi4vcmVzb2x2ZXJzXCI7XG5pbXBvcnQgeyB0eXBlRGVmcyB9IGZyb20gXCIuL3R5cGUtZGVmc1wiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcInRzbG9nXCI7XG5pbXBvcnQgeyBEQUwgfSBmcm9tIFwiLi9kYWxcIjtcblxuZXhwb3J0IGNvbnN0IGdyYXBocWxIYW5kbGVyID0gbmV3IEFwb2xsb1NlcnZlcih7XG4gIHR5cGVEZWZzLFxuICByZXNvbHZlcnMsXG4gIGludHJvc3BlY3Rpb246IHRydWUsXG4gIGNvbnRleHQ6IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhbDogKG5ldyBEQUwoKSksXG4gICAgICB3YkNsb3VkOiAobmV3IFdiQ2xvdWQoKSlcbiAgICB9XG4gIH1cbn0pLmNyZWF0ZUhhbmRsZXIoKTtcblxuZXhwb3J0IGNvbnN0IGxvZzogTG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gIG1pbkxldmVsOiBcImRlYnVnXCJcbn0pO1xuXG5jbGFzcyBXYkNsb3VkIHtcbiAgZGFsID0gbmV3IERBTCgpO1xuXG4gIHB1YmxpYyBhc3luYyByZXNldFRlc3REYXRhKCkge1xuICAgIHZhciByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VGVuYW50cygpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5kZWxldGVUZXN0VXNlcnMoKTtcbiAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIFxuICAvKipcbiAgICogVGVuYW50cyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRlbmFudHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRlbmFudHMoKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeUlkKGlkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudGVuYW50QnlJZChpZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC50ZW5hbnRCeU5hbWUobmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVGVuYW50KG5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC5jcmVhdGVUZW5hbnQobmFtZSwgbGFiZWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVRlbmFudChpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlVGVzdFRlbmFudHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmRlbGV0ZVRlc3RUZW5hbnRzKCk7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBUZW5hbnQtVXNlci1Sb2xlc1xuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgYWRkVXNlclRvVGVuYW50KHRlbmFudE5hbWU6IHN0cmluZywgdXNlckVtYWlsOiBzdHJpbmcsIHRlbmFudFJvbGU6IHN0cmluZykge1xuICAgIGxvZy5kZWJ1Zyhgd2JDbG91ZC5hZGRVc2VyVG9UZW5hbnQ6ICR7dGVuYW50TmFtZX0sICR7dXNlckVtYWlsfSwgJHt0ZW5hbnRSb2xlfWApO1xuICAgIGNvbnN0IHVzZXJSZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC51c2VyQnlFbWFpbCh1c2VyRW1haWwpO1xuICAgIGlmKCF1c2VyUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB1c2VyUmVzdWx0O1xuICAgIGNvbnN0IHRlbmFudFJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnRlbmFudEJ5TmFtZSh0ZW5hbnROYW1lKTtcbiAgICBpZighdGVuYW50UmVzdWx0LnN1Y2Nlc3MpIHJldHVybiB0ZW5hbnRSZXN1bHQ7XG4gICAgY29uc3Qgcm9sZVJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnJvbGVCeU5hbWUodGVuYW50Um9sZSk7XG4gICAgaWYoIXJvbGVSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJvbGVSZXN1bHQ7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwuYWRkVXNlclRvVGVuYW50KHRlbmFudFJlc3VsdC5wYXlsb2FkLmlkLCB1c2VyUmVzdWx0LnBheWxvYWQuaWQsIHJvbGVSZXN1bHQucGF5bG9hZC5pZCk7XG4gICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiB1c2VyUmVzdWx0O1xuICB9XG5cblxuICAvKipcbiAgICogVXNlcnMgXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyB1c2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2Vyc0J5VGVuYW50SWQodGVuYW50SWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUlkKGlkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlckJ5SWQoaWQpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKGVtYWlsOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXNlckJ5RW1haWwoZW1haWwpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoZW1haWw6IHN0cmluZywgZmlyc3ROYW1lOiBzdHJpbmcsIGxhc3ROYW1lOiBzdHJpbmcpIHtcbiAgICAvLyBUQkQ6IGF1dGhlbnRpY2F0aW9uLCBzYXZlIHBhc3N3b3JkXG4gICAgcmV0dXJuIHRoaXMuZGFsLmNyZWF0ZVVzZXIoZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoaWQ6IG51bWJlciwgZW1haWw6IHN0cmluZywgZmlyc3ROYW1lOiBzdHJpbmcsIGxhc3ROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICB9XG5cblxuICAvKipcbiAgICogUm9sZXMgXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyByb2xlQnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC5yb2xlQnlOYW1lKG5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVtYXMgXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVTY2hlbWEobmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0ZW5hbnRPd25lcklkOiBudW1iZXJ8bnVsbCwgdGVuYW50T3duZXJOYW1lOiBzdHJpbmd8bnVsbCwgdXNlck93bmVySWQ6IG51bWJlcnxudWxsLCB1c2VyT3duZXJFbWFpbDogc3RyaW5nfG51bGwpIHtcbiAgICB2YXIgcmVzdWx0O1xuICAgIGlmKCF0ZW5hbnRPd25lcklkICYmICF1c2VyT3duZXJJZCl7XG4gICAgICBpZih0ZW5hbnRPd25lck5hbWUpe1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC50ZW5hbnRCeU5hbWUodGVuYW50T3duZXJOYW1lKTtcbiAgICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICB0ZW5hbnRPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9IGVsc2UgaWYgKHVzZXJPd25lckVtYWlsKXtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudXNlckJ5RW1haWwodXNlck93bmVyRW1haWwpO1xuICAgICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgICAgIHVzZXJPd25lcklkID0gcmVzdWx0LnBheWxvYWQuaWQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6IFwiT3duZXIgY291bGQgbm90IGJlIGZvdW5kXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5kYWwuY3JlYXRlU2NoZW1hKG5hbWUsIGxhYmVsLCB0ZW5hbnRPd25lcklkLCB1c2VyT3duZXJJZCk7XG4gIH1cblxufSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2ItY2xvdWQudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUdBO0FBdE5BO0FBc05BO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ2hPQTtBQUlBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXBCQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNGQTtBQVNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE5QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFPQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUExQkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDRkE7QUFTQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTdCQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3RCQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQWtEQTtBQWhEQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNsRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3pGQTtBQUVBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBZ0VBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQXFIQTtBQW5IQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQU1BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQzlJQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0EiLCJzb3VyY2VSb290IjoiIn0=