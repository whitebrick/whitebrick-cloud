import { QueryResult } from "pg";

export class Tenant {
  id!: String;
  name!: String;
  label!: String;
  createdAt!: Date;
  updatedAt!: Date;

  public static parseResult(data: QueryResult | null) {
    if (!data) throw new Error('parseTenantArray: input is null');
    const tenants = Array<Tenant>();
    data.rows.forEach((row: any) => {
      tenants.push(Tenant.parse(row));
    });
    return tenants;
  }

  public static parse(data: any): Tenant {
    if (!data) throw new Error('tenantParser: input is null');
    const tenant = new Tenant();
    tenant.name = data.name;
    tenant.label = data.label;
    tenant.createdAt = data.created_at.toString();
    tenant.updatedAt = data.updated_at.toString();
    tenant.id = data.id;
    return tenant;
  }
}