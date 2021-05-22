Feature: Users 
  @setup
  Scenario: Create test users
    * table users 
      | email | firstName | lastName
      | 'test_donna@test.whitebrick.com' | 'Donna' | 'Donna'
      | 'test_debbie@test.whitebrick.com' | 'Debbie' | 'Debbie'
      | 'test_daisy@test.whitebrick.com' | 'Daisy' | 'Daisy'
      | 'test_nick_north@test.whitebrick.com' | 'Nick' | 'North'
    * def result = call read('users/user-create.feature') users
    * def created = $result[*].response