Feature: Run

  Scenario: Reset and run all
    * call read('reset.feature')
    * call read('users/users.feature@setup')
    * call read('tenants/tenants.feature@setup')