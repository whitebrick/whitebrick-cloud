Feature: Organizations
  
  Scenario: Create organizations
    * table organizations 
      | name | label | currentUserEmail
      | 'test_donnas-media' | "Donna's Media" | 'test_donna@test.whitebrick.com'
      | 'test_vandelay'     | "Vandelay Industries" | 'test_nick_north@test.whitebrick.com'
    * def result = call read('organizations/organization-create.feature') organizations
    # * def created = $result[*].response
  
  Scenario: Add users to organizations
    * table organizationUsers 
      | organizationName    | organizationRole             | userEmail
      | 'test_donnas-media' | 'organization_user'          | ["test_debbie@test.whitebrick.com"]
      | 'test_donnas-media' | 'organization_external_user' | ["test_daisy@test.whitebrick.com"]
      | 'test_vandelay'     | 'organization_user'          | ["test_donna@test.whitebrick.com", "test_daisy@test.whitebrick.com"]
    * def result = call read('organizations/organization-set-users-role.feature') organizationUsers