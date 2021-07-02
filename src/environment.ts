type Environment = {
  secretMessage: string;
  dbName: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbPoolMax: number;
  dbPoolIdleTimeoutMillis: number;
  dbPoolConnectionTimeoutMillis: number;
  hasuraHost: string;
  hasuraAdminSecret: string;
  testIgnoreErrors: boolean;
};

export const environment: Environment = {
  secretMessage: process.env.SECRET_MESSAGE as string,
  dbName: process.env.DB_NAME as string,
  dbHost: process.env.DB_HOST as string,
  dbPort: parseInt(process.env.DB_PORT || "") as number,
  dbUser: process.env.DB_USER as string,
  dbPassword: process.env.DB_PASSWORD as string,
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || "") as number,
  dbPoolIdleTimeoutMillis: parseInt(
    process.env.DB_POOL_IDLE_TIMEOUT_MILLIS || ""
  ) as number,
  dbPoolConnectionTimeoutMillis: parseInt(
    process.env.DB_POOL_CONNECTION_TIMEOUT_MILLIS || ""
  ) as number,
  hasuraHost: process.env.HASURA_HOST as string,
  hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET as string,
  testIgnoreErrors: (process.env.TEST_IGNORE_ERRORS || false) as boolean,
};

// wbErrorCode : [ message, apolloErrorCode? ]
export const userMessages: Record<string, string[]> = {
  // Users
  WB_USER_NOT_FOUND: ["User not found.", "BAD_USER_INPUT"],
  WB_USERS_NOT_FOUND: ["One or more users were not found."],
  // Organizations
  WB_ORGANIZATION_NOT_FOUND: ["Organization not found.", "BAD_USER_INPUT"],
  WB_ORGANIZATION_NAME_TAKEN: [
    "This Organization name has already been taken.",
    "BAD_USER_INPUT",
  ],
  WB_ORGANIZATION_NOT_USER_EMPTY: [
    "This organization still has non-administrative users.",
    "BAD_USER_INPUT",
  ],
  WB_ORGANIZATION_NO_ADMINS: [
    "You can not remove all Administrators from an Organization - you must leave at least one.",
    "BAD_USER_INPUT",
  ],
  WB_USER_NOT_IN_ORG: ["User must be in Organization"],
  WB_USER_NOT_SCHEMA_OWNER: ["The current user is not the owner."],
  // Schemas
  WB_SCHEMA_NOT_FOUND: ["Database could not be found."],
  WB_BAD_SCHEMA_NAME: [
    "Database name can not begin with 'pg_' or be in the reserved list.",
    "BAD_USER_INPUT",
  ],
  WB_CANT_REMOVE_SCHEMA_USER_OWNER: [
    "You can not remove the user_owner from a Schema",
  ],
  // Schemas Users
  WB_SCHEMA_USERS_NOT_FOUND: ["One or more Schema Users not found."],
  // Tables
  WB_TABLE_NOT_FOUND: ["Table could not be found."],
  WB_TABLE_NAME_EXISTS: ["This Table name already exists", "BAD_USER_INPUT"],
  COLUMN_NOT_FOUND: ["Column could not be found"],
  WB_COLUMN_NAME_EXISTS: ["This Column name already exists.", "BAD_USER_INPUT"],
  WB_PK_EXISTS: ["Remove existing primary key first.", "BAD_USER_INPUT"],
  WB_FK_EXISTS: [
    "Remove existing foreign key on the column first.",
    "BAD_USER_INPUT",
  ],
  // Table Users,
  WB_TABLE_USERS_NOT_FOUND: ["One or more Table Users not found."],
  // Roles
  ROLE_NOT_FOUND: ["This role could not be found."],
};
