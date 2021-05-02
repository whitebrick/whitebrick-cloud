Feature: Schemas 
  @setup
  Scenario: Create test schemas
    * table schemas 
      | name | label | tenantOwnerName | userOwnerEmail
      | 'blog_test' | 'Blog Test DB' | 'test_tenant_a' | |
    * def result = call read('schemas/schema-create.feature') schemas
    * def created = $result[*].response