import { gql } from 'apollo-server-lambda';

export const typeDefs = gql`
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





