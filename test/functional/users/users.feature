Feature: Users 
  @setup
  Scenario: Create test users
    * table users 
      | email | firstName | lastName
      | 'test_donna@example.com' | 'Donna' | 'Donna'
      | 'test_debbie@example.com' | 'Debbie' | 'Debbie'
      | 'test_daisy@example.com' | 'Daisy' | 'Daisy'
      | 'test_nick_north@example.com' | 'Nick' | 'North'
    * def result = call read('users/user-create.feature') users
    * def created = $result[*].response