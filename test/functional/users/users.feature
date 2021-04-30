Feature: Users 
  @setup
  Scenario: Create test users
    * table users 
      | email | firstName | lastName
      | 'test_user_1@example.com' | 'Test1' | 'TestUser1'
      | 'test_user_2@example.com' | 'Test2' | 'TestUser2'
      | 'test_user_3@example.com' | 'Test3' | 'TestUser3'
      | 'test_user_4@example.com' | 'Test4' | 'TestUser4'
    * def result = call read('users/user-create.feature') users
    * def created = $result[*].response