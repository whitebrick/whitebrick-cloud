Feature: Run

  Background:
    * url baseUrl
    * path endpointPath
    * print "********** Initalizing... **********"
    * print "baseUrl: ", baseUrl
    * print "endpointPath: ", endpointPath
    * print "************************************"
    * configure readTimeout = 600000
  Scenario: Import existing DBs
    * call read('schemas/schemas_imported_dbs.feature')
    * call read('tables/tables_imported_dbs.feature')