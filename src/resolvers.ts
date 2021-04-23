import { IResolvers } from "apollo-server-lambda";
// import "reflect-metadata";
import { Tenant } from "./entity/Tenant";
import { Users } from "./entity/User";
import { DAL } from "./dal";

function userParser(data: any) {
  const user = new Users();
  user.id = data.id;
  user.firstName = data.first_name;
  user.lastName = data.last_name;
  user.email = data.email;
  user.tenant = data.tenant_id;
  user.createdAt = data.created_at.toString();
  user.updatedAt = data.updated_at.toString();
  return user;
}

function userArrayParser(data: any) {
  const users = Array<Users>();

  data.forEach((elements: any) => {
    const user = new Users();
    user.id = elements.id;
    user.firstName = elements.first_name;
    user.lastName = elements.last_name;
    user.email = elements.email;
    user.createdAt = elements.created_at.toString();
    user.updatedAt = elements.updated_at.toString();
    user.tenant = elements.tenant_id;
    users.push(user);
  })
  return users;
}

function tenantParser(data: any) {
  const tenant = new Tenant();
  tenant.name = data.name;
  tenant.label = data.label;
  tenant.createdAt = data.created_at.toString();
  tenant.updatedAt = data.updated_at.toString();
  tenant.id = data.id;
  return tenant;
}

function tenantArrayParser(data: any) {
  const tenants = Array<Tenant>();
  data.forEach((elements: any) => {
    // const tenant = new Tenant();
    // tenant.name = elements.name;
    // tenant.label = elements.label;
    // tenant.createdAt = elements.created_at.toString();
    // tenant.updatedAt = elements.updated_at.toString();
    // tenant.id = elements.id;
    tenants.push(elements);
  })
  return tenants;
}

export const resolvers: IResolvers = {
  Query: {
    testMessage: () => 'Hello world',

    getTenants: async (_, __, context) => {
      return await context.dal.getTenants();
    },

    getTenantById: async (_, { id }, context) => {
      return await context.dal.getTenantById(id);
    },

    getTenantByName: async (_, { name }) => {
      const d = new DAL();
      return tenantParser(await d.getTenantByName(name));
    },

    getUserByName: async (_, { firstName }) => {
      const d = new DAL();
      return userParser(await d.getUserByName(firstName));
    },

    getUserByEmail: async (_, { email }) => {
      const d = new DAL();
      return userParser(await d.getUserByEmail(email));
    },

    getUserByTenantID: async (_, { tenantId }) => {
      const d = new DAL();
      return userArrayParser(await d.getUserByTenantID(tenantId));
    },

    getUsersByTenantName: async (_, { tenant_name }) => {

      const d = new DAL();
      return userArrayParser(await d.getUsersByTenantName(tenant_name));

    },

    getUsers: async () => {
      const d = new DAL();
      return userArrayParser(await d.getUsers());
    }
  },


  Mutation: {
    createTenant: async (_, { name, label }: any, context) => {
      return await context.dal.createTenant(name, label);
    },

    updateTenant: async (_, { id, name, label }: any) => {
      try {
        const dal = new DAL();
        return dal.updateTenant(id, name, label);
      }
      catch (error) {
        console.log(error);
        return false;
      }
    },

    createUser: async (_, { tenant_id, email, first_name, last_name }: any) => {
      try {

        const dal = new DAL();
        return dal.createUser(tenant_id, email, first_name, last_name);

      } catch (error) {
        console.log(error);
        return false;
      }
    },

    updateUser: async (_, { id, email, first_name, last_name }) => {
      try {
        const dal = new DAL();
        return dal.updateUser(id, email, first_name, last_name);

      }
      catch (error) {
        console.log(error);
        return false;
      }
    }
  },


  /**
   * resolvers here for CRUD access to DB records - rename to best practises - see dal.ts
   * 
   * getTenantByName(id)
   * getTenantById(name)
   * getTenants
   * createTenant(name, label) 
   * updateTenant(id, name, label)
   * 
   * getUserByName(id)
   * getUserByEmail(email)
   * getUsersByTenantId(id)
   * getUsersByTenantName(name)
   * getUsers
   * createUser(tenant_id, email, first_name, last_name)
   * updateUser(id, tenant_id, email, first_name, last_name)
   */



};