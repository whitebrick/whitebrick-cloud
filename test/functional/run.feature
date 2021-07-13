Feature: Run

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000

  Scenario: Reset and run all
    * call read("reset.feature")
    * call read("users/users.feature")
    * call read("organizations/organizations.feature")
    * call read("schemas/schemas.feature")
    * call read("tables/tables.feature")
    * call read("permissions/permissions.feature")