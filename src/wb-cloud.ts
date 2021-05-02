import { ApolloServer } from "apollo-server-lambda";
import { resolvers } from "./resolvers";
import { typeDefs } from "./type-defs";
import { Logger } from "tslog";
import { DAL } from "./dal";

export const graphqlHandler = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  context: function(){
    return {
      dal: (new DAL()),
      wbCloud: (new WbCloud())
    }
  }
}).createHandler();

export const log: Logger = new Logger({
  minLevel: "debug"
});

class WbCloud {
  dal = new DAL();

  public async resetTestData() {
    var result = await this.dal.deleteTestTenants();
    if(!result.success) return result;
    result = await this.dal.deleteTestUsers();
    if(!result.success) return result;
    return result;
  }

  
  /**
   * Tenants 
   */

  public async tenants() {
    return this.dal.tenants();
  }

  public async tenantById(id: number) {
    return this.dal.tenantById(id);
  }

  public async tenantByName(name: string) {
    return this.dal.tenantByName(name);
  }

  public async createTenant(name: string, label: string) {
    return this.dal.createTenant(name, label);
  }

  public async updateTenant(id: number, name: string, label: string) {
    return this.dal.updateTenant(id, name, label);
  }

  public async deleteTestTenants() {
    return this.dal.deleteTestTenants();
  }


  /**
   * Tenant-User-Roles
   */

  public async addUserToTenant(tenantName: string, userEmail: string, tenantRole: string) {
    log.debug(`wbCloud.addUserToTenant: ${tenantName}, ${userEmail}, ${tenantRole}`);
    const userResult = await this.dal.userByEmail(userEmail);
    if(!userResult.success) return userResult;
    const tenantResult = await this.dal.tenantByName(tenantName);
    if(!tenantResult.success) return tenantResult;
    const roleResult = await this.dal.roleByName(tenantRole);
    if(!roleResult.success) return roleResult;
    const result = await this.dal.addUserToTenant(tenantResult.payload.id, userResult.payload.id, roleResult.payload.id);
    if(!result.success) return result;
    return userResult;
  }


  /**
   * Users 
   */

  public async usersByTenantId(tenantId: number) {
    return this.dal.usersByTenantId(tenantId);
  }

  public async userById(id: number) {
    return this.dal.userById(id);
  }

  public async userByEmail(email: string) {
    return this.dal.userByEmail(email);
  }

  public async createUser(email: string, firstName: string, lastName: string) {
    // TBD: authentication, save password
    return this.dal.createUser(email, firstName, lastName);
  }

  public async updateUser(id: number, email: string, firstName: string, lastName: string) {
    return this.dal.updateUser(id, email, firstName, lastName);
  }


  /**
   * Roles 
   */

  public async roleByName(name: string) {
    return this.dal.roleByName(name);
  }

  /**
   * Schemas 
   */

  public async createSchema(name: string, label: string, tenantOwnerId: number|null, tenantOwnerName: string|null, userOwnerId: number|null, userOwnerEmail: string|null) {
    var result;
    if(!tenantOwnerId && !userOwnerId){
      if(tenantOwnerName){
        result = await this.dal.tenantByName(tenantOwnerName);
        if(!result.success) return result;
        tenantOwnerId = result.payload.id;
      } else if (userOwnerEmail){
        result = await this.dal.userByEmail(userOwnerEmail);
        if(!result.success) return result;
        userOwnerId = result.payload.id;
      } else {
        return {
          success: false,
          message: "Owner could not be found"
        }
      }
    }
    return await this.dal.createSchema(name, label, tenantOwnerId, userOwnerId);
  }

}