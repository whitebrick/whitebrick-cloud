Feature: Schemas 
  @setup
  Scenario: Create test schemas
    * table schemas 
      | name | label | tenantOwnerName | userOwnerEmail
      | 'test_blog' | 'Blog Test DB' | 'test_tenant_a' | |
    * def result = call read('schemas/schema-create.feature') schemas
    * def created = $result[*].response