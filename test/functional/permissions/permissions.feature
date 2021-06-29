Feature: Permissions 

  Scenario: Demote Donna from manager to reader, Promote debbie from reader to administrator
    * table organizationUsers 
      | schemaName            | userEmails                          | role
      | 'test_the_daisy_blog' | ['test_donna@test.whitebrick.com']  | 'schema_reader'
      | 'test_the_daisy_blog' | ['test_debbie@test.whitebrick.com'] | 'schema_administrator'
    * def result = call read('schemas/schema-add-user.feature') organizationUsers

  Scenario: Remove debbie from schema
    * table organizationUsers 
      | schemaName            | userEmails
      | 'test_the_daisy_blog' | ['test_debbie@test.whitebrick.com']
    * def result = call read('schemas/schema-remove-user.feature') organizationUsers

  Scenario: Add nick north as administrator
    * table organizationUsers 
      | schemaName            | userEmails                              | role
      | 'test_the_daisy_blog' | ['test_nick_north@test.whitebrick.com'] | 'schema_administrator'
    * def result = call read('schemas/schema-add-user.feature') organizationUsers