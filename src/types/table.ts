import { gql, IResolvers } from "apollo-server-lambda";
import { GraphQLJSON } from "graphql-type-json";
import { CurrentUser } from "../entity";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  scalar JSON

  type Table {
    id: ID!
    schemaId: Int!
    name: String!
    label: String!
    columns: [Column]
    schemaName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  type Column {
    id: ID!
    tableId: Int!
    name: String!
    label: String!
    type: String!
    default: String
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
    schemaName: String!
    tableName: String!
    userEmail: String!
    userFirstName: String
    userLastName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Tables
    """
    wbMyTables(
      schemaName: String!
      withColumns: Boolean
      withSettings: Boolean
    ): [Table]
    wbMyTableByName(
      schemaName: String!
      tableName: String!
      withColumns: Boolean
      withSettings: Boolean
    ): Table
    """
    Table Users
    """
    wbTableUsers(
      schemaName: String!
      tableName: String!
      userEmails: [String]
      withSettings: Boolean
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
    ): Table!
    wbUpdateTable(
      schemaName: String!
      tableName: String!
      newTableName: String
      newTableLabel: String
    ): Table!
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
      roleName: String!
    ): Boolean
    wbRemoveTableUsers(
      schemaName: String!
      tableName: String!
      userEmails: [String]!
    ): Boolean
    wbSaveTableUserSettings(
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
    wbAddColumnSequence(
      schemaName: String!
      tableName: String!
      columnName: String!
      nextSeqNumber: Int
    ): Boolean!
  }
`;

export const resolvers: IResolvers = {
  JSON: GraphQLJSON,
  Query: {
    // Tables
    wbMyTables: async (
      _,
      { schemaName, withColumns, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleTables(
        currentUser,
        schemaName,
        withColumns,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbMyTableByName: async (
      _,
      { schemaName, tableName, withColumns, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleTableByName(
        currentUser,
        schemaName,
        tableName,
        withColumns,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Table Users
    wbTableUsers: async (
      _,
      { schemaName, tableName, userEmails, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.tableUsers(
        currentUser,
        schemaName,
        tableName,
        userEmails,
        withSettings
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addOrCreateTable(
        currentUser,
        schemaName,
        tableName,
        tableLabel,
        create
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateTable: async (
      _,
      { schemaName, tableName, newTableName, newTableLabel },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.updateTable(
        currentUser,
        schemaName,
        tableName,
        newTableName,
        newTableLabel
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbRemoveOrDeleteTable: async (
      _,
      { schemaName, tableName, del },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.removeOrDeleteTable(
        currentUser,
        schemaName,
        tableName,
        del
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAddAllExistingTables: async (_, { schemaName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addAllExistingTables(
        currentUser,
        schemaName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAddAllExistingRelationships: async (_, { schemaName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addOrRemoveAllExistingRelationships(
        currentUser,
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.createOrDeletePrimaryKey(
        currentUser,
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addOrCreateForeignKey(
        currentUser,
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
      { schemaName, tableName, columnNames, parentTableName, del },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.removeOrDeleteForeignKey(
        currentUser,
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addOrCreateColumn(
        currentUser,
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.updateColumn(
        currentUser,
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.removeOrDeleteColumn(
        currentUser,
        schemaName,
        tableName,
        columnName,
        del
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAddColumnSequence: async (
      _,
      { schemaName, tableName, columnName, nextSeqNumber },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addOrRemoveColumnSequence(
        currentUser,
        schemaName,
        tableName,
        columnName,
        nextSeqNumber
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    // Table Users
    wbSetTableUsersRole: async (
      _,
      { schemaName, tableName, userEmails, roleName },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.setTableUsersRole(
        currentUser,
        schemaName,
        tableName,
        userEmails,
        roleName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveTableUsers: async (
      _,
      { schemaName, tableName, userEmails },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.removeTableUsers(
        currentUser,
        schemaName,
        tableName,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbSaveTableUserSettings: async (
      _,
      { schemaName, tableName, settings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.saveTableUserSettings(
        currentUser,
        schemaName,
        tableName,
        settings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
