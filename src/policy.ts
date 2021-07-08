export const DEFAULT_POLICY: Record<string, any>[] = [
  // Organizations
  {
    userAction: "access_organization",
    roleLevel: "organization",
    deniedMessage: "access this organization",
    permittedRoles: [
      "organization_external_user",
      "organization_user",
      "organization_administrator",
    ],
  },
  {
    userAction: "administer_organization",
    roleLevel: "organization",
    deniedMessage: "administer this organization",
    permittedRoles: ["organization_administrator"],
  },
  {
    userAction: "edit_organization",
    roleLevel: "organization",
    deniedMessage: "edit this Organization.",
    permittedRoles: ["organization_administrator"],
  },
  {
    userAction: "manage_access_to_organization",
    roleLevel: "organization",
    deniedMessage: "manage access to this Organization.",
    permittedRoles: ["organization_administrator"],
  },
  // Schemas
  {
    userAction: "alter_schema",
    roleLevel: "schema",
    deniedMessage: "alter this Database.",
    permittedRoles: ["schema_manager", "schema_administrator"],
  },
  {
    userAction: "manage_access_to_schema",
    roleLevel: "schema",
    deniedMessage: "manage access to this Database.",
    permittedRoles: ["schema_manager", "schema_administrator"],
  },
  // Tables
  {
    userAction: "alter_table",
    roleLevel: "table",
    deniedMessage: "alter this Table.",
    permittedRoles: ["table_manager", "table_administrator"],
  },
  {
    userAction: "manage_access_to_table",
    roleLevel: "table",
    deniedMessage: "manage access to this Table.",
    permittedRoles: ["table_manager", "table_administrator"],
  },
];
