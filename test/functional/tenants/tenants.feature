Feature: Tenants

  Scenario: Create test tenants
    * table tenants 
      | name | label |
      | 'test_tenant1' | 'Test Tenant 1' |
      # | 'test_tenant2' | 'Test Tenant 2' |
      # | 'test_tenant3' | 'Test Tenant 3' |
    * def result = call read('tenant-create.feature') tenants
    * def created = $result[*].response
    * print created