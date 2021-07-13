Feature: Users

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000
  
  Scenario: Create test users
    * table users 
      | email | firstName | lastName
      | "test_donna@test.whitebrick.com"      | "Donna"   | "Smith"
      | "test_debbie@test.whitebrick.com"     | "Debbie"  | "Jones"
      | "test_daisy@test.whitebrick.com"      | "Daisy"   | "Lee"
      | "test_nick_north@test.whitebrick.com" | "Nick"    | "North"
    * def result = call read("user-create.feature") users
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Load auth_ids for test users
    * def proc = karate.fork("bash load_test_auth_ids.bash")
    * proc.waitSync()
    * match proc.exitCode == 0
    