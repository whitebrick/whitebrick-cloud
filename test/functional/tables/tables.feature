Feature: Tables 

  Scenario: Add tables from existing DBs
    * table schemas 
      | schemaName |
      | 'test_chinook'   |
      | 'test_donnasdvd' |
      | 'test_northwind' |
    * def result = call read('tables/table-add-existing.feature') schemas
    * def created = $result[*].response

  Scenario: Create and track test table in existing DB
    * table tables 
      | schemaName | tableName | tableLabel
      | 'test_donnasdvd' | 'test_table' | 'Donnas DVD Test Table'
    * def result = call read('tables/table-create.feature') tables

  Scenario: Relabel test table in existing DB
    * table tables 
      | schemaName       | tableName    | newTableName | newTableLabel
      | 'test_donnasdvd' | 'test_table' | null         | 'Test Table Relabeled'
    * def result = call read('tables/table-update.feature') tables
  
  Scenario: Rename test table in existing DB
    * table tables 
      | schemaName       | tableName    | newTableName         | newTableLabel
      | 'test_donnasdvd' | 'test_table' | 'test_table_renamed' | null
    * def result = call read('tables/table-update.feature') tables

  Scenario: Create and track test tables in new DB
    * table tables 
      | schemaName | tableName | tableLabel
      | 'test_the_daisy_blog' | 'posts'      | 'Blog Posts'
      | 'test_the_daisy_blog' | 'authors'    | 'Authors'
      | 'test_the_daisy_blog' | 'tags'       | 'Tags'
      | 'test_the_daisy_blog' | 'post_tags'  | 'Post Tags'
      | 'test_the_daisy_blog' | 'post_links' | 'Post Links'
      | 'test_the_daisy_blog' | 'post_extra' | 'Post Extra'
    * def result = call read('tables/table-create.feature') tables

  Scenario: Create columns in new DB tables
    * table columns 
      | schemaName            | tableName    | columnName  | columnLabel | columnType
      | 'test_the_daisy_blog' | 'posts'      | 'id'        | 'ID'        | 'integer'
      | 'test_the_daisy_blog' | 'posts'      | 'author_id' | 'Author ID' | 'integer'
      | 'test_the_daisy_blog' | 'posts'      | 'title'     | 'Title'     | 'text'
      | 'test_the_daisy_blog' | 'posts'      | 'body'      | 'Body'      | 'text'
      | 'test_the_daisy_blog' | 'authors'    | 'id'        | 'ID'        | 'integer'
      | 'test_the_daisy_blog' | 'authors'    | 'name'      | 'Full Name' | 'text'
      | 'test_the_daisy_blog' | 'tags'       | 'id'        | 'ID'        | 'integer'
      | 'test_the_daisy_blog' | 'tags'       | 'name'      | 'Tag'       | 'text'
      | 'test_the_daisy_blog' | 'post_tags'  | 'post_id'   | 'Post ID'   | 'integer'
      | 'test_the_daisy_blog' | 'post_tags'  | 'tag_id'    | 'Tag ID'    | 'integer'
      | 'test_the_daisy_blog' | 'post_links' | 'post_id'   | 'Post ID'   | 'integer'
      | 'test_the_daisy_blog' | 'post_links' | 'url'       | 'Link URL'  | 'text'
      | 'test_the_daisy_blog' | 'post_extra' | 'test_pk'   | 'Test PK'   | 'integer'
      | 'test_the_daisy_blog' | 'post_extra' | 'test_fk'   | 'Test FK'   | 'integer'
    * def result = call read('tables/column-create.feature') columns

  Scenario: Create primary keys
    * table columns 
      | schemaName            | tableName    | columnNames | del
      | 'test_the_daisy_blog' | 'posts'      | ["id"]      | false
      | 'test_the_daisy_blog' | 'authors'    | ["id"]      | false
      | 'test_the_daisy_blog' | 'tags'       | ["id"]      | false
      | 'test_the_daisy_blog' | 'post_extra' | ["test_pk"] | false
    * def result = call read('tables/primary_key-set.feature') columns
  
  Scenario: Delete a primary key
    * table columns 
      | schemaName            | tableName    | columnNames | del
      | 'test_the_daisy_blog' | 'post_extra' | ["test_pk"] | true
    * def result = call read('tables/primary_key-set.feature') columns

  Scenario: Create foreign keys
    * table columns 
      | schemaName            | tableName    | columnNames     | parentColumnNames | parentTableName | create
      | 'test_the_daisy_blog' | 'posts'      | ["author_id"]   | ["id"]            | 'authors'       | true
      | 'test_the_daisy_blog' | 'post_tags'  | ["post_id"]     | ["id"]            | 'posts'         | true
      | 'test_the_daisy_blog' | 'post_tags'  | ["tag_id"]      | ["id"]            | 'tags'          | true
      | 'test_the_daisy_blog' | 'post_links' | ["post_id"]     | ["id"]            | 'posts'         | true
      | 'test_the_daisy_blog' | 'post_extra' | ["test_fk"]     | ["id"]            | 'posts'         | true
    * def result = call read('tables/foreign_key-create.feature') columns

  Scenario: Delete a foreign key
    * table columns 
      | schemaName            | tableName    | columnNames | parentTableName | del
      | 'test_the_daisy_blog' | 'post_extra' | ["test_fk"] | 'posts'         | true
    * def result = call read('tables/foreign_key-delete.feature') columns

  Scenario: Relabel a column
    * table columns
      | schemaName            | tableName    | columnName | newColumnName | newColumnLabel | newType
      | 'test_the_daisy_blog' | 'post_extra' | 'test_fk'  | null          | 'Relabelled'   | null
    * def result = call read('tables/column-update.feature') columns

  Scenario: Change a column type
    * table columns
      | schemaName            | tableName    | columnName | newColumnName     | newColumnLabel | newType
      | 'test_the_daisy_blog' | 'post_extra' | 'test_fk'  | null              | null           | 'numeric'
    * def result = call read('tables/column-update.feature') columns

  Scenario: Rename a column
    * table columns
      | schemaName            | tableName    | columnName | newColumnName     | newColumnLabel | newType
      | 'test_the_daisy_blog' | 'post_extra' | 'test_fk'  | 'test_fk_renamed' | null           | null
    * def result = call read('tables/column-update.feature') columns

  Scenario: Delete a column
    * table columns
      | schemaName            | tableName    | columnName        | del
      | 'test_the_daisy_blog' | 'post_extra' | 'test_fk_renamed' | null   
    * def result = call read('tables/column-delete.feature') columns

  Scenario: Delete a table
    * table tables
      | schemaName            | tableName
      | 'test_the_daisy_blog' | 'post_extra'
    * def result = call read('tables/table-delete.feature') tables

  Scenario: Load test data for test_the_daisy_blog
    * karate.exec("bash load_test_data.bash")