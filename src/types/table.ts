import { gql, IResolvers } from "apollo-server-lambda";
import { GraphQLJSON } from "graphql-type-json";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  scalar JSON

  type Table {
    id: ID!
    schemaId: Int!
    name: String!
    label: String!
    createdAt: String!
    updatedAt: String!
    columns: [Column]!
    schemaName: String
  }

  type Column {
    id: ID!
    tableId: Int!
    name: String!
    label: String!
    type: String!
    isPrimaryKey: Boolean!
    foreignKeys: [ConstraintId]!
    referencedBy: [ConstraintId]!
    createdAt: String!
    updatedAt: String!
  }

  type ConstraintId {
    constraintName: String!
    tableName: String!
    columnName: String!
    relTableName: String
    relColumnName: String
  }

  type TableUser {
    tableId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    schemaName: String
    tableName: String
    userEmail: String
    role: String
    roleImpliedFrom: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Tables
    """
    wbTables(schemaName: String!, withColumns: Boolean): [Table]
    """
    Table Users
    """
    wbTableUsers(
      schemaName: String!
      tableName: String!
      userEmails: [String]
    ): [TableUser]
    """
    Columns
    """
    wbColumns(schemaName: String!, tableName: String!): [Column]
  }

  extend type Mutation {
    """
    Tables
    """
    wbAddOrCreateTable(
      schemaName: String!
      tableName: String!
      tableLabel: String!
      create: Boolean
    ): Boolean!
    wbUpdateTable(
      schemaName: String!
      tableName: String!
      newTableName: String
      newTableLabel: String
    ): Boolean!
    wbRemoveOrDeleteTable(
      schemaName: String!
      tableName: String!
      del: Boolean
    ): Boolean!
    wbAddAllExistingTables(schemaName: String!): Boolean!
    wbAddAllExistingRelationships(schemaName: String!): Boolean!
    wbCreateOrDeletePrimaryKey(
      schemaName: String!
      tableName: String!
      columnNames: [String]!
      del: Boolean
    ): Boolean!
    wbAddOrCreateForeignKey(
      schemaName: String!
      tableName: String!
      columnNames: [String]!
      parentTableName: String!
      parentColumnNames: [String]!
      create: Boolean
    ): Boolean!
    wbRemoveOrDeleteForeignKey(
      schemaName: String!
      tableName: String!
      columnNames: [String]!
      parentTableName: String!
      del: Boolean
    ): Boolean!
    """
    Table Users
    """
    wbSetTableUsersRole(
      schemaName: String!
      tableName: String!
      userEmails: [String]!
      role: String!
    ): Boolean
    wbSaveTableUserSettings(
      userEmail: String!
      schemaName: String!
      tableName: String!
      settings: JSON!
    ): Boolean!
    """
    Columns
    """
    wbAddOrCreateColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      columnLabel: String!
      create: Boolean
      columnType: String
    ): Boolean!
    wbUpdateColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      newColumnName: String
      newColumnLabel: String
      newType: String
    ): Boolean!
    wbRemoveOrDeleteColumn(
      schemaName: String!
      tableName: String!
      columnName: String!
      del: Boolean
    ): Boolean!
  }
`;

export const resolvers: IResolvers = {
  JSON: GraphQLJSON,
  Query: {
    // Tables
    wbTables: async (_, { schemaName, withColumns }, context) => {
      const result = await context.wbCloud.tables(schemaName, withColumns);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Table Users
    wbTableUsers: async (_, { schemaName, tableName, userEmails }, context) => {
      const result = await context.wbCloud.tableUsers(
        schemaName,
        tableName,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Columns
    wbColumns: async (_, { schemaName, tableName }, context) => {
      const result = await context.wbCloud.columns(schemaName, tableName);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Tables
    wbAddOrCreateTable: async (
      _,
      { schemaName, tableName, tableLabel, create },
      context
    ) => {
      const result = await context.wbCloud.addOrCreateTable(
        schemaName,
        tableName,
        tableLabel,
        create
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbUpdateTable: async (
      _,
      { schemaName, tableName, newTableName, newTableLabel },
      context
    ) => {
      const result = await context.wbCloud.updateTable(
        schemaName,
        tableName,
        newTableName,
        newTableLabel
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveOrDeleteTable: async (
      _,
      { schemaName, tableName, del },
      context
    ) => {
      const result = await context.wbCloud.removeOrDeleteTable(
        schemaName,
        tableName,
        del
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAddAllExistingTables: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.addAllExistingTables(schemaName);
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAddAllExistingRelationships: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.addOrRemoveAllExistingRelationships(
        schemaName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbCreateOrDeletePrimaryKey: async (
      _,
      { schemaName, tableName, columnNames, del },
      context
    ) => {
      const result = await context.wbCloud.createOrDeletePrimaryKey(
        schemaName,
        tableName,
        columnNames,
        del
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAddOrCreateForeignKey: async (
      _,
      {
        schemaName,
        tableName,
        columnNames,
        parentTableName,
        parentColumnNames,
        create,
      },
      context
    ) => {
      const result = await context.wbCloud.addOrCreateForeignKey(
        schemaName,
        tableName,
        columnNames,
        parentTableName,
        parentColumnNames,
        create
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveOrDeleteForeignKey: async (
      _,
      {
        schemaName,
        tableName,
        columnNames,
        parentTableName,
        parentColumnNames,
        del,
      },
      context
    ) => {
      const result = await context.wbCloud.removeOrDeleteForeignKey(
        schemaName,
        tableName,
        columnNames,
        parentTableName,
        del
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    // Columns
    wbAddOrCreateColumn: async (
      _,
      { schemaName, tableName, columnName, columnLabel, create, columnType },
      context
    ) => {
      const result = await context.wbCloud.addOrCreateColumn(
        schemaName,
        tableName,
        columnName,
        columnLabel,
        create,
        columnType
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbUpdateColumn: async (
      _,
      {
        schemaName,
        tableName,
        columnName,
        newColumnName,
        newColumnLabel,
        newType,
      },
      context
    ) => {
      const result = await context.wbCloud.updateColumn(
        schemaName,
        tableName,
        columnName,
        newColumnName,
        newColumnLabel,
        newType
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveOrDeleteColumn: async (
      _,
      { schemaName, tableName, columnName, del },
      context
    ) => {
      const result = await context.wbCloud.removeOrDeleteColumn(
        schemaName,
        tableName,
        columnName,
        del
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    // Table Users
    wbSetTableUsersRole: async (
      _,
      { schemaName, tableName, userEmails, role },
      context
    ) => {
      const result = await context.wbCloud.setTableUsersRole(
        schemaName,
        tableName,
        userEmails,
        role
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbSaveTableUserSettings: async (
      _,
      { schemaName, tableName, userEmail, settings },
      context
    ) => {
      const result = await context.wbCloud.saveTableUserSettings(
        schemaName,
        tableName,
        userEmail,
        settings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
