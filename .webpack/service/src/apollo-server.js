/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/apollo-server.ts":
/*!******************************!*\
  !*** ./src/apollo-server.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.log = exports.graphqlHandler = void 0;
const apollo_server_lambda_1 = __webpack_require__(/*! apollo-server-lambda */ "apollo-server-lambda");
const resolvers_1 = __webpack_require__(/*! ./resolvers */ "./src/resolvers.ts");
const type_defs_1 = __webpack_require__(/*! ./type-defs */ "./src/type-defs.ts");
const tslog_1 = __webpack_require__(/*! tslog */ "tslog");
const dal_1 = __webpack_require__(/*! ./dal */ "./src/dal.ts");
const apolloServer = new apollo_server_lambda_1.ApolloServer({
    typeDefs: type_defs_1.typeDefs,
    resolvers: resolvers_1.resolvers,
    introspection: true,
    context: function () {
        return {
            dal: (new dal_1.DAL())
        };
    }
});
exports.graphqlHandler = apolloServer.createHandler();
exports.log = new tslog_1.Logger({
    minLevel: "debug"
});


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
const apollo_server_1 = __webpack_require__(/*! ./apollo-server */ "./src/apollo-server.ts");
const pg_1 = __webpack_require__(/*! pg */ "pg");
const Tenant_1 = __webpack_require__(/*! ./entity/Tenant */ "./src/entity/Tenant.ts");
const User_1 = __webpack_require__(/*! ./entity/User */ "./src/entity/User.ts");
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
                apollo_server_1.log.debug(`executeQuery: ${query}`, params);
                const response = yield client.query(query, params);
                result = {
                    success: true,
                    payload: response
                };
            }
            catch (error) {
                apollo_server_1.log.error(error);
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
            const query = "SELECT * FROM tenants";
            const params = [];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload);
            return result;
        });
    }
    tenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM tenants WHERE id=$1 LIMIT 1";
            const params = [id];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    tenantByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM tenants WHERE name=$1 LIMIT 1";
            const params = [name];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    createTenant(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *";
            const params = [name, label, new Date(), new Date()];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    updateTenant(id, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "UPDATE tenants SET ";
            if (name != null)
                query += ("name='" + name + "', ");
            if (label != null)
                query += ("label='" + label + "', ");
            query += ("updated_at=$1 WHERE id=$2 RETURNING *");
            const params = [new Date(), id];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = Tenant_1.Tenant.parseResult(result.payload)[0];
            return result;
        });
    }
    usersByTenantId(tenantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users WHERE tenant_id=$1";
            const params = [tenantId];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload);
            return result;
        });
    }
    userById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users WHERE id=$1 LIMIT 1";
            const params = [id];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    userByEmail(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users WHERE email=$1 LIMIT 1";
            const params = [name];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    createUser(email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6) RETURNING *";
            const params = [email, firstName, lastName, new Date(), new Date()];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
    updateUser(id, email, firstName, lastName) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "UPDATE users SET ";
            if (email != null)
                query += ("email='" + email + "', ");
            if (firstName != null)
                query += ("first_name='" + firstName + "', ");
            if (lastName != null)
                query += ("last_name='" + lastName + "', ");
            query += ("updated_at=$1 WHERE id=$2 RETURNING *");
            const params = [new Date(), id];
            const result = yield this.executeQuery(query, params);
            if (result.success)
                result.payload = User_1.User.parseResult(result.payload)[0];
            return result;
        });
    }
}
exports.DAL = DAL;
;


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
        tenant.name = data.name;
        tenant.label = data.label;
        tenant.createdAt = data.created_at.toString();
        tenant.updatedAt = data.updated_at.toString();
        tenant.id = data.id;
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
        user.tenant_id = data.tenant_id;
        user.email = data.email;
        user.firstName = data.firstName;
        user.lastName = data.lastName;
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
    },
    Mutation: {
        wbCreateTenant: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.createTenant(name, label);
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
        wbCreateUser: (_, { email, firstName, lastName }, context) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield context.dal.createUser(email, firstName, lastName);
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
    """"
    Tenants
    """
    wbTenants: [Tenant]
    wbTenantById(id: ID!): Tenant
    wbTenantByName(name: String!): Tenant
    """"
    Users
    """
    wbUsersByTenantId(tenantId: ID!): [User]
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
  }
  type Mutation {
    """"
    Tenants
    """
    wbCreateTenant(name: String!, label: String!): Tenant
    wbUpdateTenant(id: ID!, name: String, label: String): Tenant
    """"
    Users
    """
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(id: ID!, email: String, firstName: String, lastName: String): User
  }
`;


/***/ }),

/***/ "apollo-server-lambda":
/*!***************************************!*\
  !*** external "apollo-server-lambda" ***!
  \***************************************/
/***/ ((module) => {

module.exports = require("apollo-server-lambda");;

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
/******/ 	var __webpack_exports__ = __webpack_require__("./src/apollo-server.ts");
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2Fwb2xsby1zZXJ2ZXIuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Fwb2xsby1zZXJ2ZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9kYWwudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGVuYW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnZpcm9ubWVudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3Jlc29sdmVycy50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGUtZGVmcy50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwicGdcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwidHNsb2dcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwb2xsb1NlcnZlciB9IGZyb20gJ2Fwb2xsby1zZXJ2ZXItbGFtYmRhJztcbmltcG9ydCB7IHJlc29sdmVycyB9IGZyb20gJy4vcmVzb2x2ZXJzJztcbmltcG9ydCB7IHRlc3RNdXRhdGlvbiwgdGVzdFF1ZXJ5IH0gZnJvbSAnLi90ZXN0aW5nL3Rlc3RpbmcnO1xuaW1wb3J0IHsgdHlwZURlZnMgfSBmcm9tICcuL3R5cGUtZGVmcyc7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuXG5jb25zdCBhcG9sbG9TZXJ2ZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgdHlwZURlZnMsXG4gIHJlc29sdmVycyxcbiAgaW50cm9zcGVjdGlvbjogdHJ1ZSxcbiAgY29udGV4dDogZnVuY3Rpb24oKXtcbiAgICByZXR1cm4ge1xuICAgICAgZGFsOiAobmV3IERBTCgpKVxuICAgIH1cbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCBncmFwaHFsSGFuZGxlciA9IGFwb2xsb1NlcnZlci5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiXG59KTtcblxuLy8gVEVTVElORyBDT0RFXG4vLyB0ZXN0UXVlcnlcbi8vIHRlc3RNdXRhdGlvblxuIiwiaW1wb3J0IHsgZW52aXJvbm1lbnQgfSBmcm9tICcuL2Vudmlyb25tZW50JztcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL2Fwb2xsby1zZXJ2ZXJcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tICdwZyc7XG5pbXBvcnQgeyBUZW5hbnQgfSBmcm9tICcuL2VudGl0eS9UZW5hbnQnO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vZW50aXR5L1VzZXInO1xuaW1wb3J0IHsgU2VydmljZVJlc3VsdCB9IGZyb20gJy4vc2VydmljZS1yZXN1bHQnO1xuXG5leHBvcnQgY2xhc3MgREFMIHtcblxuICBwdWJsaWMgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnkocXVlcnk6IHN0cmluZywgcGFyYW1zOiBbYW55XSkge1xuICAgIGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMucG9vbC5jb25uZWN0KCk7XG4gICAgbGV0IHJlc3VsdDogU2VydmljZVJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgbG9nLmRlYnVnKGBleGVjdXRlUXVlcnk6ICR7cXVlcnl9YCwgcGFyYW1zKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nLmVycm9yKGVycm9yKTtcbiAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yLmRldGFpbCxcbiAgICAgICAgY29kZTogZXJyb3IuY29kZVxuICAgICAgfTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgXG4gIC8qKlxuICAgKiBUZW5hbnRzIFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50cygpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiU0VMRUNUICogRlJPTSB0ZW5hbnRzXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgdGVuYW50QnlJZChpZDogbnVtYmVyKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gdGVuYW50cyBXSEVSRSBpZD0kMSBMSU1JVCAxXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbaWRdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRlbmFudC5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB0ZW5hbnRCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gdGVuYW50cyBXSEVSRSBuYW1lPSQxIExJTUlUIDFcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtuYW1lXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBUZW5hbnQucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY3JlYXRlVGVuYW50KG5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJJTlNFUlQgSU5UTyB0ZW5hbnRzKG5hbWUsIGxhYmVsLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMoJDEsICQyLCAkMywgJDQpIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbbmFtZSwgbGFiZWwsIG5ldyBEYXRlKCksIG5ldyBEYXRlKCldO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFRlbmFudC5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZClbMF07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUZW5hbnQoaWQ6IG51bWJlciwgbmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSB7XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgdGVuYW50cyBTRVQgXCI7XG4gICAgaWYgKG5hbWUgIT0gbnVsbCkgICBxdWVyeSArPSAoXCJuYW1lPSdcIiArIG5hbWUgKyBcIicsIFwiKTtcbiAgICBpZiAobGFiZWwgIT0gbnVsbCkgIHF1ZXJ5ICs9IChcImxhYmVsPSdcIiArIGxhYmVsICsgXCInLCBcIik7XG4gICAgcXVlcnkgKz0gKFwidXBkYXRlZF9hdD0kMSBXSEVSRSBpZD0kMiBSRVRVUk5JTkcgKlwiKTtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtuZXcgRGF0ZSgpLCBpZF07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVGVuYW50LnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIFVzZXJzIFxuICAgKi9cblxuICBwdWJsaWMgYXN5bmMgdXNlcnNCeVRlbmFudElkKHRlbmFudElkOiBudW1iZXIpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiU0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSB0ZW5hbnRfaWQ9JDFcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFt0ZW5hbnRJZF07XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIHBhcmFtcyk7XG4gICAgaWYocmVzdWx0LnN1Y2Nlc3MpIHJlc3VsdC5wYXlsb2FkID0gVXNlci5wYXJzZVJlc3VsdChyZXN1bHQucGF5bG9hZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1c2VyQnlJZChpZDogbnVtYmVyKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gdXNlcnMgV0hFUkUgaWQ9JDEgTElNSVQgMVwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2lkXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVzZXJCeUVtYWlsKG5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGVtYWlsPSQxIExJTUlUIDFcIjtcbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IFtuYW1lXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIoZW1haWw6IHN0cmluZywgZmlyc3ROYW1lOiBzdHJpbmd8bnVsbCwgbGFzdE5hbWU6IHN0cmluZ3xudWxsKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIklOU0VSVCBJTlRPIHVzZXJzKGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWUsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpIFZBTFVFUygkMSwgJDIsICQzLCAkNCwgJDUsICQ2KSBSRVRVUk5JTkcgKlwiO1xuICAgIGNvbnN0IHBhcmFtczogYW55ID0gW2VtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgcGFyYW1zKTtcbiAgICBpZihyZXN1bHQuc3VjY2VzcykgcmVzdWx0LnBheWxvYWQgPSBVc2VyLnBhcnNlUmVzdWx0KHJlc3VsdC5wYXlsb2FkKVswXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZVVzZXIoaWQ6IG51bWJlciwgZW1haWw6IHN0cmluZywgZmlyc3ROYW1lOiBzdHJpbmcsIGxhc3ROYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB1c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsICE9IG51bGwpICAgICAgcXVlcnkgKz0gKFwiZW1haWw9J1wiICsgZW1haWwgKyBcIicsIFwiKTtcbiAgICBpZiAoZmlyc3ROYW1lICE9IG51bGwpICBxdWVyeSArPSAoXCJmaXJzdF9uYW1lPSdcIiArIGZpcnN0TmFtZSArIFwiJywgXCIpO1xuICAgIGlmIChsYXN0TmFtZSAhPSBudWxsKSAgIHF1ZXJ5ICs9IChcImxhc3RfbmFtZT0nXCIgKyBsYXN0TmFtZSArIFwiJywgXCIpO1xuICAgIHF1ZXJ5ICs9IChcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDIgUkVUVVJOSU5HICpcIik7XG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSBbbmV3IERhdGUoKSwgaWRdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBwYXJhbXMpO1xuICAgIGlmKHJlc3VsdC5zdWNjZXNzKSByZXN1bHQucGF5bG9hZCA9IFVzZXIucGFyc2VSZXN1bHQocmVzdWx0LnBheWxvYWQpWzBdO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxufTsiLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVGVuYW50IHtcbiAgaWQhOiBudW1iZXI7XG4gIG5hbWUhOiBzdHJpbmc7XG4gIGxhYmVsITogc3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ1RlbmFudC5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHRlbmFudHMgPSBBcnJheTxUZW5hbnQ+KCk7XG4gICAgZGF0YS5yb3dzLmZvckVhY2goKHJvdzogYW55KSA9PiB7XG4gICAgICB0ZW5hbnRzLnB1c2goVGVuYW50LnBhcnNlKHJvdykpO1xuICAgIH0pO1xuICAgIHJldHVybiB0ZW5hbnRzO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZShkYXRhOiBhbnkpOiBUZW5hbnQge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdUZW5hbnQucGFyc2U6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB0ZW5hbnQgPSBuZXcgVGVuYW50KCk7XG4gICAgdGVuYW50Lm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgdGVuYW50LmxhYmVsID0gZGF0YS5sYWJlbDtcbiAgICB0ZW5hbnQuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0LnRvU3RyaW5nKCk7XG4gICAgdGVuYW50LnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdC50b1N0cmluZygpO1xuICAgIHRlbmFudC5pZCA9IGRhdGEuaWQ7XG4gICAgcmV0dXJuIHRlbmFudDtcbiAgfVxufSIsImltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgaWQhOiBudW1iZXI7XG4gIHRlbmFudF9pZCE6IG51bWJlcjtcbiAgZW1haWwhOiBzdHJpbmc7XG4gIGZpcnN0TmFtZSE6IHN0cmluZztcbiAgbGFzdE5hbWUhOiBzdHJpbmc7XG4gIGNyZWF0ZWRBdCE6IERhdGU7XG4gIHVwZGF0ZWRBdCE6IERhdGU7XG5cbiAgcHVibGljIHN0YXRpYyBwYXJzZVJlc3VsdChkYXRhOiBRdWVyeVJlc3VsdCB8IG51bGwpIHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcignVXNlci5wYXJzZVJlc3VsdDogaW5wdXQgaXMgbnVsbCcpO1xuICAgIGNvbnN0IHVzZXJzID0gQXJyYXk8VXNlcj4oKTtcbiAgICBkYXRhLnJvd3MuZm9yRWFjaCgocm93OiBhbnkpID0+IHtcbiAgICAgIHVzZXJzLnB1c2goVXNlci5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdXNlcnM7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIHBhcnNlKGRhdGE6IGFueSk6IFVzZXIge1xuICAgIGlmICghZGF0YSkgdGhyb3cgbmV3IEVycm9yKCdVc2VyLnBhcnNlOiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3QgdXNlciA9IG5ldyBVc2VyKCk7XG4gICAgdXNlci5pZCA9IGRhdGEuaWQ7XG4gICAgdXNlci50ZW5hbnRfaWQgPSBkYXRhLnRlbmFudF9pZDtcbiAgICB1c2VyLmVtYWlsID0gZGF0YS5lbWFpbDtcbiAgICB1c2VyLmZpcnN0TmFtZSA9IGRhdGEuZmlyc3ROYW1lO1xuICAgIHVzZXIubGFzdE5hbWUgPSBkYXRhLmxhc3ROYW1lO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0LnRvU3RyaW5nKCk7XG4gICAgdXNlci51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXNlcjtcbiAgfVxufSIsInR5cGUgRW52aXJvbm1lbnQgPSB7XG4gIHNlY3JldE1lc3NhZ2U6IHN0cmluZztcbiAgZGJOYW1lOiBzdHJpbmcsXG4gIGRiSG9zdDogc3RyaW5nLFxuICBkYlBvcnQ6IG51bWJlcixcbiAgZGJVc2VyOiBzdHJpbmcsXG4gIGRiUGFzc3dvcmQ6IHN0cmluZyxcbiAgZGJQb29sTWF4OiBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXIsXG4gIGRiUG9vbENvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXIsXG59O1xuXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBwcm9jZXNzLmVudi5TRUNSRVRfTUVTU0FHRSBhcyBzdHJpbmcsXG4gIGRiTmFtZTogcHJvY2Vzcy5lbnYuREJfTkFNRSBhcyBzdHJpbmcsXG4gIGRiSG9zdDogcHJvY2Vzcy5lbnYuREJfSE9TVCBhcyBzdHJpbmcsXG4gIGRiUG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9SVCB8fCAnJykgYXMgbnVtYmVyLFxuICBkYlVzZXI6IHByb2Nlc3MuZW52LkRCX1VTRVIgYXMgc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCBhcyBzdHJpbmcsXG4gIGRiUG9vbE1heDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NQVggfHwgJycpIGFzIG51bWJlcixcbiAgZGJQb29sSWRsZVRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRV9USU1FT1VUX01JTExJUyB8fCAnJykgYXMgbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9DT05ORUNUSU9OX1RJTUVPVVRfTUlMTElTIHx8ICcnKSBhcyBudW1iZXIsXG59OyIsImltcG9ydCB7IElSZXNvbHZlcnMgfSBmcm9tIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIjtcbmltcG9ydCB7IEFwb2xsb0Vycm9yIH0gZnJvbSBcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCJcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL2Fwb2xsby1zZXJ2ZXJcIjtcbi8vIGltcG9ydCBcInJlZmxlY3QtbWV0YWRhdGFcIjtcblxuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIHdiSGVhbHRoQ2hlY2s6ICgpID0+ICdBbGwgZ29vZCcsXG4gICAgLy8gVGVuYW50c1xuICAgIHdiVGVuYW50czogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmRhbC50ZW5hbnRzKCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVGVuYW50QnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudGVuYW50QnlJZChpZCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVGVuYW50QnlOYW1lOiBhc3luYyAoXywgeyBuYW1lIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuZGFsLnRlbmFudEJ5TmFtZShuYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2Vzcyl7IHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTsgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgLy8gVXNlcnNcbiAgICB3YlVzZXJzQnlUZW5hbnRJZDogYXN5bmMgKF8sIHsgdGVuYW50SWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXNlcnNCeVRlbmFudElkKHRlbmFudElkKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2Vzcyl7IHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTsgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVc2VyQnlJZDogYXN5bmMgKF8sIHsgaWQgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXNlckJ5SWQoaWQpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKXsgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pOyB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgICB3YlVzZXJCeUVtYWlsOiBhc3luYyAoXywgeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmRhbC51c2VyQnlFbWFpbChlbWFpbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICB9LFxuXG4gIE11dGF0aW9uOiB7XG4gICAgLy8gVGVuYW50c1xuICAgIC8vIHdiQ3JlYXRlVGVuYW50OiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9OiBhbnksIGNvbnRleHQpID0+IHtcbiAgICAvLyAgIHJldHVybiBhd2FpdCBjb250ZXh0LmRhbC5jcmVhdGVUZW5hbnQobmFtZSwgbGFiZWwpO1xuICAgIC8vIH0sXG4gICAgd2JDcmVhdGVUZW5hbnQ6IGFzeW5jIChfLCB7IG5hbWUsIGxhYmVsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuZGFsLmNyZWF0ZVRlbmFudChuYW1lLCBsYWJlbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIHdiVXBkYXRlVGVuYW50OiBhc3luYyAoXywgeyBpZCwgbmFtZSwgbGFiZWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCk7XG4gICAgICBpZighcmVzdWx0LnN1Y2Nlc3MpeyB0aHJvdyBuZXcgQXBvbGxvRXJyb3IocmVzdWx0Lm1lc3NhZ2UsIF8sIHtyZWY6IHJlc3VsdC5jb2RlfSk7IH1cbiAgICAgIHJldHVybiByZXN1bHQucGF5bG9hZDtcbiAgICB9LFxuICAgIC8vIFVzZXJzXG4gICAgd2JDcmVhdGVVc2VyOiBhc3luYyAoXywgeyBlbWFpbCwgZmlyc3ROYW1lLCBsYXN0TmFtZSB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmRhbC5jcmVhdGVVc2VyKGVtYWlsLCBmaXJzdE5hbWUsIGxhc3ROYW1lKTtcbiAgICAgIGlmKCFyZXN1bHQuc3VjY2Vzcyl7IHRocm93IG5ldyBBcG9sbG9FcnJvcihyZXN1bHQubWVzc2FnZSwgXywge3JlZjogcmVzdWx0LmNvZGV9KTsgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5wYXlsb2FkO1xuICAgIH0sXG4gICAgd2JVcGRhdGVVc2VyOiBhc3luYyAoXywgeyBpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5kYWwudXBkYXRlVXNlcihpZCwgZW1haWwsIGZpcnN0TmFtZSwgbGFzdE5hbWUpO1xuICAgICAgaWYoIXJlc3VsdC5zdWNjZXNzKXsgdGhyb3cgbmV3IEFwb2xsb0Vycm9yKHJlc3VsdC5tZXNzYWdlLCBfLCB7cmVmOiByZXN1bHQuY29kZX0pOyB9XG4gICAgICByZXR1cm4gcmVzdWx0LnBheWxvYWQ7XG4gICAgfSxcbiAgfSxcblxufTsiLCJpbXBvcnQgeyBncWwgfSBmcm9tICdhcG9sbG8tc2VydmVyLWxhbWJkYSc7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBUZW5hbnR7XG4gICAgaWQ6ICAgICAgICAgSUQhLFxuICAgIG5hbWU6ICAgICAgIFN0cmluZyEsXG4gICAgbGFiZWw6ICAgICAgU3RyaW5nISxcbiAgICBjcmVhdGVkQXQ6ICBTdHJpbmchLFxuICAgIHVwZGF0ZWRBdDogIFN0cmluZyFcbiAgfVxuICB0eXBlIFVzZXJ7XG4gICAgaWQ6ICAgICAgICAgSUQhLFxuICAgIGVtYWlsOiAgICAgIFN0cmluZyEsXG4gICAgZmlyc3ROYW1lOiAgU3RyaW5nLFxuICAgIGxhc3ROYW1lOiAgIFN0cmluZyxcbiAgICBjcmVhdGVkQXQ6ICBTdHJpbmchLFxuICAgIHVwZGF0ZWRBdDogIFN0cmluZyFcbiAgfVxuICB0eXBlIFF1ZXJ5IHtcbiAgICB3YkhlYWx0aENoZWNrOiBTdHJpbmchXG4gICAgXCJcIlwiXCJcbiAgICBUZW5hbnRzXG4gICAgXCJcIlwiXG4gICAgd2JUZW5hbnRzOiBbVGVuYW50XVxuICAgIHdiVGVuYW50QnlJZChpZDogSUQhKTogVGVuYW50XG4gICAgd2JUZW5hbnRCeU5hbWUobmFtZTogU3RyaW5nISk6IFRlbmFudFxuICAgIFwiXCJcIlwiXG4gICAgVXNlcnNcbiAgICBcIlwiXCJcbiAgICB3YlVzZXJzQnlUZW5hbnRJZCh0ZW5hbnRJZDogSUQhKTogW1VzZXJdXG4gICAgd2JVc2VyQnlJZChpZDogSUQhKTogVXNlclxuICAgIHdiVXNlckJ5RW1haWwoZW1haWw6IFN0cmluZyEpOiBVc2VyXG4gIH1cbiAgdHlwZSBNdXRhdGlvbiB7XG4gICAgXCJcIlwiXCJcbiAgICBUZW5hbnRzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVUZW5hbnQobmFtZTogU3RyaW5nISwgbGFiZWw6IFN0cmluZyEpOiBUZW5hbnRcbiAgICB3YlVwZGF0ZVRlbmFudChpZDogSUQhLCBuYW1lOiBTdHJpbmcsIGxhYmVsOiBTdHJpbmcpOiBUZW5hbnRcbiAgICBcIlwiXCJcIlxuICAgIFVzZXJzXG4gICAgXCJcIlwiXG4gICAgd2JDcmVhdGVVc2VyKGVtYWlsOiBTdHJpbmchLCBmaXJzdE5hbWU6IFN0cmluZywgbGFzdE5hbWU6IFN0cmluZyk6IFVzZXJcbiAgICB3YlVwZGF0ZVVzZXIoaWQ6IElEISwgZW1haWw6IFN0cmluZywgZmlyc3ROYW1lOiBTdHJpbmcsIGxhc3ROYW1lOiBTdHJpbmcpOiBVc2VyXG4gIH1cbmA7XG5cblxuXG5cblxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIik7OyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInBnXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ0c2xvZ1wiKTs7IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL2Fwb2xsby1zZXJ2ZXIudHNcIik7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBT0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBTUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQUE7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFBQTtBQUVBO0FBeElBO0FBd0lBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQy9JQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTFCQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNGQTtBQVNBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUE5QkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2QkE7QUFLQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBS0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUFBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUFBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3pFQTtBQUVBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBMkNBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQy9DQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QSIsInNvdXJjZVJvb3QiOiIifQ==