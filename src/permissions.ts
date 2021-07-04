export type userAction = "edit_tabe" | "edit_column";

export const DEFAULT_POLICY: Record<string, any>[] = [
  {
    userAction: "edit_table",
    allowedRoles: ["table_manager"],
  },
];
