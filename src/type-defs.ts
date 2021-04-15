import { gql } from 'apollo-server-lambda';

  /**
   * schema here for CRUD access to DB records - rename to best practises - see dal.ts
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
   * 
   * createUser(tenant_id, email, first_name, last_name)
   * updateUser(id, tenant_id, email, first_name, last_name)
   */

export const typeDefs = gql`
  type Query {
    """
    A test message.
    """
    testMessage: String!
  }
`;

