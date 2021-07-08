Feature: Users 
  
  Scenario: Create test users
    * table users 
      | email | firstName | lastName
      | "test_donna@test.whitebrick.com"      | "Donna"   | "Smith"
      | "test_debbie@test.whitebrick.com"     | "Debbie"  | "Jones"
      | "test_daisy@test.whitebrick.com"      | "Daisy"   | "Lee"
      | "test_nick_north@test.whitebrick.com" | "Nick"    | "North"
    * def result = call read("users/user-create.feature") users

  Scenario: Load auth_ids for test users
    * karate.exec("bash load_test_auth_ids.bash")