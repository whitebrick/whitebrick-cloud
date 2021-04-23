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
    context: {
        dal: (new dal_1.DAL())
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
    executeQuery(query, inputs) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.pool.connect();
            try {
                apollo_server_1.log.debug(`executeQuery: ${query}`, inputs);
                const response = yield client.query(query, inputs);
                apollo_server_1.log.trace(response);
                return response;
            }
            catch (error) {
                apollo_server_1.log.error(error);
                return null;
            }
            finally {
                client.release();
            }
        });
    }
    getTenants() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM tenants";
            const inputs = [];
            const res = yield this.executeQuery(query, inputs);
            return Tenant_1.Tenant.parseResult(res);
        });
    }
    getTenantById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM tenants WHERE id=$1 LIMIT 1";
            const inputs = [id];
            const res = yield this.executeQuery(query, inputs);
            if (!res || res.rows.length == 0)
                return null;
            return Tenant_1.Tenant.parseResult(res)[0];
        });
    }
    createTenant(name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *";
            const inputs = [name, label, new Date(), new Date()];
            const res = yield this.executeQuery(query, inputs);
            if (!res || res.rows.length == 0)
                return null;
            return Tenant_1.Tenant.parseResult(res)[0];
        });
    }
    getTenantByName(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM tenant WHERE name=$1";
            const inputs = [name];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return res.rows[0];
            }
            else
                return res;
        });
    }
    getUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users";
            const inputs = [];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return res.rows;
            }
            else
                return res;
        });
    }
    getUserByName(firstName) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users WHERE first_name=$1";
            const inputs = [firstName];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return res.rows[0];
            }
            else
                return res;
        });
    }
    getUserByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users WHERE email=$1";
            const inputs = [email];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return res.rows[0];
            }
            else
                return res;
        });
    }
    getUserByTenantID(tenantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users WHERE tenant_id=$1";
            const inputs = [tenantId];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return res.rows;
            }
            else
                return res;
        });
    }
    getUsersByTenantName(tenant_name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "SELECT * FROM users RIGHT JOIN tenant ON users.tenant_id = tenant.id WHERE tenant.name=$1";
            const inputs = [tenant_name];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return res.rows;
            }
            else
                return res;
        });
    }
    createUser(tenant_id, email, first_name, last_name) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "INSERT INTO users(email, first_name, last_name, created_at, updated_at, tenant_id ) VALUES($1, $2, $3, $4, $5, $6) RETURNING *";
            const inputs = [email, first_name, last_name, new Date(), new Date(), tenant_id];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return true;
            }
            else
                return false;
        });
    }
    updateUser(id, email, first_name, last_name) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "UPDATE users SET ";
            if (email != null)
                query += ("email='" + email + "',");
            if (first_name != null)
                query += ("first_name='" + first_name + "',");
            if (last_name != null)
                query += ("last_name='" + last_name + "',");
            query += ("updated_at=$1 WHERE id=$2");
            const inputs = [new Date(), id];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                return true;
            }
            else
                return false;
        });
    }
    updateTenant(id, name, label) {
        return __awaiter(this, void 0, void 0, function* () {
            let query = "UPDATE tenant SET ";
            if (name != null)
                query += ("name='" + name + "',");
            if (label != null)
                query += ("label='" + label + "',");
            query += ("updated_at=$1 WHERE id=$2");
            const inputs = [new Date(), id];
            const res = yield this.executeQuery(query, inputs);
            if (res) {
                console.log(res);
                return true;
            }
            else
                return false;
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
            throw new Error('parseTenantArray: input is null');
        const tenants = Array();
        data.rows.forEach((row) => {
            tenants.push(Tenant.parse(row));
        });
        return tenants;
    }
    static parse(data) {
        if (!data)
            throw new Error('tenantParser: input is null');
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
exports.Users = void 0;
class Users {
}
exports.Users = Users;


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
const Tenant_1 = __webpack_require__(/*! ./entity/Tenant */ "./src/entity/Tenant.ts");
const User_1 = __webpack_require__(/*! ./entity/User */ "./src/entity/User.ts");
const dal_1 = __webpack_require__(/*! ./dal */ "./src/dal.ts");
function userParser(data) {
    const user = new User_1.Users();
    user.id = data.id;
    user.firstName = data.first_name;
    user.lastName = data.last_name;
    user.email = data.email;
    user.tenant = data.tenant_id;
    user.createdAt = data.created_at.toString();
    user.updatedAt = data.updated_at.toString();
    return user;
}
function userArrayParser(data) {
    const users = Array();
    data.forEach((elements) => {
        const user = new User_1.Users();
        user.id = elements.id;
        user.firstName = elements.first_name;
        user.lastName = elements.last_name;
        user.email = elements.email;
        user.createdAt = elements.created_at.toString();
        user.updatedAt = elements.updated_at.toString();
        user.tenant = elements.tenant_id;
        users.push(user);
    });
    return users;
}
function tenantParser(data) {
    const tenant = new Tenant_1.Tenant();
    tenant.name = data.name;
    tenant.label = data.label;
    tenant.createdAt = data.created_at.toString();
    tenant.updatedAt = data.updated_at.toString();
    tenant.id = data.id;
    return tenant;
}
function tenantArrayParser(data) {
    const tenants = Array();
    data.forEach((elements) => {
        tenants.push(elements);
    });
    return tenants;
}
exports.resolvers = {
    Query: {
        testMessage: () => 'Hello world',
        getTenants: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            return yield context.dal.getTenants();
        }),
        getTenantById: (_, { id }, context) => __awaiter(void 0, void 0, void 0, function* () {
            return yield context.dal.getTenantById(id);
        }),
        getTenantByName: (_, { name }) => __awaiter(void 0, void 0, void 0, function* () {
            const d = new dal_1.DAL();
            return tenantParser(yield d.getTenantByName(name));
        }),
        getUserByName: (_, { firstName }) => __awaiter(void 0, void 0, void 0, function* () {
            const d = new dal_1.DAL();
            return userParser(yield d.getUserByName(firstName));
        }),
        getUserByEmail: (_, { email }) => __awaiter(void 0, void 0, void 0, function* () {
            const d = new dal_1.DAL();
            return userParser(yield d.getUserByEmail(email));
        }),
        getUserByTenantID: (_, { tenantId }) => __awaiter(void 0, void 0, void 0, function* () {
            const d = new dal_1.DAL();
            return userArrayParser(yield d.getUserByTenantID(tenantId));
        }),
        getUsersByTenantName: (_, { tenant_name }) => __awaiter(void 0, void 0, void 0, function* () {
            const d = new dal_1.DAL();
            return userArrayParser(yield d.getUsersByTenantName(tenant_name));
        }),
        getUsers: () => __awaiter(void 0, void 0, void 0, function* () {
            const d = new dal_1.DAL();
            return userArrayParser(yield d.getUsers());
        })
    },
    Mutation: {
        createTenant: (_, { name, label }, context) => __awaiter(void 0, void 0, void 0, function* () {
            return yield context.dal.createTenant(name, label);
        }),
        updateTenant: (_, { id, name, label }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const dal = new dal_1.DAL();
                return dal.updateTenant(id, name, label);
            }
            catch (error) {
                console.log(error);
                return false;
            }
        }),
        createUser: (_, { tenant_id, email, first_name, last_name }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const dal = new dal_1.DAL();
                return dal.createUser(tenant_id, email, first_name, last_name);
            }
            catch (error) {
                console.log(error);
                return false;
            }
        }),
        updateUser: (_, { id, email, first_name, last_name }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const dal = new dal_1.DAL();
                return dal.updateUser(id, email, first_name, last_name);
            }
            catch (error) {
                console.log(error);
                return false;
            }
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
  type Query {
    testMessage: String!
    getTenants: [Tenant]
    getTenantById(id: ID!): Tenant
    getTenantByName(name: String!): Tenant
    getUserByName(firstName: String!): Users
    getUserByEmail(email:String):Users
    getUserByTenantID(tenantId:String):[Users]
    getUsersByTenantName(tenant_name:String):[Users]
    getUsers: [Users]
  }
  type Tenant{
    id:String,
    name:String,
    label:String,
    createdAt:String,
    updatedAt:String
  } 
  type Users{
    id: String,
    email: String,
    firstName : String,
    lastName : String,
    createdAt: String,
    updatedAt : String,
    tenant : String
  }
  type Mutation {
    createTenant(name:String!,label:String!): Tenant
    createUser(tenant_id:String,email:String!,first_name:String!,last_name:String!): Boolean
    updateTenant(id:String!,name:String,label:String):Boolean
    updateUser(id:String!, email:String, first_name:String, last_name:String):Boolean
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3JjL2Fwb2xsby1zZXJ2ZXIuanMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL2Fwb2xsby1zZXJ2ZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9kYWwudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnRpdHkvVGVuYW50LnRzIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvLi9zcmMvZW50aXR5L1VzZXIudHMiLCJ3ZWJwYWNrOi8vd2hpdGVicmljay1jbG91ZC8uL3NyYy9lbnZpcm9ubWVudC50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3Jlc29sdmVycy50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkLy4vc3JjL3R5cGUtZGVmcy50cyIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwiYXBvbGxvLXNlcnZlci1sYW1iZGFcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwicGdcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL2V4dGVybmFsIFwidHNsb2dcIiIsIndlYnBhY2s6Ly93aGl0ZWJyaWNrLWNsb3VkL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3doaXRlYnJpY2stY2xvdWQvd2VicGFjay9zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwb2xsb1NlcnZlciB9IGZyb20gJ2Fwb2xsby1zZXJ2ZXItbGFtYmRhJztcbmltcG9ydCB7IHJlc29sdmVycyB9IGZyb20gJy4vcmVzb2x2ZXJzJztcbmltcG9ydCB7IHRlc3RNdXRhdGlvbiwgdGVzdFF1ZXJ5IH0gZnJvbSAnLi90ZXN0aW5nL3Rlc3RpbmcnO1xuaW1wb3J0IHsgdHlwZURlZnMgfSBmcm9tICcuL3R5cGUtZGVmcyc7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwidHNsb2dcIjtcbmltcG9ydCB7IERBTCB9IGZyb20gXCIuL2RhbFwiO1xuXG5jb25zdCBhcG9sbG9TZXJ2ZXIgPSBuZXcgQXBvbGxvU2VydmVyKHtcbiAgdHlwZURlZnMsXG4gIHJlc29sdmVycyxcbiAgY29udGV4dDoge1xuICAgIGRhbDogKG5ldyBEQUwoKSlcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCBncmFwaHFsSGFuZGxlciA9IGFwb2xsb1NlcnZlci5jcmVhdGVIYW5kbGVyKCk7XG5cbmV4cG9ydCBjb25zdCBsb2c6IExvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICBtaW5MZXZlbDogXCJkZWJ1Z1wiXG59KTtcblxuLy8gVEVTVElORyBDT0RFXG4vLyB0ZXN0UXVlcnlcbi8vIHRlc3RNdXRhdGlvblxuIiwiaW1wb3J0IHsgZW52aXJvbm1lbnQgfSBmcm9tICcuL2Vudmlyb25tZW50JztcbmltcG9ydCB7IGxvZyB9IGZyb20gXCIuL2Fwb2xsby1zZXJ2ZXJcIjtcbmltcG9ydCB7IFBvb2wgfSBmcm9tICdwZyc7XG5pbXBvcnQgeyBUZW5hbnQgfSBmcm9tICcuL2VudGl0eS9UZW5hbnQnO1xuXG5leHBvcnQgY2xhc3MgREFMIHtcblxuICBwdWJsaWMgcG9vbDogUG9vbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBkYXRhYmFzZTogZW52aXJvbm1lbnQuZGJOYW1lLFxuICAgICAgaG9zdDogZW52aXJvbm1lbnQuZGJIb3N0LFxuICAgICAgcG9ydDogZW52aXJvbm1lbnQuZGJQb3J0LFxuICAgICAgdXNlcjogZW52aXJvbm1lbnQuZGJVc2VyLFxuICAgICAgcGFzc3dvcmQ6IGVudmlyb25tZW50LmRiUGFzc3dvcmQsXG4gICAgICBtYXg6IGVudmlyb25tZW50LmRiUG9vbE1heCxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBlbnZpcm9ubWVudC5kYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpcyxcbiAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnkocXVlcnk6IHN0cmluZywgaW5wdXRzOiBbYW55XSkge1xuICAgIGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMucG9vbC5jb25uZWN0KCk7XG4gICAgdHJ5IHtcbiAgICAgIGxvZy5kZWJ1ZyhgZXhlY3V0ZVF1ZXJ5OiAke3F1ZXJ5fWAsIGlucHV0cyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5xdWVyeShxdWVyeSwgaW5wdXRzKTtcbiAgICAgIGxvZy50cmFjZShyZXNwb25zZSk7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZy5lcnJvcihlcnJvcik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgICB9XG4gIH1cblxuICBcblxuICBwdWJsaWMgYXN5bmMgZ2V0VGVuYW50cygpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiU0VMRUNUICogRlJPTSB0ZW5hbnRzXCI7XG4gICAgY29uc3QgaW5wdXRzOiBhbnkgPSBbXTtcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgaW5wdXRzKTtcbiAgICByZXR1cm4gVGVuYW50LnBhcnNlUmVzdWx0KHJlcylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRUZW5hbnRCeUlkKGlkOiBudW1iZXIpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiU0VMRUNUICogRlJPTSB0ZW5hbnRzIFdIRVJFIGlkPSQxIExJTUlUIDFcIjtcbiAgICBjb25zdCBpbnB1dHM6IGFueSA9IFtpZF07XG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIGlucHV0cyk7XG4gICAgaWYoIXJlcyB8fCByZXMucm93cy5sZW5ndGggPT0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIFRlbmFudC5wYXJzZVJlc3VsdChyZXMpWzBdO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVRlbmFudChuYW1lOiBTdHJpbmcsIGxhYmVsOiBTdHJpbmcpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiSU5TRVJUIElOVE8gdGVuYW50cyhuYW1lLCBsYWJlbCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0KSBSRVRVUk5JTkcgKlwiO1xuICAgIGNvbnN0IGlucHV0czogYW55ID0gW25hbWUsIGxhYmVsLCBuZXcgRGF0ZSgpLCBuZXcgRGF0ZSgpXTtcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgaW5wdXRzKTtcbiAgICBpZighcmVzIHx8IHJlcy5yb3dzLmxlbmd0aCA9PSAwKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gVGVuYW50LnBhcnNlUmVzdWx0KHJlcylbMF07XG4gIH1cblxuICAvLyBwdWJsaWMgYXN5bmMgZ2V0VGVuYW50QnlJZChpZDogU3RyaW5nKSB7XG4gIC8vICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gdGVuYW50IFdIRVJFIGlkPSQxXCI7XG4gIC8vICAgY29uc3QgaW5wdXRzOiBhbnkgPSBbaWRdXG4gIC8vICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIGlucHV0cyk7XG4gIC8vICAgaWYgKHJlcykge1xuICAvLyAgICAgcmV0dXJuIHJlcy5yb3dzWzBdO1xuICAvLyAgIH1cbiAgLy8gICBlbHNlXG4gIC8vICAgICByZXR1cm4gcmVzXG4gIC8vIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VGVuYW50QnlOYW1lKG5hbWU6IFN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHRlbmFudCBXSEVSRSBuYW1lPSQxXCI7XG4gICAgY29uc3QgaW5wdXRzOiBhbnkgPSBbbmFtZV1cbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgaW5wdXRzKTtcbiAgICBpZiAocmVzKSB7XG4gICAgICByZXR1cm4gcmVzLnJvd3NbMF07XG4gICAgfVxuICAgIGVsc2VcbiAgICAgIHJldHVybiByZXNcbiAgfVxuXG4gIFxuXG5cbiAgLy8gcHVibGljIGFzeW5jIGdldFRlbmFudHMoKSB7XG4gIC8vICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gdGVuYW50c1wiO1xuICAvLyAgIGNvbnN0IGlucHV0czogYW55ID0gW11cbiAgLy8gICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeShxdWVyeSwgaW5wdXRzKTtcbiAgLy8gICBpZiAocmVzKSB7XG4gIC8vICAgICByZXR1cm4gcmVzLnJvd3M7XG4gIC8vICAgfVxuICAvLyAgIGVsc2VcbiAgLy8gICAgIHJldHVybiByZXNcbiAgLy8gfVxuXG5cblxuICBwdWJsaWMgYXN5bmMgZ2V0VXNlcnMoKSB7XG4gICAgY29uc3QgcXVlcnkgPSBcIlNFTEVDVCAqIEZST00gdXNlcnNcIjtcbiAgICBjb25zdCBpbnB1dHM6IGFueSA9IFtdXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIGlucHV0cyk7XG4gICAgaWYgKHJlcykge1xuICAgICAgcmV0dXJuIHJlcy5yb3dzO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VXNlckJ5TmFtZShmaXJzdE5hbWU6IFN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGZpcnN0X25hbWU9JDFcIjtcbiAgICBjb25zdCBpbnB1dHM6IGFueSA9IFtmaXJzdE5hbWVdXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIGlucHV0cyk7XG4gICAgaWYgKHJlcykge1xuICAgICAgcmV0dXJuIHJlcy5yb3dzWzBdO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VXNlckJ5RW1haWwoZW1haWw6IFN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGVtYWlsPSQxXCI7XG4gICAgY29uc3QgaW5wdXRzOiBhbnkgPSBbZW1haWxdXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnkocXVlcnksIGlucHV0cyk7XG4gICAgaWYgKHJlcykge1xuICAgICAgcmV0dXJuIHJlcy5yb3dzWzBdO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VXNlckJ5VGVuYW50SUQodGVuYW50SWQ6IFN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIHRlbmFudF9pZD0kMVwiO1xuICAgIGNvbnN0IGlucHV0czogYW55ID0gW3RlbmFudElkXVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBpbnB1dHMpO1xuICAgIGlmIChyZXMpIHtcbiAgICAgIHJldHVybiByZXMucm93cztcbiAgICB9XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHJlc1xuICB9XG5cblxuICBwdWJsaWMgYXN5bmMgZ2V0VXNlcnNCeVRlbmFudE5hbWUodGVuYW50X25hbWU6IFN0cmluZykge1xuICAgIGNvbnN0IHF1ZXJ5ID0gXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFJJR0hUIEpPSU4gdGVuYW50IE9OIHVzZXJzLnRlbmFudF9pZCA9IHRlbmFudC5pZCBXSEVSRSB0ZW5hbnQubmFtZT0kMVwiO1xuICAgIGNvbnN0IGlucHV0czogYW55ID0gW3RlbmFudF9uYW1lXVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBpbnB1dHMpO1xuICAgIGlmIChyZXMpIHtcbiAgICAgIHJldHVybiByZXMucm93cztcbiAgICB9XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGNyZWF0ZVVzZXIodGVuYW50X2lkOiBTdHJpbmcsIGVtYWlsOiBTdHJpbmcsIGZpcnN0X25hbWU6IFN0cmluZywgbGFzdF9uYW1lOiBTdHJpbmcpIHtcbiAgICBjb25zdCBxdWVyeSA9IFwiSU5TRVJUIElOVE8gdXNlcnMoZW1haWwsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdCwgdGVuYW50X2lkICkgVkFMVUVTKCQxLCAkMiwgJDMsICQ0LCAkNSwgJDYpIFJFVFVSTklORyAqXCI7XG4gICAgY29uc3QgaW5wdXRzOiBhbnkgPSBbZW1haWwsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSwgbmV3IERhdGUoKSwgbmV3IERhdGUoKSwgdGVuYW50X2lkXVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBpbnB1dHMpO1xuICAgIGlmIChyZXMpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVVc2VyKGlkOiBTdHJpbmcsIGVtYWlsOiBTdHJpbmcsIGZpcnN0X25hbWU6IFN0cmluZywgbGFzdF9uYW1lOiBTdHJpbmcpIHtcbiAgICBsZXQgcXVlcnkgPSBcIlVQREFURSB1c2VycyBTRVQgXCI7XG4gICAgaWYgKGVtYWlsICE9IG51bGwpXG4gICAgICBxdWVyeSArPSAoXCJlbWFpbD0nXCIgKyBlbWFpbCArIFwiJyxcIilcblxuICAgIGlmIChmaXJzdF9uYW1lICE9IG51bGwpXG4gICAgICBxdWVyeSArPSAoXCJmaXJzdF9uYW1lPSdcIiArIGZpcnN0X25hbWUgKyBcIicsXCIpXG5cbiAgICBpZiAobGFzdF9uYW1lICE9IG51bGwpXG4gICAgICBxdWVyeSArPSAoXCJsYXN0X25hbWU9J1wiICsgbGFzdF9uYW1lICsgXCInLFwiKVxuXG4gICAgcXVlcnkgKz0gKFwidXBkYXRlZF9hdD0kMSBXSEVSRSBpZD0kMlwiKVxuICAgIGNvbnN0IGlucHV0czogYW55ID0gW25ldyBEYXRlKCksIGlkXVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBpbnB1dHMpO1xuICAgIGlmIChyZXMpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyB1cGRhdGVUZW5hbnQoaWQ6IFN0cmluZywgbmFtZTogU3RyaW5nLCBsYWJlbDogU3RyaW5nKSB7XG4gICAgbGV0IHF1ZXJ5ID0gXCJVUERBVEUgdGVuYW50IFNFVCBcIjtcbiAgICBpZiAobmFtZSAhPSBudWxsKVxuICAgICAgcXVlcnkgKz0gKFwibmFtZT0nXCIgKyBuYW1lICsgXCInLFwiKVxuXG4gICAgaWYgKGxhYmVsICE9IG51bGwpXG4gICAgICBxdWVyeSArPSAoXCJsYWJlbD0nXCIgKyBsYWJlbCArIFwiJyxcIilcblxuICAgIHF1ZXJ5ICs9IChcInVwZGF0ZWRfYXQ9JDEgV0hFUkUgaWQ9JDJcIilcblxuICAgIGNvbnN0IGlucHV0czogYW55ID0gW25ldyBEYXRlKCksIGlkXVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5KHF1ZXJ5LCBpbnB1dHMpO1xuICAgIGlmIChyZXMpIHtcbiAgICAgIGNvbnNvbGUubG9nKHJlcyk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogTWV0aG9kcyBoZXJlIGZvciBDUlVEIGFjY2VzcyB0byBEQiByZWNvcmRzIC0gcmVuYW1lIHRvIGJlc3QgcHJhY3Rpc2VzXG4gICAqIFxuICAgKiBnZXRUZW5hbnRCeU5hbWUoaWQpIC0gZWcgU0VMRUNUICogRlJPTSB0ZW5hbnRzIFdIRVJFIGlkPT9cbiAgICogZ2V0VGVuYW50QnlJZChuYW1lKSAtIGVnIFNFTEVDVCAqIEZST00gdGVuYW50cyBXSEVSRSBuYW1lPT9cbiAgICogZ2V0VGVuYW50cyAtIGVnIFNFTEVDVCAqIEZST00gdGVuYW50cz9cbiAgICogY3JlYXRlVGVuYW50KG5hbWUsIGxhYmVsKSAtIGVnIElOU0VSVCBJTlRPIHRlbmFudHMgKG5hbWUsIGxhYmVsKSBWQUxVRVMgKD8sPylcbiAgICogdXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbCkgLSBlZyBVUERBVEUgdGVuYW50cyBTRVQobmFtZT0/LCBsYWJlbD0/LCB1cGRhdGVkX2F0PShub3coKSBhdCB0aW1lIHpvbmUgJ3V0YycpKSBXSEVSRSBpZD0/XG4gICAqIC0gaXQgd291bGQgYmUgbmljZSB0byBvbmx5IHVwZGF0ZSB0aGUgc3VwcGxpZWQgY29sdW1uc1xuICAgKiBcbiAgICogZ2V0VXNlckJ5TmFtZShpZCkgLSBlZyBTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGlkPT9cbiAgICogZ2V0VXNlckJ5RW1haWwoZW1haWwpIC0gZWcgU0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSBlbWFpbD0/XG4gICAqIGdldFVzZXJzQnlUZW5hbnRJZChpZCkgLSBlZyBTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIHRlbmFudF9pZD0/XG4gICAqIGdldFVzZXJzQnlUZW5hbnROYW1lKG5hbWUpIC0gZWcgU0VMRUNUICogRlJPTSB1c2VycyBKT0lOIHRlbmFudHMgT04gdXNlcnMudGVuYW50X2lkPXRlbmFudHMuaWQgV0hFUkUgdGVuYW50cy5uYW1lPT9cbiAgICogXG4gICAqIGNyZWF0ZVVzZXIodGVuYW50X2lkLCBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lKSAtIGVnIElOU0VSVCBJTlRPIHRlbmFudHMgKHRlbmFudF9pZCwgZW1haWwsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSkgVkFMVUVTICg/LD8sPyw/KVxuICAgKiB1cGRhdGVVc2VyKGlkLCB0ZW5hbnRfaWQsIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWUpIC0gZWcgVVBEQVRFIHRlbmFudHMgU0VUKHRlbmFudF9pZD0/LCBlbWFpbD0/LCBmaXJzdF9uYW1lPT8sIGxhc3RfbmFtZT0/LCB1cGRhdGVkX2F0PShub3coKSBhdCB0aW1lIHpvbmUgJ3V0YycpKSBXSEVSRSBpZD0/XG4gICAqIC0gaXQgd291bGQgYmUgbmljZSB0byBvbmx5IHVwZGF0ZSB0aGUgc3VwcGxpZWQgY29sdW1uc1xuICAgKi9cblxufTsiLCJpbXBvcnQgeyBRdWVyeVJlc3VsdCB9IGZyb20gXCJwZ1wiO1xuXG5leHBvcnQgY2xhc3MgVGVuYW50IHtcbiAgaWQhOiBTdHJpbmc7XG4gIG5hbWUhOiBTdHJpbmc7XG4gIGxhYmVsITogU3RyaW5nO1xuICBjcmVhdGVkQXQhOiBEYXRlO1xuICB1cGRhdGVkQXQhOiBEYXRlO1xuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2VSZXN1bHQoZGF0YTogUXVlcnlSZXN1bHQgfCBudWxsKSB7XG4gICAgaWYgKCFkYXRhKSB0aHJvdyBuZXcgRXJyb3IoJ3BhcnNlVGVuYW50QXJyYXk6IGlucHV0IGlzIG51bGwnKTtcbiAgICBjb25zdCB0ZW5hbnRzID0gQXJyYXk8VGVuYW50PigpO1xuICAgIGRhdGEucm93cy5mb3JFYWNoKChyb3c6IGFueSkgPT4ge1xuICAgICAgdGVuYW50cy5wdXNoKFRlbmFudC5wYXJzZShyb3cpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGVuYW50cztcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcGFyc2UoZGF0YTogYW55KTogVGVuYW50IHtcbiAgICBpZiAoIWRhdGEpIHRocm93IG5ldyBFcnJvcigndGVuYW50UGFyc2VyOiBpbnB1dCBpcyBudWxsJyk7XG4gICAgY29uc3QgdGVuYW50ID0gbmV3IFRlbmFudCgpO1xuICAgIHRlbmFudC5uYW1lID0gZGF0YS5uYW1lO1xuICAgIHRlbmFudC5sYWJlbCA9IGRhdGEubGFiZWw7XG4gICAgdGVuYW50LmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdC50b1N0cmluZygpO1xuICAgIHRlbmFudC51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQudG9TdHJpbmcoKTtcbiAgICB0ZW5hbnQuaWQgPSBkYXRhLmlkO1xuICAgIHJldHVybiB0ZW5hbnQ7XG4gIH1cbn0iLCJleHBvcnQgY2xhc3MgVXNlcnMge1xuICBpZCE6IFN0cmluZztcbiAgdGVuYW50ITogU3RyaW5nO1xuICBlbWFpbCE6IFN0cmluZztcbiAgZmlyc3ROYW1lITogU3RyaW5nO1xuICBsYXN0TmFtZSE6IFN0cmluZztcbiAgY3JlYXRlZEF0ITogRGF0ZTtcbiAgdXBkYXRlZEF0ITogRGF0ZTtcbn0iLCJ0eXBlIEVudmlyb25tZW50ID0ge1xuICBzZWNyZXRNZXNzYWdlOiBzdHJpbmc7XG4gIGRiTmFtZTogc3RyaW5nLFxuICBkYkhvc3Q6IHN0cmluZyxcbiAgZGJQb3J0OiBudW1iZXIsXG4gIGRiVXNlcjogc3RyaW5nLFxuICBkYlBhc3N3b3JkOiBzdHJpbmcsXG4gIGRiUG9vbE1heDogbnVtYmVyLFxuICBkYlBvb2xJZGxlVGltZW91dE1pbGxpczogbnVtYmVyLFxuICBkYlBvb2xDb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyLFxufTtcblxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50OiBFbnZpcm9ubWVudCA9IHtcbiAgc2VjcmV0TWVzc2FnZTogcHJvY2Vzcy5lbnYuU0VDUkVUX01FU1NBR0UgYXMgc3RyaW5nLFxuICBkYk5hbWU6IHByb2Nlc3MuZW52LkRCX05BTUUgYXMgc3RyaW5nLFxuICBkYkhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgYXMgc3RyaW5nLFxuICBkYlBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgJycpIGFzIG51bWJlcixcbiAgZGJVc2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIGFzIHN0cmluZyxcbiAgZGJQYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgYXMgc3RyaW5nLFxuICBkYlBvb2xNYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8ICcnKSBhcyBudW1iZXIsXG4gIGRiUG9vbElkbGVUaW1lb3V0TWlsbGlzOiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX0lETEVfVElNRU9VVF9NSUxMSVMgfHwgJycpIGFzIG51bWJlcixcbiAgZGJQb29sQ29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfQ09OTkVDVElPTl9USU1FT1VUX01JTExJUyB8fCAnJykgYXMgbnVtYmVyLFxufTtcblxuIiwiaW1wb3J0IHsgSVJlc29sdmVycyB9IGZyb20gXCJhcG9sbG8tc2VydmVyLWxhbWJkYVwiO1xuLy8gaW1wb3J0IFwicmVmbGVjdC1tZXRhZGF0YVwiO1xuaW1wb3J0IHsgVGVuYW50IH0gZnJvbSBcIi4vZW50aXR5L1RlbmFudFwiO1xuaW1wb3J0IHsgVXNlcnMgfSBmcm9tIFwiLi9lbnRpdHkvVXNlclwiO1xuaW1wb3J0IHsgREFMIH0gZnJvbSBcIi4vZGFsXCI7XG5cbmZ1bmN0aW9uIHVzZXJQYXJzZXIoZGF0YTogYW55KSB7XG4gIGNvbnN0IHVzZXIgPSBuZXcgVXNlcnMoKTtcbiAgdXNlci5pZCA9IGRhdGEuaWQ7XG4gIHVzZXIuZmlyc3ROYW1lID0gZGF0YS5maXJzdF9uYW1lO1xuICB1c2VyLmxhc3ROYW1lID0gZGF0YS5sYXN0X25hbWU7XG4gIHVzZXIuZW1haWwgPSBkYXRhLmVtYWlsO1xuICB1c2VyLnRlbmFudCA9IGRhdGEudGVuYW50X2lkO1xuICB1c2VyLmNyZWF0ZWRBdCA9IGRhdGEuY3JlYXRlZF9hdC50b1N0cmluZygpO1xuICB1c2VyLnVwZGF0ZWRBdCA9IGRhdGEudXBkYXRlZF9hdC50b1N0cmluZygpO1xuICByZXR1cm4gdXNlcjtcbn1cblxuZnVuY3Rpb24gdXNlckFycmF5UGFyc2VyKGRhdGE6IGFueSkge1xuICBjb25zdCB1c2VycyA9IEFycmF5PFVzZXJzPigpO1xuXG4gIGRhdGEuZm9yRWFjaCgoZWxlbWVudHM6IGFueSkgPT4ge1xuICAgIGNvbnN0IHVzZXIgPSBuZXcgVXNlcnMoKTtcbiAgICB1c2VyLmlkID0gZWxlbWVudHMuaWQ7XG4gICAgdXNlci5maXJzdE5hbWUgPSBlbGVtZW50cy5maXJzdF9uYW1lO1xuICAgIHVzZXIubGFzdE5hbWUgPSBlbGVtZW50cy5sYXN0X25hbWU7XG4gICAgdXNlci5lbWFpbCA9IGVsZW1lbnRzLmVtYWlsO1xuICAgIHVzZXIuY3JlYXRlZEF0ID0gZWxlbWVudHMuY3JlYXRlZF9hdC50b1N0cmluZygpO1xuICAgIHVzZXIudXBkYXRlZEF0ID0gZWxlbWVudHMudXBkYXRlZF9hdC50b1N0cmluZygpO1xuICAgIHVzZXIudGVuYW50ID0gZWxlbWVudHMudGVuYW50X2lkO1xuICAgIHVzZXJzLnB1c2godXNlcik7XG4gIH0pXG4gIHJldHVybiB1c2Vycztcbn1cblxuZnVuY3Rpb24gdGVuYW50UGFyc2VyKGRhdGE6IGFueSkge1xuICBjb25zdCB0ZW5hbnQgPSBuZXcgVGVuYW50KCk7XG4gIHRlbmFudC5uYW1lID0gZGF0YS5uYW1lO1xuICB0ZW5hbnQubGFiZWwgPSBkYXRhLmxhYmVsO1xuICB0ZW5hbnQuY3JlYXRlZEF0ID0gZGF0YS5jcmVhdGVkX2F0LnRvU3RyaW5nKCk7XG4gIHRlbmFudC51cGRhdGVkQXQgPSBkYXRhLnVwZGF0ZWRfYXQudG9TdHJpbmcoKTtcbiAgdGVuYW50LmlkID0gZGF0YS5pZDtcbiAgcmV0dXJuIHRlbmFudDtcbn1cblxuZnVuY3Rpb24gdGVuYW50QXJyYXlQYXJzZXIoZGF0YTogYW55KSB7XG4gIGNvbnN0IHRlbmFudHMgPSBBcnJheTxUZW5hbnQ+KCk7XG4gIGRhdGEuZm9yRWFjaCgoZWxlbWVudHM6IGFueSkgPT4ge1xuICAgIC8vIGNvbnN0IHRlbmFudCA9IG5ldyBUZW5hbnQoKTtcbiAgICAvLyB0ZW5hbnQubmFtZSA9IGVsZW1lbnRzLm5hbWU7XG4gICAgLy8gdGVuYW50LmxhYmVsID0gZWxlbWVudHMubGFiZWw7XG4gICAgLy8gdGVuYW50LmNyZWF0ZWRBdCA9IGVsZW1lbnRzLmNyZWF0ZWRfYXQudG9TdHJpbmcoKTtcbiAgICAvLyB0ZW5hbnQudXBkYXRlZEF0ID0gZWxlbWVudHMudXBkYXRlZF9hdC50b1N0cmluZygpO1xuICAgIC8vIHRlbmFudC5pZCA9IGVsZW1lbnRzLmlkO1xuICAgIHRlbmFudHMucHVzaChlbGVtZW50cyk7XG4gIH0pXG4gIHJldHVybiB0ZW5hbnRzO1xufVxuXG5leHBvcnQgY29uc3QgcmVzb2x2ZXJzOiBJUmVzb2x2ZXJzID0ge1xuICBRdWVyeToge1xuICAgIHRlc3RNZXNzYWdlOiAoKSA9PiAnSGVsbG8gd29ybGQnLFxuXG4gICAgZ2V0VGVuYW50czogYXN5bmMgKF8sIF9fLCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gYXdhaXQgY29udGV4dC5kYWwuZ2V0VGVuYW50cygpO1xuICAgIH0sXG5cbiAgICBnZXRUZW5hbnRCeUlkOiBhc3luYyAoXywgeyBpZCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICByZXR1cm4gYXdhaXQgY29udGV4dC5kYWwuZ2V0VGVuYW50QnlJZChpZCk7XG4gICAgfSxcblxuICAgIGdldFRlbmFudEJ5TmFtZTogYXN5bmMgKF8sIHsgbmFtZSB9KSA9PiB7XG4gICAgICBjb25zdCBkID0gbmV3IERBTCgpO1xuICAgICAgcmV0dXJuIHRlbmFudFBhcnNlcihhd2FpdCBkLmdldFRlbmFudEJ5TmFtZShuYW1lKSk7XG4gICAgfSxcblxuICAgIGdldFVzZXJCeU5hbWU6IGFzeW5jIChfLCB7IGZpcnN0TmFtZSB9KSA9PiB7XG4gICAgICBjb25zdCBkID0gbmV3IERBTCgpO1xuICAgICAgcmV0dXJuIHVzZXJQYXJzZXIoYXdhaXQgZC5nZXRVc2VyQnlOYW1lKGZpcnN0TmFtZSkpO1xuICAgIH0sXG5cbiAgICBnZXRVc2VyQnlFbWFpbDogYXN5bmMgKF8sIHsgZW1haWwgfSkgPT4ge1xuICAgICAgY29uc3QgZCA9IG5ldyBEQUwoKTtcbiAgICAgIHJldHVybiB1c2VyUGFyc2VyKGF3YWl0IGQuZ2V0VXNlckJ5RW1haWwoZW1haWwpKTtcbiAgICB9LFxuXG4gICAgZ2V0VXNlckJ5VGVuYW50SUQ6IGFzeW5jIChfLCB7IHRlbmFudElkIH0pID0+IHtcbiAgICAgIGNvbnN0IGQgPSBuZXcgREFMKCk7XG4gICAgICByZXR1cm4gdXNlckFycmF5UGFyc2VyKGF3YWl0IGQuZ2V0VXNlckJ5VGVuYW50SUQodGVuYW50SWQpKTtcbiAgICB9LFxuXG4gICAgZ2V0VXNlcnNCeVRlbmFudE5hbWU6IGFzeW5jIChfLCB7IHRlbmFudF9uYW1lIH0pID0+IHtcblxuICAgICAgY29uc3QgZCA9IG5ldyBEQUwoKTtcbiAgICAgIHJldHVybiB1c2VyQXJyYXlQYXJzZXIoYXdhaXQgZC5nZXRVc2Vyc0J5VGVuYW50TmFtZSh0ZW5hbnRfbmFtZSkpO1xuXG4gICAgfSxcblxuICAgIGdldFVzZXJzOiBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBkID0gbmV3IERBTCgpO1xuICAgICAgcmV0dXJuIHVzZXJBcnJheVBhcnNlcihhd2FpdCBkLmdldFVzZXJzKCkpO1xuICAgIH1cbiAgfSxcblxuXG4gIE11dGF0aW9uOiB7XG4gICAgY3JlYXRlVGVuYW50OiBhc3luYyAoXywgeyBuYW1lLCBsYWJlbCB9OiBhbnksIGNvbnRleHQpID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCBjb250ZXh0LmRhbC5jcmVhdGVUZW5hbnQobmFtZSwgbGFiZWwpO1xuICAgIH0sXG5cbiAgICB1cGRhdGVUZW5hbnQ6IGFzeW5jIChfLCB7IGlkLCBuYW1lLCBsYWJlbCB9OiBhbnkpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRhbCA9IG5ldyBEQUwoKTtcbiAgICAgICAgcmV0dXJuIGRhbC51cGRhdGVUZW5hbnQoaWQsIG5hbWUsIGxhYmVsKTtcbiAgICAgIH1cbiAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmxvZyhlcnJvcik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgY3JlYXRlVXNlcjogYXN5bmMgKF8sIHsgdGVuYW50X2lkLCBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lIH06IGFueSkgPT4ge1xuICAgICAgdHJ5IHtcblxuICAgICAgICBjb25zdCBkYWwgPSBuZXcgREFMKCk7XG4gICAgICAgIHJldHVybiBkYWwuY3JlYXRlVXNlcih0ZW5hbnRfaWQsIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWUpO1xuXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmxvZyhlcnJvcik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBkYXRlVXNlcjogYXN5bmMgKF8sIHsgaWQsIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWUgfSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGFsID0gbmV3IERBTCgpO1xuICAgICAgICByZXR1cm4gZGFsLnVwZGF0ZVVzZXIoaWQsIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWUpO1xuXG4gICAgICB9XG4gICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG5cbiAgLyoqXG4gICAqIHJlc29sdmVycyBoZXJlIGZvciBDUlVEIGFjY2VzcyB0byBEQiByZWNvcmRzIC0gcmVuYW1lIHRvIGJlc3QgcHJhY3Rpc2VzIC0gc2VlIGRhbC50c1xuICAgKiBcbiAgICogZ2V0VGVuYW50QnlOYW1lKGlkKVxuICAgKiBnZXRUZW5hbnRCeUlkKG5hbWUpXG4gICAqIGdldFRlbmFudHNcbiAgICogY3JlYXRlVGVuYW50KG5hbWUsIGxhYmVsKSBcbiAgICogdXBkYXRlVGVuYW50KGlkLCBuYW1lLCBsYWJlbClcbiAgICogXG4gICAqIGdldFVzZXJCeU5hbWUoaWQpXG4gICAqIGdldFVzZXJCeUVtYWlsKGVtYWlsKVxuICAgKiBnZXRVc2Vyc0J5VGVuYW50SWQoaWQpXG4gICAqIGdldFVzZXJzQnlUZW5hbnROYW1lKG5hbWUpXG4gICAqIGdldFVzZXJzXG4gICAqIGNyZWF0ZVVzZXIodGVuYW50X2lkLCBlbWFpbCwgZmlyc3RfbmFtZSwgbGFzdF9uYW1lKVxuICAgKiB1cGRhdGVVc2VyKGlkLCB0ZW5hbnRfaWQsIGVtYWlsLCBmaXJzdF9uYW1lLCBsYXN0X25hbWUpXG4gICAqL1xuXG5cblxufTsiLCJpbXBvcnQgeyBncWwgfSBmcm9tICdhcG9sbG8tc2VydmVyLWxhbWJkYSc7XG5cbmV4cG9ydCBjb25zdCB0eXBlRGVmcyA9IGdxbGBcbiAgdHlwZSBRdWVyeSB7XG4gICAgdGVzdE1lc3NhZ2U6IFN0cmluZyFcbiAgICBnZXRUZW5hbnRzOiBbVGVuYW50XVxuICAgIGdldFRlbmFudEJ5SWQoaWQ6IElEISk6IFRlbmFudFxuICAgIGdldFRlbmFudEJ5TmFtZShuYW1lOiBTdHJpbmchKTogVGVuYW50XG4gICAgZ2V0VXNlckJ5TmFtZShmaXJzdE5hbWU6IFN0cmluZyEpOiBVc2Vyc1xuICAgIGdldFVzZXJCeUVtYWlsKGVtYWlsOlN0cmluZyk6VXNlcnNcbiAgICBnZXRVc2VyQnlUZW5hbnRJRCh0ZW5hbnRJZDpTdHJpbmcpOltVc2Vyc11cbiAgICBnZXRVc2Vyc0J5VGVuYW50TmFtZSh0ZW5hbnRfbmFtZTpTdHJpbmcpOltVc2Vyc11cbiAgICBnZXRVc2VyczogW1VzZXJzXVxuICB9XG4gIHR5cGUgVGVuYW50e1xuICAgIGlkOlN0cmluZyxcbiAgICBuYW1lOlN0cmluZyxcbiAgICBsYWJlbDpTdHJpbmcsXG4gICAgY3JlYXRlZEF0OlN0cmluZyxcbiAgICB1cGRhdGVkQXQ6U3RyaW5nXG4gIH0gXG4gIHR5cGUgVXNlcnN7XG4gICAgaWQ6IFN0cmluZyxcbiAgICBlbWFpbDogU3RyaW5nLFxuICAgIGZpcnN0TmFtZSA6IFN0cmluZyxcbiAgICBsYXN0TmFtZSA6IFN0cmluZyxcbiAgICBjcmVhdGVkQXQ6IFN0cmluZyxcbiAgICB1cGRhdGVkQXQgOiBTdHJpbmcsXG4gICAgdGVuYW50IDogU3RyaW5nXG4gIH1cbiAgdHlwZSBNdXRhdGlvbiB7XG4gICAgY3JlYXRlVGVuYW50KG5hbWU6U3RyaW5nISxsYWJlbDpTdHJpbmchKTogVGVuYW50XG4gICAgY3JlYXRlVXNlcih0ZW5hbnRfaWQ6U3RyaW5nLGVtYWlsOlN0cmluZyEsZmlyc3RfbmFtZTpTdHJpbmchLGxhc3RfbmFtZTpTdHJpbmchKTogQm9vbGVhblxuICAgIHVwZGF0ZVRlbmFudChpZDpTdHJpbmchLG5hbWU6U3RyaW5nLGxhYmVsOlN0cmluZyk6Qm9vbGVhblxuICAgIHVwZGF0ZVVzZXIoaWQ6U3RyaW5nISwgZW1haWw6U3RyaW5nLCBmaXJzdF9uYW1lOlN0cmluZywgbGFzdF9uYW1lOlN0cmluZyk6Qm9vbGVhblxuICB9XG5gO1xuXG5cblxuXG5cbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImFwb2xsby1zZXJ2ZXItbGFtYmRhXCIpOzsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJwZ1wiKTs7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwidHNsb2dcIik7OyIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIvLyBzdGFydHVwXG4vLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbi8vIFRoaXMgZW50cnkgbW9kdWxlIGlzIHJlZmVyZW5jZWQgYnkgb3RoZXIgbW9kdWxlcyBzbyBpdCBjYW4ndCBiZSBpbmxpbmVkXG52YXIgX193ZWJwYWNrX2V4cG9ydHNfXyA9IF9fd2VicGFja19yZXF1aXJlX18oXCIuL3NyYy9hcG9sbG8tc2VydmVyLnRzXCIpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUlBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQUE7QUFDQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBO0FBQ0E7QUFDQTtBQUFBO0FBYUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQWtCQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBRUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBR0E7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFBQTtBQUVBOztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQUE7QUFFQTs7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUE7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUFBO0FBc0JBO0FBL05BO0FBK05BO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3BPQTtBQU9BO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQTFCQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7QUNKQTtBQVFBO0FBUkE7QUFDQTtBQUNBO0E7Ozs7Ozs7Ozs7O0FDVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN0QkE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQU9BO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFFQTtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdUJBO0FBQ0E7QUFDQTtBOzs7Ozs7Ozs7OztBQ3pLQTtBQUVBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBa0NBO0FBQ0E7QUFDQTtBOzs7Ozs7OztBQ3RDQTtBQUNBO0E7Ozs7Ozs7O0FDREE7QUFDQTtBOzs7Ozs7OztBQ0RBO0FBQ0E7QTs7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QSIsInNvdXJjZVJvb3QiOiIifQ==