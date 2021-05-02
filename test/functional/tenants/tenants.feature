Feature: Tenants
  @setup
  Scenario: Create test tenants
    * table tenants 
      | name | label |
      | 'test_tenant_a' | 'Test Tenant A' |
      | 'test_tenant_b' | 'Test Tenant B' |
      | 'test_tenant_c' | 'Test Tenant C' |
    * def result = call read('tenants/tenant-create.feature') tenants
    * def created = $result[*].response

  @setup
  Scenario: Add users to tenants
    * table tenantUsers 
      | tenantName | userEmail | tenantRole
      | 'test_tenant_a' | 'test_user_1@example.com' | 'tenant_admin'
      | 'test_tenant_b' | 'test_user_1@example.com' | 'tenant_user'
      | 'test_tenant_b' | 'test_user_2@example.com' | 'tenant_admin'
      | 'test_tenant_c' | 'test_user_1@example.com' | 'tenant_user'
      | 'test_tenant_c' | 'test_user_2@example.com' | 'tenant_user'
      | 'test_tenant_c' | 'test_user_3@example.com' | 'tenant_admin'
      | 'test_tenant_c' | 'test_user_4@example.com' | 'tenant_admin'
    * def result = call read('tenants/tenant-add-user.feature') tenantUsers
    * def created = $result[*].response