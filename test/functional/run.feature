Feature: Run

  Scenario: Reset and run all
    * call read('reset.feature')
    * def sleep = function(millis){ java.lang.Thread.sleep(millis) }
    * eval sleep(1) // allow reset time to untrack objects
    * call read('users/users.feature@setup')
    * call read('tenants/tenants.feature@setup')
    * call read('schemas/schemas.feature@setup')
    * call read('schemas/tables.feature@setup')