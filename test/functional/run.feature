Feature: Run

  Background:
    * url baseUrl
    * path endpointPath
    * print "********** Initalizing... **********"
    * print "baseUrl: ", baseUrl
    * print "endpointPath: ", endpointPath
    * print "************************************"
  Scenario: Reset and run all
    * call read('reset.feature')
    * call read('users/users.feature')
    * call read('tenants/tenants.feature')
    * call read('schemas/schemas.feature')
    * call read('tables/tables.feature')