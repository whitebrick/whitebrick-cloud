import { ApolloServer } from 'apollo-server-lambda';
import { resolvers } from './resolvers';
import { typeDefs } from './type-defs';
import { Logger } from "tslog";
import { DAL } from "./dal";
import { User } from './entity/User';

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
    log.debug(`wbCloud.resetTestData()`)
    const result = await this.dal.deleteTestUsers();
    return result
  }


  public async createUser(email: string, firstName: string, lastName: string) {
    log.debug(`wbCloud.createUser ${email}`)
    // TBD: authentication, save password
    const result = await this.dal.createUser(email, firstName, lastName);
    return result
  }

  public async addUserToTenant(tenantName: string, userEmail: string, tenantRole: string) {
    log.debug(`wbCloud.addUserToTenant ${tenantName} ${userEmail} ${tenantRole}`)
    const userResult = await this.dal.userByEmail(userEmail);
    if(!userResult.success) return userResult
    const tenantResult = await this.dal.tenantByName(tenantName);
    if(!tenantResult.success) return tenantResult
    const roleResult = await this.dal.roleByName(tenantRole);
    const result = await this.dal.addUserToTenant(tenantResult.payload.id, userResult.payload.id, tenantRole);
    return result
  }




}