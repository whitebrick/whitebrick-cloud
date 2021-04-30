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
        tenant.createdAt = data.created_at.toString();
        tenant.updatedAt = data.updated_at.toString();
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
        user.createdAt = data.created_at.toString();
        user.updatedAt = data.updated_at.toString();
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
        wbUsersByTenantId: (_, { tenantId }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.usersByTenantId(tenantId);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbUserById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.userById(id);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbUserByEmail: (_, { email }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.userByEmail(email);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbTenants: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const hasuraResult = yield hasura_api_1.hasuraApi.trackTable('northwind', 'categories');
            wb_cloud_1.log.info(hasuraResult);
            const result = yield context.dal.tenants();
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbTenantById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.tenantById(id);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbTenantByName: (_, { name }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.tenantByName(name);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
    },
    Mutation: {
        wbResetTestData: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.resetTestData();
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.success;
        }),
        wbCreateUser: (_, { email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createUser(email, firstName, lastName);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbUpdateUser: (_, { id, email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.updateUser(id, email, firstName, lastName);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbCreateTenant: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.createTenant(name, label);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbUpdateTenant: (_, { id, name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.updateTenant(id, name, label);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
        wbAddUserToTenant: (_, { tenantName, userEmail, tenantRole }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.wbCloud.addUserToTenant(tenantName, userEmail, tenantRole);
            if (!result.success) {
                throw new apollo_server_lambda_1.ApolloError(result.message, _, { ref: result.code });
            }
            return result.payload;
        }),
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
    wbAddUserToTenant(tenantName: String!, userEmail: String!, tenantRole: String!): User
    """
    Users
    """
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(id: ID!, email: String, firstName: String, lastName: String): User
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL3diLWNsb3VkLmpzIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9kYWwudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvUm9sZS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2VudGl0eS9UZW5hbnQudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVXNlci50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Vudmlyb25tZW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvaGFzdXJhLWFwaS50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3Jlc29sdmVycy50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGUtZGVmcy50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3diLWNsb3VkLnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJheGlvc1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJwZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvZXh0ZXJuYWwgXCJ0c2xvZ1wiIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC93ZWJwYWNrL3N0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZW52aXJvbm1lbnQgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tIFwicGdcIjtcbmltcG9ydCB7IFRlbmFudCB9IGZyb20gXCIuL2VudGl0eS9UZW5hbnRcIjtcbmltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLi9lbnRpdHkvVXNlclwiO1xuaW1wb3J0IHsgUm9sZSB9IGZyb20gXCIuL2VudGl0eS9Sb2xlXCI7XG5pbXBvcnQgeyBTZXJ2aWNlUmVzdWx0IH0gZnJvbSBcIi4vc2VydmljZS1yZXN1bHRcIjtcblxuXG5leHBvcnQgY2xhc3MgREFMIHtcblxuICBwcml2YXRlIHBvb2w6IFBvb2w7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5wb29sID0gbmV3IFBvb2woe1xuICAgICAgZGF0YWJhc2U6IGVudmlyb25tZW50LmRiTmFtZSxcbiAgICAgIGhvc3Q6IGVudmlyb25tZW50LmRiSG9zdCxcbiAgICAgIHBvcnQ6IGVudmlyb25tZW50LmRiUG9ydCxcbiAgICAgIHVzZXI6IGVudmlyb25tZW50LmRiVXNlcixcbiAgICAgIHBhc3N3b3JkOiBlbnZpcm9ubWVudC5kYlBhc3N3b3JkLFxuICAgICAgbWF4OiBlbnZpcm9ubWVudC5kYlBvb2xNYXgsXG4gICAgICBpZGxlVGltZW91dE1pbGxpczogZW52aXJvbm1lbnQuZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXMsXG4gICAgICBjb25uZWN0aW9uVGltZW91dE1pbGxpczogZW52aXJvbm1lbnQuZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXMsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeShxdWVyeTogc3RyaW5nLCBwYXJhbXM6IFthbnldKSB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5wb29sLmNvbm5lY3QoKTtcbiAgICBsZXQgcmVzdWx0OiBTZXJ2aWNlUmVzdWx0O1xuICAgIHRyeSB7XG4gICAgICBsb2cuZGVidWcoYGRhbC5leGVjdXRlUXVlcnk6ICR7cXVlcnl9YCwgcGFyYW1zKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nLmVycm9yKGVycm9yKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLmRldGFpbCxcbiAgICAgICAgY29kZTogZXJyb3IuY29kZVxuICAgICAgfTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIFxuICAvKipcbiAgICogVGVuYW50cyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHRlbmFudHMoKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gd2IudGVuYW50c1wiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW107XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRlbmFudEJ5SWQoaWQ6IG51bWJlcikge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2lkXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHdiLnRlbmFudHMgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbbmFtZV07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVRlbmFudChuYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiSU5TRVJUIElOVE8gd2IudGVuYW50cyhuYW1lLCBsYWJlbCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW25hbWUsIGxhYmVsLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGVuYW50KGlkOiBudW1iZXIsIG5hbWU6IHN0cmluZ3xudWxsLCBsYWJlbDogc3RyaW5nfG51bGwpIHtcbiAgICBpZihuYW1lID09IG51bGwgJiYgbGFiZWwgPT0gbnVsbCkgcmV0dXJuIHtzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogXCJ1cGRhdGVUZW5hbnQ6IGFsbCBwYXJhbWV0ZXJzIGFyZSBudWxsXCJ9XG4gICAgbGV0IHBhcmFtQ291bnQgPSAzO1xuICAgIGxldCBwYXJhbXM6IGFueSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgd2IudGVuYW50cyBTRVQgXCI7XG4gICAgaWYgKG5hbWUgICE9IG51bGwpICBxdWVyeSArPSAoYG5hbWU9JCR7cGFyYW1Db3VudH0sIGApOyAgcGFyYW1zLnB1c2gobmFtZSk7ICAgcGFyYW1Db3VudCsrOyBcbiAgICBpZiAobGFiZWwgIT0gbnVsbCkgIHF1ZXJ5ICs9IChgbGFiZWw9JCR7cGFyYW1Db3VudH0sIGApOyBwYXJhbXMucHVzaChsYWJlbCk7ICBwYXJhbUNvdW50Kys7IFxuICAgIHF1ZXJ5ICs9IChcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIik7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VGVuYW50cygpIHtcbiAgICBjb25zdCB0ZW5hbnRVc2Vyc1F1ZXJ5ID0gXCJERUxFVEUgRlJPTSB3Yi50ZW5hbnRfdXNlcnMgV0hFUkUgdGVuYW50X2lkIElOIChTRUxFQ1QgaWQgRlJPTSB3Yi50ZW5hbnRzIFdIRVJFIG5hbWUgbGlrZSAndGVzdF90ZW5hbnRfJScpXCI7XG4gICAgY29uc3QgdGVuYW50c1F1ZXJ5ID0gXCJERUxFVEUgRlJPTSB3Yi50ZW5hbnRzIFdIRVJFIG5hbWUgbGlrZSAndGVzdF90ZW5hbnRfJSdcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtdO1xuICAgIHZhciByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh0ZW5hbnRVc2Vyc1F1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeSh0ZW5hbnRzUXVlcnksIHBhcmFtcyk7XG4gICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBUZW5hbnQtVXNlcnMgXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyVG9UZW5hbnQodGVuYW50SWQ6IG51bWJlciwgdXNlcklkOiBudW1iZXIsIHRlbmFudFJvbGVJZDogbnVtYmVyKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIklOU0VSVCBJTlRPIHdiLnRlbmFudF91c2Vycyh0ZW5hbnRfaWQsIHVzZXJfaWQsIHJvbGVfaWQsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpIFZBTFVFUygkMSwgJDIsICQzLCAkNCwgJDUpXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbdGVuYW50SWQsIHVzZXJJZCwgdGVuYW50Um9sZUlkLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVtb3ZlVXNlckZyb21UZW5hbnQodGVuYW50SWQ6IG51bWJlciwgdXNlcklkOiBudW1iZXIsIHRlbmFudFJvbGVJZDogbnVtYmVyfG51bGwpIHtcbiAgICB2YXIgcXVlcnkgPSBcIkRFTEVURSBGUk9NIHdiLnRlbmFudF91c2VycyBXSEVSRSB0ZW5hbnRfaWQ9JDEgQU5EIHVzZXJfaWQ9JDJcIjtcbiAgICB2YXIgcGFyYW1zOiBhbnkgPSBbdGVuYW50SWQsIHVzZXJJZF07XG4gICAgaWYodGVuYW50Um9sZUlkKSBxdWVyeSArPSAoXCIgQU5EIHJvbGVfaWQ9JDNcIik7IHBhcmFtcy5wdXNoKHRlbmFudFJvbGVJZCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIFVzZXJzIFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeVRlbmFudElkKHRlbmFudElkOiBudW1iZXIpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiU0VMRUNUICogRlJPTSB3Yi51c2VycyBXSEVSRSB0ZW5hbnRfaWQ9JDFcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFt0ZW5hbnRJZF07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlJZChpZDogbnVtYmVyKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gd2IudXNlcnMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2lkXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKGVtYWlsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiU0VMRUNUICogRlJPTSB3Yi51c2VycyBXSEVSRSBlbWFpbD0kMSBMSU1JVCAxXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbZW1haWxdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihlbWFpbDogc3RyaW5nLCBmaXJzdE5hbWU6IHN0cmluZywgbGFzdE5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJJTlNFUlQgSU5UTyB3Yi51c2VycyhlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMoJDEsICQyLCAkMywgJDQsICQ1KSBSRVRVUk5JTkcgKlwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2VtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoaWQ6IG51bWJlciwgZW1haWw6IHN0cmluZ3xudWxsLCBmaXJzdE5hbWU6IHN0cmluZ3xudWxsLCBsYXN0TmFtZTogc3RyaW5nfG51bGwpIHtcbiAgICBpZihlbWFpbCA9PSBudWxsICYmIGZpcnN0TmFtZSA9PSBudWxsICYmIGxhc3ROYW1lID09IG51bGwpIHJldHVybiB7c3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6IFwidXBkYXRlVXNlcjogYWxsIHBhcmFtZXRlcnMgYXJlIG51bGxcIn1cbiAgICBsZXQgcGFyYW1Db3VudCA9IDM7XG4gICAgbGV0IHBhcmFtczogYW55ID0gW25ldyBEYXRlKCksIGlkXTtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB3Yi51c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsICAgICAhPSBudWxsKSAgcXVlcnkgKz0gKGBlbWFpbD0kJHtwYXJhbUNvdW50fSwgYCk7ICAgICAgcGFyYW1zLnB1c2goZW1haWwpOyAgICAgcGFyYW1Db3VudCsrOyBcbiAgICBpZiAoZmlyc3ROYW1lICE9IG51bGwpICBxdWVyeSArPSAoYGZpcnN0X25hbWU9JCR7cGFyYW1Db3VudH0sIGApOyBwYXJhbXMucHVzaChmaXJzdE5hbWUpOyBwYXJhbUNvdW50Kys7IFxuICAgIGlmIChsYXN0TmFtZSAgIT0gbnVsbCkgIHF1ZXJ5ICs9IChgbGFzdF9uYW1lPSQke3BhcmFtQ291bnR9LCBgKTsgIHBhcmFtcy5wdXNoKGxhc3ROYW1lKTsgIHBhcmFtQ291bnQrKzsgXG4gICAgcXVlcnkgKz0gKFwidXBkYXRlZF9hdD0kMSBXSEVSRSBpZD0kMiBSRVRVUk5JTkcgKlwiKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlbGV0ZVRlc3RVc2VycygpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiREVMRVRFIEZST00gd2IudXNlcnMgV0hFUkUgZW1haWwgbGlrZSAndGVzdF91c2VyXyVleGFtcGxlLmNvbSdcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBSb2xlcyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gd2Iucm9sZXMgV0hFUkUgbmFtZT0kMSBMSU1JVCAxXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbbmFtZV07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gUm9sZS5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG5cblxufTsiLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgUm9sZSB7XG4gIGlkITogbnVtYmVyO1xuICBuYW1lITogc3RyaW5nO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8Um9sZT4ge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdSb2xlLnBhcnNlUmVzdWx0OiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3Qgcm9sZXMgPSBBcnJheTxSb2xlPigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgcm9sZXMucHVzaChSb2xlLnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiByb2xlcztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogYW55KTogUm9sZSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1JvbGUucGFyc2U6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCByb2xlID0gbmV3IFJvbGUoKTtcbiAgICByb2xlLmlkID0gZGF0YS5pZDtcbiAgICByb2xlLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cbn0iLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVGVuYW50IHtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKTogQXJyYXk8VGVuYW50PiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1RlbmFudC5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHRlbmFudHMgPSBBcnJheTxUZW5hbnQ+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0ZW5hbnRzLnB1c2goVGVuYW50LnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0ZW5hbnRzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBhbnkpOiBUZW5hbnQge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdUZW5hbnQucGFyc2U6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB0ZW5hbnQgPSBuZXcgVGVuYW50KCk7XG4gICAgdGVuYW50LmlkID0gZGF0YS5pZDtcbiAgICB0ZW5hbnQubmFtZSA9IGRhdGEubmFtZTtcbiAgICB0ZW5hbnQubGFiZWwgPSBkYXRhLmxhYmVsO1xuICAgIHRlbmFudC5jcmVhdGVkQXQgPSBkYXRhLmNyZWF0ZWRfYXQudG9TdHJpbmcoKTtcbiAgICB0ZW5hbnQudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0LnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHRlbmFudDtcbiAgfVxufSIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgaWQhOiBudW1iZXI7XG4gIHRlbmFudF9pZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZSE6IHN0cmluZztcbiAgbGFzdE5hbWUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpOiBBcnJheTxVc2VyPiB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1VzZXIucGFyc2VSZXN1bHQ6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB1c2VycyA9IEFycmF5PFVzZXI+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB1c2Vycy5wdXNoKFVzZXIucGFyc2Uocm93KSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHVzZXJzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBhbnkpOiBVc2VyIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignVXNlci5wYXJzZTogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHVzZXIgPSBuZXcgVXNlcigpO1xuICAgIHVzZXIuaWQgPSBkYXRhLmlkO1xuICAgIHVzZXIuZW1haWwgPSBkYXRhLmVtYWlsO1xuICAgIHVzZXIuZmlyc3ROYW1lID0gZGF0YS5maXJzdF9uYW1lO1xuICAgIHVzZXIubGFzdE5hbWUgPSBkYXRhLmxhc3RfbmFtZTtcbiAgICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdC50b1N0cmluZygpO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZGF0YS51cGRhdGVkX2F0LnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVzZXI7XG4gIH1cbn0iLCJ0eXBlIEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBzdHJpbmc7XG4gIGRiTmFtZTogc3RyaW5nLFxuICBkYkhvc3Q6IHN0cmluZyxcbiAgZGJQb3J0OiBudW1iZXIsXG4gIGRiVXNlcjogc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBzdHJpbmcsXG4gIGRiUG9vbE1heDogbnVtYmVyLFxuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyLFxufTtcblxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50OiBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogcHJvY2Vzcy5lbnYuU0VDUkVUX01FU1NBR0UgYXMgc3RyaW5nLFxuICBkYk5hbWU6IHByb2Nlc3MuZW52LkRCX05BTUUgYXMgc3RyaW5nLFxuICBkYkhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgYXMgc3RyaW5nLFxuICBkYlBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgJycpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8ICcnKSBhcyBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX0lETEVfVElNRU9VVF9NSUxMSVMgfHwgJycpIGFzIG51bWJlcixcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfQ09OTkVDVElPTl9USU1FT1VUX01JTExJUyB8fCAnJykgYXMgbnVtYmVyLFxufTsiLCIvLyBodHRwczovL2FsdHJpbS5pby9wb3N0cy9heGlvcy1odHRwLWNsaWVudC11c2luZy10eXBlc2NyaXB0XG5cbmltcG9ydCBheGlvcywgeyBBeGlvc0luc3RhbmNlLCBBeGlvc1JlcXVlc3RDb25maWcsIEF4aW9zUmVzcG9uc2UgfSBmcm9tIFwiYXhpb3NcIjtcbmltcG9ydCB7IFNlcnZpY2VSZXN1bHQgfSBmcm9tIFwiLi9zZXJ2aWNlLXJlc3VsdFwiO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcblxuY29uc3QgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4+ID0ge1xuICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gIFwieC1oYXN1cmEtYWRtaW4tc2VjcmV0XCI6IFwiSGE1dXJhV0JTdGFnaW5nXCJcbn07XG5cbmNsYXNzIEhhc3VyYUFwaSB7XG4gIHByaXZhdGUgaW5zdGFuY2U6IEF4aW9zSW5zdGFuY2UgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGdldCBodHRwKCk6IEF4aW9zSW5zdGFuY2Uge1xuICAgIHJldHVybiB0aGlzLmluc3RhbmNlICE9IG51bGwgPyB0aGlzLmluc3RhbmNlIDogdGhpcy5pbml0SGFzdXJhQXBpKCk7XG4gIH1cblxuICBpbml0SGFzdXJhQXBpKCkge1xuICAgIGNvbnN0IGh0dHAgPSBheGlvcy5jcmVhdGUoe1xuICAgICAgYmFzZVVSTDogXCJodHRwOi8vbG9jYWxob3N0OjgwODBcIixcbiAgICAgIGhlYWRlcnMsXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5pbnN0YW5jZSA9IGh0dHA7XG4gICAgcmV0dXJuIGh0dHA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBvc3QodHlwZTogc3RyaW5nLCBhcmdzOiB7fSl7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBoYXN1cmFBcGkucG9zdDogdHlwZTogJHt0eXBlfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmh0dHAucG9zdDxhbnksIEF4aW9zUmVzcG9uc2U+KCcvdjEvbWV0YWRhdGEnLCB7XG4gICAgICAgIFwidHlwZVwiOiB0eXBlLFxuICAgICAgICBcImFyZ3NcIjogYXJnc1xuICAgICAgfSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBheWxvYWQ6IHJlc3BvbnNlXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2cuZXJyb3IoZXJyb3IucmVzcG9uc2UuZGF0YSk7XG4gICAgICByZXN1bHQgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBlcnJvci5yZXNwb25zZS5kYXRhLmVycm9yLFxuICAgICAgICBjb2RlOiBlcnJvci5yZXNwb25zZS5zdGF0dXNcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0cmFja1RhYmxlKHNjaGVtYU5hbWU6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBvc3QoXCJwZ190cmFja190YWJsZVwiLCB7XG4gICAgICBcInRhYmxlXCI6e1xuICAgICAgICBcInNjaGVtYVwiOiBzY2hlbWFOYW1lLFxuICAgICAgICBcIm5hbWVcIjogdGFibGVOYW1lXG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG59XG5cbmV4cG9ydCBjb25zdCBoYXN1cmFBcGkgPSBuZXcgSGFzdXJhQXBpKCk7IiwiaW1wb3J0IHsgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuaW1wb3J0IHsgQXBvbGxvRXJyb3IgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIlxuaW1wb3J0IHsgbG9nIH0gZnJvbSBcIi4vd2ItY2xvdWRcIjtcbmltcG9ydCB7IGhhc3VyYUFwaSB9IGZyb20gXCIuL2hhc3VyYS1hcGlcIjtcbi8vIGltcG9ydCBcInJlZmxlY3QtbWV0YWRhdGFcIjtcblxuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIHdiSGVhbHRoQ2hlY2s6ICgpID0+ICdBbGwgZ29vZCcsXG4gICAgLy8gVXNlcnNcbiAgICB3YlVzZXJzQnlUZW5hbnRJZDogYXN5bmMgKF8sIHsgdGVuYW50SWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXNlcnNCeVRlbmFudElkKHRlbmFudElkKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2Vzcyl7IHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTsgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2VyQnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXNlckJ5SWQoaWQpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKXsgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pOyB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUVtYWlsOiBhc3luYyAoXywgeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmRhbC51c2VyQnlFbWFpbChlbWFpbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFRlbmFudHNcbiAgICB3YlRlbmFudHM6IGFzeW5jIChfLCBfXywgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgaGFzdXJhUmVzdWx0ID0gYXdhaXQgaGFzdXJhQXBpLnRyYWNrVGFibGUoJ25vcnRod2luZCcsJ2NhdGVnb3JpZXMnKTtcbiAgICAgIGxvZy5pbmZvKGhhc3VyYVJlc3VsdCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmRhbC50ZW5hbnRzKCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVGVuYW50QnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudGVuYW50QnlJZChpZCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVGVuYW50QnlOYW1lOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuZGFsLnRlbmFudEJ5TmFtZShuYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2Vzcyl7IHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTsgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gIH0sXG5cbiAgTXV0YXRpb246IHtcbiAgICAvLyBUZXN0XG4gICAgd2JSZXNldFRlc3REYXRhOiBhc3luYyAoXywgX18sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5yZXNldFRlc3REYXRhKCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQuc3VjY2VzcztcbiAgICB9LFxuXG4gICAgLy8gVXNlcnNcbiAgICB3YkNyZWF0ZVVzZXI6IGFzeW5jIChfLCB7IGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQud2JDbG91ZC5jcmVhdGVVc2VyKGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2Vzcyl7IHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTsgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVVc2VyOiBhc3luYyAoXywgeyBpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKXsgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pOyB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcblxuICAgIC8vIFRlbmFudHNcbiAgICB3YkNyZWF0ZVRlbmFudDogYXN5bmMgKF8sIHsgbmFtZSwgbGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmNyZWF0ZVRlbmFudChuYW1lLCBsYWJlbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVGVuYW50OiBhc3luYyAoXywgeyBpZCwgbmFtZSwgbGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiQWRkVXNlclRvVGVuYW50OiBhc3luYyAoXywgeyB0ZW5hbnROYW1lLCB1c2VyRW1haWwsIHRlbmFudFJvbGUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC53YkNsb3VkLmFkZFVzZXJUb1RlbmFudCh0ZW5hbnROYW1lLCB1c2VyRW1haWwsIHRlbmFudFJvbGUpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKXsgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pOyB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcblxuICB9LFxuXG59OyIsImltcG9ydCB7IGdxbCB9IGZyb20gJ2Fwb2xsby1zZXJ2ZXItbGFtYmRhJztcblxuZXhwb3J0IGNvbnN0IHR5cGVEZWZzID0gZ3FsYFxuICB0eXBlIFRlbmFudHtcbiAgICBpZDogICAgICAgICBJRCEsXG4gICAgbmFtZTogICAgICAgU3RyaW5nISxcbiAgICBsYWJlbDogICAgICBTdHJpbmchLFxuICAgIGNyZWF0ZWRBdDogIFN0cmluZyEsXG4gICAgdXBkYXRlZEF0OiAgU3RyaW5nIVxuICB9XG4gIHR5cGUgVXNlcntcbiAgICBpZDogICAgICAgICBJRCEsXG4gICAgZW1haWw6ICAgICAgU3RyaW5nISxcbiAgICBmaXJzdE5hbWU6ICBTdHJpbmcsXG4gICAgbGFzdE5hbWU6ICAgU3RyaW5nLFxuICAgIGNyZWF0ZWRBdDogIFN0cmluZyEsXG4gICAgdXBkYXRlZEF0OiAgU3RyaW5nIVxuICB9XG4gIHR5cGUgUXVlcnkge1xuICAgIHdiSGVhbHRoQ2hlY2s6IFN0cmluZyFcbiAgICBcIlwiXCJcbiAgICBUZW5hbnRzXG4gICAgXCJcIlwiXG4gICAgd2JUZW5hbnRzOiBbVGVuYW50XVxuICAgIHdiVGVuYW50QnlJZChpZDogSUQhKTogVGVuYW50XG4gICAgd2JUZW5hbnRCeU5hbWUobmFtZTogU3RyaW5nISk6IFRlbmFudFxuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JVc2Vyc0J5VGVuYW50SWQodGVuYW50SWQ6IElEISk6IFtVc2VyXVxuICAgIHdiVXNlckJ5SWQoaWQ6IElEISk6IFVzZXJcbiAgICB3YlVzZXJCeUVtYWlsKGVtYWlsOiBTdHJpbmchKTogVXNlclxuICB9XG4gIHR5cGUgTXV0YXRpb24ge1xuICAgIFwiXCJcIlxuICAgIFRlc3RcbiAgICBcIlwiXCJcbiAgICB3YlJlc2V0VGVzdERhdGE6IEJvb2xlYW4hXG4gICAgXCJcIlwiXG4gICAgVGVuYW50c1xuICAgIFwiXCJcIlxuICAgIHdiQ3JlYXRlVGVuYW50KG5hbWU6IFN0cmluZyEsIGxhYmVsOiBTdHJpbmchKTogVGVuYW50XG4gICAgd2JVcGRhdGVUZW5hbnQoaWQ6IElEISwgbmFtZTogU3RyaW5nLCBsYWJlbDogU3RyaW5nKTogVGVuYW50XG4gICAgd2JBZGRVc2VyVG9UZW5hbnQodGVuYW50TmFtZTogU3RyaW5nISwgdXNlckVtYWlsOiBTdHJpbmchLCB0ZW5hbnRSb2xlOiBTdHJpbmchKTogVXNlclxuICAgIFwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVVc2VyKGVtYWlsOiBTdHJpbmchLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICB3YlVwZGF0ZVVzZXIoaWQ6IElEISwgZW1haWw6IFN0cmluZywgZmlyc3ROYW1lOiBTdHJpbmcsIGxhc3ROYW1lOiBTdHJpbmcpOiBVc2VyXG4gIH1cbmA7XG5cblxuXG5cblxuIiwiaW1wb3J0IHsgQXBvbGxvU2VydmVyIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCI7XG5pbXBvcnQgeyByZXNvbHZlcnMgfSBmcm9tIFwiLi9yZXNvbHZlcnNcIjtcbmltcG9ydCB7IHR5cGVEZWZzIH0gZnJvbSBcIi4vdHlwZS1kZWZzXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuXG5leHBvcnQgY29uc3QgZ3JhcGhxbEhhbmRsZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgdHlwZURlZnMsXG4gIHJlc29sdmVycyxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogZnVuY3Rpb24oKXtcbiAgICByZXR1cm4ge1xuICAgICAgZGFsOiAobmV3IERBTCgpKSxcbiAgICAgIHdiQ2xvdWQ6IChuZXcgV2JDbG91ZCgpKVxuICAgIH1cbiAgfVxufSkuY3JlYXRlSGFuZGxlcigpO1xuXG5leHBvcnQgY29uc3QgbG9nOiBMb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgbWluTGV2ZWw6IFwiZGVidWdcIlxufSk7XG5cbmNsYXNzIFdiQ2xvdWQge1xuICBkYWwgPSBuZXcgREFMKCk7XG5cbiAgcHVibGljIGFzeW5jIHJlc2V0VGVzdERhdGEoKSB7XG4gICAgdmFyIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVRlc3RUZW5hbnRzKCk7XG4gICAgaWYoIXJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcmVzdWx0O1xuICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLmRlbGV0ZVRlc3RVc2VycygpO1xuICAgIGlmKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgXG4gIC8qKlxuICAgKiBUZW5hbnRzIFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwudGVuYW50cygpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHRlbmFudEJ5SWQoaWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmRhbC50ZW5hbnRCeUlkKGlkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnRlbmFudEJ5TmFtZShuYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjcmVhdGVUZW5hbnQobmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLmNyZWF0ZVRlbmFudChuYW1lLCBsYWJlbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVGVuYW50KGlkOiBudW1iZXIsIG5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVUZW5hbnQoaWQsIG5hbWUsIGxhYmVsKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZWxldGVUZXN0VGVuYW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5kYWwuZGVsZXRlVGVzdFRlbmFudHMoKTtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIFRlbmFudC1Vc2VyLVJvbGVzXG4gICAqL1xuXG4gIHB1YmxpYyBhc3luYyBhZGRVc2VyVG9UZW5hbnQodGVuYW50TmFtZTogc3RyaW5nLCB1c2VyRW1haWw6IHN0cmluZywgdGVuYW50Um9sZTogc3RyaW5nKSB7XG4gICAgbG9nLmRlYnVnKGB3YkNsb3VkLmFkZFVzZXJUb1RlbmFudDogJHt0ZW5hbnROYW1lfSwgJHt1c2VyRW1haWx9LCAke3RlbmFudFJvbGV9YCk7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IHRoaXMuZGFsLnVzZXJCeUVtYWlsKHVzZXJFbWFpbCk7XG4gICAgaWYoIXVzZXJSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gICAgY29uc3QgdGVuYW50UmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwudGVuYW50QnlOYW1lKHRlbmFudE5hbWUpO1xuICAgIGlmKCF0ZW5hbnRSZXN1bHQuc3VjY2VzcykgcmV0dXJuIHRlbmFudFJlc3VsdDtcbiAgICBjb25zdCByb2xlUmVzdWx0ID0gYXdhaXQgdGhpcy5kYWwucm9sZUJ5TmFtZSh0ZW5hbnRSb2xlKTtcbiAgICBpZighcm9sZVJlc3VsdC5zdWNjZXNzKSByZXR1cm4gcm9sZVJlc3VsdDtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhbC5hZGRVc2VyVG9UZW5hbnQodGVuYW50UmVzdWx0LnBheWxvYWQuaWQsIHVzZXJSZXN1bHQucGF5bG9hZC5pZCwgcm9sZVJlc3VsdC5wYXlsb2FkLmlkKTtcbiAgICBpZighcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHVzZXJSZXN1bHQ7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBVc2VycyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5SWQoaWQ6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2VyQnlJZChpZCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXNlckJ5RW1haWwoZW1haWw6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC51c2VyQnlFbWFpbChlbWFpbCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVXNlcihlbWFpbDogc3RyaW5nLCBmaXJzdE5hbWU6IHN0cmluZywgbGFzdE5hbWU6IHN0cmluZykge1xuICAgIC8vIFRCRDogYXV0aGVudGljYXRpb24sIHNhdmUgcGFzc3dvcmRcbiAgICByZXR1cm4gdGhpcy5kYWwuY3JlYXRlVXNlcihlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdXBkYXRlVXNlcihpZDogbnVtYmVyLCBlbWFpbDogc3RyaW5nLCBmaXJzdE5hbWU6IHN0cmluZywgbGFzdE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRhbC51cGRhdGVVc2VyKGlkLCBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSk7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBSb2xlcyBcbiAgICovXG5cbiAgcHVibGljIGFzeW5jIHJvbGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZGFsLnJvbGVCeU5hbWUobmFtZSk7XG4gIH1cblxufSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJheGlvc1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwicGdcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInRzbG9nXCIpOzsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvd2ItY2xvdWQudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQUE7QUFDQTtBQUFBO0FBQUE7QUFBQTtBQUNBO0FBQUE7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBSUE7QUFuTUE7QUFtTUE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDNU1BO0FBSUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBcEJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBT0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBMUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ0ZBO0FBU0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE3QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN0QkE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFrREE7QUFoREE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbEVBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUN2RkE7QUFFQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBZ0RBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQUE7QUFDQTtBQTRGQTtBQTFGQTs7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQUE7QUFPQTs7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQU9BOztBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQ3JIQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7Ozs7Ozs7QUNEQTtBQUNBO0E7Ozs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0EiLCJzb3VyY2VSb290IjoiIn0=