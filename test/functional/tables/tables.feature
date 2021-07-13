Feature: Tables

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000

  Scenario: Create and track test tables in new DB
    * table tables 
      | currentUserEmail                 | schemaName            | tableName    | tableLabel
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | "Blog Posts"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "authors"    | "Authors"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "tags"       | "Tags"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_tags"  | "Post Tags"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_links" | "Post Links"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "Post Extra"
    * def result = call read("table-create.feature") tables
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Create columns in new DB tables
    * table columns 
      | currentUserEmail                 | schemaName            | tableName    | columnName  | columnLabel | columnType
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | "id"        | "ID"        | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | "author_id" | "Author ID" | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | "title"     | "Title"     | "text"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | "body"      | "Body"      | "text"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "authors"    | "id"        | "ID"        | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "authors"    | "name"      | "Full Name" | "text"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "tags"       | "id"        | "ID"        | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "tags"       | "name"      | "Tag"       | "text"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_tags"  | "post_id"   | "Post ID"   | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_tags"  | "tag_id"    | "Tag ID"    | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_links" | "post_id"   | "Post ID"   | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_links" | "url"       | "Link URL"  | "text"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "test_pk"   | "Test PK"   | "integer"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "test_fk"   | "Test FK"   | "integer"
    * def result = call read("column-create.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Create primary keys
    * table columns 
      | currentUserEmail                 | schemaName            | tableName    | columnNames | del
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | ["id"]      | false
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "authors"    | ["id"]      | false
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "tags"       | ["id"]      | false
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | ["test_pk"] | false
    * def result = call read("primary_key-set.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }
  
  Scenario: Delete a primary key
    * table columns 
      | currentUserEmail                 | schemaName            | tableName    | columnNames | del
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | ["test_pk"] | true
    * def result = call read("primary_key-set.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Create foreign keys
    * table columns 
      | currentUserEmail                 | schemaName            | tableName    | columnNames     | parentColumnNames | parentTableName | create
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"      | ["author_id"]   | ["id"]            | "authors"       | true
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_tags"  | ["post_id"]     | ["id"]            | "posts"         | true
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_tags"  | ["tag_id"]      | ["id"]            | "tags"          | true
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_links" | ["post_id"]     | ["id"]            | "posts"         | true
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | ["test_fk"]     | ["id"]            | "posts"         | true
    * def result = call read("foreign_key-create.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Delete a foreign key
    * table columns 
      | currentUserEmail                 | schemaName            | tableName    | columnNames | parentTableName | del
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | ["test_fk"] | "posts"         | true
    * def result = call read("foreign_key-delete.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Relabel a column
    * table columns
      | currentUserEmail                 | schemaName            | tableName    | columnName | newColumnName | newColumnLabel | newType
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "test_fk"  | null          | "Relabelled"   | null
    * def result = call read("column-update.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Change a column type
    * table columns
      | currentUserEmail                 | schemaName            | tableName    | columnName | newColumnName     | newColumnLabel | newType
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "test_fk"  | null              | null           | "numeric"
    * def result = call read("column-update.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Rename a column
    * table columns
      | currentUserEmail                 | schemaName            | tableName    | columnName | newColumnName     | newColumnLabel | newType
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "test_fk"  | "test_fk_renamed" | null           | null
    * def result = call read("column-update.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Delete a column
    * table columns
      | currentUserEmail                 | schemaName            | tableName    | columnName        | del
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra" | "test_fk_renamed" | null   
    * def result = call read("column-delete.feature") columns
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Delete a table
    * table tables
      | currentUserEmail                 | schemaName            | tableName
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "post_extra"
    * def result = call read("table-delete.feature") tables
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Load test data for test_the_daisy_blog
    * def proc = karate.fork("bash load_test_data.bash")
    * proc.waitSync()
    * match proc.exitCode == 0