export const DEFAULT_POLICY: Record<string, Record<string, any>> = {
  // Organizations
  access_organization: {
    roleLevel: "organization",
    description: "Access this Organization",
    permittedRoles: [
      "organization_external_user",
      "organization_user",
      "organization_administrator",
    ],
  },
  administer_organization: {
    roleLevel: "organization",
    description: "Administer this Organization",
    permittedRoles: ["organization_administrator"],
  },
  edit_organization: {
    roleLevel: "organization",
    description: "Edit this Organization",
    permittedRoles: ["organization_administrator"],
  },
  manage_access_to_organization: {
    roleLevel: "organization",
    description: "Manage Access to this Organization",
    permittedRoles: ["organization_administrator"],
  },
  // Schemas
  alter_schema: {
    roleLevel: "schema",
    description: "Alter this Database",
    permittedRoles: ["schema_manager", "schema_administrator"],
  },
  manage_access_to_schema: {
    roleLevel: "schema",
    description: "Manage Access to this Database",
    permittedRoles: ["schema_administrator"],
  },
  // Tables
  alter_table: {
    roleLevel: "table",
    description: "Alter this Table",
    permittedRoles: ["table_manager", "table_administrator"],
  },
  manage_access_to_table: {
    roleLevel: "table",
    description: "Manage Access to this Table",
    permittedRoles: ["table_administrator"],
  },
  read_table_records: {
    roleLevel: "table",
    description: "Read Records from this Table",
    permittedRoles: [
      "table_reader",
      "table_editor",
      "table_manager",
      "table_administrator",
    ],
    hasuraActions: ["select"],
  },
  read_and_write_table_records: {
    roleLevel: "table",
    description: "Read and Write Records to this Table",
    permittedRoles: ["table_editor", "table_manager", "table_administrator"],
    hasuraActions: ["select", "insert", "update", "delete"],
  },
};
